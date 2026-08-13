---

description: "Task list for the Guitar Pro Player Overhaul feature"
---

# Tasks: Guitar Pro Player Overhaul

**Input**: Design documents from `/specs/002-gp-player-overhaul/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/),
[research-inventory.md](./research-inventory.md), [quickstart.md](./quickstart.md)

**Tests**: Tests are required for this feature. The plan and the quickstart name five new Node
suites and six browser harness pages. Write each test task before its implementation tasks.
Confirm that the new test fails first.

**Organization**: Tasks group by user story. Each story phase ends at a checkpoint where a
person can test that story on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: The task can run in parallel. It touches a different file and it waits for no
  incomplete task.
- **[Story]**: The user story that the task serves, for example US1.
- Every task names the exact file path.

## Path Conventions

This repository is a flat static PWA. Web app source sits at the repository root in `js/`
and `css/`. Tests sit in `tests/<area>/run.mjs`. The CLI sits in `cli/` and shares the
parse layer in `js/tab/`. See the Project Structure section of `plan.md`.

## Verification commands

Run these from the repository root. Use them at every checkpoint.

```bash
node tests/gp-player/run.mjs
node tests/exercises/run.mjs
node tests/workbooks/run.mjs
node tests/companions/run.mjs
node tests/track-to-sheet/run.mjs
node tests/cloud/run.mjs
cd cli && node bin/musi.js reference --root C --type "Major (Ionian)"
```

And for the browser part, in two terminals:

```bash
python3 -m http.server 8080
node tests/gp-player/run-browser.mjs
```

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Record the green baseline, then add the test infrastructure that every later
phase needs. The suite runner must run the ten current files first so the baseline stays
visible.

- [X] T001 Run the baseline suites and record the final line of each: `for f in tests/gp-player/*.mjs; do [[ "$f" == *domShim* ]] && continue; node "$f"; done`, `node tests/exercises/run.mjs`, `node tests/workbooks/run.mjs`, `node tests/companions/run.mjs`, `node tests/track-to-sheet/run.mjs`, `node tests/cloud/run.mjs`, and `cd cli && node bin/musi.js reference --root C --type "Major (Ionian)"`
- [X] T002 Create `tests/gp-player/run.mjs` as the suite runner that runs every file in `tests/gp-player/` except `domShim.mjs`, runs the ten current files first in a fixed order, then runs every new file alphabetically, and prints `gp-player suite: ok` when all pass
- [X] T003 Create `tests/gp-player/fixtures/makeFixtures.mjs` as the Node-only fixture builder scaffold with `node:zlib` `deflateRawSync`, hand-built local and central directory headers, and a `writeGpZip(gpifXml, outPath)` helper that writes a `.gp` ZIP archive with `Content/score.gpif`
- [X] T004 [P] Extend `tests/gp-player/fixtures/makeFixtures.mjs` to write the playback fixtures `tempo-change.gp5`, `repeat-8bar.gp5`, `repeat-endings.gp5`, `nested-repeat.gp5`, `ties-rhythm.gp5`, and `two-voices.gp5` (depends on T003)
- [X] T005 Extend `tests/gp-player/fixtures/makeFixtures.mjs` to write the layout and load fixtures `techniques.gp5`, `meter-change.gp5`, `large-200bar.gp5`, `seven-string.gp5`, `eight-string.gp5`, `odd-meter-13-16.gp5`, `many-tracks.gp5`, `drums-only.gp5`, `one-bar.gp5`, `empty-trailing-bar.gp5`, and `empty-track.gp5` (depends on T004)
- [X] T006 Extend `tests/gp-player/fixtures/makeFixtures.mjs` to write the reject fixtures `corrupt.bin`, `legacy.gpx`, `legacy.gp3`, and `legacy.gp4` (depends on T005)
- [X] T007 Extend `tests/gp-player/fixtures/makeFixtures.mjs` to write the GPIF `.gp` copies `tempo-change.gp`, `repeat-endings.gp`, `ties-rhythm.gp`, `two-voices.gp`, and `techniques.gp` through `writeGpZip` (depends on T004, T005)
- [X] T008 Create `tests/gp-player/parse.mjs` with end-to-end `parseGuitarPro` checks for one `.gp` fixture and one `.gp5` fixture, plus the four verbatim reject messages for `.gpx`, `.gp3`, `.gp4`, and `corrupt.bin`
- [X] T009 [P] Create `tests/gp-player/audio/harness.js` as the shared harness helper for every audio page: an `#out` writer, a measurement table printer, and a `RESULT: PASS` / `RESULT: FAIL` line contract
- [X] T010 Create `tests/gp-player/run-browser.mjs` as the headless Chrome driver modelled on `tests/sync/run-browser.mjs`: spawn Chrome with CDP, navigate each harness page, read `#out`, and require a `RESULT: PASS` line (depends on T009)

**Checkpoint**: `node tests/gp-player/run.mjs` runs the ten baseline files and the new
runner. `node tests/gp-player/fixtures/makeFixtures.mjs` writes every fixture from
`quickstart.md`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extend the parse layer and the model. No user story can start before this phase.

**⚠️ CRITICAL**: Phase 2 blocks every user story. User Story 2 needs `beats` and technique
data from this phase. User Story 4 needs the timeline from User Story 1.

- [X] T011 Extend `js/tab/tabModel.js` with the optional `TabModel` fields from `data-model.md`: `tempoMap`, `beats`, `rests`, `trackInfo`, and `voiceCount`
- [X] T012 Extend `js/tab/tabModel.js` with the new `TabEvent` fields: `voiceIndex`, `beatIndex`, `velocity`, `tie`, `grace`, `graceTransition`, `bend`, and `slideKind` (depends on T011)
- [X] T013 Extend `js/tab/tabModel.js` with `measures[].repeat` (`open`, `closeCount`, `endings`) (depends on T011)
- [X] T014 Update `cloneModel` in `js/tab/tabModel.js` to copy every new `TabModel`, `TabEvent`, and `measures[].repeat` field (depends on T011, T012, T013)
- [X] T015 Update `sliceModelByBeats` and `sliceGuitarModel` in `js/tab/tabModel.js` to carry `tempoMap`, `beats`, `rests`, `trackInfo`, `voiceCount`, and every new `TabEvent` field through the slice (depends on T014)
- [X] T016 Update `transposeModel` in `js/tab/tabModel.js` to carry every new field and to keep `beatIndex` links valid after transpose (depends on T014)
- [X] T017 Update `retuneModel` in `js/tab/tabModel.js` to carry every new field and to reject a mismatched string count with a warning (depends on T014)
- [X] T018 Update `transformModel` in `js/tab/tabModel.js` to carry every new field through the combined transpose and retune path (depends on T016, T017)
- [X] T019 Extend `readGpifTempo` in `js/tab/guitarPro.js` to emit the full `tempoMap` array with `barIndex`, `beat`, `bpm`, and `linear` (depends on T011)
- [X] T020 Extend `buildGpifTrackModel` in `js/tab/guitarPro.js` to read repeat marks and volta endings into `measures[].repeat` (depends on T013)
- [X] T021 Extend `buildGpifTrackModel` in `js/tab/guitarPro.js` to read every voice, not the first playable voice only, and to emit `beats[]`, `rests[]`, and `voiceCount` (depends on T011)
- [X] T022 Extend `buildGpifTrackModel` in `js/tab/guitarPro.js` to keep ties, grace notes, note dynamics as `velocity`, bend points, and slide direction on `TabEvent` rows (depends on T012)
- [X] T023 Extend `buildGpifPercussionModel` in `js/tab/guitarPro.js` to emit `beats[]`, `rests[]`, and `voiceCount` for drum tracks (depends on T011)
- [X] T024 Extend `buildGpifTrackModel` in `js/tab/guitarPro.js` to emit `trackInfo` with MIDI program, volume, and pan from GPIF channel data (depends on T011)
- [X] T025 Extend `readMeasureHeader` in `js/tab/gp5.js` to store repeat bytes in `measures[].repeat` instead of discarding them (depends on T013)
- [X] T026 Extend `buildModel` in `js/tab/gp5.js` to read every voice, ties, grace notes, dynamics, bend points, and slide direction, and to emit `beats[]`, `rests[]`, and `voiceCount` (depends on T011, T012)
- [X] T027 Extend `buildPercussionModel` in `js/tab/gp5.js` to emit `beats[]`, `rests[]`, and `voiceCount` for drum tracks (depends on T011)
- [X] T028 Extend `readMidiChannels` and `readTrack` in `js/tab/gp5.js` to keep MIDI program, track volume, track pan, and capo in `trackInfo` (depends on T011)
- [X] T029 Add the top-level `warnings` array and `tracks[].program`, `tracks[].volume`, and `tracks[].pan` in `assembleResult` in `js/tab/guitarPro.js` (depends on T024, T028)
- [X] T030 Move `serializeExerciseScore` in `js/gpExerciseScore.js` to `musi-tab-model` version 3 and keep a version 2 reader in `gpResultFromTabModelJson` (depends on T014)
- [X] T031 Extend `tests/gp-player/exercise-slice.mjs` to assert that version 3 slices carry `tempoMap`, `beats`, `rests`, and every new `TabEvent` field through `sliceModelByBeats` (depends on T015, T030)
- [X] T032 Extend `tests/gp-player/parse.mjs` to assert `tempoMap`, `beats`, `rests`, `measures[].repeat`, ties, grace notes, `velocity`, bend points, `slideKind`, `voiceCount`, `trackInfo`, and top-level `warnings` on the playback fixtures (depends on T008, T019, T026)

**Checkpoint**: `node tests/gp-player/parse.mjs` passes. `node tests/gp-player/run.mjs`
keeps the ten baseline files green. The parse layer keeps the data that playback and layout
need.

---

## Phase 3: User Story 1 - Playback matches the written score (Priority: P1) 🎯 MVP

**Goal**: The player follows tempo changes, repeats, alternate endings, ties, rests, grace
notes, and every voice. The playhead stays on the sounding beat. Loop passes stay gapless.

**Independent Test**: Open `tempo-change.gp5`, `repeat-8bar.gp5`, `repeat-endings.gp5`,
`ties-rhythm.gp5`, and `two-voices.gp5`. Play each score from start to end. Compare total
time and bar order against the source score. Watch the playhead against the sounding note.

### Tests for User Story 1

- [X] T033 [US1] Create `tests/gp-player/play-order.mjs` with repeat expansion, alternate ending selection, nested-repeat flatten with a warning per FR-003, and a `maxPasses` guard per `contracts/score-timeline.md`
- [X] T034 [US1] Create `tests/gp-player/timeline.mjs` with tempo segments, total duration within 1 percent, tie merge, grace note placement, rest advance, and all-voice scheduling per `contracts/score-timeline.md`

### Implementation for User Story 1

- [X] T035 [US1] Create `js/tab/playOrder.js` with `buildPlayOrder(measures, options)` returning `{ passes, barOrder, flattened, warnings }` per `contracts/score-timeline.md` (depends on T033)
- [X] T036 [US1] Create `js/tab/scoreTimeline.js` with `buildTimeline`, `positionAtSeconds`, `secondsAtPosition`, `withRate`, and `loopWindow` per `contracts/score-timeline.md` (depends on T034, T035)
- [X] T037 [US1] Rewrite the scheduler in `js/gpMixPlayer.js` to walk the `Timeline` event list, keep the `createGpMixPlayer` factory name, and keep the current method names (depends on T036)
- [X] T038 [US1] Add `setRate`, `seekToBar`, `getPosition`, `destroy`, `onPositionFrame`, `onAudioBlocked`, `onLoopPass`, and `onEnded` to `js/gpMixPlayer.js` per `contracts/player-engine.md` (depends on T037)
- [X] T039 [US1] Make `setBpm` in `js/gpMixPlayer.js` wrap `setRate` and keep the old `load` parameter names as aliases for `timeline` and `tracks` (depends on T038)
- [X] T040 [US1] Implement gapless loop scheduling in `js/gpMixPlayer.js`: schedule across the boundary in the same lookahead window, replace the `clearVoices()` hard stop with an 8 millisecond fade per FR-013, and keep the loop rest countdown per FR-014 (depends on T037)
- [X] T041 [US1] Add the frame-driven playhead loop in `js/gpPlayerUI.js` that reads `audioCtx.currentTime` and maps it through `scoreTimeline.js` `positionAtSeconds` (depends on T036, T038)
- [X] T042 [US1] Re-anchor position on `visibilitychange` and on an `AudioContext` state change in `js/gpPlayerUI.js` (depends on T041)
- [X] T043 [P] [US1] Create `tests/gp-player/audio/onset-timing.html` to measure note onset times against the timeline with a 50 millisecond threshold (depends on T009, T036)
- [X] T044 [P] [US1] Create `tests/gp-player/audio/total-duration.html` to measure total playback time within 1 percent of the source score (depends on T009, T036)
- [X] T045 [P] [US1] Create `tests/gp-player/audio/loop-boundary.html` to measure loop pass gap across 20 passes with a 10 millisecond threshold (depends on T009, T040)
- [X] T046 [P] [US1] Create `tests/gp-player/audio/long-drift.html` to measure playhead drift over a long render with 200 millisecond drift and 100 millisecond gap limits (depends on T009, T041)
- [X] T047 [US1] Register `onset-timing.html`, `total-duration.html`, `loop-boundary.html`, and `long-drift.html` in `tests/gp-player/run-browser.mjs` (depends on T010, T043, T044, T045, T046)

**Checkpoint**: `node tests/gp-player/play-order.mjs` and `node tests/gp-player/timeline.mjs`
pass. The four US1 browser harness pages print `RESULT: PASS`. Manual checks 1 to 8 in
`quickstart.md` for User Story 1 pass.

---

## Phase 4: User Story 2 - The score shows rhythm and technique (Priority: P2)

**Goal**: The score draws rhythm marks, rests, time signatures, repeat marks, volta brackets,
and every technique from FR-021. The learner can read the part without audio.

**Independent Test**: Open `techniques.gp5` and `meter-change.gp5`. Compare the drawn score
against Guitar Pro or Songsterr. Count techniques in the file and on screen. Set the browser
width to 360 CSS pixels and confirm legibility.

### Tests for User Story 2

- [X] T048 [US2] Create `tests/gp-player/score-layout.mjs` with glyph counts for rhythm marks, rests, time signatures, repeat marks, volta brackets, the 13 techniques, bend amounts, and the 12 CSS pixel fret font floor at 360 CSS pixels wide

### Implementation for User Story 2

- [X] T049 [US2] Create `js/gpPlayer/scoreLayout.js` with `layoutBar`, `layoutScore`, the lane set, and the glyph and overlay kinds from `contracts/score-view.md` (depends on T048)
- [X] T050 [US2] Add rhythm mark layout to `js/gpPlayer/scoreLayout.js`: stems, flags, beams, dots, and tuplet brackets (depends on T049)
- [X] T051 [US2] Add rest glyph layout to `js/gpPlayer/scoreLayout.js` from `model.rests` and rest beats in `model.beats` (depends on T049)
- [X] T052 [US2] Add time signature layout to `js/gpPlayer/scoreLayout.js` at the first bar and at every change (depends on T049)
- [X] T053 [US2] Add repeat mark and volta bracket layout to `js/gpPlayer/scoreLayout.js` from `measures[].repeat` (depends on T049)
- [X] T054 [US2] Add the 13 technique glyph kinds to `js/gpPlayer/scoreLayout.js`: bend, slide, hammer-on, pull-off, vibrato, palm mute, harmonic, tap, slap, pop, trill, tremolo, and dead note (depends on T049)
- [X] T055 [US2] Add bend amount glyphs to `js/gpPlayer/scoreLayout.js` with `bendValue` labels per FR-022 (depends on T054)
- [X] T056 [US2] Rewrite the render body of `js/gpPlayer/parchmentView.js` to draw glyph boxes from `scoreLayout.js` and to write one inline `<svg>` per bar for curved overlays (depends on T050, T051, T052, T053, T054, T055)
- [X] T057 [US2] Add `setShowStandardNotation`, `setActivePosition`, and `resumeAutoFollow` to the `mountParchmentView` handle in `js/gpPlayer/parchmentView.js` per `contracts/score-view.md` (depends on T056)
- [X] T058 [US2] Add the optional standard notation staff lane to `js/gpPlayer/scoreLayout.js` and `js/gpPlayer/parchmentView.js` with an octave-down marker for guitar per FR-026 and decision D22 (depends on T049, T056)
- [X] T059 [US2] Remove the `state.gp.drumTracks?.[0]?.model` fallback in `parchmentModels()` in `js/gpPlayerUI.js` so the view shows the selected track only per FR-031 (depends on T056)
- [X] T060 [US2] Confirm that the `referenceModel` fallback in `mixLoadBase()` in `js/gpPlayerUI.js` never overrides a selected track. Keep it only as a null guard for a score with drum tracks only (depends on T059)
- [X] T061 [P] [US2] Add glyph lane styles to `css/gpplayer.css` for `notationStaff`, `techniqueAbove`, `rhythm`, and `techniqueBelow` (depends on T056)
- [X] T062 [US2] Measure the contrast ratio of every new glyph colour against the parchment background in `css/gpplayer.css`. Raise any colour that falls below 7 to 1 per FR-032 (depends on T061)
- [X] T063 [US2] Enforce the 12 CSS pixel fret font floor at 360 CSS pixels wide in `js/gpPlayer/scoreLayout.js` and expose `fontPx` for the layout test (depends on T049)

**Checkpoint**: `node tests/gp-player/score-layout.mjs` passes. Manual checks 1 to 8 in
`quickstart.md` for User Story 2 pass. SC-004 technique coverage reaches at least 95
percent on `techniques.gp5`.

---

## Phase 5: User Story 3 - Practice controls stay on the main screen (Priority: P3)

**Goal**: Track tabs, the practice rail, loop drag on the bar strip, per-track volume, and
keyboard help stay on the main screen. Every primary control needs a 44 by 44 CSS pixel
touch target.

**Independent Test**: Set a two bar loop, drop speed to 70 percent, turn on count-in, and
switch track. Count actions and time for each task. Confirm no menu step is required.

### Tests for User Story 3

- [X] T064 [US3] Extend `tests/gp-player/wiring.mjs` to assert that `mountGpPlayer` renders the track tab strip, the practice rail, and the two-row transport dock without opening a panel

### Implementation for User Story 3

- [X] T065 [US3] Create `js/gpPlayer/trackTabs.js` with an always visible track strip that switches track in one action (depends on T064)
- [X] T066 [US3] Create `js/gpPlayer/practiceRail.js` with main-screen speed, loop toggle, loop range display, clear loop, metronome toggle, and count-in toggle (depends on T064)
- [X] T067 [US3] Create `js/gpPlayer/panelManager.js` with `open(id)` that closes other panels first and `close(id)` that detaches every listener and observer for that panel (depends on T064)
- [X] T068 [US3] Create `js/gpPlayer/shortcutHelp.js` with the single shortcut table and the help panel content per FR-041 (depends on T064)
- [X] T069 [US3] Rewrite `js/gpPlayer/transportDock.js` as a two-row dock that hosts the practice rail from `practiceRail.js` and keeps keyboard focus order (depends on T066)
- [X] T070 [US3] Add loop drag on the bar strip in `js/gpPlayer/measureNav.js` and wire it through `js/gpPlayer/loopSelection.js` with no mode toggle (depends on T066)
- [X] T071 [US3] Add long-press loop drag on the staff in `js/gpPlayer/parchmentView.js` per decision D17 (depends on T070)
- [X] T072 [US3] Remove the `Loop Selection` mode toggle from `js/gpPlayer/settingsDrawer.js` and route loop drag only through `measureNav.js` and `loopSelection.js` (depends on T070)
- [X] T073 [US3] Add per-track volume, mute, and solo to `js/gpPlayer/trackMixer.js` and persist `trackVolumes` through `js/gpPlayer/playerState.js` (depends on T065)
- [X] T074 [US3] Trim `js/gpPlayer/settingsDrawer.js` and `js/gpPlayer/playerMenu.js` for controls that moved to the practice rail and the track tab strip, and add the help entry that opens `shortcutHelp.js` (depends on T066, T068, T072)
- [X] T075 [US3] Wire `js/gpPlayer/trackTabs.js`, `js/gpPlayer/practiceRail.js`, `js/gpPlayer/panelManager.js`, and `js/gpPlayer/shortcutHelp.js` into `mountGpPlayer` in `js/gpPlayerUI.js` (depends on T065, T066, T067, T068, T069)
- [X] T076 [US3] Register `js/gpPlayer/metronomePanel.js`, `js/gpPlayer/annotationsDrawer.js`, and `js/gpPlayer/exerciseImportPanel.js` with `js/gpPlayer/panelManager.js` (depends on T067)
- [X] T077 [US3] Add count-in count on screen and the loop rest countdown to `js/gpPlayer/metronomeState.js` (depends on T066)
- [X] T078 [US3] Add the `role="status"` bar announcement, text names on every control, keyboard-only transport, and the `prefers-reduced-motion` rule in `js/gpPlayerUI.js` per FR-066 to FR-069 (depends on T069, T068, T075)
- [X] T079 [P] [US3] Add 44 by 44 CSS pixel touch targets and portrait and landscape layouts for the transport dock, track tabs, and practice rail in `css/gpplayer.css` per FR-043 and FR-045 (depends on T069, T065)

**Checkpoint**: `node tests/gp-player/wiring.mjs` passes. Manual checks 1 to 9 in
`quickstart.md` for User Story 3 pass. SC-005, SC-006, and SC-007 targets are reachable in
two actions or fewer.

---

## Phase 6: User Story 4 - The playback sounds like the instruments (Priority: P4)

**Goal**: Each track sounds like its instrument family. Dynamics, bends, slides, vibrato, and
mutes shape the tone. Dense chords stay below full scale.

**Independent Test**: Play a score with bass and guitar before and after the change. Play
`techniques.gp5` for bends and palm mutes. Play a dense chord passage and confirm no clip.

### Tests for User Story 4

- [X] T080 [US4] Extend `tests/gp-player/smoke.mjs` to assert that `createGpMixPlayer` schedules through `instrumentVoices.js` when `trackInfo.program` is present on a model

### Implementation for User Story 4

- [X] T081 [US4] Create `js/gpPlayer/instrumentVoices.js` with `createVoiceFactory`, `familyForProgram`, `playNote`, and the five families `cleanGuitar`, `distortedGuitar`, `acousticGuitar`, `bass`, and `keys`. Drum hits keep `js/drums/drumEngine.js` (depends on T080)
- [X] T082 [US4] Wire `instrumentVoices.js` into `js/gpMixPlayer.js` with a `GainNode` for each track and replace `scheduleGuitarTone` (depends on T081, T037)
- [X] T083 [US4] Apply dynamics from `velocity`, bend and slide and vibrato pitch automation, and palm mute and dead note damping in `js/gpPlayer/instrumentVoices.js` per FR-048 to FR-050 (depends on T081)
- [X] T084 [US4] Add the headroom budget and the voice count limit in `js/gpPlayer/instrumentVoices.js` and route each track through the shared `DynamicsCompressorNode` in `js/audio.js` per FR-051 (depends on T082)
- [X] T085 [US4] Wire the blocked audio message path through `onAudioBlocked` in `js/gpMixPlayer.js` and `js/gpPlayerUI.js` per FR-052 (depends on T038, T078)
- [X] T086 [P] [US4] Create `tests/gp-player/audio/peak-headroom.html` to measure peak output below full scale on a dense chord passage (depends on T009, T084)
- [X] T087 [P] [US4] Create `tests/gp-player/audio/instrument-spectral.html` to measure spectral distance between bass and guitar voices for SC-016 (depends on T009, T081)
- [X] T088 [US4] Register `peak-headroom.html` and `instrument-spectral.html` in `tests/gp-player/run-browser.mjs` (depends on T047, T086, T087)
- [X] T089 [US4] Add the 10 fixed passages under `tests/gp-player/fixtures/passages/` for SC-015 and SC-016 per `quickstart.md` (depends on T003)

**Checkpoint**: The two US4 browser harness pages print `RESULT: PASS`. Manual checks 1 to 6
in `quickstart.md` for User Story 4 pass. `node tests/gp-player/smoke.mjs` stays green.

---

## Phase 7: User Story 5 - The player opens a large score without a freeze (Priority: P5)

**Goal**: A large file shows read progress and keeps the screen responsive. A new load
resets practice settings. Teardown uses no processor time after the learner leaves. Offline
open works after one earlier online visit.

**Independent Test**: Open `large-200bar.gp5` and watch progress. Load a second file and
confirm reset. Leave the player and listen for audio. Turn off the network and reopen.

### Tests for User Story 5

- [X] T090 [US5] Create `tests/gp-player/offline-manifest.mjs` to assert that `service-worker.js` `PRECACHE_URLS` lists every file under `js/gpPlayer/`, GP modules in `js/`, GP modules in `js/tab/`, `css/gpplayer.css`, and the three files that the inventory misses today: `js/gpPlayer/layoutMetrics.js`, `js/gpPlayer/viewModes.js`, and `js/gpExerciseScore.js`

### Implementation for User Story 5

- [X] T091 [US5] Create `js/tab/gpParseWorker.js` as the module worker entry that receives bytes, calls `parseGuitarPro`, and posts `{ type: 'progress', ratio }` then `{ type: 'result', gp }` (depends on T090)
- [X] T092 [US5] Create `js/tab/gpParseClient.js` with worker start, progress callbacks, and a chunked main-thread fallback that yields between tracks when `Worker` is missing (depends on T091)
- [X] T093 [US5] Wire read progress and error messages in `js/gpPlayer.js` through `gpParseClient.js`, and add the read progress region to `index.html` per FR-054 and FR-056 (depends on T092)
- [X] T094 [US5] Wire `js/tab/gpParseClient.js` into `mountGpPlayer` in `js/gpPlayerUI.js` for embedder byte loads with progress callbacks (depends on T092)
- [X] T095 [US5] Add `resetForNewScore()` to `js/gpPlayer/playerState.js` to clear loop, speed, transpose, tuning, and selected track on a new load per FR-059. Keep the per-score records that FR-064 protects: section notes, the automatic scroll setting, the zoom setting, and the metronome settings (depends on T093)
- [X] T096 [US5] Add full teardown in `js/gpPlayer.js` and `js/gpPlayerUI.js` so the player stops audio, cancels the frame loop, disconnects nodes, and uses no processor time after the learner leaves per FR-060 (depends on T038, T041, T095)
- [X] T097 [US5] Add the precache entries for every new module and bump `CACHE_VERSION` in `service-worker.js` so `tests/gp-player/offline-manifest.mjs` passes (depends on T090)
- [X] T098 [US5] Keep the audio transcription path working in `js/gpPlayer.js`: open a score with no source bytes, hide source file actions, and leave the score playable per FR-065 (depends on T093)

**Checkpoint**: `node tests/gp-player/offline-manifest.mjs` passes. Manual checks 1 to 10 in
`quickstart.md` for User Story 5 pass. SC-008, SC-009, SC-013, SC-014, and SC-017 are
reachable.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Ship-readiness work that spans the stories.

- [ ] T099 Delete `js/gpFollowView.js` after `tests/gp-player/smoke.mjs` moves off `buildFollowColumns`, and remove `js/gpFollowView.js` from `service-worker.js`
- [X] T100 Extend `tests/gp-player/loop-playback.mjs` to assert gapless loop scheduling across 20 passes through `js/gpMixPlayer.js`
- [X] T101 Extend `tests/gp-player/metronome.mjs` to assert on-screen count-in and loop rest countdown through `js/gpPlayer/metronomeState.js`
- [X] T102 Add exports for every new module to `js/gpPlayer/index.js`
- [X] T103 Run the neighbour suites: `node tests/exercises/run.mjs`, `node tests/workbooks/run.mjs`, `node tests/companions/run.mjs`, `node tests/track-to-sheet/run.mjs`, and `node tests/cloud/run.mjs`
- [X] T104 Run the CLI smoke command in `cli/bin/musi.js` with `reference --root C --type "Major (Ionian)"` and confirm the `Scale Reference` banner prints
- [X] T105 Update `docs/gp-exercises-roadmap.md` to record the timeline layer, the layout layer, and the instrument voice layer
- [ ] T106 Run the human reading test for SC-015 on the 10 fixed passages in `tests/gp-player/fixtures/passages/` and record the teacher pass count
- [ ] T107 Run the human listening test for SC-016 on the same 10 passages in `tests/gp-player/fixtures/passages/` and record the listener pass count
- [ ] T108 Run every step in `quickstart.md`: automated checks, browser harness, manual verification, accessibility checks, offline check, and mobile layout checks
- [X] T109 Bump `CACHE_VERSION` in `service-worker.js` to a new string after the final file list is stable

**Checkpoint**: Every command in the Verification commands block passes. The full
`quickstart.md` run passes. The feature is ready to push.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: No dependency. Start here. T002 to T010 give every later phase a test
  runner, fixtures, and a browser harness.
- **Foundational (Phase 2)**: Depends on Phase 1. T032 needs T008 and the parser edits.
  Phase 2 blocks every user story.
- **User Story 1 (Phase 3)**: Depends on Phase 2. T035 and T036 need `measures[].repeat`,
  `tempoMap`, `beats`, ties, and grace data from Phase 2.
- **User Story 2 (Phase 4)**: Depends on Phase 2. T049 needs `beats`, `rests`, and technique
  fields from Phase 2. T059 can run after T056.
- **User Story 3 (Phase 5)**: Depends on Phase 2. T070 needs the timeline from User Story 1
  for loop range that respects written bar indices inside repeats.
- **User Story 4 (Phase 6)**: Depends on User Story 1. T082 needs the `Timeline` event list
  and `setRate` from Phase 3.
- **User Story 5 (Phase 7)**: Depends on Phase 2. T096 needs `destroy` from User Story 1.
  T097 needs every new module path from earlier phases.
- **Polish (Phase 8)**: Depends on every story that you plan to ship.

### Story dependencies

- **User Story 1 (P1)**: Independent after Phase 2. This is the MVP playback path.
- **User Story 2 (P2)**: Independent test after Phase 2. It needs `beats` and technique data
  from Phase 2, not the audio timeline.
- **User Story 3 (P3)**: Independent test after Phase 2. Loop drag works best after User Story
  1, because loop ranges inside repeats need the timeline.
- **User Story 4 (P4)**: Depends on User Story 1. The voice layer schedules from the
  `Timeline` event list.
- **User Story 5 (P5)**: Independent test after Phase 2. Full teardown needs `destroy` from
  User Story 1.

### File conflicts to respect

| File | Tasks that write it | Rule |
| --- | --- | --- |
| `js/gpPlayerUI.js` | T041, T042, T059, T060, T075, T078, T085, T094, T096 | Run in this order. Never in parallel. |
| `js/gpMixPlayer.js` | T037, T038, T039, T040, T082, T085 | Run in this order. Never in parallel. |
| `css/gpplayer.css` | T061, T062, T079 | Run in this order. Never in parallel. |
| `js/gpPlayer/playerState.js` | T073, T095 | Run in this order. Never in parallel. |
| `service-worker.js` | T097, T099, T109 | Run in this order. Never in parallel. |
| `js/tab/tabModel.js` | T011, T012, T013, T014, T015, T016, T017, T018 | Run in this order. Never in parallel. |
| `js/tab/guitarPro.js` | T019, T020, T021, T022, T023, T024, T029 | Run in this order. Never in parallel. |
| `js/tab/gp5.js` | T025, T026, T027, T028 | Run in this order. Never in parallel. |
| `js/gpPlayer/parchmentView.js` | T056, T057, T058, T071 | Run in this order. Never in parallel. |
| `js/gpPlayer/scoreLayout.js` | T049, T050, T051, T052, T053, T054, T055, T058, T063 | Run in this order. Never in parallel. |
| `tests/gp-player/run-browser.mjs` | T010, T047, T088 | Run in this order. Never in parallel. |
| `tests/gp-player/fixtures/makeFixtures.mjs` | T003, T004, T005, T006, T007 | Run in this order. Never in parallel. |

Tasks on `js/gpPlayerUI.js`, `js/gpMixPlayer.js`, `css/gpplayer.css`,
`js/gpPlayer/playerState.js`, and `service-worker.js` must not carry `[P]` at the same time.

### Parallel opportunities

- T004 runs beside T009 after T003, because those tasks touch different files.
- T005 and T006 run after T004 in `tests/gp-player/fixtures/makeFixtures.mjs`.
- T009 runs beside T003 and T008.
- T043, T044, T045, and T046 run together after T009 and the timeline modules land.
- T061 runs beside T057 and T059 when those tasks touch different files.
- T086 and T087 run together after T009 and the voice layer land.
- T103 and T104 run together in Phase 8.

---

## Parallel Example: User Story 2

```bash
# Launch the layout module and the style work together after T048 lands:
Task: "T049 Create js/gpPlayer/scoreLayout.js with layoutBar and layoutScore"
Task: "T061 Add glyph lane styles to css/gpplayer.css"

# Launch the rhythm and rest tasks in sequence inside scoreLayout.js,
# then launch the parchment rewrite:
Task: "T050 Add rhythm mark layout to js/gpPlayer/scoreLayout.js"
Task: "T051 Add rest glyph layout to js/gpPlayer/scoreLayout.js"
Task: "T056 Rewrite the render body of js/gpPlayer/parchmentView.js"
```

---

## Implementation Strategy

### Recommended order

Follow the phase order above: Setup, Foundational, User Story 1, User Story 2, User Story 3,
User Story 4, User Story 5, Polish. This order matches the six delivery stages in `plan.md`.

### MVP scope

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3: User Story 1.
4. Stop and validate. Playback matches the written score.
5. Ship if you want the smallest useful increment.

### Incremental delivery

1. Setup and Foundational give parsers that keep tempo, repeats, voices, and techniques.
2. User Story 1 gives correct playback and a synced playhead. This is the MVP.
3. User Story 2 gives rhythm marks and technique glyphs on the score.
4. User Story 3 moves practice controls onto the main screen.
5. User Story 4 raises instrument tone within the no-sample limit.
6. User Story 5 adds worker parse, progress, reset, teardown, and offline guard.
7. Polish deletes legacy code, runs neighbour suites, and runs the full `quickstart.md`.

### Parallel team strategy

With three people, after Phase 2:

1. Person A takes User Story 1, then User Story 4, because both write `js/gpMixPlayer.js`.
2. Person B takes User Story 2, which writes `js/gpPlayer/scoreLayout.js` and
   `js/gpPlayer/parchmentView.js`.
3. Person C takes User Story 3 and User Story 5, and coordinates with Person A on
   `js/gpPlayerUI.js`.

---

## Notes

- Requirement coverage: Phase 2 covers FR-057 and FR-058 data paths. US1 covers FR-001 to
  FR-017. US2 covers FR-018 to FR-032. US3 covers FR-033 to FR-046 and FR-066 to FR-069.
  US4 covers FR-047 to FR-053. US5 covers FR-054 to FR-065. Phase 8 covers FR-063 neighbour
  checks and SC-015 to SC-017 human tests.
- Write each test task before its implementation tasks. Confirm that the new test fails first.
- Commit after each task or after a small logical group. Keep every commit runnable.
- Bump `CACHE_VERSION` in `service-worker.js` before any browser check, or do a hard reload.
- Keep `mountGpPlayer` back-compatible per `contracts/mount-gp-player.md`. Add new behaviour
  through optional options only.
- Do not add npm packages to the web app or to `cli/` for this feature.
- The score surface keeps the parchment palette per decision D12. Chrome and panels stay on
  Atomic Purple Game Boy Color tokens.
