# Contract: routine navigator

**Owner module**: `js/routineNav.js`

**Consumers**: `js/main.js`, `js/routines.js`, `js/home.js`

**Requirements**: FR-023 to FR-036, FR-051, SC-008 to SC-012, SC-015

One controller owns the routine layers. FR-032 forbids independent Back behavior in each
renderer. This contract fixes the interface, the guarantees, and the call order.

## 1. Factory

```js
createRoutineNavigator({
  root,            // Element. The routines section element.
  getRoutine,      // (routineId) => Routine | null
  getWorkbook,     // (workbookId) => Workbook | null
  getExercise,     // (workbookId, exerciseId) => Entry | null
  getCompanion,    // (session, companionId) => { workbook, companion } | null
  shell,           // Shell adapter, see section 3
  layers,          // Layer descriptor map, see section 4
  onRouteChange,   // (route, meta) => void. Optional observer.
}) -> RoutineNavigator
```

Every lookup stays injected, so the navigator holds no store import and the tests can pass
plain objects.

## 2. Instance methods

```js
navigator.applyRoute(params, { source })   // Reconcile the visible stack with the address
navigator.open(patch)                      // Open a deeper layer. Pushes one entry.
navigator.back()                           // Move up exactly one layer
navigator.currentRoute()                    // -> RoutineRoute
navigator.currentLayer()                    // -> LayerName
navigator.destroy()                         // Release listeners and stored positions
```

### 2.1 `applyRoute(params, { source })`

`source` is `boot`, `popstate`, `hashchange`, or `internal`.

Order of work:

1. Parse the parameters with `parseRoutineRoute`.
2. Repair the route with `resolveRoutineRoute` and the injected lookups.
3. When the repair dropped a key, ask the shell to replace the address, then show the
   message `Item not found` through the status target of the deepest valid layer.
4. When the repair returned an empty route because the routine is missing, ask the shell to
   go to Home, and show the same message on the Home status region.
5. Compare the target layer stack with the visible stack. Close every layer above the
   common parent, from the top down. Open every missing layer, from the parent down.
6. Never write history while `source` is `boot`, `popstate`, or `hashchange`, except for the
   single replace that step 3 or step 4 needs.

### 2.2 `open(patch)`

`patch` names the keys to add, for example `{ session: 'rs-1' }` or
`{ workbook: 'wb-1', exercise: 'ex-2' }`.

1. Merge the patch into the current route.
2. Validate the result. Reject a patch that skips a parent key.
3. Save the scroll positions of the current layer.
4. Ask the shell to push the new route.
5. Mount the new layer and move focus to its heading.

### 2.3 `back()`

1. Read the parent route with `parentRoute`.
2. When the parent is `null`, ask the shell to go to Home.
3. Otherwise ask the shell to go back to the parent route. The shell uses
   `history.back()` when an in-app entry exists, and a replace when none exists.
4. Unmount only the top layer.
5. Restore the parent scroll positions after the parent render.
6. Move focus to the parent layer heading.

`back()` must produce the same result as the browser Back control and the Android system
Back control, per FR-028. Both paths end in `applyRoute`, so one code path renders the
result.

## 3. Shell adapter

`js/main.js` supplies the adapter. The navigator never calls the History API and never
toggles a section class.

```js
shell = {
  activateSection(sectionId, { keep }),          // Show a section. No history write.
  pushRoute(route),                              // pushState with the routine route
  replaceRoute(route),                            // replaceState with the routine route
  backToRoute(parentRoute),                       // history.back() or replaceRoute
  goHome(),                                       // showSection('home')
  hasInAppHistory() -> boolean,                   // reads navPushCount > 0
}
```

`activateSection` must receive `keep: ['routines']` when the navigator shows the workbooks
section, so `stopOtherTools` does not stop the routines section. See decision D1 in
`research.md`.

## 4. Layer descriptors

The navigator holds no markup. Each layer supplies four callbacks.

```js
layers = {
  routine:   { host, mount, unmount, heading, status },
  session:   { host, mount, unmount, heading, status },
  workbook:  { host, mount, unmount, heading, status },
  exercise:  { host, mount, unmount, heading, status },
  companion: { host, mount, unmount, heading, status },
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `host` | `() => string` | The section id that hosts the layer. |
| `mount` | `(ctx) => void` | Render the layer for the route. Must not write history. |
| `unmount` | `(ctx) => void` | Flush pending saves, stop audio and timers, hide the layer. |
| `heading` | `() => Element \| null` | The element that receives focus. |
| `status` | `() => Element \| null` | The element that shows a non-blocking message. |

`ctx` carries `{ route, routine, session, workbook, exercise, companion }`.

Guarantee: the navigator calls `unmount` for a layer before it calls `mount` for a sibling
layer at the same depth. It never calls `unmount` on a parent layer while a child layer
shows, which satisfies FR-024 and FR-027.

## 5. Focus and scroll

1. Before the navigator opens a child layer, it stores `window.scrollY` and the
   `scrollTop` value of the parent layer host under the parent route key.
2. After the navigator mounts a layer, it sets `tabindex="-1"` on the heading element and
   calls `focus({ preventScroll: true })`.
3. After the navigator restores a parent layer, it restores both stored offsets, and it
   restores them after the parent render finishes.
4. The navigator clears a stored position when the player leaves the routine area.

The `preventScroll` option matters. Without it the browser scrolls the heading into view and
cancels the restore. See decision D14 in `research.md`.

## 6. Messages

The navigator writes the message `Item not found` to the `status` element of the deepest
valid layer. The message does not block use. The navigator clears the message on the next
successful route apply.

## 7. Call order for the common flows

### Open a session from the routine overview

```text
card click
  -> navigator.open({ session })
     -> save parent scroll
     -> shell.pushRoute(route)
     -> layers.session.mount(ctx)
     -> focus session heading
```

### Browser Back from the workbook layer

```text
popstate
  -> main.applyRoute({ id, params }, { source: 'popstate' })
     -> navigator.applyRoute(params, { source: 'popstate' })
        -> layers.workbook.unmount(ctx)
        -> layers.session.mount(ctx) when the session layer is not mounted
        -> restore session scroll
        -> focus session heading
```

### Boot on a deep address with no earlier history

```text
DOMContentLoaded
  -> main.applyRoute({ id: 'routines', params }, { source: 'boot' })
     -> navigator.applyRoute(params, { source: 'boot' })
        -> resolve route
        -> mount routine layer, then session layer, then workbook layer
        -> focus workbook heading
visible Musi Back control
  -> navigator.back()
     -> shell.backToRoute(parent)  // hasInAppHistory() is false, so replaceRoute runs
```

## 8. Invariants

| Invariant | Requirement |
| --- | --- |
| The visible stack always matches the address after `applyRoute` returns. | FR-031 |
| One deeper layer adds exactly one history entry. | FR-024, FR-030 |
| One Back press removes exactly one layer. | FR-025, SC-008 |
| A Back press never adds a history entry. | FR-030, SC-009 |
| A parent layer keeps its DOM and its state while a child layer shows. | FR-024, FR-027 |
| Back never returns to Home from a session, workbook, exercise, or companion layer. | FR-026 |
| Every layer control works with a keyboard and carries a spoken name. | FR-051, SC-015 |
| The navigator holds no store import and no markup. | FR-032 |

## 9. Test approach

The pure route rules live in `js/routineRoute.js`, so `tests/routine-nav/run.mjs` covers
them without a DOM. For the navigator itself, the suite may build a fake shell and fake
layer descriptors that record the call order, then assert:

1. `open` calls `pushRoute` once and mounts one layer.
2. `back` calls `backToRoute` once and unmounts one layer.
3. `applyRoute` with a `popstate` source writes no history.
4. A repair writes exactly one replace and shows one message.
5. A parent layer receives no `unmount` call while a child mounts.
