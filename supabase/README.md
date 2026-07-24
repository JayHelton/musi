# Musi — Supabase database (schema as code)

SQL migrations and local CLI config for Musi's cloud sync backend. The hosted
project is created separately in [`../infra/terraform`](../infra/terraform);
this directory owns the **schema, triggers, and RLS policies**.

```
supabase/
  config.toml                 # Supabase CLI config (local dev + linking)
  migrations/
    0001_init.sql             # tables, updated_at + new-user triggers
    0002_policies.sql         # RLS: owner-scoped access + public sharing
```

## Tables (cloud mirror of the browser's localStorage)

| Table                   | Mirrors (`js/persistence.js` / `js/sessions.js`) |
| ----------------------- | ------------------------------------------------ |
| `public.profiles`       | 1:1 with `auth.users` (display name, avatar)     |
| `public.user_settings`  | the `musi:settings` blob (musical context, prefs, stats) |
| `public.sessions`       | `musi.sessions` (saved drill routines)           |
| `public.session_history`| `musi.sessionHistory` (completed runs)           |

Every table has RLS enabled and is owner-scoped (`auth.uid() = user_id`).
`sessions` additionally allows read-only access to rows flagged `is_public`, to
support future "share a routine" workbench features.

## Local development

```bash
supabase start          # boots Postgres + Auth + Studio in Docker
supabase db reset       # applies migrations/ from scratch
# Studio: http://localhost:54323
```

## Applying to the hosted project

```bash
supabase link --project-ref <ref-from-terraform>
supabase db push
```

## Adding a migration

```bash
supabase migration new <name>   # creates migrations/<timestamp>_<name>.sql
```

Keep migrations forward-only and idempotent where practical (`create ... if not
exists`, `drop policy if exists` before `create policy`).

## Verification

The two migrations were applied and exercised against a vanilla PostgreSQL 16
instance (with small stand-ins for the Supabase-provided `auth` schema):
the new-user trigger creates a profile, owners see only their own rows plus
public sessions, and cross-user writes are rejected by RLS.
