import { useMemo, useState } from "react";
import { downloadTextFile } from "../lib/download";
import { formatDate, paymentLabel, roleLabel, twd } from "../lib/format";
import type { UseOrderSystemReturn } from "../hooks/useOrderSystem";

interface AdminPanelProps {
  system: UseOrderSystemReturn;
  activeCampaignId: string;
}

export function AdminPanel({ system, activeCampaignId }: AdminPanelProps): JSX.Element {
  const [feedback, setFeedback] = useState("");
  const campaign = system.state.campaigns.find((item) => item.id === activeCampaignId);
  const products = system.getProductsByCampaign(activeCampaignId);

  const usersById = useMemo(
    () => new Map(system.state.users.map((user) => [user.id, user])),
    [system.state.users],
  );

  const quickReconciliationList = system.state.payments.filter(
    (payment) =>
      payment.campaignId === activeCampaignId &&
      (payment.method === "BANK_TRANSFER" || payment.method === "CARDLESS_DEPOSIT") &&
      !payment.reconciled,
  );

  const campaignBindings = system.state.bindings.filter((binding) => binding.campaignId === activeCampaignId);

  if (!campaign) {
    return <div className="glass-card p-5 text-sm text-slate-500">找不到檔期。</div>;
  }

  return (
    <div className="space-y-5">
      <section className="glass-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">團主後台：{campaign.title}</h2>
            <p className="text-sm text-slate-600">最終分配需由團主按下「確認分配」才成立。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
              onClick={() => {
                const result = system.triggerBinding(activeCampaignId);
                setFeedback(result.message);
              }}
            >
              觸發綁物演算法
            </button>
            <button
              type="button"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              onClick={() => {
                const csv = system.exportMyShipCsv(activeCampaignId);
                downloadTextFile(`${campaign.title}-myship.csv`, csv, "text/csv;charset=utf-8");
                setFeedback("已匯出賣貨便 CSV。");
              }}
            >
              匯出賣貨便 CSV
            </button>
          </div>
        </div>
        {feedback && <p className="mt-3 text-sm font-semibold text-slate-700">{feedback}</p>}
      </section>

      <section className="glass-card p-5">
        <h3 className="text-lg font-bold text-slate-900">排單與分配確認</h3>
        <div className="mt-4 space-y-4">
          {products.map((product) => {
            const queue = system.getClaimQueue(activeCampaignId, product.id);
            return (
              <article key={product.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-slate-900">{product.name}</p>
                    <p className="text-xs text-slate-500">庫存 {product.stock} / 排隊 {queue.length}</p>
                  </div>
                  <span
                    className={`state-pill ${product.isPopular ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}
                  >
                    {product.isPopular ? "熱門" : "冷門"}
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  {queue.length === 0 && <p className="text-sm text-slate-500">無喊單。</p>}
                  {queue.map((claim, index) => {
                    const user = usersById.get(claim.userId);
                    const isInStock = index < (product.stock ?? 0);
                    return (
                      <div
                        key={claim.id}
                        className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
                          isInStock ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"
                        }`}
                      >
                        <div className="text-sm">
                          <p className="font-semibold text-slate-900">
                            #{index + 1} {user?.fbNickname ?? user?.email ?? "未知會員"}
                          </p>
                          <p className="text-xs text-slate-600">資格 {roleLabel(claim.roleTier)} | {formatDate(claim.createdAt)}</p>
                          <p className="text-xs font-semibold text-slate-700">
                            {claim.status === "CONFIRMED"
                              ? "已確認"
                              : claim.status === "CANCELLED_BY_ADMIN"
                                ? "已取消"
                                : isInStock
                                  ? "可確認"
                                  : "候補"}
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const result = system.adminConfirmClaim(claim.id);
                              setFeedback(result.message);
                            }}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            確認分配
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const result = system.adminCancelClaim(claim.id);
                              setFeedback(result.message);
                            }}
                            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                          >
                            取消喊單
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="glass-card p-5">
          <h3 className="text-lg font-bold text-slate-900">快速對帳清單</h3>
          <div className="mt-3 space-y-2 text-sm">
            {quickReconciliationList.length === 0 && <p className="text-slate-500">目前沒有待對帳資料。</p>}
            {quickReconciliationList.map((payment) => {
              const user = usersById.get(payment.userId);
              return (
                <div key={payment.id} className="rounded-xl border border-slate-200 px-3 py-2">
                  <p className="font-semibold text-slate-900">{user?.fbNickname ?? user?.email}</p>
                  <p className="text-slate-600">金額 {twd(payment.amount)} / {paymentLabel[payment.method]}</p>
                  <p className="text-slate-600">末五碼：{payment.lastFiveCode}</p>
                  <button
                    className="mt-2 rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-700"
                    type="button"
                    onClick={() => {
                      const result = system.reconcilePayment(payment.id);
                      setFeedback(result.message);
                    }}
                  >
                    標記已對帳
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass-card p-5">
          <h3 className="text-lg font-bold text-slate-900">綁物結果</h3>
          <div className="mt-3 space-y-2 text-sm">
            {campaignBindings.length === 0 && <p className="text-slate-500">尚未有綁物紀錄。</p>}
            {campaignBindings.map((binding) => {
              const user = usersById.get(binding.buyerUserId);
              const bindProduct = system.state.products.find((product) => product.id === binding.bindProductId);
              return (
                <div key={binding.id} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                  <p className="font-semibold">{user?.fbNickname ?? user?.email}</p>
                  <p>綁物：{bindProduct?.name ?? "未知商品"}</p>
                  <p className="text-xs">{binding.reason}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
