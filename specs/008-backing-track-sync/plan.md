# Implementation Plan: Backing Track Sync

**Branch**: `claude/acore-youtube-mp3-sync-fwzvsm`

**Spec**: `specs/008-backing-track-sync/spec.md`

## Summary

One module reads the score engine clock and moves a media source to match it.
A second module wraps the two media kinds behind one interface.
A drawer holds the source, the toggle, the volume, and the two delay controls.
A small flag on the mix player silences the notes without a restart.

## Technical Context

- **Language**: ES modules, no build step, no framework.
- **Clock**: `AudioContext.currentTime`. The engine holds the anchor in `getClockAnchor()`.
- **Storage**: `localStorage` for the settings, IndexedDB (`js/attachments.js`) for the audio blob.
- **Tests**: Node runners under `tests/gp-player/`, one browser harness page under `tests/gp-player/audio/`.

## Time model

The engine stores event times at the written tempo and divides them by the practice
rate. Engine seconds are therefore score-tempo seconds divided by that rate. The
recording runs at the written tempo, so the map is:

```
scoreSec  = songSec * rate
targetSec = anchorSec + trimMs / 1000 + scoreSec
mediaRate = rate
```

The engine measures play-order seconds, which already expand every repeat. A record
plays its repeats out in the same way, so that is the correct time base. Written-score
beats would break any score with a repeat.

## Structure

| File | Role |
| --- | --- |
| `js/gpBackingTrack.js` | One record for each score; YouTube link parsing |
| `js/gpPlayer/backingSync.js` | The clock follower; no DOM, no global clock |
| `js/gpPlayer/backingSources.js` | The adapter interface, the file source, the YouTube source |
| `js/gpPlayer/backingPanel.js` | The drawer, the delay controls, the source lifecycle |
| `js/gpMixPlayer.js` | `setNotesMuted`, `notesMuted`, `rate` |
| `js/gpPlayer/practiceRail.js` | The "Real song" button |
| `js/gpPlayer/playerMenu.js` | The "Backing track" menu row |
| `js/gpPlayerUI.js` | The drawer root, the mount, the clock bridge, the destroy path |

## Decisions

- **One loop, not many call sites.** The transport has more than six entry points.
  A follower that reads the clock cannot miss one of them.
- **A mute flag, not `setTrackEnabled`.** `setTrackEnabled` rebuilds the event list,
  restarts playback, and overwrites the track mixer. The flag keeps all three.
- **No separate audio-owner claim.** The Score Player already holds the claim under the
  id `gp-player`. A second claim would evict the player that owns the clock.
- **Correct small drift with the rate, seek on a large one.** A seek is audible. A rate
  nudge of a few percent is not.
- **Keep the YouTube player visible.** The IFrame API terms ask for it, and the video
  helps a learner watch the hands.
