import { seedState } from "../data/seed";
import { SESSION_KEY, STORAGE_KEY } from "./constants";
import type { OrderSystemState } from "../types/domain";

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function normalizeState(raw: unknown): OrderSystemState {
  const fallback = deepClone(seedState);
  if (!raw || typeof raw !== "object") return fallback;

  const candidate = raw as Partial<OrderSystemState> & { campaigns?: Array<Record<string, unknown>> };
  const normalizedCampaigns = Array.isArray(candidate.campaigns)
    ? candidate.campaigns.map((campaign) => ({
      ...campaign,
      releaseStage: (campaign.releaseStage as string | undefined) ?? "ALL_OPEN",
      maxClaimsPerUser:
        typeof campaign.maxClaimsPerUser === "number" ? campaign.maxClaimsPerUser : null,
    }))
    : fallback.campaigns;

  return {
    users: Array.isArray(candidate.users) ? candidate.users : fallback.users,
    campaigns: normalizedCampaigns as OrderSystemState["campaigns"],
    products: Array.isArray(candidate.products) ? candidate.products : fallback.products,
    claims: Array.isArray(candidate.claims) ? candidate.claims : fallback.claims,
    payments: Array.isArray(candidate.payments) ? candidate.payments : fallback.payments,
    bindings: Array.isArray(candidate.bindings) ? candidate.bindings : fallback.bindings,
    shipments: Array.isArray(candidate.shipments) ? candidate.shipments : fallback.shipments,
    cartItems: Array.isArray(candidate.cartItems) ? candidate.cartItems : fallback.cartItems,
    orders: Array.isArray(candidate.orders) ? candidate.orders : fallback.orders,
    orderItems: Array.isArray(candidate.orderItems) ? candidate.orderItems : fallback.orderItems,
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
