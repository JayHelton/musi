# Phase 1 Data Model: Guitar Pro Player Overhaul

**Feature**: `002-gp-player-overhaul` | **Date**: 2026-08-13 | **Plan**: [plan.md](./plan.md)

## Summary

The team extends the existing `TabModel` and `TabEvent` shapes with optional fields.
The team does not replace those shapes with a second score type. Parsers fill the new
fields. A pure play-order layer expands repeats into bar passes. A pure timeline layer
turns those passes into seconds. The audio engine and the playhead read the same
timeline. The score layout layer reads `beats`, `rests`, and technique fields. Every
new field is optional. Readers that ignore new fields keep the same behaviour as today.

## Entity map

| Entity | Owner module | Status | Persists |
| --- | --- | --- | --- |
| `TabModel` | `js/tab/tabModel.js` | Extended | Yes (`musi-tab-model` v3) |
| `TabEvent` | `js/tab/tabModel.js` | Extended | Yes (inside `TabModel`) |
| Measure entry | `js/tab/tabModel.js` | Extended | Yes (inside `TabModel`) |
| `trackInfo` | `js/tab/tabModel.js` | Extended | Yes (inside `TabModel`) |
| `parseGuitarPro` result | `js/tab/guitarPro.js` | Extended | No (runtime parse output) |
| `PlayOrder` | `js/tab/playOrder.js` | New | No (derived) |
| `BarPass` | `js/tab/playOrder.js` | New | No (derived) |
| `Timeline` | `js/tab/scoreTimeline.js` | New | No (derived) |
| `TempoSegment` | `js/tab/scoreTimeline.js` | New | No (derived) |
| `TimedEvent` | `js/tab/scoreTimeline.js` | New | No (derived) |
| `Position` | `js/tab/scoreTimeline.js` | New | No (derived, in memory) |
| `BarLayout` | `js/gpPlayer/scoreLayout.js` | New | No (derived) |
| `Glyph` | `js/gpPlayer/scoreLayout.js` | New | No (derived) |
| `Overlay` | `js/gpPlayer/scoreLayout.js` | New | No (derived) |
| Player runtime state | `js/gpPlayer/playerState.js` | Extended | Partial (via exercise record) |
| Transport state | `js/gpMixPlayer.js`, `js/gpPlayerUI.js` | Extended | No (in memory) |
| Metronome config | `js/gpPlayer/metronomeState.js` | Existing | Yes (`musi.gpMetroPrefs`) |
| Exercise practice record | `js/exercises.js` | Extended | Yes (`musi.exercises`) |
| Section annotation | `js/gpAnnotations.js` | Unchanged | Yes (`musi.gpAnnotations`) |
| Serialized score envelope | `js/gpExerciseScore.js` | Extended | Yes (IndexedDB attachment bytes) |

### TabModel

Root parsed score for one track. Owner: `js/tab/tabModel.js`. Status: extended.
Persists inside `musi-tab-model` version 3.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `tuning` | string | Yes | Tuning name or `'Custom'`. |
| `strings` | `[{ label, note, oct, openMidi }]` | Yes | Open strings, low to high index. |
| `events` | `[TabEvent]` | Yes | Sounding notes, ordered by slot then string. |
| `slots` | number | Yes | Total time slots (weak timing proxy for ASCII). |
| `measures` | `[Measure]` | Yes | Written bar list. |
| `tempo` | number | No | Scalar BPM when known from GP. |
| `totalBeats` | number | No | Score length in quarter-note units. |
| `techniqueCounts` | `{ [tech]: number }` | No | Technique tally for analysis. |
| `warnings` | `string[]` | No | Parse warnings for this track. |
| `tempoMap` | `[{ barIndex, beat, bpm, linear }]` | No **NEW** | Tempo automations in written score order. |
| `beats` | `[Beat]` | No **NEW** | Rhythmic layer for every voice. |
| `rests` | `[Rest]` | No **NEW** | Explicit rest list for the view. |
| `trackInfo` | `TrackInfo` | No **NEW** | Mixer and instrument data for the track. |
| `voiceCount` | number | No **NEW** | Count of voices the track uses. |

**Validation and defaults for new fields**

| Field | Default when absent | Validation |
| --- | --- | --- |
| `tempoMap` | `[]` | Each entry needs finite `barIndex` ≥ 0, finite `beat` ≥ 0, finite `bpm` in 40–320, boolean `linear`. Drop invalid entries. |
| `beats` | `[]` | Each beat needs finite `measureIndex` ≥ 0, finite `voiceIndex` ≥ 0, finite `start` and `duration` ≥ 0, finite `noteValue` > 0, integer `dots` 0–2, `tuplet` null or `{ num, den }` with positive integers, boolean `rest`, array `noteIndices`. |
| `rests` | `[]` | Same shape as a beat entry except no `rest` flag and no `noteIndices`. |
| `trackInfo` | See `TrackInfo` | Normalize through defaults below. |
| `voiceCount` | `1` | Integer 1–4. Clamp out-of-range values to 1. |

### TabEvent

One played note inside `TabModel.events`. Owner: `js/tab/tabModel.js`. Status: extended.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `slot` | number | Yes | Column index in equal-slot view. |
| `stringIndex` | number | Yes | String index, low to high. |
| `fret` | number or null | No | Fret number; null for some drum hits. |
| `midi` | number or null | No | Sounding MIDI pitch. |
| `pc` | number or null | No | Pitch class 0–11. |
| `techniques` | `string[]` | No | Technique id list. |
| `dead` | boolean | No | Dead or muted note flag. |
| `start` | number | No | Absolute position in quarter-note units. |
| `duration` | number | No | Length in quarter-note units. |
| `voiceIndex` | number | No **NEW** | Voice index; default 0. |
| `beatIndex` | number | No **NEW** | Index into `model.beats`. |
| `velocity` | number | No **NEW** | Dynamic level 0 to 1. |
| `tie` | boolean | No **NEW** | Event continues the previous note on the same string. |
| `grace` | boolean | No **NEW** | True when this event is a grace note before the next event. |
| `graceTransition` | string or null | No **NEW** | Grace transition name, for example `'slide'` or `'bend'`. |
| `bend` | `{ points: [{ offset, cents }] }` or null | No **NEW** | Bend curve; `offset` runs 0 to 1. |
| `slideKind` | slide literal or null | No **NEW** | Slide type for audio and layout. |

A grace note is its own `TabEvent` with `grace` true. The event carries its own `fret` and
`midi`. The timeline places it before the main note of the beat.

The `slideKind` literal set is `'shift'`, `'legato'`, `'intoFromBelow'`, `'intoFromAbove'`,
`'outDown'`, and `'outUp'`.

**Validation and defaults for new fields**

| Field | Default when absent | Validation |
| --- | --- | --- |
| `voiceIndex` | `0` | Integer ≥ 0. Clamp to 0 when invalid. |
| `beatIndex` | undefined | When present, integer ≥ 0 and less than `beats.length`. |
| `velocity` | `0.78` | Clamp to 0–1. |
| `tie` | `false` | Coerce to boolean. |
| `grace` | `false` | Coerce to boolean. A grace event needs a finite `midi`. |
| `graceTransition` | `null` | String or null. |
| `bend` | `null` | When present, `points` array with 1–16 entries; each `offset` in 0–1, finite `cents`. |
| `slideKind` | `null` | One of the six literals or null. |

### Measure entry

One bar inside `TabModel.measures`. Owner: `js/tab/tabModel.js`. Status: extended.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `startSlot` | number | Yes | Start slot index. |
| `endSlot` | number | Yes | End slot index (exclusive). |
| `startBeat` | number | No | Start in quarter-note units. |
| `endBeat` | number | No | End in quarter-note units. |
| `marker` | string | No | Section marker text. |
| `timeSig` | `[number, number]` | No | Written time signature, for example `[4, 4]`. |
| `repeat` | `{ open, closeCount, endings }` or null | No **NEW** | Repeat and alternate-ending marks. |

**`repeat` subfields**

| Field | Type | Default | Validation |
| --- | --- | --- | --- |
| `open` | boolean | `false` | Repeat-open barline present. |
| `closeCount` | number or null | `null` | Total plays of the section; null means no close mark. A value of 2 plays the section two times. |
| `endings` | `number[]` or null | `null` | Alternate ending numbers for this bar; null when none. |

### Beat entry (`model.beats[]`)

Rhythmic event in one voice. Owner: `js/tab/tabModel.js`. Status: new field on `TabModel`.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `measureIndex` | number | Yes | Written bar index. |
| `voiceIndex` | number | Yes | Voice index in the bar. |
| `start` | number | Yes | Start in quarter-note units from the score start, as `TabEvent.start` counts. |
| `duration` | number | Yes | Length in quarter-note units after dots and tuplet. |
| `noteValue` | number | Yes | Written value as a denominator: 1, 2, 4, 8, 16, 32, or 64. |
| `dots` | number | Yes | Dot count 0, 1, or 2. |
| `tuplet` | `{ num, den }` or null | No | Tuplet ratio or null. |
| `rest` | boolean | Yes | True when this beat is a rest. |
| `techniques` | `string[]` | No | Beat-level techniques. |
| `noteIndices` | `number[]` | No | Indexes into `model.events`. |

Default when `beats` is absent: derive weak rhythm from `events` as today. Validation
matches the `beats` row in the `TabModel` table.

### Rest entry (`model.rests[]`)

Explicit rest for the score view. Owner: `js/tab/tabModel.js`. Status: new field.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `measureIndex` | number | Yes | Written bar index. |
| `voiceIndex` | number | Yes | Voice index in the bar. |
| `start` | number | Yes | Start in quarter-note units from the score start. |
| `duration` | number | Yes | Length in quarter-note units. |
| `noteValue` | number | Yes | Written value as a denominator: 1, 2, 4, 8, 16, 32, or 64. |
| `dots` | number | Yes | Dot count. |
| `tuplet` | `{ num, den }` or null | No | Tuplet ratio or null. |

Default when absent: `[]`. The layout pass may also read rests from `beats` where
`rest` is true.

### TrackInfo (`model.trackInfo`)

Mixer and instrument data for one track. Owner: `js/tab/tabModel.js`. Status: new field.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `program` | number | No | MIDI program number 0–127. |
| `midiChannel` | number | No | MIDI channel 0–15. |
| `isPercussion` | boolean | No | True for a drum track. |
| `volume` | number | No | File volume 0 to 1. |
| `pan` | number | No | File pan −1 to 1. |
| `capo` | number | No | Capo fret count. |

**Defaults when `trackInfo` is absent**

| Field | Default | Validation |
| --- | --- | --- |
| `program` | `0` | Integer 0–127. |
| `midiChannel` | `0` | Integer 0–15. |
| `isPercussion` | `false` | Coerce to boolean. |
| `volume` | `1` | Clamp 0–1. |
| `pan` | `0` | Clamp −1 to 1. |
| `capo` | `0` | Integer 0–12. |

### parseGuitarPro result

Runtime output of `parseGuitarPro` in `js/tab/guitarPro.js`. Status: extended.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `format` | string | Yes | File format id, for example `'gp7'` or `'gp5'`. |
| `tracks` | `Track[]` | Yes | Fretted track list. |
| `drumTracks` | `DrumTrack[]` | Yes | Drum track list. |
| `parts` | `Part[]` | Yes | Full part list with analyzability flags. |
| `defaultIndex` | number | Yes | Default fretted track index. |
| `model` | `TabModel` | No | Default track model (legacy top-level copy). |
| `ascii` | string | No | ASCII tab for the default track. |
| `meta` | object | Yes | File metadata summary. |
| `tempo` | number | No | File default tempo BPM. |
| `warnings` | `string[]` | No **NEW** | Top-level parse warnings. |
| `tracks[].program` | number | No **NEW** | Copy of `trackInfo.program` for the track list UI. |
| `tracks[].volume` | number | No **NEW** | Copy of `trackInfo.volume`. |
| `tracks[].pan` | number | No **NEW** | Copy of `trackInfo.pan`. |

Default for `warnings`: `[]`. Track mixer copies default from `trackInfo` when the
parser omits them.

### PlayOrder

Ordered bar passes after repeat expansion. Owner: `js/tab/playOrder.js`. Status: new.
Derived at load time. Does not persist.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `passes` | `BarPass[]` | Yes | Sounding bar order. |
| `barOrder` | `number[]` | Yes | The written bar index of every pass, in sounding order. |
| `flattened` | boolean | Yes | True when a nested repeat was flattened. |
| `warnings` | `string[]` | Yes | Play-order warnings, for example nested repeat. |

Defaults: `passes` from `measures`, `flattened` `false`, `warnings` `[]`. `barOrder` holds
one entry for each entry in `passes`. A test compares `barOrder` against the written bar
order for SC-002.

### BarPass

One sounding visit to a written bar. Owner: `js/tab/playOrder.js`. Status: new.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `index` | number | Yes | Position in the `passes` array. |
| `barIndex` | number | Yes | Written bar index. |
| `passIndex` | number | Yes | Repeat pass index for this bar. |
| `endingNumber` | number or null | No | Alternate ending taken, or null. |
| `startQuarter` | number | Yes | Start in play-order quarter units. |
| `endQuarter` | number | Yes | End in play-order quarter units. |
| `startSec` | number | Yes | Start in absolute seconds at rate 1. |
| `endSec` | number | Yes | End in absolute seconds at rate 1. |

`startQuarter` and `endQuarter` accumulate across the full play order. Written bar
numbers stay stable. Loop ranges use written `barIndex`, not pass `index`.

### Timeline

Absolute-time playback model. Owner: `js/tab/scoreTimeline.js`. Status: new. Derived.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `passes` | `BarPass[]` | Yes | Same pass list as `PlayOrder`. |
| `events` | `TimedEvent[]` | Yes | Sounding events in time order. |
| `tempoSegments` | `TempoSegment[]` | Yes | Piecewise tempo map in seconds. |
| `totalSec` | number | Yes | Total duration at rate 1. |
| `rate` | number | Yes | Practice speed factor (1 = score tempo). |
| `warnings` | `string[]` | Yes | Timeline warnings merged from parse and play order. |

Default `rate`: `1`. `totalSec` equals the end of the last tempo segment.

### TempoSegment

One constant-tempo span in the play order. Owner: `js/tab/scoreTimeline.js`. Status: new.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `startSec` | number | Yes | Segment start in seconds at rate 1. |
| `startQuarter` | number | Yes | Matching play-order quarter position. |
| `bpm` | number | Yes | Tempo for this segment. |
| `secPerQuarter` | number | Yes | Seconds per quarter at this BPM (`60 / bpm`). |

The builder applies each `tempoMap` entry on every pass of its written bar.

### TimedEvent

One schedulable sounding event. Owner: `js/tab/scoreTimeline.js`. Status: new.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `startSec` | number | Yes | Start in seconds at rate 1. |
| `durSec` | number | Yes | Duration in seconds at rate 1. |
| `kind` | `'guitar'` or `'drum'` | Yes | Event family. |
| `trackIndex` | number | Yes | Track index in the gp result, inside the `kind` list. |
| `voiceIndex` | number | No | Voice that owns the event. Default 0. |
| `midi` | number | No | Pitch for guitar; drum map index for drum. |
| `velocity` | number | No | Dynamic 0 to 1. |
| `techniques` | `string[]` | No | Technique id list. |
| `bend` | Bend object or null | No | Bend curve from `TabEvent`. |
| `slideKind` | string or null | No | Slide type from `TabEvent`. |
| `passIndex` | number | Yes | Pass index when the event sounds. |
| `barIndex` | number | Yes | Written bar index. |
| `beatInBar` | number | Yes | Beat position within the written bar. |

Tied notes produce one `TimedEvent` with the combined `durSec`. Grace notes produce
separate events before the main note. Rest beats produce no `TimedEvent`.

### Position

Musical and clock position at one instant. Owner: `js/tab/scoreTimeline.js`. Status: new.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `sec` | number | Yes | Absolute seconds at current rate. |
| `quarter` | number | Yes | Play-order quarter position. |
| `passIndex` | number | Yes | Current pass index. |
| `barIndex` | number | Yes | Written bar index. |
| `beatInBar` | number | Yes | Beat within the written bar. |
| `beatInScore` | number | Yes | Absolute quarter position in written score space. |
| `eventIndex` | number or null | No | Index into `Timeline.events` when the position sits on an event. |

The timeline module maps `sec` ↔ `Position` and applies `rate` for practice speed.

### BarLayout

Layout output for one written bar. Owner: `js/gpPlayer/scoreLayout.js`. Status: new.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `barIndex` | number | Yes | Written bar index. |
| `widthUnits` | number | Yes | Horizontal width in layout units. |
| `fontPx` | number | Yes | Computed fret font size in CSS pixels. |
| `lanes` | `string[]` | Yes | Horizontal bands drawn for this bar. |
| `glyphs` | `Glyph[]` | Yes | Positioned drawable primitives. |
| `overlays` | `Overlay[]` | Yes | Curved connectors between glyphs. |
| `warnings` | `string[]` | No | Layout warnings for this bar. |

Lane names: `notationStaff`, `techniqueAbove`, `tabStaff`, `rhythm`, `techniqueBelow`.

### Glyph

One drawable primitive in a bar layout. Owner: `js/gpPlayer/scoreLayout.js`. Status: new.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `kind` | string | Yes | Glyph type (see list below). |
| `lane` | string | Yes | Lane name from `BarLayout.lanes`. |
| `x` | number | Yes | Left edge in layout units. |
| `y` | number | Yes | Top edge in layout units. |
| `w` | number | Yes | Width in layout units. |
| `h` | number | Yes | Height in layout units. |
| `text` | string | No | Text label, for example fret or bend amount. |
| `aria` | string | No | Accessible name for screen readers. |

Allowed `kind` values: `fret`, `deadNote`, `drumHit`, `rest`, `stem`, `flag`, `beam`,
`dot`, `tupletBracket`, `timeSig`, `barNumber`, `marker`, `repeatOpen`, `repeatClose`,
`volta`, `tuning`, `technique`, `bendValue`.

### Overlay

Curved mark between two glyphs. Owner: `js/gpPlayer/scoreLayout.js`. Status: new.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `kind` | string | Yes | `bend`, `slur`, `slide`, or `tie`. |
| `path` | string | No | SVG path data when precomputed. |
| `fromGlyph` | number | Yes | Index into `glyphs`. |
| `toGlyph` | number | Yes | Index into `glyphs`. |

### Player runtime state

In-memory practice state. Owner: `js/gpPlayer/playerState.js`. Status: extended.
Partial persist through the exercise practice record.

Existing fields (`gp`, `trackIndex`, `viewKind`, `loopStart`, `loopEnd`, `bpm`,
`transpose`, `tuning`, `metro`, `tempoRamp`, and others) stay as today. New runtime
fields:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `trackVolumes` | `number[]` | No **NEW** | Per-track volume multipliers 0–1. |
| `showStandardNotation` | boolean | No **NEW** | Optional standard notation staff. |

Defaults: `trackVolumes` matches enabled track count at `1` each;
`showStandardNotation` `false`.

### Transport state

Playback mode for the audio engine and UI. Owners: `js/gpMixPlayer.js`,
`js/gpPlayerUI.js`. Status: extended. Lives in memory only.

| State | Meaning |
| --- | --- |
| `idle` | No playback, no count-in, audio cursor at rest position. |
| `countIn` | Count-in clicks run; main score audio has not started. |
| `playing` | Audio scheduler runs; playhead advances. |
| `paused` | Position saved; no new score notes schedule. |
| `loopRest` | Loop rest countdown; playhead holds at loop start. |
| `blocked` | `AudioContext` cannot start; UI shows cause and one next step. |

## Derived data

This section shows how written score data becomes a `PlayOrder`, then a `Timeline`,
then the `TimedEvent` list.

### Example score

The example has eight written bars (indices 0–7). Every bar is 4/4 (4 quarter notes).

| Written bar | Content |
| --- | --- |
| 0 | Intro |
| 1 | Repeat open |
| 2 | Body |
| 3 | Repeat close, `closeCount` 2, endings on bars 4 and 5 |
| 4 | Alternate ending 1 |
| 5 | Alternate ending 2 |
| 6 | Tempo change to 90 BPM at bar start |
| 7 | Empty trailing bar (no notes) |

`tempoMap`:

```text
[{ barIndex: 0, beat: 0, bpm: 120, linear: false },
 { barIndex: 6, beat: 0, bpm: 90, linear: false }]
```

### Step 1 — PlayOrder passes

`playOrder.js` expands repeats and endings. Sounding order:

| `index` | `barIndex` | `passIndex` | `endingNumber` | `startQuarter` | `endQuarter` |
| --- | ---: | ---: | --- | ---: | ---: |
| 0 | 0 | 0 | null | 0 | 4 |
| 1 | 1 | 0 | null | 4 | 8 |
| 2 | 2 | 0 | null | 8 | 12 |
| 3 | 3 | 0 | null | 12 | 16 |
| 4 | 1 | 1 | null | 16 | 20 |
| 5 | 2 | 1 | null | 20 | 24 |
| 6 | 3 | 1 | null | 24 | 28 |
| 7 | 4 | 1 | 1 | 28 | 32 |
| 8 | 1 | 2 | null | 32 | 36 |
| 9 | 2 | 2 | null | 36 | 40 |
| 10 | 3 | 2 | null | 40 | 44 |
| 11 | 5 | 2 | 2 | 44 | 48 |
| 12 | 6 | 0 | null | 48 | 52 |
| 13 | 7 | 0 | null | 52 | 56 |

Total play-order length: 56 quarter notes. Written length is 32 quarters. The repeat
and the two endings add 24 quarters.

### Step 2 — Tempo segments and seconds

At rate 1 the timeline uses these segments:

| Segment | `startQuarter` | `bpm` | `secPerQuarter` | Quarter span | Segment seconds |
| --- | ---: | ---: | ---: | ---: | ---: |
| A | 0 | 120 | 0.500 | 48 | 24.000 |
| B | 48 | 90 | 0.667 | 8 | 5.333 |

A segment runs from one tempo entry to the next tempo entry. The score holds two tempo
entries, so the timeline holds two segments.

Arithmetic:

- Segment A: `48 × (60 / 120) = 48 × 0.5 = 24.000` s.
- Segment B: `8 × (60 / 90) = 8 × 0.6667 = 5.333` s.
- `totalSec = 24.000 + 5.333 = 29.333` s.

Per-pass seconds at rate 1 (120 BPM until bar 6 pass):

| Pass `index` | `barIndex` | `startSec` | `endSec` | Duration (s) |
| ---: | ---: | ---: | ---: | ---: |
| 0 | 0 | 0.000 | 2.000 | 2.000 |
| 1 | 1 | 2.000 | 4.000 | 2.000 |
| 2 | 2 | 4.000 | 6.000 | 2.000 |
| 3 | 3 | 6.000 | 8.000 | 2.000 |
| 4 | 1 | 8.000 | 10.000 | 2.000 |
| 5 | 2 | 10.000 | 12.000 | 2.000 |
| 6 | 3 | 12.000 | 14.000 | 2.000 |
| 7 | 4 | 14.000 | 16.000 | 2.000 |
| 8 | 1 | 16.000 | 18.000 | 2.000 |
| 9 | 2 | 18.000 | 20.000 | 2.000 |
| 10 | 3 | 20.000 | 22.000 | 2.000 |
| 11 | 5 | 22.000 | 24.000 | 2.000 |
| 12 | 6 | 24.000 | 26.667 | 2.667 |
| 13 | 7 | 26.667 | 29.333 | 2.667 |

Bar 6 starts at 90 BPM on every pass. This example reaches bar 6 only once, at
`startQuarter` 48.

### Step 3 — TimedEvent list

The timeline builder walks `beats` and `events` on each pass. It skips tied tails,
rest beats, and empty bars without sounding data. It merges tied notes into one event.
It places grace notes before the main note. Each `TimedEvent` carries `passIndex`,
`barIndex`, and `beatInBar` from the pass that owns the sound.

At rate 0.7 the engine multiplies every `startSec` and `durSec` by `1 / 0.7`. The
bar and beat readout stay in written score space (FR-010, FR-015, FR-016).

## State transitions

Transport state machine. Owner: `js/gpPlayerUI.js` and `js/gpMixPlayer.js`.

| From | To | Trigger |
| --- | --- | --- |
| `idle` | `countIn` | Learner presses Play and count-in is on. |
| `idle` | `playing` | Learner presses Play and count-in is off. |
| `idle` | `blocked` | `ensureAudio()` or `resume()` fails. |
| `countIn` | `playing` | Count-in timer completes. |
| `countIn` | `idle` | Learner presses Stop or Pause during count-in. |
| `countIn` | `countIn` | Learner seeks to another bar during count-in (count-in restarts). |
| `countIn` | `blocked` | Audio context cannot start during count-in. |
| `playing` | `paused` | Learner presses Pause. |
| `playing` | `idle` | Learner presses Stop. |
| `playing` | `loopRest` | Loop end with `loopRestSec` > 0. |
| `playing` | `blocked` | Audio context suspends (for example background tab policy). |
| `paused` | `playing` | Learner presses Play (resume). |
| `paused` | `idle` | Learner presses Stop. |
| `loopRest` | `playing` | Rest timer expires; loop pass restarts. |
| `loopRest` | `idle` | Learner presses Stop. |
| `loopRest` | `paused` | Learner presses Pause during rest. |
| `blocked` | `idle` | Learner acknowledges the message or audio becomes available. |
| any | `paused` | `visibilitychange` suspends audio (FR-011). |

Stop and Pause ramp every voice to zero across about 8 ms (FR-017). A hard node stop
is not allowed during normal transport.

## Persistence and migration

### Storage keys

| Key | Owner | Content |
| --- | --- | --- |
| `musi-tab-model` (attachment JSON) | `js/gpExerciseScore.js` | Serialized multi-track score; version 3. |
| `musi.exercises` | `js/exercises.js` | Exercise library and practice settings per item. |
| `musi.gpMetroPrefs` | `js/gpPlayer/metronomeState.js` | Metronome and tempo-ramp prefs per score key. |
| `musi.gpAnnotations` | `js/gpAnnotations.js` | Section notes keyed by score id. |
| `musi.gpAutoFollow` | `js/gpPlayer/playerState.js` | Global auto-scroll toggle. |
| `musi.gpParchmentZoom` | `js/gpPlayer/playerState.js` | Global parchment zoom level. |
| IndexedDB `musi-attachments` | attachment store | Raw `.gp` / `.gp5` bytes and sliced JSON attachments. |

### Version 3 change

`serializeExerciseScore` writes `version: 3`. Version 3 adds the new `TabModel` fields
inside each track `model`: `tempoMap`, `beats`, `rests`, `trackInfo`, `voiceCount`,
and the new `TabEvent` and `measures[].repeat` fields when present.

`gpResultFromTabModelJson` reads version 2 and version 3.

### Version 2 read rule

When `raw.version === 2`, the reader builds a `gpResult` exactly as today. It does
not require new fields. Missing new fields stay absent. Playback and layout use legacy
paths until the score is re-exported from a GP file.

**Version 2 keeps:** `tempo`, `tracks`, `drumTracks`, `warnings`, `source` provenance,
and every existing `TabModel` field (`tuning`, `strings`, `events`, `measures`,
`tempo`, `totalBeats`, and others).

**Version 2 loses on load (until re-parse):** `tempoMap`, `beats`, `rests`,
`trackInfo`, `voiceCount`, `repeat` marks, ties, grace notes, bend points, file
dynamics, and second-voice rhythm. The player falls back to scalar tempo and first-voice
timing as today.

### Exercise practice record additions

Per exercise item in `musi.exercises`, optional fields:

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `trackVolumes` | `number[]` | absent | Per-track volume multipliers 0–1. |
| `showStandardNotation` | boolean | absent (`false`) | Show standard notation staff. |

`musi.gpMetroPrefs` gains no new keys (FR-064).

## Validation rules

The implementation must enforce these rules. Each rule maps to a functional requirement.

1. **Tempo range** — Every `tempoMap` entry and every practice BPM must clamp to
   40–320 (`GPP_MIN_BPM` / `GPP_MAX_BPM`). Invalid values fall back to the file tempo
   or 120. Maps to FR-001, FR-037.

2. **Tempo practice percentage** — Speed percentage must clamp to 25–300
   (`GPP_MIN_TEMPO_PCT` / `GPP_MAX_TEMPO_PCT`). Maps to FR-037, FR-016.

3. **Loop range order** — `setLoopRange` must accept `startBeat` greater than
   `endBeat` (backwards drag). The normalizer swaps to a valid span with `minSpan` 1.
   Maps to the spec edge case for backwards loop drag.

4. **Single-bar score** — A score with one bar must allow loop, count-in, and playback.
   `measureCount` must be at least 1. Maps to the spec edge case for one bar.

5. **Empty trailing bar** — A bar with no `events` still consumes its written
   `endBeat − startBeat` quarters in the timeline. Playback must not stop early.
   Maps to the spec edge case for an empty trailing bar and FR-005.

6. **Track with no notes** — A track with zero pitched events still appears in the
   track tab strip. The score draws an empty staff. Maps to the spec edge case and
   FR-033.

7. **Seven-string or eight-string tuning** — `strings.length` may be 7 or 8. The
   layout must draw every string row. `retuneModel` must reject mismatched string
   counts and keep the original tuning with a warning. Maps to the spec edge case.

8. **13/16 bar** — `timeSig` `[13, 16]` must produce `13 × (4/16) = 3.25` written
   quarters for the bar. The layout must space that bar with the correct width.
   Maps to the spec edge case and FR-023.

9. **Twenty or more tracks** — The parser must accept up to 24 tracks. The track tab
   strip must scroll. Maps to the spec edge case and FR-033.

10. **Nested repeat** — `playOrder.js` must flatten a nested repeat into one pass,
    set `flattened` true, and add a warning string. Maps to FR-003.

11. **Tied notes** — The timeline must emit one `TimedEvent` per tie chain. Maps to
    FR-004.

12. **Rest length** — Rest beats advance time with no `TimedEvent`. Maps to FR-005.

13. **Tuplets and dots** — Beat `duration` must match `noteValueToQuarters` with
    dots and tuplet. Maps to FR-006.

14. **Grace notes** — Grace notes must sound before the main note in the event list.
    Maps to FR-007.

15. **All voices** — Every `voiceIndex` in `beats` must schedule on playback.
    Maps to FR-008.

16. **Loop inside a repeat** — Loop range uses written bar indices. The player must
    not jump to the repeat target when the loop sits inside a repeated section.
    Maps to the spec edge case.

17. **Velocity** — `velocity` must clamp to 0–1 and drive peak gain. Maps to FR-048.

18. **Output headroom** — Mixed output must stay below full scale. Maps to FR-051.

19. **New score reset** — `resetForNewScore()` must clear loop, speed, transpose,
    tuning, and selected track. Maps to FR-059.

20. **Audio blocked message** — When playback cannot start, the UI must state the
    cause and one next step. Maps to FR-052.

## Compatibility

| Consumer | Why the change does not break it |
| --- | --- |
| `js/gpExerciseScore.js` | New fields are optional. Version 2 reader keeps today’s path. `sliceModelByBeats` copies unknown fields through spread. |
| `js/exercises.js` | Practice record additions are optional. Existing items omit them. |
| `js/workbooks.js` | Mount options stay the same. `buildExerciseGpResult` still slices by bar range in written space. |
| `js/exercisesBulk.js` | Bulk import reads `gpResult` top-level shape; new fields are additive. |
| `js/gpPlayer.js` | `mountGpPlayer` handle and options stay back-compatible per plan D20. |
| `js/gpPlayerUI.js` | Reads timeline when present; falls back when new fields are absent. |
| `js/gpPlayer/parchmentView.js` | DOM staff stays. Layout reads new arrays only when present. |
| `js/gpPlayer/playerState.js` | Core state fields unchanged. New fields default safely. |
| `js/tab/tabPlayer.js` | `buildTimedNotes` keeps today’s path when `beats` is absent. |
| `js/gpMixPlayer.js` | Scheduler switches to timeline when built; scalar BPM path remains for legacy models. |
| `js/tab/tabAnalyzer.js` | Ignores new fields unless analysis tasks opt in. |
| `js/tab/tabParser.js` | ASCII path does not emit new fields. |
| `js/drums/gpDrumImport.js` | Drum models gain optional fields; hit scheduling still reads `events`. |
| `js/trackToSheet/toTabModel.js` | Hand-off models stay valid without new fields. |
| `js/recorder.js` | Does not read GP parse extensions. |
| `js/gpAnnotations.js` | Section notes use beat and bar ranges in written space; unchanged. |
| `cli/src/analyzers/tab.js` | CLI parse output stays additive; CLI has no playback. |
