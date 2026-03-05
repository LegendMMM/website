import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { calculateUnitPrice } from "../lib/business-rules";
import { formatDate, paymentLabel, roleLabel, twd } from "../lib/format";
import type { UseOrderSystemReturn } from "../hooks/useOrderSystem";
import type { PaymentMethod } from "../types/domain";

interface MemberPanelProps {
  system: UseOrderSystemReturn;
  activeCampaignId: string;
}

const paymentOptions: PaymentMethod[] = [
  "BANK_TRANSFER",
  "CARDLESS_DEPOSIT",
  "EMPTY_PACKAGE",
  "CASH_ON_DELIVERY",
];

export function MemberPanel({ system, activeCampaignId }: MemberPanelProps): JSX.Element {
  const [lastFiveCode, setLastFiveCode] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("BANK_TRANSFER");
  const [feedback, setFeedback] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [receiverStoreCode, setReceiverStoreCode] = useState("");

  const campaign = system.state.campaigns.find((item) => item.id === activeCampaignId);
  const products = system.getProductsByCampaign(activeCampaignId);
  const claims = system.currentUser
    ? system.getUserClaims(activeCampaignId, system.currentUser.id)
    : [];

  const totalAmount = system.currentUser
    ? system.getUserCampaignTotal(activeCampaignId, system.currentUser.id)
    : 0;

  const availableMethods = system.currentUser
    ? system.getPaymentMethodsForUser(activeCampaignId, system.currentUser.id)
    : [];

  const bindingRows = useMemo(() => {
    if (!system.currentUser) return [];
    const campaignBindings = system.state.bindings.filter(
      (binding) => binding.campaignId === activeCampaignId && binding.buyerUserId === system.currentUser?.id,
    );
    const productsById = new Map(system.state.products.map((product) => [product.id, product]));
    return campaignBindings.map((binding) => ({
      ...binding,
      productName: productsById.get(binding.bindProductId)?.name ?? "未知商品",
    }));
  }, [activeCampaignId, system.currentUser, system.state.bindings, system.state.products]);

  if (!campaign || !system.currentUser) {
    return <div className="glass-card p-5 text-sm text-slate-500">無可顯示資料。</div>;
  }

  return (
    <div className="space-y-5">
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-5"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold text-slate-900">{campaign.title}</h2>
          <span className="state-pill bg-slate-100 text-slate-700">{campaign.pricingMode === "DYNAMIC" ? "調價模式" : "均價+綁物模式"}</span>
        </div>
        <p className="mt-2 text-sm text-slate-600">{campaign.description}</p>
        <p className="mt-1 text-xs text-slate-500">截止時間：{formatDate(campaign.deadlineAt)}</p>
      </motion.section>

      <section className="glass-card p-5">
        <h3 className="text-lg font-bold text-slate-900">商品喊單 (+1 後鎖定)</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => {
            const queue = system.getClaimQueue(activeCampaignId, product.id);
            const queuePosition = queue.findIndex((claim) => claim.userId === system.currentUser?.id) + 1;
            const locked = system.isClaimLockedByCurrentUser(activeCampaignId, product.id);
            const unitPrice = calculateUnitPrice(product, campaign);
            return (
              <article key={product.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-slate-500">{product.sku}</p>
                    <p className="font-bold text-slate-900">{product.name}</p>
                    <p className="text-sm text-slate-500">角色：{product.character}</p>
                  </div>
                  <span
                    className={`state-pill ${product.isPopular ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}
                  >
                    {product.isPopular ? "熱門" : "冷門"}
                  </span>
                </div>
                <div className="mt-3 text-sm text-slate-600">
                  <p>單價：{twd(unitPrice)}</p>
                  <p>庫存：{product.stock}</p>
                  <p>目前喊單：{queue.length}</p>
                  {queuePosition > 0 && <p>你的排位：{queuePosition}</p>}
                </div>
                <button
                  onClick={() => {
                    const result = system.claimProduct(activeCampaignId, product.id);
                    setFeedback(result.message);
                  }}
                  disabled={locked}
                  className={`mt-4 w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    locked
                      ? "cursor-not-allowed bg-slate-100 text-slate-500"
                      : "bg-slate-900 text-white hover:bg-slate-700"
                  }`}
                  type="button"
                >
                  {locked ? "已喊單（已鎖定）" : "+1 喊單"}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="glass-card p-5">
          <h3 className="text-lg font-bold text-slate-900">我的喊單與分配</h3>
          <div className="mt-3 space-y-2 text-sm">
            {claims.length === 0 && <p className="text-slate-500">尚未喊單。</p>}
            {claims.map((claim) => {
              const product = products.find((item) => item.id === claim.productId);
              return (
                <div key={claim.id} className="rounded-xl border border-slate-200 px-3 py-2">
                  <p className="font-semibold text-slate-800">{product?.name ?? "未知商品"}</p>
                  <p className="text-slate-500">資格：{roleLabel(claim.roleTier)}</p>
                  <p
                    className={`text-xs font-semibold ${
                      claim.status === "CONFIRMED"
                        ? "text-emerald-700"
                        : claim.status === "CANCELLED_BY_ADMIN"
                          ? "text-rose-700"
                          : "text-amber-700"
                    }`}
                  >
                    狀態：
                    {claim.status === "CONFIRMED"
                      ? "團主已確認"
                      : claim.status === "CANCELLED_BY_ADMIN"
                        ? "團主已取消"
                        : "已喊單，待團主確認"}
                  </p>
                </div>
              );
            })}
          </div>
          {bindingRows.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <p className="font-semibold">綁物分配</p>
              {bindingRows.map((binding) => (
                <p key={binding.id}>- {binding.productName}（{binding.reason}）</p>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card p-5">
          <h3 className="text-lg font-bold text-slate-900">結帳與物流</h3>
          <p className="mt-1 text-sm text-slate-600">目前應付：{twd(totalAmount)}</p>
          <p className="text-xs text-slate-500">取貨率 {system.currentUser.pickupRate}% 低於 90% 或金額超過 300 元會隱藏貨到付款。</p>

          <div className="mt-3 space-y-3 text-sm">
            <label className="block">
              付款方式
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
              >
                {paymentOptions.map((method) => (
                  <option key={method} value={method} disabled={!availableMethods.includes(method)}>
                    {paymentLabel[method]}
                    {!availableMethods.includes(method) ? "（不可用）" : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              末五碼
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                placeholder="例如 12345"
                value={lastFiveCode}
                onChange={(event) => setLastFiveCode(event.target.value)}
              />
            </label>

            <button
              onClick={() => {
                const result = system.submitPayment(activeCampaignId, paymentMethod, lastFiveCode);
                setFeedback(result.message);
              }}
              className="w-full rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700"
              type="button"
            >
              提交付款資訊
            </button>
          </div>

          <div className="mt-5 space-y-3 border-t border-slate-200 pt-4 text-sm">
            <p className="font-semibold text-slate-800">賣貨便寄件資料</p>
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="收件人"
              value={receiverName}
              onChange={(event) => setReceiverName(event.target.value)}
            />
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="電話"
              value={receiverPhone}
              onChange={(event) => setReceiverPhone(event.target.value)}
            />
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="門市代碼"
              value={receiverStoreCode}
              onChange={(event) => setReceiverStoreCode(event.target.value)}
            />
            <button
              className="w-full rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-700"
              type="button"
              onClick={() => {
                const result = system.createShipment({
                  campaignId: activeCampaignId,
                  receiverName,
                  receiverPhone,
                  receiverStoreCode,
                  paymentMethod,
                });
                setFeedback(result.message);
              }}
            >
              儲存物流資料
            </button>
          </div>

          {feedback && <p className="mt-3 text-sm font-semibold text-slate-700">{feedback}</p>}
        </div>
      </section>
    </div>
  );
}
