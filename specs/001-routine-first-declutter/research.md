# Phase 0 Research: Routine-First Declutter

**Created**: 2026-08-12

**Feature**: [spec.md](./spec.md)

**Input facts**: [research-inventory.md](./research-inventory.md)

This file records the technical decisions for the plan. Each decision states the choice,
the reason, the alternatives, and the evidence. Three research passes over the code
produced the evidence. The spec has no open `[NEEDS CLARIFICATION]` marker, so this
phase resolves design questions only.

## D1: Which surface hosts the workbook, exercise, and companion layers

**Decision**: The routines section hosts the routines list layer, the routine overview
layer, and the session layer. The workbooks section keeps its role as the host of the
workbook detail, the exercise player, and the companions. The routine navigator owns the
address, keeps the routines section mounted while a deeper layer shows, and overrides the
workbook back control. The feature does not move workbook detail into the routines
section, and it does not build a second workbook renderer.

**Rationale**: The app never unmounts a section. `showSection` only moves the `active`
class, so the routine layers stay in the document and keep their state. `stopRoutines`
flushes autosave, stops the session metronome, and closes dialogs. It does not clear
`selectedRoutineId` or `openSessionId`. `stopOtherTools(keepIds)` already accepts a keep
list, so the shell can hold the routines section alive while the workbooks section shows.
The observable requirements FR-024 to FR-028 ask for a live parent, a one-layer Back, and
a matching browser Back. This decision meets all of them without a workbook rewrite,
which FR-052 forbids.

**Alternatives considered**:

- *Mount the existing workbook detail inside a routine layer container.* Rejected.
  `initWorkbooks` binds eleven element ids and accepts no root argument. The detail state
  is a set of module singletons, including `openWorkbookId` and every `detail*` reference.
  `isDetailLoadStale` aborts a load when `#sec-workbooks` lacks the `active` class.
  `syncPracticeMode` and `installWbPracticeMetrics` write only to `#sec-workbooks`. The
  companion panel toggles the `wb-cmp-drawer-open` class on `document.body`. The keyboard
  shortcuts are document listeners that gate on the workbooks section. Each item needs a
  change inside workbook internals.
- *Write a routine-scoped workbook renderer over the shared mount helpers.* Rejected. It
  would repeat the entry list, the media-kind branches, the previous and next controls,
  the loop control, and the playlist drawer. That is a duplicate implementation of the
  largest view in the app.
- *Extract a shared workbook-detail module that takes a host element.* Rejected for this
  change, kept as follow-up work. It is the correct long-term move, and the Train, Study,
  and Create refactor is the right place for it. It is too large to combine with the Home
  change and the genre removal.

## D2: How the address carries the routine route

**Decision**: Add one pure module for address parsing, `js/appRoute.js`. It parses a
fragment of the form `id?key=value&key=value` into `{ id, params }`, and it builds the
same shape back. Add one pure module for the routine layers, `js/routineRoute.js`. It
validates the parameter set, calculates the parent route, and drops invalid child
parameters. `js/main.js` uses `js/appRoute.js` in the boot path, in `sectionUrl`, in the
`popstate` listener, and in the `hashchange` listener. The history state grows from
`{ musiNav: id }` to `{ musiNav: id, params }`.

**Rationale**: The router treats the whole fragment as a section id today, so
`routines?routine=r` matches no section and falls back to Home. One shared parser keeps
one owner of the address format. Two pure modules also give the feature a test surface
that needs no browser.

**Alternatives considered**:

- *Parse the fragment inside the routine navigator only.* Rejected. `main.js` must still
  recognise the section part in three places, so the format would have two owners.
- *Use a path router with the History API instead of a fragment.* Rejected. FR-029 keeps
  the current fragment shell, and a static host with no server rewrite rule cannot serve
  deep paths.

## D3: How the shell separates the address from the visible section

**Decision**: Split `showSection` into two functions. `applySection(id, { keep })` swaps
the visible section, runs `stopOtherTools([id, ...keep])`, runs `initTool(id)`, and
updates the chrome. It writes no history. `showSection(id, skipHash, params)` writes the
history entry through `js/appRoute.js`, then calls `applySection`. Add
`applyRoute({ id, params })`, which the boot path, the `popstate` listener, and the
`hashchange` listener all call. For the id `routines`, `applyRoute` calls the routine
navigator, and the navigator decides which section hosts the top layer.

**Rationale**: A routine route needs a visible workbooks section while the address still
reads `#routines?...`. Today `showSection` always rewrites the address from the section
id, even when the caller passes `skipHash`, so it would destroy the routine parameters.
The split keeps every existing caller of `showSection` unchanged and gives the navigator
a way to show a host section without touching the address.

**Alternatives considered**:

- *Teach `sectionUrl` about the active routine route.* Rejected. It would couple the
  address builder to navigator state and hide the coupling from the reader.
- *Push a `#workbooks?...` address for the workbook layer.* Rejected. FR-029 fixes the
  address shape, and a deep link must name the routine route.

## D4: Where the routine card gets its data

**Decision**: Home reads the list with `listRoutines()`, the counts with
`getRoutineStats(routine)`, and the current session with
`getActiveRoutineSession(routine.id)`. A new pure module,
`js/routineDashboardModel.js`, turns those values into card models and applies the sort.
Home renders from the card models.

**Rationale**: Every value already exists. `getRoutineStats` returns
`completedSessionCount` and `sessionCount`, which FR-003 needs. The card model module must
apply the full sort itself, because `listRoutines()` sorts by `updatedAt` descending only.
Two routines with the same `updatedAt` value keep their insertion order today, so the
module adds the `name` tiebreak that FR-005 requires.
`getActiveRoutineSession` resolves the `activeSessionId` bookmark, and it falls back to
the first incomplete session when the bookmark is absent or already complete. It returns
`null` when every session is complete, which matches the edge case where the card omits
the session name and shows a full progress indicator. A pure card-model module keeps the
sort rule and the count rule under test without a browser.

**Alternatives considered**:

- *Compute the counts inside the render function.* Rejected. The sort rule in FR-005 and
  the count rule in FR-003 both need tests, and a render function needs a DOM.
- *Add a new store function for card data.* Rejected. It would duplicate
  `getRoutineStats`.

## D5: How Home learns that routine data changed

**Decision**: Home subscribes to the existing `musi:data-changed` event through
`js/dataEvents.js`, and it re-renders when `detail.domain` equals `routines`.

**Rationale**: `routineModel.persist()` already calls `emitDataChanged('routines')` on
every successful write, so the signal exists and needs no new event. Home already uses a
window event for `musi:features-changed`, so the pattern matches the file.

**Alternatives considered**:

- *Add a routine-specific event.* Rejected. A second event for the same fact invites
  drift.
- *Re-render Home only on navigation.* Rejected. FR-007 asks for an update without a
  manual reload.

## D6: How Home creates and imports a routine

**Decision**: `js/routines.js` gains two exported functions,
`createRoutineFromPrompt(options)` and `importRoutineFromFile(options)`. They hold the
existing prompt flow and the existing file-picker flow. Home calls them. Home does not
call `createRoutine` or `applyRoutineImport` directly.

**Rationale**: The create flow and the import flow live in private functions today,
`onNewRoutine` and `onImportFile`. The dialog root already sits on `document.body`, so
the flows work from any screen. One owner of the flow prevents two prompts with different
validation and different status text.

**Alternatives considered**:

- *Call the store from Home.* Rejected. Home would repeat the name validation, the
  workbook creation callback, and the status messages.
- *Move both flows into a new module.* Rejected for this change. It moves code without a
  need, because the exports already give Home what it needs.

## D7: How the exercise layer differs from the workbook layer

**Decision**: The `workbook` parameter opens the workbook layer and shows the entry list.
The `exercise` parameter selects the entry and shows the player. Back from the exercise
route drops the `exercise` parameter and returns the entry list.

**Rationale**: The app has no separate exercise screen. An exercise is the active entry
inside workbook detail, which the playlist drawer already lists. This mapping gives the
two routes a real visible difference, so a one-layer Back has a meaning, and it uses the
existing `setActiveWorkbookEntry` and `loadCurrentExercise` path.

**Alternatives considered**:

- *Treat the workbook route and the exercise route as one layer.* Rejected. FR-023 lists
  them as separate layers, and the test list requires that Back from an exercise returns
  the workbook.
- *Build a full-screen exercise layer.* Rejected. It duplicates the player.

## D8: How the companion route resolves

**Decision**: The navigator resolves `companion=<id>` against the session. It reads
`session.workbookIds` in order, loads each workbook, and picks the first workbook whose
`companions` array holds the id. It then opens that workbook layer, activates the Tools
subview, and expands the companion. Back returns the session layer, so the companion sits
directly above the session.

**Rationale**: A companion belongs to a workbook in the data model. A session references
workbooks, so the session can reach a companion only through them. The workbook detail
already mounts companions in the Tools subview, so no new host is needed. The Back target
follows FR test "Session → companion → Back returns session".

**Alternatives considered**:

- *Require a `workbook` parameter with the companion.* Rejected. FR-029 fixes the address
  shape, and it lists the companion route without a workbook parameter.
- *Store companions on the session.* Rejected. It changes the stored shape, and FR-046
  forbids that.

## D9: What Home keeps as the secondary tool action

**Decision**: Home keeps the existing collapsed `All tools` panel as its single secondary
action, and Home renders it after the routine cards. Home deletes the hero block, the
continue card, the Quick Start block, the Recommended Study block, the hidden stats block,
and the Categories block.

**Rationale**: FR-008 forbids an expanded tool catalog on Home. FR-009 asks for one small
secondary action that opens the existing tool browser. The panel is a collapsed
`<details>` element, so Home shows one summary line until the player opens it. This keeps
the global tool search that `renderAllTools` already provides, and it adds no new section.

**Alternatives considered**:

- *Send the player to the Tools hub.* Rejected. A hub lists one category, so the player
  loses the search across every tool.
- *Add a new all-tools section.* Rejected. `isValidSection` accepts only `home`, a hub id,
  or a tool id, so a new section needs a new tool entry and a new dock item. That is more
  surface for no gain.

## D10: How the genre system leaves the product

**Decision**: Delete `js/genreProfiles.js`, `js/musicProfile.js`, and
`js/studyRecommendations.js`. Keep `js/studyCatalog.js`, `js/studyProgress.js`,
`js/studyLab.js`, `js/studyLabModel.js`, and `js/studyLabMic.js`. Study Lab selects a
default study from the catalog when the caller names no study, and it calls
`recordStudyStarted` and `recordStudyCompleted` on `js/studyProgress.js` directly. Delete
the genre blocks from `js/musicPreferences.js` and the genre render path from
`js/home.js`. Delete `tests/study-recs/run.mjs`.

**Rationale**: The three deleted modules exist only to rank genre recommendations.
`js/studyProgress.js` holds review history and no genre logic, and Study Lab needs it to
record a completion. The catalog holds the studies that Study Lab runs. The existing
fallback study id in the code is `major-scale-construction`, so a default already exists.

**Alternatives considered**:

- *Delete `js/studyProgress.js` too.* Rejected. Study Lab would lose completion recording,
  and the `study.progress` key would lose its writer while sync still carries it.
- *Delete Study Lab.* Rejected. FR-043 keeps it.

## D11: How stored genre values stay compatible

**Decision**: Keep `profile.music` and `study.progress` in the sync record map and in the
cloud reconcile rules as opaque keys. Read neither key for behavior. Run no migration and
delete no stored value.

**Rationale**: FR-041 keeps the stored values, and FR-048 requires that an older settings
import still applies. `tests/sync/profile.mjs` and `tests/cloud/recordMap.mjs` hold both
keys in their fixtures. An opaque passthrough keeps those suites green with no fixture
edit, and it keeps an old bundle round-trip lossless.

**Alternatives considered**:

- *Drop both keys from the sync scopes.* Rejected. It breaks two suites and it silently
  discards a user value during an import.
- *Delete the stored keys at boot.* Rejected. FR-041 forbids a destructive migration.

## D12: What happens to the genre stylesheet

**Decision**: Rename `css/study-recs.css` to `css/settings.css` with `git mv`, then
delete the genre-only rules from it. Keep the shared Settings rules, which include
`.mp-block`, `.mp-feature-*`, and `.mp-cleanup-*`. Delete the `.home-rec-*` overrides from
`css/theme-gbc.css`. Audit `css/mobile-ux.css` and `css/ux-shell.css` for `home-*` rules
that lose their last consumer. Update the stylesheet link in `index.html` and the precache
list in `service-worker.js`.

**Rationale**: The file mixes genre rules with the Settings rules that stay, so a plain
delete would strip styles from Settings blocks that FR-042 keeps. A rename keeps the file
history and gives the file a name that matches its remaining content.

**Alternatives considered**:

- *Delete the file and move the shared rules into `css/base.css`.* Rejected. It grows the
  base stylesheet with feature rules and loses the file history.
- *Keep the file name.* Rejected. The name would describe a feature that no longer exists.

## D13: How the feature shows an "Item not found" message

**Decision**: Reuse the existing status pattern. The navigator writes to the routines
status element `#rt-status` through the routines `setStatus` function when the fallback
layer sits inside the routines section. Add one small status region to Home, with
`role="status"`, for the case where an invalid routine identifier sends the player to
Home.

**Rationale**: The app has no shared toast module. Each feature owns a status element, and
routines already has `#rt-status` with an error class. Home has no status element today, so
FR-036 needs one small addition.

**Alternatives considered**:

- *Add a shared toast module.* Rejected. It is new shared infrastructure that this feature
  does not need, and it would touch every feature that already has a status line.
- *Use a blocking dialog.* Rejected. FR-035 requires a message that does not block use.

## D14: How focus and scroll behave across layers

**Decision**: The navigator sets `tabindex="-1"` on the heading element of the new layer,
then calls `focus({ preventScroll: true })`. Before it opens a child layer, the navigator
stores the window scroll offset and the scroll offset of the layer container under the
parent route key. After Back, the navigator restores both offsets after the render.

**Rationale**: The app has no navigation focus pattern and no scroll save or restore
logic. The closest precedent is the initial focus that dialogs and sheets set. The
`preventScroll` option stops the browser from cancelling the restore that follows.

**Alternatives considered**:

- *Rely on the browser scroll restoration.* Rejected. The layers live in one document and
  the app never reloads, so the browser has no entry to restore.
- *Scroll to the top of each layer.* Rejected. FR-025 and SC-010 require the earlier
  position.

## D15: How the feature stays testable without a browser

**Decision**: Keep the layer logic in three pure modules: `js/appRoute.js`,
`js/routineRoute.js`, and `js/routineDashboardModel.js`. Keep the DOM work and the
history work in `js/routineNav.js`. Add `tests/routine-nav/run.mjs` for the two route
modules. Extend `tests/routines/run.mjs` for the dashboard model. Add
`tests/genre-removal/run.mjs`, which reads the source files and asserts that no module
imports a deleted genre module and that no module reads `profile.music` outside the sync
passthrough allowlist.

**Rationale**: The repository has no test framework and no headless browser. Pure modules
run in Node with `node:assert/strict`, which every existing suite already uses. A source
scan is a cheap and exact guard for FR-040 and FR-045, which a Node suite cannot check by
running the app.

**Alternatives considered**:

- *Add a headless browser and a test framework.* Rejected. The constitution forbids new
  tooling of that size, and no suite uses it today.
- *Test the navigator through a DOM shim.* Kept as an option, not a requirement. The
  existing shims in `tests/cloud/harness.mjs` and `tests/gp-player/domShim.mjs` can cover
  a smoke mount if time allows.

## D16: What the service worker needs

**Decision**: Add `js/appRoute.js`, `js/routineRoute.js`, `js/routineDashboardModel.js`,
`js/routineNav.js`, and `css/settings.css` to `PRECACHE_URLS`. Remove
`js/genreProfiles.js`, `js/musicProfile.js`, and `css/study-recs.css`. Bump
`CACHE_VERSION` to a new string.

**Rationale**: `PRECACHE_URLS` is a static array, and the `activate` handler deletes every
cache whose name differs from `CACHE_NAME`. Without a bump, a returning player keeps the
old files and the app breaks on a missing module.

## D17: In which order the work lands

**Decision**: Implement in five stages, and keep each stage able to run: first the genre
removal, then the Home dashboard, then the address and navigator work for the routine and
session layers, then the workbook, exercise, and companion layers, and last the removal of
the target duration input with the test additions.

**Rationale**: The genre removal shrinks `js/home.js` before the Home rewrite, so the
rewrite starts from a smaller file. The Home dashboard needs no route work, because a card
can open a routine with the existing section navigation. The route work then upgrades the
same path. The four user stories in the spec carry the same order, so each stage ends at a
demonstrable state.

## Open risks

| Risk | Effect | Response |
| --- | --- | --- |
| `history.back()` may land on an entry that is not the parent route. | Back could skip a layer. | The shell applies the route from the history state, and the navigator reconciles the stack with the address, so a mismatch self-corrects. |
| The workbooks section runs `stopWorkbooks` when the player leaves it. | A routine could lose the open workbook layer. | The navigator passes a keep list, so the shell stops neither the routines section nor the workbooks section while a routine route owns the layer. |
| `initWorkbooks` runs on every visit and consumes a one-shot pending id. | A deep link could open the wrong workbook. | The navigator drives the open from the route on every apply, and it stops using the one-shot value for routine routes. |
| Deleting Home blocks may leave dead style rules in four stylesheets. | Dead code and confusing styles. | D12 lists the stylesheets to audit, and the change removes the rules that lose their last consumer. |
| The change touches Home, Settings, routines, workbooks, and the router at once. | A large review. | D17 splits the work into five stages that each run. |
