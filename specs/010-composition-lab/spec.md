# Feature Specification: Composition Lab

**Feature Branch**: `claude/composition-lab-feature-qse1d5`

**Created**: 2026-08-30

**Status**: Implemented

**Input**: Turn the theory and composition study workflow into an interactive
Practice Lab feature that trains the loop `hear → identify → map → write →
transform → explain`. It replaces the Chords and Scales tab of the Practice Lab.
Chords and Scales stay available as references, and Intervals joins them.

## Why this feature exists

The Practice Lab Theory tab displayed theory. It answered "what are the notes of
this key?" well, and it answered "what do I write with them?" not at all. A
player could read the whole tab and still have no idea. Composition Lab replaces
display with practice: it asks first, it accepts an answer, and it shows the
reference answer second.

The three references did not go away. They moved into a drawer that opens over
the workspace, and an Interval Reference joined them, so the theory a writer
needs is one tap from the exercise instead of one screen away.

## User Scenarios

### User Story 1 - One exercise, right now (Priority: P1)

A player opens Practice Lab and taps Composition. The context row already reads
`Guitar · Standard · C · Minor`. Musi opens one exercise: "Write the formula of
Natural Minor in scale degrees." The player types an answer and presses Check.
Musi shows the reference formula. The player presses Next and gets another
exercise.

**Independent Test**: Open the tab, answer one exercise, press Check, press Next.
Confirm the second exercise differs from the first.

### User Story 2 - The references never leave (Priority: P1)

Halfway through a written answer the player taps Scales. A drawer opens over the
workspace with the notes, the degrees, the step pattern, and the neck. The player
closes it. Every word they typed is still there.

**Independent Test**: Type an answer, open each of the three references, close
the drawer, and confirm the answer survived.

### User Story 3 - The whole loop in order (Priority: P1)

The player taps Guided Session. Musi builds six exercises, one per activity, and
runs them in order: Recall, Hear, Map, Write, Transform, Explain. A row of steps
above the card shows where the player is and marks the ones already finished.

**Independent Test**: Start a guided session and press Next five times. Confirm
the activity label reads recall, hear, map, write, transform, explain in order.

### User Story 4 - Any key, any tuning, any instrument (Priority: P1)

The player loads the `Drop A# · Phrygian Dominant` preset. Every exercise now
names A# (spelled Bb) and Phrygian Dominant, and the fretboard work uses the Drop
A# string set. The player then switches the instrument to Keys. The neck
exercises stop appearing and the loop still runs all six activities.

**Independent Test**: Load each preset and run a guided session. Confirm no
prompt names a key or a tuning the context did not set.

### User Story 5 - Rhythm before pitch (Priority: P2)

An exercise asks for six attacks across sixteen sixteenth-note slots, with a
three-slot rest, an adjacent pair, and one offbeat attack. The player taps slots
or presses Randomize. Musi says whether the grid meets the brief. Only then does
the player press Assign degrees and choose what each attack plays.

**Independent Test**: Open the attack grid, press Randomize, and confirm the grid
meets the brief. Confirm no pitch control appears until the player asks for it.

### User Story 6 - What stays and what changes (Priority: P2)

The player opens Motif Lab, writes the original idea, and names the motif
identity. Each of the five variants carries a transformation card, and each card
states `Preserve: X` and `Change: Y` above the note field.

**Independent Test**: Open Motif Lab and confirm every variant shows a preserve
line and a change line, and that the preserve line repeats the motif identity.

## Requirements

### Functional

- **FR-001** Composition Lab replaces the Chords and Scales tab of Practice Lab.
- **FR-002** Intervals, Scales, and Chords open as a drawer from every exercise.
- **FR-003** Opening or closing a reference preserves the exercise state.
- **FR-004** Study exposes Interval Reference, Scale Reference, and Chord
  Reference, and the Interval Reference is the same component the drawer mounts.
- **FR-005** One theory source of truth. No feature folder keeps a second scale,
  chord, or interval table.
- **FR-006** Every exercise builds from the context. No exercise carries a key,
  a tuning, or a mode of its own.
- **FR-007** A guided session runs Recall, Hear, Map, Write, Transform, Explain.
- **FR-008** The attack grid holds rhythm only. Pitch assignment is a second,
  separate step.
- **FR-009** A motif variant states what it preserves and what it changes.
- **FR-010** A tonal-center exercise can hold one collection and move the home
  note without adding a pitch class.
- **FR-011** Section Lab gives the opening, the verse, and the chorus a different
  transformation constraint each.
- **FR-012** Playability work supports horizontal, one-string writing on a neck.
- **FR-013** The lab saves its context, its run, its answers, its grid, its motif
  family, its lab progress, its song study, and its capstone rubric locally.
- **FR-014** No reference song ships as data. The song study accepts any song.
- **FR-015** Musi asks before it answers. A Check with every field empty asks the
  player to commit first, and a second press reveals the answer anyway.

### Out of scope

Composition Lab is not a digital audio workstation, a tablature editor, a
notation editor, a riff generator, or a curriculum reader. The player makes every
musical decision. Musi holds the brief, the constraint, and the analysis.

## Success Criteria

- **SC-001** A player can finish one exercise inside 60 seconds of opening the
  tab, with no setup.
- **SC-002** Every one of the six activities has at least one exercise on a
  fretted instrument and at least one without a neck.
- **SC-003** Every exercise builds a complete prompt and a complete answer in
  every root of the shared root list and in every collection tested.
- **SC-004** A reload restores the context, the current exercise, and every
  answer the player typed.
