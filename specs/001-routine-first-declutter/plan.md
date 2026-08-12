# Implementation Plan: Routine-First Declutter

**Branch**: `001-routine-first-declutter` | **Date**: 2026-08-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-routine-first-declutter/spec.md`

## Summary

Make routines the main Home experience, and remove three sources of clutter.

Home becomes a routine dashboard. It shows one card for every stored routine, a
`New Routine` action, an `Import Routine` action, and an empty state. Genre-based
learning leaves the running product. The routine flow drops every time display and keeps
`durationMin` as inert data. Routine content becomes a stack of layers, and one Back press
moves up exactly one layer.

The technical approach adds four small modules and reuses every existing store. Three of
the new modules are pure, so Node tests cover the route rules and the card rules without a
browser. One new module owns the layers, the history, the focus, and the scroll. The plan
splits `showSection` in `js/main.js` into a section step and a history step, so the address
can name a routine route while another section hosts the top layer. The plan does not
rewrite workbook detail; the workbooks section keeps that role. See
[research.md](./research.md) for the decisions and the rejected alternatives.

## Technical Context

**Language/Version**: JavaScript, ES2020 modules in the browser. Node.js 18 or newer for
the test runners and the CLI.

**Primary Dependencies**: None. The web app has no framework and no build step. The CLI
has no npm dependency. This feature adds no dependency.

**Storage**: Browser local storage. The routine store uses the key `musi.routines`. The
settings store uses the key `musi:settings`, which holds logical subkeys such as
`features.enabled`, `global.volume`, `profile.music`, and `study.progress`. This feature
changes no stored shape.

**Testing**: Plain Node scripts under `tests/`, run as `node tests/<area>/run.mjs`. Each
suite uses a local `test(name, fn)` helper and `node:assert/strict`. Storage stubs and
document stubs exist in `tests/cloud/harness.mjs` and `tests/gp-player/domShim.mjs`.

**Target Platform**: Evergreen browsers. Android Chrome as an installed PWA, plus desktop
Chrome and Firefox. The app must work offline through the service worker.

**Project Type**: Static frontend PWA at the repository root, with a zero-dependency Node
CLI companion in `cli/`. This feature touches the web app only.

**Performance Goals**: Home renders 50 routine cards without a visible delay. A layer
opens or closes within one animation frame of the click, because every layer reads local
data and mounts no network resource.

**Constraints**: No build step, so every module ships as source. Offline first, so the
service worker precache list and the cache name need an update when file names change. The
address must stay a fragment route, because a static host cannot rewrite deep paths. The
change must not alter the routine export format.

**Scale/Scope**: Four new modules, one renamed stylesheet, three deleted modules, and
edits in about ten existing files. Two new test suites and one extended suite. Expected
data scale is tens of routines with tens of sessions each.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Result |
| --- | --- | --- |
| I. Static-First Architecture | The feature adds no backend, no database, and no API. It ships plain ES modules with no build step. | PASS. Every new module is a plain ES module. The feature reads and writes local storage only. |
| II. Shared Theory Engine | Shared music-theory logic stays in `js/`. The CLI stays zero-dependency. | PASS. The feature adds no theory logic and does not touch `cli/`. |
| III. Atomic Purple Game Boy Color UI | New UI reuses the theme tokens and the pixel font stack. Panels read as screen tiles. | PASS. FR-050 states the rule. The routine cards reuse `--card`, `--border`, `--accent`, `--radius-screen`, `--radius-pill`, `--font-pixel`, `--font-body`, and `--font-ui`, plus the existing `rt-*` classes. |
| IV. Verify Before Ship | Run the Node runners, serve the app over HTTP, exercise the UI, and run a CLI smoke command. | PASS. [quickstart.md](./quickstart.md) holds the steps. Two new suites and one extended suite carry the automated part. |
| V. Spec-Driven Feature Work | Spec first, then plan, then tasks, then implement. Artifacts live in `specs/`. | PASS. This plan follows `spec.md` and precedes `tasks.md`. |
| Communication | Written output follows ASD-STE100 Simplified Technical English. | PASS. Every artifact in this directory follows it. Code identifiers and UI strings stay verbatim. |

**Post-design re-check**: PASS. The Phase 1 design adds no dependency, no backend, and no
new tooling. It keeps the export format unchanged. It adds no new colour value and no new
font family. See the Complexity Tracking section, which stays empty because the design has
no constitution violation.

## Project Structure

### Documentation (this feature)

```text
specs/001-routine-first-declutter/
├── plan.md                       # This file
├── spec.md                       # Feature requirements
├── research.md                   # Phase 0 decisions (D1 to D17)
├── research-inventory.md         # Verified state of the current code
├── data-model.md                 # Phase 1 entities and validation
├── quickstart.md                 # Phase 1 validation guide
├── contracts/
│   ├── routine-route.md          # Address grammar and history rules
│   ├── routine-navigator.md      # Navigator module contract
│   ├── workbook-layer-seam.md    # Additive seam in the workbooks module
│   └── routine-export.v1.json    # Existing export schema, unchanged
├── checklists/
│   └── requirements.md           # Spec quality checklist
└── tasks.md                      # Phase 2 output, created by /speckit-tasks
```

### Source Code (repository root)

```text
index.html                        # Home markup, routines markup, stylesheet links
service-worker.js                 # Precache list and cache name

css/
├── base.css                      # Theme tokens, shared panels
├── theme-gbc.css                 # Screen-tile treatment, remove .home-rec-* overrides
├── routines.css                  # Add routine Home cards and layer styles
├── settings.css                  # Renamed from study-recs.css, genre rules removed
├── mobile-ux.css                 # Audit home-* rules
└── ux-shell.css                  # Audit home-* rules

js/
├── appRoute.js                   # NEW. Pure. Parse and build "id?key=value" fragments
├── routineRoute.js               # NEW. Pure. Layer rules, parent route, invalid-id repair
├── routineDashboardModel.js      # NEW. Pure. Routine card models and the sort rule
├── routineNav.js                 # NEW. Layer stack, history, focus, scroll, Back control
├── main.js                       # Split showSection, add applyRoute, delegate routines
├── home.js                       # Routine dashboard, remove genre and tool blocks
├── routines.js                   # Layer rendering, export create and import flows
├── workbooks.js                  # Additive seam for a routine-owned back control
├── musicPreferences.js           # Remove genre blocks, keep the rest of Settings
├── studyLab.js                   # Default study, record progress directly
├── tools.js                      # Rewrite the musicprefs description
├── genreProfiles.js              # DELETE
├── musicProfile.js               # DELETE
└── studyRecommendations.js       # DELETE

tests/
├── routines/run.mjs              # Extend with dashboard model cases
├── routine-nav/run.mjs           # NEW. appRoute and routineRoute rules
├── genre-removal/run.mjs         # NEW. Source guard for the removal
└── study-recs/run.mjs            # DELETE
```

**Structure Decision**: The repository is a flat static PWA with a shared `js/` folder and
a mirrored `tests/` folder. This feature keeps that layout. It adds four modules to `js/`
and two suites to `tests/`. It creates no new directory in `js/`, because the routine
feature already spreads across `js/routines.js`, `js/routineModel.js`, and
`js/routineMetronome.js`, and a partial move would split one feature across two shapes.

## Phase 1 design summary

### New modules

| Module | Kind | Responsibility |
| --- | --- | --- |
| `js/appRoute.js` | Pure | Parse a fragment into `{ id, params }`. Build a fragment from `{ id, params }`. Order the parameters. |
| `js/routineRoute.js` | Pure | Validate the routine parameter set. Calculate the parent route. Drop invalid child parameters. Name the layer that a route shows. |
| `js/routineDashboardModel.js` | Pure | Build the routine card models. Apply the `updatedAt` sort with the `name` tiebreak. |
| `js/routineNav.js` | Browser | Own the layer stack, the history calls, the visible Back control, the focus move, and the scroll restore. |

`js/routineNav.js` exposes `createRoutineNavigator(config)`, which
[contracts/routine-navigator.md](./contracts/routine-navigator.md) defines. Content
renderers keep rendering only their selected item, as FR-032 requires.

### Shell changes in `js/main.js`

1. Split `showSection(id, skipHash)` into `applySection(id, { keep })` and
   `showSection(id, skipHash, params)`. `applySection` performs the section swap, the dock
   state, `stopOtherTools([id, ...keep])`, `initTool(id)`, and the chrome update.
   `showSection` writes the history entry, then calls `applySection`.
2. Add `applyRoute({ id, params, mode })`, where `mode` is `push` or `replace`. The boot
   path, the `popstate` listener, and the `hashchange` listener all call it.
3. Use `js/appRoute.js` in `sectionUrl`, so the address keeps the parameters.
4. Store `{ musiNav: id, params }` in the history state.
5. For the id `routines`, hand the parameters to the navigator, and let the navigator
   choose the host section.

The counters `navPushCount` and `applyingHistory` stay in `js/main.js`, so history
bookkeeping keeps one owner.

### Layer hosts

| Layer | Host | Notes |
| --- | --- | --- |
| Routines list | `#sec-routines` | The existing sidebar and overview panes. |
| Routine overview | `#sec-routines` | `#rt-overview-pane`. |
| Session detail | `#sec-routines` | `#rt-session-pane`, which already overlays the overview. |
| Workbook detail | `#sec-workbooks` | The existing detail pane. The navigator keeps `#sec-routines` alive with a keep list. |
| Exercise | `#sec-workbooks` | The selected entry inside workbook detail, per decision D7. |
| Study companion | `#sec-workbooks` | The Tools subview of workbook detail, per decision D8. |

### Home dashboard

`js/home.js` keeps `renderHub`, `toolRow`, `renderAllTools`, and the favorites helpers. It
drops `renderContinue`, `renderQuickStart`, `renderStudyRec`, `renderCategories`,
`startStudy`, and the hero wiring. `render()` draws the routine cards from
`js/routineDashboardModel.js`, then the collapsed `All tools` panel. `initHome` subscribes
to `musi:data-changed` and re-renders when `detail.domain` equals `routines`.

`index.html` loses `#gbc-hero`, `#home-continue`, `#home-quickstart`, `#home-study-rec`,
`#home-stats`, and `#home-categories`. It gains `#home-routines` and a small
`#home-status` region with `role="status"`. It keeps `#home-all-panel`.

### Genre removal

Delete `js/genreProfiles.js`, `js/musicProfile.js`, and `js/studyRecommendations.js`.
Delete the genre blocks from `js/musicPreferences.js`, and keep `#mp-context-block`,
`#mp-volume-block`, `#mp-sync-block`, `#mp-cloud-block`, `#mp-library-cleanup`, and
`#mp-features`. Study Lab picks a default study from `js/studyCatalog.js` and calls
`js/studyProgress.js` directly. Keep `profile.music` and `study.progress` as opaque sync
keys, so an older bundle still imports. Rename `css/study-recs.css` to `css/settings.css`
and delete the genre rules.

### Contracts

| Contract | Purpose |
| --- | --- |
| [contracts/routine-route.md](./contracts/routine-route.md) | The address grammar, the parameter order, the parent-route rule, the invalid-identifier repair, and the history rules. |
| [contracts/routine-navigator.md](./contracts/routine-navigator.md) | The `createRoutineNavigator` interface, the layer descriptor, and the guarantees about focus, scroll, and Back. |
| [contracts/workbook-layer-seam.md](./contracts/workbook-layer-seam.md) | The smallest additive change in `js/workbooks.js` that lets a routine route own the workbook back control and drive the open from the route. |
| [contracts/routine-export.v1.json](./contracts/routine-export.v1.json) | The existing export format, recorded as a schema so a reviewer can prove the format did not change. |

## Delivery stages

Each stage must leave the app runnable, per decision D17.

| Stage | Content | Stories and requirements |
| --- | --- | --- |
| 1 | Remove genre-based learning. Rename the stylesheet. Update Study Lab, Settings, the tool description, the service worker, and the tests. | US4, FR-037 to FR-045, FR-048 |
| 2 | Build the Home routine dashboard with the empty state, the sort, the counts, the create action, and the import action. Delete the removed Home blocks. | US1, FR-001 to FR-015 |
| 3 | Add `js/appRoute.js`, `js/routineRoute.js`, and `js/routineNav.js`. Split `showSection`. Move the routine layer and the session layer onto the stack. | US2, FR-023 to FR-032 |
| 4 | Add the workbook layer, the exercise layer, and the companion layer. Add the workbooks seam. Handle direct links and invalid identifiers. | US2, FR-033 to FR-036 |
| 5 | Remove the target duration input. Confirm that no clock remains. Add the test suites and run the full verification. | US3, FR-016 to FR-022, FR-046 to FR-052 |

## Complexity Tracking

The Constitution Check has no violation, so this section stays empty.
