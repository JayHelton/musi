# Tasks: Backing Track Sync

**Input**: `specs/008-backing-track-sync/spec.md`, `specs/008-backing-track-sync/plan.md`

**Status**: All tasks complete.

## Phase 1: Engine

- [X] T001 Add `state.notesMuted` and the early return in `scheduleEvent` in `js/gpMixPlayer.js`
- [X] T002 Add `setNotesMuted(on)` with a voice fade in `js/gpMixPlayer.js`
- [X] T003 Expose `notesMuted` and `rate` getters in `js/gpMixPlayer.js`
- [X] T004 [P] Write `tests/gp-player/notes-mute.mjs`

## Phase 2: Storage (US1, US2)

- [X] T005 Create `js/gpBackingTrack.js` with the per-score record and the clamps
- [X] T006 Add `parseYouTubeUrl` for watch, short, embed, Shorts, and bare-id forms
- [X] T007 Move the record with the score key in `js/gpPlayer.js`
- [X] T008 [P] Write `tests/gp-player/backing-store.mjs`

## Phase 3: The follower (US1, US3)

- [X] T009 Create `js/gpPlayer/backingSync.js` with `targetMediaSec` and `driftRateFactor`
- [X] T010 Add the reconcile pass, the seek cooldown, and the status report
- [X] T011 [P] Write `tests/gp-player/backing-sync.mjs`

## Phase 4: The sources (US1, US4)

- [X] T012 Create the file source in `js/gpPlayer/backingSources.js` with `preservesPitch`
- [X] T013 Route the file source through the `backing` track bus
- [X] T014 Add the YouTube source and the lazy IFrame API load
- [X] T015 Snap the YouTube rate and report an unsupported speed

## Phase 5: The drawer (US1, US2, US4)

- [X] T016 Create `js/gpPlayer/backingPanel.js` with the source, playback, and delay groups
- [X] T017 Add "Set from here", the fine trim steps, and the reset buttons
- [X] T018 Mount the drawer and bridge the clock in `js/gpPlayerUI.js`
- [X] T019 Add the menu row in `js/gpPlayer/playerMenu.js`
- [X] T020 Add the "Real song" button in `js/gpPlayer/practiceRail.js`
- [X] T021 Add the drawer styles in `css/gpplayer.css`, with theme tokens only

## Phase 6: Shell and checks

- [X] T022 Precache the four new modules and bump `CACHE_VERSION` in `service-worker.js`
- [X] T023 Keep the YouTube hosts out of the cross-origin cache in `service-worker.js`
- [X] T024 Describe the feature in the Score Player blurb in `index.html`
- [X] T025 Write `tests/gp-player/audio/backing-sync.html` and register it in `run-browser.mjs`
