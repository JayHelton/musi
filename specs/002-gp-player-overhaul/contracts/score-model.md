# Contract: Score model

**Feature**: `002-gp-player-overhaul` | **Date**: 2026-08-13 | **Plan**: [../plan.md](../plan.md)

## Purpose

This contract fixes the parse output shape from `js/tab/guitarPro.js` and the shared
`TabModel` in `js/tab/tabModel.js`. The player overhaul needs tempo automations, repeat
marks, alternate endings, multiple voices, ties, grace notes, dynamics, bend points, and
instrument metadata. Every new field is optional. Existing consumers keep working when they
ignore the new data.

## Interface

### `js/tab/guitarPro.js`

```javascript
parseGuitarPro(input) -> Promise<GpParseResult>
// input: ArrayBuffer or Uint8Array
// GpParseResult: the current result shape plus the additions below
```

Current top-level fields (unchanged names):

```text
format: string
tracks: GpTrack[]
drumTracks: GpDrumTrack[]
parts: GpPart[]
defaultIndex: number
model: TabModel | null          // default fretted track model
ascii: string
meta: object
tempo: number                   // when the file carries a global tempo
```

Additions on `GpParseResult`:

```text
warnings: string[]              // top-level parse warnings (also on each TabModel)
```

Additions on each fretted `tracks[]` entry:

```text
program: number                 // MIDI program number
volume: number                  // 0..1 nominal track volume
pan: number                     // -1..1 stereo pan
```

Each `tracks[].model` and each `drumTracks[].model` is a `TabModel`. Each `GpPart` entry
keeps its current fields.

### `TabModel` (`js/tab/tabModel.js`)

Current fields stay. Add these optional fields:

```javascript
tempoMap: [{
  barIndex: number,             // measure index where the tempo starts
  beat: number,                 // beat within that bar (quarter-note units from bar start)
  bpm: number,                  // new tempo in BPM (quarter note)
  linear: boolean,              // true when the change is linear; false when it is instant
}]
beats: [{
  measureIndex: number,
  voiceIndex: number,
  start: number,                // quarter-note offset from score start
  duration: number,             // quarter-note length
  noteValue: number,            // denominator: 1, 2, 4, 8, 16, 32, or 64
  dots: number,                 // 0, 1, or 2
  tuplet: { num: number, den: number } | null,
  rest: boolean,
  techniques: string[],         // beat-level techniques
  noteIndices: number[],        // indexes into events[] for notes on this beat
}]
rests: [{
  measureIndex: number,
  voiceIndex: number,
  start: number,                // quarter-note offset from score start
  duration: number,
  noteValue: number,
  dots: number,
  tuplet: { num: number, den: number } | null,
}]
trackInfo: {
  program: number,
  midiChannel: number,
  isPercussion: boolean,
  volume: number,
  pan: number,
  capo: number,
}
voiceCount: number              // max voice count across all measures
```

Existing fields (`tuning`, `strings`, `events`, `slots`, `measures`, `tempo`,
`totalBeats`, `techniqueCounts`, `warnings`) stay as they are today.

### `TabEvent`

Current fields stay. Add these optional fields:

```javascript
voiceIndex: number
beatIndex: number               // index into model.beats[]
velocity: number                // 0..1, the same scale as the percussion velocity today
tie: boolean                    // true when the event continues the previous note on the string
grace: boolean                  // true for a grace note; the event carries its own fret and midi
graceTransition: string | null  // grace transition name, for example 'slide' or 'bend'
bend: { points: [{ offset: number, cents: number }] } | null
slideKind: 'shift' | 'legato' | 'intoFromBelow' | 'intoFromAbove' | 'outDown' | 'outUp' | null
```

### `measures[]` entry

Add this optional field:

```javascript
repeat: {
  open: boolean,                  // repeat open barline at this measure
  closeCount: number | null,      // total plays of the section; null means no close mark
  endings: number[] | null,       // alternate ending numbers on this measure; null when none
} | null
```

A `closeCount` of 2 means the player plays the section two times in total. A bar with no
repeat mark keeps `repeat` absent or null.

### `js/tab/tabModel.js` helpers

```javascript
cloneModel(model) -> TabModel
transposeModel(model, semitones) -> TabModel
retuneModel(model, tuning, { preservePitch }) -> TabModel
transformModel(model, { transpose, tuning, preservePitch }) -> TabModel
sliceModelByBeats(model, { startBeat, endBeat, label }) -> TabModel
sliceGuitarModel(...args) -> TabModel   // alias of sliceModelByBeats
```

`cloneModel`, `sliceGuitarModel` / `sliceModelByBeats`, and `transformModel` (through
`cloneModel`) must copy every new field when it is present. A missing field stays absent.

### `js/gpExerciseScore.js` serialization

```javascript
serializeExerciseScore(gpResult, { sourceFileName, measureStart, measureEnd }) -> string
gpResultFromTabModelJson(raw, { fallbackName }) -> gpResult
```

Serialized form:

```text
format: 'musi-tab-model'
version: 3                      // was 2; reader keeps version 2 support
tempo: number
tracks: [{ index, name, tuning, model }]
drumTracks: [{ index, name, model }]
warnings: string[]
source?: { fileName, measureStart, measureEnd }
```

`gpResultFromTabModelJson` reads `version: 2` and `version: 3`. A version 2 record loads
with the same behaviour as today.

### Reject messages (verbatim, FR-058)

The parser throws these `Error` messages. Do not change the text.

| Format | Message |
| --- | --- |
| `.gpx` | `This is a Guitar Pro 6 (.gpx) file. Open it in Guitar Pro and re-export as “.gp” (Guitar Pro 7/8) or “.gp5” to analyze it.` |
| `.gp3` or `.gp4` | `` This is an older binary Guitar Pro file (${fmt}). Open it in Guitar Pro and re-save as “.gp” (7/8) or “.gp5” to analyze it. `` The template holds `${fmt}`, which the parser fills with `gp3` or `gp4`. |
| Unknown | `Unrecognized file — expected a Guitar Pro “.gp” (7/8) or “.gp5” file.` |

## Guarantees

1. Every new field on `GpParseResult`, `TabModel`, `TabEvent`, and `measures[]` is
   optional. Callers that read only the old fields keep working. This covers
   `js/exercises.js`, `js/workbooks.js`, `js/exercisesBulk.js`, `js/drums/gpDrumImport.js`,
   `js/trackToSheet/toTabModel.js`, and `cli/src/analyzers/tab.js`. (FR-063)
2. `cloneModel`, `sliceGuitarModel`, and `transformModel` carry every new field through a
   copy or slice. (data-model rule)
3. `serializeExerciseScore` writes `musi-tab-model` version 3. `gpResultFromTabModelJson`
   reads version 2 and version 3. (plan compatibility rule 4)
4. The reject messages for `.gpx`, `.gp3`, `.gp4`, and an unknown file stay verbatim.
   (FR-058)
5. `parseGuitarPro` still accepts `.gp` and `.gp5` files. (FR-057)
6. The parse layer stays free of DOM calls so the CLI and the module worker share it.
   (constitution II)

## Errors

| Case | Required behaviour |
| --- | --- |
| Input is not `ArrayBuffer` or `Uint8Array` | Throw `guitarPro: expected ArrayBuffer or Uint8Array`. |
| File is `.gpx` | Throw the verbatim `.gpx` message from the table above. |
| File is `.gp3` or `.gp4` | Throw the verbatim older-format message from the table above. |
| File is not `.gp`, `.gp5`, or a known older format | Throw the verbatim unknown-file message from the table above. |
| `.gp` archive has no GPIF entry | Throw `guitarPro: no score.gpif inside the .gp archive`. |
| File has no fretted or drum part | Throw `This Guitar Pro file has no fretted (tab) or drum part to import.` |
| `gpResultFromTabModelJson` gets unusable JSON | Throw `This exercise snippet is missing tab data.` |
| Tuning change has a string-count mismatch | Keep the original tuning. Push a warning string onto `model.warnings`. |

## Compatibility

| Consumer | Rule |
| --- | --- |
| `js/exercises.js`, `js/workbooks.js` | Read `tracks`, `drumTracks`, and `tempo` as today. Ignore new fields until the player uses them. |
| `js/exercisesBulk.js` | Import and export `musi-tab-model` JSON. Version 2 files must still load. |
| `js/drums/gpDrumImport.js` | Read drum models from `drumTracks`. Ignore fretted-only additions. |
| `js/trackToSheet/toTabModel.js` | Build a minimal `gpResult`. New fields may be absent. |
| `cli/src/analyzers/tab.js` | Keep its CLI output shape. It may gain richer internal data through the shared parse layer. |
| `js/tab/tabPlayer.js` | `buildTimedNotes` keeps working on models without `beats[]` or `tempoMap`. |

## Verification

`tests/gp-player/parse.mjs` proves this contract.

1. A fixture `.gp` and `.gp5` file parse without error and return `tracks` and
   `drumTracks`.
2. The reject messages for `.gpx`, `.gp3`, `.gp4`, and a garbage buffer match the
   verbatim strings.
3. A model with `tempoMap`, `beats`, `repeat`, and extended `TabEvent` fields round-trips
   through `cloneModel` and `sliceGuitarModel`.
4. `serializeExerciseScore` writes `version: 3`. `gpResultFromTabModelJson` reads a version
   2 fixture with no behaviour change.
5. `node tests/gp-player/run.mjs` runs the parse suite as part of the feature gate.
