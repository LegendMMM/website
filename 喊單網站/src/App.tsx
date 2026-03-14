import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AuthCard } from "./components/AuthCard";
import type { UseOrderSystemReturn } from "./hooks/useOrderSystem";
import { useOrderSystem } from "./hooks/useOrderSystem";
import { CHARACTER_OPTIONS, DEFAULT_PRODUCT_CATEGORIES } from "./lib/constants";
import {
  BLIND_ITEM_IMPORT_CSV_TEMPLATE,
  type BlindBoxItemImportRow,
  PRODUCT_IMPORT_CSV_TEMPLATE,
  type ProductImportRow,
  parseBlindItemImportCsv,
  parseBlindItemImportJson,
  parseProductImportCsv,
  parseProductImportJson,
} from "./lib/import-utils";
import {
  fixedTierLabel,
  formatDate,
  orderStatusLabel,
  paymentLabel,
  productTypeLabel,
  releaseStageLabel,
  roleLabel,
  twd,
} from "./lib/format";
import { calculateUnitPrice } from "./lib/business-rules";
import { downloadTextFile } from "./lib/download";
import { isSupabaseEnabled, supabase, testSupabaseConnection } from "./lib/supabase";
import type {
  Campaign,
  CharacterName,
  CharacterSlot,
  CharacterTier,
  OrderStatus,
  Product,
  ProductSeries,
  ProductType,
  ReleaseStage,
} from "./types/domain";

type PageView = "home" | "campaign" | "blindBox" | "cart" | "me";
type RootRoute = "shop" | "admin";
type AdminTab = "dashboard" | "members" | "claims" | "orders" | "shipping" | "settings";
type ClaimStatusFilter = "ALL" | "LOCKED" | "CONFIRMED" | "CANCELLED_BY_ADMIN";

const stageOptions: ReleaseStage[] = ["FIXED_1_ONLY", "FIXED_1_2", "FIXED_1_2_3", "ALL_OPEN"];
const characterTierOptions: CharacterTier[] = ["FIXED_1", "FIXED_2", "FIXED_3", "LEAK_PICK"];
const productTypeOptions: ProductType[] = ["NORMAL", "BLIND_BOX"];
const orderStatusOptions: OrderStatus[] = ["PLACED", "PAID", "CANCELLED"];
const adminTabs: Array<{ id: AdminTab; label: string }> = [
  { id: "dashboard", label: "總覽" },
  { id: "members", label: "會員" },
  { id: "claims", label: "全站喊單總表" },
  { id: "orders", label: "訂單" },
  { id: "shipping", label: "物流" },
  { id: "settings", label: "活動與商品設定" },
];

function readRootRoute(): RootRoute {
  if (typeof window === "undefined") return "shop";
  return window.location.hash.startsWith("#/admin") ? "admin" : "shop";
}

function readAdminTab(): AdminTab {
  if (typeof window === "undefined") return "dashboard";
  const match = window.location.hash.match(/^#\/admin\/([^/?#]+)/);
  const raw = match?.[1] as AdminTab | undefined;
  const allowed = new Set<AdminTab>(adminTabs.map((item) => item.id));
  if (!raw || !allowed.has(raw)) return "dashboard";
  return raw;
}

const FIXED_SLOT_PRIORITY: Record<CharacterTier, number> = {
  FIXED_1: 1,
  FIXED_2: 2,
  FIXED_3: 3,
  LEAK_PICK: 4,
};

function formatCharacterSlotSummary(slots: CharacterSlot[]): string {
  const normalized = slots
    .slice()
    .sort(
      (a, b) =>
        FIXED_SLOT_PRIORITY[a.tier] - FIXED_SLOT_PRIORITY[b.tier]
        || a.character.localeCompare(b.character, "zh-Hant"),
    );

  const fixedSlots = normalized.filter((slot) => slot.tier !== "LEAK_PICK");
  if (fixedSlots.length > 0) {
    const preview = fixedSlots.slice(0, 3).map((slot) => `${slot.character} ${fixedTierLabel(slot.tier)}`);
    return fixedSlots.length > 3 ? `${preview.join("、")} 等 ${fixedSlots.length} 項` : preview.join("、");
  }

  const leakCount = normalized.filter((slot) => slot.tier === "LEAK_PICK").length;
  if (leakCount > 0) {
    return `撿漏 ${leakCount} 角`;
  }

  return "未分配";
}

function formatClaimPrioritySummary(product: Product | undefined, roleTier: CharacterTier): string {
  if (product?.type === "NORMAL") {
    return "排單方式：一般代購 / 先喊先處理";
  }
  return `排單固位：${roleLabel(roleTier)}`;
}

function HeaderNav(props: {
  currentView: PageView;
  setView: (view: PageView) => void;
  system: UseOrderSystemReturn;
  onGoAdmin: () => void;
}): JSX.Element {
  const { currentView, setView, system, onGoAdmin } = props;
  const cartCount = system.currentUser
    ? system.getMyCartItems().reduce((sum, item) => sum + item.qty, 0)
    : 0;

  const buttonClass = (view: PageView): string =>
    `rounded-xl border px-4 py-2 text-sm font-semibold ${
      currentView === view ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className={buttonClass("home")} type="button" onClick={() => setView("home")}>大主頁</button>
      <button className={buttonClass("cart")} type="button" onClick={() => setView("cart")}>購物車 ({cartCount})</button>
      <button className={buttonClass("me")} type="button" onClick={() => setView("me")}>個人主頁</button>
      {system.currentUser?.isAdmin && (
        <button className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700" type="button" onClick={onGoAdmin}>管理後台</button>
      )}
      <button
        onClick={system.logout}
        className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700"
        type="button"
      >
        登出
      </button>
    </div>
  );
}

function ProductImage(props: { imageUrl: string | null; alt: string }): JSX.Element {
  const { imageUrl, alt } = props;
  if (!imageUrl) {
    return <div className="h-36 w-full rounded-xl bg-slate-100" aria-label="no-image" />;
  }
  return <img className="h-36 w-full rounded-xl object-cover" src={imageUrl} alt={alt} loading="lazy" />;
}

function HomeView(props: {
  system: UseOrderSystemReturn;
  onOpenCampaign: (campaign: Campaign) => void;
}): JSX.Element {
  const { system, onOpenCampaign } = props;

  return (
    <section className="space-y-5">
      <div className="glass-card p-5">
        <h2 className="text-2xl font-extrabold text-slate-900">活動導覽</h2>
        <p className="mt-2 text-sm text-slate-600">先選活動，再選商品。盲盒商品會再進一層角色拆分頁填單。</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {system.visibleCampaigns.map((campaign) => (
          <article key={campaign.id} className="glass-card p-5">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-lg font-bold text-slate-900">{campaign.title}</h3>
              <span className="state-pill bg-slate-100 text-slate-700">{releaseStageLabel(campaign.releaseStage)}</span>
            </div>
            <p className="mt-2 text-sm text-slate-600">{campaign.description}</p>
            <div className="mt-3 space-y-1 text-xs text-slate-500">
              <p>截止：{formatDate(campaign.deadlineAt)}</p>
              <p>釋出階段：{releaseStageLabel(campaign.releaseStage)}</p>
            </div>
            <button
              onClick={() => onOpenCampaign(campaign)}
              className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
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
    <section className="space-y-5">
      <div className="glass-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button className="rounded-lg border px-3 py-1.5 text-sm" type="button" onClick={onBack}>返回活動導覽</button>
          <button className="rounded-lg border px-3 py-1.5 text-sm" type="button" onClick={onGoCart}>前往購物車</button>
        </div>

        <h2 className="mt-3 text-2xl font-extrabold text-slate-900">{campaign.title}</h2>
        <p className="mt-2 text-sm text-slate-600">{campaign.description}</p>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="state-pill bg-slate-100 text-slate-700">釋出：{releaseStageLabel(campaign.releaseStage)}</span>
          <span className="state-pill bg-slate-100 text-slate-700">截止：{formatDate(campaign.deadlineAt)}</span>
        </div>
        <p className="mt-3 text-sm text-slate-700">先選系列，再用篩選快速找到可喊商品。</p>

        {feedback && <p className="mt-3 text-sm font-semibold text-slate-800">{feedback}</p>}
      </div>

      <div className="glass-card p-3">
        <div className="flex flex-wrap gap-2">
          {seriesGroups.map((group) => (
            <button
              key={group.series}
              type="button"
              className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                selectedSeries === group.series
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
              onClick={() => setSelectedSeries(group.series)}
            >
              {group.series} ({group.products.length})
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="glass-card p-4">
          <h3 className="text-base font-bold text-slate-900">系列篩選</h3>
          <p className="mt-1 text-xs text-slate-500">目前系列：{selectedSeries}</p>

          <div className="mt-3 space-y-3 text-sm">
            <label className="block">
              搜尋關鍵字
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2"
                placeholder="商品名 / SKU / 角色"
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

          <div className="mt-4 rounded-xl border border-slate-200 bg-white/70 p-3 text-xs text-slate-600">
            顯示 {visibleProducts.length} / {selectedSeriesProducts.length} 件
          </div>
        </aside>

        <div className="space-y-3">
          {visibleProducts.length === 0 && (
            <div className="glass-card p-5 text-sm text-slate-600">此系列目前沒有符合條件的商品。</div>
          )}

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {visibleProducts.map((product) => {
          const myQty = cartMap.get(`${product.id}::none`)?.qty ?? 0;
          const normalAccess = product.type === "NORMAL"
            ? system.getProductAccessForCurrentUser(campaign.id, product.id)
            : null;
          const blindItemsCount = system.getBlindBoxItemsByProduct(product.id).length;

          return (
            <article key={product.id} className="glass-card p-5">
              <ProductImage imageUrl={product.imageUrl} alt={product.name} />

              <div className="mt-3 flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-slate-500">{product.sku}</p>
                  <h3 className="text-base font-bold text-slate-900">{product.name}</h3>
                  <p className="text-xs text-slate-500">{product.series} / {productTypeLabel(product.type)}</p>
                </div>
              </div>

              <div className="mt-3 space-y-1 text-sm text-slate-600">
                <p>單價：{twd(product.price)}</p>

                {product.type === "NORMAL" && (
                  <>
                    <p>購買方式：一般代購，全員可喊</p>
                    {product.character && <p>展示角色：{product.character}</p>}
                    <p>上限：{product.maxPerUser ?? "不限"} / 已加入：{myQty}</p>
                  </>
                )}

                {product.type === "BLIND_BOX" && (
                  <>
                    <p>購買方式：盲盒拆分，依子項角色判斷固位</p>
                    <p>盲盒子項：{blindItemsCount} 項（進入拆分頁挑角色）</p>
                  </>
                )}
              </div>

              {product.type === "NORMAL" ? (
                <>
                  <p className={`mt-2 text-xs font-semibold ${normalAccess?.ok ? "text-emerald-700" : "text-amber-700"}`}>
                    {normalAccess?.ok ? "可加入購物車" : normalAccess?.reason}
                  </p>

                  <button
                    type="button"
                    disabled={!normalAccess?.ok}
                    onClick={() => {
                      const result = system.addToCart(campaign.id, product.id);
                      setFeedback(result.message);
                    }}
                    className={`mt-4 w-full rounded-xl px-4 py-2 text-sm font-semibold ${
                      normalAccess?.ok
                        ? "bg-slate-900 text-white hover:bg-slate-700"
                        : "cursor-not-allowed bg-slate-100 text-slate-500"
                    }`}
                  >
                    加入購物車
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
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
    <section className="space-y-5">
      <div className="glass-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button className="rounded-lg border px-3 py-1.5 text-sm" type="button" onClick={onBack}>返回活動商品</button>
          <button className="rounded-lg border px-3 py-1.5 text-sm" type="button" onClick={onGoCart}>前往購物車</button>
        </div>

        <h2 className="mt-3 text-2xl font-extrabold text-slate-900">{product.name}</h2>
        <p className="mt-2 text-sm text-slate-600">盲盒子項拆分填單：依角色固位與活動釋出階段判定可否加入。</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="state-pill bg-slate-100 text-slate-700">
            {product.slotRestrictionEnabled ? "依子項角色固位排單" : "全員可喊"}
          </span>
          <span className="state-pill bg-slate-100 text-slate-700">活動釋出：{releaseStageLabel(campaign.releaseStage)}</span>
        </div>
        {feedback && <p className="mt-3 text-sm font-semibold text-slate-800">{feedback}</p>}
      </div>

      {items.length === 0 && <div className="glass-card p-5 text-sm text-slate-600">此盲盒尚未建立任何角色子項。</div>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const access = system.getProductAccessForCurrentUser(campaign.id, product.id, item.id);
          const myTier = system.currentUser ? system.getUserCharacterTier(system.currentUser.id, item.character) : null;
          const inCartQty = cartMap.get(item.id) ?? 0;

          return (
            <article key={item.id} className="glass-card p-5">
              <ProductImage imageUrl={item.imageUrl} alt={item.name} />
              <div className="mt-3">
                <p className="text-xs text-slate-500">{item.sku}</p>
                <h3 className="text-base font-bold text-slate-900">{item.name}</h3>
                <p className="text-sm text-slate-500">角色：{item.character}</p>
              </div>

              <div className="mt-3 space-y-1 text-sm text-slate-600">
                <p>單價：{twd(calculateUnitPrice(product, item))}</p>
                <p>你的角色固位：{myTier ? fixedTierLabel(myTier) : "未分配"}</p>
                <p>子項庫存：{item.stock ?? "不限"}</p>
                <p>子項上限：{item.maxPerUser ?? "不限"}</p>
                <p>你已加入：{inCartQty}</p>
              </div>

              <p className={`mt-2 text-xs font-semibold ${access.ok ? "text-emerald-700" : "text-amber-700"}`}>
                {access.ok ? "可加入購物車" : access.reason}
              </p>

              <button
                type="button"
                disabled={!access.ok}
                onClick={() => {
                  const result = system.addToCart(campaign.id, product.id, item.id);
                  setFeedback(result.message);
                }}
                className={`mt-4 w-full rounded-xl px-4 py-2 text-sm font-semibold ${
                  access.ok
                    ? "bg-slate-900 text-white hover:bg-slate-700"
                    : "cursor-not-allowed bg-slate-100 text-slate-500"
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
    <section className="space-y-5">
      <div className="glass-card p-5">
        <h2 className="text-2xl font-extrabold text-slate-900">購物車</h2>
        <p className="mt-2 text-sm text-slate-600">單一商品或盲盒子項都可多件，且各自受上限與庫存限制。</p>
        {feedback && <p className="mt-2 text-sm font-semibold text-slate-800">{feedback}</p>}
      </div>

      {grouped.length === 0 && (
        <div className="glass-card p-5 text-sm text-slate-600">購物車目前是空的，先去活動頁加入商品。</div>
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
          <article key={campaignId} className="glass-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-slate-900">{campaign?.title ?? "未知活動"}</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                  onClick={() => campaign && onOpenCampaign(campaign)}
                >
                  回活動頁
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                  onClick={() => {
                    const result = system.placeOrder(campaignId);
                    setFeedback(result.message);
                  }}
                >
                  下單此活動
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
                  <div key={item.id} className="rounded-xl border border-slate-200 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{title}</p>
                        <p className="text-xs text-slate-500">角色：{character}</p>
                      </div>

                      <div className="flex items-center gap-2">
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

            <p className="mt-3 text-sm font-semibold text-slate-700">預估總額：{twd(estimatedTotal)}</p>
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
    <section className="space-y-5">
      <div className="glass-card p-5">
        <h2 className="text-2xl font-extrabold text-slate-900">個人主頁</h2>
        <p className="mt-2 text-sm text-slate-600">這裡會看到你下過的單與目前喊單狀態。</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="glass-card p-5">
          <h3 className="text-lg font-bold text-slate-900">我的訂單</h3>
          <div className="mt-3 space-y-3">
            {orders.length === 0 && <p className="text-sm text-slate-500">尚無訂單。</p>}
            {orders.map((order) => {
              const campaign = campaignById.get(order.campaignId);
              const items = system.getOrderItems(order.id);
              return (
                <article key={order.id} className="rounded-xl border border-slate-200 p-3">
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

        <div className="glass-card p-5">
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
                <article key={claim.id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
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

function AdminSettingsPanel(props: { system: UseOrderSystemReturn }): JSX.Element {
  const { system } = props;
  const [feedback, setFeedback] = useState("");
  const [supabaseFeedback, setSupabaseFeedback] = useState("");
  const [checkingSupabase, setCheckingSupabase] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterName>("八千代");

  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");
  const [campaignDeadlineAt, setCampaignDeadlineAt] = useState("");
  const [campaignReleaseStage, setCampaignReleaseStage] = useState<ReleaseStage>("FIXED_1_ONLY");

  const [productCampaignId, setProductCampaignId] = useState(system.state.campaigns[0]?.id ?? "");
  const [productType, setProductType] = useState<ProductType>("NORMAL");
  const [productSeries, setProductSeries] = useState<ProductSeries>(system.state.productCategories[0] ?? "未分類");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [productName, setProductName] = useState("");
  const [productCharacter, setProductCharacter] = useState<CharacterName | "">("");
  const [productSlotRestrictionEnabled, setProductSlotRestrictionEnabled] = useState(true);
  const [productSlotRestrictedCharacter, setProductSlotRestrictedCharacter] = useState<CharacterName | "">("八千代");
  const [productImageUrl, setProductImageUrl] = useState("");
  const [productPrice, setProductPrice] = useState("120");
  const [productStock, setProductStock] = useState("");
  const [productMaxPerUser, setProductMaxPerUser] = useState("");

  const blindProducts = useMemo(
    () => system.state.products.filter((product) => product.type === "BLIND_BOX"),
    [system.state.products],
  );

  const [blindProductId, setBlindProductId] = useState("");
  const [blindName, setBlindName] = useState("");
  const [blindCharacter, setBlindCharacter] = useState<CharacterName>("八千代");
  const [blindImageUrl, setBlindImageUrl] = useState("");
  const [blindPrice, setBlindPrice] = useState("");
  const [blindStock, setBlindStock] = useState("");
  const [blindMaxPerUser, setBlindMaxPerUser] = useState("");
  const [importMode, setImportMode] = useState<"PRODUCT_CSV" | "PRODUCT_JSON" | "BLIND_CSV" | "BLIND_JSON">("PRODUCT_CSV");
  const [importText, setImportText] = useState("");

  useEffect(() => {
    if (!productCampaignId && system.state.campaigns[0]) {
      setProductCampaignId(system.state.campaigns[0].id);
    }
  }, [productCampaignId, system.state.campaigns]);

  useEffect(() => {
    if (!system.state.productCategories.length) return;
    if (!system.state.productCategories.includes(productSeries)) {
      setProductSeries(system.state.productCategories[0]);
    }
  }, [productSeries, system.state.productCategories]);

  useEffect(() => {
    if (productType === "NORMAL") {
      setProductSlotRestrictionEnabled(false);
      setProductSlotRestrictedCharacter("");
      return;
    }

    setProductSlotRestrictionEnabled(true);
  }, [productType]);

  useEffect(() => {
    if (blindProducts.length === 0) {
      setBlindProductId("");
      return;
    }
    if (!blindProductId || !blindProducts.some((product) => product.id === blindProductId)) {
      setBlindProductId(blindProducts[0].id);
    }
  }, [blindProductId, blindProducts]);

  const members = system.state.users
    .filter((user) => !user.isAdmin)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const selectedBlindItems = blindProductId
    ? system.getBlindBoxItemsByProduct(blindProductId)
    : [];
  const selectedBlindProduct = blindProductId
    ? blindProducts.find((product) => product.id === blindProductId) ?? null
    : null;

  const assignGeneratedSkus = <T extends { sku: string }>(prefix: string, rows: T[], existingSkus: string[]): T[] => {
    let sequence = existingSkus.reduce((max, sku) => {
      const match = sku.toUpperCase().match(new RegExp(`^${prefix}-(\\d+)$`));
      if (!match) return max;
      return Math.max(max, Number(match[1]));
    }, 0);

    return rows.map((row) => {
      if (row.sku.trim()) return row;
      sequence += 1;
      return {
        ...row,
        sku: `${prefix}-${String(sequence).padStart(4, "0")}`,
      };
    });
  };

  const syncProductsToSupabase = async (rows: ProductImportRow[]): Promise<{ ok: boolean; message: string }> => {
    if (!isSupabaseEnabled || !supabase) {
      return { ok: false, message: "未設定 Supabase，僅寫入本地 Demo。" };
    }

    const payload = rows.map((row) => ({
      campaign_id: productCampaignId,
      sku: row.sku,
      name: row.name,
      series: row.series,
      type: row.type,
      character_name: row.type === "NORMAL" ? row.character : null,
      slot_restriction_enabled: row.type === "BLIND_BOX" ? row.slotRestrictionEnabled : false,
      slot_restricted_character:
        row.type === "BLIND_BOX" && row.slotRestrictionEnabled ? row.slotRestrictedCharacter : null,
      image_url: row.imageUrl,
      price: row.price,
      stock: row.type === "NORMAL" ? row.stock : null,
      max_per_user: row.maxPerUser,
    }));

    const { error } = await supabase.from("products").insert(payload);
    if (error) {
      return { ok: false, message: `Supabase 寫入失敗：${error.message}` };
    }
    return { ok: true, message: `Supabase 已同步 ${payload.length} 筆商品。` };
  };

  const syncBlindItemsToSupabase = async (rows: BlindBoxItemImportRow[]): Promise<{ ok: boolean; message: string }> => {
    if (!isSupabaseEnabled || !supabase) {
      return { ok: false, message: "未設定 Supabase，僅寫入本地 Demo。" };
    }

    const { data: productsData, error: productsError } = await supabase
      .from("products")
      .select("id, sku, type")
      .eq("campaign_id", productCampaignId);

    if (productsError) {
      return { ok: false, message: `查詢母商品失敗：${productsError.message}` };
    }

    const blindProductBySku = new Map(
      (productsData ?? [])
        .filter((item) => item.type === "BLIND_BOX")
        .map((item) => [item.sku, item.id]),
    );

    const payload: Array<Record<string, unknown>> = [];
    for (const row of rows) {
      const productId = blindProductBySku.get(row.parentSku);
      if (!productId) {
        return { ok: false, message: `Supabase 找不到盲盒母商品 SKU：${row.parentSku}` };
      }
      payload.push({
        product_id: productId,
        sku: row.sku,
        name: row.name,
        character_name: row.character,
        image_url: row.imageUrl,
        price: row.price,
        stock: row.stock,
        max_per_user: row.maxPerUser,
      });
    }

    const { error } = await supabase.from("blind_box_items").insert(payload);
    if (error) {
      return { ok: false, message: `Supabase 寫入失敗：${error.message}` };
    }
    return { ok: true, message: `Supabase 已同步 ${payload.length} 筆盲盒子項。` };
  };

  const handleImport = async () => {
    const text = importText.trim();
    if (!text) {
      setFeedback("請先貼上匯入內容。");
      return;
    }

    if (importMode === "PRODUCT_CSV" || importMode === "PRODUCT_JSON") {
      const parsed = importMode === "PRODUCT_CSV"
        ? parseProductImportCsv(text)
        : parseProductImportJson(text);

      if (parsed.errors.length > 0) {
        setFeedback(`匯入失敗：${parsed.errors.slice(0, 3).join(" / ")}`);
        return;
      }

      if (parsed.rows.length === 0) {
        setFeedback("沒有可匯入的商品資料。");
        return;
      }

      const resolvedRows = assignGeneratedSkus("PRD", parsed.rows, system.state.products.map((item) => item.sku));

      let successCount = 0;
      let firstError = "";
      resolvedRows.forEach((row) => {
        const result = system.adminCreateProduct({
          campaignId: productCampaignId,
          sku: row.sku,
          name: row.name,
          series: row.series,
          type: row.type,
          character: row.type === "NORMAL" ? row.character : null,
          slotRestrictionEnabled: row.type === "BLIND_BOX" ? row.slotRestrictionEnabled : false,
          slotRestrictedCharacter:
            row.type === "BLIND_BOX" && row.slotRestrictionEnabled ? row.slotRestrictedCharacter : null,
          imageUrl: row.imageUrl,
          price: row.price,
          stock: row.type === "NORMAL" ? row.stock : null,
          maxPerUser: row.maxPerUser,
        });
        if (result.ok) {
          successCount += 1;
        } else if (!firstError) {
          firstError = result.message;
        }
      });

      const localFeedback =
        firstError
          ? `已匯入 ${successCount} 筆，失敗原因：${firstError}`
          : `商品匯入成功，共 ${successCount} 筆。`;

      const syncResult = await syncProductsToSupabase(resolvedRows);
      setFeedback(`${localFeedback} ${syncResult.message}`);
      return;
    }

    const parsed = importMode === "BLIND_CSV"
      ? parseBlindItemImportCsv(text)
      : parseBlindItemImportJson(text);

    if (parsed.errors.length > 0) {
      setFeedback(`匯入失敗：${parsed.errors.slice(0, 3).join(" / ")}`);
      return;
    }

    if (parsed.rows.length === 0) {
      setFeedback("沒有可匯入的盲盒子項資料。");
      return;
    }

    const resolvedRows = assignGeneratedSkus("BLI", parsed.rows, system.state.blindBoxItems.map((item) => item.sku));

    const productsInCampaign = system.getProductsByCampaign(productCampaignId);
    const bySku = new Map(productsInCampaign.map((item) => [item.sku, item]));

    let successCount = 0;
    let firstError = "";

    resolvedRows.forEach((row) => {
      const parent = bySku.get(row.parentSku);
      if (!parent || parent.type !== "BLIND_BOX") {
        if (!firstError) firstError = `找不到盲盒母商品 SKU：${row.parentSku}`;
        return;
      }

      const result = system.adminCreateBlindBoxItem({
        productId: parent.id,
        sku: row.sku,
        name: row.name,
        character: row.character,
        imageUrl: row.imageUrl,
        price: row.price,
        stock: row.stock,
        maxPerUser: row.maxPerUser,
      });
      if (result.ok) {
        successCount += 1;
      } else if (!firstError) {
        firstError = result.message;
      }
    });

    const localFeedback =
      firstError
        ? `已匯入 ${successCount} 筆，失敗原因：${firstError}`
        : `盲盒子項匯入成功，共 ${successCount} 筆。`;

    const syncResult = await syncBlindItemsToSupabase(resolvedRows);
    setFeedback(`${localFeedback} ${syncResult.message}`);
  };

  return (
    <section className="space-y-5">
      <div className="glass-card p-5">
        <h2 className="text-2xl font-extrabold text-slate-900">活動設定（管理員）</h2>
        <p className="mt-2 text-sm text-slate-600">一般商品固定全員可喊，只有盲盒拆分商品才使用固位限制。價格全面改為手動設定。</p>
        {feedback && <p className="mt-2 text-sm font-semibold text-slate-800">{feedback}</p>}
      </div>

      <section className="glass-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">商品分類管理</h3>
            <p className="mt-1 text-sm text-slate-600">分類由管理員自行維護，刪除分類後商品會自動改放到未分類。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="新增分類名稱"
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
            />
            <button
              type="button"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              onClick={() => {
                const result = system.adminCreateCategory(newCategoryName);
                setFeedback(result.message);
                if (result.ok) setNewCategoryName("");
              }}
            >
              新增分類
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {system.state.productCategories.map((category) => (
            <div key={category} className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-2 text-sm">
              <span>{category}</span>
              {category !== "未分類" && (
                <button
                  type="button"
                  className="text-xs font-semibold text-rose-700"
                  onClick={() => {
                    const ok = window.confirm(`刪除分類「${category}」後，商品會移到未分類。確定執行？`);
                    if (!ok) return;
                    const result = system.adminDeleteCategory(category);
                    setFeedback(result.message);
                  }}
                >
                  刪除
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="glass-card p-5">
          <h3 className="text-lg font-bold text-slate-900">Supabase 設定</h3>
          <p className="mt-2 text-sm text-slate-600">
            目前狀態：{isSupabaseEnabled ? "已設定環境變數" : "未設定環境變數（目前使用 Local Demo）"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
              disabled={checkingSupabase}
              onClick={async () => {
                setCheckingSupabase(true);
                const result = await testSupabaseConnection();
                setSupabaseFeedback(result.message);
                setCheckingSupabase(false);
              }}
            >
              {checkingSupabase ? "檢查中..." : "測試 Supabase 連線"}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            新專案請先在 `.env` 設定 `VITE_SUPABASE_URL` 與 `VITE_SUPABASE_ANON_KEY`，再到 Supabase SQL Editor 執行 `supabase/schema.sql`。
            若你是從舊版資料升級，再補跑對應 migration。
          </p>
          {supabaseFeedback && <p className="mt-2 text-sm font-semibold text-slate-800">{supabaseFeedback}</p>}
        </div>

        <div className="glass-card p-5">
          <h3 className="text-lg font-bold text-slate-900">表單匯入商品（批次）</h3>
          <p className="mt-2 text-sm text-slate-600">支援商品與盲盒子項兩類匯入，可用 CSV 或 JSON。</p>
          <p className="mt-1 text-xs text-slate-500">
            `character` 只作為一般商品的展示角色；`slotRestrictionEnabled / slotRestrictedCharacter` 只對盲盒母商品有效。
          </p>

          <div className="mt-3 grid gap-3 text-sm">
            <label className="block">
              匯入目標活動
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={productCampaignId}
                onChange={(event) => setProductCampaignId(event.target.value)}
              >
                {system.state.campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>{campaign.title}</option>
                ))}
              </select>
            </label>

            <label className="block">
              匯入模式
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={importMode}
                onChange={(event) => setImportMode(event.target.value as "PRODUCT_CSV" | "PRODUCT_JSON" | "BLIND_CSV" | "BLIND_JSON")}
              >
                <option value="PRODUCT_CSV">商品 CSV</option>
                <option value="PRODUCT_JSON">商品 JSON</option>
                <option value="BLIND_CSV">盲盒子項 CSV</option>
                <option value="BLIND_JSON">盲盒子項 JSON</option>
              </select>
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                onClick={() => {
                  if (importMode === "PRODUCT_CSV") setImportText(PRODUCT_IMPORT_CSV_TEMPLATE);
                  if (importMode === "BLIND_CSV") setImportText(BLIND_ITEM_IMPORT_CSV_TEMPLATE);
                  if (importMode === "PRODUCT_JSON") setImportText("[]");
                  if (importMode === "BLIND_JSON") setImportText("[]");
                }}
              >
                載入模板
              </button>
              <button
                type="button"
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                onClick={() => setImportText("")}
              >
                清空
              </button>
            </div>

            <textarea
              className="min-h-48 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs"
              placeholder="貼上 CSV 或 JSON"
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
            />

            <button
              type="button"
              className="w-full rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-700"
              onClick={handleImport}
            >
              開始匯入
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="glass-card p-5">
          <h3 className="text-lg font-bold text-slate-900">新增活動</h3>
          <div className="mt-3 space-y-3 text-sm">
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="活動名稱"
              value={campaignTitle}
              onChange={(event) => setCampaignTitle(event.target.value)}
            />
            <textarea
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="活動說明"
              value={campaignDescription}
              onChange={(event) => setCampaignDescription(event.target.value)}
            />
            <label className="block">
              截止時間
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                type="datetime-local"
                value={campaignDeadlineAt}
                onChange={(event) => setCampaignDeadlineAt(event.target.value)}
              />
            </label>
            <label className="block">
              初始釋出階段
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={campaignReleaseStage}
                onChange={(event) => setCampaignReleaseStage(event.target.value as ReleaseStage)}
              >
                {stageOptions.map((stage) => (
                  <option key={stage} value={stage}>{releaseStageLabel(stage)}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="w-full rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-700"
              onClick={() => {
                const result = system.adminCreateCampaign({
                  title: campaignTitle,
                  description: campaignDescription,
                  deadlineAt: campaignDeadlineAt,
                  releaseStage: campaignReleaseStage,
                });
                setFeedback(result.message);
                if (result.ok) {
                  setCampaignTitle("");
                  setCampaignDescription("");
                  setCampaignDeadlineAt("");
                }
              }}
            >
              建立活動
            </button>
          </div>
        </section>

        <section className="glass-card p-5">
          <h3 className="text-lg font-bold text-slate-900">新增商品（含圖片）</h3>
          <div className="mt-3 space-y-3 text-sm">
            <label className="block">
              所屬活動
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={productCampaignId}
                onChange={(event) => setProductCampaignId(event.target.value)}
              >
                {system.state.campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>{campaign.title}</option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                商品類型
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={productType}
                  onChange={(event) => setProductType(event.target.value as ProductType)}
                >
                  {productTypeOptions.map((type) => (
                    <option key={type} value={type}>{productTypeLabel(type)}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                商品分類
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={productSeries}
                  onChange={(event) => setProductSeries(event.target.value as ProductSeries)}
                >
                  {system.state.productCategories.map((series) => (
                    <option key={series} value={series}>{series}</option>
                  ))}
                </select>
              </label>

              <div className="rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
                SKU 由系統自動產生
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-1">
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
                placeholder="商品名稱"
                value={productName}
                onChange={(event) => setProductName(event.target.value)}
              />
            </div>

            {productType === "NORMAL" && (
              <label className="block">
                展示角色（可留空）
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={productCharacter}
                  onChange={(event) => setProductCharacter(event.target.value as CharacterName | "")}
                >
                  <option value="">不指定角色</option>
                  {CHARACTER_OPTIONS.map((character) => (
                    <option key={character} value={character}>{character}</option>
                  ))}
                </select>
              </label>
            )}

            {productType === "BLIND_BOX" ? (
              <div className="rounded-2xl border border-slate-200 bg-white/60 p-3 text-sm">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={productSlotRestrictionEnabled}
                    onChange={(event) => setProductSlotRestrictionEnabled(event.target.checked)}
                  />
                  啟用固位限制
                </label>
                <p className="mt-1 text-xs text-slate-500">盲盒拆分商品可依子項角色判斷固位，留空時自動使用子項角色。</p>

                {productSlotRestrictionEnabled && (
                  <label className="mt-3 block">
                    限制角色
                    <select
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                      value={productSlotRestrictedCharacter}
                      onChange={(event) => setProductSlotRestrictedCharacter(event.target.value as CharacterName | "")}
                    >
                      <option value="">依子項角色自動判斷</option>
                      {CHARACTER_OPTIONS.map((character) => (
                        <option key={character} value={character}>{character}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white/60 p-3 text-sm text-slate-600">
                一般商品屬於代購模式，固定全員可喊，不使用固位限制。
              </div>
            )}

            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="圖片 URL（可留空）"
              value={productImageUrl}
              onChange={(event) => setProductImageUrl(event.target.value)}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
                type="number"
                min={0}
                placeholder="商品價格"
                value={productPrice}
                onChange={(event) => setProductPrice(event.target.value)}
              />
              <div className="rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
                價格為手動設定；盲盒子項若留空，會自動沿用母商品價格。
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {productType === "NORMAL" && (
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  type="number"
                  min={0}
                  placeholder="庫存（留空 = 不限量）"
                  value={productStock}
                  onChange={(event) => setProductStock(event.target.value)}
                />
              )}
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
                type="number"
                min={1}
                placeholder="每人上限（留空=不限）"
                value={productMaxPerUser}
                onChange={(event) => setProductMaxPerUser(event.target.value)}
              />
            </div>

            <button
              type="button"
              className="w-full rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-700"
              onClick={() => {
                const result = system.adminCreateProduct({
                  campaignId: productCampaignId,
                  name: productName,
                  series: productSeries,
                  type: productType,
                  character: productType === "NORMAL" && productCharacter ? productCharacter : null,
                  slotRestrictionEnabled: productType === "BLIND_BOX" ? productSlotRestrictionEnabled : false,
                  slotRestrictedCharacter:
                    productType === "BLIND_BOX" && productSlotRestrictionEnabled && productSlotRestrictedCharacter
                    ? productSlotRestrictedCharacter
                    : null,
                  imageUrl: productImageUrl || null,
                  price: productPrice.trim() ? Number(productPrice) : Number.NaN,
                  stock: productType === "NORMAL" && productStock.trim() ? Number(productStock) : null,
                  maxPerUser: productMaxPerUser.trim() ? Number(productMaxPerUser) : null,
                });
                setFeedback(result.message);
                if (result.ok) {
                  setProductName("");
                  setProductImageUrl("");
                  setProductCharacter("");
                  setProductPrice("120");
                  setProductStock("");
                  setProductMaxPerUser("");
                }
              }}
            >
              建立商品
            </button>
          </div>
        </section>
      </div>

      <section className="glass-card p-5">
        <h3 className="text-lg font-bold text-slate-900">新增盲盒角色子項（含圖片）</h3>
        <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
          <label className="block md:col-span-2">
            盲盒商品
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              value={blindProductId}
              onChange={(event) => setBlindProductId(event.target.value)}
              disabled={blindProducts.length === 0}
            >
              {blindProducts.length === 0 && <option value="">尚無盲盒商品</option>}
              {blindProducts.map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
          </label>

          <div className="flex items-center rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
            子項 SKU 由系統自動產生
          </div>
          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
            placeholder="子項名稱"
            value={blindName}
            onChange={(event) => setBlindName(event.target.value)}
          />

          <label className="block">
            角色
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              value={blindCharacter}
              onChange={(event) => setBlindCharacter(event.target.value as CharacterName)}
            >
              {CHARACTER_OPTIONS.map((character) => (
                <option key={character} value={character}>{character}</option>
              ))}
            </select>
          </label>

          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
            placeholder="圖片 URL（可留空）"
            value={blindImageUrl}
            onChange={(event) => setBlindImageUrl(event.target.value)}
          />

          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
            type="number"
            min={0}
            placeholder="子項價格（留空 = 跟母商品相同）"
            value={blindPrice}
            onChange={(event) => setBlindPrice(event.target.value)}
          />

          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
            type="number"
            min={0}
            placeholder="子項庫存（留空 = 不限量）"
            value={blindStock}
            onChange={(event) => setBlindStock(event.target.value)}
          />
          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
            type="number"
            min={1}
            placeholder="子項上限（留空=不限）"
            value={blindMaxPerUser}
            onChange={(event) => setBlindMaxPerUser(event.target.value)}
          />

          <button
            type="button"
            className="md:col-span-2 w-full rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={!blindProductId}
            onClick={() => {
              const result = system.adminCreateBlindBoxItem({
                productId: blindProductId,
                name: blindName,
                character: blindCharacter,
                imageUrl: blindImageUrl || null,
                price: blindPrice.trim() ? Number(blindPrice) : null,
                stock: blindStock.trim() ? Number(blindStock) : null,
                maxPerUser: blindMaxPerUser.trim() ? Number(blindMaxPerUser) : null,
              });
              setFeedback(result.message);
              if (result.ok) {
                setBlindName("");
                setBlindImageUrl("");
                setBlindPrice("");
                setBlindStock("");
                setBlindMaxPerUser("");
              }
            }}
          >
            建立盲盒子項
          </button>
        </div>

        {blindProductId && (
          <div className="mt-4 space-y-2 text-sm">
            <p className="font-semibold text-slate-900">目前子項</p>
            {selectedBlindItems.length === 0 && <p className="text-slate-500">此盲盒尚無子項。</p>}
            {selectedBlindItems.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 px-3 py-2">
                <p className="font-semibold text-slate-900">{item.name}</p>
                <p className="text-xs text-slate-500">
                  {item.sku} / {item.character} / 價格 {twd(selectedBlindProduct ? calculateUnitPrice(selectedBlindProduct, item) : 0)} / 庫存 {item.stock ?? "不限"} / 上限 {item.maxPerUser ?? "不限"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded border px-2 py-0.5 text-[11px]"
                    onClick={() => {
                      const value = window.prompt("子項價格（留空 = 跟母商品相同）", item.price === null ? "" : String(item.price));
                      if (value === null) return;
                      const result = value.trim() === ""
                        ? system.adminUpdateBlindBoxItemRule({ blindBoxItemId: item.id, price: null })
                        : system.adminUpdateBlindBoxItemRule({ blindBoxItemId: item.id, price: Number(value) });
                      setFeedback(result.message);
                    }}
                  >
                    設子項價格
                  </button>
                  <button
                    type="button"
                    className="rounded border px-2 py-0.5 text-[11px]"
                    onClick={() => {
                      const value = window.prompt("子項庫存（留空 = 不限量）", item.stock === null ? "" : String(item.stock));
                      if (value === null) return;
                      const result = value.trim() === ""
                        ? system.adminUpdateBlindBoxItemRule({ blindBoxItemId: item.id, stock: null })
                        : system.adminUpdateBlindBoxItemRule({ blindBoxItemId: item.id, stock: Number(value) });
                      setFeedback(result.message);
                    }}
                  >
                    設子項庫存
                  </button>
                  <button
                    type="button"
                    className="rounded border px-2 py-0.5 text-[11px]"
                    onClick={() => {
                      const value = window.prompt("子項每人上限（留空 = 不限）", item.maxPerUser === null ? "" : String(item.maxPerUser));
                      if (value === null) return;
                      const result = value.trim() === ""
                        ? system.adminUpdateBlindBoxItemRule({ blindBoxItemId: item.id, maxPerUser: null })
                        : system.adminUpdateBlindBoxItemRule({ blindBoxItemId: item.id, maxPerUser: Number(value) });
                      setFeedback(result.message);
                    }}
                  >
                    設子項上限
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {system.state.campaigns.map((campaign) => (
          <article key={campaign.id} className="glass-card p-5">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-lg font-bold text-slate-900">{campaign.title}</h3>
              <button
                type="button"
                className="rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700"
                onClick={() => {
                  const ok = window.confirm(`確定要刪除活動「${campaign.title}」？\n會一併刪除此活動下的商品、喊單、訂單與物流資料。`);
                  if (!ok) return;
                  const result = system.adminDeleteCampaign(campaign.id);
                  setFeedback(result.message);
                }}
              >
                刪除活動
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">目前：{releaseStageLabel(campaign.releaseStage)}</p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {stageOptions.map((stage) => (
                <button
                  key={stage}
                  type="button"
                  className={`rounded-lg border px-2 py-1 text-xs font-semibold ${
                    campaign.releaseStage === stage
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                  onClick={() => {
                    const result = system.adminUpdateCampaignReleaseStage(campaign.id, stage);
                    setFeedback(result.message);
                  }}
                >
                  {releaseStageLabel(stage)}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-2">
              {system.getProductsByCampaign(campaign.id).map((product) => (
                <div key={product.id} className="rounded-lg border border-slate-200 p-2">
                  <p className="text-xs font-semibold text-slate-900">{product.name}</p>
                  <p className="text-[11px] text-slate-500">系列：{product.series}</p>
                  <p className="text-[11px] text-slate-500">類型：{productTypeLabel(product.type)}</p>
                  <p className="text-[11px] text-slate-500">價格：{twd(product.price)}</p>
                  <p className="text-[11px] text-slate-500">上限：{product.maxPerUser ?? "不限"}</p>
                  <p className="text-[11px] text-slate-500">
                    {product.type === "BLIND_BOX"
                      ? `固位限制：${product.slotRestrictionEnabled
                        ? `啟用（${product.slotRestrictedCharacter ?? "依子項角色"}）`
                        : "關閉（全員）"}`
                      : "一般代購：全員可喊"}
                  </p>
                  {product.type === "NORMAL" && <p className="text-[11px] text-slate-500">庫存：{product.stock ?? "不限"}</p>}

                  <div className="mt-1 flex flex-wrap gap-1">
                    {product.type === "BLIND_BOX" && (
                      <>
                        <button
                          type="button"
                          className="rounded border px-2 py-0.5 text-[11px]"
                          onClick={() => {
                            const result = system.adminUpdateProductRule({
                              productId: product.id,
                              slotRestrictionEnabled: !product.slotRestrictionEnabled,
                              slotRestrictedCharacter: product.slotRestrictedCharacter,
                            });
                            setFeedback(result.message);
                          }}
                        >
                          {product.slotRestrictionEnabled ? "關固位限制" : "開固位限制"}
                        </button>

                        <button
                          type="button"
                          className="rounded border px-2 py-0.5 text-[11px]"
                          onClick={() => {
                            const value = window.prompt(
                              "設定限制角色（留空代表依子項角色判斷）",
                              product.slotRestrictedCharacter ?? "",
                            );
                            if (value === null) return;
                            if (value.trim() !== "" && !CHARACTER_OPTIONS.includes(value as CharacterName)) {
                              setFeedback("角色名稱無效。");
                              return;
                            }
                            const result = system.adminUpdateProductRule({
                              productId: product.id,
                              slotRestrictionEnabled: true,
                              slotRestrictedCharacter: value.trim() === "" ? null : value as CharacterName,
                            });
                            setFeedback(result.message);
                          }}
                        >
                          設限制角色
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      className="rounded border px-2 py-0.5 text-[11px]"
                      onClick={() => {
                        const value = window.prompt("此商品價格", String(product.price));
                        if (value === null) return;
                        const nextPrice = Number(value);
                        if (!Number.isFinite(nextPrice) || nextPrice < 0) {
                          setFeedback("價格必須是大於等於 0 的數字。");
                          return;
                        }
                        const result = system.adminUpdateProductRule({ productId: product.id, price: nextPrice });
                        setFeedback(result.message);
                      }}
                    >
                      設價格
                    </button>

                    <button
                      type="button"
                      className="rounded border px-2 py-0.5 text-[11px]"
                      onClick={() => {
                        const value = window.prompt("此商品每人上限（留空為不限）", product.maxPerUser ? String(product.maxPerUser) : "");
                        if (value === null) return;
                        const result = value.trim() === ""
                          ? system.adminUpdateProductRule({ productId: product.id, maxPerUser: null })
                          : system.adminUpdateProductRule({ productId: product.id, maxPerUser: Number(value) });
                        setFeedback(result.message);
                      }}
                    >
                      設上限
                    </button>

                    {product.type === "NORMAL" && (
                      <button
                        type="button"
                        className="rounded border px-2 py-0.5 text-[11px]"
                        onClick={() => {
                          const value = window.prompt("此商品庫存（留空為不限量）", product.stock === null ? "" : String(product.stock));
                          if (value === null) return;
                          const result = value.trim() === ""
                            ? system.adminUpdateProductRule({ productId: product.id, stock: null })
                            : system.adminUpdateProductRule({ productId: product.id, stock: Number(value) });
                          setFeedback(result.message);
                        }}
                      >
                        設庫存
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>

      <div className="glass-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-bold text-slate-900">角色固位分配</h3>
          <button
            type="button"
            className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
            onClick={() => {
              const result = system.adminAutoAssignCharacterSlots(selectedCharacter);
              setFeedback(result.message);
            }}
          >
            自動分配 {selectedCharacter}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {CHARACTER_OPTIONS.map((character) => (
            <button
              key={character}
              type="button"
              className={`rounded-lg border px-3 py-1 text-xs font-semibold ${
                selectedCharacter === character ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200"
              }`}
              onClick={() => setSelectedCharacter(character)}
            >
              {character}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          {members.map((member) => {
            const tier = system.getUserCharacterTier(member.id, selectedCharacter);
            return (
              <div key={member.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{member.fbNickname}</p>
                  <p className="text-xs text-slate-500">{selectedCharacter} 目前：{tier ? fixedTierLabel(tier) : "無（預設）"}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {characterTierOptions.map((optionTier) => (
                    <button
                      key={optionTier}
                      type="button"
                      className={`rounded border px-2 py-1 text-xs ${
                        tier === optionTier ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200"
                      }`}
                      onClick={() => {
                        const result = system.adminAssignCharacterSlot({
                          userId: member.id,
                          character: selectedCharacter,
                          tier: optionTier,
                        });
                        setFeedback(result.message);
                      }}
                    >
                      {fixedTierLabel(optionTier)}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`rounded border px-2 py-1 text-xs ${
                      tier === null ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200"
                    }`}
                    onClick={() => {
                      const result = system.adminAssignCharacterSlot({
                        userId: member.id,
                        character: selectedCharacter,
                        tier: null,
                      });
                      setFeedback(result.message);
                    }}
                  >
                    無
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function AdminConsoleView(props: {
  system: UseOrderSystemReturn;
  onBackToShop: () => void;
  activeTab: AdminTab;
  onChangeTab: (tab: AdminTab) => void;
}): JSX.Element {
  const { system, onBackToShop, activeTab, onChangeTab } = props;
  const [feedback, setFeedback] = useState("");
  const [exportCampaignId, setExportCampaignId] = useState(system.state.campaigns[0]?.id ?? "");
  const [claimCampaignFilter, setClaimCampaignFilter] = useState<string>("ALL");
  const [claimStatusFilter, setClaimStatusFilter] = useState<ClaimStatusFilter>("ALL");
  const [claimKeyword, setClaimKeyword] = useState("");

  useEffect(() => {
    if (!system.state.campaigns.length) {
      setExportCampaignId("");
      return;
    }
    if (!exportCampaignId || !system.state.campaigns.some((item) => item.id === exportCampaignId)) {
      setExportCampaignId(system.state.campaigns[0].id);
    }
  }, [exportCampaignId, system.state.campaigns]);

  const userById = useMemo(() => new Map(system.state.users.map((user) => [user.id, user])), [system.state.users]);
  const campaignById = useMemo(
    () => new Map(system.state.campaigns.map((campaign) => [campaign.id, campaign])),
    [system.state.campaigns],
  );
  const productById = useMemo(() => new Map(system.state.products.map((product) => [product.id, product])), [system.state.products]);
  const blindItemById = useMemo(
    () => new Map(system.state.blindBoxItems.map((item) => [item.id, item])),
    [system.state.blindBoxItems],
  );
  const orderItemsByOrderId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof system.getOrderItems>>();
    system.state.orders.forEach((order) => {
      map.set(order.id, system.getOrderItems(order.id));
    });
    return map;
  }, [system, system.state.orders, system.state.orderItems]);

  const allClaims = useMemo(
    () => [...system.state.claims].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [system.state.claims],
  );
  const allOrders = useMemo(
    () => [...system.state.orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [system.state.orders],
  );
  const allPayments = useMemo(
    () => [...system.state.payments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [system.state.payments],
  );
  const allShipments = useMemo(
    () => [...system.state.shipments].sort((a, b) => a.campaignId.localeCompare(b.campaignId)),
    [system.state.shipments],
  );
  const recentPayments = useMemo(() => allPayments.slice(0, 8), [allPayments]);

  const visibleClaims = useMemo(() => {
    const keyword = claimKeyword.trim().toLowerCase();
    return allClaims.filter((claim) => {
      if (claimCampaignFilter !== "ALL" && claim.campaignId !== claimCampaignFilter) return false;
      if (claimStatusFilter !== "ALL" && claim.status !== claimStatusFilter) return false;
      if (!keyword) return true;

      const user = userById.get(claim.userId);
      const product = productById.get(claim.productId);
      const blindItem = claim.blindBoxItemId ? blindItemById.get(claim.blindBoxItemId) : null;
      const campaign = campaignById.get(claim.campaignId);

      const text = [
        user?.fbNickname ?? "",
        user?.email ?? "",
        product?.name ?? "",
        product?.sku ?? "",
        blindItem?.name ?? "",
        campaign?.title ?? "",
      ].join(" ").toLowerCase();

      return text.includes(keyword);
    });
  }, [
    allClaims,
    blindItemById,
    campaignById,
    claimCampaignFilter,
    claimKeyword,
    claimStatusFilter,
    productById,
    userById,
  ]);

  const memberRows = useMemo(() => {
    const slotsByUser = new Map<string, CharacterSlot[]>();
    system.state.characterSlots.forEach((slot) => {
      const existing = slotsByUser.get(slot.userId);
      if (existing) {
        existing.push(slot);
        return;
      }
      slotsByUser.set(slot.userId, [slot]);
    });

    return system.state.users
      .map((user) => {
        const orders = system.state.orders.filter((order) => order.userId === user.id);
        const orderTotal = orders.reduce((sum, order) => sum + order.totalAmount, 0);
        const pendingClaims = system.state.claims.filter(
          (claim) => claim.userId === user.id && claim.status === "LOCKED",
        ).length;
        const slotSummary = formatCharacterSlotSummary(slotsByUser.get(user.id) ?? []);
        return {
          user,
          orderCount: orders.length,
          orderTotal,
          pendingClaims,
          slotSummary,
        };
      })
      .sort((a, b) => Number(b.user.isAdmin) - Number(a.user.isAdmin) || a.user.fbNickname.localeCompare(b.user.fbNickname));
  }, [system.state.characterSlots, system.state.claims, system.state.orders, system.state.users]);

  const dashboardStats = useMemo(() => {
    const totalOrderAmount = system.state.orders.reduce((sum, order) => sum + order.totalAmount, 0);
    return {
      users: system.state.users.length,
      admins: system.state.users.filter((user) => user.isAdmin).length,
      claimsLocked: system.state.claims.filter((claim) => claim.status === "LOCKED").length,
      claimsConfirmed: system.state.claims.filter((claim) => claim.status === "CONFIRMED").length,
      orders: system.state.orders.length,
      paymentsPending: system.state.payments.filter((payment) => !payment.reconciled).length,
      shipments: system.state.shipments.length,
      totalOrderAmount,
    };
  }, [system.state.claims, system.state.orders, system.state.payments, system.state.shipments, system.state.users]);

  return (
    <section className="space-y-5">
      <div className="glass-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900">管理員後台（獨立頁）</h2>
            <p className="mt-2 text-sm text-slate-600">你可以在這裡查看所有帳號、所有訂單，並執行完整團主管理操作。</p>
          </div>
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
            onClick={onBackToShop}
          >
            返回商城頁
          </button>
        </div>
        {feedback && <p className="mt-3 text-sm font-semibold text-slate-800">{feedback}</p>}
      </div>

      <div className="glass-card p-3">
        <div className="flex flex-wrap gap-2">
          {adminTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                activeTab === item.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"
              }`}
              onClick={() => onChangeTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "dashboard" && (
        <section className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="glass-card p-4"><p className="text-xs text-slate-500">帳號總數</p><p className="mt-1 text-2xl font-extrabold text-slate-900">{dashboardStats.users}</p></div>
            <div className="glass-card p-4"><p className="text-xs text-slate-500">管理員</p><p className="mt-1 text-2xl font-extrabold text-slate-900">{dashboardStats.admins}</p></div>
            <div className="glass-card p-4"><p className="text-xs text-slate-500">待審喊單</p><p className="mt-1 text-2xl font-extrabold text-slate-900">{dashboardStats.claimsLocked}</p></div>
            <div className="glass-card p-4"><p className="text-xs text-slate-500">已確認喊單</p><p className="mt-1 text-2xl font-extrabold text-slate-900">{dashboardStats.claimsConfirmed}</p></div>
            <div className="glass-card p-4"><p className="text-xs text-slate-500">訂單數</p><p className="mt-1 text-2xl font-extrabold text-slate-900">{dashboardStats.orders}</p></div>
            <div className="glass-card p-4"><p className="text-xs text-slate-500">待對帳付款</p><p className="mt-1 text-2xl font-extrabold text-slate-900">{dashboardStats.paymentsPending}</p></div>
            <div className="glass-card p-4"><p className="text-xs text-slate-500">物流筆數</p><p className="mt-1 text-2xl font-extrabold text-slate-900">{dashboardStats.shipments}</p></div>
            <div className="glass-card p-4"><p className="text-xs text-slate-500">訂單總金額</p><p className="mt-1 text-2xl font-extrabold text-slate-900">{twd(dashboardStats.totalOrderAmount)}</p></div>
          </div>

          <div className="glass-card p-5">
            <h3 className="text-lg font-bold text-slate-900">最近付款（總覽快速對帳）</h3>
            <div className="mt-4 space-y-3">
              {recentPayments.length === 0 && <p className="text-sm text-slate-500">目前沒有付款資料。</p>}
              {recentPayments.map((payment) => {
                const campaign = campaignById.get(payment.campaignId);
                const user = userById.get(payment.userId);
                return (
                  <article key={payment.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-bold text-slate-900">{campaign?.title ?? "未知活動"}</p>
                        <p className="text-xs text-slate-500">
                          會員：{user?.fbNickname ?? "未知會員"} / {formatDate(payment.createdAt)}
                        </p>
                        <p className="text-sm text-slate-700">
                          金額：{twd(payment.amount)} / 方式：{paymentLabel[payment.method]} / 末五碼：{payment.lastFiveCode}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                        onClick={() => {
                          const result = system.reconcilePayment(payment.id);
                          setFeedback(result.message);
                        }}
                        disabled={payment.reconciled}
                      >
                        {payment.reconciled ? "已對帳" : "標記對帳完成"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {activeTab === "members" && (
        <section className="glass-card p-5">
          <h3 className="text-lg font-bold text-slate-900">帳號總覽</h3>
          <p className="mt-1 text-sm text-slate-600">可直接調整管理員權限與取貨率，並檢視每位會員訂單表現。</p>
          <div className="mt-4 space-y-3">
            {memberRows.map(({ user, orderCount, orderTotal, pendingClaims, slotSummary }) => (
              <article key={user.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-bold text-slate-900">{user.fbNickname}</p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      身分：{user.isAdmin ? "管理員" : "會員"} / 角色固位：{slotSummary} / 取貨率：{user.pickupRate}%
                    </p>
                    <p className="text-xs text-slate-500">
                      訂單 {orderCount} 筆 / 累計 {twd(orderTotal)} / 待審喊單 {pendingClaims}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold"
                      onClick={async () => {
                        const result = await system.adminSetUserAdmin(user.id, !user.isAdmin);
                        setFeedback(result.message);
                      }}
                      disabled={user.id === system.currentUser?.id}
                    >
                      {user.isAdmin ? "取消管理員" : "設為管理員"}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold"
                      onClick={() => {
                        const value = window.prompt("請輸入新的取貨率（0-100）", String(user.pickupRate));
                        if (value === null) return;
                        const result = system.adminUpdateUserPickupRate(user.id, Number(value));
                        setFeedback(result.message);
                      }}
                    >
                      調整取貨率
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-60"
                      disabled={user.id === system.currentUser?.id}
                      onClick={async () => {
                        const ok = window.confirm(
                          `確定要刪除 ${user.fbNickname}？\n這會移除該帳號與其相關的購物車/喊單/訂單/物流資料。`,
                        );
                        if (!ok) return;
                        const result = await system.adminDeleteUser(user.id);
                        setFeedback(result.message);
                      }}
                    >
                      刪除帳號
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === "claims" && (
        <section className="glass-card p-5">
          <h3 className="text-lg font-bold text-slate-900">全站喊單總表</h3>
          <p className="mt-1 text-sm text-slate-600">可篩選所有喊單並快速確認/取消。</p>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <label className="block text-sm">
              活動
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={claimCampaignFilter}
                onChange={(event) => setClaimCampaignFilter(event.target.value)}
              >
                <option value="ALL">全部活動</option>
                {system.state.campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>{campaign.title}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              狀態
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={claimStatusFilter}
                onChange={(event) => setClaimStatusFilter(event.target.value as ClaimStatusFilter)}
              >
                <option value="ALL">全部狀態</option>
                <option value="LOCKED">LOCKED</option>
                <option value="CONFIRMED">CONFIRMED</option>
                <option value="CANCELLED_BY_ADMIN">CANCELLED_BY_ADMIN</option>
              </select>
            </label>
            <label className="block text-sm md:col-span-2">
              搜尋
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                placeholder="會員 / Email / 商品 / SKU / 活動"
                value={claimKeyword}
                onChange={(event) => setClaimKeyword(event.target.value)}
              />
            </label>
          </div>
          <div className="mt-4 space-y-3">
            {visibleClaims.length === 0 && <p className="text-sm text-slate-500">目前沒有符合條件的喊單資料。</p>}
            {visibleClaims.map((claim) => {
              const campaign = campaignById.get(claim.campaignId);
              const product = productById.get(claim.productId);
              const blindItem = claim.blindBoxItemId ? blindItemById.get(claim.blindBoxItemId) : null;
              const user = userById.get(claim.userId);
              const label = blindItem
                ? `${product?.name ?? "未知商品"} / ${blindItem.name}`
                : product?.name ?? "未知商品";
              const queue = system.getClaimQueue(claim.campaignId, claim.productId, claim.blindBoxItemId ?? undefined);
              const rank = queue.findIndex((item) => item.id === claim.id) + 1;
              const stock = claim.blindBoxItemId ? (blindItem?.stock ?? null) : (product?.stock ?? null);

              return (
                <article key={claim.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-bold text-slate-900">{label}</p>
                      <p className="text-xs text-slate-500">
                        {campaign?.title ?? "未知活動"} / {user?.fbNickname ?? "未知會員"} / {formatDate(claim.createdAt)}
                      </p>
                      <p className="text-xs text-slate-500">
                        狀態：{claim.status} / 順位：{rank > 0 ? rank : "-"} / 名額：{stock ?? "不限"}
                      </p>
                      <p className="text-xs text-slate-600">{formatClaimPrioritySummary(product, claim.roleTier)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold"
                        onClick={() => {
                          const result = system.adminConfirmClaim(claim.id);
                          setFeedback(result.message);
                        }}
                        disabled={claim.status !== "LOCKED"}
                      >
                        確認分配
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700"
                        onClick={() => {
                          const result = system.adminCancelClaim(claim.id);
                          setFeedback(result.message);
                        }}
                        disabled={claim.status === "CANCELLED_BY_ADMIN"}
                      >
                        取消喊單
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {activeTab === "orders" && (
        <section className="glass-card p-5">
          <h3 className="text-lg font-bold text-slate-900">全站訂單</h3>
          <div className="mt-4 space-y-3">
            {allOrders.length === 0 && <p className="text-sm text-slate-500">目前沒有訂單。</p>}
            {allOrders.map((order) => {
              const campaign = campaignById.get(order.campaignId);
              const user = userById.get(order.userId);
              const items = orderItemsByOrderId.get(order.id) ?? [];
              return (
                <article key={order.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-bold text-slate-900">{campaign?.title ?? "未知活動"}</p>
                      <p className="text-xs text-slate-500">
                        訂單：{order.id.slice(0, 8)} / 會員：{user?.fbNickname ?? "未知會員"} / {formatDate(order.createdAt)}
                      </p>
                      <p className="text-sm font-semibold text-slate-700">總額：{twd(order.totalAmount)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {orderStatusOptions.map((status) => (
                        <button
                          key={status}
                          type="button"
                          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                            order.status === status ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200"
                          }`}
                          onClick={() => {
                            const result = system.adminUpdateOrderStatus(order.id, status);
                            setFeedback(result.message);
                          }}
                        >
                          {orderStatusLabel[status]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-slate-600">
                    {items.map((item) => {
                      const product = productById.get(item.productId);
                      const blindItem = item.blindBoxItemId ? blindItemById.get(item.blindBoxItemId) : null;
                      const label = blindItem
                        ? `${product?.name ?? "未知商品"} / ${blindItem.name}`
                        : product?.name ?? "未知商品";
                      return <p key={item.id}>- {label} x {item.qty}（{twd(item.unitPrice)}）</p>;
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {activeTab === "shipping" && (
        <section className="space-y-4">
          <div className="glass-card p-5">
            <h3 className="text-lg font-bold text-slate-900">物流與賣貨便匯出</h3>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={exportCampaignId}
                onChange={(event) => setExportCampaignId(event.target.value)}
              >
                {system.state.campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>{campaign.title}</option>
                ))}
              </select>
              <button
                type="button"
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                onClick={() => {
                  const csv = system.exportMyShipCsv(exportCampaignId);
                  downloadTextFile(`shipments-${exportCampaignId}.csv`, csv, "text/csv;charset=utf-8");
                  setFeedback("已匯出賣貨便 CSV。");
                }}
                disabled={!exportCampaignId}
              >
                匯出指定活動 CSV
              </button>
            </div>
          </div>

          <div className="glass-card p-5">
            <h3 className="text-lg font-bold text-slate-900">物流資料清單</h3>
            <div className="mt-4 space-y-3">
              {allShipments.length === 0 && <p className="text-sm text-slate-500">目前沒有物流資料。</p>}
              {allShipments.map((shipment) => {
                const campaign = campaignById.get(shipment.campaignId);
                const user = userById.get(shipment.userId);
                return (
                  <article key={shipment.id} className="rounded-xl border border-slate-200 p-4">
                    <p className="text-base font-bold text-slate-900">{campaign?.title ?? "未知活動"}</p>
                    <p className="text-xs text-slate-500">
                      會員：{user?.fbNickname ?? "未知會員"} / 付款：{paymentLabel[shipment.paymentMethod]} / 可 COD：{shipment.canUseCod ? "是" : "否"}
                    </p>
                    <p className="text-sm text-slate-700">
                      收件：{shipment.receiverName} / {shipment.receiverPhone} / 門市：{shipment.receiverStoreCode}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {activeTab === "settings" && <AdminSettingsPanel system={system} />}
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

  const currentUserSlotSummary = useMemo(() => {
    const userId = system.currentUser?.id;
    if (!userId) return "未分配";
    return formatCharacterSlotSummary(system.state.characterSlots.filter((slot) => slot.userId === userId));
  }, [system.currentUser?.id, system.state.characterSlots]);

  const navigateRoot = (route: RootRoute): void => {
    window.location.hash = route === "admin" ? "/admin" : "/";
    setRootRoute(route);
    if (route === "admin") setAdminTab("dashboard");
  };

  const navigateAdminTab = (tab: AdminTab): void => {
    window.location.hash = tab === "dashboard" ? "/admin" : `/admin/${tab}`;
    setRootRoute("admin");
    setAdminTab(tab);
  };

  if (!system.currentUser) {
    return (
      <main className="site-shell grid min-h-screen place-items-center px-4 py-12 grid-bg">
        <AuthCard onLogin={system.login} onRegister={system.register} />
      </main>
    );
  }

  if (rootRoute === "admin") {
    return (
      <main className="site-shell min-h-screen px-4 py-6 md:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl space-y-5">
          <motion.header
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Tsukuyomi Admin Cosmos</p>
                <h1 className="mt-1 text-3xl font-extrabold text-slate-900">超時空輝耀姬・管理後台</h1>
                <p className="mt-2 text-sm text-slate-600">登入帳號：{system.currentUser.fbNickname}（{system.currentUser.email}）</p>
                <p className="text-xs text-slate-500">資料模式：{isSupabaseEnabled ? "Supabase 已連線" : "Demo Local 模式"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                  onClick={() => navigateRoot("shop")}
                >
                  前往商城頁
                </button>
                <button
                  onClick={system.logout}
                  className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700"
                  type="button"
                >
                  登出
                </button>
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
            <div className="glass-card p-5 text-sm text-slate-600">
              <p>你目前沒有管理員權限，無法進入後台。</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={async () => {
                    const result = await system.refreshCurrentUserAdminFlag();
                    setPermissionSyncFeedback(result.message);
                  }}
                >
                  重新同步管理員權限
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
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
    <main className="site-shell min-h-screen px-4 py-6 md:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl space-y-5">
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Tsukuyomi Order Cosmos</p>
              <h1 className="mt-1 text-3xl font-extrabold text-slate-900">超時空輝耀姬・活動導覽與拆分系統</h1>
              <p className="mt-2 text-sm text-slate-600">你好，{system.currentUser.fbNickname}（{system.currentUser.email}）</p>
              <p className="text-xs text-slate-500">
                身分：{system.currentUser.isAdmin ? "管理員" : "會員"} / 角色固位：{currentUserSlotSummary} / 取貨率：
                {system.currentUser.pickupRate}%
              </p>
              <p className="text-xs text-slate-500">
                資料模式：{isSupabaseEnabled ? "Supabase 已連線（可接正式資料）" : "Demo Local 模式（未設定 Supabase）"}
              </p>
              {!system.currentUser.isAdmin && isSupabaseEnabled && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={async () => {
                      const result = await system.refreshCurrentUserAdminFlag();
                      setPermissionSyncFeedback(result.message);
                    }}
                  >
                    重新同步管理員權限
                  </button>
                  {permissionSyncFeedback && <p className="text-xs text-slate-500">{permissionSyncFeedback}</p>}
                </div>
              )}
            </div>

            <HeaderNav currentView={view} setView={setView} system={system} onGoAdmin={() => navigateAdminTab("dashboard")} />
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
          <div className="glass-card p-5 text-sm text-slate-600">請先從大主頁選擇活動。</div>
        )}

        {view === "blindBox" && (!selectedCampaign || !selectedBlindProduct) && (
          <div className="glass-card p-5 text-sm text-slate-600">請先從活動頁進入盲盒商品。</div>
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
    </main>
  );
}
