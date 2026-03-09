import type {
  CharacterName,
  ProductRequiredTier,
  ProductSeries,
  ProductType,
  ReleaseStage,
  RoleTier,
} from "../types/domain";

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

export const RELEASE_STAGE_LABEL: Record<ReleaseStage, string> = {
  FIXED_1_ONLY: "僅固一",
  FIXED_1_2: "固一 + 固二",
  FIXED_1_2_3: "固一 + 固二 + 固三",
  ALL_OPEN: "全面開放",
};

export const PRODUCT_REQUIRED_TIER_LABEL: Record<ProductRequiredTier, string> = {
  FIXED_1: "固一商品",
  FIXED_2: "固二商品",
  FIXED_3: "固三商品",
  LEAK_PICK: "撿漏商品",
};

export const PRODUCT_TYPE_LABEL: Record<ProductType, string> = {
  NORMAL: "一般商品",
  BLIND_BOX: "盲盒拆分",
};

export const PRODUCT_SERIES_OPTIONS: ProductSeries[] = [
  "Q版系列",
  "HOBBY系列",
  "徽章系列",
  "其他系列",
];

export const CHARACTER_OPTIONS: CharacterName[] = [
  "八千代",
  "彩葉",
  "輝耀姬",
  "帝",
  "乃依",
  "雷",
  "真實",
  "蘆花",
];

export const BINDING_WEIGHT: Record<string, number> = {
  八千代: 100,
  乃依: 90,
  彩葉: 80,
  輝耀姬: 70,
  帝: 60,
};

export const BINDING_WEIGHT_FALLBACK = 10;

export const STORAGE_KEY = "group-order-ledger-state";
export const SESSION_KEY = "group-order-ledger-session";
