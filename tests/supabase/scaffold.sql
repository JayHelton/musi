-- Minimal stand-in for the Supabase platform objects the migrations rely on.
-- Verification only. This is not part of the repository.

do $roles$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role','supabase_auth_admin'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin', r);
    end if;
  end loop;
end
$roles$;

create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists realtime;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz not null default now()
);

-- Stands in for the JWT claim lookup.
create or replace function auth.uid() returns uuid language sql stable as $fn$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$fn$;

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[] language sql immutable as $fn$
  select string_to_array(name, '/');
$fn$;

create table realtime.messages (
  id bigserial primary key,
  topic text,
  payload jsonb
);
alter table realtime.messages enable row level security;

create or replace function realtime.broadcast_changes(
  topic text, event text, operation text, table_name text, table_schema text,
  new_record anyelement, old_record anyelement
) returns void language plpgsql as $fn$
begin
  insert into realtime.messages (topic, payload) values (topic, jsonb_build_object('event', event));
end;
$fn$;
