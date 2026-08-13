# Contract: Score timeline

**Feature**: `002-gp-player-overhaul` | **Date**: 2026-08-13 | **Plan**: [../plan.md](../plan.md)

## Purpose

This contract fixes the pure timing layer between the parsed score and the audio engine. The
layer expands repeat marks into an ordered bar-pass list. It then maps musical positions to
absolute seconds through a tempo map. The audio engine and the playhead both read the same
timeline. One source of truth fixes wrong bar order, wrong tempo, and playhead drift.

## Interface

### `js/tab/playOrder.js`

```javascript
buildPlayOrder(measures, options) -> { passes, barOrder, flattened, warnings }
// measures: TabModel.measures[], each with an optional repeat descriptor
// options.maxPasses: safety limit on the expanded pass count
// passes: [{ index, barIndex, passIndex, endingNumber, startQuarter, endQuarter }]
// barOrder: number[] — the written bar index of every pass, in sounding order
// flattened: boolean — true when the module flattened a nested repeat
// warnings: string[]
```

Field meanings:

```text
index: number                   // pass ordinal in playback order (0-based)
barIndex: number                 // written measure index in the source score
passIndex: number                // which time this written bar sounds (0 on first pass)
endingNumber: number | null     // alternate ending number for this pass, or null
startQuarter: number             // score start in quarter-note units for this pass span
endQuarter: number               // score end in quarter-note units for this pass span
```

### `js/tab/scoreTimeline.js`

```javascript
buildTimeline({ playOrder, tempoMap, baseBpm, rate, tracks }) -> Timeline
timeline.positionAtSeconds(sec) -> Position
timeline.secondsAtPosition({ barIndex, beatInBar, passIndex }) -> number
timeline.withRate(rate) -> Timeline
timeline.loopWindow({ startBarIndex, endBarIndex }) -> { startSec, endSec }
```

`Position`:

```text
sec: number                      // absolute time from score start, at the current rate
quarter: number                  // play-order quarter position
passIndex: number
barIndex: number                 // written bar index
beatInBar: number                // quarter-note offset from bar start
beatInScore: number              // quarter position in written score space
eventIndex: number | null        // index into Timeline.events, when on a note
```

`Timeline` also exposes:

```text
passes: BarPass[]                // the pass list, with startSec and endSec added
events: TimedEvent[]             // ordered sounding list for the scheduler
tempoSegments: TempoSegment[]    // piecewise tempo map
totalSec: number
rate: number
warnings: string[]
```

`TimedEvent` (per note or drum hit):

```text
kind: 'guitar' | 'drum'
trackIndex: number               // index inside the list that kind names
startSec: number
durSec: number
midi: number | null
velocity: number
techniques: string[]
bend: TabEvent.bend | null
slideKind: TabEvent.slideKind | null
barIndex: number
passIndex: number
beatInBar: number
voiceIndex: number
```

[data-model.md](../data-model.md) holds the full field tables for `BarPass`,
`TempoSegment`, `TimedEvent`, and `Position`.

Parameters:

```text
playOrder: output of buildPlayOrder
tempoMap: TabModel.tempoMap (may be empty)
baseBpm: fallback BPM when the map has no entry at bar 0
rate: playback speed factor (1 = 100 %)
tracks: { guitarModels: TabModel[], drumModels: TabModel[] }
```

## Guarantees

1. A tempo automation applies on every pass of its bar. A tempo change inside a repeated
   section applies on each pass through that bar. (FR-001, spec edge case)
2. The `rate` multiplies every tempo segment by the same factor. A speed change scales all
   tempo automations equally. (FR-016)
3. A nested repeat flattens to one pass. `buildPlayOrder` adds a warning string that names
   the flatten action. (FR-003)
4. An alternate ending sounds on the pass that its ending number names. (FR-002)
5. A tie joins into one sounding event with the combined length. (FR-004)
6. A grace note sounds before the main note on the same beat. (FR-007)
7. A rest keeps its written length and adds no sounding event. (FR-005)
8. A dotted note and a tuplet keep their written length. (FR-006)
9. Every voice in a track contributes events to `events`. (FR-008)
10. `positionAtSeconds` is exact against the tempo segments. The playhead can hold within
    50 milliseconds of the sounding note. (FR-009, SC-003)
11. `loopWindow` addresses written bars. A loop inside a repeated section does not jump to
    the repeat target. It loops the selected written bar range only. (spec edge case)
12. Total playback time matches the source score within 1 percent for a score with tempo
    changes, repeats, and alternate endings. (SC-001)
13. The timeline computes in quarter-note units and converts to seconds once. Across a
    30 minute session the playhead drifts less than 200 milliseconds. (SC-011)

## Errors

| Case | Required behaviour |
| --- | --- |
| `measures` is empty | Return `{ passes: [], barOrder: [], flattened: false, warnings: [] }`. `buildTimeline` returns zero `totalSec`. |
| `options.maxPasses` exceeded | Stop expansion. Push a warning. Return the passes built so far. |
| `tempoMap` entry references a bar past the score end | Skip that entry. Push a warning. |
| `rate` is zero or negative | Treat as `1`. |
| `loopWindow` start bar is after end bar | Return `{ startSec: 0, endSec: 0 }`. |
| Track model has no `beats[]` | Fall back to `events[]` timing. Push no error. |

## Compatibility

| Consumer | Rule |
| --- | --- |
| `js/gpMixPlayer.js` | Becomes the primary reader of `Timeline`. It must not keep scalar BPM maths for score timing. |
| `js/gpPlayerUI.js` | Maps `audioCtx.currentTime` through `positionAtSeconds` for the playhead. |
| `js/tab/tabPlayer.js` | `buildTimedNotes` stays for the ASCII tab path. It does not call this module. |
| `cli/src/analyzers/tab.js` | No change. The CLI does not build a timeline. |

## Verification

`tests/gp-player/play-order.mjs` and `tests/gp-player/timeline.mjs` prove this contract.

1. A repeat with two alternate endings produces the correct `barOrder` list.
2. A nested repeat produces one pass and a warning.
3. A tempo change at bar 9 applies on every pass through bar 9.
4. Tied notes, grace notes, rests, dotted notes, and tuplets produce the expected
   `events` count and length.
5. Two voices on one track both appear in `events`.
6. `positionAtSeconds` and `secondsAtPosition` round-trip within floating-point tolerance.
7. Total seconds for a fixture score are within 1 percent of the reference value.
8. `loopWindow` on bars inside a repeat returns seconds for those written bars only.
9. `node tests/gp-player/run.mjs` runs both suites.
