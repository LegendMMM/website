import { seedState } from "../data/seed";
import { SESSION_KEY, STORAGE_KEY } from "./constants";
import type { OrderSystemState } from "../types/domain";

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function normalizeState(raw: unknown): OrderSystemState {
  const fallback = deepClone(seedState);
  if (!raw || typeof raw !== "object") return fallback;

  const candidate = raw as Partial<OrderSystemState> & {
    campaigns?: Array<Record<string, unknown>>;
    products?: Array<Record<string, unknown>>;
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
    ? candidate.products.map((product) => ({
      ...product,
      requiredTier: (product.requiredTier as string | undefined) ?? "ALL_OPEN",
      maxPerUser: typeof product.maxPerUser === "number" ? product.maxPerUser : null,
    }))
    : fallback.products;

  const normalizedCartItems = Array.isArray(candidate.cartItems)
    ? candidate.cartItems.map((item) => ({
      ...item,
      qty: typeof item.qty === "number" && item.qty > 0 ? item.qty : 1,
    }))
    : fallback.cartItems;

  const normalizedOrderItems = Array.isArray(candidate.orderItems)
    ? candidate.orderItems.map((item) => ({
      ...item,
      qty: typeof item.qty === "number" && item.qty > 0 ? item.qty : 1,
    }))
    : fallback.orderItems;

  return {
    users: Array.isArray(candidate.users) ? candidate.users : fallback.users,
    campaigns: normalizedCampaigns as OrderSystemState["campaigns"],
    products: normalizedProducts as OrderSystemState["products"],
    characterSlots: Array.isArray(candidate.characterSlots) ? candidate.characterSlots : fallback.characterSlots,
    claims: Array.isArray(candidate.claims) ? candidate.claims : fallback.claims,
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
