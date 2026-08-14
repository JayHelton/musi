# Research: current code state for Tool-First Simplification

**Created**: 2026-08-13

**Status**: Background input for planning. This file is not a requirement source.
The requirements live in `spec.md`.

This file records the verified state of the code before the change. Four exploration
passes produced it, and direct searches confirmed the load-bearing facts. Symbol names
and user-visible strings appear verbatim. File paths carry no line numbers, because
line numbers age quickly.

## 1. Corrections to the brief

The refactor brief made several assumptions that the code does not match. Planning must
account for them.

| Brief assumption | Verified state |
| --- | --- |
| Move song-related notes to the associated song when the relationship exists. Move exercise, workbook, or routine notes to the associated entity. | A note record holds only `id`, `title`, `body`, `createdAt`, and `updatedAt` in `js/notes.js`. No note field links a note to any other entity. Every existing note must therefore go to Unfiled Notes. The conditional rules apply only to notes that gain a relationship later. |
| Convert imported or user-saved drum files and patterns into generic Exercises. Preserve the source attachment. | `js/drums/drumPatternDb.js` stores patterns in the IndexedDB database `musi-drums`, object store `patterns`. A pattern holds step data and a `tab` string. A Guitar Pro drum import produces a pattern in memory; the drums store keeps no original file bytes and no attachment identifier. No source attachment exists to preserve. The migration must build an exercise attachment from the stored pattern. |
| Version every migration. Make migrations idempotent. | The repo has no client migration framework. Each model normalises its records when it reads them, for example `normalizeNote`, `normalizeWorkbook`, and `normalizeItem`. `js/persistence.js` holds no schema version. Only export envelopes and the cloud shadow store carry a version number. The feature must add the framework. |
| "Separate GP saved-score library" is a thing to remove. | `js/gpPlayer.js` already saves scores into the Exercises library. Guitar Pro files live in the IndexedDB database `musi-attachments`, object store `files`, and an exercise references one by `attachmentId`. The separate surface to remove is the player's own score list, not a second store. Guitar Pro section notes live in the localStorage key `musi.gpAnnotations` and use a score key of the form `att:<attachmentId>` or `sess:<fileName>:<byteLength>`. |
| One implementation owns ... Guitar Pro parsing. | One shared entry point already exists. `js/tab/guitarPro.js` exports `parseGuitarPro` and routes modern `.gp` files itself. It delegates `.gp5` files to `js/tab/gp5.js`. Two readers exist for two file generations, but the entry point is already the single owner. `js/tab/tabPlayer.js` holds an alternate `createTabPlayer` scheduler that no module imports. |
| Only Pitch and Ear can show scores, streaks, accuracy. | Most quiz streaks live in memory only. Persistent progress values are the `stats` key inside `musi:settings`, the `study.progress` key, and the Interval Map keys `io.mastery` and `io.masteryV2`. Cloud sync carries these in its `progress` domain. Removal of the quiz screens does not remove these stored values on its own. |
| Brief route table lists 27 legacy hashes. | Every listed hash exists today. Two extra aliases also exist and the brief does not list them: `#intervalmap` resolves to `intervalorbit`, and `#tabanalyzer` resolves to `gpplayer`. Also `#chordlab` opens the Chord Workout quiz today, and the brief sends it to Chord Lab Reference. |

## 2. Routing and navigation today

The app routes on the URL hash. `js/appRoute.js` exports `parseAppRoute`,
`buildAppRoute`, `routeUrl`, and `sameRoute`. A route is `{ id, params }`.

`routeUrl` returns the path with no hash for the `home` route. Every other route uses
`#<id>` or `#<id>?key=val`.

`js/main.js` owns `isValidSection`, `resolveSectionAlias`, `applySection`,
`showSection`, and `applyRoute`. A route id maps to a `sec-<routeId>` element with the
class `section`. The active section gains the class `active`.

The root route today is `home`. `index.html` marks `sec-home` active, and `init()` in
`js/main.js` replaces the history state with the `home` route when the hash is empty.

Tool ids come from `TOOLS` in `js/tools.js`. Categories come from `CATEGORIES`.
`getTabs()` returns the enabled tools.

Hub routes use the id form `hub-<categoryId>` for the four categories `train`,
`reference`, `create`, and `tools`. `renderHub()` in `js/home.js` fills them.

Routine deep links use the id `routines` with the parameter keys `routine`, `session`,
`workbook`, `exercise`, and `companion`, from `ROUTINE_PARAM_KEYS` in
`js/routineRoute.js`.

`js/main.js` listens for `popstate` and `hashchange`. `goBack(fallback)` uses
`history.back()` when `navPushCount` is above zero. `history.scrollRestoration` is
`manual`.

Scroll restoration exists only inside the routine stack, through `saveScrollForRoute`
and `restoreScroll` in `js/routineNav.js`. A top-level section change restores no
scroll position.

Desktop shows one dock button per enabled tool, built by `rebuildDesktopDock` in
`js/main.js`. Mobile shows five category buttons: Home, Train, Reference, Create, and
Tools.

`js/home.js` renders the routine cards first, then a status line, then a collapsed
`<details>` panel with the summary `Browse tools`. The empty state uses the title
`No routines yet` and the text `Create a routine or import a Musi routine file.`, with
the actions `New Routine` and `Import Routine`.

The per-feature visibility catalog lives in the Features section of
`js/musicPreferences.js`. It stores enabled tool ids under the setting key
`features.enabled`. `js/tools.js` exports `isFeatureEnabled`, `setFeatureEnabled`, and
`saveEnabledFeatures`. `musicprefs` is always on. When the key is unset, every tool is
enabled. A change fires the `musi:features-changed` event.

Tool favorites live under the setting key `home.favorites`. Picker favorites and recents
live under the keys `picker.recentRoots`, `picker.favoriteRoots`, `picker.recentScales`,
`picker.favoriteScales`, `picker.recentChords`, `picker.favoriteChords`,
`picker.recentTunings`, and `picker.favoriteTunings`, through `js/recents.js`. Drum
favorites live under `drums.favorites`. The last tool and last category live under
`nav.lastTool` and `nav.lastCategory`.

### Legacy hash routes

| Hash | Owning module |
| --- | --- |
| `#scales` | `js/scaleQuiz.js` |
| `#scaleref` | `js/scaleReference.js` |
| `#circle` | `js/circleOfFifths.js` |
| `#studylab` | `js/studyLab.js` |
| `#intervals` | `js/intervalQuiz.js` |
| `#fretboard` | `js/fretboardTrainer.js` |
| `#intervalorbit` | `js/intervalOrbit.js`, `js/interval-map/ui.js` |
| `#chordlab` | `js/chordWorkout.js` |
| `#chords` | `js/chordReference.js`, `js/chordBuilder.js`, `js/movableChordCards.js` |
| `#triads` | `js/triadReference.js` |
| `#tuner` | `js/vocalTrainer.js`, `js/pitchTrainer.js`, `js/pitchRunner.js` |
| `#ear` | `js/earTrainer.js` |
| `#timing` | `js/timingDrill.js` |
| `#metronome` | `js/metronome.js` |
| `#practice` | `js/practiceTimer.js` |
| `#sightreading` | `js/sightReadingTrainer.js` |
| `#recorder` | `js/recorder.js` |
| `#tracktosheet` | `js/trackToSheet.js` |
| `#songwriter` | `js/songwriter.js` |
| `#notes` | `js/notes.js` |
| `#keyboard` | `js/keyboard.js` |
| `#drums` | `js/drums/drumsUI.js` |
| `#exercises` | `js/exercises.js` |
| `#workbooks` | `js/workbooks.js` |
| `#routines` | `js/routines.js`, `js/routineRoute.js`, `js/routineNav.js` |
| `#gpplayer` | `js/gpPlayer.js` |
| `#musicprefs` | `js/musicPreferences.js` |
| `#intervalmap` (alias) | resolves to `intervalorbit` |
| `#tabanalyzer` (alias) | resolves to `gpplayer` |

## 3. Data and persistence today

### Storage map

**localStorage keys**

| Key | Role |
| --- | --- |
| `musi:settings` | Settings bag, owned by `js/persistence.js` |
| `musi.notes` | Note records |
| `musi.songs` | Song records |
| `musi.exercises` | Exercise library |
| `musi.workbooks` | Workbook records |
| `musi.routines` | Routine records |
| `musi.gpAnnotations` | Guitar Pro section notes |
| `musi.gpAutoFollow` | Guitar Pro auto-follow preference |
| `musi.gpParchmentZoom` | Guitar Pro zoom preference |
| `musi.gpMetroPrefs` | Global Guitar Pro metronome prefs |
| `musi.gpMetroPrefs.<scoreKey>` | Per-score Guitar Pro metronome prefs |
| `musi.auth` | Auth token bag |

**sessionStorage keys**

| Key | Role |
| --- | --- |
| `musi.bootSplash.done` | Boot splash completion flag |

**IndexedDB databases**

| Database | Object store | Key path |
| --- | --- | --- |
| `musi-attachments` | `files` | `id` |
| `musi-drums` | `patterns` | `id` |
| `musi-sync` | `meta`, `shadow`, `tombstones`, `blobQueue` | per store |

**Identifier prefixes**

| Prefix | Entity |
| --- | --- |
| `ex-`, `cat-` | Exercises and folders |
| `wb-`, `wbe-`, `wbf-` | Workbooks, entries, and folders |
| `rt-`, `rs-` | Routines and sessions |
| `song-` | Songs |
| `note-` | Notes |
| `att-` | Attachments |
| `gpa-` | Guitar Pro annotation records |
| `usr-` | Player drum patterns |

### Record shapes

**Exercise item**

| Field | Notes |
| --- | --- |
| `id` | |
| `name` | |
| `categoryId` | |
| `attachmentId` | |
| `url` | |
| `fileName` | |
| `type` | |
| `size` | |
| `addedAt` | |
| `preferredTrackIndex` | |
| `measureStart` | |
| `measureEnd` | |
| `startBeat` | |
| `endBeat` | |
| `loopEnabled` | |
| `loopRestSec` | |
| `bpm` | |
| `transpose` | |
| `tuning` | |
| `retuneMode` | |
| `takes` | |

An item needs `attachmentId` or `url`.

**Workbook**

| Field | Notes |
| --- | --- |
| `id` | |
| `name` | |
| `folderId` | |
| `entries` | Each `{ id, exerciseId }` |
| `companions` | Types: `scale-ref`, `triad-ref`, `sweep-ref`, `pitch-train`, `interval-orbit`, `ear-train` |
| `loopEnabled` | |
| `activeEntryId` | |
| `createdAt` | |
| `updatedAt` | |

**Routine**

| Field | Notes |
| --- | --- |
| `id` | |
| `name` | |
| `description` | |
| `sessions` | |
| `activeSessionId` | |
| `createdAt` | |
| `updatedAt` | |

**Routine session**

| Field | Notes |
| --- | --- |
| `id` | |
| `name` | |
| `notes` | |
| `workbookIds` | |
| `durationMin` | |
| `metronome` | |
| `completed` | |

**Song**

| Field | Notes |
| --- | --- |
| `id` | |
| `title` | |
| `lyrics` | |
| `recordings` | Each `{ id, name, addedAt }` |
| `createdAt` | |
| `updatedAt` | |

A legacy `audioId` and `audioName` pair upgrades to `recordings` when the app reads it.

**Note**

| Field | Notes |
| --- | --- |
| `id` | |
| `title` | |
| `body` | |
| `createdAt` | |
| `updatedAt` | |

No relationship field exists.

**Attachment**

| Field | Notes |
| --- | --- |
| `id` | |
| `blob` | |
| `name` | |
| `fileName` | |
| `type` | |
| `size` | |
| `createdAt` | |
| `source` | Known values: `upload`, `recording`, `exercise`, `exercise-take`, `songwriter` |

**Drum pattern**

| Field | Notes |
| --- | --- |
| `id` | |
| `title` | |
| `category` | `beat`, `fill`, or `exercise` |
| `style` | |
| `tags` | |
| `difficulty` | |
| `bpmRange` | |
| `meter` | |
| `subdivision` | |
| `bars` | |
| `stepsPerBar` | |
| `recommendedLoopBars` | |
| `notes` | |
| `sourcePdf` | |
| `sourcePage` | |
| `parseMethod` | |
| `steps` | |
| `tab` | |
| `builtin` | |
| `createdAt` | |
| `updatedAt` | |

Built-in patterns live in `js/drums/builtinPatterns.js` and not in the database.

### Referential integrity

A workbook entry names an exercise by `exerciseId`. A routine session names workbooks
by `workbookIds`. Both use identifiers only. `pruneMissingExercises` and
`pruneMissingWorkbooks` drop dead references. A routine export embeds workbook
snapshots, but that is export only.

### Existing upgrade behavior

Each model normalises its records on read. The songwriter legacy audio upgrade runs on
read. The settings key copy from `ref.*` to `triadref.*` runs on read.
`migrateAnnotations(fromKey, toKey)` in `js/gpAnnotations.js` moves annotation keys.
`ROUTINE_EXPORT_VERSION = 1`. `SNAPSHOT_VERSION = 1` in `js/sync/syncProfile.js`.
`SHADOW_SCHEMA_VERSION = 1` in `js/cloud/shadowStore.js`.

### Sync

`SYNC_DOMAINS` in `js/cloud/recordMap.js` lists `settings`, `progress`, `notes`,
`songs`, `exercises`, `exerciseCategories`, `workbooks`, `workbookFolders`, `routines`,
`gpAnnotations`, `drumPatterns`, and `attachmentsMeta`. The Supabase `payload` column
is opaque JSON.

Device-local settings keys stay out of sync: `nav.lastTool`, `nav.lastCategory`,
`io.audioCalibrated`, `io.minRms`, `musi.bootSplash.done`, and any key with the prefix
`subview.`, `sync.`, or `cloud.`.

The sync domain `drumPatterns` needs a decision when the Drums module goes away.

## 4. Audio, microphone, and tempo today

`js/audio.js` owns the only `AudioContext`. It exports `ensureAudio`, `audioCtx`,
`getAnalyserDestination`, `requestMicStream`, `releaseMicStream`, and `midiFreq`. The
bus chain is analyser, then compressor, then master gain, then the destination. No
feature module creates its own context.

Many modules create their own oscillator and gain nodes on the shared context.

`js/pitch.js` owns the live pitch detector and exports `detectPitch` and
`createPitchTracker`. Eight or more modules use it. A second, separate detector lives in
`js/trackToSheet/dsp.js` and serves offline transcription. Both use the McLeod method.

Six or more click schedulers exist: `js/metronome.js`, `js/routineMetronome.js`,
`js/timingDrill.js`, `js/drums/drumEngine.js`, `js/gpMixPlayer.js`, and the unused
`js/tab/tabPlayer.js`. Each uses a Web Audio lookahead with a `setTimeout` driver.

The global metronome already supports subdivisions (`metro.subdiv` with the ids
`quarter`, `eighth`, `triplet`, and `sixteenth`), accents (`metro.accents`), tempo
phases (`metro.phasesEnabled`, `metro.phasesLoop`, `metro.phases`), and a count-in
(`metro.countIn`). `js/practiceTimer.js` drives the global metronome and adds a
countdown only.

`js/nowPlaying.js` is a display bar with `showNowPlaying`, `hideNowPlaying`, and
`initNowPlaying`. It is not an audio mutex.

`stopOtherTools(keepIds)` in `js/main.js` runs a per-tool stopper when the player
changes section. No global single-owner registry exists. Short tones from a chord preview
or an ear replay do not stop on a section change.

The hold-to-record button and the pitch overlay live in `index.html` as `#hold-rec-btn`
and `#hold-rec-overlay`, with the readouts `#hold-rec-note`, `#hold-rec-cents`,
`#hold-rec-freq`, `#hold-rec-meter`, `#hold-rec-timer`, and `#hold-rec-live-seq`.
`js/recorder.js` owns them. CSS hides the button when the body lacks the class
`hold-rec-relevant`, which `updateHoldRecordVisibility` sets from the tool flag
`holdRecord`.

No `beforeunload` handler and no confirm dialog protect an unsaved recording.
`stopRecorder()` stops the capture but does not clear the blob, so the recording stays in
memory after the player leaves.

Guitar Pro playback uses `createGpMixPlayer` in `js/gpMixPlayer.js`, mounted through
`mountGpPlayer` in `js/gpPlayerUI.js`. The player already supports loop, transpose,
tuning and retune mode, a track mixer, measure seek and selection, a count-in, a score
metronome, and a tempo ramp.

## 5. Duplicate implementations

| Responsibility | Canonical owner | Duplicate sites |
| --- | --- | --- |
| Musical context | `js/musicalContext.js` owns `root`, `scale`, `tempo`, `rootMode`, and `scaleMode`, with the keys `context.root`, `context.scale`, `context.tempo`, `context.rootMode`, and `context.scaleMode`. It does NOT own tuning, meter, or volume. | `js/scaleReference.js`, `js/chordReference.js`, `js/triadReference.js`, `js/fretboardTrainer.js`, `js/chordWorkout.js` (which ignores the shared context), `js/sweepReference.js`, `js/movableChordCards.js`, `js/interval-map/ui.js` |
| Scale data | `SCALES` in `js/scales.js` is canonical with 27 entries. | `SCALE_MAJOR_INTERVALS` in `js/interval-map/model.js` duplicates the major set. `STAGE_INTERVALS` in `js/intervalOrbitModel.js` and `LEVEL_DEFS` in `js/interval-map/model.js` hold parallel curriculum tables. |
| Chord data | `CHORDS` in `js/chords.js` is canonical. | `TRIAD_QUALITIES` in `js/triadReference.js`, `CHORD_TYPES` in `js/analysis/chordDetect.js`, and `CHORD_FORMULAS` with `QUALITY_FORMULAS` in `js/intervalOrbitModel.js` duplicate semitone sets. `js/scaleReference.js` holds a local `TRIAD_QUALITIES` map for diatonic inference. |
| Fretboard pictures | No single owner. | At least eleven renderers: `js/fretboardTrainer.js`, `js/scaleReference.js`, `js/chordReference.js`, `js/triadReference.js`, `js/sweepReference.js`, `js/chordWorkout.js`, `js/interval-map/fretboardView.js`, `js/exerciseCompanions/diagram.js`, `js/exerciseCompanions/triadRef.js`, `chord-cards/src/render.js`, and `cli/src/trainers/fretboard.js`. They mix DOM grids and SVG. The constant `FB_DOTS` repeats in several files. |
| Tunings | `TUNING_CATALOG` and `TUNINGS` in `js/tunings.js` are canonical, and `js/theory.js` re-exports `TUNINGS`. | `SWEEP_OPEN_MIDI` in `js/sweepReference.js` and `OPEN_PC` in `js/sweepPatterns.js` duplicate the standard tuning. |
| Guitar Pro reading | `parseGuitarPro` in `js/tab/guitarPro.js` is the single entry point and it delegates `.gp5` to `js/tab/gp5.js`. | `js/tab/tabParser.js` reads ASCII tab text, which is a different job. |
| Exercise writes | `js/exercises.js` owns the store. | Five or more entry paths: the exercises screen, the Guitar Pro segment import in `js/gpPlayer.js`, the bulk import in `js/exercisesBulk.js`, the transcription export in `js/trackToSheet.js`, and the cloud and sync restore paths in `js/cloud/reconcile.js` and `js/sync/syncBundle.js`. |

## 6. Test and validation baseline

The repo has no test framework, no lint tooling, no type checker, and no build step.
Tests are plain Node ESM scripts that use `node:assert/strict`. A runner prints one line
per test and exits with code 0 on success and 1 on failure. Shared helpers are
`tests/cloud/harness.mjs`, `tests/exercises/idbShim.mjs`, `tests/gp-player/domShim.mjs`,
and `tests/cloud/transportFake.mjs`. The root has no `package.json`; `cli/package.json`
has one script, `start`.

Baseline measured on 2026-08-13 at commit `03b20a0`:

| command | exit | result |
| --- | --- | --- |
| `node tests/workbooks/run.mjs` | 0 | 31 tests pass, plus the companion panel tests |
| `node tests/track-to-sheet/run.mjs` | 0 | pass |
| `node tests/track-to-sheet/panel.mjs` | 0 | pass |
| `node tests/track-to-sheet/options.mjs` | 0 | pass |
| `node tests/track-to-sheet/dsp.mjs` | 0 | pass |
| `node tests/track-to-sheet/accuracy.mjs` | 0 | 16 scenarios pass |
| `node tests/sync/zip.mjs` | 0 | 14 tests pass |
| `node tests/sync/profile.mjs` | 0 | 15 tests pass |
| `node tests/sync/frames.mjs` | 0 | 15 tests pass |
| `node tests/sync/bundle.mjs` | 0 | 15 tests pass |
| `node tests/sync/run-browser.mjs http://localhost:8080` | 0 | roundtrip and bundle roundtrip pass, and it needs a local server and Chrome |
| `node tests/study-lab/run.mjs` | 0 | 6 tests pass |
| `node tests/routines/run.mjs` | 0 | 52 tests pass |
| `node tests/routine-nav/run.mjs` | 0 | 46 tests pass |
| `node tests/qr/run.mjs` | 0 | 10 tests pass |
| `node tests/interval-map/run.mjs` | 0 | 38 tests pass |
| `node tests/genre-removal/run.mjs` | 0 | 4 source guard tests pass |
| `node tests/exercises/run.mjs` | 0 | 8 modules pass |
| `node tests/companions/run.mjs` | 0 | pass |
| `node tests/cloud/run.mjs` | 0 | 67 tests pass |
| `node tests/gp-player/wiring.mjs` | 0 | pass |
| `node tests/gp-player/smoke.mjs` | 0 | pass |
| `node tests/gp-player/metronome.mjs` | 0 | pass |
| `node tests/gp-player/metro-click.mjs` | 0 | pass |
| `node tests/gp-player/loop-playback.mjs` | 0 | pass |
| `node tests/gp-player/exercise-slice.mjs` | 0 | pass |
| `node tests/gp-player/exercise-import.mjs` | 0 | pass |
| `node tests/gp-player/exercise-import-ui.mjs` | 0 | pass |
| `node tests/gp-player/drum-parsing.mjs` | 0 | pass |
| `node tests/gp-player/drum-notation.mjs` | 0 | pass |
| `bash tests/supabase/run.sh` | 1 | fails in this environment with `PostgreSQL server binaries not found` |
| `node cli/bin/musi.js --help` | 0 | prints the help text |
| `node cli/bin/musi.js reference --root C --type "Major (Ionian)"` | 0 | prints the scale reference |

**Routing cover**: `tests/routine-nav/run.mjs` exercises routine stack navigation and
scroll restoration.

**Storage and merge cover**: `tests/workbooks`, `tests/routines`, `tests/exercises`,
`tests/cloud`, and `tests/sync` exercise model logic, import, export, and cloud merge.

**Audio-adjacent cover**: `tests/track-to-sheet`, `tests/interval-map`, and
`tests/gp-player/metro-click.mjs` exercise transcription, interval detection, and
metronome click timing.

No test covers the top-level hash routes, the settings screen, the drums module, or the
notes module today. The feature must add that cover.

## 7. Risk notes for planning

- The sync domain `drumPatterns` needs a decision when the Drums module goes away.
- The `progress` domain holds quiz stats that removal of quiz screens does not clear.
- A service worker cache name bump is required after JavaScript or CSS changes.
- Eleven fretboard renderers are the largest consolidation risk in the duplicate table.
- `js/chordWorkout.js` ignores the shared musical context and will resist a single
  context owner.
- Scroll restoration exists only inside the routine stack; top-level route changes lose
  scroll position.
- A recording blob survives navigation because `stopRecorder()` does not clear it.
- The hold-record overlay is relevant to many tools through the `holdRecord` flag.
- No test covers top-level hash routes, the drums module, or the notes module today.
- Two hash aliases (`#intervalmap`, `#tabanalyzer`) exist but the brief does not list
  them; redirects must cover them.
- `#chordlab` opens Chord Workout today; the brief sends it to Chord Lab Reference.
- Drum pattern migration must build exercise attachments; no source attachment exists.
- Every existing note must land in Unfiled Notes; no relationship field exists today.
