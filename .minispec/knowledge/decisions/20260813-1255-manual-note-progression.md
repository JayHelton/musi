---
type: decision
id: 20260813-1255-manual-note-progression
date: 2026-08-13
status: accepted
supersedes: null
superseded_by: null
impacts:
  - js/pitchTrainer.js
  - js/pitchRunner.js
  - js/practiceTimer.js
  - index.html
  - css/trainers.css
tags: [pitch, ui, scoring]
participants: [Jarrett Helton]
---

# The Pitch Trainer waits for the singer

## Context

The Pitch Trainer advanced to the next note after a pass. The singer lost
time to find the pitch center. The `auto` feedback mode moved to Result only
after success. That mode hid the meter with `visibility:hidden`. The cent
readout disappeared while the singer worked. The meter also blanked on every
short unvoiced dropout. The display jumped because audio frames updated the
UI about 93 times each second. The practice timer shared the id `pt-status`
with the trainer status line and overwrote it.

## Options Considered

### Option 1: Keep auto advance and auto feedback
Keep automatic note advance and automatic feedback mode changes.
- ✅ Fewer button presses for fast drills
- ❌ The note moves before the singer finds the center
- ❌ Result only hides the meter during center work
- ❌ Short dropouts blank the puck and cent readout

### Option 2: Manual advance, live default, stable display
Remove auto advance from the Trainer. Default feedback mode is Live. The
singer presses `Next note` to move on. Render the meter on
`requestAnimationFrame`. Hold the puck for 350 ms through short dropouts.
Reset capture on lockout edges only, not on every locked frame.
- ✅ The singer stays on one note until ready
- ✅ The meter and cent readout stay visible in Live mode
- ✅ The display does not jump or blank on brief silence
- ❌ The singer must press a button after each note
- ❌ Live mode shows more detail than some users want

## Decision

We chose **Option 2** because the user trains pitch center, not speed through
a sequence. Live feedback must stay visible while the singer adjusts. The
Pitch Runner keeps automatic progression because it is a scrolling game.

## Consequences

### Positive
- ✅ The Trainer never advances by itself
- ✅ The meter holds through dropouts shorter than 350 ms
- ✅ Silence uses a neutral puck colour, not the error colour
- ✅ Guide lockout no longer resets capture on every locked frame
- ✅ A zero-cent result reads `Center: on target`
- ✅ The practice timer no longer overwrites trainer status

### Negative
- ⚠️ The singer must press `Next note` after each attempt
- ⚠️ Users who relied on auto advance must change habit

### Neutral
- Stored `auto` feedback mode migrates to `live` on load
- `auto` remains a selectable mode for users who want it

## Code References

- Manual note advance: `js/pitchTrainer.js:ptNext()`
- Meter render loop: `js/pitchTrainer.js:renderLoop()`
- Runner frame handler: `js/pitchRunner.js:handleRunnerPitchFrame()`

## Related Decisions

- `20260813-1203-guide-lockout-window-start`

## Notes

The old `Skip` button became `Next note`. The function `ptSkip()` became
`ptNext()`. The flag `pt.awaitingRelease` stops one sustained note from
logging many passes. A breath or a move past 20 cents from center arms the
next attempt on the same note. Direction text uses hysteresis: `Center` up to
5 cents, `Sharp` or `Flat` past 8 cents. Cent readout updates at most every
66 ms.
