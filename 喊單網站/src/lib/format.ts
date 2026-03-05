import { ROLE_LABEL } from "./constants";
import type { PaymentMethod, RoleTier } from "../types/domain";

export const paymentLabel: Record<PaymentMethod, string> = {
  BANK_TRANSFER: "匯款",
  CARDLESS_DEPOSIT: "無卡存款",
  EMPTY_PACKAGE: "空包",
  CASH_ON_DELIVERY: "貨到付款",
};

export function roleLabel(role: RoleTier): string {
  return ROLE_LABEL[role];
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function twd(value: number): string {
  return `NT$ ${value.toLocaleString("zh-TW")}`;
}
