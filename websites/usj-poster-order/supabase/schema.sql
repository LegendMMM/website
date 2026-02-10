-- Run this file in Supabase SQL Editor.
-- It creates tables, policies, triggers, and query function used by this website.
-- Safe to rerun for upgrades.

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
  notice text not null default '',
  custom_fields jsonb not null default '[]'::jsonb,
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
  transaction_method text not null default '面交',
  note text not null default '',
  extra_data jsonb not null default '{}'::jsonb,
  status text not null default '已匯款' check (status in ('已匯款', '已採購', '已到貨', '已完成')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upgrade existing databases safely.
alter table public.campaigns
  add column if not exists custom_fields jsonb not null default '[]'::jsonb;
alter table public.campaigns
  add column if not exists notice text not null default '';

alter table public.orders
  add column if not exists transaction_method text not null default '面交';

alter table public.orders
  add column if not exists extra_data jsonb not null default '{}'::jsonb;

-- Ensure columns have expected defaults and not-null.
alter table public.campaigns
  alter column notice set default '',
  alter column notice set not null,
  alter column custom_fields set default '[]'::jsonb,
  alter column custom_fields set not null;

alter table public.orders
  alter column transaction_method set default '面交',
  alter column transaction_method set not null,
  alter column extra_data set default '{}'::jsonb,
  alter column extra_data set not null;

-- Ensure check constraints exist.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'campaigns_custom_fields_array_check'
  ) then
    alter table public.campaigns
      add constraint campaigns_custom_fields_array_check
      check (jsonb_typeof(custom_fields) = 'array');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_transaction_method_check'
  ) then
    alter table public.orders
      add constraint orders_transaction_method_check
      check (transaction_method in ('面交', '賣貨便'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_extra_data_object_check'
  ) then
    alter table public.orders
      add constraint orders_extra_data_object_check
      check (jsonb_typeof(extra_data) = 'object');
  end if;
end;
$$;

create index if not exists idx_orders_campaign_created_at on public.orders(campaign_id, created_at desc);
create index if not exists idx_orders_customer_lookup on public.orders(lower(customer_name), phone_last3);
create index if not exists idx_orders_phone_digits on public.orders((regexp_replace(phone, '\D', '', 'g')));

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

drop function if exists public.search_order_status(text, text, text);

create or replace function public.search_order_status(
  p_campaign_slug text,
  p_query_name text,
  p_query_phone text
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
  with q as (
    select
      nullif(lower(trim(coalesce(p_query_name, ''))), '') as query_name,
      regexp_replace(coalesce(p_query_phone, ''), '\D', '', 'g') as query_phone_digits
  )
  select
    c.title as campaign_title,
    o.customer_name,
    o.quantity,
    o.status,
    o.created_at as submitted_at
  from public.orders o
  join public.campaigns c on c.id = o.campaign_id
  cross join q
  where c.slug = p_campaign_slug
    and (
      (q.query_name is not null and lower(trim(o.customer_name)) = q.query_name)
      or (
        q.query_phone_digits <> ''
        and (
          regexp_replace(o.phone, '\D', '', 'g') = q.query_phone_digits
          or (length(q.query_phone_digits) = 3 and o.phone_last3 = q.query_phone_digits)
        )
      )
    )
  order by o.created_at desc
  limit 50;
$$;

grant execute on function public.search_order_status(text, text, text) to anon, authenticated;

-- Create your first admin account email manually.
insert into public.admins(email)
values ('49125466easongo@gmail.com')
on conflict (email) do nothing;

-- Create a first campaign sample.
insert into public.campaigns(slug, title, description, notice, custom_fields, is_active)
values (
  'usj-poster-initial',
  '環球影城海報冊代購（第一梯）',
  '請填寫訂購資訊。',
  '匯款後請保留明細，若選擇賣貨便請於備註提供寄件所需資訊。',
  '[]'::jsonb,
  true
)
on conflict (slug) do nothing;
