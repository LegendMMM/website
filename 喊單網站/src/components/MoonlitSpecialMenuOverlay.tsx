import { useEffect, useMemo, useState, type CSSProperties } from "react";
import heroKaguyaCenter from "../assets/hero-kaguya-center.png";
import heroKaguyaLeft from "../assets/hero-kaguya-left.png";
import heroKaguyaRight from "../assets/hero-kaguya-right.png";
import kaguyaLogoHeader from "../assets/kaguya-logo-header.webp";
import menuAkiraImage from "../assets/menu-characters/menu-akira.webp";
import menuFushiImage from "../assets/menu-characters/menu-fushi.webp";
import menuIrohaImage from "../assets/menu-characters/menu-iroha.webp";
import menuKaguyaImage from "../assets/menu-characters/menu-kaguya.webp";
import menuMamiImage from "../assets/menu-characters/menu-mami.webp";
import menuNoiImage from "../assets/menu-characters/menu-noi.webp";
import menuRaiImage from "../assets/menu-characters/menu-rai.webp";
import menuRokaImage from "../assets/menu-characters/menu-roka.webp";
import menuYachiyoImage from "../assets/menu-characters/menu-yachiyo.webp";
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
  backdropWord: string;
  desktopScale?: number;
  desktopShiftY?: string;
  mobileScale?: number;
  mobileShiftY?: string;
}

const WORDMARK_GROUP_COUNT = 2;
const WORDMARK_WORD_COUNT = 5;
const BRAND_PORTRAITS = [
  { src: heroKaguyaLeft, alt: "超時空輝耀姬角色頭像 1" },
  { src: heroKaguyaCenter, alt: "超時空輝耀姬角色頭像 2" },
  { src: heroKaguyaRight, alt: "超時空輝耀姬角色頭像 3" },
];

const FEATURED_CHARACTERS: FeaturedCharacter[] = [
  {
    image: menuKaguyaImage,
    name: "かぐや",
    backdropWord: "KAGUYA",
  },
  {
    image: menuIrohaImage,
    name: "酒寄彩葉",
    backdropWord: "IROHA",
  },
  {
    image: menuYachiyoImage,
    name: "月見ヤチヨ",
    backdropWord: "YACHIYO",
    desktopShiftY: "-4.8rem",
    mobileShiftY: "-2.4rem",
  },
  {
    image: menuAkiraImage,
    name: "帝アキラ",
    backdropWord: "AKIRA",
    desktopShiftY: "-3.2rem",
    mobileShiftY: "-1.6rem",
  },
  {
    image: menuNoiImage,
    name: "駒沢乃依",
    backdropWord: "NOI",
    desktopScale: 0.86,
    mobileScale: 0.9,
  },
  {
    image: menuRaiImage,
    name: "駒澤雷",
    backdropWord: "RAI",
    desktopScale: 0.82,
    mobileScale: 0.88,
  },
  {
    image: menuRokaImage,
    name: "綾紬芦花",
    backdropWord: "ROKA",
    desktopScale: 0.84,
    mobileScale: 0.9,
  },
  {
    image: menuMamiImage,
    name: "練山真實",
    backdropWord: "MAMI",
    desktopScale: 0.85,
    mobileScale: 0.9,
  },
  {
    image: menuFushiImage,
    name: "FUSHI",
    backdropWord: "FUSHI",
    desktopScale: 0.94,
    desktopShiftY: "-4.6rem",
    mobileScale: 0.96,
    mobileShiftY: "-2.6rem",
  },
];

function pickRandomCharacterIndex(previousIndex: number | null): number {
  if (FEATURED_CHARACTERS.length <= 1) return 0;

  let nextIndex = Math.floor(Math.random() * FEATURED_CHARACTERS.length);
  while (previousIndex !== null && nextIndex === previousIndex) {
    nextIndex = Math.floor(Math.random() * FEATURED_CHARACTERS.length);
  }

  return nextIndex;
}

interface MoonlitSpecialMenuOverlayProps {
  theme?: MenuTheme;
  currentView: SiteMenuView;
  isAdmin: boolean;
  isAuthenticated?: boolean;
  onGoHome: () => void;
  onGoCampaign?: () => void;
  onGoCart: () => void;
  onGoMe: () => void;
  onGoAdmin?: () => void;
  onOpenAuth?: () => void;
  onLogout: () => void;
}

function BrandPortraitOrb(): JSX.Element {
  const [activePortraitIndex] = useState<number>(() => Math.floor(Math.random() * BRAND_PORTRAITS.length));
  const activePortrait = BRAND_PORTRAITS[activePortraitIndex];

  return (
    <span className="moonlit-menu-brand-icon moonlit-menu-brand-icon-portrait">
      <img
        src={activePortrait.src}
        alt={activePortrait.alt}
        className="moonlit-menu-brand-portrait-image"
      />
      <span className="moonlit-menu-brand-orb-glow" aria-hidden="true" />
    </span>
  );
}

function MenuIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="moonlit-menu-icon-svg">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export default function MoonlitSpecialMenuOverlay(props: MoonlitSpecialMenuOverlayProps): JSX.Element {
  const {
    theme = "light",
    currentView,
    isAdmin,
    isAuthenticated = false,
    onGoHome,
    onGoCampaign,
    onGoCart,
    onGoMe,
    onGoAdmin,
    onOpenAuth,
    onLogout,
  } = props;

  const [menuOpen, setMenuOpen] = useState(false);
  const [overlayMounted, setOverlayMounted] = useState(false);
  const [activeItem, setActiveItem] = useState<string>(currentView);
  const [featuredCharacterIndex, setFeaturedCharacterIndex] = useState<number | null>(null);
  const featuredCharacter = FEATURED_CHARACTERS[featuredCharacterIndex ?? 0];
  const featuredCharacterStyle = {
    "--moonlit-character-scale": featuredCharacter.desktopScale ?? 1,
    "--moonlit-character-shift-y": featuredCharacter.desktopShiftY ?? "0px",
    "--moonlit-character-mobile-scale": featuredCharacter.mobileScale ?? featuredCharacter.desktopScale ?? 1,
    "--moonlit-character-mobile-shift-y": featuredCharacter.mobileShiftY ?? featuredCharacter.desktopShiftY ?? "0px",
  } as CSSProperties;

  useEffect(() => {
    setActiveItem(currentView);
  }, [currentView]);

  useEffect(() => {
    if (menuOpen) {
      setFeaturedCharacterIndex((currentIndex) => pickRandomCharacterIndex(currentIndex));
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
        id: "campaign",
        zhLabel: "活動選單",
        active: currentView === "campaign" || currentView === "blindBox",
        onSelect: onGoCampaign ?? onGoHome,
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

    baseEntries.push(
      isAuthenticated
        ? {
            id: "logout",
            zhLabel: "登出站點",
            onSelect: onLogout,
          }
        : {
            id: "auth",
            zhLabel: "登入 / 註冊",
            onSelect: onOpenAuth ?? onGoHome,
          },
    );

    return baseEntries;
  }, [
    currentView,
    isAdmin,
    isAuthenticated,
    onGoAdmin,
    onGoCart,
    onGoCampaign,
    onGoHome,
    onGoMe,
    onOpenAuth,
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
            <BrandPortraitOrb />
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
                <span className="moonlit-menu-close-line" aria-hidden="true" />
                <span className="moonlit-menu-close-label">CLOSE</span>
                <span className="moonlit-menu-close-line" aria-hidden="true" />
              </button>
            </header>

            <section className="moonlit-menu-overlay-main">
              <div className="moonlit-menu-stage-wordmark" aria-hidden="true">
                <div className="moonlit-menu-stage-wordmark-track">
                  {Array.from({ length: WORDMARK_GROUP_COUNT }).map((_, groupIndex) => (
                    <div key={`${featuredCharacter.backdropWord}-group-${groupIndex}`} className="moonlit-menu-stage-wordmark-group">
                      {Array.from({ length: WORDMARK_WORD_COUNT }).map((_, wordIndex) => (
                        <span key={`${featuredCharacter.backdropWord}-${groupIndex}-${wordIndex}`} className="moonlit-menu-stage-wordmark-text">
                          {featuredCharacter.backdropWord}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <div className="moonlit-menu-showcase">
                <div className="moonlit-menu-stage-visual" aria-hidden="true">
                  <img
                    src={featuredCharacter.image}
                    alt={featuredCharacter.name}
                    className="moonlit-menu-character-image"
                    style={featuredCharacterStyle}
                  />
                </div>

                <div className="moonlit-menu-character-profile">
                  <span className="moonlit-menu-character-kicker">CHARACTER</span>
                  <strong>{featuredCharacter.name}</strong>
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
