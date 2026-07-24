-- Musi initial schema.
--
-- These tables are the cloud mirror of the browser's localStorage stores:
--   * public.profiles        -> one row per auth user (display name, etc.)
--   * public.user_settings   -> mirror of the `musi:settings` store
--                               (musical context + tool preferences + stats blob)
--   * public.sessions        -> mirror of `musi.sessions` (saved drill routines)
--   * public.session_history -> mirror of `musi.sessionHistory` (completed runs)
--
-- Sync model is offline-first + last-write-wins on `updated_at`, with soft
-- deletes (`deleted_at`) so a delete on one device propagates as a tombstone.

create extension if not exists "pgcrypto";

-- Reusable trigger to keep updated_at fresh on every write.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: 1:1 with auth.users
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- user_settings: single JSON blob per user (musical context, prefs, stats)
-- ---------------------------------------------------------------------------
create table if not exists public.user_settings (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  settings   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_user_settings_updated_at on public.user_settings;
create trigger trg_user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- sessions: saved drill routines (mirror of localStorage `musi.sessions`)
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  drills      jsonb not null default '[]'::jsonb,
  -- Future workbench: opt-in sharing. NULL slug = private.
  is_public   boolean not null default false,
  share_slug  text unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists sessions_user_id_idx on public.sessions (user_id);
create index if not exists sessions_updated_at_idx on public.sessions (updated_at);

drop trigger if exists trg_sessions_updated_at on public.sessions;
create trigger trg_sessions_updated_at
  before update on public.sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- session_history: completed runs (mirror of `musi.sessionHistory`)
-- ---------------------------------------------------------------------------
create table if not exists public.session_history (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  session_id   uuid references public.sessions (id) on delete set null,
  payload      jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now()
);

create index if not exists session_history_user_id_idx on public.session_history (user_id);
create index if not exists session_history_completed_at_idx on public.session_history (completed_at desc);
