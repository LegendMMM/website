import Link from "next/link";
import {
  ArrowLeftRight,
  CheckCircle2,
  Gauge,
  LogOut,
  PlusCircle,
  ReceiptText,
  Settings,
  Users,
} from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { logoutAction, updateLocaleAction } from "@/app/actions";

type AppShellProps = {
  session: SessionUser;
  children: React.ReactNode;
  title: string;
};

const navItems = [
  { href: "/", key: "dashboard", icon: Gauge },
  { href: "/entries", key: "entries", icon: ArrowLeftRight },
  { href: "/entries/new", key: "newEntry", icon: PlusCircle },
  { href: "/pending", key: "pending", icon: CheckCircle2 },
  { href: "/settlements", key: "settlements", icon: ReceiptText },
  { href: "/settings", key: "settings", icon: Settings },
  { href: "/accounts", key: "accounts", icon: Users },
] as const;

export function AppShell({ session, children, title }: AppShellProps) {
  const dictionary = getDictionary(session.locale);

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark">W</span>
          <span>
            <strong>{dictionary.appName}</strong>
            <small>Wise reconciliation v1</small>
          </span>
        </Link>
        <nav className="nav-list">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={String(dictionary[item.key])}
              icon={<item.icon size={18} strokeWidth={1.8} />}
            />
          ))}
        </nav>
      </aside>
      <main className="main-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">{session.role === "ADMIN" ? dictionary.admin : dictionary.partner}</p>
            <h1>{title}</h1>
          </div>
          <div className="topbar-actions">
            <form action={updateLocaleAction} className="compact-form">
              <input type="hidden" name="returnTo" value="/" />
              <select name="locale" defaultValue={session.locale} aria-label={dictionary.locale}>
                <option value="ZH_TW">{dictionary.zhTw}</option>
                <option value="JA">{dictionary.ja}</option>
              </select>
              <button className="icon-button" type="submit" title={dictionary.save}>
                <Settings size={16} />
              </button>
            </form>
            <div className="user-pill">
              <strong>{session.name}</strong>
              <span>{session.email}</span>
            </div>
            <form action={logoutAction}>
              <button className="icon-button" type="submit" title={dictionary.logout}>
                <LogOut size={18} />
              </button>
            </form>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

function NavLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link className="nav-link" href={href}>
      {icon}
      <span>{label}</span>
    </Link>
  );
}
