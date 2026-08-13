# Implementation Plan: Guitar Pro Player Overhaul

**Branch**: `002-gp-player-overhaul` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-gp-player-overhaul/spec.md`

## Summary

Rebuild the Guitar Pro player so it plays the written score and draws the written score.

The player keeps its own engine. The plan adds a timeline layer between the parsed file and
the audio. The parse layer starts to keep the data that it drops today: the tempo
automations, the repeat marks, the alternate endings, the second voice, the ties, the grace
notes, the note dynamics, and the bend points. A new pure module expands the repeats into a
list of bar passes. A second new pure module turns those passes into absolute seconds
through a tempo map. The audio engine schedules from that timeline, and the playhead reads
the same timeline. One source of truth fixes the wrong playback, the wrong bar order, and
the drifting playhead at the same time.

The score view keeps its DOM staff and gains a pure layout pass. That pass places rhythm
marks, rests, time signatures, repeat marks, and technique glyphs. Each bar gains one
inline SVG overlay for the curved marks, which are the bend arrows, the slurs, the slides,
and the beams. The layout pass is pure, so a Node test can count the drawn techniques and
prove SC-004 without a browser.

The practice controls move onto the main screen. A track tab strip stays visible. The
transport bar gains a practice rail with the speed, the loop, the metronome, and the
count-in. A drag on the bar strip sets a loop range with no open panel.

The audio gains one voice model for each instrument family. The voices use wavetables,
filters, and envelopes. The player ships no sample set and downloads no sample set, which
[research.md](./research.md) explains under decision D1.

The file read moves into a module worker, so a large score no longer freezes the screen.

Every stage keeps `mountGpPlayer` back-compatible, because Exercises, Workbooks, the Drums
import, Track to Sheet, and the Voice Recorder all mount the same player. See
[research.md](./research.md) for the decisions and the rejected alternatives, and
[research-inventory.md](./research-inventory.md) for the verified state of the code today.

## Technical Context

**Language/Version**: JavaScript, ES2020 modules in the browser. Node.js 18 or newer for
the test runners and the CLI. The repository runs Node.js 22 today.

**Primary Dependencies**: None. The web app has no framework and no build step. The CLI has
no npm dependency. This feature adds no dependency. It uses these platform APIs: Web Audio
(`AudioContext`, `OfflineAudioContext`, `PeriodicWave`, `WaveShaperNode`,
`DynamicsCompressorNode`), `Worker` with `type: 'module'`, `DecompressionStream`,
`ResizeObserver`, inline SVG, IndexedDB, and local storage.

**Storage**: Browser storage only. IndexedDB `musi-attachments` holds the score bytes.
Local storage holds `musi.exercises`, `musi.workbooks`, `musi.gpAnnotations`,
`musi.gpAutoFollow`, `musi.gpParchmentZoom`, `musi.gpMetroPrefs`, and `musi:settings`. The
sliced score format `musi-tab-model` moves from version 2 to version 3, and the reader
keeps version 2 support.

**Testing**: Plain Node scripts under `tests/`. This feature adds `tests/gp-player/run.mjs`
as the suite runner for the ten existing files and the new files. Audio checks and contrast
checks run in headless Chrome through `tests/gp-player/run-browser.mjs`, which follows the
pattern of `tests/sync/run-browser.mjs`. Node tests use `node:assert/strict` and
`tests/gp-player/domShim.mjs`.

**Target Platform**: Evergreen browsers. Android Chrome as an installed PWA, plus desktop
Chrome and Firefox, plus iOS Safari. The screen target starts at 360 CSS pixels wide. The
player must open offline after one earlier online visit.

**Project Type**: Static frontend PWA at the repository root, with a zero-dependency Node
CLI companion in `cli/`. The CLI shares `js/tab/guitarPro.js`, so the parse layer stays
free of DOM calls and free of browser-only APIs outside the worker wrapper.

**Performance Goals**: The first system of a 200 bar multi-track score appears within 1
second on the test computer at full speed, and within 3 seconds at one quarter processor
speed. The player answers input within 100 milliseconds during a file read. The playhead
stays within 50 milliseconds of the sounding note. A loop pass boundary produces no gap
longer than 10 milliseconds.

**Constraints**: No build step, so every module ships as source and the service worker
precache list needs every new file. No network call for audio, so the player synthesises
every tone on the device. No backend, so every practice setting stays on the device. The
mount contract must stay back-compatible for the five embedders. The Atomic Purple Game Boy
Color theme stays on the chrome.

**Scale/Scope**: A score holds up to about 500 bars and up to about 24 tracks. The feature
adds about nine modules to `js/`, rewrites the scheduler in `js/gpMixPlayer.js`, rewrites
the render body of `js/gpPlayer/parchmentView.js`, and edits about twenty existing files.
It adds seven Node test files, one fixture builder, one suite runner, and one browser
harness.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Result |
| --- | --- | --- |
| I. Static-First Architecture | The feature adds no backend, no database, and no API. It ships plain ES modules with no build step. | PASS. Every new module is a plain ES module. The parse worker loads `js/tab/gpParseWorker.js` with `type: 'module'`, which needs no bundler. The player reads and writes device storage only. |
| II. Shared Theory Engine | Shared logic stays in `js/`. The CLI stays zero-dependency. | PASS. The parse work and the timeline work stay in `js/tab/`, so `cli/src/analyzers/tab.js` gains the same data through `cli/src/shared.js`. The plan adds no npm package to `cli/`. The new modules under `js/tab/` stay free of DOM calls. |
| III. Atomic Purple Game Boy Color UI | New UI reuses the theme tokens and the pixel font stack. Panels read as LCD screen tiles. | PASS with a recorded exception. FR-032 keeps the theme on the controls and the panels. The score surface keeps the parchment treatment that `css/gpplayer.css` already documents, and decision D12 records that exception. New chrome uses `--card`, `--border`, `--accent`, `--accent2`, `--radius-screen`, `--radius-pill`, `--font-pixel`, `--font-body`, `--font-ui`, and `--tap-min`. |
| IV. Verify Before Ship | Run the Node runners, serve the app over HTTP, exercise the UI, and run a CLI smoke command. | PASS. [quickstart.md](./quickstart.md) holds the steps. `tests/gp-player/run.mjs` carries the pure part. `tests/gp-player/run-browser.mjs` carries the audio part and the timing part. The CLI smoke command proves the shared parse layer still works. |
| V. Spec-Driven Feature Work | Spec first, then plan, then tasks, then implement. Artifacts live in `specs/`. | PASS. This plan follows `spec.md` and precedes `tasks.md`. |
| Communication | Written output follows ASD-STE100 Simplified Technical English. | PASS. Every artifact in this directory follows it. Code identifiers, file paths, and UI strings stay verbatim. |

**Post-design re-check**: PASS. The Phase 1 design adds no dependency, no backend, and no
build tool. It adds one platform feature that the repository does not use yet, which is the
module worker. Decision D16 keeps a main-thread fallback, so a browser without module
worker support still opens a score. The design adds no new font family. It adds no colour
outside the existing token set and the existing parchment palette. The Complexity Tracking
section records the two design choices that need a justification.

## Project Structure

### Documentation (this feature)

```text
specs/002-gp-player-overhaul/
├── plan.md                       # This file
├── spec.md                       # Feature requirements
├── research.md                   # Phase 0 decisions (D1 to D25)
├── research-inventory.md         # Verified state of the current code
├── data-model.md                 # Phase 1 entities and validation
├── quickstart.md                 # Phase 1 validation guide
├── contracts/
│   ├── score-model.md            # Parsed score shape and the added fields
│   ├── score-timeline.md         # Play order, tempo map, and position mapping
│   ├── player-engine.md          # Audio engine interface and guarantees
│   ├── score-view.md             # Layout model and render interface
│   └── mount-gp-player.md        # Embedder contract that must not break
├── checklists/
│   └── requirements.md           # Spec quality checklist
└── tasks.md                      # Phase 2 output, created by /speckit-tasks
```

### Source Code (repository root)

```text
index.html                        # Player host markup and a read progress region
service-worker.js                 # Precache list and cache name

css/
├── base.css                      # Theme tokens, unchanged
├── theme-gbc.css                 # Screen-tile treatment, unchanged
└── gpplayer.css                  # Rhythm marks, glyph lanes, track tabs, practice rail

js/tab/
├── guitarPro.js                  # Keep tempo automations, repeats, voices, dynamics, bends
├── gp5.js                        # Same for the binary reader
├── tabModel.js                   # Extended model shape, clone and slice carry new fields
├── playOrder.js                  # NEW. Pure. Expand repeats into bar passes
├── scoreTimeline.js              # NEW. Pure. Tempo map, absolute seconds, position lookup
├── gpParseWorker.js              # NEW. Module worker entry for the parse
├── gpParseClient.js              # NEW. Worker client with progress and a fallback
└── tabPlayer.js                  # Keep buildTimedNotes for the ASCII tab path

js/gpPlayer/
├── scoreLayout.js                # NEW. Pure. Bar layout, glyph boxes, rhythm and rests
├── instrumentVoices.js           # NEW. Per-instrument Web Audio voices and headroom
├── panelManager.js               # NEW. One open panel, full teardown on close
├── shortcutHelp.js               # NEW. Shortcut table and the help panel
├── trackTabs.js                  # NEW. Always visible track selector
├── practiceRail.js               # NEW. Main-screen speed, loop, metronome, count-in
├── parchmentView.js              # Render from the layout model, add the SVG overlay
├── playerState.js                # Reset on load, per-track volume, notation toggle
├── transportDock.js              # Two rows, keyboard focus order, host for the rail
├── measureNav.js                 # Loop drag source and seek target
├── loopSelection.js              # Drag rules without a mode toggle
├── trackMixer.js                 # Per-track volume, mute, and solo
├── settingsDrawer.js             # Drop the controls that move to the main screen
├── playerMenu.js                 # Shorter menu, add the help entry
└── metronomeState.js             # Count-in on screen and the loop rest countdown

js/
├── gpMixPlayer.js                # Timeline scheduler, gapless loop, rate, voices
├── gpPlayerUI.js                 # Wiring, playhead frame loop, live region, keyboard
├── gpPlayer.js                   # Read progress, error messages, reset, teardown
├── gpExerciseScore.js            # Serialized version 3 with a version 2 reader
└── gpFollowView.js               # DELETE after the tests move to the layout model

tests/gp-player/
├── run.mjs                       # NEW. Suite runner for every file in this folder
├── fixtures/makeFixtures.mjs     # NEW. Build .gp and .gp5 byte fixtures
├── parse.mjs                     # NEW. End-to-end parse and the rejection messages
├── play-order.mjs                # NEW. Repeats, endings, and the nested warning
├── timeline.mjs                  # NEW. Tempo map, total time, bar order, rate
├── score-layout.mjs              # NEW. Rhythm marks, rests, technique coverage
├── offline-manifest.mjs          # NEW. Every player file sits in the precache list
├── audio/*.html                  # NEW. OfflineAudioContext harness pages
└── run-browser.mjs               # NEW. Headless Chrome driver for the audio pages
```

**Structure Decision**: The repository is a flat static PWA with a shared `js/` folder and
a mirrored `tests/` folder. This feature keeps that layout. The parse layer and the timing
layer stay in `js/tab/`, because the CLI shares that folder. The view layer, the audio
voices, and the panel rules stay in `js/gpPlayer/`, because only the web app needs them.
The plan creates no new top-level folder. It adds `tests/gp-player/fixtures/` and
`tests/gp-player/audio/` for the test data and the browser pages.

## Phase 0 research summary

[research.md](./research.md) records 25 decisions. The plan depends on these ones:

| Decision | Choice |
| --- | --- |
| D1 | Keep the in-house engine. Reject alphaTab and a downloaded sound font. |
| D2 | Extend `TabModel` with optional fields. Do not add a second score type. |
| D4 | Separate the written score from the sounding order with a play order list. |
| D6 | Build the tempo map over the play order. Apply the speed as a rate factor. |
| D8 | Loop with continuous scheduling. Fade the voices instead of stopping them. |
| D10 | Keep the DOM staff. Add one SVG overlay for each bar. Reject a canvas rewrite. |
| D13 | Build one wavetable voice for each instrument family. Ship no samples. |
| D16 | Parse in a module worker. Keep a chunked main-thread fallback. |
| D19 | Prove the audio requirements with an `OfflineAudioContext` render in Chrome. |

## Phase 1 design summary

### New modules

| Module | Kind | Responsibility |
| --- | --- | --- |
| `js/tab/playOrder.js` | Pure | Read the repeat marks and the alternate endings. Return the ordered bar passes. Flatten a nested repeat and return a warning. |
| `js/tab/scoreTimeline.js` | Pure | Build the tempo map over the bar passes. Convert a musical position to seconds and back. Return the sounding event list and the pass spans. Apply the speed rate. |
| `js/tab/gpParseWorker.js` | Worker | Receive the bytes. Call the same parse functions. Post progress and the result. |
| `js/tab/gpParseClient.js` | Browser | Start the worker, report progress, and fall back to a chunked main-thread parse. |
| `js/gpPlayer/scoreLayout.js` | Pure | Turn one written bar into positioned glyph boxes. Cover notes, stems, beams, dots, rests, time signatures, repeat marks, volta brackets, and technique glyphs. |
| `js/gpPlayer/instrumentVoices.js` | Browser | Build one Web Audio voice for each instrument family. Apply the dynamics, the bends, the slides, the vibrato, and the mute. Hold the output below full scale. |
| `js/gpPlayer/panelManager.js` | Browser | Keep one open panel. Detach every listener and observer on close. |
| `js/gpPlayer/shortcutHelp.js` | Browser | Hold the single shortcut table. Draw the help panel. |
| `js/gpPlayer/trackTabs.js` | Browser | Draw the always visible track strip. Switch track in one action. |
| `js/gpPlayer/practiceRail.js` | Browser | Draw the main-screen speed, loop, metronome, and count-in controls. |

### Playback fidelity

The engine stops its scalar tempo maths. It reads the timeline instead.

1. `js/tab/playOrder.js` reads `measures[]`. It returns
   `{ passes: [{ barIndex, passIndex, startQuarter, endQuarter }], barOrder, flattened, warnings }`.
   One written bar can appear in several passes. An alternate ending appears in the pass
   that its ending number selects.
2. `js/tab/scoreTimeline.js` walks the passes. It applies each tempo automation at the bar
   and the beat that the automation names, on every pass of that bar. It returns absolute
   seconds for each pass and for each sounding event.
3. `js/gpMixPlayer.js` keeps the `AudioContext.currentTime` lookahead window. It walks a
   cursor over the timeline event list. The cursor no longer depends on one BPM value.
4. The playhead runs on `requestAnimationFrame`. Each frame reads `audioCtx.currentTime`,
   maps that time through the timeline, and reports the bar, the beat, and the pass. A
   frame costs about 16 milliseconds, so FR-009 has margin against its 50 millisecond
   limit.
5. `setBpm` becomes `setRate(factor)`. The engine keeps the current musical position, scales
   the timeline, and reschedules the future events only. It does not reload the model. The
   transport still shows a percentage and a BPM value, as FR-037 requires.
6. Stop and Pause ramp every voice to zero across about 8 milliseconds, then stop the nodes.
   A hard `stop()` call creates the click that FR-013 forbids.
7. A loop schedules across the boundary. The engine unrolls the next pass into the same
   lookahead window, so no origin reset happens at the boundary. The gap target is 10
   milliseconds, and the fade removes the click.
8. The optional loop rest holds the playhead at the loop start and shows a countdown, per
   FR-014.
9. The engine listens for `visibilitychange` and for an `AudioContext` state change. On
   return it re-anchors the position from the audio clock, so FR-011 holds.
10. `play()` reports a failed `resume()` through a callback. The UI then states the cause
    and one next step, per FR-052.

### Score rendering

`js/gpPlayer/scoreLayout.js` holds every layout rule and returns plain data:

```text
layoutBar(bar, options) -> {
  widthUnits, beatColumns[], voices[],
  glyphs: [{ kind, lane, x, y, w, h, text, path, aria }],
  overlays: [{ kind, from, to, path }],
  warnings[]
}
```

`js/gpPlayer/parchmentView.js` draws that data. It writes text and staff lines as DOM
elements, which keeps the current CSS, the pointer handling, and the text contrast. It
writes one inline `<svg>` for each bar for the curved marks. The curved marks are the bend
arrow, the slur for a hammer-on and a pull-off, the slide line, the tie, and the beam.

The view gains these elements: a rhythm lane below the tab staff with stems, flags, beams,
and dots; a rest lane with the standard rest glyphs; a time signature block at the first
bar and at every change; repeat barlines and volta brackets; a technique lane above the
staff and a technique lane below the staff; and an optional standard notation staff above
the tab staff.

The view keeps the reflow rules and the zoom rule. It adds a floor test at 360 CSS pixels
wide, so a fret number never draws below 12 CSS pixels. The layout function returns the
computed font size, so a Node test can prove FR-030 without a browser.

`parchmentModels()` in `js/gpPlayerUI.js` loses the `state.gp.drumTracks?.[0]?.model`
fallback. The view then shows the selected track only, per FR-031.

### Practice controls

| Control | New place | Requirement |
| --- | --- | --- |
| Play, Pause, Stop, previous bar, next bar | Transport row one | FR-042 |
| Bar readout, time readout | Transport row one | FR-010 |
| Speed as a percentage and a BPM value | Practice rail | FR-037 |
| Loop toggle, loop range, clear loop | Practice rail | FR-035, FR-036 |
| Metronome toggle, count-in toggle | Practice rail | FR-038, FR-039 |
| Track choice | Track tab strip above the score | FR-033, FR-034 |
| Keyboard shortcut list | Help panel from the menu and from the `?` key | FR-041 |
| Per-track volume, mute, solo | Track mixer panel | FR-040 |
| Zoom, transpose, tuning, auto scroll, notation staff | Practice settings panel | FR-026, FR-029 |
| Metronome accent, subdivision, tempo ramp | Metronome panel | FR-039 |

A drag across the bar strip sets a loop range. The bar strip is a separate lane, so the
drag does not fight the vertical scroll of the score. A drag on the staff also works after
a long press. The plan drops the `Loop Selection` mode toggle, because FR-035 forbids a
preparation step.

`js/gpPlayer/panelManager.js` owns every panel. `open(id)` closes the other panels first.
`close(id)` detaches the key listeners, the `matchMedia` listeners, and the observers of
that panel. A closed panel then uses no processor time, per FR-061.

### Audio quality

`js/gpPlayer/instrumentVoices.js` maps the MIDI program of the track to one of these
families: clean guitar, distorted guitar, acoustic guitar, bass, keys, and drums. Each
family holds a `PeriodicWave` harmonic table, an attack time, a decay curve, and a filter
rule. The distorted guitar adds a `WaveShaperNode`. The drums keep the existing voices in
`js/drums/drumEngine.js`.

The velocity from the score sets the peak gain and the filter cutoff, per FR-048. A bend, a
slide, and a vibrato drive `frequency` automation across the note, per FR-049. A palm mute
and a dead note shorten the decay and lower the cutoff, per FR-050.

The engine holds a voice budget. Each track owns a gain node, and the sum stays below the
master ceiling. The existing `DynamicsCompressorNode` in `js/audio.js` stays. A dense chord
passage must render below full scale, and `tests/gp-player/run-browser.mjs` measures that
peak in an `OfflineAudioContext`.

### Loading and reliability

`js/tab/gpParseClient.js` posts the `ArrayBuffer` to `js/tab/gpParseWorker.js` as a
transferable object. The worker posts `{ type: 'progress', ratio }` and then
`{ type: 'result', gp }`. The main thread stays free, so the screen answers input within
100 milliseconds, per FR-055. When `Worker` is missing, the client parses on the main
thread and yields to the event loop between tracks.

`js/gpPlayer.js` shows the read progress and every error message. Each message states what
happened and one next step, per FR-056. The `.gp3`, `.gp4`, and `.gpx` messages stay as
they read today, because they already state the re-export step.

`js/gpPlayer/playerState.js` gains `resetForNewScore()`. A new load clears the loop, the
speed, the transpose, the tuning, and the selected track, per FR-059. An embedder can still
pass the `initial*` options, and those options win.

The player teardown stops the audio, cancels the frame loop, disconnects the nodes, and
disconnects the observers, per FR-060.

`service-worker.js` gains the three files that it misses today, which are
`js/gpPlayer/layoutMetrics.js`, `js/gpPlayer/viewModes.js`, and `js/gpExerciseScore.js`. It
also gains every new module. `tests/gp-player/offline-manifest.mjs` then guards the list,
so FR-062 cannot break again in silence.

### Accessibility

The player adds a `role="status"` region that announces the bar during playback, per
FR-066. Every control carries a text name, per FR-067. The transport runs from the keyboard
alone, and `js/gpPlayer/shortcutHelp.js` holds the one shortcut table that the help panel
draws, per FR-068 and FR-041. The view respects `prefers-reduced-motion` and then stops the
smooth scroll, per FR-069.

### Contracts

| Contract | Purpose |
| --- | --- |
| [contracts/score-model.md](./contracts/score-model.md) | The parsed score shape, the added optional fields, and the rule that keeps every existing consumer working. |
| [contracts/score-timeline.md](./contracts/score-timeline.md) | The play order rules, the tempo map maths, the position lookup, and the rate rule. |
| [contracts/player-engine.md](./contracts/player-engine.md) | The audio engine interface, the callbacks, and the timing guarantees. |
| [contracts/score-view.md](./contracts/score-view.md) | The layout model, the glyph kinds, and the render interface. |
| [contracts/mount-gp-player.md](./contracts/mount-gp-player.md) | The `mountGpPlayer` options and handle that the five embedders depend on. |

### Compatibility rules

The player has five embedders and one command line consumer. These rules protect them:

1. `mountGpPlayer(host, options)` keeps every current option name and every current handle
   method. New behaviour arrives through new optional options.
2. `onPracticeSettingsChange` keeps the current patch shape. New keys are additive, and
   `filterPracticeSettingsPatch` in `js/gpExerciseScore.js` decides what persists.
3. The parse result keeps `tracks`, `drumTracks`, `parts`, `model`, `ascii`, `meta`, and
   `tempo`. New data arrives as new fields.
4. `serializeExerciseScore` writes version 3. `gpResultFromTabModelJson` reads version 2 and
   version 3. A version 2 record loads with the same behaviour as today.
5. `cli/src/analyzers/tab.js` keeps its output. The CLI gains no playback.

## Delivery stages

Each stage must leave the app runnable, and each stage ends with a run of
`node tests/gp-player/run.mjs`.

| Stage | Content | Stories and requirements |
| --- | --- | --- |
| 1 | Extend the parse layer and the model. Keep the tempo automations, the repeats, the endings, the voices, the ties, the grace notes, the dynamics, the bend points, and the instrument program. Add the fixture builder, the parse suite, and the suite runner. Move the serialized score to version 3. | FR-057, FR-058, and the data that FR-001 to FR-008 need |
| 2 | Add `playOrder.js` and `scoreTimeline.js`. Rewrite the scheduler in `js/gpMixPlayer.js`. Add the frame-driven playhead, the gapless loop, the loop rest countdown, the rate control, and the fade on stop. Add the timeline suite and the audio harness. | US1, FR-001 to FR-017 |
| 3 | Add `scoreLayout.js`. Rewrite the render body of `parchmentView.js`. Draw the rhythm marks, the rests, the time signatures, the repeat marks, the volta brackets, and the technique glyphs. Add the optional standard staff. Fix the drum staff fallback. Add the layout suite. | US2, FR-018 to FR-032 |
| 4 | Add `trackTabs.js`, `practiceRail.js`, `panelManager.js`, and `shortcutHelp.js`. Move the controls onto the main screen. Add the loop drag on the bar strip. Add the keyboard map, the live region, and the reduced motion rule. Add the per-track volume. | US3, FR-033 to FR-046, FR-066 to FR-069 |
| 5 | Add `instrumentVoices.js`. Apply the dynamics, the bends, the slides, the vibrato, and the mutes. Add the headroom budget and the autoplay message. Measure the peak level and the instrument difference in the browser harness. | US4, FR-047 to FR-053 |
| 6 | Add `gpParseWorker.js` and `gpParseClient.js`. Add the read progress, the error messages, and `resetForNewScore()`. Complete the teardown. Update the precache list and the cache name. Add the offline manifest suite. Run the full verification in [quickstart.md](./quickstart.md). | US5, FR-054 to FR-065 |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| The score surface keeps a parchment palette instead of the Game Boy Color screen tokens. | FR-032 needs a 7 to 1 contrast ratio for the note text across long reading sessions. The parchment surface already ships and already meets that ratio. `css/gpplayer.css` records the split between the chrome and the score. | A pure token surface would put yellow or white note text on a deep navy staff. The rhythm marks, the rests, and the technique glyphs add many thin strokes, and thin light strokes on navy lose contrast at 12 CSS pixels. The chrome and every panel stay on the theme. |
| The parse layer runs inside a module worker, which is a platform feature that the repository does not use yet. | FR-054 and FR-055 need read progress and a responsive screen during a 500 bar parse. The parse is a long synchronous byte walk, so only another thread keeps the main thread free. | A chunked main-thread parse alone cannot hold a 100 millisecond input budget on a slow phone. The plan still ships that chunked path as the fallback, so the worker adds no hard dependency. |
