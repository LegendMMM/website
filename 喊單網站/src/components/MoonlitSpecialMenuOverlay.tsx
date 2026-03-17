import { useEffect, useMemo, useState } from "react";
import kaguyaLogoHeader from "../assets/kaguya-logo-header.webp";
import tsukimiYachiyoImage from "../assets/tsukimi-yachiyo.webp";
import "../styles/moonlit-special-menu-overlay.css";

type MenuTheme = "light" | "dark";
type SiteMenuView = "home" | "campaign" | "blindBox" | "cart" | "me";

interface MenuEntry {
  id: string;
  zhLabel: string;
  active?: boolean;
  onSelect: () => void;
}

interface FeaturedCharacter {
  image: string;
  name: string;
  description: string;
  backdropWord: string;
}

interface MoonlitSpecialMenuOverlayProps {
  theme?: MenuTheme;
  currentView: SiteMenuView;
  isAdmin: boolean;
  onGoHome: () => void;
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

export default function MoonlitSpecialMenuOverlay(props: MoonlitSpecialMenuOverlayProps): JSX.Element {
  const {
    theme = "light",
    currentView,
    isAdmin,
    onGoHome,
    onGoCart,
    onGoMe,
    onGoAdmin,
    onLogout,
  } = props;

  const [menuOpen, setMenuOpen] = useState(false);
  const [overlayMounted, setOverlayMounted] = useState(false);
  const [activeItem, setActiveItem] = useState<string>(currentView);
  const featuredCharacter: FeaturedCharacter = {
    image: tsukimiYachiyoImage,
    name: "月見八千代",
    description: "月夜特設站展示角色。",
    backdropWord: "YACHIYO",
  };

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
        zhLabel: "首頁",
        active: currentView === "home",
        onSelect: onGoHome,
      },
      {
        id: "cart",
        zhLabel: "購物清單",
        active: currentView === "cart",
        onSelect: onGoCart,
      },
      {
        id: "me",
        zhLabel: "個人主頁",
        active: currentView === "me",
        onSelect: onGoMe,
      },
    ];

    if (isAdmin && onGoAdmin) {
      baseEntries.push({
        id: "admin",
        zhLabel: "管理後台",
        onSelect: onGoAdmin,
      });
    }

    baseEntries.push({
      id: "logout",
      zhLabel: "登出站點",
      onSelect: onLogout,
    });

    return baseEntries;
  }, [
    currentView,
    isAdmin,
    onGoAdmin,
    onGoCart,
    onGoHome,
    onGoMe,
    onLogout,
  ]);

  const currentEntry = useMemo(
    () => entries.find((entry) => entry.id === activeItem) ?? entries.find((entry) => entry.active) ?? entries[0],
    [activeItem, entries],
  );

  const handleSelect = (entry: MenuEntry): void => {
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
                <div className="moonlit-menu-stage-visual" aria-hidden="true">
                  <span className="moonlit-menu-stage-wordmark">{featuredCharacter.backdropWord}</span>
                  <img src={featuredCharacter.image} alt={featuredCharacter.name} className="moonlit-menu-character-image" />
                </div>

                <div className="moonlit-menu-character-profile">
                  <span className="moonlit-menu-character-kicker">CHARACTER</span>
                  <strong>{featuredCharacter.name}</strong>
                  <p>{featuredCharacter.description}</p>
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
                        className={`moonlit-menu-nav-item ${isActive ? "is-active" : ""}`}
                        style={{ animationDelay: `${120 + index * 55}ms` }}
                        onMouseEnter={() => setActiveItem(entry.id)}
                        onFocus={() => setActiveItem(entry.id)}
                        onClick={() => handleSelect(entry)}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <span className="moonlit-menu-nav-vertical">{entry.zhLabel}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
