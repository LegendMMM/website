import { useEffect, useMemo, useState } from "react";
import {
  availablePaymentMethods,
  buildBindingAssignments,
  buildShipmentDraft,
  calculateUnitPrice,
  canBuyByCharacterSlot,
  sortClaimsByPriority,
} from "../lib/business-rules";
import { loadSessionUserId, loadState, resetState, saveSessionUserId, saveState } from "../lib/storage";
import type {
  BlindBoxItem,
  Campaign,
  CartItem,
  CharacterName,
  CharacterTier,
  Claim,
  Order,
  OrderItem,
  OrderSystemState,
  PaymentMethod,
  PricingMode,
  Product,
  ProductRequiredTier,
  ProductSeries,
  ProductType,
  ReleaseStage,
  UserProfile,
} from "../types/domain";

interface ActionResult {
  ok: boolean;
  message: string;
}

interface RegisterInput {
  email: string;
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

interface TargetDescriptor {
  character: CharacterName | null;
  stock: number;
  maxPerUser: number | null;
  label: string;
}

interface CreateCampaignInput {
  title: string;
  description: string;
  deadlineAt: string;
  pricingMode: PricingMode;
  releaseStage: ReleaseStage;
}

interface CreateProductInput {
  campaignId: string;
  sku: string;
  name: string;
  series: ProductSeries;
  type: ProductType;
  character: CharacterName | null;
  slotRestrictionEnabled: boolean;
  slotRestrictedCharacter: CharacterName | null;
  requiredTier: ProductRequiredTier;
  imageUrl: string | null;
  isPopular: boolean;
  hotPrice: number;
  coldPrice: number;
  averagePrice: number;
  stock: number | null;
  maxPerUser: number | null;
}

interface CreateBlindBoxItemInput {
  productId: string;
  sku: string;
  name: string;
  character: CharacterName;
  imageUrl: string | null;
  stock: number;
  maxPerUser: number | null;
}

interface ProductRuleUpdateInput {
  productId: string;
  requiredTier?: ProductRequiredTier;
  maxPerUser?: number | null;
  stock?: number;
  slotRestrictionEnabled?: boolean;
  slotRestrictedCharacter?: CharacterName | null;
}

export interface UseOrderSystemReturn {
  state: OrderSystemState;
  currentUser: UserProfile | null;
  visibleCampaigns: Campaign[];
  login: (email: string, fbNickname: string) => ActionResult;
  register: (input: RegisterInput) => ActionResult;
  logout: () => void;
  claimProduct: (campaignId: string, productId: string, blindBoxItemId?: string) => ActionResult;
  adminCancelClaim: (claimId: string) => ActionResult;
  adminConfirmClaim: (claimId: string) => ActionResult;
  submitPayment: (campaignId: string, method: PaymentMethod, lastFiveCode: string) => ActionResult;
  reconcilePayment: (paymentId: string) => ActionResult;
  createShipment: (input: ShipmentInput) => ActionResult;
  exportMyShipCsv: (campaignId: string) => string;
  triggerBinding: (campaignId: string) => ActionResult;
  resetAllData: () => void;
  getProductsByCampaign: (campaignId: string) => Product[];
  getBlindBoxItemsByProduct: (productId: string) => BlindBoxItem[];
  getClaimQueue: (campaignId: string, productId: string, blindBoxItemId?: string) => Claim[];
  getUserCampaignTotal: (campaignId: string, userId: string) => number;
  getUserClaims: (campaignId: string, userId: string) => Claim[];
  getPaymentMethodsForUser: (campaignId: string, userId: string) => PaymentMethod[];
  isClaimLockedByCurrentUser: (campaignId: string, productId: string, blindBoxItemId?: string) => boolean;
  getClaimLimitInfo: (campaignId: string, userId: string) => ClaimLimitInfo;
  canCurrentUserAccessCampaign: (campaignId: string) => boolean;
  addToCart: (campaignId: string, productId: string, blindBoxItemId?: string) => ActionResult;
  removeFromCart: (cartItemId: string) => ActionResult;
  changeCartItemQty: (cartItemId: string, nextQty: number) => ActionResult;
  placeOrder: (campaignId: string) => ActionResult;
  getMyCartItems: (campaignId?: string) => CartItem[];
  getMyOrders: () => Order[];
  getOrderItems: (orderId: string) => OrderItem[];
  getProductAccessForCurrentUser: (campaignId: string, productId: string, blindBoxItemId?: string) => ProductAccessInfo;
  getUserCharacterTier: (userId: string, character: CharacterName) => CharacterTier | null;
  adminUpdateCampaignReleaseStage: (campaignId: string, stage: ReleaseStage) => ActionResult;
  adminUpdateCampaignMaxClaims: (campaignId: string, maxClaims: number | null) => ActionResult;
  adminUpdateProductRule: (args: ProductRuleUpdateInput) => ActionResult;
  adminAssignCharacterSlot: (args: {
    userId: string;
    character: CharacterName;
    tier: CharacterTier | null;
  }) => ActionResult;
  adminAutoAssignCharacterSlots: (character: CharacterName) => ActionResult;
  adminCreateCampaign: (input: CreateCampaignInput) => ActionResult;
  adminCreateProduct: (input: CreateProductInput) => ActionResult;
  adminCreateBlindBoxItem: (input: CreateBlindBoxItemInput) => ActionResult;
}

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

function characterTierCycle(): CharacterTier[] {
  return ["FIXED_1", "FIXED_2", "FIXED_3", "LEAK_PICK"];
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

  const getBlindBoxItemsByProduct = (productId: string): BlindBoxItem[] => {
    return state.blindBoxItems.filter((item) => item.productId === productId);
  };

  const getUserCharacterTier = (userId: string, character: CharacterName): CharacterTier | null => {
    const slot = state.characterSlots.find((item) => item.userId === userId && item.character === character);
    return slot?.tier ?? null;
  };

  const getProductById = (productId: string): Product | undefined => {
    return state.products.find((item) => item.id === productId);
  };

  const getBlindBoxItemById = (blindBoxItemId: string): BlindBoxItem | undefined => {
    return state.blindBoxItems.find((item) => item.id === blindBoxItemId);
  };

  const getCampaignById = (campaignId: string): Campaign | undefined => {
    return state.campaigns.find((item) => item.id === campaignId);
  };

  const resolveTargetDescriptor = (product: Product, blindBoxItemId?: string): TargetDescriptor | null => {
    if (product.type === "NORMAL") {
      if (product.stock === null) return null;
      return {
        character: product.character,
        stock: product.stock,
        maxPerUser: product.maxPerUser,
        label: product.name,
      };
    }

    if (!blindBoxItemId) return null;
    const item = getBlindBoxItemById(blindBoxItemId);
    if (!item || item.productId !== product.id) return null;

    return {
      character: item.character,
      stock: item.stock,
      maxPerUser: item.maxPerUser,
      label: `${product.name} / ${item.name}`,
    };
  };

  const resolveSlotGateCharacter = (product: Product, target: TargetDescriptor): CharacterName | null => {
    if (!product.slotRestrictionEnabled) return null;
    if (product.slotRestrictedCharacter) return product.slotRestrictedCharacter;
    return target.character;
  };

  const getCurrentCommittedQty = (
    campaignId: string,
    productId: string,
    blindBoxItemId: string | null,
    userId: string,
  ): number => {
    const cartQty = state.cartItems
      .filter(
        (item) =>
          item.campaignId === campaignId &&
          item.productId === productId &&
          item.blindBoxItemId === blindBoxItemId &&
          item.userId === userId,
      )
      .reduce((sum, item) => sum + item.qty, 0);

    const claimQty = state.claims.filter(
      (claim) =>
        claim.campaignId === campaignId &&
        claim.productId === productId &&
        claim.blindBoxItemId === blindBoxItemId &&
        claim.userId === userId &&
        claim.status !== "CANCELLED_BY_ADMIN",
    ).length;

    return cartQty + claimQty;
  };

  const getReservedQtyForTarget = (
    campaignId: string,
    productId: string,
    blindBoxItemId: string | null,
  ): number => {
    const cartQty = state.cartItems
      .filter(
        (item) =>
          item.campaignId === campaignId &&
          item.productId === productId &&
          item.blindBoxItemId === blindBoxItemId,
      )
      .reduce((sum, item) => sum + item.qty, 0);

    const claimQty = state.claims.filter(
      (claim) =>
        claim.campaignId === campaignId &&
        claim.productId === productId &&
        claim.blindBoxItemId === blindBoxItemId &&
        claim.status !== "CANCELLED_BY_ADMIN",
    ).length;

    return cartQty + claimQty;
  };

  const getProductAccess = (args: {
    campaign: Campaign;
    product: Product;
    user: UserProfile;
    blindBoxItemId?: string;
  }): ProductAccessInfo => {
    const { campaign, product, user, blindBoxItemId } = args;

    if (!campaignOpen(campaign)) {
      return { ok: false, reason: "活動已截止。", currentQty: 0, remaining: 0 };
    }

    const roleAllowed = STAGE_TO_ALLOWED_ROLE[campaign.releaseStage].has(user.roleTier);
    if (!roleAllowed) {
      return { ok: false, reason: "目前活動釋出階段尚未開放你的身分。", currentQty: 0, remaining: 0 };
    }

    const target = resolveTargetDescriptor(product, blindBoxItemId);
    if (!target) {
      return { ok: false, reason: "此商品需要先選擇盲盒角色子項。", currentQty: 0, remaining: 0 };
    }

    const targetId = product.type === "NORMAL" ? null : blindBoxItemId ?? null;
    const currentQty = getCurrentCommittedQty(campaign.id, product.id, targetId, user.id);

    const gateCharacter = resolveSlotGateCharacter(product, target);
    if (gateCharacter) {
      const userCharacterTier = getUserCharacterTier(user.id, gateCharacter);
      const gate = canBuyByCharacterSlot({
        releaseStage: campaign.releaseStage,
        requiredTier: product.requiredTier,
        character: gateCharacter,
        userCharacterTier,
      });

      if (!gate.ok) {
        return { ok: false, reason: gate.reason, currentQty, remaining: 0 };
      }
    }

    if (target.maxPerUser !== null && currentQty >= target.maxPerUser) {
      return { ok: false, reason: "已達此子項個人上限。", currentQty, remaining: 0 };
    }

    const reserved = getReservedQtyForTarget(campaign.id, product.id, targetId);
    if (reserved >= target.stock) {
      return { ok: false, reason: `${target.label} 已無可用庫存。`, currentQty, remaining: 0 };
    }

    return {
      ok: true,
      reason: "",
      currentQty,
      remaining: target.maxPerUser === null ? null : Math.max(0, target.maxPerUser - currentQty),
    };
  };

  const getProductAccessForCurrentUser = (
    campaignId: string,
    productId: string,
    blindBoxItemId?: string,
  ): ProductAccessInfo => {
    if (!currentUser) {
      return { ok: false, reason: "請先登入。", currentQty: 0, remaining: 0 };
    }

    const campaign = getCampaignById(campaignId);
    const product = getProductById(productId);
    if (!campaign || !product) {
      return { ok: false, reason: "找不到活動或商品。", currentQty: 0, remaining: 0 };
    }

    return getProductAccess({ campaign, product, user: currentUser, blindBoxItemId });
  };

  const getClaimQueue = (campaignId: string, productId: string, blindBoxItemId?: string): Claim[] => {
    const activeClaims = state.claims.filter(
      (claim) =>
        claim.campaignId === campaignId &&
        claim.productId === productId &&
        claim.blindBoxItemId === (blindBoxItemId ?? null) &&
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

  const isClaimLockedByCurrentUser = (campaignId: string, productId: string, blindBoxItemId?: string): boolean => {
    if (!currentUser) return false;
    return state.claims.some(
      (claim) =>
        claim.campaignId === campaignId &&
        claim.productId === productId &&
        claim.blindBoxItemId === (blindBoxItemId ?? null) &&
        claim.userId === currentUser.id &&
        claim.status !== "CANCELLED_BY_ADMIN",
    );
  };

  const login = (email: string, fbNickname: string): ActionResult => {
    const user = state.users.find((item) => item.email === email);
    if (!user || user.fbNickname !== fbNickname) {
      return { ok: false, message: "Email 或 FB 暱稱錯誤。" };
    }
    setSessionUserId(user.id);
    return { ok: true, message: "登入成功。" };
  };

  const register = (input: RegisterInput): ActionResult => {
    const { email, fbNickname } = input;
    if (!email || !fbNickname) {
      return { ok: false, message: "請完整填寫 Email 與 FB 暱稱。" };
    }
    const exists = state.users.some((user) => user.email === email);
    if (exists) {
      return { ok: false, message: "此 Email 已註冊。" };
    }

    const userId = crypto.randomUUID();

    const nextUser: UserProfile = {
      id: userId,
      email,
      password: "",
      fbNickname,
      roleTier: "LEAK_PICK",
      pickupRate: 100,
      isAdmin: false,
      createdAt: new Date().toISOString(),
    };

    setState((prev) => ({
      ...prev,
      users: [...prev.users, nextUser],
    }));

    setSessionUserId(nextUser.id);

    return { ok: true, message: "註冊成功，已自動登入。" };
  };

  const logout = (): void => {
    setSessionUserId(null);
  };

  const addToCart = (campaignId: string, productId: string, blindBoxItemId?: string): ActionResult => {
    if (!currentUser) {
      return { ok: false, message: "請先登入。" };
    }

    const campaign = getCampaignById(campaignId);
    const product = getProductById(productId);
    if (!campaign || !product) {
      return { ok: false, message: "活動或商品不存在。" };
    }

    if (product.type === "BLIND_BOX" && !blindBoxItemId) {
      return { ok: false, message: "請先選擇盲盒角色子項。" };
    }

    const access = getProductAccess({ campaign, product, user: currentUser, blindBoxItemId });
    if (!access.ok) {
      return { ok: false, message: access.reason };
    }

    const targetBlindBoxItemId = blindBoxItemId ?? null;

    const existing = state.cartItems.find(
      (item) =>
        item.campaignId === campaignId &&
        item.productId === productId &&
        item.blindBoxItemId === targetBlindBoxItemId &&
        item.userId === currentUser.id,
    );

    const target = resolveTargetDescriptor(product, blindBoxItemId);
    if (!target) {
      return { ok: false, message: "找不到可加入的商品子項。" };
    }

    const nextQty = (existing?.qty ?? 0) + 1;

    if (target.maxPerUser !== null && access.currentQty + 1 > target.maxPerUser) {
      return { ok: false, message: `此子項每人上限 ${target.maxPerUser}，目前已達上限。` };
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
        blindBoxItemId: targetBlindBoxItemId,
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

    const targetItem = state.cartItems.find((item) => item.id === cartItemId && item.userId === currentUser.id);
    if (!targetItem) return { ok: false, message: "找不到購物車項目。" };

    if (nextQty <= 0) {
      setState((prev) => ({
        ...prev,
        cartItems: prev.cartItems.filter((item) => item.id !== cartItemId),
      }));
      return { ok: true, message: "已從購物車移除。" };
    }

    const campaign = getCampaignById(targetItem.campaignId);
    const product = getProductById(targetItem.productId);
    if (!campaign || !product) {
      return { ok: false, message: "活動或商品不存在。" };
    }

    const resolved = resolveTargetDescriptor(product, targetItem.blindBoxItemId ?? undefined);
    if (!resolved) {
      return { ok: false, message: "找不到商品子項。" };
    }

    const committedWithoutThis =
      getCurrentCommittedQty(targetItem.campaignId, targetItem.productId, targetItem.blindBoxItemId, currentUser.id) -
      targetItem.qty;

    if (resolved.maxPerUser !== null && committedWithoutThis + nextQty > resolved.maxPerUser) {
      return { ok: false, message: `此子項每人上限 ${resolved.maxPerUser}。` };
    }

    const reservedWithoutThis =
      getReservedQtyForTarget(targetItem.campaignId, targetItem.productId, targetItem.blindBoxItemId) - targetItem.qty;

    if (reservedWithoutThis + nextQty > resolved.stock) {
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

      const access = getProductAccess({
        campaign,
        product,
        user: currentUser,
        blindBoxItemId: cartItem.blindBoxItemId ?? undefined,
      });
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
        blindBoxItemId: cartItem.blindBoxItemId,
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
        blindBoxItemId: item.blindBoxItemId,
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

  const claimProduct = (campaignId: string, productId: string, blindBoxItemId?: string): ActionResult => {
    if (!currentUser) {
      return { ok: false, message: "請先登入。" };
    }

    const campaign = getCampaignById(campaignId);
    const product = getProductById(productId);
    if (!campaign || !product) {
      return { ok: false, message: "活動或商品不存在。" };
    }

    const access = getProductAccess({ campaign, product, user: currentUser, blindBoxItemId });
    if (!access.ok) {
      return { ok: false, message: access.reason };
    }

    const newClaim: Claim = {
      id: crypto.randomUUID(),
      campaignId,
      productId,
      blindBoxItemId: blindBoxItemId ?? null,
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

    const queue = getClaimQueue(target.campaignId, target.productId, target.blindBoxItemId ?? undefined);
    const queueIndex = queue.findIndex((claim) => claim.id === target.id);
    if (queueIndex < 0) return { ok: false, message: "此單不在有效排隊清單。" };

    const resolved = resolveTargetDescriptor(product, target.blindBoxItemId ?? undefined);
    const stock = resolved?.stock ?? 0;

    if (queueIndex >= stock) {
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

  const adminUpdateProductRule = (args: ProductRuleUpdateInput): ActionResult => {
    if (!currentUser?.isAdmin) {
      return { ok: false, message: "只有團主可以調整商品規則。" };
    }

    const { productId, requiredTier, maxPerUser, stock, slotRestrictionEnabled, slotRestrictedCharacter } = args;
    const target = getProductById(productId);
    if (!target) return { ok: false, message: "找不到商品。" };

    if (maxPerUser !== undefined && maxPerUser !== null && maxPerUser < 1) {
      return { ok: false, message: "商品上限至少為 1，或設定為不限。" };
    }

    if (stock !== undefined && stock < 0) {
      return { ok: false, message: "庫存不可為負數。" };
    }

    const nextSlotRestrictionEnabled = slotRestrictionEnabled ?? target.slotRestrictionEnabled;
    const nextSlotRestrictedCharacter = slotRestrictedCharacter === undefined
      ? target.slotRestrictedCharacter
      : slotRestrictedCharacter;

    if (nextSlotRestrictionEnabled && !nextSlotRestrictedCharacter) {
      return { ok: false, message: "啟用固位限制時必須指定限制角色。" };
    }

    if (requiredTier === undefined && target.requiredTier === undefined) {
      return { ok: false, message: "商品固位必填。" };
    }

    setState((prev) => ({
      ...prev,
      products: prev.products.map((product) =>
        product.id === productId
          ? {
            ...product,
            requiredTier: requiredTier ?? product.requiredTier,
            maxPerUser: maxPerUser === undefined ? product.maxPerUser : maxPerUser,
            stock: stock === undefined ? product.stock : (product.type === "NORMAL" ? stock : product.stock),
            slotRestrictionEnabled: nextSlotRestrictionEnabled,
            slotRestrictedCharacter: nextSlotRestrictionEnabled ? nextSlotRestrictedCharacter : null,
          }
          : product,
      ),
    }));

    return { ok: true, message: "已更新商品規則。" };
  };

  const adminAssignCharacterSlot = (args: {
    userId: string;
    character: CharacterName;
    tier: CharacterTier | null;
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

    if (!tier) {
      if (exists) {
        setState((prev) => ({
          ...prev,
          characterSlots: prev.characterSlots.filter((item) => item.id !== exists.id),
        }));
      }
      return { ok: true, message: `${user.fbNickname} 的 ${character} 已設為無。` };
    }

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

    const tiers = characterTierCycle();
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

    return { ok: true, message: `${character} 已依註冊順序自動分配固位（含撿漏）。` };
  };

  const adminCreateCampaign = (input: CreateCampaignInput): ActionResult => {
    if (!currentUser?.isAdmin) {
      return { ok: false, message: "只有團主可以新增活動。" };
    }

    if (!input.title.trim()) {
      return { ok: false, message: "活動名稱必填。" };
    }

    if (!input.deadlineAt) {
      return { ok: false, message: "請設定活動截止時間。" };
    }

    const campaign: Campaign = {
      id: crypto.randomUUID(),
      title: input.title.trim(),
      description: input.description.trim(),
      deadlineAt: new Date(input.deadlineAt).toISOString(),
      status: "OPEN",
      pricingMode: input.pricingMode,
      releaseStage: input.releaseStage,
      maxClaimsPerUser: null,
      createdBy: currentUser.id,
    };

    setState((prev) => ({
      ...prev,
      campaigns: [campaign, ...prev.campaigns],
    }));

    return { ok: true, message: `已建立活動「${campaign.title}」。` };
  };

  const adminCreateProduct = (input: CreateProductInput): ActionResult => {
    if (!currentUser?.isAdmin) {
      return { ok: false, message: "只有團主可以新增商品。" };
    }

    const campaign = getCampaignById(input.campaignId);
    if (!campaign) return { ok: false, message: "找不到活動。" };

    if (!input.sku.trim() || !input.name.trim()) {
      return { ok: false, message: "商品 SKU 與名稱必填。" };
    }

    if (!input.requiredTier) {
      return { ok: false, message: "商品級固位必填。" };
    }

    if (input.type === "NORMAL") {
      if (!input.character) {
        return { ok: false, message: "一般商品必須指定角色。" };
      }
      if (input.stock === null || input.stock < 0) {
        return { ok: false, message: "一般商品庫存必須 >= 0。" };
      }
    }

    if (input.slotRestrictionEnabled && !input.slotRestrictedCharacter) {
      return { ok: false, message: "啟用固位限制時，必須指定限制角色。" };
    }

    const product: Product = {
      id: crypto.randomUUID(),
      campaignId: input.campaignId,
      sku: input.sku.trim(),
      name: input.name.trim(),
      series: input.series,
      type: input.type,
      character: input.type === "NORMAL" ? input.character : null,
      slotRestrictionEnabled: input.slotRestrictionEnabled,
      slotRestrictedCharacter: input.slotRestrictionEnabled ? input.slotRestrictedCharacter : null,
      requiredTier: input.requiredTier,
      imageUrl: input.imageUrl && input.imageUrl.trim() ? input.imageUrl.trim() : null,
      isPopular: input.isPopular,
      hotPrice: input.hotPrice,
      coldPrice: input.coldPrice,
      averagePrice: input.averagePrice,
      stock: input.type === "NORMAL" ? input.stock : null,
      maxPerUser: input.maxPerUser,
    };

    setState((prev) => ({
      ...prev,
      products: [product, ...prev.products],
    }));

    return { ok: true, message: `已建立商品「${product.name}」。` };
  };

  const adminCreateBlindBoxItem = (input: CreateBlindBoxItemInput): ActionResult => {
    if (!currentUser?.isAdmin) {
      return { ok: false, message: "只有團主可以新增盲盒子項。" };
    }

    const product = getProductById(input.productId);
    if (!product || product.type !== "BLIND_BOX") {
      return { ok: false, message: "找不到盲盒商品。" };
    }

    if (!input.sku.trim() || !input.name.trim()) {
      return { ok: false, message: "子項 SKU 與名稱必填。" };
    }

    if (input.stock < 0) {
      return { ok: false, message: "子項庫存不可小於 0。" };
    }

    if (input.maxPerUser !== null && input.maxPerUser < 1) {
      return { ok: false, message: "子項上限至少為 1，或設為不限。" };
    }

    const blindBoxItem: BlindBoxItem = {
      id: crypto.randomUUID(),
      productId: input.productId,
      sku: input.sku.trim(),
      name: input.name.trim(),
      character: input.character,
      imageUrl: input.imageUrl && input.imageUrl.trim() ? input.imageUrl.trim() : null,
      stock: input.stock,
      maxPerUser: input.maxPerUser,
    };

    setState((prev) => ({
      ...prev,
      blindBoxItems: [blindBoxItem, ...prev.blindBoxItems],
    }));

    return { ok: true, message: `已新增子項「${blindBoxItem.name}」。` };
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
    getBlindBoxItemsByProduct,
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
    adminCreateCampaign,
    adminCreateProduct,
    adminCreateBlindBoxItem,
  };
}
