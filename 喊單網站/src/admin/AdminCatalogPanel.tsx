import { useEffect, useMemo, useState } from "react";
import type { UseOrderSystemReturn } from "../hooks/useOrderSystem";
import { CHARACTER_OPTIONS } from "../lib/constants";
import { releaseStageLabel } from "../lib/format";
import {
  BLIND_ITEM_IMPORT_CSV_TEMPLATE,
  BLIND_ITEM_IMPORT_JSON_TEMPLATE,
  BLIND_PRODUCT_IMPORT_CSV_TEMPLATE,
  BLIND_PRODUCT_IMPORT_JSON_TEMPLATE,
  NORMAL_PRODUCT_IMPORT_CSV_TEMPLATE,
  NORMAL_PRODUCT_IMPORT_JSON_TEMPLATE,
  type BlindBoxItemImportRow,
  parseBlindItemImportCsv,
  parseBlindItemImportJson,
  parseBlindProductImportCsv,
  parseBlindProductImportJson,
  parseNormalProductImportCsv,
  parseNormalProductImportJson,
} from "../lib/import-utils";
import { upsertCampaigns, upsertProfiles } from "../lib/supabase-sync";
import { isSupabaseEnabled, prepareImageForUpload, supabase, uploadImageToSupabaseStorage } from "../lib/supabase";
import type {
  BlindBoxItem,
  Campaign,
  CharacterName,
  Product,
  ProductSeries,
  ProductType,
  ReleaseStage,
} from "../types/domain";
import { ImportsTab } from "./catalog/ImportsTab";
import { ProductImage } from "./catalog/shared";
import { stageOptions, type BlindBoxItemEditorDraft, type ImportMode, type ProductEditorDraft } from "./catalog/types";

type WorkspaceMode = "browse" | "createCampaign" | "createNormalGroup" | "createBlindProduct" | "import";

type CatalogFamily =
  | {
    key: string;
    kind: "NORMAL_GROUP";
    campaign: Campaign;
    title: string;
    products: Product[];
    representative: Product;
    imageUrl: string | null;
  }
  | {
    key: string;
    kind: "BLIND_BOX";
    campaign: Campaign;
    title: string;
    product: Product;
    blindItems: BlindBoxItem[];
    imageUrl: string | null;
  };

interface PendingFamilySelection {
  campaignId: string;
  kind: CatalogFamily["kind"];
  title: string;
}

const NORMAL_SPEC_NAME_SEPARATORS = ["｜", "|"] as const;

function containsReservedNormalSeparator(value: string): boolean {
  return NORMAL_SPEC_NAME_SEPARATORS.some((separator) => value.includes(separator));
}

function validateNormalNameParts(productName: string, specName: string): string | null {
  if (containsReservedNormalSeparator(productName)) {
    return "商品名稱不可包含 ｜ 或 |，這兩個符號保留給規格分隔使用。";
  }
  if (containsReservedNormalSeparator(specName)) {
    return "規格名稱不可包含 ｜ 或 |，這兩個符號保留給規格分隔使用。";
  }
  return null;
}

function splitNormalProductName(name: string): { productName: string; specName: string } {
  const trimmed = name.trim();
  if (!trimmed) {
    return { productName: "", specName: "" };
  }

  for (const separator of NORMAL_SPEC_NAME_SEPARATORS) {
    const index = trimmed.indexOf(separator);
    if (index >= 0) {
      return {
        productName: trimmed.slice(0, index).trim() || trimmed,
        specName: trimmed.slice(index + 1).trim(),
      };
    }
  }

  return { productName: trimmed, specName: "" };
}

function composeNormalProductName(productName: string, specName: string): string {
  const normalizedProductName = productName.trim();
  const normalizedSpecName = specName.trim();
  if (!normalizedSpecName) return normalizedProductName;
  return `${normalizedProductName}｜${normalizedSpecName}`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("讀取圖片失敗。"));
    };
    reader.onerror = () => reject(new Error("讀取圖片失敗。"));
    reader.readAsDataURL(file);
  });
}

function parseRequiredNonNegativeNumber(value: string, label: string): { ok: true; value: number } | { ok: false; message: string } {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue) || nextValue < 0) {
    return { ok: false, message: `${label} 必須是大於等於 0 的數字。` };
  }
  return { ok: true, value: nextValue };
}

function parseOptionalPositiveInteger(value: string, label: string): { ok: true; value: number | null } | { ok: false; message: string } {
  if (!value.trim()) {
    return { ok: true, value: null };
  }
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue) || nextValue < 1 || !Number.isInteger(nextValue)) {
    return { ok: false, message: `${label} 需為大於等於 1 的整數，或留空。` };
  }
  return { ok: true, value: nextValue };
}

function parseOptionalNonNegativeInteger(value: string, label: string): { ok: true; value: number | null } | { ok: false; message: string } {
  if (!value.trim()) {
    return { ok: true, value: null };
  }
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue) || nextValue < 0 || !Number.isInteger(nextValue)) {
    return { ok: false, message: `${label} 需為大於等於 0 的整數，或留空。` };
  }
  return { ok: true, value: nextValue };
}

function parseOptionalNonNegativeNumber(value: string, label: string): { ok: true; value: number | null } | { ok: false; message: string } {
  if (!value.trim()) {
    return { ok: true, value: null };
  }
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue) || nextValue < 0) {
    return { ok: false, message: `${label} 需為大於等於 0 的數字，或留空。` };
  }
  return { ok: true, value: nextValue };
}

function normalFamilyKey(campaignId: string, name: string): string {
  return `normal:${campaignId}:${splitNormalProductName(name).productName.toLowerCase()}`;
}

function blankProductDraft(name = "", type: ProductType = "NORMAL"): ProductEditorDraft {
  return {
    name,
    specName: "",
    series: "未分類",
    character: "",
    imageUrl: "",
    imageFile: null,
    imagePreviewUrl: null,
    price: type === "NORMAL" ? "120" : "800",
    stock: "",
    maxPerUser: "",
    slotRestrictionEnabled: false,
    slotRestrictedCharacter: "",
  };
}

function blankBlindBoxItemDraft(character: CharacterName = "八千代"): BlindBoxItemEditorDraft {
  return {
    name: "",
    character,
    imageUrl: "",
    imageFile: null,
    imagePreviewUrl: null,
    price: "",
    stock: "",
    maxPerUser: "",
  };
}

function filterFamilyByKeyword(family: CatalogFamily, keyword: string): boolean {
  if (!keyword) return true;
  const lowered = keyword.toLowerCase();
  if (family.kind === "NORMAL_GROUP") {
    return family.title.toLowerCase().includes(lowered)
      || family.products.some((product) => (
        product.sku.toLowerCase().includes(lowered)
        || splitNormalProductName(product.name).specName.toLowerCase().includes(lowered)
        || (product.character?.toLowerCase().includes(lowered) ?? false)
      ));
  }
  return family.title.toLowerCase().includes(lowered)
    || family.product.sku.toLowerCase().includes(lowered)
    || family.blindItems.some((item) => (
      item.sku.toLowerCase().includes(lowered)
      || item.name.toLowerCase().includes(lowered)
      || item.character.toLowerCase().includes(lowered)
    ));
}

export function AdminCatalogPanel(props: { system: UseOrderSystemReturn }): JSX.Element {
  const { system } = props;
  const [feedback, setFeedback] = useState("");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("browse");
  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");
  const [campaignImageUrl, setCampaignImageUrl] = useState("");
  const [campaignImageFile, setCampaignImageFile] = useState<File | null>(null);
  const [campaignImagePreviewUrl, setCampaignImagePreviewUrl] = useState<string | null>(null);
  const [campaignDeadlineAt, setCampaignDeadlineAt] = useState("");
  const [campaignReleaseStage, setCampaignReleaseStage] = useState<ReleaseStage>("FIXED_1_ONLY");
  const [campaignEditorImageUrl, setCampaignEditorImageUrl] = useState("");
  const [campaignEditorImageFile, setCampaignEditorImageFile] = useState<File | null>(null);
  const [campaignEditorImagePreviewUrl, setCampaignEditorImagePreviewUrl] = useState<string | null>(null);
  const [productCampaignId, setProductCampaignId] = useState(system.state.campaigns[0]?.id ?? "");
  const [productType, setProductType] = useState<ProductType>("NORMAL");
  const [productName, setProductName] = useState("");
  const [productSpecName, setProductSpecName] = useState("");
  const [productCharacter, setProductCharacter] = useState<CharacterName | "">("");
  const [productSlotRestrictionEnabled, setProductSlotRestrictionEnabled] = useState(false);
  const [productSlotRestrictedCharacter, setProductSlotRestrictedCharacter] = useState<CharacterName | "">("");
  const [productImageUrl, setProductImageUrl] = useState("");
  const [productImageFile, setProductImageFile] = useState<File | null>(null);
  const [productImagePreviewUrl, setProductImagePreviewUrl] = useState<string | null>(null);
  const [productPrice, setProductPrice] = useState("120");
  const [productStock, setProductStock] = useState("");
  const [productMaxPerUser, setProductMaxPerUser] = useState("");
  const [settingsProductKeyword, setSettingsProductKeyword] = useState("");
  const [selectedFamilyKey, setSelectedFamilyKey] = useState<string | null>(null);
  const [pendingFamilySelection, setPendingFamilySelection] = useState<PendingFamilySelection | null>(null);
  const [productEditorDrafts, setProductEditorDrafts] = useState<Record<string, ProductEditorDraft>>({});
  const [blindBoxItemEditorDrafts, setBlindBoxItemEditorDrafts] = useState<Record<string, BlindBoxItemEditorDraft>>({});
  const [newBlindBoxItemDrafts, setNewBlindBoxItemDrafts] = useState<Record<string, BlindBoxItemEditorDraft>>({});
  const [newNormalVariantDrafts, setNewNormalVariantDrafts] = useState<Record<string, ProductEditorDraft>>({});
  const [normalGroupNameDrafts, setNormalGroupNameDrafts] = useState<Record<string, string>>({});
  const [expandedSpecPanels, setExpandedSpecPanels] = useState<Record<string, string | null>>({});
  const [importMode, setImportMode] = useState<ImportMode>("NORMAL_PRODUCT_CSV");
  const [importText, setImportText] = useState("");

  const importModeDescription: Record<ImportMode, string> = {
    NORMAL_PRODUCT_CSV: "匯入一般商品子項。",
    NORMAL_PRODUCT_JSON: "匯入一般商品子項。",
    BLIND_PRODUCT_CSV: "匯入盲盒母商品。",
    BLIND_PRODUCT_JSON: "匯入盲盒母商品。",
    BLIND_ITEM_CSV: "匯入盲盒子項。",
    BLIND_ITEM_JSON: "匯入盲盒子項。",
  };

  const importTemplateByMode: Record<ImportMode, string> = {
    NORMAL_PRODUCT_CSV: NORMAL_PRODUCT_IMPORT_CSV_TEMPLATE,
    NORMAL_PRODUCT_JSON: NORMAL_PRODUCT_IMPORT_JSON_TEMPLATE,
    BLIND_PRODUCT_CSV: BLIND_PRODUCT_IMPORT_CSV_TEMPLATE,
    BLIND_PRODUCT_JSON: BLIND_PRODUCT_IMPORT_JSON_TEMPLATE,
    BLIND_ITEM_CSV: BLIND_ITEM_IMPORT_CSV_TEMPLATE,
    BLIND_ITEM_JSON: BLIND_ITEM_IMPORT_JSON_TEMPLATE,
  };

  const campaignPreviewImage = campaignImagePreviewUrl ?? (campaignImageUrl.trim() || null);
  const productPreviewImage = productImagePreviewUrl ?? (productImageUrl.trim() || null);

  useEffect(() => {
    if (!productCampaignId && system.state.campaigns[0]) {
      setProductCampaignId(system.state.campaigns[0].id);
    }
  }, [productCampaignId, system.state.campaigns]);

  useEffect(() => {
    if (!campaignImageFile) {
      setCampaignImagePreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(campaignImageFile);
    setCampaignImagePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [campaignImageFile]);

  useEffect(() => {
    if (!productImageFile) {
      setProductImagePreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(productImageFile);
    setProductImagePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [productImageFile]);

  const selectedCampaign = useMemo(
    () => system.state.campaigns.find((campaign) => campaign.id === productCampaignId) ?? null,
    [productCampaignId, system.state.campaigns],
  );
  const selectedCampaignPreviewImage = campaignEditorImagePreviewUrl
    ?? (campaignEditorImageUrl.trim() || selectedCampaign?.imageUrl || null);

  useEffect(() => {
    if (!campaignEditorImageFile) {
      setCampaignEditorImagePreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(campaignEditorImageFile);
    setCampaignEditorImagePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [campaignEditorImageFile]);

  useEffect(() => {
    setCampaignEditorImageUrl(selectedCampaign?.imageUrl ?? "");
    setCampaignEditorImageFile(null);
    setCampaignEditorImagePreviewUrl(null);
  }, [selectedCampaign?.id, selectedCampaign?.imageUrl]);

  const families = useMemo(() => {
    if (!selectedCampaign) return [] satisfies CatalogFamily[];

    const products = system.getProductsByCampaign(selectedCampaign.id);
    const normalGroups = new Map<string, Product[]>();
    const blindFamilies: CatalogFamily[] = [];

    products.forEach((product) => {
      if (product.type === "BLIND_BOX") {
        const blindItems = system.getBlindBoxItemsByProduct(product.id);
        blindFamilies.push({
          key: `blind:${selectedCampaign.id}:${product.id}`,
          kind: "BLIND_BOX",
          campaign: selectedCampaign,
          title: product.name,
          product,
          blindItems,
          imageUrl: product.imageUrl ?? blindItems.find((item) => item.imageUrl)?.imageUrl ?? null,
        });
        return;
      }
      const key = normalFamilyKey(selectedCampaign.id, product.name);
      const current = normalGroups.get(key) ?? [];
      current.push(product);
      normalGroups.set(key, current);
    });

    const normalFamilies = Array.from(normalGroups.entries()).map(([key, groupProducts]) => {
      const sortedProducts = [...groupProducts].sort((a, b) => (a.character ?? "").localeCompare(b.character ?? "") || a.sku.localeCompare(b.sku));
      const representative = sortedProducts.find((item) => item.imageUrl) ?? sortedProducts[0];
      return {
        key,
        kind: "NORMAL_GROUP" as const,
        campaign: selectedCampaign,
        title: splitNormalProductName(representative.name).productName,
        products: sortedProducts,
        representative,
        imageUrl: representative.imageUrl,
      };
    });

    return [...normalFamilies, ...blindFamilies].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "NORMAL_GROUP" ? -1 : 1;
      return a.title.localeCompare(b.title, "zh-Hant");
    });
  }, [selectedCampaign, system]);

  const visibleFamilies = useMemo(
    () => families.filter((family) => filterFamilyByKeyword(family, settingsProductKeyword.trim())),
    [families, settingsProductKeyword],
  );

  const selectedFamily = useMemo(
    () => families.find((family) => family.key === selectedFamilyKey) ?? null,
    [families, selectedFamilyKey],
  );

  useEffect(() => {
    if (pendingFamilySelection) {
      const match = families.find((family) => (
        family.campaign.id === pendingFamilySelection.campaignId
        && family.kind === pendingFamilySelection.kind
        && family.title.trim() === pendingFamilySelection.title.trim()
      ));
      if (match) {
        setSelectedFamilyKey(match.key);
        setPendingFamilySelection(null);
        setWorkspaceMode("browse");
      }
      return;
    }

    if (!selectedFamilyKey || !families.some((family) => family.key === selectedFamilyKey)) {
      setSelectedFamilyKey(families[0]?.key ?? null);
    }
  }, [families, pendingFamilySelection, selectedFamilyKey]);

  const getProductEditorDraft = (product: Product): ProductEditorDraft => (
    productEditorDrafts[product.id] ?? (() => {
      const parsedName = product.type === "NORMAL"
        ? splitNormalProductName(product.name)
        : { productName: product.name, specName: "" };
      return {
        name: parsedName.productName,
        specName: parsedName.specName,
        series: product.series,
        character: product.character ?? "",
        imageUrl: product.imageUrl ?? "",
        imageFile: null,
        imagePreviewUrl: null,
        price: String(product.price),
        stock: product.stock === null ? "" : String(product.stock),
        maxPerUser: product.maxPerUser === null ? "" : String(product.maxPerUser),
        slotRestrictionEnabled: product.slotRestrictionEnabled,
        slotRestrictedCharacter: product.slotRestrictedCharacter ?? "",
      };
    })()
  );

  const patchProductEditorDraft = (productId: string, patch: Partial<ProductEditorDraft>): void => {
    const source = system.state.products.find((item) => item.id === productId);
    if (!source) return;
    setProductEditorDrafts((prev) => ({
      ...prev,
      [productId]: {
        ...getProductEditorDraft(source),
        ...patch,
      },
    }));
  };

  const resetProductEditorDraft = (productId: string): void => {
    setProductEditorDrafts((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const handleSelectProductDraftImage = async (productId: string, file: File | null): Promise<void> => {
    if (!file) {
      patchProductEditorDraft(productId, { imageFile: null, imagePreviewUrl: null });
      return;
    }
    try {
      const preview = await readFileAsDataUrl(file);
      patchProductEditorDraft(productId, { imageFile: file, imagePreviewUrl: preview });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "讀取圖片失敗。");
    }
  };

  const getBlindBoxItemEditorDraft = (item: BlindBoxItem): BlindBoxItemEditorDraft => (
    blindBoxItemEditorDrafts[item.id] ?? {
      name: item.name,
      character: item.character,
      imageUrl: item.imageUrl ?? "",
      imageFile: null,
      imagePreviewUrl: null,
      price: item.price === null ? "" : String(item.price),
      stock: item.stock === null ? "" : String(item.stock),
      maxPerUser: item.maxPerUser === null ? "" : String(item.maxPerUser),
    }
  );

  const patchBlindBoxItemEditorDraft = (blindBoxItemId: string, patch: Partial<BlindBoxItemEditorDraft>): void => {
    const source = system.state.blindBoxItems.find((item) => item.id === blindBoxItemId);
    if (!source) return;
    setBlindBoxItemEditorDrafts((prev) => ({
      ...prev,
      [blindBoxItemId]: {
        ...getBlindBoxItemEditorDraft(source),
        ...patch,
      },
    }));
  };

  const resetBlindBoxItemEditorDraft = (blindBoxItemId: string): void => {
    setBlindBoxItemEditorDrafts((prev) => {
      const next = { ...prev };
      delete next[blindBoxItemId];
      return next;
    });
  };

  const handleSelectBlindBoxItemDraftImage = async (blindBoxItemId: string, file: File | null): Promise<void> => {
    if (!file) {
      patchBlindBoxItemEditorDraft(blindBoxItemId, { imageFile: null, imagePreviewUrl: null });
      return;
    }
    try {
      const preview = await readFileAsDataUrl(file);
      patchBlindBoxItemEditorDraft(blindBoxItemId, { imageFile: file, imagePreviewUrl: preview });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "讀取圖片失敗。");
    }
  };

  const getNewBlindBoxItemDraft = (productId: string): BlindBoxItemEditorDraft => (
    newBlindBoxItemDrafts[productId] ?? blankBlindBoxItemDraft()
  );

  const patchNewBlindBoxItemDraft = (productId: string, patch: Partial<BlindBoxItemEditorDraft>): void => {
    setNewBlindBoxItemDrafts((prev) => ({
      ...prev,
      [productId]: {
        ...getNewBlindBoxItemDraft(productId),
        ...patch,
      },
    }));
  };

  const resetNewBlindBoxItemDraft = (productId: string): void => {
    setNewBlindBoxItemDrafts((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const handleSelectNewBlindBoxItemDraftImage = async (productId: string, file: File | null): Promise<void> => {
    if (!file) {
      patchNewBlindBoxItemDraft(productId, { imageFile: null, imagePreviewUrl: null });
      return;
    }
    try {
      const preview = await readFileAsDataUrl(file);
      patchNewBlindBoxItemDraft(productId, { imageFile: file, imagePreviewUrl: preview });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "讀取圖片失敗。");
    }
  };

  const getNewNormalVariantDraft = (familyKey: string): ProductEditorDraft => (
    newNormalVariantDrafts[familyKey] ?? blankProductDraft("", "NORMAL")
  );

  const patchNewNormalVariantDraft = (familyKey: string, patch: Partial<ProductEditorDraft>): void => {
    setNewNormalVariantDrafts((prev) => ({
      ...prev,
      [familyKey]: {
        ...getNewNormalVariantDraft(familyKey),
        ...patch,
      },
    }));
  };

  const resetNewNormalVariantDraft = (familyKey: string): void => {
    setNewNormalVariantDrafts((prev) => {
      const next = { ...prev };
      delete next[familyKey];
      return next;
    });
  };

  const handleSelectNewNormalVariantDraftImage = async (familyKey: string, file: File | null): Promise<void> => {
    if (!file) {
      patchNewNormalVariantDraft(familyKey, { imageFile: null, imagePreviewUrl: null });
      return;
    }
    try {
      const preview = await readFileAsDataUrl(file);
      patchNewNormalVariantDraft(familyKey, { imageFile: file, imagePreviewUrl: preview });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "讀取圖片失敗。");
    }
  };

  const getNormalGroupNameDraft = (family: Extract<CatalogFamily, { kind: "NORMAL_GROUP" }>): string => (
    normalGroupNameDrafts[family.key] ?? family.title
  );

  const patchNormalGroupNameDraft = (familyKey: string, value: string): void => {
    setNormalGroupNameDrafts((prev) => ({
      ...prev,
      [familyKey]: value,
    }));
  };

  const resetNormalGroupNameDraft = (familyKey: string): void => {
    setNormalGroupNameDrafts((prev) => {
      const next = { ...prev };
      delete next[familyKey];
      return next;
    });
  };

  const getExpandedSpecId = (familyKey: string, fallbackId: string | null): string | null => (
    Object.prototype.hasOwnProperty.call(expandedSpecPanels, familyKey)
      ? expandedSpecPanels[familyKey] ?? null
      : fallbackId
  );

  const toggleExpandedSpecId = (familyKey: string, itemId: string): void => {
    setExpandedSpecPanels((prev) => ({
      ...prev,
      [familyKey]: prev[familyKey] === itemId ? null : itemId,
    }));
  };

  const assignGeneratedSkus = <T extends { sku: string }>(prefix: string, rows: T[], existingSkus: string[]): T[] => {
    let sequence = existingSkus.reduce((max, sku) => {
      const match = sku.toUpperCase().match(new RegExp(`^${prefix}-(\\d+)$`));
      if (!match) return max;
      return Math.max(max, Number(match[1]));
    }, 0);

    return rows.map((row) => {
      if (row.sku.trim()) return row;
      sequence += 1;
      return { ...row, sku: `${prefix}-${String(sequence).padStart(4, "0")}` };
    });
  };

  const resolveImageUrlForSubmit = async (
    file: File | null,
    manualUrl: string,
    folder: "campaigns" | "products" | "blind-items",
  ): Promise<{ ok: boolean; imageUrl: string | null; note: string }> => {
    const normalizedUrl = manualUrl.trim();
    if (!file) {
      return { ok: true, imageUrl: normalizedUrl || null, note: "" };
    }

    const prepared = await prepareImageForUpload(file);
    if (!prepared.ok) {
      return { ok: false, imageUrl: null, note: prepared.message };
    }

    if (prepared.file.size > 4 * 1024 * 1024) {
      return { ok: false, imageUrl: null, note: `${prepared.message} 圖片處理後仍超過 4MB，請換一張更小的圖。` };
    }

    if (isSupabaseEnabled) {
      const uploaded = await uploadImageToSupabaseStorage(prepared.file, folder);
      if (uploaded.ok) {
        return {
          ok: true,
          imageUrl: uploaded.url,
          note: [prepared.message, uploaded.message].filter(Boolean).join(" "),
        };
      }

      const embeddedUrl = await readFileAsDataUrl(prepared.file);
      return {
        ok: true,
        imageUrl: embeddedUrl,
        note: [prepared.message, `Supabase Storage 上傳失敗：${uploaded.message}。已改用嵌入式圖片。`].filter(Boolean).join(" "),
      };
    }

    const embeddedUrl = await readFileAsDataUrl(prepared.file);
    return {
      ok: true,
      imageUrl: embeddedUrl,
      note: [prepared.message, "目前使用本地嵌入式圖片。"].filter(Boolean).join(" "),
    };
  };

  const handleSaveProductRow = async (product: Product, overrides?: Partial<ProductEditorDraft>): Promise<void> => {
    const draft = {
      ...getProductEditorDraft(product),
      ...overrides,
    };
    if (product.type === "NORMAL") {
      const validationMessage = validateNormalNameParts(draft.name, draft.specName);
      if (validationMessage) {
        setFeedback(validationMessage);
        return;
      }
    }
    const priceResult = parseRequiredNonNegativeNumber(draft.price, "商品價格");
    if (!priceResult.ok) {
      setFeedback(priceResult.message);
      return;
    }
    const maxResult = parseOptionalPositiveInteger(draft.maxPerUser, "每人上限");
    if (!maxResult.ok) {
      setFeedback(maxResult.message);
      return;
    }
    const stockResult = parseOptionalNonNegativeInteger(draft.stock, "庫存");
    if (!stockResult.ok) {
      setFeedback(stockResult.message);
      return;
    }

    const imageResult = await resolveImageUrlForSubmit(draft.imageFile, draft.imageUrl, "products");
    if (!imageResult.ok) {
      setFeedback(imageResult.note);
      return;
    }

    const resolvedName = product.type === "NORMAL"
      ? composeNormalProductName(draft.name || product.name, draft.specName)
      : draft.name;

    const result = system.adminUpdateProductRule({
      productId: product.id,
      name: resolvedName,
      series: "未分類",
      character: product.type === "NORMAL" ? (draft.character || null) : null,
      imageUrl: imageResult.imageUrl,
      price: priceResult.value,
      stock: product.type === "NORMAL" ? stockResult.value : undefined,
      maxPerUser: maxResult.value,
      slotRestrictionEnabled: draft.slotRestrictionEnabled,
      slotRestrictedCharacter: draft.slotRestrictionEnabled ? (draft.slotRestrictedCharacter || null) : null,
    });
    setFeedback(imageResult.note ? `${result.message} ${imageResult.note}` : result.message);
    if (result.ok) {
      resetProductEditorDraft(product.id);
    }
  };

  const handleSaveBlindBoxItemRow = async (blindBoxItem: BlindBoxItem): Promise<void> => {
    const draft = getBlindBoxItemEditorDraft(blindBoxItem);
    const priceResult = parseOptionalNonNegativeNumber(draft.price, "子項價格");
    if (!priceResult.ok) {
      setFeedback(priceResult.message);
      return;
    }
    const stockResult = parseOptionalNonNegativeInteger(draft.stock, "子項庫存");
    if (!stockResult.ok) {
      setFeedback(stockResult.message);
      return;
    }
    const maxResult = parseOptionalPositiveInteger(draft.maxPerUser, "子項上限");
    if (!maxResult.ok) {
      setFeedback(maxResult.message);
      return;
    }

    const imageResult = await resolveImageUrlForSubmit(draft.imageFile, draft.imageUrl, "blind-items");
    if (!imageResult.ok) {
      setFeedback(imageResult.note);
      return;
    }

    const result = system.adminUpdateBlindBoxItemRule({
      blindBoxItemId: blindBoxItem.id,
      name: draft.name,
      character: draft.character,
      imageUrl: imageResult.imageUrl,
      price: priceResult.value,
      stock: stockResult.value,
      maxPerUser: maxResult.value,
    });
    setFeedback(imageResult.note ? `${result.message} ${imageResult.note}` : result.message);
    if (result.ok) {
      resetBlindBoxItemEditorDraft(blindBoxItem.id);
    }
  };

  const handleCreateBlindBoxItemForProduct = async (productId: string): Promise<void> => {
    const draft = getNewBlindBoxItemDraft(productId);
    const parentProduct = system.state.products.find((product) => product.id === productId) ?? null;
    const priceResult = parseOptionalNonNegativeNumber(draft.price, "子項價格");
    if (!priceResult.ok) {
      setFeedback(priceResult.message);
      return;
    }
    const stockResult = parseOptionalNonNegativeInteger(draft.stock, "子項庫存");
    if (!stockResult.ok) {
      setFeedback(stockResult.message);
      return;
    }
    const maxResult = parseOptionalPositiveInteger(draft.maxPerUser, "子項上限");
    if (!maxResult.ok) {
      setFeedback(maxResult.message);
      return;
    }

    const imageResult = await resolveImageUrlForSubmit(draft.imageFile, draft.imageUrl, "blind-items");
    if (!imageResult.ok) {
      setFeedback(imageResult.note);
      return;
    }

    const result = system.adminCreateBlindBoxItem({
      productId,
      name: draft.name.trim() || parentProduct?.name || "",
      character: draft.character,
      imageUrl: imageResult.imageUrl,
      price: priceResult.value,
      stock: stockResult.value,
      maxPerUser: maxResult.value,
    });
    setFeedback(imageResult.note ? `${result.message} ${imageResult.note}` : result.message);
    if (result.ok) {
      resetNewBlindBoxItemDraft(productId);
    }
  };

  const handleCreateNormalVariantForFamily = async (family: Extract<CatalogFamily, { kind: "NORMAL_GROUP" }>): Promise<void> => {
    const familyName = getNormalGroupNameDraft(family).trim() || family.title;
    const draft = getNewNormalVariantDraft(family.key);
    const validationMessage = validateNormalNameParts(familyName, draft.specName);
    if (validationMessage) {
      setFeedback(validationMessage);
      return;
    }
    const variantName = composeNormalProductName(familyName, draft.specName);
    const imageResult = await resolveImageUrlForSubmit(draft.imageFile, draft.imageUrl, "products");
    if (!imageResult.ok) {
      setFeedback(imageResult.note);
      return;
    }
    const result = system.adminCreateProduct({
      campaignId: family.campaign.id,
      name: variantName,
      series: "未分類",
      type: "NORMAL",
      character: draft.character || null,
      slotRestrictionEnabled: draft.slotRestrictionEnabled,
      slotRestrictedCharacter: draft.slotRestrictionEnabled ? (draft.slotRestrictedCharacter || null) : null,
      imageUrl: imageResult.imageUrl,
      price: draft.price.trim() ? Number(draft.price) : Number.NaN,
      stock: draft.stock.trim() ? Number(draft.stock) : null,
      maxPerUser: draft.maxPerUser.trim() ? Number(draft.maxPerUser) : null,
    });
    setFeedback(imageResult.note ? `${result.message} ${imageResult.note}` : result.message);
    if (result.ok) {
      resetNewNormalVariantDraft(family.key);
      setPendingFamilySelection({
        campaignId: family.campaign.id,
        kind: "NORMAL_GROUP",
        title: familyName,
      });
    }
  };

  const handleRenameNormalGroup = (family: Extract<CatalogFamily, { kind: "NORMAL_GROUP" }>): void => {
    const nextName = getNormalGroupNameDraft(family).trim();
    if (!nextName) {
      setFeedback("母商品名稱不可空白。");
      return;
    }
    if (containsReservedNormalSeparator(nextName)) {
      setFeedback("商品名稱不可包含 ｜ 或 |，這兩個符號保留給規格分隔使用。");
      return;
    }
    if (nextName === family.title) {
      setFeedback("母商品名稱沒有變更。");
      return;
    }
    let firstError = "";
    let successCount = 0;
    family.products.forEach((product) => {
      const parsedName = splitNormalProductName(product.name);
      const result = system.adminUpdateProductRule({
        productId: product.id,
        name: composeNormalProductName(nextName, parsedName.specName),
      });
      if (result.ok) successCount += 1;
      else if (!firstError) firstError = result.message;
      resetProductEditorDraft(product.id);
    });
    setFeedback(firstError || `已將 ${successCount} 個一般商品子項同步到母商品名稱「${nextName}」。`);
    if (!firstError) {
      resetNormalGroupNameDraft(family.key);
      setPendingFamilySelection({
        campaignId: family.campaign.id,
        kind: "NORMAL_GROUP",
        title: nextName,
      });
    }
  };

  const syncProductsToSupabase = async (
    rows: Array<{
      sku: string;
      name: string;
      series: ProductSeries;
      type: ProductType;
      character: CharacterName | null;
      slotRestrictionEnabled: boolean;
      slotRestrictedCharacter: CharacterName | null;
      imageUrl: string | null;
      price: number;
      stock: number | null;
      maxPerUser: number | null;
    }>,
  ): Promise<{ ok: boolean; message: string }> => {
    if (!isSupabaseEnabled || !supabase) {
      return { ok: false, message: "未設定 Supabase，僅寫入本地 Demo。" };
    }

    const campaign = system.state.campaigns.find((item) => item.id === productCampaignId) ?? null;
    const creator = campaign ? system.state.users.find((item) => item.id === campaign.createdBy) ?? null : null;

    if (campaign && creator) {
      await upsertProfiles(supabase, [creator]);
      await upsertCampaigns(supabase, [campaign]);
    }

    const payload = rows.map((row) => ({
      campaign_id: productCampaignId,
      sku: row.sku,
      name: row.name,
      series: row.series,
      type: row.type,
      character_name: row.type === "NORMAL" ? row.character : null,
      slot_restriction_enabled: row.type === "BLIND_BOX" ? row.slotRestrictionEnabled : false,
      slot_restricted_character: row.type === "BLIND_BOX" && row.slotRestrictionEnabled ? row.slotRestrictedCharacter : null,
      image_url: row.imageUrl,
      price: row.price,
      stock: row.type === "NORMAL" ? row.stock : null,
      max_per_user: row.maxPerUser,
    }));

    const { error } = await supabase.from("products").insert(payload);
    if (error) {
      return { ok: false, message: `Supabase 寫入失敗：${error.message}` };
    }
    return { ok: true, message: `Supabase 已同步 ${payload.length} 筆商品。` };
  };

  const syncBlindItemsToSupabase = async (rows: BlindBoxItemImportRow[]): Promise<{ ok: boolean; message: string }> => {
    if (!isSupabaseEnabled || !supabase) {
      return { ok: false, message: "未設定 Supabase，僅寫入本地 Demo。" };
    }

    const { data: productsData, error: productsError } = await supabase
      .from("products")
      .select("id, sku, type")
      .eq("campaign_id", productCampaignId);

    if (productsError) {
      return { ok: false, message: `查詢母商品失敗：${productsError.message}` };
    }

    const blindProductBySku = new Map(
      (productsData ?? []).filter((item) => item.type === "BLIND_BOX").map((item) => [item.sku, item.id]),
    );

    const payload: Array<Record<string, unknown>> = [];
    for (const row of rows) {
      const productId = blindProductBySku.get(row.parentSku);
      if (!productId) {
        return { ok: false, message: `Supabase 找不到盲盒母商品 SKU：${row.parentSku}` };
      }
      payload.push({
        product_id: productId,
        sku: row.sku,
        name: row.name,
        character_name: row.character,
        image_url: row.imageUrl,
        price: row.price,
        stock: row.stock,
        max_per_user: row.maxPerUser,
      });
    }

    const { error } = await supabase.from("blind_box_items").insert(payload);
    if (error) {
      return { ok: false, message: `Supabase 寫入失敗：${error.message}` };
    }
    return { ok: true, message: `Supabase 已同步 ${payload.length} 筆盲盒子項。` };
  };

  const resetComposerProductDraft = (nextType: ProductType): void => {
    setProductType(nextType);
    setProductName("");
    setProductSpecName("");
    setProductCharacter("");
    setProductSlotRestrictionEnabled(false);
    setProductSlotRestrictedCharacter("");
    setProductImageUrl("");
    setProductImageFile(null);
    setProductImagePreviewUrl(null);
    setProductPrice(nextType === "NORMAL" ? "120" : "800");
    setProductStock("");
    setProductMaxPerUser("");
  };

  const handleCreateComposerProduct = async (): Promise<void> => {
    try {
      if (productType === "NORMAL") {
        const validationMessage = validateNormalNameParts(productName, productSpecName);
        if (validationMessage) {
          setFeedback(validationMessage);
          return;
        }
      }

      const imageResult = await resolveImageUrlForSubmit(productImageFile, productImageUrl, "products");
      if (!imageResult.ok) {
        setFeedback(imageResult.note);
        return;
      }

      const resolvedProductName = productType === "NORMAL"
        ? composeNormalProductName(productName, productSpecName)
        : productName;

      const result = system.adminCreateProduct({
        campaignId: productCampaignId,
        name: resolvedProductName,
        series: "未分類",
        type: productType,
        character: productType === "NORMAL" && productCharacter ? productCharacter : null,
        slotRestrictionEnabled: productSlotRestrictionEnabled,
        slotRestrictedCharacter: productSlotRestrictionEnabled && productSlotRestrictedCharacter ? productSlotRestrictedCharacter : null,
        imageUrl: imageResult.imageUrl,
        price: productPrice.trim() ? Number(productPrice) : Number.NaN,
        stock: productType === "NORMAL" && productStock.trim() ? Number(productStock) : null,
        maxPerUser: productMaxPerUser.trim() ? Number(productMaxPerUser) : null,
      });

      setFeedback(imageResult.note ? `${result.message} ${imageResult.note}` : result.message);
      if (!result.ok) return;

      setPendingFamilySelection({
        campaignId: productCampaignId,
        kind: productType === "NORMAL" ? "NORMAL_GROUP" : "BLIND_BOX",
        title: productName.trim(),
      });
      resetComposerProductDraft(productType);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "圖片處理失敗。");
    }
  };

  const handleCreateCampaign = async (): Promise<void> => {
    try {
      const imageResult = await resolveImageUrlForSubmit(campaignImageFile, campaignImageUrl, "campaigns");
      if (!imageResult.ok) {
        setFeedback(imageResult.note);
        return;
      }

      const result = system.adminCreateCampaign({
        title: campaignTitle,
        description: campaignDescription,
        imageUrl: imageResult.imageUrl,
        deadlineAt: campaignDeadlineAt,
        releaseStage: campaignReleaseStage,
      });
      setFeedback(imageResult.note ? `${result.message} ${imageResult.note}` : result.message);
      if (!result.ok) return;
      setCampaignTitle("");
      setCampaignDescription("");
      setCampaignImageUrl("");
      setCampaignImageFile(null);
      setCampaignImagePreviewUrl(null);
      setCampaignDeadlineAt("");
      setWorkspaceMode("browse");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "活動圖片處理失敗。");
    }
  };

  const handleSaveCampaignImage = async (): Promise<void> => {
    if (!selectedCampaign) {
      setFeedback("請先選一個活動。");
      return;
    }

    try {
      const imageResult = await resolveImageUrlForSubmit(campaignEditorImageFile, campaignEditorImageUrl, "campaigns");
      if (!imageResult.ok) {
        setFeedback(imageResult.note);
        return;
      }

      const result = system.adminUpdateCampaign({
        campaignId: selectedCampaign.id,
        imageUrl: imageResult.imageUrl,
      });
      setFeedback(imageResult.note ? `${result.message} ${imageResult.note}` : result.message);
      if (!result.ok) return;
      setCampaignEditorImageFile(null);
      setCampaignEditorImagePreviewUrl(null);
      setCampaignEditorImageUrl(imageResult.imageUrl ?? "");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "活動圖片更新失敗。");
    }
  };

  const handleImport = async (): Promise<void> => {
    const text = importText.trim();
    if (!text) {
      setFeedback("請先貼上匯入內容。");
      return;
    }

    if (importMode === "NORMAL_PRODUCT_CSV" || importMode === "NORMAL_PRODUCT_JSON") {
      const parsed = importMode === "NORMAL_PRODUCT_CSV" ? parseNormalProductImportCsv(text) : parseNormalProductImportJson(text);
      if (parsed.errors.length > 0) {
        setFeedback(`匯入失敗：${parsed.errors.slice(0, 3).join(" / ")}`);
        return;
      }
      if (parsed.rows.length === 0) {
        setFeedback("沒有可匯入的一般商品資料。");
        return;
      }

      const resolvedRows = assignGeneratedSkus("PRD", parsed.rows, system.state.products.map((item) => item.sku));
      let successCount = 0;
      let firstError = "";
      resolvedRows.forEach((row) => {
        const result = system.adminCreateProduct({
          campaignId: productCampaignId,
          sku: row.sku,
          name: row.name,
          series: row.series,
          type: "NORMAL",
          character: row.character,
          slotRestrictionEnabled: false,
          slotRestrictedCharacter: null,
          imageUrl: row.imageUrl,
          price: row.price,
          stock: row.stock,
          maxPerUser: row.maxPerUser,
        });
        if (result.ok) successCount += 1;
        else if (!firstError) firstError = result.message;
      });

      const syncResult = await syncProductsToSupabase(resolvedRows.map((row) => ({
        sku: row.sku,
        name: row.name,
        series: row.series,
        type: "NORMAL" as const,
        character: row.character,
        slotRestrictionEnabled: false,
        slotRestrictedCharacter: null,
        imageUrl: row.imageUrl,
        price: row.price,
        stock: row.stock,
        maxPerUser: row.maxPerUser,
      })));
      setFeedback(`${firstError ? `已匯入 ${successCount} 筆，失敗原因：${firstError}` : `一般商品匯入成功，共 ${successCount} 筆。`} ${syncResult.message}`);
      return;
    }

    if (importMode === "BLIND_PRODUCT_CSV" || importMode === "BLIND_PRODUCT_JSON") {
      const parsed = importMode === "BLIND_PRODUCT_CSV" ? parseBlindProductImportCsv(text) : parseBlindProductImportJson(text);
      if (parsed.errors.length > 0) {
        setFeedback(`匯入失敗：${parsed.errors.slice(0, 3).join(" / ")}`);
        return;
      }
      if (parsed.rows.length === 0) {
        setFeedback("沒有可匯入的盲盒母商品資料。");
        return;
      }

      const resolvedRows = assignGeneratedSkus("PRD", parsed.rows, system.state.products.map((item) => item.sku));
      let successCount = 0;
      let firstError = "";
      resolvedRows.forEach((row) => {
        const result = system.adminCreateProduct({
          campaignId: productCampaignId,
          sku: row.sku,
          name: row.name,
          series: row.series,
          type: "BLIND_BOX",
          character: null,
          slotRestrictionEnabled: row.slotRestrictionEnabled,
          slotRestrictedCharacter: row.slotRestrictionEnabled ? row.slotRestrictedCharacter : null,
          imageUrl: row.imageUrl,
          price: row.price,
          stock: null,
          maxPerUser: row.maxPerUser,
        });
        if (result.ok) successCount += 1;
        else if (!firstError) firstError = result.message;
      });

      const syncResult = await syncProductsToSupabase(resolvedRows.map((row) => ({
        sku: row.sku,
        name: row.name,
        series: row.series,
        type: "BLIND_BOX" as const,
        character: null,
        slotRestrictionEnabled: row.slotRestrictionEnabled,
        slotRestrictedCharacter: row.slotRestrictionEnabled ? row.slotRestrictedCharacter : null,
        imageUrl: row.imageUrl,
        price: row.price,
        stock: null,
        maxPerUser: row.maxPerUser,
      })));
      setFeedback(`${firstError ? `已匯入 ${successCount} 筆，失敗原因：${firstError}` : `盲盒母商品匯入成功，共 ${successCount} 筆。`} ${syncResult.message}`);
      return;
    }

    const parsed = importMode === "BLIND_ITEM_CSV" ? parseBlindItemImportCsv(text) : parseBlindItemImportJson(text);
    if (parsed.errors.length > 0) {
      setFeedback(`匯入失敗：${parsed.errors.slice(0, 3).join(" / ")}`);
      return;
    }
    if (parsed.rows.length === 0) {
      setFeedback("沒有可匯入的盲盒子項資料。");
      return;
    }

    const resolvedRows = assignGeneratedSkus("BLI", parsed.rows, system.state.blindBoxItems.map((item) => item.sku));
    const productsInCampaign = system.getProductsByCampaign(productCampaignId);
    const bySku = new Map(productsInCampaign.map((item) => [item.sku, item]));
    let successCount = 0;
    let firstError = "";

    resolvedRows.forEach((row) => {
      const parent = bySku.get(row.parentSku);
      if (!parent || parent.type !== "BLIND_BOX") {
        if (!firstError) firstError = `找不到盲盒母商品 SKU：${row.parentSku}`;
        return;
      }
      const result = system.adminCreateBlindBoxItem({
        productId: parent.id,
        sku: row.sku,
        name: row.name,
        character: row.character,
        imageUrl: row.imageUrl,
        price: row.price,
        stock: row.stock,
        maxPerUser: row.maxPerUser,
      });
      if (result.ok) successCount += 1;
      else if (!firstError) firstError = result.message;
    });

    const syncResult = await syncBlindItemsToSupabase(resolvedRows);
    setFeedback(`${firstError ? `已匯入 ${successCount} 筆，失敗原因：${firstError}` : `盲盒子項匯入成功，共 ${successCount} 筆。`} ${syncResult.message}`);
  };

  const openCreateNormalGroup = (): void => {
    resetComposerProductDraft("NORMAL");
    setWorkspaceMode("createNormalGroup");
  };

  const openCreateBlindProduct = (): void => {
    resetComposerProductDraft("BLIND_BOX");
    setWorkspaceMode("createBlindProduct");
  };

  const renderCampaignComposer = (): JSX.Element => (
    <section className="section-frame space-y-4">
      <div className="admin-section-head">
        <div>
          <h3 className="text-xl font-bold text-slate-900">新增活動</h3>
          <p className="admin-section-copy">先建立活動，再把母商品和子項全部掛到同一個活動底下。</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm md:col-span-2">
          活動名稱
          <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={campaignTitle} onChange={(event) => setCampaignTitle(event.target.value)} />
        </label>
        <label className="block text-sm md:col-span-2">
          活動說明
          <textarea className="mt-1 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2" value={campaignDescription} onChange={(event) => setCampaignDescription(event.target.value)} />
        </label>
        <label className="block text-sm">
          截止時間
          <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" type="datetime-local" value={campaignDeadlineAt} onChange={(event) => setCampaignDeadlineAt(event.target.value)} />
        </label>
        <label className="block text-sm">
          初始釋出
          <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={campaignReleaseStage} onChange={(event) => setCampaignReleaseStage(event.target.value as ReleaseStage)}>
            {stageOptions.map((stage) => (
              <option key={stage} value={stage}>{releaseStageLabel(stage)}</option>
            ))}
          </select>
        </label>
        <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white/70 p-4">
          <p className="text-sm font-semibold text-slate-900">活動主視覺</p>
          <p className="mt-1 text-xs text-slate-500">有上傳就用活動圖片；沒上傳時，前台會回退到預設主視覺。</p>
          <div className="mt-4 grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
            <ProductImage
              imageUrl={campaignPreviewImage}
              alt={campaignTitle || "活動主視覺預覽"}
              frameClassName="catalog-campaign-visual"
              thumbClassName="catalog-campaign-visual-thumb"
              emptyClassName="catalog-campaign-visual"
            />
            <div className="space-y-3">
              <label className="block text-sm">
                圖片網址
                <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={campaignImageUrl} onChange={(event) => setCampaignImageUrl(event.target.value)} placeholder="可直接貼圖片網址" />
              </label>
              <div className="flex flex-wrap gap-2">
                <label className="file-picker !w-fit">
                  <span>選擇活動圖片</span>
                  <input className="hidden" type="file" accept="image/*" onChange={(event) => setCampaignImageFile(event.target.files?.[0] ?? null)} />
                </label>
                <button type="button" className="cta-secondary" onClick={() => {
                  setCampaignImageFile(null);
                  setCampaignImageUrl("");
                  setCampaignImagePreviewUrl(null);
                }}>
                  清除圖片
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="cta-primary" onClick={() => void handleCreateCampaign()}>建立活動</button>
        <button type="button" className="cta-secondary" onClick={() => setWorkspaceMode("browse")}>取消</button>
      </div>
    </section>
  );

  const renderProductComposer = (): JSX.Element => (
    <section className="section-frame space-y-4">
      <div className="admin-section-head">
        <div>
          <h3 className="text-xl font-bold text-slate-900">
            {productType === "NORMAL" ? "新增一般商品" : "新增盲盒商品"}
          </h3>
          <p className="admin-section-copy">
            {productType === "NORMAL"
              ? "先建立一個商品，接著再到右側補齊不同角色或版本規格。"
              : "先建立盲盒商品，再到右側補齊拆分規格。"}
          </p>
        </div>
      </div>

      <div className="grid gap-5 2xl:grid-cols-[260px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
          <ProductImage imageUrl={productPreviewImage} alt={productName || "商品預覽"} />
          <div className="mt-3 space-y-2">
            <label className="file-picker !w-fit">
              <span>選擇圖片檔</span>
              <input className="hidden" type="file" accept="image/*" onChange={(event) => setProductImageFile(event.target.files?.[0] ?? null)} />
            </label>
            <button type="button" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold" onClick={() => {
              setProductImageFile(null);
              setProductImageUrl("");
            }}>
              清除圖片
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm md:col-span-2">
            所屬活動
            <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={productCampaignId} onChange={(event) => setProductCampaignId(event.target.value)}>
              {system.state.campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>{campaign.title}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm md:col-span-2">
            商品名稱
            <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={productName} onChange={(event) => setProductName(event.target.value)} />
          </label>

          {productType === "NORMAL" ? (
            <>
              <label className="block text-sm">
                第一個規格名稱（可留空）
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={productSpecName}
                  onChange={(event) => setProductSpecName(event.target.value)}
                  placeholder="例如：左 / 右 / 一般款"
                />
              </label>
              <label className="block text-sm">
                第一個規格角色
                <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={productCharacter} onChange={(event) => setProductCharacter(event.target.value as CharacterName | "")}>
                  <option value="">不指定角色</option>
                  {CHARACTER_OPTIONS.map((character) => (
                    <option key={character} value={character}>{character}</option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
              盲盒商品本身不指定角色，角色都放在規格裡。
            </div>
          )}

          <label className="block text-sm">
            圖片 URL
            <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={productImageUrl} onChange={(event) => setProductImageUrl(event.target.value)} />
          </label>

          <label className="block text-sm">
            價格
            <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" type="number" min={0} value={productPrice} onChange={(event) => setProductPrice(event.target.value)} />
          </label>

          <label className="block text-sm">
            {productType === "NORMAL" ? "第一個規格庫存" : "商品庫存"}
            {productType === "NORMAL" ? (
              <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" type="number" min={0} value={productStock} onChange={(event) => setProductStock(event.target.value)} />
            ) : (
              <div className="mt-1 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
                盲盒商品不直接控庫存，真正名額放在規格上。
              </div>
            )}
          </label>

          <label className="block text-sm">
            每人上限
            <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" type="number" min={1} value={productMaxPerUser} onChange={(event) => setProductMaxPerUser(event.target.value)} />
          </label>

          <div className="block text-sm md:col-span-2">
            <span>固位限制</span>
            <div className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-white/70 p-3">
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={productSlotRestrictionEnabled} onChange={(event) => setProductSlotRestrictionEnabled(event.target.checked)} />
                啟用固位限制
              </label>
              <select
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
                value={productSlotRestrictedCharacter}
                disabled={!productSlotRestrictionEnabled}
                onChange={(event) => setProductSlotRestrictedCharacter(event.target.value as CharacterName | "")}
              >
                <option value="">{productType === "BLIND_BOX" ? "依規格角色" : "依展示角色"}</option>
                {CHARACTER_OPTIONS.map((character) => (
                  <option key={character} value={character}>{character}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="cta-primary" onClick={() => void handleCreateComposerProduct()}>
          {productType === "NORMAL" ? "建立商品與第一個規格" : "建立盲盒商品"}
        </button>
        <button type="button" className="cta-secondary" onClick={() => setWorkspaceMode("browse")}>取消</button>
      </div>
    </section>
  );

  const renderNormalVariantCard = (
    family: Extract<CatalogFamily, { kind: "NORMAL_GROUP" }>,
    product: Product,
    expanded: boolean,
  ): JSX.Element => {
    const draft = getProductEditorDraft(product);
    const groupName = getNormalGroupNameDraft(family).trim() || family.title;
    const specTitle = draft.specName.trim() || draft.character || product.character || "未命名規格";

    return (
      <article key={product.id} className="rounded-2xl border border-slate-200 bg-white/70 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600">{product.sku}</span>
              <span className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600">{specTitle}</span>
            </div>
            <h5 className="mt-2 text-base font-bold text-slate-900">{groupName}</h5>
            <p className="mt-2 text-xs text-slate-500">
              {draft.character || "未指定角色"} / NT$ {draft.price || product.price} / 庫存 {draft.stock || (product.stock ?? "不限")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
              onClick={() => toggleExpandedSpecId(family.key, product.id)}
            >
              {expanded ? "收合" : "展開"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700"
              onClick={() => {
                const ok = window.confirm(`確定要刪除規格「${specTitle}」？`);
                if (!ok) return;
                const result = system.adminDeleteProduct(product.id);
                setFeedback(result.message);
              }}
            >
              刪除規格
            </button>
          </div>
        </div>

        {expanded ? (
          <>
            <div className="mt-4 grid gap-4 2xl:grid-cols-[180px_minmax(0,1fr)]">
              <div className="space-y-3">
                <ProductImage imageUrl={(draft.imagePreviewUrl ?? draft.imageUrl) || product.imageUrl} alt={groupName} />
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={draft.imageUrl}
                  placeholder="圖片 URL"
                  onChange={(event) => patchProductEditorDraft(product.id, { imageUrl: event.target.value })}
                />
                <div className="flex flex-wrap gap-2">
                  <label className="file-picker !w-fit !rounded-lg !px-3 !py-2">
                    <span>上傳圖片</span>
                    <input className="hidden" type="file" accept="image/*" onChange={(event) => void handleSelectProductDraftImage(product.id, event.target.files?.[0] ?? null)} />
                  </label>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"
                    onClick={() => patchProductEditorDraft(product.id, { imageUrl: "", imageFile: null, imagePreviewUrl: null })}
                  >
                    清圖
                  </button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="block text-sm md:col-span-2">
                  規格名稱
                  <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={draft.specName} placeholder={draft.character || "可留空"} onChange={(event) => patchProductEditorDraft(product.id, { specName: event.target.value })} />
                </label>
                <label className="block text-sm">
                  角色
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                    value={draft.character}
                    onChange={(event) => patchProductEditorDraft(product.id, { character: event.target.value as CharacterName | "" })}
                  >
                    <option value="">不指定角色</option>
                    {CHARACTER_OPTIONS.map((character) => (
                      <option key={character} value={character}>{character}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  價格
                  <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" type="number" min={0} value={draft.price} onChange={(event) => patchProductEditorDraft(product.id, { price: event.target.value })} />
                </label>
                <label className="block text-sm">
                  庫存
                  <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" type="number" min={0} value={draft.stock} placeholder="不限" onChange={(event) => patchProductEditorDraft(product.id, { stock: event.target.value })} />
                </label>
                <label className="block text-sm">
                  每人上限
                  <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" type="number" min={1} value={draft.maxPerUser} placeholder="不限" onChange={(event) => patchProductEditorDraft(product.id, { maxPerUser: event.target.value })} />
                </label>
                <div className="block text-sm md:col-span-2">
                  <span>固位限制</span>
                  <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-white/70 p-3">
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={draft.slotRestrictionEnabled}
                        onChange={(event) => patchProductEditorDraft(product.id, {
                          slotRestrictionEnabled: event.target.checked,
                          slotRestrictedCharacter: event.target.checked ? draft.slotRestrictedCharacter : "",
                        })}
                      />
                      啟用固位限制
                    </label>
                    <select
                      className="w-full rounded-lg border border-slate-200 px-3 py-2"
                      value={draft.slotRestrictedCharacter}
                      disabled={!draft.slotRestrictionEnabled}
                      onChange={(event) => patchProductEditorDraft(product.id, { slotRestrictedCharacter: event.target.value as CharacterName | "" })}
                    >
                      <option value="">依展示角色</option>
                      {CHARACTER_OPTIONS.map((character) => (
                        <option key={character} value={character}>{character}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold" onClick={() => void handleSaveProductRow(product, { name: groupName })}>
                儲存規格
              </button>
              <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold" onClick={() => resetProductEditorDraft(product.id)}>
                還原
              </button>
            </div>
          </>
        ) : null}
      </article>
    );
  };

  const renderBlindBoxItemCard = (
    family: Extract<CatalogFamily, { kind: "BLIND_BOX" }>,
    item: BlindBoxItem,
    expanded: boolean,
  ): JSX.Element => {
    const draft = getBlindBoxItemEditorDraft(item);
    const specTitle = draft.name || item.name;
    return (
      <article key={item.id} className="rounded-2xl border border-slate-200 bg-white/70 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600">{item.sku}</span>
              <span className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600">{draft.character}</span>
            </div>
            <h5 className="mt-2 text-base font-bold text-slate-900">{specTitle}</h5>
            <p className="mt-2 text-xs text-slate-500">
              {draft.character} / NT$ {draft.price || item.price || "跟商品相同"} / 庫存 {draft.stock || (item.stock ?? "不限")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
              onClick={() => toggleExpandedSpecId(family.key, item.id)}
            >
              {expanded ? "收合" : "展開"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700"
              onClick={() => {
                const ok = window.confirm(`確定要刪除規格「${item.name}」？`);
                if (!ok) return;
                const result = system.adminDeleteBlindBoxItem(item.id);
                setFeedback(result.message);
              }}
            >
              刪除規格
            </button>
          </div>
        </div>

        {expanded ? (
          <>
            <div className="mt-4 grid gap-4 2xl:grid-cols-[180px_minmax(0,1fr)]">
              <div className="space-y-3">
                <ProductImage imageUrl={(draft.imagePreviewUrl ?? draft.imageUrl) || item.imageUrl} alt={draft.name || item.name} />
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={draft.imageUrl} placeholder="圖片 URL" onChange={(event) => patchBlindBoxItemEditorDraft(item.id, { imageUrl: event.target.value })} />
                <div className="flex flex-wrap gap-2">
                  <label className="file-picker !w-fit !rounded-lg !px-3 !py-2">
                    <span>上傳圖片</span>
                    <input className="hidden" type="file" accept="image/*" onChange={(event) => void handleSelectBlindBoxItemDraftImage(item.id, event.target.files?.[0] ?? null)} />
                  </label>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"
                    onClick={() => patchBlindBoxItemEditorDraft(item.id, { imageUrl: "", imageFile: null, imagePreviewUrl: null })}
                  >
                    清圖
                  </button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="block text-sm">
                  規格名稱
                  <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={draft.name} onChange={(event) => patchBlindBoxItemEditorDraft(item.id, { name: event.target.value })} />
                </label>
                <label className="block text-sm">
                  角色
                  <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={draft.character} onChange={(event) => patchBlindBoxItemEditorDraft(item.id, { character: event.target.value as CharacterName })}>
                    {CHARACTER_OPTIONS.map((character) => (
                      <option key={character} value={character}>{character}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  價格
                  <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" type="number" min={0} value={draft.price} placeholder="跟母商品相同" onChange={(event) => patchBlindBoxItemEditorDraft(item.id, { price: event.target.value })} />
                </label>
                <label className="block text-sm">
                  庫存
                  <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" type="number" min={0} value={draft.stock} placeholder="不限" onChange={(event) => patchBlindBoxItemEditorDraft(item.id, { stock: event.target.value })} />
                </label>
                <label className="block text-sm md:col-span-2">
                  每人上限
                  <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" type="number" min={1} value={draft.maxPerUser} placeholder="不限" onChange={(event) => patchBlindBoxItemEditorDraft(item.id, { maxPerUser: event.target.value })} />
                </label>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold" onClick={() => void handleSaveBlindBoxItemRow(item)}>
                儲存規格
              </button>
              <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold" onClick={() => resetBlindBoxItemEditorDraft(item.id)}>
                還原
              </button>
            </div>
          </>
        ) : null}
      </article>
    );
  };

  const renderNewNormalVariantCard = (family: Extract<CatalogFamily, { kind: "NORMAL_GROUP" }>): JSX.Element => {
    const familyName = getNormalGroupNameDraft(family).trim() || family.title;
    const draft = getNewNormalVariantDraft(family.key);
    return (
      <article className="rounded-2xl border border-dashed border-slate-300 bg-white/55 p-4">
        <div className="admin-section-head">
          <div>
            <h5 className="text-base font-bold text-slate-900">新增一般商品規格</h5>
            <p className="text-xs text-slate-500">規格名稱可留空；留空時會自動沿用「{familyName}」。</p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 2xl:grid-cols-[180px_minmax(0,1fr)]">
          <div className="space-y-3">
            <ProductImage imageUrl={draft.imagePreviewUrl ?? draft.imageUrl} alt={familyName} />
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={draft.imageUrl} placeholder="圖片 URL" onChange={(event) => patchNewNormalVariantDraft(family.key, { imageUrl: event.target.value })} />
            <div className="flex flex-wrap gap-2">
              <label className="file-picker !w-fit !rounded-lg !px-3 !py-2">
                <span>上傳圖片</span>
                <input className="hidden" type="file" accept="image/*" onChange={(event) => void handleSelectNewNormalVariantDraftImage(family.key, event.target.files?.[0] ?? null)} />
              </label>
              <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold" onClick={() => patchNewNormalVariantDraft(family.key, { imageUrl: "", imageFile: null, imagePreviewUrl: null })}>
                清圖
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm md:col-span-2">
              規格名稱（可留空）
              <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={draft.specName} placeholder={familyName} onChange={(event) => patchNewNormalVariantDraft(family.key, { specName: event.target.value })} />
            </label>
            <label className="block text-sm">
              角色
              <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={draft.character} onChange={(event) => patchNewNormalVariantDraft(family.key, { character: event.target.value as CharacterName | "" })}>
                <option value="">不指定角色</option>
                {CHARACTER_OPTIONS.map((character) => (
                  <option key={character} value={character}>{character}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              價格
              <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" type="number" min={0} value={draft.price} onChange={(event) => patchNewNormalVariantDraft(family.key, { price: event.target.value })} />
            </label>
            <label className="block text-sm">
              庫存
              <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" type="number" min={0} value={draft.stock} placeholder="不限" onChange={(event) => patchNewNormalVariantDraft(family.key, { stock: event.target.value })} />
            </label>
            <label className="block text-sm">
              每人上限
              <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" type="number" min={1} value={draft.maxPerUser} placeholder="不限" onChange={(event) => patchNewNormalVariantDraft(family.key, { maxPerUser: event.target.value })} />
            </label>
            <div className="block text-sm md:col-span-2">
              <span>固位限制</span>
              <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-white/70 p-3">
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={draft.slotRestrictionEnabled}
                    onChange={(event) => patchNewNormalVariantDraft(family.key, {
                      slotRestrictionEnabled: event.target.checked,
                      slotRestrictedCharacter: event.target.checked ? draft.slotRestrictedCharacter : "",
                    })}
                  />
                  啟用固位限制
                </label>
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  value={draft.slotRestrictedCharacter}
                  disabled={!draft.slotRestrictionEnabled}
                  onChange={(event) => patchNewNormalVariantDraft(family.key, { slotRestrictedCharacter: event.target.value as CharacterName | "" })}
                >
                  <option value="">依展示角色</option>
                  {CHARACTER_OPTIONS.map((character) => (
                    <option key={character} value={character}>{character}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold" onClick={() => void handleCreateNormalVariantForFamily(family)}>
            新增規格
          </button>
          <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold" onClick={() => resetNewNormalVariantDraft(family.key)}>
            清空
          </button>
        </div>
      </article>
    );
  };

  const renderNewBlindBoxItemCard = (family: Extract<CatalogFamily, { kind: "BLIND_BOX" }>): JSX.Element => {
    const draft = getNewBlindBoxItemDraft(family.product.id);
    return (
      <article className="rounded-2xl border border-dashed border-slate-300 bg-white/55 p-4">
        <div className="admin-section-head">
          <div>
            <h5 className="text-base font-bold text-slate-900">新增盲盒子項</h5>
            <p className="text-xs text-slate-500">規格名稱可留空；留空時會自動沿用商品「{family.title}」。</p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 2xl:grid-cols-[180px_minmax(0,1fr)]">
          <div className="space-y-3">
            <ProductImage imageUrl={draft.imagePreviewUrl ?? draft.imageUrl} alt={draft.name || family.title} />
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={draft.imageUrl} placeholder="圖片 URL" onChange={(event) => patchNewBlindBoxItemDraft(family.product.id, { imageUrl: event.target.value })} />
            <div className="flex flex-wrap gap-2">
              <label className="file-picker !w-fit !rounded-lg !px-3 !py-2">
                <span>上傳圖片</span>
                <input className="hidden" type="file" accept="image/*" onChange={(event) => void handleSelectNewBlindBoxItemDraftImage(family.product.id, event.target.files?.[0] ?? null)} />
              </label>
              <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold" onClick={() => patchNewBlindBoxItemDraft(family.product.id, { imageUrl: "", imageFile: null, imagePreviewUrl: null })}>
                清圖
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm">
              規格名稱（可留空）
              <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={draft.name} placeholder={family.title} onChange={(event) => patchNewBlindBoxItemDraft(family.product.id, { name: event.target.value })} />
            </label>
            <label className="block text-sm">
              角色
              <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={draft.character} onChange={(event) => patchNewBlindBoxItemDraft(family.product.id, { character: event.target.value as CharacterName })}>
                {CHARACTER_OPTIONS.map((character) => (
                  <option key={character} value={character}>{character}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              價格
              <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" type="number" min={0} value={draft.price} placeholder="跟母商品相同" onChange={(event) => patchNewBlindBoxItemDraft(family.product.id, { price: event.target.value })} />
            </label>
            <label className="block text-sm">
              庫存
              <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" type="number" min={0} value={draft.stock} placeholder="不限" onChange={(event) => patchNewBlindBoxItemDraft(family.product.id, { stock: event.target.value })} />
            </label>
            <label className="block text-sm md:col-span-2">
              每人上限
              <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" type="number" min={1} value={draft.maxPerUser} placeholder="不限" onChange={(event) => patchNewBlindBoxItemDraft(family.product.id, { maxPerUser: event.target.value })} />
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold" onClick={() => void handleCreateBlindBoxItemForProduct(family.product.id)}>
            新增規格
          </button>
          <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold" onClick={() => resetNewBlindBoxItemDraft(family.product.id)}>
            清空
          </button>
        </div>
      </article>
    );
  };

  const renderNormalFamilyWorkspace = (family: Extract<CatalogFamily, { kind: "NORMAL_GROUP" }>): JSX.Element => {
    const groupName = getNormalGroupNameDraft(family);
    const expandedSpecId = getExpandedSpecId(family.key, family.products[0]?.id ?? null);
    return (
      <section className="space-y-5">
        <div className="section-frame catalog-editor-header">
          <div className="admin-section-head">
            <div>
              <p className="admin-brand-kicker">NORMAL PRODUCT</p>
              <h3 className="mt-2 text-2xl font-extrabold text-slate-900">{family.title}</h3>
              <p className="mt-2 text-sm text-slate-600">這個商品是由同名的一般商品規格自動組成。前台會先看到商品，再進去選角色或版本。</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-600">
              規格 {family.products.length} 個
            </div>
          </div>
        </div>

        <section className="section-frame space-y-4">
          <div className="admin-section-head">
            <div>
              <h4 className="text-lg font-bold text-slate-900">商品基本資料</h4>
              <p className="admin-section-copy">商品名稱會同步到這個商品底下的所有規格，做法跟賣貨便的商品主體一致。</p>
            </div>
          </div>

          <label className="block text-sm">
            商品名稱
            <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={groupName} onChange={(event) => patchNormalGroupNameDraft(family.key, event.target.value)} />
          </label>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="cta-primary" onClick={() => handleRenameNormalGroup(family)}>同步名稱到所有規格</button>
            <button type="button" className="cta-secondary" onClick={() => resetNormalGroupNameDraft(family.key)}>還原</button>
          </div>

          <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-600">
            目前規格角色：{family.products.map((product) => product.character ?? "未指定角色").join(" / ")}
          </div>
        </section>

        <section className="section-frame space-y-4">
          <div className="admin-section-head">
            <div>
              <h4 className="text-lg font-bold text-slate-900">規格管理</h4>
              <p className="admin-section-copy">一般商品的規格就是角色款或不同版本。新增與刪除都固定放在這裡，不再另外收起。</p>
            </div>
          </div>
          {renderNewNormalVariantCard(family)}
          <div className="admin-section-head">
            <div>
              <h5 className="text-base font-bold text-slate-900">現有規格</h5>
              <p className="admin-section-copy">每一張卡都是一個真正會進前台的商品規格。</p>
            </div>
          </div>
          <div className="grid gap-4">
            {family.products.map((product) => renderNormalVariantCard(family, product, expandedSpecId === product.id))}
          </div>
        </section>
      </section>
    );
  };

  const renderBlindFamilyWorkspace = (family: Extract<CatalogFamily, { kind: "BLIND_BOX" }>): JSX.Element => {
    const draft = getProductEditorDraft(family.product);
    const expandedSpecId = getExpandedSpecId(family.key, family.blindItems[0]?.id ?? null);
    return (
      <section className="space-y-5">
        <div className="section-frame catalog-editor-header">
          <div className="admin-section-head">
            <div>
              <p className="admin-brand-kicker">BLIND PRODUCT</p>
              <h3 className="mt-2 text-2xl font-extrabold text-slate-900">{family.title}</h3>
              <p className="mt-2 text-sm text-slate-600">盲盒商品沿用同一套商品/規格邏輯，只是規格會是拆分角色。</p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700"
              onClick={() => {
                const ok = window.confirm(`確定要刪除商品「${family.product.name}」？`);
                if (!ok) return;
                const result = system.adminDeleteProduct(family.product.id);
                setFeedback(result.message);
              }}
            >
              刪除商品
            </button>
          </div>
        </div>

        <section className="section-frame space-y-4">
          <div className="admin-section-head">
            <div>
              <h4 className="text-lg font-bold text-slate-900">商品基本資料</h4>
              <p className="admin-section-copy">盲盒商品管理商品名、主圖、價格與固位規則，庫存與角色都放在規格層。</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-3">
              <ProductImage imageUrl={(draft.imagePreviewUrl ?? draft.imageUrl) || family.product.imageUrl} alt={draft.name} />
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={draft.imageUrl} placeholder="圖片 URL" onChange={(event) => patchProductEditorDraft(family.product.id, { imageUrl: event.target.value })} />
              <div className="flex flex-wrap gap-2">
                <label className="file-picker !w-fit !rounded-lg !px-3 !py-2">
                  <span>上傳圖片</span>
                  <input className="hidden" type="file" accept="image/*" onChange={(event) => void handleSelectProductDraftImage(family.product.id, event.target.files?.[0] ?? null)} />
                </label>
                <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold" onClick={() => patchProductEditorDraft(family.product.id, { imageUrl: "", imageFile: null, imagePreviewUrl: null })}>
                  清圖
                </button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-sm md:col-span-2">
                商品名稱
                <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={draft.name} onChange={(event) => patchProductEditorDraft(family.product.id, { name: event.target.value })} />
              </label>
              <label className="block text-sm">
                價格
                <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" type="number" min={0} value={draft.price} onChange={(event) => patchProductEditorDraft(family.product.id, { price: event.target.value })} />
              </label>
              <label className="block text-sm">
                每人上限
                <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" type="number" min={1} value={draft.maxPerUser} placeholder="不限" onChange={(event) => patchProductEditorDraft(family.product.id, { maxPerUser: event.target.value })} />
              </label>
              <div className="block text-sm md:col-span-2">
                <span>固位限制</span>
                <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-white/70 p-3">
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={draft.slotRestrictionEnabled}
                      onChange={(event) => patchProductEditorDraft(family.product.id, {
                        slotRestrictionEnabled: event.target.checked,
                        slotRestrictedCharacter: event.target.checked ? draft.slotRestrictedCharacter : "",
                      })}
                    />
                    啟用固位限制
                  </label>
                  <select
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                    value={draft.slotRestrictedCharacter}
                    disabled={!draft.slotRestrictionEnabled}
                    onChange={(event) => patchProductEditorDraft(family.product.id, { slotRestrictedCharacter: event.target.value as CharacterName | "" })}
                  >
                    <option value="">依規格角色</option>
                    {CHARACTER_OPTIONS.map((character) => (
                      <option key={character} value={character}>{character}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="cta-primary" onClick={() => void handleSaveProductRow(family.product)}>儲存商品</button>
            <button type="button" className="cta-secondary" onClick={() => resetProductEditorDraft(family.product.id)}>還原</button>
          </div>
        </section>

        <section className="section-frame space-y-4">
          <div className="admin-section-head">
            <div>
              <h4 className="text-lg font-bold text-slate-900">規格管理</h4>
              <p className="admin-section-copy">新增、刪除與調整角色規格都固定留在這裡，不再另外收起。</p>
            </div>
          </div>
          {renderNewBlindBoxItemCard(family)}
          <div className="admin-section-head">
            <div>
              <h5 className="text-base font-bold text-slate-900">現有規格</h5>
              <p className="admin-section-copy">每一張卡都是一個可被喊單的角色規格。</p>
            </div>
          </div>
          <div className="grid gap-4">
            {family.blindItems.map((item) => renderBlindBoxItemCard(family, item, expandedSpecId === item.id))}
            {family.blindItems.length === 0 ? <div className="empty-panel">這個盲盒商品目前還沒有任何規格。</div> : null}
          </div>
        </section>
      </section>
    );
  };

  return (
    <section className="space-y-5">
      <div className="section-frame admin-workspace-hero">
        <div className="admin-section-head">
          <div>
            <p className="admin-brand-kicker">MERCH EDITOR</p>
            <h2 className="mt-2 text-2xl font-extrabold text-slate-900">商品管理</h2>
            <p className="mt-3 admin-section-copy">改成接近賣貨便的操作方式：左邊先挑活動和商品，右邊只編一個商品，底下再管理它的規格。</p>
          </div>
        </div>
        <div className="admin-summary-grid">
          <article className="admin-summary-card">
            <span>活動數</span>
            <strong>{system.state.campaigns.length}</strong>
          </article>
          <article className="admin-summary-card">
            <span>商品數</span>
            <strong>{families.length}</strong>
          </article>
          <article className="admin-summary-card">
            <span>一般商品規格</span>
            <strong>{families.filter((family) => family.kind === "NORMAL_GROUP").reduce((sum, family) => sum + family.products.length, 0)}</strong>
          </article>
          <article className="admin-summary-card">
            <span>盲盒規格</span>
            <strong>{system.state.blindBoxItems.length}</strong>
          </article>
        </div>
        {feedback ? <div className="admin-feedback-banner">{feedback}</div> : null}
      </div>

      <div className="catalog-marketplace-shell">
        <aside className="catalog-marketplace-sidebar">
          <section className="section-frame space-y-4">
            <div>
              <p className="admin-brand-kicker">ACTIVITY</p>
              <h3 className="text-lg font-bold text-slate-900">活動與商品</h3>
              <p className="admin-section-copy mt-2">先選活動，再從同一欄位挑商品，編輯區就固定顯示在右邊。</p>
            </div>

            <label className="block text-sm">
              當前活動
              <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={productCampaignId} onChange={(event) => {
                setProductCampaignId(event.target.value);
                setWorkspaceMode("browse");
                setSettingsProductKeyword("");
              }}>
                {system.state.campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>{campaign.title}</option>
                ))}
              </select>
            </label>

            {selectedCampaign ? (
              <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-600">
                <p>釋出：{releaseStageLabel(selectedCampaign.releaseStage)}</p>
                <p className="mt-1">截止：{new Date(selectedCampaign.deadlineAt).toLocaleString("zh-TW")}</p>
              </div>
            ) : null}

            {selectedCampaign ? (
              <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                <p className="text-sm font-semibold text-slate-900">活動主視覺</p>
                <p className="mt-1 text-xs text-slate-500">這張圖會顯示在活動頁最上方；留空時前台會自動用預設主圖。</p>
                <div className="mt-3 space-y-3">
                  <ProductImage
                    imageUrl={selectedCampaignPreviewImage}
                    alt={selectedCampaign.title}
                    frameClassName="catalog-campaign-visual catalog-campaign-visual-compact"
                    thumbClassName="catalog-campaign-visual-thumb"
                    emptyClassName="catalog-campaign-visual catalog-campaign-visual-compact"
                  />
                  <input
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    value={campaignEditorImageUrl}
                    onChange={(event) => setCampaignEditorImageUrl(event.target.value)}
                    placeholder="貼上活動圖片網址"
                  />
                  <div className="flex flex-wrap gap-2">
                    <label className="file-picker !w-fit">
                      <span>上傳活動圖</span>
                      <input className="hidden" type="file" accept="image/*" onChange={(event) => setCampaignEditorImageFile(event.target.files?.[0] ?? null)} />
                    </label>
                    <button type="button" className="cta-secondary" onClick={() => {
                      setCampaignEditorImageFile(null);
                      setCampaignEditorImagePreviewUrl(null);
                      setCampaignEditorImageUrl("");
                    }}>
                      清除
                    </button>
                    <button type="button" className="cta-primary" onClick={() => void handleSaveCampaignImage()}>
                      儲存活動圖
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {selectedCampaign ? (
              <div className="catalog-stage-grid">
                {stageOptions.map((stage) => (
                  <button
                    key={stage}
                    type="button"
                    className={selectedCampaign.releaseStage === stage ? "rounded-lg border border-slate-900 bg-slate-900 px-2 py-2 text-xs font-semibold text-white" : "rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-700"}
                    onClick={() => {
                      const result = system.adminUpdateCampaignReleaseStage(selectedCampaign.id, stage);
                      setFeedback(result.message);
                    }}
                  >
                    {releaseStageLabel(stage)}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="catalog-marketplace-actions">
              <button type="button" className={workspaceMode === "browse" ? "admin-nav-button admin-nav-button-active" : "admin-nav-button"} onClick={() => setWorkspaceMode("browse")}>
                <span className="admin-nav-title">商品編輯</span>
                <span className="admin-nav-caption">從清單選商品開始維護</span>
              </button>
              <button type="button" className={workspaceMode === "createCampaign" ? "admin-nav-button admin-nav-button-active" : "admin-nav-button"} onClick={() => setWorkspaceMode("createCampaign")}>
                <span className="admin-nav-title">新增活動</span>
                <span className="admin-nav-caption">建立新的活動檔期</span>
              </button>
              <button type="button" className={workspaceMode === "createNormalGroup" ? "admin-nav-button admin-nav-button-active" : "admin-nav-button"} onClick={openCreateNormalGroup}>
                <span className="admin-nav-title">新增一般商品</span>
                <span className="admin-nav-caption">建立商品與第一個規格</span>
              </button>
              <button type="button" className={workspaceMode === "createBlindProduct" ? "admin-nav-button admin-nav-button-active" : "admin-nav-button"} onClick={openCreateBlindProduct}>
                <span className="admin-nav-title">新增盲盒商品</span>
                <span className="admin-nav-caption">建立商品主體</span>
              </button>
              <button type="button" className={workspaceMode === "import" ? "admin-nav-button admin-nav-button-active" : "admin-nav-button"} onClick={() => setWorkspaceMode("import")}>
                <span className="admin-nav-title">批次匯入</span>
                <span className="admin-nav-caption">大量商品直接貼 CSV / JSON</span>
              </button>
            </div>

            {selectedCampaign ? (
              <button
                type="button"
                className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
                onClick={() => {
                  const ok = window.confirm(`確定要刪除活動「${selectedCampaign.title}」？\n會一併刪除此活動下的商品、喊單、訂單與物流資料。`);
                  if (!ok) return;
                  const result = system.adminDeleteCampaign(selectedCampaign.id);
                  setFeedback(result.message);
                }}
              >
                刪除活動
              </button>
            ) : null}
          </section>

          <section className="section-frame space-y-4">
            <div className="admin-section-head">
              <div>
                <p className="admin-brand-kicker">PRODUCT LIST</p>
                <h3 className="text-lg font-bold text-slate-900">商品清單</h3>
              </div>
              <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500">
                {visibleFamilies.length}/{families.length}
              </span>
            </div>

            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="搜尋商品 / SKU / 角色"
              value={settingsProductKeyword}
              onChange={(event) => setSettingsProductKeyword(event.target.value)}
            />

            <div className="catalog-product-list">
              {visibleFamilies.map((family) => (
                <button
                  key={family.key}
                  type="button"
                  className={selectedFamilyKey === family.key && workspaceMode === "browse" ? "admin-nav-button admin-nav-button-active w-full text-left" : "admin-nav-button w-full text-left"}
                  onClick={() => {
                    setSelectedFamilyKey(family.key);
                    setWorkspaceMode("browse");
                  }}
                >
                  <span className="admin-nav-title">{family.title}</span>
                  <span className="admin-nav-caption">
                    {family.kind === "NORMAL_GROUP"
                      ? `一般商品 / 規格 ${family.products.length} 個`
                      : `盲盒商品 / 規格 ${family.blindItems.length} 個`}
                  </span>
                </button>
              ))}
              {visibleFamilies.length === 0 ? <div className="empty-panel">這個活動目前沒有符合搜尋條件的商品。</div> : null}
            </div>
          </section>
        </aside>

        <div className="catalog-marketplace-main">
          {workspaceMode === "createCampaign" ? renderCampaignComposer() : null}
          {workspaceMode === "createNormalGroup" ? renderProductComposer() : null}
          {workspaceMode === "createBlindProduct" ? renderProductComposer() : null}
          {workspaceMode === "import" ? (
            <ImportsTab
              system={system}
              importMode={importMode}
              importText={importText}
              importModeDescription={importModeDescription}
              importTemplateByMode={importTemplateByMode}
              productCampaignId={productCampaignId}
              onProductCampaignChange={setProductCampaignId}
              onImportModeChange={setImportMode}
              onImportTextChange={setImportText}
              onLoadTemplate={() => setImportText(importTemplateByMode[importMode])}
              onClearImportText={() => setImportText("")}
              onImport={() => void handleImport()}
            />
          ) : null}

          {workspaceMode === "browse" && selectedFamily?.kind === "NORMAL_GROUP" ? renderNormalFamilyWorkspace(selectedFamily) : null}
          {workspaceMode === "browse" && selectedFamily?.kind === "BLIND_BOX" ? renderBlindFamilyWorkspace(selectedFamily) : null}
          {workspaceMode === "browse" && !selectedFamily ? (
            <section className="section-frame">
              <div className="empty-panel">先在左側選一個活動，再選一個商品開始編輯。</div>
            </section>
          ) : null}
        </div>
      </div>
    </section>
  );
}
