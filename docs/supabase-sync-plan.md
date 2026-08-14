# Cloud Sync & Accounts — Implementation Plan

Optional accounts and background sync across Musi installs — Supabase as the data plane only.

Musi today is a fully local progressive web app: routines, exercises, workbooks, notes, songs, progress stats, and preferences all live on the device. Device sync (ZIP export/import and QR beam/receive) already moves most of that library between machines, but it is manual, one-shot, and cannot express deletes. This plan adds an **optional** cloud layer: sign in with a passwordless email OTP, and Musi keeps the same data in step across phones, tablets, and desktops. Supabase provides Auth, Postgres, Storage, and Realtime only; the PWA continues to ship as static files from its current host with no build step.

**Musi stays static and zero-build.** Supabase never hosts, builds, or deploys the PWA. Auth and cloud sync are strictly opt-in: when `js/cloud/cloudConfig.js` has empty values, no Account UI is rendered, no Supabase client is constructed, and no network request is made. Signed-out users retain full local functionality; QR/ZIP device sync remains a peer alternative.

## Why this feature

| Need | Today |
| ---- | ----- |
| A second device starts with an empty library | Each install is independent until the user manually exports and imports |
| Deletes and edits propagate reliably | QR/ZIP merge is additive-only in `merge` mode; records removed on one device never disappear on another |
| Switch phone or desktop mid-practice | Routine state, active session cursors, and in-progress workbook entries are device-local |
| A lost or replaced device | Without a recent ZIP backup, the library is gone |
| Background sync without user ceremony | Device sync requires deliberate export/beam steps; no incremental pull |

**Product goal:** offer an optional account that keeps routines, exercises, workbooks, notes, songs, progress, and compatible settings aligned across a user's Musi installs, while preserving today's offline-first behaviour and the existing manual sync path for users who prefer no account.

## Current foundation (do not rebuild)

| Piece | Where | Notes |
| ----- | ----- | ----- |
| Snapshot builder | `js/sync/syncProfile.js` | Single source of truth for sync scopes (`settings`, `progress`, `content`); `buildSnapshot`, `applySnapshot` (`merge` \| `replace`), `validateSnapshot`, `summarizeSnapshot`; `mergeById` LWW on `updatedAt` / `modifiedAt` / `createdAt` / `addedAt` |
| Library bundle | `js/sync/syncBundle.js` | ZIP with `manifest.json` (per-file CRC32), snapshot JSON, attachment blobs, drum patterns; import dedupes by content hash and remaps ids on collision |
| Device sync UI | `js/sync/syncUI.js` + `css/sync.css` | Settings block `#mp-sync-block`: Export library (ZIP), Import, Export settings JSON, Beam/Receive QR; hosted in `#music-prefs-root` via `js/musicPreferences.js` |
| Settings wrapper | `js/persistence.js` | Cached wrapper over one `localStorage` key `musi:settings` (~40+ preference keys); `getSetting`, `saveSetting`, `saveSettings`, `invalidateSettingsCache` — not IndexedDB |
| Content `localStorage` | `js/notes.js`, `js/songwriter.js`, `js/exercises.js`, `js/workbookModel.js`, `js/routineModel.js`, `js/gpAnnotations.js`, `js/gpPlayer/playerState.js` | Dedicated keys: `musi.notes`, `musi.songs`, `musi.exercises`, `musi.workbooks`, `musi.routines`, `musi.gpAnnotations`, scalars `musi.gpAutoFollow`, `musi.gpParchmentZoom` |
| Attachment blobs | `js/attachments.js` | IndexedDB `musi-attachments` v1, store `files`, keyPath `id`; GP files, PDFs, images, video; 250 MB per-file cap enforced in `js/exercises.js` |
| Drum patterns | `js/drums/drumPatternDb.js` | IndexedDB `musi-drums` v1, store `patterns`, keyPath `id`; small JSON patterns |
| Change events | `window` dispatches | `musi:features-changed`, `musi:profile-changed` — no single write choke point; each model has its own private `persist()` |
| Settings host | `js/musicPreferences.js` | Renders `#sec-musicprefs`; Device sync copy: "no account needed" (`README.md` similarly promises persistence without accounts or cloud sync) |

**Known gaps:** (1) **No delete propagation** — `applySnapshot` in `merge` mode never removes records missing from the incoming snapshot; cloud sync needs tombstones. (2) **No incremental/delta concept** — `buildSnapshot` is always full; cloud sync needs a rev-based pull cursor. **Timestamp coverage is uneven:** notes, songs, routines, workbooks, and GP annotations carry ISO `updatedAt`; exercises carry only `addedAt`; attachments only `createdAt`; `profile.music` and `study.progress` use epoch-ms.

## Design decisions

### D1 — Supabase scope (data plane only)

| Option | Pros | Cons |
| ------ | ---- | ---- |
| **Supabase Auth + Postgres + Storage + Realtime only** | PWA stays static; no SSR or hosting coupling; RLS is the security boundary | Two deployment surfaces (static host + Supabase project) |
| Supabase Hosting / Edge SSR for the app | Single vendor dashboard | Breaks zero-build static model; cache and routing complexity |
| Self-hosted Postgres + custom auth | Full control | Reimplements Auth, Storage, Realtime; out of scope |

**Decision:** Supabase provides Auth, Postgres, Storage, and Realtime **only**. It does not host, build, or deploy the PWA. Exactly **one** Edge Function (`account`, service-role) handles account deletion and a data-export bundle; everything else is client → PostgREST / Storage under Row Level Security.

### D2 — Auth and sync are optional

| Option | Pros | Cons |
| ------ | ---- | ---- |
| **Empty config = zero cloud surface** | Offline-first guarantee; no surprise network calls | Operators must set env/config on the static host |
| Always show Account UI with "offline" state | Discoverability | Misleading when cloud is intentionally disabled |
| Require sign-in for new installs | Simpler sync story | Violates product promise; blocks anonymous use |

**Decision:** When `js/cloud/cloudConfig.js` has empty values, Account/Cloud-sync UI is not rendered, no client is constructed, and no network request is made. Signing out never deletes local data by default. QR/ZIP device sync stays as a peer alternative.

### D3 — Client library delivery

| Option | Pros | Cons |
| ------ | ---- | ---- |
| **Vendored pinned `@supabase/supabase-js` v2 ESM** at `js/vendor/supabase-js.esm.js` | Offline PWA guarantee; no third-party origin on critical path; precached by service worker | Manual bump via `scripts/vendor-supabase.mjs` |
| CDN import at runtime | Easy updates | Breaks offline; adds third-party dependency |
| Hand-rolled GoTrue + PostgREST client | Zero vendor JS | Realtime Phoenix protocol, PKCE, token-refresh edge cases not worth reimplementing |

**Decision:** Vendor a pinned ESM bundle, committed to the repo, fetched by `scripts/vendor-supabase.mjs`. All third-party imports isolated behind `js/cloud/client.js`.

### D4 — One generic sync table vs per-domain relational tables

| Option | Pros | Cons |
| ------ | ---- | ---- |
| **Single `sync_records` table** (`domain`, `record_id`, `payload jsonb`, tombstones, `rev`) | Matches dozen loosely-typed JSON domains; one RLS policy set; client only queries "since rev N" | No SQL queries inside payload; large jsonb rows |
| Per-domain tables (`notes`, `exercises`, …) | Normalised schema | Constant migrations; dozen RLS sets; zero query benefit for this client |

**Decision:** `public.sync_records(user_id, domain, record_id, payload jsonb, deleted, updated_at, device_id, content_hash, rev bigserial)` with PK `(user_id, domain, record_id)` and monotonic global `rev` as pull cursor.

### D5 — Change detection without a big refactor

| Option | Pros | Cons |
| ------ | ---- | ---- |
| **Event hint + shadow diff in `musi-sync` IDB** | One line per existing `persist()`; models stay unchanged | Shadow store must stay consistent; periodic reconcile is safety net |
| Central data store routing all writes | Single choke point | Large refactor across every model |
| Polling-only (no events) | Simple | Slow; wasteful on large libraries |

**Decision:** Add `js/dataEvents.js` with `emitDataChanged(domainHint)` / `onDataChanged(fn)` dispatching `musi:data-changed` from each model `persist()`. A debounced reconciler rebuilds records from `buildSnapshot()` + drum patterns + attachment metadata and diffs against a shadow copy in new IndexedDB `musi-sync` v1. Events are hints; focus/interval reconcile is the safety net.

### D6 — Conflict resolution

| Domain type | Strategy |
| ----------- | -------- |
| Records with `updatedAt` (notes, songs, routines, workbooks, GP annotations) | Per-record LWW on `updatedAt`, `device_id` tiebreak |
| Records with only `addedAt` (exercises) | LWW on shadow-recorded local change time, `device_id` tiebreak |
| Counter-like (`stats`, `io.masteryV2`, `io.mastery`, `study.progress`) | Field-wise merge (max / sum per bucket) — practice minutes never lost |
| Device-local keys | Excluded entirely (`nav.lastTool`, `nav.lastCategory`, `subview.*`, `sync.*`, `cloud.*`, mic calibration, `musi.bootSplash.done`, in-flight timer) |

**Decision:** LWW + counter merge as above; device-local keys never uploaded. See `docs/supabase-sync-client.md` for mapping detail.

### D7 — Deletes need tombstones

| Option | Pros | Cons |
| ------ | ---- | ---- |
| **Tombstone rows** (`deleted = true`) | Propagates deletes; reconciler infers local delete when shadow has record but local does not | Tombstone storage; retention policy needed |
| Full snapshot replace on each sync | No tombstones | Destructive; loses merge semantics |
| Additive-only (today's merge) | Simple | Deletes never propagate — unacceptable for cloud sync |

**Decision:** Deleted records become tombstone rows; remote tombstones remove local records; reconciler infers delete when record is in shadow but absent locally. Tombstones purged server-side after 90 days via `pg_cron`.

### D8 — Realtime fan-out mechanism

| Option | Pros | Cons |
| ------ | ---- | ---- |
| **Realtime Broadcast from Database** (`realtime.broadcast_changes` in AFTER trigger, topic `sync:{user_id}`) | Scales; RLS on `realtime.messages`; Supabase's own guidance | Trigger + policy setup |
| Postgres Changes on `sync_records` | Built-in table subscription | RLS re-evaluated per connected client; does not scale |
| Polling only | No WebSocket dependency | Higher latency; more REST traffic |

**Decision:** Broadcast on `sync:{user_id}`, authorised by RLS on `realtime.messages`. Clients suppress echoes of their own `device_id`. Realtime is an accelerator, never a requirement — pull on focus / `online` / low-frequency interval (e.g. 5 min) delivers the same result.

### D9 — Auth flow

| Option | Pros | Cons |
| ------ | ---- | ---- |
| **6-digit OTP (primary)** | Reliable in installed standalone PWA; no fragile deep links | User must copy code from email |
| Magic link (secondary) | Familiar | Deep links back into installed PWA are unreliable |
| Password / OAuth | Broad provider support | Out of scope for v1; more UI and policy surface |

**Decision:** Passwordless email. OTP is primary; magic link secondary. `flowType: 'pkce'`, `detectSessionInUrl: false` with explicit code exchange so Musi's `#sec-*` hash routing is never clobbered by auth fragments. Session in `localStorage` under `musi.auth`. Production needs custom SMTP — Supabase built-in sender is rate-limited.

### D10 — Service worker bypass

| Current behaviour | Risk |
| ----------------- | ---- |
| Cross-origin GET: stale-while-revalidate | Supabase REST/Storage responses cached stale |
| Same-origin non-shell GET: cache-first | Auth responses could be cached incorrectly |

**Decision:** Service worker must bypass the Supabase origin entirely. Precache new `js/cloud/*` modules and the vendored bundle. Bump `CACHE_VERSION` in `service-worker.js`.

### D11 — Supabase Dashboard + connected GitHub repository

**Decision:** One production Supabase project. Project creation, Auth/API settings, and the GitHub connection are managed in the Supabase Dashboard. The connected repository (working directory `.`, **Deploy to production** on push to `main`, automatic branching off) is the source of truth for versioned database, function, and storage artifacts: on each push to `main` the integration deploys migrations, Edge Functions declared in `config.toml`, and Storage buckets declared in `config.toml`. The integration ignores `[auth]` and `[api]` blocks in `config.toml` by default — production Auth and API values live in the Dashboard, not in committed config. Declarative `supabase/schemas/` diffed into migrations remains the source of truth for schema. Local `supabase start` / `supabase db reset` is the only pre-production rehearsal. Connecting the repository does not deploy the Musi PWA — the integration reads only the `supabase/` working directory.

## Goals & non-goals

**Goals**
- Optional passwordless email account (OTP primary) with session restore and sign-out that preserves local data.
- Background JSON record sync: push local changes, pull remote changes since last `rev`, LWW + counter merge + tombstones.
- First-login merge choice on a fresh device: Merge / Keep cloud / Keep this device.
- Realtime broadcast as an accelerator with polling/focus fallback.
- Opt-in per-device attachment blob sync to Supabase Storage with lazy download and CRC32 dedupe.
- Device list UI showing registered installs.
- Per-user quotas, tombstone retention, conflict/status surfacing, export + account deletion via Edge Function.
- App fully functional with zero Supabase config; existing QR/ZIP device sync unchanged.
- Versioned Supabase configuration for one production project (Dashboard + GitHub integration).

**Non-goals**
- Hosting or deploying the PWA on Supabase (no Supabase Hosting, no SSR, no serving app pages from Edge Functions except the single `account` function).
- Any CLI sync surface — `cli/` stays fully local.
- Realtime collaborative editing (two users editing the same record simultaneously).
- Sharing, social features, or public exercise packs.
- Server-side audio or score processing.
- Per-domain relational schema in Postgres.
- Syncing device-local preferences (`nav.lastTool`, `nav.lastCategory`, `subview.*`, `cloud.*`, mic calibration).
- Passwords, OAuth providers, or anonymous sign-in in v1.
- Syncing microphone recordings by default (blobs are opt-in per device; recordings are a human decision in Open questions).
- Client-side end-to-end encryption in v1 (payload is plain JSON in Postgres; see Security & privacy).

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Local stores                                                            │
│  localStorage: musi:settings, musi.notes, musi.songs, musi.exercises,    │
│                musi.workbooks, musi.routines, musi.gpAnnotations, scalars │
│  IndexedDB: musi-attachments (files), musi-drums (patterns)              │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │
                                   ▼
        buildSnapshot + drum patterns + attachmentsMeta (metadata until Phase 5)
                                   │
                                   ▼
        recordMap.toRecords → (domain, record_id, payload, content_hash)
                                   │
                                   ▼
        reconcile.js ◄──► shadowStore.js (musi-sync IDB v1)
                 │                   │
                 │ tombstones        │
                 ▼                   ▼
        transport.js → PostgREST → public.sync_records (RLS)
                 │
                 │ AFTER trigger
                 ▼
        realtime.broadcast_changes → topic sync:{user_id}
                 │
                 ▼
        realtimeLink.js → cloudSync.js pull/apply on peer devices

        Phase 5 (opt-in): blobSync.js → Supabase Storage (attachment bytes)
```

**New / extended modules:**

| Module | Role |
| ------ | ---- |
| `js/cloud/cloudConfig.js` | Resolves URL, publishable key, `enabled`; optional `cloud-config.json` |
| `js/vendor/supabase-js.esm.js` | Pinned `@supabase/supabase-js` v2 ESM bundle (offline PWA) |
| `js/cloud/client.js` | Sole importer of vendored bundle; constructs `createClient` when enabled |
| `js/cloud/auth.js` | OTP / PKCE session lifecycle, `musi.auth`, device registration |
| `js/cloud/recordMap.js` | `toRecords` / `fromRecords` between snapshot shape and `sync_records` rows |
| `js/cloud/shadowStore.js` | IndexedDB `musi-sync` v1 (`meta`, `shadow`, `tombstones`, `blobQueue`) |
| `js/cloud/reconcile.js` | Local diff vs shadow, tombstone inference, mass-delete guard, merge helpers |
| `js/cloud/transport.js` | REST push/pull against `sync_records`, `sync_bounds`, batching, retries |
| `js/cloud/blobSync.js` | Opt-in attachment upload/download, CRC32 dedupe, `blobQueue` drain |
| `js/cloud/realtimeLink.js` | Private channel `sync:{userId}`, broadcast coalescing, echo suppression |
| `js/cloud/cloudSync.js` | Orchestrator and public API (`initCloudSync`, `getSyncStatus`, reconcile trigger) |
| `js/cloud/cloudUI.js` | Renders `#mp-cloud-block`, wires auth, sync controls, device list |
| `css/cloud.css` | Account / sync UI on Atomic Purple GBC theme |
| `js/dataEvents.js` | `emitDataChanged(domainHint)` / `onDataChanged(fn)` → `musi:data-changed` |
| `scripts/vendor-supabase.mjs` | Dev script: fetch pinned supabase-js, write bundle + version sidecar |

Full client algorithm, auth flow, UI spec, and test plan: [`docs/supabase-sync-client.md`](supabase-sync-client.md).

SQL DDL, RLS, Realtime trigger, Storage policies, `config.toml`, and GitHub integration: [`docs/supabase-sync-schema.md`](supabase-sync-schema.md).

## Data flow in one screenful

### Edit on device A → appears on device B

1. User edits a note in `js/notes.js`; `persist()` writes `musi.notes` to `localStorage`.
2. `persist()` calls `emitDataChanged('notes')` → `window` dispatches `musi:data-changed`.
3. Debounced reconciler (≈500 ms) runs in `js/cloud/cloudSync.js` → `reconcile.js`.
4. Reconciler calls `buildSnapshot()` for relevant scopes, `recordMap.toRecords()`, loads shadow from `shadowStore.js`.
5. Diff: note record changed → upsert payload; shadow updated locally.
6. `transport.js` push batch to PostgREST: `sync_records` upsert with `device_id`, `content_hash`, `updated_at`.
7. Postgres AFTER trigger calls `realtime.broadcast_changes` on topic `sync:{user_id}`.
8. Device B (signed in, `realtimeLink.js` connected) receives broadcast; ignores if `device_id` matches self.
9. Device B pulls rows with `rev > local_cursor` via `transport.js` (or applies broadcast hint).
10. Device B applies remote row via `cloudSync.js`: LWW merge into `musi.notes`; tombstone removes local record if `deleted`.
11. Model `persist()` on B updates shadow; dispatches `musi:profile-changed` / `musi:features-changed` as needed.
12. UI on B refreshes from existing event listeners.

### Cold sign-in on a fresh device

1. User opens Settings → Account; enters email; receives 6-digit OTP (Inbucket locally, custom SMTP in production).
2. `auth.js` verifies OTP with PKCE; session stored under `musi.auth`; `client.js` attaches session to Supabase client.
3. Device registers in `sync_devices` via `auth.js` (`device_id`, label, `last_seen`) — no data movement yet in Phase 2.
4. Phase 3: first sync offers Merge / Keep cloud / Keep this device.
5. **Keep cloud:** pull all rows; apply with `replace` semantics for content scopes; local library overwritten.
6. **Keep this device:** push local snapshot as upserts; cloud becomes mirror of this device.
7. **Merge:** pull + apply with LWW/tombstone/counter rules against existing local data.
8. Shadow IDB initialised from resulting local state; `rev` cursor set to max remote `rev`.
9. Realtime subscribes to `sync:{user_id}`; periodic pull scheduled.

## What syncs and what does not

### Synced domains

| Domain | Local source | Record id |
| ------ | ------------ | --------- |
| `settings` | `musi:settings` remainder (minus extracted subkeys) | `settings:bag`, `settings:global.volume`, `settings:context.*`, … |
| `settings` | `features.enabled` | `settings:features.enabled` |
| `settings` | `profile.music` | `settings:profile.music`. `profile.music` is now inert data; sync carries it as an opaque key. |
| `settings` | `musi.gpAutoFollow` | `settings:musi.gpAutoFollow` |
| `settings` | `musi.gpParchmentZoom` | `settings:musi.gpParchmentZoom` |
| `progress` | `stats` | `progress:stats` |
| `progress` | `study.progress` | `progress:study.progress` |
| `progress` | `io.sessionHistory` | `progress:io.sessionHistory` |
| `progress` | `io.mastery` | `progress:io.mastery` |
| `progress` | `io.masteryV2` | `progress:io.masteryV2` |
| `notes` | `musi.notes[]` | note id (`note-*`) |
| `songs` | `musi.songs[]` | song id (`song-*`) |
| `exercises` | `musi.exercises.items[]` | exercise id (`ex-*`) |
| `exerciseCategories` | `musi.exercises.categories[]` | category id (`cat-*`); payload includes `parentId` |
| `workbooks` | `musi.workbooks.workbooks[]` | workbook id (`wb-*`) |
| `workbookFolders` | `musi.workbooks.folders[]` | folder id (`wbf-*`); payload includes `parentId` |
| `routines` | `musi.routines.routines[]` | routine id (`rt-*`) |
| `gpAnnotations` | `musi.gpAnnotations.byScore[scoreKey]` | `gpAnnotations:{scoreKey}` |
| `drumPatterns` | `musi-drums` IDB `patterns` store | pattern id (`usr-*`; builtins excluded) |
| `attachmentsMeta` | `musi-attachments` IDB `files` store | attachment id (`att-*`; metadata only) |

Workbook `entries[]` and routine `sessions[]` are nested inside their parent `workbooks` / `routines` rows — not separate sync domains.

### Device-local exclusions

| Key / field | Why local |
| ----------- | --------- |
| `nav.lastTool`, `nav.lastCategory` | UI navigation state; meaningless on another device |
| `subview.*` | Sub-tab selection is per-device layout state |
| `sync.*` | Device sync UI state, export paths |
| `cloud.*` | Auth tokens, device id, blob-sync toggle, last cursor |
| `io.audioCalibrated`, `io.minRms` | Microphone calibration is hardware-specific |
| `musi.bootSplash.done` | Session splash flag |
| In-flight practice timer runtime | Ephemeral; not persisted intentionally |

`routines[].activeSessionId` is a debatable case: v1 syncs it inside the routine payload (each device may briefly show another device's in-progress session). `workbooks[].activeEntryId` is treated the same way — nested in the parent workbook row, not excluded from sync.

## Supabase configuration and deployment

```
supabase/
  config.toml              # buckets + functions (deployed by integration); auth/api local-only
  schemas/                 # declarative SQL (diffed to migrations)
    010_extensions.sql
    020_sync_tables.sql
    030_sync_functions.sql
    040_sync_indexes.sql
  migrations/              # generated / committed migration files
  tests/                   # pgTAP (RLS isolation, tombstone rules)
  functions/account/       # Edge Function: export + delete account
```

**Single-project model:** one production Supabase project created and configured in the Supabase Dashboard. Local development uses `supabase start` (API at `http://127.0.0.1:54321`, Inbucket for OTP emails). Automatic branching stays off in the dashboard because Musi is trunk-based and has no pull-request workflow.

**GitHub integration setup** (Dashboard → Project Settings → Integrations → GitHub):

1. Authorize GitHub and select this repository.
2. Set **Working directory** to `.`.
3. Enable **Deploy to production** on push/merge to `main`.
4. Leave **automatic branching** off.

On each push to `main` the integration deploys three things from `supabase/`: migrations, Edge Functions declared in `config.toml`, and Storage buckets declared in `config.toml`.

**Sharp edge:** the integration ignores `[auth]` and `[api]` blocks in `config.toml` by default. Production Auth and API settings must be configured in the Dashboard — edits to those blocks do not update production.

| Concern | Owner |
| ------- | ----- |
| Project creation, region, Auth, API, SMTP | Supabase Dashboard |
| Schema (`schemas/` + migrations) | Connected repository; applied by GitHub integration on push to `main` |
| Edge Functions and Storage buckets | Declared in `config.toml`; applied by GitHub integration |
| Local development | `config.toml` (`[auth]`, `[api]` local-only) + `supabase start` |
| Verification | Local `supabase db reset` and `supabase test db` before push |

The Dashboard is the source of truth for project, Auth, and API configuration. The connected repository is the source of truth for versioned database, function, and storage artifacts.

None of this deploys the PWA. The GitHub integration reads only the `supabase/` working directory; application code at the repo root is never built or deployed by Supabase. PWA deployment to the static host is unchanged and separate.

## Phased delivery

### Phase 0 — Supabase skeleton and local stack only

**Scope:** Zero app-code changes. Create and configure the single production Supabase project in the Dashboard, connect the GitHub repository, local stack layout, schema, RLS, Realtime trigger stub, and Storage bucket declarations.

- Supabase Dashboard: create/open the production project; configure Auth/API redirect URLs for the static PWA origin.
- Supabase Dashboard GitHub integration: authorize repo, working directory `.`, **Deploy to production** on, automatic branching off.
- `supabase/config.toml` with `[storage.buckets.attachments]` and `[functions.account]` (deployed by the integration) and local `[auth]` / `[api]` values for `supabase start`.
- Declarative `supabase/schemas/` → `supabase db diff` → `migrations/`.
- pgTAP tests proving cross-user reads and writes are denied on `sync_records`.

**Touch:** `supabase/`

**Exit criteria:** `supabase db reset` green locally; `supabase test db` passes RLS isolation tests; first successful GitHub integration deploy visible in the Supabase dashboard; no changes to `js/`, `index.html`, or `service-worker.js`.

### Phase 1 — Local sync plumbing (fully offline)

**Scope:** Change detection, shadow IDB, record mapping, tombstone inference, node tests. Nothing leaves the device; feature invisible to users.

- `js/dataEvents.js` + one-line `emitDataChanged(domainHint)` calls in each model `persist()`.
- `js/cloud/shadowStore.js` — `musi-sync` IndexedDB v1.
- `js/cloud/recordMap.js` — snapshot + drums + attachment metadata → rows.
- `js/cloud/reconcile.js` — debounced reconcile, shadow diff, tombstone inference (local only).
- `tests/cloud/` — node runners with `node:assert/strict`, localStorage shim, `installIdbShim()` from `tests/exercises/idbShim.mjs`, `tests/cloud/run.mjs` entry.

**Touch:** `js/dataEvents.js`, `js/cloud/shadowStore.js`, `js/cloud/recordMap.js`, `js/cloud/reconcile.js` (offline stubs), model `persist()` files, `tests/cloud/`

**Exit criteria:** `node tests/cloud/run.mjs` passes; editing a note produces a correct diff against shadow; inferred delete tombstone appears in shadow; app behaviour unchanged (no cloud config, no UI).

### Phase 2 — Auth only

**Scope:** Config flag, vendored client, Account block in Settings, OTP sign-in/out, session restore, device registration. No data movement.

- `js/cloud/cloudConfig.js`, `js/cloud/client.js`, `js/vendor/supabase-js.esm.js`, `scripts/vendor-supabase.mjs`.
- `js/cloud/auth.js` — OTP primary, magic link secondary, PKCE, `musi.auth` session, device registration in `sync_devices`.
- `js/cloud/cloudUI.js` + `css/cloud.css` in Settings (when config non-empty).
- `service-worker.js` — Supabase origin bypass, precache cloud modules, `CACHE_VERSION` bump.
- Local `config.toml` auth redirect URLs for `supabase start`; production Auth/API settings configured in the Dashboard.

**Touch:** `js/cloud/*`, `js/vendor/`, `scripts/vendor-supabase.mjs`, `css/cloud.css`, `js/musicPreferences.js`, `service-worker.js`, `supabase/config.toml`

**Exit criteria:** With local stack + config populated, user can sign in via OTP, session restores on reload, sign out clears session but not local library; with empty config, no Account UI and no network calls; existing Device sync block unchanged.

### Phase 3 — JSON record push/pull

**Scope:** LWW + tombstones + counter merge; first-login Merge / Keep cloud / Keep this device; pull cursor on `rev`.

- Wire `transport.js` and `cloudSync.js` to PostgREST upsert/select on `sync_records`.
- Apply remote rows via `applySnapshot(snapshot, { mode: 'merge' | 'replace' })` from `js/sync/syncProfile.js` where possible.
- First-login dialog for fresh device with local data or empty device with cloud data.
- Pre-merge safety: optional local ZIP snapshot via existing `syncBundle` before destructive merge.

**Touch:** `js/cloud/cloudSync.js`, `js/cloud/reconcile.js`, `js/cloud/transport.js`, `js/cloud/recordMap.js`, `js/cloud/cloudUI.js`, `supabase/schemas/` (if schema tweaks needed)

**Exit criteria:** Two browser profiles against local Supabase: edit on A appears on B after pull; delete on A removes on B; counter stats merge without loss; first-login choices behave as specified; offline edits queue and push on `online`.

### Phase 4 — Realtime fan-out and device list

**Scope:** Subscribe to `sync:{user_id}` broadcast; suppress own `device_id` echoes; device list UI.

- `realtimeLink.js` subscribes to `sync:{user_id}` broadcast; suppress own `device_id` echoes.
- Pull on focus / `online` / low-frequency interval as fallback when WebSocket blocked.
- Device list in `cloudUI.js` Account block: label, last seen, optional revoke (local sign-out on revoked device on next pull).

**Touch:** `js/cloud/realtimeLink.js`, `js/cloud/cloudSync.js`, `js/cloud/cloudUI.js`, `supabase/schemas/` (trigger + `realtime.messages` RLS)

**Exit criteria:** Edit on A appears on B within seconds via broadcast; disabling WebSocket still converges via polling; device list shows both test profiles; echo suppression verified.

### Phase 5 — Attachment blobs to Storage

**Scope:** Opt-in per device; lazy download on demand; CRC32 dedupe; metadata already synced in Phase 3.

- `js/cloud/blobSync.js` — upload/download with content-hash dedupe (mirrors `syncBundle` logic).
- Settings toggle: sync attachments on this device (default off).
- Download blob when user opens exercise needing missing attachment.

**Touch:** `js/cloud/blobSync.js`, `js/cloud/cloudUI.js`, `supabase/schemas/` (Storage policies), `supabase/config.toml` (bucket)

**Exit criteria:** Opt-in device uploads GP file; second device with opt-in receives blob on demand; CRC32 dedupe prevents duplicate Storage objects for same bytes; default-off device never uploads recordings.

### Phase 6 — Hardening

**Scope:** Per-user quotas, tombstone retention (`pg_cron` 90 days), conflict/status UI, export + account deletion Edge Function, README and Settings copy update.

- Row/byte quotas enforced server-side; client surfaces limit errors.
- Conflict indicator when LWW tiebreak or counter merge produces notable divergence.
- `supabase/functions/account/` — data export bundle + delete user (service-role).
- Update `README.md` and Device sync / Account copy (no longer "no account needed" as universal claim — cloud is optional).
- Production SMTP and Auth/API settings configured and verified in the Dashboard.

**Touch:** `supabase/functions/account/`, `supabase/schemas/`, `js/cloud/cloudUI.js`, `README.md`, `js/musicPreferences.js`

**Exit criteria:** Quota exceeded returns clear error; tombstones older than 90 days purged in test; export download matches ZIP semantics; account deletion removes `sync_records` and Storage objects; production Auth/API settings verified in the Dashboard; copy accurately describes optional cloud sync.

Every phase leaves `main` shippable. With empty `cloudConfig`, the app is fully usable and indistinguishable from pre-cloud Musi.

## Verification (no test framework)

Per `AGENTS.md`, there is no lint/test/build tooling for the web app. Verification combines node runners, pgTAP, local stack rehearsal, and manual browser exercise.

Before pushing to `main`, run `supabase db reset` and `supabase test db` locally. After the GitHub integration deploys to production, smoke-check migrations, the `account` Edge Function, and Storage buckets in the Supabase dashboard.

### Node runners (`tests/cloud/`)

Follow existing conventions under `tests/exercises/` and `tests/workbooks/`:

- `node:assert/strict` assertions.
- `localStorage` shim for Node.
- `installIdbShim()` from `tests/exercises/idbShim.mjs` for `musi-sync` and attachment metadata tests.
- Entry point: `node tests/cloud/run.mjs`.
- Output: `ok …` lines and a final pass count.

**Phase 1+ cases:** record mapping from fixture snapshot; shadow diff on edit; tombstone inference on delete; counter merge for `progress:stats`; device-local key exclusion; LWW tiebreak with `device_id`.

### pgTAP (`supabase test db`)

See [`docs/supabase-sync-schema.md`](supabase-sync-schema.md) for example test SQL under `supabase/tests/`.

- User A cannot read/write User B's `sync_records`.
- `anon` gets zero rows on `sync_records`.
- Payload cap raises `sync_payload_too_large`.
- Tombstone purge respects the 90-day retention window.
- `broadcast_sync_record_change` function exists.
- `purge_my_sync_data` scoped to caller only.
- User A cannot read User B's Storage objects in `attachments` bucket.
- `rev` monotonicity on insert/update.

### Manual two-browser-profile test (local stack)

1. `supabase start` — API `http://127.0.0.1:54321`, Inbucket for OTP.
2. Serve PWA: `python3 -m http.server 8080`.
3. Populate `js/cloud/cloudConfig.js` (or inject via local-only config) with local anon key and URL.
4. Profile A: sign in, create note + exercise, delete a song.
5. Profile B: sign in same account, verify merge choice, confirm note/exercise appear and song absent.
6. Profile A: edit routine; confirm Profile B receives via Realtime or within poll interval.

### Production integration smoke check

After a push to `main`, confirm in the Supabase dashboard that the integration deploy succeeded and that migrations, the `account` function, and the `attachments` bucket are present in production.

### Offline / airplane-mode test

1. Sign in; make edits offline.
2. Confirm local UI works; shadow records pending push.
3. Go `online`; confirm push and pull complete without duplicate rows.

### Service worker

- Hard-reload after JS/CSS edits; bump `CACHE_VERSION` when adding cloud modules.
- Confirm Supabase REST GETs are **not** served from service worker cache (network tab shows bypass).
- Confirm vendored `supabase-js.esm.js` loads from precache when offline (auth session restore only — sync will fail without network, but app must not white-screen).

### Feature-off regression

- Empty `cloudConfig`: no Account block, no requests to Supabase origin, Device sync block still works (ZIP export/import, QR).

## Security & privacy

- **Publishable anon key is public by design.** Row Level Security on `sync_records`, Storage policies, and `realtime.messages` are the only data boundaries. Never embed the service-role key in the client.
- **Single privileged surface:** the `account` Edge Function (service-role) for export bundle generation and account deletion. All other operations are client → PostgREST / Storage under user JWT.
- **Payload caps:** per-record JSON size limit server-side; per-user row count and total byte quotas (Phase 6).
- **Blobs opt-in:** microphone recordings and large attachments are not uploaded unless the user enables attachment sync on that device (default off).
- **Auth rate limits:** Supabase Auth built-in limits; `additional_redirect_urls` scoped to real production origin(s) plus `localhost` for dev.
- **Export and delete-my-account** are first-class: Edge Function produces a ZIP aligned with `syncBundle` semantics; deletion cascades `sync_records`, Storage objects, and auth user.
- **Data at rest:** Postgres stores plain JSON payloads — no client-side E2E encryption in v1. This is a deliberate trade-off: implementation cost (key management, per-device keys, search/sync incompatibility) outweighs benefit for music practice metadata. Users who need E2E should use ZIP export to offline storage. Document in Account UI.

## Risks & mitigations

| Risk | Mitigation |
| ---- | ---------- |
| Stale Supabase responses via service worker | D10: origin bypass for Supabase host; never cache auth or REST responses |
| `localStorage` 5–10 MB ceiling vs large synced library | Monitor total snapshot size; server quotas; attachment blobs in Storage not `localStorage`; surface clear errors on `QuotaExceededError` |
| 250 MB blobs and Storage egress cost | Opt-in per device; lazy download; CRC32 dedupe; per-user Storage quota (Open questions) |
| Clock skew breaking LWW | Prefer server `updated_at` on push; `device_id` tiebreak; counter domains use merge not LWW |
| Sync loop / echo storms | Suppress own `device_id` on broadcast; debounced reconciler; content_hash skip when unchanged |
| Free-tier project pausing | Paid tier for production (configured in Dashboard) |
| OTP email deliverability without custom SMTP | Custom SMTP required for production (Open questions); Inbucket for local dev |
| Bad merge wiping user content | Pre-merge local ZIP via existing `syncBundle`; explicit Merge / Keep cloud / Keep this device choice |
| Partial-failure push batches | Batch with per-row error handling; retry queue in `musi-sync` IDB; cursor not advanced until ack |
| Integration silently ignores `[auth]` / `[api]` in `config.toml` | Dashboard is the owner; do not expect `[auth]` / `[api]` `config.toml` edits to update production |
| Schema drift between `schemas/` and live project | Declarative `schemas/` diffed to migrations; local `supabase db reset` + pgTAP before push; integration applies committed migrations on push to `main` |
| Realtime disconnect silent | Low-frequency poll + focus pull; status indicator in Account block |
| Tombstone accumulation | 90-day `pg_cron` purge; compaction after confirmed apply |
| Failed production migration | Local `supabase db reset` rehearsal before push; additive, backwards-compatible migrations; blast radius bounded because sync is optional and the offline-first PWA keeps working |

## Open questions

- **SMTP provider** for production OTP (Resend, Postmark, SendGrid, etc.) — needs human choice and DNS setup.
- **Sync audio recordings at all?** Phase 5 is opt-in blobs; default-off may be enough, or recordings could be excluded by `mediaKind` even when opt-in.
- **Per-user Storage quota** numeric limit (e.g. 500 MB vs 2 GB) — affects cost and mobile expectations.
- **Hosting origin(s)** for `additional_redirect_urls` and CORS — depends on where the static PWA is served.
- **Tombstone retention window** — 90 days proposed; confirm acceptable for "delete then restore from old device" edge case.

## Suggested implementation order

1. **Phase 0** — Supabase skeleton and RLS proofs first; no app risk; establishes the contract other phases depend on.
2. **Phase 1** — Local shadow diff and record mapping; validates merge/tombstone logic in node tests before any network.
3. **Phase 2** — Auth and device registration; confirms PKCE + PWA hash routing + service worker bypass before data movement.
4. **Phase 3** — Push/pull JSON records; core user-visible sync value; depends on Phase 1 mapping and Phase 2 session.
5. **Phase 4** — Realtime and device list; latency improvement on top of working pull; not required for correctness.
6. **Phase 5** — Storage blobs; highest bandwidth/cost surface; opt-in gating limits exposure.
7. **Phase 6** — Quotas, export/delete, copy updates; production hardening after feature path proven locally and on production.
