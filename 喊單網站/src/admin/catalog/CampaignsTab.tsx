import { releaseStageLabel } from "../../lib/format";
import type { ReleaseStage } from "../../types/domain";
import { stageOptions } from "./types";

export function CampaignsTab(props: {
  categories: string[];
  newCategoryName: string;
  onCategoryNameChange: (value: string) => void;
  onCreateCategory: () => void;
  onDeleteCategory: (category: string) => void;
  campaignTitle: string;
  campaignDescription: string;
  campaignDeadlineAt: string;
  campaignReleaseStage: ReleaseStage;
  onCampaignTitleChange: (value: string) => void;
  onCampaignDescriptionChange: (value: string) => void;
  onCampaignDeadlineAtChange: (value: string) => void;
  onCampaignReleaseStageChange: (value: ReleaseStage) => void;
  onCreateCampaign: () => void;
}): JSX.Element {
  const {
    categories,
    newCategoryName,
    onCategoryNameChange,
    onCreateCategory,
    onDeleteCategory,
    campaignTitle,
    campaignDescription,
    campaignDeadlineAt,
    campaignReleaseStage,
    onCampaignTitleChange,
    onCampaignDescriptionChange,
    onCampaignDeadlineAtChange,
    onCampaignReleaseStageChange,
    onCreateCampaign,
  } = props;

  return (
    <section className="space-y-5">
      <section className="section-frame">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="section-kicker">Categories</p>
            <h3 className="text-lg font-bold text-slate-900">商品分類管理</h3>
            <p className="mt-1 text-sm text-slate-600">分類由管理員自行維護，刪除分類後商品會自動改放到未分類。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="新增分類名稱" value={newCategoryName} onChange={(event) => onCategoryNameChange(event.target.value)} />
            <button type="button" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700" onClick={onCreateCategory}>
              新增分類
            </button>
          </div>
        </div>

        <div className="admin-chip-group">
          {categories.map((category) => (
            <div key={category} className="admin-chip flex items-center gap-2">
              <span>{category}</span>
              {category !== "未分類" && (
                <button type="button" className="text-xs font-semibold text-rose-700" onClick={() => onDeleteCategory(category)}>
                  刪除
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="section-frame">
        <p className="section-kicker">Campaign Builder</p>
        <h3 className="text-lg font-bold text-slate-900">新增活動</h3>
        <div className="mt-3 space-y-3 text-sm">
          <input className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="活動名稱" value={campaignTitle} onChange={(event) => onCampaignTitleChange(event.target.value)} />
          <textarea className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="活動說明" value={campaignDescription} onChange={(event) => onCampaignDescriptionChange(event.target.value)} />
          <label className="block">
            截止時間
            <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" type="datetime-local" value={campaignDeadlineAt} onChange={(event) => onCampaignDeadlineAtChange(event.target.value)} />
          </label>
          <label className="block">
            初始釋出階段
            <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={campaignReleaseStage} onChange={(event) => onCampaignReleaseStageChange(event.target.value as ReleaseStage)}>
              {stageOptions.map((stage) => (
                <option key={stage} value={stage}>{releaseStageLabel(stage)}</option>
              ))}
            </select>
          </label>
          <button type="button" className="w-full rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-700" onClick={onCreateCampaign}>
            建立活動
          </button>
        </div>
      </section>
    </section>
  );
}
