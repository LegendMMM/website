import { useState } from "react";

interface AuthCardProps {
  onLogin: (email: string, password: string) => { ok: boolean; message: string };
  onRegister: (input: { email: string; password: string; fbNickname: string }) => { ok: boolean; message: string };
  onResetPassword: (email: string) => { ok: boolean; message: string };
}

type Mode = "login" | "register" | "forgot";

export function AuthCard({ onLogin, onRegister, onResetPassword }: AuthCardProps): JSX.Element {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fbNickname, setFbNickname] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const submit = () => {
    const result =
      mode === "login"
        ? onLogin(email, password)
        : mode === "register"
          ? onRegister({ email, password, fbNickname })
          : onResetPassword(email);

    setIsError(!result.ok);
    setMessage(result.message);
  };

  return (
    <div className="glass-card mx-auto w-full max-w-lg animate-rise p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">團主喊單帳本</p>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900">登入系統</h1>
      <p className="mt-2 text-sm text-slate-600">可用測試帳號：admin@example.com / Admin1234</p>

      <div className="mt-6 space-y-3">
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

        {mode !== "forgot" && (
          <label className="block text-sm font-semibold text-slate-700">
            密碼
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-accent-500 focus:outline-none"
              placeholder="至少 8 碼，含英文與數字"
              type="password"
            />
          </label>
        )}

        {mode === "register" && (
          <label className="block text-sm font-semibold text-slate-700">
            FB 暱稱 (必填)
            <input
              value={fbNickname}
              onChange={(event) => setFbNickname(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-accent-500 focus:outline-none"
              placeholder="方便團主核對身分"
              type="text"
            />
          </label>
        )}

        <button
          onClick={submit}
          className="w-full rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white transition hover:bg-slate-700"
          type="button"
        >
          {mode === "login" ? "登入" : mode === "register" ? "註冊" : "重設密碼"}
        </button>

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
        <button className="rounded-full border px-3 py-1" onClick={() => setMode("forgot")} type="button">
          忘記密碼
        </button>
      </div>
    </div>
  );
}
