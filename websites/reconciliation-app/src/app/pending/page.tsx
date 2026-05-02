import { AppShell } from "@/components/AppShell";
import { confirmLedgerEntryAction, rejectLedgerEntryAction } from "@/app/actions";
import { requireSession } from "@/lib/auth";
import { decimal, money, roleLabel, shortDate, typeLabel } from "@/lib/format";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

export default async function PendingPage() {
  const session = await requireSession();
  const dictionary = getDictionary(session.locale);
  const entries = await prisma.ledgerEntry.findMany({
    where: { status: "PENDING" },
    include: { lineItems: true, createdBy: true },
    orderBy: { entryDate: "asc" },
  });

  return (
    <AppShell session={session} title={dictionary.pending}>
      <div className="table-list">
        {entries.length === 0 ? <p className="empty">{dictionary.noData}</p> : null}
        {entries.map((entry) => {
          const isOwn = entry.createdById === session.id;
          return (
            <article className="entry-card" key={entry.id}>
              <div className="entry-head">
                <div>
                  <h3>{entry.title}</h3>
                  <p className="entry-meta">
                    {shortDate(entry.entryDate)} · {typeLabel(entry.type)} · 建立：{entry.createdBy.name} ({roleLabel(entry.createdBy.role)})
                  </p>
                </div>
                <span className="badge pending">{dictionary.pendingStatus}</span>
              </div>
              <p className="line-summary">
                {entry.lineItems.map((item) => (
                  <span key={item.id}>
                    {item.label}: {money(decimal(item.amount), item.currency)}
                  </span>
                ))}
              </p>
              {isOwn ? (
                <p className="small-text">這筆由你建立，需要對方登入後確認。</p>
              ) : (
                <div className="inline-actions">
                  <form action={confirmLedgerEntryAction}>
                    <input type="hidden" name="id" value={entry.id} />
                    <button className="primary-button" type="submit">{dictionary.confirm}</button>
                  </form>
                  <form action={rejectLedgerEntryAction} className="reject-form">
                    <input type="hidden" name="id" value={entry.id} />
                    <input name="reason" placeholder={dictionary.rejectReason} />
                    <button className="danger-button" type="submit">{dictionary.reject}</button>
                  </form>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </AppShell>
  );
}
