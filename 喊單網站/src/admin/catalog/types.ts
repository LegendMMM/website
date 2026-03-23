import type { CharacterName, ProductSeries, ReleaseStage } from "../../types/domain";

export type ImportMode =
  | "NORMAL_PRODUCT_CSV"
  | "NORMAL_PRODUCT_JSON"
  | "BLIND_PRODUCT_CSV"
  | "BLIND_PRODUCT_JSON"
  | "BLIND_ITEM_CSV"
  | "BLIND_ITEM_JSON";

export interface ProductEditorDraft {
  name: string;
  specName: string;
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

export interface BlindBoxItemEditorDraft {
  name: string;
  character: CharacterName;
  imageUrl: string;
  imageFile: File | null;
  imagePreviewUrl: string | null;
  price: string;
  stock: string;
  maxPerUser: string;
}

export const stageOptions: ReleaseStage[] = ["FIXED_1_ONLY", "FIXED_1_2", "FIXED_1_2_3", "ALL_OPEN"];
