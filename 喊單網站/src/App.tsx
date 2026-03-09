import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AuthCard } from "./components/AuthCard";
import type { UseOrderSystemReturn } from "./hooks/useOrderSystem";
import { useOrderSystem } from "./hooks/useOrderSystem";
import { CHARACTER_OPTIONS, PRODUCT_SERIES_OPTIONS } from "./lib/constants";
import {
  fixedTierLabel,
  formatDate,
  orderStatusLabel,
  productRequiredTierLabel,
  productTypeLabel,
  releaseStageLabel,
  roleLabel,
  twd,
} from "./lib/format";
import { isSupabaseEnabled } from "./lib/supabase";
import type {
  Campaign,
  CharacterName,
  CharacterTier,
  PricingMode,
  Product,
  ProductRequiredTier,
  ProductSeries,
  ProductType,
  ReleaseStage,
} from "./types/domain";

type PageView = "home" | "campaign" | "blindBox" | "cart" | "me" | "admin";

const stageOptions: ReleaseStage[] = ["FIXED_1_ONLY", "FIXED_1_2", "FIXED_1_2_3", "ALL_OPEN"];
const requiredTierOptions: ProductRequiredTier[] = ["FIXED_1", "FIXED_2", "FIXED_3", "LEAK_PICK"];
const characterTierOptions: CharacterTier[] = ["FIXED_1", "FIXED_2", "FIXED_3", "LEAK_PICK"];
const productTypeOptions: ProductType[] = ["NORMAL", "BLIND_BOX"];
const pricingModeOptions: PricingMode[] = ["DYNAMIC", "AVERAGE_WITH_BINDING"];

function HeaderNav(props: {
  currentView: PageView;
  setView: (view: PageView) => void;
  system: UseOrderSystemReturn;
}): JSX.Element {
  const { currentView, setView, system } = props;
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
        <button className={buttonClass("admin")} type="button" onClick={() => setView("admin")}>活動設定</button>
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
  const [selectedSeries, setSelectedSeries] = useState<ProductSeries>(PRODUCT_SERIES_OPTIONS[0]);
  const [keyword, setKeyword] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [sortBy, setSortBy] = useState<"popular" | "priceAsc" | "priceDesc">("popular");
  const products = system.getProductsByCampaign(campaign.id);
  const cartItems = system.getMyCartItems(campaign.id);
  const cartMap = new Map(cartItems.map((item) => [`${item.productId}::${item.blindBoxItemId ?? "none"}`, item]));
  const seriesGroups = useMemo(() => {
    return PRODUCT_SERIES_OPTIONS.map((series) => ({
      series,
      products: products.filter((item) => item.series === series),
    })).filter((group) => group.products.length > 0);
  }, [products]);

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
      price: campaign.pricingMode === "DYNAMIC"
        ? (product.isPopular ? product.hotPrice : product.coldPrice)
        : product.averagePrice,
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
      if (a.product.isPopular === b.product.isPopular) return a.product.name.localeCompare(b.product.name);
      return a.product.isPopular ? -1 : 1;
    });

    return sorted.map((item) => item.product);
  }, [campaign.id, campaign.pricingMode, keyword, onlyAvailable, selectedSeriesProducts, sortBy, system]);

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
                onChange={(event) => setSortBy(event.target.value as "popular" | "priceAsc" | "priceDesc")}
              >
                <option value="popular">熱門優先</option>
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
          const slotCharacter = product.slotRestrictionEnabled ? product.slotRestrictedCharacter : null;
          const myTier = system.currentUser && slotCharacter
            ? system.getUserCharacterTier(system.currentUser.id, slotCharacter)
            : null;
          const price = campaign.pricingMode === "DYNAMIC"
            ? (product.isPopular ? product.hotPrice : product.coldPrice)
            : product.averagePrice;
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
                <span className={`state-pill ${product.isPopular ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                  {product.isPopular ? "熱門" : "一般"}
                </span>
              </div>

              <div className="mt-3 space-y-1 text-sm text-slate-600">
                <p>單價：{twd(price)}</p>
                <p>固位：{productRequiredTierLabel(product.requiredTier)}</p>
                <p>固位限制：{product.slotRestrictionEnabled ? "啟用" : "關閉（全員可喊）"}</p>

                {product.type === "NORMAL" && (
                  <>
                    <p>商品角色：{product.character ?? "-"}</p>
                    {product.slotRestrictionEnabled && (
                      <p>限制角色：{slotCharacter ?? "-"} / 你的固位：{myTier ? fixedTierLabel(myTier) : "未分配"}</p>
                    )}
                    <p>上限：{product.maxPerUser ?? "不限"} / 已加入：{myQty}</p>
                  </>
                )}

                {product.type === "BLIND_BOX" && (
                  <>
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
          <span className="state-pill bg-slate-100 text-slate-700">商品固位：{productRequiredTierLabel(product.requiredTier)}</span>
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
                <p>你的角色固位：{myTier ? fixedTierLabel(myTier) : "未分配"}</p>
                <p>子項庫存：{item.stock}</p>
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
          if (!campaign || !product) return sum;
          const price = campaign.pricingMode === "DYNAMIC"
            ? (product.isPopular ? product.hotPrice : product.coldPrice)
            : product.averagePrice;
          return sum + price * item.qty;
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
                  <p className="text-xs text-slate-600">資格：{roleLabel(claim.roleTier)}</p>
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

function AdminView(props: { system: UseOrderSystemReturn }): JSX.Element {
  const { system } = props;
  const [feedback, setFeedback] = useState("");
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterName>("八千代");

  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");
  const [campaignDeadlineAt, setCampaignDeadlineAt] = useState("");
  const [campaignPricingMode, setCampaignPricingMode] = useState<PricingMode>("DYNAMIC");
  const [campaignReleaseStage, setCampaignReleaseStage] = useState<ReleaseStage>("FIXED_1_ONLY");

  const [productCampaignId, setProductCampaignId] = useState(system.state.campaigns[0]?.id ?? "");
  const [productType, setProductType] = useState<ProductType>("NORMAL");
  const [productSeries, setProductSeries] = useState<ProductSeries>("Q版系列");
  const [productSku, setProductSku] = useState("");
  const [productName, setProductName] = useState("");
  const [productCharacter, setProductCharacter] = useState<CharacterName>("八千代");
  const [productSlotRestrictionEnabled, setProductSlotRestrictionEnabled] = useState(true);
  const [productSlotRestrictedCharacter, setProductSlotRestrictedCharacter] = useState<CharacterName>("八千代");
  const [productRequiredTier, setProductRequiredTier] = useState<ProductRequiredTier>("FIXED_1");
  const [productImageUrl, setProductImageUrl] = useState("");
  const [productIsPopular, setProductIsPopular] = useState(true);
  const [productHotPrice, setProductHotPrice] = useState("120");
  const [productColdPrice, setProductColdPrice] = useState("80");
  const [productAveragePrice, setProductAveragePrice] = useState("95");
  const [productStock, setProductStock] = useState("10");
  const [productMaxPerUser, setProductMaxPerUser] = useState("1");

  const blindProducts = useMemo(
    () => system.state.products.filter((product) => product.type === "BLIND_BOX"),
    [system.state.products],
  );

  const [blindProductId, setBlindProductId] = useState("");
  const [blindSku, setBlindSku] = useState("");
  const [blindName, setBlindName] = useState("");
  const [blindCharacter, setBlindCharacter] = useState<CharacterName>("八千代");
  const [blindImageUrl, setBlindImageUrl] = useState("");
  const [blindStock, setBlindStock] = useState("1");
  const [blindMaxPerUser, setBlindMaxPerUser] = useState("1");

  useEffect(() => {
    if (!productCampaignId && system.state.campaigns[0]) {
      setProductCampaignId(system.state.campaigns[0].id);
    }
  }, [productCampaignId, system.state.campaigns]);

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

  return (
    <section className="space-y-5">
      <div className="glass-card p-5">
        <h2 className="text-2xl font-extrabold text-slate-900">活動設定（管理員）</h2>
        <p className="mt-2 text-sm text-slate-600">可新增活動、商品、盲盒子項，並維持每個商品必填商品級固位。</p>
        {feedback && <p className="mt-2 text-sm font-semibold text-slate-800">{feedback}</p>}
      </div>

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
              定價模式
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={campaignPricingMode}
                onChange={(event) => setCampaignPricingMode(event.target.value as PricingMode)}
              >
                {pricingModeOptions.map((mode) => (
                  <option key={mode} value={mode}>{mode}</option>
                ))}
              </select>
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
                  pricingMode: campaignPricingMode,
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
                商品系列
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={productSeries}
                  onChange={(event) => setProductSeries(event.target.value as ProductSeries)}
                >
                  {PRODUCT_SERIES_OPTIONS.map((series) => (
                    <option key={series} value={series}>{series}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                商品固位（必填）
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={productRequiredTier}
                  onChange={(event) => setProductRequiredTier(event.target.value as ProductRequiredTier)}
                >
                  {requiredTierOptions.map((tier) => (
                    <option key={tier} value={tier}>{productRequiredTierLabel(tier)}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
                placeholder="SKU"
                value={productSku}
                onChange={(event) => setProductSku(event.target.value)}
              />
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
                placeholder="商品名稱"
                value={productName}
                onChange={(event) => setProductName(event.target.value)}
              />
            </div>

            {productType === "NORMAL" && (
              <label className="block">
                角色
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={productCharacter}
                  onChange={(event) => {
                    const next = event.target.value as CharacterName;
                    setProductCharacter(next);
                    if (!productSlotRestrictedCharacter) {
                      setProductSlotRestrictedCharacter(next);
                    }
                  }}
                >
                  {CHARACTER_OPTIONS.map((character) => (
                    <option key={character} value={character}>{character}</option>
                  ))}
                </select>
              </label>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white/60 p-3 text-sm">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={productSlotRestrictionEnabled}
                  onChange={(event) => setProductSlotRestrictionEnabled(event.target.checked)}
                />
                啟用固位限制
              </label>
              <p className="mt-1 text-xs text-slate-500">關閉後此商品全員可喊，不看角色固位。</p>

              {productSlotRestrictionEnabled && (
                <label className="mt-3 block">
                  限制角色
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                    value={productSlotRestrictedCharacter}
                    onChange={(event) => setProductSlotRestrictedCharacter(event.target.value as CharacterName)}
                  >
                    {CHARACTER_OPTIONS.map((character) => (
                      <option key={character} value={character}>{character}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="圖片 URL（可留空）"
              value={productImageUrl}
              onChange={(event) => setProductImageUrl(event.target.value)}
            />

            <div className="grid gap-3 sm:grid-cols-3">
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
                type="number"
                min={0}
                placeholder="熱門價"
                value={productHotPrice}
                onChange={(event) => setProductHotPrice(event.target.value)}
              />
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
                type="number"
                min={0}
                placeholder="冷門價"
                value={productColdPrice}
                onChange={(event) => setProductColdPrice(event.target.value)}
              />
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
                type="number"
                min={0}
                placeholder="均價"
                value={productAveragePrice}
                onChange={(event) => setProductAveragePrice(event.target.value)}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {productType === "NORMAL" && (
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  type="number"
                  min={0}
                  placeholder="庫存"
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

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={productIsPopular}
                onChange={(event) => setProductIsPopular(event.target.checked)}
              />
              熱門商品
            </label>

            <button
              type="button"
              className="w-full rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-700"
              onClick={() => {
                const result = system.adminCreateProduct({
                  campaignId: productCampaignId,
                  sku: productSku,
                  name: productName,
                  series: productSeries,
                  type: productType,
                  character: productType === "NORMAL" ? productCharacter : null,
                  slotRestrictionEnabled: productSlotRestrictionEnabled,
                  slotRestrictedCharacter: productSlotRestrictionEnabled ? productSlotRestrictedCharacter : null,
                  requiredTier: productRequiredTier,
                  imageUrl: productImageUrl || null,
                  isPopular: productIsPopular,
                  hotPrice: Number(productHotPrice),
                  coldPrice: Number(productColdPrice),
                  averagePrice: Number(productAveragePrice),
                  stock: productType === "NORMAL" ? Number(productStock) : null,
                  maxPerUser: productMaxPerUser.trim() ? Number(productMaxPerUser) : null,
                });
                setFeedback(result.message);
                if (result.ok) {
                  setProductSku("");
                  setProductName("");
                  setProductImageUrl("");
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

          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
            placeholder="子項 SKU"
            value={blindSku}
            onChange={(event) => setBlindSku(event.target.value)}
          />
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
            placeholder="子項庫存"
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
                sku: blindSku,
                name: blindName,
                character: blindCharacter,
                imageUrl: blindImageUrl || null,
                stock: Number(blindStock),
                maxPerUser: blindMaxPerUser.trim() ? Number(blindMaxPerUser) : null,
              });
              setFeedback(result.message);
              if (result.ok) {
                setBlindSku("");
                setBlindName("");
                setBlindImageUrl("");
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
                <p className="text-xs text-slate-500">{item.sku} / {item.character} / 庫存 {item.stock} / 上限 {item.maxPerUser ?? "不限"}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {system.state.campaigns.map((campaign) => (
          <article key={campaign.id} className="glass-card p-5">
            <h3 className="text-lg font-bold text-slate-900">{campaign.title}</h3>
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
                  <p className="text-[11px] text-slate-500">需求：{productRequiredTierLabel(product.requiredTier)} / 上限：{product.maxPerUser ?? "不限"}</p>
                  <p className="text-[11px] text-slate-500">
                    固位限制：{product.slotRestrictionEnabled ? `啟用（${product.slotRestrictedCharacter ?? "未設定"}）` : "關閉（全員）"}
                  </p>
                  {product.type === "NORMAL" && <p className="text-[11px] text-slate-500">庫存：{product.stock ?? 0}</p>}

                  <div className="mt-1 flex flex-wrap gap-1">
                    {requiredTierOptions.map((tier) => (
                      <button
                        key={tier}
                        type="button"
                        className={`rounded border px-2 py-0.5 text-[11px] ${
                          product.requiredTier === tier ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200"
                        }`}
                        onClick={() => {
                          const result = system.adminUpdateProductRule({ productId: product.id, requiredTier: tier });
                          setFeedback(result.message);
                        }}
                      >
                        {productRequiredTierLabel(tier)}
                      </button>
                    ))}

                    <button
                      type="button"
                      className="rounded border px-2 py-0.5 text-[11px]"
                      onClick={() => {
                        const result = system.adminUpdateProductRule({
                          productId: product.id,
                          slotRestrictionEnabled: !product.slotRestrictionEnabled,
                          slotRestrictedCharacter: product.slotRestrictedCharacter ?? product.character,
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
                          "設定限制角色（八千代/彩葉/輝耀姬/帝/乃依/雷/真實/蘆花）",
                          product.slotRestrictedCharacter ?? product.character ?? "八千代",
                        );
                        if (value === null) return;
                        if (!CHARACTER_OPTIONS.includes(value as CharacterName)) {
                          setFeedback("角色名稱無效。");
                          return;
                        }
                        const result = system.adminUpdateProductRule({
                          productId: product.id,
                          slotRestrictionEnabled: true,
                          slotRestrictedCharacter: value as CharacterName,
                        });
                        setFeedback(result.message);
                      }}
                    >
                      設限制角色
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
                          const value = window.prompt("此商品庫存", String(product.stock ?? 0));
                          if (value === null) return;
                          const result = system.adminUpdateProductRule({ productId: product.id, stock: Number(value) });
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

export default function App(): JSX.Element {
  const system = useOrderSystem();
  const [view, setView] = useState<PageView>("home");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [selectedBlindProductId, setSelectedBlindProductId] = useState<string>("");

  useEffect(() => {
    if (!system.currentUser) {
      setView("home");
      setSelectedCampaignId("");
      setSelectedBlindProductId("");
    }
  }, [system.currentUser]);

  const selectedCampaign = useMemo(
    () => system.state.campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null,
    [selectedCampaignId, system.state.campaigns],
  );

  const selectedBlindProduct = useMemo(
    () => system.state.products.find((product) => product.id === selectedBlindProductId) ?? null,
    [selectedBlindProductId, system.state.products],
  );

  if (!system.currentUser) {
    return (
      <main className="site-shell grid min-h-screen place-items-center px-4 py-12 grid-bg">
        <AuthCard onLogin={system.login} onRegister={system.register} onResetPassword={system.resetPassword} />
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
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">LegendMMM Shopping Hub</p>
              <h1 className="mt-1 text-3xl font-extrabold text-slate-900">活動導覽與盲盒拆分系統</h1>
              <p className="mt-2 text-sm text-slate-600">你好，{system.currentUser.fbNickname}（{system.currentUser.email}）</p>
              <p className="text-xs text-slate-500">
                身分：{system.currentUser.isAdmin ? "管理員" : "會員"} / 帳號固位：{roleLabel(system.currentUser.roleTier)} / 取貨率：
                {system.currentUser.pickupRate}%
              </p>
              <p className="text-xs text-slate-500">
                資料模式：{isSupabaseEnabled ? "Supabase 已連線（可接正式資料）" : "Demo Local 模式（未設定 Supabase）"}
              </p>
            </div>

            <HeaderNav currentView={view} setView={setView} system={system} />
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

        {view === "admin" && system.currentUser.isAdmin && <AdminView system={system} />}

        {view === "admin" && !system.currentUser.isAdmin && (
          <div className="glass-card p-5 text-sm text-slate-600">你沒有管理員權限。</div>
        )}
      </div>
    </main>
  );
}
