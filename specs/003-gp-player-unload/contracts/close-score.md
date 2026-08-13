# Contract: Close score

**Feature**: `003-gp-player-unload` | **Date**: 2026-08-13 | **Plan**: [plan.md](./plan.md)

## Purpose

This contract extends `mountGpPlayer` with an optional close handler. It also defines the
standalone unload function on the Guitar Pro Player screen. Existing option names and
handle methods stay.

## `mountGpPlayer(host, options) -> handle`

Module: `js/gpPlayerUI.js`

### New optional option

| Option | Meaning |
| --- | --- |
| `onCloseScore` | `() => void`. When this is a function, the player shows Close score. A click calls it. When this is not a function, the player hides Close score. |

### UI rules

- The Close score control label is the verbatim string `Close score`.
- The header button `aria-label` is `Close score`.
- The menu row `aria-label` is `Close score`.
- A host that omits `onCloseScore` must not render those controls.
- A click must not reload the page.

### Handle

No new required handle method. `destroy()` remains the teardown that stops audio and
clears the host. The close handler on the standalone screen must call `destroy()` through
the existing `destroyMount()` path, then clear session fields.

## `unloadCurrentScore()`

Module: `js/gpPlayer.js`

### Behaviour

1. Call `destroyMount()`.
2. Clear session fields per [data-model.md](../data-model.md).
3. Hide `#gpp-stage`.
4. Show `#gpp-drop`.
5. Refresh the library list.
6. Set a short status such as `Score closed.`
7. Do not delete a library item.
8. Do not reload the page.

### Export

Export `unloadCurrentScore` so tests and the mount callback can share one path.

## Compatibility

| Caller | Change |
| --- | --- |
| `js/gpPlayer.js` | Pass `onCloseScore: unloadCurrentScore`. |
| `js/exercises.js` | No change. |
| `js/workbooks.js` | No change. |
| Track to Sheet / Voice Recorder / Drums import | No change. |
