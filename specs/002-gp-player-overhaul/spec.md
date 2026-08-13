# Feature Specification: Guitar Pro Player Overhaul

**Feature Branch**: `002-gp-player-overhaul`

**Created**: 2026-08-13

**Status**: Draft

**Input**: User description: "the gp player feature needs an overhaul. It shoulf operate at the quality level of songsterr.com. the current ui and playback is unfriendly and buggy."

## User Scenarios & Testing *(mandatory)*

Musi has a Guitar Pro player. The player opens a `.gp` or `.gp5` file. It shows a tab
score and it plays that score. Songsterr is the reference product for player behavior and
for control layout. This feature rebuilds the player to match that reference product. The
Current Problems section lists the faults that this feature must remove.

### User Story 1 - Playback matches the written score (Priority: P1)

A guitar learner opens a song. The song has a tempo change and a repeated chorus. The
learner presses Play. The player plays the song as the score reads it. The player follows
every tempo change. The player repeats the chorus. The player holds tied notes. The player
keeps rests silent. The playhead stays on the sounding note from the first bar to the last
bar.

**Why this priority**: Wrong playback makes every other part of the player useless. A
learner cannot trust a player that plays a different song than the page shows. This story
alone turns the player into a usable practice tool.

**Independent Test**: Open a score with a tempo change, a repeat, an alternate ending,
ties, rests, tuplets, and two voices. Play the score from start to end. Compare the total
time and the bar order against the source score. Watch the playhead against the sounding
note.

**Acceptance Scenarios**:

1. **Given** a tempo change from 90 to 140 at bar 9, **When** the learner plays from bar 1,
   **Then** the player speeds up at bar 9.
2. **Given** a repeated section of 8 bars, **When** the learner plays the score, **Then** the
   player plays those 8 bars twice.
3. **Given** a repeat with two alternate endings, **When** the learner plays the score,
   **Then** the player takes ending one, then ending two.
4. **Given** a note tied across a bar line, **When** the player reaches that note, **Then**
   the note sounds once and holds the combined length.
5. **Given** a bar of rests, **When** the player reaches that bar, **Then** the player stays
   silent and advances the playhead.
6. **Given** a track with two voices, **When** the learner plays the track, **Then** the
   player sounds both voices.
7. **Given** a 5 minute score, **When** the learner watches the playhead, **Then** the
   playhead sits on the sounding beat within 50 milliseconds.
8. **Given** playback in progress, **When** the learner leaves the app and returns, **Then**
   the audio and the playhead stay in step.

---

### User Story 2 - The score shows rhythm and technique (Priority: P2)

A learner reads a solo from the score. The learner sees the length of every note. The
learner sees each bend, slide, hammer-on, pull-off, vibrato, palm mute, and harmonic. The
learner sees the rests and the time signature. The learner can read the part without the
audio.

**Why this priority**: A tab score without rhythm marks is a list of numbers. The learner
must hear the part to learn it. Rhythm marks and technique marks let the learner read and
study the part alone. The reference product shows this information. Musi does not.

**Independent Test**: Open a score with mixed note lengths, rests, tuplets, and a full set
of techniques. Compare the drawn score against the same score in Guitar Pro or on
Songsterr. Count the techniques in the file. Count the techniques on screen.

**Acceptance Scenarios**:

1. **Given** a bar with one quarter note and four sixteenth notes, **When** the learner reads
   the bar, **Then** each note shows its length.
2. **Given** a bar with a half rest, **When** the learner reads the bar, **Then** the score
   shows a rest mark in the correct place.
3. **Given** a note with a bend, **When** the learner reads that note, **Then** the score
   draws a bend mark and the bend amount.
4. **Given** a slide between two notes, **When** the learner reads those notes, **Then** the
   score draws a slide line between them.
5. **Given** a hammer-on and a pull-off, **When** the learner reads them, **Then** the score
   draws an arc and the correct label.
6. **Given** a change from 6/8 to 4/4 at bar 17, **When** the learner reads the score,
   **Then** the score shows both time signatures.
7. **Given** a repeated section, **When** the learner reads the score, **Then** the score
   shows the repeat marks and the alternate endings.
8. **Given** a screen 360 CSS pixels wide, **When** the learner reads the score, **Then** the
   fret numbers and the rhythm marks stay legible.

---

### User Story 3 - Practice controls stay on the main screen (Priority: P3)

A learner wants to loop bars 17 to 20 at 70 percent speed with a count-in. The learner
drags across those bars on the score. That drag sets the loop. The learner sets the speed
on the transport bar. The learner taps a track tab to move from the guitar track to the
bass track. No step needs a menu.

**Why this priority**: Slow looped practice is the main job of a tab player. The player
already has these features, but the learner cannot find them. The move to the main screen
makes existing features usable.

**Independent Test**: Ask a learner to set a two bar loop, drop the speed to 70 percent,
turn on the count-in, and switch track. Count the actions for each task. Time each task.

**Acceptance Scenarios**:

1. **Given** a loaded score, **When** the learner drags across bars 17 to 20, **Then** the
   player loops those bars and shows the range.
2. **Given** a loop over two bars, **When** the learner plays 20 passes, **Then** the player
   repeats with no audible gap and no click.
3. **Given** a score with 4 tracks, **When** the learner taps a track tab, **Then** the score
   and the playback switch to that track.
4. **Given** playback at 100 percent, **When** the learner sets 70 percent, **Then** the
   player slows down and keeps the current bar and beat.
5. **Given** the count-in is on, **When** the learner presses Play, **Then** the player clicks
   one bar and shows the count on screen.
6. **Given** a score with 3 tracks, **When** the learner halves the drum volume, **Then** the
   player lowers the drums and leaves the other tracks unchanged.
7. **Given** the player is open, **When** the learner opens the help panel, **Then** the panel
   lists every keyboard shortcut.
8. **Given** a phone in portrait, **When** the learner looks for a primary control, **Then**
   that control sits on screen at a usable size.
9. **Given** a score with two drum tracks, **When** the learner selects drum track 2, **Then**
   the player shows and plays drum track 2 only.

---

### User Story 4 - The playback sounds like the instruments (Priority: P4)

A learner plays a rock song. The bass sounds like a bass. The rhythm guitar sounds like a
guitar. The drums sound like a kit. Loud notes sound louder than soft notes. A bend changes
pitch. A palm mute sounds short and damped. A chord does not distort the mix.

**Why this priority**: A clearer tone helps the learner hear the part. It matters less than
correct timing and a readable score. Musi ships as a static offline app, so the player
cannot download a large sample set. This story raises the tone quality within that limit.

**Independent Test**: Play the same score before and after the change. Compare the tone of
each track. Play a dense chord passage. Measure the output level for clipping.

**Acceptance Scenarios**:

1. **Given** a bass track and a guitar track, **When** the learner plays both, **Then** the
   two tracks sound different from each other.
2. **Given** a score with soft and loud notes, **When** the learner plays it, **Then** the
   loud notes sound louder.
3. **Given** a note with a bend of one tone, **When** the player sounds that note, **Then**
   the pitch rises by one tone.
4. **Given** a palm muted passage, **When** the player sounds it, **Then** the notes sound
   short and damped.
5. **Given** six note chords at speed, **When** the player sounds them, **Then** the output
   level stays below full scale.
6. **Given** audio that cannot start on its own, **When** the learner presses Play, **Then**
   the player states the cause and one next step.

---

### User Story 5 - The player opens a large score without a freeze (Priority: P5)

A learner opens a 200 bar multi-track file. The player shows progress while it reads the
file. The screen keeps answering taps. The score appears within 3 seconds. The learner
opens a second file. No setting from the first file carries over. The learner leaves the
player. All audio stops. The learner returns without a network and the player still opens.

**Why this priority**: These faults do not block the main job every time. They still break
trust when they appear. A frozen screen and a stale loop range both look like defects to
the learner.

**Independent Test**: Open a large file. Watch for progress and for a frozen screen. Load a
second file and check every setting. Leave the player and listen for audio. Turn off the
network and reopen the player.

**Acceptance Scenarios**:

1. **Given** a 200 bar multi-track file, **When** the learner opens it, **Then** the player
   shows read progress and answers taps.
2. **Given** a 200 bar multi-track file, **When** the learner opens it, **Then** the score
   appears within 3 seconds.
3. **Given** a loop on bars 5 to 9 at 60 percent, **When** the learner loads another file,
   **Then** the player clears the loop and uses the new tempo.
4. **Given** playback in progress, **When** the learner leaves the player screen, **Then** all
   audio stops at once.
5. **Given** a corrupt file, **When** the learner opens it, **Then** the player names the
   problem and one next step.
6. **Given** a `.gpx` file, **When** the learner opens it, **Then** the player asks for a `.gp`
   export and states how to make one.
7. **Given** one earlier online visit, **When** the learner opens the player offline, **Then**
   every screen area and every control appears.
8. **Given** a screen reader, **When** the player changes bar during playback, **Then** the
   screen reader announces the new bar.
9. **Given** an open panel and playback in progress, **When** the learner closes the panel,
   **Then** the playback continues without a change.
10. **Given** a score from an audio transcription, **When** the learner opens it, **Then** the
    player shows the score and hides the source file actions.

---

### Edge Cases

- A score has a tempo change inside a repeated section. The player must apply that tempo
  change on every pass.
- A score has a repeat with three or more alternate endings. The player must take the right
  ending on each pass.
- A score has a nested repeat. The player must flatten the form and must warn the learner.
- A loop range sits inside a repeated section. The player must loop the selected bars. The
  player must not jump to the repeat target.
- A learner changes the speed during playback. The player must keep the bar and beat
  position. The player must not restart.
- A learner seeks to a bar while the count-in runs. The player must restart the count-in at
  the new bar.
- A learner drags a loop range from a later bar to an earlier bar. The player must accept
  that range.
- A score has one bar. The player must still allow a loop and a count-in.
- A score ends with an empty bar. The player must keep the written length. The player must
  not stop early.
- A score has a track with no notes. The track tab must appear. The score must show an
  empty staff, not an error.
- A score has 20 or more tracks. The track tabs must stay usable and must scroll.
- A score uses a 7 string or 8 string tuning. The score must draw every string.
- A score has a drum track and no pitched track. The player must open on the drum staff.
- A score has a bar in 13/16. The score must draw that time signature. The score must space
  that bar correctly.
- A learner transposes the score and then sets a loop. The loop must stay on the same bars.
- A learner opens a score that came from an audio transcription. That score has no source
  file. The player must open it and must hide the actions that need a source file.
- The device stops the audio because the learner switched to another app. The player must
  pause. The player must resume from the same position.
- The device runs out of storage while the learner saves a score. The player must state the
  problem. The player must keep the open score playable.

## Requirements *(mandatory)*

### Functional Requirements

#### Playback fidelity

- **FR-001**: The player MUST follow every tempo change in the score.
- **FR-002**: The player MUST play repeats and alternate endings in the written order, for
  every repeat that does not nest inside another repeat.
- **FR-003**: The player MUST flatten a nested repeat into a single pass. It MUST warn the
  learner that it flattened the form.
- **FR-004**: The player MUST sound a tied note once. It MUST hold that note for the
  combined length.
- **FR-005**: The player MUST keep rests silent. It MUST keep their written length.
- **FR-006**: The player MUST play dotted notes and tuplets at their written length.
- **FR-007**: The player MUST sound grace notes before the main note.
- **FR-008**: The player MUST play every voice in a track.
- **FR-009**: The player MUST keep the playhead within 50 milliseconds of the sounding note.
- **FR-010**: The bar and beat readout MUST stay correct across tempo changes and speed
  changes.
- **FR-011**: The audio and the playhead MUST stay in step after the learner leaves the app
  and returns.
- **FR-012**: The player MUST resume from the correct position when the learner seeks during
  playback.
- **FR-013**: The player MUST loop a bar range with no gap longer than 10 milliseconds. It
  MUST produce no click at the boundary.
- **FR-014**: The player MUST show a countdown during a rest between loop passes. It MUST
  hold the playhead at the loop start.
- **FR-015**: A speed change MUST keep the current bar and beat position.
- **FR-016**: A speed change MUST scale every tempo change in the score by the same factor.
- **FR-017**: Stop and Pause MUST silence every sounding note.

#### Score rendering

- **FR-018**: The score MUST show a rhythm mark for every beat.
- **FR-019**: The score MUST show rests.
- **FR-020**: The score MUST space notes in proportion to their written length.
- **FR-021**: The score MUST draw every technique in this list:
  - bend
  - slide
  - hammer-on
  - pull-off
  - vibrato
  - palm mute
  - harmonic
  - tap
  - slap
  - pop
  - trill
  - tremolo
  - dead note
- **FR-022**: The score MUST show the bend amount for each bend.
- **FR-023**: The score MUST show the time signature at the first bar and at every change.
- **FR-024**: The score MUST show repeat marks, alternate endings, and section markers.
- **FR-025**: The score MUST show the tuning of the selected track.
- **FR-026**: The score MUST offer an optional standard notation staff above the tab staff.
- **FR-027**: The score MUST highlight the sounding beat and the current bar.
- **FR-028**: The score MUST scroll to keep the playhead in view during playback.
- **FR-029**: The score MUST stop its automatic scroll when the learner scrolls. It MUST
  resume that scroll when the learner asks.
- **FR-030**: The score MUST reflow to the viewport width. At 360 CSS pixels wide, a fret
  number MUST draw at 12 CSS pixels or larger.
- **FR-031**: The score MUST show only the track that the learner selected.
- **FR-032**: The player MUST keep the Atomic Purple Game Boy Color theme on its controls
  and panels. The note text on the score MUST hold a contrast ratio of 7 to 1 or better
  against its background.

#### Practice controls

- **FR-033**: The player MUST show a track selector on screen at all times.
- **FR-034**: The learner MUST be able to switch track in one action.
- **FR-035**: The learner MUST be able to set a loop by a drag or a tap on the score,
  without an open panel.
- **FR-036**: The learner MUST be able to clear the loop in one action.
- **FR-037**: The learner MUST be able to set the speed from the transport bar. The
  transport bar MUST accept a percentage and a tempo value.
- **FR-038**: The player MUST offer a count-in. It MUST show the count on screen.
- **FR-039**: The player MUST offer a metronome with an accent choice and a subdivision
  choice.
- **FR-040**: The learner MUST be able to set the volume of each track. The learner MUST be
  able to mute and to solo each track.
- **FR-041**: The player MUST list every keyboard shortcut in a help panel.
- **FR-042**: The player MUST reach every primary control in one action. The primary
  controls are Play, Pause, Stop, previous bar, next bar, speed, loop, metronome, count-in,
  and track choice.
- **FR-043**: Every control MUST have a touch target of at least 44 by 44 CSS pixels.
- **FR-044**: The player MUST open at most one panel at a time.
- **FR-045**: The player MUST work in portrait and in landscape on a phone.
- **FR-046**: The player MUST keep the transport bar on screen while the score scrolls.

#### Audio quality

- **FR-047**: The player MUST give each track a tone that follows the instrument in the
  score. SC-016 sets the pass mark for this requirement.
- **FR-048**: The player MUST apply the note dynamics from the score.
- **FR-049**: The player MUST change pitch for bends, slides, and vibrato.
- **FR-050**: The player MUST shorten palm muted notes and dead notes.
- **FR-051**: The player MUST hold the output level below full scale at all times. The
  output MUST NOT clip.
- **FR-052**: The player MUST state the cause and one next step when the audio cannot start.
- **FR-053**: The player MUST produce audio without a network download.

#### Loading and reliability

- **FR-054**: The player MUST show progress while it reads a file.
- **FR-055**: The player MUST answer learner input within 100 milliseconds while it reads a
  file.
- **FR-056**: Every error message MUST state what happened. It MUST state one action that
  the learner can take.
- **FR-057**: The player MUST accept `.gp` and `.gp5` files.
- **FR-058**: The player MUST ask the learner to re-export a `.gp3`, `.gp4`, or `.gpx` file.
  It MUST state how to make that export.
- **FR-059**: The player MUST reset the loop, the speed, the transpose, the tuning, and the
  selected track when the learner loads another score.
- **FR-060**: After the learner leaves the player, the player MUST produce no sound, MUST
  draw no screen update, and MUST use no processor time.
- **FR-061**: A closed panel MUST NOT change the playback and MUST NOT change the score
  view. A closed panel MUST use no processor time.
- **FR-062**: The player MUST open offline after one earlier online visit. Every screen
  area and every control MUST appear.
- **FR-063**: The player MUST keep the saved score library, the Exercises viewer, the
  Workbooks player, and the split-into-exercises studio working.
- **FR-064**: The player MUST keep the section notes, the automatic scroll setting, the zoom
  setting, and the metronome settings for each score.
- **FR-065**: The player MUST open a score that came from an audio transcription. It MUST
  hide the actions that need a source file.

#### Accessibility

- **FR-066**: The player MUST announce the current bar to a screen reader during playback.
- **FR-067**: Every control MUST carry a text name.
- **FR-068**: The learner MUST be able to run the transport bar with the keyboard alone.
- **FR-069**: The player MUST respect the reduced motion setting of the operating system.

### Key Entities *(include if feature involves data)*

- **Score**: One Guitar Pro file. It holds a title, an artist, a tempo map, a bar list, and
  a track list.
- **Track**: One instrument part in a score. It holds a name, an instrument, a tuning, a
  string count, a volume, and a mute state.
- **Bar**: One unit of time in a track. It holds a time signature, a repeat mark, an
  alternate ending number, and a section marker.
- **Voice**: One rhythmic line inside a bar. A bar holds one or more voices.
- **Beat**: One rhythmic event in a voice. It holds a start time, a written length, and a
  note list.
- **Note**: One sounding pitch in a beat. It holds a string, a fret, a pitch, a dynamic
  level, and a technique list.
- **Technique**: One playing instruction on a note or a beat. Examples are bend, slide, and
  palm mute.
- **Tempo change**: One tempo value that starts at a given bar and beat.
- **Loop range**: A start bar and an end bar that the player repeats. It holds an optional
  rest length between passes.
- **Transport state**: The current position, the play state, the speed, the count-in
  setting, and the metronome setting.
- **Practice preference**: One saved setting for one score. Examples are the selected track,
  the zoom level, and the metronome accent.
- **Section note**: A learner's text note. It attaches to a bar range of a score.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a score with tempo changes, repeats, and alternate endings, the total
  playback time matches the source score within 1 percent.
- **SC-002**: For a score with no nested repeat, the played bar order matches the written
  bar order exactly.
- **SC-003**: The playhead stays within 50 milliseconds of the sounding note across a 5
  minute score.
- **SC-004**: The score draws at least 95 percent of the techniques that the file holds.
  Count each technique once for each note that carries it.
- **SC-005**: A learner sets a two bar loop in 2 actions or fewer, and in under 5 seconds.
- **SC-006**: A learner switches track in 1 action.
- **SC-007**: A learner sets the speed to 70 percent in 2 actions or fewer.
- **SC-008**: A 200 bar multi-track score shows its first system within 1 second on the test
  computer at full speed. It shows that system within 3 seconds when the tester slows the
  processor to one quarter speed.
- **SC-009**: The player answers learner input within 100 milliseconds while it reads a
  file.
- **SC-010**: A two bar loop runs 20 passes. No pass boundary produces a gap longer than 10
  milliseconds.
- **SC-011**: Across a 30 minute session, the playhead never drifts more than 200
  milliseconds. No unplanned audio gap lasts more than 100 milliseconds.
- **SC-012**: Every primary control stays on screen and usable at 360 CSS pixels wide, in
  portrait and in landscape.
- **SC-013**: A second score keeps no setting from the first score.
- **SC-014**: Leaving the player stops all audio within 100 milliseconds. The player then
  uses less than 1 percent of the processor.
- **SC-015**: A guitar teacher reads 10 test passages without audio. The teacher confirms
  the drawn rhythm in at least 8 of those passages. The team fixes the 10 passages before
  the test and reuses them for every later test.
- **SC-016**: A listener hears the same 10 test passages and does not see the track names.
  The listener names the bass part and the guitar part in at least 9 of those passages.
- **SC-017**: With the network off, the player opens and shows a saved score. Every screen
  area and every control appears.

## Assumptions

The feature description did not settle every choice. These assumptions record the defaults
that this specification uses. The team can change any of them before the plan phase.

- **Audio approach**: The player raises the quality of the audio that it produces on the
  device. It ships no instrument sample set. It downloads no instrument sample set. Musi
  ships as a static offline app, and the project constitution forbids a network dependency
  for a core feature. The result will not equal a sampled instrument. It must still meet
  SC-016.
- **Notation scope**: The tab staff stays the default view. The tab staff gains rhythm
  marks, rests, and technique marks. A standard notation staff is an optional extra view.
- **Older formats**: `.gp3`, `.gp4`, and `.gpx` stay out of scope. The player keeps a clear
  re-export message for them. This matches the current documented decision.
- **Score size**: A score holds up to about 500 bars and up to about 24 tracks. The player
  targets that size.
- **Target devices**: A learner uses a recent desktop browser or a recent phone browser.
  The player targets a screen from 360 CSS pixels wide upward.
- **Audio direction**: The player only produces audio. It does not record audio. It needs
  no microphone access.
- **Storage**: The player keeps saved scores and settings on the device. It needs no
  account. Cloud sync stays optional. A learner can use the whole player offline without
  cloud sync.
- **Theme**: The Atomic Purple Game Boy Color theme stays. Songsterr is the reference
  product for behavior and for control layout. It is not the reference product for visual
  style.
- **Entry points**: The player keeps its current entry points. These are the standalone
  screen, the Exercises viewer, and the Workbooks player. They also include the hand-offs
  from Track to Sheet, from the Voice Recorder, and from the Drums import.
- **Nested repeats**: A score rarely nests repeats. FR-003 covers the flattened case. Full
  nested repeat support stays out of scope.

## Current Problems

This section records the faults that this feature must remove. Each line states a fault
that a learner can see or hear today.

1. The player uses one tempo for a whole score. A score with a tempo change plays at the
   wrong speed. FR-001 covers this.
2. The player ignores repeat marks and alternate endings. It plays each bar once. The
   playback ends too early. FR-002 covers this.
3. The player drops tied notes and grace notes. Held notes cut short. FR-004 and FR-007
   cover this.
4. The player plays only the first voice of a track. It drops the second voice. FR-008
   covers this.
5. The score shows fret numbers only. A learner cannot tell a quarter note from a
   sixteenth note. The score shows no rests. FR-018 to FR-020 cover this.
6. The score draws no technique marks. The file holds bends, slides, hammer-ons, and
   vibrato, but the learner cannot see them. FR-021 covers this.
7. Every note sounds like the same simple tone. The tone ignores the instrument and the
   dynamics in the score. FR-047 and FR-048 cover this.
8. The learner must open a menu to reach the track list, the loop tool, and the practice
   settings. FR-033 to FR-037 cover this.
9. The loop repeats with an audible click at the boundary. FR-013 covers this.
10. A large file freezes the screen while the player reads it. The player shows no
    progress. FR-054 and FR-055 cover this.
11. The player shows the first drum track under the guitar view, even when the learner
    selected another drum track. FR-031 covers this.
12. A closed panel keeps some work active. FR-061 covers this.
13. An offline visit can fail, because the player did not keep every part of itself for
    offline use. FR-062 covers this.

## Out of Scope

- Reading `.gp3`, `.gp4`, `.gpx`, or MusicXML files.
- Writing or editing Guitar Pro files.
- An instrument sample set, either shipped with the app or downloaded.
- A backend service, an account, or a shared score catalogue.
- A command line player. The CLI keeps its parse and analyse activities only.
- Song search and a hosted song library.
- Printing the score, and export of the score to PDF.
- Lyrics display and chord diagram display.
- A score view with several track staves at once.
- Input from a microphone or from a MIDI instrument.
