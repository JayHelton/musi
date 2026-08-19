# Cloud Sync — Database & Infrastructure Reference

> **Routines were removed.** The consolidation refactor deleted the Routines
> feature, so `routines` is no longer a sync scope, a sync domain, or a merge
> case. Every mention of `routines` or `musi.routines` below is history. Stored
> `musi.routines` data stays on the device; nothing reads it and nothing syncs
> it.

Supabase-side schema, storage, Realtime, Edge Function, and deployment reference for
optional Musi cloud sync. Master scope lives in
[`docs/supabase-sync-plan.md`](supabase-sync-plan.md); client design in
[`docs/supabase-sync-client.md`](supabase-sync-client.md).

**This document covers only Supabase-side infrastructure. No part of it deploys,
builds, or hosts the Musi PWA** — the app continues to ship as static files from
its existing static host.

---

## File layout

```
supabase/
├── config.toml
├── schemas/
│   ├── 010_extensions.sql
│   ├── 020_sync_tables.sql
│   ├── 030_sync_functions.sql
│   └── 040_sync_indexes.sql
├── migrations/
├── tests/
└── functions/account/index.ts
```

| Path | Purpose | Commit? |
| ---- | ------- | ------- |
| `supabase/config.toml` | Local auth/API, storage buckets, functions, `schema_paths` | Yes |
| `supabase/schemas/*.sql` | Declarative DDL for diff engine | Yes |
| `supabase/migrations/*.sql` | Generated + hand-written apply chain | Yes |
| `supabase/tests/*.sql` | pgTAP (`supabase test db`) | Yes |
| `supabase/functions/account/index.ts` | Account delete + export | Yes |
| `.env` with secrets | SMTP credentials for local dev | **No** |

---

## Schema files vs hand-written migrations

`supabase db diff` compares **`supabase/schemas/` against existing migrations**,
not the live database. Studio/`psql` edits are invisible. Loop: edit schemas →
`supabase db diff -f <name>` → review → `supabase db reset` → commit schema +
migration together.

**Call out prominently:** the diff engine does not reliably track **RLS
policies, grants/privileges, comments, publications, and DML**. Structure the
repo accordingly — schema files for tables/indexes/functions; hand-written
migrations for policies, grants, cron, publication changes. Keep all policy SQL
checked in and reviewable.

| Object type | Lives in | Why |
| ----------- | -------- | --- |
| Tables, indexes, FKs, checks | `schemas/*.sql` → diff | Diff handles DDL |
| Functions, triggers | `schemas/*.sql` → diff | Verify generated SQL |
| **RLS policies** | Hand-written migrations | Diff weak spot |
| **`revoke` / `grant`** | Hand-written migrations | Diff weak spot |
| **Comments, publications** | Hand-written migrations | Diff weak spot |
| **pg_cron schedules** | Hand-written migrations | DML / extension |
| `realtime.messages` RLS | Hand-written migrations | Extension coupling |
| `storage.objects` policies | Hand-written migrations | Outside schemas path |
| Bucket creation on remote | GitHub integration from `config.toml` | Integration deploys declared buckets |

Pin order via `[db.migrations] schema_paths = [...]` in `config.toml` when needed.

---

## Tables

### `sync_records`

| Column | Type | Notes |
| ------ | ---- | ----- |
| `user_id` | `uuid` | FK → `auth.users`, cascade delete |
| `domain` | `text` | Check-constrained sync domain |
| `record_id` | `text` | Entity id (`note-*`, settings key, `att:<id>`, …) |
| `payload` | `jsonb` | Opaque client document; not on Realtime wire |
| `deleted` | `boolean` | Tombstone (hard-deleted after 90 days) |
| `updated_at` | `timestamptz` | Trigger-maintained |
| `device_id` | `text` | Originating device |
| `content_hash` | `text` | Client idempotency / conflict hint |
| `rev` | `bigserial` | Global monotonic pull cursor |

**`rev`:** single pull cursor per user (`rev > :cursor order by rev`). Inserts use
the `bigserial` default; a `before update` trigger calls `nextval` on every update.

**`user_id`:** defaults to `auth.uid()` so the client never sends it. The RLS
`with check` clause rejects any row whose `user_id` is not the caller, making a
spoofed value a hard failure rather than a silent cross-tenant write.

**`payload`:** `jsonb` holds domain-native JSON from `localStorage` /
IndexedDB metadata — server enforces size/ownership, not structure.

### `sync_devices`

| Column | Type | Notes |
| ------ | ---- | ----- |
| `user_id`, `device_id` | `uuid`, `text` | PK `(user_id, device_id)` |
| `name`, `platform`, `app_version` | `text` | Diagnostics |
| `last_seen_at` | `timestamptz` | Heartbeat |
| `last_pulled_rev` | `bigint` | Optional server hint |
| `created_at` | `timestamptz` | First registration |

### `sync_blobs`

| Column | Type | Notes |
| ------ | ---- | ----- |
| `user_id`, `attachment_id` | `uuid`, `text` | PK; `attachment_id` like `att-%` |
| `crc32`, `size_bytes` | `text`, `bigint` | Dedupe with `js/sync/syncBundle.js` |
| `mime_type` | `text` | MIME |
| `storage_path` | `text` | `{user_id}/{attachment_id}` |
| `deleted`, `updated_at`, `rev` | | Tombstone metadata; `rev` uses `bigserial` on insert, `before update` trigger on change |

### `sync_watermarks`

| Column | Type | Notes |
| ------ | ---- | ----- |
| `user_id` | `uuid` | PK |
| `purged_through_rev` | `bigint` | Highest `rev` hard-deleted by purge; cursor at or below → full resync |
| `max_rev` | `bigint` | Current max live `rev` among surviving rows |
| `updated_at` | `timestamptz` | Purge job maintains |

```sql
-- supabase/schemas/020_sync_tables.sql

create table public.sync_records (
  user_id       uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  domain        text        not null,
  record_id     text        not null,
  payload       jsonb       not null default '{}'::jsonb,
  deleted       boolean     not null default false,
  updated_at    timestamptz not null default now(),
  device_id     text        not null,
  content_hash  text        not null,
  rev           bigserial   not null,
  constraint sync_records_pkey primary key (user_id, domain, record_id),
  constraint sync_records_domain_check check (domain in (
    'settings','progress','notes','songs','exercises','exerciseCategories',
    'workbooks','workbookFolders','routines','gpAnnotations','drumPatterns',
    'attachmentsMeta')),
  constraint sync_records_record_id_nonempty check (char_length(record_id) > 0),
  constraint sync_records_device_id_nonempty check (char_length(device_id) > 0)
);

create index sync_records_user_rev_idx on public.sync_records (user_id, rev);
create index sync_records_user_domain_rev_idx on public.sync_records (user_id, domain, rev);

create table public.sync_devices (
  user_id          uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  device_id        text        not null,
  name             text,
  platform         text,
  app_version      text,
  last_seen_at     timestamptz not null default now(),
  last_pulled_rev  bigint      not null default 0,
  created_at       timestamptz not null default now(),
  constraint sync_devices_pkey primary key (user_id, device_id),
  constraint sync_devices_device_id_nonempty check (char_length(device_id) > 0)
);

create index sync_devices_user_last_seen_idx on public.sync_devices (user_id, last_seen_at desc);

create table public.sync_blobs (
  user_id        uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  attachment_id  text        not null,
  crc32          text        not null,
  size_bytes     bigint      not null,
  mime_type      text,
  storage_path   text        not null,
  deleted        boolean     not null default false,
  updated_at     timestamptz not null default now(),
  rev            bigserial   not null,
  constraint sync_blobs_pkey primary key (user_id, attachment_id),
  constraint sync_blobs_attachment_id_prefix check (attachment_id like 'att-%'),
  constraint sync_blobs_size_positive check (size_bytes > 0)
);

create index sync_blobs_user_rev_idx on public.sync_blobs (user_id, rev);
create index sync_blobs_user_crc32_size_idx on public.sync_blobs (user_id, crc32, size_bytes)
  where deleted = false;

create table public.sync_watermarks (
  user_id            uuid        primary key references auth.users (id) on delete cascade,
  purged_through_rev bigint      not null default 0,
  max_rev            bigint,
  updated_at         timestamptz not null default now()
);

-- supabase/schemas/030_sync_functions.sql (table maintenance)

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end; $$;

create trigger sync_records_touch_updated_at before update on public.sync_records
  for each row execute function public.touch_updated_at();
create trigger sync_blobs_touch_updated_at before update on public.sync_blobs
  for each row execute function public.touch_updated_at();

create or replace function public.sync_records_assign_rev()
returns trigger language plpgsql set search_path = public as $$
begin
  new.rev := nextval(pg_get_serial_sequence('public.sync_records', 'rev'));
  return new;
end; $$;

create trigger sync_records_assign_rev before update on public.sync_records
  for each row execute function public.sync_records_assign_rev();

create or replace function public.sync_blobs_assign_rev()
returns trigger language plpgsql set search_path = public as $$
begin new.rev := nextval(pg_get_serial_sequence('public.sync_blobs', 'rev')); return new; end; $$;
create trigger sync_blobs_assign_rev before update on public.sync_blobs
  for each row execute function public.sync_blobs_assign_rev();
```

---

## Row Level Security

Hand-written migration. `(select auth.uid())` form for InitPlan caching.
**`anon` gets nothing** — no policies, no grants.

```sql
-- supabase/migrations/20260102000000_sync_rls.sql

alter table public.sync_records enable row level security;
alter table public.sync_records force row level security;
revoke all on public.sync_records from anon, authenticated;
grant select, insert, update, delete on public.sync_records to authenticated;
create policy sync_records_select_own on public.sync_records for select to authenticated
  using (user_id = (select auth.uid()));
create policy sync_records_insert_own on public.sync_records for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy sync_records_update_own on public.sync_records for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy sync_records_delete_own on public.sync_records for delete to authenticated
  using (user_id = (select auth.uid()));

alter table public.sync_devices enable row level security;
alter table public.sync_devices force row level security;
revoke all on public.sync_devices from anon, authenticated;
grant select, insert, update, delete on public.sync_devices to authenticated;
create policy sync_devices_select_own on public.sync_devices for select to authenticated
  using (user_id = (select auth.uid()));
create policy sync_devices_insert_own on public.sync_devices for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy sync_devices_update_own on public.sync_devices for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy sync_devices_delete_own on public.sync_devices for delete to authenticated
  using (user_id = (select auth.uid()));

alter table public.sync_blobs enable row level security;
alter table public.sync_blobs force row level security;
revoke all on public.sync_blobs from anon, authenticated;
grant select, insert, update, delete on public.sync_blobs to authenticated;
create policy sync_blobs_select_own on public.sync_blobs for select to authenticated
  using (user_id = (select auth.uid()));
create policy sync_blobs_insert_own on public.sync_blobs for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy sync_blobs_update_own on public.sync_blobs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy sync_blobs_delete_own on public.sync_blobs for delete to authenticated
  using (user_id = (select auth.uid()));

alter table public.sync_watermarks enable row level security;
alter table public.sync_watermarks force row level security;
revoke all on public.sync_watermarks from anon, authenticated;
grant select on public.sync_watermarks to authenticated;
create policy sync_watermarks_select_own on public.sync_watermarks for select to authenticated
  using (user_id = (select auth.uid()));
```

| Policy | Command | Predicate | Intent |
| ------ | ------- | --------- | ------ |
| `sync_records_*_own` | CRUD | `user_id = auth.uid()` | Owner-only sync rows |
| `sync_devices_*_own` | CRUD | same | Device registry |
| `sync_blobs_*_own` | CRUD | same | Attachment metadata |
| `sync_watermarks_select_own` | `SELECT` | same | Read `purged_through_rev` for resync |
| *(none for `anon`)* | — | — | Zero access |

---

## Realtime fan-out

Broadcast from Database (not Postgres Changes). `SECURITY DEFINER` with explicit
`search_path = public, realtime`. Broadcast copies **strip `payload` from new and
old records**; clients pull bodies by `rev` cursor.

```sql
create or replace function public.broadcast_sync_record_change()
returns trigger language plpgsql security definer set search_path = public, realtime as $$
declare
  broadcast_new public.sync_records;
  broadcast_old public.sync_records;
begin
  broadcast_new := new;
  broadcast_new.payload := '{}'::jsonb;
  broadcast_old := null;
  if tg_op = 'UPDATE' then
    broadcast_old := old;
    broadcast_old.payload := '{}'::jsonb;
  end if;
  perform realtime.broadcast_changes(
    'sync:' || new.user_id::text, tg_op, tg_op, tg_table_name, tg_table_schema,
    broadcast_new, broadcast_old);
  return new;
end; $$;

create trigger sync_records_broadcast after insert or update on public.sync_records
  for each row execute function public.broadcast_sync_record_change();

-- supabase/migrations/20260102000001_realtime_messages_rls.sql
create policy realtime_sync_receive on realtime.messages for select to authenticated
  using (topic = 'sync:' || (select auth.uid())::text);
create policy realtime_sync_send on realtime.messages for insert to authenticated
  with check (topic = 'sync:' || (select auth.uid())::text);
```

| Broadcast field | Source | Notes |
| --------------- | ------ | ----- |
| `domain` | `sync_records.domain` | Route pull |
| `record_id` | `sync_records.record_id` | Entity key |
| `rev` | `sync_records.rev` | Advance cursor |
| `deleted` | `sync_records.deleted` | Tombstone hint |
| `device_id` | `sync_records.device_id` | Echo suppression |
| `payload` | — | **Omitted** (empty in broadcast copy only) |

---

## Storage

Private bucket `attachments`; path `{user_id}/{attachment_id}`. `sync_blobs` +
CRC32 dedupe index metadata; bytes in Storage. The GitHub integration deploys
buckets declared in `config.toml` on push to `main`.

```sql
-- supabase/migrations/20260102000002_storage_objects_rls.sql
create policy attachments_select_own on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy attachments_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy attachments_update_own on storage.objects for update to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy attachments_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
```

---

## Quotas, retention, and abuse limits

| Limit | Value | Enforced by | Client error |
| ----- | ----- | ----------- | ------------ |
| Payload size | ≈256 KB | `pg_column_size` trigger | `sync_payload_too_large` (`P0001`) |
| Rows per user | 50 000 | `BEFORE INSERT` count | `sync_row_cap_exceeded` (`P0001`) |
| Storage bytes/user | 2 GB (tunable) | `sync_blobs` insert trigger | `sync_storage_cap_exceeded` (`P0001`) |
| Tombstone retention | 90 days | `pg_cron` hard delete | See resync signal |
| File size | 250 MB | Storage `file_size_limit` | Storage API error |

```sql
create or replace function public.enforce_sync_payload_size()
returns trigger language plpgsql set search_path = public as $$
begin
  if pg_column_size(new.payload) > 256 * 1024 then
    raise exception 'sync_payload_too_large' using errcode = 'P0001';
  end if;
  return new;
end; $$;
create trigger sync_records_payload_size before insert or update on public.sync_records
  for each row execute function public.enforce_sync_payload_size();

create or replace function public.enforce_sync_row_cap()
returns trigger language plpgsql set search_path = public as $$
declare row_count bigint;
begin
  select count(*) into row_count from public.sync_records where user_id = new.user_id;
  if row_count >= 50000 then raise exception 'sync_row_cap_exceeded' using errcode = 'P0001'; end if;
  return new;
end; $$;
create trigger sync_records_row_cap before insert on public.sync_records
  for each row execute function public.enforce_sync_row_cap();

create or replace function public.enforce_sync_storage_cap()
returns trigger language plpgsql set search_path = public as $$
declare total_bytes bigint;
begin
  select coalesce(sum(size_bytes),0) into total_bytes from public.sync_blobs
    where user_id = new.user_id and deleted = false;
  if total_bytes + new.size_bytes > 2147483648 then
    raise exception 'sync_storage_cap_exceeded' using errcode = 'P0001';
  end if;
  return new;
end; $$;
create trigger sync_blobs_storage_cap before insert on public.sync_blobs
  for each row execute function public.enforce_sync_storage_cap();
```

**Full resync:** `purged_through_rev` is the highest `rev` among rows the purge
job deleted; if `p_cursor` is at or below it, call `sync_bounds(p_cursor)` and
respect `full_resync_required` (reset cursor, re-pull or re-upload).

```sql
create or replace function public.sync_bounds(p_cursor bigint default 0)
returns table (purged_through_rev bigint, max_rev bigint, full_resync_required boolean)
language plpgsql security definer set search_path = public as $$
declare uid uuid := (select auth.uid()); wm public.sync_watermarks;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into wm from public.sync_watermarks where user_id = uid;
  if not found then
    purged_through_rev := 0;
    max_rev := coalesce((select max(rev) from public.sync_records where user_id = uid), 0);
  else
    purged_through_rev := wm.purged_through_rev; max_rev := coalesce(wm.max_rev, 0);
  end if;
  full_resync_required := purged_through_rev > 0 and p_cursor <= purged_through_rev;
  return next;
end; $$;
revoke all on function public.sync_bounds(bigint) from public;
grant execute on function public.sync_bounds(bigint) to authenticated;

-- pg_cron (hand-written migration; extension in 010_extensions.sql). One SQL batch — idempotent.
select cron.schedule('purge_sync_tombstones', '0 4 * * *', $$
  with deleted_records as (
    delete from public.sync_records where deleted and updated_at < now() - interval '90 days'
    returning user_id, rev
  ), deleted_blobs as (
    delete from public.sync_blobs where deleted and updated_at < now() - interval '90 days'
    returning user_id, rev
  ), deleted as (
    select user_id, rev from deleted_records union all select user_id, rev from deleted_blobs
  ), boundary as (select user_id, max(rev) as purged_rev from deleted group by user_id),
  live_max as (select user_id, max(rev) as max_rev from public.sync_records group by user_id),
  affected as (select user_id from boundary union select user_id from live_max)
  insert into public.sync_watermarks (user_id, purged_through_rev, max_rev, updated_at)
  select a.user_id, greatest(coalesce(w.purged_through_rev, 0), coalesce(b.purged_rev, 0)), lm.max_rev, now()
  from affected a
  left join boundary b on b.user_id = a.user_id
  left join live_max lm on lm.user_id = a.user_id
  left join public.sync_watermarks w on w.user_id = a.user_id
  on conflict (user_id) do update set
    purged_through_rev = greatest(sync_watermarks.purged_through_rev, excluded.purged_through_rev),
    max_rev = excluded.max_rev, updated_at = now();
$$);
```

Pass `last_pulled_rev` as `p_cursor`; when `full_resync_required` is true, reset
the local cursor and re-sync from scratch.

---

## RPCs and the one Edge Function

### `public.purge_my_sync_data()`

Removes cloud copy; keeps `auth.users`. `SECURITY DEFINER`, `search_path =
public, storage`.

```sql
create or replace function public.purge_my_sync_data() returns void
language plpgsql security definer set search_path = public, storage as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not authenticated'; end if;
  delete from public.sync_records where user_id = uid;
  delete from public.sync_devices where user_id = uid;
  delete from public.sync_blobs where user_id = uid;
  delete from public.sync_watermarks where user_id = uid;
  delete from storage.objects where bucket_id = 'attachments'
    and (storage.foldername(name))[1] = uid::text;
end; $$;
revoke all on function public.purge_my_sync_data() from public;
grant execute on function public.purge_my_sync_data() to authenticated;
```

### Edge Function `account`

| | |
| - | - |
| Path | `supabase/functions/account/index.ts` |
| `verify_jwt` | `true` |
| Credentials | Service role (server-side only) |

**Delete account:** JWT `sub` → purge sync + storage → `auth.admin.deleteUser`.
**Export:** JWT → JSON of `sync_records` + signed URLs / manifest for blobs.
Needs service role for Admin API and cross-schema deletes. **Never accept from
client:** `user_id` override, service role key, arbitrary SQL.

```typescript
// Illustrative sketch — not production-ready
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
Deno.serve(async (req) => {
  const auth = req.headers.get('Authorization');
  if (!auth) return new Response('Unauthorized', { status: 401 });
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const path = new URL(req.url).pathname;
  if (path.endsWith('/delete') && req.method === 'POST') {
    /* purge + admin.auth.admin.deleteUser(user.id) */ return Response.json({ ok: true });
  }
  if (path.endsWith('/export') && req.method === 'POST') {
    /* export rows for user.id */ return Response.json({ ok: true, exportUrl: '…' });
  }
  return new Response('Not found', { status: 404 });
});
```

All other sync operations: client → PostgREST/Storage under RLS.

---

## config.toml

Secrets via `env(...)` for local development — never commit real values. Production SMTP is configured in the Dashboard.

The `[api]`, `[auth]`, `[auth.email]`, and `[auth.rate_limit]` blocks below are **local-development settings only**. Production values are managed in the Supabase Dashboard; the GitHub integration ignores these blocks by default. Bucket and function declarations are deployed by the integration.

```toml
project_id = "local"  # local stack only

# --- Local development only (integration ignores [api] and [auth] in production) ---

[api]
enabled = true
port = 54321
schemas = ["public", "storage", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[db]
port = 54322
shadow_port = 54320
major_version = 17  # must match the production Supabase project's Postgres major version

[db.migrations]
schema_paths = ["./schemas/010_extensions.sql","./schemas/020_sync_tables.sql",
  "./schemas/030_sync_functions.sql","./schemas/040_sync_indexes.sql"]

[realtime]
enabled = true

[storage]
enabled = true
file_size_limit = "250MiB"

# --- Deployed by GitHub integration on push to main ---

[storage.buckets.attachments]
public = false
file_size_limit = "250MiB"
allowed_mime_types = []

# --- Local development only ---

[auth]
enabled = true
site_url = "https://YOUR_STATIC_HOST.example"  # PWA origin — not Supabase
additional_redirect_urls = ["https://YOUR_STATIC_HOST.example", "http://localhost:8080"]
jwt_expiry = 3600
enable_signup = true

[auth.email]
enable_signup = true
double_confirm_changes = true
enable_confirmations = false   # OTP/magic-link sign-in
otp_expiry = 3600
max_frequency = "1s"

[auth.email.smtp]
enabled = true
host = "env(SMTP_HOST)"      # local dev only — production SMTP is Dashboard-managed
port = 587
user = "env(SMTP_USER)"
pass = "env(SMTP_PASS)"
admin_email = "noreply@YOUR_DOMAIN.example"
sender_name = "Musi"

[auth.rate_limit]
email_sent = 4
sign_in_sign_ups = 30
token_verifications = 30
token_refresh = 150
anonymous_users = 0          # v1: no anonymous auth

# --- Deployed by GitHub integration on push to main ---

[functions.account]
verify_jwt = true

[inbucket]
enabled = true
smtp_port = 54325            # local OTP capture
```

Auth v1: passwordless email, 6-digit OTP primary, magic link secondary, PKCE; no
passwords/OAuth/anonymous.

---

## Deployment — Supabase Dashboard + GitHub integration

One production Supabase project. The Supabase Dashboard creates and configures the project; the connected GitHub repository deploys versioned `supabase/` artifacts on push to `main`.

**The integration deploys database migrations, Edge Functions declared in
`config.toml`, and Storage buckets declared in `config.toml` — never the Musi
PWA.** Application code at the repository root is never built or deployed.

**API, Auth, and seed configuration in `config.toml` are ignored by default.**
Production Auth and API settings are configured in the Dashboard.

### Setup checklist

1. Create or open the production project in the Supabase Dashboard.
2. Configure Auth/API redirect URLs, JWT expiry, and SMTP in the Dashboard.
3. Dashboard → Project Settings → Integrations → GitHub Integration
4. Authorize GitHub → authorize Supabase on GitHub
5. Choose the repository
6. **Working directory:** `.` (`supabase/` is at the repository root)
7. **Deploy to production:** on (push/merge to `main`)
8. **Automatic branching:** off

The connected integration owns deployment credentials — no separate access tokens or database passwords are required in the repository.

| Integration deploys | Integration ignores (Dashboard-managed) |
| ------------------- | --------------------------------------- |
| New migrations | `[api]` |
| Edge Functions in `config.toml` | `[auth]`, `[auth.email]`, `[auth.rate_limit]` |
| Storage buckets in `config.toml` | Seed configuration |
| | SMTP credentials (Dashboard) |

---

## pgTAP tests

```bash
supabase test db
```

`auth.users` needs version-specific not-null columns — use a user-creation helper
or the full column set. `supabase test db` rolls back each file's transaction.

Fake JWT: `set local role authenticated; set local request.jwt.claims =
'{"sub":"<uuid>"}';`

**Checklist:** user A cannot touch user B's `sync_records`; `anon` gets zero
rows; payload cap raises `sync_payload_too_large`; tombstone purge respects 90
days; broadcast function exists; `purge_my_sync_data` scoped to caller.

```sql
-- tests/010_rls_sync_records.sql
begin; select plan(1);
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','a@test.com'),
  ('22222222-2222-2222-2222-222222222222','b@test.com');
insert into public.sync_records (user_id,domain,record_id,device_id,content_hash,payload)
  values ('11111111-1111-1111-1111-111111111111','notes','note-1','d','h','{}'::jsonb);
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
select is((select count(*)::int from public.sync_records where record_id='note-1'),0,
  'user B cannot see user A rows');
select * from finish(); rollback;
```

```sql
-- tests/020_quotas.sql
begin; select plan(1);
insert into auth.users (id,email) values ('11111111-1111-1111-1111-111111111111','a@test.com');
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select throws_ok(
  $$insert into public.sync_records (user_id,domain,record_id,device_id,content_hash,payload)
    values ('11111111-1111-1111-1111-111111111111','notes','big','d','h',
      jsonb_build_object('p',repeat('x',300000)))$$,
  'P0001','sync_payload_too_large','oversize payload rejected');
select * from finish(); rollback;
```

```sql
-- tests/030_broadcast.sql
begin; select plan(1);
select has_function('public','broadcast_sync_record_change','broadcast fn exists');
select * from finish(); rollback;
```

---

## Local development loop

1. `supabase start`
2. Edit `supabase/schemas/*.sql`
3. `supabase db diff -f <name>` — review migration; hand-write policies/grants
   the diff missed
4. `supabase db reset`
5. `supabase test db`
6. Commit schema + migration together
7. Push to `main` — this is the deployment. Migrations reaching production is a
   consequence of `git push`; the GitHub integration applies them automatically.

| Resource | Value |
| -------- | ----- |
| Local API | `http://127.0.0.1:54321` |
| Anon key | `supabase status` |
| Inbucket (OTP) | `[inbucket] smtp_port` (default `54325`) |
| Musi PWA | `python3 -m http.server 8080` at `http://localhost:8080` |

---

## Applying to an existing project

1. `supabase db pull` — baseline migration from live schema, only if adopting
   an existing schema
2. **Caution:** two representations (pull + `schemas/`). Reconcile deliberately
   before the next `db diff`.
3. Configure Auth/API/SMTP in the Supabase Dashboard
4. Connect the repo: GitHub Integration, working directory `.`, Deploy to
   production on, automatic branching off
5. Confirm the first integration deploy (migrations, functions, buckets)

Never edit production only in Studio — `db diff` will not see it.

---

## Risks & mitigations

| Risk | Mitigation |
| ---- | ---------- |
| Diff misses policies/grants | Hand-written migrations; review before push |
| Dashboard drift from documented Auth/API settings | Dashboard is the source of truth; verify redirect URLs and SMTP after changes; do not expect `[auth]` / `[api]` `config.toml` edits to update production |
| Breaking migration on auto-deploy | Additive, backwards-compatible migrations; local `supabase db reset` + pgTAP before push |
| Retention vs stale cursor | `sync_watermarks.purged_through_rev` + `sync_bounds(cursor)` |
| Opaque quota errors | Map `P0001` messages in client |
| Free-tier project pause | Paid instance for production (Dashboard) |
| Broadcast payload leak | Strip `payload` in broadcast copy |
| Service role misuse | `verify_jwt`; derive user only from JWT |
