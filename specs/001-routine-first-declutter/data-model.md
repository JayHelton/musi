# Data model: Routine-First Declutter

This document records the Musi routine data shape for the Routine-First Declutter
feature. It covers stored entities, derived values, route state, and export
compatibility. The persisted shape does not change. This feature adds no field,
removes no field, and runs no migration.

## Entities

### Routine

Stored in `musi.routines` under the `routines` array.

| Field | Type | Default | Validation | Source |
| --- | --- | --- | --- | --- |
| `id` | string | generated `rt-{timestamp36}-{rand6}` | Non-empty string; otherwise new uid | `normalizeRoutine` |
| `name` | string | `"Routine"` | Trim; max 120 characters | `normalizeRoutine` |
| `description` | string | `""` | Max 500 characters | `normalizeRoutine` |
| `sessions` | array of Routine session | `[]` | Each item passes `normalizeRoutineSession`; invalid items drop | `normalizeRoutine` |
| `activeSessionId` | string or null | `null` | Must match a session id; cleared when missing or when session is complete after reconcile | `normalizeRoutine`, `reconcileRoutineActiveSession` |
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

### Session metronome

| Field | Type | Default | Validation | Source |
| --- | --- | --- | --- | --- |
| `bpm` | integer | `100` | 30–300 inclusive; out-of-range falls back to default | `normalizeSessionMetronome` |
| `beats` | integer | `4` | 1–12 inclusive; out-of-range falls back to default | `normalizeSessionMetronome` |
| `subdiv` | string | `"quarter"` | One of `quarter`, `eighth`, `triplet`, `sixteenth` | `normalizeSessionMetronome` |
| `accentFirst` | boolean | `true` | `true` when `raw.accentFirst` is null or undefined | `normalizeSessionMetronome` |

### Workbook

Stored in `musi.workbooks` under the `workbooks` array. A session references a
workbook by id only. The export embeds a reduced snapshot.

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

Export snapshot (`normalizeExportWorkbook`) keeps `id`, `name`, `entries` (exercise
id only), and `companions`. It drops `folderId`, `loopEnabled`, `activeEntryId`,
and timestamps.

### Workbook entry

| Field | Type | Default | Validation | Source |
| --- | --- | --- | --- | --- |
| `id` | string | generated `wbe-{timestamp36}-{rand6}` | Non-empty string; otherwise new uid | `normalizeEntry` in `workbookModel.js` |
| `exerciseId` | string | — | Required non-empty string; entry drops when missing | `normalizeEntry` in `workbookModel.js` |

Export entries keep `exerciseId` only.

### Companion

| Field | Type | Default | Validation | Source |
| --- | --- | --- | --- | --- |
| `id` | string | generated `cmp-{timestamp36}-{rand7}` | Non-empty trimmed string; otherwise new id | `normalizeCompanion` |
| `type` | string | — | One of `scale-ref`, `triad-ref`, `sweep-ref`, `pitch-train`, `interval-orbit`, `ear-train` | `normalizeCompanion` |
| `root` | string | — | Valid note via `parseNote`; entry drops when invalid | `normalizeCompanion` |
| `scale` | string | `"Major (Ionian)"` | Must exist in `SCALES` | `normalizeCompanion` |
| `quality` | string | `"major"` | Must exist in `TRIAD_QUALITIES` | `normalizeCompanion` |
| `stringSet` | integer or omitted | type-specific | `triad-ref`: floor of number, min 0; `sweep-ref`: 3, 4, or 5 | `normalizeCompanion` |
| `patternId` | string | first sweep quality id | Valid sweep pattern id | `normalizeCompanion` |
| `inversion` | integer | `0` | Floor of number, 0–5 inclusive | `normalizeCompanion` |
| `tuning` | string | `"Standard"` | Valid tuning preset name | `normalizeCompanion` |
| `fretStart` | integer or omitted | type-specific | 0–24 inclusive; omitted for `pitch-train` and `ear-train` | `normalizeCompanion` |
| `fretEnd` | integer or omitted | type-specific | 0–24 inclusive; omitted for `pitch-train` and `ear-train` | `normalizeCompanion` |
| `collapsed` | boolean | `false` | Coerced to boolean | `normalizeCompanion` |
| `label` | string | `""` | Trim; max 80 characters | `normalizeCompanion` |
| `mapRange` | integer | `1` | 1, 2, or 3; `interval-orbit` only | `normalizeCompanion` |
| `level` | integer | `2` | 1–5 inclusive; `interval-orbit` only | `normalizeCompanion` |
| `mode` | string | `"locate"` | `map` or `locate`; `interval-orbit` only | `normalizeCompanion` |
| `earContext` | string | `"root"` | `root`, `single`, or `melodic`; `ear-train` only | `normalizeCompanion` |
| `earPool` | string | `"diatonic"` | `diatonic` or `chromatic`; `ear-train` only | `normalizeCompanion` |
| `earAnswer` | string | `"note"` | `note`, `degree`, or `interval`; `ear-train` only | `normalizeCompanion` |

### Routine route state

Read-only entity. It lives in memory only. The routine navigation controller owns
it. The address fragment and the browser history state carry it. Nothing persists
it to local storage.

The route holds identifiers, not objects. The controller resolves each identifier to
an entity and passes the result to a layer as a context object. `contracts/routine-route.md`
defines the grammar and the repair rules.

| Field | Type | Default | Validation | Resolves to |
| --- | --- | --- | --- | --- |
| `routine` | string or null | `null` | Must match a stored routine id | Routine |
| `session` | string or null | `null` | Must match an id in `routine.sessions` | Routine session |
| `workbook` | string or null | `null` | Must match a stored workbook id | Workbook |
| `exercise` | string or null | `null` | Must match an id in `workbook.entries` | Workbook entry |
| `companion` | string or null | `null` | Must match a companion id in a workbook that the session references | Companion |

## Relationships

**Routine to Routine session** — one-to-many. A routine holds an ordered `sessions`
array. Cardinality: one routine, zero or more sessions.

**Routine session to Workbook** — many-to-many through id references. A session
holds `workbookIds`. A workbook can appear in many sessions. Cardinality: one
session, zero or more workbook references. A missing workbook is a normal state.
The user interface must handle it without a block.

**Workbook to Companion** — one-to-many. A workbook holds a `companions` array.
Cardinality: one workbook, zero to eight companions.

**Session to Companion** — indirect. A session reaches a companion through its
workbooks. Resolution rule: find the first workbook in `session.workbookIds` whose
`companions` array holds a companion with the requested id.

## Derived values

### `getRoutineStats(routineOrId)`

Returns this object. When the routine is missing or invalid, every count is zero.

| Field | Type | Meaning |
| --- | --- | --- |
| `sessionCount` | integer | Length of `sessions` |
| `completedSessionCount` | integer | Sessions where `completed === true` |
| `pendingSessionCount` | integer | `sessionCount - completedSessionCount` |
| `workbookCount` | integer | Total workbook id references across all sessions |
| `uniqueWorkbookCount` | integer | Distinct workbook ids across all sessions |
| `totalMinutes` | integer | Sum of `durationMin` where value is finite |

Home routine card field mapping:

| Card field | Source |
| --- | --- |
| Routine name | `routine.name` |
| Routine description | `routine.description` when non-empty |
| Current session name | `getActiveRoutineSession(routine).session.name` when result is non-null |
| Completed session count | `getRoutineStats(routine).completedSessionCount` |
| Total session count | `getRoutineStats(routine).sessionCount` |
| Compact progress indicator | `completedSessionCount` divided by `sessionCount` |

### `getActiveRoutineSession(routineId)`

Returns `{ session, index }` or `null`.

- `session` — copy of the resolved session object.
- `index` — zero-based position in `routine.sessions`.

Resolution order:

1. Use `routine.activeSessionId` when it points to an incomplete session.
2. Otherwise use `firstIncompleteSessionId`.
3. Return `null` when every session is complete or the routine has no sessions.

Note: `setActiveRoutineSession` can store a completed session id. Home and practice
display use `getActiveRoutineSession`, which may return a different session than
the stored bookmark.

### Home sort rule

Home sorts routine cards by `updatedAt` descending. When two routines share the
same `updatedAt`, Home uses `name` ascending as the stable secondary sort.

## Route state

### Field list

| Field | Fragment parameter | Parent |
| --- | --- | --- |
| Routine | routine id | — |
| Session | session id | routine |
| Workbook | workbook id | session |
| Exercise | exercise entry id | workbook |
| Companion | companion id | session |

### Allowed combinations

| Layer depth | Populated fields |
| --- | --- |
| Home | none |
| Routine overview | `routine` |
| Session detail | `routine`, `session` |
| Workbook detail | `routine`, `session`, `workbook` |
| Exercise | `routine`, `session`, `workbook`, `exercise` |
| Study companion | `routine`, `session`, `companion` |

A session layer shows either a workbook branch or a companion branch. The canonical
companion address omits the `workbook` parameter, because the controller resolves the
companion through the workbooks that the session references.

### Parent-child rule

A child field is invalid when its parent field is absent. Examples:

- `session` without `routine` — invalid.
- `workbook` without `session` — invalid.
- `exercise` without `workbook` — invalid.
- `companion` without `session` — invalid.

## Validation and error states

Rules follow FR-035 and FR-036.

| Identifier fails to resolve | Fallback layer | Message |
| --- | --- | --- |
| Routine id | Home | Non-blocking message |
| Session id | Routine overview | Non-blocking message; drop session and deeper params |
| Workbook id | Session detail | Non-blocking message; drop workbook and deeper params |
| Exercise entry id | Workbook detail | Non-blocking message; drop exercise param |
| Companion id | Session detail | Non-blocking message; drop companion param |

The app sends the player to Home only when the routine identifier itself does not
resolve.

## Compatibility

| Concern | Rule | Requirement |
| --- | --- | --- |
| Export envelope | `app` is `musi`, `kind` is `musi-routines`, `version` is `1`, plus `createdAt`, `routines`, `workbooks` | FR-046 |
| `durationMin` | Stays in storage and in export; user interface must not show it | FR-022, FR-046 |
| `activeSessionId` on import | Always resets to `null` on each imported routine | FR-046, FR-047 |
| Import merge | Each import creates new routines; import never merges several routines into one | FR-047 |
| `profile.music` | Stays in local storage as inert data; the app does not read or write it; sync carries it as an opaque key | FR-040, FR-041, FR-048 |
| `study.progress` | Stays in use; it holds study review history and no genre data; Study Lab writes it directly after the genre removal | FR-043, FR-048 |

## What this feature does not change

- The `musi.routines` and `musi.workbooks` storage shapes.
- The routine export file format (see `contracts/routine-export.v1.json`).
- Workbook, exercise, and companion internals.
- Genre profile and study progress values in local storage (they become inert).
- The Metronome tool, the Practice Timer tool, and the Interval Map session clock.
