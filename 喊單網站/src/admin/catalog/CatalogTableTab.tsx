import type { UseOrderSystemReturn } from "../../hooks/useOrderSystem";
import { CHARACTER_OPTIONS } from "../../lib/constants";
import { productTypeLabel, releaseStageLabel } from "../../lib/format";
import type { CharacterName, Product, ProductSeries, ReleaseStage } from "../../types/domain";
import { ProductImage } from "./shared";
import type { ProductEditorDraft } from "./types";
import { stageOptions } from "./types";

export function CatalogTableTab(props: {
  system: UseOrderSystemReturn;
  settingsProductKeyword: string;
  onSettingsProductKeywordChange: (value: string) => void;
  getProductEditorDraft: (product: Product) => ProductEditorDraft;
  patchProductEditorDraft: (productId: string, patch: Partial<ProductEditorDraft>) => void;
  handleSelectProductDraftImage: (productId: string, file: File | null) => Promise<void>;
  handleSaveProductRow: (product: Product) => Promise<void>;
  resetProductEditorDraft: (productId: string) => void;
  onDeleteCampaign: (campaignId: string, title: string) => void;
  onUpdateCampaignReleaseStage: (campaignId: string, stage: ReleaseStage) => void;
  onDeleteProduct: (productId: string, productName: string) => void;
}): JSX.Element {
  const {
    system,
    settingsProductKeyword,
    onSettingsProductKeywordChange,
    getProductEditorDraft,
    patchProductEditorDraft,
    handleSelectProductDraftImage,
    handleSaveProductRow,
    resetProductEditorDraft,
    onDeleteCampaign,
    onUpdateCampaignReleaseStage,
    onDeleteProduct,
  } = props;

  return (
    <section className="section-frame">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="section-kicker">Editable Catalog</p>
          <h3 className="text-lg font-bold text-slate-900">活動與商品清單</h3>
          <p className="mt-1 text-sm text-slate-600">直接在表格內修改商品與盲盒規則，不再使用 prompt。</p>
        </div>
        <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm md:max-w-sm" placeholder="搜尋活動內商品 / SKU / 分類" value={settingsProductKeyword} onChange={(event) => onSettingsProductKeywordChange(event.target.value)} />
      </div>
      <div className="mt-5 space-y-5">
        {system.state.campaigns.map((campaign) => {
          const keyword = settingsProductKeyword.trim().toLowerCase();
          const products = system.getProductsByCampaign(campaign.id).filter((product) => (
            !keyword
            || product.name.toLowerCase().includes(keyword)
            || product.sku.toLowerCase().includes(keyword)
            || product.series.toLowerCase().includes(keyword)
          ));

          return (
            <article key={campaign.id} className="rounded-[1.5rem] border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="section-kicker">Campaign</p>
                  <h4 className="text-lg font-bold text-slate-900">{campaign.title}</h4>
                  <p className="mt-1 text-xs text-slate-500">目前：{releaseStageLabel(campaign.releaseStage)}</p>
                </div>
                <button type="button" className="rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700" onClick={() => onDeleteCampaign(campaign.id, campaign.title)}>
                  刪除活動
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                {stageOptions.map((stage) => (
                  <button
                    key={stage}
                    type="button"
                    className={`rounded-lg border px-2 py-1 text-xs font-semibold ${campaign.releaseStage === stage ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"}`}
                    onClick={() => onUpdateCampaignReleaseStage(campaign.id, stage)}
                  >
                    {releaseStageLabel(stage)}
                  </button>
                ))}
              </div>

              <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      <th className="px-3 py-3">SKU / 名稱</th>
                      <th className="px-3 py-3">分類 / 類型</th>
                      <th className="px-3 py-3">角色 / 圖片</th>
                      <th className="px-3 py-3">價格</th>
                      <th className="px-3 py-3">庫存</th>
                      <th className="px-3 py-3">上限</th>
                      <th className="px-3 py-3">固位限制</th>
                      <th className="px-3 py-3">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {products.map((product) => {
                      const draft = getProductEditorDraft(product);
                      return (
                        <tr key={product.id} className="align-top">
                          <td className="px-3 py-3">
                            <p className="mb-2 text-xs text-slate-500">{product.sku}</p>
                            <input className="w-44 rounded-lg border border-slate-200 px-2 py-1.5" value={draft.name} onChange={(event) => patchProductEditorDraft(product.id, { name: event.target.value })} />
                          </td>
                          <td className="px-3 py-3">
                            <div className="space-y-2">
                              <select className="w-32 rounded-lg border border-slate-200 px-2 py-1.5" value={draft.series} onChange={(event) => patchProductEditorDraft(product.id, { series: event.target.value as ProductSeries })}>
                                {system.state.productCategories.map((series) => (
                                  <option key={series} value={series}>{series}</option>
                                ))}
                              </select>
                              <p className="text-xs text-slate-500">{productTypeLabel(product.type)}</p>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="space-y-2">
                              {product.type === "NORMAL" ? (
                                <select className="w-32 rounded-lg border border-slate-200 px-2 py-1.5" value={draft.character} onChange={(event) => patchProductEditorDraft(product.id, { character: event.target.value as CharacterName | "" })}>
                                  <option value="">不指定角色</option>
                                  {CHARACTER_OPTIONS.map((character) => (
                                    <option key={character} value={character}>{character}</option>
                                  ))}
                                </select>
                              ) : (
                                <p className="text-xs text-slate-500">盲盒母商品</p>
                              )}
                              <input className="w-56 rounded-lg border border-slate-200 px-2 py-1.5" value={draft.imageUrl} placeholder="圖片 URL" onChange={(event) => patchProductEditorDraft(product.id, { imageUrl: event.target.value })} />
                              <label className="file-picker !w-fit !rounded-lg !px-3 !py-1.5">
                                <span>上傳圖片</span>
                                <input className="hidden" type="file" accept="image/*" onChange={(event) => void handleSelectProductDraftImage(product.id, event.target.files?.[0] ?? null)} />
                              </label>
                              <button type="button" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold" onClick={() => patchProductEditorDraft(product.id, { imageUrl: "", imageFile: null, imagePreviewUrl: null })}>
                                清圖
                              </button>
                              <div className="h-14 w-14 overflow-hidden rounded-lg border border-slate-200">
                                <ProductImage imageUrl={(draft.imagePreviewUrl ?? draft.imageUrl) || product.imageUrl} alt={draft.name} />
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <input className="w-24 rounded-lg border border-slate-200 px-2 py-1.5" type="number" min={0} value={draft.price} onChange={(event) => patchProductEditorDraft(product.id, { price: event.target.value })} />
                          </td>
                          <td className="px-3 py-3">
                            {product.type === "NORMAL" ? (
                              <input className="w-24 rounded-lg border border-slate-200 px-2 py-1.5" type="number" min={0} value={draft.stock} placeholder="不限" onChange={(event) => patchProductEditorDraft(product.id, { stock: event.target.value })} />
                            ) : (
                              <span className="text-xs text-slate-500">母商品不控庫存</span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <input className="w-24 rounded-lg border border-slate-200 px-2 py-1.5" type="number" min={1} value={draft.maxPerUser} placeholder="不限" onChange={(event) => patchProductEditorDraft(product.id, { maxPerUser: event.target.value })} />
                          </td>
                          <td className="px-3 py-3">
                            <div className="space-y-2">
                              <label className="flex items-center gap-2 text-xs text-slate-600">
                                <input
                                  type="checkbox"
                                  checked={draft.slotRestrictionEnabled}
                                  onChange={(event) => patchProductEditorDraft(product.id, {
                                    slotRestrictionEnabled: event.target.checked,
                                    slotRestrictedCharacter: event.target.checked ? draft.slotRestrictedCharacter : "",
                                  })}
                                />
                                啟用
                              </label>
                              <select className="w-36 rounded-lg border border-slate-200 px-2 py-1.5" value={draft.slotRestrictedCharacter} disabled={!draft.slotRestrictionEnabled} onChange={(event) => patchProductEditorDraft(product.id, { slotRestrictedCharacter: event.target.value as CharacterName | "" })}>
                                <option value="">{product.type === "BLIND_BOX" ? "依子項角色" : "依展示角色"}</option>
                                {CHARACTER_OPTIONS.map((character) => (
                                  <option key={character} value={character}>{character}</option>
                                ))}
                              </select>
                              <p className="text-[11px] text-slate-500">
                                {draft.slotRestrictionEnabled ? `目前啟用：${draft.slotRestrictedCharacter || (draft.character || (product.type === "BLIND_BOX" ? "依子項角色" : "未指定角色"))}` : "未啟用"}
                              </p>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-col gap-2">
                              <button type="button" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold" onClick={() => void handleSaveProductRow(product)}>儲存</button>
                              <button type="button" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold" onClick={() => resetProductEditorDraft(product.id)}>還原</button>
                              <button type="button" className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700" onClick={() => onDeleteProduct(product.id, product.name)}>
                                刪除
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {products.length === 0 && (
                      <tr>
                        <td className="px-3 py-4 text-sm text-slate-500" colSpan={8}>此活動目前沒有符合搜尋條件的商品。</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
