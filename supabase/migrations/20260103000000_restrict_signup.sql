-- Restrict sign-up to an allow list of email addresses.
--
-- The publishable key is public by design, so anybody can call the sign-up
-- endpoint. Row Level Security already stops one user from reading or changing
-- the rows of another user, but an open project still lets a stranger create an
-- account and use the quota. This migration adds a second gate at the database.
--
-- The list holds the owner of this project and nobody else. An empty list
-- denies every new account, so the seed at the end of this file is the only
-- door. To let a second person in, add a row in the Supabase Dashboard, under
-- SQL Editor:
--
--   insert into public.signup_allowlist (email, note)
--   values ('them@example.com', 'why');
--
-- To close the door again, delete the row. An account that already exists keeps
-- working: this gate stops new accounts only.

create table if not exists public.signup_allowlist (
  email       text primary key,
  note        text,
  created_at  timestamptz not null default now()
);

comment on table public.signup_allowlist is
  'Email addresses that may create an account. An empty table denies every new account.';

-- PostgREST must never see this table. No grants, and Row Level Security with
-- no policy, so neither anon nor authenticated can read it or write to it.
alter table public.signup_allowlist enable row level security;
revoke all on public.signup_allowlist from anon, authenticated;

-- The function runs as its owner, so it can read the allow list while the
-- calling role cannot.
create or replace function public.enforce_signup_allowlist()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is null then
    raise exception 'signup_not_allowed' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.signup_allowlist a
    where lower(a.email) = lower(new.email)
  ) then
    raise exception 'signup_not_allowed' using errcode = 'P0001';
  end if;
  return new;
end; $$;

revoke all on function public.enforce_signup_allowlist() from public, anon, authenticated;

drop trigger if exists enforce_signup_allowlist on auth.users;
create trigger enforce_signup_allowlist before insert on auth.users
  for each row execute function public.enforce_signup_allowlist();

-- The owner of this project. This address already appears in the commit history
-- of this public repository, so the file adds no new exposure.
insert into public.signup_allowlist (email, note)
values ('jaydhelton@gmail.com', 'owner')
on conflict (email) do nothing;
