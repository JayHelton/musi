---
type: decision
id: 20260813-1132-voiced-display-split
date: 2026-08-13
status: accepted
supersedes: null
superseded_by: null
impacts:
  - js/pitch.js
  - js/pitchMatch.js
  - js/pitchTrainer.js
  - js/vocalTrainer.js
tags: [pitch, detection]
participants: [Jarrett Helton]
---

# Separate voiced detection from display hold

## Context

`createPitchTracker()` holds the last frequency during a short dropout so the
note label does not flicker. The matcher currently scores that held frequency.
Silence and low-confidence audio can add progress.

## Options Considered

### Option 1: Stop holding display values
Report no pitch during every dropout.
- ✅ Scoring stays honest
- ❌ The tuner and meter flicker on short gaps

### Option 2: Return voiced and display fields
Keep a held `displayFrequencyHz` for the meter. Set `voiced` to `false` during
the dropout. Score only samples where `voiced` is `true`.
- ✅ Display stays stable
- ✅ Scoring ignores silence
- ❌ Callers must use the new fields

## Decision

We chose **Option 2**.

`createPitchTracker()` returns:

```text
{ frequencyHz, displayFrequencyHz, voiced, clarity, rms, noteInfo }
```

The tracker can hold `displayFrequencyHz` during a short dropout. The tracker
must set `voiced` to `false` during that dropout.

## Consequences

### Positive
- ✅ A held display value during silence does not count as voiced input
- ✅ Tuner and trainer meters can keep a short hold

### Negative
- ⚠️ Existing callers that read `freq` must move to the new fields

## Code References

- Current tracker: `js/pitch.js:createPitchTracker()`

## Notes

Imported from the Pitch Trainer Improvement minispec. Reviewed on 2026-08-13.
Keep the MPM detector. Do not replace it without test evidence.
