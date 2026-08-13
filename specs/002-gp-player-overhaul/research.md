# Phase 0 Research: Guitar Pro Player Overhaul

**Feature**: `002-gp-player-overhaul` | **Date**: 2026-08-13 | **Plan**: [plan.md](./plan.md)

## Summary

This file records 25 technical decisions for the Guitar Pro player overhaul. The team keeps
the in-house parse and playback engine. The team adds a play-order layer and a tempo
timeline between the parsed score and the audio scheduler. The team extends `TabModel` with
optional fields instead of a second score type. The score view keeps its DOM staff and adds
a pure layout pass plus one inline SVG overlay per bar. Audio moves to per-family wavetable
voices with no sample set. Parse work moves into a module worker with a main-thread fallback.
Every decision below states the choice, the reason, the rejected options, and the
consequences for implementation.

## Decision index

| ID | Topic | Decision |
| --- | --- | --- |
| D1 | Engine choice | Keep the in-house player engine. Reject alphaTab and reject any downloaded sound font. |
| D2 | Model strategy | Extend `TabModel` in `js/tab/tabModel.js` with optional fields. Do not add a second score type. |
| D3 | Beat layer | Add `model.beats[]` as the rhythmic layer and `model.rests[]` as the rest list. |
| D4 | Written order against sounding order | Add `js/tab/playOrder.js` to expand repeats into a list of bar passes. |
| D5 | Nested repeats | Flatten a nested repeat into a single pass and return a warning. |
| D6 | Tempo map and speed | Build the tempo map over bar passes in `js/tab/scoreTimeline.js`. Apply practice speed as one rate factor. |
| D7 | Scheduler and playhead | Keep the `AudioContext.currentTime` lookahead with a `setTimeout` pump. Drive the playhead with `requestAnimationFrame`. |
| D8 | Gapless loop | Schedule across the loop boundary in the same lookahead window. Fade voices to zero across about 8 milliseconds. |
| D9 | Speed change without a reload | Replace the `setBpm` reload path with `setRate(factor)`. Keep `setBpm` as a thin wrapper. |
| D10 | Render technology | Keep the DOM staff in `js/gpPlayer/parchmentView.js`. Add one inline SVG overlay per bar for curved marks. |
| D11 | Pure layout function | Put every layout rule in `js/gpPlayer/scoreLayout.js` and return plain data. |
| D12 | Score surface palette | Keep the parchment palette on the score surface. Keep Atomic Purple GBC tokens on controls and panels. |
| D13 | Instrument voices | Build one wavetable voice per instrument family in `js/gpPlayer/instrumentVoices.js`. Ship no samples. |
| D14 | Technique pitch automation | Drive `frequency` automation from bend points, slide target, and vibrato depth. |
| D15 | Headroom | Give each track a gain node, hold a voice budget, keep `DynamicsCompressorNode` in `js/audio.js`. |
| D16 | Parse thread | Parse inside a module worker that imports `js/tab/guitarPro.js`. Keep a chunked main-thread fallback. |
| D17 | Loop by drag | Put loop drag on the bar strip lane. Keep a long-press drag on the staff. Remove the `Loop Selection` mode toggle. |
| D18 | Panel rules | Add `js/gpPlayer/panelManager.js`. One panel opens at a time. `close()` detaches every listener and observer. |
| D19 | Audio verification | Add `tests/gp-player/run-browser.mjs` with `OfflineAudioContext` harness pages in headless Chrome. |
| D20 | Mount compatibility | Keep `mountGpPlayer` options and the returned handle back-compatible. Add new behaviour through optional options. |
| D21 | Selected track only | Remove the `state.gp.drumTracks?.[0]?.model` fallback from `parchmentModels()` in `js/gpPlayerUI.js`. |
| D22 | Standard notation staff | Ship an optional standard notation staff above the tab staff, derived from tab pitches, with an octave-down marker for guitar. |
| D23 | Accessibility | Add a `role="status"` bar announcement, full keyboard transport, one shortcut table, and a `prefers-reduced-motion` rule. |
| D24 | Reset on load | Add `resetForNewScore()` to `js/gpPlayer/playerState.js`. A new score clears loop, speed, transpose, tuning, and selected track. |
| D25 | Offline manifest guard | Add `tests/gp-player/offline-manifest.mjs` to assert every GP player file sits in `service-worker.js` precache. |

### D1 — Engine choice

**Decision**: Keep the in-house player engine in `js/gpMixPlayer.js` and `js/tab/tabPlayer.js`.
Reject alphaTab. Reject any downloaded SoundFont2 file. Reject a WebAssembly synth. Reject a
hosted render service.

**Rationale**: Constitution principle I forbids a build step and requires plain ES modules.
FR-053 requires audio without a network download. The spec Audio approach assumption states
that the player ships no sample set. `docs/gp-exercises-roadmap.md` already records "Option A:
extend own engine" and rejects alphaTab for size, SoundFont assets, and workers. The current
engine in `js/gpMixPlayer.js` already schedules from `buildTimedNotes` in `js/tab/tabPlayer.js`
and drum hits from `js/drums/drumEngine.js`. SC-016 sets the pass mark for instrument tone
within this limit.

**Alternatives considered**:

- *alphaTab plus a SoundFont2 file.* Rejected. It adds a large dependency, a sample download,
  and workers. It breaks the static offline rule and the zero-build constraint.
- *A WebAssembly synth.* Rejected. It needs a binary asset and a build or fetch path. It does
  not fit the plain ES module delivery model.
- *A hosted render service.* Rejected. Constitution principle I forbids a backend for core
  features. FR-053 forbids a network call for audio.

**Consequences**: Implementation extends `js/gpMixPlayer.js` and adds `js/gpPlayer/instrumentVoices.js`
instead of importing a vendor player. The team must raise tone quality with synthesis only.
The team must not add npm packages to the web app for playback.

### D2 — Model strategy

**Decision**: Extend `TabModel` in `js/tab/tabModel.js` with optional fields. Do not add a
second normalised `ScoreDoc` type.

**Rationale**: Many modules read the current `TabModel` shape. `js/exercises.js`,
`js/workbooks.js`, `js/exercisesBulk.js`, `js/gpExerciseScore.js`, `js/drums/gpDrumImport.js`,
and `js/trackToSheet/toTabModel.js` all consume `tracks`, `drumTracks`, and nested `model`
objects. `cli/src/analyzers/tab.js` shares the same parse path through `js/tab/guitarPro.js`.
A second score type would force every consumer to migrate. FR-063 requires that Exercises,
Workbooks, and the split-into-exercises studio keep working.

**Alternatives considered**:

- *A new normalised `ScoreDoc` type with adapters.* Rejected. It doubles the surface area.
  Every consumer needs a migration layer. Slice and clone helpers in `js/tab/tabModel.js`
  would need duplicate paths.

**Consequences**: New fields such as tempo automations, repeat marks, voices, ties, and bend
points arrive as optional properties on the existing model. `sliceModelByBeats` and
`serializeExerciseScore` in `js/gpExerciseScore.js` must copy the new fields. The serialized
format moves to version 3 with a version 2 reader.

### D3 — Beat layer

**Decision**: Add `model.beats[]` as the rhythmic layer. Add `model.rests[]` as the rest list.
Do not push rest objects into `model.events[]`.

**Rationale**: `buildTimedNotes` in `js/tab/tabPlayer.js` iterates `model.events` and
filters with `e.midi != null && !e.dead`. It assumes every entry in `events` is a sounding
note. `js/gpMixPlayer.js` calls `buildTimedNotes` for every guitar model. `js/gpExerciseScore.js`
counts track notes from `model.events`. A rest inside `events` would break those paths and
could sound spurious tones. FR-005 requires rests to stay silent. FR-018 and FR-019 require
rhythm marks and rest marks on the score.

**Alternatives considered**:

- *Store rests as `events` entries with a `rest` flag.* Rejected. Every consumer that maps
  `events` to audio would need a new guard. The risk of a silent rest sounding is too high.

**Consequences**: Parsers in `js/tab/guitarPro.js` and `js/tab/gp5.js` must emit `beats[]`
and `rests[]`. `scoreLayout.js` reads those arrays for rhythm and rest glyphs. The timeline
builder in `js/tab/scoreTimeline.js` must advance time through rests without scheduling audio.

### D4 — Written order against sounding order

**Decision**: Add `js/tab/playOrder.js`. It expands repeat marks and alternate endings into a
list of bar passes. Written bar numbers stay stable. Sounding order follows the pass list.

**Rationale**: FR-002 requires repeats and alternate endings in written order. SC-002 requires
the played bar order to match the written order for scores without nested repeats. The spec
edge case states that a loop range inside a repeated section must loop the selected bars and
must not jump to the repeat target. `js/gpMixPlayer.js` today walks `model.measures` once
and ignores repeat marks. That fault is current problem 2 in `spec.md`.

**Alternatives considered**:

- *Expand bars into a longer measure array at parse time.* Rejected. It breaks bar numbers,
  section notes, exercise slices in `js/gpExerciseScore.js`, and loop ranges. Those features
  all address written bar indices.

**Consequences**: `js/tab/scoreTimeline.js` walks `passes` from `playOrder.js`, not raw
`measures[]` order. `js/gpPlayer/parchmentView.js` still draws written bar numbers. Loop
ranges in `js/gpPlayer/rangeUtils.js` stay in written bar space. Tests in
`tests/gp-player/play-order.mjs` must cover repeat and ending order.

### D5 — Nested repeats

**Decision**: Flatten a nested repeat into a single pass. Return a warning string in the
`playOrder.js` result.

**Rationale**: FR-003 states this behaviour explicitly. The spec Assumptions section puts full
nested repeat support out of scope. A nested repeat is rare in practice scores. A warning keeps
the learner informed without blocking playback.

**Alternatives considered**:

- *Full nested repeat expansion.* Rejected. It is out of scope. It adds unbounded pass
  multiplication and complex ending logic.
- *Reject the score on nested repeats.* Rejected. FR-003 requires playback with a warning,
  not a hard error.

**Consequences**: `playOrder.js` returns `{ passes, barOrder, flattened, warnings }`. The UI must surface
`warnings` through the existing status pattern in `js/gpPlayer.js`. Tests must assert the
flatten behaviour and the warning text.

### D6 — Tempo map and speed

**Decision**: Build the tempo map over the bar passes in `js/tab/scoreTimeline.js`. Apply each
tempo automation on every pass of its bar. Apply the practice speed as one rate factor over the
whole map.

**Rationale**: FR-001 requires every tempo change in the score. FR-016 requires a speed change
to scale every tempo change by the same factor. SC-001 requires total playback time within 1
percent of the source score. The spec edge case requires a tempo change inside a repeated
section to apply on every pass. `js/gpMixPlayer.js` today holds one scalar `state.bpm` and
calls `quartersToSeconds` with that value. That fault is current problem 1 in `spec.md`.

**Alternatives considered**:

- *Keep scalar BPM and ignore tempo automations.* Rejected. It fails FR-001 and SC-001.
- *Apply speed by changing each tempo entry at load time only.* Rejected. FR-015 requires a
  speed change during playback without a restart. The rate factor must apply at runtime through
  `setRate` per D9.

**Consequences**: `scoreTimeline.js` exports absolute seconds per pass and per sounding event.
`js/gpMixPlayer.js` schedules from that event list. The transport bar still shows percentage
and BPM per FR-037. `tests/gp-player/timeline.mjs` must prove total time and bar order.

### D7 — Scheduler and playhead

**Decision**: Keep the `AudioContext.currentTime` lookahead window with a `setTimeout` pump
for audio scheduling. Drive the playhead with `requestAnimationFrame`. Each frame reads the
audio clock and maps it through the timeline.

**Rationale**: FR-009 requires the playhead within 50 milliseconds of the sounding note.
SC-003 and SC-011 set measurable drift limits. `js/gpMixPlayer.js` uses `LOOKAHEAD_MS = 25`
and `setTimeout(scheduler, LOOKAHEAD_MS)`. The scheduler calls `emitTick()` from the timeout,
and position comes from scalar BPM maths in `songTimeNow()`. That path drifts from real audio
time. `js/gpPlayerUI.js` uses `requestAnimationFrame` only for view mode refresh today, not
for playhead sync.

**Alternatives considered**:

- *An `AudioWorklet` clock.* Rejected. It adds a separate module file. It gives no benefit
  for UI position when `audioCtx.currentTime` already exists.
- *A `setInterval` UI tick.* Rejected. The browser throttles background tabs. It fights the
  frame budget on phones.

**Consequences**: `js/gpMixPlayer.js` keeps the lookahead scheduler for note onset. `js/gpPlayerUI.js`
adds a frame loop that maps `audioCtx.currentTime` through `scoreTimeline.js` position lookup.
The frame loop updates the parchment highlight and the bar readout. Visibility and
`AudioContext` state listeners re-anchor position per FR-011.

### D8 — Gapless loop

**Decision**: Schedule events across the loop boundary inside the same lookahead window. Fade
each voice to zero across about 8 milliseconds instead of calling `osc.stop()` at once.

**Rationale**: FR-013 requires no gap longer than 10 milliseconds and no click at the boundary.
SC-010 requires 20 loop passes with no gap longer than 10 milliseconds. `js/gpMixPlayer.js`
calls `clearVoices()` at the loop boundary. `clearVoices()` calls `v.osc.stop()` on every
voice. The scheduler then resets `originSongSec` and `originAudioTime`. That hard stop and
origin reset create the audible click and the timing gap. That fault is current problem 9 in
`spec.md`.

**Alternatives considered**:

- *Stop and restart playback at the loop start.* Rejected. It adds a gap and breaks FR-015
  position rules.
- *Crossfade two player instances.* Rejected. It doubles voice count and complicates headroom
  per D15.

**Consequences**: The scheduler unrolls the next loop pass into the current horizon instead of
waiting for the boundary tick. Voice teardown uses a short gain ramp before node stop. Loop
rest countdown per FR-014 still holds the playhead at the loop start. Browser harness in D19
must measure pass boundary gap.

### D9 — Speed change without a reload

**Decision**: Replace the `setBpm` reload path with `setRate(factor)`. Keep the musical
position. Rescale the timeline. Reschedule future events only. Keep `setBpm` as a thin wrapper
for existing callers.

**Rationale**: FR-015 requires a speed change to keep the current bar and beat position. The
spec edge case forbids a restart on speed change. `setBpm` in `js/gpMixPlayer.js` calls
`load()` with new models and BPM, then recomputes position from `(at / 60) * state.bpm`. That
reload rebuilds all timed notes and resets scheduler state. `js/gpPlayerUI.js` uses
`withPreservedPosition` around several UI actions for the same reason.

**Alternatives considered**:

- *Keep the reload path and seek after load.* Rejected. It causes audible glitches and breaks
  SC-011 gap limits.
- *Change only the metronome BPM.* Rejected. FR-016 requires every tempo automation in the
  score to scale.

**Consequences**: `js/gpMixPlayer.js` exports `setRate(factor)`. `setBpm(bpm)` computes
`factor = bpm / scoreBaseTempo` and delegates. The timeline module applies the rate factor
without rebuilding parse output. Transport UI in `js/gpPlayer/practiceRail.js` calls the new
path. SC-007 still allows two actions to reach 70 percent speed.

### D10 — Render technology

**Decision**: Keep the DOM staff in `js/gpPlayer/parchmentView.js`. Add one inline SVG overlay
for each bar for curved marks. Reject a full canvas rewrite. Reject a full SVG rewrite.

**Rationale**: `parchmentView.js` builds horizontal systems from DOM elements. It uses
`CHAR_WIDTH`, `measureRhythmicInfo`, and CSS classes from `css/gpplayer.css`. DOM text keeps
contrast for fret numbers. DOM keeps pointer handling for loop selection and scroll. Curved
marks need paths: bend arrow, slur, slide, tie, and beam. Those fit one small SVG per bar
without replacing the staff. A canvas rewrite loses selectable text and breaks existing CSS.
A full SVG rewrite discards the shipped stylesheet for no gain on text rendering.

**Alternatives considered**:

- *Full canvas score surface.* Rejected. It loses text contrast control and accessible text
  without extra hit-test code.
- *Full SVG score surface.* Rejected. It reimplements layout that `parchmentView.js` already
  ships. It forces a new style system.

**Consequences**: `parchmentView.js` renders glyph boxes from `scoreLayout.js` as DOM nodes.
Each bar hosts one `<svg>` child for overlay paths. `css/gpplayer.css` gains rhythm lane and
glyph lane rules. FR-030 reflow and zoom rules stay. FR-027 playhead highlight stays on the
DOM beat columns.

### D11 — Pure layout function

**Decision**: Put every layout rule in `js/gpPlayer/scoreLayout.js`. Return plain data. Do not
embed DOM calls in the layout module.

**Rationale**: SC-004 requires at least 95 percent technique coverage counted from the file.
FR-030 requires a 12 CSS pixel floor for fret numbers at 360 CSS pixels wide. A pure function
lets `tests/gp-player/score-layout.mjs` count glyphs and read computed font size in Node
through fixture data. `parchmentView.js` today mixes measure packing, event filtering, and DOM
creation in one file. That coupling blocks automated layout proof.

**Alternatives considered**:

- *Test layout only through a browser screenshot diff.* Rejected. The repo has no screenshot
  tooling. Node tests match constitution principle IV.
- *Keep layout inside `parchmentView.js` and export counts from render side effects.* Rejected.
  Side effects are hard to test and easy to break silently.

**Consequences**: `layoutBar(bar, options)` returns width units, beat columns, voices, glyphs,
overlays, and warnings. `parchmentView.js` becomes a thin renderer. `tests/gp-player/score-layout.mjs`
asserts technique counts and the 12 pixel floor without a browser.

### D12 — Score surface palette

**Decision**: Keep the parchment palette on the score surface as a recorded theme exception.
Keep Atomic Purple Game Boy Color tokens on every control and every panel.

**Rationale**: FR-032 requires a 7 to 1 contrast ratio for note text against its background.
It also requires the GBC theme on controls and panels. `css/gpplayer.css` line 2 records
"Chrome: Atomic Purple GBC tokens. Score surface: parchment exception." Rhythm marks and
technique glyphs add many thin strokes. Thin light strokes on deep navy `--bg` lose contrast
at 12 CSS pixels. The parchment surface already ships and already meets reading contrast for
fret numbers.

**Alternatives considered**:

- *Move the score surface to `--bg` and `--card` tokens only.* Rejected. FR-030 legibility at
  360 CSS pixels conflicts with thin rhythm strokes on navy.
- *Drop the GBC theme on transport chrome to match Songsterr.* Rejected. The spec Assumptions
  state that Songsterr is the behaviour reference, not the visual style reference.

**Consequences**: New chrome in `js/gpPlayer/trackTabs.js`, `practiceRail.js`, and
`transportDock.js` must use `--card`, `--border`, `--accent`, `--radius-screen`, and
`--tap-min`. The score body keeps parchment classes. The team must measure the contrast ratio
in the browser before ship. Constitution principle III passes with this recorded exception.

### D13 — Instrument voices

**Decision**: Build one wavetable voice for each instrument family in
`js/gpPlayer/instrumentVoices.js`. Use `PeriodicWave` harmonic tables, a pitch-tracking lowpass
filter, and per-family envelopes. Add a `WaveShaperNode` for distorted guitar. Ship no samples.

**Rationale**: FR-047 requires a tone that follows the instrument in the score. FR-053 forbids
a network download. SC-016 requires a listener to name bass and guitar in 9 of 10 passages.
`scheduleGuitarTone` in `js/gpMixPlayer.js` uses one triangle or square oscillator for every
track. That fault is current problem 7 in `spec.md`. Families map from MIDI program on each
track.

**Alternatives considered**:

- *Karplus-Strong with a delay line.* Considered for plucked attack. The wavetable path is the
  baseline because it needs fewer parameters to tune across six families. Karplus-Strong can
  follow later for acoustic guitar if SC-016 needs more attack character.
- *One shared triangle oscillator for all tracks.* Rejected. It is the current behaviour. It
  fails SC-016.

**Consequences**: `js/gpMixPlayer.js` calls `instrumentVoices.js` instead of `scheduleGuitarTone`.
Drums keep `scheduleHit` from `js/drums/drumEngine.js`. D14 adds pitch automation on top of
these voices. Browser harness must measure spectral difference between bass and guitar per D19.

### D14 — Technique pitch automation

**Decision**: Drive `frequency` automation on the oscillator from bend points, the slide
target, and vibrato depth.

**Rationale**: FR-049 requires pitch change for bends, slides, and vibrato. Parsers must keep
bend points from GPIF and GP5. `scheduleGuitarTone` today sets `osc.frequency.value` once at
note onset. It never reads bend data from the model.

**Alternatives considered**:

- *Ignore bends and slides in audio.* Rejected. It fails FR-049 and user story 4 acceptance
  scenario 3.
- *Retrigger a new note per bend segment.* Rejected. It creates clicks and breaks tied notes
  per FR-004.

**Consequences**: `instrumentVoices.js` accepts technique metadata on each scheduled note. The
timeline event list must carry bend point times and target pitches. Layout must still draw
bend amount per FR-022. Tests can assert automation curve keys in the browser harness.

### D15 — Headroom

**Decision**: Give each track a gain node. Hold a voice budget. Keep the existing
`DynamicsCompressorNode` in `js/audio.js`. Verify peak level with an `OfflineAudioContext`
render.

**Rationale**: FR-051 requires output below full scale at all times. Acceptance scenario 5 of
user story 4 requires no clipping on dense chords. `js/audio.js` already creates
`compressorNode` with threshold, knee, ratio, attack, and release. `getAnalyserDestination()`
routes through the compressor to `masterGain`. Six-note chords at speed are called out in the
spec.

**Alternatives considered**:

- *Remove the compressor and rely on gain staging only.* Rejected. A single loud chord can
  still clip before per-note gain logic runs.
- *Unlimited simultaneous oscillators.* Rejected. Dense scores can exceed the voice budget
  and still clip the bus.

**Consequences**: `instrumentVoices.js` enforces a max active voice count per track. Each track
feeds its own `GainNode` before the shared bus. `tests/gp-player/run-browser.mjs` renders a
dense chord fixture and asserts peak below full scale.

### D16 — Parse thread

**Decision**: Parse inside a module worker with `new Worker(url, { type: 'module' })`. The
worker imports the same `js/tab/guitarPro.js`. Keep a chunked main-thread fallback in
`js/tab/gpParseClient.js`.

**Rationale**: FR-054 requires progress while the app reads a file. FR-055 requires input
response within 100 milliseconds during read. SC-008 and SC-009 set parse time targets for a
200 bar score. `parseGuitarPro` in `js/tab/guitarPro.js` is a long synchronous byte walk after
inflate. That fault is current problem 10 in `spec.md`. `guitarPro.js` uses `DecompressionStream`
and has no DOM calls. Parse output is plain objects suitable for `postMessage` structured clone.
The service worker must precache the worker entry file.

**Alternatives considered**:

- *Main-thread parse only with `requestIdleCallback`.* Rejected. A 500 bar parse can exceed
  the 100 millisecond input budget on a slow phone.
- *A classic non-module worker with importScripts.* Rejected. ES module imports match the repo
  pattern and share code with the CLI without a bundle step.

**Consequences**: Add `js/tab/gpParseWorker.js` and `js/tab/gpParseClient.js`. `js/gpPlayer.js`
shows progress from client callbacks. `guitarPro.js` must stay free of `document` and `window`.
`service-worker.js` gains `js/tab/gpParseWorker.js` in `PRECACHE_URLS`. Fallback yields between
tracks on the main thread when `Worker` is missing.

### D17 — Loop by drag

**Decision**: Put loop drag on the bar strip lane in `js/gpPlayer/measureNav.js`. Keep a
long-press drag on the staff in `js/gpPlayer/parchmentView.js`. Remove the `Loop Selection`
mode toggle from `js/gpPlayer/settingsDrawer.js`.

**Rationale**: FR-035 requires loop set by drag or tap on the score without an open panel.
SC-005 requires a two bar loop in 2 actions or fewer in under 5 seconds. `settingsDrawer.js`
exposes a `Loop Selection` toggle that sets `loopSelectMode`. `loopSelection.js` wires
`loopSelectMode` to parchment selection. A staff drag conflicts with vertical scroll on touch
screens. A separate bar strip lane isolates horizontal drag from scroll.

**Alternatives considered**:

- *Keep `Loop Selection` mode as the only drag path.* Rejected. It adds a preparation step.
  FR-035 forbids that step.
- *Loop drag on the staff without long press.* Rejected. It fights one-finger scroll on phones.

**Consequences**: `measureNav.js` becomes the primary loop drag source. `loopSelection.js`
loses the mode toggle dependency. `practiceRail.js` shows loop range and clear control per
FR-036. SC-005 test script uses bar strip drag.

### D18 — Panel rules

**Decision**: Add `js/gpPlayer/panelManager.js`. One panel opens at a time. `close(id)` detaches
every listener, observer, and timer for that panel.

**Rationale**: FR-044 requires at most one open panel. FR-061 requires a closed panel to use
no processor time and to not change playback. Current problem 12 in `spec.md` states that a
closed panel keeps some work active. Panels today mount independently in `gpPlayerUI.js`:
`settingsDrawer.js`, `metronomePanel.js`, `trackMixer.js`, `annotationsDrawer.js`, and
`exerciseImportPanel.js`.

**Alternatives considered**:

- *Leave panels independent and document mutual exclusion in each module.* Rejected. Six
  modules would duplicate close logic. Leaks would return.
- *Destroy the whole player on panel close.* Rejected. FR-061 requires playback to continue
  when a panel closes.

**Consequences**: `panelManager.open(id)` closes other panels first. Each panel registers
teardown with the manager. `gpPlayerUI.js` routes menu entries through the manager. Metronome,
mixer, settings, annotations, and help panels all register.

### D19 — Audio verification

**Decision**: Add `tests/gp-player/run-browser.mjs` and HTML harness pages under
`tests/gp-player/audio/`. Render with `OfflineAudioContext` in headless Chrome. Follow the
pattern of `tests/sync/run-browser.mjs`.

**Rationale**: Node has no Web Audio API. SC-001, SC-003, SC-010, and SC-011 need time
measurements, and FR-051 needs a level measurement. `tests/sync/run-browser.mjs` already spawns headless Chrome with CDP,
navigates harness pages, and reads a `RESULT` line. Pure Node tests in `tests/gp-player/run.mjs`
cannot measure note onset, loop gap, peak level, or spectral difference.

**Alternatives considered**:

- *Manual browser test only.* Rejected. Constitution principle IV requires repeatable
  verification before ship.
- *Mock Web Audio in Node.* Rejected. Mocks would not catch real scheduler drift or clipping
  on the actual `AudioContext` implementation.

**Consequences**: Harness pages render short scores through the new engine. They print onset
times, loop boundary gap, peak level, and bass versus guitar spectral distance. CI remains
absent, but `quickstart.md` will list this command alongside `node tests/gp-player/run.mjs`.
A static server must run on the test port, same as sync tests.

### D20 — Mount compatibility

**Decision**: Keep `mountGpPlayer` options and the returned handle back-compatible. Add new
behaviour through new optional options only.

**Rationale**: FR-063 requires Exercises, Workbooks, Drums import, Track to Sheet, and the
Voice Recorder hand-off to keep working. `mountGpPlayer` in `js/gpPlayerUI.js` is imported
from `js/exercises.js`, `js/workbooks.js`, and re-exported through `js/gpPlayer.js`.
`js/drums/drumsUI.js` calls `loadGpPlayerBytes`. `js/trackToSheet.js` and `js/recorder.js`
call `loadGpPlayerResult`. The returned handle exports `destroy`, `play`, `stop`,
`togglePlayPause`, `setLoopEnabled`, and related methods.

**Alternatives considered**:

- *A new `mountGpPlayer2` with a breaking API.* Rejected. Six entry points would need duplicate
  migration in one release.
- *Silent behaviour change on existing options.* Rejected. Saved exercise settings depend on
  `onPracticeSettingsChange` and `filterPracticeSettingsPatch` in `js/gpExerciseScore.js`.

**Consequences**: New options such as notation staff toggle arrive as optional fields. Handle
methods stay named as today. Contract file `contracts/mount-gp-player.md` documents the
guarantee. Embedders need no code change for default behaviour.

### D21 — Selected track only

**Decision**: Remove the `state.gp.drumTracks?.[0]?.model` fallback from `parchmentModels()` in
`js/gpPlayerUI.js`. Show and play only the track the learner selected.

**Rationale**: FR-031 requires the score to show only the selected track. Current problem 11
in `spec.md` states that the player shows the first drum track under the guitar view when the
learner selected another drum track. `parchmentModels()` sets `perc` to
`state.gp.drumTracks?.[0]?.model` when `viewKind` is not `drum`. `mixLoadBase()` uses a
similar fallback for `referenceModel`.

**Alternatives considered**:

- *Show all drum tracks under guitar view as a ghost staff.* Rejected. FR-031 forbids extra
  tracks. Out of scope lists multi-track staves at once.
- *Hide drum tracks entirely on guitar view.* Rejected. Playback still mixes enabled drum
  tracks through `buildGuitarModels` and drum models. Only the parchment view must stop showing
  the wrong staff.

**Consequences**: When `viewKind === 'guitar'`, `perc` is `null`. When `viewKind === 'drum'`,
`perc` is `state.viewModel` only. `mixLoadBase()` must use `state.viewModel` for
`referenceModel` without the first-drum fallback. User story 3 scenario 9 must pass.

### D22 — Standard notation staff

**Decision**: Ship the standard notation staff as an optional extra view above the tab staff.
Derive pitches from tab string and fret data. Show an octave-down marker for guitar.

**Rationale**: FR-026 requires an optional standard notation staff above the tab staff. The spec
Notation scope assumption keeps the tab staff as the default view and adds standard notation
as an extra. `TabModel` events already carry `midi` after parse. Guitar sounds an octave below
written treble clef notation.

**Alternatives considered**:

- *Import engraved notation from GPIF.* Rejected. Parsers do not keep staff positions today.
  It is out of scope for v1.
- *Always show standard notation.* Rejected. The assumption states tab stays default. Screen
  space on 360 CSS pixels is limited per SC-012.

**Consequences**: `scoreLayout.js` emits a second staff lane when notation mode is on.
`playerState.js` holds a notation toggle persisted per score key. Settings panel exposes the
toggle. Layout tests count notation glyphs separately from tab glyphs.

### D23 — Accessibility

**Decision**: Add a `role="status"` live region for bar announcement during playback. Add full
keyboard transport on the dock. Hold one shortcut table in `js/gpPlayer/shortcutHelp.js`. Add
a `prefers-reduced-motion` CSS rule to stop smooth scroll.

**Rationale**: FR-066 requires screen reader bar announcement. FR-067 requires a text name on
every control. FR-068 requires keyboard-only transport. FR-041 requires every shortcut in the
help panel. FR-069 requires respect for reduced motion. User story 5 scenario 8 requires
screen reader announcement on bar change. `gpPlayerUI.js` supports `enableHostKeyboard` but
does not expose a single shortcut source of truth today.

**Alternatives considered**:

- *Rely on browser default focus only.* Rejected. It fails FR-068 and FR-041.
- *Announce every beat.* Rejected. It floods the screen reader and violates usable announcement
  rhythm.

**Consequences**: `shortcutHelp.js` feeds the help panel and the `?` key. Transport buttons
need `aria-label` audit in `transportDock.js` and `practiceRail.js`. `parchmentView.js` smooth
scroll obeys `prefers-reduced-motion: reduce`. Live region updates on bar index change from the
frame loop in D7.

### D24 — Reset on load

**Decision**: Add `resetForNewScore()` to `js/gpPlayer/playerState.js`. A new score load clears
loop, speed, transpose, tuning, and selected track. Embedder `initial*` options still win after
reset.

**Rationale**: FR-059 requires reset of loop, speed, transpose, tuning, and selected track on
new score load. SC-013 requires no setting carry-over from the first score to the second.
`loadGpPlayerResult` in `js/gpPlayer.js` calls `destroyMount()` then `mountGpPlayer()` but
does not centralise reset rules. `createPlayerState` reads `initialLoopEnabled`,
`initialTranspose`, and related options only on first mount.

**Alternatives considered**:

- *Require every embedder to pass fresh initial options.* Rejected. Six entry points would
  duplicate reset logic and drift.
- *Reset all persisted prefs including metronome.* Rejected. FR-064 keeps metronome settings
  per score key.

**Consequences**: `gpPlayer.js` calls `resetForNewScore()` before remount when bytes or
`gpResult` change. Exercise and workbook embedders pass `initial*` for intentional overrides.
`toPersistable()` in `playerState.js` must not write stale loop fields after reset.

### D25 — Offline manifest guard

**Decision**: Add `tests/gp-player/offline-manifest.mjs`. It asserts that `service-worker.js`
lists every file under `js/gpPlayer/`, GP modules in `js/`, GP modules in `js/tab/`, and
`css/gpplayer.css`.

**Rationale**: FR-062 requires offline open after one earlier online visit. SC-017 requires
every screen area and control to appear with the network off. Current problem 13 in `spec.md`
names missing offline parts. Verified today: `service-worker.js` `PRECACHE_URLS` omits
`js/gpPlayer/layoutMetrics.js`, `js/gpPlayer/viewModes.js`, and `js/gpExerciseScore.js`.
`gpPlayerUI.js` imports `viewModes.js` and `layoutMetrics.js`. `CACHE_VERSION` is
`v190-routine-sibling-switch-and-phone-layout`, so cache name is
`musi-v190-routine-sibling-switch-and-phone-layout`.

**Alternatives considered**:

- *Manual offline check before each release only.* Rejected. FR-062 broke once in silence.
  A Node guard is cheap.
- *Glob the filesystem at service worker install time.* Rejected. The static precache list is
  the project pattern. Runtime glob needs fetch permissions and hides missing files from review.

**Consequences**: Stage 6 adds every new module to `PRECACHE_URLS` and bumps `CACHE_VERSION`.
`offline-manifest.mjs` fails if a new `js/gpPlayer/` file is not listed. The test runs in
`node tests/gp-player/run.mjs`.

## Open risks

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Module worker unsupported on an old browser | Large parse blocks the main thread | `gpParseClient.js` chunked fallback still ships. Constitution gate records worker as non-hard dependency. |
| Wavetable tone fails SC-016 on acoustic passages | Listener cannot separate instruments | Browser harness spectral test in D19 runs before ship. Karplus-Strong noted as follow-up in D13. |
| Playhead frame loop cost on low-end phones | Jank during scroll | Frame loop reads clock only. Heavy layout stays in `scoreLayout.js` at load or resize. |
| Parchment contrast regression with new glyphs | FR-032 failure | Measure 7 to 1 ratio in browser. Keep parchment exception per D12. |
| Precache list drift on new files | Offline blank screen | The D25 manifest test fails in `node tests/gp-player/run.mjs`. Bump the cache version on every new GP player file. |

## Resolved unknowns

| Unknown from Technical Context | Resolution |
| --- | --- |
| Which playback engine to use | D1 — in-house engine, no alphaTab, no SoundFont download |
| How to store tempo, repeats, voices, and techniques | D2 — extend `TabModel` optional fields |
| Where rests and beats live in the model | D3 — `beats[]` and `rests[]`, not in `events[]` |
| How repeats affect playback order versus written bars | D4 — `playOrder.js` bar pass list |
| How to handle nested repeats | D5 — flatten to one pass with warning |
| How tempo automations interact with repeats and speed | D6 — tempo map over passes; rate factor for speed |
| How to keep playhead within 50 ms | D7 — audio lookahead plus `requestAnimationFrame` map |
| How to remove loop click and gap | D8 — continuous schedule and 8 ms fade |
| How to change speed without restart | D9 — `setRate(factor)` replaces reload |
| DOM versus canvas versus SVG for the score | D10 — DOM staff plus per-bar SVG overlay |
| How to test layout without a browser | D11 — pure `scoreLayout.js` |
| Theme on score surface versus chrome | D12 — parchment exception on score only |
| How to improve tone without samples | D13 — per-family wavetable voices |
| Bend, slide, and vibrato audio | D14 — `frequency` automation |
| Clipping on dense chords | D15 — per-track gain, voice budget, compressor |
| Parse freeze on large files | D16 — module worker plus fallback |
| Loop UX without mode toggle | D17 — bar strip drag plus long-press on staff |
| Panel leaks and stacked panels | D18 — `panelManager.js` |
| How to measure audio timing in CI | D19 — `run-browser.mjs` with `OfflineAudioContext` |
| Embedder breakage | D20 — back-compatible `mountGpPlayer` |
| Wrong drum staff under guitar view | D21 — remove first-drum fallback |
| Standard notation scope | D22 — optional staff above tab |
| Accessibility requirements | D23 — live region, keyboard, shortcuts, reduced motion |
| Stale settings on second file | D24 — `resetForNewScore()` |
| Offline precache gaps | D25 — manifest test and missing file fix |
