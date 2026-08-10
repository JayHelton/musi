# Cloud Sync — Client Design

Optional Supabase-backed sync for Musi libraries across devices. This document
specifies the **browser client only**: modules, algorithms, UI, service worker
changes, and verification. Server schema, RLS, and infrastructure live in sibling
docs — do not duplicate them here.

**Master plan:** [`docs/supabase-sync-plan.md`](supabase-sync-plan.md)  
**Database / IaC reference:** [`docs/supabase-sync-schema.md`](supabase-sync-schema.md)

**The client stays static and zero-build.** All Supabase access is isolated
behind `js/cloud/`. When `cloudConfig` has no URL/key (or `enabled: false`),
none of that code loads and Musi behaves exactly as today.

---

## Module layout

| Module | Role | Depends on |
| ------ | ---- | ---------- |
| `js/cloud/cloudConfig.js` | Resolves `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `enabled`; optional `./cloud-config.json` fetch | — |
| `js/vendor/supabase-js.esm.js` | Pinned `@supabase/supabase-js` v2 ESM bundle (offline PWA) | — |
| `js/cloud/client.js` | Sole importer of vendored bundle; constructs `createClient` when enabled | `cloudConfig`, vendor bundle |
| `js/cloud/auth.js` | OTP / PKCE session lifecycle, `storageKey: 'musi.auth'`, device registration | `client` |
| `js/cloud/recordMap.js` | `toRecords` / `fromRecords` between `buildSnapshot` shape and `sync_records` rows | `syncProfile` |
| `js/cloud/shadowStore.js` | IndexedDB `musi-sync` v1 (`meta`, `shadow`, `tombstones`, `blobQueue`) | — |
| `js/cloud/reconcile.js` | Local diff vs shadow, tombstone inference, mass-delete guard, merge helpers | `recordMap`, `shadowStore`, `syncProfile` |
| `js/cloud/transport.js` | REST push/pull against `sync_records`, `sync_bounds`, batching, retries | `client`, `recordMap` |
| `js/cloud/blobSync.js` | Opt-in attachment upload/download, CRC32 dedupe, `blobQueue` drain | `client`, `attachments`; `crc32Blob` / `crc32Hex` from `js/sync/crc32.js` (must be extracted from `syncBundle.js` first) |
| `js/cloud/realtimeLink.js` | Private channel `sync:{userId}`, broadcast coalescing, echo suppression | `client`, `transport` |
| `js/cloud/cloudSync.js` | Orchestrator + public API (`initCloudSync`, `getSyncStatus`, trigger reconcile) | all `js/cloud/*` above |
| `js/cloud/cloudUI.js` | Renders `#mp-cloud-block`, wires auth + sync controls | `cloudSync`, `auth`, `css/cloud.css` |
| `css/cloud.css` | Account / sync UI on Atomic Purple GBC theme | `css/base.css`, `css/theme-gbc.css`, `css/sync.css` |
| `js/dataEvents.js` | `emitDataChanged(domainHint)` / `onDataChanged(fn)` → `musi:data-changed` | — (must not import `js/cloud/`) |
| `scripts/vendor-supabase.mjs` | Dev script: fetch pinned supabase-js, write bundle + version sidecar | Node only |

### Touched existing files

| File | Edit |
| ---- | ---- |
| `js/persistence.js` | One-line `emitDataChanged('settings')` in `writeSettings` |
| `js/notes.js` | `emitDataChanged('notes')` in persist path |
| `js/songwriter.js` | `emitDataChanged('songs')` in persist path |
| `js/exercises.js` | `emitDataChanged('exercises')` in persist path |
| `js/workbookModel.js` | `emitDataChanged('workbooks')` in persist path; **add** `invalidateWorkbooksCache` and wire it into `invalidateModuleCaches` in `syncProfile.js` (see Risks) |
| `js/sync/syncProfile.js` | Export `invalidateModuleCaches` if cloud code must invalidate caches outside `applySnapshot` |
| `js/sync/syncBundle.js` or `js/sync/crc32.js` | Export `crc32Blob` / `crc32Hex` — prefer extracting a shared `js/sync/crc32.js` used by `syncBundle.js` and `blobSync.js` |
| `js/routineModel.js` | `emitDataChanged('routines')` in `persist` |
| `js/gpAnnotations.js` | `emitDataChanged('gpAnnotations')` in persist path |
| `js/drums/drumPatternDb.js` | `emitDataChanged('drumPatterns')` after `savePattern` / `deletePattern` |
| `js/attachments.js` | `emitDataChanged('attachmentsMeta')` after metadata writes (not every blob read) |
| `js/gpPlayer/playerState.js` | `emitDataChanged('settings')` when GP scalars persist |
| `js/musicPreferences.js` | Mount `#mp-cloud-block` adjacent to `#mp-sync-block`; call `paintCloudSync()` when config enabled |
| `js/main.js` | Dynamic `import('./cloud/cloudSync.js')` only when `cloudConfig.enabled` |
| `service-worker.js` | Supabase origin bypass; precache cloud modules; bump `CACHE_VERSION` |
| `README.md` | Optional cloud sync section for self-hosters |
| `.gitignore` | `cloud-config.json` |

**Dependency rule:** nothing outside `js/cloud/` may import `js/vendor/supabase-js.esm.js`.
`js/dataEvents.js` must not import anything from `js/cloud/`.

---

## Configuration and the off switch

`js/cloud/cloudConfig.js` is evaluated once at module load. It exports a frozen
config object and an `isCloudEnabled()` guard used by every cloud module.

```js
// js/cloud/cloudConfig.js — illustrative sketch
const DEFAULTS = {
  SUPABASE_URL: '',           // e.g. 'https://xxxx.supabase.co'
  SUPABASE_PUBLISHABLE_KEY: '', // anon / publishable key
  enabled: false,
};

let resolved = { ...DEFAULTS };

/** Optional runtime override for forks (gitignored). */
export async function loadCloudConfig() {
  try {
    const res = await fetch('./cloud-config.json', { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      resolved = { ...DEFAULTS, ...json, enabled: !!json.SUPABASE_URL && !!json.SUPABASE_PUBLISHABLE_KEY };
    }
  } catch (_) { /* absent file is normal */ }
  return resolved;
}

export function getCloudConfig() { return resolved; }
export function isCloudEnabled() {
  return resolved.enabled === true
    && !!resolved.SUPABASE_URL
    && !!resolved.SUPABASE_PUBLISHABLE_KEY;
}
```

### Publishable key safety

The Supabase **publishable (anon) key** is designed for browser exposure. RLS on
`sync_records`, `sync_devices`, `sync_blobs`, and the private `attachments`
bucket ensures a user can only read/write their own rows. The key grants no
admin capability. Committing a project URL + publishable key in `cloudConfig.js`
is acceptable for the upstream Musi project; self-hosters replace both values.

### When configuration is empty

All of the following must be true when `isCloudEnabled()` is false:

| Requirement | Behaviour |
| ----------- | --------- |
| No Supabase client | `js/cloud/client.js` exports `getClient() → null`; no `createClient` call |
| No network fetch to Supabase | `transport.js`, `blobSync.js`, `realtimeLink.js` are never imported |
| No Account UI | `#mp-cloud-block` is not rendered; `paintCloudSync()` is a no-op |
| No `musi-sync` IDB | `shadowStore.js` `openDB()` is never called |
| No auth storage | No writes to `musi.auth` |
| App unchanged | Zero diff in runtime behaviour vs today's offline Musi |

`js/main.js` gates the dynamic import:

```js
// sketch — main.js boot
import { isCloudEnabled, loadCloudConfig } from './cloud/cloudConfig.js';

await loadCloudConfig();
if (isCloudEnabled()) {
  const { initCloudSync } = await import('./cloud/cloudSync.js');
  initCloudSync();
}
```

### Fork / self-host setup

1. Create a Supabase project per `docs/supabase-sync-schema.md`.
2. Add `cloud-config.json` at the repo root (gitignored):

```json
{
  "SUPABASE_URL": "https://YOUR_PROJECT.supabase.co",
  "SUPABASE_PUBLISHABLE_KEY": "eyJ...",
  "enabled": true
}
```

3. Serve Musi over HTTP (`python3 -m http.server 8080`) so the JSON override and
   ES modules load correctly.
4. Alternatively, edit the committed defaults in `cloudConfig.js` for a
   permanent fork.

---

## Record mapping

Cloud sync reuses `js/sync/syncProfile.js` as the **source of truth for what
syncs** (`SYNC_SCOPES`, `SETTINGS_SUBKEYS`, `PROGRESS_SUBKEYS`,
`DIRECT_SCALAR_KEYS`, `CONTENT_KEYS`). `recordMap.js` translates between the
snapshot `data` bag and flat `sync_records` rows.

### Domain table

| Domain | Local source | Record id | Payload | Timestamp source |
| ------ | ------------ | --------- | ------- | ---------------- |
| `settings` | `musi:settings` remainder (see below) | `settings:bag` | JSON object: all keys in remainder not excluded | Max `updatedAt` among nested values, else shadow change time |
| `settings` | `features.enabled` | `settings:features.enabled` | string[] of tool ids | Incoming-wins scalar; no per-field timestamp — use shadow |
| `settings` | `profile.music` | `settings:profile.music` | full profile object | `profile.music.updatedAt` (epoch ms) |
| `settings` | `musi.gpAutoFollow` | `settings:musi.gpAutoFollow` | string `"true"` / `"false"` | Incoming-wins; shadow time |
| `settings` | `musi.gpParchmentZoom` | `settings:musi.gpParchmentZoom` | string number | Incoming-wins; shadow time |
| `settings` | `global.volume`, `context.*` | `settings:global.volume`, `settings:context.root`, … | scalar JSON values from remainder | Shadow change time |
| `progress` | `stats` | `progress:stats` | stats object | `stats.lastActivityTs` or per-day bucket max |
| `progress` | `study.progress` | `progress:study.progress` | study progress object | Newest `concepts[*].lastReviewedAt` |
| `progress` | `io.sessionHistory` | `progress:io.sessionHistory` | array | Latest `at` field |
| `progress` | `io.mastery` | `progress:io.mastery` | per-key counters | Shadow change time (field-wise merge) |
| `progress` | `io.masteryV2` | `progress:io.masteryV2` | per-key counters | Shadow change time (field-wise merge) |
| `notes` | `musi.notes[]` | note id (`note-*`) | single note object | `updatedAt` ISO |
| `songs` | `musi.songs[]` | song id (`song-*`) | single song object | `updatedAt` ISO |
| `exercises` | `musi.exercises.items[]` | exercise id (`ex-*`) | single item (incl. `attachmentId`) | `addedAt` ISO |
| `exerciseCategories` | `musi.exercises.categories[]` | category id (`cat-*`) | single category | shadow time (no `updatedAt` on categories today) |
| `workbooks` | `musi.workbooks.workbooks[]` | workbook id (`wb-*`) | single workbook | `updatedAt` ISO |
| `workbookFolders` | `musi.workbooks.folders[]` | folder id (`wbf-*`) | single folder | shadow time |
| `routines` | `musi.routines.routines[]` | routine id (`rt-*`) | single routine | `updatedAt` ISO |
| `gpAnnotations` | `musi.gpAnnotations.byScore[scoreKey]` | `gpAnnotations:{scoreKey}` | `{ annotations: [...] }` | Max `updatedAt` among annotations in bucket |
| `drumPatterns` | `musi-drums` IDB `patterns` store | pattern id (`usr-*`; builtins excluded) | full pattern JSON | `updatedAt` ISO |
| `attachmentsMeta` | `musi-attachments` IDB `files` store | attachment id (`att-*`) | metadata only (`metaOf` shape, no Blob) | `createdAt` ISO |

**Excluded from `settings:bag`:** keys in `EXTRACTED_SUBKEYS`
(`features.enabled`, `profile.music`, all `PROGRESS_SUBKEYS`) plus every key
listed in [What does not sync](#what-does-not-sync).

**`musi.exercises` split:** one localStorage JSON becomes two domains —
`exerciseCategories` and `exercises` — so category and item rows LWW
independently. `fromRecords` must reassemble `{ categories, items, seededAt? }`
identically to `mergeExercises` in `syncProfile.js`.

**`musi.gpAnnotations` split:** one row per `scoreKey` (from
`scoreKeyFromAttachmentId` / `resolveScoreKey`), not per annotation id. Each
payload holds `{ annotations: [...] }` for that score.

**`drumPatterns`:** only user patterns (`builtin: false`). Built-in patterns
from `js/drums/builtinPatterns.js` are re-derived locally.

### API sketch

```js
// js/cloud/recordMap.js — illustrative sketch

/**
 * @param {ReturnType<typeof buildSnapshot>} snapshot — full snapshot, all scopes
 * @returns {Array<{ domain, recordId, payload, updatedAt, contentHash }>}
 */
export function toRecords(snapshot) { /* … */ }

/**
 * @param {Array<{ domain, recordId, payload, deleted? }>} records
 * @returns {Object<string, string>} — keys match buildSnapshot `data` keys
 */
export function fromRecords(records) { /* … */ }

export function recordTimestamp(domain, recordId, payload) { /* … */ }

export function stableStringify(value) { /* sorted keys, deterministic */ }

export async function contentHash(payload) { /* see below */ }
```

### Worked example: routine record

Local `musi.routines`:

```json
{
  "routines": [{
    "id": "rt-m1abc2-xyz789",
    "name": "Morning warm-up",
    "description": "",
    "sessions": [{
      "id": "rs-m1def3-uvw456",
      "name": "Scales",
      "notes": "",
      "workbookIds": ["wb-1"],
      "durationMin": 15,
      "metronome": { "bpm": 80, "beats": 4, "subdiv": "eighth", "accentFirst": true },
      "completed": false
    }],
    "activeSessionId": "rs-m1def3-uvw456",
    "createdAt": "2026-08-01T10:00:00.000Z",
    "updatedAt": "2026-08-10T09:30:00.000Z"
  }]
}
```

Cloud row:

```json
{
  "domain": "routines",
  "record_id": "rt-m1abc2-xyz789",
  "payload": {
    "id": "rt-m1abc2-xyz789",
    "name": "Morning warm-up",
    "description": "",
    "sessions": [ "…" ],
    "activeSessionId": "rs-m1def3-uvw456",
    "createdAt": "2026-08-01T10:00:00.000Z",
    "updatedAt": "2026-08-10T09:30:00.000Z"
  },
  "updated_at": "2026-08-10T09:30:00.000Z",
  "content_hash": "a3f2…",
  "deleted": false
}
```

> **v1 note:** `activeSessionId` syncs with the routine row today because it is
> part of the stored object. Device-local practice cursor semantics are discussed
> in [What does not sync](#what-does-not-sync); a future revision may strip
> cursors before push.

### `contentHash`

1. `stableStringify(payload)` — recursive JSON with lexicographically sorted
   object keys, no whitespace variance.
2. Digest with **SHA-256** via `crypto.subtle.digest('SHA-256', …)` when
   available (secure contexts, most installed PWAs).
3. **Synchronous fallback** for non-secure `http://` dev servers: FNV-1a 64-bit
   or the exported `crc32` from `js/sync/zip.js` over the stable string,
   prefixed with `fnv1a:` or `crc32:` so algorithms never collide silently.

The hash is stored in shadow rows and sent as `content_hash` on push for server
dedupe and change detection without re-parsing payloads.

---

## What does not sync

| Key / field | Owner | Why device-local |
| ----------- | ----- | ---------------- |
| `nav.lastTool` | `main.js` | Last-opened tool is a UI convenience per device |
| `nav.lastCategory` | `main.js` | Dock category memory |
| `subview.*` (`subview.chords`, `subview.tuner`, `subview.intervalorbit`, `subview.triadsref`, `subview.recorder`, …) | various tools | Sub-tab selection is per-device layout state |
| `sync.scopes` | `musicPreferences.js` | Device sync export UI preference |
| `sync.advancedOpened` | `musicPreferences.js` | `<details>` open state for `#mp-sync-advanced` |
| `cloud.*` (new) | `cloudSync.js` | Auth tokens, device id, blob-sync toggle, last cursor — never uploaded as settings |
| `io.audioCalibrated` | `interval-map/ui.js` | Mic noise floor is hardware-specific |
| `io.minRms` | `interval-map/ui.js` | Mic sensitivity calibration |
| Audio tolerance / trainer mic opts | pitch trainers | Per-device microphone characteristics |
| `routines[].activeSessionId` | `routineModel.js` | **Debatable.** v1 **syncs** it inside the routine payload because `mergeRoutines` already merges whole routine objects and stripping cursors adds complexity. Each device may briefly show another device's in-progress session until the user starts practice locally. |
| `workbooks[].activeEntryId` | `workbookModel.js` | Active workbook entry cursor — device-local practice state |
| In-flight practice timer runtime | `practiceTimer.js` | Ephemeral; not persisted intentionally |
| `musi.bootSplash.done` | `bootSplash.js` | Session splash flag |
| `features.enabled` | `musicPreferences.js` | Listed in `SETTINGS_SUBKEYS` and synced today via QR/export. **v1 cloud sync includes it** (`settings:features.enabled`, incoming-wins) so toolbar layout matches across devices. Forks that want per-device layouts can revisit post-v1. |

---

## Shadow store (`musi-sync` IndexedDB v1)

Separate from `musi-attachments` and `musi-drums`. Opened only when
`isCloudEnabled()` and user has signed in at least once (Phase 1 may open it
offline for plumbing tests).

| Store | Key path | Fields | Purpose |
| ----- | -------- | ------ | ------- |
| `meta` | `id` (`'device'`, `'sync'`) | `deviceId`, `rev` (pull cursor), `lastPushAt`, `lastPullAt`, `schemaVersion` | Device identity + sync cursor |
| `shadow` | `[domain, recordId]` compound | `domain`, `recordId`, `contentHash`, `updatedAt`, `rev` | Last-known-synced state per record |
| `tombstones` | `[domain, recordId]` | `domain`, `recordId`, `deletedAt`, `pushed` (bool) | Local deletes awaiting push |
| `blobQueue` | `attachmentId` | `attachmentId`, `direction` (`upload`/`download`), `crc32`, `size`, `enqueuedAt` | Attachment byte work queue |

**Upgrade / versioning:** `schemaVersion` in `meta` (start at `1`). On mismatch,
keep local data intact, clear `shadow` + `tombstones` + `blobQueue`, reset
`rev` to `0`, and schedule a full pull (see below).

**Size estimate:** ~200 bytes per shadow row. A heavy user with 2 000 synced
records ≈ 400 KB — negligible next to attachment blobs.

**Shadow loss / corruption:** Never wipe `localStorage` or content IDBs. Rebuild
shadow by: (1) `buildSnapshot()` locally, (2) full pull from `rev = 0` or from
`sync_bounds().min_rev` if cursor is stale, (3) recompute shadow from merged
state. User data on disk is always authoritative until merge rules say otherwise.

---

## Sync algorithm

### State machine

| State | Entered by | Transitions |
| ----- | ---------- | ----------- |
| `idle` | boot, reconcile complete | → `reconciling` on `musi:data-changed`, timer, `online`, `visibilitychange` (visible) |
| `reconciling` | scheduler | → `pushing` if local ops; → `pulling` if remote pending; → `idle` if no work; → `paused` on mass-delete guard |
| `pushing` | local ops queued | → `pulling` after push ack; → `error` on hard failure; → `offline` if network lost |
| `pulling` | cursor behind / broadcast | → `idle` when applied; → `error`; → full-resync sub-state if cursor predates retention |
| `offline` | `navigator.onLine === false` | → `idle` on `online` |
| `paused` | mass-delete threshold, user conflict | → `reconciling` on user confirm / dismiss |
| `error` | auth expiry, RLS, quota | → `idle` on retry; → signed-out if session dead |

Only one reconcile runs at a time (mutex). Bursts of `musi:data-changed` debounce
to a single pass (≈ 500 ms trailing edge).

### `reconcileLocal()` — pseudocode

```js
async function reconcileLocal() {
  if (applyingRemote) return;
  setState('reconciling');

  const snapshot = buildSnapshot({ scopes: ['settings', 'progress', 'content'] });
  const localRecords = await toRecords(snapshot);
  const shadow = await shadowStore.getAllShadow();

  const upserts = [];
  const inferredTombstones = [];

  for (const rec of localRecords) {
    const key = [rec.domain, rec.recordId];
    const prev = shadow.get(key);
    const hash = await contentHash(rec.payload);
    if (!prev || prev.contentHash !== hash) {
      upserts.push({ ...rec, contentHash: hash });
    }
  }

  for (const [key, prev] of shadow) {
    if (prev.domain === 'attachmentsMeta') continue; // metadata diff handled above
    const stillLocal = localRecords.some(r => r.domain === prev.domain && r.recordId === prev.recordId);
    if (!stillLocal) inferredTombstones.push({ domain: prev.domain, recordId: prev.recordId });
  }

  // Mass-delete guard
  for (const domain of groupByDomain(inferredTombstones)) {
    const ratio = inferredTombstones.filter(t => t.domain === domain).length / shadow.count(domain);
    if (ratio > MASS_DELETE_THRESHOLD) { // e.g. 0.25
      setState('paused');
      showMassDeletePrompt(domain, inferredTombstones);
      return;
    }
  }

  await shadowStore.putTombstones(inferredTombstones);
  if (upserts.length || inferredTombstones.length) await push({ upserts, tombstones: inferredTombstones });
  await pull();
  setState('idle');
}
```

### `push(ops)` — pseudocode

```js
const PUSH_CHUNK = 50; // rows per POST batch — tune in open questions

async function push({ upserts, tombstones }) {
  setState('pushing');
  const deviceId = await shadowStore.getDeviceId();
  const rows = [
    ...upserts.map(r => ({ domain: r.domain, record_id: r.recordId, payload: r.payload, deleted: false, device_id: deviceId, content_hash: r.contentHash })),
    // payload is `not null` server-side, so tombstones send an empty object, not null.
    ...tombstones.map(t => ({ domain: t.domain, record_id: t.recordId, payload: {}, deleted: true, device_id: deviceId, content_hash: '' })),
  ];
  // `user_id` is never sent: the column defaults to auth.uid() and the RLS
  // `with check` clause rejects anything else. See the schema doc.

  for (const chunk of chunks(rows, PUSH_CHUNK)) {
    let attempt = 0;
    while (attempt < 5) {
      try {
        const { data, error } = await supabase
          .from('sync_records')
          .upsert(chunk, { onConflict: 'user_id,domain,record_id' })
          .select('domain, record_id, rev');
        if (error) throw error;
        // Upsert must return rev per row; correlate by (domain, record_id), not a single data.rev.
        const revByKey = new Map(data.map((r) => [`${r.domain}:${r.record_id}`, r.rev]));
        for (const row of chunk.filter((r) => !r.deleted)) {
          const rev = revByKey.get(`${row.domain}:${row.record_id}`);
          if (rev == null) continue; // row not acknowledged — retry later
          await shadowStore.putShadow(row.domain, row.record_id, { contentHash: row.content_hash, rev });
        }
        for (const row of chunk.filter(r => r.deleted)) {
          await shadowStore.deleteShadow(row.domain, row.record_id);
          await shadowStore.clearTombstone(row.domain, row.record_id);
        }
        break;
      } catch (e) {
        attempt += 1;
        await sleep(backoffMs(attempt) + jitter());
        if (attempt >= 5) { setState('error'); throw e; }
      }
    }
  }
  await shadowStore.setMeta({ lastPushAt: Date.now() });
}
```

Partial batch failure: retry only failed ids; never advance shadow for unconfirmed rows.

### `pull()` — pseudocode

```js
const PULL_PAGE = 100;

async function pull() {
  setState('pulling');
  let cursor = await shadowStore.getRev();
  const { data: boundsRows, error: boundsErr } = await supabase.rpc('sync_bounds');
  if (boundsErr) throw boundsErr;
  const bounds = boundsRows?.[0];
  if (!bounds) throw new Error('sync_bounds returned no row');
  // Client rule: local_cursor < min_rev → full resync; server may also set full_resync_required.
  if (bounds.full_resync_required || (cursor > 0 && cursor < bounds.min_rev)) {
    await shadowStore.clearShadow();
    cursor = 0; // full resync — server flag or cursor older than tombstone retention
  }

  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabase
      .from('sync_records')
      .select('domain, record_id, payload, deleted, updated_at, rev, device_id, content_hash')
      .gt('rev', cursor)
      .order('rev', { ascending: true })
      .limit(PULL_PAGE);
    if (error) throw error;
    if (!data.length) { hasMore = false; break; }

    await applyRemote(data.filter(r => r.device_id !== localDeviceId));
    cursor = data[data.length - 1].rev;
    await shadowStore.setRev(cursor); // atomic per page
    hasMore = data.length === PULL_PAGE;
  }
  await shadowStore.setMeta({ lastPullAt: Date.now() });
}
```

### `applyRemote(records)` — pseudocode

```js
let applyingRemote = false;

async function applyRemote(records) {
  applyingRemote = true;
  try {
    const byDomain = groupRecords(records);
    const dataBag = fromRecords(flatten(byDomain));
    // Reuse applySnapshot merge paths
    await applySnapshot({ ...snapshotEnvelope, data: dataBag }, { mode: 'merge' });
    // applySnapshot already invalidates in-memory module caches internally and dispatches events

    for (const row of records) {
      if (row.deleted) {
        await deleteLocalRecord(row.domain, row.record_id);
        await shadowStore.deleteShadow(row.domain, row.record_id);
      } else {
        await shadowStore.putShadow(row.domain, row.record_id, {
          contentHash: row.content_hash,
          updatedAt: row.updated_at,
          rev: row.rev,
        });
      }
    }
  } finally {
    applyingRemote = false;
  }
}
```

`deleteLocalRecord` must call existing model delete APIs (`deleteAudio`,
`deletePattern`, splice from localStorage collections, etc.) — not raw key surgery.

### Merge rules

| Domain / key | Strategy | Tiebreak |
| ------------ | -------- | -------- |
| `notes`, `songs`, `exercises`, `exerciseCategories`, `workbooks`, `workbookFolders`, `routines` | LWW per record | Higher `updatedAt` / `addedAt`; equal → higher `device_id` lexicographic |
| `gpAnnotations:{scoreKey}` | LWW per annotation id inside bucket | `mergeById` + max annotation `updatedAt` |
| `drumPatterns` | LWW per pattern | `updatedAt` ISO |
| `attachmentsMeta` | LWW metadata | `createdAt` (only field today) |
| `settings:bag` remainder keys | Shallow merge per key | Remote wins on scalar conflict when timestamps equal |
| `settings:features.enabled`, GP scalars | Incoming-wins (`INCOMING_WINS_KEYS`) | Newest shadow timestamp |
| `profile.music` | Shallow merge + `updatedAt` on object | Higher `profile.music.updatedAt` |
| `progress:stats` | Field-wise: per-day buckets max/sum; `bestStreak` max | N/A |
| `progress:io.mastery`, `progress:io.masteryV2` | Per-key max of `attempts` / `correct` | N/A |
| `progress:study.progress` | Per-concept newest `lastReviewedAt`; sum `completions` / `misses` | N/A |
| `progress:io.sessionHistory` | Concatenate + dedupe by `at` | N/A |
| Excluded keys (nav, subview, cloud, mic) | Local-only | Never uploaded |

### First sign-in on a device with existing data

When `shadowStore` is empty but localStorage/IDB have content, show a blocking
dialog before any push or destructive pull:

| Choice | Behaviour |
| ------ | --------- |
| **Merge** | Default. Pull cloud, apply with merge rules, then push local deltas. |
| **Keep cloud copy** | Replace local synced domains with cloud snapshot (`applySnapshot` with `{ mode: 'replace', scopes: [...] }`). |
| **Keep this device** | Push local state; cloud rows LWW-lose on conflict. |

**Mandatory safety step:** before **Keep cloud copy** or **Keep this device**,
invoke the existing `syncBundle` export path (`createBundleStream` from
`js/sync/syncBundle.js`) and download a ZIP to disk. Dialog copy must state this
explicitly. Implementation reuses the ZIP export wiring from `paintDeviceSync()` in
`musicPreferences.js` (local function today — factor a shared helper if both paths need it).

---

## Realtime link

Realtime is an **accelerator**. The periodic pull on `visibilitychange`, `online`,
and a low-frequency interval (e.g. 5 min) must converge to the same state if
broadcasts are missed.

```js
// js/cloud/realtimeLink.js — illustrative sketch
import { getClient } from './client.js';
import { pull } from './transport.js';

let pullTimer = null;

export async function subscribeSyncChannel(userId, accessToken, localDeviceId) {
  const supabase = getClient();
  await supabase.realtime.setAuth(accessToken);

  const channel = supabase.channel(`sync:${userId}`, {
    config: { private: true },
  });

  channel.on('broadcast', { event: 'sync' }, (msg) => {
    const { device_id, rev } = msg.payload;
    if (device_id === localDeviceId) return; // echo suppression
    schedulePull(rev);
  });

  await channel.subscribe();
  return channel;
}

function schedulePull(minRev) {
  clearTimeout(pullTimer);
  pullTimer = setTimeout(() => pull({ sinceRev: minRev - 1 }), 300); // coalesce bursts
}

// On TOKEN_REFRESHED:
// supabase.realtime.setAuth(session.access_token)
```

**Reconnect:** exponential backoff on `CHANNEL_ERROR` / disconnect; fall back to
interval pull while offline from Realtime.

**Broadcast payload** (from DB trigger per schema doc) carries `domain`,
`record_id`, `rev`, `deleted`, `device_id` — **not** `payload`. Client always
pulls for bodies.

---

## Attachment blobs

| Topic | Design |
| ----- | ------ |
| Default | Metadata (`attachmentsMeta`) syncs; bytes do not. |
| Opt-in | `#mp-cloud-blob-toggle` per device; stored in `cloud.blobSyncEnabled` local setting (not synced). |
| Upload path | Storage bucket `attachments` at `{user_id}/{attachment_id}` |
| Dedupe | `crc32 + size` against `sync_blobs`; `blobSync.js` must import `crc32Blob` / `crc32Hex` after they are exported from `js/sync/syncBundle.js` or, preferably, a shared `js/sync/crc32.js` extracted from `syncBundle.js` |
| App cap | 250 MB per file (existing `attachments.js` constraint) |
| Large uploads | Chunked/resumable via Storage multipart (TUS) in Phase 5; queue in `blobQueue` with retry |
| Lazy download | If `attachmentId` present but `hasFile(id)` false → UI shows **"Not on this device"** + **Fetch** |
| Surfaces | `js/exercises.js` list/viewer, `js/songwriter.js` recordings, GP import panels referencing `att-*` |
| Delete | Tombstone `attachmentsMeta` row; delete Storage object via Edge `account` function or Storage API |
| Mic recordings | `source: 'recording'` excluded from auto-upload; separate **"Sync recordings"** opt-in under advanced |

---

## Auth flow

### Primary: 6-digit OTP

1. User enters email in `#mp-cloud-email`.
2. `signInWithOtp({ email, options: { shouldCreateUser: true } })`.
3. UI → `code sent` state; user enters 6-digit code.
4. `verifyOtp({ email, token, type: 'email' })`.
5. Session stored under `storageKey: 'musi.auth'` in `localStorage`.
6. Register device in `sync_devices` (name, platform, `last_seen`).
7. `realtime.setAuth(access_token)` then subscribe; run first-login merge if needed; start reconcile.

### Magic link / PKCE (secondary)

```js
// auth.js sketch
const supabase = createClient(url, key, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: false, // Musi uses hash routes (#sec-*)
    storageKey: 'musi.auth',
    persistSession: true,
  },
});

// On redirect with ?code=…
await supabase.auth.exchangeCodeForSession(code);
history.replaceState(null, '', location.pathname + location.hash); // preserve #sec-*
```

**Hash-routing hazard:** Supabase default `detectSessionInUrl: true` clobbers
the hash. Explicit code exchange + `replaceState` keeps `#sec-musicprefs` intact.

### Session restore

On boot, `getSession()` → if valid, refresh device `last_seen`, `setAuth` on
realtime, subscribe, schedule pull.

### Token refresh

`onAuthStateChange` `TOKEN_REFRESHED` → `realtime.setAuth(newAccessToken)`.

### Sign-out

| Action | Effect |
| ------ | ------ |
| **Sign out** (default) | Clear `musi.auth`; unsubscribe channel; stop reconcile; **keep** all local library data |
| **Sign out and erase local data** | Above + clear synced domains from localStorage/IDB (with confirmation); clear `musi-sync` shadow |

### Auth errors

| Condition | User-facing message | Recovery |
| --------- | ------------------- | -------- |
| Rate limit | "Too many attempts. Wait a minute and try again." | Backoff timer on button |
| Expired code | "That code expired. Send a new one." | Return to email step |
| Offline | "You're offline. Connect to sign in." | Retry on `online` |
| Clock skew | "Device clock looks wrong. Check date & time settings." | Link to system settings |
| Blocked third-party storage | "Browser blocked saved login. Allow storage for this site." | Explain PWA install / site permissions |

---

## Settings UI

New section `#mp-cloud-block` — an `mp-block` sibling placed **immediately after**
`#mp-sync-block` in `js/musicPreferences.js` (before the Features block).

### Markup sketch

```html
<section class="mp-block" id="mp-cloud-block" hidden>
  <h3 class="mp-block-title">Cloud account</h3>
  <p class="mp-block-help">Sync your library across devices with a free account.</p>
  <div id="mp-cloud-root"><!-- cloudUI.js renders state --></div>
</section>
```

`paintCloudSync()` in `musicPreferences.js` mirrors `paintDeviceSync()`:
unhide block when `isCloudEnabled()`, delegate to `cloudUI.render(root)`.

### States

| State | Visible UI |
| ----- | ---------- |
| Config absent | Block not in DOM / stays `hidden` |
| Signed out | Email input, "Send code" btn sm primary |
| Code sent | Code input (6 digits), "Verify", "Resend" sync-btn-secondary |
| Signed in, idle | Email (read-only), device list, last-synced readout, "Sync now" |
| Syncing | Progress readout (`sync-estimate` pattern), spinner via existing sync CSS |
| Paused / offline | Banner ("Offline — changes saved locally"), resume when online |
| Error | `sync-qr-warning` style banner with retry |
| Conflict pending | Mass-delete or first-login merge dialog (reuse `sync-*` dialog patterns) |

### Controls

| Control | Details |
| ------- | ------- |
| Device list | Name, platform, last seen; **This device** badge; **Revoke** per other device |
| Attachment toggle | "Download exercise files on this device" → `cloud.blobSyncEnabled` |
| Recordings toggle | Nested under advanced; off by default |
| Last synced | `lastPullAt` / `lastPushAt` from shadow `meta`, formatted local time |
| Export account data | Calls Edge `account` export (Phase 6) |
| Delete account | Edge `account` delete + `purge_my_sync_data` RPC, with ZIP safety export |

### Theme constraints

- Reuse tokens: `--accent`, `--accent2`, `--card`, `--bg`, `--radius-screen`,
  `--radius-pill`, `--font-pixel`, `--font-body`, `--font-ui`.
- Reuse classes: `btn sm`, `btn sm primary`, `sync-btn-row`, `sync-hint`,
  `sync-estimate`, `sync-advanced` / `sync-advanced-summary`.
- **No** hard-coded `#0a0a0a`, pure black cards, or generic SaaS dashboard layout.
- New rules live in `css/cloud.css` only; do not fork `theme-gbc.css`.

### ASCII wireframe

```
┌─ Cloud account ────────────────────────────────────────┐
│ Sync your library across devices with a free account.  │
│                                                        │
│  you@example.com                    [ Sign out ]       │
│  Last synced: 2 min ago              ● Up to date      │
│                                                        │
│  Devices                                               │
│  ┌──────────────────────────────────────────────────┐  │
│  │ ● This Mac · Chrome    last seen now             │  │
│  │   Pixel 8 · installed  last seen 3h ago  [Revoke]│  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  [x] Download exercise files on this device            │
│  > Advanced                                            │
│                                                        │
│  [ Sync now ]  [ Export data ]  [ Delete account ]     │
└────────────────────────────────────────────────────────┘
```

---

## Service worker changes

Current `service-worker.js` behaviour that is hazardous for Supabase:

| Branch | Problem |
| ------ | ------- |
| Cross-origin stale-while-revalidate branch at the end of the `fetch` handler (after the same-origin branches) | Caches `*.supabase.co` REST reads; stale sync data |
| Same-origin cache-first branch (the `if (sameOrigin)` block before the cross-origin fallback) | Would cache `cloud-config.json` fetches if same-origin |

### Bypass (required)

Musi has no build step, so the worker cannot learn `cloudConfig.js` at install time.
**v1 approach:** match any `*.supabase.co` host, plus an explicit allowlist constant at
the top of `service-worker.js` for self-hosted Supabase origins. Self-hosters who edit
`cloudConfig.js` must add the same origin to that constant — a deliberate trade-off
(simple, static) over teaching the worker via `postMessage` from the page.

At the top of the `fetch` handler, before any `respondWith`:

```js
// service-worker.js — sketch (v1)
const EXTRA_SYNC_ORIGINS = [
  // 'https://supabase.example.com', // self-hosted — keep in sync with cloud-config / cloudConfig.js
];

function isSupabaseSyncRequest(url) {
  if (url.hostname.endsWith('.supabase.co')) return true;
  return EXTRA_SYNC_ORIGINS.includes(url.origin);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (isSupabaseSyncRequest(url)) return; // browser default network stack — no Musi caching

  // … existing navigate / app-shell / cache-first logic …
});
```

Early `return` (no `event.respondWith`) lets auth, REST, Storage, and Realtime
WebSocket traffic bypass the Musi cache entirely.

### Precache additions

Add to `PRECACHE_URLS`:

```
js/dataEvents.js
js/cloud/cloudConfig.js
js/cloud/client.js
js/cloud/auth.js
js/cloud/recordMap.js
js/cloud/shadowStore.js
js/cloud/reconcile.js
js/cloud/transport.js
js/cloud/blobSync.js
js/cloud/realtimeLink.js
js/cloud/cloudSync.js
js/cloud/cloudUI.js
js/vendor/supabase-js.esm.js
css/cloud.css
```

Bump `CACHE_VERSION` (e.g. `v167-cloud-sync`). Verification must include **hard
reload** after SW update — a stale worker can serve old client code without cloud
fixes.

---

## Failure modes and offline behaviour

| Condition | Behaviour | User-visible signal |
| --------- | --------- | ------------------- |
| Offline | Queue upserts/tombstones in shadow; retry on `online` | "Offline — saved on this device" |
| Expired session | Stop push/pull; prompt re-auth | "Session expired — sign in again" |
| RLS denial | Log; surface error state | "Could not sync — try signing out and in" |
| Quota exceeded (Supabase) | Pause push; show quota copy | "Cloud storage full" + link to export/delete |
| Payload too large | Skip row; log `record_id` | "Some items are too large to sync" |
| Cursor older than retention | Full resync per `sync_bounds()` | Brief "Updating library…" full pull |
| IndexedDB unavailable | Cloud sync disabled; local app works | "Sync needs site storage enabled" |
| localStorage full | `writeSettings` already swallows errors; surface when sync apply fails | "Device storage full" |
| Realtime blocked | Fall back to interval pull only | None (silent degradation) |
| Two devices edit same record | LWW + device tiebreak; last push wins | Optional conflict log in Phase 6 |
| Clock badly wrong | Skewed LWW ordering | "Check device date & time" if detected |

---

## Test plan (no test framework)

Layout under `tests/cloud/`:

```
tests/cloud/
  run.mjs              # entry: node tests/cloud/run.mjs
  recordMap.mjs
  contentHash.mjs
  shadowDiff.mjs
  mergeRules.mjs
  transportFake.mjs
  reconcile.mjs
```

### Harness conventions

Follow `tests/sync/profile.mjs` and `tests/exercises/idbShim.mjs`:

```js
// tests/cloud/run.mjs — sketch
import assert from 'node:assert/strict';
import { installIdbShim } from '../exercises/idbShim.mjs';

function installLocalStorageShim() { /* Map-backed — copy from profile.mjs */ }

installLocalStorageShim();
installIdbShim();
globalThis.window = globalThis;

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

// … import units, run tests …
console.log(`\n${passed} passed`);
```

### Pure-function checklist

- [ ] `toRecords` → `fromRecords` round-trip matches `buildSnapshot` keys
- [ ] `contentHash` stability across key order permutations
- [ ] Shadow diff emits correct upserts when payload changes
- [ ] Shadow diff emits tombstones when local record removed
- [ ] Mass-delete guard pauses when >25% of a domain vanishes
- [ ] LWW tiebreak: newer `updatedAt` wins; equal → lexicographic `device_id`
- [ ] Field-wise `stats` merge: `bestStreak` max, per-day sums
- [ ] `io.masteryV2` per-key max counters
- [ ] `study.progress` per-concept `lastReviewedAt` newest wins
- [ ] Exclusion list: `nav.*`, `subview.*`, `cloud.*` never appear in `toRecords`
- [ ] Cursor advance: `rev` monotonic; stale cursor triggers full-resync flag
- [ ] Echo suppression: broadcast from own `device_id` does not schedule pull

### Fake transport

In-memory `Map` keyed by `[userId, domain, recordId]` implementing upsert +
`rev` assignment. `transportFake.mjs` exposes `installFakeTransport(supabaseStub)`
so `push` / `pull` run without network. Node tests cover reconcile end-to-end.

### Manual browser matrix

1. `supabase start` local stack; `http://127.0.0.1:54321`; OTP from Inbucket.
2. Two browser profiles (or one normal + one private): sign in same account.
3. Create note on A → appears on B (Realtime + manual refresh).
4. Airplane mode: edit song offline → reconnect → merges.
5. Delete exercise on A → tombstone removes on B.
6. Enable blob sync on one device only; other shows "Not on this device".
7. Empty `cloudConfig`: confirm zero network to `supabase.co`, no `#mp-cloud-block`.
8. Hard reload after SW bump.

### Verification (per `AGENTS.md`)

1. **Node:** `node tests/cloud/run.mjs` (after Phase 1 lands).
2. **Offline plumbing:** with `enabled: false`, run existing `node tests/sync/profile.mjs` — must still pass unchanged.
3. **Web:** `python3 -m http.server 8080` → Settings (`#sec-musicprefs`) → confirm `#mp-sync-block` unchanged; when config present, `#mp-cloud-block` appears with GBC styling.
4. **Local Supabase:** `supabase start` → two-browser sync smoke per manual matrix above.
5. **Service worker:** after `CACHE_VERSION` bump, hard reload; confirm Supabase requests in the Network tab are **not** `(from ServiceWorker)`.
6. **Empty config:** delete/disable `cloud-config.json` → no Supabase traffic, no cloud UI.

---

## Risks & mitigations

| Risk | Mitigation |
| ---- | ---------- |
| Reconcile storms from chatty `persist()` | Debounce `musi:data-changed` (500 ms); contentHash skip when unchanged |
| localStorage ceiling as library grows | Monitor snapshot size in UI; attachments already in IDB; consider splitting hot paths later |
| `applyRemote` vs in-memory caches | `applySnapshot` already invalidates module caches internally via private `invalidateModuleCaches` in `syncProfile.js` (workbooks not wired today — **add** `invalidateWorkbooksCache` to `workbookModel.js` and register it there); export `invalidateModuleCaches` from `syncProfile.js` only if cloud code must invalidate outside `applySnapshot` |
| Vendored bundle drift | `scripts/vendor-supabase.mjs` pins version + hash in header; CI check in schema doc |
| PKCE redirect vs hash routing | `detectSessionInUrl: false` + manual `exchangeCodeForSession` + `replaceState` |
| Stale service worker | Bump `CACHE_VERSION`; document hard reload in verification |
| Clock skew | Show warning; optional NTP note; server `updated_at` as secondary tiebreak |
| Mass delete misfire | Domain-ratio guard + user prompt |
| Large blob egress | Opt-in per device; lazy download; dedupe on `crc32+size` |
| Partial batch failures | Shadow only confirmed rows; idempotent upsert on retry |

---

## Open questions

- **`features.enabled`:** synced in v1 (matches QR/export). Revisit if users want per-device toolbars.
- **Recordings sync:** default off; separate opt-in because of size and privacy.
- **Hash algorithm:** SHA-256 preferred; FNV-1a/CRC32 fallback prefix for non-secure contexts.
- **Page / chunk sizes:** start `PUSH_CHUNK=50`, `PULL_PAGE=100`; tune from local stack benchmarks.
- **Web Worker for hashing:** defer unless profiling shows main-thread jank on large libraries.
- **CLI cloud read:** default **no** — CLI stays offline; cloud is web-only unless a future `musi cloud pull` is explicitly scoped.
