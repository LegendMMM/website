-- WARNING: destructive.
-- This will delete all tables, data, constraints, triggers, and legacy types under public schema.
-- Use this when the project was previously bootstrapped with older ecommerce/auth-linked schemas
-- and you do NOT need to preserve the current Supabase data.

drop schema if exists public cascade;
create schema public;

grant usage on schema public to postgres, anon, authenticated, service_role;
grant create on schema public to postgres, service_role;

grant all on all tables in schema public to postgres, service_role;
grant all on all routines in schema public to postgres, service_role;
grant all on all sequences in schema public to postgres, service_role;

alter default privileges for role postgres in schema public grant all on tables to postgres, service_role;
alter default privileges for role postgres in schema public grant all on routines to postgres, service_role;
alter default privileges for role postgres in schema public grant all on sequences to postgres, service_role;
