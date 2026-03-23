import { useEffect, useMemo, useRef, useState } from "react";
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
  BlindBoxItem,
  Campaign,
  CharacterTier,
  Product,
} from "./types/domain";

type PageView = "home" | "campaign" | "blindBox" | "cart" | "me";
type RootRoute = "shop" | "admin";

const NORMAL_SPEC_NAME_SEPARATORS = ["｜", "|"] as const;

type NormalProductBrowseGroup = {
  key: string;
  name: string;
  imageUrl: string | null;
  variants: Product[];
  characters: string[];
  minPrice: number;
  maxPrice: number;
};

function splitNormalProductName(name: string): { productName: string; specName: string } {
  const trimmed = name.trim();
  if (!trimmed) {
    return { productName: "", specName: "" };
  }

  for (const separator of NORMAL_SPEC_NAME_SEPARATORS) {
    const index = trimmed.indexOf(separator);
    if (index >= 0) {
      return {
        productName: trimmed.slice(0, index).trim() || trimmed,
        specName: trimmed.slice(index + 1).trim(),
      };
    }
  }

  return { productName: trimmed, specName: "" };
}

function hasExplicitNormalSpec(product: Product): boolean {
  if (product.type !== "NORMAL") return false;
  return Boolean(splitNormalProductName(product.name).specName);
}

function getNormalProductGroupName(product: Product): string {
  const parsed = splitNormalProductName(product.name);
  return parsed.specName ? parsed.productName : product.name.trim();
}

function getNormalProductSpecName(product: Product): string {
  const parsed = splitNormalProductName(product.name);
  return parsed.specName || product.character || "一般款";
}

function formatProductDisplayLabel(product: Product | undefined, blindItem?: BlindBoxItem | null): string {
  if (!product) return "未知商品";
  if (blindItem) {
    return `${product.name} / ${blindItem.name}`;
  }
  if (product.type === "NORMAL") {
    const parsed = splitNormalProductName(product.name);
    return parsed.specName ? `${parsed.productName} / ${parsed.specName}` : parsed.productName;
  }
  return product.name;
}

function buildNormalProductBrowseGroups(products: Product[]): {
  groups: NormalProductBrowseGroup[];
  standaloneProducts: Product[];
  groupByProductId: Map<string, NormalProductBrowseGroup>;
} {
  const normalProducts = products.filter((item) => item.type === "NORMAL");
  const explicitGroupKeys = new Set(
    normalProducts
      .filter((item) => hasExplicitNormalSpec(item))
      .map((item) => splitNormalProductName(item.name).productName.trim().toLowerCase()),
  );
  const groupedVariants = new Map<string, Product[]>();
  const standaloneProducts: Product[] = [];

  normalProducts.forEach((item) => {
    const parsedName = splitNormalProductName(item.name);
    const key = parsedName.productName.trim().toLowerCase();

    if (!explicitGroupKeys.has(key)) {
      standaloneProducts.push(item);
      return;
    }

    const existing = groupedVariants.get(key);
    if (existing) {
      existing.push(item);
      return;
    }
    groupedVariants.set(key, [item]);
  });

  const groups = Array.from(groupedVariants.values()).map((variants) => {
    const sortedVariants = [...variants].sort((a, b) => {
      const left = a.character ?? "";
      const right = b.character ?? "";
      return left.localeCompare(right) || a.sku.localeCompare(b.sku);
    });
    const prices = sortedVariants.map((item) => item.price);
    const representative = sortedVariants.find((item) => item.imageUrl) ?? sortedVariants[0];

    return {
      key: `${representative.campaignId}:${getNormalProductGroupName(representative).toLowerCase()}`,
      name: getNormalProductGroupName(representative),
      imageUrl: representative.imageUrl,
      variants: sortedVariants,
      characters: sortedVariants.map((item) => getNormalProductSpecName(item)),
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
    };
  });

  const groupByProductId = new Map<string, NormalProductBrowseGroup>();
  groups.forEach((group) => {
    group.variants.forEach((variant) => {
      groupByProductId.set(variant.id, group);
    });
  });

  return { groups, standaloneProducts, groupByProductId };
}

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

function ProductImage(props: {
  imageUrl: string | null;
  alt: string;
  frameClassName?: string;
  thumbClassName?: string;
  emptyClassName?: string;
  zoomButtonClassName?: string;
}): JSX.Element {
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
          <h3 className="mt-2 text-2xl font-extrabold text-slate-900">簡單介紹這網站在幹麻</h3>
        </div>
        <p className="text-sm leading-7 text-slate-600">
          這個網站是專門給姬你太美固拆團喊單專用網站，使用請務必註冊登入，第一次註冊會需要信箱驗證，
          請使用自己常用的信箱以便我後續方便發訂單訂購紀錄給你。
        </p>
        <p className="text-sm leading-7 text-slate-600">
          商品部分有些會設定只有某些角色固位可喊，沒寫就是全開放。另外，如果要拆盒等活動也都會改為在這網站上進行。
        </p>
      </article>

      <div id="campaign-selection" className="section-frame">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="mt-2 text-2xl font-extrabold text-slate-900">活動選單</h3>
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
  const products = system.getProductsByCampaign(campaign.id);
  const cartItems = system.getMyCartItems(campaign.id);
  const cartMap = new Map(cartItems.map((item) => [`${item.productId}::${item.blindBoxItemId ?? "none"}`, item]));
  const personalClaimMap = useMemo(() => {
    const next = new Map<string, number>();
    if (!system.currentUser) return next;

    system.state.claims
      .filter((claim) => (
        claim.campaignId === campaign.id
        && claim.userId === system.currentUser?.id
        && claim.status !== "CANCELLED_BY_ADMIN"
      ))
      .forEach((claim) => {
        const key = `${claim.productId}::${claim.blindBoxItemId ?? "none"}`;
        next.set(key, (next.get(key) ?? 0) + 1);
      });

    return next;
  }, [campaign.id, system.currentUser, system.state.claims]);

  type CampaignBrowseEntry =
    | { kind: "normalGroup"; group: NormalProductBrowseGroup }
    | { kind: "product"; product: Product };

  const getReservedQty = (productId: string, blindBoxItemId?: string | null): number => {
    const key = `${productId}::${blindBoxItemId ?? "none"}`;
    return (cartMap.get(key)?.qty ?? 0) + (personalClaimMap.get(key) ?? 0);
  };

  const browseEntries = useMemo(() => {
    const normalGrouping = buildNormalProductBrowseGroups(products);
    const normalEntries: CampaignBrowseEntry[] = [
      ...normalGrouping.groups.map((group) => ({ kind: "normalGroup", group }) as const),
      ...normalGrouping.standaloneProducts.map((product) => ({ kind: "product", product }) as const),
    ];

    const blindEntries: CampaignBrowseEntry[] = products
      .filter((item) => item.type === "BLIND_BOX")
      .map((product) => ({ kind: "product", product }));

    return [...normalEntries, ...blindEntries];
  }, [products]);

  const blindProductCount = useMemo(
    () => browseEntries.filter((entry) => entry.kind === "product" && entry.product.type === "BLIND_BOX").length,
    [browseEntries],
  );
  const normalProductCount = useMemo(
    () => browseEntries.filter((entry) => entry.kind === "normalGroup" || (entry.kind === "product" && entry.product.type === "NORMAL")).length,
    [browseEntries],
  );

  const visibleEntries = useMemo(() => {
    return [...browseEntries].sort((left, right) => {
      const leftName = left.kind === "normalGroup"
        ? left.group.name
        : left.product.type === "NORMAL"
          ? getNormalProductGroupName(left.product)
          : left.product.name;
      const rightName = right.kind === "normalGroup"
        ? right.group.name
        : right.product.type === "NORMAL"
          ? getNormalProductGroupName(right.product)
          : right.product.name;

      return leftName.localeCompare(rightName);
    });
  }, [browseEntries]);

  return (
    <section className="space-y-6">
      <article className="campaign-story-hero">
        <div className="campaign-story-scene">
          <img src={campaign.imageUrl ?? homeKaguyaStage} alt={campaign.title} className="campaign-story-scene-image" />
          <div className="campaign-story-scene-vignette" aria-hidden="true" />
        </div>

        <div className="campaign-story-copy">
          <div className="campaign-story-topline">
            <button className="cta-secondary" type="button" onClick={onBack}>返回活動導覽</button>
            <button className="cta-secondary" type="button" onClick={onGoCart}>前往購物車</button>
          </div>

          <h2 className="campaign-story-title">{campaign.title}</h2>
          <p className="campaign-story-body">
            {campaign.description || "先看商品，再選你要的規格。"}
          </p>

          <div className="campaign-story-meta">
            <span>釋出：{releaseStageLabel(campaign.releaseStage)}</span>
            <span>截止：{formatDate(campaign.deadlineAt)}</span>
            <span>一般商品 {normalProductCount} 項</span>
            <span>盲盒拆分 {blindProductCount} 項</span>
          </div>

          {!isAuthenticated ? (
            <div className="campaign-story-notice">
              <p>需要喊單或加入購物車時再登入。</p>
              <button type="button" className="cta-secondary" onClick={onRequireAuth}>
                登入 / 註冊
              </button>
            </div>
          ) : null}
        </div>
      </article>

      <section className="section-frame campaign-curation-panel">
        <div className="campaign-curation-head">
          <div>
            <h3 className="text-2xl font-extrabold text-slate-900">全部商品</h3>
          </div>
        </div>

        {visibleEntries.length === 0 && (
          <div className="empty-panel">目前沒有符合條件的商品。</div>
        )}

        <div className="campaign-curation-grid">
          {visibleEntries.map((entry, index) => {
            const isFeatured = index % 5 === 0;
          if (entry.kind === "normalGroup") {
            const { group } = entry;
            const inCartQty = group.variants.reduce(
              (sum, variant) => sum + getReservedQty(variant.id),
              0,
            );
            const availableCount = group.variants.filter(
              (variant) => system.getProductAccessForCurrentUser(campaign.id, variant.id).ok,
            ).length;
            const priceText = group.minPrice === group.maxPrice
              ? twd(group.minPrice)
              : `${twd(group.minPrice)} 起`;

            return (
              <article
                key={group.key}
                className={isFeatured ? "campaign-story-card is-featured" : "campaign-story-card"}
                role="button"
                tabIndex={0}
                onClick={() => onOpenProductDetail(group.variants[0])}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpenProductDetail(group.variants[0]);
                  }
                }}
              >
                <div className="campaign-story-card-hit">
                  <div className="campaign-story-card-media">
                    <div className="campaign-story-card-banner">
                      <span className="campaign-story-card-type">角色商品</span>
                      <span className="campaign-story-card-price">{priceText}</span>
                    </div>
                    <div className="product-figure campaign-story-card-figure">
                      <div onClick={(event) => event.stopPropagation()}>
                        <ProductImage
                          imageUrl={group.imageUrl}
                          alt={group.name}
                          frameClassName="campaign-story-card-lightbox"
                          thumbClassName="campaign-story-card-thumb"
                          emptyClassName="campaign-story-card-empty"
                          zoomButtonClassName="campaign-story-card-zoom"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="campaign-story-card-body">
                    <h4 className="campaign-story-card-title">{group.name}</h4>
                    <div className="campaign-story-card-meta">
                      <span>{group.variants.length} 個規格</span>
                      <span>已加入 {inCartQty}</span>
                      <span>{availableCount > 0 ? `${availableCount} 款可喊` : "目前無可喊規格"}</span>
                    </div>
                    <div className="campaign-story-card-tags">
                      {group.characters.slice(0, 4).map((character) => (
                        <span key={`${group.key}:${character}`} className="meta-chip">{character}</span>
                      ))}
                      {group.characters.length > 4 && <span className="meta-chip">+{group.characters.length - 4}</span>}
                    </div>
                  </div>
                </div>
              </article>
            );
          }

          const product = entry.product;
          if (product.type === "NORMAL") {
            const access = system.getProductAccessForCurrentUser(campaign.id, product.id);
            const reservedQty = getReservedQty(product.id);
            const groupName = getNormalProductGroupName(product);
            const specName = getNormalProductSpecName(product);

            return (
              <article
                key={product.id}
                className={isFeatured ? "campaign-story-card is-featured" : "campaign-story-card"}
                role="button"
                tabIndex={0}
                onClick={() => onOpenProductDetail(product)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpenProductDetail(product);
                  }
                }}
              >
                <div className="campaign-story-card-hit">
                  <div className="campaign-story-card-media">
                    <div className="campaign-story-card-banner">
                      <span className="campaign-story-card-type">單一規格</span>
                      <span className="campaign-story-card-price">{twd(product.price)}</span>
                    </div>
                    <div className="product-figure campaign-story-card-figure">
                      <div onClick={(event) => event.stopPropagation()}>
                        <ProductImage
                          imageUrl={product.imageUrl}
                          alt={groupName}
                          frameClassName="campaign-story-card-lightbox"
                          thumbClassName="campaign-story-card-thumb"
                          emptyClassName="campaign-story-card-empty"
                          zoomButtonClassName="campaign-story-card-zoom"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="campaign-story-card-body">
                    <h4 className="campaign-story-card-title">{groupName}</h4>
                    <div className="campaign-story-card-meta">
                      <span>{specName}</span>
                      <span>已加入 {reservedQty}</span>
                    </div>
                    {!access.ok ? <p className="campaign-story-card-copy">{access.reason}</p> : null}
                  </div>
                </div>
              </article>
            );
          }

          const blindItemsCount = system.getBlindBoxItemsByProduct(product.id).length;

          return (
            <article
              key={product.id}
              className={isFeatured ? "campaign-story-card is-featured" : "campaign-story-card"}
              role="button"
              tabIndex={0}
              onClick={() => onOpenProductDetail(product)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenProductDetail(product);
                }
              }}
            >
              <div className="campaign-story-card-hit">
                <div className="campaign-story-card-media">
                  <div className="campaign-story-card-banner">
                    <span className="campaign-story-card-type">盲盒拆分</span>
                    <span className="campaign-story-card-price">{twd(product.price)}</span>
                  </div>
                  <div className="product-figure campaign-story-card-figure">
                    <div onClick={(event) => event.stopPropagation()}>
                      <ProductImage
                        imageUrl={product.imageUrl}
                        alt={product.name}
                        frameClassName="campaign-story-card-lightbox"
                        thumbClassName="campaign-story-card-thumb"
                        emptyClassName="campaign-story-card-empty"
                        zoomButtonClassName="campaign-story-card-zoom"
                      />
                    </div>
                  </div>
                </div>

                <div className="campaign-story-card-body">
                  <h4 className="campaign-story-card-title">{product.name}</h4>
                  <div className="campaign-story-card-meta">
                    <span>{productTypeLabel(product.type)}</span>
                    <span>角色項目 {blindItemsCount} 項</span>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
        </div>
      </section>
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
  const normalGrouping = useMemo(
    () => buildNormalProductBrowseGroups(system.getProductsByCampaign(campaign.id)),
    [campaign.id, system],
  );
  const selectedNormalGroup = product.type === "NORMAL"
    ? normalGrouping.groupByProductId.get(product.id) ?? null
    : null;
  const selectedNormalProductName = selectedNormalGroup?.name ?? getNormalProductGroupName(product);
  const normalVariants = useMemo(
    () => selectedNormalGroup?.variants ?? [product],
    [product, selectedNormalGroup],
  );
  const cartItems = system.getMyCartItems(campaign.id);
  const personalClaimMap = useMemo(() => {
    const next = new Map<string, number>();
    if (!system.currentUser) return next;

    system.state.claims
      .filter((claim) => (
        claim.campaignId === campaign.id
        && claim.userId === system.currentUser?.id
        && claim.status !== "CANCELLED_BY_ADMIN"
      ))
      .forEach((claim) => {
        const key = `${claim.productId}::${claim.blindBoxItemId ?? "none"}`;
        next.set(key, (next.get(key) ?? 0) + 1);
      });

    return next;
  }, [campaign.id, system.currentUser, system.state.claims]);
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
  const getReservedQty = (productId: string, blindBoxItemId?: string | null): number => {
    const key = `${productId}::${blindBoxItemId ?? "none"}`;
    const cartQty = blindBoxItemId ? (blindCartMap.get(blindBoxItemId) ?? 0) : (normalCartMap.get(productId) ?? 0);
    return cartQty + (personalClaimMap.get(key) ?? 0);
  };
  const [selectedNormalVariantId, setSelectedNormalVariantId] = useState(product.id);
  const [selectedBlindItemId, setSelectedBlindItemId] = useState<string | null>(blindItems[0]?.id ?? null);

  useEffect(() => {
    setFeedback("");
  }, [product.id]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const handleKeydown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onBack();
    };

    window.addEventListener("keydown", handleKeydown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [onBack]);

  useEffect(() => {
    if (product.type === "NORMAL") {
      setSelectedNormalVariantId(product.id);
    }
  }, [product.id, product.type]);

  useEffect(() => {
    if (product.type === "BLIND_BOX") {
      setSelectedBlindItemId(blindItems[0]?.id ?? null);
    }
  }, [product.id, product.type, blindItems.length]);

  if (product.type === "NORMAL") {
    const selectedVariant = normalVariants.find((variant) => variant.id === selectedNormalVariantId) ?? normalVariants[0] ?? null;
    const access = selectedVariant ? system.getProductAccessForCurrentUser(campaign.id, selectedVariant.id) : null;

    return (
      <section className="campaign-drawer-overlay" onClick={onBack}>
        <div className="campaign-drawer-backdrop" aria-hidden="true" />
        <aside className="campaign-product-drawer" onClick={(event) => event.stopPropagation()} aria-label={`${selectedNormalProductName} 規格抽屜`}>
          <div className="campaign-product-drawer-head">
            <div>
              <h3>{selectedNormalProductName}</h3>
            </div>
            <div className="campaign-product-drawer-actions">
              <button type="button" className="cta-secondary" onClick={onGoCart}>購物車</button>
              <button type="button" className="cta-secondary" onClick={onBack}>關閉</button>
            </div>
          </div>

          {selectedVariant ? (
            <div className="campaign-product-drawer-body">
              <div className="campaign-product-showcase">
                <div className="campaign-product-showcase-media">
                  <ProductImage
                    imageUrl={selectedVariant.imageUrl}
                    alt={getNormalProductSpecName(selectedVariant)}
                    frameClassName="campaign-product-showcase-lightbox"
                    thumbClassName="campaign-product-showcase-thumb"
                    emptyClassName="campaign-product-showcase-empty"
                  />
                </div>
                <div className="campaign-product-showcase-copy">
                  <div className="campaign-product-price">{twd(selectedVariant.price)}</div>
                  <h4>{getNormalProductSpecName(selectedVariant)}</h4>
                  <div className="campaign-product-meta">
                    <span>角色：{selectedVariant.character ?? "一般款"}</span>
                    <span>庫存：{selectedVariant.stock ?? "不限"}</span>
                    <span>上限：{selectedVariant.maxPerUser ?? "不限"}</span>
                    <span>已加入：{getReservedQty(selectedVariant.id)}</span>
                  </div>
                  {selectedVariant.slotRestrictionEnabled ? (
                    <p className="campaign-product-restriction">限制角色：{selectedVariant.slotRestrictedCharacter ?? selectedVariant.character ?? "未設定"}</p>
                  ) : null}
                  {feedback ? <p className="campaign-product-feedback">{feedback}</p> : null}
                  {access ? (
                    <p className={`status-note ${access.ok ? "status-note-ok" : "status-note-warn"}`}>
                      {access.ok ? "目前可加入購物車" : access.reason}
                    </p>
                  ) : null}
                  {isAuthenticated ? (
                    <button
                      type="button"
                      disabled={!access?.ok}
                      onClick={() => {
                        const result = system.addToCart(campaign.id, selectedVariant.id);
                        setFeedback(result.message);
                      }}
                      className={`campaign-product-buy-button ${access?.ok ? "cta-primary" : "is-disabled"}`}
                    >
                      加入購物車
                    </button>
                  ) : (
                    <button type="button" className="campaign-product-buy-button cta-secondary" onClick={onRequireAuth}>
                      登入後加入購物車
                    </button>
                  )}
                </div>
              </div>

              <div className="campaign-product-options">
                <div className="campaign-product-options-head">
                  <h4>規格選擇</h4>
                  <span>{normalVariants.length} 個規格</span>
                </div>
                <div className="campaign-option-grid">
                  {normalVariants.map((variant) => {
                    const active = selectedVariant.id === variant.id;
                    const variantAccess = system.getProductAccessForCurrentUser(campaign.id, variant.id);
                    return (
                      <button
                        key={variant.id}
                        type="button"
                        className={active ? "campaign-option-card is-active" : "campaign-option-card"}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedNormalVariantId(variant.id);
                          setFeedback("");
                        }}
                      >
                        <strong>{getNormalProductSpecName(variant)}</strong>
                        <span>{variant.character ?? "一般款"}</span>
                        <span>{twd(variant.price)}</span>
                        <span>{variantAccess.ok ? "可加入" : variantAccess.reason}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-panel">這個品項目前沒有可選規格。</div>
          )}
        </aside>
      </section>
    );
  }

  const selectedBlindItem = blindItems.find((item) => item.id === selectedBlindItemId) ?? blindItems[0] ?? null;
  const selectedBlindAccess = selectedBlindItem
    ? system.getProductAccessForCurrentUser(campaign.id, product.id, selectedBlindItem.id)
    : null;
  const selectedBlindTier = selectedBlindItem && system.currentUser
    ? system.getUserCharacterTier(system.currentUser.id, selectedBlindItem.character)
    : null;

  return (
    <section className="campaign-drawer-overlay" onClick={onBack}>
      <div className="campaign-drawer-backdrop" aria-hidden="true" />
      <aside className="campaign-product-drawer" onClick={(event) => event.stopPropagation()} aria-label={`${product.name} 規格抽屜`}>
        <div className="campaign-product-drawer-head">
          <div>
            <h3>{product.name}</h3>
          </div>
          <div className="campaign-product-drawer-actions">
            <button type="button" className="cta-secondary" onClick={onGoCart}>購物車</button>
            <button type="button" className="cta-secondary" onClick={onBack}>關閉</button>
          </div>
        </div>

        {selectedBlindItem ? (
          <div className="campaign-product-drawer-body">
            <div className="campaign-product-showcase">
              <div className="campaign-product-showcase-media">
                <ProductImage
                  imageUrl={selectedBlindItem.imageUrl ?? product.imageUrl}
                  alt={selectedBlindItem.name}
                  frameClassName="campaign-product-showcase-lightbox"
                  thumbClassName="campaign-product-showcase-thumb"
                  emptyClassName="campaign-product-showcase-empty"
                />
              </div>
              <div className="campaign-product-showcase-copy">
                <div className="campaign-product-price">{twd(calculateUnitPrice(product, selectedBlindItem))}</div>
                <h4>{selectedBlindItem.name}</h4>
                <div className="campaign-product-meta">
                  <span>角色：{selectedBlindItem.character}</span>
                  <span>庫存：{selectedBlindItem.stock ?? "不限"}</span>
                  <span>上限：{selectedBlindItem.maxPerUser ?? "不限"}</span>
                  <span>已加入：{getReservedQty(product.id, selectedBlindItem.id)}</span>
                </div>
                <p className="campaign-product-restriction">
                  {product.slotRestrictionEnabled
                    ? `固位 ${selectedBlindTier ? fixedTierLabel(selectedBlindTier) : "未分配"} / 活動釋出 ${releaseStageLabel(campaign.releaseStage)}`
                    : "可直接喊單"}
                </p>
                {feedback ? <p className="campaign-product-feedback">{feedback}</p> : null}
                {selectedBlindAccess ? (
                  <p className={`status-note ${selectedBlindAccess.ok ? "status-note-ok" : "status-note-warn"}`}>
                    {selectedBlindAccess.ok ? "目前可加入購物車" : selectedBlindAccess.reason}
                  </p>
                ) : null}
                {isAuthenticated ? (
                  <button
                    type="button"
                    disabled={!selectedBlindAccess?.ok}
                    onClick={() => {
                      const result = system.addToCart(campaign.id, product.id, selectedBlindItem.id);
                      setFeedback(result.message);
                    }}
                    className={`campaign-product-buy-button ${selectedBlindAccess?.ok ? "cta-primary" : "is-disabled"}`}
                  >
                    加入購物車
                  </button>
                ) : (
                  <button type="button" className="campaign-product-buy-button cta-secondary" onClick={onRequireAuth}>
                    登入後加入購物車
                  </button>
                )}
              </div>
            </div>

            <div className="campaign-product-options">
              <div className="campaign-product-options-head">
                <h4>拆分規格</h4>
                <span>{blindItems.length} 個子項</span>
              </div>
              <div className="campaign-option-pill-row">
                {blindItems.map((item) => {
                  const active = selectedBlindItem.id === item.id;
                  return (
                    <button
                      key={`${item.id}:pill`}
                      type="button"
                      className={active ? "campaign-option-pill is-active" : "campaign-option-pill"}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedBlindItemId(item.id);
                        setFeedback("");
                      }}
                    >
                      {item.name}
                    </button>
                  );
                })}
              </div>
              <div className="campaign-option-grid">
                {blindItems.map((item) => {
                  const active = selectedBlindItem.id === item.id;
                  const access = system.getProductAccessForCurrentUser(campaign.id, product.id, item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={active ? "campaign-option-card is-active" : "campaign-option-card"}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedBlindItemId(item.id);
                        setFeedback("");
                      }}
                    >
                      <strong>{item.name}</strong>
                      <span>{item.character}</span>
                      <span>{twd(calculateUnitPrice(product, item))}</span>
                      <span>{access.ok ? "可加入" : access.reason}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="empty-panel">此盲盒尚未建立任何角色子項。</div>
        )}
      </aside>
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
                const title = formatProductDisplayLabel(product, blindItem);
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
                      const label = formatProductDisplayLabel(product, blindItem);
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
              const label = formatProductDisplayLabel(product, blindItem);

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
  const previousViewRef = useRef<PageView>("home");
  const previousCampaignIdRef = useRef<string>("");

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const previousView = previousViewRef.current;
    const previousCampaignId = previousCampaignIdRef.current;
    const sameCampaignDrawerTransition = rootRoute === "shop"
      && previousCampaignId === selectedCampaignId
      && (
        (previousView === "campaign" && view === "blindBox")
        || (previousView === "blindBox" && view === "campaign")
      );

    if (!sameCampaignDrawerTransition) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }

    previousViewRef.current = view;
    previousCampaignIdRef.current = selectedCampaignId;
  }, [view, rootRoute, adminTab, selectedCampaignId]);

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
              <h1 className="mt-2 text-4xl font-extrabold tracking-[0.04em] leading-[1.18] text-slate-900">超時空輝耀姬</h1>
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

        {(view === "campaign" || view === "blindBox") && selectedCampaign && (
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

        {(view === "campaign" || view === "blindBox") && !selectedCampaign && (
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
