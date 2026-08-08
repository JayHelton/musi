-- Row Level Security for Musi.
--
-- Every table is owner-scoped: a user can only see and mutate their own rows
-- (auth.uid() = user_id). Public session sharing is added as an explicit,
-- read-only exception so future "share a routine" workbench features work
-- without exposing private data.

alter table public.profiles        enable row level security;
alter table public.user_settings   enable row level security;
alter table public.sessions        enable row level security;
alter table public.session_history enable row level security;

-- profiles -----------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- user_settings ------------------------------------------------------------
drop policy if exists "user_settings_rw_own" on public.user_settings;
create policy "user_settings_rw_own"
  on public.user_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- sessions -----------------------------------------------------------------
drop policy if exists "sessions_rw_own" on public.sessions;
create policy "sessions_rw_own"
  on public.sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Read-only access to sessions explicitly shared as public.
drop policy if exists "sessions_select_public" on public.sessions;
create policy "sessions_select_public"
  on public.sessions for select
  using (is_public and deleted_at is null);

-- session_history ----------------------------------------------------------
drop policy if exists "session_history_rw_own" on public.session_history;
create policy "session_history_rw_own"
  on public.session_history for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
