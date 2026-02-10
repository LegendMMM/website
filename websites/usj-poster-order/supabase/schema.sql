-- Run this file in Supabase SQL Editor.
-- It creates tables, policies, triggers, and query function used by this website.

create extension if not exists pgcrypto;

create table if not exists public.admins (
  email text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null,
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  customer_name text not null,
  phone text not null,
  phone_last3 char(3) not null,
  email text not null,
  quantity integer not null check (quantity > 0),
  transfer_account text not null,
  transfer_time timestamptz not null,
  note text not null default '',
  status text not null default '已匯款' check (status in ('已匯款', '已採購', '已到貨', '已完成')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orders_campaign_created_at on public.orders(campaign_id, created_at desc);
create index if not exists idx_orders_customer_lookup on public.orders(lower(customer_name), phone_last3);

create or replace function public.set_orders_derived_fields()
returns trigger
language plpgsql
as $$
declare
  digits text;
begin
  digits := regexp_replace(coalesce(new.phone, ''), '\\D', '', 'g');
  if length(digits) < 3 then
    raise exception 'phone must have at least 3 digits';
  end if;

  new.phone_last3 := right(digits, 3);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_orders_derived_fields on public.orders;
create trigger trg_orders_derived_fields
before insert or update on public.orders
for each row
execute function public.set_orders_derived_fields();

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.admins a
    where a.email = auth.email()
  );
$$;

alter table public.admins enable row level security;
alter table public.campaigns enable row level security;
alter table public.orders enable row level security;

-- admins table policies

drop policy if exists admins_select_self on public.admins;
create policy admins_select_self
on public.admins
for select
to authenticated
using (email = auth.email());

-- campaigns policies

drop policy if exists campaigns_read_active_for_all on public.campaigns;
create policy campaigns_read_active_for_all
on public.campaigns
for select
to anon, authenticated
using (is_active = true or public.is_admin());

drop policy if exists campaigns_admin_insert on public.campaigns;
create policy campaigns_admin_insert
on public.campaigns
for insert
to authenticated
with check (public.is_admin());

drop policy if exists campaigns_admin_update on public.campaigns;
create policy campaigns_admin_update
on public.campaigns
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists campaigns_admin_delete on public.campaigns;
create policy campaigns_admin_delete
on public.campaigns
for delete
to authenticated
using (public.is_admin());

-- orders policies

drop policy if exists orders_public_insert on public.orders;
create policy orders_public_insert
on public.orders
for insert
to anon, authenticated
with check (true);

drop policy if exists orders_admin_select on public.orders;
create policy orders_admin_select
on public.orders
for select
to authenticated
using (public.is_admin());

drop policy if exists orders_admin_update on public.orders;
create policy orders_admin_update
on public.orders
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists orders_admin_delete on public.orders;
create policy orders_admin_delete
on public.orders
for delete
to authenticated
using (public.is_admin());

create or replace function public.search_order_status(
  p_campaign_slug text,
  p_customer_name text,
  p_phone_last3 text
)
returns table (
  campaign_title text,
  customer_name text,
  quantity integer,
  status text,
  submitted_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    c.title as campaign_title,
    o.customer_name,
    o.quantity,
    o.status,
    o.created_at as submitted_at
  from public.orders o
  join public.campaigns c on c.id = o.campaign_id
  where c.slug = p_campaign_slug
    and lower(trim(o.customer_name)) = lower(trim(p_customer_name))
    and o.phone_last3 = p_phone_last3
  order by o.created_at desc
  limit 50;
$$;

grant execute on function public.search_order_status(text, text, text) to anon, authenticated;

-- Create your first admin account email manually.
-- Replace with your own email.
insert into public.admins(email)
values ('49125466easongo@gmail.com')
on conflict (email) do nothing;

-- Create a first campaign sample.
insert into public.campaigns(slug, title, description, is_active)
values ('usj-poster-initial', '環球影城海報冊代購（第一梯）', '請填寫訂購資訊。', true)
on conflict (slug) do nothing;
