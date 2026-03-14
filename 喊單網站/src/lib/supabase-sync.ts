import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BlindBoxItem,
  Campaign,
  CharacterSlot,
  Claim,
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
