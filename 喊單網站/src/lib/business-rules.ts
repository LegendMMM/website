import { BINDING_WEIGHT, BINDING_WEIGHT_FALLBACK, ROLE_LABEL, ROLE_PRIORITY } from "./constants";
import type {
  BindingAssignment,
  Campaign,
  CharacterName,
  Claim,
  FixedTier,
  PaymentMethod,
  Product,
  ProductRequiredTier,
  ReleaseStage,
  RoleTier,
  ShipmentDraft,
  UserProfile,
} from "../types/domain";

export function sortClaimsByPriority(claims: Claim[]): Claim[] {
  return [...claims].sort((a, b) => {
    const priorityDiff = ROLE_PRIORITY[a.roleTier] - ROLE_PRIORITY[b.roleTier];
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

export function canUseCod(pickupRate: number, totalAmount: number): boolean {
  return pickupRate >= 90 && totalAmount <= 300;
}

export function availablePaymentMethods(pickupRate: number, totalAmount: number): PaymentMethod[] {
  const methods: PaymentMethod[] = ["BANK_TRANSFER", "CARDLESS_DEPOSIT", "EMPTY_PACKAGE"];
  if (canUseCod(pickupRate, totalAmount)) {
    methods.push("CASH_ON_DELIVERY");
  }
  return methods;
}

export function calculateUnitPrice(product: Product, campaign: Campaign): number {
  if (campaign.pricingMode === "AVERAGE_WITH_BINDING") {
    return product.averagePrice;
  }
  return product.isPopular ? product.hotPrice : product.coldPrice;
}

export function calculateUserWeight(
  userId: string,
  confirmedClaims: Claim[],
  productsById: Map<string, Product>,
): number {
  const userClaims = confirmedClaims.filter((claim) => claim.userId === userId);
  if (userClaims.length === 0) return 0;

  return userClaims.reduce((maxWeight, claim) => {
    const product = productsById.get(claim.productId);
    if (!product) return maxWeight;
    const weight = BINDING_WEIGHT[product.character] ?? BINDING_WEIGHT_FALLBACK;
    return Math.max(maxWeight, weight);
  }, 0);
}

export function buildBindingAssignments(params: {
  campaign: Campaign;
  products: Product[];
  confirmedClaims: Claim[];
  existingBindings: BindingAssignment[];
}): BindingAssignment[] {
  const { campaign, products, confirmedClaims, existingBindings } = params;
  if (campaign.pricingMode !== "AVERAGE_WITH_BINDING") return [];

  const productsById = new Map(products.map((product) => [product.id, product]));

  const popularBuyerIds = new Set(
    confirmedClaims
      .filter((claim) => {
        const product = productsById.get(claim.productId);
        return product?.isPopular;
      })
      .map((claim) => claim.userId),
  );

  const alreadyBoundBuyer = new Set(existingBindings.map((binding) => binding.buyerUserId));

  const bindPool = products
    .filter((product) => !product.isPopular)
    .flatMap((product) => {
      const usedCount = confirmedClaims.filter((claim) => claim.productId === product.id).length;
      const remain = Math.max(0, product.stock - usedCount);
      return Array.from({ length: remain }, () => product.id);
    });

  if (bindPool.length === 0) return [];

  const weightedBuyers = Array.from(popularBuyerIds)
    .filter((buyerUserId) => !alreadyBoundBuyer.has(buyerUserId))
    .map((buyerUserId) => ({
      buyerUserId,
      weight: calculateUserWeight(buyerUserId, confirmedClaims, productsById),
    }))
    .sort((a, b) => b.weight - a.weight);

  const newAssignments: BindingAssignment[] = [];
  weightedBuyers.forEach((buyer, index) => {
    const bindProductId = bindPool[index];
    if (!bindProductId) return;
    const bindProduct = productsById.get(bindProductId);
    if (!bindProduct) return;
    newAssignments.push({
      id: crypto.randomUUID(),
      campaignId: campaign.id,
      buyerUserId: buyer.buyerUserId,
      bindProductId,
      reason: `平均價模式：熱門角觸發綁物（權重 ${buyer.weight}）`,
      createdAt: new Date().toISOString(),
    });
  });

  return newAssignments;
}

export function buildShipmentDraft(args: {
  campaignId: string;
  user: UserProfile;
  amount: number;
  paymentMethod: PaymentMethod;
  receiverName: string;
  receiverPhone: string;
  receiverStoreCode: string;
}): ShipmentDraft {
  const { campaignId, user, amount, paymentMethod, receiverName, receiverPhone, receiverStoreCode } = args;
  return {
    id: crypto.randomUUID(),
    campaignId,
    userId: user.id,
    orderAmount: amount,
    paymentMethod,
    canUseCod: canUseCod(user.pickupRate, amount),
    receiverName,
    receiverPhone,
    receiverStoreCode,
  };
}

export function isClaimImmutableForMember(claim: Claim, currentUser: UserProfile): boolean {
  return claim.userId === currentUser.id && claim.status === "LOCKED";
}

export function roleCanBeat(roleA: RoleTier, roleB: RoleTier): boolean {
  return ROLE_PRIORITY[roleA] < ROLE_PRIORITY[roleB];
}

export function roleCanAccessReleaseStage(roleTier: RoleTier, releaseStage: ReleaseStage): boolean {
  if (releaseStage === "ALL_OPEN") return true;
  if (releaseStage === "FIXED_1_ONLY") return roleTier === "FIXED_1";
  if (releaseStage === "FIXED_1_2") return roleTier === "FIXED_1" || roleTier === "FIXED_2";
  return roleTier === "FIXED_1" || roleTier === "FIXED_2" || roleTier === "FIXED_3";
}

export function releaseStageAllowsRequiredTier(
  releaseStage: ReleaseStage,
  requiredTier: ProductRequiredTier,
): boolean {
  if (releaseStage === "ALL_OPEN") return true;
  if (requiredTier === "ALL_OPEN") return true;
  if (releaseStage === "FIXED_1_ONLY") return requiredTier === "FIXED_1";
  if (releaseStage === "FIXED_1_2") return requiredTier === "FIXED_1" || requiredTier === "FIXED_2";
  return requiredTier === "FIXED_1" || requiredTier === "FIXED_2" || requiredTier === "FIXED_3";
}

export function canBuyByCharacterSlot(params: {
  releaseStage: ReleaseStage;
  requiredTier: ProductRequiredTier;
  character: CharacterName;
  userCharacterTier: FixedTier | null;
}): { ok: boolean; reason: string } {
  const { releaseStage, requiredTier, character, userCharacterTier } = params;

  if (!releaseStageAllowsRequiredTier(releaseStage, requiredTier)) {
    return { ok: false, reason: "此商品尚未開放到目前釋出階段。" };
  }

  if (releaseStage === "ALL_OPEN" || requiredTier === "ALL_OPEN") {
    return { ok: true, reason: "" };
  }

  if (!userCharacterTier) {
    return { ok: false, reason: `${character} 尚未分配固位，暫不可購買。` };
  }

  if (userCharacterTier !== requiredTier) {
    return { ok: false, reason: `${character} 你的固位是 ${ROLE_LABEL[userCharacterTier]}，不符合此商品要求。` };
  }

  return { ok: true, reason: "" };
}
