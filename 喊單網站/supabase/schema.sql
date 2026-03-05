-- Group Order Ledger schema for Supabase
-- Execute in Supabase SQL Editor.

create extension if not exists "pgcrypto";

create type public.role_tier as enum ('FIXED_1', 'FIXED_2', 'FIXED_3', 'LEAK_PICK');
create type public.pricing_mode as enum ('DYNAMIC', 'AVERAGE_WITH_BINDING');
create type public.campaign_status as enum ('OPEN', 'CLOSED');
create type public.claim_status as enum ('LOCKED', 'CANCELLED_BY_ADMIN', 'CONFIRMED');
create type public.payment_method as enum ('BANK_TRANSFER', 'CARDLESS_DEPOSIT', 'EMPTY_PACKAGE', 'CASH_ON_DELIVERY');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  fb_nickname text not null,
  role_tier public.role_tier not null default 'LEAK_PICK',
  pickup_rate numeric(5,2) not null default 100,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  deadline_at timestamptz not null,
  status public.campaign_status not null default 'OPEN',
  pricing_mode public.pricing_mode not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  sku text not null,
  name text not null,
  character_name text not null,
  is_popular boolean not null default false,
  hot_price integer not null check (hot_price >= 0),
  cold_price integer not null check (cold_price >= 0),
  average_price integer not null check (average_price >= 0),
  stock integer not null check (stock >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  role_tier public.role_tier not null,
  status public.claim_status not null default 'LOCKED',
  created_at timestamptz not null default now()
);

create unique index if not exists uq_claim_once
on public.claims(campaign_id, product_id, user_id)
where status <> 'CANCELLED_BY_ADMIN';

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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, email, fb_nickname)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'fb_nickname', '未填寫')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

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

create or replace function public.claim_priority_value(input public.role_tier)
returns integer
language sql
immutable
as $$
  select case input
    when 'FIXED_1' then 1
    when 'FIXED_2' then 2
    when 'FIXED_3' then 3
    else 4
  end;
$$;

create or replace function public.before_insert_claim_fill_role()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is distinct from new.user_id then
    raise exception 'Cannot create claim for another user';
  end if;

  select role_tier into new.role_tier
  from public.profiles
  where id = new.user_id;

  if new.role_tier is null then
    raise exception 'Profile role tier not found';
  end if;

  return new;
end;
$$;

drop trigger if exists tr_claim_fill_role on public.claims;
create trigger tr_claim_fill_role
before insert on public.claims
for each row execute procedure public.before_insert_claim_fill_role();

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

create or replace function public.confirm_claim(p_claim_id uuid)
returns public.claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.claims;
  v_stock integer;
  v_rank integer;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admin can confirm claims';
  end if;

  select * into v_claim
  from public.claims
  where id = p_claim_id
  for update;

  if not found then
    raise exception 'Claim not found';
  end if;

  if v_claim.status = 'CANCELLED_BY_ADMIN' then
    raise exception 'Claim is canceled';
  end if;

  select stock into v_stock
  from public.products
  where id = v_claim.product_id;

  with ranked as (
    select c.id,
           row_number() over (
             order by public.claim_priority_value(c.role_tier), c.created_at
           ) as rn
    from public.claims c
    where c.product_id = v_claim.product_id
      and c.campaign_id = v_claim.campaign_id
      and c.status <> 'CANCELLED_BY_ADMIN'
  )
  select rn into v_rank from ranked where id = p_claim_id;

  if v_rank is null or v_rank > v_stock then
    raise exception 'Claim is waitlist now and cannot be confirmed';
  end if;

  update public.claims
  set status = 'CONFIRMED'
  where id = p_claim_id
  returning * into v_claim;

  return v_claim;
end;
$$;

alter table public.profiles enable row level security;
alter table public.campaigns enable row level security;
alter table public.products enable row level security;
alter table public.claims enable row level security;
alter table public.bindings enable row level security;
alter table public.payments enable row level security;
alter table public.shipments enable row level security;

-- profiles
create policy "profiles_select_self_or_admin"
on public.profiles
for select
using (id = auth.uid() or public.is_admin(auth.uid()));

create policy "profiles_update_self"
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

-- campaigns/products are readable by authenticated members, mutable by admin
create policy "campaigns_read_all"
on public.campaigns
for select
using (auth.uid() is not null);

create policy "campaigns_admin_write"
on public.campaigns
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "products_read_all"
on public.products
for select
using (auth.uid() is not null);

create policy "products_admin_write"
on public.products
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- claims: users can insert/select own claim, only admin can update status
create policy "claims_insert_self"
on public.claims
for insert
with check (auth.uid() = user_id);

create policy "claims_select_self_or_admin"
on public.claims
for select
using (auth.uid() = user_id or public.is_admin(auth.uid()));

create policy "claims_admin_update"
on public.claims
for update
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- payments
create policy "payments_insert_self"
on public.payments
for insert
with check (auth.uid() = user_id);

create policy "payments_select_self_or_admin"
on public.payments
for select
using (auth.uid() = user_id or public.is_admin(auth.uid()));

create policy "payments_admin_update"
on public.payments
for update
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- bindings / shipments
create policy "bindings_read_self_or_admin"
on public.bindings
for select
using (auth.uid() = buyer_user_id or public.is_admin(auth.uid()));

create policy "bindings_admin_write"
on public.bindings
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "shipments_insert_self"
on public.shipments
for insert
with check (auth.uid() = user_id);

create policy "shipments_select_self_or_admin"
on public.shipments
for select
using (auth.uid() = user_id or public.is_admin(auth.uid()));

create policy "shipments_admin_update"
on public.shipments
for update
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));
