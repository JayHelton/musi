---

description: "Task list for the Routine-First Declutter feature"
---

# Tasks: Routine-First Declutter

**Input**: Design documents from `/specs/001-routine-first-declutter/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/),
[research-inventory.md](./research-inventory.md), [quickstart.md](./quickstart.md)

**Tests**: Tests are required for this feature. The specification asks for Home coverage,
routine history coverage, and genre-removal coverage. It also asks for characterization
tests before any behavior change.

**Organization**: Tasks group by user story. Each story phase ends at a checkpoint where a
person can test that story on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: The task can run in parallel. It touches a different file and it waits for no
  incomplete task.
- **[Story]**: The user story that the task serves, for example US1.
- Every task names the exact file path.

## Path Conventions

This repository is a flat static PWA. Web app source sits at the repository root in `js/`
and `css/`. Tests sit in `tests/<area>/run.mjs`. The CLI sits in `cli/` and this feature
does not touch it. See the Project Structure section of `plan.md`.

## Verification commands

Run these from the repository root. Use them at every checkpoint.

```bash
node tests/routines/run.mjs
node tests/routine-nav/run.mjs
node tests/genre-removal/run.mjs
node tests/workbooks/run.mjs
node tests/study-lab/run.mjs
node tests/companions/run.mjs
node tests/cloud/run.mjs
node tests/sync/profile.mjs
cd cli && node bin/musi.js --help
python3 -m http.server 8080     # then exercise http://localhost:8080
```

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Record the green baseline, then lock the stored data behavior with
characterization tests. These tests must pass before and after every later task.

- [X] T001 Run the baseline suites and record the final line of each: `node tests/routines/run.mjs`, `node tests/workbooks/run.mjs`, `node tests/study-lab/run.mjs`, `node tests/study-recs/run.mjs`, `node tests/companions/run.mjs`, `node tests/cloud/run.mjs`, `node tests/sync/profile.mjs`, and `cd cli && node bin/musi.js --help`
- [X] T002 Add export characterization tests to `tests/routines/run.mjs`: `buildRoutineExport` keeps `app`, `kind`, `version`, `createdAt`, `routines`, and `workbooks`; a session keeps its `durationMin` value through `serializeRoutineExport` and `applyRoutineImport`; `applyRoutineImport` resets `activeSessionId` to `null`; two imports of one file produce two routines
- [X] T003 Add derived-value characterization tests to `tests/routines/run.mjs`: `getRoutineStats` returns `sessionCount`, `completedSessionCount`, and `totalMinutes` for a routine with mixed completion; `getActiveRoutineSession` returns the session that `activeSessionId` names; `getActiveRoutineSession` falls back to the first incomplete session when the bookmark is complete; `getActiveRoutineSession` returns `null` when every session is complete
- [X] T004 [P] Add a JSON Schema check to `tests/routines/run.mjs` that reads `specs/001-routine-first-declutter/contracts/routine-export.v1.json` and validates a serialized export against the required fields, the `const` values, and the presence of `durationMin`

**Checkpoint**: The stored shape and the export format now have a test guard. Every later
phase must keep these tests green.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Break the genre imports out of two files that later phases rewrite. Both edits
are small and each one leaves the app runnable.

**⚠️ CRITICAL**: T005 blocks User Story 1, because User Story 1 rewrites the same render
path in `js/home.js`. T005 and T006 both block User Story 4, because User Story 4 deletes
the modules that these two files import today.

- [X] T005 Remove the genre call sites from `js/home.js`: delete `renderStudyRec` and `startStudy`, delete the imports of `./studyRecommendations.js` and `./musicProfile.js`, delete the `buildRecommendations` branch in `wireHero` so the primary label falls back to `Continue` or `Start practice`, and delete the `#home-study-rec` write from `render`
- [X] T006 [P] Remove the recommendation dependency from `js/studyLab.js`: delete the import of `./studyRecommendations.js`, select the default study `major-scale-construction` from `js/studyCatalog.js` with `getStudyById` when the caller names no study, and call `recordStudyStarted` and `recordStudyCompleted` from `js/studyProgress.js` directly

**Checkpoint**: Home renders without the recommendation card. Study Lab opens a study with
no genre configuration. `js/musicPreferences.js` is now the only remaining importer of the
genre modules.

---

## Phase 3: User Story 1 - Reach every routine from Home (Priority: P1) 🎯 MVP

**Goal**: Home shows one card for every stored routine, with the routine name, the
description, the current session name, the counts, and a progress indicator. A card opens
that routine. Home offers `New Routine` and `Import Routine`, and an empty state.

**Independent Test**: Seed zero routines, then one, then three, with the snippets in
`quickstart.md`. Confirm the card count, the card content, the sort order, and that a card
opens its routine. Confirm that the removed Home blocks no longer render.

### Tests for User Story 1

- [X] T007 [US1] Add dashboard model tests to `tests/routines/run.mjs`: an empty routine list returns an empty card list; three routines sort by `updatedAt` descending; two routines with the same `updatedAt` sort by `name` ascending; a card carries `name`, `description`, `currentSessionName`, `completedCount`, `totalCount`, and `progress`; a routine with no session reports a total of zero and no current session name; a routine with every session complete reports a full progress value

### Implementation for User Story 1

- [X] T008 [US1] Create `js/routineDashboardModel.js` with the pure exports `buildRoutineCardModels(routines, { getStats, getActiveSession })` and `sortRoutineCards(cards)`, and apply the `updatedAt` descending sort with the `name` ascending tiebreak, because `listRoutines()` in `js/routineModel.js` sorts by `updatedAt` only
- [X] T009 [P] [US1] Add the export `openRoutineById(routineId)` to `js/routines.js` so another screen can select a routine, following the existing `requestWorkbookOpen` pattern in `js/workbooks.js`. User Story 2 replaces this bridge with a route call
- [X] T010 [P] [US1] Add the exports `createRoutineFromPrompt(options)` and `importRoutineFromFile(options)` to `js/routines.js`, moving the bodies of the private `onNewRoutine` and `onImportFile` so both flows keep one owner and both work from Home
- [X] T011 [US1] Update the `#sec-home` markup in `index.html`: delete `#gbc-hero`, `#home-continue`, `#home-quickstart`, `#home-study-rec`, `#home-stats`, and `#home-categories`; add `#home-routines`; add a small `#home-status` region with `role="status"`; keep `#home-all-panel` collapsed as the secondary `Browse tools` action
- [X] T012 [US1] Rewrite `render` in `js/home.js` to draw the `Routines` heading, the routine cards from `js/routineDashboardModel.js`, the `New Routine` action, the `Import Routine` action, and the empty state with the title `No routines yet` and the text `Create a routine or import a Musi routine file.`; delete `renderContinue`, `renderQuickStart`, and `renderCategories`; keep `renderHub`, `toolRow`, `renderAllTools`, and the favorites helpers
- [X] T013 [US1] Subscribe Home to routine changes in `initHome` in `js/home.js` with `onDataChanged` from `js/dataEvents.js`, and re-render when `detail.domain` equals `routines`
- [X] T014 [US1] Remove the `renderStats()` call from the Home branch of `showSection` in `js/main.js`, and keep `js/stats.js` in place for `recordAttempt`
- [X] T015 [P] [US1] Add the routine card styles and the empty state styles to `css/routines.css` with a responsive grid, and reuse `--card`, `--border`, `--accent`, `--muted`, `--radius-screen`, `--radius-pill`, `--font-pixel`, `--font-body`, and `--font-ui`; add no new colour value and no new font family
- [X] T016 [US1] Make the whole card one control in `js/home.js`: give it a button role, an accessible name that reads the routine name, a visible focus ring in `css/routines.css`, and no separate start control
- [X] T017 [US1] Delete the style rules that lost their last consumer in `css/theme-gbc.css`, `css/mobile-ux.css`, and `css/ux-shell.css`, which include the `.home-rec-*`, `.home-continue`, `.home-quick-*`, `.home-cat-*`, and `.gbc-hero*` rules

**Checkpoint**: Home is routine-first. `node tests/routines/run.mjs` passes. The manual
checks 1 to 11 in `quickstart.md` pass.

---

## Phase 4: User Story 2 - Move through routine layers and step back one layer (Priority: P2)

**Goal**: Routine content behaves as a stack of layers. One Back press moves up exactly one
layer, for the visible Musi Back control and for the browser Back control. A deep address
rebuilds the layers, and an invalid child identifier falls back to the deepest valid parent.

**Independent Test**: Open a routine, a session, a workbook, and an exercise. Press Back
four times and confirm one layer per press. Repeat with the browser Back control. Open a
deep address in a new tab and confirm the rebuilt layers.

### Tests for User Story 2

- [X] T018 [P] [US2] Create `tests/routine-nav/run.mjs` and cover the `js/appRoute.js` rows of the test matrix in `contracts/routine-route.md`: parse with and without a leading `#`, parse an empty value, decode a percent-encoded id, keep the last value of a repeated key, build with an empty parameter set, build in the fixed key order, and build then parse to the same route
- [X] T019 [US2] Extend `tests/routine-nav/run.mjs` with the `js/routineRoute.js` rows of the same matrix: `routeLayer` and `parentRoute` for all six states, `routeDepth` from 0 to 4, a `session` key without a `routine` key, an `exercise` key beside a `companion` key, and the five repair cases that produce the reasons `routine-missing`, `session-missing`, `workbook-missing`, `exercise-missing`, and `companion-missing`, including a companion held by the second attached workbook

### Implementation for User Story 2

- [X] T020 [P] [US2] Create `js/appRoute.js` with the pure exports `parseAppRoute`, `buildAppRoute`, `routeUrl`, and `sameRoute`, following the ten rules in section 2 of `contracts/routine-route.md`
- [X] T021 [P] [US2] Create `js/routineRoute.js` with the pure exports `ROUTINE_ROUTE_ID`, `ROUTINE_PARAM_KEYS`, `parseRoutineRoute`, `buildRoutineParams`, `routeLayer`, `parentRoute`, `routeDepth`, and `resolveRoutineRoute`, following sections 3.1 to 3.5 of `contracts/routine-route.md`
- [X] T022 [US2] Split `showSection` in `js/main.js` into `applySection(id, { keep })`, which swaps the visible section and runs `stopOtherTools([id, ...keep])` and `initTool(id)` and writes no history, and `showSection(id, skipHash, params)`, which writes the history entry and then calls `applySection`; keep every existing call site working
- [X] T023 [US2] Add `applyRoute({ id, params, mode })` to `js/main.js`, call it from the boot path, the `popstate` listener, and the `hashchange` listener, use `js/appRoute.js` inside `sectionUrl`, and store `{ musiNav: id, params }` in the history state
- [X] T024 [US2] Create `js/routineNav.js` with `createRoutineNavigator(config)` per `contracts/routine-navigator.md`, including `applyRoute`, `open`, `back`, `currentRoute`, `currentLayer`, and `destroy`, plus the scroll save and restore, the heading focus with `focus({ preventScroll: true })`, and the shell adapter calls
- [X] T025 [US2] Build the shell adapter in `js/main.js` with `activateSection`, `pushRoute`, `replaceRoute`, `backToRoute`, `goHome`, and `hasInAppHistory`, and hand the routine parameters to the navigator when the route id is `routines`
- [X] T026 [US2] Add the routine layer descriptor and the session layer descriptor in `js/routines.js`, drive `selectedRoutineId` and `openSessionId` from the route instead of from click state, and change the `#rt-session-back` handler to call the navigator `back` method
- [X] T027 [US2] Replace the Home card bridge: change the card handler in `js/home.js` to open the route `#routines?routine=<id>` through the navigator, and delete the `openRoutineById` export from `js/routines.js` that T009 added
- [X] T028 [US2] Add the four seam exports to `js/workbooks.js` per `contracts/workbook-layer-seam.md`: `openWorkbookForRoute`, `closeWorkbookLayer`, `setWorkbookBackTarget`, and `onWorkbookEntryChange`; make `openWorkbookForRoute` idempotent so a repeated route does not restart playback; read the stored back target every time the render path draws a back control, including inside `buildGpHeaderExtra`
- [X] T029 [US2] Add the workbook layer descriptor and the exercise layer descriptor in `js/routineNav.js`, request `activateSection('workbooks', { keep: ['routines'] })`, set the back label `← Session`, and show the entry list when the route holds no `exercise` key and the player when it holds one
- [X] T030 [US2] Add the companion layer in `js/routineNav.js`: resolve the companion through `session.workbookIds` with the `getCompanion` lookup, open that workbook, activate the Tools subview, expand the companion, and make Back return the session layer
- [X] T031 [US2] Replace the section jump in `js/routines.js`: change the `Practice` control in `renderWorkbooksCard` to call the navigator `open` method with the workbook key, and delete the private `navigateToWorkbooks` helper and the `requestWorkbookOpen` call that it used
- [X] T032 [US2] Follow the selected entry in `js/routineNav.js`: subscribe with `onWorkbookEntryChange` and ask the shell to replace the address with the new `exercise` value, so a previous, next, or automatic advance adds no history entry
- [X] T033 [US2] Handle the direct link in `js/routineNav.js`: rebuild every parent layer on a boot apply, and make the visible Musi Back control replace the address with the parent route when `hasInAppHistory()` returns false
- [X] T034 [US2] Handle an invalid identifier in `js/routineNav.js`: replace the address with the repaired route, show the message `Item not found` on the status element of the deepest valid layer through the routines `setStatus` function, use `#home-status` when the routine identifier itself fails, and clear the message on the next successful apply
- [X] T035 [US2] Add navigator tests to `tests/routine-nav/run.mjs` with a fake shell and fake layer descriptors that record the call order, and assert the five cases in section 9 of `contracts/routine-navigator.md`
- [X] T036 [P] [US2] Add the layer styles to `css/routines.css` so a child layer covers its parent on a phone width and sits beside it on a desktop width, and reuse the existing `rt-*` classes and the theme tokens

**Checkpoint**: The layer stack works for every depth. `node tests/routine-nav/run.mjs`
passes. The manual checks 12 to 22 in `quickstart.md` pass.

---

## Phase 5: User Story 3 - Open routine content without a tracked practice session (Priority: P3)

**Goal**: The routine flow opens content at once. It shows no start control, no clock, and
no time summary. `durationMin` stays in storage and in the export.

**Independent Test**: Open a session and confirm that no start control, no countdown, and
no elapsed time appears, and that the completion state does not change. Export the routine
and confirm that `durationMin` survives.

### Tests for User Story 3

- [X] T037 [US3] Add session-open tests to `tests/routines/run.mjs`: `setActiveRoutineSession` does not change `completed`; `updateRoutineSession` keeps an existing `durationMin` value when the caller passes other fields; `setRoutineSessionCompleted` changes one routine only and leaves every other routine untouched

### Implementation for User Story 3

- [X] T038 [US3] Delete the target duration control from `renderMetronomeCard` in `js/routines.js`, which includes the text node `Target duration (min)`, the input with the `aria-label` `Target duration in minutes`, and the placeholder `None`; keep the stored value and keep every metronome control
- [X] T039 [US3] Audit `js/routines.js` and `js/routineMetronome.js` for any elapsed display, countdown display, automatic timer start, or time summary, and delete what you find; keep the beat indicator and the `Play` and `Stop` controls
- [X] T040 [US3] Remove the total-minutes stat chip from `renderOverview` in `js/routines.js` if it renders `totalMinutes` from `getRoutineStats`, and keep `getRoutineStats` unchanged because the export and the tests use it
- [X] T041 [US3] Confirm that no routine layer creates a transient practice-session record: check the mount path of every layer descriptor in `js/routineNav.js` and the session layer mount in `js/routines.js`

**Checkpoint**: No clock appears anywhere in the routine flow. `node tests/routines/run.mjs`
passes. The manual checks 23 to 27 in `quickstart.md` pass.

---

## Phase 6: User Story 4 - Practice without genre setup (Priority: P4)

**Goal**: No genre control renders on Home or in Settings. The app reads no genre profile
data. Study Lab still runs. Settings keeps the controls that the player needs.

**Independent Test**: Open Home and Settings and confirm that no genre control appears. Open
Study Lab and confirm that a study runs. Reload with a stale `profile.music` value and
confirm that the app leaves it untouched.

### Tests for User Story 4

- [X] T042 [P] [US4] Create `tests/genre-removal/run.mjs` as a source guard: assert that `js/genreProfiles.js`, `js/musicProfile.js`, and `js/studyRecommendations.js` do not exist; assert that no file under `js/` imports them; assert that no file under `js/` reads or writes `profile.music` except the sync passthrough allowlist `js/sync/syncProfile.js`, `js/sync/syncUI.js`, `js/cloud/recordMap.js`, and `js/cloud/reconcile.js`; assert that `index.html` links no `css/study-recs.css`. The suite fails until T043 to T047 complete

### Implementation for User Story 4

- [X] T043 [US4] Delete the genre blocks from `js/musicPreferences.js`: the `Active profile` banner, `Genre priorities` with `#mp-genre-groups`, `Learning goals` with `#mp-goals`, `Study balance` with `#mp-balance`, `Application preference` with `#mp-apps`, `Pause topics` with `#mp-exclusions`, and `Preview` with `#mp-preview`, plus their painters and the imports of the genre modules; keep `#mp-context-block`, `#mp-volume-block`, `#mp-sync-block`, `#mp-cloud-block`, `#mp-library-cleanup`, and `#mp-features`
- [X] T044 [US4] Rewrite the Settings help text in `js/musicPreferences.js` so no sentence mentions a genre, a learning goal, a study balance, or a recommendation
- [X] T045 [US4] Delete `js/genreProfiles.js`, `js/musicProfile.js`, and `js/studyRecommendations.js`
- [X] T046 [P] [US4] Delete `tests/study-recs/run.mjs`, and rename the test `genre concepts emphasize flat2 / tritone` in `tests/study-lab/run.mjs` so the name matches its concept-to-interval assertion
- [X] T047 [US4] Rename the stylesheet with `git mv css/study-recs.css css/settings.css`, delete the genre-only rules from it, which include `.home-rec-*`, `.mp-genre-*`, `.mp-balance*`, `.mp-preview*`, and `.mp-banner*`, keep the shared Settings rules `.mp-block`, `.mp-feature-*`, and `.mp-cleanup-*`, and update the stylesheet link in `index.html`
- [X] T048 [P] [US4] Rewrite the `musicprefs` description in `js/tools.js`, because it still reads `Feature visibility, genre priorities, learning goals, and study recommendation balance.`
- [X] T049 [US4] Confirm the opaque sync passthrough: keep `profile.music` and `study.progress` in `js/sync/syncProfile.js`, `js/sync/syncUI.js`, `js/cloud/recordMap.js`, and `js/cloud/reconcile.js`, read neither key for behavior, run no migration, and confirm that `node tests/sync/profile.mjs` and `node tests/cloud/run.mjs` pass with no fixture edit

**Checkpoint**: `node tests/genre-removal/run.mjs` passes. Settings and Study Lab work with
no genre configuration. The manual checks 28 to 32 in `quickstart.md` pass.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Ship-readiness work that spans the stories.

- [X] T050 Update `service-worker.js`: add `js/appRoute.js`, `js/routineRoute.js`, `js/routineDashboardModel.js`, `js/routineNav.js`, and `css/settings.css` to `PRECACHE_URLS`; remove `js/genreProfiles.js`, `js/musicProfile.js`, and `css/study-recs.css`; bump `CACHE_VERSION` to a new string
- [X] T051 [P] Update `README.md` where it describes the Home layout or the genre settings
- [X] T052 [P] Add one sentence to `docs/supabase-sync-client.md` and `docs/supabase-sync-plan.md` that states `profile.music` is now inert data that sync carries as an opaque key
- [X] T053 Run every suite: `node tests/routines/run.mjs`, `node tests/routine-nav/run.mjs`, `node tests/genre-removal/run.mjs`, `node tests/workbooks/run.mjs`, `node tests/study-lab/run.mjs`, `node tests/companions/run.mjs`, `node tests/cloud/run.mjs`, `node tests/sync/profile.mjs`, and `cd cli && node bin/musi.js --help`
- [X] T054 Run every manual check in `quickstart.md` in a browser over `python3 -m http.server 8080`, and confirm that the browser error log stays empty on Home, in Settings, and in Study Lab
- [X] T055 Run the import and export check in `quickstart.md`, and confirm that `durationMin` survives the round trip and that no screen shows it
- [X] T056 Confirm the theme rule from FR-050: the routine cards and the routine layers add no new colour value and no new font family, measured against `css/base.css` and `css/theme-gbc.css`
- [X] T057 Delete every temporary debug statement that the implementation added, and confirm that `js/` holds no leftover console call from this work

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: No dependency. Start here, because T002 to T004 lock the stored data
  behavior before any change.
- **Foundational (Phase 2)**: Depends on Phase 1. T005 blocks User Story 1. T005 and T006
  block User Story 4.
- **User Story 1 (Phase 3)**: Depends on T005.
- **User Story 2 (Phase 4)**: Depends on Phase 1. It also needs T012 in place before T027,
  because T027 replaces the Home card bridge.
- **User Story 3 (Phase 5)**: Depends on Phase 1 only. T041 reads `js/routineNav.js`, so run
  it after Phase 4 if that file exists.
- **User Story 4 (Phase 6)**: Depends on T005 and T006.
- **Polish (Phase 7)**: Depends on every story that you plan to ship.

### Story dependencies

- **User Story 1 (P1)**: Independent after T005. T009 gives it a temporary bridge, so it
  ships without the route work.
- **User Story 2 (P2)**: Independent after Phase 1. It supersedes the T009 bridge.
- **User Story 3 (P3)**: Independent. It touches the session pane and the metronome card
  only.
- **User Story 4 (P4)**: Independent after Phase 2. It touches Settings, Study Lab, the
  deleted modules, and the stylesheet.

### File conflicts to respect

| File | Tasks that write it | Rule |
| --- | --- | --- |
| `js/home.js` | T005, T012, T013, T016, T027 | Run in this order. Never in parallel. |
| `js/routines.js` | T009, T010, T026, T031, T038, T039, T040 | Run in this order. Never in parallel. |
| `js/main.js` | T014, T022, T023, T025 | Run in this order. Never in parallel. |
| `tests/routines/run.mjs` | T002, T003, T004, T007, T037 | Run in this order. Never in parallel. |
| `tests/routine-nav/run.mjs` | T018, T019, T035 | Run in this order. Never in parallel. |
| `index.html` | T011, T047 | Different regions, but run in this order. |
| `css/routines.css` | T015, T016, T036 | Run in this order. |

### Parallel opportunities

- T004 runs beside T002 and T003 only after they land, because all three write
  `tests/routines/run.mjs`. Treat T004 as parallel with work in other files.
- T006 runs beside T005.
- T009 and T010 run beside T008, because they touch different files.
- T015 runs beside T012 and T013.
- T018, T020, and T021 run together, because each one writes a different new file.
- T036 runs beside any task in Phase 4 that writes JavaScript.
- T042, T046, and T048 run together.
- T051 and T052 run together.

---

## Parallel Example: User Story 2

```bash
# Launch the three new-file tasks together:
Task: "T018 Create tests/routine-nav/run.mjs with the appRoute cases"
Task: "T020 Create js/appRoute.js with parseAppRoute, buildAppRoute, routeUrl, sameRoute"
Task: "T021 Create js/routineRoute.js with the layer and repair rules"

# Then launch the shell work and the style work together:
Task: "T022 Split showSection into applySection and showSection in js/main.js"
Task: "T036 Add the layer styles to css/routines.css"
```

---

## Implementation Strategy

### Recommended order

Follow the phase order above: Setup, Foundational, User Story 1, User Story 2, User Story 3,
User Story 4, Polish. This order matches the five delivery stages in `plan.md`, with one
change. The plan puts the whole genre removal first. The task list moves only the two
blocking edits into Phase 2, and it keeps the rest of the genre removal in Phase 6. That
change keeps the priority order of the stories and still avoids two rewrites of
`js/home.js`.

### MVP scope

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3: User Story 1.
4. Stop and validate. Home is routine-first and every routine is reachable.
5. Ship if you want the smallest useful increment.

### Incremental delivery

1. Setup and Foundational give a runnable app with no recommendation card.
2. User Story 1 gives the routine dashboard. This is the MVP.
3. User Story 2 gives the layer stack and the one-layer Back.
4. User Story 3 removes the last time control.
5. User Story 4 finishes the genre removal.
6. Polish updates the service worker, the docs, and the full verification.

### Parallel team strategy

With three people, after Phase 2:

1. Person A takes User Story 1, then User Story 3, because both write `js/routines.js` and
   `js/home.js`.
2. Person B takes User Story 2, and coordinates with Person A on T027.
3. Person C takes User Story 4, which touches Settings, Study Lab, and the stylesheet only.

---

## Notes

- Requirement coverage: US1 covers FR-001 to FR-015. US2 covers FR-023 to FR-036 and FR-051.
  US3 covers FR-016 to FR-022. US4 covers FR-037 to FR-045 and FR-048. Phase 1 covers FR-046,
  FR-047, and FR-049. Phase 7 covers FR-050 and FR-052.
- Write each test task before its implementation tasks, and confirm that the new test fails
  first. T042 stays red through Phase 6 by design.
- Commit after each task or after a small logical group. Keep every commit runnable.
- Bump `CACHE_VERSION` in `service-worker.js` before any browser check, or do a hard reload.
- Do not change the routine export format. Do not delete a stored genre value.
- Do not refactor audio, theory, Guitar Pro, drum, exercise, or workbook internals beyond the
  four seam functions in T028.
