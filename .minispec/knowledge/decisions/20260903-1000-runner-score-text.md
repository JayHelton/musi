---
type: decision
id: 20260903-1000-runner-score-text
date: 2026-09-03
status: accepted
supersedes: null
superseded_by: null
impacts:
  - js/tab/gp5.js
  - js/tab/guitarPro.js
  - js/runnerExerciseModel.js
  - js/runnerNoteText.js
  - js/pitchRunner.js
  - js/runnerExerciseView.js
  - service-worker.js
tags: [pitch, runner, vocal, guitar-pro]
participants: [Jarrett Helton]
---

# The Pitch Runner prints the text a Guitar Pro score writes over a note

## Context

A vocal warm-up score is not only a list of pitches. The writer puts a free
text over each beat: "mee", "may", "lip trill", "hum". That text names the
vowel and the exercise for that pitch. A section marker names the whole
section in the same way.

Both parsers read that text and threw it away. The GP5 reader skipped the
beat text bytes, and the GPIF reader never looked at `<FreeText>`. A run
imported into the Pitch Runner therefore held pitches and nothing else, and
the singer had to keep the file open beside the game to know what to sing.

Musi also keeps its own section notes for a score, under
`musi.gpAnnotations`. A singer can write "hum, then ee" on bars 5 to 8 in the
Guitar Pro player. The runner could not read those either.

## Options Considered

### Option 1: Show the text of the score only in the exercise picker
Print the whole text once, above the game.
- ✅ Very small change
- ❌ The singer must map a list of words onto the bars while singing
- ❌ A long warm-up prints a wall of text

### Option 2: Carry the text onto each note and print it as the note plays
Keep the text on the note, print it on the bar, and name the note at the hit
line above the stage.
- ✅ The instruction arrives with the pitch it belongs to
- ✅ The same data feeds the note list, so the singer reads the plan first
- ❌ The note list of a run gains two fields
- ❌ Both parsers must keep data they used to drop

## Decision

We chose **Option 2**.

Both parsers keep the free text of a beat on `model.beats[].text`. The Guitar
Pro import of a run copies it onto the note, together with `scoreBeat`, the
beat the note sat on in the source score. The beat text wins over the section
marker of its bar, and the marker names the first note of a section that
carries no beat text.

`scoreBeat` also lets a saved section note find its notes again. The stage
reads the section notes of the same score, under the attachment key and under
the file name and byte length, and fills every note that is still bare. The
narrowest section note wins.

The stage prints the text in two places. Each bar prints the text the score
writes on it. One line above the canvas names the note at the hit line, and it
holds that text until the score writes a new one, because a written
instruction still holds over the notes that follow it.

## Consequences

### Positive
- ✅ A vocal warm-up tells the singer what to do with each pitch
- ✅ The Vocal tab of Practice Lab gains this with no code of its own
- ✅ The section notes a singer writes in the GP player reach the runner

### Negative
- ⚠️ A run saved before this change holds no text; a new import reads it again
- ⚠️ A long text on a short bar prints cut, with an ellipsis

### Neutral
- A run with no text shows no text field, so the stage keeps its height
- A harmony run prints its interval as before: no run holds both

## Code References

- Parse: `js/tab/gp5.js:readBeat()`, `js/tab/guitarPro.js` (`FreeText`)
- Import and section notes: `js/runnerExerciseModel.js`
- Pure text helpers: `js/runnerNoteText.js`
- Drawing and readout: `js/pitchRunner.js:drawBarLabel()`, `updateNoteText()`
- Tests: `tests/pitch/notetext.mjs`, `tests/exercises/runner-model.mjs`,
  `tests/gp-player/parse.mjs`

## Related Decisions

- `20260829-1100-runner-pitch-window`
