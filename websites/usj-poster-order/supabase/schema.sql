-- Run this file in Supabase SQL Editor.
-- It creates tables, policies, triggers, and query function used by this website.
-- Safe to rerun for upgrades.

create extension if not exists pgcrypto;

create table if not exists public.admins (
  email text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null,
  description text not null default '',
  notice text not null default '',
  custom_fields jsonb not null default '[]'::jsonb,
  field_config jsonb not null default '[]'::jsonb,
  status_options jsonb not null default '[]'::jsonb,
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
  field_snapshot jsonb not null default '[]'::jsonb,
  status text not null default '已匯款',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_status_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by text,
  changed_at timestamptz not null default now()
);

-- Upgrade existing databases safely.
alter table public.campaigns
  add column if not exists custom_fields jsonb not null default '[]'::jsonb;
alter table public.campaigns
  add column if not exists notice text not null default '';
alter table public.campaigns
  add column if not exists field_config jsonb not null default '[]'::jsonb;
alter table public.campaigns
  add column if not exists status_options jsonb not null default '[]'::jsonb;

alter table public.orders
  add column if not exists transaction_method text not null default '面交';

alter table public.orders
  add column if not exists extra_data jsonb not null default '{}'::jsonb;
alter table public.orders
  add column if not exists field_snapshot jsonb not null default '[]'::jsonb;

-- Ensure columns have expected defaults and not-null.
alter table public.campaigns
  alter column notice set default '',
  alter column notice set not null,
  alter column custom_fields set default '[]'::jsonb,
  alter column custom_fields set not null,
  alter column field_config set default '[]'::jsonb,
  alter column field_config set not null,
  alter column status_options set default '[]'::jsonb,
  alter column status_options set not null;

alter table public.orders
  alter column transaction_method set default '面交',
  alter column transaction_method set not null,
  alter column extra_data set default '{}'::jsonb,
  alter column extra_data set not null,
  alter column field_snapshot set default '[]'::jsonb,
  alter column field_snapshot set not null;

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
    where conname = 'campaigns_field_config_array_check'
  ) then
    alter table public.campaigns
      add constraint campaigns_field_config_array_check
      check (jsonb_typeof(field_config) = 'array');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'campaigns_status_options_array_check'
  ) then
    alter table public.campaigns
      add constraint campaigns_status_options_array_check
      check (jsonb_typeof(status_options) = 'array');
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

  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_field_snapshot_array_check'
  ) then
    alter table public.orders
      add constraint orders_field_snapshot_array_check
      check (jsonb_typeof(field_snapshot) = 'array');
  end if;
end;
$$;

do $$
declare
  rec record;
begin
  for rec in
    select conname
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
      and pg_get_constraintdef(oid) ilike '%已匯款%'
  loop
    execute format('alter table public.orders drop constraint %I', rec.conname);
  end loop;
end;
$$;

create index if not exists idx_orders_campaign_created_at on public.orders(campaign_id, created_at desc);
create index if not exists idx_orders_customer_lookup on public.orders(lower(customer_name), phone_last3);
create index if not exists idx_orders_phone_digits on public.orders((regexp_replace(phone, '\D', '', 'g')));
create index if not exists idx_order_status_logs_campaign_changed_at on public.order_status_logs(campaign_id, changed_at desc);
create index if not exists idx_order_status_logs_order_changed_at on public.order_status_logs(order_id, changed_at desc);

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

create or replace function public.log_order_status_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.order_status_logs(order_id, campaign_id, old_status, new_status, changed_by)
    values (new.id, new.campaign_id, old.status, new.status, auth.email());
  end if;
  return new;
end;
$$;

drop function if exists public.create_order_secure(
  uuid,
  text,
  text,
  text,
  integer,
  text,
  timestamptz,
  text,
  text,
  jsonb,
  jsonb,
  text,
  text
);

create or replace function public.create_order_secure(
  p_campaign_id uuid,
  p_customer_name text,
  p_phone text,
  p_email text,
  p_quantity integer,
  p_transfer_account text,
  p_transfer_time timestamptz,
  p_transaction_method text,
  p_note text default '',
  p_extra_data jsonb default '{}'::jsonb,
  p_field_snapshot jsonb default '[]'::jsonb,
  p_status text default null,
  p_hp text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign public.campaigns%rowtype;
  v_phone_digits text;
  v_effective_status text;
  v_status_options text[];
  v_global_status_options text[];
  v_note text := left(trim(coalesce(p_note, '')), 1000);
  v_extra_data jsonb := coalesce(p_extra_data, '{}'::jsonb);
  v_field_snapshot jsonb := coalesce(p_field_snapshot, '[]'::jsonb);
  v_order_id uuid;
begin
  if nullif(trim(coalesce(p_hp, '')), '') is not null then
    raise exception 'invalid request';
  end if;

  select *
  into v_campaign
  from public.campaigns
  where id = p_campaign_id
    and is_active = true;

  if not found then
    raise exception '活動不存在或未開放';
  end if;

  v_phone_digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_phone_digits) < 8 or length(v_phone_digits) > 20 then
    raise exception '手機格式錯誤';
  end if;

  if nullif(trim(coalesce(p_customer_name, '')), '') is null then
    raise exception '請輸入姓名';
  end if;
  if length(trim(p_customer_name)) > 60 then
    raise exception '姓名長度不可超過 60 字';
  end if;

  if nullif(trim(coalesce(p_email, '')), '') is null then
    raise exception '請輸入 Email';
  end if;
  if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Email 格式錯誤';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 999 then
    raise exception '數量需介於 1 到 999';
  end if;

  if nullif(trim(coalesce(p_transfer_account, '')), '') is null then
    raise exception '請輸入匯款帳號';
  end if;
  if length(trim(p_transfer_account)) > 80 then
    raise exception '匯款帳號長度不可超過 80 字';
  end if;

  if p_transfer_time is null then
    raise exception '請輸入匯款時間';
  end if;

  if coalesce(p_transaction_method, '') not in ('面交', '賣貨便') then
    raise exception '交易方式錯誤';
  end if;

  if jsonb_typeof(v_extra_data) <> 'object' then
    raise exception 'extra_data 必須為 object';
  end if;
  if jsonb_typeof(v_field_snapshot) <> 'array' then
    raise exception 'field_snapshot 必須為 array';
  end if;
  if jsonb_array_length(v_field_snapshot) > 80 then
    raise exception '欄位設定超過上限';
  end if;

  if exists (
    select 1
    from public.orders o
    where o.campaign_id = p_campaign_id
      and regexp_replace(o.phone, '\D', '', 'g') = v_phone_digits
      and o.created_at > now() - interval '30 seconds'
  ) then
    raise exception '送單過於頻繁，請稍後再試';
  end if;

  if exists (
    select 1
    from public.orders o
    where o.campaign_id = p_campaign_id
      and lower(trim(o.customer_name)) = lower(trim(p_customer_name))
      and regexp_replace(o.phone, '\D', '', 'g') = v_phone_digits
      and o.quantity = p_quantity
      and o.transfer_time = p_transfer_time
      and o.created_at > now() - interval '24 hours'
  ) then
    raise exception '疑似重複送單，若需更正請聯絡管理員';
  end if;

  select coalesce(array_agg(value), array[]::text[])
  into v_status_options
  from jsonb_array_elements_text(coalesce(v_campaign.status_options, '[]'::jsonb)) as t(value)
  where nullif(trim(value), '') is not null;

  select coalesce(array_agg(value), array[]::text[])
  into v_global_status_options
  from public.app_settings s
  cross join lateral jsonb_array_elements_text(coalesce(s.value->'options', '[]'::jsonb)) as t(value)
  where s.key = 'order_status_options'
    and nullif(trim(value), '') is not null;

  if coalesce(array_length(v_status_options, 1), 0) = 0 then
    v_status_options := v_global_status_options;
  end if;

  if coalesce(array_length(v_status_options, 1), 0) = 0 then
    v_status_options := array['已匯款'];
  end if;

  v_effective_status := nullif(trim(coalesce(p_status, '')), '');
  if v_effective_status is null then
    v_effective_status := v_status_options[1];
  end if;

  if not (v_effective_status = any(v_status_options)) then
    raise exception '狀態值無效';
  end if;

  insert into public.orders(
    campaign_id,
    customer_name,
    phone,
    email,
    quantity,
    transfer_account,
    transfer_time,
    transaction_method,
    note,
    extra_data,
    field_snapshot,
    status
  )
  values (
    p_campaign_id,
    trim(p_customer_name),
    p_phone,
    lower(trim(p_email)),
    p_quantity,
    trim(p_transfer_account),
    p_transfer_time,
    p_transaction_method,
    v_note,
    v_extra_data,
    v_field_snapshot,
    v_effective_status
  )
  returning id into v_order_id;

  return v_order_id;
end;
$$;

drop trigger if exists trg_orders_derived_fields on public.orders;
create trigger trg_orders_derived_fields
before insert or update on public.orders
for each row
execute function public.set_orders_derived_fields();

drop trigger if exists trg_orders_status_log on public.orders;
create trigger trg_orders_status_log
after update on public.orders
for each row
execute function public.log_order_status_change();

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
alter table public.app_settings enable row level security;
alter table public.campaigns enable row level security;
alter table public.orders enable row level security;
alter table public.order_status_logs enable row level security;

-- admins table policies

drop policy if exists admins_select_self on public.admins;
create policy admins_select_self
on public.admins
for select
to authenticated
using (email = auth.email());

-- app_settings policies

drop policy if exists app_settings_public_read_defaults on public.app_settings;
create policy app_settings_public_read_defaults
on public.app_settings
for select
to anon, authenticated
using (key in ('order_form_defaults', 'order_status_options') or public.is_admin());

drop policy if exists app_settings_admin_insert on public.app_settings;
create policy app_settings_admin_insert
on public.app_settings
for insert
to authenticated
with check (public.is_admin());

drop policy if exists app_settings_admin_update on public.app_settings;
create policy app_settings_admin_update
on public.app_settings
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists app_settings_admin_delete on public.app_settings;
create policy app_settings_admin_delete
on public.app_settings
for delete
to authenticated
using (public.is_admin());

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
drop policy if exists orders_admin_insert on public.orders;
create policy orders_admin_insert
on public.orders
for insert
to authenticated
with check (public.is_admin());

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

drop policy if exists order_status_logs_admin_select on public.order_status_logs;
create policy order_status_logs_admin_select
on public.order_status_logs
for select
to authenticated
using (public.is_admin());

drop policy if exists order_status_logs_admin_insert on public.order_status_logs;
create policy order_status_logs_admin_insert
on public.order_status_logs
for insert
to authenticated
with check (public.is_admin());

drop policy if exists order_status_logs_admin_delete on public.order_status_logs;
create policy order_status_logs_admin_delete
on public.order_status_logs
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

revoke all on function public.search_order_status(text, text, text) from public;
grant execute on function public.search_order_status(text, text, text) to anon, authenticated;
revoke all on function public.create_order_secure(uuid, text, text, text, integer, text, timestamptz, text, text, jsonb, jsonb, text, text) from public;
grant execute on function public.create_order_secure(uuid, text, text, text, integer, text, timestamptz, text, text, jsonb, jsonb, text, text) to anon, authenticated;

-- Create your first admin account email manually.
insert into public.admins(email)
values ('49125466easongo@gmail.com')
on conflict (email) do nothing;

insert into public.app_settings(key, value)
values (
  'order_form_defaults',
  jsonb_build_object(
    'field_config',
    jsonb_build_array(
      jsonb_build_object('key', 'customer_name', 'label', '姓名', 'type', 'text', 'required', true, 'visible', true, 'placeholder', '', 'options', '[]'::jsonb, 'source', 'fixed'),
      jsonb_build_object('key', 'phone', 'label', '手機', 'type', 'tel', 'required', true, 'visible', true, 'placeholder', '例如 0912345678', 'options', '[]'::jsonb, 'source', 'fixed'),
      jsonb_build_object('key', 'email', 'label', 'Email', 'type', 'email', 'required', true, 'visible', true, 'placeholder', '', 'options', '[]'::jsonb, 'source', 'fixed'),
      jsonb_build_object('key', 'quantity', 'label', '數量', 'type', 'number', 'required', true, 'visible', true, 'placeholder', '', 'options', '[]'::jsonb, 'source', 'fixed'),
      jsonb_build_object('key', 'transfer_account', 'label', '匯款帳號', 'type', 'text', 'required', true, 'visible', true, 'placeholder', '例如 12345 或 完整帳號', 'options', '[]'::jsonb, 'source', 'fixed'),
      jsonb_build_object('key', 'transfer_time', 'label', '匯款時間', 'type', 'datetime-local', 'required', true, 'visible', true, 'placeholder', '', 'options', '[]'::jsonb, 'source', 'fixed'),
      jsonb_build_object('key', 'transaction_method', 'label', '交易方式', 'type', 'select', 'required', true, 'visible', true, 'placeholder', '', 'options', jsonb_build_array('面交', '賣貨便'), 'source', 'fixed'),
      jsonb_build_object('key', 'note', 'label', '備註', 'type', 'textarea', 'required', false, 'visible', true, 'placeholder', '可留空', 'options', '[]'::jsonb, 'source', 'fixed')
    )
  )
)
on conflict (key) do nothing;

insert into public.app_settings(key, value)
values (
  'order_status_options',
  jsonb_build_object(
    'options',
    jsonb_build_array('已匯款', '已採購', '已到貨', '已完成')
  )
)
on conflict (key) do nothing;

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

update public.campaigns c
set field_config = coalesce(
  (
    select jsonb_agg(item order by ord)
    from (
      select df as item, ord
      from jsonb_array_elements(
        coalesce((select s.value->'field_config' from public.app_settings s where s.key = 'order_form_defaults'), '[]'::jsonb)
      ) with ordinality as t(df, ord)
      union all
      select jsonb_build_object(
        'key', cf->>'key',
        'label', coalesce(cf->>'label', cf->>'key'),
        'type', coalesce(cf->>'type', 'text'),
        'required', coalesce((cf->>'required')::boolean, false),
        'visible', true,
        'placeholder', '',
        'options', coalesce(cf->'options', '[]'::jsonb),
        'source', 'custom'
      ) as item,
      1000 + ord as ord
      from jsonb_array_elements(coalesce(c.custom_fields, '[]'::jsonb)) with ordinality as t(cf, ord)
      where coalesce(cf->>'key', '') <> ''
    ) merged
  ),
  '[]'::jsonb
)
where coalesce(jsonb_array_length(c.field_config), 0) = 0;
