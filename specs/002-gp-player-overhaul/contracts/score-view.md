# Contract: Score view

**Feature**: `002-gp-player-overhaul` | **Date**: 2026-08-13 | **Plan**: [../plan.md](../plan.md)

## Purpose

This contract fixes the score render layer. A pure layout module places rhythm marks, rests,
technique glyphs, and overlay paths. `js/gpPlayer/parchmentView.js` writes that layout to
the DOM. The view keeps the parchment treatment and the Game Boy Color chrome around it.

## Interface

### Part 1 — `js/gpPlayer/scoreLayout.js` (pure)

```javascript
layoutBar(bar, options) -> BarLayout
layoutScore(model, options) -> { bars, systems, fontPx, warnings }
```

`layoutScore` builds one `bar` slice for each written measure, then calls `layoutBar` for
each slice. A `bar` slice holds only the data of that measure:

```text
index: number                   // written measure index
measure: TabModel.measures[i]    // timeSig, marker, repeat, startBeat, endBeat
beats: Beat[]                    // beats of this measure, every voice
rests: Rest[]                    // rests of this measure, every voice
events: TabEvent[]               // notes of this measure
strings: TabModel.strings        // or the drum lane list when drumMode is true
tuningLabel: string              // shown on the first bar of the first system
```

`layoutBar` stays pure. It reads no DOM and no global state.

`options`:

```text
widthPx: number                 // viewport width for reflow
zoom: number                    // user zoom factor
showNotationStaff: boolean      // optional standard notation staff
showRhythm: boolean             // rhythm lane below tab staff
drumMode: boolean               // drum lane layout
minFretFontPx: number           // floor for fret number size (default 12)
```

`BarLayout`:

```text
barIndex: number
widthUnits: number
fontPx: number
lanes: LaneBox[]                // named vertical regions
glyphs: Glyph[]
overlays: Overlay[]
warnings: string[]
```

`LaneBox`:

```text
name: LaneName
x: number
y: number
w: number
h: number
```

`LaneName` set:

```text
notationStaff | techniqueAbove | tabStaff | rhythm | techniqueBelow
```

`Glyph`:

```text
kind: GlyphKind
lane: LaneName
x: number
y: number
w: number
h: number
text: string                     // DOM text content when applicable
aria: string                     // accessible name
```

`GlyphKind` set:

```text
fret | deadNote | drumHit | rest | stem | flag | beam | dot | tupletBracket |
timeSig | barNumber | marker | repeatOpen | repeatClose | volta | tuning |
technique | bendValue
```

`Overlay`:

```text
kind: 'bend' | 'slur' | 'slide' | 'tie'
path: string                    // SVG path d attribute
fromGlyph: { lane, x, y }
toGlyph: { lane, x, y }
```

`layoutScore` output:

```text
bars: BarLayout[]
systems: {
  barIndices: number[]
  widthPx: number
  parts: SystemPart[]
}[]
fontPx: number                  // computed fret font size after reflow
warnings: string[]
```

`SystemPart`:

```text
barIndex: number
colStart: number                // inclusive column index into bars[barIndex].columns
colEnd: number                  // exclusive
isContinuation: boolean         // true when this is not the first fragment of the measure
isLastFragment: boolean
widthUnits: number               // fragment width after pack and stretch
layout: BarLayout                // sliced or aliased fragment ready to draw
```

### Part 2 — `js/gpPlayer/parchmentView.js` (DOM mount)

```javascript
mountParchmentView(host, options) -> viewHandle
```

Current `options`:

```text
guitarModel: TabModel | null
percModel: TabModel | null
zoom: number
selection: { startBeat, endBeat } | null
onMeasureClick: (measureIndex) => void
onMeasureLongPress: (measureIndex) => void
onSelectionChange: (selection) => void
onNoteSelectionChange: (noteSelection) => void
onAnnotationClick: (annotationId) => void
loopSelectMode: boolean
noteSelectMode: boolean
autoFollow: boolean
```

Current `viewHandle` methods (kept):

```javascript
viewHandle.update({
  currentSec, bpm, playing, measureIndex,
  selection, noteDraft, loopSelectMode, noteSelectMode,
  zoom, autoFollow, annotations, highlightedAnnotationId,
})
viewHandle.setModel(guitarModel, percModel)
viewHandle.setZoom(zoom)
viewHandle.setSelection(selection)
viewHandle.setLoopSelectMode(on)
viewHandle.setNoteSelectMode(on)
viewHandle.scrollToMeasure(measureIndex)
viewHandle.destroy()
```

Additions for the overhaul:

```javascript
viewHandle.setShowStandardNotation(on: boolean)
viewHandle.setActivePosition({ barIndex, beatInBar, passIndex })
viewHandle.resumeAutoFollow()
```

Render rules:

1. The view writes text and staff lines as DOM elements.
2. The view writes one inline `<svg>` for each bar. The SVG holds overlay paths (bend,
   slur, slide, tie, beam curves that need paths).
3. `mountParchmentView` calls `layoutScore` on rebuild. It maps each `Glyph` to a DOM
   node and each `Overlay` to an SVG path inside that bar's SVG.

## Guarantees

1. Every beat carries a rhythm mark when `showRhythm` is true. (FR-018)
2. The view draws rests in the rhythm or rest lane. (FR-019)
3. Horizontal spacing follows the written length of each note or rest. (FR-020)
   A bar must keep a clear gap between fret numbers on the same string. When a dense
   bar needs more room than the row, the bar wraps onto the next system at a column
   boundary. A system's parts must not exceed `system.widthPx` (except the one-column
   last-resort case).
4. The view draws all 13 techniques in the FR-021 list. The layout draws at least 95
   percent of the techniques that the file holds. (FR-021, SC-004)
5. The view shows the bend amount for each bend. (FR-022)
6. The view shows the time signature at the first bar and at every change. (FR-023)
7. The view shows repeat marks, volta brackets, and section markers. (FR-024)
8. The view shows the tuning of the selected track. (FR-025)
9. The standard notation staff is optional through `showNotationStaff` /
   `setShowStandardNotation`. (FR-026)
10. The view highlights the sounding beat and the current bar. (FR-027)
11. The view scrolls to keep the playhead in view during playback when `autoFollow` is
    true. (FR-028)
12. When the learner scrolls manually, automatic scroll stops until the learner calls
    `resumeAutoFollow` or toggles auto-follow in settings. (FR-029)
13. At 360 CSS pixels wide, a fret number draws at 12 CSS pixels or larger. (FR-030,
    SC-012)
14. The view shows the selected track only. It does not fall back to the first drum track
    when a guitar track is selected. (FR-031)
15. Note text holds a contrast ratio of 7 to 1 or better against its background. (FR-032)

## Errors

| Case | Required behaviour |
| --- | --- |
| `host` is null | Return a no-op handle (current behaviour). |
| Model has no measures | Render an empty sheet. Push no throw. |
| Unknown technique id | Skip the glyph. Push a warning onto `BarLayout.warnings`. |
| `widthPx` below 200 | Clamp reflow to 360 for the floor test path. |

## Compatibility

| Consumer | Rule |
| --- | --- |
| `js/gpPlayerUI.js` | Keeps `mountParchmentView` import. `parchmentModels()` passes only the selected track model. |
| `css/gpplayer.css` | Parchment palette stays on the score surface. Chrome uses Game Boy Color tokens. |
| `js/gpFollowView.js` | Removed after tests move to the layout model. Do not add new callers. |

## Verification

`tests/gp-player/score-layout.mjs` proves this contract without a browser.

1. A fixture bar with mixed note lengths produces one rhythm glyph per beat.
2. Rest glyphs appear for rest beats.
3. Technique coverage counts at least 95 percent of techniques in the fixture file.
4. `fontPx` at `widthPx: 360` is 12 or greater.
5. Repeat marks and volta brackets appear when `measures[].repeat` is set.
6. `node tests/gp-player/run.mjs` runs the layout suite.
7. Manual check in the browser confirms highlight, scroll, and auto-follow behaviour.
