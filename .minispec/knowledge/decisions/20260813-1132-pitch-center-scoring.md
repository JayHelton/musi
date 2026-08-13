---
type: decision
id: 20260813-1132-pitch-center-scoring
date: 2026-08-13
status: accepted
supersedes: null
superseded_by: null
impacts:
  - js/pitchMetrics.js
  - js/pitchMatch.js
  - js/pitchTrainer.js
  - js/pitchRunner.js
  - tests/pitch/
tags: [pitch, scoring]
participants: [Jarrett Helton]
---

# Score pitch center, not time in a band

## Context

The current matcher adds hold time while the sung pitch stays inside a
tolerance band. Easy mode uses a ±40-cent band. A constant pitch at +39 cents
can pass. A grace window also keeps progress during repeated errors. An
off-center vibrato can pass because it enters the band many times.

The trainer must teach the user to sing at the center of a note. It must also
accept normal human pitch movement.

## Options Considered

### Option 1: Keep time-in-band scoring
Keep `createPitchMatcher()` as a hold timer inside a tolerance band.
- ✅ Simple to explain
- ✅ Already in use
- ❌ A sharp or flat note can pass if it stays inside a wide band
- ❌ Disconnected in-tune fragments can add up to a pass

### Option 2: Require every sample inside ±5 cents
Treat the bullseye as the pass rule.
- ✅ Strict center
- ❌ Normal vibrato and small vocal movement fail

### Option 3: Pitch-center metrics in one rolling window
Use a clarity-weighted median cent error as the pitch center. Grade stability
from that center. Pass only when all required metrics are valid in the same
rolling window.
- ✅ Measures the sung center
- ✅ Allows short movement around the center
- ✅ Fragments cannot combine into a pass
- ❌ More code than a hold timer

## Decision

We chose **Option 3** because it matches the teaching goal.

Use a ±5-cent zone as the visual bullseye. Use a ±10-cent pitch-center limit as
the default Center profile pass rule. Do not require every sample to stay
inside ±5 cents.

## Consequences

### Positive
- ✅ A constant +39-cent tone fails every profile
- ✅ A stable +9-cent tone can pass Center
- ✅ A stable +11-cent tone fails Center

### Negative
- ⚠️ Callers must feed timestamped samples, not frame counts
- ⚠️ Companion tools that still use `createPitchMatcher()` need a compatible
  wrapper or a later migration

### Neutral
- Drift is reported. Drift is not a pass rule in the first implementation.

## Code References

- Current matcher: `js/pitchMatch.js:createPitchMatcher()`
- Planned metrics: `js/pitchMetrics.js`

## Notes

Imported from the Pitch Trainer Improvement minispec. Reviewed on 2026-08-13.
The user already chose this design. This record stores that choice.
