import { useEffect, useMemo, useState } from "react";
import { BuildersTab } from "./catalog/BuildersTab";
import { CampaignsTab } from "./catalog/CampaignsTab";
import { CatalogTableTab } from "./catalog/CatalogTableTab";
import { ImportsTab } from "./catalog/ImportsTab";
import { catalogTabs, type CatalogTab, type ImportMode, type ProductEditorDraft } from "./catalog/types";
import type { UseOrderSystemReturn } from "../hooks/useOrderSystem";
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
  CharacterName,
  Product,
  ProductSeries,
  ProductType,
  ReleaseStage,
} from "../types/domain";

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

export function AdminCatalogPanel(props: { system: UseOrderSystemReturn }): JSX.Element {
  const { system } = props;
  const [feedback, setFeedback] = useState("");
  const [catalogTab, setCatalogTab] = useState<CatalogTab>("campaigns");
  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");
  const [campaignDeadlineAt, setCampaignDeadlineAt] = useState("");
  const [campaignReleaseStage, setCampaignReleaseStage] = useState<ReleaseStage>("FIXED_1_ONLY");
  const [productCampaignId, setProductCampaignId] = useState(system.state.campaigns[0]?.id ?? "");
  const [productType, setProductType] = useState<ProductType>("NORMAL");
  const [productSeries, setProductSeries] = useState<ProductSeries>(system.state.productCategories[0] ?? "未分類");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [productName, setProductName] = useState("");
  const [productCharacter, setProductCharacter] = useState<CharacterName | "">("");
  const [productSlotRestrictionEnabled, setProductSlotRestrictionEnabled] = useState(false);
  const [productSlotRestrictedCharacter, setProductSlotRestrictedCharacter] = useState<CharacterName | "">("");
  const [productImageUrl, setProductImageUrl] = useState("");
  const [productImageFile, setProductImageFile] = useState<File | null>(null);
  const [productImagePreviewUrl, setProductImagePreviewUrl] = useState<string | null>(null);
  const [productPrice, setProductPrice] = useState("120");
  const [productStock, setProductStock] = useState("");
  const [productMaxPerUser, setProductMaxPerUser] = useState("");
  const [blindProductId, setBlindProductId] = useState("");
  const [blindName, setBlindName] = useState("");
  const [blindCharacter, setBlindCharacter] = useState<CharacterName>("八千代");
  const [blindImageUrl, setBlindImageUrl] = useState("");
  const [blindImageFile, setBlindImageFile] = useState<File | null>(null);
  const [blindImagePreviewUrl, setBlindImagePreviewUrl] = useState<string | null>(null);
  const [blindPrice, setBlindPrice] = useState("");
  const [blindStock, setBlindStock] = useState("");
  const [blindMaxPerUser, setBlindMaxPerUser] = useState("");
  const [settingsProductKeyword, setSettingsProductKeyword] = useState("");
  const [productEditorDrafts, setProductEditorDrafts] = useState<Record<string, ProductEditorDraft>>({});
  const [importMode, setImportMode] = useState<ImportMode>("NORMAL_PRODUCT_CSV");
  const [importText, setImportText] = useState("");

  const blindProducts = useMemo(
    () => system.state.products.filter((product) => product.type === "BLIND_BOX"),
    [system.state.products],
  );

  useEffect(() => {
    if (!productCampaignId && system.state.campaigns[0]) {
      setProductCampaignId(system.state.campaigns[0].id);
    }
  }, [productCampaignId, system.state.campaigns]);

  useEffect(() => {
    if (!system.state.productCategories.length) return;
    if (!system.state.productCategories.includes(productSeries)) {
      setProductSeries(system.state.productCategories[0]);
    }
  }, [productSeries, system.state.productCategories]);

  useEffect(() => {
    if (blindProducts.length === 0) {
      setBlindProductId("");
      return;
    }
    if (!blindProductId || !blindProducts.some((product) => product.id === blindProductId)) {
      setBlindProductId(blindProducts[0].id);
    }
  }, [blindProductId, blindProducts]);

  useEffect(() => {
    if (!productImageFile) {
      setProductImagePreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(productImageFile);
    setProductImagePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [productImageFile]);

  useEffect(() => {
    if (!blindImageFile) {
      setBlindImagePreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blindImageFile);
    setBlindImagePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blindImageFile]);

  const importModeDescription: Record<ImportMode, string> = {
    NORMAL_PRODUCT_CSV: "匯入一般代購商品。全員可喊，不帶固位限制。",
    NORMAL_PRODUCT_JSON: "匯入一般代購商品。全員可喊，不帶固位限制。",
    BLIND_PRODUCT_CSV: "匯入盲盒母商品。只有這一類會設定固位限制。",
    BLIND_PRODUCT_JSON: "匯入盲盒母商品。只有這一類會設定固位限制。",
    BLIND_ITEM_CSV: "匯入盲盒子項，會掛到既有母商品 SKU 底下。",
    BLIND_ITEM_JSON: "匯入盲盒子項，會掛到既有母商品 SKU 底下。",
  };

  const productPreviewImage = productImagePreviewUrl ?? (productImageUrl.trim() || null);
  const blindPreviewImage = blindImagePreviewUrl ?? (blindImageUrl.trim() || null);

  const importTemplateByMode: Record<ImportMode, string> = {
    NORMAL_PRODUCT_CSV: NORMAL_PRODUCT_IMPORT_CSV_TEMPLATE,
    NORMAL_PRODUCT_JSON: NORMAL_PRODUCT_IMPORT_JSON_TEMPLATE,
    BLIND_PRODUCT_CSV: BLIND_PRODUCT_IMPORT_CSV_TEMPLATE,
    BLIND_PRODUCT_JSON: BLIND_PRODUCT_IMPORT_JSON_TEMPLATE,
    BLIND_ITEM_CSV: BLIND_ITEM_IMPORT_CSV_TEMPLATE,
    BLIND_ITEM_JSON: BLIND_ITEM_IMPORT_JSON_TEMPLATE,
  };

  const getProductEditorDraft = (product: Product): ProductEditorDraft => (
    productEditorDrafts[product.id] ?? {
      name: product.name,
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
    }
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

  const handleSelectProductDraftImage = async (productId: string, file: File | null): Promise<void> => {
    if (!file) {
      patchProductEditorDraft(productId, { imageFile: null, imagePreviewUrl: null });
      return;
    }
    try {
      const preview = await readFileAsDataUrl(file);
      patchProductEditorDraft(productId, { imageFile: file, imagePreviewUrl: preview });
    } catch (error) {
      const message = error instanceof Error ? error.message : "讀取圖片失敗。";
      setFeedback(message);
    }
  };

  const resetProductEditorDraft = (productId: string): void => {
    setProductEditorDrafts((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
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
    folder: "products" | "blind-items",
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

  const handleSaveProductRow = async (product: Product): Promise<void> => {
    const draft = getProductEditorDraft(product);
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

    const result = system.adminUpdateProductRule({
      productId: product.id,
      name: draft.name,
      series: draft.series,
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

  const handleCreateProduct = async (): Promise<void> => {
    try {
      const imageResult = await resolveImageUrlForSubmit(productImageFile, productImageUrl, "products");
      if (!imageResult.ok) {
        setFeedback(imageResult.note);
        return;
      }

      const result = system.adminCreateProduct({
        campaignId: productCampaignId,
        name: productName,
        series: productSeries,
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
      setProductName("");
      setProductImageUrl("");
      setProductImageFile(null);
      setProductCharacter("");
      setProductSlotRestrictionEnabled(false);
      setProductSlotRestrictedCharacter("");
      setProductPrice("120");
      setProductStock("");
      setProductMaxPerUser("");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "圖片處理失敗。");
    }
  };

  const handleCreateBlindBoxItem = async (): Promise<void> => {
    try {
      const imageResult = await resolveImageUrlForSubmit(blindImageFile, blindImageUrl, "blind-items");
      if (!imageResult.ok) {
        setFeedback(imageResult.note);
        return;
      }

      const result = system.adminCreateBlindBoxItem({
        productId: blindProductId,
        name: blindName,
        character: blindCharacter,
        imageUrl: imageResult.imageUrl,
        price: blindPrice.trim() ? Number(blindPrice) : null,
        stock: blindStock.trim() ? Number(blindStock) : null,
        maxPerUser: blindMaxPerUser.trim() ? Number(blindMaxPerUser) : null,
      });

      setFeedback(imageResult.note ? `${result.message} ${imageResult.note}` : result.message);
      if (!result.ok) return;
      setBlindName("");
      setBlindImageUrl("");
      setBlindImageFile(null);
      setBlindPrice("");
      setBlindStock("");
      setBlindMaxPerUser("");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "圖片處理失敗。");
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

      const syncRows = resolvedRows.map((row) => ({
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
      }));
      const syncResult = await syncProductsToSupabase(syncRows);
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

      const syncRows = resolvedRows.map((row) => ({
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
      }));
      const syncResult = await syncProductsToSupabase(syncRows);
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

  return (
    <section className="space-y-5">
      <div className="section-frame">
        <h2 className="text-2xl font-extrabold text-slate-900">商品管理</h2>
        <div className="admin-chip-group mt-4">
          {catalogTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={catalogTab === item.id ? "admin-chip admin-chip-active" : "admin-chip"}
              onClick={() => setCatalogTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {feedback && <p className="mt-3 text-sm font-semibold text-slate-800">{feedback}</p>}
      </div>

      {catalogTab === "campaigns" && (
        <CampaignsTab
          categories={system.state.productCategories}
          newCategoryName={newCategoryName}
          onCategoryNameChange={setNewCategoryName}
          onCreateCategory={() => {
            const result = system.adminCreateCategory(newCategoryName);
            setFeedback(result.message);
            if (result.ok) setNewCategoryName("");
          }}
          onDeleteCategory={(category) => {
            const ok = window.confirm(`刪除分類「${category}」後，商品會移到未分類。確定執行？`);
            if (!ok) return;
            const result = system.adminDeleteCategory(category);
            setFeedback(result.message);
          }}
          campaignTitle={campaignTitle}
          campaignDescription={campaignDescription}
          campaignDeadlineAt={campaignDeadlineAt}
          campaignReleaseStage={campaignReleaseStage}
          onCampaignTitleChange={setCampaignTitle}
          onCampaignDescriptionChange={setCampaignDescription}
          onCampaignDeadlineAtChange={setCampaignDeadlineAt}
          onCampaignReleaseStageChange={setCampaignReleaseStage}
          onCreateCampaign={() => {
            const result = system.adminCreateCampaign({
              title: campaignTitle,
              description: campaignDescription,
              deadlineAt: campaignDeadlineAt,
              releaseStage: campaignReleaseStage,
            });
            setFeedback(result.message);
            if (result.ok) {
              setCampaignTitle("");
              setCampaignDescription("");
              setCampaignDeadlineAt("");
            }
          }}
        />
      )}

      {catalogTab === "imports" && (
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
      )}

      {catalogTab === "builders" && (
        <BuildersTab
          system={system}
          productCampaignId={productCampaignId}
          productType={productType}
          productSeries={productSeries}
          productName={productName}
          productCharacter={productCharacter}
          productSlotRestrictionEnabled={productSlotRestrictionEnabled}
          productSlotRestrictedCharacter={productSlotRestrictedCharacter}
          productImageUrl={productImageUrl}
          productPreviewImage={productPreviewImage}
          productPrice={productPrice}
          productStock={productStock}
          productMaxPerUser={productMaxPerUser}
          blindProductId={blindProductId}
          blindProducts={blindProducts}
          blindName={blindName}
          blindCharacter={blindCharacter}
          blindImageUrl={blindImageUrl}
          blindPreviewImage={blindPreviewImage}
          blindPrice={blindPrice}
          blindStock={blindStock}
          blindMaxPerUser={blindMaxPerUser}
          onProductCampaignChange={setProductCampaignId}
          onProductTypeChange={setProductType}
          onProductSeriesChange={setProductSeries}
          onProductNameChange={setProductName}
          onProductCharacterChange={setProductCharacter}
          onProductSlotRestrictionEnabledChange={setProductSlotRestrictionEnabled}
          onProductSlotRestrictedCharacterChange={setProductSlotRestrictedCharacter}
          onProductImageFileChange={setProductImageFile}
          onProductImageUrlChange={setProductImageUrl}
          onClearProductImage={() => {
            setProductImageFile(null);
            setProductImageUrl("");
          }}
          onProductPriceChange={setProductPrice}
          onProductStockChange={setProductStock}
          onProductMaxPerUserChange={setProductMaxPerUser}
          onCreateProduct={() => void handleCreateProduct()}
          onBlindProductChange={setBlindProductId}
          onBlindNameChange={setBlindName}
          onBlindCharacterChange={setBlindCharacter}
          onBlindImageFileChange={setBlindImageFile}
          onBlindImageUrlChange={setBlindImageUrl}
          onClearBlindImage={() => {
            setBlindImageFile(null);
            setBlindImageUrl("");
          }}
          onBlindPriceChange={setBlindPrice}
          onBlindStockChange={setBlindStock}
          onBlindMaxPerUserChange={setBlindMaxPerUser}
          onCreateBlindBoxItem={() => void handleCreateBlindBoxItem()}
        />
      )}

      {catalogTab === "catalog" && (
        <CatalogTableTab
          system={system}
          settingsProductKeyword={settingsProductKeyword}
          onSettingsProductKeywordChange={setSettingsProductKeyword}
          getProductEditorDraft={getProductEditorDraft}
          patchProductEditorDraft={patchProductEditorDraft}
          handleSelectProductDraftImage={handleSelectProductDraftImage}
          handleSaveProductRow={handleSaveProductRow}
          resetProductEditorDraft={resetProductEditorDraft}
          onDeleteCampaign={(campaignId, title) => {
            const ok = window.confirm(`確定要刪除活動「${title}」？\n會一併刪除此活動下的商品、喊單、訂單與物流資料。`);
            if (!ok) return;
            const result = system.adminDeleteCampaign(campaignId);
            setFeedback(result.message);
          }}
          onUpdateCampaignReleaseStage={(campaignId, stage) => {
            const result = system.adminUpdateCampaignReleaseStage(campaignId, stage);
            setFeedback(result.message);
          }}
          onDeleteProduct={(productId, productName) => {
            const ok = window.confirm(`確定要刪除商品「${productName}」？`);
            if (!ok) return;
            const result = system.adminDeleteProduct(productId);
            setFeedback(result.message);
          }}
        />
      )}
    </section>
  );
}
