# Tasks: Practice Lab

**Input**: `specs/009-practice-lab/spec.md`, `specs/009-practice-lab/plan.md`,
`specs/009-practice-lab/data-model.md`

**Status**: Complete. Every task below is done and verified.

## Format

`[ID] [P?] [Story] Description`

- `[P]` marks a task that can run at the same time as the other `[P]` tasks of its
  phase, because it touches a different file.
- `[US1]` names the user story the task serves.

## Phase 1: Setup

- [x] T001 Create the folder `js/practiceLab/` with `ports.js`, and write the JSDoc
  typedef of each port: `PracticeStore`, `ClickPort`, `AudioSessionPort`, `VideoPort`,
  `ClockPort`, `IdPort`, `NotifyPort`
- [x] T002 Create `js/practiceLab/container.js` with `createPracticeLab(ports)` and a
  port check that fails loudly on a missing method
- [x] T003 [P] Create `js/practiceLab/adapters/realClock.js` with the clock port and
  the id port
- [x] T004 [P] Create `css/practice-lab.css` with the panel, chip, tab, and bar tokens
  from `css/base.css` and `css/theme-gbc.css`
- [x] T005 [P] Create `tests/practice-lab/run.mjs` with the runner shape used by
  `tests/product-model/run.mjs`

## Phase 2: Foundational

These block every user story.

- [x] T006 Write `js/practiceLab/model/catalog.js`: the seed instruments and
  techniques, `addEntry`, `removeEntry`, `normaliseLabel`, and the `hidden` merge
- [x] T007 Write `js/practiceLab/model/session.js`: the session factory, the log entry
  factory, the entry kinds, and `rollUpTotals(entries)`
- [x] T008 Write `js/practiceLab/adapters/memoryStore.js` — the full store port in
  memory, for the tests
- [x] T009 Write `js/practiceLab/adapters/idbStore.js` — the four object stores, the
  indexes, the defensive open, and the persistent-storage request
- [x] T010 [P] Write `js/practiceLab/ui/dom.js` — `el`, `chip`, `tabBar`, `slider`,
  `stepper`, and `pressable`, local to this feature
- [x] T011 [P] Add the catalog, session, and store tests to `tests/practice-lab/run.mjs`
- [x] T012 Add the tool entry to `js/tools.js`: id `practicelab`, label
  "Practice Lab", area `train`, modes `session` and `history`, `context: []`,
  `holdRecord: false`
- [x] T013 Add `<section id="sec-practicelab" class="section">` to `index.html`, and
  the `css/practice-lab.css` link
- [x] T014 Update the Train tool list, the mode list, and the context list in
  `tests/product-model/run.mjs`
- [x] T015 Write `js/practiceLab/index.js` with `initPracticeLab` and
  `stopPracticeLab`, and `defaultPorts()`
- [x] T016 Add the import pair and the `TOOL_INITS` / `TOOL_STOPPERS` rows in
  `js/main.js`

**Checkpoint**: the route opens an empty, themed screen and the tests pass.

## Phase 3: User Story 1 — Start a session and put a clock on it (P1)

- [x] T017 [US1] Write `js/practiceLab/engine/countdown.js` with `start(minutes)`,
  `stop()`, and the `tick`, `complete`, and `stopped` events, driven by the clock port
- [x] T018 [P] [US1] Add the countdown tests with a fake clock to
  `tests/practice-lab/run.mjs`
- [x] T019 [US1] Write `js/practiceLab/ui/setupView.js`: the instrument chips, the
  technique chips, the custom-entry fields, the target field, and Start Session
- [x] T020 [US1] Write `js/practiceLab/ui/sessionView.js`: the target line, the panel
  layout, the End Session control, and the panel lifecycle
- [x] T021 [US1] Write `js/practiceLab/ui/timerPanel.js`: the 1–10 minute presets, the
  readout, the start and stop controls, and the sound at zero
- [x] T022 [US1] Write `js/practiceLab/ui/logPanel.js`: the live log lines, the note
  field, and the empty state
- [x] T023 [US1] Continue an open session on mount, and offer to end it instead

**Checkpoint**: a session starts, a timer runs to zero, and the log survives a reload.

## Phase 4: User Story 2 — Keep time with the built-in metronome (P1)

- [x] T024 [US2] Write `js/practiceLab/engine/timeline.js` with `metronomePlan` and the
  segment and plan shapes from the data model
- [x] T025 [US2] Write `js/practiceLab/engine/expand.js` — segments to click events
- [x] T026 [P] [US2] Add the expansion tests: the click count, the click spacing, and
  the accent positions
- [x] T027 [US2] Write `js/practiceLab/adapters/musiClick.js` over `ensureAudio`,
  `audioCtx` in `js/audio.js`, and `scheduleClickSound` in `js/audio/clickSynth.js`
- [x] T028 [US2] Write `js/practiceLab/adapters/musiAudioSession.js` over `claimAudio`
  and `releaseAudio` in `js/audio/audioOwner.js`, kind `metronome`
- [x] T029 [US2] Write `js/practiceLab/engine/scheduler.js`: the 100 ms lookahead, the
  25 ms poll, the plan repeat, the live tempo change, and the beat report
- [x] T030 [P] [US2] Add the scheduler tests with a fake clock and a fake click port
- [x] T031 [US2] Write `js/practiceLab/ui/metronomeBar.js`: the tempo, the minus and
  plus controls, the start control, and the beat light
- [x] T032 [US2] Log `metronome-start` and `metronome-stop` with the tempo range

**Checkpoint**: the bottom bar plays a click, holds time, and writes the log.

## Phase 5: User Story 3 — Alternate two subdivisions (P2)

- [x] T033 [US3] Add `ratioPlan` to `js/practiceLab/engine/timeline.js`, with the
  `[initial count-in, A, repeat count-in, B, repeat count-in]` shape and `loopFrom: 1`
- [x] T034 [P] [US3] Add the ratio tests: the click count of each segment, the segment
  order across two cycles, and the count-in off case
- [x] T035 [US3] Write `js/practiceLab/ui/ratiosPanel.js`: the tempo, the beat count,
  the count-in switch, the two count-in lengths, the two subdivision selects, and
  Start Training
- [x] T036 [US3] Show the running segment and the click position in the panel
- [x] T037 [US3] Log `ratio-start` and `ratio-stop` with the cycle count

## Phase 6: User Story 4 — Climb the tempo (P2)

- [x] T038 [US4] Add `speedPlan` to `js/practiceLab/engine/timeline.js`, with the
  finite ladder, the clamp to the end tempo, and the refusal below the start tempo
- [x] T039 [P] [US4] Add the speed tests: the step count, the bar count of each step,
  the top tempo, and the refusal
- [x] T040 [US4] Write `js/practiceLab/ui/speedPanel.js`: the time signature buttons,
  the six numeric controls, the count-in switch, and Start Training
- [x] T041 [US4] Show the current tempo and the step position while the ladder runs
- [x] T042 [US4] Log `speed-start` and `speed-complete`, with `finished: false` on an
  early stop, and update `totals.topBpm`
- [x] T043 [US4] Write `js/practiceLab/ui/trainerTabs.js` and hold one active trainer:
  starting one stops the other two

## Phase 7: User Story 5 — Watch and record the hands (P2)

- [x] T044 [US5] Write `js/practiceLab/adapters/mediaVideo.js`: `getUserMedia` with
  video and audio, `MediaRecorder`, the capability report, and the error text used in
  `js/sync/camera.js`
- [x] T045 [US5] Write `js/practiceLab/ui/cameraPanel.js`: the mirrored video element,
  the permission state, the record control, the elapsed readout, and the caps
- [x] T046 [US5] Save the clip through the store port, write the `clip-saved` entry,
  and update `totals.clips`
- [x] T047 [US5] Add clip playback and clip delete to the log panel
- [x] T048 [US5] Stop the camera and the recorder when the tool closes or the session
  ends

## Phase 8: User Story 6 — Look at past sessions (P3)

- [x] T049 [US6] Write `js/practiceLab/ui/historyView.js`: the session list with the
  date, the instrument, the technique, the target, the practice time, and the clip
  count
- [x] T050 [US6] Add the session detail view with the full log and clip playback
- [x] T051 [US6] Add the delete control for one session, with a confirmation, that also
  removes its entries and its clips
- [x] T052 [US6] Wire the `session` and `history` mode tabs to the tool page

## Phase 9: Polish and cross-cutting

- [x] T053 Add the notice states: no IndexedDB, no camera, no `MediaRecorder`, and
  denied permission
- [x] T054 Add the keyboard path and the ARIA labels for the chips, the tabs, the
  presets, and the transport controls
- [x] T055 Add the boundary test to `tests/practice-lab/run.mjs`: no file under
  `js/practiceLab/` imports a user-interface module of another feature, and the
  adapters are the only files that import from outside the folder
- [x] T056 Add the new files to the pre-cache list in `service-worker.js` and bump the
  cache name
- [x] T057 Check the screen at 360 px, 768 px, and 1280 px, and in landscape
- [x] T058 Run `node tests/practice-lab/run.mjs`, `node tests/product-model/run.mjs`,
  `node tests/routes/run.mjs`, and `node tests/shell/run.mjs`
- [x] T059 Run the browser pass in the plan, item 4
- [x] T060 Run `node tests/appcheck/run.mjs --hash '#practicelab'`

## Dependencies

- Phase 1 blocks Phase 2. Phase 2 blocks every user story.
- US1 is the minimum product. It needs no trainer and no camera.
- US2 blocks US3 and US4, because both build on the plan shape and the scheduler.
- US5 and US6 depend only on Phase 2 and US1.
- T043 depends on T031, T035, and T040.

## Parallel opportunities

- T003, T004, and T005 run together.
- T010 and T011 run together.
- Every test task marked `[P]` runs beside the code task of its phase.
- After US2 lands, US3, US4, US5, and US6 can run in four separate work streams.

## Verification record

- `node tests/practice-lab/run.mjs` — 56 passed, 0 failed. It covers the ports,
  the catalog, the log model, the plan builders, the expansion, the scheduler,
  the countdown, the store, the container, and the folder boundary.
- `node tests/product-model/run.mjs` — 25 passed, 0 failed.
- `node tests/routes/run.mjs` — 19 passed. `node tests/shell/run.mjs` — 41 passed.
- Every other runner under `tests/` still passes.
- `node tests/appcheck/run.mjs --hash '#practicelab'` — PASS, no console error.
- A headless browser pass drove the whole feature: the setup screen, the
  session start, a timer to a stop, the bottom click with a live tempo change,
  the ratios trainer, a short speed ladder to its top tempo, the refusal below
  the start tempo, a camera clip that saved and played back, a reload that
  continued the open session, and the history list and detail.
- The screen was checked at 360 px, 768 px, and 1280 px, and in landscape. No
  screen scrolls sideways.

## Implementation strategy

Ship US1 first, on its own. A session with a timer and a log is already useful. Add
US2 next, because it makes the session a practice session. Then add the two trainers,
the camera, and the history in any order.
