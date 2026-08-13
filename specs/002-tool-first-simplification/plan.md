# Implementation Plan: Tool-First Simplification

**Branch**: `002-tool-first-simplification` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-tool-first-simplification/spec.md`

The Spec Kit setup script reports the branch as `002-tool-first-simplification`. The real
git branch for this work is `cursor/tool-first-simplification-spec-4db7`, because the
cloud-agent harness forces branch and pull request delivery.

## Summary

The player lands on Tools with Train, Study, and Create. The player reaches every retained
tool without a routine. Library holds exercises and workbooks in one place. Routines stay
optional. Old bookmarks still open a sensible screen.

The technical approach adds one migration framework, one route map, one navigation shell,
one musical context service, one audio owner, one fretboard renderer, one tempo scheduler,
and one library service. Duplicate quiz screens, the Drums module, and scattered reference
paths go away after their replacements ship.

The team ships nine ordered change sets, WP-01 through WP-09. The app stays runnable between
each change set. A removal waits for its replacement, its migration, its redirect, and its
tests. The product owner confirms each package before the next one starts.

Pure modules carry Node tests for route rules, migration idempotency, library filters,
shell contracts, and fretboard positions. Browser modules own DOM, Web Audio, and IndexedDB
through existing shims.

See [research.md](./research.md) for the decisions D1 to D27 and the rejected
alternatives.

## Technical Context

**Language/Version**: JavaScript, ES2020 modules in the browser. Node.js 18 or newer for
the test runners and the CLI.

**Primary Dependencies**: None. The web app has no framework and no build step. The CLI has
no npm dependency. This feature adds no dependency.

**Storage**: Browser localStorage keys `musi:settings`, `musi.notes`, `musi.songs`,
`musi.exercises`, `musi.workbooks`, `musi.routines`, and `musi.gpAnnotations`. IndexedDB
databases `musi-attachments`, `musi-drums`, and `musi-sync`. Optional Supabase sync carries
opaque record payloads. The feature adds settings keys `migrations.applied`,
`route.noticesSeen`, `tool.recents`, `context.tuning`, and `context.meter`.

**Testing**: Plain Node scripts under `tests/`, run as `node tests/<area>/run.mjs`. Each
suite uses a local `test(name, fn)` helper and `node:assert/strict`. Shims live in
`tests/cloud/harness.mjs`, `tests/exercises/idbShim.mjs`, and `tests/gp-player/domShim.mjs`.

**Target Platform**: Evergreen browsers. Android Chrome as an installed PWA, plus desktop
Chrome and Firefox. The app must work offline through the service worker.

**Project Type**: Static frontend PWA at the repository root, with a zero-dependency Node
CLI companion in `cli/`. This feature touches the web app only.

**Performance Goals**: Tools home renders with no visible delay for an empty catalog and
for a full favorites and recents set. A tool opens within one animation frame of the click
when it reads local data. Score Player keeps transport visible during parchment scroll.
Library list state restores without a full reload.

**Constraints**: No build step, so every module ships as source. Offline first, so
`CACHE_VERSION` and `PRECACHE_URLS` in `service-worker.js` need an update when file names
change. The address must stay a fragment route. The specification and the four exploration
passes resolved every unknown. No field needs NEEDS CLARIFICATION. Audio and mic features
need a browser with Web Audio and microphone access.

**Scale/Scope**: About seventeen new modules across seven new directories, four new
stylesheets, thirteen deleted modules plus the whole `js/drums/` directory, six new test
suites, and edits in about thirty-five existing files. Nine change sets from WP-01 through
WP-09. Expected data scale is hundreds of exercises, tens of workbooks, tens of routines,
and hundreds of legacy notes that land in Unfiled Notes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Result |
| --- | --- | --- |
| I. Static-First Architecture | The feature adds no backend, no database, and no API. It ships plain ES modules with no build step. | PASS. Every new module is a plain ES module. The feature reads and writes local storage and IndexedDB only. Decision D1 keeps migrations client-side. |
| II. Shared Theory Engine | Shared music-theory logic stays in `js/`. The CLI stays zero-dependency. | PASS. Decision D19 keeps `SCALES` and `CHORDS` canonical. Decision D21 adds `js/pitch/core.js` for shared analysis. FR-108 keeps the CLI unchanged. |
| III. Atomic Purple Game Boy Color UI | New UI reuses the theme tokens and the pixel font stack. Panels read as screen tiles. | PASS. FR-097 and decision D25 require reuse of `--bg`, `--card`, `--border`, `--accent`, `--on-accent`, `--accent2`, `--shell-bright`, `--radius-screen`, `--radius-pill`, `--font-pixel`, `--font-body`, and `--font-ui`. New stylesheets add no new colour value and no new font family. |
| IV. Verify Before Ship | Run the Node runners, serve the app over HTTP, exercise the UI, and run a CLI smoke command. | PASS. [quickstart.md](./quickstart.md) holds the steps. Decision D27 adds six suites and extends six existing suites. FR-107 maps definition of done to those runners. |
| V. Spec-Driven Feature Work | Spec first, then plan, then tasks, then implement. Artifacts live in `specs/`. | PASS. This plan follows [spec.md](./spec.md) and precedes `tasks.md`. Phase 0 and Phase 1 artifacts live in this directory. |
| Communication | Written output follows ASD-STE100 Simplified Technical English. | PASS. Every artifact in this directory follows it. Code identifiers and UI strings stay verbatim. |
| Agent Workflow | The main agent thread plans and coordinates work. Composer 2.5 sub-agents perform implementation. | PASS. FR-103 splits work into nine packages. Each package suits a focused sub-agent with contract and decision context. |
| Delivery | The repo prefers trunk-based push to `main`. A harness may force branch and pull request delivery. | PASS. The plan states the harness override. Work lands on `cursor/tool-first-simplification-spec-4db7` with pull request delivery. FR-106 requires product-owner sign-off per package before the next package starts. |

**Post-design re-check**: PASS. The Phase 1 design adds no dependency, no backend, and no
new tooling. It keeps the routine export format unchanged. It adds no new colour value and
no new font family. See the Complexity Tracking section, which stays empty because the
design has no constitution violation.

## Project Structure

### Documentation (this feature)

```text
specs/002-tool-first-simplification/
├── plan.md                       # This file
├── spec.md                       # Feature requirements
├── research.md                   # Phase 0 decisions (D1 to D27)
├── research-inventory.md         # Verified state of the current code
├── data-model.md                 # Target entities, migrations, and settings keys
├── quickstart.md                 # Phase 1 validation guide
├── contracts/
│   ├── migration-framework.md    # Runner and migration module contract
│   ├── route-map.md              # Legacy hash table and notice rules
│   ├── tool-shell.md             # Nav shell, tool page, nav stack, unsaved guard
│   ├── musical-context.md        # Context precedence and scope API
│   ├── audio-owner.md            # Single audio owner and Audio Dock
│   ├── fretboard-renderer.md     # Shared SVG fretboard model
│   ├── practice-library.md       # Library persistence single-owner rules
│   └── score-player.md           # Score Player host and open target
├── checklists/
│   └── requirements.md           # Spec quality checklist
└── tasks.md                      # Phase 2 output, created by /speckit-tasks
```

### Source Code (repository root)

```text
index.html                        # Shell markup, section ids, stylesheet links
service-worker.js                 # CACHE_VERSION and PRECACHE_URLS

css/
├── base.css                      # Theme tokens, shared panels
├── theme-gbc.css                 # Screen-tile treatment
├── shell.css                     # NEW. App bar, rail, bottom nav, More sheet
├── tools-home.css                # NEW. Tools home purposes, favorites, recents
├── library.css                   # NEW. Library tabs, filters, detail
├── fretboard.css                 # NEW. Shared fretboard renderer surfaces
├── quiz.css                      # DELETE when last quiz consumer goes
├── chordworkout.css              # DELETE when Chord Workout goes
├── drums.css                     # DELETE when js/drums/ goes
├── notes.css                     # DELETE when standalone Notes goes
└── study-lab.css                 # DELETE when Study Lab goes

js/
├── migrations/
│   ├── index.js                  # NEW. Registry and runner
│   ├── notesUnfiled.js           # NEW. notes-unfiled.v1
│   ├── exerciseMetadata.js       # NEW. exercise-metadata.v1
│   └── drumsToExercises.js       # NEW. drums-to-exercises.v1
├── shell/
│   ├── nav.js                    # NEW. App bar, rail, bottom nav, More
│   ├── navStack.js               # NEW. Origin, scroll, list state, focus
│   ├── toolPage.js               # NEW. Standard tool page shell
│   └── unsavedGuard.js           # NEW. Save, Discard, Keep editing
├── tools/
│   ├── homeModel.js              # NEW. Pure. Tools home section order
│   └── home.js                   # NEW. Tools home renderer
├── library/
│   ├── libraryModel.js           # NEW. Pure. Filters, sort, duplicates
│   └── library.js                # NEW. Library two-tab UI
├── fretboard/
│   └── renderer.js               # NEW. Pure. Shared SVG fretboard
├── tempo/
│   └── scheduler.js              # NEW. Shared Web Audio lookahead clock
├── pitch/
│   └── core.js                   # NEW. Pure. Shared McLeod pitch core
├── routeMap.js                   # NEW. Pure. Legacy hash resolution
├── audioOwner.js                 # NEW. Single audio owner registry
├── audioDock.js                  # NEW. Conditional Audio Dock UI
├── main.js                       # Await migrations, route map, shell nav
├── tools.js                      # Tool catalog with purpose and modes
├── musicalContext.js             # Scope API, tuning, meter, precedence
├── appRoute.js                   # Parse and build fragments (consumers)
├── routineNav.js                 # Delegate scroll and focus to navStack
├── routines.js                   # Optional routine layers, Open not Start
├── exercises.js                  # Single exercise write owner
├── workbooks.js                  # Workbook seam for routine back control
├── gpPlayer.js                   # Score Player host, no private list
├── gpPlayerUI.js                 # Shared mount, transport, drawers
├── gpMixPlayer.js                # Score playback client of tempo scheduler
├── metronome.js                  # Metronome UI over tempo scheduler
├── routineMetronome.js           # Session metronome client
├── recorder.js                   # Audio Studio capture path
├── notes.js                      # Note store with link fields
├── songwriter.js                 # Song Studio and Unfiled Notes
├── musicPreferences.js           # Settings without Features catalog
├── screenUx.js                   # Context row wiring
├── pickers.js                    # Searchable pickers for context row
├── scaleReference.js             # Scale Lab modes
├── chordReference.js             # Chord Lab modes
├── triadReference.js             # Chord data from js/chords.js
├── sweepReference.js             # Tunings from js/tunings.js
├── sweepPatterns.js              # Tunings from js/tunings.js
├── movableChordCards.js          # Shared context instead of private tuning
├── interval-map/model.js         # Drop SCALE_MAJOR_INTERVALS duplicate
├── interval-map/ui.js            # Fretmap modes, shared context
├── intervalOrbitModel.js         # Chord data from js/chords.js
├── analysis/chordDetect.js       # Chord data from js/chords.js
├── exerciseCompanions/diagram.js # Fretboard renderer client
├── exerciseCompanions/triadRef.js  # Fretboard renderer client
├── trackToSheet.js               # Library service write path
├── exercisesBulk.js              # Library service write path
├── cloud/recordMap.js            # drumPatterns inbox for migration
├── scaleQuiz.js                  # DELETE after WP-04
├── intervalQuiz.js               # DELETE after WP-04
├── sightReadingTrainer.js        # DELETE after WP-05
├── fretboardTrainer.js           # DELETE after WP-04
├── chordWorkout.js               # DELETE after WP-04
├── timingDrill.js                # DELETE after WP-05
├── keyboard.js                   # DELETE after WP-09
├── practiceTimer.js              # DELETE after WP-05
├── studyLab.js                   # DELETE after WP-04
├── studyLabMic.js                # DELETE after WP-04
├── nowPlaying.js                 # DELETE after WP-03
├── tab/tabPlayer.js              # DELETE after WP-07
└── drums/                        # DELETE directory after WP-09

tests/
├── routes/run.mjs                # NEW. Legacy hash and alias coverage
├── migrations/run.mjs            # NEW. Migration idempotency fixtures
├── shell/run.mjs                 # NEW. Nav stack and unsaved guard
├── library/run.mjs               # NEW. Filters and duplicate rules
├── fretboard/run.mjs             # NEW. Pure fretPositions for many tunings
├── removal-guard/run.mjs         # NEW. Source guard for deleted modules
├── exercises/run.mjs             # Extend metadata and library writes
├── workbooks/run.mjs             # Extend Library back-restore cases
├── routines/run.mjs              # Extend optional routine flows
├── companions/run.mjs            # Extend fretboard renderer clients
├── gp-player/                    # Extend Score Player host cases
├── exercises/idbShim.mjs         # Extend musi-attachments and musi-drums
└── study-lab/run.mjs             # Retarget at Scale Lab Guide model
```

**Structure Decision**: The repository is a flat static PWA with a shared `js/` folder and
a mirrored `tests/` folder. `js/` already holds eleven feature subdirectories, so each new
area gets a directory per decision D25. The plan does not reorganise the existing flat
files at the root of `js/`, because about ninety modules already live there and a partial
move would split one feature across two shapes.

## Phase 1 design summary

### New modules

| Module | Kind | Responsibility |
| --- | --- | --- |
| `js/migrations/index.js` | Browser | Registry, `runMigrations`, shared `ctx` factory, and applied-id recording under `migrations.applied`. |
| `js/migrations/notesUnfiled.js` | Pure | Migration `notes-unfiled.v1`. Supplies `linkedType` and `linkedId` defaults through `normalizeNote`. |
| `js/migrations/exerciseMetadata.js` | Pure | Migration `exercise-metadata.v1`. Supplies exercise metadata defaults through `normalizeItem`. |
| `js/migrations/drumsToExercises.js` | Browser | Migration `drums-to-exercises.v1`. Writes `musi-drum-pattern` attachments and drum exercises. |
| `js/routeMap.js` | Pure | `resolveRoute`, `isKnownRoute`, `ROUTE_IDS`, and `LEGACY_ROUTES` per decision D6. |
| `js/shell/nav.js` | Browser | Fixed app bar, desktop rail, mobile bottom bar, and More sheet per decision D9. |
| `js/shell/navStack.js` | Browser | Route origin, scroll restore, Library list state, and focus move per decision D15. |
| `js/shell/toolPage.js` | Browser | Standard tool page header, context row, mode tabs, and workspace hand-off per decision D14. |
| `js/shell/unsavedGuard.js` | Browser | `registerUnsaved` and leave prompts per decision D17. |
| `js/tools/homeModel.js` | Pure | Ordered Tools home sections, empty-section hiding, and Continue rules per decision D10. |
| `js/tools/home.js` | Browser | Tools home renderer for purposes, Favorites, Recents, Continue, Search, and Browse. |
| `js/audioOwner.js` | Browser | `claimAudio`, `releaseAudio`, and single-owner enforcement per decision D16. |
| `js/audioDock.js` | Browser | Conditional dock while playback, recording, or mic work is active. |
| `js/fretboard/renderer.js` | Pure | Shared SVG fretboard from a declarative model per decision D18. |
| `js/library/libraryModel.js` | Pure | Filters, facets, duplicate detection, and reference lists per decision D22. |
| `js/library/library.js` | Browser | Library Exercises and Workbooks tabs with Add action and list restore. |
| `js/tempo/scheduler.js` | Browser | Shared Web Audio lookahead clock and click synthesis per decision D20. |
| `js/pitch/core.js` | Pure | Shared McLeod pitch analysis core per decision D21. |

### Migrations

| Id | Effect |
| --- | --- |
| `notes-unfiled.v1` | Adds `linkedType` and `linkedId` defaults. Every legacy note stays unfiled. Decision D2. |
| `exercise-metadata.v1` | Adds optional exercise metadata fields through `normalizeItem`. Decision D4. |
| `drums-to-exercises.v1` | Creates `musi-drum-pattern` attachments and exercises with `sourceRef`. Decision D3. |

See [contracts/migration-framework.md](./contracts/migration-framework.md) and
[data-model.md](./data-model.md) for detect, apply, verify, and fixture tables.

### Route map

`js/routeMap.js` resolves every boot and hashchange route before `applyRoute` runs.
Decision D8 flips the root to `tools` with no hash. `#home` resolves to `tools` with no
notice. Two alias rows stay in the table: `#intervalmap` resolves like `#intervalorbit` to
`fretmap` mode `map`, and `#tabanalyzer` resolves like `#gpplayer` to `scoreplayer`. Dismissed
notices live under `route.noticesSeen`. See [contracts/route-map.md](./contracts/route-map.md).

### Shell changes in `js/main.js`

1. `init()` awaits `runMigrations` from `js/migrations/index.js` before the first render,
   because decision D1 touches IndexedDB and must finish first.
2. Every boot, `hashchange`, and `popstate` path calls `resolveRoute` from `js/routeMap.js`
   after `parseAppRoute` from `js/appRoute.js`.
3. `rebuildDesktopDock` and the five mobile category buttons go away. `js/shell/nav.js`
   replaces them with Tools, Library, Routines, and Settings on desktop, and Tools,
   Library, Routines, and More on mobile per decision D9.
4. The four `hub-<categoryId>` routes go away with the old dock and hub markup.
5. `js/shell/navStack.js` owns scroll restore, focus move to the page heading, and origin
   context for Tools, Library, Search, workbooks, and routines. `js/routineNav.js` keeps
   the routine layer stack and delegates scroll and focus work to `navStack`.
6. `stopOtherTools` stays in `js/main.js` for section-change clean-up. `js/audioOwner.js`
   becomes the authority for active playback, recording, and microphone work per decision
   D16.
7. `applyRoute` shows a dismissible notice when `resolveRoute` returns a notice id that is
   not already in `route.noticesSeen`.

### Engine consolidation

| Responsibility | New single owner | Sites removed |
| --- | --- | --- |
| Musical context | `js/musicalContext.js` with scope API per decision D12 | Private root, scale, and tuning state in `js/scaleReference.js`, `js/chordReference.js`, `js/triadReference.js`, `js/fretboardTrainer.js`, `js/chordWorkout.js`, `js/sweepReference.js`, `js/movableChordCards.js`, and `js/interval-map/ui.js` |
| Scale data | `SCALES` in `js/scales.js` per decision D19 | `SCALE_MAJOR_INTERVALS` in `js/interval-map/model.js`. `LEVEL_DEFS` in `js/interval-map/model.js` and `STAGE_INTERVALS` in `js/intervalOrbitModel.js` stay, because they are curriculum tables and not scale formulas |
| Chord data | `CHORDS` in `js/chords.js` per decision D19 | `TRIAD_QUALITIES` in `js/triadReference.js`, `CHORD_TYPES` in `js/analysis/chordDetect.js`, `CHORD_FORMULAS` and `QUALITY_FORMULAS` in `js/intervalOrbitModel.js`, and local `TRIAD_QUALITIES` in `js/scaleReference.js` |
| Fretboard rendering | `js/fretboard/renderer.js` per decision D18 | Renderers in `js/fretboardTrainer.js`, `js/scaleReference.js`, `js/chordReference.js`, `js/triadReference.js`, `js/sweepReference.js`, `js/chordWorkout.js`, `js/interval-map/fretboardView.js`, `js/exerciseCompanions/diagram.js`, and `js/exerciseCompanions/triadRef.js` |
| Tuning data | `TUNING_CATALOG` and `TUNINGS` in `js/tunings.js` per decision D19 | `SWEEP_OPEN_MIDI` in `js/sweepReference.js` and `OPEN_PC` in `js/sweepPatterns.js` |
| Microphone and pitch analysis | `js/pitch/core.js` plus `js/pitch.js` and `js/audio.js` per decision D21 | Duplicate McLeod core in `js/trackToSheet/dsp.js` keeps offline path but shares the core |
| Tempo scheduling | `js/tempo/scheduler.js` per decision D20 | Lookahead clocks in `js/metronome.js`, `js/routineMetronome.js`, `js/timingDrill.js`, `js/drums/drumEngine.js`, `js/gpMixPlayer.js`, and unused `js/tab/tabPlayer.js` |
| Guitar Pro parsing and score playback | `parseGuitarPro` in `js/tab/guitarPro.js`, `mountGpPlayer` in `js/gpPlayerUI.js`, and `createGpMixPlayer` in `js/gpMixPlayer.js` per decision D23 | Private score list in `js/gpPlayer.js` and unused `js/tab/tabPlayer.js` scheduler path |
| Library persistence | `js/exercises.js` and `js/library/libraryModel.js` per decision D22 | Direct writes from `js/gpPlayer.js`, `js/exercisesBulk.js`, `js/trackToSheet.js`, and restore paths in `js/cloud/reconcile.js` and `js/sync/syncBundle.js` routed through the owner API |

### Contracts

| Contract | Purpose |
| --- | --- |
| [contracts/migration-framework.md](./contracts/migration-framework.md) | Runner algorithm, migration interface, `ctx` factory, and boot integration in `init()`. |
| [contracts/route-map.md](./contracts/route-map.md) | Address grammar, new route ids, legacy hash table, notice rules, and `#drums` conditional rule. |
| [contracts/tool-shell.md](./contracts/tool-shell.md) | `nav.js`, `toolPage.js`, `navStack.js`, and `unsavedGuard.js` interfaces and guarantees. |
| [contracts/musical-context.md](./contracts/musical-context.md) | Scope API, precedence layers, `resolveValue` fallback reasons, and saved default keys. |
| [contracts/audio-owner.md](./contracts/audio-owner.md) | `claimAudio` registry, dock visibility rules, and interaction with `stopOtherTools`. |
| [contracts/fretboard-renderer.md](./contracts/fretboard-renderer.md) | Declarative fretboard model, SVG output contract, and client adoption order. |
| [contracts/practice-library.md](./contracts/practice-library.md) | Single write owner, `libraryModel` pure API, duplicate detection, and attachment replace. |
| [contracts/score-player.md](./contracts/score-player.md) | Open target, transport layout, Loop Selection mode, Save as Exercise, and audio claim. |

## Delivery stages

Each package must leave the app runnable. A removal waits for its replacement, its
migration, its redirect, and its tests. The product owner confirms each package before the
next one starts.

| Package | Content | Stories and requirements |
| --- | --- | --- |
| WP-01 | Migration framework, three migrations, extended `idbShim`, the pure `js/routeMap.js` table, and the suites `tests/routes/run.mjs` and `tests/migrations/run.mjs`. Bump service worker cache. | US1, FR-071 to FR-078, and the route table behind FR-079 to FR-088 |
| WP-02 | Root flip to Tools, `js/shell/nav.js`, `js/tools/homeModel.js`, `js/tools/home.js`, catalog changes in `js/tools.js`, and `css/shell.css` plus `css/tools-home.css`. Remove routine empty state from Tools home. | US2, FR-001 to FR-013 |
| WP-03 | `js/shell/navStack.js`, `js/shell/toolPage.js`, `js/shell/unsavedGuard.js`, the `js/musicalContext.js` scope API, `js/audioOwner.js`, `js/audioDock.js`, and the `resolveRoute` wiring plus notice display in `js/main.js`. Add `tests/shell/run.mjs`. | US3, FR-014 to FR-031, FR-055 to FR-059, FR-088, FR-089 |
| WP-04 | Study consolidation: Scale Lab, Fretboard & Interval Map, Chord Lab, `js/fretboard/renderer.js`, scale and chord dedup per D19, and Study companion entry points. Delete quiz and Study Lab modules after redirects pass. | US4, FR-032 to FR-036, FR-069 partial, FR-079 to FR-081 |
| WP-05 | Pitch & Ear Lab shell, `js/pitch/core.js`, `js/tempo/scheduler.js`, Metronome and Practice Plan in Train. Delete timing, sight-reading, and practice-timer modules after redirects pass. | US5, FR-037 to FR-040, FR-082, FR-083 partial |
| WP-06 | Song Studio, Audio Studio modes, Unfiled Notes, Chord builder, unsaved guards on capture and song edit. Notes migration destination for `#notes`. | US6, FR-041 to FR-043, FR-056, FR-059, FR-060, FR-072, FR-085 |
| WP-07 | `js/library/libraryModel.js`, `js/library/library.js`, Score Player host without private list, shared practice player entry points, and `tests/library/run.mjs`. Extend gp-player suites. | US7, FR-044 to FR-054, FR-048, FR-049, FR-050, FR-095, FR-096 |
| WP-08 | Optional Routines experience: Open not Start, no session timer, layer Back through workbook and exercise, compact breadcrumbs, and Previous and Next without auto-advance. | US8, FR-061 to FR-065, FR-007 |
| WP-09 | Settings cleanup without Features catalog, final module and stylesheet deletions, `tests/removal-guard/run.mjs`, `musi-drums` database removal after verify, and inert `features.enabled`. | US9, FR-066 to FR-070, FR-076, SC-034 |

Every package that adds or removes a file must bump `CACHE_VERSION` and update
`PRECACHE_URLS` in `service-worker.js`. The current value is
`v190-routine-sibling-switch-and-phone-layout`.

## Complexity Tracking

The Constitution Check has no violation, so this section stays empty.
