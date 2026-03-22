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

  const tabMeta: Record<AdminTab, { eyebrow: string; title: string; description: string; note: string }> = {
    claims: {
      eyebrow: "CLAIMS DESK",
      title: "喊單處理台",
      description: "先集中處理待審喊單，再往下看完整排隊與分配狀態。",
      note: "優先看 LOCKED 喊單。",
    },
    fulfillment: {
      eyebrow: "FULFILLMENT",
      title: "履約與對帳",
      description: "把付款、訂單、物流匯出放進同一個工作區，方便一路處理到出貨。",
      note: "先對帳，再確認訂單，再匯出物流。",
    },
    members: {
      eyebrow: "MEMBERS",
      title: "會員與固位",
      description: "這裡看會員資料、單人喊單紀錄，以及角色固位分配。",
      note: "單人紀錄可直接展開處理。",
    },
    catalog: {
      eyebrow: "CATALOG",
      title: "商品工作區",
      description: "分開做活動、建商品、批次匯入與商品清單維護，不再把所有操作擠在一起。",
      note: "先建活動，再建商品，再回商品清單調整。",
    },
  };

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

  const activeMeta = tabMeta[activeTab];

  return (
    <section className="admin-workbench">
      <aside className="admin-sidebar admin-rail-card">
        <div className="space-y-3">
          <p className="admin-brand-kicker">CONTROL ROOM</p>
          <div>
            <h2 className="text-3xl font-extrabold text-slate-900">團主工作台</h2>
            <p className="mt-2 text-sm text-slate-600">把喊單、商品、會員與履約拆成明確工作區，減少一直上下找功能。</p>
          </div>
        </div>

        <button
          type="button"
          className="cta-secondary mt-5 w-full text-left"
          onClick={onBackToShop}
        >
          返回商城頁
        </button>

        <div className="admin-nav-stack mt-6">
          {adminTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={activeTab === item.id ? "admin-nav-button admin-nav-button-active" : "admin-nav-button"}
              onClick={() => onChangeTab(item.id)}
            >
              <span className="admin-nav-title">{item.label}</span>
              <span className="admin-nav-caption">{tabMeta[item.id].note}</span>
            </button>
          ))}
        </div>

        <div className="admin-rail-stats mt-6">
          <InsightTile label="待審喊單" value={dashboardStats.claimsLocked} detail="優先處理" accent="rose" />
          <InsightTile label="訂單總額" value={twd(dashboardStats.totalOrderAmount)} detail={`${dashboardStats.orders} 筆訂單`} accent="sky" />
          <InsightTile label="會員數" value={dashboardStats.users} detail={`其中管理員 ${dashboardStats.admins} 位`} accent="amber" />
        </div>
      </aside>

      <div className="admin-main-stack">
        <section className="section-frame admin-command-card">
          <div className="admin-command-head">
            <div>
              <p className="admin-brand-kicker">{activeMeta.eyebrow}</p>
              <h3 className="mt-2 text-3xl font-extrabold text-slate-900">{activeMeta.title}</h3>
              <p className="mt-3 max-w-3xl text-sm text-slate-600">{activeMeta.description}</p>
            </div>
            <div className="admin-focus-chip">{activeMeta.note}</div>
          </div>
          {feedback ? <div className="admin-feedback-banner">{feedback}</div> : null}
        </section>

        <div className="admin-overview-grid">
          <InsightTile label="待審喊單" value={dashboardStats.claimsLocked} detail="需要優先處理" accent="rose" />
          <InsightTile label="已確認喊單" value={dashboardStats.claimsConfirmed} detail="目前已分配完成" accent="sky" />
          <InsightTile label="待對帳付款" value={dashboardStats.paymentsPending} detail="履約前先核對" accent="amber" />
          <InsightTile label="訂單總金額" value={twd(dashboardStats.totalOrderAmount)} detail={`${dashboardStats.orders} 筆訂單`} accent="violet" />
        </div>

        <section className="section-frame admin-content-panel">
          {activeTab === "members" && <AdminMembersPanel system={system} onFeedback={setFeedback} />}
          {activeTab === "claims" && <AdminClaimsPanel system={system} onFeedback={setFeedback} />}
          {activeTab === "fulfillment" && <AdminFulfillmentPanel system={system} onFeedback={setFeedback} />}
          {activeTab === "catalog" && <AdminCatalogPanel system={system} />}
        </section>
      </div>
    </section>
  );
}
