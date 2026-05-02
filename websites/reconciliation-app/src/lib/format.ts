import type { Currency, EntryStatus, EntryType, Role, SettlementStatus, WiseFeePolicy } from "@prisma/client";

export function money(amount: number, currency: Currency = "JPY") {
  return new Intl.NumberFormat(currency === "JPY" ? "ja-JP" : "zh-TW", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "JPY" ? 0 : 2,
  }).format(amount);
}

export function decimal(value: unknown) {
  return Number(value ?? 0);
}

export function dateInputValue(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function shortDate(date: Date | string) {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

export function roleLabel(role: Role) {
  return role === "ADMIN" ? "我方" : "對方";
}

export function typeLabel(type: EntryType) {
  return type === "SHIPMENT" ? "寄貨" : type === "TRANSFER" ? "轉帳" : "調整";
}

export function statusLabel(status: EntryStatus | SettlementStatus) {
  const labels: Record<string, string> = {
    PENDING: "待確認",
    CONFIRMED: "已確認",
    REJECTED: "已拒絕",
    DRAFT: "草稿",
    PAID: "已付款",
  };
  return labels[status] ?? status;
}

export function feePolicyLabel(policy: WiseFeePolicy) {
  const labels: Record<WiseFeePolicy, string> = {
    SENDER: "轉出方",
    RECEIVER: "收款方",
    SPLIT: "雙方平分",
  };
  return labels[policy];
}
