import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AdminConsoleView } from "./admin/AdminConsoleView";
import { adminTabs, type AdminTab } from "./admin/config";
import { AuthCard } from "./components/AuthCard";
import MoonlitSpecialMenuOverlay from "./components/MoonlitSpecialMenuOverlay";
import type { UseOrderSystemReturn } from "./hooks/useOrderSystem";
import { useOrderSystem } from "./hooks/useOrderSystem";
import kaguyaLogoHeader from "./assets/kaguya-logo-header.webp";
import { DEFAULT_PRODUCT_CATEGORIES } from "./lib/constants";
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
  ProductSeries,
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
  const { imageUrl, alt } = props;
  if (!imageUrl) {
    return <div className="h-36 w-full rounded-xl bg-slate-100" aria-label="no-image" />;
  }
  return <img className="h-36 w-full rounded-xl object-cover" src={imageUrl} alt={alt} loading="lazy" />;
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
  onOpenCampaign: (campaign: Campaign) => void;
}): JSX.Element {
  const { system, onOpenCampaign } = props;
  const cartCount = system.getMyCartItems().reduce((sum, item) => sum + item.qty, 0);
  const myOrdersCount = system.getMyOrders().length;
  const myPendingClaims = system.currentUser
    ? system.state.claims.filter((claim) => claim.userId === system.currentUser?.id && claim.status === "LOCKED").length
    : 0;

  return (
    <section className="space-y-6">
      <div className="hero-panel">
        <div className="hero-grid">
          <div>
            <p className="section-kicker">本期導覽</p>
            <h2 className="text-3xl font-extrabold text-slate-900">先選活動，再進入對應系列挑商品</h2>
            <p className="mt-3 max-w-2xl text-sm text-slate-600">
              一般商品直接挑款加入購物車；盲盒商品則進入拆分頁後，再依角色與釋出階段確認是否能喊。首頁只負責帶你進正確的活動入口。
            </p>
            <div className="front-guide-list mt-5">
              <p>一般商品：直接購買</p>
              <p>盲盒商品：進拆分頁看角色與資格</p>
              <p>喊單成立後，仍需等待團主確認</p>
            </div>
          </div>
          <div className="front-summary-strip">
            <div className="front-summary-item">
              <span>進行中活動</span>
              <strong>{system.visibleCampaigns.length}</strong>
            </div>
            <div className="front-summary-item">
              <span>購物車</span>
              <strong>{cartCount}</strong>
            </div>
            <div className="front-summary-item">
              <span>我的訂單</span>
              <strong>{myOrdersCount}</strong>
            </div>
            <div className="front-summary-item">
              <span>待審喊單</span>
              <strong>{myPendingClaims}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="section-frame">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="section-kicker">活動章節</p>
            <h3 className="text-2xl font-extrabold text-slate-900">活動導覽</h3>
            <p className="mt-1 text-sm text-slate-600">先看活動，再進入該活動底下的系列與商品。這樣不會一進站就被大量資訊淹沒。</p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {system.visibleCampaigns.map((campaign) => (
          <article key={campaign.id} className="campaign-card">
            <div className="campaign-card-top">
              <p className="section-kicker">本期活動</p>
              <span className="state-pill bg-slate-100 text-slate-700">{releaseStageLabel(campaign.releaseStage)}</span>
            </div>
            <h3 className="mt-4 text-2xl font-extrabold text-slate-900">{campaign.title}</h3>
            <p className="mt-3 min-h-12 text-sm text-slate-600">{campaign.description || "尚未填寫活動描述。"}</p>
            <div className="campaign-meta mt-4">
              <div>
                <p className="campaign-meta-label">截止時間</p>
                <p className="campaign-meta-value">{formatDate(campaign.deadlineAt)}</p>
              </div>
              <div>
                <p className="campaign-meta-label">目前釋出</p>
                <p className="campaign-meta-value">{releaseStageLabel(campaign.releaseStage)}</p>
              </div>
            </div>
            <button
              onClick={() => onOpenCampaign(campaign)}
              className="cta-primary mt-6 w-full"
              type="button"
            >
              進入活動
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}


function CampaignView(props: {

  system: UseOrderSystemReturn;
  campaign: Campaign;
  onGoCart: () => void;
  onBack: () => void;
  onOpenBlindBox: (product: Product) => void;
}): JSX.Element {
  const { system, campaign, onGoCart, onBack, onOpenBlindBox } = props;
  const [feedback, setFeedback] = useState("");
  const [selectedSeries, setSelectedSeries] = useState<ProductSeries>("");
  const [keyword, setKeyword] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "priceAsc" | "priceDesc">("name");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const products = system.getProductsByCampaign(campaign.id);
  const cartItems = system.getMyCartItems(campaign.id);
  const cartMap = new Map(cartItems.map((item) => [`${item.productId}::${item.blindBoxItemId ?? "none"}`, item]));
  const seriesGroups = useMemo(() => {
    const availableCategories = Array.from(
      new Set([
        ...system.state.productCategories,
        ...DEFAULT_PRODUCT_CATEGORIES,
        ...products.map((item) => item.series || "未分類"),
      ]),
    );

    return availableCategories
      .map((series) => ({
        series,
        products: products.filter((item) => (item.series || "未分類") === series),
      }))
      .filter((group) => group.products.length > 0);
  }, [products, system.state.productCategories]);

  useEffect(() => {
    if (seriesGroups.length === 0) return;
    if (!seriesGroups.some((group) => group.series === selectedSeries)) {
      setSelectedSeries(seriesGroups[0].series);
    }
  }, [selectedSeries, seriesGroups]);

  const selectedSeriesProducts = useMemo(
    () => products.filter((item) => item.series === selectedSeries),
    [products, selectedSeries],
  );

  const visibleProducts = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    const withPrice = selectedSeriesProducts.map((product) => ({
      product,
      price: product.price,
    }));

    const filtered = withPrice.filter(({ product }) => {
      const matchesKeyword = normalizedKeyword.length === 0
        || product.name.toLowerCase().includes(normalizedKeyword)
        || product.sku.toLowerCase().includes(normalizedKeyword)
        || (product.character?.toLowerCase().includes(normalizedKeyword) ?? false);

      if (!matchesKeyword) return false;

      if (!onlyAvailable) return true;

      if (product.type === "NORMAL") {
        const access = system.getProductAccessForCurrentUser(campaign.id, product.id);
        return access.ok;
      }

      const blindItems = system.getBlindBoxItemsByProduct(product.id);
      return blindItems.some((item) => system.getProductAccessForCurrentUser(campaign.id, product.id, item.id).ok);
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === "priceAsc") return a.price - b.price;
      if (sortBy === "priceDesc") return b.price - a.price;
      return a.product.name.localeCompare(b.product.name);
    });

    return sorted.map((item) => item.product);
  }, [campaign.id, keyword, onlyAvailable, selectedSeriesProducts, sortBy, system]);

  return (
    <section className="space-y-6">
      <div className="hero-panel">
        <div className="front-toolbar flex flex-wrap items-center justify-between gap-2">
          <button className="cta-secondary" type="button" onClick={onBack}>返回活動導覽</button>
          <button className="cta-secondary" type="button" onClick={onGoCart}>前往購物車</button>
        </div>

        <p className="section-kicker mt-6">本期活動</p>
        <h2 className="mt-2 text-3xl font-extrabold text-slate-900">{campaign.title}</h2>
        <p className="mt-3 max-w-3xl text-sm text-slate-600">{campaign.description}</p>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="state-pill bg-slate-100 text-slate-700">釋出：{releaseStageLabel(campaign.releaseStage)}</span>
          <span className="state-pill bg-slate-100 text-slate-700">截止：{formatDate(campaign.deadlineAt)}</span>
        </div>
        <p className="mt-4 text-sm text-slate-700">先用左側切換系列，再從右側看商品。一般商品可直接加入購物車，盲盒則進拆分頁挑角色。</p>

        {feedback && <p className="mt-3 text-sm font-semibold text-slate-800">{feedback}</p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="section-frame campaign-sidebar h-fit lg:sticky lg:top-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="section-kicker">系列導覽</p>
              <h3 className="text-base font-bold text-slate-900">系列與篩選</h3>
            </div>
            <div className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500">
              {visibleProducts.length} / {selectedSeriesProducts.length}
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

          <div className="series-rail campaign-series-rail mt-4">
            {seriesGroups.map((group) => (
              <button
                key={group.series}
                type="button"
                className={selectedSeries === group.series ? "series-chip series-chip-active" : "series-chip"}
                onClick={() => {
                  setSelectedSeries(group.series);
                  setMobileFiltersOpen(false);
                }}
              >
                <span>{group.series}</span>
                <span className="text-xs opacity-75">{group.products.length}</span>
              </button>
            ))}
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

            <div className="mt-5 rounded-2xl border border-slate-200 bg-white/60 p-4 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">選購提醒</p>
            <p className="mt-2">一般商品可直接加購；若該商品另有固位限制，頁面會明確標示。盲盒商品請進拆分頁看角色資格。</p>
          </div>
        </aside>

        <div className="space-y-3">
          <div className="section-frame campaign-product-header">
            <p className="section-kicker">本期選品</p>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-2xl font-extrabold text-slate-900">{selectedSeries || "未選擇分類"}</h3>
                <p className="mt-1 text-sm text-slate-600">商品已依可視條件整理完成，直接從這裡加入購物車或進入盲盒拆分。</p>
              </div>
            </div>
          </div>

          {visibleProducts.length === 0 && (
            <div className="empty-panel">此系列目前沒有符合條件的商品。</div>
          )}

      <div className="front-product-grid grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {visibleProducts.map((product) => {
          const myQty = cartMap.get(`${product.id}::none`)?.qty ?? 0;
          const normalAccess = product.type === "NORMAL"
            ? system.getProductAccessForCurrentUser(campaign.id, product.id)
            : null;
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
                  <p className="text-xs text-slate-500">{product.series} / {productTypeLabel(product.type)}</p>
                </div>
                <span className="state-pill bg-slate-100 text-slate-700">{product.type === "NORMAL" ? "代購" : "拆分"}</span>
              </div>

              <div className="meta-chip-row">
                <span className="meta-chip">{product.series}</span>
                {product.type === "NORMAL" && <span className="meta-chip">庫存 {product.stock ?? "不限"}</span>}
                {product.type === "BLIND_BOX" && <span className="meta-chip">子項 {blindItemsCount} 項</span>}
              </div>

              <div className="mt-4 space-y-1 text-sm text-slate-600">
                {product.type === "NORMAL" && (
                  <>
                    <p>
                      購買方式：一般代購，
                      {product.slotRestrictionEnabled ? "此商品啟用固位限制" : "全員可喊"}
                    </p>
                    {product.character && <p>展示角色：{product.character}</p>}
                    {product.slotRestrictionEnabled && (
                      <p>限制角色：{product.slotRestrictedCharacter ?? product.character ?? "未設定"}</p>
                    )}
                    <p>上限：{product.maxPerUser ?? "不限"} / 已加入：{myQty}</p>
                  </>
                )}

                {product.type === "BLIND_BOX" && (
                  <>
                    <p>
                      購買方式：盲盒拆分，
                      {product.slotRestrictionEnabled ? "依子項角色判斷固位" : "此盲盒目前全員可喊"}
                    </p>
                    <p>盲盒子項：{blindItemsCount} 項（進入拆分頁挑角色）</p>
                  </>
                )}
              </div>

              {product.type === "NORMAL" ? (
                <>
                  <p className={`status-note ${normalAccess?.ok ? "status-note-ok" : "status-note-warn"}`}>
                    {normalAccess?.ok ? "可加入購物車" : normalAccess?.reason}
                  </p>

                  <button
                    type="button"
                    disabled={!normalAccess?.ok}
                    onClick={() => {
                      const result = system.addToCart(campaign.id, product.id);
                      setFeedback(result.message);
                    }}
                    className={`mt-5 w-full rounded-2xl px-4 py-3 text-sm font-semibold ${
                      normalAccess?.ok
                        ? "cta-primary"
                        : "cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-100 text-slate-500"
                    }`}
                  >
                    加入購物車
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="cta-primary mt-5 w-full"
                  onClick={() => onOpenBlindBox(product)}
                >
                  進入盲盒拆分
                </button>
              )}
            </article>
          );
        })}
      </div>
        </div>
      </div>
    </section>
  );
}

function BlindBoxView(props: {
  system: UseOrderSystemReturn;
  campaign: Campaign;
  product: Product;
  onBack: () => void;
  onGoCart: () => void;
}): JSX.Element {
  const { system, campaign, product, onBack, onGoCart } = props;
  const [feedback, setFeedback] = useState("");
  const items = system.getBlindBoxItemsByProduct(product.id);
  const cartItems = system
    .getMyCartItems(campaign.id)
    .filter((item) => item.productId === product.id && item.blindBoxItemId);

  const cartMap = new Map(cartItems.map((item) => [item.blindBoxItemId ?? "", item.qty]));

  return (
    <section className="space-y-6">
      <div className="hero-panel">
        <div className="front-toolbar flex flex-wrap items-center justify-between gap-2">
          <button className="cta-secondary" type="button" onClick={onBack}>返回活動商品</button>
          <button className="cta-secondary" type="button" onClick={onGoCart}>前往購物車</button>
        </div>

        <p className="section-kicker mt-6">盲盒拆分</p>
        <h2 className="mt-2 text-3xl font-extrabold text-slate-900">{product.name}</h2>
        <p className="mt-3 text-sm text-slate-600">這一頁才需要看角色、固位與釋出時段。你在這裡選的是角色子項，不是整盒母商品。</p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="state-pill bg-slate-100 text-slate-700">
            {product.slotRestrictionEnabled ? "此盲盒啟用固位限制" : "此盲盒全員可喊"}
          </span>
          {product.slotRestrictionEnabled && (
            <span className="state-pill bg-slate-100 text-slate-700">活動釋出：{releaseStageLabel(campaign.releaseStage)}</span>
          )}
        </div>
        {feedback && <p className="mt-3 text-sm font-semibold text-slate-800">{feedback}</p>}
      </div>

      {items.length === 0 && <div className="empty-panel">此盲盒尚未建立任何角色子項。</div>}

      <div className="blind-item-grid grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const access = system.getProductAccessForCurrentUser(campaign.id, product.id, item.id);
          const myTier = system.currentUser ? system.getUserCharacterTier(system.currentUser.id, item.character) : null;
          const inCartQty = cartMap.get(item.id) ?? 0;

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

              <div className="mt-3 space-y-1 text-sm text-slate-600">
                <p>
                  {product.slotRestrictionEnabled
                    ? `你的角色固位：${myTier ? fixedTierLabel(myTier) : "未分配"}`
                    : "這個盲盒商品未啟用固位限制。"}
                </p>
                <p>你已加入：{inCartQty}</p>
              </div>

              <p className={`status-note ${access.ok ? "status-note-ok" : "status-note-warn"}`}>
                {access.ok ? "可加入購物車" : access.reason}
              </p>

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
  onOpenBlindBox: (campaign: Campaign, product: Product) => void;
}): JSX.Element {
  const { system, onOpenCampaign, onOpenBlindBox } = props;
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
        <p className="section-kicker">購物清單</p>
        <h2 className="text-2xl font-extrabold text-slate-900">購物車</h2>
        <p className="mt-2 text-sm text-slate-600">單一商品或盲盒子項都可多件，且各自受上限與庫存限制。</p>
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
                        {product?.type === "BLIND_BOX" && campaign && (
                          <button
                            className="rounded-lg border px-3 py-1 text-xs font-semibold"
                            type="button"
                            onClick={() => onOpenBlindBox(campaign, product)}
                          >
                            回盲盒頁
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
        <p className="section-kicker">我的紀錄</p>
        <h2 className="text-2xl font-extrabold text-slate-900">個人主頁</h2>
        <p className="mt-2 text-sm text-slate-600">這裡會看到你下過的單與目前喊單狀態。</p>
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

  if (!system.currentUser && system.isHydratingState) {
    return (
      <main className="site-shell grid min-h-screen place-items-center px-4 py-12 grid-bg">
        <section className="hero-panel max-w-xl text-center">
          <p className="section-kicker">Syncing Workspace</p>
          <h1 className="mt-2 text-3xl font-extrabold text-slate-900">
            {system.hasStoredSession ? "正在恢復登入狀態" : "正在同步遠端資料"}
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            Supabase 資料仍在載入，先不要把你丟回登入畫面。等帳號與活動資料到位後會直接進站。
          </p>
        </section>
      </main>
    );
  }

  if (!system.currentUser) {
    return (
      <main className="site-shell grid min-h-screen place-items-center px-4 py-12 grid-bg">
        <AuthCard onLogin={system.login} onRegister={system.register} />
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
                <p className="section-kicker">Tsukuyomi Admin Cosmos</p>
                <h1 className="mt-2 text-4xl font-extrabold text-slate-900">超時空輝耀姬・管理後台</h1>
                <p className="admin-account-copy mt-3 text-sm text-slate-600">登入帳號：{system.currentUser.fbNickname}（{system.currentUser.email}）</p>
                <p className="admin-meta-note text-xs text-slate-500">資料模式：{isSupabaseEnabled ? "Supabase 遠端資料模式" : "Demo Local 模式"}</p>
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

          {system.currentUser.isAdmin ? (
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
        isAdmin={system.currentUser.isAdmin}
        onGoHome={() => setView("home")}
        onGoCart={() => setView("cart")}
        onGoMe={() => setView("me")}
        onGoAdmin={() => navigateAdminTab("claims")}
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
              <p className="section-kicker">Tsukuyomi Order Cosmos</p>
              <h1 className="mt-2 text-4xl font-extrabold text-slate-900">超時空輝耀姬・活動導覽與拆分系統</h1>
              <p className="mt-3 text-sm text-slate-600">你好，{system.currentUser.fbNickname}</p>
              <p className="text-sm text-slate-500">
                先選活動，再依系列挑商品；一般商品可直接加購，盲盒拆分則在子頁查看角色資格與可喊狀態。
                {system.currentUser.isAdmin ? " 你目前以前台視角瀏覽，若要調整資料可從上方 MENU 切換管理後台。" : ""}
              </p>
            </div>

            <div className="space-y-3 front-header-side">
              <img
                src={kaguyaLogoHeader}
                alt="超時空輝耀姬"
                className="hero-kaguya-logo-inline"
              />
              <div className="front-header-meta">
                <span>可進活動 {system.visibleCampaigns.length} 檔</span>
                <span>購物車 {headerCartCount} 件</span>
                <span>已下單 {headerOrderCount} 筆</span>
                <span>待審喊單 {headerPendingClaims} 筆</span>
              </div>
            </div>
          </div>
        </motion.header>

        {view === "home" && (
          <HomeView
            system={system}
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
            onGoCart={() => setView("cart")}
            onBack={() => setView("home")}
            onOpenBlindBox={(product) => {
              setSelectedBlindProductId(product.id);
              setView("blindBox");
            }}
          />
        )}

        {view === "blindBox" && selectedCampaign && selectedBlindProduct && (
          <BlindBoxView
            system={system}
            campaign={selectedCampaign}
            product={selectedBlindProduct}
            onBack={() => setView("campaign")}
            onGoCart={() => setView("cart")}
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
            onOpenBlindBox={(campaign, product) => {
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
        onGoCampaign={() => {
          setSelectedBlindProductId("");
          if (selectedCampaignId) {
            setView("campaign");
            return;
          }
          setView("home");
        }}
        onGoCart={() => setView("cart")}
        onGoMe={() => setView("me")}
      />
    </main>
  );
}
