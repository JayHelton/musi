---
description: "Task list for the Guitar Pro Player Unload feature"
---

# Tasks: Guitar Pro Player Unload

**Input**: Design documents from `/specs/003-gp-player-unload/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/close-score.md

**Tests**: Include Node tests under `tests/gp-player/unload.mjs`. The suite runner already
picks up new `.mjs` files after the baseline list.

**Organization**: Tasks are grouped by user story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Phase 1: Setup

**Purpose**: Point the test suite and the cache at this feature

- [x] T001 Add `tests/gp-player/unload.mjs` as a Node test file that installs
      `tests/gp-player/domShim.mjs` and prints `gp-player unload: ok` on success
- [x] T002 Bump `CACHE_VERSION` in `service-worker.js` so the PWA picks up the new player
      files after deploy

## Phase 2: Foundational

**Purpose**: Optional close handler on the shared player, with no standalone session reset
yet

**⚠️ CRITICAL**: User story work that depends on the control cannot start until this phase
is complete

- [x] T003 Extend `mountPlayerMenu` in `js/gpPlayer/playerMenu.js` with optional
      `onCloseScore`. When it is a function, append a menu row labeled `Close score` with
      `aria-label` `Close score` in the Actions group. A click must close the menu and call
      `onCloseScore`
- [x] T004 Extend `mountGpPlayer` in `js/gpPlayerUI.js` with optional `onCloseScore`. When
      it is a function, pass it to the player menu and add a header button labeled
      `Close score` with `aria-label` `Close score`. A click must call `onCloseScore`. When
      it is not a function, render no Close score control
- [x] T005 [P] Add header-button layout in `css/gpplayer.css` for the Close score control.
      Reuse existing tokens (`--border`, `--bg2`, `--text`, `--radius-screen`, `--tap-min`,
      `--font-ui`). Do not introduce a new palette

**Checkpoint**: A host that passes `onCloseScore` shows Close score. A host that omits it
looks unchanged.

## Phase 3: User Story 1 - Close a loaded score (Priority: P1) 🎯 MVP

**Goal**: The Guitar Pro Player screen returns to the empty player without a page refresh

- [x] T006 [US1] Export `unloadCurrentScore` from `js/gpPlayer.js`. It must call
      `destroyMount()`, clear `gp`, `bytes`, `title`, `fileName`, `exerciseId`, and
      `attachmentId` per `specs/003-gp-player-unload/data-model.md`, call
      `setStageVisible(false)`, call `renderLibrary()`, and set status `Score closed.`
- [x] T007 [US1] Pass `onCloseScore: unloadCurrentScore` from `mountCurrent` in
      `js/gpPlayer.js`
- [x] T008 [US1] In `tests/gp-player/unload.mjs`, mount with `onCloseScore` and assert the
      header button and the menu row exist with label `Close score`. Mount without
      `onCloseScore` and assert neither control exists. Click the header button and assert
      the callback ran once
- [x] T009 [US1] In `tests/gp-player/unload.mjs`, build a minimal `#sec-gpplayer` DOM with
      `#gpp-drop`, `#gpp-stage`, `#gpp-status`, and `#gpp-library-list`. Load a fake parse
      result through `loadGpPlayerResult`, call `unloadCurrentScore`, and assert the stage
      is hidden, the drop area is visible, `gp` is gone on a later `initGpPlayer`, and
      `document.location` was not used

**Checkpoint**: Close score returns the empty player. Library items remain.

## Phase 4: User Story 2 - Stop audio on close (Priority: P2)

**Goal**: Close score stops playback and the metronome

- [x] T010 [US2] Confirm `unloadCurrentScore` goes through `destroyMount()` so
      `mountGpPlayer` `destroy()` stops the mix player and clears count-in. Add an unload
      test that stubs a mount handle whose `destroy` sets a flag, then asserts close calls
      it
- [x] T011 [US2] After unload, assert `#sec-gpplayer` does not have class `gpp-score-loaded`
      when the test host was inside that section

**Checkpoint**: Teardown is the same path that already stops audio.

## Phase 5: User Story 3 - Open another score after close (Priority: P3)

**Goal**: A second load works. A leave and return does not remount the closed score

- [x] T012 [US3] In `tests/gp-player/unload.mjs`, after `unloadCurrentScore`, call
      `initGpPlayer` and assert the stage stays hidden because `state.gp` is null
- [x] T013 [US3] In `tests/gp-player/unload.mjs`, after unload, call `loadGpPlayerResult`
      with a second fake score and assert the stage is visible again and the title matches
      the second score

**Checkpoint**: Close then load works without a page refresh.

## Phase 6: Polish

- [x] T014 Run `node tests/gp-player/run.mjs` and confirm `gp-player suite: ok`
- [x] T015 Run `node cli/bin/musi.js --help` as a CLI smoke check
- [ ] T016 Serve the repo root over HTTP and exercise Close score in a browser per
      `specs/003-gp-player-unload/quickstart.md`

## Dependencies

- Phase 1 before Phase 2
- Phase 2 before US1 UI wiring (T007, T008)
- T006 before T007, T009, T010, T012, T013
- US2 and US3 can proceed after T006
- Phase 6 after all stories

## Parallel opportunities

- T005 can run beside T003 and T004
- T008 can start after T004
- T010, T011, T012, T013 can run after T006

## Implementation strategy

Ship US1 first. That is the MVP: the learner can leave a loaded score. US2 is a teardown
guarantee on the same path. US3 proves a second load and a clean return.
