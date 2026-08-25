# Feature Specification: Practice Lab

**Feature Branch**: `claude/practice-session-feature-gnyppl`

**Created**: 2026-08-25

**Status**: Specified

**Input**: User description: "I want a new feature to start a session. You select
instrument, technique for that instruments, then a note for what the target is. You can
then start a timer from preset buttons from 1 to 10 minutes. It has a simplified
metronome automatically built in as a bottom as a horizontal section. Actions in this
session get added to a session log which gets saved in index db so you can reference it
later. It also needs a ratio section that let's you customize thl metronome by ratios.
This helps you transition from sloeer to faster in segements, back and forth. Attach is
an example images. Also have a camera so you can watch yourself play and spot technique
issues. Allow recording the video. Speed training section should loop and speed up. Do
not entirely reuse components. Thing of this as a net new component that coukd he split
into a micro app. It shoukd have DI for db deps and services. You can copy existing
functionality but make sure its built fresh for this use case"

## User Scenarios & Testing *(mandatory)*

Musi has drills, references, and a standalone Metronome. It has no place to run one
deliberate practice session. A player who wants to work on one technique must open the
Metronome, keep the time in their head, watch their hands in a phone camera, and write
notes somewhere else. Nothing keeps a record.

Practice Lab is one screen for one session. The player names the instrument, the
technique, and the target. The player then runs timers, click patterns, and camera
takes. Every action writes a line in the session log. The log survives a reload,
because the browser stores it in IndexedDB.

### User Story 1 - Start a session and put a clock on it (Priority: P1)

A player opens Practice Lab. The player picks "Guitar", then picks "Alternate Picking",
then types the target: "Clean 16ths at 110 BPM on one string". The player presses Start
Session. The player presses the 5m preset and presses Play. The countdown runs to zero
and gives a sound. The log holds the session start and the two timer lines.

**Why this priority**: This is the session. The trainers, the camera, and the history
have no value without a session to hold them.

**Independent Test**: Open the tool, start a session, run a 1 minute timer to zero, and
end the session. Confirm the log shows the start, the timer, and the end. Reload the
page and confirm the session is in the history.

### User Story 2 - Keep time with the built-in metronome (Priority: P1)

The metronome bar sits across the bottom of the session view. The player sets 80 BPM
and presses the start control. The click plays and a light flashes on each beat. The
player raises the tempo with the plus control while the click runs. The player presses
stop. The log holds one metronome line with the tempo range.

**Why this priority**: Practice with a click is the core loop of the feature. The
player must reach the tempo control without leaving the session view.

**Independent Test**: Start the click at 80 BPM, raise it to 100 BPM, and stop it.
Confirm the click stays in time and the log records the run.

### User Story 3 - Alternate two subdivisions with the ratios trainer (Priority: P2)

The player opens the Ratios tab. The player sets 80 BPM, 4 beats, Loop 1 to eighth
notes, and Loop 2 to sixteenth notes. Count In is on. The player presses Start
Training. The click plays four count-in beats, then four beats of eighth notes, then a
repeat count-in, then four beats of sixteenth notes. The pattern repeats until the
player stops it.

**Why this priority**: This is the practice method the player asked for. It moves the
hands between two speeds in short segments, and back again.

**Independent Test**: Run the settings above and count the clicks. Confirm eight clicks
in the eighth-note segment and sixteen clicks in the sixteenth-note segment. Confirm
the count-in plays before each switch.

### User Story 4 - Climb the tempo with the speed trainer (Priority: P2)

The player opens the Speed tab. The player sets 4/4, Start BPM 80, End BPM 100,
increment 5, 4 bars for each loop, and 2 loops before each rise. The player presses
Start Training. The click plays 8 bars at 80 BPM, a short count-in, 8 bars at 85 BPM,
and so on to 100 BPM. The trainer stops at 100 BPM. The log records the top tempo.

**Why this priority**: A tempo ladder is the standard way to build speed. The record of
the top tempo is what the player compares between sessions.

**Independent Test**: Run a short ladder, for example 80 to 90 BPM in steps of 5, with
1 bar for each loop and 1 loop for each step. Confirm the ladder stops at 90 BPM and
the log line names 90 BPM.

### User Story 5 - Watch and record the hands (Priority: P2)

The player opens the camera panel. The browser asks for permission. The mirror shows
the player. The player presses Record, plays for 30 seconds, and presses Stop. The clip
appears in the log with a play control and a delete control. The clip holds the
microphone sound, so the player hears the notes and the click.

**Why this priority**: The player asked to spot technique problems. A live mirror finds
them in the moment; a clip finds them after.

**Independent Test**: Record a short clip and play it back inside the log. Reload the
page, open the session in the history, and confirm the clip still plays.

### User Story 6 - Look at past sessions (Priority: P3)

The player opens the History tab. The list shows each past session with its date,
instrument, technique, target, practice time, and clip count. The player opens one
session and reads the full log.

**Why this priority**: The record is the reason to write the log. It is not needed for
the first practice session, so it comes after the practice surface.

**Independent Test**: Complete two sessions, open the History tab, and confirm both
sessions are in the list with the correct practice time.

### Edge Cases

- The browser blocks IndexedDB. The session runs in memory and the tool shows a notice
  that it cannot save the log.
- The player denies camera permission. The camera panel shows the reason and the rest
  of the session continues.
- The device has no camera or no `MediaRecorder`. The panel says so and hides the
  record control.
- The player leaves the tool with a session open. The session stays open and the tool
  offers to continue it on the next visit.
- The player starts the Metronome tool while a Practice Lab click runs. The lab click
  stops, because one audio owner runs at a time.
- The player starts a second trainer inside the lab. The first trainer stops.
- The player sets End BPM below Start BPM in the speed trainer. The trainer refuses to
  start and states the reason.
- A recording runs past the duration cap or the size cap. The recorder stops itself and
  saves what it holds.
- The player removes the last technique of an instrument. The chip list shows the empty
  state and the free-text field still accepts a technique.

## Requirements *(mandatory)*

### Functional Requirements

**Session**

- **FR-001**: The tool MUST let the player pick one instrument, one technique, and one
  free-text target before a session starts.
- **FR-002**: The tool MUST ship seed catalogs of instruments and techniques.
- **FR-003**: The player MUST be able to add a custom instrument or technique, and to
  remove any entry from either catalog. The change MUST persist.
- **FR-004**: The technique chips MUST show only the techniques of the selected
  instrument, plus the custom techniques of that instrument.
- **FR-005**: The tool MUST write the session record when the session starts, not when
  it ends.
- **FR-006**: The tool MUST let the player end a session, and MUST let the player
  continue an open session after a reload.

**Timer**

- **FR-007**: The timer MUST offer preset buttons from 1 to 10 minutes.
- **FR-008**: The timer MUST show the remaining time, and MUST give a sound at zero.
- **FR-009**: The timer MUST be one tool inside the session. It MUST NOT end the
  session. A session MUST accept any number of timer blocks.

**Metronome bar**

- **FR-010**: The session view MUST hold a compact metronome across the bottom of the
  view, with the tempo, a minus control, a plus control, a start control, and a beat
  light.
- **FR-011**: The tempo range MUST be 30 BPM to 300 BPM.
- **FR-012**: A tempo change while the click runs MUST take effect without a restart.

**Ratios trainer**

- **FR-013**: The ratios trainer MUST hold a tempo, a beat count for each segment, a
  count-in switch, an initial count-in length, a repeat count-in length, and a
  subdivision for Loop 1 and for Loop 2.
- **FR-014**: The subdivisions MUST be quarter notes, eighth notes, triplets, and
  sixteenth notes.
- **FR-015**: The trainer MUST alternate Loop 1 and Loop 2 without an end, until the
  player stops it.
- **FR-016**: When the count-in is on, the trainer MUST play the initial count-in
  before the first segment and the repeat count-in before each later segment.

**Speed trainer**

- **FR-017**: The speed trainer MUST hold a time signature from 2/4 to 7/4, a start
  tempo, an end tempo, a tempo increment, a bar count for each loop, a loop count
  before each rise, a count-in switch, an initial count-in length, and a count-in
  length for each rise.
- **FR-018**: The trainer MUST play the set loops at each tempo, then raise the tempo
  by the increment.
- **FR-019**: The trainer MUST stop at the end tempo and MUST write the top tempo in
  the log.

**Camera**

- **FR-020**: The camera panel MUST show a live mirror of the player.
- **FR-021**: The player MUST be able to record a clip that holds the video and the
  microphone sound.
- **FR-022**: The tool MUST save each clip in IndexedDB and MUST attach it to the
  session.
- **FR-023**: The player MUST be able to play a clip and to delete a clip.
- **FR-024**: The recorder MUST hold a duration cap and a size cap, and MUST stop
  itself at either cap.

**Session log and history**

- **FR-025**: The tool MUST write a log line for each of these actions: session start,
  timer start, timer stop, timer complete, metronome start, metronome stop, ratios
  start, ratios stop, speed start, speed complete, clip saved, player note, session
  end.
- **FR-026**: The player MUST be able to add a free-text note to the log during a
  session.
- **FR-027**: The history MUST list past sessions with the date, the instrument, the
  technique, the target, the practice time, and the clip count.
- **FR-028**: The history MUST open one session and show its full log with clip
  playback.
- **FR-029**: All session data MUST stay on the device. The feature MUST NOT send data
  to a server.

**Audio and integration**

- **FR-030**: Only one click source MUST play at a time. The lab MUST claim the shared
  audio owner and MUST stop when another tool claims it.
- **FR-031**: The click MUST use the voice the player selected in Settings.
- **FR-032**: Leaving the tool MUST stop the click, the timer, the camera, and any
  recording.

**Architecture**

- **FR-033**: All feature code MUST live in one folder. The folder MUST NOT import a
  user-interface module from another feature.
- **FR-034**: The feature MUST take its database and its services through injected
  ports, with default adapters supplied at the mount point.
- **FR-035**: The timing logic MUST be pure functions with no audio and no DOM, so
  Node tests can read it.

### Key Entities

- **Session**: one practice block. It holds the start time, the end time, the
  instrument, the technique, the target, the status, and the totals.
- **Log entry**: one action inside a session. It holds the time, the kind, and the data
  of that kind.
- **Clip**: one recorded take. It holds the video blob, the type, the length, the size,
  and the session it belongs to.
- **Catalog**: the instruments and the techniques the player can pick, with the seed
  entries and the custom entries.
- **Click plan**: the ordered click events a trainer produces, before any sound.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A player starts a session and reaches a running timer in three actions
  or fewer after the tool opens.
- **SC-002**: The click stays inside 10 ms of the audio clock across a 5 minute run.
- **SC-003**: A session log written before a reload is complete after the reload.
- **SC-004**: A 30 second clip saves and plays back from the history.
- **SC-005**: `node tests/practice-lab/run.mjs` passes, and covers the ratios plan, the
  speed plan, the log model, the catalog, and the store.
- **SC-006**: The feature folder holds no import of another feature's user-interface
  module. A test asserts this.

## Assumptions

- One session covers one technique. A multi-step routine is out of scope.
- The player wants folders, tags, and export later, not now.
- Cloud sync is out of scope. The data stays on the device.
- The screenshots in the request supply the layout and the control names. They do not
  supply the colours. The Game Boy Color theme in `.specify/memory/constitution.md`
  wins.
- The tool is named "Practice Lab" and its id is `practicelab`, because
  `tests/product-model/run.mjs` bans the id `sec-practice`.

## Out of scope

- A multi-step routine with per-step tempo and focus.
- Folders, tags, and PDF export in the history.
- Cloud sync of sessions and clips.
- Video analysis, pose detection, or automatic technique marking.
- A separate standalone page. The folder boundary keeps that option open.
