import { useCallback, useEffect, useMemo, useState } from "react";
import {
  availablePaymentMethods,
  buildShipmentDraft,
  calculateUnitPrice,
  canBuyByCharacterSlot,
  sortClaimsByPriority,
} from "../lib/business-rules";
import {
  deleteCharacterSlots,
  loadOrderSystemStateFromSupabase,
  upsertBlindBoxItems,
  upsertCampaigns,
  upsertCharacterSlots,
  upsertClaims,
  upsertOrderItems,
  upsertOrders,
  upsertProducts,
  upsertProfiles,
} from "../lib/supabase-sync";
import { supabase } from "../lib/supabase";
import { createEmptyState, loadSessionUserId, loadState, resetState, saveSessionUserId, saveState } from "../lib/storage";
import type {
  BlindBoxItem,
  Campaign,
  CartItem,
  CharacterName,
  CharacterTier,
  Claim,
  Order,
  OrderItem,
  OrderStatus,
  OrderSystemState,
  PaymentMethod,
  Product,
  ProductSeries,
  ProductType,
  ReleaseStage,
  RoleTier,
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
  effectiveTier: RoleTier | null;
}

interface TargetDescriptor {
  character: CharacterName | null;
  stock: number | null;
  maxPerUser: number | null;
  label: string;
}

interface CreateCampaignInput {
  title: string;
  description: string;
  deadlineAt: string;
  releaseStage: ReleaseStage;
}

interface CreateProductInput {
  campaignId: string;
  sku?: string;
  name: string;
  series: ProductSeries;
  type: ProductType;
  character: CharacterName | null;
  slotRestrictionEnabled: boolean;
  slotRestrictedCharacter: CharacterName | null;
  imageUrl: string | null;
  price: number;
  stock: number | null;
  maxPerUser: number | null;
}

interface CreateBlindBoxItemInput {
  productId: string;
  sku?: string;
  name: string;
  character: CharacterName;
  imageUrl: string | null;
  price: number | null;
  stock: number | null;
  maxPerUser: number | null;
}

interface ProductRuleUpdateInput {
  productId: string;
  price?: number;
  maxPerUser?: number | null;
  stock?: number | null;
  slotRestrictionEnabled?: boolean;
  slotRestrictedCharacter?: CharacterName | null;
}

interface BlindBoxItemRuleUpdateInput {
  blindBoxItemId: string;
  price?: number | null;
  stock?: number | null;
  maxPerUser?: number | null;
}

export interface UseOrderSystemReturn {
  state: OrderSystemState;
  currentUser: UserProfile | null;
  visibleCampaigns: Campaign[];
  login: (identifier: string) => ActionResult;
  register: (input: RegisterInput) => ActionResult;
  logout: () => void;
  claimProduct: (campaignId: string, productId: string, blindBoxItemId?: string) => ActionResult;
  adminCancelClaim: (claimId: string) => ActionResult;
  adminConfirmClaim: (claimId: string) => ActionResult;
  submitPayment: (campaignId: string, method: PaymentMethod, lastFiveCode: string) => ActionResult;
  reconcilePayment: (paymentId: string) => ActionResult;
  createShipment: (input: ShipmentInput) => ActionResult;
  exportMyShipCsv: (campaignId: string) => string;
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
  adminUpdateBlindBoxItemRule: (args: BlindBoxItemRuleUpdateInput) => ActionResult;
  adminCreateCategory: (name: string) => ActionResult;
  adminDeleteCategory: (name: string) => ActionResult;
  adminAssignCharacterSlot: (args: {
    userId: string;
    character: CharacterName;
    tier: CharacterTier | null;
  }) => ActionResult;
  adminAutoAssignCharacterSlots: (character: CharacterName) => ActionResult;
  adminCreateCampaign: (input: CreateCampaignInput) => ActionResult;
  adminDeleteCampaign: (campaignId: string) => ActionResult;
  adminCreateProduct: (input: CreateProductInput) => ActionResult;
  adminCreateBlindBoxItem: (input: CreateBlindBoxItemInput) => ActionResult;
  adminSetUserAdmin: (userId: string, isAdmin: boolean) => Promise<ActionResult>;
  adminDeleteUser: (userId: string) => Promise<ActionResult>;
  adminUpdateUserPickupRate: (userId: string, pickupRate: number) => ActionResult;
  adminUpdateOrderStatus: (orderId: string, status: OrderStatus) => ActionResult;
  refreshCurrentUserAdminFlag: () => Promise<ActionResult>;
}

const lastFivePattern = /^\d{5}$/;

function campaignOpen(campaign: Campaign): boolean {
  return campaign.status === "OPEN" && new Date(campaign.deadlineAt).getTime() > Date.now();
}

function getClaimUnitPrice(
  claim: Claim,
  productsById: Map<string, Product>,
  blindBoxItemsById: Map<string, BlindBoxItem>,
): number {
  const product = productsById.get(claim.productId);
  if (!product) return 0;
  const blindBoxItem = claim.blindBoxItemId ? blindBoxItemsById.get(claim.blindBoxItemId) ?? null : null;
  return calculateUnitPrice(product, blindBoxItem);
}

function characterTierCycle(): CharacterTier[] {
  return ["FIXED_1", "FIXED_2", "FIXED_3", "LEAK_PICK"];
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeNickname(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeCategoryName(value: string): string {
  return value.trim() || "未分類";
}

function generateNextSku(prefix: string, existingSkus: string[]): string {
  const normalizedPrefix = prefix.toUpperCase();
  const nextNumber = existingSkus.reduce((max, sku) => {
    const match = sku.toUpperCase().match(new RegExp(`^${normalizedPrefix}-(\\d+)$`));
    if (!match) return max;
    return Math.max(max, Number(match[1]));
  }, 0) + 1;

  return `${normalizedPrefix}-${String(nextNumber).padStart(4, "0")}`;
}

function logSupabaseSyncError(context: string, error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`[supabase sync] ${context}: ${detail}`);
}

export function useOrderSystem(): UseOrderSystemReturn {
  const [state, setState] = useState<OrderSystemState>(() => (supabase ? createEmptyState() : loadState()));
  const [sessionUserId, setSessionUserId] = useState<string | null>(() => loadSessionUserId());
  const [stateHydrated, setStateHydrated] = useState<boolean>(() => !supabase);

  useEffect(() => {
    if (!stateHydrated) return;
    saveState(state);
  }, [state, stateHydrated]);

  useEffect(() => {
    saveSessionUserId(sessionUserId);
  }, [sessionUserId]);

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;

    void loadOrderSystemStateFromSupabase(supabase)
      .then((remoteState) => {
        if (cancelled) return;
        setState(remoteState);
        setStateHydrated(true);
      })
      .catch((error) => {
        logSupabaseSyncError("load initial state", error);
        if (cancelled) return;
        setState(createEmptyState());
        setStateHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const currentUser = useMemo(
    () => state.users.find((user) => user.id === sessionUserId) ?? null,
    [sessionUserId, state.users],
  );

  const runSupabaseWrite = useCallback((context: string, job: () => Promise<void>) => {
    if (!supabase) return;
    void job().catch((error) => {
      logSupabaseSyncError(context, error);
    });
  }, []);

  const syncUsersByIds = useCallback(async (userIds: string[]): Promise<void> => {
    if (!supabase) return;

    const users = Array.from(new Set(userIds))
      .map((userId) => state.users.find((user) => user.id === userId) ?? null)
      .filter((user): user is UserProfile => user !== null);

    await upsertProfiles(supabase, users);
  }, [state.users]);

  const syncCampaignsByIds = useCallback(async (campaignIds: string[]): Promise<void> => {
    if (!supabase) return;

    const campaigns = Array.from(new Set(campaignIds))
      .map((campaignId) => state.campaigns.find((campaign) => campaign.id === campaignId) ?? null)
      .filter((campaign): campaign is Campaign => campaign !== null);

    await syncUsersByIds(campaigns.map((campaign) => campaign.createdBy));
    await upsertCampaigns(supabase, campaigns);
  }, [state.campaigns, syncUsersByIds]);

  const syncCampaignRecords = useCallback(async (campaigns: Campaign[]): Promise<void> => {
    if (!supabase || campaigns.length === 0) return;

    await syncUsersByIds(campaigns.map((campaign) => campaign.createdBy));
    await upsertCampaigns(supabase, campaigns);
  }, [syncUsersByIds]);

  const syncProductsByIds = useCallback(async (productIds: string[]): Promise<void> => {
    if (!supabase) return;

    const products = Array.from(new Set(productIds))
      .map((productId) => state.products.find((product) => product.id === productId) ?? null)
      .filter((product): product is Product => product !== null);

    await syncCampaignsByIds(products.map((product) => product.campaignId));
    await upsertProducts(supabase, products);
  }, [state.products, syncCampaignsByIds]);

  const syncProductRecords = useCallback(async (products: Product[]): Promise<void> => {
    if (!supabase || products.length === 0) return;

    await syncCampaignsByIds(products.map((product) => product.campaignId));
    await upsertProducts(supabase, products);
  }, [syncCampaignsByIds]);

  const syncBlindBoxItemsByIds = useCallback(async (blindBoxItemIds: string[]): Promise<void> => {
    if (!supabase) return;

    const blindBoxItems = Array.from(new Set(blindBoxItemIds))
      .map((blindBoxItemId) => state.blindBoxItems.find((item) => item.id === blindBoxItemId) ?? null)
      .filter((item): item is BlindBoxItem => item !== null);

    await syncProductsByIds(blindBoxItems.map((item) => item.productId));
    await upsertBlindBoxItems(supabase, blindBoxItems);
  }, [state.blindBoxItems, syncProductsByIds]);

  const syncBlindBoxItemRecords = useCallback(async (blindBoxItems: BlindBoxItem[]): Promise<void> => {
    if (!supabase || blindBoxItems.length === 0) return;

    await syncProductsByIds(blindBoxItems.map((item) => item.productId));
    await upsertBlindBoxItems(supabase, blindBoxItems);
  }, [syncProductsByIds]);

  const syncCharacterSlotRows = useCallback(async (slots: CharacterSlot[]): Promise<void> => {
    if (!supabase || slots.length === 0) return;

    await syncUsersByIds(slots.map((slot) => slot.userId));
    await upsertCharacterSlots(supabase, slots);
  }, [syncUsersByIds]);

  const syncClaimRows = useCallback(async (claims: Claim[]): Promise<void> => {
    if (!supabase || claims.length === 0) return;

    await syncUsersByIds(claims.map((claim) => claim.userId));
    await syncCampaignsByIds(claims.map((claim) => claim.campaignId));
    await syncProductsByIds(claims.map((claim) => claim.productId));
    await syncBlindBoxItemsByIds(
      claims
        .map((claim) => claim.blindBoxItemId)
        .filter((blindBoxItemId): blindBoxItemId is string => Boolean(blindBoxItemId)),
    );
    await upsertClaims(supabase, claims);
  }, [syncBlindBoxItemsByIds, syncCampaignsByIds, syncProductsByIds, syncUsersByIds]);

  const syncOrderBundle = useCallback(async (payload: {
    order: Order;
    orderItems: OrderItem[];
    claims: Claim[];
  }): Promise<void> => {
    if (!supabase) return;

    await syncUsersByIds([payload.order.userId]);
    await syncCampaignsByIds([payload.order.campaignId]);
    await syncProductsByIds(payload.orderItems.map((item) => item.productId));
    await syncBlindBoxItemsByIds(
      payload.orderItems
        .map((item) => item.blindBoxItemId)
        .filter((blindBoxItemId): blindBoxItemId is string => Boolean(blindBoxItemId)),
    );
    await upsertOrders(supabase, [payload.order]);
    await upsertOrderItems(supabase, payload.orderItems);
    await upsertClaims(supabase, payload.claims);
  }, [syncBlindBoxItemsByIds, syncCampaignsByIds, syncProductsByIds, syncUsersByIds]);

  const syncAdminFlagFromSupabase = useCallback(async (user: UserProfile): Promise<void> => {
    if (!supabase) return;
    const normalizedEmail = normalizeEmail(user.email);
    if (!normalizedEmail) return;

    const applyAdminFlag = (isAdmin: boolean) => {
      setState((prev) => ({
        ...prev,
        users: prev.users.map((item) =>
          item.id === user.id ? { ...item, isAdmin } : item,
        ),
      }));
    };

    // Prefer explicit overrides table. If absent, fallback to profiles.is_admin.
    const overrideResult = await supabase
      .from("admin_overrides")
      .select("is_admin")
      .ilike("email", normalizedEmail)
      .maybeSingle();

    if (!overrideResult.error && overrideResult.data) {
      applyAdminFlag(Boolean(overrideResult.data.is_admin));
      return;
    }

    const profileResult = await supabase
      .from("profiles")
      .select("is_admin")
      .ilike("email", normalizedEmail)
      .maybeSingle();

    if (!profileResult.error && profileResult.data) {
      applyAdminFlag(Boolean(profileResult.data.is_admin));
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    void syncAdminFlagFromSupabase(currentUser);
  }, [currentUser, syncAdminFlagFromSupabase]);

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
    if (product.type !== "BLIND_BOX") return null;
    if (!product.slotRestrictionEnabled) return null;
    if (product.slotRestrictedCharacter) return product.slotRestrictedCharacter;
    return target.character;
  };

  const resolveEffectiveTier = (args: {
    campaign: Campaign;
    product: Product;
    user: UserProfile;
    blindBoxItemId?: string;
    target?: TargetDescriptor | null;
  }): { ok: boolean; reason: string; effectiveTier: RoleTier; gateCharacter: CharacterName | null } => {
    const { campaign, product, user, blindBoxItemId } = args;
    const target = args.target === undefined ? resolveTargetDescriptor(product, blindBoxItemId) : args.target;
    const gateCharacter = target ? resolveSlotGateCharacter(product, target) : null;

    if (!gateCharacter) {
      return { ok: true, reason: "", effectiveTier: "LEAK_PICK", gateCharacter: null };
    }

    const userCharacterTier = getUserCharacterTier(user.id, gateCharacter);
    const gate = canBuyByCharacterSlot({
      releaseStage: campaign.releaseStage,
      character: gateCharacter,
      userCharacterTier,
    });

    return {
      ok: gate.ok,
      reason: gate.reason,
      effectiveTier: gate.effectiveTier,
      gateCharacter,
    };
  };

  useEffect(() => {
    if (state.claims.length === 0) return;

    const campaignsById = new Map(state.campaigns.map((campaign) => [campaign.id, campaign]));
    const productsById = new Map(state.products.map((product) => [product.id, product]));
    const blindBoxItemsById = new Map(state.blindBoxItems.map((item) => [item.id, item]));
    const usersById = new Map(state.users.map((user) => [user.id, user]));
    const slotByUserCharacter = new Map(
      state.characterSlots.map((slot) => [`${slot.userId}:${slot.character}`, slot.tier] as const),
    );

    const nextClaims = state.claims.map((claim) => {
      const campaign = campaignsById.get(claim.campaignId);
      const product = productsById.get(claim.productId);
      const user = usersById.get(claim.userId);
      if (!campaign || !product || !user) {
        return claim;
      }

      let target: TargetDescriptor | null = null;
      if (product.type === "NORMAL") {
        target = {
          character: product.character,
          stock: product.stock,
          maxPerUser: product.maxPerUser,
          label: product.name,
        };
      } else if (claim.blindBoxItemId) {
        const blindItem = blindBoxItemsById.get(claim.blindBoxItemId);
        if (blindItem && blindItem.productId === product.id) {
          target = {
            character: blindItem.character,
            stock: blindItem.stock,
            maxPerUser: blindItem.maxPerUser,
            label: `${product.name} / ${blindItem.name}`,
          };
        }
      }

      if (!target) {
        return claim;
      }

      const gateCharacter =
        product.type === "BLIND_BOX" && product.slotRestrictionEnabled
          ? (product.slotRestrictedCharacter ?? target.character)
          : null;

      const nextRoleTier = !gateCharacter
        ? "LEAK_PICK"
        : canBuyByCharacterSlot({
          releaseStage: campaign.releaseStage,
          character: gateCharacter,
          userCharacterTier: slotByUserCharacter.get(`${user.id}:${gateCharacter}`) ?? null,
        }).effectiveTier;

      return nextRoleTier === claim.roleTier ? claim : { ...claim, roleTier: nextRoleTier };
    });

    const changed = nextClaims.some((claim, index) => claim !== state.claims[index]);
    if (!changed) return;

    setState((prev) => ({ ...prev, claims: nextClaims }));
  }, [state.claims, state.products, state.blindBoxItems, state.users, state.characterSlots, state.campaigns]);

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
      return { ok: false, reason: "活動已截止。", currentQty: 0, remaining: 0, effectiveTier: null };
    }

    const target = resolveTargetDescriptor(product, blindBoxItemId);
    if (!target) {
      return { ok: false, reason: "此商品需要先選擇盲盒角色子項。", currentQty: 0, remaining: 0, effectiveTier: null };
    }

    const targetId = product.type === "NORMAL" ? null : blindBoxItemId ?? null;
    const currentQty = getCurrentCommittedQty(campaign.id, product.id, targetId, user.id);

    const effectiveTierState = resolveEffectiveTier({ campaign, product, user, blindBoxItemId, target });
    if (!effectiveTierState.ok) {
      return { ok: false, reason: effectiveTierState.reason, currentQty, remaining: 0, effectiveTier: effectiveTierState.effectiveTier };
    }

    if (target.maxPerUser !== null && currentQty >= target.maxPerUser) {
      return {
        ok: false,
        reason: "已達此子項個人上限。",
        currentQty,
        remaining: 0,
        effectiveTier: effectiveTierState.effectiveTier,
      };
    }

    const reserved = getReservedQtyForTarget(campaign.id, product.id, targetId);
    if (target.stock !== null && reserved >= target.stock) {
      return {
        ok: false,
        reason: `${target.label} 已無可用庫存。`,
        currentQty,
        remaining: 0,
        effectiveTier: effectiveTierState.effectiveTier,
      };
    }

    return {
      ok: true,
      reason: "",
      currentQty,
      remaining: target.maxPerUser === null ? null : Math.max(0, target.maxPerUser - currentQty),
      effectiveTier: effectiveTierState.effectiveTier,
    };
  };

  const getProductAccessForCurrentUser = (
    campaignId: string,
    productId: string,
    blindBoxItemId?: string,
  ): ProductAccessInfo => {
    if (!currentUser) {
      return { ok: false, reason: "請先登入。", currentQty: 0, remaining: 0, effectiveTier: null };
    }

    const campaign = getCampaignById(campaignId);
    const product = getProductById(productId);
    if (!campaign || !product) {
      return { ok: false, reason: "找不到活動或商品。", currentQty: 0, remaining: 0, effectiveTier: null };
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
    return campaignOpen(campaign) && state.products.some((product) => {
      if (product.campaignId !== campaignId) return false;
      if (product.type === "BLIND_BOX") {
        return getBlindBoxItemsByProduct(product.id).some((item) => (
          getProductAccess({ campaign, product, user: currentUser, blindBoxItemId: item.id }).ok
        ));
      }
      return getProductAccess({ campaign, product, user: currentUser }).ok;
    });
  };

  const getUserCampaignTotal = (campaignId: string, userId: string): number => {
    const productsById = new Map(state.products.map((product) => [product.id, product]));
    const blindBoxItemsById = new Map(state.blindBoxItems.map((item) => [item.id, item]));

    const confirmedClaims = state.claims.filter(
      (claim) => claim.campaignId === campaignId && claim.userId === userId && claim.status === "CONFIRMED",
    );

    const confirmedTotal = confirmedClaims.reduce((sum, claim) => {
      return sum + getClaimUnitPrice(claim, productsById, blindBoxItemsById);
    }, 0);

    return confirmedTotal;
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

  const login = (identifier: string): ActionResult => {
    const normalized = normalizeEmail(identifier);
    if (!normalized) {
      return { ok: false, message: "請輸入 Email 或 FB 暱稱。" };
    }

    const user = state.users.find((item) => {
      const email = normalizeEmail(item.email);
      const nickname = normalizeNickname(item.fbNickname);
      return email === normalized || nickname === normalized;
    });

    if (!user) {
      return { ok: false, message: "找不到對應帳號（請確認 Email 或 FB 暱稱）。" };
    }
    setSessionUserId(user.id);
    runSupabaseWrite("sync profile on login", async () => {
      await upsertProfiles(supabase!, [user]);
    });
    void syncAdminFlagFromSupabase(user);
    return { ok: true, message: "登入成功。" };
  };

  const register = (input: RegisterInput): ActionResult => {
    const normalizedEmail = normalizeEmail(input.email);
    const normalizedNickname = normalizeNickname(input.fbNickname);
    if (!normalizedEmail || !normalizedNickname) {
      return { ok: false, message: "請完整填寫 Email 與 FB 暱稱。" };
    }
    const emailExists = state.users.some((user) => normalizeEmail(user.email) === normalizedEmail);
    if (emailExists) {
      return { ok: false, message: "此 Email 已註冊。" };
    }
    const nicknameExists = state.users.some((user) => normalizeNickname(user.fbNickname) === normalizedNickname);
    if (nicknameExists) {
      return { ok: false, message: "此 FB 暱稱已被使用，請換一個可識別的名稱。" };
    }

    const userId = crypto.randomUUID();

    const nextUser: UserProfile = {
      id: userId,
      email: normalizedEmail,
      fbNickname: input.fbNickname.trim(),
      pickupRate: 100,
      isAdmin: false,
      createdAt: new Date().toISOString(),
    };

    setState((prev) => ({
      ...prev,
      users: [...prev.users, nextUser],
    }));

    setSessionUserId(nextUser.id);
    runSupabaseWrite("register profile", async () => {
      await upsertProfiles(supabase!, [nextUser]);
    });
    void syncAdminFlagFromSupabase(nextUser);

    return { ok: true, message: "註冊成功，已自動登入。" };
  };

  const logout = (): void => {
    setSessionUserId(null);
  };

  const refreshCurrentUserAdminFlag = async (): Promise<ActionResult> => {
    if (!currentUser) {
      return { ok: false, message: "請先登入。" };
    }
    if (!supabase) {
      return { ok: false, message: "尚未設定 Supabase 環境變數。" };
    }

    await syncAdminFlagFromSupabase(currentUser);
    return { ok: true, message: "已重新同步權限，若帳號有管理員設定會自動顯示活動設定按鈕。" };
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

    if (resolved.stock !== null && reservedWithoutThis + nextQty > resolved.stock) {
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
      const blindBoxItem = cartItem.blindBoxItemId ? getBlindBoxItemById(cartItem.blindBoxItemId) ?? null : null;
      const unitPrice = product ? calculateUnitPrice(product, blindBoxItem) : 0;
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
      Array.from({ length: item.qty }).map(() => {
        const product = productsById.get(item.productId);
        const effectiveTier = product
          ? getProductAccess({
            campaign,
            product,
            user: currentUser,
            blindBoxItemId: item.blindBoxItemId ?? undefined,
          }).effectiveTier
          : "LEAK_PICK";

        return {
          id: crypto.randomUUID(),
          campaignId,
          productId: item.productId,
          blindBoxItemId: item.blindBoxItemId,
          userId: currentUser.id,
          roleTier: effectiveTier ?? "LEAK_PICK",
          createdAt: now,
          status: "LOCKED" as const,
        };
      }),
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

    runSupabaseWrite("place order bundle", async () => {
      await syncOrderBundle({ order, orderItems, claims });
    });

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
      roleTier: access.effectiveTier ?? "LEAK_PICK",
      status: "LOCKED",
      createdAt: new Date().toISOString(),
    };

    setState((prev) => ({ ...prev, claims: [...prev.claims, newClaim] }));
    runSupabaseWrite("claim product", async () => {
      await syncClaimRows([newClaim]);
    });
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

    runSupabaseWrite("cancel claim", async () => {
      await upsertClaims(supabase!, [{ ...target, status: "CANCELLED_BY_ADMIN" }]);
    });

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
    const stock = resolved?.stock ?? null;

    if (stock !== null && queueIndex >= stock) {
      return { ok: false, message: "此會員目前排在候補，尚未進入可分配名額。" };
    }

    setState((prev) => ({
      ...prev,
      claims: prev.claims.map((claim) =>
        claim.id === claimId ? { ...claim, status: "CONFIRMED" } : claim,
      ),
    }));

    runSupabaseWrite("confirm claim", async () => {
      await upsertClaims(supabase!, [{ ...target, status: "CONFIRMED" }]);
    });

    return { ok: true, message: "團主已確認此筆分配。" };
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

    const nextCampaign = state.campaigns.find((campaign) => campaign.id === campaignId);
    if (nextCampaign) {
      runSupabaseWrite("update campaign release stage", async () => {
        await syncCampaignRecords([{ ...nextCampaign, releaseStage: stage }]);
      });
    }

    return { ok: true, message: "已更新活動釋出階段。" };
  };

  const adminUpdateCampaignMaxClaims = (campaignId: string, maxClaims: number | null): ActionResult => {
    if (!currentUser?.isAdmin) {
      return { ok: false, message: "只有團主可以調整上限。" };
    }

    if (maxClaims !== null && (!Number.isFinite(maxClaims) || maxClaims < 1)) {
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

    const nextCampaign = state.campaigns.find((campaign) => campaign.id === campaignId);
    if (nextCampaign) {
      runSupabaseWrite("update campaign max claims", async () => {
        await syncCampaignRecords([{ ...nextCampaign, maxClaimsPerUser: maxClaims }]);
      });
    }

    return { ok: true, message: "已更新活動喊單上限（目前前台以商品上限為主）。" };
  };

  const adminUpdateProductRule = (args: ProductRuleUpdateInput): ActionResult => {
    if (!currentUser?.isAdmin) {
      return { ok: false, message: "只有團主可以調整商品規則。" };
    }

    const { productId, price, maxPerUser, stock, slotRestrictionEnabled, slotRestrictedCharacter } = args;
    const target = getProductById(productId);
    if (!target) return { ok: false, message: "找不到商品。" };

    if (price !== undefined && (!Number.isFinite(price) || price < 0)) {
      return { ok: false, message: "商品價格不可小於 0。" };
    }
    if (maxPerUser !== undefined && maxPerUser !== null && (!Number.isFinite(maxPerUser) || maxPerUser < 1)) {
      return { ok: false, message: "商品上限至少為 1，或設定為不限。" };
    }

    if (stock !== undefined && stock !== null && (!Number.isFinite(stock) || stock < 0)) {
      return { ok: false, message: "庫存不可為負數。" };
    }

    if (target.type === "NORMAL" && slotRestrictionEnabled === true) {
      return { ok: false, message: "一般商品不支援固位限制，固定為全員可喊。" };
    }

    const nextSlotRestrictionEnabled = target.type === "BLIND_BOX"
      ? (slotRestrictionEnabled ?? target.slotRestrictionEnabled)
      : false;
    const nextSlotRestrictedCharacter = target.type === "BLIND_BOX"
      ? (slotRestrictedCharacter === undefined ? target.slotRestrictedCharacter : slotRestrictedCharacter)
      : null;
    const nextProduct: Product = {
      ...target,
      price: price === undefined ? target.price : price,
      maxPerUser: maxPerUser === undefined ? target.maxPerUser : maxPerUser,
      stock: stock === undefined ? target.stock : (target.type === "NORMAL" ? stock : target.stock),
      slotRestrictionEnabled: nextSlotRestrictionEnabled,
      slotRestrictedCharacter: nextSlotRestrictionEnabled ? nextSlotRestrictedCharacter : null,
    };

    setState((prev) => ({
      ...prev,
      products: prev.products.map((product) =>
        product.id === productId
          ? nextProduct
          : product,
      ),
    }));

    runSupabaseWrite("update product rule", async () => {
      await syncProductRecords([nextProduct]);
    });

    return { ok: true, message: "已更新商品規則。" };
  };

  const adminCreateCategory = (name: string): ActionResult => {
    if (!currentUser?.isAdmin) {
      return { ok: false, message: "只有團主可以新增分類。" };
    }

    const normalized = normalizeCategoryName(name);
    if (!normalized) {
      return { ok: false, message: "分類名稱不可為空。" };
    }

    if (state.productCategories.includes(normalized)) {
      return { ok: false, message: "此分類已存在。" };
    }

    setState((prev) => ({
      ...prev,
      productCategories: [...prev.productCategories, normalized],
    }));

    return { ok: true, message: `已新增分類「${normalized}」。` };
  };

  const adminDeleteCategory = (name: string): ActionResult => {
    if (!currentUser?.isAdmin) {
      return { ok: false, message: "只有團主可以刪除分類。" };
    }

    const normalized = normalizeCategoryName(name);
    if (normalized === "未分類") {
      return { ok: false, message: "不可刪除預設分類「未分類」。" };
    }

    if (!state.productCategories.includes(normalized)) {
      return { ok: false, message: "找不到指定分類。" };
    }

    setState((prev) => ({
      ...prev,
      productCategories: prev.productCategories.filter((item) => item !== normalized),
      products: prev.products.map((product) =>
        product.series === normalized ? { ...product, series: "未分類" } : product,
      ),
    }));

    return { ok: true, message: `已刪除分類「${normalized}」，原商品已歸入未分類。` };
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
        runSupabaseWrite("delete character slot", async () => {
          await deleteCharacterSlots(supabase!, [exists.id]);
        });
      }
      return { ok: true, message: `${user.fbNickname} 的 ${character} 已設為無。` };
    }

    const nextSlot: CharacterSlot = exists
      ? { ...exists, tier, updatedAt: now }
      : {
        id: crypto.randomUUID(),
        userId,
        character,
        tier,
        createdAt: now,
        updatedAt: now,
      };

    if (exists) {
      setState((prev) => ({
        ...prev,
        characterSlots: prev.characterSlots.map((item) =>
          item.id === exists.id ? nextSlot : item,
        ),
      }));
    } else {
      setState((prev) => ({
        ...prev,
        characterSlots: [
          ...prev.characterSlots,
          nextSlot,
        ],
      }));
    }

    runSupabaseWrite("upsert character slot", async () => {
      await syncCharacterSlotRows([nextSlot]);
    });

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
    const nextSlotsForSync: CharacterSlot[] = [];

    setState((prev) => {
      const nextSlots = [...prev.characterSlots];

      members.forEach((member, index) => {
        const tier = tiers[index % tiers.length];
        const existingIndex = nextSlots.findIndex(
          (item) => item.userId === member.id && item.character === character,
        );

        if (existingIndex >= 0) {
          nextSlots[existingIndex] = { ...nextSlots[existingIndex], tier, updatedAt: now };
          nextSlotsForSync.push(nextSlots[existingIndex]);
        } else {
          const createdSlot: CharacterSlot = {
            id: crypto.randomUUID(),
            userId: member.id,
            character,
            tier,
            createdAt: now,
            updatedAt: now,
          };
          nextSlots.push(createdSlot);
          nextSlotsForSync.push(createdSlot);
        }
      });

      return { ...prev, characterSlots: nextSlots };
    });

    runSupabaseWrite("auto assign character slots", async () => {
      await syncCharacterSlotRows(nextSlotsForSync);
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
      releaseStage: input.releaseStage,
      maxClaimsPerUser: null,
      createdBy: currentUser.id,
    };

    setState((prev) => ({
      ...prev,
      campaigns: [campaign, ...prev.campaigns],
    }));

    runSupabaseWrite("create campaign", async () => {
      await syncCampaignRecords([campaign]);
    });

    return { ok: true, message: `已建立活動「${campaign.title}」。` };
  };

  const adminDeleteCampaign = (campaignId: string): ActionResult => {
    if (!currentUser?.isAdmin) {
      return { ok: false, message: "只有團主可以刪除活動。" };
    }

    const campaign = state.campaigns.find((item) => item.id === campaignId);
    if (!campaign) {
      return { ok: false, message: "找不到活動。" };
    }

    const productIds = new Set(
      state.products.filter((product) => product.campaignId === campaignId).map((product) => product.id),
    );
    const orderIds = new Set(
      state.orders.filter((order) => order.campaignId === campaignId).map((order) => order.id),
    );

    setState((prev) => ({
      ...prev,
      campaigns: prev.campaigns.filter((item) => item.id !== campaignId),
      products: prev.products.filter((item) => item.campaignId !== campaignId),
      blindBoxItems: prev.blindBoxItems.filter((item) => !productIds.has(item.productId)),
      claims: prev.claims.filter((item) => item.campaignId !== campaignId),
      payments: prev.payments.filter((item) => item.campaignId !== campaignId),
      shipments: prev.shipments.filter((item) => item.campaignId !== campaignId),
      cartItems: prev.cartItems.filter((item) => item.campaignId !== campaignId),
      orders: prev.orders.filter((item) => item.campaignId !== campaignId),
      orderItems: prev.orderItems.filter((item) => !orderIds.has(item.orderId)),
    }));

    runSupabaseWrite("delete campaign", async () => {
      const { error } = await supabase!.from("campaigns").delete().eq("id", campaignId);
      if (error) throw error;
    });

    return { ok: true, message: `已刪除活動「${campaign.title}」及其關聯資料。` };
  };

  const adminCreateProduct = (input: CreateProductInput): ActionResult => {
    if (!currentUser?.isAdmin) {
      return { ok: false, message: "只有團主可以新增商品。" };
    }

    const campaign = getCampaignById(input.campaignId);
    if (!campaign) return { ok: false, message: "找不到活動。" };

    if (!input.name.trim()) {
      return { ok: false, message: "商品名稱必填。" };
    }

    if (input.type === "NORMAL") {
      if (input.stock !== null && (!Number.isFinite(input.stock) || input.stock < 0)) {
        return { ok: false, message: "一般商品庫存必須 >= 0。" };
      }
    }

    if (input.maxPerUser !== null && (!Number.isFinite(input.maxPerUser) || input.maxPerUser < 1)) {
      return { ok: false, message: "單人上限至少為 1，或留空為不限。" };
    }
    if (!Number.isFinite(input.price) || input.price < 0) {
      return { ok: false, message: "商品價格不可小於 0。" };
    }

    const sku = input.sku?.trim() || generateNextSku("PRD", state.products.map((product) => product.sku));
    const normalizedSeries = normalizeCategoryName(input.series);
    const resolvedSlotRestrictionEnabled = input.type === "BLIND_BOX" ? input.slotRestrictionEnabled : false;
    const resolvedSlotRestrictedCharacter = input.type === "BLIND_BOX" && resolvedSlotRestrictionEnabled
      ? input.slotRestrictedCharacter
      : null;

    const product: Product = {
      id: crypto.randomUUID(),
      campaignId: input.campaignId,
      sku,
      name: input.name.trim(),
      series: normalizedSeries,
      type: input.type,
      character: input.type === "NORMAL" ? input.character : null,
      slotRestrictionEnabled: resolvedSlotRestrictionEnabled,
      slotRestrictedCharacter: resolvedSlotRestrictedCharacter,
      imageUrl: input.imageUrl && input.imageUrl.trim() ? input.imageUrl.trim() : null,
      price: input.price,
      stock: input.type === "NORMAL" ? input.stock : null,
      maxPerUser: input.maxPerUser,
    };

    setState((prev) => ({
      ...prev,
      productCategories: prev.productCategories.includes(normalizedSeries)
        ? prev.productCategories
        : [...prev.productCategories, normalizedSeries],
      products: [product, ...prev.products],
    }));

    runSupabaseWrite("create product", async () => {
      await syncProductRecords([product]);
    });

    return { ok: true, message: `已建立商品「${product.name}」（SKU：${sku}）。` };
  };

  const adminCreateBlindBoxItem = (input: CreateBlindBoxItemInput): ActionResult => {
    if (!currentUser?.isAdmin) {
      return { ok: false, message: "只有團主可以新增盲盒子項。" };
    }

    const product = getProductById(input.productId);
    if (!product || product.type !== "BLIND_BOX") {
      return { ok: false, message: "找不到盲盒商品。" };
    }

    if (!input.name.trim()) {
      return { ok: false, message: "子項名稱必填。" };
    }

    if (input.stock !== null && (!Number.isFinite(input.stock) || input.stock < 0)) {
      return { ok: false, message: "子項庫存不可小於 0。" };
    }

    if (input.maxPerUser !== null && (!Number.isFinite(input.maxPerUser) || input.maxPerUser < 1)) {
      return { ok: false, message: "子項上限至少為 1，或設為不限。" };
    }
    if (input.price !== null && (!Number.isFinite(input.price) || input.price < 0)) {
      return { ok: false, message: "子項價格不可小於 0。" };
    }

    const sku = input.sku?.trim() || generateNextSku("BLI", state.blindBoxItems.map((item) => item.sku));
    const blindBoxItem: BlindBoxItem = {
      id: crypto.randomUUID(),
      productId: input.productId,
      sku,
      name: input.name.trim(),
      character: input.character,
      imageUrl: input.imageUrl && input.imageUrl.trim() ? input.imageUrl.trim() : null,
      price: input.price,
      stock: input.stock,
      maxPerUser: input.maxPerUser,
    };

    setState((prev) => ({
      ...prev,
      blindBoxItems: [blindBoxItem, ...prev.blindBoxItems],
    }));

    runSupabaseWrite("create blind box item", async () => {
      await syncBlindBoxItemRecords([blindBoxItem]);
    });

    return { ok: true, message: `已新增子項「${blindBoxItem.name}」（SKU：${sku}）。` };
  };

  const adminUpdateBlindBoxItemRule = (args: BlindBoxItemRuleUpdateInput): ActionResult => {
    if (!currentUser?.isAdmin) {
      return { ok: false, message: "只有團主可以調整盲盒子項。" };
    }

    const { blindBoxItemId, price, stock, maxPerUser } = args;
    const target = getBlindBoxItemById(blindBoxItemId);
    if (!target) {
      return { ok: false, message: "找不到盲盒子項。" };
    }
    if (price !== undefined && price !== null && (!Number.isFinite(price) || price < 0)) {
      return { ok: false, message: "子項價格不可小於 0。" };
    }
    if (stock !== undefined && stock !== null && (!Number.isFinite(stock) || stock < 0)) {
      return { ok: false, message: "子項庫存不可小於 0。" };
    }
    if (maxPerUser !== undefined && maxPerUser !== null && (!Number.isFinite(maxPerUser) || maxPerUser < 1)) {
      return { ok: false, message: "子項上限至少為 1，或設為不限。" };
    }

    setState((prev) => ({
      ...prev,
      blindBoxItems: prev.blindBoxItems.map((item) =>
        item.id === blindBoxItemId
          ? {
            ...item,
            price: price === undefined ? item.price : price,
            stock: stock === undefined ? item.stock : stock,
            maxPerUser: maxPerUser === undefined ? item.maxPerUser : maxPerUser,
          }
          : item,
      ),
    }));

    const nextBlindBoxItem: BlindBoxItem = {
      ...target,
      price: price === undefined ? target.price : price,
      stock: stock === undefined ? target.stock : stock,
      maxPerUser: maxPerUser === undefined ? target.maxPerUser : maxPerUser,
    };

    runSupabaseWrite("update blind box item rule", async () => {
      await syncBlindBoxItemRecords([nextBlindBoxItem]);
    });

    return { ok: true, message: `已更新子項「${target.name}」。` };
  };

  const adminSetUserAdmin = async (userId: string, isAdmin: boolean): Promise<ActionResult> => {
    if (!currentUser?.isAdmin) {
      return { ok: false, message: "只有管理員可以調整權限。" };
    }

    const target = state.users.find((item) => item.id === userId);
    if (!target) {
      return { ok: false, message: "找不到指定帳號。" };
    }

    if (target.id === currentUser.id && !isAdmin) {
      return { ok: false, message: "不可移除自己的管理員權限。" };
    }

    setState((prev) => ({
      ...prev,
      users: prev.users.map((item) =>
        item.id === userId ? { ...item, isAdmin } : item,
      ),
    }));

    if (supabase) {
      const nextTarget = { ...target, isAdmin };
      const [overrideResult, profileResult] = await Promise.all([
        supabase.from("admin_overrides").upsert(
          {
            email: normalizeEmail(target.email),
            is_admin: isAdmin,
            note: `set by ${normalizeEmail(currentUser.email)}`,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "email" },
        ),
        upsertProfiles(supabase, [nextTarget]).then(() => ({ error: null as null | { message: string } })).catch((error: Error) => ({
          error: { message: error.message },
        })),
      ]);

      if (overrideResult.error || profileResult.error) {
        const message = overrideResult.error?.message ?? profileResult.error?.message ?? "未知錯誤";
        return { ok: false, message: `本地已更新，但 Supabase 同步失敗：${message}` };
      }
    }

    return { ok: true, message: `${target.fbNickname} 已${isAdmin ? "設為" : "取消"}管理員。` };
  };

  const adminDeleteUser = async (userId: string): Promise<ActionResult> => {
    if (!currentUser?.isAdmin) {
      return { ok: false, message: "只有管理員可以刪除帳號。" };
    }

    const target = state.users.find((item) => item.id === userId);
    if (!target) {
      return { ok: false, message: "找不到指定帳號。" };
    }

    if (target.id === currentUser.id) {
      return { ok: false, message: "不可刪除目前登入中的管理員帳號。" };
    }

    const adminCount = state.users.filter((item) => item.isAdmin).length;
    if (target.isAdmin && adminCount <= 1) {
      return { ok: false, message: "系統至少要保留一位管理員。" };
    }

    const orderIds = new Set(
      state.orders.filter((order) => order.userId === userId).map((order) => order.id),
    );

    setState((prev) => ({
      ...prev,
      users: prev.users.filter((item) => item.id !== userId),
      characterSlots: prev.characterSlots.filter((item) => item.userId !== userId),
      claims: prev.claims.filter((item) => item.userId !== userId),
      payments: prev.payments.filter((item) => item.userId !== userId),
      shipments: prev.shipments.filter((item) => item.userId !== userId),
      cartItems: prev.cartItems.filter((item) => item.userId !== userId),
      orders: prev.orders.filter((item) => item.userId !== userId),
      orderItems: prev.orderItems.filter((item) => !orderIds.has(item.orderId) && item.userId !== userId),
    }));

    if (supabase) {
      const [overrideResult, profileResult] = await Promise.all([
        supabase
          .from("admin_overrides")
          .delete()
          .ilike("email", normalizeEmail(target.email)),
        supabase
          .from("profiles")
          .delete()
          .eq("id", target.id),
      ]);

      if (overrideResult.error || profileResult.error) {
        const message = overrideResult.error?.message ?? profileResult.error?.message ?? "未知錯誤";
        return { ok: false, message: `本地已刪除帳號，但 Supabase 同步失敗：${message}` };
      }
    }

    return { ok: true, message: `已刪除帳號 ${target.fbNickname}。` };
  };

  const adminUpdateUserPickupRate = (userId: string, pickupRate: number): ActionResult => {
    if (!currentUser?.isAdmin) {
      return { ok: false, message: "只有管理員可以調整取貨率。" };
    }

    if (!Number.isFinite(pickupRate) || pickupRate < 0 || pickupRate > 100) {
      return { ok: false, message: "取貨率需介於 0 到 100 之間。" };
    }

    const target = state.users.find((item) => item.id === userId);
    if (!target) {
      return { ok: false, message: "找不到指定帳號。" };
    }

    setState((prev) => ({
      ...prev,
      users: prev.users.map((item) =>
        item.id === userId ? { ...item, pickupRate: Math.round(pickupRate) } : item,
      ),
    }));

    runSupabaseWrite("update pickup rate", async () => {
      await upsertProfiles(supabase!, [{ ...target, pickupRate: Math.round(pickupRate) }]);
    });

    return { ok: true, message: `${target.fbNickname} 取貨率已更新為 ${Math.round(pickupRate)}%。` };
  };

  const adminUpdateOrderStatus = (orderId: string, status: OrderStatus): ActionResult => {
    if (!currentUser?.isAdmin) {
      return { ok: false, message: "只有管理員可以更新訂單狀態。" };
    }

    const target = state.orders.find((item) => item.id === orderId);
    if (!target) {
      return { ok: false, message: "找不到訂單。" };
    }

    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((item) =>
        item.id === orderId ? { ...item, status } : item,
      ),
    }));

    runSupabaseWrite("update order status", async () => {
      await upsertOrders(supabase!, [{ ...target, status }]);
    });

    return { ok: true, message: `訂單狀態已更新為 ${status}。` };
  };

  const resetAllData = (): void => {
    if (supabase) {
      const next = createEmptyState();
      setState(next);
      setStateHydrated(true);
      setSessionUserId(null);
      saveState(next);
      return;
    }

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
    adminUpdateBlindBoxItemRule,
    adminCreateCategory,
    adminDeleteCategory,
    adminAssignCharacterSlot,
    adminAutoAssignCharacterSlots,
    adminCreateCampaign,
    adminDeleteCampaign,
    adminCreateProduct,
    adminCreateBlindBoxItem,
    adminSetUserAdmin,
    adminDeleteUser,
    adminUpdateUserPickupRate,
    adminUpdateOrderStatus,
    refreshCurrentUserAdminFlag,
  };
}
