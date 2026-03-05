import type { RoleTier } from "../types/domain";

export const ROLE_PRIORITY: Record<RoleTier, number> = {
  FIXED_1: 1,
  FIXED_2: 2,
  FIXED_3: 3,
  LEAK_PICK: 4,
};

export const ROLE_LABEL: Record<RoleTier, string> = {
  FIXED_1: "固一",
  FIXED_2: "固二",
  FIXED_3: "固三",
  LEAK_PICK: "撿漏",
};

export const BINDING_WEIGHT: Record<string, number> = {
  八千代: 100,
  乃伊: 90,
  彩葉: 80,
  輝耀姬: 70,
  帝: 60,
};

export const BINDING_WEIGHT_FALLBACK = 10;

export const STORAGE_KEY = "group-order-ledger-state";
export const SESSION_KEY = "group-order-ledger-session";
