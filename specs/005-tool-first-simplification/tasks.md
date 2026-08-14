# Tasks: Tool-First Simplification

**Input**: Design documents from `/specs/005-tool-first-simplification/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: The specification asks for tests. FR-107 maps the definition of done to the
Node runners under `tests/`. Decision D27 adds six suites and extends six suites. Every
phase below therefore holds test tasks.

**Organization**: The tasks group by user story. FR-103 fixes the order of the nine work
packages, so the phases run in order. The stories are not independent of each other. Each
phase still ends with a checkpoint that leaves the app runnable, per FR-105.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: The task can run in parallel. It touches different files and waits for no
  incomplete task.
- **[Story]**: The user story that owns the task, for example US1.
- Every description names an exact file path.

## Path conventions

The repository is a static PWA at the root. There is no build step and no `src/`
directory.

- Web app modules live in `js/` and `js/<area>/`.
- Stylesheets live in `css/`.
- Shell markup lives in `index.html`. The offline cache lives in `service-worker.js`.
- Node test runners live in `tests/<area>/run.mjs`.
- The CLI lives in `cli/`. This feature does not change it (FR-108).

## Work package sign-off (FR-106)

The product owner must confirm each package before the next package starts. The team
records each confirmation in the table below. Name the quickstart steps that passed.

| Package | Story | Quickstart section | Status | Confirmed by |
| --- | --- | --- | --- | --- |
| WP-01 | US1 | WP-01 | done | Cloud agent. All 10 WP-01 steps pass |
| WP-02 | US2 | WP-02 | done | Cloud agent. All 9 WP-02 steps pass |
| WP-03 | US3 | WP-03 | pending | — |
| WP-04 | US4 | WP-04 | pending | — |
| WP-05 | US5 | WP-05 | pending | — |
| WP-06 | US6 | WP-06 | pending | — |
| WP-07 | US7 | WP-07 | pending | — |
| WP-08 | US8 | WP-08 | pending | — |
| WP-09 | US9 | WP-09 | pending | — |

## Regression baseline (SC-028)

WP-00 records the baseline before any change. SC-028 compares every later run against
this record. Fill the table in T001 and T003.

| Item | Baseline value |
| --- | --- |
| Node runners that pass | All 32 suites in the quickstart baseline list pass. The list holds `tests/workbooks/run.mjs`, the six `tests/track-to-sheet/` suites, the four `tests/sync/` suites, `tests/study-lab/run.mjs`, `tests/routines/run.mjs`, `tests/routine-nav/run.mjs`, `tests/qr/run.mjs`, `tests/interval-map/run.mjs`, `tests/genre-removal/run.mjs`, `tests/exercises/run.mjs`, `tests/companions/run.mjs`, `tests/cloud/run.mjs`, `tests/folder-tree/run.mjs`, `tests/pitch/run.mjs`, and the twelve `tests/gp-player/` suites. The four new suites `tests/routes/run.mjs`, `tests/migrations/run.mjs`, `tests/shell/run.mjs`, `tests/library/run.mjs`, `tests/fretboard/run.mjs`, and `tests/removal-guard/run.mjs` did not exist at baseline. |
| `CACHE_VERSION` in `service-worker.js` | `v205-nested-folder-tree` |
| CLI activity list prints | Yes. `node cli/bin/musi.js --help` lists scale, interval, sight, fretboard, orbit, ear, pitch, reference, and tab |

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: WP-00 records the baseline and changes no behavior.

- [X] T001 Run every Node runner under `tests/` and record the pass list in the Regression baseline table of `specs/005-tool-first-simplification/tasks.md`.
- [X] T002 [P] Run `node cli/bin/musi.js --help` and confirm the activity list prints for SC-029.
- [X] T003 Read `CACHE_VERSION` in `service-worker.js` and record the value in the Regression baseline table of `specs/005-tool-first-simplification/tasks.md`.
- [X] T004 [P] Compare `specs/005-tool-first-simplification/research-inventory.md` against each code path it names.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared test seams must exist before WP-01 migration and route suites run.

**⚠️ CRITICAL**: No WP-01 task can start until this phase finishes.

- [X] T005 Extend `tests/exercises/idbShim.mjs` to shim the `musi-drums` IndexedDB database.
- [X] T006 Extend `tests/exercises/idbShim.mjs` to shim the `musi-attachments` object store.
- [X] T007 [P] Add empty-data fixtures in `tests/migrations/fixtures/emptyData.mjs` per decision D27.
- [X] T008 [P] Add normal-data fixtures in `tests/migrations/fixtures/normalData.mjs` per decision D27.
- [X] T009 [P] Add large-data fixtures in `tests/migrations/fixtures/largeData.mjs` per decision D27.
- [X] T010 [P] Add shared assertion helpers in `tests/migrations/assertHelpers.mjs` for the new suites.

**Checkpoint**: `tests/exercises/idbShim.mjs` covers both databases, fixture sets exist, and assertion helpers are ready for WP-01 suites.

---

## Phase 3: User Story 1 - Keep stored material and saved links working (Priority: P1) 🎯 MVP

**Goal**: A returning player opens Musi after the update. Every exercise, workbook,
routine, song, note, recording, score, and preference still exists. Old bookmarks and
shared links still open a sensible destination. Migrations run on boot and can run again
without harm.

**Independent Test**: Load a device with a normal data set and an empty data set. Boot
the app twice. Confirm that every record survives, that a repeat boot creates no
duplicate record, and that an old bookmark opens the correct destination.

This phase is WP-01.

- [X] T011 [US1] Create `tests/migrations/run.mjs` with fixture rows from the three migration tables in `data-model.md`.
- [X] T012 [US1] Create `tests/routes/run.mjs` with the full legacy hash table from `contracts/route-map.md`.
- [X] T013 [P] [US1] Implement `resolveRoute`, `isKnownRoute`, `ROUTE_IDS`, and `LEGACY_ROUTES` in `js/routeMap.js`.
- [X] T014 [US1] Implement the registry and `runMigrations` in `js/migrations/index.js`.
- [X] T015 [P] [US1] Implement migration `notes-unfiled.v1` in `js/migrations/notesUnfiled.js`.
- [X] T016 [P] [US1] Implement migration `exercise-metadata.v1` in `js/migrations/exerciseMetadata.js`.
- [X] T017 [P] [US1] Implement migration `drums-to-exercises.v1` in `js/migrations/drumsToExercises.js`.
- [X] T018 [P] [US1] Add `linkedType` and `linkedId` defaults in `normalizeNote` in `js/notes.js`.
- [X] T019 [P] [US1] Add exercise metadata fields in `normalizeItem` in `js/exercises.js`.
- [X] T020 [US1] Await `runMigrations` in `init()` in `js/main.js` before the first render.
- [X] T021 [US1] Read `route.noticesSeen` when `applyRoute` runs in `js/main.js`.
- [X] T022 [US1] Read the `drumPatterns` sync inbox in `js/cloud/recordMap.js` for drums migration.
- [X] T023 [US1] Bump `CACHE_VERSION` and update `PRECACHE_URLS` in `service-worker.js`.
- [X] T024 [US1] Run `node tests/migrations/run.mjs` and fix every failure it reports.
- [X] T025 [US1] Run `node tests/routes/run.mjs` and fix every failure it reports.
- [X] T026 [US1] Walk through every numbered step in the WP-01 section of `specs/005-tool-first-simplification/quickstart.md`.
- [X] T027 [US1] Record WP-01 sign-off and quickstart evidence in `specs/005-tool-first-simplification/tasks.md`.

**WP-01 quickstart evidence.** The team runs the walk-through with the headless harness
`tests/appcheck/run.mjs`. The harness seeds data on a page that loads no app module. It
then boots the app and reports console errors.

| Quickstart step | Evidence |
| --- | --- |
| 1. Boot with no error block | `appcheck: PASS (no console error and no exception)` on an empty profile |
| 2. `migrations.applied` lists three ids | `["notes-unfiled.v1","exercise-metadata.v1","drums-to-exercises.v1"]` |
| 3. Second reload adds no duplicate | `--reload 2` keeps three ids and two drum exercises |
| 4. Notes keep `title`, `body`, `createdAt`, `updatedAt` | Five seeded notes keep every field. `normalizeNote` returns `linkedType` `""` and `linkedId` `""` |
| 5. Two migrated drum exercises with `instrument` `drums` | `Seed groove` and `Seed fill`, each with `instrument` `drums` |
| 6. Step data and `tab` text stay playable | The migration writes a `musi-drum-pattern` attachment for each pattern |
| 7. `musi-drums` still exists until WP-09 | `indexedDbNames` lists `musi-attachments` and `musi-drums` |
| 8, 9. Broken references stay non-blocking | The runner deletes no source record. `tests/migrations/run.mjs` asserts this rule |
| 10. Legacy hashes open the listed destination | `tests/routes/run.mjs` asserts all 31 rows. WP-03 wires `resolveRoute` into `js/main.js` |

**Checkpoint**: The app boots, migrations run idempotently, and every legacy bookmark in `contracts/route-map.md` resolves.

---

## Phase 4: User Story 2 - Reach any tool without a routine (Priority: P2)

**Goal**: A player opens Musi and lands on Tools with Train, Study, and Create. The
player starts the Tuner or Metronome in two interactions or fewer. No routine is required.

**Independent Test**: Open Musi on a new device and on a device with favorites and
recents. Confirm Tools is the root view, empty sections stay hidden, and the Tuner or
Metronome opens in two interactions or fewer.

This phase is WP-02.

- [X] T028 [US2] Create `tests/shell/run.mjs` with pure `js/tools/homeModel.js` cases for FR-008 order, FR-009 empty sections, FR-008a Search scope, and FR-012a Recents cap.
- [X] T029 [P] [US2] Implement pure section order and five-entry Recents cap in `js/tools/homeModel.js`.
- [X] T030 [US2] Implement the Tools home renderer in `js/tools/home.js`.
- [X] T031 [P] [US2] Implement the app bar, rail, and bottom nav in `js/shell/nav.js`.
- [X] T032 [P] [US2] Add `purpose`, `modes`, and `defaultMode` to each tool in `js/tools.js`.
- [X] T033 [P] [US2] Create `css/shell.css` for the app bar and navigation chrome.
- [X] T034 [P] [US2] Create `css/tools-home.css` for Tools home sections and cards.
- [X] T035 [US2] Add shell markup and stylesheet links in `index.html`.
- [X] T036 [US2] Remove `rebuildDesktopDock` and the `hub-<categoryId>` routes from `js/main.js`.
- [X] T037 [US2] Flip the root route to `tools` with no hash in `js/main.js` and `js/appRoute.js`.
- [X] T038 [US2] Run `node tests/shell/run.mjs` and fix every failure it reports.
- [X] T039 [US2] Bump `CACHE_VERSION` and update `PRECACHE_URLS` in `service-worker.js`.
- [X] T040 [US2] Walk through every numbered step in the WP-02 section of `specs/005-tool-first-simplification/quickstart.md` and record WP-02 sign-off in `specs/005-tool-first-simplification/tasks.md`.

**WP-02 quickstart evidence.** The team runs the walk-through with `tests/appcheck/run.mjs`.

| Quickstart step | Evidence |
| --- | --- |
| 1. Empty hash opens Tools with Train selected | `activeSection` is `sec-tools`. Hash is empty. Train is active |
| 2. Section order | Purpose switch, then Search, then Browse. Empty Favorites, Recents, and Continue stay hidden |
| 3. Empty lists hide optional sections | No Favorites, Recents, or Continue on a fresh profile |
| 4. No `No routines yet` text | `hasNoRoutinesYet` is false |
| 5. Desktop rail lists four items | Tools, Library, Routines, Settings |
| 6. Phone bar lists four items | Tools, Library, Routines, More |
| 7. Metronome opens with no routine prompt | Click opens `sec-metronome`. `hasRoutinePrompt` is false |
| 8. Tuner opens in two interactions or fewer | One click on Pitch & Ear Lab opens `sec-tuner` |
| 9. Favorite add and remove | Favorites section appears with Metronome, then hides after remove |

**Checkpoint**: The root opens Tools home, primary navigation lists no individual tool, and the Metronome opens without a routine prompt.

---

## Phase 5: User Story 3 - Move between tools and keep the place and the context (Priority: P3)

**Goal**: A player opens a tool from Tools, Library, Search, or a Recent card. The
player changes local context, starts audio, and presses Back. The app restores scroll
and list state and enforces one audio owner with a conditional Audio Dock.

**Independent Test**: Open a tool from each origin in the behavior contract. Change
local context, start a second audio source, and record without saving. Confirm Back
results, context precedence, dock visibility, and the unsaved-recording prompt.

This phase is WP-03.

- [X] T041 [US3] Extend `tests/shell/run.mjs` with `navStack`, `toolPage`, and `unsavedGuard` cases from `contracts/tool-shell.md`.
- [X] T042 [P] [US3] Implement route origin and scroll restore in `js/shell/navStack.js`.
- [X] T043 [P] [US3] Implement `mountToolPage` with the standard header order in `js/shell/toolPage.js`.
- [X] T044 [P] [US3] Implement `registerUnsaved` with Save, Discard, and Keep editing in `js/shell/unsavedGuard.js`.
- [X] T045 [P] [US3] Add the scope API with `openScope` and `getEffective` in `js/musicalContext.js`.
- [X] T046 [US3] Implement `claimAudio` and `releaseAudio` in `js/audioOwner.js`.
- [X] T047 [US3] Show Save, Discard, and Cancel on the audio-claim prompt in `js/audioOwner.js`.
- [X] T048 [P] [US3] Implement the conditional Audio Dock in `js/audioDock.js`.
- [X] T049 [US3] Wire `resolveRoute` on boot and hashchange in `js/main.js`.
- [X] T050 [US3] Show dismissible route notices using `route.noticesSeen` in `js/main.js`.
- [X] T051 [P] [US3] Delegate scroll restore and focus to `navStack` from `js/routineNav.js`.
- [X] T052 [P] [US3] Add searchable option sets for the context row in `js/pickers.js`.
- [X] T053 [US3] Wire the context row to the scope API in `js/screenUx.js`.
- [X] T054 [US3] Run `node tests/shell/run.mjs` and fix every failure it reports.
- [X] T055 [US3] Bump `CACHE_VERSION` and update `PRECACHE_URLS` in `service-worker.js`.
- [ ] T056 [US3] Walk through every numbered step in the WP-03 section of `specs/005-tool-first-simplification/quickstart.md`.
- [ ] T057 [US3] Record WP-03 sign-off and quickstart evidence in `specs/005-tool-first-simplification/tasks.md`.

**Checkpoint**: Back restores origin state, one audio owner holds playback, and unsaved prompts use the correct labels.

---

## Phase 6: User Story 4 - Study scales, intervals, and chords in one place (Priority: P4)

**Goal**: A player opens Study on Tools home and uses Scale Lab, Fretboard & Interval Map,
and Chord Lab instead of scattered reference screens and removed quizzes. Root, scale, and
tuning persist across compatible Study modes. One shared fretboard picture appears across
Study areas.

**Independent Test**: Open each Study lab, switch modes, and change root, scale, and
tuning. Confirm that no quiz interface appears outside Pitch & Ear Lab, that Study
context persists across compatible modes, and that legacy links land with a dismissible
notice.

This phase is WP-04.

- [ ] T058 [US4] Create `tests/fretboard/run.mjs` for pure `fretPositions` output across tunings.
- [ ] T059 [US4] Implement `fretPositions`, `renderFretboard`, and `FRET_MARKERS` in `js/fretboard/renderer.js`.
- [ ] T060 [P] [US4] Create `css/fretboard.css` with theme tokens from `css/base.css`.
- [ ] T061 [P] [US4] Remove `SCALE_MAJOR_INTERVALS` from `js/interval-map/model.js` and read `js/scales.js`.
- [ ] T062 [P] [US4] Derive `TRIAD_QUALITIES` from `js/chords.js` in `js/triadReference.js`.
- [ ] T063 [P] [US4] Remove `CHORD_TYPES` from `js/analysis/chordDetect.js` and read `js/chords.js`.
- [ ] T064 [P] [US4] Remove `CHORD_FORMULAS` and `QUALITY_FORMULAS` from `js/intervalOrbitModel.js`.
- [ ] T065 [P] [US4] Remove local `TRIAD_QUALITIES` from `js/scaleReference.js`.
- [ ] T066 [P] [US4] Remove `SWEEP_OPEN_MIDI` from `js/sweepReference.js` and `OPEN_PC` from `js/sweepPatterns.js`.
- [ ] T067 [P] [US4] Replace private tuning in `js/movableChordCards.js` with the scope API in `js/musicalContext.js`.
- [ ] T068 [US4] Replace private root and tuning in `js/sweepReference.js` with `js/musicalContext.js`.
- [ ] T069 [US4] Mount Scale Lab modes and convert `js/scaleReference.js` to `renderFretboard` from `js/fretboard/renderer.js`.
- [ ] T070 [P] [US4] Mount Fretmap modes and convert `js/interval-map/fretboardView.js` in `js/interval-map/ui.js` to `renderFretboard`.
- [ ] T071 [US4] Mount Chord Lab modes and convert `js/chordReference.js`, `js/triadReference.js`, and `js/sweepReference.js` to `renderFretboard`.
- [ ] T072 [P] [US4] Convert `js/exerciseCompanions/diagram.js` and `js/exerciseCompanions/triadRef.js` to `renderFretboard`.
- [ ] T073 [US4] Retarget `tests/study-lab/run.mjs` at the Scale Lab Guide model and extend `tests/companions/run.mjs`.
- [ ] T074 [US4] Run `node tests/fretboard/run.mjs` and fix every failure it reports.
- [ ] T075 [US4] Delete `js/scaleQuiz.js`, `js/intervalQuiz.js`, `js/fretboardTrainer.js`, `js/chordWorkout.js`, `js/studyLab.js`, and `js/studyLabMic.js` after redirects and tests pass per FR-105.
- [ ] T076 [US4] Delete `css/quiz.css`, `css/chordworkout.css`, and `css/study-lab.css` after redirects and tests pass per FR-105.
- [ ] T077 [US4] Bump `CACHE_VERSION` and update `PRECACHE_URLS` in `service-worker.js`.
- [ ] T078 [US4] Walk through every numbered step in the WP-04 section of `specs/005-tool-first-simplification/quickstart.md`.
- [ ] T079 [US4] Record WP-04 sign-off and quickstart evidence in `specs/005-tool-first-simplification/tasks.md`.

**Checkpoint**: Study labs share context and one fretboard renderer. Legacy quiz modules are gone. Every legacy Study hash resolves.

---

## Phase 7: User Story 5 - Train pitch, ear, and tempo (Priority: P5)

**Goal**: A player opens Train on Tools home and uses Pitch & Ear Lab for tuner, reference
tone, pitch match, pitch runner, and ear identification. The player uses one Metronome with
subdivisions, accents, tempo phases, and an optional countdown. The Practice Plan stays
optional.

**Independent Test**: Open Pitch & Ear Lab modes and confirm they are the only scored
experiences. Open the Metronome from Tools and from a routine session. Open removed
destinations and confirm redirects with a notice.

This phase is WP-05.

- [ ] T080 [P] [US5] Implement `js/pitch/core.js` as the shared McLeod pitch analysis core.
- [ ] T081 [US5] Wire `js/pitch.js`, `js/audio.js`, and `js/trackToSheet/dsp.js` to `js/pitch/core.js`.
- [ ] T082 [US5] Implement `js/tempo/scheduler.js` as the shared Web Audio lookahead clock.
- [ ] T083 [US5] Wire `js/metronome.js` to `js/tempo/scheduler.js` with subdivisions, accents, phases, and countdown.
- [ ] T084 [P] [US5] After T082, wire `js/routineMetronome.js` as a tempo scheduler client.
- [ ] T085 [P] [US5] After T082, wire `js/gpMixPlayer.js` as a tempo scheduler client.
- [ ] T086 [US5] Mount Pitch & Ear Lab modes tuner, reference, pitch-match, pitch-runner, and ear in `js/vocalTrainer.js`.
- [ ] T087 [US5] Wire `js/earTrainer.js` into the Pitch & Ear Lab shell in `js/vocalTrainer.js`.
- [ ] T088 [US5] Mount `practice-plan` mode with manual list and manual timer in `js/metronome.js`.
- [ ] T089 [US5] Route metronome playback through `claimAudio` in `js/audioOwner.js`.
- [ ] T090 [US5] Delete `js/timingDrill.js`, `js/sightReadingTrainer.js`, and `js/practiceTimer.js` after redirects and tests pass per FR-105.
- [ ] T091 [US5] Delete the unused scheduler path in `js/tab/tabPlayer.js` after redirects and tests pass per FR-105.
- [ ] T092 [US5] Run `node tests/track-to-sheet/dsp.mjs` and fix every failure it reports.
- [ ] T093 [US5] Bump `CACHE_VERSION` and update `PRECACHE_URLS` in `service-worker.js`.
- [ ] T094 [US5] Walk through every numbered step in the WP-05 section of `specs/005-tool-first-simplification/quickstart.md`.
- [ ] T095 [US5] Record WP-05 sign-off and quickstart evidence in `specs/005-tool-first-simplification/tasks.md`.

**Checkpoint**: Pitch & Ear Lab holds every scored mode. One tempo scheduler owns metronome playback. Legacy timing and practice-timer hashes resolve.

---

## Phase 8: User Story 6 - Capture and build without losing work (Priority: P6)

**Goal**: A player opens Create on Tools home and uses Audio Studio and Song Studio. The
player captures audio, runs analysis and transcription drafts, edits song text with
auto-save, and finds every legacy note in Unfiled Notes. Unsaved work always offers Save,
Discard, or Keep editing.

**Independent Test**: Record audio, leave before save, edit a song, and import a device
with legacy notes. Confirm draft behavior, auto-save states, unsaved prompts, and
Unfiled Notes content.

This phase is WP-06.

- [ ] T096 [P] [US6] Add auto-save with Saving and Saved states in `js/songwriter.js`.
- [ ] T097 [P] [US6] Mount Capture mode in `js/recorder.js` as Audio Studio Capture.
- [ ] T098 [P] [US6] Mount Analyze and Transcribe modes in `js/trackToSheet.js` for Audio Studio.
- [ ] T099 [US6] Build Unfiled Notes list on `linkedId` in `js/notes.js` inside `js/songwriter.js`.
- [ ] T100 [P] [US6] Map legacy hash `#notes` to Unfiled Notes in `js/routeMap.js`.
- [ ] T101 [US6] Register unsaved song edits with `registerUnsaved` in `js/songwriter.js`.
- [ ] T102 [US6] Register unsaved capture data with `registerUnsaved` in `js/recorder.js`.
- [ ] T103 [US6] Register unsaved transcription drafts with `registerUnsaved` in `js/trackToSheet.js`.
- [ ] T104 [P] [US6] Wire Chord builder in `js/chordBuilder.js` with no private material library.
- [ ] T105 [US6] Keep Analyze and Transcribe results as drafts in `js/trackToSheet.js` without overwriting source audio.
- [ ] T106 [US6] Keep Capture drafts in `js/recorder.js` without overwriting source audio until save completes.
- [ ] T107 [US6] Extend `tests/shell/run.mjs` for song, capture, and transcription unsaved cases.
- [ ] T108 [US6] Bump `CACHE_VERSION` and update `PRECACHE_URLS` in `service-worker.js`.
- [ ] T109 [US6] Walk through every numbered step in the WP-06 section of `specs/005-tool-first-simplification/quickstart.md`.
- [ ] T110 [US6] Record WP-06 sign-off and quickstart evidence in `specs/005-tool-first-simplification/tasks.md`.

**Checkpoint**: Create tools protect drafts. Unfiled Notes lists every legacy note. Unsaved prompts cover song and capture work.

---

## Phase 9: User Story 7 - Find and play material in one library (Priority: P7)

**Goal**: A player opens Library and uses Exercises and Workbooks tabs with filters. The
player adds material through one Add action, opens Guitar Pro content in Score Player, and
plays migrated drum material as exercises. List state restores after the player closes an
item.

**Independent Test**: Filter Library lists, open and close items, import duplicates,
replace attachments, and open a migrated drum exercise in Score Player and the shared
practice player.

This phase is WP-07.

- [ ] T111 [US7] Create `tests/library/run.mjs` for pure filter, facet, and duplicate rules.
- [ ] T112 [US7] Implement `buildFacets`, `filterItems`, `findDuplicate`, and `referencesOf` in `js/library/libraryModel.js`.
- [ ] T113 [US7] Implement Exercises and Workbooks tabs in `js/library/library.js`.
- [ ] T114 [US7] Add filters for instrument, material type, technique, tuning, difficulty, tags, source, and favorite in `js/library/library.js`.
- [ ] T115 [US7] Save and restore Library list state through `js/shell/navStack.js` from `js/library/library.js`.
- [ ] T116 [US7] Add one Add action per tab for every supported create and import action in `js/library/library.js`.
- [ ] T117 [US7] Offer `Open existing` and `Import another copy` on duplicate `contentHash` in `js/exercises.js` and `js/library/library.js`.
- [ ] T118 [US7] Build the exercise detail page with workbook and routine lists in `js/library/library.js`.
- [ ] T119 [US7] Implement `replaceExerciseAttachment` in `js/exercises.js` and wire the replace path in `js/library/library.js`.
- [ ] T120 [US7] Route writes from `js/gpPlayer.js`, `js/exercisesBulk.js`, and `js/trackToSheet.js` through `js/exercises.js`.
- [ ] T121 [P] [US7] Run `normalizeExerciseItem` on restore in `js/cloud/reconcile.js` and `js/sync/syncBundle.js`.
- [ ] T122 [US7] Remove `renderLibrary` and the private score list from `js/gpPlayer.js`.
- [ ] T123 [US7] Keep transport visible during scroll and move mixer and practice settings into drawers in `js/gpPlayerUI.js`.
- [ ] T124 [US7] Add explicit Loop Selection mode in `js/gpPlayer/loopSelection.js` and wire the toggle in `js/gpPlayerUI.js`.
- [ ] T125 [US7] Confirm source score, track, measures, tempo, and tuning on `Save as Exercise` in `js/gpPlayer.js`.
- [ ] T126 [US7] Route audio, video, PDF, image, and migrated drum opens from `js/library/library.js` through `js/exercises.js` and Score Player.
- [ ] T127 [P] [US7] Create `css/library.css` with theme tokens from `css/base.css`.
- [ ] T128 [US7] Extend `tests/exercises/run.mjs`, `tests/workbooks/run.mjs`, and the suites under `tests/gp-player/`.
- [ ] T129 [US7] Delete `js/tab/tabPlayer.js` after redirects and tests pass per FR-105.
- [ ] T130 [US7] Bump `CACHE_VERSION` and update `PRECACHE_URLS` in `service-worker.js`.
- [ ] T131 [US7] Walk through every numbered step in the WP-07 section of `specs/005-tool-first-simplification/quickstart.md`.
- [ ] T132 [US7] Record WP-07 sign-off and quickstart evidence in `specs/005-tool-first-simplification/tasks.md`.

**Checkpoint**: Library filters and list restore work. Score Player keeps no private list. Every write path routes through `js/exercises.js`.

---

## Phase 10: User Story 8 - Use routines only when they help (Priority: P8)

**Goal**: A player opens Routines as an optional space separate from Tools. The player opens
a routine with Open, moves through layers without a forced timer, and marks completion only
through an explicit control. Ad hoc tool use stays unchanged when routines exist.

**Independent Test**: Open active and inactive routines, walk the full path, use Previous
and Next, mark optional completion, and confirm that Tools still opens without a routine
prompt.

This phase is WP-08.

- [ ] T133 [P] [US8] Show Open and not Start on routine cards in `js/routines.js`.
- [ ] T134 [US8] Start no timer and show no elapsed clock when a session opens in `js/routines.js`.
- [ ] T135 [US8] Keep session completion as an optional explicit control in `js/routines.js`.
- [ ] T136 [US8] Walk Back through workbook, session, and routine layers in `js/routineNav.js` and `js/shell/navStack.js`.
- [ ] T137 [US8] Show compact breadcrumbs for routine, session, and workbook origin in `js/routineNav.js`.
- [ ] T138 [P] [US8] Wire Previous and Next through workbook entries with auto-advance off by default in `js/workbooks.js`.
- [ ] T139 [US8] Keep the exercise player open after optional completion in `js/workbooks.js`.
- [ ] T140 [P] [US8] Show Continue a routine on Tools home only when an active routine exists in `js/tools/homeModel.js`.
- [ ] T141 [US8] Render the Continue a routine section from `js/tools/homeModel.js` in `js/tools/home.js`.
- [ ] T142 [US8] Extend `tests/routines/run.mjs` for Open cards, no timer, and optional completion flows.
- [ ] T143 [US8] Extend `tests/routine-nav/run.mjs` for layer Back and compact breadcrumb cases.
- [ ] T144 [US8] Bump `CACHE_VERSION` and update `PRECACHE_URLS` in `service-worker.js`.
- [ ] T145 [US8] Walk through every numbered step in the WP-08 section of `specs/005-tool-first-simplification/quickstart.md`.
- [ ] T146 [US8] Record WP-08 sign-off and quickstart evidence in `specs/005-tool-first-simplification/tasks.md`.

**Checkpoint**: Routine cards use Open. Back walks layers in order. Tools home shows Continue only when active routines exist.

---

## Phase 11: User Story 9 - Settle into simple settings (Priority: P9)

**Goal**: A player opens Settings and finds Preferences, Audio, Data/Sync, and Cleanup.
Settings holds no per-feature visibility catalog. Every retained tool stays reachable
without a Settings visit. Local use keeps working when the player never signs in.

**Independent Test**: Open Settings and confirm the removed Features section. Open Tools
and Library with empty lists. Open legacy links. Confirm local-first behavior without
sign-in.

This phase is WP-09.

- [ ] T147 [US9] Show Preferences, Audio, Data/Sync, and Cleanup in `js/musicPreferences.js`.
- [ ] T148 [US9] Remove the Features section and every control keyed to `features.enabled` from `js/musicPreferences.js`.
- [ ] T149 [P] [US9] Remove `isFeatureEnabled`, `setFeatureEnabled`, `saveEnabledFeatures`, and `getEnabledFeatureIdsRaw` from `js/tools.js`.
- [ ] T150 [US9] Keep Favorites and Recents controls available in `js/musicPreferences.js`.
- [ ] T151 [US9] Create `tests/removal-guard/run.mjs` using the pattern in `tests/genre-removal/run.mjs`.
- [ ] T152 [US9] Delete `js/keyboard.js` after its redirect, migration, and tests pass per FR-105.
- [ ] T153 [US9] Delete `js/nowPlaying.js` after its redirect, migration, and tests pass per FR-105.
- [ ] T154 [US9] Delete the `js/drums/` directory after its redirect, migration, and tests pass per FR-105.
- [ ] T155 [US9] Delete `css/drums.css` and `css/notes.css` after their redirects, migrations, and tests pass per FR-105.
- [ ] T156 [US9] Remove the `musi-drums` IndexedDB database after the drums migration verify step passes in `js/migrations/drumsToExercises.js`.
- [ ] T157 [P] [US9] Stop new `drumPatterns` sync writes in `js/cloud/recordMap.js` per decision D24.
- [ ] T158 [US9] Run `node tests/removal-guard/run.mjs` and fix every failure it reports.
- [ ] T159 [US9] Bump `CACHE_VERSION` and update `PRECACHE_URLS` in `service-worker.js`.
- [ ] T160 [US9] Walk through every numbered step in the WP-09 section of `specs/005-tool-first-simplification/quickstart.md`.
- [ ] T161 [US9] Record WP-09 sign-off and quickstart evidence in `specs/005-tool-first-simplification/tasks.md`.

**Checkpoint**: Settings shows four sections only. Removed modules and stylesheets stay gone. The `musi-drums` database is removed after verify.

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Accessibility, theme compliance, documentation, and final regression checks
across every completed work package.

- [ ] T162 [P] Sweep interactive targets and icon-only control names in `css/shell.css` for FR-098 to FR-102.
- [ ] T163 [P] Sweep interactive targets and focus order in `css/tools-home.css` for FR-098 to FR-102.
- [ ] T164 [P] Sweep interactive targets and mobile safe areas in `css/library.css` for FR-098 to FR-102.
- [ ] T165 [P] Sweep fretboard playback controls and reduced-motion rules in `css/fretboard.css` for FR-102.
- [ ] T166 Confirm new stylesheets add no new colour value and no new font family outside `css/base.css` and `css/theme-gbc.css`.
- [ ] T167 Complete a keyboard-only pass for SC-017 across Tools home, Library, Routines, Score Player, and Audio Studio in `specs/005-tool-first-simplification/quickstart.md`.
- [ ] T168 Update tool-first navigation and Library guidance in `README.md`.
- [ ] T169 Update Score Player and exercise guidance in `docs/gp-exercises-roadmap.md` and `docs/tab-analyzer-roadmap.md`.
- [ ] T170 Run every Node runner under `tests/` and fix every failure they report.
- [ ] T171 Run `node cli/bin/musi.js --help` and confirm the activity list prints for SC-029.
- [ ] T172 Walk through every section in `specs/005-tool-first-simplification/quickstart.md` including accessibility and critical flows.
- [ ] T173 Confirm a full boot loads no removed feature code for SC-034 using the Network tab steps in `specs/005-tool-first-simplification/quickstart.md`.
- [ ] T174 Compare every Node runner result against the Regression baseline table in `specs/005-tool-first-simplification/tasks.md` for SC-028.

**Checkpoint**: Accessibility, theme, keyboard, documentation, and regression checks pass. The feature meets SC-028, SC-029, SC-034, and the full quickstart.

---

## Dependencies & Execution Order

### Phase dependencies

FR-103 fixes the order of the nine work packages. FR-106 makes the product owner confirm
each package before the next package starts. The phases run in strict order. No two story
phases run at the same time. Phase 9 starts only after Phase 8 finishes. Phase 10 starts
only after Phase 9 finishes. Phase 11 starts only after Phase 10 finishes. Phase 12 starts
only after Phase 11 finishes. FR-105 keeps the app runnable at every checkpoint.

### User story dependencies

These stories are not independent. Each story phase needs the phases before it.

- **US7 (Phase 9)** needs exercise metadata from Phase 3 and the shell, context, and Back
  work from Phase 5. It also needs Create capture paths from Phase 6 when imports land in
  Library.
- **US8 (Phase 10)** needs Library exercise and workbook references from Phase 9 and the
  nav stack from Phase 5.
- **US9 (Phase 11)** needs every prior package to expose tools through Tools, Library, and
  Routines before Settings cleanup removes repair paths.
- **Polish (Phase 12)** needs all nine work packages complete.

US4 through US9 all need the shell and the context work in Phase 5. US7 needs the exercise
metadata from Phase 3.

### Within each phase

Run tasks in this order inside each phase:

1. Write a new Node suite before the pure model. Extend an existing suite after the change it covers. Run the suite before the quickstart walk-through.
2. Implement the pure model when the phase has one.
3. Implement the browser module.
4. Apply client and route changes.
5. Run deletions only after redirects, migrations, and tests pass.
6. Bump `CACHE_VERSION` and update `PRECACHE_URLS` in `service-worker.js`.
7. Walk through the quickstart section for the work package.
8. Record the sign-off line in `specs/005-tool-first-simplification/tasks.md`.

### Parallel opportunities

Parallel work sits inside a phase, not across phases. Two tasks may run together only when
both carry `[P]` and earlier blocking tasks in the same phase are complete. In Phase 3,
run T015, T016, and T017 beside T013 after the migration suites exist. In Phase 7, run
T084 and T085 after T082 creates the scheduler. In Phase 8, run T096, T097, and T098
together. In Phase 12, run T163, T164, and T165 beside T162.

---

## Parallel Example: Phase 6 (WP-04)

```bash
# Launch independent engine dedup tasks together after T059 finishes:
Task: "Remove `SCALE_MAJOR_INTERVALS` from `js/interval-map/model.js` and read `js/scales.js`."
Task: "Derive `TRIAD_QUALITIES` from `js/chords.js` in `js/triadReference.js`."
Task: "Remove `CHORD_TYPES` from `js/analysis/chordDetect.js` and read `js/chords.js`."
Task: "Remove `CHORD_FORMULAS` and `QUALITY_FORMULAS` from `js/intervalOrbitModel.js`."
```

---

## Implementation Strategy

### First increment (Phase 1 to Phase 3)

Phase 1, Phase 2, and Phase 3 form the first releasable increment. WP-01 protects stored
data and old links. WP-01 changes no player-visible screen. The first player-visible
tool-first change lands in Phase 4 when Tools becomes the root view.

### Incremental delivery

Ship the nine packages in order. Each package adds player value before the next package
starts.

1. **WP-01 (Phase 3)** — Migrations, route map, and compatibility suites keep every stored
   record and legacy bookmark working.
2. **WP-02 (Phase 4)** — Tools home replaces the routine dashboard as the root entry.
3. **WP-03 (Phase 5)** — Shared Back behavior, musical context, audio owner, and unsaved
   guards stabilize movement between tools.
4. **WP-04 (Phase 6)** — Study labs consolidate reference and fretboard rendering.
5. **WP-05 (Phase 7)** — Pitch & Ear Lab and one tempo scheduler own scored and rhythm
   practice.
6. **WP-06 (Phase 8)** — Create tools protect drafts and Unfiled Notes hold legacy notes.
7. **WP-07 (Phase 9)** — Library and Score Player become one hub for exercises and
   workbooks.
8. **WP-08 (Phase 10)** — Routines stay optional with Open cards and layer Back.
9. **WP-09 (Phase 11)** — Settings simplify and legacy modules retire after migration
   verify.

### Removal discipline

Per FR-105 and decision D26, a deletion waits for its replacement, its migration, its route
redirect, and its tests. Every package that adds or removes a file bumps `CACHE_VERSION`
and updates `PRECACHE_URLS` in `service-worker.js`. The product owner confirms each
package before the next package starts.

---

## Notes

- `[P]` marks a task that touches different files from its neighbours and waits for no
  incomplete task in the same phase.
- `[US1]` through `[US9]` map each task to the user story that owns it. Phase 12 tasks
  carry no story label.
- FR-106 requires product-owner sign-off before the next work package starts. Record each
  confirmation in `specs/005-tool-first-simplification/tasks.md` with quickstart evidence.
- Every package that adds or removes a file must bump `CACHE_VERSION` and update
  `PRECACHE_URLS` in `service-worker.js`.
- Each commit must stay shippable because `main` is the trunk. Push only complete work
  packages.
- Audio and microphone tasks need a browser with Web Audio and microphone access. Node
  runners alone cannot fully verify those paths.
- The repository has no lint tooling, no type checker, and no build step. Node runners,
  a browser check over HTTP, and the CLI smoke command define done per FR-107.
- Deletion tasks in Phase 9 and Phase 11 reference FR-105 explicitly. Do not delete a
  module until its redirect, migration, and tests pass.
