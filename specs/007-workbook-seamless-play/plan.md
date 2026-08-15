# Implementation Plan: Workbook Seamless Play

**Branch**: `007-workbook-seamless-play` | **Date**: 2026-08-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-workbook-seamless-play/spec.md`

## Summary

When workbook Loop is off, join consecutive Guitar Pro exercises into one score and play that score. Seek inside the joined score for Next, Previous, and playlist moves. Keep the current single-exercise loop when Loop is on.

## Technical Context

**Language/Version**: JavaScript ES modules, Node.js 18+

**Primary Dependencies**: Existing `js/tab/tabModel.js`, `js/gpExerciseScore.js`, `js/gpPlayerUI.js`, `js/workbooks.js`

**Storage**: No new keys. Reuse workbook Loop and exercise attachments.

**Testing**: Zero-dependency Node runners under `tests/`

**Target Platform**: Static web PWA and shared `js/` engine

**Project Type**: Static frontend + CLI companion (this feature is web playback)

**Performance Goals**: Join a typical workbook run without a gap at exercise boundaries

**Constraints**: Static-first. No backend. No new npm packages. Atomic Purple Game Boy Color UI stays as-is.

**Scale/Scope**: Workbook detail player only. Exercises section is unchanged.

## Constitution Check

- Static-first: pass. All logic stays in `js/`.
- Shared theory engine: pass. Join helpers live in shared `js/` modules.
- Atomic Purple UI: pass. No visual restyle.
- Verify before ship: run `tests/workbooks/run.mjs`, `tests/gp-player/run.mjs`, CLI help, and a browser check.
- Spec-driven: this folder is Spec Kit only.

## Project Structure

### Documentation (this feature)

```text
specs/007-workbook-seamless-play/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── playthrough-score.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code

```text
js/tab/tabModel.js              # concatModels
js/gpExerciseScore.js           # concatGpResults
js/workbookPlaythrough.js       # run bounds, boundaries, beat-to-entry
js/gpPlayerUI.js                # onPlaybackTick, seek handle, skipCountIn
js/workbooks.js                 # mount joined score when Loop is off
tests/gp-player/concat-score.mjs
tests/workbooks/playthrough.mjs
```

## Implementation Approach

1. Add `concatModels` that appends measures, events, beats, rests, and tempo maps with beat and index offsets.
2. Add `concatGpResults` that joins guitar and drum tracks by index and pads missing tracks with empty measures of matching length.
3. Add `workbookPlaythrough.js` for run detection and boundary maps.
4. Expose seek and tick hooks on `mountGpPlayer`.
5. In `workbooks.js`, when Loop is off and the current item is Guitar Pro, load the full Guitar Pro run, join it, and seek to the active entry. Sync the active entry from the playhead. Seek for in-run Next, Previous, and playlist clicks.

## Constitution Check (post-design)

No new backend, packages, or theme. Tests stay zero-dependency Node runners.
