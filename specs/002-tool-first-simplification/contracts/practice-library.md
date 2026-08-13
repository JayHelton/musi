# Contract: practice library

**Owner modules**: `js/exercises.js` (exercise store writes), `js/workbookModel.js`
(workbook store writes), `js/library/libraryModel.js` (pure list logic)

**Consumers**: Library UI, `js/gpPlayer.js`, `js/trackToSheet.js`, `js/exercisesBulk.js`,
routine and workbook surfaces, sync restore paths

**Requirements**: FR-044, FR-045, FR-046, FR-047, FR-048, FR-049, FR-050, FR-096,
FR-028

One implementation owns Practice Library persistence (FR-096). This contract fixes the
single-owner rule, the pure model interface, duplicate detection, list state, attachment
replacement, and open routing.

## 1. Single owner

| Store key | Owner module | Rule |
| --- | --- | --- |
| `musi.exercises` | `js/exercises.js` | Only this module writes the exercise store |
| `musi.workbooks` | `js/workbookModel.js` | Only this module writes the workbook store |

Every other writer must call the owner API. These modules must change:

| Module | Current write path | Required change |
| --- | --- | --- |
| `js/gpPlayer.js` | `addGpExerciseFromAttachment` | Call Practice Library service only |
| `js/exercisesBulk.js` | Injected `addGpExercise` / `addMediaExercise` deps | Route deps to owner exports |
| `js/trackToSheet.js` | `addExerciseFromAttachment` | Call Practice Library service only |
| `js/cloud/reconcile.js` | Direct `writeJsonKey('musi.exercises')` on restore | Keep direct access; run `normalizeExerciseItem` on every item |
| `js/sync/syncBundle.js` | Direct `musi.exercises` merge on restore | Keep direct access; run `normalizeExerciseItem` on every item |

Restore paths replace whole stores during a sync restore, so they keep direct access.
They must run the normalise step on every record before write.

No feature may keep a private practice-material library (FR-096, FR-054).

## 2. Practice Library service

The Library UI and Score Player call these owner exports. They do not write
`localStorage` keys directly.

```js
// js/exercises.js — exercise writes
addExerciseFromAttachment(opts) -> Exercise | null
addGpExerciseFromAttachment(opts) -> Exercise | null
updateExercisePracticeSettings(id, patch) -> Exercise | null
replaceExerciseAttachment(id, { blob, fileName, type, size }) -> Promise<Exercise | null>
findExerciseByContentHash(contentHash) -> Exercise | null

// js/workbookModel.js — workbook writes
createWorkbook(opts) -> Workbook
addExercisesToWorkbook(workbookId, exerciseIds) -> Workbook | null
```

`replaceExerciseAttachment` implements FR-050. See section 7.

## 3. Pure model interface

**Owner module**: `js/library/libraryModel.js`

```js
export function buildFacets(items) -> Facets
export function filterItems(items, query) -> Exercise[]
export function findDuplicate(items, contentHash) -> Exercise | null
export function referencesOf(exerciseId, { workbooks, routines }) -> References
export const SORT_MODES
```

### 3.1 `LibraryQuery`

```js
{
  term: string,              // free-text search
  instrument: string | null,
  materialType: string | null,
  technique: string | null,
  tuning: string | null,
  difficulty: string | null,
  tags: string[],            // empty array means no tag filter
  source: string | null,
  favorite: boolean | null,  // null means no favorite filter
  sort: string,              // one of SORT_MODES
}
```

`filterItems` applies all eight filters from FR-045, then the free-text `term`, then
sorts by `sort`.

### 3.2 `Facets`

```js
{
  instruments: string[],
  materialTypes: string[],
  techniques: string[],
  tunings: string[],
  difficulties: string[],
  tags: string[],
  sources: string[],
}
```

`buildFacets` derives facet lists from the current item set. It omits empty values.

### 3.3 `References`

```js
{
  workbooks: Array<{ workbookId: string, workbookName: string, entryId: string }>,
  routines: Array<{ routineId: string, routineName: string, sessionId: string, workbookId: string }>,
}
```

`referencesOf` scans workbook entries by `exerciseId` and routine sessions by
`workbookIds` chain (FR-050).

### 3.4 `SORT_MODES`

```js
SORT_MODES = ['name-asc', 'name-desc', 'added-desc', 'added-asc', 'updated-desc']
```

## 4. Duplicate detection

Per FR-049 and decision D5:

1. At import, compute a SHA-256 digest of the file bytes with `crypto.subtle.digest`.
2. Store the digest on the attachment metadata as `contentHash`.
3. Store the same value on the exercise record as `contentHash`.
4. `findDuplicate` and `findExerciseByContentHash` match on `contentHash`.

When `crypto.subtle` is unavailable, skip detection and complete the import. The app
must not fail the upload.

When a duplicate exists, the UI offers exactly these two actions:

- `Open existing`
- `Import another copy`

## 5. List state

Per FR-046 and FR-028, the Library must save and restore:

| Field | Meaning |
| --- | --- |
| `term` | Free-text query |
| Filter fields | All eight filters from section 3.1 |
| `sort` | Active sort mode |
| `selectedId` | Selected item id on the active tab |
| `scrollY` | List scroll position |

`js/shell/navStack.js` owns storage of this state. The Library supplies the state
object on push and consumes the restored object on pop. Back must restore the prior list
state (FR-028).

## 6. Open behavior

Per FR-048, open routing uses `mediaKind` rules from `js/exercises.js`:

| Content | Rule | Destination |
| --- | --- | --- |
| Guitar Pro | `mediaKind` is `gp` | Score Player (`scoreplayer`) |
| Tab model | `isTabModelItem` or `application/x-musi-tab-model` | Score Player |
| Audio | `mediaKind` is `audio` | Shared practice player |
| Video / YouTube | `mediaKind` is `video` or `youtube` | Shared practice player |
| PDF | `mediaKind` is `pdf` | Shared document viewer |
| Image | `mediaKind` is `image` | Shared document viewer |

The Library passes an open target to the host module. It does not embed players inline.

## 7. Attachment replacement

Per FR-050:

1. The exercise `id` does not change.
2. Every `exerciseId` reference in workbooks and routines still resolves.
3. The new attachment gets a new `attachmentId` and a new `contentHash`.
4. `replaceExerciseAttachment` updates `fileName`, `type`, and `size` on the exercise.

The old attachment record stays in the `musi-attachments` IndexedDB store until Cleanup
removes unreferenced blobs or sync tombstones delete it. No other exercise may reference
the old `attachmentId` after replace completes.

## 8. The one Add action

Per FR-047, each tab exposes one Add control that covers every supported create and
import action for that tab.

**Exercises tab**

- Import file (single or bulk through `js/exercisesBulk.js`)
- Add external URL
- Record audio (when the browser supports capture)

**Workbooks tab**

- Create empty workbook
- Import workbook file

Secondary actions stay inside the Add menu or its dialog. The list header shows one Add
button only.

## 9. Exercise detail

The exercise detail page lists workbook and routine references from `referencesOf`
(FR-050). A missing attachment shows a non-blocking message and keeps the exercise id.

## 10. Test approach

Suite: `tests/library/run.mjs`

| Case | Expected result |
| --- | --- |
| `buildFacets` on a mixed item set | Facet lists match distinct field values |
| `filterItems` with each of the eight filters | Only matching items remain |
| `filterItems` with `term` | Name and fileName match |
| `findDuplicate` with matching `contentHash` | Returns the existing exercise |
| `findDuplicate` with no match | Returns `null` |
| `referencesOf` | Lists every workbook entry and routine path |
| List state roundtrip through navStack shape | All fields restore after pop |
| `replaceExerciseAttachment` | Same exercise id, new `attachmentId`, references resolve |
| Duplicate import with `crypto.subtle` | Offers `Open existing` and `Import another copy` |
| Import without `crypto.subtle` | Completes with no duplicate check |
| Open routing per `mediaKind` | Correct destination module for gp, audio, pdf, image |

The suite uses plain objects and needs no DOM.
