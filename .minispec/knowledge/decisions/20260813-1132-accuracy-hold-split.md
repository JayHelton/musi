---
type: decision
id: 20260813-1132-accuracy-hold-split
date: 2026-08-13
status: accepted
supersedes: null
superseded_by: null
impacts:
  - js/pitchMetrics.js
  - js/pitchTrainer.js
  - index.html
tags: [pitch, profiles]
participants: [Jarrett Helton]
---

# Split accuracy profiles from hold duration

## Context

The current Challenge control mixes accuracy and endurance. Quick, Easy,
Medium, Hard, and Expert each set both `holdMs` and `toleranceCents`. A longer
hold is also a tighter band. Accuracy and endurance are different skills.

## Options Considered

### Option 1: Keep combined difficulty presets
- ✅ One control
- ❌ The user cannot practice a long hold at a learnable accuracy

### Option 2: Separate profile and hold duration
Replace the five difficulties with Learn, Center, and Precision. Add a hold
control with 0.75 s, 1.0 s, 1.5 s, 2.0 s, and 2.5 s. Default to Center and
1.0 s.
- ✅ Accuracy and endurance stay independent
- ❌ Two controls instead of one

## Decision

We chose **Option 2**.

| Profile   | Pitch center | Stability | Coverage band | Required coverage | Voiced coverage |
|-----------|--------------|-----------|---------------|-------------------|-----------------|
| Learn     | ±15¢         | ≤15¢      | ±30¢          | 75%               | 80%             |
| Center    | ±10¢         | ≤10¢      | ±20¢          | 80%               | 85%             |
| Precision | ±5¢          | ≤7¢       | ±15¢          | 85%               | 90%             |

## Consequences

### Positive
- ✅ Default pass requires a pitch center within ±10 cents
- ✅ The user can hold longer without a tighter band

### Negative
- ⚠️ Stored `pitchTrainer.difficulty` values need a one-time map to a profile
  and a hold duration

## Notes

Imported from the Pitch Trainer Improvement minispec. Reviewed on 2026-08-13.
