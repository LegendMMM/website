import { changePasswordAction, createUserAction } from "@/app/actions";
import { AppShell } from "@/components/AppShell";
import { requireSession } from "@/lib/auth";
import { roleLabel } from "@/lib/format";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; password?: string; error?: string }>;
}) {
  const session = await requireSession();
  const dictionary = getDictionary(session.locale);
  const params = await searchParams;
  const users = await prisma.user.findMany({ orderBy: [{ role: "asc" }, { createdAt: "asc" }] });
  const canCreate = session.role === "ADMIN";

  return (
    <AppShell session={session} title={dictionary.accounts}>
      <section className="grid two-column">
        <form action={createUserAction} className="panel form-grid">
          <div className="span-2">
            <p className="eyebrow">Users</p>
            <h2>{dictionary.createAccount}</h2>
            {params.created ? <p className="alert">帳號已建立。</p> : null}
            {params.error ? <p className="alert">請填完整帳號資料，或確認 Email 沒有重複。</p> : null}
            {!canCreate ? <p className="alert">只有管理員可以建立帳號。</p> : null}
          </div>
          <label>
            <span>{dictionary.name}</span>
            <input name="name" disabled={!canCreate} required />
          </label>
          <label>
            <span>{dictionary.email}</span>
            <input name="email" disabled={!canCreate} required type="email" />
          </label>
          <label>
            <span>{dictionary.password}</span>
            <input name="password" disabled={!canCreate} required type="password" />
          </label>
          <label>
            <span>{dictionary.role}</span>
            <select name="role" disabled={!canCreate} defaultValue="PARTNER">
              <option value="PARTNER">{dictionary.partner}</option>
              <option value="ADMIN">{dictionary.admin}</option>
            </select>
          </label>
          <label className="span-2">
            <span>{dictionary.locale}</span>
            <select name="locale" disabled={!canCreate} defaultValue="JA">
              <option value="JA">{dictionary.ja}</option>
              <option value="ZH_TW">{dictionary.zhTw}</option>
            </select>
          </label>
          <div className="form-actions span-2">
            <button className="primary-button" type="submit" disabled={!canCreate}>{dictionary.createAccount}</button>
          </div>
        </form>

        <form action={changePasswordAction} className="panel form-grid">
          <div className="span-2">
            <p className="eyebrow">Security</p>
            <h2>{dictionary.changePassword}</h2>
            {params.password === "changed" ? <p className="alert">密碼已更新。</p> : null}
            {params.password === "invalid" ? <p className="alert">目前密碼不正確。</p> : null}
          </div>
          <label className="span-2">
            <span>目前密碼</span>
            <input name="currentPassword" required type="password" />
          </label>
          <label className="span-2">
            <span>新密碼</span>
            <input name="nextPassword" required type="password" />
          </label>
          <div className="form-actions span-2">
            <button className="secondary-button" type="submit">{dictionary.save}</button>
          </div>
        </form>
      </section>

      <section className="panel" style={{ marginTop: 18 }}>
        <div className="section-title">
          <div>
            <p className="eyebrow">Directory</p>
            <h2>{dictionary.accounts}</h2>
          </div>
        </div>
        <div className="table-list">
          {users.map((user) => (
            <article className="entry-card" key={user.id}>
              <div className="entry-head">
                <div>
                  <h3>{user.name}</h3>
                  <p className="entry-meta">{user.email}</p>
                </div>
                <span className="badge confirmed">{roleLabel(user.role)}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
