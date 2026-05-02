import Link from "next/link";
import { ArrowRightLeft, CheckCircle2, ReceiptText, WalletCards } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { requireSession } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { decimal, money, roleLabel, shortDate, statusLabel, typeLabel } from "@/lib/format";
import { calculateSettlementSummary, type SettlementLineItem } from "@/lib/settlement";

export default async function DashboardPage() {
  const session = await requireSession();
  const dictionary = getDictionary(session.locale);
  const [pendingCount, confirmedEntries, settings, recentEntries, recentSettlements] = await Promise.all([
    prisma.ledgerEntry.count({ where: { status: "PENDING" } }),
    prisma.ledgerEntry.findMany({
      where: { status: "CONFIRMED", settlementLinks: { none: {} } },
      include: { lineItems: true },
    }),
    prisma.exchangeFeeSetting.findUnique({ where: { id: "default" } }),
    prisma.ledgerEntry.findMany({
      include: { lineItems: true, createdBy: true },
      orderBy: { entryDate: "desc" },
      take: 5,
    }),
    prisma.settlement.findMany({
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
  ]);
  const calculationItems: SettlementLineItem[] = confirmedEntries.flatMap((entry) =>
    entry.lineItems.map((item) => ({
      id: item.id,
      amount: decimal(item.amount),
      currency: item.currency,
      direction: entry.direction,
      confirmed: true,
      settled: false,
    })),
  );
  const summary = calculateSettlementSummary(calculationItems, {
    jpyPerTwd: decimal(settings?.jpyPerTwd ?? 4.85),
    wiseFee: {
      fixedJpy: decimal(settings?.wiseFixedFeeJpy ?? 120),
      percent: decimal(settings?.wisePercentFee ?? 0.007),
    },
    feePolicy: "SENDER",
  });

  return (
    <AppShell session={session} title={dictionary.dashboard}>
      <section className="grid dashboard-grid">
        <Metric icon={<CheckCircle2 size={18} />} label="待確認項目" value={pendingCount} />
        <Metric icon={<ArrowRightLeft size={18} />} label="可結算筆數" value={confirmedEntries.length} />
        <Metric icon={<WalletCards size={18} />} label="目前淨額" value={money(summary.recommended.amountJpy, "JPY")} />
        <Metric icon={<ReceiptText size={18} />} label="近期結算單" value={recentSettlements.length} />
      </section>

      <section className="grid two-column" style={{ marginTop: 18 }}>
        <div className="panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">Ledger</p>
              <h2>{dictionary.entries}</h2>
            </div>
            <Link className="secondary-button" href="/entries">
              全部查看
            </Link>
          </div>
          <div className="table-list">
            {recentEntries.length === 0 ? <p className="empty">{dictionary.noData}</p> : null}
            {recentEntries.map((entry) => (
              <article className="entry-card" key={entry.id}>
                <div className="entry-head">
                  <div>
                    <h3>{entry.title}</h3>
                    <p className="entry-meta">
                      {shortDate(entry.entryDate)} · {typeLabel(entry.type)} · {roleLabel(entry.createdBy.role)}
                    </p>
                  </div>
                  <span className={`badge ${entry.status.toLowerCase()}`}>{statusLabel(entry.status)}</span>
                </div>
                <p className="line-summary">
                  {entry.lineItems.map((item) => (
                    <span key={item.id}>
                      {item.label}: {money(decimal(item.amount), item.currency)}
                    </span>
                  ))}
                </p>
              </article>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">Settlement</p>
              <h2>{dictionary.suggestedPayment}</h2>
            </div>
          </div>
          <div className="settlement-card">
            <div className="settlement-head">
              <h3>{summary.recommended.payer ? `${roleLabel(summary.recommended.payer)} → ${roleLabel(summary.recommended.payee!)}` : "目前互抵為 0"}</h3>
              <span className="badge confirmed">JPY</span>
            </div>
            <p className="small-text">使用固定匯率 {decimal(settings?.jpyPerTwd ?? 4.85)} JPY / TWD 估算。</p>
            <div className="line-summary">
              <span>{dictionary.grossJpy}: {money(summary.recommended.amountJpy, "JPY")}</span>
              <span>{dictionary.estimatedFee}: {money(summary.wiseFee.totalJpy, "JPY")}</span>
            </div>
            <Link className="primary-button" href="/settlements">
              {dictionary.generateSettlement}
            </Link>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="metric-card">
      <span className="line-summary">{icon} {label}</span>
      <strong>{value}</strong>
    </div>
  );
}
