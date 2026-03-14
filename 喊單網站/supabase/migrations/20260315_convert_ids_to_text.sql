-- Convert app-owned IDs from uuid to text.
-- Required because the front-end uses stable string IDs such as:
-- u-admin-001 / c-2026-summer / p-summer-01
-- Run once on existing projects that were bootstrapped with uuid-based IDs.

alter table if exists public.order_items drop constraint if exists order_items_order_id_fkey;
alter table if exists public.order_items drop constraint if exists order_items_campaign_id_fkey;
alter table if exists public.order_items drop constraint if exists order_items_product_id_fkey;
alter table if exists public.order_items drop constraint if exists order_items_blind_box_item_id_fkey;
alter table if exists public.order_items drop constraint if exists order_items_user_id_fkey;

alter table if exists public.orders drop constraint if exists orders_campaign_id_fkey;
alter table if exists public.orders drop constraint if exists orders_user_id_fkey;

alter table if exists public.cart_items drop constraint if exists cart_items_campaign_id_fkey;
alter table if exists public.cart_items drop constraint if exists cart_items_product_id_fkey;
alter table if exists public.cart_items drop constraint if exists cart_items_blind_box_item_id_fkey;
alter table if exists public.cart_items drop constraint if exists cart_items_user_id_fkey;

alter table if exists public.shipments drop constraint if exists shipments_campaign_id_fkey;
alter table if exists public.shipments drop constraint if exists shipments_user_id_fkey;

alter table if exists public.payments drop constraint if exists payments_campaign_id_fkey;
alter table if exists public.payments drop constraint if exists payments_user_id_fkey;

alter table if exists public.claims drop constraint if exists claims_campaign_id_fkey;
alter table if exists public.claims drop constraint if exists claims_product_id_fkey;
alter table if exists public.claims drop constraint if exists claims_blind_box_item_id_fkey;
alter table if exists public.claims drop constraint if exists claims_user_id_fkey;

alter table if exists public.character_slots drop constraint if exists character_slots_user_id_fkey;
alter table if exists public.blind_box_items drop constraint if exists blind_box_items_product_id_fkey;
alter table if exists public.products drop constraint if exists products_campaign_id_fkey;
alter table if exists public.campaigns drop constraint if exists campaigns_created_by_fkey;

alter table if exists public.profiles alter column id drop default;
alter table if exists public.campaigns alter column id drop default;
alter table if exists public.products alter column id drop default;
alter table if exists public.blind_box_items alter column id drop default;
alter table if exists public.character_slots alter column id drop default;
alter table if exists public.claims alter column id drop default;
alter table if exists public.payments alter column id drop default;
alter table if exists public.shipments alter column id drop default;
alter table if exists public.cart_items alter column id drop default;
alter table if exists public.orders alter column id drop default;
alter table if exists public.order_items alter column id drop default;

alter table if exists public.profiles alter column id type text using id::text;

alter table if exists public.campaigns
  alter column id type text using id::text,
  alter column created_by type text using created_by::text;

alter table if exists public.products
  alter column id type text using id::text,
  alter column campaign_id type text using campaign_id::text;

alter table if exists public.blind_box_items
  alter column id type text using id::text,
  alter column product_id type text using product_id::text;

alter table if exists public.character_slots
  alter column id type text using id::text,
  alter column user_id type text using user_id::text;

alter table if exists public.claims
  alter column id type text using id::text,
  alter column campaign_id type text using campaign_id::text,
  alter column product_id type text using product_id::text,
  alter column blind_box_item_id type text using blind_box_item_id::text,
  alter column user_id type text using user_id::text;

alter table if exists public.payments
  alter column id type text using id::text,
  alter column campaign_id type text using campaign_id::text,
  alter column user_id type text using user_id::text;

alter table if exists public.shipments
  alter column id type text using id::text,
  alter column campaign_id type text using campaign_id::text,
  alter column user_id type text using user_id::text;

alter table if exists public.cart_items
  alter column id type text using id::text,
  alter column campaign_id type text using campaign_id::text,
  alter column product_id type text using product_id::text,
  alter column blind_box_item_id type text using blind_box_item_id::text,
  alter column user_id type text using user_id::text;

alter table if exists public.orders
  alter column id type text using id::text,
  alter column campaign_id type text using campaign_id::text,
  alter column user_id type text using user_id::text;

alter table if exists public.order_items
  alter column id type text using id::text,
  alter column order_id type text using order_id::text,
  alter column campaign_id type text using campaign_id::text,
  alter column product_id type text using product_id::text,
  alter column blind_box_item_id type text using blind_box_item_id::text,
  alter column user_id type text using user_id::text;

alter table if exists public.campaigns
  add constraint campaigns_created_by_fkey
  foreign key (created_by) references public.profiles(id);

alter table if exists public.products
  add constraint products_campaign_id_fkey
  foreign key (campaign_id) references public.campaigns(id) on delete cascade;

alter table if exists public.blind_box_items
  add constraint blind_box_items_product_id_fkey
  foreign key (product_id) references public.products(id) on delete cascade;

alter table if exists public.character_slots
  add constraint character_slots_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

alter table if exists public.claims
  add constraint claims_campaign_id_fkey
  foreign key (campaign_id) references public.campaigns(id) on delete cascade,
  add constraint claims_product_id_fkey
  foreign key (product_id) references public.products(id) on delete cascade,
  add constraint claims_blind_box_item_id_fkey
  foreign key (blind_box_item_id) references public.blind_box_items(id) on delete cascade,
  add constraint claims_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

alter table if exists public.payments
  add constraint payments_campaign_id_fkey
  foreign key (campaign_id) references public.campaigns(id) on delete cascade,
  add constraint payments_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

alter table if exists public.shipments
  add constraint shipments_campaign_id_fkey
  foreign key (campaign_id) references public.campaigns(id) on delete cascade,
  add constraint shipments_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

alter table if exists public.cart_items
  add constraint cart_items_campaign_id_fkey
  foreign key (campaign_id) references public.campaigns(id) on delete cascade,
  add constraint cart_items_product_id_fkey
  foreign key (product_id) references public.products(id) on delete cascade,
  add constraint cart_items_blind_box_item_id_fkey
  foreign key (blind_box_item_id) references public.blind_box_items(id) on delete cascade,
  add constraint cart_items_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

alter table if exists public.orders
  add constraint orders_campaign_id_fkey
  foreign key (campaign_id) references public.campaigns(id) on delete cascade,
  add constraint orders_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

alter table if exists public.order_items
  add constraint order_items_order_id_fkey
  foreign key (order_id) references public.orders(id) on delete cascade,
  add constraint order_items_campaign_id_fkey
  foreign key (campaign_id) references public.campaigns(id) on delete cascade,
  add constraint order_items_product_id_fkey
  foreign key (product_id) references public.products(id) on delete cascade,
  add constraint order_items_blind_box_item_id_fkey
  foreign key (blind_box_item_id) references public.blind_box_items(id) on delete cascade,
  add constraint order_items_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

create or replace function public.is_admin(uid text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = uid
      and is_admin = true
  );
$$;
