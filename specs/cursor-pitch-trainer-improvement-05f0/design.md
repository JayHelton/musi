---
feature: cursor-pitch-trainer-improvement-05f0
status: planned
created: 2026-08-13
decisions:
  - 20260813-1132-pitch-center-scoring
  - 20260813-1132-accuracy-hold-split
  - 20260813-1132-voiced-display-split
  - 20260813-1132-worklet-worker-detector
  - 20260813-1132-exact-guide-tone
source: User minispec "Musi Pitch Trainer Improvement Specification"
---

# Pitch Trainer Improvement Design

## Overview

The Pitch Trainer must teach the user to sing at the center of a note. It must
also accept normal human pitch movement. Success is a pitch-center measurement
in one rolling window. Success is not time spent inside a wide tolerance band.

Pitch stays a standalone tool. Tuner, Reference, Trainer, and Runner remain.
The trainer does not require a routine, a timer, or a practice session.

## User Stories

- As a singer, I want a pass to mean my pitch center is near the target so that
  a constant sharp or flat note cannot pass.
- As a singer, I want a ±5-cent bullseye on a ±50-cent meter so that I can see
  the center without a ±200-cent scale.
- As a singer, I want Center, Land, Interval, and Pattern tasks so that I can
  train entry, intervals, and scales without a duplicated Runner.
- As a singer, I want Straight Tone by default and Vibrato as an option so that
  vibrato is graded by its center line.
- As a singer, I want live, reduced, and result-only feedback so that I can
  stop tracking the meter after I succeed.
- As a singer, I want Runner accuracy from pitch error and voiced coverage so
  that a constant +29-cent tone is never Centered.
- As a singer, I want attempt evidence by note and register so that I can see
  weak notes without a streak system.

## Components

### Pitch metrics (`js/pitchMetrics.js`)

Shared analysis for Trainer and Runner. All calculations use timestamps. None
use frame counts.

Sample:

```text
{ timestampMs, frequencyHz, centsFromTarget, clarity, rms, voiced }
```

Attempt result:

```text
{
  targetMidi, startTimestampMs, endTimestampMs,
  centerErrorCents, stabilityCents, meanAbsoluteErrorCents,
  inTuneCoverage, voicedCoverage, settleTimeMs, driftCentsPerSecond,
  passed, failureReason
}
```

Metrics:

- Pitch center: clarity-weighted median cent error. Positive is sharp.
- Stability: clarity-weighted median absolute deviation from the pitch center.
  Do not measure stability from the target note.
- Mean absolute error: clarity-weighted mean absolute cent error from the
  target.
- In-tune coverage: time-weighted share of analyzed time inside the profile
  stability band.
- Voiced coverage: share of the scoring window with a confident fundamental.
  Do not count a held display value as voiced input.
- Settle time: ignore the first 250 ms after voiced onset. Measure time from
  voiced onset to the first stable pitch-center period.
- Drift: pitch-center slope in cents per second. Report sharp or flat. Do not
  use drift as a pass rule in the first implementation.

Rolling window reset when:

- The unvoiced gap is longer than 250 ms.
- The detected pitch stays more than 50 cents from the target for longer than
  200 ms.
- The target note changes.
- The guide tone starts.
- The user skips the note.

Exclude the first 250 ms after voiced onset from sustain scoring. Pass only
when all required metrics are valid in the same rolling window. Do not add
separate in-tune fragments.

### Pitch tracker (`js/pitch.js`)

Keep the MPM detector, RMS and clarity gates, median smoothing, note
hysteresis, and short dropout handling. Return:

```text
{ frequencyHz, displayFrequencyHz, voiced, clarity, rms, noteInfo }
```

Hold `displayFrequencyHz` during a short dropout. Set `voiced` to `false`
during that dropout. Score only `voiced === true` samples.

Add an adaptive noise floor in Stage 4. Measure ambient RMS before each
attempt. Set the active RMS gate above that floor.

### Pitch matcher (`js/pitchMatch.js`)

Replace the hold-in-band matcher with a wrapper around `pitchMetrics.js`. Keep
`centsOffFromTarget`, `freqToMidiFloat`, and `midiToLabel`. Companion tools in
`js/exerciseCompanions/pitchTrain.js` and `js/studyLabMic.js` must keep working.
Use Center defaults when a caller still passes `holdMs` and `toleranceCents`.

### Accuracy profiles and hold duration

Replace Quick, Easy, Medium, Hard, and Expert.

| Profile   | Pitch center | Stability | Coverage band | Required coverage | Voiced coverage |
|-----------|--------------|-----------|---------------|-------------------|-----------------|
| Learn     | ±15¢         | ≤15¢      | ±30¢          | 75%               | 80%             |
| Center    | ±10¢         | ≤10¢      | ±20¢          | 80%               | 85%             |
| Precision | ±5¢          | ≤7¢       | ±15¢          | 85%               | 90%             |

Hold duration control: 0.75 s, 1.0 s, 1.5 s, 2.0 s, 2.5 s. Default 1.0 s.
Default profile is Center. Do not connect pitch accuracy to hold duration.

Map stored `pitchTrainer.difficulty` values once:

- `quick` and `easy` → Learn, keep nearest hold
- `medium` → Center
- `hard` and `expert` → Precision

### Trainer tasks (`js/pitchTrainer.js`, `js/pitchExercises.js`)

Add a Task control above the pattern control.

- **Center**: Play one reference note. Ask the user to sustain it. Select
  targets from the full configured working range. Use adaptive selection. Give
  more attempts to notes with large errors or recent failures. Require two
  consecutive passes before the scheduler reduces the priority of a note.
- **Land**: Play one reference note. Measure entry. Report initial direction,
  scoop or overshoot, settle time, final pitch center, and sustain stability.
- **Interval**: Play an anchor note. Do not play the target. Ask the user to
  sing the selected interval. Support ascending and descending intervals.
- **Pattern**: Keep the existing scale and arpeggio library.
- **Melody**: Point the user to Pitch Runner. Do not duplicate Runner inside
  Trainer.

For Center and Land, use all chromatic notes in the selected range.

### Vocal range

Never generate a target outside the selected range. Validate every generated
sequence before training starts. If a pattern does not fit: place it in another
valid octave, use a smaller pattern, or disable Start and explain that the
pattern does not fit. Do not silently generate an out-of-range note.

Keep existing general presets. Also support saved custom presets. Example
presets for the current user: Chest F2–D4, Mix E4–B4, Head as a user-selected
comfortable range. Do not use a maximum possible note as a normal working-range
limit.

### Straight tone and vibrato

Straight Tone is the default. Grade pitch center, stability, coverage, and
voiced coverage.

Vibrato estimates the center line of the pitch contour. Grade that center line
against the target. Report extent, rate, symmetry, and center-line drift. Do
not grade each vibrato peak as an independent pitch error. Require at least
90% of the contour to stay within ±50 cents of the target. Do not enforce one
genre-specific rate or extent.

### Unpitched input

Show `No stable fundamental` when the input does not have enough clarity. Do
not report sharp or flat for breath, noise, or most false-cord screams. Analyze
a harsh vocal only when the detector finds a stable fundamental.

### Guide tone

Remove detuned layers. Use exact-frequency sine and triangle oscillators. Score
only when the analysis window start is after audible end plus a 0.6 s room tail.
Reset capture and matcher at lockout start and at the first clear frame.

### Trainer interface

Keep the four-tab Pitch layout from `js/screenUx.js`. Keep Setup collapsed by
default.

Live elements: target note, detected note, signed cent error, sharp or flat
direction, pitch-center zone, hold progress, input-confidence state.

Meter range: ±50 cents. Overflow indicator when the pitch is more than 50 cents
from the target.

Visual zones:

- Bullseye: ±5 cents
- Default pass center: ±10 cents
- Close: ±20 cents
- Off center: more than ±20 cents

Smooth the display for 100–150 ms. Do not smooth scoring data enough to hide
real pitch drift.

After each attempt show:

```text
Center: 7¢ sharp
Stability: ±9¢
Settled: 420 ms
Result: Passed
```

Correction text:

- `Move slightly lower`
- `Move slightly higher`
- `The note starts flat and then reaches the center`
- `The sustain drifts sharp`
- `The pitch is centered but unstable`
- `No stable fundamental`

Do not use only `Nice!` or `Miss`.

Feedback modes: Live, Reduced, Result only. Use Live on the first attempt.
Reduce after a successful attempt. Use Result only after two consecutive
successful attempts. The user can lock one mode.

### Pitch Runner (`js/pitchRunner.js`)

Assign each detected sample to the target note by its audio timestamp. Correct
for analysis-window delay and available input latency.

Per-note metrics: pitch center, mean absolute error, voiced coverage, in-tune
coverage.

```text
errorScore = clamp(1 - meanAbsoluteErrorCents / 50, 0, 1);
noteAccuracy = 100 * errorScore * voicedCoverage;
```

Result rules:

- Centered: pitch center within ±10 cents and mean absolute error at most 15
  cents.
- Close: pitch center within ±20 cents and mean absolute error at most 25
  cents.
- Miss: all other results.

A constant note at +29 cents must never receive Perfect or Centered. Overall
accuracy is the mean note accuracy. Combo is consecutive Centered notes only.

### Audio capture (`js/audio.js`, worklet, worker)

Inspect `MediaStreamTrack.getSettings()`. Do not assume the browser applied
the requested constraints.

Request raw mono audio when the browser supports it:

```text
{ echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }
```

Use a safe fallback when a device rejects these constraints.

Stage 4 pipeline:

1. AudioWorklet for fixed capture timing.
2. Send analysis windows to a Web Worker.
3. Run pitch detection in the worker.
4. Return timestamped pitch samples to the UI.
5. Reuse typed arrays when possible.

Add a development benchmark. Keep one active microphone tool. Each stopped tool
must release its microphone stream. Microphone denial must leave the interface
in a recoverable state.

### Persistence

Save evidence, not only a pass count. Store each completed attempt locally:

```text
{
  timestamp, task, targetMidi, profile, holdDurationMs,
  centerErrorCents, stabilityCents, meanAbsoluteErrorCents,
  voicedCoverage, inTuneCoverage, settleTimeMs, passed
}
```

Show progress by note and register. Trends: average absolute pitch-center
error, sharp or flat bias, stability, settle time, pass rate, weak notes. Do
not add a general streak system.

## Data Model

- **PitchSample**: timestamped voiced or unvoiced observation.
- **AttemptResult**: scored window against one target MIDI note.
- **AccuracyProfile**: Learn, Center, or Precision limits.
- **TrainerTask**: Center, Land, Interval, Pattern.
- **RangePreset**: general or saved custom low/high MIDI.
- **AttemptRecord**: local evidence row for trends.
- **RunnerNoteResult**: Centered, Close, or Miss plus note accuracy.

## API / Interface

Public functions in `js/pitchMetrics.js` (names can match the implementation):

- `createScoringWindow(profile, holdMs, style)`
- `updateWindow(sample)` → live snapshot
- `finalizeAttempt()` → `AttemptResult`
- `analyzeVibrato(samples)` → extent, rate, symmetry, center-line drift
- `correctionText(result)` → one of the required strings
- `validateSequence(midis, low, high)` → ok or error
- `selectNextTarget(range, history)` → MIDI note
- `scoreRunnerNote(samples, targetMidi, startMs, endMs)` → note result

HTML keeps `#sec-tuner` and the four Pitch tabs. Trainer Setup gains Task,
Profile, Hold, Style, and Feedback controls. The meter scale changes to ±50
cents.

## Scope

In scope: the listed Pitch JS files, related Pitch HTML and CSS, related
tests, service-worker cache names for new files.

Out of scope: unrelated Musi features, a backend, a streak system, a duplicated
Runner inside Trainer, replacement of MPM without test evidence.

## Delivery stages

1. Scoring correctness. Do not continue until matcher tests pass.
2. Training methodology.
3. Runner correction.
4. Audio performance.
5. Progress evidence.

Each stage must stay independently testable.

## Tests

Automated tests live under `tests/pitch/` and run with
`node tests/pitch/run.mjs`. Required cases:

1. A stable 0-cent tone passes Center.
2. A stable +9-cent tone passes Center.
3. A stable +11-cent tone fails Center.
4. A stable +39-cent tone fails all profiles.
5. Separate in-tune fragments do not combine into a pass.
6. A held display value during silence does not count as voiced input.
7. A ±30-cent vibrato centered at 0 cents passes the Vibrato center test.
8. A ±30-cent vibrato centered at +25 cents fails.
9. Results are equivalent at 30, 60, and 120 UI frames per second.
10. Guide-tone samples never count.
11. Generated targets stay inside the selected range.
12. An invalid range or pattern produces a clear error.
13. Runner does not mark a constant +29-cent tone as Centered.
14. Noise and breath return `No stable fundamental`.
15. Harmonic-rich input selects the fundamental instead of an octave.
16. Missing-fundamental test audio selects the correct fundamental.
17. Stable synthetic tones from C2 through C6 stay within ±2 cents.
18. Each stopped tool releases its microphone stream.
19. Only one microphone tool can run at one time.
20. Microphone denial leaves the interface in a recoverable state.

Manual checks for Android Chrome, Desktop Chrome, built-in and external mics,
headphones, speaker guide tone, quiet and noisy rooms, chest/mix/head, straight
tone, vibrato, and unpitched input live in
`specs/cursor-pitch-trainer-improvement-05f0/manual-checklist.md`.
Do not claim a device passed unless it was tested.

## Open Questions

None. The user minispec already chose the design. Implementation may flag
minor drift with `flag-and-continue`.
