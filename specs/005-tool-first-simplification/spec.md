# Feature Specification: Tool-First Simplification

**Feature Branch**: `005-tool-first-simplification`

**Created**: 2026-08-13

**Status**: Draft

**Input**: User description: "Refactor Musi into a tool-first music-practice app. The default experience must provide three purposes: Train, Study, and Create. Routines must remain available, but they must be optional. A user must be able to use every retained tool without selecting or creating a routine. Complete one work package at a time. Keep the app functional between packages. Do not remove legacy code until its replacement, migration, route redirect, and tests pass. There must be 0 regressions."

## Clarifications

### Session 2026-08-14

The clarify run had no interactive reviewer. The agent recorded its own recommended
answer for each question. The product owner must confirm or change each answer before
implementation starts.

- Q: When the player leaves a tool that holds an unsaved recording, does the prompt show Cancel or Keep editing? → A: The leave prompt shows Save, Discard, and Keep editing. The audio-claim prompt shows Save, Discard, and Cancel.
- Q: What does the Search section on Tools home search? → A: Tool names and tool modes only.
- Q: What does Practice Plan show when the player opens it without a routine? → A: A manual practice item list and a manual timer.
- Q: How many Recents entries does Tools home keep? → A: Five entries, newest first, one entry per tool.
- Q: How does the team record the product-owner confirmation for each work package? → A: A per-package sign-off line in `tasks.md` with the quickstart evidence.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Keep stored material and saved links working (Priority: P1)

A returning player opens Musi after the update. Every exercise, workbook, routine,
song, note, recording, score, and preference still exists. Old bookmarks and shared
links still open a sensible destination. Migrations run on boot and can run again
without harm.

**Why this priority**: Data loss breaks trust and blocks every other story. The team
implements this work package first because later packages depend on safe migration and
stable links. Player value is immediate: nothing the player saved disappears.

**Independent Test**: Load a device with a normal data set and an empty data set. Boot
the app twice. Confirm that every record survives, that a repeat boot creates no
duplicate record, and that an old bookmark opens the correct destination.

**Acceptance Scenarios**:

1. **Given** the player stored no data, **When** the app boots and runs migration,
   **Then** the app starts with empty Library, empty Routines, and empty Tools
   favorites, and no error blocks use.
2. **Given** the player stored exercises, workbooks, routines, songs, notes, recordings,
   scores, and preferences, **When** the app boots and runs migration, **Then** every
   record still exists with the same identifiers, titles, bodies, times, and references.
3. **Given** migration completed once, **When** the app boots again and runs migration
   a second time, **Then** the app creates no duplicate exercise, workbook, routine,
   song, note, recording, or score record.
4. **Given** an exercise record names an attachment that no longer exists, **When**
   migration runs, **Then** migration deletes no record, and the app shows a
   non-blocking message when the player opens that exercise.
5. **Given** a workbook entry names an exercise identifier that does not resolve,
   **When** migration runs, **Then** the workbook record stays in place, and the app
   reports the missing exercise without a block.
6. **Given** a routine session names a workbook identifier that does not resolve,
   **When** migration runs, **Then** the routine record stays in place, and the app
   reports the missing workbook without a block.
7. **Given** the player saved a bookmark to `#chordlab`, **When** the player opens that
   link after the change, **Then** the app opens Chord Lab Reference in its default
   Study mode and shows a dismissible one-time notice that stays dismissed after the
   player closes it.
8. **Given** the player saved a bookmark to `#intervalmap`, **When** the player opens
   that link after the change, **Then** the app opens Fretboard & Interval Map at the
   mapped destination and keeps the legacy alias working.

---

### User Story 2 - Reach any tool without a routine (Priority: P2)

A player opens Musi and lands on Tools with the Train, Study, Create switch. The
player browses tool cards, opens Favorites, and starts the Tuner or the Metronome in
two interactions or fewer. No routine is required.

**Why this priority**: Tool-first entry is the core product change. The team ships this
work package after migration because the player must reach practice without a routine
dashboard. Player value is a shorter path to any retained tool.

**Independent Test**: Open Musi on a new device and on a device with favorites and
recents. Confirm that Tools is the root view, that empty sections stay hidden, that
primary navigation lists no individual tool, and that the Tuner or Metronome opens in
two interactions or fewer.

**Acceptance Scenarios**:

1. **Given** the player stored no data, **When** the player opens Musi, **Then** the
   app opens Tools with the Train purpose selected, shows the Train, Study, Create
   switch, and shows no text "No routines yet".
2. **Given** Tools home renders, **When** the player views the page, **Then** the app
   shows sections in this order: the three purposes, Favorites when any exist, Recents
   when any exist, Continue a routine when active routines exist, then Search and
   Browse all tools.
3. **Given** the player stored no favorites, recents, or active routines, **When**
   Tools home renders, **Then** the app hides the Favorites section, hides the Recents
   section, and hides the Continue section.
4. **Given** the player uses a desktop width, **When** the player views primary
   navigation, **Then** the left rail shows Tools, Library, Routines, and Settings,
   and lists no individual tool name.
5. **Given** the player uses a phone width, **When** the player views primary
   navigation, **Then** the bottom bar shows Tools, Library, Routines, and More, and
   lists no individual tool name.
6. **Given** the player is on Tools home under Train, **When** the player opens the
   Metronome card, **Then** the Metronome opens in its default mode without a routine
   prompt, a session prompt, or a timer start.
7. **Given** the player is on Tools home under Train, **When** the player opens the
   Tuner card, **Then** the Tuner opens in its default mode in two interactions or
   fewer from Tools home.
8. **Given** the player opened a tool from a Recent card that held a saved mode and
   local context, **When** the player opens that Recent card again, **Then** the tool
   opens in the same mode with the same local context restored.
9. **Given** the player is on a tool page header, **When** the player activates the
   favorite control, **Then** the tool appears under Favorites on Tools home, and a
   second activation removes it from Favorites.

---

### User Story 3 - Move between tools and keep the place and the context (Priority: P3)

A player opens a tool from Tools, Library, Search, or a Recent card. The player changes
root, scale, or tuning locally, starts audio, and presses Back. The app keeps context
precedence, restores scroll and list state, and enforces one audio owner with a
conditional Audio Dock.

**Why this priority**: Shared navigation and context behavior touch every tool. The team
ships this work package after Tools entry because broken Back behavior or silent context
changes would harm daily use. Player value is predictable movement and audio control.

**Independent Test**: Open a tool from each origin row in the behavior contract. Change
local context, start a second audio source, and record audio without saving. Confirm
Back results, context precedence, dock visibility, and the unsaved-recording prompt.

**Acceptance Scenarios**:

1. **Given** the player opened a tool from a purpose directory on Tools home, **When**
   the player presses Back, **Then** the app returns to the prior purpose directory at
   the prior scroll position.
2. **Given** the player opened Library, applied filters, and opened an item, **When**
   the player presses Back, **Then** the app restores the prior query, filters, sort,
   selection, and scroll on the Library list.
3. **Given** the player opened a workbook entry, **When** the player presses Back,
   **Then** the app restores the prior workbook entry and scroll position.
4. **Given** the player opened an exercise inside a routine session, **When** the
   player presses Back repeatedly, **Then** the app returns through the workbook layer,
   then the session layer, then the routine layer, in that order.
5. **Given** the player ran Search and opened a result, **When** the player presses
   Back, **Then** the app restores the prior search state.
6. **Given** the player opened a tool from a Recent card on Tools home, **When** the
   player presses Back, **Then** the app returns to Tools home at the prior Recents
   scroll position.
7. **Given** the player is on a tool page with a valid parent layer, **When** the
   player uses the browser Back control or the device Back control, **Then** the result
   matches the in-app Back control.
8. **Given** a tool holds a local root change and saved defaults differ, **When** the
   player leaves with Back without choosing Set as default, **Then** the parent context
   restores and saved defaults stay unchanged, and **When** the player instead chooses
   Set as default and opens another tool that reads saved defaults, **Then** the new
   default applies until the player changes it again.
9. **Given** origin context sends an incompatible tuning or scale to a tool, **When**
   the tool opens, **Then** the app applies a compatible fallback, explains the change,
   and does not change the value silently.
10. **Given** one tool plays audio and the player starts a second metronome, tone,
    score, recording, or media item, **When** the second source starts or the player
    stops the active source, **Then** the first source stops or pauses, the Audio Dock
    shows the active source while work continues, and the dock clears when no playback,
    recording, or microphone work stays active.
11. **Given** the player records audio and has not saved it, **When** the player tries
    to leave the recording tool, **Then** the app offers Save, Discard, or Keep editing,
    and **When** another tool claims audio instead, **Then** the app offers Save,
    Discard, or Cancel. The app never discards the recording without an explicit choice.

---

### User Story 4 - Study scales, intervals, and chords in one place (Priority: P4)

A player opens Study on Tools home and uses Scale Lab, Fretboard & Interval Map, and
Chord Lab instead of scattered reference screens and removed quizzes. Root, scale, and
tuning persist across compatible Study modes. One shared fretboard picture appears
across Study areas.

**Why this priority**: Study consolidation removes duplicate quiz and reference paths.
The team ships this work package after shared tool behavior because Study tools share
context and fretboard rendering. Player value is one place to inspect theory material.

**Independent Test**: Open each Study lab, switch modes, and change root, scale, and
tuning. Confirm that no quiz interface appears outside Pitch & Ear Lab, that Study
context persists across compatible modes, and that legacy links land with a dismissible
notice.

**Acceptance Scenarios**:

1. **Given** the player opens Scale Lab from Study, **When** Scale Lab renders,
   **Then** the player can inspect scale spelling, scale degrees, and related reference
   modes, and no score, streak, or answer-check UI appears.
2. **Given** the player opens Fretboard & Interval Map from Study, **When** the player
   switches between fretboard view and interval map view, **Then** both modes share one
   fretboard picture and the same root, scale, and tuning context when compatible.
3. **Given** the player opens Chord Lab from Study, **When** Chord Lab renders, **Then**
   the player inspects chord quality, voicing, and progression reference material, and
   no quiz workout interface appears.
4. **Given** the player sets root C and a selected scale in Scale Lab, **When** the
   player opens Fretboard & Interval Map without an incompatible local override,
   **Then** Fretboard & Interval Map opens with the same root and scale.
5. **Given** the player opens any Study lab, **When** the player searches the screen,
   **Then** no streak counter, accuracy readout, or graded answer control appears.
6. **Given** the player opens `#chordlab` from an old bookmark, **When** Chord Lab
   Reference loads, **Then** the app shows a dismissible one-time notice that explains
   the destination change, and the notice stays dismissed after the player closes it.
7. **Given** the player opens `#intervalmap` from an old bookmark, **When** the app
   loads, **Then** the app opens Fretboard & Interval Map at the mapped mode and keeps
   the alias working.
8. **Given** Pitch & Ear Lab and the removed Intervals quiz both existed in an earlier
   version, **When** the player opens Study tools after the change, **Then** only Pitch
   & Ear Lab shows scored quiz behavior.

---

### User Story 5 - Train pitch, ear, and tempo (Priority: P5)

A player opens Train on Tools home and uses Pitch & Ear Lab for tuner, reference tone,
pitch match, pitch runner, and ear identification. The player uses one Metronome with
subdivisions, accents, tempo phases, and an optional countdown. The Practice Plan stays
optional.

**Why this priority**: Train holds daily practice tools that must work without a
routine. The team ships this work package after Study consolidation because Train and
Study share audio and tempo owners. Player value is scored ear work plus reliable tempo
in one Train area.

**Independent Test**: Open Pitch & Ear Lab modes and confirm they are the only scored
experiences. Open the Metronome from Tools and from a routine session. Open removed
destinations and confirm redirects with a notice.

**Acceptance Scenarios**:

1. **Given** the player opens Pitch & Ear Lab, **When** the player switches among
   tuner, reference tone, pitch match, pitch runner, and ear identification, **Then**
   all modes live in one tool shell with mode tabs and no separate quiz destinations.
2. **Given** the player completes ear identification rounds, **When** results appear,
   **Then** Pitch & Ear Lab shows scores, streaks, or accuracy, and no other tool shows
   those scored patterns.
3. **Given** the player opens the Metronome, **When** the player sets subdivisions,
   accents, tempo phases, and an optional countdown, **Then** the Metronome runs with
   no routine, session, or completion record required.
4. **Given** the Metronome plays in one tool, **When** the player opens another tool
   that owns tempo playback, **Then** the first metronome stops or pauses under the
   single audio owner rule.
5. **Given** the player opens the legacy link `#timing` for the removed tap-scoring
   quiz, **When** the app loads, **Then** the app opens the Metronome, shows a
   dismissible one-time notice, and shows no tap-scoring interface.
6. **Given** the player opens the legacy link `#practice` for the removed Practice
   Timer destination, **When** the app loads, **Then** the app opens Practice Plan
   inside Train and starts no timer on its own.
7. **Given** the player opens the legacy link `#keyboard` for the removed Keyboard
   tool, **When** the app loads, **Then** the app opens the Study directory and shows a
   dismissible Pitch Reference notice.

---

### User Story 6 - Capture and build without losing work (Priority: P6)

A player opens Create on Tools home and uses Audio Studio and Song Studio. The player
captures audio, runs analysis and transcription drafts, edits song text with auto-save,
and finds every legacy note in Unfiled Notes. Unsaved work always offers Save, Discard,
or Keep editing.

**Why this priority**: Create tools hold fragile in-progress work. The team ships this
work package after Train tools because audio capture shares the single audio owner and
dock rules. Player value is safe capture and song editing without silent loss.

**Independent Test**: Record audio, leave before save, edit a song, and import a device
with legacy notes. Confirm draft behavior, auto-save states, unsaved prompts, and
Unfiled Notes content.

**Acceptance Scenarios**:

1. **Given** the player records audio in Audio Studio Capture, **When** the player
   chooses Save to Exercise or Save to Song, **Then** the app stores the recording and
   leaves the original capture unchanged in the draft area until save completes.
2. **Given** the player runs Analyze or Transcribe in Audio Studio, **When** results
   appear, **Then** the results stay drafts until the player saves them, and the app
   does not overwrite the original audio file.
3. **Given** the player edits song text in Song Studio, **When** the player pauses
   typing, **Then** the app shows a Saving state during write and a Saved state after
   the write completes.
4. **Given** the player has unsaved song edits, recording data, transcription data, or
   Library edits, **When** the player tries to leave the screen, **Then** the app
   offers Save, Discard, or Keep editing before navigation continues.
5. **Given** the player stored notes with only `id`, `title`, `body`, `createdAt`, and
   `updatedAt`, **When** migration runs, **Then** every note appears in Unfiled Notes
   with the same title, body, and times.
6. **Given** a legacy note holds no link to a song, exercise, workbook, or routine,
   **When** the player opens Unfiled Notes, **Then** the note opens and remains
   unlinked until the player attaches it manually.
7. **Given** the player builds a chord in the Chord builder, **When** the player leaves
   without a save, **Then** the app creates no record, and the Chord builder keeps no
   private material library.
8. **Given** the player saves contextual notes from an exercise or workbook, **When**
   the player returns to that item, **Then** the note stays attached to that context
   and also remains reachable from Create.

---

### User Story 7 - Find and play material in one library (Priority: P7)

A player opens Library and uses Exercises and Workbooks tabs with filters. The player
adds material through one Add action, opens Guitar Pro content in Score Player, and
plays migrated drum material as exercises. List state restores after the player closes
an item.

**Why this priority**: Library is the hub for saved practice material. The team ships
this work package after Create capture because new recordings and imports land in
Library. Player value is one searchable place to find and play material.

**Independent Test**: Filter Library lists, open and close items, import duplicates,
replace attachments, and open a migrated drum exercise in Score Player and the shared
practice player.

**Acceptance Scenarios**:

1. **Given** the player opens Library, **When** Library renders, **Then** the player
   sees Exercises and Workbooks tabs and filters for instrument, material type,
   technique, tuning, difficulty, tags, source, and favorite.
2. **Given** the player applied filters and scroll position on a Library tab, **When**
   the player opens an item and then presses Back, **Then** Library restores the prior
   query, filters, sort, selection, and scroll.
3. **Given** the player is on Library, **When** the player opens the Add action,
   **Then** one control covers every supported create and import action for that tab.
4. **Given** the player uploads a file whose content hash matches an existing record,
   **When** import runs, **Then** the app offers "Open existing" and "Import another
   copy".
5. **Given** the player opens an exercise detail page, **When** the page renders,
   **Then** the page lists workbook references and routine references that point to
   this exercise by identifier.
6. **Given** the player replaces an exercise attachment, **When** the replace
   completes, **Then** the exercise identifier stays the same and every workbook and
   routine reference still resolves.
7. **Given** the player opens a Guitar Pro score in Score Player, **When** the
   parchment scrolls, **Then** transport controls stay visible, Loop Selection off
   allows drag scroll, and Loop Selection on allows drag measure selection.
8. **Given** the player selects measures in Score Player, **When** the player chooses
   "Save as Exercise", **Then** the app confirms source score, track, measures, tempo,
   and tuning before it creates the exercise.
9. **Given** drum material migrated from the removed Drums module, **When** the player
   opens that exercise, **Then** step data and tab text still play through the shared
   practice player or Score Player as mapped by migration.

---

### User Story 8 - Use routines only when they help (Priority: P8)

A player opens Routines as an optional space separate from Tools. The player opens a
routine with Open, moves through Routine, Session, Workbook, and Exercise without a
forced timer, and marks completion only through an explicit control. Ad hoc tool use
stays unchanged when routines exist.

**Why this priority**: Routines remain valuable but must not gate tools. The team ships
this work package after Library because routine sessions reference workbooks by
identifier. Player value is optional structure without a required Start Session action.

**Independent Test**: Open active and inactive routines, walk the full path, use
Previous and Next, mark optional completion, and confirm that Tools still opens without
a routine prompt.

**Acceptance Scenarios**:

1. **Given** the player stored active and inactive routines, **When** the player opens
   Routines, **Then** the app lists both groups and each card shows Open, not Start.
2. **Given** the player opens a routine session, **When** the session layer appears,
   **Then** the app starts no timer, shows no elapsed session clock, and creates no
   completion record on its own.
3. **Given** the player is on the routine overview, **When** the player opens a
   session, then a workbook, then an exercise, **Then** each Back press moves up one
   layer through workbook, session, and routine, in that order.
4. **Given** the player is inside a routine session, **When** the player views
   navigation chrome, **Then** compact breadcrumbs show the routine, session, and
   workbook origin.
5. **Given** the player is on an exercise inside a routine workbook, **When** the
   player uses Previous and Next, **Then** the app moves through workbook entries in
   order and auto-advance stays off by default.
6. **Given** the player completes an exercise inside a routine, **When** the player
   uses the optional completion control, **Then** the app records completion and does
   not close the exercise player or navigate away on its own.
7. **Given** the player stored routines and opens Tools, **When** Tools home renders,
   **Then** the app shows Continue a routine only when active routines exist and never
   shows "No routines yet" on Tools home.
8. **Given** the player uses the Metronome from Tools while routines exist, **When** the
   Metronome runs, **Then** the app requires no routine selection and changes no routine
   state.

---

### User Story 9 - Settle into simple settings (Priority: P9)

A player opens Settings and finds Preferences, Audio, Data/Sync, and Cleanup. Settings
holds no per-feature visibility catalog. Every retained tool stays reachable without a
Settings visit. Local use keeps working when the player never signs in.

**Why this priority**: Settings cleanup removes repair paths that hid tools. The team
ships this work package last because earlier packages must already expose tools through
Tools, Library, and Routines. Player value is simple preferences without navigation
repair.

**Independent Test**: Open Settings and confirm the removed Features section. Open
Tools and Library with empty lists. Open legacy links. Confirm local-first behavior
without sign-in.

**Acceptance Scenarios**:

1. **Given** the player opens Settings, **When** Settings renders, **Then** Settings
   shows Preferences, Audio, Data/Sync, and Cleanup, and shows no Features section and
   no control keyed to `features.enabled`.
2. **Given** the player never opens Settings, **When** the player browses Tools and
   Library, **Then** every retained tool remains reachable without enabling a feature
   flag.
3. **Given** Library and Routines are both empty, **When** the player opens Tools,
   **Then** the player can still reach Train, Study, and Create tools without a
   Settings visit.
4. **Given** the player saved bookmarks to removed destinations such as the standalone
   Notes destination, Study Lab destination, or Drums module, **When** the player opens
   each link, **Then** the app resolves to a deterministic destination with a
   dismissible notice when the destination changed.
5. **Given** the player never signs in, **When** the player uses Tools, Library,
   Routines, and Settings, **Then** all local data reads and writes work and no sign-in
   gate blocks a retained tool.
6. **Given** the player uses Favorites and Recents, **When** the player inspects
   Settings, **Then** Favorites and Recents controls remain available and Settings does
   not expose a per-feature visibility catalog.

### Edge Cases

- A note holds only `id`, `title`, `body`, `createdAt`, and `updatedAt` and names no
  song, exercise, workbook, or routine. Migration places it in Unfiled Notes and keeps
  it unlinked.
- The player stored a very large note set, for example five hundred notes. Unfiled Notes
  lists them with search and scroll without blocking Tools home.
- A drum pattern stored step data and tab text but holds no original file bytes. The
  migrated exercise still opens and plays from stored step data.
- A drum pattern came from a saved Guitar Pro drum import that kept no attachment
  reference. Migration maps it to an exercise that remains playable from stored tab
  text.
- The player stored no drum material and opens an old Drums module link. The app
  redirects to Library or Tools with a dismissible notice and shows no error block.
- The player uploads a duplicate file when the app cannot compute a content hash. Import
  still completes and the app skips duplicate detection instead of failing.
- An exercise record names an `attachmentId` that no longer exists on disk. The exercise
  detail page opens, shows a non-blocking missing-file message, and keeps the identifier.
- A workbook entry names an `exerciseId` that does not resolve. The workbook layer opens
  and reports the missing exercise without blocking other entries.
- A routine session names a `workbookId` that does not resolve. The session layer opens
  and reports the missing workbook without blocking other session content.
- A tool receives an incompatible tuning or scale from origin context. The tool applies
  a compatible fallback, shows an explanation, and does not change saved defaults.
- The player opens a deep link in a new browser tab with no history. The visible in-app
  Back control replaces the address with the calculated parent address instead of using
  empty browser history.
- The player starts a second audio source from a background tab or a second window. The
  single audio owner rule applies per active document, and the prior source stops or
  pauses in that document.
- A recording runs while the player navigates away inside the same document. The app
  offers Save, Discard, or Keep editing and does not discard the capture silently.
- Migration stops part way through a model batch. The next boot resumes or safely
  reruns normalization without duplicate records or partial deletes.
- The player already ran migration on a prior boot. A later boot reruns migration
  idempotently and creates no duplicate record.
- The player never used a route that now shows a legacy notice. The notice appears only
  on the first open of that mapped destination and stays dismissed afterward.
- The player uses 200% text zoom on the sticky Train, Study, Create switch. The switch
  stays usable, readable, and does not overlap primary navigation.
- The player holds a phone in landscape with a safe-area inset. Fixed app bar, bottom
  navigation, and the Audio Dock respect the inset and keep controls reachable.
- A score is longer than the screen. Score Player keeps transport, loop, and practice
  controls visible while the parchment scrolls.
- Library and Routines are both empty at the same time. Tools home still opens Train
  tools and shows no "No routines yet" text.
- The player enables reduced motion. The app reduces nonessential motion and keeps
  essential feedback visible without dependence on hover.
- The player never signs in. Local storage, Favorites, Recents, and migrations keep
  working, and Data/Sync stays optional without a hard gate.

## Requirements *(mandatory)*

### Functional Requirements

#### Default experience and primary navigation

- **FR-001**: The root route MUST open Tools. It MUST NOT open an empty routine state.
- **FR-002**: The app MUST treat Tools as the default space for practice, study, and
  capture.
- **FR-003**: On desktop widths the app MUST show a fixed app bar and a left rail with
  Tools, Library, Routines, and Settings.
- **FR-004**: On mobile widths the app MUST show a fixed app bar and bottom navigation
  with Tools, Library, Routines, and More.
- **FR-005**: Primary navigation MUST NOT list individual tools.
- **FR-006**: Tools MUST show a sticky Train, Study, and Create switch.
- **FR-007**: The player MUST reach every retained tool without a routine, session,
  timer, or completion record. Routines MUST stay available as an optional space
  separate from Tools.

#### Tools home

- **FR-008**: Tools home MUST render sections in this order: the Train, Study, and
  Create purposes; Favorites when any exist; Recents when any exist; Continue a
  routine when active routines exist; then Search and Browse all tools.
- **FR-008a**: The Tools home Search MUST cover tool names and tool modes only. It MUST
  NOT search Library material, songs, notes, or routines.
- **FR-009**: The app MUST NOT render an empty Favorites, Recents, or Continue
  section on Tools home.
- **FR-010**: Tools home MUST NOT show the text "No routines yet".
- **FR-011**: A normal tool card MUST open the tool default mode with saved defaults.
- **FR-012**: A Recent card MUST restore the prior mode and local context for that
  tool.
- **FR-012a**: Tools home MUST keep at most five Recents entries. It MUST hold one entry
  per tool and MUST show the newest entry first. A new visit to the same tool MUST
  replace the prior entry for that tool.
- **FR-013**: A favorite action MUST exist on tool cards and on tool pages.

#### Standard tool page

- **FR-014**: A standard tool page MUST show a header with Back, title, favorite, and
  More in that order.
- **FR-015**: A standard tool page MUST show a context row for root, scale, tuning,
  tempo, or meter when the tool needs it.
- **FR-016**: A standard tool page MUST show mode tabs, the main workspace, primary
  controls, and then an advanced-options drawer.
- **FR-017**: A standard tool page MUST show one primary action at a time. The app MUST
  put destructive actions and secondary actions in More or in the advanced-options
  drawer.
- **FR-018**: The app MUST offer search for large option sets, including tuning lists.
- **FR-019**: A tool MUST preserve compatible context when the player changes mode.
- **FR-020**: The app MUST show no quiz interface outside Pitch and Ear.

#### Musical context

- **FR-021**: Local tool context MUST beat origin context, and origin context MUST beat
  saved defaults.
- **FR-022**: A tool change MUST modify local context only. A routine, workbook,
  exercise, score, or song MAY supply origin context.
- **FR-023**: Only the control "Set as default" MUST modify saved defaults.
- **FR-024**: Back MUST restore the parent context for the open origin.
- **FR-025**: When a value is incompatible with the target mode, the app MUST explain
  the fallback and MUST NOT change it silently.

#### Navigation origin and Back behavior

- **FR-026**: Navigation MUST preserve origin for every tool and library entry.
- **FR-027**: When the player opens a tool from the Tools directory, Back MUST return
  to the prior purpose directory.
- **FR-028**: When the player opens an item from Library, Back MUST restore the prior
  query, filters, sort, selection, and scroll.
- **FR-029**: When the player opens an item from a workbook or routine, Back MUST
  restore the prior workbook entry and scroll, or return through workbook, session, and
  routine as appropriate.
- **FR-030**: When the player opens a tool from Search or a Recent card, Back MUST
  restore the prior search state or return to Tools home at the prior Recents position.
- **FR-031**: The browser Back control, the device Back control, and the in-app Back
  control MUST give the same result for the same screen.

#### Study consolidation

- **FR-032**: The Train directory MUST list Pitch & Ear Lab; Metronome and optional
  Practice Plan; and launchers for Exercises, Workbooks, and Score Player.
- **FR-033**: The Study directory MUST list Scale Lab; Fretboard & Interval Map; Chord
  Lab; and study companions attached to exercises or workbooks.
- **FR-034**: The Create directory MUST list Song Studio; Audio Studio; and Chord
  builder.
- **FR-035**: Scale Lab MUST offer modes Overview, Neck, Harmony, Modes/Keys, and
  Guide. Fretboard & Interval Map MUST offer modes Learn, Map, Chord Tones, and
  Explain. Chord Lab MUST offer modes Reference, Map, Voicings, Triads/Sweeps, and
  Build.
- **FR-036**: Study content MUST stay reachable without a routine.

#### Pitch, Ear, and tempo

- **FR-037**: Pitch & Ear Lab MUST include the pitch tuner, the reference tone, the
  pitch trainer, the pitch runner, and ear training.
- **FR-038**: Pitch and Ear MUST be the only quizzes. Only they MAY show scores,
  streaks, accuracy, or answer-check behavior.
- **FR-039**: The Metronome MUST support subdivisions, accents, tempo phases, and an
  optional countdown.
- **FR-040**: Practice Plan MUST stay optional and MUST NOT require a routine session.
  Practice Plan MUST show a manual practice item list and a manual timer. The player
  MUST start and stop that timer by hand. Practice Plan MUST record no completion on
  its own.

#### Create and capture

- **FR-041**: Song Studio MUST let the player capture and edit songs without a routine.
- **FR-042**: Audio Studio MUST offer modes Capture, Analyze, and Transcribe. The
  recorder and monophonic transcription features MUST stay available inside Audio
  Studio.
- **FR-043**: Chord builder MUST let the player build chords without a routine.

#### Practice Library

- **FR-044**: Practice Library MUST have two tabs: Exercises and Workbooks.
- **FR-045**: Practice Library MUST offer filters for instrument, material type,
  technique, tuning, difficulty, tags, source, and favorite.
- **FR-046**: Library MUST preserve list state when the player opens and closes an
  item.
- **FR-047**: Library MUST use one Add action for supported create and import actions.
- **FR-048**: The app MUST open Guitar Pro content in Score Player, audio and video in
  the shared practice player, and PDF and image files in the shared document viewer.
- **FR-049**: When possible the app MUST detect duplicate uploads by content hash. When
  a duplicate exists the app MUST offer "Open existing" or "Import another copy".
- **FR-050**: An exercise detail page MUST show workbook and routine references. When
  the player replaces an attachment the exercise identifier and its references MUST stay
  the same.

#### Score Player

- **FR-051**: Score Player MUST keep transport controls visible while the parchment
  scrolls. It MUST put the mixer and practice settings in drawers.
- **FR-052**: Loop Selection MUST be an explicit mode. When Loop Selection is off,
  drag MUST scroll the score. When Loop Selection is on, drag MUST select measures.
- **FR-053**: "Save as Exercise" MUST confirm the source score, track, measures, tempo,
  and tuning.
- **FR-054**: Score Player MUST keep no private score library.

#### Audio ownership and the Audio Dock

- **FR-055**: The app MUST allow one active audio owner at a time. When the player
  starts another metronome, tone, score, recording, or media item, the app MUST stop
  or pause the prior audio owner.
- **FR-056**: The app MUST NOT discard an unsaved recording. When another audio owner
  claims audio, the app MUST offer Save, Discard, or Cancel. Cancel MUST refuse the new
  claim and MUST keep the recording.
- **FR-057**: The app MUST show the Audio Dock only while playback, recording, or
  microphone work is active. The dock MUST show the source, the state, the elapsed time
  when useful, and Stop.
- **FR-058**: Global volume MUST control playback. It MUST NOT represent input gain.

#### Unsaved work

- **FR-059**: When the player leaves an unsaved song edit, recording, transcription,
  or Library edit, the app MUST offer Save, Discard, or Keep editing. The leave prompt
  MUST use the label Keep editing. Only the audio-claim prompt in FR-056 MUST use the
  label Cancel.
- **FR-060**: Song text MAY auto-save and MUST show a Saving or Saved state.

#### Optional routines

- **FR-061**: Routines MUST follow the path Routines, Routine, Session, Workbook, and
  Exercise. A routine MUST reference workbooks by identifier. It MUST NOT copy workbook
  content.
- **FR-062**: Routine cards MUST use Open, not Start. Session pages MUST show notes,
  optional context, and workbooks.
- **FR-063**: Opening a session MUST NOT start time tracking. Session completion MUST
  be an optional explicit control.
- **FR-064**: Exercise completion MUST NOT close the player. Previous and Next MUST
  move through workbook entries. Auto-advance MUST be off by default.
- **FR-065**: Compact breadcrumbs MUST show the routine, session, and workbook origin.

#### Settings

- **FR-066**: Settings MUST keep preferences, audio settings, local data, sync, and
  cleanup. The app MUST NOT use Settings to repair navigation.
- **FR-067**: The app MUST remove the per-feature visibility catalog. Settings MUST
  keep Favorites and Recents.
- **FR-068**: Sign-in and sync MUST stay optional. The app MUST keep working locally
  without sign-in.

#### Feature removal

- **FR-069**: The app MUST remove Scale Spelling and the scale-naming quiz; the
  Intervals quiz; the Sight Reading quiz; the Fretboard quiz; the Interval Map quiz
  and its scored Play mode and Progress mode; the Chord Workout quiz; and the Timing
  tap-scoring quiz.
- **FR-070**: The app MUST remove the Keyboard/Piano tool; the Drums module; the
  standalone Notes destination; the standalone Study Lab destination; the separate
  Practice Timer destination; the separate Guitar Pro saved-score library; the
  always-visible inactive recording and pitch strip; and the per-feature visibility
  catalog. The change MUST NOT delete player notes or drum material before migration
  completes.

#### Data preservation and migration

- **FR-071**: The app MUST preserve stable identifiers and references for exercises,
  workbooks, routines and sessions, songs, Guitar Pro scores and attachments,
  recordings, and preferences.
- **FR-072**: Notes migration MUST move a song-related note to the associated song when
  the relationship exists. It MUST move an exercise, workbook, or routine note to the
  associated entity when the relationship exists. It MUST move an unmatched note to
  Unfiled Notes.
- **FR-073**: The app MUST NOT keep Notes as a top-level destination after migration.
- **FR-074**: Drums migration MUST convert imported or player-saved drum files and
  patterns into generic exercises. It MUST preserve the source attachment and available
  metadata when one exists.
- **FR-075**: Drums migration MUST add the instrument value `drums` and the relevant
  material-type metadata. It MUST keep compatible Guitar Pro material playable in
  Score Player.
- **FR-076**: The app MUST remove the Drums module only after the drums migration check
  passes.
- **FR-077**: Streaks, attempts, accuracy, and scores for removed features need no
  migration.
- **FR-078**: Every migration MUST have a version number and MUST be idempotent. The
  app MUST NOT delete a source record until the destination check passes. Migration
  MUST preserve unknown fields unless the schema needs their removal.

#### Route compatibility

- **FR-079**: The hashes `#scales`, `#scaleref`, `#circle`, and `#studylab` MUST open
  Scale Lab at Overview, Overview, Modes/Keys, and Guide respectively. `#scales` MUST
  show a one-time removal notice.
- **FR-080**: The hash `#intervals` MUST open Fretboard & Interval Map at Learn. The
  hashes `#fretboard`, `#intervalorbit`, and `#intervalmap` MUST open Fretboard &
  Interval Map at its default mode. `#intervals` and `#fretboard` MUST show a one-time
  removal notice.
- **FR-081**: The hashes `#chordlab`, `#chords`, and `#triads` MUST open Chord Lab at
  Reference, Reference, and Triads/Sweeps respectively. `#chordlab` MUST show a
  one-time removal notice.
- **FR-082**: The hashes `#tuner`, `#ear`, `#timing`, `#metronome`, and `#practice`
  MUST open Pitch & Ear Lab Tuner, Pitch & Ear Lab Ear, Metronome, Metronome, and
  Practice Plan respectively. `#timing` MUST show a one-time removal notice.
- **FR-083**: The hash `#sightreading` MUST open the Train directory and MUST show a
  one-time removal notice.
- **FR-084**: The hashes `#recorder`, `#tracktosheet`, and `#songwriter` MUST open
  Audio Studio Capture, Audio Studio Transcribe, and Song Studio respectively.
- **FR-085**: The hash `#notes` MUST open the Unfiled Notes migration destination.
  The hash `#keyboard` MUST open the Study directory and MUST show a Pitch Reference
  notice.
- **FR-086**: The hash `#drums` MUST open migrated drum exercises, or Library when
  none exist. The hashes `#exercises` and `#workbooks` MUST open Library Exercises and
  Library Workbooks respectively.
- **FR-087**: The hash `#routines` MUST open Routines. The hashes `#gpplayer` and
  `#tabanalyzer` MUST open Score Player. The hash `#musicprefs` MUST open Settings.
- **FR-088**: A removal notice MUST be dismissible and MUST show once per route
  migration.

#### Single owner for shared behavior

- **FR-089**: One implementation MUST own musical context. Every tool that shows root,
  scale, tuning, tempo, or meter MUST read the same context rules and precedence.
- **FR-090**: One implementation MUST own scale data. Every study surface that names a
  scale MUST show the same scale names and intervals for the same selection.
- **FR-091**: One implementation MUST own chord data. Every surface that names a chord
  quality or voicing MUST show the same spellings for the same selection.
- **FR-092**: One implementation MUST own fretboard rendering and tuning data. Every
  tool that shows a neck diagram MUST use the same tuning list and the same fret
  positions for the same selection.
- **FR-093**: One implementation MUST own microphone and audio analysis. Every capture
  and pitch tool MUST use the same analysis rules and the same permission handling.
- **FR-094**: One implementation MUST own tempo and metronome scheduling. Every
  metronome surface MUST use the same beat timing for the same tempo, meter, and
  subdivision.
- **FR-095**: One implementation MUST own Guitar Pro parsing and score playback. Every
  score view MUST use the same track list and transport behavior for the same file.
- **FR-096**: One implementation MUST own Practice Library persistence. Every Library
  screen MUST read and write the same exercise and workbook records. No feature MUST
  keep a private practice-material library.

#### Presentation and access

- **FR-097**: New and changed surfaces MUST use the Atomic Purple Game Boy Color look.
  They MUST reuse shared theme tokens and the pixel font stack.
- **FR-098**: Interactive targets MUST be at least 44 by 44 CSS pixels. The app MUST
  NOT depend on hover for essential actions.
- **FR-099**: Icon-only controls MUST have accessible names. Keyboard focus MUST follow
  visual order.
- **FR-100**: After navigation focus MUST move to the new page heading. After a dialog
  closes focus MUST return to the invoking control.
- **FR-101**: The app MUST NOT use colour alone for pitch, notes, intervals, or
  completion. The app MUST support 200% text zoom.
- **FR-102**: The app MUST respect reduced motion and mobile safe areas. Score,
  fretboard, and playback controls MUST stay visible during content scroll.

#### Delivery and scope control

- **FR-103**: The team MUST implement the feature in nine ordered work packages:
  WP-01 compatibility tests and migrations; WP-02 tool-first shell and home; WP-03
  common navigation and context behavior; WP-04 Study consolidation; WP-05 Pitch, Ear,
  and Rhythm; WP-06 Create consolidation; WP-07 Practice Library and Score Player;
  WP-08 the optional routine experience; WP-09 settings and cleanup.
- **FR-104**: WP-00 is a repository map and baseline that changes no behavior.
- **FR-105**: The app MUST stay functional between work packages. The team MUST remove
  legacy code only after its replacement, migration, route redirect, and tests pass.
- **FR-106**: The target for the feature is zero regressions. The product owner MUST
  confirm each work package before the next one starts. The team MUST record that
  confirmation as a sign-off line for the package in `tasks.md`. The sign-off line MUST
  name the quickstart steps that passed for the package.
- **FR-107**: The repository has no lint tooling, no type checker, and no build step.
  Definition of done MUST map to Node runners under `tests/`, a browser check over HTTP,
  and CLI smoke commands such as `node cli/bin/musi.js --help`.
- **FR-108**: This feature changes the web app. The CLI MUST keep its own activities.

### Key Entities *(include if feature involves data)*

- **Exercise**: A single practice item. It holds an identifier, metadata, and either an
  attachment reference or a URL. Workbook entries and Library lists reference it by
  identifier.
- **Workbook**: A named collection of practice material. It holds an identifier and an
  ordered entry list. Routines reference workbooks by identifier.
- **Workbook entry**: One row inside a workbook. It references an exercise by
  identifier and may carry local order and notes.
- **Routine**: An optional named practice plan. It holds an identifier, sessions, and
  workbook references. It does not embed workbook content.
- **Routine session**: One step inside a routine. It holds notes, optional context, and
  workbook references by identifier.
- **Song**: A player-authored song with text and structure. Song Studio owns it. A note
  may link to a song when the relationship exists.
- **Note**: A free-text record with title and body. It may link to a song, exercise,
  workbook, or routine when the player creates that link.
- **Unfiled Notes**: The destination list for notes that have no linked entity after
  migration.
- **Attachment**: Stored file bytes or imported content linked from an exercise or
  score. Replacing an attachment keeps the parent exercise identifier.
- **Score**: A Guitar Pro file or parsed score used by Score Player. It may supply
  origin context for tuning, tempo, and track selection.
- **Score range exercise**: An exercise created from a score selection. It stores the
  source score, track, measures, tempo, and tuning.
- **Recording**: Captured audio from Audio Studio. The player may save, discard, or
  keep editing it.
- **Drum pattern**: Legacy step data and tab text from the Drums module before
  migration.
- **Migrated drum exercise**: A generic exercise created from a drum pattern. It carries
  instrument value `drums` and material-type metadata.
- **Preferences**: Player settings for audio, defaults, sync, and cleanup. They survive
  migration and optional sign-in.
- **Musical context**: The active root, scale, tuning, tempo, meter, and related values
  for a tool screen. Local context, origin context, and saved defaults layer by
  precedence.
- **Saved default**: A player-chosen default for a tool field. Only "Set as default"
  changes it.
- **Tool**: A named practice, study, or capture surface in Tools. Each tool has modes
  and may appear in Favorites and Recents.
- **Favorite**: A player-marked tool shortcut shown on Tools home and on tool pages.
- **Recent**: A record of the last tool visit with mode and local context for restore.
- **Route origin**: The navigation source for the current screen, such as Tools, Library,
  routine, workbook, or Search.
- **Audio owner**: The single active metronome, tone, score, recording, or media item
  that controls shared audio output.
- **Migration record**: A versioned migration step with source checks and destination
  checks. The app runs it idempotently.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From Tools home the player reaches Pitch & Ear Lab Tuner in two or fewer
  interactions on phone and desktop widths.
- **SC-002**: From Tools home the player reaches Metronome in two or fewer interactions
  on phone and desktop widths.
- **SC-003**: When the player opens Musi with no hash, Tools home appears first in one
  hundred percent of boots, for empty, small, and large stored data sets.
- **SC-004**: Zero quiz interfaces appear outside Pitch and Ear across all retained
  tools and Library entry points.
- **SC-005**: Zero empty Favorites, Recents, or Continue sections appear on Tools home
  in one hundred test loads with mixed stored data.
- **SC-006**: One hundred percent of listed legacy hashes open a deterministic
  destination screen with no error dialog.
- **SC-007**: Running the full migration suite twice on the same device produces zero
  duplicate exercises, notes, or drum exercises.
- **SC-008**: Zero notes are lost after notes migration for a fixture set of at least
  fifty stored notes.
- **SC-009**: Zero drum patterns are lost after drums migration for a fixture set that
  covers saved patterns and Guitar Pro imports.
- **SC-010**: Zero exercises, workbooks, routines, songs, recordings, or preferences
  are lost after migration for a combined fixture set.
- **SC-011**: The browser Back control, the device Back control, and the in-app Back
  control agree in one hundred percent of tested transitions across Tools, Library,
  routines, and Search.
- **SC-012**: After the player opens and closes a Library item, the list restores the
  prior query, filters, sort, selection, and scroll in one hundred percent of trials.
- **SC-013**: At most one audio owner plays at a time in one hundred concurrent-start
  trials across metronome, tone, score, and recording tools.
- **SC-014**: Zero unsaved recordings are silently discarded when the player leaves
  Audio Studio in one hundred leave attempts with active capture.
- **SC-015**: After attachment replacement the exercise identifier and all workbook and
  routine references stay unchanged in one hundred replacement trials.
- **SC-016**: A score range exercise keeps the same track, measure range, tempo, and
  tuning values that "Save as Exercise" confirmed.
- **SC-017**: A keyboard-only player completes Tools home browse, Library open and
  close, routine drill-down, Score Player transport, and Audio Studio save or discard
  without a pointer.
- **SC-018**: One hundred percent of primary actions on new surfaces meet the 44 by 44
  CSS pixel minimum target size.
- **SC-019**: At 200% text zoom all primary navigation labels and tool titles remain
  readable with no overlapping controls on phone and desktop widths.
- **SC-020**: New and changed surfaces use zero new colour values and zero new font
  families outside the shared theme tokens and pixel font stack.
- **SC-021**: Boot, Tools home, Library, Routines, Settings, and each consolidated
  study tool produce zero runtime errors in the browser error log.
- **SC-022**: The seven critical flows pass end to end: root to Tuner; root to
  Metronome; Library exercise open and close with state restore; routine open without
  timer; Score Player loop and scroll modes; unsaved recording prompt; notes and drums
  migration on a populated device.
- **SC-023**: A player who never signs in completes every retained tool action locally
  with zero sign-in prompts on the critical paths.
- **SC-024**: Favorites and Recents remain available after the per-feature visibility
  catalog is removed.
- **SC-025**: Removal notices for migrated routes show once per route and stay
  dismissed after the player closes them.
- **SC-026**: Cloud sync payloads from a migrated client import on an older client
  without a fatal error in a round-trip fixture test.
- **SC-027**: After each work package the app loads Tools home and opens at least one
  tool from each completed area without a blocking error.
- **SC-028**: The existing automated checks pass after each work package, with zero new
  failures against the recorded baseline.
- **SC-029**: The CLI companion starts and prints its activity list after each work
  package.
- **SC-030**: Score Player keeps transport controls visible during parchment scroll in
  one hundred scroll trials on phone and desktop widths.
- **SC-031**: When Loop Selection is off, drag scrolls the score in one hundred
  percent of drag trials. When Loop Selection is on, drag selects measures in one
  hundred percent of drag trials.
- **SC-032**: The Audio Dock appears only during active playback, recording, or
  microphone work across one hundred tool switches.
- **SC-033**: Incompatible musical context shows an explained fallback message in one
  hundred percent of tested incompatible transitions.
- **SC-034**: After the final work package the app loads zero removed features. A full
  boot and a visit to every primary destination load no removed feature code.

## Assumptions

- No stored note carries a link to a song, exercise, workbook, or routine today. Every
  existing note therefore reaches Unfiled Notes. The conditional part of the notes
  migration applies to notes that gain a relationship later.
- The drums store keeps no original file for a pattern, even for a Guitar Pro import.
  The migration builds the exercise attachment from the stored pattern data and tab
  text. It preserves an original attachment only where one exists.
- The repository has no migration framework. This feature adds a versioned, idempotent
  one.
- Stored values for removed features stay in place as inert data. The feature runs no
  destructive clean-up only to delete them.
- Cloud sync payloads stay backward compatible. An older client must not fail on a new
  field.
- The CLI keeps its own activities. This feature changes the web app.
- The repo has no lint tooling, no type checker, and no build step, so those
  definition-of-done items map to the Node runners under `tests/`, a browser check,
  and CLI smoke commands.
- The app keeps its address-fragment routing shell. This feature adds no path router.
- The service worker cache name needs a bump when file names change.
- Musi uses sequential feature numbering. This feature directory is
  `specs/005-tool-first-simplification`. The author first chose `002`. The trunk already
  held `002-gp-player-overhaul`, `003-gp-player-unload`, and `004-nested-library-folders`,
  so the directory moved to `005`.
- `research-inventory.md` in this directory records the verified state of the current
  code. It is background input for planning and it is not a requirement source.
- The root route today is `home` with no hash. After the change the root route opens
  Tools with the same no-hash entry pattern.
- The per-feature visibility catalog uses the setting key `features.enabled`. Settings
  removes that catalog and keeps Favorites and Recents instead.
- Practice Plan is optional content inside Train. It does not require a routine session.
- Unfiled Notes is a list inside an existing surface, not a top-level nav item.
- The seven critical flows in SC-022 match the product owner acceptance list for
  package sign-off.
- Study companions stay attached to exercises or workbooks. Tools Study lists them as
  entry points only.
- Score Player uses the shared exercise store for "Save as Exercise". It keeps no
  private library.
- Global volume affects playback only. Input gain stays in Audio Studio or tool-local
  controls.
- Auto-advance off by default applies to routine workbook navigation only.
- The app stores one dismissal record per migrated route. Each removal notice therefore
  shows once and stays dismissed.
- WP-00 produces a map only. It ships no player-visible change.
- Legacy quiz streaks in memory need no migration. Persisted Interval Map mastery may
  stay as inert progress data.
- The shared practice player and document viewer already exist or ship inside WP-07.
- Chord builder in Create is distinct from Chord Lab Build mode. Both may share chord
  data through the single owner.
- More on mobile opens Settings and secondary destinations. It does not list individual
  tools.
- Continue a routine on Tools home shows only when at least one active routine exists.
  Active means stored and not deleted.
- Browser check means `python3 -m http.server 8080` and manual exercise of main screens.
- An exercise record still needs an `attachmentId` or a `url` after drums migration.
- Duplicate upload detection uses content hash when the file bytes are available.

## Out of Scope

- Any backend, database, or network service for core features.
- A visual redesign away from the Atomic Purple Game Boy Color look.
- CLI feature removal or CLI parity work with the new web navigation.
- New practice content or new curriculum.
- A rewrite of the Guitar Pro readers.
- Multi-user or account features beyond the existing optional sign-in.
- Offline audio rendering or export formats that do not exist today.
- Performance work that no requirement in this spec needs.
- A destructive clean-up of stored values for removed features.
- Pagination or advanced search ranking beyond the stated Library filters.
- Automatic routine scheduling or reminders.
- Social sharing or collaboration features.
- Native mobile app shells beyond the existing PWA.
- Automated visual regression or accessibility audit tooling in CI.

## Dependencies

- The existing exercise and attachment store, which owns exercise records and file
  links.
- The existing workbook store, which owns workbooks and workbook entries.
- The existing routine store, which owns routines, sessions, and workbook references.
- The existing song store, which owns player songs and song edits.
- The existing notes store, which owns free-text notes until migration moves them.
- The existing address-fragment routing shell, which owns hash navigation and history.
- The existing shared audio system, which owns the single shared audio output.
- The existing Guitar Pro reader entry point, which owns parsing and score playback.
- The existing settings store, which owns preferences, audio settings, and sync scopes.
- The existing optional cloud sync, which carries opaque record payloads.
- The existing static hosting and offline cache through the service worker.
- The existing Favorites and Recents persistence, which survives catalog removal.
- The existing device-local storage layer, which holds all player data without sign-in.
