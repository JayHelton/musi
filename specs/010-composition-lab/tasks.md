# Tasks: Composition Lab

Every task below is done. The list is the record of the change.

## Phase 1 — the shared reference layer

- [x] T001 Write `js/reference/intervalTable.js`: the eleven degrees, their
      character, their compositional function, and the pure helpers.
- [x] T002 Write `js/reference/dom.js`: the element helpers and the controls the
      reference views draw with.
- [x] T003 Write `js/reference/intervalReferenceView.js`.
- [x] T004 Move `theoryChords.js`, `theoryVoicings.js`, `theoryOutside.js`,
      `theoryNeck.js`, `theoryChordsView.js`, `theoryChordDetail.js`,
      `theoryOutsideView.js`, `theoryVoicingCard.js`, and `musiChordVoice.js`
      out of `js/practiceLab/` and into `js/reference/`.
- [x] T005 Write `js/reference/scaleReferenceView.js` and
      `js/reference/chordReferenceView.js` on top of the moved modules.
- [x] T006 Export `diatonicTriadsForNotes` from `js/diatonicTriads.js` so the
      chord work has one implementation.
- [x] T007 Write `js/reference/index.js`, the one entry point.

## Phase 2 — the Study tool

- [x] T008 Add the `intervalref` tool to `js/tools.js` with an icon.
- [x] T009 Add `#sec-intervalref` to `index.html`.
- [x] T010 Write `js/intervalReference.js` and wire it into `js/main.js`.

## Phase 3 — Composition Lab models

- [x] T011 `model/compositionContext.js`: the context, the presets, the guards.
- [x] T012 `model/rhythmGrid.js`: the grid, the constraints, the randomiser.
- [x] T013 `model/compositionExercises.js`: the six activities and nine focus
      areas.
- [x] T014 `model/motifLab.js`: the transformation cards, the family, the
      sections.
- [x] T015 `model/guidedLabs.js`: the four labs, the song study, the capstone.
- [x] T016 `model/compositionState.js`: the saved state and its repair.

## Phase 4 — Composition Lab screen

- [x] T017 `adapters/musiReference.js` and `adapters/musiDrone.js`.
- [x] T018 `ui/referenceDrawer.js`: Intervals, Scales, Chords over the workspace.
- [x] T019 `ui/compositionContextRow.js`, `ui/rhythmGridView.js`,
      `ui/compositionFretboard.js`, `ui/hearPanel.js`.
- [x] T020 `ui/exercisePanel.js`: the prompt, the fields, the workspace, and the
      Hint, Check, and Next controls.
- [x] T021 `ui/motifPanel.js` and `ui/labPanel.js`.
- [x] T022 `ui/compositionView.js`: the screen and its saved state.
- [x] T023 Replace the `theory` mode with `composition` in
      `js/practiceLab/index.js` and `js/tools.js`, and delete `ui/theoryView.js`.

## Phase 5 — chrome, tests, and documentation

- [x] T024 `css/reference.css` and `css/practice-lab-composition.css`.
- [x] T025 Update `index.html` and the `service-worker.js` precache list, and
      bump the cache version.
- [x] T026 Write `tests/composition-lab/run.mjs`.
- [x] T027 Update `tests/product-model/run.mjs` and `tests/practice-lab/run.mjs`.
- [x] T028 Update `README.md` and `AGENTS.md`.
