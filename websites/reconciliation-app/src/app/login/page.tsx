import { ArrowRight, LockKeyhole } from "lucide-react";
import { getSession } from "@/lib/auth";
import { loginAction } from "@/app/actions";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  const params = await searchParams;

  if (session) {
    redirect("/");
  }

  return (
    <main className="login-screen">
      <section className="login-panel">
        <div className="login-brand">
          <span className="brand-mark">W</span>
          <div>
            <p className="eyebrow">Wise reconciliation</p>
            <h1>雙方對帳</h1>
          </div>
        </div>
        <p className="login-copy">記錄寄貨、轉帳與調整項目，雙方確認後再產生互抵結算單。</p>
        {params.error ? <p className="alert">帳號或密碼不正確。</p> : null}
        <form action={loginAction} className="login-form">
          <label>
            <span>Email</span>
            <input name="email" required type="email" autoComplete="email" />
          </label>
          <label>
            <span>密碼</span>
            <input name="password" required type="password" autoComplete="current-password" />
          </label>
          <button className="primary-button" type="submit">
            <LockKeyhole size={17} />
            登入
            <ArrowRight size={17} />
          </button>
        </form>
      </section>
    </main>
  );
}
