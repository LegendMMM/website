import { useMemo, useState } from "react";
import type { UseOrderSystemReturn } from "../hooks/useOrderSystem";
import { twd } from "../lib/format";
import { AdminCatalogPanel } from "./AdminCatalogPanel";
import { AdminClaimsPanel } from "./AdminClaimsPanel";
import { adminTabs, type AdminTab } from "./config";
import { AdminFulfillmentPanel } from "./AdminFulfillmentPanel";
import { AdminMembersPanel } from "./AdminMembersPanel";

function InsightTile(props: {
  label: string;
  value: string | number;
  detail?: string;
  accent?: "violet" | "sky" | "rose" | "amber";
}): JSX.Element {
  const { label, value, detail, accent = "violet" } = props;
  return (
    <article className={`insight-tile insight-${accent}`}>
      <p className="insight-label">{label}</p>
      <p className="insight-value">{value}</p>
      {detail && <p className="insight-detail">{detail}</p>}
    </article>
  );
}

export function AdminConsoleView(props: {
  system: UseOrderSystemReturn;
  onBackToShop: () => void;
  activeTab: AdminTab;
  onChangeTab: (tab: AdminTab) => void;
}): JSX.Element {
  const { system, onBackToShop, activeTab, onChangeTab } = props;
  const [feedback, setFeedback] = useState("");

  const dashboardStats = useMemo(() => {
    const totalOrderAmount = system.state.orders.reduce((sum, order) => sum + order.totalAmount, 0);
    return {
      users: system.state.users.length,
      admins: system.state.users.filter((user) => user.isAdmin).length,
      claimsLocked: system.state.claims.filter((claim) => claim.status === "LOCKED").length,
      claimsConfirmed: system.state.claims.filter((claim) => claim.status === "CONFIRMED").length,
      orders: system.state.orders.length,
      paymentsPending: system.state.payments.filter((payment) => !payment.reconciled).length,
      totalOrderAmount,
    };
  }, [system.state.claims, system.state.orders, system.state.payments, system.state.users]);

  return (
    <section className="admin-shell">
      <aside className="admin-sidebar">
        <div>
          <h2 className="mt-2 text-2xl font-extrabold text-slate-900">團主工作台</h2>
        </div>

        <button
          type="button"
          className="cta-secondary mt-4 w-full"
          onClick={onBackToShop}
        >
          返回商城頁
        </button>

        <div className="mt-6 space-y-2">
          <div className="admin-nav-list space-y-2">
            {adminTabs.map((item) => (
              <button
                key={item.id}
                type="button"
                className={activeTab === item.id ? "admin-nav-button admin-nav-button-active" : "admin-nav-button"}
                onClick={() => onChangeTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="admin-sidebar-stats mt-6 grid gap-3">
          <InsightTile label="待審喊單" value={dashboardStats.claimsLocked} detail="優先處理" accent="rose" />
          <InsightTile label="訂單總額" value={twd(dashboardStats.totalOrderAmount)} detail={`${dashboardStats.orders} 筆訂單`} accent="sky" />
          <InsightTile label="會員數" value={dashboardStats.users} detail={`其中管理員 ${dashboardStats.admins} 位`} accent="amber" />
        </div>
      </aside>

      <div className="space-y-5">
        <div className="section-frame">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-2xl font-extrabold text-slate-900">{adminTabs.find((item) => item.id === activeTab)?.label ?? "管理後台"}</h3>
            </div>
          </div>
          {feedback && <p className="mt-3 text-sm font-semibold text-slate-800">{feedback}</p>}
        </div>

        <div className="admin-dashboard-grid grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <InsightTile label="待審喊單" value={dashboardStats.claimsLocked} accent="rose" />
          <InsightTile label="已確認喊單" value={dashboardStats.claimsConfirmed} accent="sky" />
          <InsightTile label="待對帳付款" value={dashboardStats.paymentsPending} accent="amber" />
          <InsightTile label="訂單總金額" value={twd(dashboardStats.totalOrderAmount)} accent="violet" />
        </div>

        {activeTab === "members" && <AdminMembersPanel system={system} onFeedback={setFeedback} />}
        {activeTab === "claims" && <AdminClaimsPanel system={system} onFeedback={setFeedback} />}
        {activeTab === "fulfillment" && <AdminFulfillmentPanel system={system} onFeedback={setFeedback} />}
        {activeTab === "catalog" && <AdminCatalogPanel system={system} />}
      </div>
    </section>
  );
}
