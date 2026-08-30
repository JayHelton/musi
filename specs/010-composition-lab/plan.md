# Implementation Plan: Composition Lab

**Spec**: `specs/010-composition-lab/spec.md`

## Shape of the change

Three layers, in dependency order.

### 1. The shared reference layer — `js/reference/`

This is the layer the spec's "one theory source of truth" needs. It sits above
`js/scales.js`, `js/chords.js`, `js/theory.js`, and `js/tunings.js`, and below
both Study and Practice Lab. Nothing in it reaches into a feature folder, so a
feature can mount a reference without pulling another screen with it.

- `intervalTable.js` — new. The interval colour table: degree, character,
  compositional function, examples, plus the pure helpers that spell a degree
  against a tonic, find it on a neck, and compare two collections.
- `intervalReferenceView.js` — new. The Interval Reference component.
- `scaleReferenceView.js` — new. The Scale Reference card.
- `chordReferenceView.js` — new. The Chord Reference, composed from the chord
  views that already existed inside Practice Lab.
- `keyChords.js`, `voicings.js`, `outside.js`, `neckView.js`, `chordsView.js`,
  `chordDetailView.js`, `outsideView.js`, `voicingCard.js`, `chordVoice.js` —
  moved out of `js/practiceLab/` unchanged apart from their imports. They were
  already the richest chord reference in the app. Moving them made them shared
  instead of copying them.

### 2. The Study tool — `js/intervalReference.js`

One new tool page, `intervalref`, first in the Study area. It mounts
`createIntervalReference` and follows the shared musical context. Scale
Reference and Chord Reference already existed in Study and did not change.

### 3. Composition Lab — `js/practiceLab/`

- `adapters/musiReference.js` — the one seam to `js/reference/`.
- `adapters/musiDrone.js` — a held drone and one answer pitch for the Hear work.
- `model/compositionContext.js` — instrument, tuning, tonal center, collection,
  optional fields, and the presets. Drop A# is one row in that list.
- `model/rhythmGrid.js` — the attack grid, its constraint checker, its
  constrained randomiser, and its transformations.
- `model/compositionExercises.js` — the exercise bank. Every entry is a `build`
  function that takes the context and returns a concrete exercise.
- `model/motifLab.js` — the transformation cards, the motif family, the sections.
- `model/guidedLabs.js` — the four guided labs, the song study, the capstone.
- `model/compositionState.js` — the saved state shape and its repair.
- `ui/compositionView.js` and the panels beside it — the screen.

`js/practiceLab/ui/theoryView.js` is deleted. The mode id `theory` becomes
`composition`.

## Rules the change had to keep

- Only `js/practiceLab/adapters/` may import from outside the feature folder.
  `tests/practice-lab/run.mjs` enforces this.
- No `engine/` or `model/` file may touch a screen, the clock, or the audio
  context. The same runner enforces this.
- The tool id is the route id is the DOM section id. `intervalref` follows that
  rule, and `tests/product-model/run.mjs` enforces it.
- The visual system is the Atomic Purple Game Boy Color theme. Every new rule in
  `css/reference.css` and `css/practice-lab-composition.css` uses theme tokens.

## Verification

- `node tests/composition-lab/run.mjs` — 65 tests over the new pure functions,
  including a sweep that builds every exercise in every root and seven
  collections, and the source-of-truth boundary checks.
- `node tests/practice-lab/run.mjs`, `node tests/product-model/run.mjs`,
  `node tests/routes/run.mjs`, `node tests/shell/run.mjs`.
- Headless Chrome, driving the mounted screen: the reference drawer, the
  commit-before-answer rule, the six-step guided session, the attack grid, the
  instrument switch, and the saved state.
