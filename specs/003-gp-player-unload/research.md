# Phase 0 Research: Guitar Pro Player Unload

**Feature**: `003-gp-player-unload` | **Date**: 2026-08-13 | **Plan**: [plan.md](./plan.md)

## Summary

This file records five technical decisions for Close score. The Guitar Pro Player screen
already tears down a mount with `destroyMount()`. It still keeps `state.gp`, so a later
visit remounts the score. Close score must clear that session. The shared player must not
force Close score on Exercises or Workbooks.

## Decision index

| ID | Topic | Decision |
| --- | --- | --- |
| D1 | Host contract | Add optional `onCloseScore` to `mountGpPlayer`. Show Close score only when it is a function. |
| D2 | Control placement | Put Close score in the score header and in the player menu Actions group. |
| D3 | Session reset | Clear the standalone in-memory session after `destroy()`. Do not remount. |
| D4 | Confirm | Do not ask the learner to confirm. |
| D5 | Library | Close must not delete a saved score. Delete stays a library action. |

### D1 — Host contract

**Decision**: Add optional `onCloseScore` to `mountGpPlayer` in `js/gpPlayerUI.js`. When the
value is a function, show Close score. When it is not, hide Close score.

**Rationale**: `002-gp-player-overhaul` contract `mount-gp-player.md` requires
back-compatible options. Exercises and Workbooks already have a way back to a list. FR-012
forbids a Close score control on hosts that do not opt in. FR-013 requires the Guitar Pro
Player screen to opt in.

**Alternatives considered**:

- *Always show Close score.* Rejected. An Exercises viewer close would fight the existing
  list back path.
- *A required new handle method only, with no callback.* Rejected. The host must restore
  the drop area. A callback is the smallest host hook.

**Consequences**: `js/gpPlayer.js` passes `onCloseScore`. Other embedders omit it.

### D2 — Control placement

**Decision**: Show a labeled `Close score` button in the score header. Also add a menu row
in the player menu Actions group, next to `Open file`.

**Rationale**: FR-002 requires the action to be visible while a score is loaded. The header
is on screen without an extra tap. The menu already holds `Open file`, so Close score
belongs there as well. FR-011 requires the verbatim label `Close score`.

**Alternatives considered**:

- *Menu only.* Rejected. The learner currently hard-refreshes, which means a hidden menu
  action is not enough.
- *Transport dock only.* Rejected. The dock is dense. A header exit is the usual close
  control for a filled screen.

**Consequences**: `js/gpPlayer/playerMenu.js` gains `onCloseScore`. `js/gpPlayerUI.js` adds
the header button. `css/gpplayer.css` may add a small header-action rule that reuses
existing tokens.

### D3 — Session reset

**Decision**: The Guitar Pro Player screen handler must call `destroyMount()`, then set
`state.gp`, `state.bytes`, `state.title`, `state.fileName`, `state.exerciseId`, and
`state.attachmentId` to empty values. It must call `setStageVisible(false)` and
`renderLibrary()`. `remountIfNeeded()` already skips remount when `state.gp` is empty.

**Rationale**: `stopGpPlayer()` already destroys the mount when the learner leaves the
screen. `initGpPlayer()` then remounts if `state.gp` is still set. That is why a section
change is not an unload. FR-010 requires the empty player after a leave and return.

**Alternatives considered**:

- *Destroy the mount only.* Rejected. `remountIfNeeded()` would restore the score.
- *Reload the page.* Rejected. FR-006 forbids a page reload.

**Consequences**: Export `unloadCurrentScore` from `js/gpPlayer.js` so a Node test can call
it after a DOM shim.

### D4 — Confirm

**Decision**: Do not show a confirm dialog.

**Rationale**: FR-008 forbids confirm. Close is explicit. Library data already persists
through other save paths.

**Alternatives considered**:

- *Confirm when the dropped file is not in the library.* Rejected. The learner asked for a
  fast exit. A dialog would block that.

**Consequences**: No new dialog code.

### D5 — Library

**Decision**: Close score must not call `deleteExerciseItem`. Saved scores stay in the
library list after close.

**Rationale**: FR-007 and SC-004. Unload is a session action. Delete is a library action.

**Alternatives considered**:

- *Offer delete on close.* Rejected. That mixes two jobs and risks data loss.

**Consequences**: After close, `renderLibrary()` still lists saved scores. The learner can
open one again.
