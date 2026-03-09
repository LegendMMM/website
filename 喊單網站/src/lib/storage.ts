import { seedState } from "../data/seed";
import { SESSION_KEY, STORAGE_KEY } from "./constants";
import type { CharacterTier, OrderSystemState, ProductRequiredTier, ProductSeries, ProductType } from "../types/domain";

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const tierFallback: ProductRequiredTier = "FIXED_1";

function normalizeRequiredTier(value: unknown): ProductRequiredTier {
  if (value === "FIXED_1" || value === "FIXED_2" || value === "FIXED_3" || value === "LEAK_PICK") {
    return value;
  }
  return tierFallback;
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
  if (value === "Q版系列" || value === "HOBBY系列" || value === "徽章系列" || value === "其他系列") {
    return value;
  }
  return "其他系列";
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeNickname(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeState(raw: unknown): OrderSystemState {
  const fallback = deepClone(seedState);
  if (!raw || typeof raw !== "object") return fallback;

  const candidate = raw as Partial<OrderSystemState> & {
    campaigns?: Array<Record<string, unknown>>;
    products?: Array<Record<string, unknown>>;
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

  const normalizedProducts = Array.isArray(candidate.products)
    ? candidate.products.map((product) => {
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
        slotRestrictionEnabled,
        slotRestrictedCharacter: slotRestrictionEnabled ? slotRestrictedCharacter : null,
        requiredTier: normalizeRequiredTier(product.requiredTier),
        imageUrl: typeof product.imageUrl === "string" ? product.imageUrl : null,
        stock: typeof product.stock === "number" ? product.stock : null,
        maxPerUser: typeof product.maxPerUser === "number" ? product.maxPerUser : null,
      };
    })
    : fallback.products;

  const normalizedBlindBoxItems = Array.isArray(candidate.blindBoxItems)
    ? candidate.blindBoxItems.map((item) => ({
      ...item,
      imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : null,
      stock: typeof item.stock === "number" ? item.stock : 0,
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
        ...user,
        email: normalizeEmail(user.email),
        fbNickname: normalizeNickname(user.fbNickname),
      }))
      : fallback.users,
    campaigns: normalizedCampaigns as OrderSystemState["campaigns"],
    products: normalizedProducts as OrderSystemState["products"],
    blindBoxItems: normalizedBlindBoxItems as OrderSystemState["blindBoxItems"],
    characterSlots: normalizedCharacterSlots as OrderSystemState["characterSlots"],
    claims: normalizedClaims as OrderSystemState["claims"],
    payments: Array.isArray(candidate.payments) ? candidate.payments : fallback.payments,
    bindings: Array.isArray(candidate.bindings) ? candidate.bindings : fallback.bindings,
    shipments: Array.isArray(candidate.shipments) ? candidate.shipments : fallback.shipments,
    cartItems: normalizedCartItems as OrderSystemState["cartItems"],
    orders: Array.isArray(candidate.orders) ? candidate.orders : fallback.orders,
    orderItems: normalizedOrderItems as OrderSystemState["orderItems"],
  };
}

export function loadState(): OrderSystemState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return deepClone(seedState);

  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return deepClone(seedState);
  }
}

export function saveState(state: OrderSystemState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
