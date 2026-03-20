import { useState } from "react";

type ActionResult = { ok: boolean; message: string };
type MaybePromise<T> = T | Promise<T>;

interface AuthCardProps {
  onLogin: (identifier: string) => MaybePromise<ActionResult>;
  onRegister: (input: { email: string; fbNickname: string }) => MaybePromise<ActionResult>;
}

type Mode = "login" | "register";

export function AuthCard({
  onLogin,
  onRegister,
}: AuthCardProps): JSX.Element {
  const [mode, setMode] = useState<Mode>("login");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [fbNickname, setFbNickname] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const submit = async () => {
    const result =
      mode === "login"
        ? await Promise.resolve(onLogin(identifier))
        : await Promise.resolve(onRegister({ email, fbNickname }));

    setIsError(!result.ok);
    setMessage(result.message);
  };

  return (
    <div className="glass-card mx-auto w-full max-w-lg animate-rise p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Cosmic Princess Kaguya!</p>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900">姬你太美團員登入</h1>

      <div className="mt-6 space-y-3">
        {mode === "login" ? (
          <label className="block text-sm font-semibold text-slate-700">
            Email 或名字
            <input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-accent-500 focus:outline-none"
              placeholder="輸入 Email 或 FB 暱稱"
              type="text"
            />
          </label>
        ) : (
          <>
            <label className="block text-sm font-semibold text-slate-700">
              Email
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-accent-500 focus:outline-none"
                placeholder="you@example.com"
                type="email"
              />
            </label>

          <label className="block text-sm font-semibold text-slate-700">
            FB 暱稱
            <input
              value={fbNickname}
              onChange={(event) => setFbNickname(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-accent-500 focus:outline-none"
              placeholder="請填你的 FB 暱稱"
              type="text"
            />
          </label>
          </>
        )}

        <button
          onClick={submit}
          className="w-full rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white transition hover:bg-slate-700"
          type="button"
        >
          {mode === "login" ? "登入" : "寄送首次驗證信"}
        </button>

        {mode === "register" ? (
          <p className="text-xs leading-6 text-slate-500">
            第一次註冊會寄驗證信到你的 Email。帳號啟用後，之後就可以直接用 Email 或名字登入。
          </p>
        ) : (
          <p className="text-xs leading-6 text-slate-500">
            已啟用的帳號，之後可以直接輸入 Email 或名字登入，不需要再收驗證信。
          </p>
        )}

        {message && (
          <div
            className={`rounded-xl border px-4 py-2 text-sm ${
              isError
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {message}
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-2 text-sm">
        <button className="rounded-full border px-3 py-1" onClick={() => setMode("login")} type="button">
          已有帳號
        </button>
        <button className="rounded-full border px-3 py-1" onClick={() => setMode("register")} type="button">
          註冊
        </button>
      </div>
    </div>
  );
}
