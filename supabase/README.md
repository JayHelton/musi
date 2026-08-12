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

## Schema workflow

- Put tables, functions, and triggers in `schemas/`.
- Put RLS policies, grants, Realtime policies, Storage policies, and pg_cron
  schedules in hand-written `migrations/`.
- Keep `migrations/20260101000000_sync_schema.sql` in sync with `schemas/` when
  you edit declarative DDL.

See `docs/supabase-sync-schema.md` and `docs/supabase-sync-plan.md` for full
reference.
