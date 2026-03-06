import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AuthCard } from "./components/AuthCard";
import type { UseOrderSystemReturn } from "./hooks/useOrderSystem";
import { useOrderSystem } from "./hooks/useOrderSystem";
import { CHARACTER_OPTIONS } from "./lib/constants";
import {
  fixedTierLabel,
  formatDate,
  orderStatusLabel,
  productRequiredTierLabel,
  releaseStageLabel,
  roleLabel,
  twd,
} from "./lib/format";
import { isSupabaseEnabled } from "./lib/supabase";
import type { Campaign, CharacterName, FixedTier, ProductRequiredTier, ReleaseStage } from "./types/domain";

type PageView = "home" | "campaign" | "cart" | "me" | "admin";

const stageOptions: ReleaseStage[] = ["FIXED_1_ONLY", "FIXED_1_2", "FIXED_1_2_3", "ALL_OPEN"];
const requiredTierOptions: ProductRequiredTier[] = ["FIXED_1", "FIXED_2", "FIXED_3", "ALL_OPEN"];
const fixedTierOptions: FixedTier[] = ["FIXED_1", "FIXED_2", "FIXED_3"];

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

function HomeView(props: {
  system: UseOrderSystemReturn;
  onOpenCampaign: (campaign: Campaign) => void;
}): JSX.Element {
  const { system, onOpenCampaign } = props;

  return (
    <section className="space-y-5">
      <div className="glass-card p-5">
        <h2 className="text-2xl font-extrabold text-slate-900">活動導覽</h2>
        <p className="mt-2 text-sm text-slate-600">選活動後可加商品進購物車。每個商品都有獨立上限與固位需求。</p>
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
}): JSX.Element {
  const { system, campaign, onGoCart, onBack } = props;
  const [feedback, setFeedback] = useState("");
  const products = system.getProductsByCampaign(campaign.id);
  const cartItems = system.getMyCartItems(campaign.id);
  const cartMap = new Map(cartItems.map((item) => [item.productId, item]));

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

        {feedback && <p className="mt-3 text-sm font-semibold text-slate-800">{feedback}</p>}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => {
          const access = system.getProductAccessForCurrentUser(campaign.id, product.id);
          const inCartQty = cartMap.get(product.id)?.qty ?? 0;
          const myTier = system.currentUser
            ? system.getUserCharacterTier(system.currentUser.id, product.character)
            : null;
          const price = campaign.pricingMode === "DYNAMIC"
            ? (product.isPopular ? product.hotPrice : product.coldPrice)
            : product.averagePrice;

          return (
            <article key={product.id} className="glass-card p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-slate-500">{product.sku}</p>
                  <h3 className="text-base font-bold text-slate-900">{product.name}</h3>
                  <p className="text-sm text-slate-500">角色：{product.character}</p>
                </div>
                <span className={`state-pill ${product.isPopular ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                  {product.isPopular ? "熱門" : "一般"}
                </span>
              </div>

              <div className="mt-3 space-y-1 text-sm text-slate-600">
                <p>單價：{twd(price)}</p>
                <p>商品固位：{productRequiredTierLabel(product.requiredTier)}</p>
                <p>你的 {product.character} 固位：{myTier ? fixedTierLabel(myTier) : "未分配"}</p>
                <p>商品上限：{product.maxPerUser ?? "不限"}</p>
                <p>你已加入：{inCartQty}</p>
              </div>

              <p className={`mt-2 text-xs font-semibold ${access.ok ? "text-emerald-700" : "text-amber-700"}`}>
                {access.ok ? "可加入購物車" : access.reason}
              </p>

              <button
                type="button"
                disabled={!access.ok}
                onClick={() => {
                  const result = system.addToCart(campaign.id, product.id);
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

function CartView(props: { system: UseOrderSystemReturn; onOpenCampaign: (campaign: Campaign) => void }): JSX.Element {
  const { system, onOpenCampaign } = props;
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
        <p className="mt-2 text-sm text-slate-600">同一商品可加多件，受商品上限限制。</p>
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
                return (
                  <div key={item.id} className="rounded-xl border border-slate-200 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{product?.name ?? "未知商品"}</p>
                        <p className="text-xs text-slate-500">角色：{product?.character ?? "-"}</p>
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
                    {items.map((item) => (
                      <p key={item.id}>- {productById.get(item.productId)?.name ?? "未知商品"} x {item.qty}</p>
                    ))}
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
              return (
                <article key={claim.id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <p className="font-semibold text-slate-900">{product?.name ?? "未知商品"}</p>
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

  const members = system.state.users
    .filter((user) => !user.isAdmin)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return (
    <section className="space-y-5">
      <div className="glass-card p-5">
        <h2 className="text-2xl font-extrabold text-slate-900">活動設定（管理員）</h2>
        <p className="mt-2 text-sm text-slate-600">管理釋出階段、商品固位與上限，以及會員角色固位分配。</p>
        {feedback && <p className="mt-2 text-sm font-semibold text-slate-800">{feedback}</p>}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                  <p className="text-[11px] text-slate-500">需求：{productRequiredTierLabel(product.requiredTier)} / 上限：{product.maxPerUser ?? "不限"}</p>
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
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>

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
                  <p className="text-xs text-slate-500">{selectedCharacter} 目前：{tier ? fixedTierLabel(tier) : "未分配"}</p>
                </div>
                <div className="flex gap-1">
                  {fixedTierOptions.map((optionTier) => (
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

  useEffect(() => {
    if (!system.currentUser) {
      setView("home");
      setSelectedCampaignId("");
    }
  }, [system.currentUser]);

  const selectedCampaign = useMemo(
    () => system.state.campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null,
    [selectedCampaignId, system.state.campaigns],
  );

  if (!system.currentUser) {
    return (
      <main className="grid min-h-screen place-items-center px-4 py-12 grid-bg">
        <AuthCard onLogin={system.login} onRegister={system.register} onResetPassword={system.resetPassword} />
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl space-y-5">
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">LegendMMM Shopping Hub</p>
              <h1 className="mt-1 text-3xl font-extrabold text-slate-900">活動導覽與喊單購物車</h1>
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
          />
        )}

        {view === "campaign" && !selectedCampaign && (
          <div className="glass-card p-5 text-sm text-slate-600">請先從大主頁選擇活動。</div>
        )}

        {view === "cart" && (
          <CartView
            system={system}
            onOpenCampaign={(campaign) => {
              setSelectedCampaignId(campaign.id);
              setView("campaign");
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
