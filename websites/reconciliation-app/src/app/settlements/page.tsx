import { BadgeJapaneseYen } from "lucide-react";
import { generateSettlementAction, markSettlementPaidAction } from "@/app/actions";
import { AppShell } from "@/components/AppShell";
import { requireSession } from "@/lib/auth";
import { dateInputValue, decimal, feePolicyLabel, money, roleLabel, shortDate, statusLabel } from "@/lib/format";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

export default async function SettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string }>;
}) {
  const session = await requireSession();
  const dictionary = getDictionary(session.locale);
  const params = await searchParams;
  const settlements = await prisma.settlement.findMany({
    include: { entries: { include: { ledgerEntry: true } } },
    orderBy: { createdAt: "desc" },
  });
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  return (
    <AppShell session={session} title={dictionary.settlements}>
      <section className="grid two-column">
        <form action={generateSettlementAction} className="panel form-grid">
          <div className="span-2">
            <p className="eyebrow">Generate</p>
            <h2>{dictionary.generateSettlement}</h2>
          </div>
          {params.error === "empty" ? <p className="alert span-2">這個日期範圍沒有可結算的已確認項目。</p> : null}
          {params.created ? <p className="alert span-2">已建立結算單 {params.created}</p> : null}
          <label>
            <span>{dictionary.startDate}</span>
            <input name="startDate" required type="date" defaultValue={dateInputValue(monthStart)} />
          </label>
          <label>
            <span>{dictionary.endDate}</span>
            <input name="endDate" required type="date" defaultValue={dateInputValue(today)} />
          </label>
          <label className="span-2">
            <span>{dictionary.feePolicy}</span>
            <select name="feePolicy" defaultValue="SENDER">
              <option value="SENDER">{dictionary.senderPays}</option>
              <option value="RECEIVER">{dictionary.receiverPays}</option>
              <option value="SPLIT">{dictionary.splitFee}</option>
            </select>
          </label>
          <div className="form-actions span-2">
            <button className="primary-button" type="submit">
              <BadgeJapaneseYen size={17} />
              {dictionary.generateSettlement}
            </button>
          </div>
        </form>

        <div className="panel">
          <p className="eyebrow">Rules</p>
          <h2>結算規則</h2>
          <p className="small-text">
            系統只會納入「已確認」且尚未被其他結算單收錄的交易。結算幣別固定為 JPY，TWD 會使用 Wise 設定頁的固定匯率換算。
          </p>
        </div>
      </section>

      <section style={{ marginTop: 18 }}>
        <div className="section-title">
          <div>
            <p className="eyebrow">History</p>
            <h2>{dictionary.settlements}</h2>
          </div>
        </div>
        <div className="table-list">
          {settlements.length === 0 ? <p className="empty">{dictionary.noData}</p> : null}
          {settlements.map((settlement) => (
            <article className="settlement-card" key={settlement.id}>
              <div className="settlement-head">
                <div>
                  <h3>{settlement.code}</h3>
                  <p className="entry-meta">
                    {shortDate(settlement.startDate)} - {shortDate(settlement.endDate)} · {settlement.entries.length} 筆 · {feePolicyLabel(settlement.wiseFeePolicy)}
                  </p>
                </div>
                <span className={`badge ${settlement.status.toLowerCase()}`}>{statusLabel(settlement.status)}</span>
              </div>
              <div className="line-summary">
                <span>
                  {dictionary.suggestedPayment}:{" "}
                  {settlement.payerRole && settlement.payeeRole
                    ? `${roleLabel(settlement.payerRole)} → ${roleLabel(settlement.payeeRole)}`
                    : "不需付款"}
                </span>
                <span>{dictionary.grossJpy}: {money(decimal(settlement.grossAmountJpy), "JPY")}</span>
                <span>{dictionary.estimatedFee}: {money(decimal(settlement.estimatedFeeJpy), "JPY")}</span>
                <span>{dictionary.totalDue}: {money(decimal(settlement.totalDueJpy), "JPY")}</span>
              </div>
              {settlement.status !== "PAID" && session.role === "ADMIN" ? (
                <form action={markSettlementPaidAction} className="form-grid">
                  <input type="hidden" name="id" value={settlement.id} />
                  <label>
                    <span>實際匯款 JPY</span>
                    <input name="actualTransferJpy" type="number" min="0" defaultValue={decimal(settlement.totalDueJpy)} />
                  </label>
                  <label>
                    <span>實際 Wise 手續費 JPY</span>
                    <input name="actualWiseFeeJpy" type="number" min="0" defaultValue={decimal(settlement.estimatedFeeJpy)} />
                  </label>
                  <div className="form-actions span-2">
                    <button className="secondary-button" type="submit">標記已付款</button>
                  </div>
                </form>
              ) : settlement.status !== "PAID" ? (
                <p className="small-text">等待管理員記錄實際付款。</p>
              ) : (
                <p className="small-text">
                  已付款：{money(decimal(settlement.actualTransferJpy), "JPY")}，實際手續費 {money(decimal(settlement.actualWiseFeeJpy), "JPY")}
                </p>
              )}
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
