# Feature Specification: Audio Engine Foundation

**Feature Branch**: `006-audio-engine-foundation`

**Created**: 2026-08-14

**Status**: Draft

**Input**: User description: "Make Musi playback musical, clear, and comfortable for long practice sessions. Start only Feature 006: add the shared audio owner, track buses, pan, gain, the final safety stage, imported track volume and pan, the sample pack manifest contract, a pack loader with no production samples, load progress state, and Cache Storage rules for packs. Keep current synth voices as the fallback. Do not start the drum, drone, or guitar sample features."

## User Scenarios & Testing *(mandatory)*

Musi plays Guitar Pro scores, keyboard notes, drums, metronome clicks, and study tones.
Those sounds must stay clear in a long practice session.
This feature builds the shared audio foundation.
It does not ship a production guitar pack or a production drum pack.
It does not replace the Guitar Pro parser, the score renderer, the timeline, or the practice UI.

The current synth voices stay as the fallback.
Playback must work at once.
A later feature can add high-quality sample packs on top of this foundation.

This feature also records a new product decision.
The old Guitar Pro overhaul required wavetable voices and forbade samples.
That decision improved instrument separation.
It did not produce realistic instruments.
This feature replaces that decision for future sound work.
The old decision stays on record.

### User Story 1 - Playback starts at once with the fallback (Priority: P1)

A learner opens a Guitar Pro score.
The score appears at once.
The learner presses Play before any extra sound file is ready.
The player uses the current synth voices.
The score does not wait for a sound pack.
A small status can show that the player uses the synth fallback.

**Why this priority**: A learner must hear the score on the first press of Play.
A delayed first render or a blocked Play control makes the player feel broken.
This story alone keeps the current practice flow working.

**Independent Test**: Open a saved score with the network off after one earlier visit.
Confirm the score appears before any pack decode.
Press Play.
Confirm the synth fallback sounds and the status names the fallback.

**Acceptance Scenarios**:

1. **Given** a saved Guitar Pro score, **When** the learner opens it, **Then** the score appears without a wait for extra sound files.
2. **Given** a score that is on screen, **When** the learner presses Play before a pack is ready, **Then** the player starts with the synth fallback.
3. **Given** playback with the synth fallback, **When** the learner looks at the player, **Then** a small status shows `Synth fallback`.
4. **Given** a missing or failed pack, **When** the learner presses Play, **Then** the player uses the fallback and shows no unhandled error.
5. **Given** the current Guitar Pro test suite, **When** a tester runs it after this feature, **Then** every current test still passes.

---

### User Story 2 - One tool owns the sound (Priority: P1)

A learner starts Guitar Pro playback.
The learner then starts the keyboard, the drums, the metronome, or a study tone.
The first source stops or pauses.
Two long-running audio tools do not play at the same time.
A short preview tone of three seconds or less may overlap, as the current product already allows.

**Why this priority**: Overlapped tools fight for the same output.
The mix becomes loud and hard to hear.
One owner keeps practice comfortable.

**Independent Test**: Start Guitar Pro playback.
Start the keyboard.
Confirm the score stops or pauses.
Repeat with drums, metronome, and a study tone.
Confirm only one long-running source remains active.

**Acceptance Scenarios**:

1. **Given** Guitar Pro playback is active, **When** the learner starts the keyboard, **Then** the score stops or pauses and the keyboard sounds.
2. **Given** the keyboard is active, **When** the learner starts Guitar Pro playback, **Then** the keyboard stops and the score sounds.
3. **Given** the metronome is active, **When** the learner starts a study tone that lasts more than three seconds, **Then** the metronome stops.
4. **Given** the metronome is active, **When** a short preview tone of three seconds or less plays, **Then** the metronome keeps running.
5. **Given** a tool loses ownership, **When** one second has passed after its stop action, **Then** that tool leaves no owned voice.

---

### User Story 3 - The mix follows the imported score (Priority: P2)

A learner opens a score that sets a quiet bass and a hard-panned guitar.
The first playback uses those imported values.
The learner can still mute and solo tracks.
The learner can still change a track volume after load.
Display track choice stays separate from playback track choice.

**Why this priority**: The current player starts every track at full volume and ignores pan.
The imported mix is part of the written score.
A learner needs that mix on the first play.

**Independent Test**: Open a score with two tracks that have different source volumes and opposite pan.
Play both tracks.
Measure that the quieter track is quieter.
Measure that the panned track is stronger on the named side.

**Acceptance Scenarios**:

1. **Given** a score whose bass track volume is 0.4, **When** the learner plays the score for the first time, **Then** the bass is quieter than a track whose source volume is 1.
2. **Given** a score whose guitar track pan is full left, **When** the learner plays that track, **Then** the guitar is stronger on the left.
3. **Given** imported volume and pan, **When** the learner mutes one track, **Then** that track is silent and the other tracks keep their mix.
4. **Given** imported volume and pan, **When** the learner solos one track, **Then** only that track sounds.
5. **Given** imported values, **When** the learner changes a track volume after load, **Then** the player uses the new value and keeps the other tracks unchanged.

---

### User Story 4 - Dense playback stays safe (Priority: P2)

A learner plays a dense chord or a long sustain passage.
The output stays at or below a safe peak.
A later note does not become quieter only because earlier notes still hold.
A master volume above the default cannot restore clipping after the safety stage.

**Why this priority**: The current headroom rule uses the count of active voices.
Long sustains then make later notes too quiet.
A master control after the compressor can also restore clipping.
Both faults cause fatigue in a long session.

**Independent Test**: Render a dense six-note chord and a long sustain that overlaps new notes.
Measure the peak.
Confirm the peak stays at or below `-1 dBFS`.
Confirm a later note does not drop only because earlier notes still hold.

**Acceptance Scenarios**:

1. **Given** a dense six-note chord at high velocity, **When** the player renders it, **Then** the protected output peak stays at or below `-1 dBFS`.
2. **Given** three notes that still hold, **When** a new note starts, **Then** that new note does not become quieter only because the earlier notes are still active.
3. **Given** the master volume is above 1, **When** the player renders a dense chord, **Then** the protected output still stays at or below `-1 dBFS`.
4. **Given** the current peak headroom test, **When** a tester runs it after this feature, **Then** the test still passes under the new `-1 dBFS` limit.

---

### User Story 5 - Packs have a contract and a safe fallback (Priority: P3)

A later feature will add licensed sample packs.
This feature adds the pack contract, the loader, the progress state, and the cache rules.
This feature ships no production sample files.
A missing pack, a failed decode, or a storage rejection must use the synth fallback.
The first score render must not wait for a pack.
Optional packs must not sit in the app-shell file list.
The app must never load audio from a third-party host.

**Why this priority**: The pack path must exist before later features add files.
A broken loader must not block the player.
This story protects the fallback and the offline app shell.

**Independent Test**: Point the loader at a missing pack and at a broken manifest.
Open a score and press Play.
Confirm the fallback starts and the status names the fallback.
Confirm the app-shell cache list does not include optional pack files.

**Acceptance Scenarios**:

1. **Given** no production pack is present, **When** the player needs a pack, **Then** the loader reports the miss and the player uses the synth fallback.
2. **Given** a pack load is in progress, **When** the learner opens a new score, **Then** the old load stops and does not finish into the new score.
3. **Given** storage rejects a pack, **When** the learner presses Play, **Then** the player stays usable with the fallback.
4. **Given** a pack decode fails, **When** the learner presses Play, **Then** the player shows no unhandled error and uses the fallback.
5. **Given** the first-visit app file list, **When** a tester inspects it, **Then** optional pack files are absent from that list.
6. **Given** a pack that later features will install, **When** the app stores it, **Then** the pack uses a separate cache name that includes the pack version.
7. **Given** any playback path in this feature, **When** a tester inspects audio URLs, **Then** no third-party host appears.

---

### Edge Cases

- The learner presses Play while a pack load is still in progress. The current start uses the fallback. A later start may use a ready pack. The player does not switch the source during an active note or an active loop pass.
- The learner opens a second score while a pack load for the first score is still running. The first load stops.
- Storage is full or the browser rejects Cache Storage. The player stays usable with the fallback.
- A pack manifest is present and the audio files are missing. The player uses the fallback and reports the miss.
- Two tools try to start in the same moment. Exactly one long-running owner remains.
- A tool claims audio and then fails to start. The claim does not leave a half-started voice.
- The master volume is 0. The output is silent and the safety stage still holds.
- A track has no imported volume or pan. The player uses volume `1` and pan `0`.
- A percussion track and a pitched track share one score. Each track keeps its own bus values.
- The network is off after one earlier visit. The synth fallback and the score still work.

## Requirements *(mandatory)*

### Functional Requirements

#### Shared ownership

- **FR-001**: The app MUST allow only one long-running audio owner at a time.
- **FR-002**: When a new long-running owner starts, the app MUST stop or pause the prior owner before the new owner sounds.
- **FR-003**: A refused or failed claim MUST leave no half-started voice.
- **FR-004**: A short preview tone of three seconds or less MUST NOT take ownership from a long-running owner.
- **FR-005**: Guitar Pro playback, the keyboard, the drums, the metronome, and study tones MUST use the same owner service.
- **FR-006**: The app MUST keep one shared sound engine. It MUST NOT create a second independent sound engine for this feature.

#### Shared mix and safety

- **FR-007**: Every Guitar Pro track MUST send its sound through a track bus that applies gain and pan.
- **FR-008**: On first load, each track bus MUST use the imported track volume and the imported track pan from the score.
- **FR-009**: The learner MUST still be able to mute, solo, and change track volume after load.
- **FR-010**: Display track choice MUST stay separate from playback track choice.
- **FR-011**: Track buses MUST send dry sound to one shared mix bus.
- **FR-012**: The mix bus MUST apply gentle compression.
- **FR-013**: The master volume control MUST apply after the mix bus and before the final safety stage.
- **FR-014**: A final safety stage MUST keep the protected output at or below `-1 dBFS`.
- **FR-015**: The shared analyzer MUST read the protected output.
- **FR-016**: The app MUST NOT add a separate limiter for each note.
- **FR-017**: Note gain MUST NOT fall only because other notes still hold. Chord gain MAY use the size of the chord that starts together.
- **FR-018**: The current synth voices MUST remain the sounding fallback for Guitar Pro pitched tracks.

#### Pack contract and loading

- **FR-019**: The app MUST define a same-origin pack manifest contract. The contract MUST include pack id, pack version, license and attribution, sample rate, instrument name, MIDI program or drum note map, root MIDI note, velocity range, round-robin number, articulation, optional loop points, and gain trim.
- **FR-020**: This feature MUST ship no production guitar, bass, or drum sample files.
- **FR-021**: The loader MUST read the score instrument programs before playback when a pack path exists.
- **FR-022**: The loader MUST load only the packs that the current score needs.
- **FR-023**: The loader MUST decode each file one time per audio context and share the decoded result.
- **FR-024**: The loader MUST report progress.
- **FR-025**: The loader MUST stop an obsolete load when a new score replaces the old score.
- **FR-026**: A missing pack, a failed load, a failed decode, or a storage rejection MUST use the synth fallback and MUST NOT raise an unhandled error.
- **FR-027**: The first score render MUST NOT wait for pack decode.
- **FR-028**: The learner MUST be able to press Play before a pack is ready.
- **FR-029**: A new playback start MAY use a pack after the pack becomes ready. The player MUST NOT switch the sound source during an active note or an active loop pass.
- **FR-030**: A small status MUST show `Loading guitar sounds`, `Studio ready`, or `Synth fallback` when that state applies. This feature may show `Studio ready` only when a later pack is present and ready. With no production pack, the ready state is the synth fallback.
- **FR-031**: Optional packs MUST NOT sit in the first-visit app file list.
- **FR-032**: Installed packs MUST use a separate on-device store that includes the pack version.
- **FR-033**: The small synth fallback MUST stay in the app shell.
- **FR-034**: The app MUST NEVER load audio from a third-party host.
- **FR-035**: New sound-engine code for this feature MUST stay at or below 150 KiB before compression.

#### Compatibility and limits

- **FR-036**: This feature MUST NOT replace the Guitar Pro parser, the score renderer, the timeline, or the practice UI.
- **FR-037**: This feature MUST NOT add a backend, a build step, or an npm package to the CLI.
- **FR-038**: This feature MUST NOT add a DAW, an amp editor, or a full sound designer.
- **FR-039**: Core playback MUST remain available offline with the synth fallback.
- **FR-040**: All current Guitar Pro Node tests MUST keep their current pass result.
- **FR-041**: Existing practice controls MUST stay independent from the sound source. Speed, loop, solo, mute, and pitch controls MUST keep their current jobs.

### Key Entities

- **Audio owner**: The one long-running tool that may sound. It has an id, a stop action, and an optional pause action.
- **Track bus**: The gain, pan, and small tone control for one score track.
- **Mix bus**: The shared path that receives every track bus and applies gentle compression.
- **Safety stage**: The last gain limit before the speakers. It keeps the peak at or below `-1 dBFS`.
- **Pack manifest**: The description of one same-origin sound pack. It lists identity, license, and sample metadata.
- **Pack load session**: One attempt to fetch and decode the packs for the current score. It has progress, a cancel action, and a fallback result.
- **Playback source state**: The current sound source label. The values are `Loading guitar sounds`, `Studio ready`, and `Synth fallback`.
- **Imported mix**: The volume and pan values that the score file stores on each track.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The first score view appears without a wait for extra sound files. A tester can open a saved score and read the first system before any pack decode finishes.
- **SC-002**: In 100 paired starts of two long-running audio tools, exactly one tool remains active after each pair.
- **SC-003**: A dense six-note chord render stays at or below `-1 dBFS` on the protected output.
- **SC-004**: A tester can hear and measure imported track volume and pan on the first play of a score that sets those values.
- **SC-005**: A missing pack, a broken manifest, and a storage rejection each start the synth fallback with zero unhandled errors.
- **SC-006**: Every current Guitar Pro Node test keeps its pass result.
- **SC-007**: After a stop action, a tester finds no owned voice from that owner after 1 second.
- **SC-008**: Note onset stays within 20 milliseconds of the scheduled start on the current timing fixtures.
- **SC-009**: A two bar loop still shows a gap of 10 milliseconds or less on the current loop fixtures.
- **SC-010**: New sound-engine code added by this feature stays at or below 150 KiB before compression.
- **SC-011**: A tester who inspects the first-visit app file list finds no optional pack file in that list.

## Assumptions

- Feature 006 ships the shared foundation only. Features 007, 008, 009, and 010 add drums, drone and keyboard, guitar and bass samples, and pack management.
- This feature ships no production sample files and no impulse files.
- The current synth voices in the Guitar Pro player remain the sounding engine until a later feature adds a pack.
- Feature 005 already described an audio owner and an Audio Dock. That module is not in the code today. This feature ships the owner service. It does not ship the Audio Dock or remove the current now-playing bar.
- A short preview tone of three seconds or less may overlap a long-running owner. This matches the Feature 005 owner contract.
- A score track with no volume or pan uses volume `1` and pan `0`.
- The status strings `Loading guitar sounds`, `Studio ready`, and `Synth fallback` are the learner-facing labels. This feature does not show raw oscillator names.
- Same-origin pack files may exist later under `assets/audio/`. This feature may add empty pack folders and a manifest schema. It must not add a third-party audio URL.
- The old Guitar Pro decision D13 stays in `specs/002-gp-player-overhaul/research.md`. This feature records a new decision that replaces D13 for future sound work. The old text stays as history.
- The Atomic Purple Game Boy Color theme stays. New status text uses the current player chrome.
- Android Chrome listening approval is a Feature 010 exit criterion. This feature does not require that approval.

## Current Problems

This section records the faults that this feature must remove or prepare to remove.

1. The player ignores imported track pan. FR-008 covers this.
2. The player starts imported track volume at `1` instead of the source value. FR-008 covers this.
3. The current headroom rule changes a note level from the active voice count. Later notes can become quieter during long sustains. FR-017 covers this.
4. The master gain follows the compressor. A value above `1` can restore clipping. FR-013 and FR-014 cover this.
5. Two audio tools can play at the same time. FR-001 and FR-002 cover this.
6. The Study Lab drone can bypass the shared analyzer and compressor. Feature 008 removes that duplicate voice. This feature provides the shared bus that Feature 008 must use.
7. There is no pack contract, no pack loader, and no pack cache rule. Later sample features cannot land on a stable base. FR-019 to FR-034 cover this.

## Out of Scope

- A production drum sample pack, velocity layers, round robins, or choke groups. Those belong to Feature 007.
- A shared drone rewrite, keyboard Play and Drone modes, or musical keyboard presets. Those belong to Feature 008.
- A production guitar or bass sample pack, timeline articulation fields, tie voice reuse, or per-track sound overrides. Those belong to Feature 009.
- Pack install and remove UI, a listening comparison page, and a shared room impulse. Those belong to Feature 010.
- Replacement of the Guitar Pro parser, score renderer, timeline, or practice UI.
- A backend, a build step, or an npm package in the CLI.
- Audio from a third-party host.
- A DAW, an amp editor, or a full sound designer.
- A change to the Atomic Purple Game Boy Color visual system.
