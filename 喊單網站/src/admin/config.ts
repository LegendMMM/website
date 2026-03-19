export type AdminTab = "claims" | "fulfillment" | "members" | "catalog";

export const adminTabs: Array<{ id: AdminTab; label: string }> = [
  { id: "claims", label: "全站喊單總表" },
  { id: "fulfillment", label: "履約" },
  { id: "members", label: "會員" },
  { id: "catalog", label: "商品管理" },
];
