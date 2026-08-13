---
type: decision
id: 20260813-1132-worklet-worker-detector
date: 2026-08-13
status: accepted
supersedes: null
superseded_by: null
impacts:
  - js/pitch.js
  - js/audio.js
  - js/pitchCaptureWorklet.js
  - js/pitchDetectWorker.js
tags: [pitch, audio, performance]
participants: [Jarrett Helton]
---

# Capture in an AudioWorklet and detect in a Worker

## Context

The trainer runs McLeod Pitch Method (MPM) on the UI thread from
`requestAnimationFrame`. A 4096-sample quadratic NSDF is heavy. The UI can
block. Audio output can glitch. Frame rate also changes scoring today.

The recorder already uses `js/recorderWorklet.js` for fixed capture timing.

## Options Considered

### Option 1: Keep MPM on the UI thread
- ✅ Least change
- ❌ Visible UI blocking on low notes

### Option 2: Run MPM inside the AudioWorklet
- ✅ Fixed audio clock
- ❌ Real-time thread cannot do a quadratic MPM pass

### Option 3: AudioWorklet capture plus Worker detector
Use an AudioWorklet for fixed hop timing. Send windows to a Worker. Run pitch
detection in the Worker. Return timestamped samples to the UI.
- ✅ UI thread stays free
- ✅ Audio output stays free
- ❌ More plumbing and typed-array reuse

## Decision

We chose **Option 3**.

Use a 10–20 ms analysis hop. Use a window that holds enough periods for low
notes. A 4096-sample window at 48 kHz is acceptable for C2–C6.

Performance limits:
- Average analysis time: less than 10 ms
- 95th percentile analysis time: less than 20 ms
- No visible UI blocking
- No audio output interruption

If the current MPM code misses these limits, optimize it or use an efficient
WASM or FFT-based implementation. Measure first. Do not replace the detector
without test evidence.

## Consequences

### Positive
- ✅ Scoring uses audio timestamps, not UI frames
- ✅ Results stay equivalent at 30, 60, and 120 UI frames per second

### Negative
- ⚠️ AudioWorklet and Worker need HTTP serving and service-worker cache entries
- ⚠️ Stage 4 comes after matcher tests pass

## Code References

- Existing capture pattern: `js/recorderWorklet.js`
- Existing load path: `js/sessionRecorder.js`

## Notes

Imported from the Pitch Trainer Improvement minispec. Reviewed on 2026-08-13.
This work is Stage 4. Stage 1 can still run on the analyser loop while tests
prove scoring.
