import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PRODUCT_CATEGORIES } from "./constants";
import type {
  BlindBoxItem,
  Campaign,
  CharacterSlot,
  Claim,
  OrderSystemState,
  Order,
  OrderItem,
  Product,
  UserProfile,
} from "../types/domain";

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

export async function upsertProfiles(client: SupabaseClient, users: UserProfile[]): Promise<void> {
  if (users.length === 0) return;

  const payload = uniqueById(users).map((user) => ({
    id: user.id,
    email: user.email,
    fb_nickname: user.fbNickname,
    pickup_rate: user.pickupRate,
    is_admin: user.isAdmin,
    created_at: user.createdAt,
  }));

  const { error } = await client.from("profiles").upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

export async function upsertCampaigns(client: SupabaseClient, campaigns: Campaign[]): Promise<void> {
  if (campaigns.length === 0) return;

  const payload = uniqueById(campaigns).map((campaign) => ({
    id: campaign.id,
    title: campaign.title,
    description: campaign.description,
    deadline_at: campaign.deadlineAt,
    status: campaign.status,
    release_stage: campaign.releaseStage,
    max_claims_per_user: campaign.maxClaimsPerUser,
    created_by: campaign.createdBy,
  }));

  const { error } = await client.from("campaigns").upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

export async function upsertProducts(client: SupabaseClient, products: Product[]): Promise<void> {
  if (products.length === 0) return;

  const payload = uniqueById(products).map((product) => ({
    id: product.id,
    campaign_id: product.campaignId,
    sku: product.sku,
    name: product.name,
    series: product.series,
    type: product.type,
    character_name: product.character,
    slot_restriction_enabled: product.slotRestrictionEnabled,
    slot_restricted_character: product.slotRestrictedCharacter,
    image_url: product.imageUrl,
    price: product.price,
    stock: product.stock,
    max_per_user: product.maxPerUser,
  }));

  const { error } = await client.from("products").upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

export async function upsertBlindBoxItems(client: SupabaseClient, items: BlindBoxItem[]): Promise<void> {
  if (items.length === 0) return;

  const payload = uniqueById(items).map((item) => ({
    id: item.id,
    product_id: item.productId,
    sku: item.sku,
    name: item.name,
    character_name: item.character,
    image_url: item.imageUrl,
    price: item.price,
    stock: item.stock,
    max_per_user: item.maxPerUser,
  }));

  const { error } = await client.from("blind_box_items").upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

export async function upsertCharacterSlots(client: SupabaseClient, slots: CharacterSlot[]): Promise<void> {
  if (slots.length === 0) return;

  const payload = uniqueById(slots).map((slot) => ({
    id: slot.id,
    user_id: slot.userId,
    character_name: slot.character,
    tier: slot.tier,
    created_at: slot.createdAt,
    updated_at: slot.updatedAt,
  }));

  const { error } = await client.from("character_slots").upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

export async function deleteCharacterSlots(client: SupabaseClient, slotIds: string[]): Promise<void> {
  if (slotIds.length === 0) return;
  const { error } = await client.from("character_slots").delete().in("id", slotIds);
  if (error) throw error;
}

export async function upsertClaims(client: SupabaseClient, claims: Claim[]): Promise<void> {
  if (claims.length === 0) return;

  const payload = uniqueById(claims).map((claim) => ({
    id: claim.id,
    campaign_id: claim.campaignId,
    product_id: claim.productId,
    blind_box_item_id: claim.blindBoxItemId,
    user_id: claim.userId,
    role_tier: claim.roleTier,
    status: claim.status,
    created_at: claim.createdAt,
  }));

  const { error } = await client.from("claims").upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

export async function upsertOrders(client: SupabaseClient, orders: Order[]): Promise<void> {
  if (orders.length === 0) return;

  const payload = uniqueById(orders).map((order) => ({
    id: order.id,
    campaign_id: order.campaignId,
    user_id: order.userId,
    status: order.status,
    total_amount: order.totalAmount,
    created_at: order.createdAt,
  }));

  const { error } = await client.from("orders").upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

export async function upsertOrderItems(client: SupabaseClient, orderItems: OrderItem[]): Promise<void> {
  if (orderItems.length === 0) return;

  const payload = uniqueById(orderItems).map((item) => ({
    id: item.id,
    order_id: item.orderId,
    campaign_id: item.campaignId,
    product_id: item.productId,
    blind_box_item_id: item.blindBoxItemId,
    user_id: item.userId,
    unit_price: item.unitPrice,
    qty: item.qty,
    created_at: item.createdAt,
  }));

  const { error } = await client.from("order_items").upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

export async function loadOrderSystemStateFromSupabase(client: SupabaseClient): Promise<OrderSystemState> {
  const [
    profilesResult,
    campaignsResult,
    productsResult,
    blindBoxItemsResult,
    characterSlotsResult,
    claimsResult,
    paymentsResult,
    shipmentsResult,
    cartItemsResult,
    ordersResult,
    orderItemsResult,
  ] = await Promise.all([
    client.from("profiles").select("*"),
    client.from("campaigns").select("*"),
    client.from("products").select("*"),
    client.from("blind_box_items").select("*"),
    client.from("character_slots").select("*"),
    client.from("claims").select("*"),
    client.from("payments").select("*"),
    client.from("shipments").select("*"),
    client.from("cart_items").select("*"),
    client.from("orders").select("*"),
    client.from("order_items").select("*"),
  ]);

  const firstError = [
    profilesResult.error,
    campaignsResult.error,
    productsResult.error,
    blindBoxItemsResult.error,
    characterSlotsResult.error,
    claimsResult.error,
    paymentsResult.error,
    shipmentsResult.error,
    cartItemsResult.error,
    ordersResult.error,
    orderItemsResult.error,
  ].find(Boolean);

  if (firstError) {
    throw firstError;
  }

  const users: UserProfile[] = (profilesResult.data ?? []).map((row) => ({
    id: String(row.id),
    email: String(row.email ?? ""),
    fbNickname: String(row.fb_nickname ?? ""),
    pickupRate: Number(row.pickup_rate ?? 100),
    isAdmin: Boolean(row.is_admin),
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  }));

  const campaigns: Campaign[] = (campaignsResult.data ?? []).map((row) => ({
    id: String(row.id),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    deadlineAt: typeof row.deadline_at === "string" ? row.deadline_at : new Date().toISOString(),
    status: row.status === "CLOSED" ? "CLOSED" : "OPEN",
    releaseStage:
      row.release_stage === "FIXED_1_ONLY" ||
      row.release_stage === "FIXED_1_2" ||
      row.release_stage === "FIXED_1_2_3" ||
      row.release_stage === "ALL_OPEN"
        ? row.release_stage
        : "ALL_OPEN",
    maxClaimsPerUser: typeof row.max_claims_per_user === "number" ? row.max_claims_per_user : null,
    createdBy: String(row.created_by ?? ""),
  }));

  const products: Product[] = (productsResult.data ?? []).map((row) => ({
    id: String(row.id),
    campaignId: String(row.campaign_id),
    sku: String(row.sku ?? ""),
    name: String(row.name ?? ""),
    series: String(row.series ?? "未分類"),
    type: row.type === "BLIND_BOX" ? "BLIND_BOX" : "NORMAL",
    character: typeof row.character_name === "string" && row.character_name ? row.character_name as Product["character"] : null,
    slotRestrictionEnabled: Boolean(row.slot_restriction_enabled),
    slotRestrictedCharacter:
      typeof row.slot_restricted_character === "string" && row.slot_restricted_character
        ? row.slot_restricted_character as Product["slotRestrictedCharacter"]
        : null,
    imageUrl: typeof row.image_url === "string" && row.image_url ? row.image_url : null,
    price: Number(row.price ?? 0),
    stock: typeof row.stock === "number" ? row.stock : null,
    maxPerUser: typeof row.max_per_user === "number" ? row.max_per_user : null,
  }));

  const blindBoxItems: BlindBoxItem[] = (blindBoxItemsResult.data ?? []).map((row) => ({
    id: String(row.id),
    productId: String(row.product_id),
    sku: String(row.sku ?? ""),
    name: String(row.name ?? ""),
    character: String(row.character_name) as BlindBoxItem["character"],
    imageUrl: typeof row.image_url === "string" && row.image_url ? row.image_url : null,
    price: typeof row.price === "number" ? row.price : null,
    stock: typeof row.stock === "number" ? row.stock : null,
    maxPerUser: typeof row.max_per_user === "number" ? row.max_per_user : null,
  }));

  const productCategories = Array.from(new Set([
    ...DEFAULT_PRODUCT_CATEGORIES,
    ...products.map((product) => product.series || "未分類"),
  ]));

  const characterSlots: CharacterSlot[] = (characterSlotsResult.data ?? []).map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    character: String(row.character_name) as CharacterSlot["character"],
    tier: String(row.tier) as CharacterSlot["tier"],
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
  }));

  const claims: Claim[] = (claimsResult.data ?? []).map((row) => ({
    id: String(row.id),
    campaignId: String(row.campaign_id),
    productId: String(row.product_id),
    blindBoxItemId: typeof row.blind_box_item_id === "string" ? row.blind_box_item_id : null,
    userId: String(row.user_id),
    roleTier: String(row.role_tier) as Claim["roleTier"],
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    status: String(row.status) as Claim["status"],
  }));

  const payments = (paymentsResult.data ?? []).map((row) => ({
    id: String(row.id),
    campaignId: String(row.campaign_id),
    userId: String(row.user_id),
    amount: Number(row.amount ?? 0),
    method: String(row.method) as OrderSystemState["payments"][number]["method"],
    lastFiveCode: String(row.last_five_code ?? "-----"),
    reconciled: Boolean(row.reconciled),
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  }));

  const shipments = (shipmentsResult.data ?? []).map((row) => ({
    id: String(row.id),
    campaignId: String(row.campaign_id),
    userId: String(row.user_id),
    orderAmount: Number(row.order_amount ?? 0),
    paymentMethod: String(row.payment_method) as OrderSystemState["shipments"][number]["paymentMethod"],
    canUseCod: Boolean(row.can_use_cod),
    receiverName: String(row.receiver_name ?? ""),
    receiverPhone: String(row.receiver_phone ?? ""),
    receiverStoreCode: String(row.receiver_store_code ?? ""),
  }));

  const cartItems = (cartItemsResult.data ?? []).map((row) => ({
    id: String(row.id),
    campaignId: String(row.campaign_id),
    productId: String(row.product_id),
    blindBoxItemId: typeof row.blind_box_item_id === "string" ? row.blind_box_item_id : null,
    userId: String(row.user_id),
    qty: Number(row.qty ?? 1),
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  }));

  const orders: Order[] = (ordersResult.data ?? []).map((row) => ({
    id: String(row.id),
    campaignId: String(row.campaign_id),
    userId: String(row.user_id),
    status: String(row.status) as Order["status"],
    totalAmount: Number(row.total_amount ?? 0),
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  }));

  const orderItems: OrderItem[] = (orderItemsResult.data ?? []).map((row) => ({
    id: String(row.id),
    orderId: String(row.order_id),
    campaignId: String(row.campaign_id),
    productId: String(row.product_id),
    blindBoxItemId: typeof row.blind_box_item_id === "string" ? row.blind_box_item_id : null,
    userId: String(row.user_id),
    unitPrice: Number(row.unit_price ?? 0),
    qty: Number(row.qty ?? 1),
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  }));

  return {
    users,
    campaigns,
    productCategories,
    products,
    blindBoxItems,
    characterSlots,
    claims,
    payments,
    shipments,
    cartItems,
    orders,
    orderItems,
  };
}
