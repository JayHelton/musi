# Feature Specification: Backing Track Sync

**Feature Branch**: `claude/acore-youtube-mp3-sync-fwzvsm`

**Created**: 2026-08-20

**Status**: Implemented

**Input**: User description: "Add and sync a YouTube video/song or an mp3 with the Score Player. Enabling the real song disables the synth, like Songsterr. There should be controls to configure delays."

## User Scenarios & Testing *(mandatory)*

The Score Player plays a Guitar Pro score with a synthesized guitar, bass, and drum kit.
The synth is good for practice, but it is not the record.
A learner who wants to play along with the real song must open a second app.
That learner must then find the start point by ear on every restart.

This feature attaches one recording to one score.
The player drives that recording from its own audio clock.
The playhead, the loop, the count-in, and the recording stay together.

### User Story 1 - Play along with the real song (Priority: P1)

A learner opens a score and opens the Backing track drawer.
The learner picks an audio file from the device.
The learner turns on "Play the real song instead of the synth".
The learner presses Play.
The recording starts at the point that matches bar 1.
The synth notes stay quiet.
The score playhead moves with the recording.

**Why this priority**: This is the feature. Nothing else has value without it.

**Independent Test**: Attach an audio file, turn the toggle on, and press Play.
Confirm the recording plays, the synth is quiet, and the playhead follows the sound.

### User Story 2 - Line the recording up with the score (Priority: P1)

Most records hold count-in bars, applause, or silence before bar 1.
The learner sets "Song start" to the number of seconds before bar 1.
The learner can also press "Set from here" while both play, which captures the offset.
A separate "Fine trim" slider shifts the recording by milliseconds, for output delay.

**Why this priority**: A recording that starts at the wrong point is worse than no recording.

**Independent Test**: Set an offset of four seconds and press Play.
Confirm the recording begins four seconds in.
Move the fine trim and confirm the recording shifts against the click.

### User Story 3 - Slow the real song down (Priority: P2)

The learner sets the practice speed to 70 percent.
The recording slows to 70 percent and holds its pitch.
The recording stays in time with the score.

**Why this priority**: Slow practice is the reason a learner uses this player.

**Independent Test**: Play at 100 percent, then step the tempo down.
Confirm the recording slows and the drift stays small.

### User Story 4 - Play along with a YouTube video (Priority: P3)

The learner pastes a YouTube link.
The video appears in the drawer and follows the score.
YouTube offers fixed speeds only.
At a speed YouTube cannot play, the player says so and gives the notes back to the synth.

**Why this priority**: A file gives tighter sync. A link is faster to attach.

**Independent Test**: Paste a link, press Play, then set an unsupported speed.
Confirm the message appears and the synth returns.

## Requirements *(mandatory)*

- **FR-001**: The Score Player MUST accept one audio file or one YouTube link for each score.
- **FR-002**: The player MUST store the audio file on the device and MUST NOT upload it.
- **FR-003**: The recording MUST follow the score clock, not a separate timer.
- **FR-004**: Turning the backing track on MUST silence the synth notes.
- **FR-005**: The metronome, the count-in, and the transport MUST keep working while the notes are quiet.
- **FR-006**: Turning the backing track off MUST bring the notes back at once.
- **FR-007**: The player MUST offer a song-start offset in seconds and a fine trim in milliseconds.
- **FR-008**: The player MUST offer a way to capture the offset from the point that plays now.
- **FR-009**: The recording MUST follow the practice speed and MUST hold its pitch when the browser can.
- **FR-010**: A pause, a stop, a seek, and a loop rest MUST all pause or move the recording with the score.
- **FR-011**: The settings MUST survive a reload and MUST belong to one score only.
- **FR-012**: A source that cannot play at the current speed MUST report that and MUST give the notes back.
- **FR-013**: The player MUST NOT download or extract a YouTube audio stream. It uses the official IFrame player.
- **FR-014**: A file source MUST pass through the app mix bus, so the master volume and the safety stage apply.

## Success Criteria *(mandatory)*

- **SC-001**: With a file source at 100 percent speed, the recording stays inside 60 ms of the score.
- **SC-002**: With a file source at 50 percent speed, the recording stays inside 60 ms of the score.
- **SC-003**: After a seek, the recording returns to that window inside two seconds.
- **SC-004**: A muted player schedules no note voice and still schedules metronome clicks.

## Out of Scope

- Backing audio in the sync bundle. A song for each score would make a bundle very large.
- A backing track for an exercise slice. A slice starts at a different bar, so it needs its own offset.
- Interpolated accelerando and ritardando. The timeline holds those marks but does not follow them.
