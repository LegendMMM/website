import { seedState } from "../data/seed";
import { SESSION_KEY, STORAGE_KEY } from "./constants";
import type { OrderSystemState } from "../types/domain";

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export function loadState(): OrderSystemState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return deepClone(seedState);

  try {
    return JSON.parse(raw) as OrderSystemState;
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
