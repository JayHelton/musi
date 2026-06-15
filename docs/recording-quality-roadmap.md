# Recording & Sampling Quality Roadmap

This document tracks the plan to drastically improve the recording/sampling
feature in Musi (`js/recorder.js`, `js/recorderWorklet.js`, `css/recorder.css`,
and the `#sec-recorder` section of `index.html`).

**Phases 1 and 2 are implemented.** This document is the planning record for the
remaining phases (3, 4, and 5).

## Status summary

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 1 | Fix the capture chain (constraints, sample rate, bitrate) | Implemented |
| 2 | Lossless WAV capture + high-pass + peak-normalize | Implemented |
| 3 | Input controls & metering (gain, clip indicator, device picker, monitoring) | Planned |
| 4 | "Sampling" from the app's own audio graph | Planned |
| 5 | Better live analysis (pitch tracking, key estimation) | Planned |

## What shipped in Phases 1 & 2 (context for later work)

These are the building blocks the remaining phases extend:

- **Music-tuned mic constraints** (`buildMicConstraints` in `js/recorder.js`):
  `echoCancellation`, `noiseSuppression`, and `autoGainControl` are disabled;
  `channelCount: 1` and `sampleRate: 48000` are requested when supported.
- **48 kHz AudioContext** hint in `js/audio.js` (`ensureAudio`).
- **Shared processing chain** built per recording in `buildCaptureGraph`:
  `mic source -> highpass(25 Hz) -> captureGain -> {analyser, PCM tap, MediaStream dest}`.
  Both the lossless and compressed paths run through this chain, so the
  high-pass filter applies to either output.
- **Lossless WAV path**: an `AudioWorkletNode` (`js/recorderWorklet.js`) buffers
  raw Float32 PCM, with a `ScriptProcessorNode` fallback. On stop the PCM is
  optionally peak-normalized and encoded to 16- or 24-bit WAV (`encodeWav`).
- **Compressed path**: `MediaRecorder` records the processed `MediaStream`
  destination at `audioBitsPerSecond = 256000` using the best supported codec.
- **Persisted options** via `js/persistence.js`: `recFormat`, `recBitDepth`,
  `recNormalize`, surfaced in the recorder UI.

The `captureGain` node added in Phase 1/2 is intentionally the integration point
for Phase 3's input gain control.

---

## Phase 3 — Input controls & metering

**Goal:** make high-quality results reliably achievable by giving users level
control, honest metering, device choice, and optional monitoring.

### 3.1 Input gain
- Reuse the existing `recorder.captureGain` node (already in the graph) and bind
  its `gain.value` to a slider.
- Range: roughly -24 dB to +24 dB, default 0 dB; convert dB <-> linear.
- Persist as `recGain` via `getSetting`/`saveSetting`.
- Apply live so users can adjust before/while recording.

### 3.2 True-peak meter + clip indicator
- Upgrade `updateMeter`/`recordLoop` from RMS-only to show both an RMS bar and a
  peak hold marker.
- Track the max absolute sample per frame; latch a **clip** state (red) when
  samples reach >= ~0.99 and hold it for ~1.5 s so brief overloads are visible.
- Add a small "CLIP" badge to `#sec-recorder` and the hold-to-record overlay.

### 3.3 Device picker
- Use `navigator.mediaDevices.enumerateDevices()` to list `audioinput` devices.
- Render a `<select>`; pass the chosen `deviceId` into `buildMicConstraints`
  (`audio.deviceId = { exact }`).
- Refresh the list on `devicechange`. Labels are only populated after the first
  `getUserMedia` permission grant — handle the empty-label case gracefully.
- Persist `recDeviceId`; fall back to default if the device disappears.

### 3.4 Optional input monitoring
- Add a "Monitor" toggle that connects `captureGain` to the audio destination
  (through the existing master chain) so players can hear themselves.
- Warn about latency; default **off** to avoid feedback with built-in mics.
- Ensure monitoring is torn down in `teardownCaptureGraph`/`stopRecorder`.

### Phase 3 testing notes
- Requires real microphone hardware and (ideally) an external interface, so the
  device picker and monitoring paths need manual verification on a real device.
- Verify clip latch triggers on a deliberately hot signal and clears after hold.

---

## Phase 4 — Sampling from the app's own audio

**Goal:** turn the mic recorder into a true sampler that can capture Musi's own
synth, keyboard, drones, metronome, and backing track.

### 4.1 Capture tap in the audio graph
- In `js/audio.js`, expose a clean pre-master tap node (before the playback
  compressor/limiter and master gain) so sampled output is unprocessed by the
  monitoring chain.
- Add an exported helper, e.g. `getCaptureTap()`, returning a node that mirrors
  everything routed to the speakers.

### 4.2 Source selector
- Add a source toggle in the recorder UI: **Microphone** vs **App audio**.
- For **App audio**, skip `getUserMedia` entirely; feed the capture tap into the
  same `highpass -> captureGain -> {analyser, PCM tap / MediaStream dest}` chain
  already built in Phase 1/2.
- The WAV and Opus paths, normalize, bit depth, and analysis all work unchanged
  because they consume the shared chain.

### 4.3 Considerations
- App-audio capture is silent unless a tool is producing sound; show a hint when
  no signal is detected.
- Consider a "both" mode (mic + app) by summing the two sources into
  `captureGain` for sampling along to a backing track.
- The high-pass at 25 Hz is harmless for synth content; keep it but make the
  cutoff configurable if needed.

### Phase 4 testing notes
- Largely testable in-browser without special hardware: open the keyboard or
  metronome, record "App audio", and confirm the WAV/Opus output matches.

---

## Phase 5 — Better live analysis

**Goal:** make the pitch readout and key estimate stable and accurate; this is
about the quality of the *analysis*, not the captured audio.

### 5.1 Centralize and harden pitch detection
- `autoCorrelate` is currently duplicated in `js/recorder.js` and
  `js/vocalTrainer.js`. Extract a single shared implementation (e.g. in
  `js/theory.js` or a new `js/pitch.js`).
- Make detection sample-rate-independent (it already takes `sampleRate`, but
  thresholds and window assumptions should be reviewed for 48 kHz).
- Apply a **Hann window** and/or larger frames for low-note stability.

### 5.2 Smoothing & gating
- Median-filter the detected pitch over the last N frames to remove octave jumps
  and flicker.
- Add an RMS/clarity gate so noisy or breathy frames don't register spurious
  notes (reduces false entries in the detected-pitch sequence).

### 5.3 Better key estimation
- Weight the Krumhansl-Schmuckler profile by **committed sustained notes**
  (duration-weighted) rather than per-frame `pcWeights`, so brief passing tones
  don't skew the detected key.
- Optionally show a confidence value next to the detected key.

### Phase 5 testing notes
- Verifiable with recorded/sample audio; compare detected key/pitches against
  known input. Some manual listening verification with a real instrument is
  ideal.

---

## Suggested sequencing

Phases 3-5 are independently shippable. A reasonable order:

1. **Phase 3** (input gain + clip meter first; device picker and monitoring
   after) — biggest reliability win for everyday users.
2. **Phase 4** — unlocks the "sampling" half of the feature name and is mostly
   testable in-browser.
3. **Phase 5** — analysis polish; can land anytime since it is orthogonal to the
   capture path.
