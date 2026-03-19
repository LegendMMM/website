import type { UseOrderSystemReturn } from "../../hooks/useOrderSystem";
import { CHARACTER_OPTIONS } from "../../lib/constants";
import { productTypeLabel } from "../../lib/format";
import type { CharacterName, ProductSeries, ProductType } from "../../types/domain";
import { ProductImage } from "./shared";
import { productTypeOptions } from "./types";

export function BuildersTab(props: {
  system: UseOrderSystemReturn;
  productCampaignId: string;
  productType: ProductType;
  productSeries: ProductSeries;
  productName: string;
  productCharacter: CharacterName | "";
  productSlotRestrictionEnabled: boolean;
  productSlotRestrictedCharacter: CharacterName | "";
  productImageUrl: string;
  productPreviewImage: string | null;
  productPrice: string;
  productStock: string;
  productMaxPerUser: string;
  blindProductId: string;
  blindProducts: ReturnType<UseOrderSystemReturn["getProductsByCampaign"]>;
  blindName: string;
  blindCharacter: CharacterName;
  blindImageUrl: string;
  blindPreviewImage: string | null;
  blindPrice: string;
  blindStock: string;
  blindMaxPerUser: string;
  onProductCampaignChange: (value: string) => void;
  onProductTypeChange: (value: ProductType) => void;
  onProductSeriesChange: (value: ProductSeries) => void;
  onProductNameChange: (value: string) => void;
  onProductCharacterChange: (value: CharacterName | "") => void;
  onProductSlotRestrictionEnabledChange: (value: boolean) => void;
  onProductSlotRestrictedCharacterChange: (value: CharacterName | "") => void;
  onProductImageFileChange: (file: File | null) => void;
  onProductImageUrlChange: (value: string) => void;
  onClearProductImage: () => void;
  onProductPriceChange: (value: string) => void;
  onProductStockChange: (value: string) => void;
  onProductMaxPerUserChange: (value: string) => void;
  onCreateProduct: () => void;
  onBlindProductChange: (value: string) => void;
  onBlindNameChange: (value: string) => void;
  onBlindCharacterChange: (value: CharacterName) => void;
  onBlindImageFileChange: (file: File | null) => void;
  onBlindImageUrlChange: (value: string) => void;
  onClearBlindImage: () => void;
  onBlindPriceChange: (value: string) => void;
  onBlindStockChange: (value: string) => void;
  onBlindMaxPerUserChange: (value: string) => void;
  onCreateBlindBoxItem: () => void;
}): JSX.Element {
  const {
    system,
    productCampaignId,
    productType,
    productSeries,
    productName,
    productCharacter,
    productSlotRestrictionEnabled,
    productSlotRestrictedCharacter,
    productImageUrl,
    productPreviewImage,
    productPrice,
    productStock,
    productMaxPerUser,
    blindProductId,
    blindProducts,
    blindName,
    blindCharacter,
    blindImageUrl,
    blindPreviewImage,
    blindPrice,
    blindStock,
    blindMaxPerUser,
    onProductCampaignChange,
    onProductTypeChange,
    onProductSeriesChange,
    onProductNameChange,
    onProductCharacterChange,
    onProductSlotRestrictionEnabledChange,
    onProductSlotRestrictedCharacterChange,
    onProductImageFileChange,
    onProductImageUrlChange,
    onClearProductImage,
    onProductPriceChange,
    onProductStockChange,
    onProductMaxPerUserChange,
    onCreateProduct,
    onBlindProductChange,
    onBlindNameChange,
    onBlindCharacterChange,
    onBlindImageFileChange,
    onBlindImageUrlChange,
    onClearBlindImage,
    onBlindPriceChange,
    onBlindStockChange,
    onBlindMaxPerUserChange,
    onCreateBlindBoxItem,
  } = props;

  return (
    <div className="space-y-5">
      <section className="section-frame">
        <p className="section-kicker">Campaign Builder</p>
        <h3 className="text-lg font-bold text-slate-900">建立商品與盲盒子項</h3>
        <p className="mt-2 text-sm text-slate-600">建立流程集中在這裡，避免跟大量表格編輯混在同一頁。</p>
      </section>
      <section className="section-frame">
        <p className="section-kicker">Product Builder</p>
        <h3 className="text-lg font-bold text-slate-900">新增商品（含圖片）</h3>
        <div className="mt-3 space-y-4 text-sm">
          <label className="block">
            所屬活動
            <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={productCampaignId} onChange={(event) => onProductCampaignChange(event.target.value)}>
              {system.state.campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>{campaign.title}</option>
              ))}
            </select>
          </label>
          <div className="form-panel">
            <p className="form-section-title">1. 商品基礎</p>
            <p className="form-section-copy">先決定這件商品是一般代購，還是盲盒母商品。這個選擇會直接影響後面欄位。</p>
            <div className="admin-chip-group">
              {productTypeOptions.map((type) => (
                <button key={type} type="button" className={productType === type ? "admin-chip admin-chip-active" : "admin-chip"} onClick={() => onProductTypeChange(type)}>
                  {productTypeLabel(type)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              商品分類
              <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={productSeries} onChange={(event) => onProductSeriesChange(event.target.value as ProductSeries)}>
                {system.state.productCategories.map((series) => (
                  <option key={series} value={series}>{series}</option>
                ))}
              </select>
            </label>
            <div className="rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">SKU 由系統自動產生</div>
          </div>
          <input className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="商品名稱" value={productName} onChange={(event) => onProductNameChange(event.target.value)} />
          {productType === "NORMAL" && (
            <label className="block">
              展示角色（可留空）
              <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={productCharacter} onChange={(event) => onProductCharacterChange(event.target.value as CharacterName | "")}>
                <option value="">不指定角色</option>
                {CHARACTER_OPTIONS.map((character) => (
                  <option key={character} value={character}>{character}</option>
                ))}
              </select>
            </label>
          )}
          <div className="form-panel">
            <p className="form-section-title">2. 固位規則</p>
            <p className="form-section-copy">
              {productType === "BLIND_BOX" ? "這是單一盲盒母商品自己的開關，不會影響同活動內其他商品。" : "一般商品預設全員可喊；若你要某件普通商品也照角色順位開放，可以在這裡單獨開啟。"}
            </p>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={productSlotRestrictionEnabled} onChange={(event) => onProductSlotRestrictionEnabledChange(event.target.checked)} />
              {productType === "BLIND_BOX" ? "這一個盲盒商品啟用固位限制" : "這一個普通商品啟用固位限制"}
            </label>
            {productSlotRestrictionEnabled && (
              <label className="mt-3 block">
                限制角色
                <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={productSlotRestrictedCharacter} onChange={(event) => onProductSlotRestrictedCharacterChange(event.target.value as CharacterName | "")}>
                  <option value="">{productType === "BLIND_BOX" ? "依子項角色自動判斷" : "優先使用展示角色"}</option>
                  {CHARACTER_OPTIONS.map((character) => (
                    <option key={character} value={character}>{character}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="form-panel">
            <p className="form-section-title">3. 圖片與價格</p>
            <div className="mt-3 space-y-3">
              <div className="image-upload-panel">
                <div className="image-upload-preview">
                  <ProductImage imageUrl={productPreviewImage} alt={productName || "商品預覽"} />
                </div>
                <div className="space-y-3">
                  <label className="file-picker">
                    <span>選擇圖片檔</span>
                    <input className="hidden" type="file" accept="image/*" onChange={(event) => onProductImageFileChange(event.target.files?.[0] ?? null)} />
                  </label>
                  <button type="button" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold" onClick={onClearProductImage}>清除圖片</button>
                </div>
              </div>
              <input className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="圖片 URL（可留空，或作為備用）" value={productImageUrl} onChange={(event) => onProductImageUrlChange(event.target.value)} />
              <div className="grid gap-3 sm:grid-cols-2">
                <input className="w-full rounded-xl border border-slate-200 px-3 py-2" type="number" min={0} placeholder="商品價格" value={productPrice} onChange={(event) => onProductPriceChange(event.target.value)} />
                {productType === "NORMAL" ? (
                  <input className="w-full rounded-xl border border-slate-200 px-3 py-2" type="number" min={0} placeholder="庫存（留空 = 不限量）" value={productStock} onChange={(event) => onProductStockChange(event.target.value)} />
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">母商品不直接控庫存，真正的名額放在盲盒子項上。</div>
                )}
              </div>
              <input className="w-full rounded-xl border border-slate-200 px-3 py-2" type="number" min={1} placeholder="每人上限（留空=不限）" value={productMaxPerUser} onChange={(event) => onProductMaxPerUserChange(event.target.value)} />
            </div>
          </div>
          <button type="button" className="cta-primary w-full" onClick={onCreateProduct}>建立商品</button>
        </div>
      </section>
      <section className="section-frame">
        <p className="section-kicker">Blind Items</p>
        <h3 className="text-lg font-bold text-slate-900">新增盲盒角色子項（含圖片）</h3>
        <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
          <label className="block md:col-span-2">
            盲盒商品
            <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={blindProductId} onChange={(event) => onBlindProductChange(event.target.value)} disabled={blindProducts.length === 0}>
              {blindProducts.length === 0 && <option value="">尚無盲盒商品</option>}
              {blindProducts.map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
          </label>
          <div className="flex items-center rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">子項 SKU 由系統自動產生</div>
          <input className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="子項名稱" value={blindName} onChange={(event) => onBlindNameChange(event.target.value)} />
          <label className="block">
            角色
            <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={blindCharacter} onChange={(event) => onBlindCharacterChange(event.target.value as CharacterName)}>
              {CHARACTER_OPTIONS.map((character) => (
                <option key={character} value={character}>{character}</option>
              ))}
            </select>
          </label>
          <div className="image-upload-panel md:col-span-2">
            <div className="image-upload-preview">
              <ProductImage imageUrl={blindPreviewImage} alt={blindName || "盲盒子項預覽"} />
            </div>
            <div className="space-y-3">
              <label className="file-picker">
                <span>選擇子項圖片</span>
                <input className="hidden" type="file" accept="image/*" onChange={(event) => onBlindImageFileChange(event.target.files?.[0] ?? null)} />
              </label>
              <button type="button" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold" onClick={onClearBlindImage}>清除圖片</button>
              <input className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="圖片 URL（可留空，或作為備用）" value={blindImageUrl} onChange={(event) => onBlindImageUrlChange(event.target.value)} />
            </div>
          </div>
          <input className="w-full rounded-xl border border-slate-200 px-3 py-2" type="number" min={0} placeholder="子項價格（留空 = 跟母商品相同）" value={blindPrice} onChange={(event) => onBlindPriceChange(event.target.value)} />
          <input className="w-full rounded-xl border border-slate-200 px-3 py-2" type="number" min={0} placeholder="子項庫存（留空 = 不限量）" value={blindStock} onChange={(event) => onBlindStockChange(event.target.value)} />
          <input className="w-full rounded-xl border border-slate-200 px-3 py-2" type="number" min={1} placeholder="子項上限（留空=不限）" value={blindMaxPerUser} onChange={(event) => onBlindMaxPerUserChange(event.target.value)} />
          <button type="button" className="md:col-span-2 w-full rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!blindProductId} onClick={onCreateBlindBoxItem}>
            建立盲盒子項
          </button>
        </div>
      </section>
    </div>
  );
}
