# Contract: score player

**Owner modules**: `js/gpPlayer.js` (host shell), `js/gpPlayerUI.js` (shared mount),
`js/gpMixPlayer.js` (synthesis and scheduling), `js/tab/guitarPro.js` (parse entry)

**Consumers**: `js/main.js`, Practice Library, Routines, Tools launchers

**Requirements**: FR-048, FR-051, FR-052, FR-053, FR-054, FR-055, FR-095

Score Player is the single owner for Guitar Pro parsing and score playback (FR-095). This
contract fixes the open target, transport layout, Loop Selection mode, Save as Exercise,
audio ownership, and tempo rules.

## 1. Current state

Verified facts from the codebase:

| Piece | Location | Role |
| --- | --- | --- |
| `parseGuitarPro` | `js/tab/guitarPro.js` | Single parse entry point; delegates `.gp5` to `js/tab/gp5.js` |
| `mountGpPlayer` | `js/gpPlayerUI.js` | Shared mount for parchment, transport, and drawers |
| `createGpMixPlayer` | `js/gpMixPlayer.js` | Synthesises and schedules all tracks on one clock |
| Loop, transpose, tuning | `js/gpPlayerUI.js`, `js/gpMixPlayer.js` | Already supported |
| Retune mode | `js/gpPlayerUI.js` | `fingerings` or `pitches` |
| Track mixer | `js/gpPlayerUI.js` tracks drawer | Per-track mute and level |
| Measure seek and selection | `js/gpPlayer/measureNav.js`, `js/gpPlayer/loopSelection.js` | Already supported |
| Count-in and score metronome | `js/gpMixPlayer.js`, `js/gpPlayer/metronomeState.js` | Already supported |
| Tempo ramp | `js/gpMixPlayer.js` | Already supported |

`js/gpPlayer.js` today holds its own score list through `listGpExercises` and
`renderLibrary`. That private list is the surface to remove (FR-054).

## 2. What changes

`js/gpPlayer.js` becomes a host only. Library, Routines, or Tools name an open target.
The host loads the attachment, parses it, and calls `mountGpPlayer`.

### 2.1 Open target

```js
OpenTarget = {
  attachmentId: string,
  trackIndex?: number,       // preferred track; defaults to 0
  measureStart?: number,     // optional measure range
  measureEnd?: number,
}
```

Rules:

1. `attachmentId` is required. The host reads the blob through `getFileBlob` from
   `js/attachments.js`.
2. When `trackIndex` is set, the player selects that track on mount.
3. When `measureStart` and `measureEnd` are set, the player applies that loop range on
   mount.
4. An exercise id may travel through origin context for Back and Save as Exercise, but
   the open target itself names the attachment.

### 2.2 Entry points

| Caller | How it opens Score Player |
| --- | --- |
| Practice Library | Route `scoreplayer` with open target from the exercise attachment |
| Routines / workbook | Open target from the active exercise |
| Tools Train launcher | Open target from a picked file or recent exercise |

## 3. Transport and drawers

Per FR-051:

1. Transport controls stay visible while the parchment scrolls. The transport anchor in
   `js/gpPlayerUI.js` stays fixed or sticky during score scroll.
2. The track mixer lives in the tracks drawer (`gpp-tracks-drawer-root`).
3. Practice settings live in the menu drawer and the metronome drawer
   (`gpp-menu-drawer-root`, `gpp-metro-drawer-root`).

The parchment body scrolls inside `gpp-score-body`. Transport does not scroll away.

## 4. Loop Selection

Per FR-052, Loop Selection is an explicit mode with two states.

### 4.1 States

| State | Player label | Drag on parchment |
| --- | --- | --- |
| `off` | `Loop Selection` (inactive) | Scrolls the score |
| `on` | `Loop Selection` (active) | Selects measures |

### 4.2 Transitions

```text
off --[player toggles Loop Selection on]--> on
on  --[player toggles Loop Selection off]--> off
on  --[player clears loop range]--> on (selection cleared, mode stays on)
```

Entry: the player taps the Loop Selection control in the transport dock. `createLoopSelectionController`
in `js/gpPlayer/loopSelection.js` calls `enable()` and sets `loopSelectMode` true.

Exit: the player taps the control again. The controller calls `disable()` and sets
`loopSelectMode` false. Drag returns to scroll.

While `on`, the parchment shows a selection highlight across the chosen measure range.
While `off`, the parchment scrolls on drag and shows no new selection from drag.

## 5. Save as Exercise

Per FR-053:

1. The player chooses Save as Exercise from the transport or menu drawer.
2. A confirmation dialog shows the source score name, track name, measure range, tempo
   (`bpm`), and tuning before create.
3. The player confirms or cancels. Cancel creates no record.

### 5.1 Exercise fields written

The feature writes these fields through the Practice Library service
(`addGpExerciseFromAttachment` or `updateExercisePracticeSettings`). It does not write
`musi.exercises` directly.

| Field | Source |
| --- | --- |
| `attachmentId` | Source score attachment |
| `preferredTrackIndex` | Active track index |
| `measureStart` | Loop start measure index |
| `measureEnd` | Loop end measure index |
| `startBeat` | Loop start beat |
| `endBeat` | Loop end beat |
| `bpm` | Current playback tempo |
| `transpose` | Current transpose value |
| `tuning` | Current tuning id |
| `retuneMode` | Current retune mode (`fingerings` or `pitches`) |

`serializeExerciseScore` in `js/gpExerciseScore.js` may build the attachment bytes when
the save slices the score.

## 6. No private library

Per FR-054:

1. Score Player keeps no private score list.
2. `js/gpPlayer.js` removes `renderLibrary`, the `gpp-library-list` UI, and direct
   `listGpExercises` browsing.
3. Every saved score is a Practice Library exercise. The player opens it from Library,
   Routines, or Tools.

## 7. Audio ownership

Per FR-055 and Contract: audio owner:

1. Score Player claims the single audio owner before playback starts.
2. Score Player releases the claim when playback stops, when the player leaves Score
   Player, or when another owner preempts it.
3. A second metronome, tone, score, recording, or media item stops or pauses the prior
   owner.

The host calls the audio owner module. It does not manage preemption inside
`js/gpMixPlayer.js` alone.

## 8. Tempo

Per FR-094 and FR-095:

1. The score metronome uses the shared tempo scheduler. Every metronome surface shares
   beat timing for the same tempo, meter, and subdivision.
2. `createGpMixPlayer` keeps its own note and drum scheduling against the shared clock.
   Note events and metronome clicks stay aligned on that clock.

The score metronome prefs in `musi.gpMetroPrefs` remain per-score UI state. Beat
scheduling goes through the shared tempo scheduler.

## 9. Parse and mount flow

```text
open target received
  -> getFileBlob(attachmentId)
  -> parseGuitarPro(bytes, fileName)        // js/tab/guitarPro.js
  -> mountGpPlayer(host, { gpResult, ... }) // js/gpPlayerUI.js
  -> createGpMixPlayer(gpResult, opts)       // playback
```

`openGpPlayerFromBytes` in `js/gpPlayerUI.js` remains a convenience wrapper for tests
and direct byte loads.

## 10. Test approach

Existing suites under `tests/gp-player/` must keep passing:

| Suite | Cover |
| --- | --- |
| `tests/gp-player/wiring.mjs` | Mount wiring |
| `tests/gp-player/smoke.mjs` | Basic load and play |
| `tests/gp-player/metronome.mjs` | Score metronome |
| `tests/gp-player/metro-click.mjs` | Click timing |
| `tests/gp-player/loop-playback.mjs` | Loop playback |
| `tests/gp-player/exercise-slice.mjs` | Measure slice |
| `tests/gp-player/exercise-import.mjs` | Import from score |
| `tests/gp-player/exercise-import-ui.mjs` | Import UI |
| `tests/gp-player/drum-parsing.mjs` | Drum track parse |
| `tests/gp-player/drum-notation.mjs` | Drum notation |

Feature additions must assert:

| Case | Expected result |
| --- | --- |
| Open target with `attachmentId` only | Track 0, full score |
| Open target with track and measure range | Correct track and loop on mount |
| Loop Selection off + drag | Parchment scroll changes; no new selection |
| Loop Selection on + drag | Measure range updates |
| Save as Exercise confirm | Dialog shows score, track, measures, tempo, tuning |
| Save as Exercise fields | Written fields match section 5.1 |
| Save as Exercise | Calls Practice Library service; no direct store write |
| No `listGpExercises` UI in gpPlayer host | FR-054 |
| Audio claim before play | Prior owner stops or pauses |
| Audio release on stop | Owner slot clears |
