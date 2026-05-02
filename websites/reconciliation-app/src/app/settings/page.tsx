import { updateSettingsAction } from "@/app/actions";
import { AppShell } from "@/components/AppShell";
import { requireSession } from "@/lib/auth";
import { decimal } from "@/lib/format";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const session = await requireSession();
  const dictionary = getDictionary(session.locale);
  const params = await searchParams;
  const settings = await prisma.exchangeFeeSetting.findUnique({ where: { id: "default" } });
  const canEdit = session.role === "ADMIN";

  return (
    <AppShell session={session} title={dictionary.settings}>
      <form action={updateSettingsAction} className="panel form-grid wide-form">
        <div className="span-2">
          <p className="eyebrow">Wise</p>
          <h2>{dictionary.settings}</h2>
          {params.saved ? <p className="alert">已儲存 Wise 與匯率設定。</p> : null}
          {!canEdit ? <p className="alert">只有管理員可以修改設定。</p> : null}
        </div>
        <label>
          <span>{dictionary.jpyPerTwd}</span>
          <input name="jpyPerTwd" type="number" min="0" step="0.000001" defaultValue={decimal(settings?.jpyPerTwd ?? 4.85)} disabled={!canEdit} />
        </label>
        <label>
          <span>{dictionary.wiseFixedFee}</span>
          <input name="wiseFixedFeeJpy" type="number" min="0" step="1" defaultValue={decimal(settings?.wiseFixedFeeJpy ?? 120)} disabled={!canEdit} />
        </label>
        <label>
          <span>{dictionary.wisePercentFee}</span>
          <input name="wisePercentFee" type="number" min="0" step="0.000001" defaultValue={decimal(settings?.wisePercentFee ?? 0.007)} disabled={!canEdit} />
        </label>
        <div className="form-actions span-2">
          <button className="primary-button" type="submit" disabled={!canEdit}>{dictionary.save}</button>
        </div>
      </form>
    </AppShell>
  );
}
