# Contract: Player engine

**Feature**: `002-gp-player-overhaul` | **Date**: 2026-08-13 | **Plan**: [../plan.md](../plan.md)

## Purpose

This contract fixes the audio engine in `js/gpMixPlayer.js`. The factory name stays
`createGpMixPlayer`. Current callers keep working. The engine schedules from a
`Timeline` instead of scalar BPM maths. It reports position through callbacks. It plays
dynamics, bends, slides, vibrato, and mutes through per-family instrument voices.

## Interface

### Current `createGpMixPlayer` surface (today)

The factory in `js/gpMixPlayer.js` exposes these members today. The overhaul keeps every
name unless this contract marks a replacement.

```javascript
createGpMixPlayer({ onTick }) -> engine
engine.load({
  guitarModels, drumModels, bpm, loopMeasures, loopBeats, loopRestSec,
  enabledGuitars, enabledDrums, metronomeEnabled, referenceModel,
})
engine.play({ fromSec })          // no Promise today
engine.pause()
engine.stop()
engine.seek(sec)
engine.setBpm(bpm)
engine.setTrackEnabled(kind, index, enabled)
engine.setMetronomeEnabled(on)
engine.setMetronomeConfig(config)
engine.setLoop({ startSec, endSec, restSec })
engine.setLoopRestSec(sec)
engine.setOnTick(fn)
// getters: playing, paused, bpm, currentSec, durationSec, measureIndex,
//          metronomeEnabled, enabledGuitars, enabledDrums, guitarNotes, events, range
```

### New `createGpMixPlayer` contract

```javascript
createGpMixPlayer({
  onTick,                         // kept; bar/beat/sec tick (may thin when onPositionFrame is set)
  onPositionFrame,                // (position: Position) => void, each animation frame
  onAudioBlocked,               // ({ cause, nextStep }) => void
  onLoopPass,                   // ({ passCount }) => void
  onEnded,                      // () => void
}) -> engine

engine.load({ timeline, tracks, loop, metronome, referenceModel })
// timeline: Timeline from scoreTimeline.js
// tracks: { guitarModels: TabModel[], drumModels: TabModel[] }
// loop: { enabled, startBarIndex, endBarIndex, restSec } | null
// metronome: { enabled, config }
// referenceModel: TabModel for bar readout

engine.play({ fromSec }) -> Promise
engine.pause()
engine.stop()
engine.seek(sec)
engine.seekToBar({ barIndex, beatInBar })
engine.setRate(factor)            // 1 = 100 %; scales the timeline
engine.setBpm(bpm)                // kept; wraps setRate for current callers
engine.setLoop({ enabled, startBarIndex, endBarIndex, restSec })
engine.setTrackEnabled(kind, index, enabled)
engine.setTrackVolume(kind, index, gain)   // 0..1
engine.setMetronomeEnabled(on)
engine.setMetronomeConfig(config)
engine.getPosition() -> Position
engine.destroy()
```

`onTick` payload (kept for embedders that already listen):

```text
playing, currentSec, durationSec, measureIndex, beat, bpm, resting, restRemaining,
loopRestart, loopPassCount
```

`load` must accept the old parameter names as aliases during the transition. A caller that
passes `guitarModels` and `bpm` without a `timeline` gets a built timeline on load.

## Guarantees

1. Stop and Pause ramp every sounding voice to zero across about 8 milliseconds, then stop
   the nodes. No hard `stop()` on an oscillator at full gain. (FR-017, FR-013)
2. A loop pass boundary produces no gap longer than 10 milliseconds and no click. The
   engine schedules the next pass inside the same lookahead window. (FR-013, SC-010)
3. A loop rest holds the playhead at the loop start and reports the countdown through
   `onTick` (`resting`, `restRemaining`). (FR-014)
4. A rate change keeps the current bar and beat. The engine rescales future events only.
   (FR-015)
5. A seek during playback resumes from the correct position. (FR-012)
6. When `audioCtx.resume()` fails or the context stays suspended, the engine calls
   `onAudioBlocked` with a `cause` string and one `nextStep` string. (FR-052)
7. After the app returns to the foreground, the engine re-anchors position from
   `audioCtx.currentTime` through the timeline. (FR-011)
8. `destroy()` leaves no sound, no timer, and no frame callback. (FR-060)
9. The mixed output stays below full scale at all times. A dense chord passage does not
   clip. (FR-051)
10. The engine applies note dynamics from the score. (FR-048)
11. The engine changes pitch for bends, slides, and vibrato. (FR-049)
12. The engine shortens palm-muted notes and dead notes. (FR-050)
13. Each instrument family sounds different from the others on the same test passages.
    (FR-047, SC-016)
14. A speed change scales every tempo segment by the same factor. (FR-016)
15. The bar and beat readout stays correct across tempo changes and speed changes.
    (FR-010)

## Instrument voice contract

Module: `js/gpPlayer/instrumentVoices.js`

```javascript
createVoiceFactory(audioCtx) -> factory
factory.familyForProgram(program) -> 'cleanGuitar' | 'distortedGuitar' | 'acousticGuitar' | 'bass' | 'keys'
factory.playNote({
  family,
  midi,
  when,                         // AudioContext time
  durSec,
  velocity,                     // 0..1, the same scale as TimedEvent.velocity
  techniques,                   // string[]
  bend,                         // TabEvent.bend or null
  slideKind,                    // TabEvent.slideKind or null
  destination,                  // AudioNode (per-track gain)
}) -> voiceHandle
voiceHandle.release(atTime)       // short fade, then stop
voiceHandle.stopNow()             // immediate stop for panic / destroy
```

Families:

| Family | Typical program range |
| --- | --- |
| `cleanGuitar` | Electric guitar, clean |
| `distortedGuitar` | Electric guitar, distorted |
| `acousticGuitar` | Acoustic guitar, nylon, steel |
| `bass` | Bass programs |
| `keys` | Piano, organ, synth |

Drum hits keep `js/drums/drumEngine.js`. The mix player routes them outside
`instrumentVoices.js`.

Voice rules:

1. `velocity` sets peak gain and filter cutoff.
2. `bend.points` drive `frequency` automation across the note.
3. `slideKind` drives pitch glide into or out of the note.
4. `techniques` that include `palmMute` or `dead` shorten decay and lower cutoff.
5. `release` ramps to zero across about 8 milliseconds.

## Errors

| Case | Required behaviour |
| --- | --- |
| `audioCtx` is suspended on `play()` | Try `resume()`. On failure call `onAudioBlocked`. Do not throw. |
| `timeline` is empty | `play()` resolves immediately. `onEnded` fires when appropriate. |
| `seek` past score end | Clamp to `timeline.totalSec`. |
| `setTrackVolume` index out of range | No-op. |
| `destroy()` while playing | Ramp or stop all voices. Clear timers and cancel frame callbacks. |

## Compatibility

| Consumer | Rule |
| --- | --- |
| `js/gpPlayerUI.js` | Keeps `createGpMixPlayer` import and `player` handle on the mount return. |
| `js/tab/tabPlayer.js` | Unchanged. ASCII tab playback uses its own scheduler. |
| `js/drums/drumEngine.js` | Drum scheduling stays. The mix player calls `scheduleHit` for drum events. |
| `js/audio.js` | `ensureAudio`, `getAnalyserDestination`, and the master compressor stay. |

## Verification

`tests/gp-player/timeline.mjs` and `tests/gp-player/run-browser.mjs` prove this contract.

1. An `OfflineAudioContext` render of a two-bar loop shows no gap longer than 10 ms between
   passes.
2. Peak output during a six-note chord passage stays below 0 dBFS.
3. `destroy()` leaves `audioCtx.state` unchanged and registers zero active timeouts in the
   harness.
4. A rate change from 100 % to 70 % keeps the same `barIndex` and `beatInBar`.
5. `onAudioBlocked` fires when the harness starts with a suspended context.
6. A listener test on 10 passages names bass and guitar in at least 9 passages. (SC-016)
7. `node tests/gp-player/run.mjs` runs the Node suites. `run-browser.mjs` runs the audio
   pages under headless Chrome.
