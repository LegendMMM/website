import { useEffect, useMemo, useState } from "react";
import {
  availablePaymentMethods,
  buildBindingAssignments,
  buildShipmentDraft,
  calculateUnitPrice,
  sortClaimsByPriority,
} from "../lib/business-rules";
import { loadSessionUserId, loadState, resetState, saveSessionUserId, saveState } from "../lib/storage";
import type {
  Campaign,
  Claim,
  OrderSystemState,
  PaymentMethod,
  Product,
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
}

const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
const lastFivePattern = /^\d{5}$/;

function campaignOpen(campaign: Campaign): boolean {
  return campaign.status === "OPEN" && new Date(campaign.deadlineAt).getTime() > Date.now();
}

function getClaimUnitPrice(claim: Claim, campaign: Campaign, productsById: Map<string, Product>): number {
  const product = productsById.get(claim.productId);
  if (!product) return 0;
  return calculateUnitPrice(product, campaign);
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

  const getUserCampaignTotal = (campaignId: string, userId: string): number => {
    const campaign = state.campaigns.find((item) => item.id === campaignId);
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

    const nextUser: UserProfile = {
      id: crypto.randomUUID(),
      email,
      password,
      fbNickname,
      roleTier: "LEAK_PICK",
      pickupRate: 100,
      isAdmin: false,
      createdAt: new Date().toISOString(),
    };

    setState((prev) => ({ ...prev, users: [...prev.users, nextUser] }));
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

  const claimProduct = (campaignId: string, productId: string): ActionResult => {
    if (!currentUser) {
      return { ok: false, message: "請先登入。" };
    }

    const campaign = state.campaigns.find((item) => item.id === campaignId);
    if (!campaign || !campaignOpen(campaign)) {
      return { ok: false, message: "此檔期已截止或不存在。" };
    }

    const product = state.products.find((item) => item.id === productId && item.campaignId === campaignId);
    if (!product) {
      return { ok: false, message: "商品不存在。" };
    }

    const exists = state.claims.some(
      (claim) =>
        claim.campaignId === campaignId &&
        claim.productId === productId &&
        claim.userId === currentUser.id &&
        claim.status !== "CANCELLED_BY_ADMIN",
    );

    if (exists) {
      return { ok: false, message: "你已喊過這個商品，前台不可取消。" };
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
  };
}
