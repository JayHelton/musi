---
type: decision
id: 20260813-1203-guide-lockout-window-start
date: 2026-08-13
status: accepted
supersedes: null
superseded_by: null
impacts:
  - js/pitchGuideLock.js
  - js/pitchTrainer.js
  - js/pitchRunner.js
  - js/pitchCapture.js
tags: [pitch, audio, lockout]
participants: [Jarrett Helton]
---

# Guide lockout uses analysis window start

## Context

Capture `audioTime` is the analysis window end. The trainer scored when
`audioTime >= guideEndsAudioTime`. That let guide audio inside the window
count as singer input. Room tail was too short. The capture smoother and
noise floor could hold guide pitch after lockout.

## Options Considered

### Option 1: Longer mute after guide end
Add more milliseconds after audible end only.
- ✅ Simple change
- ❌ Still uses window end, not window start
- ❌ Does not reset capture or matcher

### Option 2: Window-start lockout plus reset
Score when window start is after audible end plus room tail. Reset capture
on every locked frame. Reset the matcher at lockout start and first clear
frame.
- ✅ Whole window is singer-only
- ✅ Drops held guide pitch from smoother
- ❌ Slightly longer quiet period after guide

## Decision

We chose **Option 2** because it matches how capture reports time and stops
guide bleed from scoring or display.

## Consequences

### Positive
- ✅ Guide playback does not pass the singer
- ✅ Noise floor does not rise during guide
- ✅ Shared helper for Trainer and Runner

### Negative
- ⚠️ Singer must wait ~0.6 s room tail after guide ends

### Neutral
- Replay hold keeps `Infinity` lock until release

## Code References

- Lockout helpers: `js/pitchGuideLock.js`
- Trainer frame handler: `js/pitchTrainer.js:handlePitchFrame()`
- Runner sample push: `js/pitchRunner.js:step()`

## Related Decisions

- `20260813-1132-exact-guide-tone`

## Notes

Room tail is `ROOM_TAIL_SEC = 0.6`. Analysis window length applies only in
`isScoringWindowClear()`, not in `lockoutUntil()`.
