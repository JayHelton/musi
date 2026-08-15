# Tasks: Audio Engine Foundation

**Input**: Design documents from `/specs/006-audio-engine-foundation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: The specification requires Node tests and browser harness pages. This list includes those tests.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5)
- Each description includes an exact file path

## Path Conventions

- Web modules live under `js/` and `js/audio/`
- Guitar Pro tests live under `tests/gp-player/`
- Browser harness pages live under `tests/gp-player/audio/`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the folders and empty pack tree for the foundation

- [X] T001 Create `js/audio/` and add `assets/audio/packs/README.md` plus `assets/audio/impulses/README.md` with the same-origin pack rule
- [X] T002 [P] Add a fixture manifest at `tests/gp-player/fixtures/packs/empty-core/manifest.json` with an empty `samples` array
- [X] T003 [P] Record the D13 replacement pointer in `specs/002-gp-player-overhaul/research.md` without editing the old D13 decision text

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared mix graph, owner registry, pack contract, and cache rules that every story needs

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Implement `parsePackManifest` and `registerPack` in `js/audio/samplePackRegistry.js` per `specs/006-audio-engine-foundation/contracts/pack-manifest.md`
- [X] T005 Implement `claimAudio`, `releaseAudio`, `getAudioOwner`, and `getActiveOwner` in `js/audio/audioOwner.js` per `specs/006-audio-engine-foundation/contracts/audio-owner.md`
- [X] T006 Implement track buses, mix input, master-then-safety order, and the analyser tap in `js/audio/mixBus.js` per `specs/006-audio-engine-foundation/contracts/mix-bus.md`
- [X] T007 Wire `ensureAudio`, `getMixDestination`, and `getAnalyserDestination` in `js/audio.js` to the new mix graph in `js/audio/mixBus.js`
- [X] T008 Implement `loadPacksForScore`, `cancelLoad`, and `getPlaybackSourceState` in `js/audio/sampleLoader.js` per `specs/006-audio-engine-foundation/contracts/pack-loader.md`
- [X] T009 Precache `js/audio/audioOwner.js`, `js/audio/mixBus.js`, `js/audio/samplePackRegistry.js`, and `js/audio/sampleLoader.js` in `service-worker.js` and bump `CACHE_VERSION`
- [X] T010 Change the activate handler in `service-worker.js` so it keeps cache names that start with `musi-pack-`
- [X] T011 Update `tests/gp-player/offline-manifest.mjs` so it requires the new `js/audio/` modules and rejects `assets/audio/packs/` in `PRECACHE_URLS`

**Checkpoint**: Foundation ready. User story work can start.

---

## Phase 3: User Story 1 - Playback starts at once with the fallback (Priority: P1) 🎯 MVP

**Goal**: The score appears at once. Play uses the current synth voices. A missing pack does not block Play.

**Independent Test**: Open a saved score and press Play before any pack is ready. The synth fallback sounds. The status shows `Synth fallback`. `node tests/gp-player/run.mjs` still passes.

### Tests for User Story 1

- [X] T012 [P] [US1] Add `tests/gp-player/pack-loader.mjs` for missing-pack fallback and score-replace cancel
- [X] T013 [P] [US1] Add `tests/gp-player/audio/pack-fallback.html` and register it in `tests/gp-player/run-browser.mjs`

### Implementation for User Story 1

- [X] T014 [US1] Keep `createVoiceFactory` as the Guitar Pro sounding path in `js/gpMixPlayer.js` when no pack is ready
- [X] T015 [US1] Start `loadPacksForScore` after score parse in `js/gpPlayerUI.js` without blocking the first render
- [X] T016 [US1] Allow `play()` in `js/gpMixPlayer.js` before a pack load settles
- [X] T017 [US1] Add a `role="status"` source label in `js/gpPlayerUI.js` that shows `Loading guitar sounds`, `Studio ready`, or `Synth fallback`
- [X] T018 [US1] Refuse a mid-note or mid-loop source switch in `js/gpMixPlayer.js` per FR-029

**Checkpoint**: Play works at once with the synth fallback. The current Guitar Pro suite still passes.

---

## Phase 4: User Story 2 - One tool owns the sound (Priority: P1)

**Goal**: Two long-running audio tools cannot play at the same time.

**Independent Test**: Start Guitar Pro playback, then start the keyboard. The score stops or pauses. Repeat with drums, metronome, and a study tone.

### Tests for User Story 2

- [X] T019 [P] [US2] Add `tests/gp-player/audio-owner.mjs` for second-claim, same-id re-claim, and preview-under-3s cases
- [X] T020 [P] [US2] Add `tests/gp-player/audio/audio-owner.html` and register it in `tests/gp-player/run-browser.mjs`

### Implementation for User Story 2

- [X] T021 [US2] Claim kind `score` before Guitar Pro play in `js/gpMixPlayer.js` and release on stop or destroy
- [X] T022 [P] [US2] Claim and release the owner in `js/keyboard.js`
- [X] T023 [P] [US2] Claim and release the owner on drum-machine start in `js/drums/drumEngine.js`
- [X] T024 [P] [US2] Claim and release the owner in `js/metronome.js`
- [X] T025 [US2] Claim the owner for study tones longer than three seconds in `js/studyLabMic.js` and connect that output to `getMixDestination()`
- [X] T026 [US2] Keep short previews on `getMixDestination()` without a claim in `js/earTrainer.js` and `js/chordReference.js`

**Checkpoint**: A second long-running tool stops or pauses the first tool. A short preview does not steal the metronome.

---

## Phase 5: User Story 3 - The mix follows the imported score (Priority: P2)

**Goal**: First playback uses imported track volume and pan. Mute and solo still work.

**Independent Test**: Open a score with volume `0.4` and pan `-1` on one track. The first play is quieter and stronger on the left.

### Tests for User Story 3

- [X] T027 [P] [US3] Add `tests/gp-player/imported-mix.mjs` that reads `trackInfo` into player state and mix-player buses

### Implementation for User Story 3

- [X] T028 [US3] Initialize `trackVolumes` from `model.trackInfo.volume` in `js/gpPlayer/playerState.js` on first load and on `resetForNewScore()`
- [X] T029 [US3] Store and apply `trackPans` from `model.trackInfo.pan` in `js/gpPlayer/playerState.js`
- [X] T030 [US3] Create each Guitar Pro track bus with source volume and pan in `js/gpMixPlayer.js` instead of a bare gain of `1`
- [X] T031 [US3] Add `setTrackPan` in `js/gpMixPlayer.js` and keep `setTrackVolume` on the track bus
- [X] T032 [US3] Keep mute and solo on the track bus in `js/gpPlayer/trackMixer.js` without changing display-track choice

**Checkpoint**: Imported volume and pan affect the first play. Mute and solo still work.

---

## Phase 6: User Story 4 - Dense playback stays safe (Priority: P2)

**Goal**: A dense chord stays at or below `-1 dBFS`. A later note does not fall only because earlier notes still hold.

**Independent Test**: Render a six-note chord through the shared mix. The protected peak stays at or below `-1 dBFS`. A new note after a sustain keeps its own onset gain.

### Tests for User Story 4

- [X] T033 [US4] Change `tests/gp-player/audio/peak-headroom.html` so it renders through the shared mix and safety stage and uses a `-1 dBFS` limit

### Implementation for User Story 4

- [X] T034 [US4] Replace `headroomGain` in `js/gpPlayer/instrumentVoices.js` so it uses `chordSize` and does not divide by `active.length`
- [X] T035 [US4] Group same-onset notes and pass `chordSize` from `js/gpMixPlayer.js` into `playNote`
- [X] T036 [US4] Keep `MAX_ACTIVE_VOICES` as a steal cap only in `js/gpPlayer/instrumentVoices.js`
- [X] T037 [US4] Confirm master volume `1.5` still stays at or below `-1 dBFS` in `js/audio/mixBus.js` and `tests/gp-player/audio/peak-headroom.html`

**Checkpoint**: Dense playback stays safe. Later notes do not drop from held-voice count.

---

## Phase 7: User Story 5 - Packs have a contract and a safe fallback (Priority: P3)

**Goal**: The pack contract and loader exist. A missing or broken pack uses the fallback. Optional packs stay out of the app-shell list.

**Independent Test**: Point the loader at a missing pack and a broken manifest. Play starts with `Synth fallback` and no unhandled error.

### Tests for User Story 5

- [X] T038 [P] [US5] Add `tests/gp-player/pack-manifest.mjs` for valid empty samples, missing id, foreign URL, and path escape
- [X] T039 [US5] Extend `tests/gp-player/audio/pack-fallback.html` for broken manifest, storage reject, and no unhandled error

### Implementation for User Story 5

- [X] T040 [US5] Reject foreign hosts and path escape in `js/audio/samplePackRegistry.js`
- [X] T041 [US5] Return `{ status: 'fallback' }` without a throw from `js/audio/sampleLoader.js` on miss, decode failure, or storage reject
- [X] T042 [US5] Write successful fixture files only to `musi-pack-<id>-<version>` from `js/audio/sampleLoader.js` and never to `PRECACHE_URLS`
- [X] T043 [US5] Add a size check in `tests/gp-player/pack-loader.mjs` that fails when `js/audio/*.js` exceeds 150 KiB

**Checkpoint**: The loader is safe without production samples. The app shell stays small.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Verify the whole foundation before Feature 007

- [X] T044 Run `node tests/gp-player/run.mjs` and fix any regression in `js/gpMixPlayer.js` or `js/gpPlayer/instrumentVoices.js`
- [ ] T045 [P] Run `node tests/gp-player/run-browser.mjs peak-headroom.html audio-owner.html pack-fallback.html onset-timing.html loop-boundary.html` against a server at `http://localhost:8080`
- [ ] T046 [P] Follow `specs/006-audio-engine-foundation/quickstart.md` for first render, owner, imported mix, and offline fallback
- [X] T047 Confirm `CACHE_VERSION` in `service-worker.js` changed after the shipped JS edits

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup. Blocks all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational. MVP
- **User Story 2 (Phase 4)**: Depends on Foundational. Can start after US1 or in parallel
- **User Story 3 (Phase 5)**: Depends on Foundational mix buses. Can start after US1
- **User Story 4 (Phase 6)**: Depends on Foundational safety stage and US1 play path
- **User Story 5 (Phase 7)**: Depends on Foundational loader. Completes the US1 fallback path
- **Polish (Phase 8)**: Depends on US1 through US5

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Phase 2. No dependency on US2 to US5
- **User Story 2 (P1)**: Can start after Phase 2. Uses the owner from T005
- **User Story 3 (P2)**: Can start after Phase 2. Uses track buses from T006
- **User Story 4 (P2)**: Needs the mix graph from T006 and the play path from US1
- **User Story 5 (P3)**: Needs the loader from T008 and the status from US1

### Parallel Opportunities

- T002 and T003 can run in parallel after T001
- T004, T005, and T006 can start in parallel. T007 depends on T006. T008 depends on T004
- T012 and T013 can run in parallel
- T019 and T020 can run in parallel
- T022, T023, and T024 can run in parallel after T021
- T038 can run in parallel with T040

### Parallel Example: User Story 2

```bash
Task: "Add tests/gp-player/audio-owner.mjs"
Task: "Add tests/gp-player/audio/audio-owner.html"
Task: "Claim and release the owner in js/keyboard.js"
Task: "Claim and release the owner in js/metronome.js"
Task: "Claim and release the owner in js/drums/drumEngine.js"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. Stop and run `node tests/gp-player/run.mjs`
5. Confirm Play works with `Synth fallback`

### Incremental Delivery

1. Setup + Foundational → shared graph and loader exist
2. User Story 1 → Play works at once
3. User Story 2 → one owner
4. User Story 3 → imported mix
5. User Story 4 → safe peak
6. User Story 5 → pack contract
7. Polish → full quickstart

### Suggested MVP scope

User Story 1 plus Phase 2. That slice keeps the current player working and adds the fallback status.

---

## Notes

- Do not add production `wav` or `flac` files
- Do not add `js/audio/sampleVoice.js` or `js/audio/droneVoice.js`
- Do not start Features 007, 008, 009, or 010
- Do not replace the Guitar Pro parser, renderer, timeline, or practice UI
- Do not add a backend, a build step, or a CLI npm package
- Commit after each logical group
- Bump `CACHE_VERSION` in `service-worker.js` after shipped JS changes
