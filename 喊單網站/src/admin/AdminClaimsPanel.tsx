import { useMemo, useState } from "react";
import type { UseOrderSystemReturn } from "../hooks/useOrderSystem";
import { formatDate } from "../lib/format";
import type { Product } from "../types/domain";
import { formatClaimPrioritySummary } from "./helpers";

type ClaimStatusFilter = "ALL" | "LOCKED" | "CONFIRMED" | "CANCELLED_BY_ADMIN";

export function AdminClaimsPanel(props: {
  system: UseOrderSystemReturn;
  onFeedback: (message: string) => void;
}): JSX.Element {
  const { system, onFeedback } = props;
  const [claimCampaignFilter, setClaimCampaignFilter] = useState<string>("ALL");
  const [claimStatusFilter, setClaimStatusFilter] = useState<ClaimStatusFilter>("ALL");
  const [claimKeyword, setClaimKeyword] = useState("");

  const userById = useMemo(() => new Map(system.state.users.map((user) => [user.id, user])), [system.state.users]);
  const campaignById = useMemo(() => new Map(system.state.campaigns.map((campaign) => [campaign.id, campaign])), [system.state.campaigns]);
  const productById = useMemo(() => new Map(system.state.products.map((product) => [product.id, product])), [system.state.products]);
  const blindItemById = useMemo(() => new Map(system.state.blindBoxItems.map((item) => [item.id, item])), [system.state.blindBoxItems]);

  const visibleClaims = useMemo(() => {
    const keyword = claimKeyword.trim().toLowerCase();
    return [...system.state.claims]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .filter((claim) => {
        if (claimCampaignFilter !== "ALL" && claim.campaignId !== claimCampaignFilter) return false;
        if (claimStatusFilter !== "ALL" && claim.status !== claimStatusFilter) return false;
        if (!keyword) return true;

        const user = userById.get(claim.userId);
        const product = productById.get(claim.productId);
        const blindItem = claim.blindBoxItemId ? blindItemById.get(claim.blindBoxItemId) : null;
        const campaign = campaignById.get(claim.campaignId);
        const text = [
          user?.fbNickname ?? "",
          user?.email ?? "",
          product?.name ?? "",
          product?.sku ?? "",
          blindItem?.name ?? "",
          campaign?.title ?? "",
        ].join(" ").toLowerCase();
        return text.includes(keyword);
      });
  }, [blindItemById, campaignById, claimCampaignFilter, claimKeyword, claimStatusFilter, productById, system.state.claims, userById]);

  const summary = useMemo(() => ({
    total: system.state.claims.length,
    locked: system.state.claims.filter((claim) => claim.status === "LOCKED").length,
    confirmed: system.state.claims.filter((claim) => claim.status === "CONFIRMED").length,
    cancelled: system.state.claims.filter((claim) => claim.status === "CANCELLED_BY_ADMIN").length,
  }), [system.state.claims]);

  return (
    <section className="space-y-4">
      <div className="admin-summary-grid">
        <article className="admin-summary-card"><span>全部喊單</span><strong>{summary.total}</strong></article>
        <article className="admin-summary-card"><span>待審</span><strong>{summary.locked}</strong></article>
        <article className="admin-summary-card"><span>已確認</span><strong>{summary.confirmed}</strong></article>
      </div>

      <div className="admin-filter-card">
        <div className="admin-section-head">
          <div>
            <h3 className="text-lg font-bold text-slate-900">全站喊單總表</h3>
            <p className="admin-section-copy">先用活動、狀態和關鍵字縮小範圍，再處理單筆喊單。</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <label className="block text-sm">
            活動
            <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={claimCampaignFilter} onChange={(event) => setClaimCampaignFilter(event.target.value)}>
              <option value="ALL">全部活動</option>
              {system.state.campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>{campaign.title}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            狀態
            <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={claimStatusFilter} onChange={(event) => setClaimStatusFilter(event.target.value as ClaimStatusFilter)}>
              <option value="ALL">全部狀態</option>
              <option value="LOCKED">LOCKED</option>
              <option value="CONFIRMED">CONFIRMED</option>
              <option value="CANCELLED_BY_ADMIN">CANCELLED_BY_ADMIN</option>
            </select>
          </label>
          <label className="block text-sm md:col-span-2">
            搜尋
            <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="會員 / Email / 商品 / SKU / 活動" value={claimKeyword} onChange={(event) => setClaimKeyword(event.target.value)} />
          </label>
        </div>
      </div>

      <div className="space-y-3">
        {visibleClaims.length === 0 && <div className="empty-panel">目前沒有符合條件的喊單資料。</div>}
        {visibleClaims.map((claim) => {
          const campaign = campaignById.get(claim.campaignId);
          const product = productById.get(claim.productId);
          const blindItem = claim.blindBoxItemId ? blindItemById.get(claim.blindBoxItemId) : null;
          const user = userById.get(claim.userId);
          const label = blindItem ? `${product?.name ?? "未知商品"} / ${blindItem.name}` : product?.name ?? "未知商品";
          const queue = system.getClaimQueue(claim.campaignId, claim.productId, claim.blindBoxItemId ?? undefined);
          const rank = queue.findIndex((item) => item.id === claim.id) + 1;
          const stock = claim.blindBoxItemId ? (blindItem?.stock ?? null) : ((product as Product | undefined)?.stock ?? null);

          return (
            <article key={claim.id} className="row-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-bold text-slate-900">{label}</p>
                  <p className="text-xs text-slate-500">
                    {campaign?.title ?? "未知活動"} / {user?.fbNickname ?? "未知會員"} / {formatDate(claim.createdAt)}
                  </p>
                  <p className="text-xs text-slate-500">
                    狀態：{claim.status} / 順位：{rank > 0 ? rank : "-"} / 名額：{stock ?? "不限"}
                  </p>
                  <p className="text-xs text-slate-600">{formatClaimPrioritySummary(product, claim.roleTier)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold"
                    onClick={() => {
                      const result = system.adminConfirmClaim(claim.id);
                      onFeedback(result.message);
                    }}
                    disabled={claim.status !== "LOCKED"}
                  >
                    確認分配
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700"
                    onClick={() => {
                      const result = system.adminCancelClaim(claim.id);
                      onFeedback(result.message);
                    }}
                    disabled={claim.status === "CANCELLED_BY_ADMIN"}
                  >
                    取消喊單
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
