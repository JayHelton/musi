# Musi Supabase infrastructure

This directory holds the Supabase side of optional Musi cloud sync. It does not
build or host the Musi PWA.

## Contents

| Path | Role |
| ---- | ---- |
| `config.toml` | Local stack settings, Storage bucket, Edge Function declaration |
| `schemas/` | Declarative DDL for `supabase db diff` |
| `migrations/` | Apply chain for `supabase db reset` and production deploy |
| `tests/` | pgTAP tests for RLS, quotas, and purge scope |
| `functions/account/` | Edge Function for account export and delete |

## Local loop

1. Run `supabase start`.
2. Run `supabase db reset` to apply migrations.
3. Run `supabase test db` to run pgTAP tests.
4. Edit `schemas/*.sql`, then run `supabase db diff -f <name>` when you change DDL.
5. Commit schema files and migrations together.

Serve the PWA with `python3 -m http.server 8080` at `http://localhost:8080`.
Use Inbucket on port `54325` for local OTP email.

## Production deploy

Connect this repository in the Supabase Dashboard GitHub integration. Set the
working directory to `.`. Turn on **Deploy to production** for push to `main`.
Turn off automatic branching.

On each push to `main`, the integration deploys migrations, Edge Functions
declared in `config.toml`, and Storage buckets declared in `config.toml`.

**Warning:** the integration ignores `[auth]` and `[api]` blocks in
`config.toml`. Set production Auth, API, redirect URLs, and SMTP in the
Dashboard.

## Who may sign in

The publishable key sits in the browser, so anybody can call the sign-up
endpoint. Musi therefore closes the door twice.

1. **The database gate.** `migrations/20260103000000_restrict_signup.sql` adds a
   trigger on `auth.users`. The trigger rejects any new account whose email is
   not in `public.signup_allowlist`. The list starts empty, and an empty list
   denies every new account. Add your own address one time, in the Dashboard
   under SQL Editor:

```sql
insert into public.signup_allowlist (email, note)
values ('you@example.com', 'owner');
```

2. **The Dashboard switch.** Open Authentication → Sign In / Providers and turn
   off **Allow new users to sign up**. The integration ignores `[auth]` in
   `config.toml`, so this switch lives in the Dashboard only.

Use both. The trigger is version controlled and survives a Dashboard change.
The switch stops the request earlier and saves email quota.

Neither gate touches an account that already exists. To remove a person, delete
the user in the Dashboard and delete the matching allow-list row.

## Why one user cannot reach the data of another

| Control | Effect |
| ------- | ------ |
| `revoke all ... from anon` | A caller with only the publishable key gets `permission denied`. No read, no write. |
| `grant ... to authenticated` plus RLS | A signed-in caller reaches rows where `user_id = auth.uid()` and no others. |
| `force row level security` | The rule holds even for the table owner. |
| `user_id` default `auth.uid()` | The client never sends `user_id`. The `with check` clause rejects a spoofed value. |
| Private `attachments` bucket | Storage policies match the first path segment against `auth.uid()`. |
| `realtime.messages` policy | A client may only listen on the topic `sync:<its own user id>`. |
| Payload, row, and storage caps | 256 KB per record, 50 000 rows, and 2 GB per user. |

The service-role key never leaves Supabase. Only the `account` Edge Function
uses it, and that function derives the user from the JWT.

## Schema workflow

- Put tables, functions, and triggers in `schemas/`.
- Put RLS policies, grants, Realtime policies, Storage policies, and pg_cron
  schedules in hand-written `migrations/`.
- Keep `migrations/20260101000000_sync_schema.sql` in sync with `schemas/` when
  you edit declarative DDL.

See `docs/supabase-sync-schema.md` and `docs/supabase-sync-plan.md` for full
reference.
