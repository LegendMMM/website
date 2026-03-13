-- Legacy migration kept for compatibility with older databases only.
-- Fresh installs should use supabase/schema.sql instead of replaying this file.

create type public.product_type as enum ('NORMAL', 'BLIND_BOX');
create type public.product_required_tier as enum ('FIXED_1', 'FIXED_2', 'FIXED_3', 'LEAK_PICK');
create type public.product_series as enum ('Q版系列', 'HOBBY系列', '徽章系列', '其他系列');

alter table public.products
  add column if not exists series public.product_series not null default '其他系列',
  add column if not exists type public.product_type not null default 'NORMAL',
  add column if not exists required_tier public.product_required_tier not null default 'FIXED_1',
  add column if not exists max_per_user integer,
  add column if not exists image_url text,
  add column if not exists slot_restriction_enabled boolean not null default true,
  add column if not exists slot_restricted_character text;

-- keep compatibility with old schema where character_name exists
alter table public.products
  add column if not exists character_name text;

create table if not exists public.blind_box_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text not null,
  name text not null,
  character_name text not null,
  image_url text,
  stock integer not null check (stock >= 0),
  max_per_user integer,
  created_at timestamptz not null default now()
);

create table if not exists public.character_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  character_name text not null,
  tier public.product_required_tier not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, character_name)
);

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  blind_box_item_id uuid references public.blind_box_items(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  qty integer not null check (qty > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'PLACED',
  total_amount integer not null check (total_amount >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  blind_box_item_id uuid references public.blind_box_items(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  unit_price integer not null check (unit_price >= 0),
  qty integer not null check (qty > 0),
  created_at timestamptz not null default now()
);
