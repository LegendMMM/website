import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AdminPanel } from "./components/AdminPanel";
import { AuthCard } from "./components/AuthCard";
import { CampaignTabs } from "./components/CampaignTabs";
import { MemberPanel } from "./components/MemberPanel";
import { roleLabel } from "./lib/format";
import { isSupabaseEnabled } from "./lib/supabase";
import { useOrderSystem } from "./hooks/useOrderSystem";

export default function App(): JSX.Element {
  const system = useOrderSystem();

  const [activeCampaignId, setActiveCampaignId] = useState("");
  const [viewMode, setViewMode] = useState<"member" | "admin">("member");

  useEffect(() => {
    if (system.visibleCampaigns.length === 0) return;
    if (!activeCampaignId || !system.visibleCampaigns.some((campaign) => campaign.id === activeCampaignId)) {
      setActiveCampaignId(system.visibleCampaigns[0].id);
    }
  }, [activeCampaignId, system.visibleCampaigns]);

  useEffect(() => {
    if (!system.currentUser?.isAdmin) {
      setViewMode("member");
    }
  }, [system.currentUser?.isAdmin]);

  const systemStats = useMemo(() => {
    const openCampaignCount = system.state.campaigns.filter((campaign) => campaign.status === "OPEN").length;
    const lockedClaims = system.state.claims.filter((claim) => claim.status === "LOCKED").length;
    const pendingPayments = system.state.payments.filter((payment) => !payment.reconciled).length;
    return { openCampaignCount, lockedClaims, pendingPayments };
  }, [system.state.campaigns, system.state.claims, system.state.payments]);

  if (!system.currentUser) {
    return (
      <main className="grid min-h-screen place-items-center px-4 py-12 grid-bg">
        <AuthCard onLogin={system.login} onRegister={system.register} onResetPassword={system.resetPassword} />
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl space-y-5">
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Group Order Ledger</p>
              <h1 className="mt-1 text-3xl font-extrabold text-slate-900">喊單帳本與排單系統</h1>
              <p className="mt-2 text-sm text-slate-600">
                你好，{system.currentUser.fbNickname}（{system.currentUser.email}）
              </p>
              <p className="text-xs text-slate-500">
                身分：{system.currentUser.isAdmin ? "團主" : "會員"} / 資格：{roleLabel(system.currentUser.roleTier)} / 取貨率：
                {system.currentUser.pickupRate}%
              </p>
              <p className="text-xs text-slate-500">
                資料模式：{isSupabaseEnabled ? "Supabase 已連線（可接正式資料）" : "Demo Local 模式（未設定 Supabase）"}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {system.currentUser.isAdmin && (
                <>
                  <button
                    onClick={() => setViewMode("member")}
                    type="button"
                    className={`rounded-xl border px-4 py-2 text-sm font-semibold ${
                      viewMode === "member" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"
                    }`}
                  >
                    會員視角
                  </button>
                  <button
                    onClick={() => setViewMode("admin")}
                    type="button"
                    className={`rounded-xl border px-4 py-2 text-sm font-semibold ${
                      viewMode === "admin" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"
                    }`}
                  >
                    團主後台
                  </button>
                </>
              )}
              <button
                onClick={system.logout}
                className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700"
                type="button"
              >
                登出
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
            <div className="rounded-xl bg-slate-900 px-4 py-3 text-white">
              <p className="text-xs text-slate-300">開團數</p>
              <p className="text-lg font-bold">{systemStats.openCampaignCount}</p>
            </div>
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-amber-900">
              <p className="text-xs">待確認喊單</p>
              <p className="text-lg font-bold">{systemStats.lockedClaims}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 px-4 py-3 text-emerald-900">
              <p className="text-xs">待對帳款項</p>
              <p className="text-lg font-bold">{systemStats.pendingPayments}</p>
            </div>
          </div>
        </motion.header>

        {system.visibleCampaigns.length > 0 && (
          <section className="glass-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CampaignTabs
                campaigns={system.visibleCampaigns}
                activeCampaignId={activeCampaignId}
                onChange={setActiveCampaignId}
              />
              <button
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
                type="button"
                onClick={system.resetAllData}
              >
                重置示範資料
              </button>
            </div>
          </section>
        )}

        {activeCampaignId && (viewMode === "admin" && system.currentUser.isAdmin ? (
          <AdminPanel system={system} activeCampaignId={activeCampaignId} />
        ) : (
          <MemberPanel system={system} activeCampaignId={activeCampaignId} />
        ))}
      </div>
    </main>
  );
}
