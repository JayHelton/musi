# Phase 0 Research: Tool-First Simplification

**Created**: 2026-08-13

**Feature**: [spec.md](./spec.md)

**Input facts**: [research-inventory.md](./research-inventory.md)

This file records the Phase 0 decisions for the feature. The specification in
`spec.md` holds the requirements. The verified state of the current code lives in
`research-inventory.md`. Every `[NEEDS CLARIFICATION]` item is resolved, because the
specification resolved them.

## Unknowns from Technical Context

The Technical Context has zero unresolved unknowns. The Assumptions section in the
specification resolved the open product questions. The four exploration passes in
`research-inventory.md` resolved the open code questions.

The code exploration answered three questions:

- **Notes relationship**: no stored note carries a link to a song, exercise, workbook,
  or routine. Every existing note is already unfiled by definition.
- **Drum source file**: the drums store holds step data and a `tab` string. It keeps no
  original file bytes and no attachment identifier.
- **Missing migration framework**: the repo has no client migration framework. Each model
  normalises records on read, and `js/persistence.js` holds no schema version.

## Decisions

### D1 — Migration framework

**Decision**: add a new directory `js/migrations/` with `index.js` as the registry and
runner, plus one module per migration. The runner records applied migration ids under the
new settings key `migrations.applied` inside `musi:settings`. Each migration exports
`{ id, version, detect(ctx), apply(ctx), verify(ctx) }`. The runner performs detect,
then apply, then verify, then it records the id. The runner never deletes a source
record. `js/main.js` awaits the runner during `init()` before the first render, because a
migration touches IndexedDB and must finish first.

**Rationale**: the repo has no migration framework, and each model normalises records on
read. Normalise-on-read cannot move data between stores, and it cannot record that a move
happened. A separate registry keeps each migration small and testable in Node. The
applied-id list plus a per-migration `detect` gives two independent idempotency guards,
which matters because cloud sync can restore an older settings bag and reset the list.

**Alternatives considered**: extend normalise-on-read (rejected, because it cannot write
to a second store and it runs on every read); a one-shot boot script without a registry
(rejected, because it cannot report which step ran and it resists testing); a schema
version integer on each store (rejected, because the repo has eleven independent keys
and one integer would couple them).

### D2 — Notes migration is additive

**Decision**: migration id `notes-unfiled.v1`. Add two optional fields to a note,
`linkedType` and `linkedId`, with the default empty string. `normalizeNote` supplies
the defaults. Define Unfiled Notes as the set of notes where `linkedId` is empty. Move
no record and rewrite no record.

**Rationale**: `research-inventory.md` proves that no stored note carries a link to a
song, exercise, workbook, or routine. Every existing note is therefore already unfiled
by definition. An additive schema change carries zero data-loss risk and needs no write
pass. FR-072 stays satisfied, because the unmatched case is the only case that exists.
Contextual notes then attach new notes through the same two fields.

**Alternatives considered**: a text search that guesses a note's owner from its title
(rejected, because a wrong guess hides a note under an unrelated item and the player
cannot find it); a separate Unfiled Notes store (rejected, because it splits one entity
across two stores and it breaks the sync domain `notes`).

### D3 — Drums migration

**Decision**: migration id `drums-to-exercises.v1`. For every record in the IndexedDB
database `musi-drums`, object store `patterns`, create one attachment in
`musi-attachments` that holds the JSON document
`{ format: 'musi-drum-pattern', version: 1, pattern }`, with `source: 'drums-migration'`.
Then create one exercise that references the attachment, with `sourceRef` set to
`drum-pattern:<patternId>`, `instrument` set to `drums`, `materialType` from
`pattern.category`, `tags` from `pattern.tags` plus `drums`, `bpm` from
`pattern.bpmRange`, and `name` from `pattern.title`. Also migrate a built-in pattern
when its id appears in the setting `drums.favorites`, and mark the resulting exercise as
a favorite. Idempotency uses `sourceRef`. The migration deletes no pattern; WP-09 removes
the database after the check passes.

**Rationale**: an exercise record needs an `attachmentId` or a `url`, and the drums
store holds no file. The pattern itself is the only source of truth, so the migration
must serialise it. The precedent is `js/gpExerciseScore.js`, which already stores a
serialised model as an attachment with `format` and `version` fields. A favorited
built-in pattern is a player choice, so the migration keeps it.

**Alternatives considered**: migrate the `tab` string only (rejected, because it loses
the step data and the exercise then cannot play); migrate built-in patterns in full
(rejected, because they are product content, not player data); delete the drums database
in the same package (rejected, because the specification forbids a source delete before
the destination check passes).

### D4 — Additive exercise metadata

**Decision**: migration id `exercise-metadata.v1`. Add the optional fields `instrument`,
`materialType`, `technique`, `difficulty`, `tags`, `source`, `contentHash`, `favorite`,
and `sourceRef` to an exercise item. `normalizeItem` supplies the defaults and derives
`instrument` and `materialType` from the existing `type` and `fileName` values when they
are empty. No write pass is required.

**Rationale**: the Library filters in FR-045 need these values, and no current exercise
carries them. Normalise-on-read already exists in `js/exercises.js`, so a default fill
needs no new mechanism. Derivation keeps an old exercise useful in a filter without a
rewrite.

**Alternatives considered**: a full rewrite pass over `musi.exercises` (rejected,
because it risks the store for no gain and it conflicts with a concurrent sync write); a
parallel metadata store keyed by exercise id (rejected, because it breaks the
single-owner rule in FR-096).

### D5 — Duplicate detection by content hash

**Decision**: compute a SHA-256 digest of the file bytes with `crypto.subtle.digest` at
import. Store the value on the attachment metadata and on the exercise `contentHash`.
When `crypto.subtle` is unavailable, skip duplicate detection and complete the import.

**Rationale**: FR-049 asks for content-hash detection when possible. `crypto.subtle`
needs a secure context, and both `localhost` and an HTTPS host qualify, so the normal
case works. The specification's edge case already allows an import without detection.

**Alternatives considered**: a name and size match (rejected, because it reports a false
duplicate for two different takes with the same length); a full byte compare against
every stored file (rejected, because it reads the whole attachment store on every
import).

### D6 — One route map module

**Decision**: add the pure module `js/routeMap.js`. It holds the legacy route table and
it exports `resolveRoute({ id, params })`, which returns `{ id, params, notice }`.
The new route ids are `tools`, `scalelab`, `fretmap`, `chordlab`, `pitchear`,
`metronome`, `audiostudio`, `songstudio`, `library`, `routines`, `scoreplayer`, and
`settings`. A tool mode travels in the `mode` parameter. Dismissed notices live under
the new settings key `route.noticesSeen`.

**Rationale**: a pure table is the cheapest way to satisfy FR-079 to FR-088 and to test
every hash in Node without a browser. `js/appRoute.js` already parses `#id?key=value`,
so a mode parameter needs no new grammar. A separate resolve step keeps `js/main.js` free
of redirect logic.

**Alternatives considered**: per-module redirect code in each feature (rejected, because
a removed module cannot own its own redirect); a server rewrite (rejected, because Musi is
a static site with no server).

### D7 — Keep the `chordlab` route id

**Decision**: the new Chord Lab keeps the route id `chordlab`. The one-time notice
explains that the Chord Workout quiz is gone.

**Rationale**: `#chordlab` opens the Chord Workout quiz today, and a player bookmark
then lands on the closest replacement with no address change. The notice carries the
removal message that FR-081 requires.

**Alternatives considered**: a new id such as `chordreference` with a redirect from
`#chordlab` (rejected, because it adds a redirect for no player benefit and it breaks a
shared link twice).

### D8 — Root route flip

**Decision**: `tools` becomes the root route. It uses no hash, exactly as `home` does
today. `#home` resolves to `tools` and shows no notice. The wordmark opens Tools.

**Rationale**: FR-001 needs the root to open Tools. `routeUrl` in `js/appRoute.js`
already returns a path with no hash for the root, so the change is a rename of the root
id plus one redirect row. A notice is wrong here, because the player lost no feature.

**Alternatives considered**: keep `home` as the id and change only its content (rejected,
because the name then lies about the screen and the `hub-*` route family stays); redirect
`#tools` to the root path (rejected, because a shared `#tools` link must keep working).

### D9 — Navigation shell

**Decision**: add the directory `js/shell/` with `nav.js`. It renders the fixed app bar,
the desktop left rail with Tools, Library, Routines, and Settings, and the mobile bottom
bar with Tools, Library, Routines, and More. More opens a sheet through the existing
`openSelectionSheet` in `js/selectionSheet.js`. `rebuildDesktopDock` and the five mobile
category buttons in `js/main.js` go away, and the four `hub-<categoryId>` routes go away
with them.

**Rationale**: FR-003 to FR-005 need a fixed four-item structure that lists no tool. The
current desktop dock lists one button per tool, which is the opposite. `openSelectionSheet`
already exists and already matches the theme, so More needs no new component.

**Alternatives considered**: keep the hub routes as the purpose directories (rejected,
because Tools now owns the purpose switch and two directory systems would disagree); a
hamburger menu on desktop (rejected, because a rail keeps the four destinations visible
and needs no extra interaction).

### D10 — Tools home model

**Decision**: add `js/tools/homeModel.js` as a pure module that builds the ordered section
list, and `js/tools/home.js` as the renderer. `js/tools.js` becomes the tool catalog,
and each descriptor gains `purpose`, `modes`, and `defaultMode`. The favorites key stays
`home.favorites`. Recents move to the new key `tool.recents`, which holds
`[{ id, mode, context, at }]`.

**Rationale**: a pure model lets a Node test prove the section order in FR-008 and the
hidden empty sections in FR-009 without a browser. `js/routineDashboardModel.js` set this
precedent in feature 001. The favorites key already exists and already holds tool ids,
so a rename would need a migration for no gain. A Recent needs a mode and a local context
to satisfy FR-012, and the current recents helper stores plain strings.

**Alternatives considered**: extend `js/recents.js` in place for tool recents (rejected,
because its `getList` and `pushRecent` helpers store strings and every other caller
depends on that shape); render Tools home directly from `js/tools.js` (rejected, because
the ordering rules then resist a Node test).

### D11 — Remove the feature visibility catalog

**Decision**: delete the Features section from `js/musicPreferences.js`, delete
`isFeatureEnabled`, `setFeatureEnabled`, `saveEnabledFeatures`, and
`getEnabledFeatureIdsRaw` from `js/tools.js`, and delete the `musi:features-changed`
event. Leave the stored value under `features.enabled` in place as inert data.

**Rationale**: FR-067 removes the catalog, and P-007 forbids a Settings repair path for
navigation. Every retained tool then stays reachable through Tools, Library, and
Routines. Feature 001 set the precedent for inert stored values with the genre keys. A
delete pass would risk the settings bag for no player benefit.

**Alternatives considered**: keep the catalog but hide it (rejected, because the gating
code then still filters the navigation); delete the stored key (rejected, because sync
would then carry a delete to another device that still runs an older build).

### D12 — Musical context precedence

**Decision**: extend `js/musicalContext.js` to own tuning and meter, and add three layers.
The layers are local tool context, origin context, and saved defaults, in that precedence
order. Add the API `openScope({ origin })`, `getEffective(scopeId)`, `setLocal(scopeId,
partial)`, `setAsDefault(scopeId)`, `closeScope(scopeId)`, and `resolveValue(...)`, which
returns the chosen value plus any fallback reason. Saved defaults keep `context.root`,
`context.scale`, and `context.tempo`, and they gain `context.tuning` and `context.meter`.
Volume stays under `global.volume`, and the service exposes it as a passthrough.

**Rationale**: FR-021 to FR-025 need one precedence rule, and today the service owns only
root, scale, and tempo while eight modules keep a private tuning. A scope object gives
each open tool page its own local layer without a global mutation. `resolveValue` carries
the fallback reason, which FR-025 needs so the app can explain the change. Volume is an
audio setting, not a musical value, so a passthrough keeps one read point without a false
claim.

**Alternatives considered**: one flat global context (rejected, because a local change in
one tool would then leak into the next tool and break FR-022); a per-tool context store
(rejected, because origin context could not then flow from a routine into a tool).

### D13 — Reuse the existing context controls

**Decision**: build the context row on the existing `js/screenUx.js` and `js/pickers.js`.
Use `openSelectionSheet` for a searchable option set, including the tuning list.

**Rationale**: `js/screenUx.js` already syncs setup toolbars and already subscribes to the
context, and `js/pickers.js` already owns the root, scale, chord, and tuning pickers with
their recents and favorites keys. FR-018 asks for search on a large option set, and
`openSelectionSheet` already provides it. A new picker layer would duplicate a working one
and break P-005.

**Alternatives considered**: a new context row component (rejected, because it duplicates
`js/pickers.js`); a plain HTML select for tuning (rejected, because the tuning catalog
is long and FR-018 needs search).

### D14 — Tool page shell

**Decision**: add `js/shell/toolPage.js` with `mountToolPage(sectionEl, descriptor)`. It
builds the header with Back, title, favorite, and More, then the context row, then the
mode tabs, and then it hands a workspace element to the feature. It reuses
`initSubviewTabs` from `js/uxPrimitives.js` for the mode tabs and `openOverflowMenu` for
More. Tools adopt the shell one at a time. WP-03 introduces the shell and converts two
tools. WP-04 to WP-07 convert the rest.

**Rationale**: FR-014 to FR-017 need one page order across every tool, and the app has
no framework to enforce it. A mount function that wraps existing markup is the smallest
change that gives one shell. `initSubviewTabs` and `openOverflowMenu` already exist and
already match the theme. Incremental adoption keeps the app runnable between packages,
which the delivery rule requires.

**Alternatives considered**: a full markup rewrite of every section in one package
(rejected, because it breaks the one-package-at-a-time rule and it risks every tool at
once); a CSS-only convention (rejected, because it cannot enforce the control order or the
accessible names).

### D15 — Route origin and restoration

**Decision**: add `js/shell/navStack.js`. It owns the route origin, the scroll position
per route, the Library list state, and the focus move to the new page heading.
`js/routineNav.js` keeps the routine layer stack and delegates its scroll and focus work
to the new module.

**Rationale**: FR-026 to FR-031 need one restoration owner across Tools, Library, Search,
workbooks, and routines. `saveScrollForRoute` and `restoreScroll` in `js/routineNav.js`
already solve the problem inside the routine stack, so the design generalises working
code. One owner also makes the three Back controls agree, because they all end in the
same handler.

**Alternatives considered**: per-screen scroll code (rejected, because the three Back
controls then drift apart); browser scroll restoration (rejected, because
`history.scrollRestoration` is `manual` today and the app swaps sections instead of
pages).

### D16 — One audio owner

**Decision**: add `js/audioOwner.js` with `claimAudio({ id, label, kind, onStop,
onPause })`, `releaseAudio(handle)`, `getActiveOwner()`, and `subscribe(fn)`. A claim
stops or pauses the previous owner first. Add `js/audioDock.js`, which renders only while
an owner is active and shows the source, the state, the elapsed time when useful, and
Stop. Delete `js/nowPlaying.js` and the always-visible hold-record strip. Keep
`stopOtherTools` in `js/main.js` for section-change clean-up.

**Rationale**: FR-055 to FR-058 need one active owner, and today `js/nowPlaying.js` is
only a display bar. Nothing stops a chord preview, an ear replay, or a score when another
source starts. A claim-based registry puts the rule in one place and lets a Node test
prove it. The dock replaces the strip, which satisfies the removal of the always-visible
inactive strip.

**Alternatives considered**: extend `stopOtherTools` to run on every audio start
(rejected, because it is keyed by tool id and two audio sources can live in one tool); a
Web Audio node-graph mute (rejected, because a paused score must keep its position and a
mute does not stop the transport).

### D17 — Unsaved-work guard

**Decision**: add `js/shell/unsavedGuard.js` with `registerUnsaved(scopeId, { describe,
save, discard })` and `clearUnsaved(scopeId)`. `js/shell/navStack.js` consults it before
every navigation and shows a Save, Discard, or Keep editing dialog. A `beforeunload`
handler covers a tab close.

**Rationale**: FR-056 and FR-059 need the prompt, and today no guard exists and a
recording blob survives navigation in memory. One registry keeps the rule out of each
feature.

**Alternatives considered**: a per-feature confirm dialog (rejected, because each feature
would then word the choice differently and one feature would forget); a `beforeunload`
handler alone (rejected, because it does not fire on an in-app section change).

### D18 — One fretboard renderer

**Decision**: add `js/fretboard/renderer.js` as one SVG renderer with a declarative model
of `{ tuning, fretStart, fretEnd, markers, overlays, labels }`. Convert the Study
renderers in WP-04 and the companion renderers in WP-07. `chord-cards/src/render.js`
stays out of scope, because it is a separate build-time asset pipeline. The CLI ASCII
neck in `cli/src/trainers/fretboard.js` stays.

**Rationale**: FR-092 needs one owner, and eleven renderers exist today with the constant
`FB_DOTS` repeated in several files. SVG suits the job, because `js/triadReference.js`
and `js/interval-map/fretboardView.js` already draw SVG overlays, and SVG scales cleanly
at 200% text zoom. A declarative model lets a Node test check the fret positions without
a browser.

**Alternatives considered**: a DOM grid renderer (rejected, because the interval map
already needs SVG overlay lines and a mixed model would keep two renderers); convert all
eleven in one package (rejected, because it breaks the delivery rule and it risks every
Study screen at once).

### D19 — Shared scale and chord data

**Decision**: keep `SCALES` in `js/scales.js` and `CHORDS` in `js/chords.js` as the
canonical tables. Delete `SCALE_MAJOR_INTERVALS` from `js/interval-map/model.js`. Derive
`TRIAD_QUALITIES` in `js/triadReference.js`, `CHORD_TYPES` in `js/analysis/chordDetect.js`,
and `CHORD_FORMULAS` with `QUALITY_FORMULAS` in `js/intervalOrbitModel.js` from
`js/chords.js`. Replace `SWEEP_OPEN_MIDI` in `js/sweepReference.js` and `OPEN_PC` in
`js/sweepPatterns.js` with `js/tunings.js`.

**Rationale**: FR-090 and FR-091 need the same spelling everywhere, and the duplicates
already disagree in order and in naming. `js/analysis/chordDetect.js` needs a detection
order, so it keeps an order list and drops its own semitone sets.

**Alternatives considered**: leave the duplicates and add a test that compares them
(rejected, because it detects drift but it does not stop it); move every table into
`js/theory.js` (rejected, because `js/theory.js` already re-exports and a third home
would add a hop).

### D20 — One tempo scheduler

**Decision**: add `js/tempo/scheduler.js` as one Web Audio lookahead clock with click
synthesis. `js/metronome.js` becomes the user interface over it and keeps its
subdivisions, accents, tempo phases, and count-in. `js/routineMetronome.js` and
`js/gpMixPlayer.js` become clients. `js/gpMixPlayer.js` keeps its own note scheduling
but it reads the shared clock. `js/timingDrill.js` and `js/drums/drumEngine.js` go away
with their features. Delete the unused `js/tab/tabPlayer.js` scheduler path.

**Rationale**: FR-094 needs the same beat timing everywhere, and six schedulers exist
today with the same lookahead pattern and slightly different constants. A score needs to
schedule notes, not clicks, so the shared module owns the clock and the click while the
client keeps its note logic.

**Alternatives considered**: one scheduler that also owns note playback (rejected,
because a score, a backing track, and a riff generator each need a different note model);
leave `js/gpMixPlayer.js` alone (rejected, because a score metronome and the global
metronome would then drift).

### D21 — Shared pitch analysis core

**Decision**: extract the shared McLeod core into `js/pitch/core.js`. `js/pitch.js` keeps
the live tracker for microphone work. `js/trackToSheet/dsp.js` keeps its offline detector
but it uses the shared core. `js/audio.js` stays the single owner of the AudioContext and
the microphone stream.

**Rationale**: FR-093 needs one analysis rule, and two implementations of the same
method exist today. A live tracker needs low latency per frame, and an offline detector
needs throughput over a whole file, so one function cannot serve both well. A shared core
gives the same result for the same samples and keeps the two callers honest.

**Alternatives considered**: force one detector for both paths (rejected, because it
would slow the live path or the offline path and `tests/track-to-sheet/accuracy.mjs`
guards the offline result); leave both alone (rejected, because FR-093 needs one analysis
rule).

### D22 — Practice Library service

**Decision**: add `js/library/libraryModel.js` as a pure module for the filter, sort, and
duplicate rules, and `js/library/library.js` as the two-tab user interface. `js/exercises.js`
becomes the single write owner. `js/gpPlayer.js`, `js/exercisesBulk.js`,
`js/trackToSheet.js`, and the cloud restore path call its API instead of writing the
store.

**Rationale**: FR-096 needs one persistence owner, and five write paths exist today. A
pure model lets a Node test prove the filters and the duplicate rule. The store already
lives in `js/exercises.js`, so the change routes the other writers through it instead of
moving data.

**Alternatives considered**: a new library store (rejected, because it would need a
migration and it would break the sync domain `exercises`); leave the write paths alone
and add a guard test (rejected, because a guard cannot enforce the reference rules on a
write).

### D23 — Score Player without a private list

**Decision**: `mountGpPlayer` in `js/gpPlayerUI.js` stays the shared mount.
`js/gpPlayer.js` loses its own score list and becomes a host that opens a target that
Library, Routines, or Tools names. Add a "Save as Exercise" confirmation that shows the
source score, the track, the measures, the tempo, and the tuning.

**Rationale**: FR-054 forbids a private library, and the score list is the surface to
remove. The shared mount already exists, and `research-inventory.md` shows that saved
scores already live in the Exercises library, so no data moves.

**Alternatives considered**: keep a recent-scores list inside the player (rejected,
because Recents on Tools home already covers the need and a second list splits the
truth).

### D24 — Sync treatment

**Decision**: keep `drumPatterns` in `SYNC_DOMAINS` after the Drums module goes. It
becomes a read-only inbox that feeds `drums-to-exercises.v1`, so a pattern from another
device still arrives and still migrates. Keep the `progress` domain values for removed
quizzes as inert data. Accept that the new exercise fields ride in the opaque payload.

**Rationale**: FR-068 keeps sync optional but working, and a player can run an older build
on a second device. An inbox keeps that player's patterns safe. A payload is opaque to
the server, so a new field syncs as-is. An older client that rewrites a record can drop
a new field, which is a real risk with no cheap fix in a last-writer-wins merge.

**Alternatives considered**: remove the `drumPatterns` domain in WP-09 (rejected, because
a second device on an older build would then lose its patterns); add a client version gate
to the merge (rejected, because it needs a protocol change and the constitution forbids a
backend change for a core feature).

### D25 — Module and stylesheet layout

**Decision**: add the directories `js/shell/`, `js/migrations/`, `js/tools/`,
`js/fretboard/`, `js/library/`, `js/tempo/`, and `js/pitch/`. Add the stylesheets
`css/shell.css`, `css/tools-home.css`, `css/library.css`, and `css/fretboard.css`.
Delete `css/quiz.css`, `css/chordworkout.css`, `css/drums.css`, `css/notes.css`, and
`css/study-lab.css` when their last consumer goes. Add no new colour value and no new font
family.

**Rationale**: `js/` already holds eleven feature subdirectories, so a directory per new
area matches the convention. FR-097 and SC-020 forbid a new colour and a new font, so
every new stylesheet reuses the tokens in `css/base.css` and `css/theme-gbc.css`.

**Alternatives considered**: flat files in `js/` (rejected, because each new area holds
three or more modules and the root already has about ninety files); one large new
stylesheet (rejected, because the repo already splits CSS per feature and a single file
would resist deletion).

### D26 — Delivery and removal order

**Decision**: ship nine change sets, WP-01 through WP-09, in order. Each change set
leaves the app runnable. A removal waits for its replacement, its migration, its route
redirect, and its tests. WP-09 performs the final deletions and removes the compatibility
code that no supported route or data uses. The product owner confirms each package before
the next one starts. Bump `CACHE_VERSION` in `service-worker.js` and update
`PRECACHE_URLS` in every package that adds or removes a file. The current value is
`v190-routine-sibling-switch-and-phone-layout`.

**Rationale**: FR-103 to FR-106 mandate the order and the zero-regression target. The
service worker precaches static files, so a stale cache would serve a deleted module and
break a boot.

**Alternatives considered**: one large change set (rejected, because the specification
forbids it and a single review could not cover 108 requirements); a feature flag that
hides the new shell until the end (rejected, because the constitution forbids a half-done
trunk push and a flag would double the navigation code).

## Test strategy

### D27 — Test strategy

**Decision**: add the Node suites `tests/routes/run.mjs`, `tests/migrations/run.mjs`,
`tests/shell/run.mjs`, `tests/library/run.mjs`, `tests/fretboard/run.mjs`, and
`tests/removal-guard/run.mjs`.
Extend `tests/exercises/run.mjs`, `tests/workbooks/run.mjs`, `tests/routines/run.mjs`,
`tests/gp-player/`, and `tests/companions/run.mjs`. Retarget `tests/study-lab/run.mjs`
at the Scale Lab Guide model. Extend `tests/exercises/idbShim.mjs` so it also serves
`musi-attachments` and `musi-drums`.

**Rationale**: the repo has no test framework, and every suite is a plain Node ESM script
that uses `node:assert/strict`. The new pure modules suit that pattern.
`tests/genre-removal/run.mjs` proved that a source-guard suite catches a missed deletion,
so `tests/removal-guard/run.mjs` copies it. A migration needs an IndexedDB shim, and one
already exists for exercises.

**Alternatives considered**: add a browser test runner (rejected, because the
constitution forbids new tooling and `tests/sync/run-browser.mjs` already covers the one
case that needs a browser); test the migrations through the user interface only
(rejected, because the specification needs empty, normal, duplicate, partial, and
already-migrated fixtures).

## Open risks

- An older client that rewrites a synced exercise record can drop a new field during a
  last-writer-wins merge.
- Eleven fretboard renderers are the largest single consolidation in the duplicate table.
- `js/chordWorkout.js` ignores the shared musical context and goes away in WP-04.
- The service worker cache can serve a deleted module if `CACHE_VERSION` does not bump
  in the same package as the file removal.
- The repo has no automated accessibility check for the new shell, tool pages, or Audio
  Dock.
- The drums migration depends on IndexedDB availability in a private browsing window.
- The route notice state under `route.noticesSeen` syncs and could mark a notice seen on
  a device that never showed it.
- Scroll restoration today exists only inside the routine stack; generalising it touches
  every top-level destination.
- A recording blob survives navigation today because `stopRecorder()` does not clear it;
  the unsaved guard must cover every capture path.
- Two hash aliases (`#intervalmap` and `#tabanalyzer`) exist outside the brief route
  table and must stay covered in `js/routeMap.js`.
