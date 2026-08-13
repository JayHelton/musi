---
feature: cursor-pitch-trainer-improvement-05f0
status: planned
created: 2026-08-13
chunk_size: medium
total_tasks: 29
estimated_lines: 1680
---

# Pitch Trainer Improvement Tasks

## Overview

These tasks implement the Pitch Trainer Improvement design. Chunk size is
medium (40–80 lines). Stage 1 must pass matcher tests before later stages
start.

## Task List

### Foundation

#### Task 1: Pitch sample and metric helpers
- **Estimate:** ~70 lines
- **Files:** `js/pitchMetrics.js`
- **Description:** Add sample and attempt result shapes. Add
  clarity-weighted median, median absolute deviation, mean absolute error,
  and time-weighted coverage helpers. Use timestamps only.
- **Depends on:** None
- **Acceptance:** Helpers are pure and exportable. They do not read the DOM.
- **Evidence:** `node tests/pitch/run.mjs` can import the module.

#### Task 2: Rolling scoring window
- **Estimate:** ~80 lines
- **Files:** `js/pitchMetrics.js`
- **Description:** Add one rolling scoring window. Reset on unvoiced gap
  >250 ms, off-target >50 cents for >200 ms, target change, guide tone, and
  skip. Exclude the first 250 ms after voiced onset from sustain scoring.
  Pass only when all required metrics are valid in the same window.
- **Depends on:** Task 1
- **Acceptance:** Fragments do not combine. Pass needs one continuous window.
- **Evidence:** Tests 1–5 fail until Task 5 profiles exist, then pass.

#### Task 3: Accuracy profiles and hold duration
- **Estimate:** ~50 lines
- **Files:** `js/pitchMetrics.js`
- **Description:** Add Learn, Center, and Precision profiles. Add hold
  durations 0.75 s, 1.0 s, 1.5 s, 2.0 s, and 2.5 s. Default Center and
  1.0 s. Do not mix accuracy with hold duration.
- **Depends on:** Task 2
- **Acceptance:** Center pass is ±10¢ center. +9¢ passes. +11¢ fails. +39¢
  fails all profiles.
- **Evidence:** Tests 1–4 pass.

#### Task 4: Vibrato center line and unpitched copy
- **Estimate:** ~70 lines
- **Files:** `js/pitchMetrics.js`
- **Description:** Estimate a vibrato center line. Report extent, rate,
  symmetry, and center-line drift. Require 90% of the contour within ±50¢.
  Add `correctionText()` including `No stable fundamental`.
- **Depends on:** Task 3
- **Acceptance:** ±30¢ vibrato at 0¢ passes. The same vibrato at +25¢ fails.
  Unpitched input does not report sharp or flat.
- **Evidence:** Tests 7, 8, and 14 pass.

#### Task 5: Stage 1 matcher tests
- **Estimate:** ~80 lines
- **Files:** `tests/pitch/run.mjs`, `tests/pitch/metrics.mjs`
- **Description:** Add a Node runner for tests 1–10. Cover 30/60/120 fps
  equivalence and guide-tone lockout.
- **Depends on:** Task 4
- **Acceptance:** `node tests/pitch/run.mjs` runs the Stage 1 cases.
- **Evidence:** Command exit code 0 after Task 7.

### Stage 1: Scoring correctness

#### Task 6: Voiced versus display tracker
- **Estimate:** ~60 lines
- **Files:** `js/pitch.js`
- **Description:** Return `frequencyHz`, `displayFrequencyHz`, `voiced`,
  `clarity`, `rms`, and `noteInfo`. Hold display during a short dropout.
  Set `voiced` to false during the dropout. Keep MPM, gates, median,
  hysteresis, and dropout handling.
- **Depends on:** Task 1
- **Acceptance:** Silence with a held display is not voiced.
- **Evidence:** Test 6 passes.

#### Task 7: Matcher wrap and guide-tone lockout
- **Estimate:** ~70 lines
- **Files:** `js/pitchMatch.js`
- **Description:** Point `createPitchMatcher()` at the rolling window.
  Keep label helpers. Map old `holdMs`/`toleranceCents` callers to Center
  defaults so companions still run. Score only voiced samples. Ignore
  samples while the guide lockout is active.
- **Depends on:** Task 3, Task 6
- **Acceptance:** Guide-tone samples never count. Companions still import
  the matcher.
- **Evidence:** Test 10 passes. Existing companion imports resolve.

#### Task 8: Exact-frequency guide tone
- **Estimate:** ~40 lines
- **Files:** `js/pitchTrainer.js`, `js/pitchRunner.js`
- **Description:** Remove detuned layers. Use sine and triangle at the
  target frequency. Keep release-tail and room-tail lockout.
- **Depends on:** Task 7
- **Acceptance:** No oscillator uses a non-zero detune.
- **Evidence:** Search of `detune` in trainer and runner guide code is
  empty.

#### Task 9: Stage 1 detector tests
- **Estimate:** ~80 lines
- **Files:** `tests/pitch/detector.mjs`, `tests/pitch/run.mjs`
- **Description:** Add tests 14–17: noise/breath, harmonic-rich
  fundamental, missing fundamental, and C2–C6 within ±2 cents.
- **Depends on:** Task 6
- **Acceptance:** Detector tests pass on synthetic buffers.
- **Evidence:** `node tests/pitch/run.mjs` includes detector cases.

**Checkpoint:** Stage 1 matcher and detector tests pass. Do not start
Stage 2 until this checkpoint is green.

### Stage 2: Training methodology

#### Task 10: Range validation
- **Estimate:** ~60 lines
- **Files:** `js/pitchExercises.js`, `tests/pitch/range.mjs`
- **Description:** Validate every generated sequence against the selected
  range. Fit by octave or smaller pattern. Return a clear error when the
  pattern cannot fit. Never emit an out-of-range MIDI note.
- **Depends on:** Task 5
- **Acceptance:** Tests 11 and 12 pass.
- **Evidence:** `node tests/pitch/run.mjs` range cases.

#### Task 11: Custom range presets
- **Estimate:** ~50 lines
- **Files:** `js/pitchTrainer.js`, `index.html`
- **Description:** Keep general presets. Add saved custom presets. Support
  Chest F2–D4, Mix E4–B4, and a user Head range. Do not treat C6 as a
  normal working-range limit.
- **Depends on:** Task 10
- **Acceptance:** Start stays disabled with an explanation when the
  pattern does not fit.
- **Evidence:** UI copy names the range error.

#### Task 12: Center and Land tasks
- **Estimate:** ~80 lines
- **Files:** `js/pitchTrainer.js`, `js/pitchExercises.js`, `index.html`
- **Description:** Add a Task control above Pattern. Center uses all
  chromatic notes in range with adaptive selection and two consecutive
  passes before priority drops. Land reports direction, scoop or
  overshoot, settle time, final center, and sustain stability.
- **Depends on:** Task 11
- **Acceptance:** Center and Land never emit notes outside range.
- **Evidence:** Range tests plus trainer task ids.

#### Task 13: Interval and Pattern tasks
- **Estimate:** ~70 lines
- **Files:** `js/pitchTrainer.js`, `js/pitchExercises.js`, `index.html`
- **Description:** Interval plays an anchor only. Support up and down.
  Pattern keeps the existing library. Melody points to Runner and does
  not duplicate it.
- **Depends on:** Task 12
- **Acceptance:** Interval never plays the target. Pattern library ids
  stay the same.
- **Evidence:** Sequence builder tests for Interval.

#### Task 14: Attempt result panel and correction text
- **Estimate:** ~60 lines
- **Files:** `js/pitchTrainer.js`, `css/trainers.css`, `index.html`
- **Description:** After each attempt show center, stability, settle time,
  and Passed or the specific correction string. Keep Game Boy Color
  tokens.
- **Depends on:** Task 4, Task 12
- **Acceptance:** The panel never uses only `Nice!` or `Miss`.
- **Evidence:** Visual check of the trainer card.

#### Task 15: Meter, zones, and visual smoothing
- **Estimate:** ~70 lines
- **Files:** `js/pitchTrainer.js`, `css/trainers.css`, `index.html`
- **Description:** Change the meter to ±50 cents. Add overflow. Draw
  bullseye ±5¢, pass center ±10¢, close ±20¢. Smooth display 100–150 ms.
  Do not smooth scoring. Show live target, detected note, signed cents,
  direction, hold progress, and confidence.
- **Depends on:** Task 14
- **Acceptance:** Overflow appears beyond ±50 cents.
- **Evidence:** Browser check of the trainer meter.

#### Task 16: Feedback progression
- **Estimate:** ~50 lines
- **Files:** `js/pitchTrainer.js`, `index.html`
- **Description:** Add Live, Reduced, and Result only. Start Live. Reduce
  after one success. Use Result only after two consecutive successes. Let
  the user lock a mode.
- **Depends on:** Task 15
- **Acceptance:** A locked mode does not auto-change.
- **Evidence:** Setting `pitchTrainer.feedbackMode` persists.

### Stage 3: Runner correction

#### Task 17: Timestamp Runner scoring
- **Estimate:** ~80 lines
- **Files:** `js/pitchRunner.js`, `js/pitchMetrics.js`
- **Description:** Assign samples to notes by audio timestamp. Correct for
  analysis-window delay and input latency. Compute per-note center, MAE,
  voiced coverage, and in-tune coverage.
- **Depends on:** Task 7
- **Acceptance:** Scoring does not use frame counts.
- **Evidence:** Test 9 still passes when Runner uses the same window.

#### Task 18: Runner note results
- **Estimate:** ~50 lines
- **Files:** `js/pitchRunner.js`
- **Description:** Apply `errorScore` and `noteAccuracy`. Centered, Close,
  and Miss rules. Combo is consecutive Centered notes only. Overall
  accuracy is mean note accuracy.
- **Depends on:** Task 17
- **Acceptance:** A constant +29-cent tone is not Centered or Perfect.
- **Evidence:** Test 13 passes.

#### Task 19: Runner tests
- **Estimate:** ~60 lines
- **Files:** `tests/pitch/runner.mjs`, `tests/pitch/run.mjs`
- **Description:** Add test 13 and range checks for Runner sequences.
- **Depends on:** Task 10, Task 18
- **Acceptance:** Runner tests pass.
- **Evidence:** `node tests/pitch/run.mjs` Runner cases.

### Stage 4: Audio performance

#### Task 20: Raw mono constraints and settings inspect
- **Estimate:** ~50 lines
- **Files:** `js/audio.js`, `js/pitchTrainer.js`, `js/pitchRunner.js`,
  `js/vocalTrainer.js`
- **Description:** Request echoCancellation, noiseSuppression, and
  autoGainControl false, channelCount 1. Fall back when rejected. Inspect
  `getSettings()`. Keep one active mic tool.
- **Depends on:** Task 8
- **Acceptance:** Denial leaves a recoverable UI. Stop releases the
  stream.
- **Evidence:** Tests 18–20 pass with stubs.

#### Task 21: AudioWorklet capture
- **Estimate:** ~80 lines
- **Files:** `js/pitchCaptureWorklet.js`, `js/audio.js`,
  `service-worker.js`
- **Description:** Capture at a 10–20 ms hop. Send windows with
  timestamps. Do not run MPM on the worklet thread. Precache the worklet.
- **Depends on:** Task 20
- **Acceptance:** Capture continues when the tab is in the background of
  the audio graph.
- **Evidence:** Worklet file loads over HTTP.

#### Task 22: Worker detector and typed-array reuse
- **Estimate:** ~80 lines
- **Files:** `js/pitchDetectWorker.js`, `js/pitch.js`,
  `service-worker.js`
- **Description:** Run MPM in a Worker. Return timestamped samples. Reuse
  typed arrays. Keep UI free.
- **Depends on:** Task 21, Task 6
- **Acceptance:** Average analysis <10 ms on the benchmark machine, or
  document the miss and optimize.
- **Evidence:** Task 23 benchmark output.

#### Task 23: Detector benchmark and adaptive noise floor
- **Estimate:** ~60 lines
- **Files:** `tests/pitch/bench.mjs`, `js/pitch.js`, `js/pitchTrainer.js`
- **Description:** Add a development benchmark. Measure ambient RMS before
  each attempt. Raise the RMS gate above that floor.
- **Depends on:** Task 22
- **Acceptance:** Benchmark prints average and p95. Noise floor updates
  per attempt.
- **Evidence:** `node tests/pitch/bench.mjs` output.

### Stage 5: Progress evidence

#### Task 24: Attempt persistence
- **Estimate:** ~60 lines
- **Files:** `js/pitchProgress.js`, `js/persistence.js`
- **Description:** Store attempt evidence locally with the required
  fields. Keep data local-first. No streak system.
- **Depends on:** Task 14
- **Acceptance:** A completed attempt writes one record.
- **Evidence:** Unit test of the store.

#### Task 25: Trends by note and register
- **Estimate:** ~70 lines
- **Files:** `js/pitchProgress.js`, `js/pitchTrainer.js`, `index.html`,
  `css/trainers.css`
- **Description:** Show average absolute center error, sharp/flat bias,
  stability, settle time, pass rate, and weak notes by note and register.
  Feed weak notes into Center adaptive selection.
- **Depends on:** Task 24, Task 12
- **Acceptance:** Weak notes appear in the Setup or result area.
- **Evidence:** Browser check of the trend panel.

#### Task 26: Mic exclusivity tests
- **Estimate:** ~50 lines
- **Files:** `tests/pitch/mic.mjs`, `tests/pitch/run.mjs`
- **Description:** Add tests 18–20 with stream stubs.
- **Depends on:** Task 20
- **Acceptance:** Stop releases the stream. Only one tool runs. Denial is
  recoverable.
- **Evidence:** `node tests/pitch/run.mjs` mic cases.

### Polish

#### Task 27: Service worker, cache, and manual checklist
- **Estimate:** ~40 lines
- **Files:** `service-worker.js`,
  `specs/cursor-pitch-trainer-improvement-05f0/manual-checklist.md`
- **Description:** Precache new JS. Bump `CACHE_VERSION`. Write the
  manual device checklist. Mark every device untested unless a real test
  ran.
- **Depends on:** Task 22, Task 25
- **Acceptance:** Checklist exists. Cache version changes.
- **Evidence:** File present. `CACHE_VERSION` differs from main.

#### Task 28: Full runner and CLI smoke
- **Estimate:** ~40 lines
- **Files:** `tests/pitch/run.mjs`
- **Description:** Run `node tests/pitch/run.mjs` and
  `node cli/bin/musi.js --help`. Serve the Pitch UI over HTTP and click
  through Tuner, Reference, Trainer, and Runner without a mic if needed.
- **Depends on:** Task 26, Task 27
- **Acceptance:** Automated tests pass. Manual gaps are listed.
- **Evidence:** Command output plus the incomplete manual list.

#### Task 29: Guide lockout window-start
- **Estimate:** ~120 lines
- **Files:** `js/pitchGuideLock.js`, `js/pitchCapture.js`,
  `js/pitchTrainer.js`, `js/pitchRunner.js`, `tests/pitch/lockout.mjs`,
  `service-worker.js`
- **Description:** Score only when the analysis window start is after audible
  end plus 0.6 s room tail. Reset capture and matcher at lockout start and
  at the first clear frame. Reset capture on every locked frame so the
  smoother does not hold guide pitch. Do not ingest noise floor during lockout.
- **Depends on:** Task 7, Task 21
- **Acceptance:** Guide playback never counts as singer input. Lockout tests
  pass.
- **Evidence:** `node tests/pitch/run.mjs` exit code 0.

## Notes

- Do not replace the MPM detector without test evidence from Task 23.
- Do not change unrelated Musi features.
- Companion pitch tools keep working through the matcher wrapper.
- Cloud harness requires a pull request. State that override. Do not
  silently treat it as trunk delivery.
- Constitution `always-confirm` expects a person between chunks. This
  cloud run continues through stages because the user asked for the full
  feature. Pause only if a Stage 1 test fails.

## Progress

- [x] Task 1: Pitch sample and metric helpers
- [x] Task 2: Rolling scoring window
- [x] Task 3: Accuracy profiles and hold duration
- [x] Task 4: Vibrato center line and unpitched copy
- [x] Task 5: Stage 1 matcher tests
- [x] Task 6: Voiced versus display tracker
- [x] Task 7: Matcher wrap and guide-tone lockout
- [x] Task 8: Exact-frequency guide tone
- [x] Task 9: Stage 1 detector tests
- [x] Task 10: Range validation
- [x] Task 11: Custom range presets
- [x] Task 12: Center and Land tasks
- [x] Task 13: Interval and Pattern tasks
- [x] Task 14: Attempt result panel and correction text
- [x] Task 15: Meter, zones, and visual smoothing
- [x] Task 16: Feedback progression
- [x] Task 17: Timestamp Runner scoring
- [x] Task 18: Runner note results
- [x] Task 19: Runner tests
- [x] Task 20: Raw mono constraints and settings inspect
- [x] Task 21: AudioWorklet capture
- [x] Task 22: Worker detector and typed-array reuse
- [x] Task 23: Detector benchmark and adaptive noise floor
- [x] Task 24: Attempt persistence
- [x] Task 25: Trends by note and register
- [x] Task 26: Mic exclusivity tests
- [x] Task 27: Service worker, cache, and manual checklist
- [x] Task 28: Full runner and CLI smoke
- [x] Task 29: Guide lockout window-start

Manual device checks in `manual-checklist.md` are **not complete**. All items stay unchecked until a real device test runs.
