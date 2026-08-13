# Phase 0 Inventory: Guitar Pro Player Overhaul

**Feature**: `002-gp-player-overhaul` | **Date**: 2026-08-13 | **Plan**: [plan.md](./plan.md)

This file records the verified state of the Guitar Pro player code today. A reviewer can repeat every shell command in this file. File paths and identifiers appear verbatim. This file does not carry line numbers.

## Summary

Musi ships a Guitar Pro practice player as plain ES modules. The parse layer in `js/tab/guitarPro.js` and `js/tab/gp5.js` builds `TabModel` and `PercussionModel` objects. `js/gpMixPlayer.js` schedules audio from one scalar BPM. `js/gpPlayer/parchmentView.js` draws a DOM parchment score with fret numbers and drum glyphs only. `js/gpPlayerUI.js` wires transport, drawers, and five embedders through `mountGpPlayer`. The largest gaps sit in playback fidelity (tempo map, repeats, ties, voices), score rendering (rhythm and technique glyphs), practice control placement (track list and loop tools behind menus), offline precache holes, and main-thread file reads without progress.

## Module map

Line counts come from this command:

```bash
wc -l js/gpPlayer.js js/gpPlayerUI.js js/gpMixPlayer.js js/gpExerciseScore.js \
  js/gpAnnotations.js js/gpFollowView.js js/gpPlayer/*.js js/tab/guitarPro.js \
  js/tab/gp5.js js/tab/gpPercussion.js js/tab/tabModel.js js/tab/tabPlayer.js \
  js/tab/metroClick.js js/audio.js js/drums/drumEngine.js css/gpplayer.css \
  service-worker.js tests/gp-player/*.mjs
```

| Module | Role | Lines |
| --- | --- | ---: |
| `js/gpPlayer/tempoRange.js` | BPM and tempo-percent clamps for transport and settings | 18 |
| `js/gpPlayer/viewModes.js` | Score / Analyze / Both view mode persistence | 27 |
| `js/tab/metroClick.js` | Web Audio metronome click synthesis | 55 |
| `js/gpPlayer/dom.js` | Small DOM helper (`el`, `uid`, `fmtTime`) | 47 |
| `js/gpPlayer/index.js` | Re-export barrel for `js/gpPlayer/` | 51 |
| `js/gpPlayer/loopSelection.js` | Loop and note selection controller for the parchment | 78 |
| `js/gpPlayer/layoutMetrics.js` | Transport pad and pinned scroll metrics | 80 |
| `js/gpPlayer/measureNav.js` | Measure strip above the score | 117 |
| `js/gpPlayer/trackMixer.js` | Track enable, solo, and view rows in the tracks drawer | 129 |
| `js/gpPlayer/rangeUtils.js` | Beat and measure range math | 141 |
| `js/audio.js` | Shared `AudioContext`, master gain, compressor, analyser | 154 |
| `js/gpExerciseScore.js` | Exercise slice helpers and `musi-tab-model` v2 serialisation | 198 |
| `js/tab/gpPercussion.js` | Drum MIDI normalisation, dynamics, `PercussionModel` builder | 225 |
| `js/gpPlayer/transportDock.js` | Transport bar (play, tempo, loop chip) | 231 |
| `js/gpPlayer/measureDigest.js` | Measure digest text for exercise import | 258 |
| `js/gpPlayer/playerMenu.js` | Menu drawer (view mode, panel launchers) | 295 |
| `js/tab/tabModel.js` | `TabModel` shape, transpose, retune, slice helpers | 315 |
| `js/gpAnnotations.js` | Section notes storage and API | 322 |
| `js/gpPlayer/annotationsDrawer.js` | Section-notes panel UI | 359 |
| `js/gpPlayer/exerciseSegments.js` | Segment detection for exercise import | 388 |
| `js/gpPlayer/playerState.js` | Player state, transforms, loop, metro prefs IO | 394 |
| `js/tab/tabPlayer.js` | Single-track scheduler (`buildTimedNotes`, `createTabPlayer`) | 408 |
| `js/drums/drumEngine.js` | Drum hit synthesis (`scheduleHit`, `initEngine`) | 429 |
| `js/gpFollowView.js` | Legacy follow-column helper (still imported by tests) | 430 |
| `js/gpPlayer/metronomeState.js` | Metronome config, count-in, tempo-ramp controller | 430 |
| `js/gpPlayer/settingsDrawer.js` | Practice settings drawer (loop, transpose, zoom) | 468 |
| `js/gpMixPlayer.js` | Multi-track mix player scheduler | 589 |
| `js/tab/gp5.js` | Binary `.gp5` reader | 638 |
| `js/gpPlayer.js` | Standalone GP Player screen (file load, library) | 730 |
| `js/tab/guitarPro.js` | `.gp` ZIP/GPIF reader and `parseGuitarPro` entry | 926 |
| `js/gpPlayer/parchmentView.js` | Parchment score renderer | 1056 |
| `js/gpPlayer/metronomePanel.js` | Metronome and tempo-ramp panel | 544 |
| `js/gpPlayer/exerciseImportPanel.js` | Split-into-exercises studio panel | 1284 |
| `js/gpPlayerUI.js` | `mountGpPlayer` orchestration | 1405 |
| `css/gpplayer.css` | GP player chrome and parchment styles | 2458 |
| `service-worker.js` | PWA precache list and cache name | 393 |
| `tests/gp-player/domShim.mjs` | DOM shim for Node player tests | 357 |
| `tests/gp-player/metro-click.mjs` | `metroClick.js` unit checks | 37 |
| `tests/gp-player/loop-playback.mjs` | Loop reload and `setLoopEnabled` wiring | 249 |
| `tests/gp-player/exercise-import-ui.mjs` | Exercise import panel UI wiring | 222 |
| `tests/gp-player/exercise-import.mjs` | Segment import logic | 259 |
| `tests/gp-player/drum-notation.mjs` | Drum tab glyph coverage | 245 |
| `tests/gp-player/exercise-slice.mjs` | Exercise bar slicing | 347 |
| `tests/gp-player/wiring.mjs` | `mountGpPlayer` integration wiring | 290 |
| `tests/gp-player/drum-parsing.mjs` | GPIF drum parse and mix player load | 512 |
| `tests/gp-player/metronome.mjs` | Metronome panel and count-in wiring | 546 |
| `tests/gp-player/smoke.mjs` | Parse rhythm, state, parchment, annotations smoke | 1182 |

## Parse layer

### Entry point and format handling

`parseGuitarPro` in `js/tab/guitarPro.js` accepts `ArrayBuffer` or `Uint8Array`. It routes `.gp5` to `parseGp5Tracks` in `js/tab/gp5.js`. It routes `.gp` (ZIP/GPIF) through `gpifToTracks`. It rejects other containers with the messages below.

| Condition | Verbatim message |
| --- | --- |
| Wrong input type | `guitarPro: expected ArrayBuffer or Uint8Array` |
| Missing `DecompressionStream` | `guitarPro: DecompressionStream is unavailable in this environment` |
| ZIP inflate failure | `guitarPro: could not inflate a ZIP entry` |
| Bad ZIP | `guitarPro: not a ZIP (no end-of-central-directory record)` |
| Bad local header | `guitarPro: bad local file header` |
| Unsupported ZIP method | `guitarPro: unsupported ZIP compression method ${entry.method}` |
| No tracks in GPIF | `guitarPro: no tracks found in the score` |
| No playable parts | `This Guitar Pro file has no fretted (tab) or drum part to import.` |
| `.gpx` | `This is a Guitar Pro 6 (.gpx) file. Open it in Guitar Pro and re-export as “.gp” (Guitar Pro 7/8) or “.gp5” to analyze it.` |
| `.gp3` / `.gp4` | `This is an older binary Guitar Pro file (${fmt}). Open it in Guitar Pro and re-save as “.gp” (7/8) or “.gp5” to analyze it.` |
| Unknown format | `Unrecognized file — expected a Guitar Pro “.gp” (7/8) or “.gp5” file.` |
| Missing GPIF | `guitarPro: no score.gpif inside the .gp archive` |

`parseGp5Tracks` also throws `gp5: not a Guitar Pro 5 file`, `gp5: unexpected end of file while parsing (unsupported variant?)`, and `gp5: no fretted track to analyze` from `parseGp5`.

### Feature capture table

| Musical feature | GPIF (`.gp`) function | GP5 function | Status |
| --- | --- | --- | --- |
| Initial tempo | `readGpifTempo` | `parseGp5Tracks` (`scoreTempo`) | CAPTURES (one BPM on result and models) |
| Tempo automations | `readGpifTempo` | — | DROPS (earliest automation only; no `tempoMap`) |
| Time signatures and changes | `buildGpifTrackModel`, `buildGpifPercussionModel` | `readMeasureHeader`, `buildModel`, `buildPercussionModel` | CAPTURES (`measures[].timeSig`) |
| Repeat open | — | — | DROPS |
| Repeat close count | — | `readMeasureHeader` (byte consumed, not stored) | DROPS |
| Alternate endings | — | `readMeasureHeader` (byte consumed, not stored) | DROPS |
| Section markers | `buildGpifTrackModel`, `buildGpifPercussionModel` | `readMeasureHeader` | CAPTURES (`measures[].marker`) |
| Directions (coda, D.S.) | — | `readDirections` (bytes skipped) | DROPS |
| Ties | — | `buildModel` (`n.tie` inherits pitch) | PARTIAL (tie notes become separate `TabEvent` rows) |
| Dotted notes | `beatDurationQuarters`, `readGpifRhythms` | `readBeat`, `gp5DurationToQuarters` | CAPTURES (`duration`) |
| Tuplets | `readGpifRhythms`, `beatDurationQuarters` | `readBeat` | CAPTURES (`duration`) |
| Grace notes | — | `readGrace` (bytes skipped) | DROPS |
| Several voices per bar (fretted) | `buildGpifTrackModel` | `buildModel` | DROPS (first playable voice only) |
| Several voices per bar (drum) | `buildGpifPercussionModel` | `buildPercussionModel` | CAPTURES (all voices merged) |
| Explicit rests | `buildGpifTrackModel` | `readBeat` | PARTIAL (time advances; no rest events) |
| Note durations | `beatDurationQuarters` | `readBeat` | CAPTURES (`TabEvent.duration`) |
| Bend with points | `techniquesForNote` | `readNoteEffects` / `readBend` | PARTIAL (`bend` flag only; points discarded) |
| Slide | `techniquesForNote` | `readNoteEffects` | CAPTURES (`techniques`) |
| Hammer-on | `techniquesForNote`, hopo logic in `buildGpifTrackModel` | `buildModel` hopo logic | CAPTURES |
| Pull-off | same as hammer-on | same | CAPTURES |
| Vibrato | `techniquesForNote` | `readNoteEffects` | CAPTURES |
| Palm mute | `techniquesForNote` | `readNoteEffects` | CAPTURES |
| Harmonic | `techniquesForNote` | `readNoteEffects` | CAPTURES |
| Tap | `techniquesForNote` | — | CAPTURES (GPIF) |
| Slap | `techniquesForNote`, beat props in `buildGpifTrackModel` | — | CAPTURES (GPIF) |
| Pop | `techniquesForNote`, beat props | — | CAPTURES (GPIF) |
| Trill | `techniquesForNote` | `readNoteEffects` | CAPTURES |
| Tremolo | beat `Tremolo` in `buildGpifTrackModel` | `readNoteEffects` | CAPTURES |
| Dead note | `techniquesForNote` (`Muted`) | `readNote` type 3 | CAPTURES (`dead`) |
| Dynamics (fretted) | — | `readNote` (`dynamics` byte read) | DROPS (not copied to `TabEvent`) |
| Dynamics (drum) | `buildGpifPercussionModel` + `dynamicsToVelocity` | `buildPercussionModel` + `dynamicsToVelocity` | CAPTURES (`velocity` on percussion events) |
| Tuning | `tuningPitchesOf`, `buildGpifTrackModel` | `readTrack`, `buildModel` | CAPTURES (`strings`, `tuning`) |
| String count | `tuningPitchesOf` | `readTrack` (`stringCount`) | CAPTURES |
| Capo | — | `readTrack` (value skipped) | DROPS |
| Transposition (score) | — | `readTrack` (clef transpose skipped) | DROPS |
| MIDI program | — | `readMidiChannels` (skipped) | DROPS |
| Drum kit mapping | `readPercussionArticulations`, `resolveGpifPercussionNote`, `midiToDrumInstrument` | `normalizeGp5PercussionMidi`, `midiToDrumInstrument` | PARTIAL (unmapped hits dropped) |
| Track volume and pan | — | `readMidiChannels`, `readTrack` RSE fields (skipped) | DROPS |

`assembleResult` in `js/tab/guitarPro.js` is the shared post-parse assembler for both formats.

## Score model

### `TabModel` (`js/tab/tabModel.js` header)

Fields: `tuning`, `strings` (`label`, `note`, `oct`, `openMidi`), `events`, `slots`, `measures` (`startSlot`, `endSlot`, `startBeat`, `endBeat`, `marker`, `timeSig`), `tempo`, `totalBeats`, `techniqueCounts`, `warnings`.

`cloneModel` also copies optional `tempoMap`, but no parser fills it today.

### `TabEvent`

Fields: `slot`, `stringIndex`, `fret`, `midi`, `pc`, `techniques`, `dead`, optional `start`, optional `duration`.

No `velocity` field on fretted events.

### `PercussionModel` (`js/tab/gpPercussion.js` typedef)

Fields: `percussion` (true), `name`, `tempo`, `events`, `measures`, `slots`, `totalBeats`, `warnings`.

### Percussion event (`PercEvent` typedef)

Fields: `slot`, `start`, `duration`, `instrument`, `velocity`, `midi`, `articulation`, `accent`.

### `parseGuitarPro` result (`assembleResult`)

Top-level fields: `format`, `tracks`, `drumTracks`, `parts`, `defaultIndex`, `model`, `ascii`, `meta`, and optional `tempo`.

`tracks[]`: `index`, `sourceIndex`, `name`, `tuning`, `tuningPitches`, `model`, `ascii`, `noteCount`.

`drumTracks[]`: `index`, `sourceIndex`, `name`, `model`, `hitCount`, `tempo`.

`parts[]`: `name`, `sourceIndex`, `analyzable`, `analyzableIndex`, `isPercussion`, `drumIndex`, `tuning`, `noteCount`, `reason`.

`meta`: `format`, `tracks`, `frettedTracks`, `drumTracks`, `trackName`, `tuningPitches`.

### `musi-tab-model` version 2 (`serializeExerciseScore` in `js/gpExerciseScore.js`)

Fields: `format` (`musi-tab-model`), `version` (2), `tempo`, `tracks` (`index`, `name`, `tuning`, `model`), `drumTracks` (`index`, `name`, `model`), `warnings`, optional `source` (`fileName`, `measureStart`, `measureEnd`).

## Playback engine

### Scheduler design

`createGpMixPlayer` in `js/gpMixPlayer.js` owns playback. It builds timed guitar notes through `buildTimedNotes` in `js/tab/tabPlayer.js` and drum hits through `buildTimedDrums`. It merges events, then runs a `setTimeout` loop (`scheduler`) with a look-ahead window.

Guitar tones use `scheduleGuitarTone` (triangle or square oscillator). Drums use `scheduleHit` from `js/drums/drumEngine.js`. Metronome clicks use `scheduleMetronomeClick` from `js/tab/metroClick.js`.

### Named constants

| Constant | Module | Value |
| --- | --- | ---: |
| `LOOKAHEAD_MS` | `js/gpMixPlayer.js` | 25 |
| `SCHEDULE_AHEAD` | `js/gpMixPlayer.js` | 0.14 |
| `LOOKAHEAD_MS` | `js/tab/tabPlayer.js` | 25 |
| `SCHEDULE_AHEAD` | `js/tab/tabPlayer.js` | 0.12 |

### Clock variables (`createGpMixPlayer` state)

`originAudioTime`, `originSongSec`, `pauseAtSec`, `bpm`, `nextIndex`, `nextMetroBeat`, `inLoopRest`, `loopRestUntil`, `loopPassCount`, `loopRestartFlag`, `playing`, `paused`, `timer`.

`songTimeNow()` maps `audioCtx.currentTime` to song seconds when playing.

### Position reporting path

`scheduler` calls `emitTick`. `emitTick` computes `beat = (sec / 60) * state.bpm` and `measureIndex` through `measureIndexAtBeat` in `js/gpPlayer/rangeUtils.js`. `mountGpPlayer` registers `onTick` and forwards to `syncPlaybackUi`, which updates the parchment playhead and transport readout.

### Loop path

`load` sets `state.loop` from `loopFromMeasures` or beat windows. At loop end, `scheduler` calls `clearVoices()`, then either enters `inLoopRest` or resets `originSongSec` to `loop.startSec` and calls `resyncCursor`.

### Speed path

`setBpm` recomputes beat position, calls `load` with the new BPM, then `play` or `seek`. All note times use `quartersToSeconds(quarters, bpm)` with one scalar `state.bpm`.

### Count-in path

Count-in lives in `js/gpPlayerUI.js` (`countInTimer`, `clearCountIn`, `startPlayback`). It schedules clicks through `scheduleMetronomeClick` before `player.play()`. Metronome count-in settings come from `state.metro` via `countInBeatCount` in `js/gpPlayer/metronomeState.js`.

### Synthesis nodes

Guitar: `OscillatorNode` + `GainNode` → `getAnalyserDestination()` from `js/audio.js`. Drums: per-instrument nodes inside `js/drums/drumEngine.js`. Bus: `masterGain` → `DynamicsCompressorNode` → destination in `js/audio.js`.

### Features the engine ignores

The engine ignores tempo automations, repeat structure, tied-note continuation (re-triggers each `TabEvent`), grace notes, second fretted voices, explicit rests (silent gaps only when no events exist), bend pitch curves, slide pitch motion, vibrato pitch motion, fretted dynamics, instrument program, and per-track volume from the file. Palm mute and dead only change oscillator type and gain envelope in `scheduleGuitarTone`.

## Score view

### Render technology

`mountParchmentView` in `js/gpPlayer/parchmentView.js` builds DOM under `.gpp-parch-root`. It uses a scrollable `.gpp-parch-viewport`, a scaled `.gpp-parch-sheet`, and per-measure blocks. There is no SVG technique overlay today.

### DOM class names (score surface)

`gpp-parch-root`, `gpp-parch-viewport`, `gpp-parch-sheet`, `gpp-parch-system`, `gpp-parch-gutter`, `gpp-parch-gutter-staff`, `gpp-parch-gutter-row`, `gpp-parch-gutter-label`, `gpp-parch-measure`, `gpp-parch-notes-rail`, `gpp-parch-bar-num`, `gpp-parch-marker`, `gpp-parch-staff`, `gpp-parch-string`, `gpp-parch-lane-notes`, `gpp-parch-note`, `gpp-parch-drum-lane`, `gpp-parch-drum-hit`, `gpp-parch-tuning-caption`, `gpp-parch-playhead`, `gpp-parch-drum-legend`, `gpp-parch-legend-item`, `gpp-parch-sel-overlay`, `gpp-parch-handle`, `gpp-parch-note-draft`, `gpp-parch-anno-callout`, `gpp-parch-anno-span`.

Measure navigation uses `gpp-measure-nav`, `gpp-measure-nav-strip`, `gpp-measure-nav-btn`.

### Layout constants (`js/gpPlayer/parchmentView.js`)

| Constant | Value |
| --- | ---: |
| `USER_SCROLL_COOLDOWN_MS` | 2500 |
| `LONG_PRESS_MS` | 450 |
| `NOTE_PAD_START` | 9 |
| `NOTE_PAD_END` | 7 |
| `CHAR_WIDTH` | 7 |
| `COLUMN_GAP` | 4 |
| `NOMINAL_MEASURE_WIDTH` | 220 |
| `MEASURE_WIDTH_FLOOR` | 48 |
| `MAX_MEASURES_PER_SYSTEM` | 8 |
| `VIEWPORT_PAD_H` | 12 |
| `GUTTER_BASIS` | 20 |
| `AUTO_SCALE_AT_900` | 1.2 |
| `AUTO_SCALE_AT_1200` | 1.35 |
| `AUTO_SCALE_AT_1600` | 1.5 |

### What the view draws

Fret numbers or `x` for dead notes; drum lane glyphs via `drumTabGlyph`; staff lines; bar numbers; section marker text; tuning caption on the first system; playhead bar; loop selection overlay; annotation callouts; optional drum legend.

Rhythmic column width follows event `start` times, but the view does not draw stems, flags, beams, dots, rests, time signatures, repeat marks, volta brackets, or technique glyphs.

### What the view omits

Rhythm notation, rest symbols, time-signature glyphs, repeat and ending marks, technique marks, bend amounts, standard notation staff, and per-note dynamic marks.

## Control surface

| Control | Location |
| --- | --- |
| Previous measure (`‹`) | Main transport |
| Play / Pause | Main transport |
| Stop (`■`) | Main transport |
| Restart (`↺`) | Main transport |
| Next measure (`›`) | Main transport |
| Metronome click toggle (`♩`) | Main transport |
| Player menu (gear) | Main transport |
| Tempo − / BPM input / Tempo + / Reset tempo | Main transport secondary row |
| Measure readout | Main transport secondary row |
| Time readout | Main transport secondary row |
| Loop status chip | Main transport secondary row |
| Tempo ramp chip | Main transport secondary row |
| Measure strip (jump to bar) | Main score pane |
| Score scroll and playhead | Main score pane |
| Loop drag / long-press selection on score | Main score pane, but only after the learner turns on `Loop Selection` in the practice settings panel |
| View mode (Score / Analyze / Both) | Menu panel |
| Open file | Menu panel |
| Section notes | Menu panel → notes drawer |
| Split into exercises | Menu panel → import panel |
| Tracks and mixer | Menu panel → tracks drawer |
| Metronome full settings | Menu panel → metronome drawer |
| Practice settings (loop bars, rest, transpose, tuning, zoom, auto-follow) | Menu panel → practice drawer |
| Track enable / solo / view | Tracks panel |
| Metronome volume, subdivision, accents, count-in, tempo ramp | Metronome panel |
| Annotation CRUD | Notes panel |
| Exercise segment grid and import actions | Import panel (body portal) |
| Header extras (`Save as Exercise`, library actions) | Standalone player header only |
| Workbook transport extra | Workbooks embedder header |

There is no always-visible track tab strip. There is no main-screen percentage speed control (BPM input only).

## Panels

| Panel | Module | Open path | Close path |
| --- | --- | --- | --- |
| Player menu | `js/gpPlayer/playerMenu.js` | Transport menu button → `playerMenu.open()` | Backdrop, ✕, Escape, or `closeOtherOverlays` |
| Practice settings | `js/gpPlayer/settingsDrawer.js` | Menu → Settings → `settingsDrawer.open()` | Backdrop, ✕, Escape |
| Tracks and mixer | `mountTracksDrawerShell` in `js/gpPlayerUI.js` + `js/gpPlayer/trackMixer.js` | Menu → Tracks → `tracksDrawer.open()` | Backdrop, ✕ |
| Section notes | `js/gpPlayer/annotationsDrawer.js` | Menu → Notes → `annoDrawer.open()` | Backdrop, ✕, Escape |
| Metronome | `js/gpPlayer/metronomePanel.js` | Menu → Metronome or transport metro toggle → `metronomePanel.open()` | Backdrop, ✕, Escape |
| Exercise import | `js/gpPlayer/exerciseImportPanel.js` | Menu → Split → `importPanel.open()` | Backdrop, ✕, Escape |

`closeOtherOverlays` in `js/gpPlayerUI.js` closes every panel except the requested one.

### What a closed panel keeps alive

Closed panels stay mounted. `close()` toggles CSS classes only. Panel modules keep `document` key listeners and `matchMedia` listeners until `destroy()` on full player teardown. `createTempoRampController` in `js/gpPlayer/metronomeState.js` runs `onPlaybackTick` on every mix-player tick when a ramp session is active, even when the metronome drawer is closed. `syncPlaybackUi` still calls `parchment.update` and `listAnnotations` on every playback tick regardless of panel state.

## Storage and persistence

| Key | Owner | Record shape | Cloud sync |
| --- | --- | --- | --- |
| `musi.gpAnnotations` | `js/gpAnnotations.js` | `{ version: 1, byScore: { [scoreKey]: { annotations: [{ id, startBeat, endBeat, measureStart, measureEnd, title, text, createdAt, updatedAt }] } } }` | Yes (`syncProfile.js`, `recordMap.js`) |
| `musi.gpAutoFollow` | `js/gpPlayer/playerState.js` | `'true'` / `'false'` string | Yes (direct scalar) |
| `musi.gpParchmentZoom` | `js/gpPlayer/playerState.js` | zoom number string | Yes (direct scalar) |
| `musi.gpMetroPrefs` | `js/gpPlayer/metronomeState.js` | JSON per score key: `{ metro, ramp }` | Local only |
| `musi:settings` → `gpp.viewMode` | `js/gpPlayer/viewModes.js` via `js/persistence.js` | `'score'` \| `'analyze'` \| `'split'` | Follows settings bundle rules |
| `musi.exercises` | `js/exercises.js` | `{ categories: [...], items: [...] }` with per-item practice fields (`bpm`, `loopEnabled`, `measureStart`, `preferredTrackIndex`, etc.) | Yes |
| `musi.workbooks` | `js/workbookModel.js` | Workbook entries and loop flags | Yes |
| IndexedDB `musi-attachments` | `js/attachments.js` | Raw `.gp` / `.gp5` / `.musi-tab.json` bytes | Blob sync (separate from scalar keys) |

Practice settings inside exercises and workbooks persist through `onPracticeSettingsChange` → `toPersistable()` in `js/gpPlayer/playerState.js`.

## Embedders and entry points

### `mountGpPlayer` consumers

| Consumer | File | Options passed |
| --- | --- | --- |
| Standalone GP Player | `js/gpPlayer.js` → `mountCurrent` | `gpResult`, `title`, `fileName`, loop and track prefs from exercise, `preferredTrackIndex`, `initialBpm`, `initialTranspose`, `initialTuning`, `initialRetuneMode`, `exerciseScope`, `headerExtra`, `onOpenFile`, `scoreKey`, `exerciseImport` |
| Exercises viewer | `js/exercises.js` → `mountGpExercise` | `gpResult` (possibly sliced), `title`, `fileName`, `hideTitle: true`, track and loop prefs, `exerciseScope`, `onPracticeSettingsChange`, `scoreKey` |
| Workbooks player | `js/workbooks.js` | Same as exercises plus `headerExtra`, `transportExtra`, `onPlaybackEnd`, `autoPlay`, `enableHostKeyboard: false` |
| Node tests | `tests/gp-player/smoke.mjs`, `wiring.mjs`, `loop-playback.mjs`, `metronome.mjs` | Fixture-specific subsets of the above |

### Routes that reach the player

| Route | Mechanism |
| --- | --- |
| `#gpplayer` | `js/main.js` → `initGpPlayer` / `showSection('gpplayer')` |
| `#tabanalyzer` | Alias to `gpplayer` in `js/main.js` |
| Exercises tool | `js/exercises.js` mounts `mountGpPlayer` in the exercise detail pane |
| Workbooks tool | `js/workbooks.js` mounts `mountGpPlayer` in the workbook detail pane |
| Voice Recorder riff | `js/recorder.js` → `loadGpPlayerResult` → `showSection('gpplayer')` with `title`, `fileName` |
| Track to Sheet | `js/trackToSheet.js` → `loadGpPlayerResult` with `title`, `fileName` |
| Drums GP handoff | `js/drums/drumsUI.js` → `loadGpPlayerBytes` (standalone screen, not direct `mountGpPlayer`) |

`loadGpPlayerResult` and `loadGpPlayerBytes` live in `js/gpPlayer.js`. `loadGpPlayer` in `js/gpPlayerUI.js` parses bytes then calls `mountGpPlayer`.

## Offline shell

### Cache name

`service-worker.js` sets:

```javascript
const CACHE_VERSION = "v190-routine-sibling-switch-and-phone-layout";
const CACHE_NAME = `musi-${CACHE_VERSION}`;
```

Effective cache name: `musi-v190-routine-sibling-switch-and-phone-layout`.

### Missing precache entries

Verify with:

```bash
comm -23 \
  <(printf '%s\n' \
    js/gpPlayer.js js/gpPlayerUI.js js/gpMixPlayer.js js/gpExerciseScore.js \
    js/gpAnnotations.js js/gpFollowView.js js/gpPlayer/*.js \
    js/tab/guitarPro.js js/tab/gp5.js js/tab/gpPercussion.js \
    js/tab/tabModel.js js/tab/tabPlayer.js js/tab/metroClick.js \
    js/audio.js js/drums/drumEngine.js css/gpplayer.css | sort) \
  <(grep -oE '"[^"]+"' service-worker.js | tr -d '"' | sort)
```

Output today:

```
js/gpExerciseScore.js
js/gpPlayer/layoutMetrics.js
js/gpPlayer/viewModes.js
```

`css/gpplayer.css` is listed in `PRECACHE_URLS`. The three `js/` files above are not.

## Test baseline

There is no `tests/gp-player/run.mjs` yet. Run each file directly:

```bash
for f in tests/gp-player/*.mjs; do
  [[ "$f" == *domShim* ]] && continue
  node "$f"
done
```

| File | Asserts (summary) | Command |
| --- | --- | --- |
| `drum-notation.mjs` | Drum tab glyphs and lane labels | `node tests/gp-player/drum-notation.mjs` |
| `drum-parsing.mjs` | GPIF drum parse, slot assignment, mix-player drum load | `node tests/gp-player/drum-parsing.mjs` |
| `exercise-import.mjs` | Segment detection and import helpers | `node tests/gp-player/exercise-import.mjs` |
| `exercise-import-ui.mjs` | Import panel mount and segment UI | `node tests/gp-player/exercise-import-ui.mjs` |
| `exercise-slice.mjs` | Bar-range slicing for exercises | `node tests/gp-player/exercise-slice.mjs` |
| `loop-playback.mjs` | Loop reload preserves playback position | `node tests/gp-player/loop-playback.mjs` |
| `metro-click.mjs` | `scheduleMetronomeClick` scheduling | `node tests/gp-player/metro-click.mjs` |
| `metronome.mjs` | Metronome panel, count-in, transport wiring | `node tests/gp-player/metronome.mjs` |
| `smoke.mjs` | Parse rhythm, transforms, parchment, annotations, mix player | `node tests/gp-player/smoke.mjs` |
| `wiring.mjs` | `mountGpPlayer` embed options and layout metrics | `node tests/gp-player/wiring.mjs` |

All ten files pass on branch `cursor/gp-player-overhaul-plan-ddcc` (2026-08-13). `domShim.mjs` is a helper, not a runner.

## Current Problems confirmed

| # | Fault (from `spec.md`) | Code evidence | Verdict |
| --- | --- | --- | --- |
| 1 | One tempo for a whole score; tempo changes play wrong | `readGpifTempo` returns one BPM; `createGpMixPlayer` `setBpm` and `emitTick` use scalar `state.bpm` | CONFIRMED |
| 2 | Ignores repeat marks and alternate endings | `readMeasureHeader` consumes repeat bytes without storing; GPIF path has no repeat reader | CONFIRMED |
| 3 | Drops tied notes and grace notes | `buildModel` emits tied notes as events; `readGrace` skips grace bytes; `buildTimedNotes` schedules every pitched event | CONFIRMED |
| 4 | Plays only the first fretted voice | `buildGpifTrackModel` comment “First playable voice”; `buildModel` picks one voice | CONFIRMED |
| 5 | Score shows fret numbers only; no rhythm or rests | `parchmentView.js` `glyphLabel` returns fret/`x` only; no rest or stem elements | CONFIRMED |
| 6 | Score draws no technique marks | `renderMeasure` sets text on `.gpp-parch-note` only; `techniques` never rendered | CONFIRMED |
| 7 | Every note sounds the same; ignores instrument and dynamics | `scheduleGuitarTone` fixed triangle/square oscillators; no `velocity` on fretted `TabEvent` | CONFIRMED |
| 8 | Track list, loop tool, practice settings behind a menu | Track choice in `playerMenu` → tracks drawer; loop controls in `settingsDrawer`; no track tabs on main screen | CONFIRMED |
| 9 | Loop repeats with audible click | `gpMixPlayer.js` `scheduler` calls `clearVoices()` at loop boundary (hard `osc.stop()`) | CONFIRMED |
| 10 | Large file freezes screen; no progress | `gpPlayer.js` `loadFile` awaits synchronous `parseGuitarPro`; status text only, no progress ratio | CONFIRMED |
| 11 | First drum track shown under guitar view | `gpPlayerUI.js` `parchmentModels` sets `perc` to `state.gp.drumTracks?.[0]?.model` when `viewKind === 'guitar'` | CONFIRMED |
| 12 | Closed panel keeps some work active | `settingsDrawer.js` `close()` does not remove `document` listeners; `tempoRamp.onPlaybackTick` runs when ramp armed | CONFIRMED |
| 13 | Offline visit can fail (missing precache) | `comm` command above lists three missing `js/` modules | CONFIRMED |

No spec fault was `NOT REPRODUCED`. Item 3 needs one detail. The GP5 parse records the tie pitch on a separate `TabEvent`, so the parse layer keeps the tie in part. The playback still re-attacks that event, so the learner still hears a cut note. The verdict stays `CONFIRMED` for the audible fault.

## Verified facts to reuse

- Cache name: `musi-v190-routine-sibling-switch-and-phone-layout`
- Missing precache JS files: `js/gpExerciseScore.js`, `js/gpPlayer/layoutMetrics.js`, `js/gpPlayer/viewModes.js`
- Reject messages: see Parse layer table (verbatim strings from `js/tab/guitarPro.js` and `js/tab/gp5.js`)
- Scheduler constants: `LOOKAHEAD_MS` 25, `SCHEDULE_AHEAD` 0.14 in `js/gpMixPlayer.js`
- Parchment layout floor: `MEASURE_WIDTH_FLOOR` 48, `CHAR_WIDTH` 7, `NOMINAL_MEASURE_WIDTH` 220
- `musi-tab-model` export version: 2 (`serializeExerciseScore`)
- Test command: `for f in tests/gp-player/*.mjs; do [[ "$f" == *domShim* ]] && continue; node "$f"; done` (10 pass)
- Five `mountGpPlayer` embedders: standalone `gpPlayer.js`, Exercises, Workbooks, plus test harnesses; handoffs use `loadGpPlayerResult` / `loadGpPlayerBytes`
