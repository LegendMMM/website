import { seedState } from "../data/seed";
import { DEFAULT_PRODUCT_CATEGORIES } from "./constants";
import { SESSION_KEY, STORAGE_KEY } from "./constants";
import type { CharacterTier, OrderSystemState, ProductSeries, ProductType } from "../types/domain";

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

interface LoadStateOptions {
  fallbackToSeed?: boolean;
}

function normalizeCharacterTier(value: unknown): CharacterTier | null {
  if (value === "FIXED_1" || value === "FIXED_2" || value === "FIXED_3" || value === "LEAK_PICK") {
    return value;
  }
  return null;
}

function normalizeProductType(value: unknown): ProductType {
  return value === "BLIND_BOX" ? "BLIND_BOX" : "NORMAL";
}

function normalizeProductSeries(value: unknown): ProductSeries {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return "未分類";
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeNickname(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveFallbackState(options: LoadStateOptions = {}): OrderSystemState {
  return options.fallbackToSeed === false ? createEmptyState() : deepClone(seedState);
}

function normalizeState(raw: unknown, options: LoadStateOptions = {}): OrderSystemState {
  const fallback = resolveFallbackState(options);
  if (!raw || typeof raw !== "object") return fallback;

  type LegacyProductRecord = Record<string, unknown> & {
    averagePrice?: unknown;
    hotPrice?: unknown;
    coldPrice?: unknown;
  };

  const candidate = raw as Partial<OrderSystemState> & {
    campaigns?: Array<Record<string, unknown>>;
    products?: Array<LegacyProductRecord>;
    blindBoxItems?: Array<Record<string, unknown>>;
    characterSlots?: Array<Record<string, unknown>>;
    claims?: Array<Record<string, unknown>>;
    cartItems?: Array<Record<string, unknown>>;
    orderItems?: Array<Record<string, unknown>>;
  };

  const normalizedCampaigns = Array.isArray(candidate.campaigns)
    ? candidate.campaigns.map((campaign) => ({
      ...campaign,
      releaseStage: (campaign.releaseStage as string | undefined) ?? "ALL_OPEN",
      maxClaimsPerUser:
        typeof campaign.maxClaimsPerUser === "number" ? campaign.maxClaimsPerUser : null,
    }))
    : fallback.campaigns;

  const rawProducts = Array.isArray((candidate as { products?: unknown[] }).products)
    ? (candidate as { products: LegacyProductRecord[] }).products
    : null;

  const normalizedProducts = Array.isArray(rawProducts)
    ? rawProducts.map((product) => {
      const legacyCharacter = product.character;
      const slotRestrictionEnabled =
        typeof product.slotRestrictionEnabled === "boolean"
          ? product.slotRestrictionEnabled
          : true;
      const slotRestrictedCharacter =
        typeof product.slotRestrictedCharacter === "string"
          ? product.slotRestrictedCharacter
          : (typeof legacyCharacter === "string" ? legacyCharacter : null);

      return {
        ...product,
        series: normalizeProductSeries(product.series),
        type: normalizeProductType(product.type),
        character: typeof legacyCharacter === "string" ? legacyCharacter : null,
        slotRestrictionEnabled: normalizeProductType(product.type) === "BLIND_BOX" ? slotRestrictionEnabled : false,
        slotRestrictedCharacter:
          normalizeProductType(product.type) === "BLIND_BOX" && slotRestrictionEnabled ? slotRestrictedCharacter : null,
        imageUrl: typeof product.imageUrl === "string" ? product.imageUrl : null,
        price:
          typeof product.price === "number"
            ? product.price
            : typeof product.averagePrice === "number"
              ? product.averagePrice
              : typeof product.hotPrice === "number"
                ? product.hotPrice
                : typeof product.coldPrice === "number"
                  ? product.coldPrice
                  : 0,
        stock: typeof product.stock === "number" ? product.stock : null,
        maxPerUser: typeof product.maxPerUser === "number" ? product.maxPerUser : null,
      };
    })
    : fallback.products;

  const normalizedProductCategories = Array.isArray((candidate as { productCategories?: unknown[] }).productCategories)
    ? (candidate as { productCategories?: unknown[] }).productCategories
      ?.map((value) => normalizeProductSeries(value))
      .filter((value, index, arr) => value && arr.indexOf(value) === index)
    : null;

  const derivedCategories = Array.from(
    new Set([...DEFAULT_PRODUCT_CATEGORIES, ...normalizedProducts.map((product) => normalizeProductSeries(product.series))]),
  );

  const normalizedBlindBoxItems = Array.isArray(candidate.blindBoxItems)
    ? candidate.blindBoxItems.map((item) => ({
      ...item,
      imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : null,
      price: typeof item.price === "number" ? item.price : null,
      stock: typeof item.stock === "number" ? item.stock : null,
      maxPerUser: typeof item.maxPerUser === "number" ? item.maxPerUser : null,
    }))
    : fallback.blindBoxItems;

  const normalizedCharacterSlots = Array.isArray(candidate.characterSlots)
    ? candidate.characterSlots
      .map((slot) => ({
        ...slot,
        tier: normalizeCharacterTier(slot.tier),
      }))
      .filter((slot) => slot.tier !== null)
    : fallback.characterSlots;

  const normalizedClaims = Array.isArray(candidate.claims)
    ? candidate.claims.map((claim) => ({
      ...claim,
      blindBoxItemId: typeof claim.blindBoxItemId === "string" ? claim.blindBoxItemId : null,
    }))
    : fallback.claims;

  const normalizedCartItems = Array.isArray(candidate.cartItems)
    ? candidate.cartItems.map((item) => ({
      ...item,
      blindBoxItemId: typeof item.blindBoxItemId === "string" ? item.blindBoxItemId : null,
      qty: typeof item.qty === "number" && item.qty > 0 ? item.qty : 1,
    }))
    : fallback.cartItems;

  const normalizedOrderItems = Array.isArray(candidate.orderItems)
    ? candidate.orderItems.map((item) => ({
      ...item,
      blindBoxItemId: typeof item.blindBoxItemId === "string" ? item.blindBoxItemId : null,
      qty: typeof item.qty === "number" && item.qty > 0 ? item.qty : 1,
    }))
    : fallback.orderItems;

  return {
    users: Array.isArray(candidate.users)
      ? candidate.users.map((user) => ({
        id: typeof user.id === "string" ? user.id : crypto.randomUUID(),
        email: normalizeEmail(user.email),
        fbNickname: normalizeNickname(user.fbNickname),
        pickupRate: typeof user.pickupRate === "number" ? user.pickupRate : 100,
        isAdmin: Boolean(user.isAdmin),
        createdAt: typeof user.createdAt === "string" ? user.createdAt : new Date().toISOString(),
      }))
      : fallback.users,
    campaigns: normalizedCampaigns as OrderSystemState["campaigns"],
    productCategories: (normalizedProductCategories && normalizedProductCategories.length > 0
      ? Array.from(new Set([...normalizedProductCategories, ...derivedCategories]))
      : derivedCategories) as OrderSystemState["productCategories"],
    products: normalizedProducts as OrderSystemState["products"],
    blindBoxItems: normalizedBlindBoxItems as OrderSystemState["blindBoxItems"],
    characterSlots: normalizedCharacterSlots as OrderSystemState["characterSlots"],
    claims: normalizedClaims as OrderSystemState["claims"],
    payments: Array.isArray(candidate.payments) ? candidate.payments : fallback.payments,
    shipments: Array.isArray(candidate.shipments) ? candidate.shipments : fallback.shipments,
    cartItems: normalizedCartItems as OrderSystemState["cartItems"],
    orders: Array.isArray(candidate.orders) ? candidate.orders : fallback.orders,
    orderItems: normalizedOrderItems as OrderSystemState["orderItems"],
  };
}

export function loadState(options: LoadStateOptions = {}): OrderSystemState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return resolveFallbackState(options);

  try {
    return normalizeState(JSON.parse(raw), options);
  } catch {
    return resolveFallbackState(options);
  }
}

export function saveState(state: OrderSystemState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function createEmptyState(): OrderSystemState {
  return {
    users: [],
    campaigns: [],
    productCategories: [...DEFAULT_PRODUCT_CATEGORIES],
    products: [],
    blindBoxItems: [],
    characterSlots: [],
    claims: [],
    payments: [],
    shipments: [],
    cartItems: [],
    orders: [],
    orderItems: [],
  };
}

export function loadSessionUserId(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

export function saveSessionUserId(userId: string | null): void {
  if (!userId) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(SESSION_KEY, userId);
}

export function resetState(): OrderSystemState {
  const next = deepClone(seedState);
  saveState(next);
  return next;
}
