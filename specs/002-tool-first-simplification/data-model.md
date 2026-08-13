# Data model: Tool-First Simplification

**Created**: 2026-08-13

This document records the target data shapes for the Tool-First Simplification
feature. The feature adds three versioned migrations. It adds optional fields to a
note and to an exercise item. It adds five settings keys. It removes no stored
field. `research-inventory.md` records the current shapes. This file records the
target shapes.

## Change summary

| Change | Kind | Risk |
| --- | --- | --- |
| Note link fields `linkedType` and `linkedId` | additive | A bad link value can hide a note from Unfiled Notes until the player fixes it. |
| Exercise metadata fields `instrument`, `materialType`, `technique`, `difficulty`, `tags`, `source`, `contentHash`, `favorite`, `sourceRef` | additive | Library filters depend on derived values; a wrong derivation can mis-file an item. |
| Drum pattern to exercise conversion with `musi-drum-pattern` attachment | new store record | A failed attachment write can leave a pattern without a playable exercise. |
| Settings keys `migrations.applied`, `route.noticesSeen`, `tool.recents`, `context.tuning`, `context.meter` | new settings key | A corrupt settings bag can block migration or lose Recents restore data. |
| Removed feature visibility catalog value `features.enabled` | inert | An older client can rewrite `features.enabled` and drop unknown tool ids. |
| Route notice state under `route.noticesSeen` | new settings key | A missing notice id can show the same legacy notice again on every boot. |
| Tool recents shape `[{ id, mode, context, at }]` under `tool.recents` | new settings key | A stale Recent entry can open a tool with an incompatible saved context. |

## Entities

### Exercise item

Stored in `musi.exercises` under the `items` array. A workbook entry and Library
lists reference an item by `id`. An item needs `attachmentId` or `url`.

| Field | Type | Default | Validation | Source |
| --- | --- | --- | --- | --- |
| `id` | string | generated `ex-{timestamp36}-{rand6}` | Non-empty string; otherwise new uid | `normalizeItem` |
| `name` | string | `"Exercise"` or title from `url` | Trim; max 120 characters | `normalizeItem` |
| `categoryId` | string | `""` | String | `normalizeItem` |
| `attachmentId` | string | `""` | Required with `url` absent; item drops when both are empty | `normalizeItem` |
| `url` | string | `""` | Safe external URL; required with `attachmentId` absent | `normalizeItem` |
| `fileName` | string | `""` | String | `normalizeItem` |
| `type` | string | `""` | String | `normalizeItem` |
| `size` | number | `0` | Finite number | `normalizeItem` |
| `addedAt` | string (ISO-8601) | current time | Preserved when valid string | `normalizeItem` |
| `preferredTrackIndex` | integer | `0` | Floor of number; min 0 | `normalizeItem` |
| `measureStart` | integer or null | `null` | Floor of number; min 0; `null` when unset | `normalizeItem` |
| `measureEnd` | integer or null | `null` | Floor of number; min 0; `null` when unset | `normalizeItem` |
| `startBeat` | number or null | `null` | Finite number or `null` | `normalizeItem` |
| `endBeat` | number or null | `null` | Finite number or `null` | `normalizeItem` |
| `loopEnabled` | boolean | `false` | `true` only when `raw.loopEnabled === true` | `normalizeItem` |
| `loopRestSec` | number | `0` | 0–30 inclusive | `normalizeItem` |
| `bpm` | integer or null | `null` | Positive finite BPM via `clampBpm`; `null` when unset | `normalizeItem` |
| `transpose` | integer | `0` | Rounded finite number | `normalizeItem` |
| `tuning` | string or null | `null` | Non-empty string or `null` | `normalizeItem` |
| `retuneMode` | string | `"fingerings"` | `"pitches"` or `"fingerings"` | `normalizeItem` |
| `takes` | array of take | `[]` | Each item passes `normalizeTake`; invalid items drop; max 50 | `normalizeItem` via `normalizeTakes` |
| **`NEW` `instrument`** | string | `""` | Derived from `type` and `fileName` when empty | `normalizeItem` |
| **`NEW` `materialType`** | string | `""` | Derived from `type` and `fileName` when empty | `normalizeItem` |
| **`NEW` `technique`** | string | `""` | String | `normalizeItem` |
| **`NEW` `difficulty`** | string | `""` | String | `normalizeItem` |
| **`NEW` `tags`** | string[] | `[]` | Array of non-empty strings | `normalizeItem` |
| **`NEW` `source`** | string | `""` | String | `normalizeItem` |
| **`NEW` `contentHash`** | string | `""` | String | `normalizeItem` |
| **`NEW` `favorite`** | boolean | `false` | `true` only when `raw.favorite === true` | `normalizeItem` |
| **`NEW` `sourceRef`** | string | `""` | String; migrated drum items use `drum-pattern:<patternId>` | `normalizeItem` |

Take shape (nested in `takes`):

| Field | Type | Default | Validation | Source |
| --- | --- | --- | --- | --- |
| `id` | string | — | Required non-empty string | `normalizeTake` |
| `attachmentId` | string | — | Required non-empty string | `normalizeTake` |
| `name` | string | `"Take"` | Trim; max 120 characters | `normalizeTake` |
| `type` | string | `""` | String | `normalizeTake` |
| `durationMs` | integer | `0` | Floor of number; min 0 | `normalizeTake` |
| `createdAt` | string (ISO-8601) | current time | Preserved when valid string | `normalizeTake` |

### Exercise category

Stored in `musi.exercises` under the `categories` array.

| Field | Type | Default | Validation | Source |
| --- | --- | --- | --- | --- |
| `id` | string | generated `cat-{timestamp36}-{rand6}` | Non-empty string; otherwise new uid | `normalizeCategory` |
| `name` | string | `"Folder"` | Trim; max 40 characters | `normalizeCategory` |

### Workbook

Stored in `musi.workbooks` under the `workbooks` array. A routine session references
a workbook by id only.

| Field | Type | Default | Validation | Source |
| --- | --- | --- | --- | --- |
| `id` | string | generated `wb-{timestamp36}-{rand6}` | Non-empty string; otherwise new uid | `normalizeWorkbook` |
| `name` | string | `"Workbook"` | Trim; max 120 characters | `normalizeWorkbook` |
| `folderId` | string | `""` | String; cleared when folder does not exist | `normalizeWorkbook` |
| `entries` | array of Workbook entry | `[]` | Each item passes `normalizeEntry`; invalid items drop | `normalizeWorkbook` |
| `companions` | array of Companion | `[]` | Max 8 items; each passes `normalizeCompanion` | `normalizeWorkbook` via `normalizeCompanions` |
| `loopEnabled` | boolean | `true` | `true` when `raw.loopEnabled` is null or undefined | `normalizeWorkbook` |
| `activeEntryId` | string or null | `null` | Must match an entry id; cleared when missing | `normalizeWorkbook` |
| `createdAt` | string (ISO-8601) | current time | Preserved when valid string | `normalizeWorkbook` |
| `updatedAt` | string (ISO-8601) | `createdAt` | Preserved when valid string | `normalizeWorkbook` |

### Workbook entry

| Field | Type | Default | Validation | Source |
| --- | --- | --- | --- | --- |
| `id` | string | generated `wbe-{timestamp36}-{rand6}` | Non-empty string; otherwise new uid | `normalizeEntry` in `workbookModel.js` |
| `exerciseId` | string | — | Required non-empty string; entry drops when missing | `normalizeEntry` in `workbookModel.js` |

### Routine

Stored in `musi.routines` under the `routines` array.

| Field | Type | Default | Validation | Source |
| --- | --- | --- | --- | --- |
| `id` | string | generated `rt-{timestamp36}-{rand6}` | Non-empty string; otherwise new uid | `normalizeRoutine` |
| `name` | string | `"Routine"` | Trim; max 120 characters | `normalizeRoutine` |
| `description` | string | `""` | Max 500 characters | `normalizeRoutine` |
| `sessions` | array of Routine session | `[]` | Each item passes `normalizeRoutineSession`; invalid items drop | `normalizeRoutine` |
| `activeSessionId` | string or null | `null` | Must match a session id; cleared when missing | `normalizeRoutine`, `reconcileRoutineActiveSession` |
| `createdAt` | string (ISO-8601) | current time | Preserved when valid string | `normalizeRoutine` |
| `updatedAt` | string (ISO-8601) | `createdAt` | Preserved when valid string | `normalizeRoutine` |

### Routine session

| Field | Type | Default | Validation | Source |
| --- | --- | --- | --- | --- |
| `id` | string | generated `rs-{timestamp36}-{rand6}` | Non-empty string; otherwise new uid | `normalizeRoutineSession` |
| `name` | string | `"Session"` | Trim; max 120 characters | `normalizeRoutineSession` |
| `notes` | string | `""` | Max 20 000 characters | `normalizeRoutineSession` |
| `workbookIds` | string[] | `[]` | Unique non-empty strings; order preserved | `normalizeRoutineSession` via `normalizeWorkbookIds` |
| `durationMin` | integer or null | `null` | When present: integer 1–600 inclusive; out-of-range becomes `null` | `normalizeRoutineSession` |
| `metronome` | Session metronome | see below | Always normalized | `normalizeRoutineSession` |
| `completed` | boolean | `false` | `true` only when `raw.completed === true` | `normalizeRoutineSession` |

Session metronome (nested in `metronome`):

| Field | Type | Default | Validation | Source |
| --- | --- | --- | --- | --- |
| `bpm` | integer | `100` | 30–300 inclusive; out-of-range falls back to default | `normalizeSessionMetronome` |
| `beats` | integer | `4` | 1–12 inclusive; out-of-range falls back to default | `normalizeSessionMetronome` |
| `subdiv` | string | `"quarter"` | One of `quarter`, `eighth`, `triplet`, `sixteenth` | `normalizeSessionMetronome` |
| `accentFirst` | boolean | `true` | `true` when `raw.accentFirst` is null or undefined | `normalizeSessionMetronome` |

### Song

Stored in `musi.songs` under the songs array.

| Field | Type | Default | Validation | Source |
| --- | --- | --- | --- | --- |
| `id` | string | generated `song-{timestamp36}-{rand6}` | Non-empty string; otherwise new uid | `normalizeSong` |
| `title` | string | `""` | Max 120 characters | `normalizeSong` |
| `lyrics` | string | `""` | Max 50 000 characters | `normalizeSong` |
| `recordings` | array of recording | `[]` | Each item passes `normalizeRecording`; invalid items drop | `normalizeSong` |
| `createdAt` | string (ISO-8601) | current time | Preserved when valid string | `normalizeSong` |
| `updatedAt` | string (ISO-8601) | `createdAt` | Preserved when valid string | `normalizeSong` |

Recording shape (nested in `recordings`):

| Field | Type | Default | Validation | Source |
| --- | --- | --- | --- | --- |
| `id` | string | — | Required non-empty string | `normalizeRecording` |
| `name` | string | `"Recording"` | Trim; max 120 characters | `normalizeRecording` |
| `addedAt` | string (ISO-8601) | current time | Preserved when valid string | `normalizeRecording` |

Legacy fields `audioId` and `audioName` upgrade to `recordings` on read. They do not
persist after normalization.

### Note

Stored in `musi.notes` as an array of note records.

| Field | Type | Default | Validation | Source |
| --- | --- | --- | --- | --- |
| `id` | string | generated `note-{timestamp36}-{rand6}` | Non-empty string; otherwise new uid | `normalizeNote` |
| `title` | string | `""` | Max 120 characters | `normalizeNote` |
| `body` | string | `""` | Max 50 000 characters | `normalizeNote` |
| `createdAt` | string (ISO-8601) | current time | Preserved when valid string | `normalizeNote` |
| `updatedAt` | string (ISO-8601) | `createdAt` | Preserved when valid string | `normalizeNote` |
| **`NEW` `linkedType`** | string | `""` | One of `""`, `"song"`, `"exercise"`, `"workbook"`, `"routine"` | `normalizeNote` |
| **`NEW` `linkedId`** | string | `""` | String; empty means unfiled | `normalizeNote` |

Unfiled Notes is the set of notes where `linkedId` is empty. No existing note carries
a link today. Every existing note is already unfiled.

### Attachment

Stored in IndexedDB database `musi-attachments`, object store `files`, keyed by `id`.
Features reference an attachment by `id`. The blob lives in the record.

| Field | Type | Default | Validation | Source |
| --- | --- | --- | --- | --- |
| `id` | string | generated `att-{timestamp36}-{rand6}` | Non-empty string | `saveAudio`, `saveFile` |
| `blob` | Blob | — | Required on write | `saveAudio`, `saveFile` |
| `name` | string | `"Audio"` or file name | Trimmed display name | `saveAudio`, `saveFile` |
| `fileName` | string | `""` | String | `saveAudio`, `saveFile` |
| `type` | string | `""` | MIME type string | `saveAudio`, `saveFile` |
| `size` | number | `0` | Finite number | `saveAudio`, `saveFile` |
| `createdAt` | string (ISO-8601) | current time | ISO timestamp on write | `saveAudio`, `saveFile` |
| `source` | string | `"upload"` | Known values include `upload`, `recording`, `exercise`, `exercise-take`, `songwriter`, **`NEW` `drums-migration`** | `saveAudio`, `saveFile` |

Drum pattern attachment JSON document shape (stored as the attachment blob body):

| Field | Type | Default | Validation | Source |
| --- | --- | --- | --- | --- |
| `format` | string | — | Must be `"musi-drum-pattern"` | drums migration writer |
| `version` | integer | — | Must be `1` | drums migration writer |
| `pattern` | Drum pattern object | — | Full pattern record from source | drums migration writer |

List and metadata callers use `metaOf` and receive fields without `blob`.

### Drum pattern (source, before migration)

Stored in IndexedDB database `musi-drums`, object store `patterns`, keyed by `id`.
Built-in patterns live in `js/drums/builtinPatterns.js` and not in the database.
The sync domain `drumPatterns` can supply additional inbox copies.

| Field | Type | Default | Validation | Source |
| --- | --- | --- | --- | --- |
| `id` | string | generated `usr-{timestamp36}-{rand6}` for user patterns | Non-empty string | `savePattern`, builtin catalog |
| `title` | string | — | String | pattern record |
| `category` | string | — | One of `beat`, `fill`, `exercise` | pattern record |
| `style` | string | — | String | pattern record |
| `tags` | string[] | `[]` | Array of strings | pattern record |
| `difficulty` | number | — | Number | pattern record |
| `bpmRange` | `[number, number]` | — | Two finite BPM values | pattern record |
| `meter` | string | — | String | pattern record |
| `subdivision` | string | — | String | pattern record |
| `bars` | number | — | Positive integer | pattern record |
| `stepsPerBar` | number | — | Positive integer | pattern record |
| `recommendedLoopBars` | number | omitted | Positive integer when present | pattern record |
| `notes` | string | omitted | String when present | pattern record |
| `sourcePdf` | string | omitted | String when present | pattern record |
| `sourcePage` | number | omitted | Number when present | pattern record |
| `parseMethod` | string | omitted | `count-row` or `visual-probability` when present | pattern record |
| `steps` | PatternStep[] | — | Each step has `instrument`, `step`, `velocity` | pattern record |
| `tab` | string | — | Rendered tab text | pattern record |
| `builtin` | boolean | `false` for user patterns | `true` for built-in catalog entries | `savePattern`, builtin catalog |
| `createdAt` | string (ISO-8601) | current time on save | Preserved when valid string | `savePattern` |
| `updatedAt` | string (ISO-8601) | current time on save | Preserved when valid string | `savePattern` |

The drums store keeps no original file bytes and no attachment identifier for a pattern.

### Migrated drum exercise (worked example)

This row is not a new shape. It shows how `drums-to-exercises.v1` fills an exercise
item for pattern id `usr-abc123` with title `"Rock Beat 1"`, category `beat`, tags
`["rock","groove"]`, and `bpmRange` `[80, 120]`. The pattern id appears in
`drums.favorites` when the source is built-in.

| Field | Value | Notes |
| --- | --- | --- |
| `id` | new `ex-…` uid | New exercise record |
| `name` | `"Rock Beat 1"` | From `pattern.title` |
| `attachmentId` | new `att-…` uid | Points at `musi-drum-pattern` JSON attachment |
| `instrument` | `"drums"` | Fixed for migrated drum material |
| `materialType` | `"beat"` | From `pattern.category` |
| `tags` | `["rock","groove","drums"]` | From `pattern.tags` plus `"drums"` |
| `bpm` | from `pattern.bpmRange` | Single BPM value derived from the pattern range |
| `sourceRef` | `"drum-pattern:usr-abc123"` | Names the origin pattern |
| `source` | `"drums-migration"` | Marks migration origin |
| `favorite` | `true` | Only when pattern id is in `drums.favorites` for a built-in pattern |

A built-in pattern migrates only when its id appears in the setting `drums.favorites`.
The migration deletes no pattern record.

### Settings

Stored in localStorage key `musi:settings` as a flat key bag. `getSetting` and
`saveSetting` in `js/persistence.js` read and write values.

| Key | Purpose | Read or write |
| --- | --- | --- |
| **`NEW` `migrations.applied`** | Applied migration ids for the runner | read, write |
| **`NEW` `route.noticesSeen`** | Dismissed route-notice ids for legacy hash redirects | read, write |
| **`NEW` `tool.recents`** | Recent tool visits `[{ id, mode, context, at }]` | read, write |
| `home.favorites` | Tool favorite ids on Tools home | read, write |
| `context.root` | Saved default root note | read, write |
| `context.scale` | Saved default scale name | read, write |
| `context.tempo` | Saved default tempo | read, write |
| **`NEW` `context.tuning`** | Saved default tuning preset | read, write |
| **`NEW` `context.meter`** | Saved default meter | read, write |
| `global.volume` | Playback volume; not input gain | read, write |
| `features.enabled` | Legacy per-feature visibility catalog; inert after WP-09 | read only |
| `drums.favorites` | Built-in drum pattern ids; feeds drums migration favorite flag | read |

Volume stays under `global.volume`. Saved musical defaults use `context.root`,
`context.scale`, `context.tempo`, `context.tuning`, and `context.meter`.

## Derived values

| Value | Derived from | Used by |
| --- | --- | --- |
| Unfiled Notes list | All notes where `linkedId` is `""` after `normalizeNote` | Create surfaces, legacy `#notes` redirect |
| Tools home section list | Purpose switch state, `home.favorites`, `tool.recents`, active routines, tool catalog | Tools home (`FR-008`) |
| Library filter facet lists | Distinct `instrument`, `materialType`, `technique`, `tuning`, `difficulty`, `tags`, `source`, and `favorite` across exercise items | Library Exercises tab filters (`FR-045`) |
| Duplicate-import match | `contentHash` equality between an upload and an existing exercise `contentHash` | Library Add action (`FR-049`) |
| Continue a routine list | Stored routines where at least one session is incomplete | Tools home Continue section |
| Effective musical context | Local context layer, then origin context layer, then saved defaults (`context.*`) | Every tool context row (`FR-021`) |
| Exercise reference list on a detail page | Workbook entries with matching `exerciseId`; routine sessions whose `workbookIds` resolve to workbooks that reference the exercise | Library exercise detail (`FR-050`) |
| Active audio owner | The single metronome, tone, score, recording, or media item that holds playback | Audio Dock and `stopOtherTools` successor (`FR-055`) |

## Migrations

Each migration exports `{ id, version, detect(ctx), apply(ctx), verify(ctx) }`. The
runner calls `detect`, then `apply`, then `verify`, then records the id in
`migrations.applied`. The runner never deletes a source record. WP-09 removes the
`musi-drums` database after the check passes.

### notes-unfiled.v1

**Detect.** The migration id is absent from `migrations.applied` and at least one note
record exists in `musi.notes`, or the store is empty and the migration has not run.

**Apply.** The migration moves no record. `normalizeNote` supplies `linkedType` `""`
and `linkedId` `""` on the next read. No bulk write pass changes note bodies or ids.

**Verify.** Every note passes `normalizeNote` with `linkedType` in the allowed set and
`linkedId` as a string. Every legacy note without a link has empty `linkedId` and
appears in Unfiled Notes.

**Idempotency.** A second run finds the id in `migrations.applied` and skips `apply`.
Existing links stay unchanged. No duplicate note records appear.

| Fixture | Expected result |
| --- | --- |
| Empty data | `detect` passes; `verify` passes; `migrations.applied` gains `notes-unfiled.v1` |
| Normal data (50 notes with only legacy fields) | Every note keeps the same `id`, `title`, `body`, and times; each gains empty link fields |
| Duplicate content (two notes with the same title) | Both notes remain; neither merges; both stay unfiled |
| Partial legacy record (note missing `updatedAt`) | `normalizeNote` fills `updatedAt` from `createdAt`; link fields default empty |
| Already-migrated record (note already has `linkedId` set) | Migration does not clear an existing link |
| Broken reference (`linkedId` names a missing entity) | Migration deletes no note; app shows a non-blocking message on open |
| Repeated run | `detect` returns false; no note changes; id stays in `migrations.applied` |

### exercise-metadata.v1

**Detect.** The migration id is absent from `migrations.applied` and at least one
exercise item exists, or the exercise store is empty and the migration has not run.

**Apply.** No write pass runs. `normalizeItem` supplies new metadata fields and derives
`instrument` and `materialType` from `type` and `fileName` when those fields are empty.

**Verify.** Every stored item passes `normalizeItem` after a read. Each item exposes the
new optional fields with defaults. Derived `instrument` and `materialType` match the
source `type` and `fileName` for fixture items that lack explicit values.

**Idempotency.** A second run skips `apply`. Normalization on read is stable. No
duplicate exercise records appear.

| Fixture | Expected result |
| --- | --- |
| Empty data | `detect` passes; `verify` passes; id recorded |
| Normal data (mixed PDF, GP, and URL exercises) | Each item keeps the same `id`; new fields appear with defaults or derived values |
| Duplicate content (two items with the same `fileName`) | Both items remain; each normalizes independently |
| Partial legacy record (item missing `takes`) | `normalizeItem` sets `takes` to `[]` and adds metadata defaults |
| Already-migrated record (item already has `instrument` set) | Migration does not overwrite a non-empty `instrument` |
| Broken reference (`attachmentId` names a missing file) | Migration deletes no item; detail page shows a non-blocking missing-file message |
| Repeated run | `detect` returns false; store bytes unchanged; id stays in `migrations.applied` |

### drums-to-exercises.v1

**Detect.** The migration id is absent from `migrations.applied` and at least one drum
pattern exists in `musi-drums` or in the `drumPatterns` sync inbox that lacks a
matching exercise with `sourceRef` `drum-pattern:<patternId>`.

**Apply.** For each eligible pattern the migration creates an attachment document
`{ format: 'musi-drum-pattern', version: 1, pattern }` in `musi-attachments` with
`source: 'drums-migration'`, then creates an exercise item with `sourceRef`
`drum-pattern:<patternId>`, `instrument` `drums`, `materialType` from
`pattern.category`, `tags` from `pattern.tags` plus `drums`, `bpm` from
`pattern.bpmRange`, and `name` from `pattern.title`. A built-in pattern migrates only
when its id is in `drums.favorites`; then `favorite` is `true`.

**Verify.** Every migrated pattern has exactly one exercise with matching `sourceRef`.
Each exercise has a non-empty `attachmentId`. Step data and `tab` text remain playable.
No pattern record is deleted.

**Idempotency.** A second run finds each `sourceRef` already present and skips that
pattern. The migration deletes no pattern. No duplicate exercises appear for the same
pattern id.

| Fixture | Expected result |
| --- | --- |
| Empty data (no patterns, empty `drums.favorites`) | `detect` may pass; `apply` creates no exercise; `verify` passes |
| Normal data (user pattern plus favorited built-in) | One exercise per eligible pattern; built-in migrates only when favorited |
| Duplicate content (same pattern title, different ids) | Two exercises with distinct `sourceRef` values |
| Partial legacy record (pattern missing `tags`) | Exercise gets `tags` `["drums"]`; other fields map from available pattern data |
| Already-migrated record (`sourceRef` already exists) | `apply` skips that pattern; pattern row stays in `musi-drums` |
| Broken reference (pattern with empty `steps` and `tab`) | Migration still creates an exercise; player sees playable or empty state without a crash |
| Repeated run | `detect` finds no unmigrated patterns; `apply` skips all; zero new exercises; patterns remain until WP-09 |

## Referential integrity

- A workbook entry names an exercise by `exerciseId`.
- A routine session names workbooks by `workbookIds`.
- An exercise names a file by `attachmentId`.
- An exercise take names a file by `takes[].attachmentId`.
- A song names a file by `recordings[].id` (attachment id).
- A Guitar Pro annotation names a score by the `byScore` key `att:<attachmentId>` or
  `sess:<fileName>:<byteLength>`.
- A migrated drum exercise names its origin by `sourceRef` `drum-pattern:<patternId>`.

`pruneMissingExercises` removes workbook entries whose `exerciseId` is not in the
supplied exercise id list. It clears `activeEntryId` when that entry drops.

`pruneMissingWorkbooks` removes workbook ids from every routine session when the id is
not in the supplied workbook id list. It touches `updatedAt` on changed routines.

When the player replaces an exercise attachment, the exercise `id` stays the same.
Workbook and routine references keep resolving.

## Route state

The root route `tools` uses no hash. Every other route uses `#<routeId>` with optional
query parameters. A tool mode travels in the `mode` parameter.

| Route id | Parameters | Notes |
| --- | --- | --- |
| `tools` | `purpose` = `train`, `study`, or `create` | Root route; no hash |
| `scalelab` | `mode` = `overview`, `neck`, `harmony`, `modes-keys`, `guide` | Study consolidation |
| `fretmap` | `mode` = `learn`, `map`, `chord-tones`, `explain` | Fretboard and Interval Map |
| `chordlab` | `mode` = `reference`, `map`, `voicings`, `triads-sweeps`, `build` | Chord Lab |
| `pitchear` | `mode` = `tuner`, `reference`, `pitch-match`, `pitch-runner`, `ear` | Pitch and Ear Lab |
| `metronome` | `mode` = `metronome`, `practice-plan` | Practice Plan opens from legacy `#practice` |
| `audiostudio` | `mode` = `capture`, `analyze`, `transcribe` | Create consolidation |
| `songstudio` | — | Song Studio; no mode tabs |
| `library` | `tab` = `exercises` or `workbooks` | Practice Library |
| `routines` | `routine`, `session`, `workbook`, `exercise`, `companion` | Optional routine stack |
| `scoreplayer` | `attachment`, `exercise` | Score Player; opens GP content |
| `settings` | — | Preferences, Audio, Data/Sync, Cleanup |

Routine parameters follow `ROUTINE_PARAM_KEYS` in `js/routineRoute.js`: `routine`,
`session`, `workbook`, `exercise`, and `companion`. A child parameter is invalid when
its parent is absent.

## Runtime state

| State | Owner | Lifetime | Persisted |
| --- | --- | --- | --- |
| Musical context scope | `js/musicalContext.js` successor | Current tool screen | No |
| Local context layer | Tool shell per open tool | While the tool is open | No; Recents `context` in `tool.recents` persists |
| Origin context layer | Navigation controller | While the player stays in the opened origin chain | No |
| Audio owner | Shared audio registry successor | While playback, recording, or mic work is active | No |
| Unsaved-work registration | Tool shells with draft data | Until save, discard, or cancel | No |
| Navigation stack entry | App router / history integration | Until Back or a replace navigation | No |
| Library list state | Library module | Until the player leaves Library or clears filters | No |

Saved defaults (`context.root`, `context.scale`, `context.tempo`, `context.tuning`,
`context.meter`) and Recents (`tool.recents`) persist in `musi:settings`.

## Sync impact

| Domain | Effect of this feature |
| --- | --- |
| `settings` | Carries new keys `migrations.applied`, `route.noticesSeen`, `tool.recents`, `context.tuning`, and `context.meter`; `features.enabled` stays inert |
| `progress` | No schema change; removed-quiz values stay as inert data |
| `notes` | Sync carries new optional `linkedType` and `linkedId` fields |
| `songs` | No shape change |
| `exercises` | Sync carries new optional metadata fields on each item |
| `exerciseCategories` | No shape change |
| `workbooks` | No shape change |
| `workbookFolders` | No shape change |
| `routines` | No shape change |
| `gpAnnotations` | No shape change |
| `drumPatterns` | Stays a read-only inbox that feeds `drums-to-exercises.v1`; WP-09 stops new writes |
| `attachmentsMeta` | Gains `drums-migration` source rows; opaque JSON body for drum pattern attachments |

The Supabase `payload` column is opaque JSON. An older client can drop a new field when
it rewrites a record. Unknown fields must survive a read on every model.

## Compatibility rules

- The feature removes no stored field from any entity.
- Every new field is optional and `normalizeNote` or `normalizeItem` supplies a default.
- An unknown field on read survives normalization and persists on the next write.
- The migration runner deletes no source record before its destination check passes.
- `features.enabled` stays in local storage as inert data; Settings exposes no control
  for it after WP-09.
- The routine export format (`musi-routines`, version `1`) does not change.
- A settings import from an older Musi version still applies; missing new keys fall back
  to defaults.
- Legacy hash routes resolve to the route ids in this document with optional one-time
  notices tracked in `route.noticesSeen`.
- `drumPatterns` sync records remain readable until WP-09; they feed migration only.
- The `musi-drums` IndexedDB database goes away only in WP-09 after the migration
  verify step passes.
- Cloud round-trip with a newer client must not fatal-error an older client; opaque
  payload merge keeps unrecognized keys when possible.
- Exercise `id`, workbook `id`, routine `id`, song `id`, and note `id` stay stable across
  migration.
