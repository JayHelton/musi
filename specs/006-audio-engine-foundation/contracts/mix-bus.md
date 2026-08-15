# Contract: mix bus

**Owner modules**: `js/audio/mixBus.js`, `js/audio.js`

**Consumers**: `js/gpMixPlayer.js`, every tool that calls `getAnalyserDestination()` or `getMixDestination()`

**Requirements**: FR-007 to FR-018, SC-003, SC-004

## 1. Purpose

One mix graph serves the app.
Track buses apply imported volume and pan.
A final safety stage keeps the protected output at or below `-1 dBFS`.

## 2. Graph

```text
voice → track bus (gain, pan, reserved EQ)
      → mix bus
      → compressor
      → master gain
      → safety stage
      → destination
      → analyser tap on the protected output
```

Rules:

1. Do not create a compressor or a limiter for each note.
2. Do not create a second global `AudioContext`.
3. Master gain sits before the safety stage.
4. The analyser reads after the safety stage.

## 3. Interface

```javascript
// js/audio.js — keep these names
export function ensureAudio()
export function getMixDestination()          // mix bus input
export function getAnalyserDestination()     // alias of getMixDestination()
export function getCompressorNode()
export function getMasterVolume()
export function setMasterVolume(v)           // 0..1.5

// js/audio/mixBus.js
export function getTrackBus(trackKey, { volume, pan } = {})
export function setTrackBusGain(trackKey, gain)
export function setTrackBusPan(trackKey, pan)
export function setTrackMuteSolo({ mutedKeys, soloKey })
export function getSafetyPeakLinear()
export function measureProtectedPeak(buffer) // test helper
```

`getAnalyserDestination()` must keep its current name.
Callers that connect to it today must enter the mix bus, not the raw destination.

## 4. Track bus

`trackKey` uses `guitar:<index>` or `drum:<index>`.

On first Guitar Pro load:

1. Read `model.trackInfo.volume` and `model.trackInfo.pan`.
2. Missing volume becomes `1`. Missing pan becomes `0`.
3. Create or update the track bus with those values.
4. Mute and solo still force silence on the bus gain.

`setTrackVolume` in `js/gpMixPlayer.js` must write the track bus gain.
A new `setTrackPan(kind, index, pan)` must write the track bus pan.

## 5. Headroom

`js/gpPlayer/instrumentVoices.js` must not divide note gain by the live voice count.
When the mix player schedules notes that share one onset, it passes `chordSize`.
Note gain may fall as `1 / sqrt(chordSize)` or an equal-power equivalent.
A later note with a new onset must not use the count of notes that still hold.

`MAX_ACTIVE_VOICES` may still steal the oldest voice.

## 6. Safety

The safety stage must keep a dense six-note chord at or below `-1 dBFS`
when master volume is `1` and when master volume is `1.5`.

The current peak test must render through this graph.
The pass limit is `-1 dBFS`, not linear `0.999` at 0 dBFS.

## 7. Reserved sends

The track bus may expose a reverb send gain.
This feature keeps that send at 0.
Feature 010 adds the impulse and the preset send amounts.

## 8. Guarantees

1. Imported volume changes the track level on first play.
2. Imported pan changes the left and right balance on first play.
3. Mute and solo still work.
4. Display track choice does not change playback enablement by itself.
5. Protected peak stays at or below `-1 dBFS`.
6. Existing helpers keep their names.

## 9. Test hooks

| Case | Expected result |
| --- | --- |
| Source volume 0.4 vs 1 | The quieter track measures lower RMS |
| Pan -1 | Left channel stronger than right |
| Six-note chord | Protected peak `<= -1 dBFS` |
| Master 1.5 | Protected peak still `<= -1 dBFS` |
| Overlapping sustain plus new note | New note gain ignores the held count |
