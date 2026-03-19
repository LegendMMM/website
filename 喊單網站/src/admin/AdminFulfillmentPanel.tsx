import { useEffect, useMemo, useState } from "react";
import type { UseOrderSystemReturn } from "../hooks/useOrderSystem";
import { downloadTextFile } from "../lib/download";
import { formatDate, orderStatusLabel, paymentLabel, twd } from "../lib/format";
import type { OrderStatus } from "../types/domain";

const orderStatusOptions: OrderStatus[] = ["PLACED", "PAID", "CANCELLED"];

export function AdminFulfillmentPanel(props: {
  system: UseOrderSystemReturn;
  onFeedback: (message: string) => void;
}): JSX.Element {
  const { system, onFeedback } = props;
  const [exportCampaignId, setExportCampaignId] = useState(system.state.campaigns[0]?.id ?? "");

  useEffect(() => {
    if (!system.state.campaigns.length) {
      setExportCampaignId("");
      return;
    }
    if (!exportCampaignId || !system.state.campaigns.some((item) => item.id === exportCampaignId)) {
      setExportCampaignId(system.state.campaigns[0].id);
    }
  }, [exportCampaignId, system.state.campaigns]);

  const userById = useMemo(() => new Map(system.state.users.map((user) => [user.id, user])), [system.state.users]);
  const campaignById = useMemo(
    () => new Map(system.state.campaigns.map((campaign) => [campaign.id, campaign])),
    [system.state.campaigns],
  );
  const productById = useMemo(() => new Map(system.state.products.map((product) => [product.id, product])), [system.state.products]);
  const blindItemById = useMemo(
    () => new Map(system.state.blindBoxItems.map((item) => [item.id, item])),
    [system.state.blindBoxItems],
  );
  const orderItemsByOrderId = useMemo(() => {
    const map = new Map<string, typeof system.state.orderItems>();
    system.state.orderItems.forEach((item) => {
      const existing = map.get(item.orderId);
      if (existing) {
        existing.push(item);
        return;
      }
      map.set(item.orderId, [item]);
    });
    return map;
  }, [system.state.orderItems]);

  const allOrders = useMemo(
    () => [...system.state.orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [system.state.orders],
  );
  const allPayments = useMemo(
    () => [...system.state.payments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [system.state.payments],
  );
  const allShipments = useMemo(
    () => [...system.state.shipments].sort((a, b) => a.campaignId.localeCompare(b.campaignId)),
    [system.state.shipments],
  );

  return (
    <section className="space-y-4">
      <div className="section-frame">
        <h3 className="text-lg font-bold text-slate-900">付款對帳</h3>
        <div className="mt-4 space-y-3">
          {allPayments.length === 0 && <p className="text-sm text-slate-500">目前沒有付款資料。</p>}
          {allPayments.map((payment) => {
            const campaign = campaignById.get(payment.campaignId);
            const user = userById.get(payment.userId);
            return (
              <article key={payment.id} className="row-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-bold text-slate-900">{campaign?.title ?? "未知活動"}</p>
                    <p className="text-xs text-slate-500">
                      會員：{user?.fbNickname ?? "未知會員"} / {formatDate(payment.createdAt)}
                    </p>
                    <p className="text-sm text-slate-700">
                      金額：{twd(payment.amount)} / 方式：{paymentLabel[payment.method]} / 末五碼：{payment.lastFiveCode}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                    onClick={() => {
                      const result = system.reconcilePayment(payment.id);
                      onFeedback(result.message);
                    }}
                    disabled={payment.reconciled}
                  >
                    {payment.reconciled ? "已對帳" : "標記對帳完成"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <div className="section-frame">
        <h3 className="text-lg font-bold text-slate-900">全站訂單</h3>
        <div className="mt-4 space-y-3">
          {allOrders.length === 0 && <p className="text-sm text-slate-500">目前沒有訂單。</p>}
          {allOrders.map((order) => {
            const campaign = campaignById.get(order.campaignId);
            const user = userById.get(order.userId);
            const items = orderItemsByOrderId.get(order.id) ?? [];
            return (
              <article key={order.id} className="row-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-bold text-slate-900">{campaign?.title ?? "未知活動"}</p>
                    <p className="text-xs text-slate-500">
                      訂單：{order.id.slice(0, 8)} / 會員：{user?.fbNickname ?? "未知會員"} / {formatDate(order.createdAt)}
                    </p>
                    <p className="text-sm font-semibold text-slate-700">總額：{twd(order.totalAmount)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {orderStatusOptions.map((status) => (
                      <button
                        key={status}
                        type="button"
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                          order.status === status ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200"
                        }`}
                        onClick={() => {
                          const result = system.adminUpdateOrderStatus(order.id, status);
                          onFeedback(result.message);
                        }}
                      >
                        {orderStatusLabel[status]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-3 space-y-1 text-sm text-slate-600">
                  {items.map((item) => {
                    const product = productById.get(item.productId);
                    const blindItem = item.blindBoxItemId ? blindItemById.get(item.blindBoxItemId) : null;
                    const label = blindItem
                      ? `${product?.name ?? "未知商品"} / ${blindItem.name}`
                      : product?.name ?? "未知商品";
                    return <p key={item.id}>- {label} x {item.qty}（{twd(item.unitPrice)}）</p>;
                  })}
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <div className="section-frame">
        <h3 className="text-lg font-bold text-slate-900">物流與賣貨便匯出</h3>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={exportCampaignId}
            onChange={(event) => setExportCampaignId(event.target.value)}
          >
            {system.state.campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>{campaign.title}</option>
            ))}
          </select>
          <button
            type="button"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            onClick={() => {
              const csv = system.exportMyShipCsv(exportCampaignId);
              downloadTextFile(`shipments-${exportCampaignId}.csv`, csv, "text/csv;charset=utf-8");
              onFeedback("已匯出賣貨便 CSV。");
            }}
            disabled={!exportCampaignId}
          >
            匯出指定活動 CSV
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {allShipments.length === 0 && <p className="text-sm text-slate-500">目前沒有物流資料。</p>}
          {allShipments.map((shipment) => {
            const campaign = campaignById.get(shipment.campaignId);
            const user = userById.get(shipment.userId);
            return (
              <article key={shipment.id} className="row-card">
                <p className="text-base font-bold text-slate-900">{campaign?.title ?? "未知活動"}</p>
                <p className="text-xs text-slate-500">
                  會員：{user?.fbNickname ?? "未知會員"} / 付款：{paymentLabel[shipment.paymentMethod]} / 可 COD：{shipment.canUseCod ? "是" : "否"}
                </p>
                <p className="text-sm text-slate-700">
                  收件：{shipment.receiverName} / {shipment.receiverPhone} / 門市：{shipment.receiverStoreCode}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
