# Contract: workbook layer seam

**Owner module**: `js/workbooks.js`

**Consumers**: `js/routineNav.js`

**Requirements**: FR-023, FR-024, FR-026, FR-027, FR-031, FR-052

The workbooks section keeps its role as the host of the workbook detail, the exercise
player, and the companions. See decision D1 in `research.md`. This contract fixes the
smallest additive change that lets a routine route own that surface. FR-052 forbids an
unrelated refactor of workbook internals, so the seam adds functions and changes no
existing render logic.

## 1. What the seam must not change

1. The eleven element ids that `initWorkbooks` binds.
2. The private detail render path, which includes `renderDetail`, `buildDetailShell`, and
   `loadCurrentExercise`.
3. The module state, which includes `openWorkbookId` and every `detail*` reference.
4. `isDetailLoadStale`, which gates on the active workbooks section. The gate keeps working,
   because the workbooks section stays the visible host for the workbook layer.
5. `syncPracticeMode` and the practice metrics, which write to `#sec-workbooks`.
6. The dialog root `#wb-dialog-root` and the body class `wb-cmp-drawer-open`.

## 2. New exports

```js
export function openWorkbookForRoute({ workbookId, exerciseId, companionId })
export function closeWorkbookLayer()
export function setWorkbookBackTarget(target)   // target: { label, onBack } | null
export function onWorkbookEntryChange(handler)  // handler: ({ workbookId, exerciseId }) => void
```

### 2.1 `openWorkbookForRoute(request)`

The navigator calls this function on every route apply that shows a workbook layer, an
exercise layer, or a companion layer.

Behavior:

1. When `workbookId` names a different workbook than the open one, open that workbook
   detail through the existing private path.
2. When `workbookId` names the open workbook, do not rebuild the detail shell. A rebuild
   would stop the player and lose the scroll position.
3. When `exerciseId` is present, select that entry with the existing
   `setActiveWorkbookEntry` path, then load it. When `exerciseId` is absent, show the entry
   list and load no new entry.
4. When `companionId` is present, activate the Tools subview and expand that companion.
5. Return `{ ok: true }` on success. Return `{ ok: false, reason }` when the workbook, the
   entry, or the companion does not resolve. The navigator then repairs the route.
6. The function must be idempotent. Two calls with the same request must leave the same
   visible state and must not restart playback.

This function replaces the one-shot `pendingWorkbookOpenId` for routine routes. The
existing `requestWorkbookOpen` stays for the workbooks section itself.

### 2.2 `closeWorkbookLayer()`

The navigator calls this function when it unmounts the workbook layer.

1. Run the existing `closeWorkbookDetail`, which tears down the player and the companions,
   revokes any blob URL, and stops audio and timers.
2. Close the playlist drawer and remove its Escape listener.
3. Clear the back target that section 2.3 set.

### 2.3 `setWorkbookBackTarget(target)`

The navigator sets a target while a routine route owns the layer, and it clears the target
with `null` when the layer closes.

1. When a target is set, the detail back control shows `target.label` and runs
   `target.onBack` on activation. The Guitar Pro header back control follows the same rule.
2. The target must survive a re-render. The detail render path rebuilds the header, so the
   render code must read the stored target each time it draws a back control.
3. When the target is `null`, both controls return to their current behavior, which shows
   `← Workbooks` and runs `closeWorkbookDetail`.
4. The label for a routine-owned layer is `← Session`.

### 2.4 `onWorkbookEntryChange(handler)`

The player can change the selected entry without a route call. The previous control, the
next control, a playlist row, and the automatic advance all do that.

1. `js/workbooks.js` calls the handler after the selected entry changes.
2. The navigator then asks the shell to replace the address with the new `exercise` value.
3. A replace keeps one history entry per layer, so Back still moves one layer. The route
   contract states this rule in its history table.

## 3. Lifecycle rules

| Event | Required behavior |
| --- | --- |
| The navigator shows the workbook layer. | The shell activates `#sec-workbooks` with `keep: ['routines']`, so `stopRoutines` does not run. |
| The player leaves the routine area. | The shell stops both sections, and `closeWorkbookLayer` runs first. |
| The player switches from a routine-owned layer to the workbooks section itself. | The navigator clears the back target, so the control returns to `← Workbooks`. |
| Two layers ask for a workbook at once. | Not supported. The module keeps one open workbook, and the navigator opens one workbook layer at a time. |

## 4. Companion resolution

The navigator resolves a companion id before it calls `openWorkbookForRoute`. It reads
`session.workbookIds` in order and picks the first workbook whose `companions` array holds
the id. `js/workbooks.js` receives both the `workbookId` and the `companionId`, so it needs
no session knowledge and no new store lookup.

## 5. Test approach

The seam needs a browser, so the Node suites cover it indirectly.

1. `tests/routine-nav/run.mjs` covers the companion resolution rule with plain objects,
   because `js/routineRoute.js` holds that rule.
2. The manual checks in `quickstart.md` cover the four seam functions end to end. They
   check the back label, the one-layer Back, the address after the next control, and the
   absence of a playback restart when the route repeats.
