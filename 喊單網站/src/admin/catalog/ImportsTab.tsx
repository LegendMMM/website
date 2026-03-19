import type { UseOrderSystemReturn } from "../../hooks/useOrderSystem";
import type { ImportMode } from "./types";

export function ImportsTab(props: {
  system: UseOrderSystemReturn;
  importMode: ImportMode;
  importText: string;
  importModeDescription: Record<ImportMode, string>;
  importTemplateByMode: Record<ImportMode, string>;
  productCampaignId: string;
  onProductCampaignChange: (value: string) => void;
  onImportModeChange: (value: ImportMode) => void;
  onImportTextChange: (value: string) => void;
  onLoadTemplate: () => void;
  onClearImportText: () => void;
  onImport: () => void;
}): JSX.Element {
  const {
    system,
    importMode,
    importText,
    importModeDescription,
    productCampaignId,
    onProductCampaignChange,
    onImportModeChange,
    onImportTextChange,
    onLoadTemplate,
    onClearImportText,
    onImport,
  } = props;

  return (
    <section className="section-frame">
      <p className="section-kicker">Bulk Import</p>
      <h3 className="text-lg font-bold text-slate-900">表單匯入商品（批次）</h3>
      <p className="mt-2 text-sm text-slate-600">一般商品、盲盒母商品、盲盒子項分開匯入，可用 CSV 或 JSON。</p>
      <p className="mt-1 text-xs text-slate-500">{importModeDescription[importMode]}</p>
      <div className="mt-3 grid gap-3 text-sm">
        <label className="block">
          匯入目標活動
          <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={productCampaignId} onChange={(event) => onProductCampaignChange(event.target.value)}>
            {system.state.campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>{campaign.title}</option>
            ))}
          </select>
        </label>
        <label className="block">
          匯入模式
          <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={importMode} onChange={(event) => onImportModeChange(event.target.value as ImportMode)}>
            <option value="NORMAL_PRODUCT_CSV">一般商品 CSV</option>
            <option value="NORMAL_PRODUCT_JSON">一般商品 JSON</option>
            <option value="BLIND_PRODUCT_CSV">盲盒母商品 CSV</option>
            <option value="BLIND_PRODUCT_JSON">盲盒母商品 JSON</option>
            <option value="BLIND_ITEM_CSV">盲盒子項 CSV</option>
            <option value="BLIND_ITEM_JSON">盲盒子項 JSON</option>
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-lg border px-3 py-1.5 text-xs font-semibold" onClick={onLoadTemplate}>載入模板</button>
          <button type="button" className="rounded-lg border px-3 py-1.5 text-xs font-semibold" onClick={onClearImportText}>清空</button>
        </div>
        <textarea className="min-h-48 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs" placeholder="貼上 CSV 或 JSON" value={importText} onChange={(event) => onImportTextChange(event.target.value)} />
        <button type="button" className="w-full rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-700" onClick={onImport}>
          開始匯入
        </button>
      </div>
    </section>
  );
}
