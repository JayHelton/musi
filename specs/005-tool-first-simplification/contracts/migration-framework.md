# Contract: migration framework

**Owner module**: `js/migrations/index.js` (registry and runner)

**Migration modules**: `js/migrations/notesUnfiled.js`, `js/migrations/exerciseMetadata.js`,
`js/migrations/drumsToExercises.js`

**Consumers**: `js/main.js`

**Requirements**: FR-071, FR-072, FR-073, FR-074, FR-075, FR-076, FR-078

The repo has no client migration framework today. Each model normalises on read. This
contract adds a versioned, idempotent runner that preserves identifiers, keeps source
records until verify passes, and never deletes a source record.

## 1. Module layout

| Path | Role |
| --- | --- |
| `js/migrations/index.js` | Registry, `runMigrations`, and the shared `ctx` factory |
| `js/migrations/notesUnfiled.js` | Move notes to Unfiled Notes (FR-072, FR-073) |
| `js/migrations/exerciseMetadata.js` | Add exercise metadata defaults (FR-075) |
| `js/migrations/drumsToExercises.js` | Convert drum patterns to exercises (FR-074, FR-076) |

The registry lists migrations in fixed order. The runner never reorders them.

## 2. Migration interface

Each migration module default-exports one object.

```js
{
  id: 'drums-to-exercises.v1',   // stable, includes the version suffix
  version: 1,
  describe(): string,
  async detect(ctx): { needed: boolean, count: number, reason: string },
  async apply(ctx): { created: number, updated: number, skipped: number },
  async verify(ctx): { ok: boolean, problems: string[] },
}
```

Rules:

1. `id` is stable across releases. The runner records this string, not the file name.
2. `describe` returns one short sentence for logs and the boot report.
3. `detect` reads only through `ctx`. It must not write.
4. `apply` writes only through `ctx`. It must not read the applied-id list.
5. `verify` reads the destination state and returns `ok: false` when any problem
   remains. It must not write.

## 3. Runner contract

```js
runMigrations(ctx) -> MigrationReport
```

```js
MigrationReport = {
  applied: string[],          // migration ids recorded this run
  skipped: string[],          // ids already in migrations.applied
  failed: Array<{ id: string, stage: 'detect' | 'apply' | 'verify', error: string }>,
  details: Array<{
    id: string,
    detect: { needed: boolean, count: number, reason: string },
    apply: { created: number, updated: number, skipped: number } | null,
    verify: { ok: boolean, problems: string[] } | null,
  }>,
}
```

Algorithm, in registry order:

1. Read the applied-id list from the settings key `migrations.applied` through
   `ctx.settings.read('migrations.applied', [])`.
2. For each registered migration whose `id` is already in the list, push the `id` to
   `skipped` and continue.
3. Call `detect(ctx)`. When `needed` is `false`, push the `id` to `applied`, record the
   id through `ctx.settings.write('migrations.applied', nextList)`, and continue.
4. Call `apply(ctx)`. When `apply` throws, record the failure, leave the id unrecorded,
   leave every source record in place, and continue with the next migration.
5. Call `verify(ctx)`. When `ok` is `false`, record the failure, leave the id unrecorded,
   leave every source record in place, and continue with the next migration.
6. When `verify` returns `ok: true`, append the `id` to `migrations.applied` and push it
   to `applied`.
7. Return the report.

Guarantees:

| Rule | Requirement |
| --- | --- |
| The runner records an id only after `verify` returns `ok: true`. | FR-078 |
| A failed verify leaves the id unrecorded and leaves every source record in place. | FR-078 |
| A thrown error stops that migration but does not stop the others. | FR-078 |
| The runner never deletes a source record. | FR-078 |
| The runner returns a report on every call. | FR-071 |

## 4. Context object `ctx`

`ctx` carries store readers and writers, a clock, and a logger. Migrations take `ctx` so
Node tests can inject a fake context without a browser or IndexedDB.

```js
ctx = {
  clock: { now(): string },   // ISO timestamp
  log: { info(msg), warn(msg), error(msg) },
  settings: {
    read(key, fallback),
    write(key, value),
  },
  notes: {
    readAll(): Note[],
    writeAll(notes: Note[]),
  },
  songs: {
    readAll(): Song[],
    writeAll(songs: Song[]),
  },
  exercises: {
    readStore(): { categories, items },
    writeStore(store),
    normalizeItem(raw),        // wraps normalizeExerciseItem from js/exercises.js
  },
  workbooks: {
    readStore(): { folders, workbooks },
    writeStore(store),
    normalizeWorkbook(raw),    // wraps normalizeWorkbook from js/workbookModel.js
  },
  routines: {
    readAll(): Routine[],
    writeAll(routines: Routine[]),
  },
  attachments: {
    getMeta(id),
    putFileWithId(rec),        // wraps putFileWithId from js/attachments.js
    hasFile(id),
  },
  drumPatterns: {
    listAll(): DrumPattern[],  // wraps listPatterns from js/drums/drumPatternDb.js
  },
}
```

`js/migrations/index.js` builds the live `ctx` from `js/persistence.js`, `js/notes.js`,
`js/exercises.js`, `js/workbookModel.js`, `js/routineModel.js`, and `js/attachments.js`.
Tests build a fake `ctx` with in-memory stores.

## 5. Idempotency rules

Two independent guards prevent duplicate work.

**Guard 1 — applied-id list.** The settings key `migrations.applied` holds a string array
of completed migration ids. The runner skips any id already in the list.

**Guard 2 — per-migration `detect`.** Each migration inspects the destination store and
returns `needed: false` when its work is already done, even when the applied list is
empty.

Both guards exist because cloud sync can restore an older settings bag and reset the
applied list. Guard 2 stops duplicate exercises, notes, or metadata when that happens.

A repeat boot with an unchanged data set must create no duplicate record (FR-078).

## 6. Registry order

| Order | Migration id | Module |
| --- | --- | --- |
| 1 | `notes-unfiled.v1` | `js/migrations/notesUnfiled.js` |
| 2 | `exercise-metadata.v1` | `js/migrations/exerciseMetadata.js` |
| 3 | `drums-to-exercises.v1` | `js/migrations/drumsToExercises.js` |

`drums-to-exercises.v1` runs last because it writes exercises. The exercise metadata
defaults from `exercise-metadata.v1` must exist first (FR-075).

### 6.1 `notes-unfiled.v1`

Per FR-072 and FR-073:

1. When a note record links to a song, exercise, workbook, or routine, move it to that
   entity. Today no note carries a link field, so every existing note goes to Unfiled
   Notes.
2. Do not keep Notes as a top-level destination after migration completes.

### 6.2 `exercise-metadata.v1`

Per FR-075:

1. Add default metadata fields to exercises that lack them, including `instrument` and
   `materialType`.
2. Do not remove unknown fields (FR-078).

### 6.3 `drums-to-exercises.v1`

Per FR-074, FR-075, and FR-076:

1. Read patterns from the `musi-drums` IndexedDB store through `ctx.drumPatterns`.
2. Create a generic exercise for each player-saved pattern. Build an attachment from
   stored step data and tab text when no source file exists.
3. Preserve a source attachment when one exists on the pattern.
4. Set `instrument` to `drums` and set material-type metadata.
5. Keep compatible Guitar Pro material playable in Score Player.
6. Remove the Drums module only after this migration verify passes (FR-076).

## 7. Boot integration

`js/main.js` awaits `runMigrations(ctx)` during `init()` before the first render. A
migration touches IndexedDB for drum patterns and attachments, so the runner must finish
before the Library or Score Player reads those stores.

```text
DOMContentLoaded
  -> init()
     -> runMigrations(liveCtx)
     -> applyRoute(...)
     -> first render
```

## 8. Failure behavior

When a migration fails, the app still starts. `js/main.js` shows a non-blocking message
with the migration id and a short reason. The message does not block use. The runner
retries the failed migration on the next boot because the id stays unrecorded.

Broken references follow FR-071: migration deletes no record. The feature surface shows
a non-blocking message when the player opens the affected item.

## 9. Test approach

Suite: `tests/migrations/run.mjs`

Every migration must pass these fixtures with a fake `ctx`:

| Fixture | Expected result |
| --- | --- |
| Empty stores | `detect.needed` is `false` or apply creates zero duplicates |
| Normal data set | Every source record reaches the destination with the same id |
| Duplicate content | Second run creates no duplicate record |
| Partial legacy record | Migration skips or repairs without deleting the source |
| Already-migrated record | `detect.needed` is `false`; apply is not called |
| Broken reference | Source record stays; verify may report a problem without deleting |
| Repeated run | Second `runMigrations` call adds no new records |

The suite must also assert runner rules:

1. A failed verify leaves the id out of `migrations.applied`.
2. A thrown `apply` does not stop later migrations.
3. The runner never deletes a source record.
4. Registry order matches section 6.
