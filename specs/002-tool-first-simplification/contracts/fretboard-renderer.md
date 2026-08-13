# Contract: fretboard renderer

**Owner module**: `js/fretboard/renderer.js`

**Consumers**: Study labs in WP-04, exercise companions in WP-07, `js/interval-map/fretboardView.js`

**Requirements**: FR-092, FR-097, FR-101, FR-102

Per decision D18, one SVG renderer replaces the web neck renderers. Per decision D19,
tuning data comes from `js/tunings.js` and duplicate open-string tables go away.

## 1. Purpose

One implementation owns fretboard rendering and tuning data (FR-092). Every tool that
shows a neck diagram uses the same tuning list and the same fret positions for the same
selection. The renderer reuses the Atomic Purple Game Boy Color theme (FR-097). It must
not use colour alone for pitch meaning (FR-101). The neck scrolls while controls stay
visible (FR-102).

## 2. Current state

At least eleven renderers exist today. The constant `FB_DOTS` repeats in several files.

| File | Technology |
| --- | --- |
| `js/fretboardTrainer.js` | DOM |
| `js/scaleReference.js` | DOM |
| `js/chordReference.js` | DOM |
| `js/triadReference.js` | SVG |
| `js/sweepReference.js` | DOM |
| `js/chordWorkout.js` | DOM |
| `js/interval-map/fretboardView.js` | DOM grid with SVG overlay |
| `js/exerciseCompanions/diagram.js` | DOM |
| `js/exerciseCompanions/triadRef.js` | SVG |
| `chord-cards/src/render.js` | SVG |
| `cli/src/trainers/fretboard.js` | ASCII |

## 3. Scope

The new renderer replaces the web renderers in the table above except:

| File | Reason |
| --- | --- |
| `chord-cards/src/render.js` | Separate build-time asset pipeline; out of scope |
| `cli/src/trainers/fretboard.js` | Terminal cannot draw SVG; FR-108 keeps the CLI unchanged |

## 4. Decision

Per decision D18, one SVG renderer lives in `js/fretboard/renderer.js`.

**Rationale**: `js/triadReference.js` and `js/interval-map/fretboardView.js` already draw
SVG overlays. SVG scales cleanly at 200% text zoom (FR-101). A declarative model lets
Node tests check fret positions without a browser.

## 5. Interface

```javascript
export function renderFretboard(hostEl, model, options) // -> { update, destroy }
export function fretPositions(model)                    // pure, testable in Node
export const FRET_MARKERS
```

### 5.1 `renderFretboard` return value

| Method | Meaning |
| --- | --- |
| `update(nextModel, nextOptions)` | Re-renders with a new model or options |
| `destroy()` | Removes SVG nodes and releases listeners |

### 5.2 Model shape

| Field | Type | Purpose |
| --- | --- | --- |
| `tuning` | `string` or `TuningPitch[]` | Preset id from `js/tunings.js` or an explicit open-note list |
| `fretStart` | `number` | First fret column, often `0` for open strings |
| `fretEnd` | `number` | Last fret column |
| `orientation` | `string` | `right` for standard orientation; `left` for left-handed |
| `markers` | `Marker[]` | Dots on the neck |
| `overlays` | `Overlay[]` | SVG lines or shapes above the grid, for example interval paths |
| `labels` | `object` | Label mode and display options |

### 5.3 Marker shape

```javascript
{ string, fret, label, role, muted }
```

| Field | Type | Meaning |
| --- | --- | --- |
| `string` | `number` | String index, `0` for the highest string |
| `fret` | `number` | Fret number; `0` for open |
| `label` | `string` | Text on or beside the marker |
| `role` | `string` | Drives colour and shape |
| `muted` | `boolean` | When `true`, the string is muted at this position |

### 5.4 Role values

Roles drive colour and shape. Colour alone must not carry meaning (FR-101).

| Role | Typical use | Shape cue |
| --- | --- | --- |
| `root` | Root note | Strong fill plus label |
| `chordTone` | Chord member | Distinct shape plus label |
| `scaleTone` | Scale member | Ring or dot plus label |
| `target` | Lesson or quiz target | Outline plus label |

Every marker carries a text `label` or a distinct shape, never colour alone.

### 5.5 Label modes

| Mode | Shows |
| --- | --- |
| `note` | Note name, for example `C` or `F#` |
| `interval` | Interval from the root, for example `m3` or `5` |
| `degree` | Scale degree, for example `3` or `b7` |

### 5.6 `FRET_MARKERS`

`FRET_MARKERS` exports the fret inlay positions. It matches the shared set used today:

`[3, 5, 7, 9, 12, 15, 17, 19, 21, 24]`. Fret `12` and `24` render as double markers.

## 6. Tuning input

The renderer reads `TUNING_CATALOG` and `TUNINGS` from `js/tunings.js`. It supports:

1. Six-string standard and variant tunings.
2. Seven-string tunings, for example `7-b-std`.
3. Drop tunings, for example `6-drop-d`.

A converted module deletes its own `FB_DOTS` copy. Per decision D19, `SWEEP_OPEN_MIDI`
in `js/sweepReference.js` and `OPEN_PC` in `js/sweepPatterns.js` go away. Open-string
data comes from `js/tunings.js` instead.

`fretPositions(model)` resolves `tuning` to open MIDI or pitch-class values and returns
the note at each `(string, fret)` pair in the visible range.

## 7. Accessibility rules

Per FR-101 and FR-102:

1. The renderer must not use colour alone for pitch, note, interval, or completion
   meaning. Every marker carries a shape or a text label.
2. The renderer must support 200% text zoom without clipping essential labels.
3. The renderer must respect `prefers-reduced-motion`. It must not animate marker
   motion when the player requests reduced motion.
4. The neck scrolls inside its host while the tool controls stay visible and fixed.
5. The root SVG carries `role="img"` and an `aria-label` that names the diagram, for
   example `Fretboard, E Standard, C major`.

## 8. Theme rules

Per FR-097 and SC-020, the renderer reads Atomic Purple Game Boy Color tokens from
`css/base.css` and `css/theme-gbc.css` through `css/fretboard.css`. It adds no new
colour value and no new font family. Marker colours use existing theme tokens such as
`--accent`, `--accent2`, and `--on-accent`.

## 9. Adoption order

### WP-04 — Study renderers

| File | Action |
| --- | --- |
| `js/scaleReference.js` | Convert to `renderFretboard` |
| `js/chordReference.js` | Convert to `renderFretboard` |
| `js/triadReference.js` | Convert to `renderFretboard` |
| `js/sweepReference.js` | Convert to `renderFretboard` |
| `js/interval-map/fretboardView.js` | Convert to `renderFretboard` |
| `js/fretboardTrainer.js` | Delete; quiz removed (FR-069) |
| `js/chordWorkout.js` | Delete; quiz removed (FR-069) |

### WP-07 — Companion renderers

| File | Action |
| --- | --- |
| `js/exerciseCompanions/diagram.js` | Convert to `renderFretboard` |
| `js/exerciseCompanions/triadRef.js` | Convert to `renderFretboard` |

## 10. Guarantees

1. The same `model` produces the same fret positions on every surface (FR-092).
2. Tuning data comes from `js/tunings.js`, not local duplicates (FR-092, D19).
3. Every marker has a shape or text label; colour is never the only cue (FR-101).
4. The diagram stays readable at 200% text zoom (FR-101).
5. Reduced motion disables non-essential marker animation (FR-102).
6. The neck scrolls; tool controls do not scroll away (FR-102).
7. New styles use only existing theme tokens (FR-097, SC-020).
8. `fretPositions` is pure and runs in Node without a DOM.

## 11. Test hooks

### Pure positions

`fretPositions` is pure. **Suite**: `tests/fretboard/run.mjs`

The suite asserts the note at a given string and fret for several tunings, including a
drop tuning (`6-drop-d`) and a seven-string tuning (`7-b-std`).

### DOM rendering

SVG rendering needs `tests/gp-player/domShim.mjs` for a headless DOM.

**Suite**: `tests/companions/run.mjs` owns companion renderer cases after WP-07. WP-04
Study conversions extend the same DOM checks or add cases to `tests/fretboard/run.mjs`
when they mount the renderer in a host element.
