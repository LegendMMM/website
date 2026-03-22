import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AdminConsoleView } from "./admin/AdminConsoleView";
import { adminTabs, type AdminTab } from "./admin/config";
import { AuthCard } from "./components/AuthCard";
import MoonlitSpecialMenuOverlay from "./components/MoonlitSpecialMenuOverlay";
import { ProductImageLightbox } from "./components/ProductImageLightbox";
import type { UseOrderSystemReturn } from "./hooks/useOrderSystem";
import { useOrderSystem } from "./hooks/useOrderSystem";
import homeKaguyaStage from "./assets/home-kaguya-stage.jpg";
import kaguyaLogoHeader from "./assets/kaguya-logo-header.webp";
import {
  fixedTierLabel,
  formatDate,
  orderStatusLabel,
  productTypeLabel,
  releaseStageLabel,
  roleLabel,
  twd,
} from "./lib/format";
import { calculateUnitPrice } from "./lib/business-rules";
import { isSupabaseEnabled } from "./lib/supabase";
import type {
  Campaign,
  CharacterTier,
  Product,
} from "./types/domain";

type PageView = "home" | "campaign" | "blindBox" | "cart" | "me";
type RootRoute = "shop" | "admin";

function readRootRoute(): RootRoute {
  if (typeof window === "undefined") return "shop";
  return window.location.hash.startsWith("#/admin") ? "admin" : "shop";
}

function readAdminTab(): AdminTab {
  if (typeof window === "undefined") return "claims";
  const match = window.location.hash.match(/^#\/admin\/([^/?#]+)/);
  const raw = match?.[1] as AdminTab | undefined;
  const allowed = new Set<AdminTab>(adminTabs.map((item) => item.id));
  if (!raw || !allowed.has(raw)) return "claims";
  return raw;
}

function formatClaimPrioritySummary(product: Product | undefined, roleTier: CharacterTier): string {
  if (!product?.slotRestrictionEnabled) {
    return "排單方式：一般代購 / 先喊先處理";
  }
  return `排單固位：${roleLabel(roleTier)}`;
}

function InsightTile(props: {
  label: string;
  value: string | number;
  detail?: string;
  accent?: "violet" | "sky" | "rose" | "amber";
}): JSX.Element {
  const { label, value, detail, accent = "violet" } = props;
  return (
    <article className={`insight-tile insight-${accent}`}>
      <p className="insight-label">{label}</p>
      <p className="insight-value">{value}</p>
      {detail && <p className="insight-detail">{detail}</p>}
    </article>
  );
}

function ProductImage(props: { imageUrl: string | null; alt: string }): JSX.Element {
  return <ProductImageLightbox {...props} />;
}

function HomeIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10.5V20h13V10.5" />
    </svg>
  );
}

function GridIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.2" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" />
    </svg>
  );
}

function CartIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="19" r="1.4" />
      <circle cx="18" cy="19" r="1.4" />
      <path d="M3.5 5h2l2.3 9.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20.5 8H7" />
    </svg>
  );
}

function UserIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19.5c1.5-3 4.2-4.5 6.5-4.5s5 1.5 6.5 4.5" />
    </svg>
  );
}

function MobileBottomNav(props: {
  currentView: PageView;
  cartCount: number;
  hasSelectedCampaign: boolean;
  onGoHome: () => void;
  onGoCampaign: () => void;
  onGoCart: () => void;
  onGoMe: () => void;
}): JSX.Element {
  const { currentView, cartCount, hasSelectedCampaign, onGoHome, onGoCampaign, onGoCart, onGoMe } = props;
  const campaignActive = currentView === "campaign" || currentView === "blindBox";

  return (
    <nav className="mobile-bottom-nav" aria-label="手機導覽">
      <button
        type="button"
        className={currentView === "home" ? "mobile-bottom-nav-item is-active" : "mobile-bottom-nav-item"}
        onClick={onGoHome}
      >
        <span className="mobile-bottom-nav-icon-wrap">
          <span className="mobile-bottom-nav-icon">
            <HomeIcon />
          </span>
        </span>
        <span>首頁</span>
      </button>

      <button
        type="button"
        className={campaignActive ? "mobile-bottom-nav-item is-active" : "mobile-bottom-nav-item"}
        onClick={onGoCampaign}
        aria-disabled={!hasSelectedCampaign}
      >
        <span className="mobile-bottom-nav-icon-wrap">
          <span className="mobile-bottom-nav-icon">
            <GridIcon />
          </span>
        </span>
        <span>活動</span>
      </button>

      <button
        type="button"
        className={currentView === "cart" ? "mobile-bottom-nav-item is-active" : "mobile-bottom-nav-item"}
        onClick={onGoCart}
      >
        <span className="mobile-bottom-nav-icon-wrap">
          <span className="mobile-bottom-nav-icon">
            <CartIcon />
          </span>
          {cartCount > 0 && <span className="mobile-bottom-nav-badge">{cartCount}</span>}
        </span>
        <span>購物車</span>
      </button>

      <button
        type="button"
        className={currentView === "me" ? "mobile-bottom-nav-item is-active" : "mobile-bottom-nav-item"}
        onClick={onGoMe}
      >
        <span className="mobile-bottom-nav-icon-wrap">
          <span className="mobile-bottom-nav-icon">
            <UserIcon />
          </span>
        </span>
        <span>我的</span>
      </button>
    </nav>
  );
}

function HomeView(props: {
  system: UseOrderSystemReturn;
  isAuthenticated: boolean;
  authNotice: string;
  onBrowseCampaigns: () => void;
  onShowAuth: (message?: string) => void;
  onOpenCampaign: (campaign: Campaign) => void;
}): JSX.Element {
  const { system, isAuthenticated, authNotice, onBrowseCampaigns, onShowAuth, onOpenCampaign } = props;

  return (
    <section className="space-y-6">
      <div className="hero-panel overflow-hidden home-stage-panel">
        <div className="home-stage-shell">
          <div className="home-stage-scene">
            <img
              src={homeKaguyaStage}
              alt="超時空輝耀姬主視覺"
              className="home-stage-scene-image"
            />
            <div className="home-stage-scene-vignette" aria-hidden="true" />
            <div className="home-stage-scene-copy">
              <h2 className="home-stage-title">姬你太美專用網站</h2>

              <div className="home-stage-actions">
                <button type="button" className="cta-primary" onClick={onBrowseCampaigns}>
                  查看活動選單
                </button>
                {isAuthenticated ? (
                  <button type="button" className="cta-secondary" onClick={onBrowseCampaigns}>
                    繼續逛活動
                  </button>
                ) : (
                  <button
                    type="button"
                    className="cta-secondary"
                    onClick={() => onShowAuth("登入後即可加入購物車、查看訂單與喊單紀錄。")}
                  >
                    登入 / 註冊
                  </button>
                )}
              </div>

              {!isAuthenticated && authNotice ? (
                <div className="home-stage-notice">
                  {authNotice}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <article className="section-frame space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">About The Site</p>
          <h3 className="mt-2 text-2xl font-extrabold text-slate-900">簡單介紹這網站在幹麻</h3>
        </div>
        <p className="text-sm leading-7 text-slate-600">
          這個網站是專門給姬你太美固拆團喊單專用網站，使用請務必註冊登入，第一次註冊會需要信箱驗證，
          請使用自己常用的信箱以便我後續方便發訂單訂購紀錄給你。
        </p>
        <p className="text-sm leading-7 text-slate-600">
          商品部分有些會設定只有某些角色固位可喊，沒寫就是全開放。另外，如果要拆盒等活動也都會改為在這網站上進行。
        </p>
        <p className="text-sm leading-7 text-slate-600">以上</p>
      </article>

      <div id="campaign-selection" className="section-frame">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Campaign Menu</p>
            <h3 className="mt-2 text-2xl font-extrabold text-slate-900">活動選單</h3>
            <p className="mt-2 text-sm text-slate-600">先選你想加入的活動，再進去看商品與喊單規則。</p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {system.visibleCampaigns.map((campaign) => (
          <article key={campaign.id} className="campaign-card">
            <div className="campaign-card-top">
              <span className="state-pill bg-slate-100 text-slate-700">{releaseStageLabel(campaign.releaseStage)}</span>
            </div>
            <h3 className="mt-4 text-2xl font-extrabold text-slate-900">{campaign.title}</h3>
            {campaign.description ? <p className="mt-3 min-h-12 text-sm text-slate-600">{campaign.description}</p> : null}
            <div className="campaign-meta mt-4">
              <div>
                <p className="campaign-meta-label">截止時間</p>
                <p className="campaign-meta-value">{formatDate(campaign.deadlineAt)}</p>
              </div>
              <div>
                <p className="campaign-meta-label">釋出</p>
                <p className="campaign-meta-value">{releaseStageLabel(campaign.releaseStage)}</p>
              </div>
            </div>
            <button
              onClick={() => onOpenCampaign(campaign)}
              className="cta-primary mt-6 w-full"
              type="button"
            >
              {isAuthenticated ? "進入活動" : "查看活動"}
            </button>
          </article>
        ))}
      </div>

      {!isAuthenticated ? (
        <section id="auth-entry" className="section-frame space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Sign In</p>
            <h3 className="mt-2 text-2xl font-extrabold text-slate-900">登入後再喊單</h3>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              訪客模式可以先看首頁與活動內容。需要加入購物車、查看個人主頁或正式喊單時，再登入或註冊即可。
            </p>
          </div>
          <AuthCard
            onLogin={system.login}
            onRegister={system.register}
          />
        </section>
      ) : null}
    </section>
  );
}


function CampaignView(props: {

  system: UseOrderSystemReturn;
  campaign: Campaign;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
  onGoCart: () => void;
  onBack: () => void;
  onOpenProductDetail: (product: Product) => void;
}): JSX.Element {
  const { system, campaign, isAuthenticated, onRequireAuth, onGoCart, onBack, onOpenProductDetail } = props;
  const [keyword, setKeyword] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "priceAsc" | "priceDesc">("name");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const products = system.getProductsByCampaign(campaign.id);
  const cartItems = system.getMyCartItems(campaign.id);
  const cartMap = new Map(cartItems.map((item) => [`${item.productId}::${item.blindBoxItemId ?? "none"}`, item]));

  type NormalProductGroup = {
    key: string;
    name: string;
    imageUrl: string | null;
    variants: Product[];
    characters: string[];
    minPrice: number;
    maxPrice: number;
  };

  type CampaignBrowseEntry =
    | { kind: "normalGroup"; group: NormalProductGroup }
    | { kind: "product"; product: Product };

  const browseEntries = useMemo(() => {
    const normalGroupMap = new Map<string, Product[]>();

    products
      .filter((item) => item.type === "NORMAL")
      .forEach((item) => {
        const key = item.name.trim().toLowerCase();
        const existing = normalGroupMap.get(key);
        if (existing) {
          existing.push(item);
          return;
        }
        normalGroupMap.set(key, [item]);
      });

    const normalEntries: CampaignBrowseEntry[] = Array.from(normalGroupMap.values()).map((variants) => {
      const sortedVariants = [...variants].sort((a, b) => {
        const left = a.character ?? "";
        const right = b.character ?? "";
        return left.localeCompare(right) || a.sku.localeCompare(b.sku);
      });
      const prices = sortedVariants.map((item) => item.price);
      const representative = sortedVariants.find((item) => item.imageUrl) ?? sortedVariants[0];

      return {
        kind: "normalGroup",
        group: {
          key: representative.name.trim().toLowerCase(),
          name: representative.name,
          imageUrl: representative.imageUrl,
          variants: sortedVariants,
          characters: sortedVariants.map((item) => item.character ?? "一般款"),
          minPrice: Math.min(...prices),
          maxPrice: Math.max(...prices),
        },
      };
    });

    const blindEntries: CampaignBrowseEntry[] = products
      .filter((item) => item.type === "BLIND_BOX")
      .map((product) => ({ kind: "product", product }));

    return [...normalEntries, ...blindEntries];
  }, [products]);

  const visibleEntries = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    const filtered = browseEntries.filter((entry) => {
      const matchesKeyword = normalizedKeyword.length === 0 || (
        entry.kind === "normalGroup"
          ? (
            entry.group.name.toLowerCase().includes(normalizedKeyword)
            || entry.group.characters.some((character) => character.toLowerCase().includes(normalizedKeyword))
            || entry.group.variants.some((variant) => variant.sku.toLowerCase().includes(normalizedKeyword))
          )
          : (() => {
            const blindItems = system.getBlindBoxItemsByProduct(entry.product.id);
            return (
              entry.product.name.toLowerCase().includes(normalizedKeyword)
              || entry.product.sku.toLowerCase().includes(normalizedKeyword)
              || blindItems.some((item) => (
                item.name.toLowerCase().includes(normalizedKeyword)
                || item.character.toLowerCase().includes(normalizedKeyword)
                || item.sku.toLowerCase().includes(normalizedKeyword)
              ))
            );
          })()
      );

      if (!matchesKeyword) return false;

      if (!onlyAvailable) return true;

      if (entry.kind === "normalGroup") {
        return entry.group.variants.some((variant) => system.getProductAccessForCurrentUser(campaign.id, variant.id).ok);
      }

      const blindItems = system.getBlindBoxItemsByProduct(entry.product.id);
      return blindItems.some((item) => system.getProductAccessForCurrentUser(campaign.id, entry.product.id, item.id).ok);
    });

    return [...filtered].sort((left, right) => {
      const leftPrice = left.kind === "normalGroup" ? left.group.minPrice : left.product.price;
      const rightPrice = right.kind === "normalGroup" ? right.group.minPrice : right.product.price;
      const leftName = left.kind === "normalGroup" ? left.group.name : left.product.name;
      const rightName = right.kind === "normalGroup" ? right.group.name : right.product.name;

      if (sortBy === "priceAsc") return leftPrice - rightPrice;
      if (sortBy === "priceDesc") return rightPrice - leftPrice;
      return leftName.localeCompare(rightName);
    });
  }, [browseEntries, campaign.id, keyword, onlyAvailable, sortBy, system]);

  return (
    <section className="space-y-6">
      <div className="hero-panel">
        <div className="front-toolbar flex flex-wrap items-center justify-between gap-2">
          <button className="cta-secondary" type="button" onClick={onBack}>返回活動導覽</button>
          <button className="cta-secondary" type="button" onClick={onGoCart}>前往購物車</button>
        </div>

        <h2 className="mt-2 text-3xl font-extrabold text-slate-900">{campaign.title}</h2>
        {campaign.description ? <p className="mt-3 max-w-3xl text-sm text-slate-600">{campaign.description}</p> : null}

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="state-pill bg-slate-100 text-slate-700">釋出：{releaseStageLabel(campaign.releaseStage)}</span>
          <span className="state-pill bg-slate-100 text-slate-700">截止：{formatDate(campaign.deadlineAt)}</span>
        </div>

        {!isAuthenticated ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p>目前是訪客模式，可以先看商品；要加入購物車或喊單時再登入。</p>
            <button type="button" className="cta-secondary" onClick={onRequireAuth}>
              登入 / 註冊
            </button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="section-frame campaign-sidebar h-fit lg:sticky lg:top-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">商品列表</h3>
            </div>
            <div className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500">
              {visibleEntries.length} / {browseEntries.length}
            </div>
          </div>

          <div className="campaign-mobile-controls mt-4">
            <button
              type="button"
              className={mobileFiltersOpen ? "campaign-mobile-filter-toggle is-open" : "campaign-mobile-filter-toggle"}
              onClick={() => setMobileFiltersOpen((current) => !current)}
            >
              <span>搜尋與篩選</span>
              <span>{mobileFiltersOpen ? "收起" : "展開"}</span>
            </button>
          </div>

          <div className={`filter-panel campaign-filter-panel mt-5 space-y-3 text-sm ${mobileFiltersOpen ? "is-open" : ""}`}>
            <label className="block">
              搜尋關鍵字
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2"
                placeholder="商品名 / 角色"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={onlyAvailable}
                onChange={(event) => setOnlyAvailable(event.target.checked)}
              />
              只看目前可喊
            </label>

            <label className="block">
              排序
              <select
                className="mt-1 w-full rounded-xl border px-3 py-2"
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as "name" | "priceAsc" | "priceDesc")}
              >
                <option value="name">名稱排序</option>
                <option value="priceAsc">價格由低到高</option>
                <option value="priceDesc">價格由高到低</option>
              </select>
            </label>
          </div>

        </aside>

        <div className="space-y-3">
          <div className="section-frame campaign-product-header">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-2xl font-extrabold text-slate-900">全部商品</h3>
              </div>
            </div>
          </div>

          {visibleEntries.length === 0 && (
            <div className="empty-panel">目前沒有符合條件的商品。</div>
          )}

      <div className="front-product-grid grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {visibleEntries.map((entry) => {
          if (entry.kind === "normalGroup") {
            const { group } = entry;
            const inCartQty = group.variants.reduce(
              (sum, variant) => sum + (cartMap.get(`${variant.id}::none`)?.qty ?? 0),
              0,
            );
            const availableCount = group.variants.filter(
              (variant) => system.getProductAccessForCurrentUser(campaign.id, variant.id).ok,
            ).length;
            const priceText = group.minPrice === group.maxPrice
              ? twd(group.minPrice)
              : `${twd(group.minPrice)} 起`;

            return (
              <article key={group.key} className="product-stage-card">
                <div className="product-figure">
                  <ProductImage imageUrl={group.imageUrl} alt={group.name} />
                  <div className="product-price-badge">
                    <span className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Price</span>
                    <strong>{priceText}</strong>
                  </div>
                </div>

                <div className="mt-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-extrabold text-slate-900">{group.name}</h3>
                    <p className="text-xs text-slate-500">角色商品</p>
                  </div>
                  <span className="state-pill bg-slate-100 text-slate-700">代購</span>
                </div>

                <div className="meta-chip-row">
                  <span className="meta-chip">角色款 {group.variants.length} 項</span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {group.characters.slice(0, 4).map((character) => (
                    <span key={`${group.key}:${character}`} className="meta-chip">{character}</span>
                  ))}
                  {group.characters.length > 4 && <span className="meta-chip">+{group.characters.length - 4}</span>}
                </div>

                <div className="mt-4 space-y-1 text-sm text-slate-600">
                  <p>這個品項已合併角色款，點進去再選你要的角色商品。</p>
                  <p>已加入：{inCartQty}</p>
                </div>

                <p className={`status-note ${availableCount > 0 ? "status-note-ok" : "status-note-warn"}`}>
                  {availableCount > 0 ? `${availableCount} 個角色款目前可喊` : "目前沒有可喊的角色款"}
                </p>

                <button
                  type="button"
                  className="cta-primary mt-5 w-full"
                  onClick={() => onOpenProductDetail(group.variants[0])}
                >
                  查看角色商品
                </button>
              </article>
            );
          }

          const product = entry.product;
          const blindItemsCount = system.getBlindBoxItemsByProduct(product.id).length;

          return (
            <article key={product.id} className="product-stage-card">
              <div className="product-figure">
                <ProductImage imageUrl={product.imageUrl} alt={product.name} />
                <div className="product-price-badge">
                  <span className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Price</span>
                  <strong>{twd(product.price)}</strong>
                </div>
              </div>

              <div className="mt-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-extrabold text-slate-900">{product.name}</h3>
                  <p className="text-xs text-slate-500">{productTypeLabel(product.type)}</p>
                </div>
                <span className="state-pill bg-slate-100 text-slate-700">拆分</span>
              </div>

              <div className="meta-chip-row">
                <span className="meta-chip">子項 {blindItemsCount} 項</span>
              </div>

              <div className="mt-4 space-y-1 text-sm text-slate-600">
                <p>角色項目：{blindItemsCount} 項</p>
              </div>

              <button
                type="button"
                className="cta-primary mt-5 w-full"
                onClick={() => onOpenProductDetail(product)}
              >
                進入角色拆分
              </button>
            </article>
          );
        })}
      </div>
        </div>
      </div>
    </section>
  );
}

function ProductDetailView(props: {
  system: UseOrderSystemReturn;
  campaign: Campaign;
  product: Product;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
  onBack: () => void;
  onGoCart: () => void;
}): JSX.Element {
  const { system, campaign, product, isAuthenticated, onRequireAuth, onBack, onGoCart } = props;
  const [feedback, setFeedback] = useState("");
  const blindItems = system.getBlindBoxItemsByProduct(product.id);
  const normalVariants = useMemo(
    () => system.getProductsByCampaign(campaign.id)
      .filter((item) => (
        item.type === "NORMAL"
        && item.name === product.name
      ))
      .sort((a, b) => (a.character ?? "").localeCompare(b.character ?? "") || a.sku.localeCompare(b.sku)),
    [campaign.id, product.name, system],
  );
  const cartItems = system.getMyCartItems(campaign.id);
  const blindCartMap = new Map(
    cartItems
      .filter((item) => item.productId === product.id && item.blindBoxItemId)
      .map((item) => [item.blindBoxItemId ?? "", item.qty]),
  );
  const normalCartMap = new Map(
    cartItems
      .filter((item) => item.blindBoxItemId === null && normalVariants.some((variant) => variant.id === item.productId))
      .map((item) => [item.productId, item.qty]),
  );

  if (product.type === "NORMAL") {
    return (
      <section className="space-y-6">
        <div className="hero-panel">
          <div className="front-toolbar flex flex-wrap items-center justify-between gap-2">
            <button className="cta-secondary" type="button" onClick={onBack}>返回活動商品</button>
            <button className="cta-secondary" type="button" onClick={onGoCart}>前往購物車</button>
          </div>

          <h2 className="mt-2 text-3xl font-extrabold text-slate-900">{product.name}</h2>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="state-pill bg-slate-100 text-slate-700">角色款 {normalVariants.length} 項</span>
          </div>
          {!isAuthenticated ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p>先看角色款內容，登入後才會正式加入購物車。</p>
              <button type="button" className="cta-secondary" onClick={onRequireAuth}>
                登入 / 註冊
              </button>
            </div>
          ) : null}
          {feedback && <p className="mt-3 text-sm font-semibold text-slate-800">{feedback}</p>}
        </div>

        {normalVariants.length === 0 && <div className="empty-panel">這個品項目前還沒有可選的角色商品。</div>}

        <div className="blind-item-grid grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {normalVariants.map((variant) => {
            const access = system.getProductAccessForCurrentUser(campaign.id, variant.id);
            const inCartQty = normalCartMap.get(variant.id) ?? 0;

            return (
              <article key={variant.id} className="product-stage-card blind-item-card">
                <div className="product-figure">
                  <ProductImage imageUrl={variant.imageUrl} alt={variant.name} />
                  <div className="product-price-badge">
                    <span className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Price</span>
                    <strong>{twd(variant.price)}</strong>
                  </div>
                </div>
                <div className="mt-3">
                  <h3 className="text-xl font-extrabold text-slate-900">{variant.character ?? "一般款"}</h3>
                  <p className="text-sm text-slate-500">所屬商品：{variant.name}</p>
                </div>

                <div className="meta-chip-row">
                  <span className="meta-chip">{variant.character ?? "一般款"}</span>
                  <span className="meta-chip">庫存 {variant.stock ?? "不限"}</span>
                  <span className="meta-chip">上限 {variant.maxPerUser ?? "不限"}</span>
                </div>

                <p className="mt-3 text-sm text-slate-600">已加入：{inCartQty}</p>
                {variant.slotRestrictionEnabled && (
                  <p className="mt-1 text-sm text-slate-600">限制角色：{variant.slotRestrictedCharacter ?? variant.character ?? "未設定"}</p>
                )}

                <p className={`status-note ${access.ok ? "status-note-ok" : "status-note-warn"}`}>
                  {access.ok ? "可加入購物車" : access.reason}
                </p>

                {isAuthenticated ? (
                  <button
                    type="button"
                    disabled={!access.ok}
                    onClick={() => {
                      const result = system.addToCart(campaign.id, variant.id);
                      setFeedback(result.message);
                    }}
                    className={`mt-5 w-full rounded-2xl px-4 py-3 text-sm font-semibold ${
                      access.ok
                        ? "cta-primary"
                        : "cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-100 text-slate-500"
                    }`}
                  >
                    加入購物車
                  </button>
                ) : (
                  <button
                    type="button"
                    className="cta-secondary mt-5 w-full"
                    onClick={onRequireAuth}
                  >
                    登入後加入購物車
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="hero-panel">
        <div className="front-toolbar flex flex-wrap items-center justify-between gap-2">
          <button className="cta-secondary" type="button" onClick={onBack}>返回活動商品</button>
          <button className="cta-secondary" type="button" onClick={onGoCart}>前往購物車</button>
        </div>

        <h2 className="mt-2 text-3xl font-extrabold text-slate-900">{product.name}</h2>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="state-pill bg-slate-100 text-slate-700">
            {product.slotRestrictionEnabled ? "此盲盒啟用固位限制" : "此盲盒全員可喊"}
          </span>
          {product.slotRestrictionEnabled && (
            <span className="state-pill bg-slate-100 text-slate-700">活動釋出：{releaseStageLabel(campaign.releaseStage)}</span>
          )}
        </div>
        {!isAuthenticated ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p>角色子項可以先看，登入後才會正式加入購物車。</p>
            <button type="button" className="cta-secondary" onClick={onRequireAuth}>
              登入 / 註冊
            </button>
          </div>
        ) : null}
        {feedback && <p className="mt-3 text-sm font-semibold text-slate-800">{feedback}</p>}
      </div>

      {blindItems.length === 0 && <div className="empty-panel">此盲盒尚未建立任何角色子項。</div>}

      <div className="blind-item-grid grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {blindItems.map((item) => {
          const access = system.getProductAccessForCurrentUser(campaign.id, product.id, item.id);
          const myTier = system.currentUser ? system.getUserCharacterTier(system.currentUser.id, item.character) : null;
          const inCartQty = blindCartMap.get(item.id) ?? 0;

          return (
            <article key={item.id} className="product-stage-card blind-item-card">
              <div className="product-figure">
                <ProductImage imageUrl={item.imageUrl} alt={item.name} />
                <div className="product-price-badge">
                  <span className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Price</span>
                  <strong>{twd(calculateUnitPrice(product, item))}</strong>
                </div>
              </div>
              <div className="mt-3">
                <h3 className="text-xl font-extrabold text-slate-900">{item.name}</h3>
                <p className="text-sm text-slate-500">角色：{item.character}</p>
              </div>

              <div className="meta-chip-row">
                <span className="meta-chip">{item.character}</span>
                <span className="meta-chip">
                  {product.slotRestrictionEnabled ? `固位 ${myTier ? fixedTierLabel(myTier) : "未分配"}` : "全員可喊"}
                </span>
                <span className="meta-chip">庫存 {item.stock ?? "不限"}</span>
                <span className="meta-chip">上限 {item.maxPerUser ?? "不限"}</span>
              </div>

              <p className="mt-3 text-sm text-slate-600">已加入：{inCartQty}</p>

              <p className={`status-note ${access.ok ? "status-note-ok" : "status-note-warn"}`}>
                {access.ok ? "可加入購物車" : access.reason}
              </p>

              {isAuthenticated ? (
                <button
                  type="button"
                  disabled={!access.ok}
                  onClick={() => {
                    const result = system.addToCart(campaign.id, product.id, item.id);
                    setFeedback(result.message);
                  }}
                  className={`mt-5 w-full rounded-2xl px-4 py-3 text-sm font-semibold ${
                    access.ok
                      ? "cta-primary"
                      : "cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-100 text-slate-500"
                  }`}
                >
                  加入購物車
                </button>
              ) : (
                <button
                  type="button"
                  className="cta-secondary mt-5 w-full"
                  onClick={onRequireAuth}
                >
                  登入後加入購物車
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CartView(props: {
  system: UseOrderSystemReturn;
  onOpenCampaign: (campaign: Campaign) => void;
  onOpenProductDetail: (campaign: Campaign, product: Product) => void;
}): JSX.Element {
  const { system, onOpenCampaign, onOpenProductDetail } = props;
  const [feedback, setFeedback] = useState("");
  const cartItems = system.getMyCartItems();

  const campaignById = useMemo(
    () => new Map(system.state.campaigns.map((campaign) => [campaign.id, campaign])),
    [system.state.campaigns],
  );
  const productById = useMemo(
    () => new Map(system.state.products.map((product) => [product.id, product])),
    [system.state.products],
  );
  const blindItemById = useMemo(
    () => new Map(system.state.blindBoxItems.map((item) => [item.id, item])),
    [system.state.blindBoxItems],
  );

  const grouped = useMemo(() => {
    const group = new Map<string, typeof cartItems>();
    for (const item of cartItems) {
      const list = group.get(item.campaignId) ?? [];
      list.push(item);
      group.set(item.campaignId, list);
    }
    return Array.from(group.entries());
  }, [cartItems]);

  return (
    <section className="space-y-6">
      <div className="section-frame">
        <h2 className="text-2xl font-extrabold text-slate-900">購物車</h2>
        {feedback && <p className="mt-2 text-sm font-semibold text-slate-800">{feedback}</p>}
      </div>

      {grouped.length === 0 && (
        <div className="empty-panel">購物車目前是空的，先去活動頁加入商品。</div>
      )}

      {grouped.map(([campaignId, items]) => {
        const campaign = campaignById.get(campaignId);
        const estimatedTotal = items.reduce((sum, item) => {
          const product = productById.get(item.productId);
          const blindItem = item.blindBoxItemId ? blindItemById.get(item.blindBoxItemId) ?? null : null;
          if (!campaign || !product) return sum;
          return sum + calculateUnitPrice(product, blindItem) * item.qty;
        }, 0);

        return (
          <article key={campaignId} className="section-frame cart-campaign-section">
            <div className="cart-campaign-header flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-slate-900">{campaign?.title ?? "未知活動"}</h3>
              <div className="cart-campaign-header-actions flex gap-2">
                <button
                  type="button"
                  className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                  onClick={() => campaign && onOpenCampaign(campaign)}
                >
                  回活動頁
                </button>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {items.map((item) => {
                const product = productById.get(item.productId);
                const blindItem = item.blindBoxItemId ? blindItemById.get(item.blindBoxItemId) : null;
                const title = blindItem
                  ? `${product?.name ?? "未知商品"} / ${blindItem.name}`
                  : product?.name ?? "未知商品";
                const character = blindItem?.character ?? product?.character ?? "-";

                return (
                  <div key={item.id} className="row-card">
                    <div className="cart-item-row flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{title}</p>
                        <p className="text-xs text-slate-500">角色：{character}</p>
                      </div>

                      <div className="cart-item-actions flex items-center gap-2">
                        <div className="cart-stepper">
                          <button
                            type="button"
                            className="rounded-lg border px-2 py-1 text-xs"
                            onClick={() => {
                              const result = system.changeCartItemQty(item.id, item.qty - 1);
                              setFeedback(result.message);
                            }}
                          >
                            -1
                          </button>
                          <span className="min-w-8 text-center text-sm font-semibold">{item.qty}</span>
                          <button
                            type="button"
                            className="rounded-lg border px-2 py-1 text-xs"
                            onClick={() => {
                              const result = system.changeCartItemQty(item.id, item.qty + 1);
                              setFeedback(result.message);
                            }}
                          >
                            +1
                          </button>
                        </div>
                        <button
                          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700"
                          type="button"
                          onClick={() => {
                            const result = system.removeFromCart(item.id);
                            setFeedback(result.message);
                          }}
                        >
                          移除
                        </button>
                        {product && campaign && (
                          <button
                            className="rounded-lg border px-3 py-1 text-xs font-semibold"
                            type="button"
                            onClick={() => onOpenProductDetail(campaign, product)}
                          >
                            {product.type === "BLIND_BOX" ? "回拆分頁" : "回角色頁"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="cart-campaign-summary">
              <p className="text-sm font-semibold text-slate-700">預估總額：{twd(estimatedTotal)}</p>
              <button
                type="button"
                className="cart-place-order-button rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
                onClick={() => {
                  const result = system.placeOrder(campaignId);
                  setFeedback(result.message);
                }}
              >
                下單此活動
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function MeView(props: { system: UseOrderSystemReturn }): JSX.Element {
  const { system } = props;
  const orders = system.getMyOrders();

  const campaignById = useMemo(
    () => new Map(system.state.campaigns.map((campaign) => [campaign.id, campaign])),
    [system.state.campaigns],
  );
  const productById = useMemo(
    () => new Map(system.state.products.map((product) => [product.id, product])),
    [system.state.products],
  );
  const blindItemById = useMemo(
    () => new Map(system.state.blindBoxItems.map((item) => [item.id, item])),
    [system.state.blindBoxItems],
  );

  const myClaims = system.currentUser
    ? system.state.claims
      .filter((claim) => claim.userId === system.currentUser?.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    : [];

  return (
    <section className="space-y-6">
      <div className="section-frame">
        <h2 className="text-2xl font-extrabold text-slate-900">個人主頁</h2>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="section-frame">
          <h3 className="text-lg font-bold text-slate-900">我的訂單</h3>
          <div className="mt-3 space-y-3">
            {orders.length === 0 && <p className="text-sm text-slate-500">尚無訂單。</p>}
            {orders.map((order) => {
              const campaign = campaignById.get(order.campaignId);
              const items = system.getOrderItems(order.id);
              return (
                <article key={order.id} className="row-card">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-slate-900">{campaign?.title ?? "未知活動"}</p>
                    <span className="state-pill bg-slate-100 text-slate-700">{orderStatusLabel[order.status]}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{formatDate(order.createdAt)}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-700">總額：{twd(order.totalAmount)}</p>
                  <div className="mt-2 space-y-1 text-sm text-slate-600">
                    {items.map((item) => {
                      const product = productById.get(item.productId);
                      const blindItem = item.blindBoxItemId ? blindItemById.get(item.blindBoxItemId) : null;
                      const label = blindItem
                        ? `${product?.name ?? "未知商品"} / ${blindItem.name}`
                        : product?.name ?? "未知商品";
                      return <p key={item.id}>- {label} x {item.qty}</p>;
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="section-frame">
          <h3 className="text-lg font-bold text-slate-900">我的喊單紀錄</h3>
          <div className="mt-3 space-y-2">
            {myClaims.length === 0 && <p className="text-sm text-slate-500">尚無喊單紀錄。</p>}
            {myClaims.map((claim) => {
              const product = productById.get(claim.productId);
              const campaign = campaignById.get(claim.campaignId);
              const blindItem = claim.blindBoxItemId ? blindItemById.get(claim.blindBoxItemId) : null;
              const label = blindItem
                ? `${product?.name ?? "未知商品"} / ${blindItem.name}`
                : product?.name ?? "未知商品";

              return (
                <article key={claim.id} className="row-card text-sm">
                  <p className="font-semibold text-slate-900">{label}</p>
                  <p className="text-xs text-slate-500">{campaign?.title ?? "未知活動"} / {formatDate(claim.createdAt)}</p>
                  <p className="text-xs text-slate-600">{formatClaimPrioritySummary(product, claim.roleTier)}</p>
                  <p className="text-xs font-semibold text-slate-700">狀態：{claim.status}</p>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function App(): JSX.Element {
  const system = useOrderSystem();
  const [rootRoute, setRootRoute] = useState<RootRoute>(() => readRootRoute());
  const [adminTab, setAdminTab] = useState<AdminTab>(() => readAdminTab());
  const [view, setView] = useState<PageView>("home");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [selectedBlindProductId, setSelectedBlindProductId] = useState<string>("");
  const [permissionSyncFeedback, setPermissionSyncFeedback] = useState<string>("");
  const [authNotice, setAuthNotice] = useState<string>("");

  useEffect(() => {
    const handleHashChange = () => {
      setRootRoute(readRootRoute());
      setAdminTab(readAdminTab());
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (!system.currentUser) {
      setView("home");
      setSelectedCampaignId("");
      setSelectedBlindProductId("");
    }
  }, [system.currentUser]);

  useEffect(() => {
    if (selectedCampaignId && !system.state.campaigns.some((campaign) => campaign.id === selectedCampaignId)) {
      setSelectedCampaignId("");
      setView("home");
    }
  }, [selectedCampaignId, system.state.campaigns]);

  useEffect(() => {
    if (selectedBlindProductId && !system.state.products.some((product) => product.id === selectedBlindProductId)) {
      setSelectedBlindProductId("");
      if (view === "blindBox") {
        setView("campaign");
      }
    }
  }, [selectedBlindProductId, system.state.products, view]);

  useEffect(() => {
    if (!system.currentUser) return;
    setAuthNotice("");
  }, [system.currentUser]);

  const selectedCampaign = useMemo(
    () => system.state.campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null,
    [selectedCampaignId, system.state.campaigns],
  );

  const selectedBlindProduct = useMemo(
    () => system.state.products.find((product) => product.id === selectedBlindProductId) ?? null,
    [selectedBlindProductId, system.state.products],
  );

  const headerCartCount = system.getMyCartItems().reduce((sum, item) => sum + item.qty, 0);
  const headerOrderCount = system.getMyOrders().length;
  const headerPendingClaims = system.currentUser
    ? system.state.claims.filter((claim) => claim.userId === system.currentUser?.id && claim.status === "LOCKED").length
    : 0;

  const navigateRoot = (route: RootRoute): void => {
    window.location.hash = route === "admin" ? "/admin" : "/";
    setRootRoute(route);
    if (route === "admin") setAdminTab("claims");
  };

  const navigateAdminTab = (tab: AdminTab): void => {
    window.location.hash = `/admin/${tab}`;
    setRootRoute("admin");
    setAdminTab(tab);
  };

  const scrollToSection = (id: string): void => {
    if (typeof window === "undefined") return;
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 20);
  };

  const openAuthSection = (message = "登入後即可加入購物車、查看訂單與喊單紀錄。"): void => {
    if (rootRoute !== "shop") {
      navigateRoot("shop");
    }
    setAuthNotice(message);
    setSelectedBlindProductId("");
    setView("home");
    scrollToSection("auth-entry");
  };

  const browseCampaignMenu = (): void => {
    setView("home");
    scrollToSection("campaign-selection");
  };

  const goToCampaignView = (): void => {
    setSelectedBlindProductId("");
    if (selectedCampaignId) {
      setView("campaign");
      return;
    }
    browseCampaignMenu();
  };

  const handleGoCart = (): void => {
    if (!system.currentUser) {
      openAuthSection("購物車與下單功能需要先登入。");
      return;
    }
    setView("cart");
  };

  const handleGoMe = (): void => {
    if (!system.currentUser) {
      openAuthSection("個人主頁與喊單紀錄需要先登入。");
      return;
    }
    setView("me");
  };

  if (!system.currentUser && system.isHydratingState) {
    return (
      <main className="site-shell grid min-h-screen place-items-center px-4 py-12 grid-bg">
        <section className="hero-panel max-w-xl text-center">
          <h1 className="text-3xl font-extrabold text-slate-900">載入中</h1>
        </section>
      </main>
    );
  }

  if (rootRoute === "admin" && !system.currentUser) {
    return (
      <main className="site-shell grid min-h-screen place-items-center px-4 py-12 grid-bg">
        <div className="w-full max-w-3xl space-y-5">
          <section className="hero-panel text-center">
            <h1 className="text-3xl font-extrabold text-slate-900">管理後台需要先登入</h1>
            <p className="mt-3 text-sm text-slate-600">商城首頁已改成公開入口頁，但管理後台仍維持登入後才能進入。</p>
          </section>
          <AuthCard
            onLogin={system.login}
            onRegister={system.register}
          />
        </div>
      </main>
    );
  }

  if (rootRoute === "admin") {
    return (
      <main className="site-shell admin-front min-h-screen px-4 py-6 md:px-8 lg:px-12">
        <div className="front-shell mx-auto max-w-7xl space-y-5">
          <motion.header
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="hero-panel"
          >
            <img
              src={kaguyaLogoHeader}
              alt=""
              aria-hidden="true"
              className="hero-kaguya-mark hero-kaguya-mark-admin"
            />
            <div className="hero-grid">
              <div>
                <h1 className="mt-2 text-4xl font-extrabold text-slate-900">管理後台</h1>
                <p className="admin-account-copy mt-3 text-sm text-slate-600">登入帳號：{system.currentUser!.fbNickname}（{system.currentUser!.email}）</p>
                <p className="admin-meta-note text-xs text-slate-500">{isSupabaseEnabled ? "Supabase" : "Demo Local"}</p>
              </div>
              <div className="space-y-3">
                <div className="action-nav admin-hero-actions justify-end">
                  <button
                    type="button"
                    className="nav-chip"
                    onClick={() => navigateRoot("shop")}
                  >
                    前往商城頁
                  </button>
                  <button
                    onClick={system.logout}
                    className="nav-chip nav-chip-danger"
                    type="button"
                  >
                    登出
                  </button>
                </div>
                <div className="admin-hero-stats grid gap-3 sm:grid-cols-3">
                  <InsightTile label="會員數" value={system.state.users.length} accent="violet" />
                  <InsightTile label="待審喊單" value={system.state.claims.filter((claim) => claim.status === "LOCKED").length} accent="rose" />
                  <InsightTile label="訂單數" value={system.state.orders.length} accent="sky" />
                </div>
              </div>
            </div>
          </motion.header>

          {system.currentUser!.isAdmin ? (
            <AdminConsoleView
              system={system}
              onBackToShop={() => navigateRoot("shop")}
              activeTab={adminTab}
              onChangeTab={navigateAdminTab}
            />
          ) : (
            <div className="section-frame text-sm text-slate-600">
              <p>你目前沒有管理員權限，無法進入後台。</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="cta-secondary"
                  onClick={async () => {
                    const result = await system.refreshCurrentUserAdminFlag();
                    setPermissionSyncFeedback(result.message);
                  }}
                >
                  重新同步管理員權限
                </button>
                <button
                  type="button"
                  className="cta-secondary"
                  onClick={() => navigateRoot("shop")}
                >
                  回到商城
                </button>
              </div>
              {permissionSyncFeedback && <p className="mt-2 text-xs text-slate-500">{permissionSyncFeedback}</p>}
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="site-shell shop-front min-h-screen px-4 pb-24 pt-[5.6rem] md:px-8 md:pb-8 md:pt-[5.8rem] lg:px-12 lg:pb-10 lg:pt-[5.8rem]">
      <MoonlitSpecialMenuOverlay
        theme="light"
        currentView={view}
        isAuthenticated={Boolean(system.currentUser)}
        isAdmin={Boolean(system.currentUser?.isAdmin)}
        onGoHome={() => setView("home")}
        onGoCampaign={goToCampaignView}
        onGoCart={handleGoCart}
        onGoMe={handleGoMe}
        onGoAdmin={() => navigateAdminTab("claims")}
        onOpenAuth={() => openAuthSection()}
        onLogout={system.logout}
      />
      <div className="front-shell mx-auto max-w-7xl space-y-5">
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="hero-panel"
        >
        <div className="hero-grid">
          <div>
              <h1 className="mt-2 text-4xl font-extrabold text-slate-900">超時空輝耀姬</h1>
              <p className="mt-3 text-sm text-slate-600">
                {system.currentUser
                  ? `你好，${system.currentUser.fbNickname}`
                  : "先瀏覽首頁與活動內容，真的要喊單時再登入。"}
              </p>
              {system.currentUser?.isAdmin ? <p className="text-sm text-slate-500">可從 MENU 進入管理後台。</p> : null}
            </div>

            <div className="space-y-3 front-header-side">
              <img
                src={kaguyaLogoHeader}
                alt="超時空輝耀姬"
                className="hero-kaguya-logo-inline"
              />
              <div className="front-header-meta">
                <span>可進活動 {system.visibleCampaigns.length} 檔</span>
                <span>{system.currentUser ? `購物車 ${headerCartCount} 件` : "訪客模式"}</span>
                <span>{system.currentUser ? `已下單 ${headerOrderCount} 筆` : "可先預覽商品"}</span>
                <span>{system.currentUser ? `待審喊單 ${headerPendingClaims} 筆` : "登入後即可喊單"}</span>
              </div>
              {!system.currentUser ? (
                <button type="button" className="cta-secondary" onClick={() => openAuthSection()}>
                  登入 / 註冊
                </button>
              ) : null}
            </div>
          </div>
        </motion.header>

        {view === "home" && (
          <HomeView
            system={system}
            isAuthenticated={Boolean(system.currentUser)}
            authNotice={authNotice}
            onBrowseCampaigns={browseCampaignMenu}
            onShowAuth={openAuthSection}
            onOpenCampaign={(campaign) => {
              setSelectedCampaignId(campaign.id);
              setSelectedBlindProductId("");
              setView("campaign");
            }}
          />
        )}

        {view === "campaign" && selectedCampaign && (
          <CampaignView
            system={system}
            campaign={selectedCampaign}
            isAuthenticated={Boolean(system.currentUser)}
            onRequireAuth={() => openAuthSection("登入後才可將商品加入購物車。")}
            onGoCart={handleGoCart}
            onBack={() => setView("home")}
            onOpenProductDetail={(product) => {
              setSelectedBlindProductId(product.id);
              setView("blindBox");
            }}
          />
        )}

        {view === "blindBox" && selectedCampaign && selectedBlindProduct && (
          <ProductDetailView
            system={system}
            campaign={selectedCampaign}
            product={selectedBlindProduct}
            isAuthenticated={Boolean(system.currentUser)}
            onRequireAuth={() => openAuthSection("登入後才可把商品加入購物車。")}
            onBack={() => setView("campaign")}
            onGoCart={handleGoCart}
          />
        )}

        {view === "campaign" && !selectedCampaign && (
          <div className="empty-panel">請先從大主頁選擇活動。</div>
        )}

        {view === "blindBox" && (!selectedCampaign || !selectedBlindProduct) && (
          <div className="empty-panel">請先從活動頁進入盲盒商品。</div>
        )}

        {view === "cart" && (
          <CartView
            system={system}
            onOpenCampaign={(campaign) => {
              setSelectedCampaignId(campaign.id);
              setSelectedBlindProductId("");
              setView("campaign");
            }}
            onOpenProductDetail={(campaign, product) => {
              setSelectedCampaignId(campaign.id);
              setSelectedBlindProductId(product.id);
              setView("blindBox");
            }}
          />
        )}

        {view === "me" && <MeView system={system} />}
      </div>

      <MobileBottomNav
        currentView={view}
        cartCount={headerCartCount}
        hasSelectedCampaign={Boolean(selectedCampaignId)}
        onGoHome={() => setView("home")}
        onGoCampaign={goToCampaignView}
        onGoCart={handleGoCart}
        onGoMe={handleGoMe}
      />
    </main>
  );
}
