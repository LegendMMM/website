-- Optional admin control table for frontend auth (email/fb nickname login mode)

create table if not exists public.admin_overrides (
  email text primary key,
  is_admin boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.admin_overrides to anon, authenticated, service_role;
alter table public.admin_overrides disable row level security;

create or replace function public.set_admin_override(target_email text, target_is_admin boolean, target_note text default null)
returns void
language plpgsql
as $$
begin
  insert into public.admin_overrides(email, is_admin, note, updated_at)
  values (target_email, target_is_admin, target_note, now())
  on conflict (email)
  do update set
    is_admin = excluded.is_admin,
    note = excluded.note,
    updated_at = now();
end;
$$;
