import type { UseOrderSystemReturn } from "../../hooks/useOrderSystem";
import { CHARACTER_OPTIONS } from "../../lib/constants";
import { productTypeLabel, releaseStageLabel } from "../../lib/format";
import type { BlindBoxItem, CharacterName, Product, ReleaseStage } from "../../types/domain";
import { ProductImage } from "./shared";
import type { BlindBoxItemEditorDraft, ProductEditorDraft } from "./types";
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
  getBlindBoxItemEditorDraft: (blindBoxItem: BlindBoxItem) => BlindBoxItemEditorDraft;
  patchBlindBoxItemEditorDraft: (blindBoxItemId: string, patch: Partial<BlindBoxItemEditorDraft>) => void;
  handleSelectBlindBoxItemDraftImage: (blindBoxItemId: string, file: File | null) => Promise<void>;
  handleSaveBlindBoxItemRow: (blindBoxItem: BlindBoxItem) => Promise<void>;
  resetBlindBoxItemEditorDraft: (blindBoxItemId: string) => void;
  getNewBlindBoxItemDraft: (productId: string) => BlindBoxItemEditorDraft;
  patchNewBlindBoxItemDraft: (productId: string, patch: Partial<BlindBoxItemEditorDraft>) => void;
  handleSelectNewBlindBoxItemDraftImage: (productId: string, file: File | null) => Promise<void>;
  handleCreateBlindBoxItemForProduct: (productId: string) => Promise<void>;
  resetNewBlindBoxItemDraft: (productId: string) => void;
  onDeleteCampaign: (campaignId: string, title: string) => void;
  onUpdateCampaignReleaseStage: (campaignId: string, stage: ReleaseStage) => void;
  onDeleteProduct: (productId: string, productName: string) => void;
  onDeleteBlindBoxItem: (blindBoxItemId: string, blindBoxItemName: string) => void;
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
    getBlindBoxItemEditorDraft,
    patchBlindBoxItemEditorDraft,
    handleSelectBlindBoxItemDraftImage,
    handleSaveBlindBoxItemRow,
    resetBlindBoxItemEditorDraft,
    getNewBlindBoxItemDraft,
    patchNewBlindBoxItemDraft,
    handleSelectNewBlindBoxItemDraftImage,
    handleCreateBlindBoxItemForProduct,
    resetNewBlindBoxItemDraft,
    onDeleteCampaign,
    onUpdateCampaignReleaseStage,
    onDeleteProduct,
    onDeleteBlindBoxItem,
  } = props;

  return (
    <section className="section-frame">
      <div className="admin-section-head">
        <div>
          <h3 className="text-lg font-bold text-slate-900">活動商品清單</h3>
          <p className="admin-section-copy">改成卡片式逐筆編輯，不再用容易崩掉的寬表格。</p>
        </div>
        <input
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm md:max-w-sm"
          placeholder="搜尋活動內商品 / SKU / 角色"
          value={settingsProductKeyword}
          onChange={(event) => onSettingsProductKeywordChange(event.target.value)}
        />
      </div>

      <div className="mt-5 space-y-5">
        {system.state.campaigns.map((campaign) => {
          const keyword = settingsProductKeyword.trim().toLowerCase();
          const blindItemsByProductId = new Map<string, ReturnType<UseOrderSystemReturn["getBlindBoxItemsByProduct"]>>();
          const products = system.getProductsByCampaign(campaign.id).filter((product) => (
            !keyword
            || (() => {
              const blindItems = product.type === "BLIND_BOX"
                ? (blindItemsByProductId.get(product.id) ?? (() => {
                  const items = system.getBlindBoxItemsByProduct(product.id);
                  blindItemsByProductId.set(product.id, items);
                  return items;
                })())
                : [];

              return (
                product.name.toLowerCase().includes(keyword)
                || product.sku.toLowerCase().includes(keyword)
                || (product.character?.toLowerCase().includes(keyword) ?? false)
                || blindItems.some((item) => (
                  item.name.toLowerCase().includes(keyword)
                  || item.character.toLowerCase().includes(keyword)
                  || item.sku.toLowerCase().includes(keyword)
                ))
              );
            })()
          ));

          return (
            <article key={campaign.id} className="rounded-[1.5rem] border border-slate-200 p-4">
              <div className="admin-section-head">
                <div>
                  <h4 className="text-xl font-bold text-slate-900">{campaign.title}</h4>
                  <p className="mt-1 text-xs text-slate-500">{releaseStageLabel(campaign.releaseStage)} / 共 {products.length} 筆商品</p>
                </div>
                <button
                  type="button"
                  className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700"
                  onClick={() => onDeleteCampaign(campaign.id, campaign.title)}
                >
                  刪除活動
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                {stageOptions.map((stage) => (
                  <button
                    key={stage}
                    type="button"
                    className={`rounded-lg border px-2 py-2 text-xs font-semibold ${campaign.releaseStage === stage ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"}`}
                    onClick={() => onUpdateCampaignReleaseStage(campaign.id, stage)}
                  >
                    {releaseStageLabel(stage)}
                  </button>
                ))}
              </div>

              <div className="mt-5 space-y-4">
                {products.length === 0 && (
                  <div className="empty-panel">此活動目前沒有符合搜尋條件的商品。</div>
                )}

                {products.map((product) => {
                  const draft = getProductEditorDraft(product);
                  const blindItems = product.type === "BLIND_BOX" ? system.getBlindBoxItemsByProduct(product.id) : [];

                  return (
                    <article key={product.id} className="mini-preview-card space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600">{product.sku}</span>
                            <span className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600">{productTypeLabel(product.type)}</span>
                            {product.type === "BLIND_BOX" ? (
                              <span className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600">子項 {blindItems.length} 項</span>
                            ) : null}
                          </div>
                          <h5 className="mt-3 text-lg font-bold text-slate-900">{product.name}</h5>
                        </div>

                        <button
                          type="button"
                          className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700"
                          onClick={() => onDeleteProduct(product.id, product.name)}
                        >
                          刪除商品
                        </button>
                      </div>

                      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
                        <div className="space-y-3">
                          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white/70">
                            <ProductImage imageUrl={(draft.imagePreviewUrl ?? draft.imageUrl) || product.imageUrl} alt={draft.name} />
                          </div>
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

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          <label className="block text-sm">
                            名稱
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                              value={draft.name}
                              onChange={(event) => patchProductEditorDraft(product.id, { name: event.target.value })}
                            />
                          </label>

                          <label className="block text-sm">
                            角色款
                            {product.type === "NORMAL" ? (
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
                            ) : (
                              <div className="mt-1 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-500">盲盒母商品</div>
                            )}
                          </label>

                          <label className="block text-sm">
                            價格
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                              type="number"
                              min={0}
                              value={draft.price}
                              onChange={(event) => patchProductEditorDraft(product.id, { price: event.target.value })}
                            />
                          </label>

                          <label className="block text-sm">
                            庫存
                            {product.type === "NORMAL" ? (
                              <input
                                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                                type="number"
                                min={0}
                                value={draft.stock}
                                placeholder="不限"
                                onChange={(event) => patchProductEditorDraft(product.id, { stock: event.target.value })}
                              />
                            ) : (
                              <div className="mt-1 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-500">母商品不控庫存</div>
                            )}
                          </label>

                          <label className="block text-sm">
                            每人上限
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                              type="number"
                              min={1}
                              value={draft.maxPerUser}
                              placeholder="不限"
                              onChange={(event) => patchProductEditorDraft(product.id, { maxPerUser: event.target.value })}
                            />
                          </label>

                          <div className="block text-sm">
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
                                <option value="">{product.type === "BLIND_BOX" ? "依子項角色" : "依展示角色"}</option>
                                {CHARACTER_OPTIONS.map((character) => (
                                  <option key={character} value={character}>{character}</option>
                                ))}
                              </select>
                              <p className="text-[11px] text-slate-500">
                                {draft.slotRestrictionEnabled ? `目前啟用：${draft.slotRestrictedCharacter || (draft.character || (product.type === "BLIND_BOX" ? "依子項角色" : "未指定角色"))}` : "未啟用"}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
                        <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold" onClick={() => void handleSaveProductRow(product)}>
                          儲存變更
                        </button>
                        <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold" onClick={() => resetProductEditorDraft(product.id)}>
                          還原
                        </button>
                      </div>

                      {product.type === "BLIND_BOX" ? (
                        <div className="space-y-4 border-t border-slate-200 pt-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <h6 className="text-base font-bold text-slate-900">盲盒角色子項</h6>
                              <p className="text-xs text-slate-500">這裡可直接修改、刪除，或新增子項。</p>
                            </div>
                            <span className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600">
                              目前 {blindItems.length} 項
                            </span>
                          </div>

                          <div className="grid gap-3 xl:grid-cols-2">
                            {blindItems.map((blindItem) => {
                              const blindDraft = getBlindBoxItemEditorDraft(blindItem);
                              return (
                                <article key={blindItem.id} className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600">{blindItem.sku}</span>
                                        <span className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600">{blindItem.character}</span>
                                      </div>
                                      <h6 className="mt-2 text-sm font-bold text-slate-900">{blindItem.name}</h6>
                                    </div>
                                    <button
                                      type="button"
                                      className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700"
                                      onClick={() => onDeleteBlindBoxItem(blindItem.id, blindItem.name)}
                                    >
                                      刪除子項
                                    </button>
                                  </div>

                                  <div className="mt-4 grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
                                    <div className="space-y-3">
                                      <ProductImage imageUrl={(blindDraft.imagePreviewUrl ?? blindDraft.imageUrl) || blindItem.imageUrl} alt={blindDraft.name || blindItem.name} />
                                      <input
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                        value={blindDraft.imageUrl}
                                        placeholder="圖片 URL"
                                        onChange={(event) => patchBlindBoxItemEditorDraft(blindItem.id, { imageUrl: event.target.value })}
                                      />
                                      <div className="flex flex-wrap gap-2">
                                        <label className="file-picker !w-fit !rounded-lg !px-3 !py-2">
                                          <span>上傳圖片</span>
                                          <input className="hidden" type="file" accept="image/*" onChange={(event) => void handleSelectBlindBoxItemDraftImage(blindItem.id, event.target.files?.[0] ?? null)} />
                                        </label>
                                        <button
                                          type="button"
                                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"
                                          onClick={() => patchBlindBoxItemEditorDraft(blindItem.id, { imageUrl: "", imageFile: null, imagePreviewUrl: null })}
                                        >
                                          清圖
                                        </button>
                                      </div>
                                    </div>

                                    <div className="grid gap-3 md:grid-cols-2">
                                      <label className="block text-sm">
                                        子項名稱
                                        <input
                                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                                          value={blindDraft.name}
                                          onChange={(event) => patchBlindBoxItemEditorDraft(blindItem.id, { name: event.target.value })}
                                        />
                                      </label>
                                      <label className="block text-sm">
                                        角色
                                        <select
                                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                                          value={blindDraft.character}
                                          onChange={(event) => patchBlindBoxItemEditorDraft(blindItem.id, { character: event.target.value as CharacterName })}
                                        >
                                          {CHARACTER_OPTIONS.map((character) => (
                                            <option key={character} value={character}>{character}</option>
                                          ))}
                                        </select>
                                      </label>
                                      <label className="block text-sm">
                                        價格
                                        <input
                                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                                          type="number"
                                          min={0}
                                          value={blindDraft.price}
                                          placeholder="跟母商品相同"
                                          onChange={(event) => patchBlindBoxItemEditorDraft(blindItem.id, { price: event.target.value })}
                                        />
                                      </label>
                                      <label className="block text-sm">
                                        庫存
                                        <input
                                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                                          type="number"
                                          min={0}
                                          value={blindDraft.stock}
                                          placeholder="不限"
                                          onChange={(event) => patchBlindBoxItemEditorDraft(blindItem.id, { stock: event.target.value })}
                                        />
                                      </label>
                                      <label className="block text-sm md:col-span-2">
                                        每人上限
                                        <input
                                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                                          type="number"
                                          min={1}
                                          value={blindDraft.maxPerUser}
                                          placeholder="不限"
                                          onChange={(event) => patchBlindBoxItemEditorDraft(blindItem.id, { maxPerUser: event.target.value })}
                                        />
                                      </label>
                                    </div>
                                  </div>

                                  <div className="mt-4 flex flex-wrap gap-2">
                                    <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold" onClick={() => void handleSaveBlindBoxItemRow(blindItem)}>
                                      儲存子項
                                    </button>
                                    <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold" onClick={() => resetBlindBoxItemEditorDraft(blindItem.id)}>
                                      還原
                                    </button>
                                  </div>
                                </article>
                              );
                            })}
                          </div>

                          <article className="rounded-2xl border border-dashed border-slate-300 bg-white/50 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <h6 className="text-base font-bold text-slate-900">新增角色子項</h6>
                                <p className="text-xs text-slate-500">直接掛在這個盲盒母商品底下。</p>
                              </div>
                            </div>
                            {(() => {
                              const newBlindDraft = getNewBlindBoxItemDraft(product.id);
                              return (
                                <div className="mt-4 grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
                                  <div className="space-y-3">
                                    <ProductImage imageUrl={newBlindDraft.imagePreviewUrl ?? newBlindDraft.imageUrl} alt={newBlindDraft.name || "新增子項預覽"} />
                                    <input
                                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                      value={newBlindDraft.imageUrl}
                                      placeholder="圖片 URL"
                                      onChange={(event) => patchNewBlindBoxItemDraft(product.id, { imageUrl: event.target.value })}
                                    />
                                    <div className="flex flex-wrap gap-2">
                                      <label className="file-picker !w-fit !rounded-lg !px-3 !py-2">
                                        <span>上傳圖片</span>
                                        <input className="hidden" type="file" accept="image/*" onChange={(event) => void handleSelectNewBlindBoxItemDraftImage(product.id, event.target.files?.[0] ?? null)} />
                                      </label>
                                      <button
                                        type="button"
                                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"
                                        onClick={() => patchNewBlindBoxItemDraft(product.id, { imageUrl: "", imageFile: null, imagePreviewUrl: null })}
                                      >
                                        清圖
                                      </button>
                                    </div>
                                  </div>

                                  <div className="grid gap-3 md:grid-cols-2">
                                    <label className="block text-sm">
                                      子項名稱
                                      <input
                                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                                        value={newBlindDraft.name}
                                        onChange={(event) => patchNewBlindBoxItemDraft(product.id, { name: event.target.value })}
                                      />
                                    </label>
                                    <label className="block text-sm">
                                      角色
                                      <select
                                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                                        value={newBlindDraft.character}
                                        onChange={(event) => patchNewBlindBoxItemDraft(product.id, { character: event.target.value as CharacterName })}
                                      >
                                        {CHARACTER_OPTIONS.map((character) => (
                                          <option key={character} value={character}>{character}</option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="block text-sm">
                                      價格
                                      <input
                                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                                        type="number"
                                        min={0}
                                        value={newBlindDraft.price}
                                        placeholder="跟母商品相同"
                                        onChange={(event) => patchNewBlindBoxItemDraft(product.id, { price: event.target.value })}
                                      />
                                    </label>
                                    <label className="block text-sm">
                                      庫存
                                      <input
                                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                                        type="number"
                                        min={0}
                                        value={newBlindDraft.stock}
                                        placeholder="不限"
                                        onChange={(event) => patchNewBlindBoxItemDraft(product.id, { stock: event.target.value })}
                                      />
                                    </label>
                                    <label className="block text-sm md:col-span-2">
                                      每人上限
                                      <input
                                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                                        type="number"
                                        min={1}
                                        value={newBlindDraft.maxPerUser}
                                        placeholder="不限"
                                        onChange={(event) => patchNewBlindBoxItemDraft(product.id, { maxPerUser: event.target.value })}
                                      />
                                    </label>
                                  </div>
                                </div>
                              );
                            })()}

                            <div className="mt-4 flex flex-wrap gap-2">
                              <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold" onClick={() => void handleCreateBlindBoxItemForProduct(product.id)}>
                                新增子項
                              </button>
                              <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold" onClick={() => resetNewBlindBoxItemDraft(product.id)}>
                                清空
                              </button>
                            </div>
                          </article>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
