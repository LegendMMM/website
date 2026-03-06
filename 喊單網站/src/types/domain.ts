export type RoleTier = "FIXED_1" | "FIXED_2" | "FIXED_3" | "LEAK_PICK";

export type PricingMode = "DYNAMIC" | "AVERAGE_WITH_BINDING";

export type PaymentMethod =
  | "BANK_TRANSFER"
  | "CARDLESS_DEPOSIT"
  | "EMPTY_PACKAGE"
  | "CASH_ON_DELIVERY";

export type ClaimStatus = "LOCKED" | "CANCELLED_BY_ADMIN" | "CONFIRMED";

export type CampaignStatus = "OPEN" | "CLOSED";
export type ReleaseStage = "FIXED_1_ONLY" | "FIXED_1_2" | "FIXED_1_2_3" | "ALL_OPEN";

export interface UserProfile {
  id: string;
  email: string;
  password: string;
  fbNickname: string;
  roleTier: RoleTier;
  pickupRate: number;
  isAdmin: boolean;
  createdAt: string;
}

export interface Campaign {
  id: string;
  title: string;
  description: string;
  deadlineAt: string;
  status: CampaignStatus;
  pricingMode: PricingMode;
  releaseStage: ReleaseStage;
  maxClaimsPerUser: number | null;
  createdBy: string;
}

export interface Product {
  id: string;
  campaignId: string;
  sku: string;
  name: string;
  character: string;
  isPopular: boolean;
  hotPrice: number;
  coldPrice: number;
  averagePrice: number;
  stock: number;
}

export interface Claim {
  id: string;
  campaignId: string;
  productId: string;
  userId: string;
  roleTier: RoleTier;
  createdAt: string;
  status: ClaimStatus;
}

export interface Payment {
  id: string;
  campaignId: string;
  userId: string;
  amount: number;
  method: PaymentMethod;
  lastFiveCode: string;
  reconciled: boolean;
  createdAt: string;
}

export interface BindingAssignment {
  id: string;
  campaignId: string;
  buyerUserId: string;
  bindProductId: string;
  reason: string;
  createdAt: string;
}

export interface ShipmentDraft {
  id: string;
  campaignId: string;
  userId: string;
  orderAmount: number;
  paymentMethod: PaymentMethod;
  canUseCod: boolean;
  receiverName: string;
  receiverPhone: string;
  receiverStoreCode: string;
}

export interface CartItem {
  id: string;
  campaignId: string;
  productId: string;
  userId: string;
  createdAt: string;
}

export type OrderStatus = "PLACED" | "PAID" | "CANCELLED";

export interface Order {
  id: string;
  campaignId: string;
  userId: string;
  status: OrderStatus;
  totalAmount: number;
  createdAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  campaignId: string;
  productId: string;
  userId: string;
  unitPrice: number;
  createdAt: string;
}

export interface OrderSystemState {
  users: UserProfile[];
  campaigns: Campaign[];
  products: Product[];
  claims: Claim[];
  payments: Payment[];
  bindings: BindingAssignment[];
  shipments: ShipmentDraft[];
  cartItems: CartItem[];
  orders: Order[];
  orderItems: OrderItem[];
}
