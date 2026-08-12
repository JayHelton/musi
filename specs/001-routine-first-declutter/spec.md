# Feature Specification: Routine-First Declutter

**Feature Branch**: `001-routine-first-declutter`

**Created**: 2026-08-12

**Status**: Draft

**Input**: User description: "Declutter Musi and make routines the main Home experience. This change has four parts: 1. Remove genre-based learning and its settings. 2. Show all routines on Home for quick access. 3. Remove session-start and time-tracking behavior. 4. Use stacked routine navigation. Back must return to the parent routine layer. Do not implement the full Train-Study-Create refactor in this change."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reach every routine from Home (Priority: P1)

A player opens Musi and wants to practice. Home shows a card for every routine the
player has stored. Each card names the routine and names the session the player
stopped at. The player taps one card and lands on that routine. The player does not
pick a genre, does not read a recommendation, and does not scan a tool catalog.

**Why this priority**: This story delivers the core value of the feature. Routines are
the reason the player opens the app. A routine-first Home removes the longest path to
practice.

**Independent Test**: Store three routines. Open Home. Confirm that three cards
appear, that each card names its own current session, and that a tap on one card opens
that routine. This story delivers value even without the other stories.

**Acceptance Scenarios**:

1. **Given** the player stored no routine, **When** the player opens Home, **Then**
   Home shows the title "No routines yet", the text "Create a routine or import a Musi
   routine file.", a primary "New Routine" action, and a secondary "Import Routine"
   action.
2. **Given** the player stored one routine, **When** the player opens Home, **Then**
   Home shows exactly one routine card under a "Routines" heading.
3. **Given** the player stored three routines, **When** the player opens Home,
   **Then** Home shows three routine cards, and each card shows the routine name, the
   routine description when one exists, the name of the session that the routine
   records as its current session, the completed session count, the total session
   count, and a compact progress indicator.
4. **Given** three routines with different last-change times, **When** Home renders
   the cards, **Then** the most recently changed routine appears first, and routines
   that changed at the same time appear in name order.
5. **Given** Home shows routine cards, **When** the player activates any part of a
   card, **Then** that routine opens. No separate start control appears on the card.
6. **Given** Home shows routine cards, **When** the player looks at Home, **Then**
   Home shows no genre prompt, no study recommendation, no quick-start tool cards, no
   category cards, and no expanded tool catalog. Home shows one small secondary action
   that opens the existing tool browser.
7. **Given** Home shows the empty state, **When** the player uses "New Routine" or
   "Import Routine", **Then** the routine creation flow or the routine import flow
   runs and Home shows the new routine card.

---

### User Story 2 - Move through routine layers and step back one layer (Priority: P2)

A player opens a routine, opens a session inside it, opens a workbook inside that
session, and then opens an exercise. Each step keeps its parent layer in place. One
Back press returns the player to the parent layer. The player never falls back to Home
from a deep layer.

**Why this priority**: Routine drill-down is the main navigation path once Home is
routine-first. A Back press that jumps to Home makes deep content expensive to reach
again.

**Independent Test**: Open a routine, then a session, then a workbook, then an
exercise. Press Back four times. Confirm that each press moves up exactly one layer
and that the fourth press reaches Home. Repeat the test with the browser Back control
and confirm the same result.

**Acceptance Scenarios**:

1. **Given** the player is on the routine overview, **When** the player opens a
   session, **Then** the session layer appears above the routine layer, the routine
   layer stays in place, the address gains the routine identifier and the session
   identifier, and focus moves to the session layer heading.
2. **Given** the player is on the session layer, **When** the player presses the
   visible Musi Back control, **Then** only the session layer closes, the routine
   overview reappears at its earlier scroll position, and the app does not reload
   routine data.
3. **Given** the player is on the workbook layer, **When** the player presses Back,
   **Then** the session layer reappears and the selected routine and selected session
   stay unchanged.
4. **Given** the player is on an exercise inside a workbook, **When** the player
   presses Back, **Then** the workbook layer reappears.
5. **Given** the player opened a study companion from a session, **When** the player
   presses Back, **Then** the session layer reappears.
6. **Given** the player is on any routine layer, **When** the player uses the browser
   Back control or the Android system Back control, **Then** the result matches the
   result of the visible Musi Back control.
7. **Given** the player presses Back repeatedly from the deepest layer, **When** the
   player reaches Home, **Then** the app stays on Home and no navigation loop occurs.
8. **Given** the player opens Musi directly on an address that names a routine, a
   session, and a workbook, **When** the app loads, **Then** the app rebuilds the
   routine layer and the session layer below the workbook layer, shows the workbook
   layer, and the visible Musi Back control moves to the session address.
9. **Given** an address names a routine that exists and a session that does not exist,
   **When** the app loads, **Then** the app drops the invalid child part of the
   address, shows the routine overview, and shows a message that does not block use.
10. **Given** an address names a routine that does not exist, **When** the app loads,
    **Then** the app returns the player to Home and shows a message that does not
    block use.

---

### User Story 3 - Open routine content without a tracked practice session (Priority: P3)

A player opens a session to read its notes and to run its metronome. The app opens the
content at once. The app does not ask the player to start a practice session, does not
count time, and does not mark the session complete on its own. The player marks a
session complete only by an explicit action.

**Why this priority**: Time tracking adds a step before every practice action and adds
state that the player must close. Removing it shortens the path to content. The
routine feature already stores the target duration as data only, so this story is
mostly a removal of controls and of one input.

**Independent Test**: Open a session. Confirm that no start control, no countdown, and
no elapsed time appear, and that the session completion state does not change. Export
the routine and confirm that the stored target duration value survives.

**Acceptance Scenarios**:

1. **Given** the player opens a session, **When** the session layer appears, **Then**
   the layer shows no start control, no end control, no countdown, no elapsed time, and
   no time summary.
2. **Given** the player opens a session, **When** the session layer appears, **Then**
   the app records that session as the routine's current session and does not change
   the session completion state.
3. **Given** the player opens a session, **When** the app opens the content, **Then**
   the app creates no temporary practice-session record.
4. **Given** a session that is not complete, **When** the player uses the explicit
   completion control, **Then** the session becomes complete, and the routine card
   counts on Home update.
5. **Given** a routine file that holds a target duration value for a session,
   **When** the player imports the file and exports it again, **Then** the target
   duration value is unchanged, and no screen shows that value.
6. **Given** the player opens a session, **When** the player starts the session
   metronome, **Then** the metronome runs and the app still shows no session clock.

---

### User Story 4 - Practice without genre setup (Priority: P4)

A player opens Home and Settings. The player finds no genre profile, no genre
priorities, no learning-goal chips, no study-balance choice, no application preference,
and no paused-topic list. Settings keeps the controls the player still needs. Study Lab
still opens and runs.

**Why this priority**: The genre system is the largest source of clutter on Home and in
Settings, and it also adds boot work. The value is real, but Home must become
routine-first first, so this story follows the navigation stories.

**Independent Test**: Open Home and Settings and confirm that no genre control and no
recommendation card appear. Open Study Lab and confirm that a study runs. Reload the
app and confirm that the app reads no genre profile data.

**Acceptance Scenarios**:

1. **Given** a player with saved genre choices from an earlier version, **When** the
   app boots, **Then** the app reads no genre profile data and writes no genre profile
   data, and the saved values stay untouched in local storage.
2. **Given** the player opens Settings, **When** Settings renders, **Then** Settings
   shows the default musical context controls, the audio volume control, the device
   sync controls, the import and export controls, and the feature visibility controls,
   and shows no genre control and no recommendation preview.
3. **Given** the player opens Study Lab, **When** Study Lab starts, **Then** Study Lab
   opens a study and runs its walkthrough without any genre configuration.
4. **Given** the app boots and the player visits Home, Settings, and Study Lab,
   **When** the player checks the browser error log, **Then** no missing-module error, no
   missing-selector error, and no missing-stylesheet error appears.
5. **Given** a settings file that an earlier version exported with genre values,
   **When** the player imports that file, **Then** the import completes without an
   error and the non-genre settings apply.

### Edge Cases

- A routine holds no session. The card shows a total of zero, shows no current session
  name, and still opens.
- A routine records no current session. The card omits the session name and keeps the
  counts and the progress indicator.
- Every session in a routine is complete. The card shows a full progress indicator and
  the routine still opens.
- Two routines share the same last-change time. Name order decides the card order.
- The player stores many routines, for example fifty. Home lists all of them in one
  scrolling list, because this feature adds no pagination and no filter.
- The player opens one routine while other routines exist. No other routine changes its
  current session, its completion data, or its last-change time.
- The player deletes a routine while its layers are open. The app returns to the
  deepest valid layer and shows a message that does not block use.
- A session names a workbook that no longer exists. The app shows the session layer and
  reports the missing item without a block.
- A session names a study companion that its workbooks do not hold. The app shows the
  session layer and reports the missing item without a block.
- The player opens Musi on a deep address in a new browser tab. The browser holds no
  earlier entry, so the visible Musi Back control replaces the current address with the
  parent address instead of using browser history.
- The player edits the address by hand to a deeper address. The app reconciles the
  visible layers with the address.
- The player uses Back immediately after an import. The app keeps the imported routine
  data and moves up one layer.

## Requirements *(mandatory)*

### Functional Requirements

#### Home

- **FR-001**: Home MUST present a routine dashboard with a "Routines" heading, one card
  for every stored routine, a "New Routine" action, and an "Import Routine" action.
- **FR-002**: Home MUST lay the routine cards out responsively for phone widths and for
  desktop widths.
- **FR-003**: Each routine card MUST show the routine name, the routine description
  when one exists, the name of the session that the routine records as its current
  session, the completed session count, the total session count, and a compact progress
  indicator.
- **FR-004**: The whole routine card MUST act as the single open control. The card MUST
  NOT offer a start-session control.
- **FR-005**: Home MUST sort routine cards by last-change time in descending order, and
  MUST use the routine name as a stable secondary sort.
- **FR-006**: Home MUST show the empty state when no routine exists. The empty state
  MUST use the title "No routines yet", the text "Create a routine or import a Musi
  routine file.", the primary action "New Routine", and the secondary action "Import
  Routine".
- **FR-007**: Home MUST update its cards when the stored routine data changes, without
  a manual reload.
- **FR-008**: Home MUST NOT render a pocket theory hero, a continue-practice card, a
  start-study action, a study recommendation card, a genre profile prompt, a
  foundation-study prompt, quick-start tool cards, category cards, or an expanded tool
  catalog.
- **FR-009**: Home MUST keep one small secondary action that opens the existing tool
  browser, so every music tool stays reachable.
- **FR-010**: The music tools MUST stay available and functional. This feature removes
  Home surfaces only.

#### Independent routines

- **FR-011**: The app MUST treat every stored routine as active and independently
  accessible.
- **FR-012**: The app MUST NOT hold an application-level active-routine value. Each
  routine MUST keep its own current-session bookmark.
- **FR-013**: Opening one routine MUST NOT change the stored state of any other
  routine.
- **FR-014**: Completing a session in one routine MUST change only that routine.
- **FR-015**: The app MUST NOT add archive, favorite, pin, schedule, pagination, or
  filter behavior to routines in this feature.

#### No tracked practice session

- **FR-016**: The routine flow MUST open content directly. It MUST NOT offer a start
  control or an end control for a tracked practice session.
- **FR-017**: The routine flow MUST NOT show a countdown, an elapsed time, or a session
  time summary.
- **FR-018**: The routine flow MUST NOT start a timer on its own and MUST NOT complete
  a session because time passed.
- **FR-019**: The app MUST NOT create a temporary practice-session record before it
  opens routine content.
- **FR-020**: Opening a session MUST NOT change the session completion state. Only an
  explicit player action MUST change it.
- **FR-021**: The routine flow MUST keep manual session completion, the current-session
  bookmark, session notes, the session metronome configuration, workbook references,
  study companion references, and existing completion data.
- **FR-022**: The app MUST keep the stored session target duration as inert
  compatibility data. It MUST NOT show that value and MUST NOT run a timer from it.

#### Stacked routine navigation

- **FR-023**: Routine content MUST behave as a stack of layers in this order: routines
  list, routine overview, session detail, workbook detail, then exercise, player, or
  study companion.
- **FR-024**: When a child layer opens, the app MUST keep the parent layer mounted, add
  the child layer above it, add one browser history entry, update the address with the
  selected identifiers, and move focus to the new layer heading.
- **FR-025**: When the player presses Back, the app MUST remove only the top layer and
  MUST reveal the parent layer at its earlier scroll position.
- **FR-026**: Back from a session, a workbook, an exercise, or a study companion MUST
  NOT return directly to Home.
- **FR-027**: Back MUST NOT reload routine data, MUST NOT clear the selected routine,
  and MUST NOT clear the selected session.
- **FR-028**: The visible Musi Back control and the browser Back control, including the
  Android system Back control, MUST produce the same result.
- **FR-029**: The app MUST keep the current address-fragment shell and MUST carry
  routine state in fragment parameters that name the routine, the session, the
  workbook, and the exercise or the study companion.
- **FR-030**: The app MUST add a history entry when the player opens a deeper layer, and
  MUST NOT add a history entry while it handles a Back press.
- **FR-031**: The app MUST reconcile the visible layer stack with the address when the
  address changes.
- **FR-032**: One routine navigation controller MUST own the route state, the layer
  creation and removal, the parent-route calculation, the history synchronization, the
  scroll restoration, the focus restoration, and the visible Back control behavior.
  Content renderers MUST render only their selected item.

#### Direct links and invalid identifiers

- **FR-033**: When the app loads on a deep routine address, it MUST open the routine
  area, rebuild the parent layers, and show the requested top layer.
- **FR-034**: When the browser holds no earlier entry for the parent layer, the visible
  Musi Back control MUST replace the current address with the calculated parent
  address.
- **FR-035**: When a session, workbook, exercise, or study companion identifier does not
  resolve, the app MUST drop the invalid child parameters, show the deepest valid parent
  layer, and show a message that does not block use.
- **FR-036**: The app MUST send the player to Home only when the routine identifier
  itself does not resolve.

#### Genre-learning removal

- **FR-037**: The app MUST remove genre-based learning from the running product. This
  includes the genre profile setup, the genre priorities, the primary, secondary, and
  occasional-interest levels, the genre-based study recommendations, the genre-based
  concept weighting, and the genre-based preview cards.
- **FR-038**: The app MUST remove the study-balance controls, the application-preference
  controls, and the paused-topic controls that exist only to rank genre
  recommendations.
- **FR-039**: Home MUST NOT show a prompt that asks the player to configure genres.
- **FR-040**: The app MUST NOT read or write genre profile data during boot or during
  normal use.
- **FR-041**: The app MUST leave existing stored genre values in place. The app MUST NOT
  run a destructive storage migration only to delete them.
- **FR-042**: Settings MUST keep the default musical context controls, the audio volume
  control, the device sync controls, the import and export controls, and the feature
  visibility controls.
- **FR-043**: Study Lab MUST open and run a study without any genre configuration. This
  feature MUST remove only its dependency on genre recommendations and MUST NOT redesign
  it.
- **FR-044**: The app MUST remove the style rules that lose their last consumer, and
  MUST remove the stylesheet references for deleted stylesheets.
- **FR-045**: The app MUST NOT log a missing module, a missing selector, or a missing
  stylesheet after the removal.

#### Data compatibility

- **FR-046**: The routine export format MUST stay unchanged. The export MUST keep the
  application field, the kind field, the version field, the routine list, the routine
  identifiers, the per-routine current-session bookmark, the ordered session list, the
  session target duration, the completion flags, the workbook references, the metronome
  settings, the notes, and the study companion references.
- **FR-047**: Import MUST accept files that earlier Musi versions produced, and MUST NOT
  merge several routines into one routine.
- **FR-048**: A settings import that still contains genre values MUST complete without
  an error and MUST apply the non-genre values.
- **FR-049**: Existing exercises, workbooks, study companions, routines, and completion
  data MUST stay intact after the change.

#### Presentation and access

- **FR-050**: The routine cards and the routine layers MUST use the existing Atomic
  Purple Game Boy Color look. They MUST reuse the shared theme colours, the pixel font
  stack, and the screen-tile panel treatment.
- **FR-051**: The routine card, the layer controls, and the visible Back control MUST
  work with a keyboard and MUST carry a spoken name for screen-reader users.

#### Scope control

- **FR-052**: This feature MUST NOT implement the wider Train, Study, and Create
  refactor, and MUST NOT refactor unrelated audio, theory, Guitar Pro, drum, exercise,
  or workbook internals.

### Key Entities *(include if feature involves data)*

- **Routine**: A named practice plan. It holds an identifier, a name, an optional
  description, an ordered session list, a current-session bookmark, a creation time, and
  a last-change time. Home sorts on the last-change time. Each routine is independent of
  every other routine.
- **Routine session**: One step inside a routine. It holds an identifier, a name, notes,
  workbook references, a metronome configuration, a completion flag, and an inert target
  duration value.
- **Workbook reference**: A link from a session to a stored workbook. The workbook holds
  the exercises and the study companions that the deeper layers show.
- **Study companion reference**: A link to a companion panel that a workbook holds. The
  session reaches it through its workbooks.
- **Routine export file**: A portable file that carries the application field, the kind
  field, the version field, the routine list, and the referenced workbooks. Its shape
  does not change in this feature.
- **Routine route state**: The selected routine, session, workbook, and exercise or
  study companion identifiers that the address carries. The routine navigation
  controller owns it and keeps it in step with the visible layer stack.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A player reaches any stored routine from Home with one action.
- **SC-002**: The number of routine cards on Home equals the number of stored routines
  for counts of zero, one, three, and fifty.
- **SC-003**: Each routine card names the same session that its own routine records as
  its current session, for all routines on screen at once.
- **SC-004**: Opening one routine changes no stored value in any other routine, measured
  by a before-and-after comparison of the stored routine data.
- **SC-005**: Zero genre controls appear on Home and in Settings, and the app performs
  zero reads of genre profile data during boot.
- **SC-006**: Zero countdown displays and zero elapsed-time displays appear anywhere in
  the routine flow.
- **SC-007**: A routine export from the earlier version imports and exports again with
  an unchanged routine payload, including the session target duration values.
- **SC-008**: Back moves up exactly one layer in 100 percent of layer transitions, for
  both the visible Musi Back control and the browser Back control.
- **SC-009**: From a layer at depth N, exactly N Back presses reach Home, and further
  presses cause no navigation loop.
- **SC-010**: A parent layer reappears at the scroll position it had when the child
  layer opened.
- **SC-011**: A direct deep address rebuilds the correct layer stack, and one Back press
  reaches the parent layer.
- **SC-012**: An address with an invalid child identifier shows the deepest valid parent
  layer and keeps the app usable.
- **SC-013**: Boot, Home, Settings, and Study Lab produce zero runtime errors in the
  browser error log.
- **SC-014**: Every routine, session, completion flag, workbook link, and study
  companion link that existed before the change still exists after the change.
- **SC-015**: A keyboard user opens a routine card, moves one layer deeper, and returns
  to the parent layer with keys alone.
- **SC-016**: The new routine surfaces use the shared theme colours and the shared pixel
  fonts, with zero new colour values and zero new font families.

## Assumptions

- Musi already stores the current-session bookmark on each routine, and it holds no
  application-level active-routine value. The requirement is therefore to avoid adding
  one, not to remove one.
- The routine flow already treats the session target duration as data only. It shows
  that value in one input labelled "Target duration (min)". This feature removes that
  input and keeps the stored value.
- The routine flow has no start-session control, no end-session control, and no session
  clock today. The requirements above therefore confirm absence and prevent a
  reintroduction.
- The Metronome tool clock, the Practice Timer tool, and the Interval Map session
  control are separate tools. They stay unchanged, because they are not part of the
  routine flow.
- Modules that no module imports are dead code. This feature does not need to delete
  them, because the running product never loads them.
- Study companions belong to workbooks today. A companion layer under a session
  therefore resolves the companion through the workbooks that the session references.
  When the companion does not resolve, the app shows the session layer with a
  non-blocking message.
- The secondary "Browse tools" action reuses the tool catalog surface that already
  exists. This feature does not add a new tool browser.
- The app keeps its current address-fragment shell. Routine identifiers travel as
  fragment parameters, because no full path router exists.
- Genre profile data stays in local storage as inert data. Cloud sync and device sync
  continue to carry unknown stored keys without an error.
- Study Lab keeps its study catalog and its walkthrough. It selects a default study
  instead of a recommended study.
- The repository has no test framework. New coverage follows the existing pattern of
  plain Node runner scripts under `tests/`, and it uses the existing storage and
  document stubs.
- The repository has no build step, so the change ships as static files. The service
  worker cache name needs a bump when file names change, so players receive the new
  files.
- Musi uses sequential feature numbering, so this feature directory is
  `specs/001-routine-first-declutter`.
- `research-inventory.md` in this directory records the verified state of the current
  code. It is background input for planning and it is not part of these requirements.

## Out of Scope

- The full Train, Study, and Create navigation refactor.
- A redesign of Study Lab, workbooks, exercises, or companions.
- Changes to audio, theory, Guitar Pro, drum, exercise, or workbook internals.
- Archive, favorite, pin, schedule, pagination, or filter behavior for routines.
- A destructive storage migration that deletes old genre values.
- Any backend, database, or network service.

## Dependencies

- The existing routine store, which owns routine data, routine statistics, and routine
  import and export.
- The existing workbook store, which owns workbooks, exercises, and study companions.
- The existing application shell, which owns section navigation, address-fragment
  routing, and history handling.
- The existing tool catalog, which owns tool metadata and feature visibility.
- The existing settings store, which owns the musical context, the volume, the sync
  scopes, and the feature flags.
