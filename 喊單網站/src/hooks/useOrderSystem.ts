import { useEffect, useMemo, useState } from "react";
import {
  availablePaymentMethods,
  buildBindingAssignments,
  buildShipmentDraft,
  calculateUnitPrice,
  canBuyByCharacterSlot,
  sortClaimsByPriority,
} from "../lib/business-rules";
import { CHARACTER_OPTIONS } from "../lib/constants";
import { loadSessionUserId, loadState, resetState, saveSessionUserId, saveState } from "../lib/storage";
import type {
  Campaign,
  CartItem,
  CharacterName,
  Claim,
  FixedTier,
  Order,
  OrderItem,
  OrderSystemState,
  PaymentMethod,
  Product,
  ProductRequiredTier,
  ReleaseStage,
  UserProfile,
} from "../types/domain";

interface ActionResult {
  ok: boolean;
  message: string;
}

interface RegisterInput {
  email: string;
  password: string;
  fbNickname: string;
}

interface ShipmentInput {
  campaignId: string;
  receiverName: string;
  receiverPhone: string;
  receiverStoreCode: string;
  paymentMethod: PaymentMethod;
}

interface ClaimLimitInfo {
  limit: number | null;
  used: number;
  remaining: number | null;
}

interface ProductAccessInfo {
  ok: boolean;
  reason: string;
  currentQty: number;
  remaining: number | null;
}

export interface UseOrderSystemReturn {
  state: OrderSystemState;
  currentUser: UserProfile | null;
  visibleCampaigns: Campaign[];
  login: (email: string, password: string) => ActionResult;
  register: (input: RegisterInput) => ActionResult;
  logout: () => void;
  resetPassword: (email: string) => ActionResult;
  claimProduct: (campaignId: string, productId: string) => ActionResult;
  adminCancelClaim: (claimId: string) => ActionResult;
  adminConfirmClaim: (claimId: string) => ActionResult;
  submitPayment: (campaignId: string, method: PaymentMethod, lastFiveCode: string) => ActionResult;
  reconcilePayment: (paymentId: string) => ActionResult;
  createShipment: (input: ShipmentInput) => ActionResult;
  exportMyShipCsv: (campaignId: string) => string;
  triggerBinding: (campaignId: string) => ActionResult;
  resetAllData: () => void;
  getProductsByCampaign: (campaignId: string) => Product[];
  getClaimQueue: (campaignId: string, productId: string) => Claim[];
  getUserCampaignTotal: (campaignId: string, userId: string) => number;
  getUserClaims: (campaignId: string, userId: string) => Claim[];
  getPaymentMethodsForUser: (campaignId: string, userId: string) => PaymentMethod[];
  isClaimLockedByCurrentUser: (campaignId: string, productId: string) => boolean;
  getClaimLimitInfo: (campaignId: string, userId: string) => ClaimLimitInfo;
  canCurrentUserAccessCampaign: (campaignId: string) => boolean;
  addToCart: (campaignId: string, productId: string) => ActionResult;
  removeFromCart: (cartItemId: string) => ActionResult;
  changeCartItemQty: (cartItemId: string, nextQty: number) => ActionResult;
  placeOrder: (campaignId: string) => ActionResult;
  getMyCartItems: (campaignId?: string) => CartItem[];
  getMyOrders: () => Order[];
  getOrderItems: (orderId: string) => OrderItem[];
  getProductAccessForCurrentUser: (campaignId: string, productId: string) => ProductAccessInfo;
  getUserCharacterTier: (userId: string, character: CharacterName) => FixedTier | null;
  adminUpdateCampaignReleaseStage: (campaignId: string, stage: ReleaseStage) => ActionResult;
  adminUpdateCampaignMaxClaims: (campaignId: string, maxClaims: number | null) => ActionResult;
  adminUpdateProductRule: (args: {
    productId: string;
    requiredTier?: ProductRequiredTier;
    maxPerUser?: number | null;
    stock?: number;
  }) => ActionResult;
  adminAssignCharacterSlot: (args: {
    userId: string;
    character: CharacterName;
    tier: FixedTier;
  }) => ActionResult;
  adminAutoAssignCharacterSlots: (character: CharacterName) => ActionResult;
}

const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
const lastFivePattern = /^\d{5}$/;

const STAGE_TO_ALLOWED_ROLE: Record<ReleaseStage, Set<string>> = {
  FIXED_1_ONLY: new Set(["FIXED_1"]),
  FIXED_1_2: new Set(["FIXED_1", "FIXED_2"]),
  FIXED_1_2_3: new Set(["FIXED_1", "FIXED_2", "FIXED_3"]),
  ALL_OPEN: new Set(["FIXED_1", "FIXED_2", "FIXED_3", "LEAK_PICK"]),
};

function campaignOpen(campaign: Campaign): boolean {
  return campaign.status === "OPEN" && new Date(campaign.deadlineAt).getTime() > Date.now();
}

function getClaimUnitPrice(claim: Claim, campaign: Campaign, productsById: Map<string, Product>): number {
  const product = productsById.get(claim.productId);
  if (!product) return 0;
  return calculateUnitPrice(product, campaign);
}

function fixedTiers(): FixedTier[] {
  return ["FIXED_1", "FIXED_2", "FIXED_3"];
}

export function useOrderSystem(): UseOrderSystemReturn {
  const [state, setState] = useState<OrderSystemState>(() => loadState());
  const [sessionUserId, setSessionUserId] = useState<string | null>(() => loadSessionUserId());

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    saveSessionUserId(sessionUserId);
  }, [sessionUserId]);

  const currentUser = useMemo(
    () => state.users.find((user) => user.id === sessionUserId) ?? null,
    [sessionUserId, state.users],
  );

  const visibleCampaigns = useMemo(
    () => state.campaigns.filter((campaign) => campaign.status === "OPEN"),
    [state.campaigns],
  );

  const getProductsByCampaign = (campaignId: string): Product[] => {
    return state.products.filter((product) => product.campaignId === campaignId);
  };

  const getUserCharacterTier = (userId: string, character: CharacterName): FixedTier | null => {
    const slot = state.characterSlots.find((item) => item.userId === userId && item.character === character);
    return slot?.tier ?? null;
  };

  const getProductById = (productId: string): Product | undefined => {
    return state.products.find((item) => item.id === productId);
  };

  const getCampaignById = (campaignId: string): Campaign | undefined => {
    return state.campaigns.find((item) => item.id === campaignId);
  };

  const getCurrentCommittedQty = (campaignId: string, productId: string, userId: string): number => {
    const cartQty = state.cartItems
      .filter((item) => item.campaignId === campaignId && item.productId === productId && item.userId === userId)
      .reduce((sum, item) => sum + item.qty, 0);

    const claimQty = state.claims.filter(
      (claim) =>
        claim.campaignId === campaignId &&
        claim.productId === productId &&
        claim.userId === userId &&
        claim.status !== "CANCELLED_BY_ADMIN",
    ).length;

    return cartQty + claimQty;
  };

  const getReservedQtyForProduct = (campaignId: string, productId: string): number => {
    const cartQty = state.cartItems
      .filter((item) => item.campaignId === campaignId && item.productId === productId)
      .reduce((sum, item) => sum + item.qty, 0);

    const claimQty = state.claims.filter(
      (claim) =>
        claim.campaignId === campaignId &&
        claim.productId === productId &&
        claim.status !== "CANCELLED_BY_ADMIN",
    ).length;

    return cartQty + claimQty;
  };

  const getProductAccess = (args: {
    campaign: Campaign;
    product: Product;
    user: UserProfile;
  }): ProductAccessInfo => {
    const { campaign, product, user } = args;

    if (!campaignOpen(campaign)) {
      return { ok: false, reason: "活動已截止。", currentQty: 0, remaining: 0 };
    }

    const currentQty = getCurrentCommittedQty(campaign.id, product.id, user.id);

    const roleAllowed = STAGE_TO_ALLOWED_ROLE[campaign.releaseStage].has(user.roleTier);
    if (!roleAllowed) {
      return { ok: false, reason: "目前活動釋出階段尚未開放你的身分。", currentQty, remaining: 0 };
    }

    const userCharacterTier = getUserCharacterTier(user.id, product.character);
    const gate = canBuyByCharacterSlot({
      releaseStage: campaign.releaseStage,
      requiredTier: product.requiredTier,
      character: product.character,
      userCharacterTier,
    });

    if (!gate.ok) {
      return { ok: false, reason: gate.reason, currentQty, remaining: 0 };
    }

    if (product.maxPerUser !== null && currentQty >= product.maxPerUser) {
      return { ok: false, reason: "已達此商品個人上限。", currentQty, remaining: 0 };
    }

    const reserved = getReservedQtyForProduct(campaign.id, product.id);
    if (reserved >= product.stock) {
      return { ok: false, reason: "此商品已無可用庫存。", currentQty, remaining: 0 };
    }

    return {
      ok: true,
      reason: "",
      currentQty,
      remaining: product.maxPerUser === null ? null : Math.max(0, product.maxPerUser - currentQty),
    };
  };

  const getProductAccessForCurrentUser = (campaignId: string, productId: string): ProductAccessInfo => {
    if (!currentUser) {
      return { ok: false, reason: "請先登入。", currentQty: 0, remaining: 0 };
    }

    const campaign = getCampaignById(campaignId);
    const product = getProductById(productId);
    if (!campaign || !product) {
      return { ok: false, reason: "找不到活動或商品。", currentQty: 0, remaining: 0 };
    }

    return getProductAccess({ campaign, product, user: currentUser });
  };

  const getClaimQueue = (campaignId: string, productId: string): Claim[] => {
    const activeClaims = state.claims.filter(
      (claim) =>
        claim.campaignId === campaignId &&
        claim.productId === productId &&
        claim.status !== "CANCELLED_BY_ADMIN",
    );
    return sortClaimsByPriority(activeClaims);
  };

  const getUserClaims = (campaignId: string, userId: string): Claim[] => {
    return state.claims.filter(
      (claim) =>
        claim.campaignId === campaignId &&
        claim.userId === userId &&
        claim.status !== "CANCELLED_BY_ADMIN",
    );
  };

  const getClaimLimitInfo = (campaignId: string, userId: string): ClaimLimitInfo => {
    const campaign = getCampaignById(campaignId);
    const limit = campaign?.maxClaimsPerUser ?? null;
    const used = state.claims.filter(
      (claim) => claim.campaignId === campaignId && claim.userId === userId && claim.status !== "CANCELLED_BY_ADMIN",
    ).length;

    if (limit === null) {
      return { limit: null, used, remaining: null };
    }

    return {
      limit,
      used,
      remaining: Math.max(0, limit - used),
    };
  };

  const canCurrentUserAccessCampaign = (campaignId: string): boolean => {
    if (!currentUser) return false;
    const campaign = getCampaignById(campaignId);
    if (!campaign) return false;
    return STAGE_TO_ALLOWED_ROLE[campaign.releaseStage].has(currentUser.roleTier);
  };

  const getUserCampaignTotal = (campaignId: string, userId: string): number => {
    const campaign = getCampaignById(campaignId);
    if (!campaign) return 0;

    const productsById = new Map(state.products.map((product) => [product.id, product]));

    const confirmedClaims = state.claims.filter(
      (claim) => claim.campaignId === campaignId && claim.userId === userId && claim.status === "CONFIRMED",
    );

    const confirmedTotal = confirmedClaims.reduce((sum, claim) => {
      return sum + getClaimUnitPrice(claim, campaign, productsById);
    }, 0);

    const bindTotal = state.bindings
      .filter((binding) => binding.campaignId === campaignId && binding.buyerUserId === userId)
      .reduce((sum, binding) => {
        const bindProduct = productsById.get(binding.bindProductId);
        if (!bindProduct) return sum;
        return sum + calculateUnitPrice(bindProduct, campaign);
      }, 0);

    return confirmedTotal + bindTotal;
  };

  const getPaymentMethodsForUser = (campaignId: string, userId: string): PaymentMethod[] => {
    const user = state.users.find((item) => item.id === userId);
    if (!user) return [];
    const total = getUserCampaignTotal(campaignId, userId);
    return availablePaymentMethods(user.pickupRate, total);
  };

  const isClaimLockedByCurrentUser = (campaignId: string, productId: string): boolean => {
    if (!currentUser) return false;
    return state.claims.some(
      (claim) =>
        claim.campaignId === campaignId &&
        claim.productId === productId &&
        claim.userId === currentUser.id &&
        claim.status !== "CANCELLED_BY_ADMIN",
    );
  };

  const login = (email: string, password: string): ActionResult => {
    const user = state.users.find((item) => item.email === email);
    if (!user || user.password !== password) {
      return { ok: false, message: "帳號或密碼錯誤。" };
    }
    setSessionUserId(user.id);
    return { ok: true, message: "登入成功。" };
  };

  const register = (input: RegisterInput): ActionResult => {
    const { email, password, fbNickname } = input;
    if (!email || !password || !fbNickname) {
      return { ok: false, message: "請完整填寫 Email、密碼與 FB 暱稱。" };
    }
    if (!passwordPattern.test(password)) {
      return { ok: false, message: "密碼至少 8 碼，且需包含英文與數字。" };
    }
    const exists = state.users.some((user) => user.email === email);
    if (exists) {
      return { ok: false, message: "此 Email 已註冊。" };
    }

    const userId = crypto.randomUUID();

    const nextUser: UserProfile = {
      id: userId,
      email,
      password,
      fbNickname,
      roleTier: "LEAK_PICK",
      pickupRate: 100,
      isAdmin: false,
      createdAt: new Date().toISOString(),
    };

    const now = new Date().toISOString();
    const starterSlots = CHARACTER_OPTIONS.map((character, index) => ({
      id: crypto.randomUUID(),
      userId,
      character,
      tier: fixedTiers()[index % 3],
      createdAt: now,
      updatedAt: now,
    }));

    setState((prev) => ({
      ...prev,
      users: [...prev.users, nextUser],
      characterSlots: [...prev.characterSlots, ...starterSlots],
    }));

    setSessionUserId(nextUser.id);

    return { ok: true, message: "註冊成功，已自動登入。" };
  };

  const logout = (): void => {
    setSessionUserId(null);
  };

  const resetPassword = (email: string): ActionResult => {
    const user = state.users.find((item) => item.email === email);
    if (!user) {
      return { ok: false, message: "找不到此 Email。" };
    }

    const temporaryPassword = "Temp1234";
    setState((prev) => ({
      ...prev,
      users: prev.users.map((item) =>
        item.id === user.id ? { ...item, password: temporaryPassword } : item,
      ),
    }));

    return {
      ok: true,
      message: "已重設為暫時密碼 Temp1234，請登入後立即更改。",
    };
  };

  const addToCart = (campaignId: string, productId: string): ActionResult => {
    if (!currentUser) {
      return { ok: false, message: "請先登入。" };
    }

    const campaign = getCampaignById(campaignId);
    const product = getProductById(productId);
    if (!campaign || !product) {
      return { ok: false, message: "活動或商品不存在。" };
    }

    const access = getProductAccess({ campaign, product, user: currentUser });
    if (!access.ok) {
      return { ok: false, message: access.reason };
    }

    const existing = state.cartItems.find(
      (item) => item.campaignId === campaignId && item.productId === productId && item.userId === currentUser.id,
    );

    const nextQty = (existing?.qty ?? 0) + 1;

    if (product.maxPerUser !== null && access.currentQty + 1 > product.maxPerUser) {
      return { ok: false, message: `此商品每人上限 ${product.maxPerUser}，目前已達上限。` };
    }

    if (existing) {
      setState((prev) => ({
        ...prev,
        cartItems: prev.cartItems.map((item) =>
          item.id === existing.id ? { ...item, qty: nextQty } : item,
        ),
      }));
    } else {
      const cartItem: CartItem = {
        id: crypto.randomUUID(),
        campaignId,
        productId,
        userId: currentUser.id,
        qty: 1,
        createdAt: new Date().toISOString(),
      };

      setState((prev) => ({ ...prev, cartItems: [...prev.cartItems, cartItem] }));
    }

    return { ok: true, message: "已加入購物車。" };
  };

  const changeCartItemQty = (cartItemId: string, nextQty: number): ActionResult => {
    if (!currentUser) return { ok: false, message: "請先登入。" };

    const target = state.cartItems.find((item) => item.id === cartItemId && item.userId === currentUser.id);
    if (!target) return { ok: false, message: "找不到購物車項目。" };

    if (nextQty <= 0) {
      setState((prev) => ({
        ...prev,
        cartItems: prev.cartItems.filter((item) => item.id !== cartItemId),
      }));
      return { ok: true, message: "已從購物車移除。" };
    }

    const campaign = getCampaignById(target.campaignId);
    const product = getProductById(target.productId);
    if (!campaign || !product) {
      return { ok: false, message: "活動或商品不存在。" };
    }

    const committedWithoutThis = getCurrentCommittedQty(target.campaignId, target.productId, currentUser.id) - target.qty;
    if (product.maxPerUser !== null && committedWithoutThis + nextQty > product.maxPerUser) {
      return { ok: false, message: `此商品每人上限 ${product.maxPerUser}。` };
    }

    const reservedWithoutThis = getReservedQtyForProduct(target.campaignId, target.productId) - target.qty;
    if (reservedWithoutThis + nextQty > product.stock) {
      return { ok: false, message: "可用庫存不足。" };
    }

    setState((prev) => ({
      ...prev,
      cartItems: prev.cartItems.map((item) =>
        item.id === cartItemId ? { ...item, qty: nextQty } : item,
      ),
    }));

    return { ok: true, message: "已更新購物車數量。" };
  };

  const removeFromCart = (cartItemId: string): ActionResult => {
    return changeCartItemQty(cartItemId, 0);
  };

  const placeOrder = (campaignId: string): ActionResult => {
    if (!currentUser) return { ok: false, message: "請先登入。" };

    const campaign = getCampaignById(campaignId);
    if (!campaign || !campaignOpen(campaign)) {
      return { ok: false, message: "此活動已截止或不存在。" };
    }

    const cartItems = state.cartItems.filter(
      (item) => item.campaignId === campaignId && item.userId === currentUser.id,
    );

    if (cartItems.length === 0) {
      return { ok: false, message: "購物車是空的。" };
    }

    const productsById = new Map(state.products.map((product) => [product.id, product]));

    for (const cartItem of cartItems) {
      const product = productsById.get(cartItem.productId);
      if (!product) {
        return { ok: false, message: "購物車有無效商品。" };
      }

      const access = getProductAccess({ campaign, product, user: currentUser });
      if (!access.ok) {
        return { ok: false, message: `${product.name}：${access.reason}` };
      }
    }

    const orderId = crypto.randomUUID();
    const now = new Date().toISOString();

    const orderItems: OrderItem[] = cartItems.map((cartItem) => {
      const product = productsById.get(cartItem.productId);
      const unitPrice = product ? calculateUnitPrice(product, campaign) : 0;
      return {
        id: crypto.randomUUID(),
        orderId,
        campaignId,
        productId: cartItem.productId,
        userId: currentUser.id,
        unitPrice,
        qty: cartItem.qty,
        createdAt: now,
      };
    });

    const totalAmount = orderItems.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);

    const order: Order = {
      id: orderId,
      campaignId,
      userId: currentUser.id,
      status: "PLACED",
      totalAmount,
      createdAt: now,
    };

    const claims: Claim[] = cartItems.flatMap((item) =>
      Array.from({ length: item.qty }).map(() => ({
        id: crypto.randomUUID(),
        campaignId,
        productId: item.productId,
        userId: currentUser.id,
        roleTier: currentUser.roleTier,
        createdAt: now,
        status: "LOCKED" as const,
      })),
    );

    setState((prev) => ({
      ...prev,
      orders: [...prev.orders, order],
      orderItems: [...prev.orderItems, ...orderItems],
      claims: [...prev.claims, ...claims],
      cartItems: prev.cartItems.filter(
        (item) => !(item.campaignId === campaignId && item.userId === currentUser.id),
      ),
    }));

    return { ok: true, message: `下單成功，共 ${claims.length} 件。` };
  };

  const getMyCartItems = (campaignId?: string): CartItem[] => {
    if (!currentUser) return [];
    return state.cartItems
      .filter(
        (item) =>
          item.userId === currentUser.id &&
          (!campaignId || item.campaignId === campaignId),
      )
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  };

  const getMyOrders = (): Order[] => {
    if (!currentUser) return [];
    return state.orders
      .filter((order) => order.userId === currentUser.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  };

  const getOrderItems = (orderId: string): OrderItem[] => {
    return state.orderItems
      .filter((item) => item.orderId === orderId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  };

  const claimProduct = (campaignId: string, productId: string): ActionResult => {
    if (!currentUser) {
      return { ok: false, message: "請先登入。" };
    }

    const campaign = getCampaignById(campaignId);
    const product = getProductById(productId);
    if (!campaign || !product) {
      return { ok: false, message: "活動或商品不存在。" };
    }

    const access = getProductAccess({ campaign, product, user: currentUser });
    if (!access.ok) {
      return { ok: false, message: access.reason };
    }

    const newClaim: Claim = {
      id: crypto.randomUUID(),
      campaignId,
      productId,
      userId: currentUser.id,
      roleTier: currentUser.roleTier,
      status: "LOCKED",
      createdAt: new Date().toISOString(),
    };

    setState((prev) => ({ ...prev, claims: [...prev.claims, newClaim] }));
    return { ok: true, message: "喊單成功，已鎖定。" };
  };

  const adminCancelClaim = (claimId: string): ActionResult => {
    if (!currentUser?.isAdmin) {
      return { ok: false, message: "只有團主可以取消喊單。" };
    }

    const target = state.claims.find((claim) => claim.id === claimId);
    if (!target) {
      return { ok: false, message: "找不到喊單。" };
    }

    setState((prev) => ({
      ...prev,
      claims: prev.claims.map((claim) =>
        claim.id === claimId ? { ...claim, status: "CANCELLED_BY_ADMIN" } : claim,
      ),
    }));

    return { ok: true, message: "已由團主手動取消。" };
  };

  const adminConfirmClaim = (claimId: string): ActionResult => {
    if (!currentUser?.isAdmin) {
      return { ok: false, message: "只有團主可以確認分配。" };
    }

    const target = state.claims.find((claim) => claim.id === claimId);
    if (!target) return { ok: false, message: "找不到喊單紀錄。" };
    if (target.status === "CANCELLED_BY_ADMIN") return { ok: false, message: "此單已取消。" };

    const product = state.products.find((item) => item.id === target.productId);
    if (!product) return { ok: false, message: "商品不存在。" };

    const queue = getClaimQueue(target.campaignId, target.productId);
    const queueIndex = queue.findIndex((claim) => claim.id === target.id);
    if (queueIndex < 0) return { ok: false, message: "此單不在有效排隊清單。" };

    if (queueIndex >= product.stock) {
      return { ok: false, message: "此會員目前排在候補，尚未進入可分配名額。" };
    }

    setState((prev) => ({
      ...prev,
      claims: prev.claims.map((claim) =>
        claim.id === claimId ? { ...claim, status: "CONFIRMED" } : claim,
      ),
    }));

    return { ok: true, message: "團主已確認此筆分配。" };
  };

  const triggerBinding = (campaignId: string): ActionResult => {
    if (!currentUser?.isAdmin) {
      return { ok: false, message: "只有團主可以執行綁物。" };
    }

    const campaign = state.campaigns.find((item) => item.id === campaignId);
    if (!campaign) return { ok: false, message: "找不到檔期。" };

    const campaignProducts = state.products.filter((product) => product.campaignId === campaignId);
    const confirmedClaims = state.claims.filter(
      (claim) => claim.campaignId === campaignId && claim.status === "CONFIRMED",
    );
    const existingBindings = state.bindings.filter((binding) => binding.campaignId === campaignId);

    const generated = buildBindingAssignments({
      campaign,
      products: campaignProducts,
      confirmedClaims,
      existingBindings,
    });

    if (generated.length === 0) {
      return { ok: false, message: "沒有可新增的綁物分配（可能是餘量不足或已分配完成）。" };
    }

    setState((prev) => ({ ...prev, bindings: [...prev.bindings, ...generated] }));
    return { ok: true, message: `已新增 ${generated.length} 筆綁物分配。` };
  };

  const submitPayment = (campaignId: string, method: PaymentMethod, lastFiveCode: string): ActionResult => {
    if (!currentUser) {
      return { ok: false, message: "請先登入。" };
    }

    const total = getUserCampaignTotal(campaignId, currentUser.id);
    if (total <= 0) {
      return { ok: false, message: "目前沒有可結帳品項。" };
    }

    const methods = getPaymentMethodsForUser(campaignId, currentUser.id);
    if (!methods.includes(method)) {
      return { ok: false, message: "此付款方式受取貨率或金額限制，無法使用。" };
    }

    const hasPendingPayment = state.payments.some(
      (payment) =>
        payment.campaignId === campaignId &&
        payment.userId === currentUser.id &&
        !payment.reconciled,
    );
    if (hasPendingPayment) {
      return { ok: false, message: "你已有待對帳付款，請勿重複提交。" };
    }

    if (
      (method === "BANK_TRANSFER" || method === "CARDLESS_DEPOSIT") &&
      !lastFivePattern.test(lastFiveCode)
    ) {
      return { ok: false, message: "匯款或無卡存款需填寫末五碼。" };
    }

    const payment = {
      id: crypto.randomUUID(),
      campaignId,
      userId: currentUser.id,
      amount: total,
      method,
      lastFiveCode: lastFiveCode || "-----",
      reconciled: false,
      createdAt: new Date().toISOString(),
    };

    setState((prev) => ({ ...prev, payments: [...prev.payments, payment] }));
    return { ok: true, message: "已送出付款資料。" };
  };

  const reconcilePayment = (paymentId: string): ActionResult => {
    if (!currentUser?.isAdmin) {
      return { ok: false, message: "只有團主可以對帳。" };
    }

    const target = state.payments.find((payment) => payment.id === paymentId);
    if (!target) return { ok: false, message: "找不到付款紀錄。" };

    setState((prev) => ({
      ...prev,
      payments: prev.payments.map((payment) =>
        payment.id === paymentId ? { ...payment, reconciled: true } : payment,
      ),
    }));

    return { ok: true, message: "已標記完成對帳。" };
  };

  const createShipment = (input: ShipmentInput): ActionResult => {
    if (!currentUser) {
      return { ok: false, message: "請先登入。" };
    }

    const amount = getUserCampaignTotal(input.campaignId, currentUser.id);
    if (amount <= 0) {
      return { ok: false, message: "沒有可建立物流的結帳資料。" };
    }

    const methods = getPaymentMethodsForUser(input.campaignId, currentUser.id);
    if (!methods.includes(input.paymentMethod)) {
      return { ok: false, message: "此付款方式目前不可用，請重新選擇。" };
    }

    if (!input.receiverName || !input.receiverPhone || !input.receiverStoreCode) {
      return { ok: false, message: "請完整填寫收件人、電話與門市代碼。" };
    }

    const shipment = buildShipmentDraft({
      campaignId: input.campaignId,
      user: currentUser,
      amount,
      paymentMethod: input.paymentMethod,
      receiverName: input.receiverName,
      receiverPhone: input.receiverPhone,
      receiverStoreCode: input.receiverStoreCode,
    });

    setState((prev) => {
      const filtered = prev.shipments.filter(
        (item) => !(item.campaignId === input.campaignId && item.userId === currentUser.id),
      );
      return { ...prev, shipments: [...filtered, shipment] };
    });

    return { ok: true, message: "已建立物流資料，可供賣貨便匯出。" };
  };

  const exportMyShipCsv = (campaignId: string): string => {
    const headers = ["會員FB暱稱", "Email", "金額", "付款方式", "收件人", "電話", "門市代碼"];
    const userById = new Map(state.users.map((user) => [user.id, user]));

    const rows = state.shipments
      .filter((shipment) => shipment.campaignId === campaignId)
      .map((shipment) => {
        const user = userById.get(shipment.userId);
        return [
          user?.fbNickname ?? "",
          user?.email ?? "",
          String(shipment.orderAmount),
          shipment.paymentMethod,
          shipment.receiverName,
          shipment.receiverPhone,
          shipment.receiverStoreCode,
        ];
      });

    const escapeCsv = (value: string): string => `"${value.replace(/\"/g, "\"\"")}"`;
    return [headers, ...rows]
      .map((cols) => cols.map((value) => escapeCsv(value)).join(","))
      .join("\n");
  };

  const adminUpdateCampaignReleaseStage = (campaignId: string, stage: ReleaseStage): ActionResult => {
    if (!currentUser?.isAdmin) {
      return { ok: false, message: "只有團主可以調整釋出階段。" };
    }

    const exists = state.campaigns.some((campaign) => campaign.id === campaignId);
    if (!exists) {
      return { ok: false, message: "找不到活動。" };
    }

    setState((prev) => ({
      ...prev,
      campaigns: prev.campaigns.map((campaign) =>
        campaign.id === campaignId ? { ...campaign, releaseStage: stage } : campaign,
      ),
    }));

    return { ok: true, message: "已更新活動釋出階段。" };
  };

  const adminUpdateCampaignMaxClaims = (campaignId: string, maxClaims: number | null): ActionResult => {
    if (!currentUser?.isAdmin) {
      return { ok: false, message: "只有團主可以調整上限。" };
    }

    if (maxClaims !== null && maxClaims < 1) {
      return { ok: false, message: "上限至少要 1，或設定為不限。" };
    }

    const exists = state.campaigns.some((campaign) => campaign.id === campaignId);
    if (!exists) {
      return { ok: false, message: "找不到活動。" };
    }

    setState((prev) => ({
      ...prev,
      campaigns: prev.campaigns.map((campaign) =>
        campaign.id === campaignId ? { ...campaign, maxClaimsPerUser: maxClaims } : campaign,
      ),
    }));

    return { ok: true, message: "已更新活動喊單上限（目前前台以商品上限為主）。" };
  };

  const adminUpdateProductRule = (args: {
    productId: string;
    requiredTier?: ProductRequiredTier;
    maxPerUser?: number | null;
    stock?: number;
  }): ActionResult => {
    if (!currentUser?.isAdmin) {
      return { ok: false, message: "只有團主可以調整商品規則。" };
    }

    const { productId, requiredTier, maxPerUser, stock } = args;
    const target = getProductById(productId);
    if (!target) return { ok: false, message: "找不到商品。" };

    if (maxPerUser !== undefined && maxPerUser !== null && maxPerUser < 1) {
      return { ok: false, message: "商品上限至少為 1，或設定為不限。" };
    }

    if (stock !== undefined && stock < 0) {
      return { ok: false, message: "庫存不可為負數。" };
    }

    setState((prev) => ({
      ...prev,
      products: prev.products.map((product) =>
        product.id === productId
          ? {
            ...product,
            requiredTier: requiredTier ?? product.requiredTier,
            maxPerUser: maxPerUser === undefined ? product.maxPerUser : maxPerUser,
            stock: stock ?? product.stock,
          }
          : product,
      ),
    }));

    return { ok: true, message: "已更新商品規則。" };
  };

  const adminAssignCharacterSlot = (args: {
    userId: string;
    character: CharacterName;
    tier: FixedTier;
  }): ActionResult => {
    if (!currentUser?.isAdmin) {
      return { ok: false, message: "只有團主可以分配固位。" };
    }

    const { userId, character, tier } = args;
    const user = state.users.find((item) => item.id === userId && !item.isAdmin);
    if (!user) {
      return { ok: false, message: "找不到會員。" };
    }

    const now = new Date().toISOString();
    const exists = state.characterSlots.find((item) => item.userId === userId && item.character === character);

    if (exists) {
      setState((prev) => ({
        ...prev,
        characterSlots: prev.characterSlots.map((item) =>
          item.id === exists.id ? { ...item, tier, updatedAt: now } : item,
        ),
      }));
    } else {
      setState((prev) => ({
        ...prev,
        characterSlots: [
          ...prev.characterSlots,
          {
            id: crypto.randomUUID(),
            userId,
            character,
            tier,
            createdAt: now,
            updatedAt: now,
          },
        ],
      }));
    }

    return { ok: true, message: `${user.fbNickname} 的 ${character} 已設為 ${tier}。` };
  };

  const adminAutoAssignCharacterSlots = (character: CharacterName): ActionResult => {
    if (!currentUser?.isAdmin) {
      return { ok: false, message: "只有團主可以自動分配。" };
    }

    const members = state.users
      .filter((user) => !user.isAdmin)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    if (members.length === 0) {
      return { ok: false, message: "目前沒有可分配的會員。" };
    }

    const tiers = fixedTiers();
    const now = new Date().toISOString();

    setState((prev) => {
      const nextSlots = [...prev.characterSlots];

      members.forEach((member, index) => {
        const tier = tiers[index % tiers.length];
        const existingIndex = nextSlots.findIndex(
          (item) => item.userId === member.id && item.character === character,
        );

        if (existingIndex >= 0) {
          nextSlots[existingIndex] = { ...nextSlots[existingIndex], tier, updatedAt: now };
        } else {
          nextSlots.push({
            id: crypto.randomUUID(),
            userId: member.id,
            character,
            tier,
            createdAt: now,
            updatedAt: now,
          });
        }
      });

      return { ...prev, characterSlots: nextSlots };
    });

    return { ok: true, message: `${character} 已依註冊順序自動分配固位。` };
  };

  const resetAllData = (): void => {
    setState(resetState());
    setSessionUserId("u-admin-001");
  };

  return {
    state,
    currentUser,
    visibleCampaigns,
    login,
    register,
    logout,
    resetPassword,
    claimProduct,
    adminCancelClaim,
    adminConfirmClaim,
    submitPayment,
    reconcilePayment,
    createShipment,
    exportMyShipCsv,
    triggerBinding,
    resetAllData,
    getProductsByCampaign,
    getClaimQueue,
    getUserCampaignTotal,
    getUserClaims,
    getPaymentMethodsForUser,
    isClaimLockedByCurrentUser,
    getClaimLimitInfo,
    canCurrentUserAccessCampaign,
    addToCart,
    removeFromCart,
    changeCartItemQty,
    placeOrder,
    getMyCartItems,
    getMyOrders,
    getOrderItems,
    getProductAccessForCurrentUser,
    getUserCharacterTier,
    adminUpdateCampaignReleaseStage,
    adminUpdateCampaignMaxClaims,
    adminUpdateProductRule,
    adminAssignCharacterSlot,
    adminAutoAssignCharacterSlots,
  };
}
