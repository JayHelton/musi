# Tasks: Workbook Seamless Play

**Input**: Design documents from `/specs/007-workbook-seamless-play/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Phase 1: Join helpers

- [x] T001 [P] [US1] Add `concatModels` to `js/tab/tabModel.js`
- [x] T002 [P] [US1] Add `concatGpResults` to `js/gpExerciseScore.js`
- [x] T003 [US1] Add Node tests in `tests/gp-player/concat-score.mjs`

## Phase 2: Playthrough map

- [x] T004 [US1] Add `js/workbookPlaythrough.js` with run bounds, score build, and position maps
- [x] T005 [US1] Add Node tests in `tests/workbooks/playthrough.mjs` and import them from `tests/workbooks/run.mjs`

## Phase 3: Player hooks

- [x] T006 [P] [US2] Add `onPlaybackTick`, `skipCountIn`, `seekToBar`, and `seekToBeat` on `js/gpPlayerUI.js`
- [x] T007 [US2] Extend `tests/gp-player/wiring.mjs` for the new handle methods

## Phase 4: Workbook mount

- [x] T008 [US1] Mount the joined score in `js/workbooks.js` when Loop is off
- [x] T009 [US2] Seek for in-run Next, Previous, and playlist clicks in `js/workbooks.js`
- [x] T010 [US3] Keep the existing remount path for non-Guitar-Pro items and run exits
- [x] T011 Bump `CACHE_VERSION` in `service-worker.js`

## Phase 5: Verify

- [x] T012 Run `node tests/gp-player/run.mjs` and `node tests/workbooks/run.mjs`
- [x] T013 Run `node cli/bin/musi.js --help`
- [x] T014 Exercise workbook Loop off in a browser
