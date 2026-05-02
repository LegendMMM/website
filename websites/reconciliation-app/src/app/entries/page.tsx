import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { requireSession } from "@/lib/auth";
import { decimal, feePolicyLabel, money, roleLabel, shortDate, statusLabel, typeLabel } from "@/lib/format";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

export default async function EntriesPage() {
  const session = await requireSession();
  const dictionary = getDictionary(session.locale);
  const entries = await prisma.ledgerEntry.findMany({
    include: { lineItems: true, createdBy: true, confirmedBy: true, settlementLinks: true },
    orderBy: { entryDate: "desc" },
  });

  return (
    <AppShell session={session} title={dictionary.entries}>
      <div className="section-title">
        <div>
          <p className="eyebrow">Ledger</p>
          <h2>{dictionary.entries}</h2>
        </div>
        <Link className="primary-button" href="/entries/new">
          <PlusCircle size={17} />
          {dictionary.newEntry}
        </Link>
      </div>
      <div className="table-list">
        {entries.length === 0 ? <p className="empty">{dictionary.noData}</p> : null}
        {entries.map((entry) => (
          <article className="entry-card" key={entry.id}>
            <div className="entry-head">
              <div>
                <h3>{entry.title}</h3>
                <p className="entry-meta">
                  {shortDate(entry.entryDate)} · {typeLabel(entry.type)} · {entry.direction === "PARTNER_TO_ADMIN" ? dictionary.partnerToAdmin : dictionary.adminToPartner}
                </p>
              </div>
              <div className="inline-actions">
                {entry.settlementLinks.length > 0 ? <span className="badge confirmed">已入結算</span> : null}
                <span className={`badge ${entry.status.toLowerCase()}`}>{statusLabel(entry.status)}</span>
              </div>
            </div>
            <p className="line-summary">
              {entry.lineItems.map((item) => (
                <span key={item.id}>
                  {item.label}: {money(decimal(item.amount), item.currency)}
                </span>
              ))}
            </p>
            <p className="entry-meta">
              建立：{entry.createdBy.name} ({roleLabel(entry.createdBy.role)}) · 手續費：{feePolicyLabel(entry.wiseFeePolicy)}
              {entry.confirmedBy ? ` · 確認：${entry.confirmedBy.name}` : ""}
              {entry.trackingCode ? ` · 追蹤：${entry.trackingCode}` : ""}
              {entry.externalRef ? ` · 編號：${entry.externalRef}` : ""}
            </p>
            {entry.note ? <p className="small-text">{entry.note}</p> : null}
            {entry.rejectionReason ? <p className="alert">{entry.rejectionReason}</p> : null}
          </article>
        ))}
      </div>
    </AppShell>
  );
}
