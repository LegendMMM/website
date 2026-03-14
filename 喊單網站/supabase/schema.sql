-- Group Order Ledger schema for Supabase
-- Current app model: general products are always open; only blind-box items use character slot ordering.
-- This schema is designed for the current front-end flow, which uses anon access plus app-side business rules.

create extension if not exists "pgcrypto";

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role_tier') THEN
    CREATE TYPE public.role_tier AS ENUM ('FIXED_1', 'FIXED_2', 'FIXED_3', 'LEAK_PICK');
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

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  fb_nickname text not null unique,
  pickup_rate numeric(5,2) not null default 100,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_overrides (
  email text primary key,
  is_admin boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_admin_override(target_email text, target_is_admin boolean, target_note text default null)
returns void
language plpgsql
as $$
begin
  insert into public.admin_overrides(email, is_admin, note, updated_at)
  values (lower(trim(target_email)), target_is_admin, target_note, now())
  on conflict (email)
  do update set
    is_admin = excluded.is_admin,
    note = excluded.note,
    updated_at = now();
end;
$$;

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  deadline_at timestamptz not null,
  status public.campaign_status not null default 'OPEN',
  release_stage text not null default 'ALL_OPEN',
  max_claims_per_user integer,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  sku text not null unique,
  name text not null,
  series text not null default '未分類',
  type public.product_type not null default 'NORMAL',
  character_name text,
  slot_restriction_enabled boolean not null default false,
  slot_restricted_character text,
  image_url text,
  price integer not null default 0 check (price >= 0),
  stock integer check (stock is null or stock >= 0),
  max_per_user integer check (max_per_user is null or max_per_user > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.blind_box_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text not null unique,
  name text not null,
  character_name text not null,
  image_url text,
  price integer check (price is null or price >= 0),
  stock integer check (stock is null or stock >= 0),
  max_per_user integer check (max_per_user is null or max_per_user > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.character_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  character_name text not null,
  tier public.role_tier not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, character_name)
);

create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  blind_box_item_id uuid references public.blind_box_items(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_tier public.role_tier not null default 'LEAK_PICK',
  status public.claim_status not null default 'LOCKED',
  created_at timestamptz not null default now()
);

create index if not exists idx_claims_campaign_product on public.claims(campaign_id, product_id, created_at);
create index if not exists idx_claims_user on public.claims(user_id, created_at);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null check (amount >= 0),
  method public.payment_method not null,
  last_five_code text not null default '-----',
  reconciled boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_amount integer not null check (order_amount >= 0),
  payment_method public.payment_method not null,
  can_use_cod boolean not null default false,
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

create or replace function public.before_insert_payment_guard()
returns trigger
language plpgsql
as $$
declare
  v_pickup_rate numeric(5,2);
begin
  select pickup_rate into v_pickup_rate
  from public.profiles
  where id = new.user_id;

  if new.method = 'CASH_ON_DELIVERY' and (coalesce(v_pickup_rate, 0) < 90 or new.amount > 300) then
    raise exception 'COD is blocked by pickup rate or amount threshold';
  end if;

  if new.method in ('BANK_TRANSFER', 'CARDLESS_DEPOSIT') and new.last_five_code !~ '^\\d{5}$' then
    raise exception 'Last five digits are required for transfer/deposit';
  end if;

  return new;
end;
$$;

drop trigger if exists tr_payment_guard on public.payments;
create trigger tr_payment_guard
before insert on public.payments
for each row execute procedure public.before_insert_payment_guard();

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

alter table public.profiles disable row level security;
alter table public.admin_overrides disable row level security;
alter table public.campaigns disable row level security;
alter table public.products disable row level security;
alter table public.blind_box_items disable row level security;
alter table public.character_slots disable row level security;
alter table public.claims disable row level security;
alter table public.payments disable row level security;
alter table public.shipments disable row level security;
alter table public.cart_items disable row level security;
alter table public.orders disable row level security;
alter table public.order_items disable row level security;
