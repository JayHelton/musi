# Feature Specification: Guitar Pro Player Unload

**Feature Branch**: `003-gp-player-unload`

**Created**: 2026-08-13

**Status**: Draft

**Input**: User description: "The guitar pro player has no ability to exist and unload a score. Add that as a capability so I dont have to hard refresh the app everytine I load a score"

## User Scenarios & Testing *(mandatory)*

The Guitar Pro player opens a score and then fills the screen. The learner cannot close
that score. The learner cannot return to the empty player. A hard refresh of the app is
the only way out. This feature adds a Close score action. The action unloads the score,
stops audio, and returns the empty player. The learner can then open another score without
a page refresh.

### User Story 1 - Close a loaded score (Priority: P1)

A learner opens a Guitar Pro file on the Guitar Pro Player screen. The score fills the
screen. The learner chooses Close score. The player unloads the score. The empty player
returns. The drop area and the saved-score list appear again. The learner does not refresh
the page.

**Why this priority**: Without this action, a loaded score traps the learner. A hard
refresh is the only exit. That is the whole problem.

**Independent Test**: Open a score on the Guitar Pro Player screen. Choose Close score.
Confirm the empty player. Confirm the drop area. Confirm the saved-score list.

**Acceptance Scenarios**:

1. **Given** a loaded score on the Guitar Pro Player screen, **When** the learner chooses
   Close score, **Then** the score view leaves the screen.
2. **Given** a loaded score on the Guitar Pro Player screen, **When** the learner chooses
   Close score, **Then** the drop area and the saved-score list appear.
3. **Given** a loaded score on the Guitar Pro Player screen, **When** the learner chooses
   Close score, **Then** the page does not reload.
4. **Given** a score that the learner saved to the library, **When** the learner chooses
   Close score, **Then** the library still holds that score.

---

### User Story 2 - Stop audio on close (Priority: P2)

A learner plays a loaded score. The learner chooses Close score while the score still
sounds. All audio stops at once. No note, click, or metronome continues after the empty
player returns.

**Why this priority**: A silent empty player is part of a clean exit. Leftover audio after
close looks like a defect. Playback is common when the learner wants to leave.

**Independent Test**: Start playback. Choose Close score. Listen. Confirm silence.

**Acceptance Scenarios**:

1. **Given** playback in progress, **When** the learner chooses Close score, **Then** all
   score audio stops at once.
2. **Given** a metronome click during playback, **When** the learner chooses Close score,
   **Then** the metronome stops as well.
3. **Given** a closed score, **When** the learner stays on the Guitar Pro Player screen,
   **Then** no audio from that score starts again.

---

### User Story 3 - Open another score after close (Priority: P3)

A learner closes a score. The empty player returns. The learner then opens a different
file, or opens a saved score from the library. The new score loads. The player does not
keep the closed score in memory. The learner does not refresh the page.

**Why this priority**: Close only has value if the learner can continue. A second load
without a refresh is the proof.

**Independent Test**: Open score A. Close it. Open score B from a file or from the library.
Confirm score B. Confirm that score A is not on screen.

**Acceptance Scenarios**:

1. **Given** a closed score, **When** the learner drops a new Guitar Pro file, **Then** the
   player opens that file.
2. **Given** a closed score, **When** the learner opens a saved score from the library,
   **Then** the player opens that saved score.
3. **Given** a closed score, **When** the learner leaves the Guitar Pro Player screen and
   then returns, **Then** the empty player is still empty.

---

### Edge Cases

- The learner chooses Close score while a file read is still in progress. The player
  cancels the loaded view and returns the empty player.
- The learner chooses Close score with an unsaved dropped file. The player unloads the
  file. The player does not write that file to the library.
- The learner chooses Close score with unsaved practice changes on a library score. The
  player unloads the score. Saved library data stays. The player does not ask for confirm.
- The learner opens a score from the Exercises viewer. That viewer already has a way back
  to the list. This feature does not add Close score there unless that viewer opts in.
- The learner opens a score from a Workbook. That viewer already has a way back. This
  feature does not add Close score there unless that viewer opts in.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The learner MUST be able to close a loaded score on the Guitar Pro Player
  screen in one action.
- **FR-002**: Close score MUST be visible while a score is loaded. The learner MUST NOT
  need a page refresh to find it or to use it.
- **FR-003**: Close score MUST unload the current score from the player.
- **FR-004**: Close score MUST return the empty Guitar Pro Player screen. That screen MUST
  show the drop area and the saved-score list.
- **FR-005**: Close score MUST stop all audio from the current score at once. This includes
  score playback and the metronome.
- **FR-006**: Close score MUST NOT reload the page.
- **FR-007**: Close score MUST NOT delete a saved score from the library.
- **FR-008**: Close score MUST NOT ask the learner to confirm.
- **FR-009**: After Close score, the player MUST accept a new file drop, a file picker
  choice, or a library open.
- **FR-010**: After Close score, a return to the Guitar Pro Player screen MUST still show
  the empty player. The closed score MUST NOT remount on its own.
- **FR-011**: The Close score action MUST use the label `Close score`.
- **FR-012**: The shared player MUST show Close score only when the host supplies a close
  handler. Hosts without that handler MUST look the same as today.
- **FR-013**: The Guitar Pro Player screen MUST supply that close handler.

### Key Entities

- **Loaded score session**: The in-memory score that the player currently shows. It holds
  the parsed score, the display title, the source file name, and any link to a library
  item. Close score clears this session. It does not change stored library items.
- **Empty player**: The Guitar Pro Player screen with no loaded score session. It shows the
  drop area and the saved-score list.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A learner with a loaded score can return to the empty player in 1 action,
  and in under 3 seconds.
- **SC-002**: After Close score, 100 percent of testers can open a second score without a
  page refresh.
- **SC-003**: Close score stops all audio from the closed score within 100 milliseconds.
- **SC-004**: Close score does not remove any saved library score.
- **SC-005**: After Close score, a leave and return to the Guitar Pro Player screen still
  shows the empty player in 100 percent of trials.

## Assumptions

- **Primary surface**: The Guitar Pro Player screen is the surface that traps the learner
  today. Exercises and Workbooks already have a way back to a list. They stay unchanged
  unless they opt in later.
- **No confirm**: Close score is an explicit action. A confirm dialog would add friction
  and would not save data that the player already stores.
- **Library safety**: Close unloads the session. It does not delete. Delete stays a
  separate library action.
- **Open file stays**: The existing Open file action still replaces a loaded score. Close
  score is the way back to the empty player.
- **Label**: `Close score` is the product term. It matches `Open file`. Unload is the
  session behaviour, not the visible label.
- **Theme**: The control uses the existing Atomic Purple Game Boy Color tokens and the
  existing player chrome.

## Out of Scope

- Delete of a library score from the Close score action.
- A confirm dialog before close.
- Close score on the Exercises viewer or a Workbook player in this feature.
- A change to parse, playback, or score drawing.
- A command line close action.
