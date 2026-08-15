# Feature Specification: Workbook Seamless Play

**Feature Branch**: `007-workbook-seamless-play`

**Created**: 2026-08-15

**Status**: Draft

**Input**: User description: "Exercises in workbooks should play consecutively if loop is not enabled. It must be a seamless transition as if it were all one score"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Play consecutive Guitar Pro exercises as one score (Priority: P1)

A player opens a workbook that holds two or more Guitar Pro exercises in a row. The player turns Loop off. The player starts playback. The player hears and sees the next exercise immediately after the current one. There is no stop, no count-in, and no reload flash between those exercises. The score reads as one continuous piece.

**Why this priority**: This is the requested behavior. Loop off must mean consecutive play, not a stop between items.

**Independent Test**: Build a workbook with two short Guitar Pro exercises. Turn Loop off. Press Play. Confirm the second exercise starts at the exact end of the first, with no gap.

**Acceptance Scenarios**:

1. **Given** a workbook with two or more consecutive Guitar Pro exercises and Loop off, **When** the player starts playback on the first of those exercises, **Then** playback continues through each following Guitar Pro exercise without a stop.
2. **Given** playback is in that consecutive run, **When** the playhead crosses an exercise boundary, **Then** the playlist marks the new current exercise and the score does not reload.
3. **Given** Loop is on, **When** the current Guitar Pro exercise ends, **Then** that exercise repeats and the next exercise does not start.

---

### User Story 2 - Move inside the consecutive run without a reload (Priority: P2)

A player uses Next, Previous, or a playlist row while Loop is off and the current run is Guitar Pro exercises. The player jumps to the chosen exercise. Playback does not tear down the score. If playback was active, it continues from the new start.

**Why this priority**: Manual moves must match the same one-score feel.

**Independent Test**: During consecutive play, press Next. Confirm the playhead jumps to the next exercise start and sound continues.

**Acceptance Scenarios**:

1. **Given** a consecutive Guitar Pro run with Loop off, **When** the player presses Next or Previous to another exercise in that run, **Then** the player seeks to that exercise and does not remount the score.
2. **Given** a consecutive Guitar Pro run with Loop off, **When** the player selects a playlist row in that run, **Then** the player seeks to that exercise and does not remount the score.

---

### User Story 3 - Leave a Guitar Pro run at a non-score item (Priority: P3)

A workbook can mix Guitar Pro exercises with audio, video, or other items. Consecutive one-score play applies only to a run of Guitar Pro exercises. When that run ends, the next non-Guitar-Pro item loads as it does today.

**Why this priority**: Mixed workbooks must keep working.

**Independent Test**: Use a workbook with two Guitar Pro exercises and then an audio item. Turn Loop off. Confirm the two Guitar Pro items play as one score, then the audio item loads.

**Acceptance Scenarios**:

1. **Given** Guitar Pro exercises followed by a non-Guitar-Pro item and Loop off, **When** the Guitar Pro run ends, **Then** the next item loads with the existing auto-advance path.
2. **Given** the last workbook item ends and wrap is on, **When** the next item is in the same Guitar Pro run, **Then** playback seeks to that item and continues.

---

### Edge Cases

- One Guitar Pro exercise in the workbook: Loop off still auto-advances. Wrap seeks to the start of that exercise and continues.
- The player turns Loop on during a consecutive run: the current exercise remounts and loops.
- The player turns Loop off during a single-exercise loop: the consecutive run mounts and playback continues from that exercise.
- A missing Guitar Pro file in the run: skip that item and join the remaining Guitar Pro items. Show the existing missing-file message only when the current item cannot load.
- Different tempos in adjacent Guitar Pro exercises: the joined score changes tempo at the boundary.
- Count-in applies only when the player starts playback, not between exercises in a run.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When Loop is off, consecutive Guitar Pro exercises in a workbook MUST play as one continuous score.
- **FR-002**: The transition between those exercises MUST have no audible gap and no score reload.
- **FR-003**: When Loop is on, the current exercise MUST repeat and MUST NOT auto-advance.
- **FR-004**: The playlist current-item mark MUST follow the playhead as it crosses exercise boundaries.
- **FR-005**: Next, Previous, and playlist selection inside the current Guitar Pro run MUST seek inside the joined score when Loop is off.
- **FR-006**: A non-Guitar-Pro item MUST keep the existing load and auto-advance behavior.
- **FR-007**: Count-in MUST NOT play between exercises in a consecutive Guitar Pro run.
- **FR-008**: Loop rest MUST NOT play between exercises in a consecutive Guitar Pro run.
- **FR-009**: When a consecutive Guitar Pro run ends on a wrap target that is still in that run, playback MUST continue from that target without a remount.

### Key Entities

- **Workbook**: Ordered exercise list with a Loop preference.
- **Guitar Pro run**: A maximal sequence of adjacent Guitar Pro workbook entries.
- **Playthrough score**: The joined Guitar Pro result for one run, plus boundary data that maps beats and bars to entries.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a two-exercise Guitar Pro workbook with Loop off, a listener cannot hear a stop between the last note of the first exercise and the first note of the second.
- **SC-002**: The score view does not rebuild when the playhead crosses an exercise boundary in a Guitar Pro run.
- **SC-003**: Manual Next inside a Guitar Pro run keeps playback active when it was already active.
- **SC-004**: Loop on still repeats only the current exercise.

## Assumptions

- Loop off already means auto-advance today. This feature changes the quality of that advance for Guitar Pro runs.
- Audio and video items still use the media `ended` event. They do not join into the Guitar Pro score.
- Per-exercise transpose and tuning from the exercise that is active at mount time apply to the joined score. Each exercise can still contribute its own tempo.
- The cloud harness uses a feature branch and a pull request. The project constitution prefers trunk delivery. This change follows the harness and states that conflict.
