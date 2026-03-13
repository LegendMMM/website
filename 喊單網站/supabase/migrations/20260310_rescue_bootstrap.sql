-- Rescue bootstrap for partially-applied schema
-- Safe to run multiple times (idempotent-ish)

create extension if not exists "pgcrypto";

-- 1) enums
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role_tier') THEN
    CREATE TYPE public.role_tier AS ENUM ('FIXED_1', 'FIXED_2', 'FIXED_3', 'LEAK_PICK');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pricing_mode') THEN
    CREATE TYPE public.pricing_mode AS ENUM ('DYNAMIC', 'AVERAGE_WITH_BINDING');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'campaign_status') THEN
    CREATE TYPE public.campaign_status AS ENUM ('OPEN', 'CLOSED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'claim_status') THEN
    CREATE TYPE public.claim_status AS ENUM ('LOCKED', 'CANCELLED_BY_ADMIN', 'CONFIRMED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
    CREATE TYPE public.payment_method AS ENUM ('BANK_TRANSFER', 'CARDLESS_DEPOSIT', 'EMPTY_PACKAGE', 'CASH_ON_DELIVERY');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_type') THEN
    CREATE TYPE public.product_type AS ENUM ('NORMAL', 'BLIND_BOX');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_required_tier') THEN
    CREATE TYPE public.product_required_tier AS ENUM ('FIXED_1', 'FIXED_2', 'FIXED_3', 'LEAK_PICK');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_series') THEN
    CREATE TYPE public.product_series AS ENUM ('Q版系列', 'HOBBY系列', '徽章系列', '其他系列');
  END IF;
END $$;

-- 2) tables
create table if not exists public.profiles (
  id uuid primary key,
  email text not null default '' unique,
  fb_nickname text not null default '未填寫',
  role_tier public.role_tier not null default 'LEAK_PICK',
  pickup_rate numeric(5,2) not null default 100,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists email text not null default '',
  add column if not exists fb_nickname text not null default '未填寫',
  add column if not exists role_tier public.role_tier not null default 'LEAK_PICK',
  add column if not exists pickup_rate numeric(5,2) not null default 100,
  add column if not exists is_admin boolean not null default false,
  add column if not exists created_at timestamptz not null default now();

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  deadline_at timestamptz not null,
  status public.campaign_status not null default 'OPEN',
  pricing_mode public.pricing_mode not null default 'DYNAMIC',
  release_stage text not null default 'ALL_OPEN',
  max_claims_per_user integer,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.campaigns
  add column if not exists description text not null default '',
  add column if not exists deadline_at timestamptz,
  add column if not exists status public.campaign_status not null default 'OPEN',
  add column if not exists pricing_mode public.pricing_mode not null default 'DYNAMIC',
  add column if not exists release_stage text not null default 'ALL_OPEN',
  add column if not exists max_claims_per_user integer,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now();

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  sku text not null,
  name text not null,
  series public.product_series not null default '其他系列',
  type public.product_type not null default 'NORMAL',
  character_name text,
  slot_restriction_enabled boolean not null default true,
  slot_restricted_character text,
  required_tier public.product_required_tier not null default 'FIXED_1',
  image_url text,
  price integer not null default 0,
  is_popular boolean not null default false,
  hot_price integer not null default 0,
  cold_price integer not null default 0,
  average_price integer not null default 0,
  stock integer,
  max_per_user integer,
  created_at timestamptz not null default now()
);

alter table public.products
  add column if not exists series public.product_series not null default '其他系列',
  add column if not exists type public.product_type not null default 'NORMAL',
  add column if not exists character_name text,
  add column if not exists slot_restriction_enabled boolean not null default true,
  add column if not exists slot_restricted_character text,
  add column if not exists required_tier public.product_required_tier not null default 'FIXED_1',
  add column if not exists image_url text,
  add column if not exists price integer not null default 0,
  add column if not exists is_popular boolean not null default false,
  add column if not exists hot_price integer not null default 0,
  add column if not exists cold_price integer not null default 0,
  add column if not exists average_price integer not null default 0,
  add column if not exists stock integer,
  add column if not exists max_per_user integer,
  add column if not exists created_at timestamptz not null default now();

create table if not exists public.blind_box_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text not null,
  name text not null,
  character_name text not null,
  image_url text,
  price integer,
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

create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  blind_box_item_id uuid references public.blind_box_items(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  role_tier public.role_tier not null default 'LEAK_PICK',
  status public.claim_status not null default 'LOCKED',
  created_at timestamptz not null default now()
);

alter table public.claims
  add column if not exists blind_box_item_id uuid references public.blind_box_items(id) on delete cascade,
  add column if not exists role_tier public.role_tier not null default 'LEAK_PICK',
  add column if not exists status public.claim_status not null default 'LOCKED',
  add column if not exists created_at timestamptz not null default now();

create table if not exists public.bindings (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  buyer_user_id uuid not null references public.profiles(id),
  bind_product_id uuid not null references public.products(id),
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  amount integer not null check (amount >= 0),
  method public.payment_method not null,
  last_five_code text not null default '-----',
  reconciled boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  order_amount integer not null,
  payment_method public.payment_method not null,
  receiver_name text not null,
  receiver_phone text not null,
  receiver_store_code text not null,
  created_at timestamptz not null default now()
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

-- 3) helper function
create or replace function public.is_admin(uid uuid)
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

-- 4) dev permissions for quick bring-up
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

alter table public.profiles disable row level security;
alter table public.campaigns disable row level security;
alter table public.products disable row level security;
alter table public.blind_box_items disable row level security;
alter table public.character_slots disable row level security;
alter table public.claims disable row level security;
alter table public.bindings disable row level security;
alter table public.payments disable row level security;
alter table public.shipments disable row level security;
alter table public.cart_items disable row level security;
alter table public.orders disable row level security;
alter table public.order_items disable row level security;
