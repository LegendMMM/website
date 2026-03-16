import { useEffect, useMemo, useState } from "react";
import "../styles/moonlit-special-menu-overlay.css";

type MenuTheme = "light" | "dark";
type SiteMenuView = "home" | "campaign" | "blindBox" | "cart" | "me";
type MenuAccent = "sky" | "pink" | "gold";

interface MenuTile {
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
      <path d="M6 6 18 18M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function TileOrb(props: { accent: MenuAccent }): JSX.Element {
  return <span className={`moonlit-menu-tile-orb moonlit-menu-tile-orb-${props.accent}`} aria-hidden="true" />;
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

  const tiles = useMemo<MenuTile[]>(() => {
    const baseTiles: MenuTile[] = [
      {
        id: "home",
        zhLabel: "首頁導覽",
        enLabel: "HOME",
        accent: "gold",
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
        accent: "pink",
        active: currentView === "blindBox",
        disabled: !hasBlindBox,
        onSelect: onGoBlindBox,
      },
      {
        id: "cart",
        zhLabel: "購物清單",
        enLabel: `CART ${cartCount}`,
        accent: "gold",
        active: currentView === "cart",
        onSelect: onGoCart,
      },
      {
        id: "me",
        zhLabel: "個人主頁",
        enLabel: "PROFILE",
        accent: "sky",
        active: currentView === "me",
        onSelect: onGoMe,
      },
    ];

    if (isAdmin && onGoAdmin) {
      baseTiles.push({
        id: "admin",
        zhLabel: "管理後台",
        enLabel: "ADMIN",
        accent: "pink",
        onSelect: onGoAdmin,
      });
    }

    baseTiles.push({
      id: "logout",
      zhLabel: "登出站點",
      enLabel: "SIGN OUT",
      accent: "pink",
      onSelect: onLogout,
    });

    return baseTiles;
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

  const activeTile = useMemo(
    () => tiles.find((item) => item.id === activeItem) ?? tiles.find((item) => item.active) ?? tiles[0],
    [activeItem, tiles],
  );

  const tickerMessage = `目前可進活動 ${campaignCount} 檔，購物車 ${cartCount} 件，已下單 ${orderCount} 筆，待審喊單 ${pendingClaims} 筆。`;

  const handleSelect = (tile: MenuTile): void => {
    if (tile.disabled) return;
    tile.onSelect();
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
          <div className="moonlit-menu-overlay-glow" aria-hidden="true" />
          <div className="moonlit-menu-overlay-shell">
            <header className="moonlit-menu-overlay-header">
              <div className="moonlit-menu-overlay-heading">
                <span className="moonlit-menu-overlay-overline">PERSONAL SPECIAL SITE</span>
                <h2>個人專題展示頁</h2>
              </div>

              <button type="button" className="moonlit-menu-close" onClick={() => setMenuOpen(false)}>
                <span>CLOSE</span>
                <CloseIcon />
              </button>
            </header>

            <section className="moonlit-menu-overlay-main">
              <div className="moonlit-menu-visual-column">
                <div className="moonlit-menu-visual-stage" aria-hidden="true">
                  <div className="moonlit-menu-moon-core" />
                  <div className="moonlit-menu-moon-ring moonlit-menu-moon-ring-a" />
                  <div className="moonlit-menu-moon-ring moonlit-menu-moon-ring-b" />
                  <div className="moonlit-menu-moon-ribbon moonlit-menu-moon-ribbon-a" />
                  <div className="moonlit-menu-moon-ribbon moonlit-menu-moon-ribbon-b" />
                  <span className="moonlit-menu-star moonlit-menu-star-a" />
                  <span className="moonlit-menu-star moonlit-menu-star-b" />
                  <span className="moonlit-menu-star moonlit-menu-star-c" />
                  <span className="moonlit-menu-star moonlit-menu-star-d" />
                </div>

                <div className="moonlit-menu-profile-pill">
                  <span>月夜特設站</span>
                  <span>日系視覺</span>
                  <span>流程重構</span>
                </div>
              </div>

              <div className="moonlit-menu-tile-column">
                <div className="moonlit-menu-tile-grid">
                  {tiles.map((tile) => {
                    const isActive = tile.id === activeTile.id || tile.active;
                    return (
                      <button
                        key={tile.id}
                        type="button"
                        className={`moonlit-menu-tile ${isActive ? "is-active" : ""} ${tile.disabled ? "is-disabled" : ""}`}
                        onMouseEnter={() => setActiveItem(tile.id)}
                        onFocus={() => setActiveItem(tile.id)}
                        onClick={() => handleSelect(tile)}
                        disabled={tile.disabled}
                      >
                        <span className="moonlit-menu-tile-icon">
                          <TileOrb accent={tile.accent} />
                        </span>
                        <span className="moonlit-menu-tile-zh">{tile.zhLabel}</span>
                        <span className="moonlit-menu-tile-en">{tile.enLabel}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <footer className="moonlit-menu-ticker">
              <span className="moonlit-menu-ticker-pill">HOT NEWS</span>
              <p>{tickerMessage}</p>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
