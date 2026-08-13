---
type: decision
id: 20260813-1132-exact-guide-tone
date: 2026-08-13
status: accepted
supersedes: null
superseded_by: null
impacts:
  - js/pitchTrainer.js
  - js/pitchRunner.js
tags: [pitch, audio]
participants: [Jarrett Helton]
---

# Use exact-frequency guide oscillators

## Context

The trainer plays layered oscillators at −5 cents and +7 cents. Those layers
create beating around the target. The singer hears a chord, not one pitch.

## Options Considered

### Option 1: Keep detuned layers
- ✅ Richer timbre
- ❌ Beating around the target

### Option 2: Exact-frequency sine and triangle
Both oscillators use the same fundamental. Neither oscillator uses detune.
- ✅ One clear pitch
- ❌ Slightly thinner timbre

## Decision

We chose **Option 2**.

Keep the current guide-tone scoring lockout until the release tail and the room
tail are complete. Guide-tone samples never count.

## Consequences

### Positive
- ✅ The reference pitch matches the target MIDI note
- ✅ The existing bleed lockout stays in place

### Negative
- ⚠️ The drone sounds less thick than the current mix

## Code References

- Trainer layers: `js/pitchTrainer.js` `GUIDE_DRONE_LAYERS`
- Runner layers: `js/pitchRunner.js` `GUIDE_LAYERS`

## Notes

Imported from the Pitch Trainer Improvement minispec. Reviewed on 2026-08-13.
The tuner reference tone already uses the same frequency on sine and triangle.
Follow that pattern.
