import { ROLE_LABEL, ROLE_PRIORITY } from "./constants";
import type {
  BlindBoxItem,
  CharacterName,
  CharacterTier,
  Claim,
  PaymentMethod,
  Product,
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

export function calculateUnitPrice(product: Product, blindBoxItem?: BlindBoxItem | null): number {
  return blindBoxItem?.price ?? product.price;
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

export function releaseStageAllowsTier(
  releaseStage: ReleaseStage,
  effectiveTier: CharacterTier,
): boolean {
  return roleCanAccessReleaseStage(effectiveTier, releaseStage);
}

export function canBuyByCharacterSlot(params: {
  releaseStage: ReleaseStage;
  character: CharacterName;
  userCharacterTier: CharacterTier | null;
}): { ok: boolean; reason: string; effectiveTier: RoleTier } {
  const { releaseStage, character, userCharacterTier } = params;

  if (!userCharacterTier) {
    if (releaseStage === "ALL_OPEN") {
      return { ok: true, reason: "", effectiveTier: "LEAK_PICK" };
    }
    return { ok: false, reason: `${character} 尚未分配固位，暫不可填單。`, effectiveTier: "LEAK_PICK" };
  }

  if (!releaseStageAllowsTier(releaseStage, userCharacterTier)) {
    return {
      ok: false,
      reason: `${character} 你的固位是 ${ROLE_LABEL[userCharacterTier]}，目前釋出階段尚未開放。`,
      effectiveTier: userCharacterTier,
    };
  }

  return { ok: true, reason: "", effectiveTier: userCharacterTier };
}
