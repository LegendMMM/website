export type Currency = "JPY" | "TWD";
export type SettlementDirection = "ADMIN_TO_PARTNER" | "PARTNER_TO_ADMIN";
export type FeePolicy = "SENDER" | "RECEIVER" | "SPLIT";

export interface WiseFeeConfig {
  fixedJpy: number;
  percent: number;
}

export interface SettlementConfig {
  jpyPerTwd: number;
  wiseFee: WiseFeeConfig;
  feePolicy: FeePolicy;
}

export interface SettlementLineItem {
  id: string;
  amount: number;
  currency?: Currency;
  direction: SettlementDirection;
  confirmed?: boolean;
  settled?: boolean;
}

export interface NormalizedSettlementLineItem extends SettlementLineItem {
  currency: Currency;
  signedJpy: number;
}

export interface CurrencyTotals {
  JPY: number;
  TWD: number;
}

export interface WiseFeeAllocation {
  totalJpy: number;
  senderJpy: number;
  receiverJpy: number;
}

export interface RecommendedSettlement {
  payer: "ADMIN" | "PARTNER" | null;
  payee: "ADMIN" | "PARTNER" | null;
  amountJpy: number;
}

export interface SettlementSummary {
  items: NormalizedSettlementLineItem[];
  netJpy: number;
  totalsByCurrency: CurrencyTotals;
  recommended: RecommendedSettlement;
  wiseFee: WiseFeeAllocation;
}

export const DEFAULT_CURRENCY: Currency = "JPY";

export function toJpy(amount: number, currency: Currency = DEFAULT_CURRENCY, jpyPerTwd: number): number {
  assertFiniteNumber(amount, "amount");
  assertPositiveNumber(jpyPerTwd, "jpyPerTwd");

  return roundJpy(currency === "TWD" ? amount * jpyPerTwd : amount);
}

export function signedJpyForLineItem(item: SettlementLineItem, jpyPerTwd: number): number {
  const absoluteJpy = toJpy(item.amount, item.currency ?? DEFAULT_CURRENCY, jpyPerTwd);

  return item.direction === "PARTNER_TO_ADMIN" ? absoluteJpy : -absoluteJpy;
}

export function filterUnsettledConfirmedItems(items: SettlementLineItem[]): SettlementLineItem[] {
  return items.filter((item) => item.confirmed === true && item.settled !== true);
}

export function calculateCurrencyTotals(items: SettlementLineItem[]): CurrencyTotals {
  return items.reduce<CurrencyTotals>(
    (totals, item) => {
      assertFiniteNumber(item.amount, "item.amount");
      totals[item.currency ?? DEFAULT_CURRENCY] += item.amount;
      return totals;
    },
    { JPY: 0, TWD: 0 },
  );
}

export function calculateWiseFee(amountJpy: number, wiseFee: WiseFeeConfig, feePolicy: FeePolicy): WiseFeeAllocation {
  assertFiniteNumber(amountJpy, "amountJpy");
  assertFiniteNumber(wiseFee.fixedJpy, "wiseFee.fixedJpy");
  assertFiniteNumber(wiseFee.percent, "wiseFee.percent");

  const totalJpy = roundJpy(wiseFee.fixedJpy + Math.abs(amountJpy) * wiseFee.percent);

  if (feePolicy === "SENDER") {
    return { totalJpy, senderJpy: totalJpy, receiverJpy: 0 };
  }

  if (feePolicy === "RECEIVER") {
    return { totalJpy, senderJpy: 0, receiverJpy: totalJpy };
  }

  const senderJpy = Math.floor(totalJpy / 2);
  return { totalJpy, senderJpy, receiverJpy: totalJpy - senderJpy };
}

export function recommendedSettlement(netJpy: number): RecommendedSettlement {
  const amountJpy = Math.abs(roundJpy(netJpy));

  if (amountJpy === 0) {
    return { payer: null, payee: null, amountJpy: 0 };
  }

  return netJpy > 0
    ? { payer: "PARTNER", payee: "ADMIN", amountJpy }
    : { payer: "ADMIN", payee: "PARTNER", amountJpy };
}

export function calculateSettlementSummary(
  inputItems: SettlementLineItem[],
  config: SettlementConfig,
): SettlementSummary {
  const itemsToSettle = filterUnsettledConfirmedItems(inputItems);
  const items = itemsToSettle.map<NormalizedSettlementLineItem>((item) => ({
    ...item,
    currency: item.currency ?? DEFAULT_CURRENCY,
    signedJpy: signedJpyForLineItem(item, config.jpyPerTwd),
  }));
  const netJpy = roundJpy(items.reduce((total, item) => total + item.signedJpy, 0));

  return {
    items,
    netJpy,
    totalsByCurrency: calculateCurrencyTotals(itemsToSettle),
    recommended: recommendedSettlement(netJpy),
    wiseFee: calculateWiseFee(netJpy, config.wiseFee, config.feePolicy),
  };
}

function roundJpy(amount: number): number {
  return Math.round(amount);
}

function assertFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
}

function assertPositiveNumber(value: number, name: string): void {
  assertFiniteNumber(value, name);

  if (value <= 0) {
    throw new Error(`${name} must be greater than 0`);
  }
}
