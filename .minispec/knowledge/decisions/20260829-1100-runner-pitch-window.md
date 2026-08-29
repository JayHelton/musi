---
type: decision
id: 20260829-1100-runner-pitch-window
date: 2026-08-29
status: accepted
supersedes: null
superseded_by: null
impacts:
  - js/pitchRunner.js
  - js/runnerPitchView.js
  - tests/pitch/view.mjs
  - service-worker.js
tags: [pitch, runner, ui]
participants: [Jarrett Helton]
---

# The Pitch Runner shows a pitch window, not the whole range

## Context

The Pitch Runner drew one lane for every semitone between the lowest note and
the highest note of the run. A saved run from a Guitar Pro import can cover
three octaves or more. The canvas is about 300 pixels high, so 45 lanes left
about 6 pixels for each lane. The note names in the left gutter printed on top
of each other and the note bars became thin lines.

## Options Considered

### Option 1: Hide most note names
Keep the whole range on screen and print fewer names.
- ✅ Small change
- ❌ The note bars stay thin and hard to read
- ❌ The singer still cannot see which lane a bar sits in

### Option 2: A pitch window that follows the melody
Show a bounded number of lanes and move the window along the pitch axis with
the notes that play now.
- ✅ Every lane keeps a readable height
- ✅ The bars keep their size on a wide run
- ❌ The whole range is no longer on screen at one time
- ❌ The window must move without a jump

## Decision

We chose **Option 2**. The number of visible lanes comes from the canvas
height, so each lane is at least 17 pixels high. The window never shows more
lanes than the run holds, and it never goes below 12 lanes. The window starts
on the note that sounds now and grows note by note, forward in time first and
then backward, while the notes fit. A rail on the right edge shows the whole
range and the part of it the window holds.

The window moves with an exponential step (a time constant of 0.22 seconds),
so it slides as the melody goes up and comes down. It snaps to its target on
the first frame of a run.

## Consequences

### Positive
- ✅ A three-octave run keeps readable lanes, names, and bars
- ✅ The window leads the melody, because it holds the notes that come next
- ✅ A short run behaves as before: the window holds every lane and stays still

### Negative
- ⚠️ A wide run no longer shows every note of the run at one time
- ⚠️ A leap wider than the window puts the far note off screen until it nears

### Neutral
- The pitch puck holds at the top or the bottom edge when the voice leaves the
  window

## Code References

- Window maths: `js/runnerPitchView.js`
- Window state and drawing: `js/pitchRunner.js:updateView()`, `midiToY()`
- Tests: `tests/pitch/view.mjs`

## Related Decisions

- `20260813-1255-manual-note-progression`
