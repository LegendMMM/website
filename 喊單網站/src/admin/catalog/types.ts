import type { CharacterName, CharacterTier, ProductSeries, ProductType, ReleaseStage } from "../../types/domain";

export type ImportMode =
  | "NORMAL_PRODUCT_CSV"
  | "NORMAL_PRODUCT_JSON"
  | "BLIND_PRODUCT_CSV"
  | "BLIND_PRODUCT_JSON"
  | "BLIND_ITEM_CSV"
  | "BLIND_ITEM_JSON";

export type CatalogTab = "campaigns" | "builders" | "catalog" | "imports";

export interface ProductEditorDraft {
  name: string;
  series: ProductSeries;
  character: CharacterName | "";
  imageUrl: string;
  imageFile: File | null;
  imagePreviewUrl: string | null;
  price: string;
  stock: string;
  maxPerUser: string;
  slotRestrictionEnabled: boolean;
  slotRestrictedCharacter: CharacterName | "";
}

export const stageOptions: ReleaseStage[] = ["FIXED_1_ONLY", "FIXED_1_2", "FIXED_1_2_3", "ALL_OPEN"];
export const productTypeOptions: ProductType[] = ["NORMAL", "BLIND_BOX"];
export const catalogTabs: Array<{ id: CatalogTab; label: string }> = [
  { id: "campaigns", label: "活動" },
  { id: "builders", label: "建立商品" },
  { id: "catalog", label: "商品清單" },
  { id: "imports", label: "匯入工具" },
];

export const characterTierOptions: CharacterTier[] = ["FIXED_1", "FIXED_2", "FIXED_3", "LEAK_PICK"];
