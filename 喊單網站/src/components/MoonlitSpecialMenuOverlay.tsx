import { useEffect, useMemo, useState } from "react";
import kaguyaLogoHeader from "../assets/kaguya-logo-header.webp";
import "../styles/moonlit-special-menu-overlay.css";

type MenuTheme = "light" | "dark";
type SiteMenuView = "home" | "campaign" | "blindBox" | "cart" | "me";
type MenuAccent = "sky" | "pink" | "gold";

interface MenuEntry {
  id: string;
  zhLabel: string;
  enLabel: string;
  accent: MenuAccent;
  active?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

interface MoonlitSpecialMenuOverlayProps {
  theme?: MenuTheme;
  currentView: SiteMenuView;
  campaignCount: number;
  cartCount: number;
  orderCount: number;
  pendingClaims: number;
  isAdmin: boolean;
  hasCampaign: boolean;
  hasBlindBox: boolean;
  onGoHome: () => void;
  onGoCampaign: () => void;
  onGoBlindBox: () => void;
  onGoCart: () => void;
  onGoMe: () => void;
  onGoAdmin?: () => void;
  onLogout: () => void;
}

function StarIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="moonlit-menu-icon-svg">
      <path d="M12 2.8l2.18 5.2 5.62.48-4.28 3.74 1.28 5.58L12 14.92 7.2 17.8l1.28-5.58L4.2 8.48l5.62-.48L12 2.8Z" />
    </svg>
  );
}

function MenuIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="moonlit-menu-icon-svg">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function CloseIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="moonlit-menu-icon-svg">
      <path d="M6 6 18 18M18 6 6 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function AccentOrb(props: { accent: MenuAccent }): JSX.Element {
  return <span className={`moonlit-menu-nav-orb moonlit-menu-nav-orb-${props.accent}`} aria-hidden="true" />;
}

export default function MoonlitSpecialMenuOverlay(props: MoonlitSpecialMenuOverlayProps): JSX.Element {
  const {
    theme = "light",
    currentView,
    campaignCount,
    cartCount,
    orderCount,
    pendingClaims,
    isAdmin,
    hasCampaign,
    hasBlindBox,
    onGoHome,
    onGoCampaign,
    onGoBlindBox,
    onGoCart,
    onGoMe,
    onGoAdmin,
    onLogout,
  } = props;

  const [menuOpen, setMenuOpen] = useState(false);
  const [overlayMounted, setOverlayMounted] = useState(false);
  const [activeItem, setActiveItem] = useState<string>(currentView);

  useEffect(() => {
    setActiveItem(currentView);
  }, [currentView]);

  useEffect(() => {
    if (menuOpen) {
      setOverlayMounted(true);
      return undefined;
    }

    if (!overlayMounted) return undefined;
    const timer = window.setTimeout(() => setOverlayMounted(false), 360);
    return () => window.clearTimeout(timer);
  }, [menuOpen, overlayMounted]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeydown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [menuOpen]);

  const entries = useMemo<MenuEntry[]>(() => {
    const baseEntries: MenuEntry[] = [
      {
        id: "home",
        zhLabel: "首頁導覽",
        enLabel: "HOME",
        accent: "pink",
        active: currentView === "home",
        onSelect: onGoHome,
      },
      {
        id: "campaign",
        zhLabel: "活動頁面",
        enLabel: "CAMPAIGN",
        accent: "sky",
        active: currentView === "campaign",
        disabled: !hasCampaign,
        onSelect: onGoCampaign,
      },
      {
        id: "blindBox",
        zhLabel: "盲盒拆分",
        enLabel: "BLIND BOX",
        accent: "gold",
        active: currentView === "blindBox",
        disabled: !hasBlindBox,
        onSelect: onGoBlindBox,
      },
      {
        id: "cart",
        zhLabel: "購物清單",
        enLabel: `CART ${cartCount}`,
        accent: "sky",
        active: currentView === "cart",
        onSelect: onGoCart,
      },
      {
        id: "me",
        zhLabel: "個人主頁",
        enLabel: "PROFILE",
        accent: "gold",
        active: currentView === "me",
        onSelect: onGoMe,
      },
    ];

    if (isAdmin && onGoAdmin) {
      baseEntries.push({
        id: "admin",
        zhLabel: "管理後台",
        enLabel: "ADMIN",
        accent: "pink",
        onSelect: onGoAdmin,
      });
    }

    baseEntries.push({
      id: "logout",
      zhLabel: "登出站點",
      enLabel: "SIGN OUT",
      accent: "pink",
      onSelect: onLogout,
    });

    return baseEntries;
  }, [
    cartCount,
    currentView,
    hasBlindBox,
    hasCampaign,
    isAdmin,
    onGoAdmin,
    onGoBlindBox,
    onGoCampaign,
    onGoCart,
    onGoHome,
    onGoMe,
    onLogout,
  ]);

  const currentEntry = useMemo(
    () => entries.find((entry) => entry.id === activeItem) ?? entries.find((entry) => entry.active) ?? entries[0],
    [activeItem, entries],
  );

  const tickerMessage = `目前可進活動 ${campaignCount} 檔，購物車 ${cartCount} 件，已下單 ${orderCount} 筆，待審喊單 ${pendingClaims} 筆。`;

  const handleSelect = (entry: MenuEntry): void => {
    if (entry.disabled) return;
    entry.onSelect();
    setMenuOpen(false);
  };

  return (
    <div className={`moonlit-menu-shell moonlit-menu-shell-${theme}`}>
      <header className="moonlit-menu-bar">
        <div className="moonlit-menu-bar-inner">
          <div className="moonlit-menu-brand">
            <span className="moonlit-menu-brand-icon">
              <StarIcon />
            </span>
            <div className="moonlit-menu-brand-copy">
              <span className="moonlit-menu-brand-overline">TSUKUYOMI SPECIAL SITE</span>
              <strong className="moonlit-menu-brand-title">超時空輝耀姬 導覽選單</strong>
            </div>
          </div>

          <button
            type="button"
            className="moonlit-menu-trigger"
            aria-expanded={menuOpen}
            aria-controls="moonlit-special-menu-overlay"
            onClick={() => setMenuOpen(true)}
          >
            <span>MENU</span>
            <MenuIcon />
          </button>
        </div>
      </header>

      {overlayMounted && (
        <div
          id="moonlit-special-menu-overlay"
          className={`moonlit-menu-overlay ${menuOpen ? "is-open" : "is-closing"}`}
          role="dialog"
          aria-modal="true"
          aria-label="Special site navigation"
        >
          <div className="moonlit-menu-overlay-pattern" aria-hidden="true" />
          <div className="moonlit-menu-overlay-glow" aria-hidden="true" />

          <div className="moonlit-menu-overlay-shell">
            <header className="moonlit-menu-overlay-top">
              <img src={kaguyaLogoHeader} alt="超かぐや姫!" className="moonlit-menu-overlay-logo" />

              <button type="button" className="moonlit-menu-close" onClick={() => setMenuOpen(false)}>
                <span className="moonlit-menu-close-frame" aria-hidden="true" />
                <CloseIcon />
                <span>CLOSE</span>
              </button>
            </header>

            <section className="moonlit-menu-overlay-main">
              <div className="moonlit-menu-showcase">
                <span className="moonlit-menu-showcase-overline">PERSONAL SPECIAL SITE</span>
                <h2 className="moonlit-menu-showcase-title">超時空輝耀姬</h2>
                <p className="moonlit-menu-showcase-copy">
                  月夜特設站導覽。從這裡切換首頁、活動頁、盲盒拆分與購物清單，不再是一般後台導航。
                </p>

                <div className="moonlit-menu-stage-visual" aria-hidden="true">
                  <span className="moonlit-menu-stage-wordmark">KAGUYA</span>
                  <div className="moonlit-menu-stage-disc">
                    <div className="moonlit-menu-stage-disc-core" />
                    <div className="moonlit-menu-stage-disc-ring moonlit-menu-stage-disc-ring-a" />
                    <div className="moonlit-menu-stage-disc-ring moonlit-menu-stage-disc-ring-b" />
                    <div className="moonlit-menu-stage-disc-band moonlit-menu-stage-disc-band-a" />
                    <div className="moonlit-menu-stage-disc-band moonlit-menu-stage-disc-band-b" />
                    <span className="moonlit-menu-stage-star moonlit-menu-stage-star-a" />
                    <span className="moonlit-menu-stage-star moonlit-menu-stage-star-b" />
                    <span className="moonlit-menu-stage-star moonlit-menu-stage-star-c" />
                  </div>
                </div>

                <div className="moonlit-menu-profile-bar">
                  <span>PROFILE</span>
                  <strong>月夜特設站 / 日系視覺 / 流程重構</strong>
                </div>
              </div>

              <div className="moonlit-menu-nav-zone">
                <div className="moonlit-menu-nav-rail" aria-hidden="true" />
                <div className="moonlit-menu-nav-list">
                  {entries.map((entry, index) => {
                    const isActive = entry.id === currentEntry.id || entry.active;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        className={`moonlit-menu-nav-item ${isActive ? "is-active" : ""} ${entry.disabled ? "is-disabled" : ""}`}
                        style={{ animationDelay: `${120 + index * 55}ms` }}
                        onMouseEnter={() => setActiveItem(entry.id)}
                        onFocus={() => setActiveItem(entry.id)}
                        onClick={() => handleSelect(entry)}
                        disabled={entry.disabled}
                      >
                        <span className="moonlit-menu-nav-special">{isActive ? "SPECIAL" : ""}</span>
                        <span className="moonlit-menu-nav-vertical">{entry.zhLabel}</span>
                        <span className="moonlit-menu-nav-en">{entry.enLabel}</span>
                        <AccentOrb accent={entry.accent} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <footer className="moonlit-menu-ticker">
              <span className="moonlit-menu-ticker-pill">HOT NEWS</span>
              <span className="moonlit-menu-ticker-date">2026 03.17</span>
              <p>{tickerMessage}</p>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
