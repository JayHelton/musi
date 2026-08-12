# Research: current code state for Routine-First Declutter

**Created**: 2026-08-12

**Status**: Background input for planning. This file is not a requirement source.
The requirements live in `spec.md`.

This file records the verified state of the code before the change. Two exploration
passes produced it, and direct searches confirmed the load-bearing facts. Symbol names
and user-visible strings appear verbatim. File paths carry no line numbers, because
line numbers age quickly.

## 1. Corrections to the handoff assumptions

The original handoff made five assumptions that the code does not match. Planning must
account for them.

| Handoff assumption | Verified state |
| --- | --- |
| Remove an application-level `activeRoutineId`. | The identifier `activeRoutineId` does not exist anywhere in the repository. Each routine already owns `activeSessionId`. No removal work exists. |
| Remove Start Session, End Session, countdown, and elapsed time from the routine flow. | The routine flow has none of these. `Start Session` appears only in `js/curriculum.js`, which no module imports, and in `js/interval-map/ui.js`, which is a separate trainer. |
| `durationMin` needs protection from a timer. | `durationMin` is already stored data only. The routine session pane shows it in one input labelled `Target duration (min)`. That input is the only display to remove. |
| Genre removal touches about eight files. | The genre system spans five dedicated modules plus Home, Settings, Study Lab, sync, cloud, the service worker, and one test suite. Section 3 lists them. |
| The routine flow opens study companions. | Study companions belong to workbooks, not to sessions. A session reaches a companion only through a workbook. |

## 2. Home and routines today

### Home

`js/home.js` exports `initHome`, `refreshHome`, and `renderHub`. It renders these
blocks, and `index.html` holds their mount points.

| Block | Mount point | Renderer | Notable verbatim strings |
| --- | --- | --- | --- |
| Pocket theory hero | `#gbc-hero` | `wireHero` | `musi`, `Pocket theory console`, `Start practice`, `Start study`, `Continue`, `Browse tools` |
| Continue card | `#home-continue` | `renderContinue` | `Continue` |
| Quick Start | `#home-quickstart` | `renderQuickStart` | `Quick Start` |
| Recommended Study | `#home-study-rec` | `renderStudyRec` | `Recommended Study`, `Set your genre profile`, `Try foundation study`, `No study matches current filters`, `Mark reviewed`, `Adjust profile` |
| Training stats | `#home-stats` | `renderStats` in `js/stats.js` | The container carries the HTML `hidden` attribute, and no code removes it. |
| Categories | `#home-categories` | `renderCategories` | `Categories`, `Train`, `Reference`, `Create`, `Tools` |
| All tools catalog | `#home-all-panel` | `renderAllTools` | `All tools`, `Search tools…` |

The hero string `Continue Study` does not exist. The hero uses `Continue`,
`Start study`, or `Start practice`. The hero action `Browse tools` opens
`#home-all-panel` and focuses its search field, so a replacement destination is needed
once Home drops that panel. The category hubs `hub-train`, `hub-reference`,
`hub-create`, and `hub-tools` stay routable, and `renderHub` still renders them.

### Routine data and store

`js/routineModel.js` owns the data. `js/routines.js` owns the UI.
`js/routineMetronome.js` owns the per-session metronome. There is no `js/routines/`
directory.

- Storage key: `musi.routines`, holding `{ "routines": [ ... ] }`.
- Routine fields: `id`, `name`, `description`, `sessions`, `activeSessionId`,
  `createdAt`, `updatedAt`.
- Session fields: `id`, `name`, `notes`, `workbookIds`, `durationMin`, `metronome`,
  `completed`.
- Session metronome fields: `bpm`, `beats`, `subdiv`, `accentFirst`.
- Export constants: `ROUTINE_EXPORT_KIND` is `musi-routines`, and
  `ROUTINE_EXPORT_VERSION` is `1`.
- Export envelope: `app`, `kind`, `version`, `createdAt`, `routines`, `workbooks`.
- Study companions travel inside the exported `workbooks` entries.

Useful existing exports for the Home dashboard: `listRoutines`, `getRoutine`,
`getRoutineStats`, `getActiveRoutineSession`, `createRoutine`, `buildRoutineExport`,
`applyRoutineImport`, `validateRoutineExport`, `setActiveRoutineSession`,
`setRoutineSessionCompleted`, `reconcileRoutineActiveSession`.

Import always resets `activeSessionId` to `null` on an imported routine.

`listRoutines()` sorts by `updatedAt` descending and adds no second key. Home therefore
needs its own `name` tiebreak for FR-005.

### Routine navigation today

`js/main.js` calls `showSection(id)`, which toggles the `active` class on a section. It
does not unmount sections. Leaving `#routines` calls `stopRoutines()`.

Inside the routines section, `js/routines.js` keeps a sidebar and a session pane in one
section:

- The sidebar sets `selectedRoutineId`.
- `openSession(routineId, sessionId)` sets `openSessionId`, calls
  `setActiveRoutineSession`, and shows `#rt-session-pane`.
- `closeSessionPane` hides the pane.
- The visible back control is `#rt-session-back`, labelled `← Sessions`.
- `wireEscape` maps the Escape key to the same close action.

A workbook opens through `requestWorkbookOpen(wbId)` plus `navigateToWorkbooks()`, which
switches to the separate `workbooks` section. That switch loses the routine context, so
the stacked navigation work must replace this hop. Workbook detail mounts companions
through `mountCompanions` and `mountWorkbookCompanionPanel`. The workbook back control
is `#wb-detail-back`, labelled `← Workbooks`, and it calls `closeWorkbookDetail()`
without any history call.

### Routing and history today

`js/main.js` holds the whole router. It uses `history.pushState`,
`history.replaceState`, `popstate`, and `hashchange`, with the state shape
`{ musiNav: id }` and the counters `navPushCount` and `applyingHistory`.

- Home maps to a URL with no fragment. Every other section maps to `#<id>`.
- Valid targets: `home`, the four `hub-*` ids, and every enabled tool id.
- Aliases: `intervalmap` maps to `intervalorbit`, and `tabanalyzer` maps to `gpplayer`.
- Boot reads `location.hash.replace('#', '')` and treats the result as a plain section
  id.

No helper parses fragment parameters. There is no `parseHash` helper and no
`hashParam` helper. The stacked navigation work must add that parsing.

Tool sections receive a `.tool-back` control labelled `← {category label}`, which calls
`goBack(() => showHub(tool.category))`. `js/screenUx.js` provides `ensureBackButton`.

## 3. Genre-learning inventory

### Dedicated modules

| File | Role |
| --- | --- |
| `js/genreProfiles.js` | Genre catalog, concept tags, priority weights, learning goals |
| `js/musicProfile.js` | Persisted genre profile and its mutators |
| `js/studyRecommendations.js` | Scoring engine and recommendation API |
| `js/studyCatalog.js` | Study templates with concept tags and categories |
| `js/studyProgress.js` | Concept review history and recent-study history |

### Import graph

| Module | Consumers |
| --- | --- |
| `js/genreProfiles.js` | `js/musicProfile.js`, `js/musicPreferences.js`, `js/studyRecommendations.js`, `tests/study-recs/run.mjs` |
| `js/musicProfile.js` | `js/musicPreferences.js`, `js/studyRecommendations.js`, `js/home.js` |
| `js/studyRecommendations.js` | `js/musicPreferences.js`, `js/home.js`, `js/studyLab.js`, `tests/study-recs/run.mjs` |
| `js/studyCatalog.js` | `js/studyRecommendations.js`, `js/musicPreferences.js`, `js/studyLab.js`, two test suites |
| `js/studyProgress.js` | `js/studyRecommendations.js` only |

`js/home.js` uses `hasActiveGenres` and `getMusicProfile` from `js/musicProfile.js`, and
`buildRecommendations` and `completeRecommendedStudy` from `js/studyRecommendations.js`.

`js/studyLab.js` uses `beginRecommendedStudy`, `completeRecommendedStudy`, and
`buildRecommendations`. Study Lab therefore keeps `js/studyCatalog.js` and
`js/studyLabModel.js`, and it needs a default study id in place of the recommendation
fallback. The fallback id already present in the code is `major-scale-construction`.

### Settings

`index.html` holds only `#sec-musicprefs` with the empty host `#music-prefs-root`.
`js/musicPreferences.js` builds the whole Settings screen in JavaScript through
`render()`. `js/main.js` calls `initMusicPreferences` at boot and again on navigation to
the `musicprefs` tool.

Genre blocks to remove, with their containers:

| Block | Container | Verbatim heading |
| --- | --- | --- |
| Active profile banner | `.mp-banner` | `Active profile` |
| Genre priorities | `#mp-genre-groups` | `Genre priorities` |
| Learning goals | `#mp-goals` | `Learning goals` |
| Study balance | `#mp-balance` | `Study balance` |
| Application preference | `#mp-apps` | `Application preference` |
| Pause topics | `#mp-exclusions` | `Pause topics` |
| Preview | `#mp-preview` | `Preview` |

Settings blocks to keep: `#mp-context-block`, `#mp-volume-block`, `#mp-sync-block`,
`#mp-cloud-block`, `#mp-library-cleanup`, and the `Features` block at `#mp-features`.
The painters `paintMusicalContext`, `paintVolume`, and `paintDeviceSync` belong to the
blocks that stay.

`js/tools.js` describes the `musicprefs` tool as `Feature visibility, genre priorities,
learning goals, and study recommendation balance.` That description needs a rewrite. No
other tool entry mentions genre.

### Stored keys

All settings share one physical key, `musi:settings`, owned by `js/persistence.js`.
Genre data lives in two logical subkeys.

| Subkey | Owner | Content |
| --- | --- | --- |
| `profile.music` | `js/musicProfile.js` | Genres, goals, balance, applications, exclusions, `influenceNotes`, `onboarded`, `updatedAt` |
| `study.progress` | `js/studyProgress.js` | Concept history, `recentStudies`, `lastPrimaryId`, `lastPrimaryAt` |

There is no separate `pausedTopic` key and no separate `appPreference` key. Paused
topics live in `profile.music.exclusions`, and application preferences live in
`profile.music.applications`. Both stay in storage as inert data.

Keys that must survive: `features.enabled`, `global.volume`, `context.root`,
`context.scale`, `context.tempo`, `context.rootMode`, `context.scaleMode`,
`sync.scopes`, `sync.advancedOpened`, `home.favorites`, `nav.lastTool`,
`nav.lastCategory`, and `sl.tuning`.

`js/musicPreferences.js` fires the event `musi:profile-changed`, and
`js/sync/syncProfile.js` fires it after a settings import. `js/home.js` listens for it.

### Sync, cloud, and service worker

`js/sync/syncProfile.js`, `js/sync/syncUI.js`, `js/cloud/recordMap.js`, and
`js/cloud/reconcile.js` all name `profile.music` or `study.progress`. Their tests are
`tests/sync/profile.mjs`, `tests/cloud/mergeRules.mjs`, and `tests/cloud/recordMap.mjs`.
Import of an older bundle must keep working, so these paths need care rather than a
blind delete. `service-worker.js` precaches the genre modules and the genre stylesheet,
so its file list and its cache name both need an update.

### Stylesheets

`index.html` links `css/study-recs.css` and `css/study-lab.css`.

- `css/study-recs.css` mixes genre selectors (`.home-rec-*`, `.mp-genre-*`,
  `.mp-balance*`, `.mp-preview*`, `.mp-banner*`) with shared Settings selectors
  (`.mp-block`, `.mp-feature-*`, `.mp-cleanup-*`). A plain delete would strip styles
  from the Settings blocks that stay, so the shared rules need a new home first.
- `css/study-lab.css` holds no genre selector. Every rule sits under `#sec-studylab`, so
  it stays.
- `css/theme-gbc.css`, `css/mobile-ux.css`, and `css/ux-shell.css` also carry `home-*`
  selectors, so Home cleanup must check all three.

## 4. Tests

The repository has no test framework. Each area holds plain Node scripts, and a runner
uses `test(name, fn)` with `node:assert/strict`.

| Suite | Command | Focus |
| --- | --- | --- |
| Routines | `node tests/routines/run.mjs` | `js/routineModel.js` |
| Workbooks | `node tests/workbooks/run.mjs` | `js/workbookModel.js` |
| Exercises | `node tests/exercises/run.mjs` | Exercise modules |
| Companions | `node tests/companions/run.mjs` | Companion types and mounting |
| Study Lab | `node tests/study-lab/run.mjs` | `js/studyLabModel.js` |
| Study recommendations | `node tests/study-recs/run.mjs` | Genre scoring. This suite retires with the feature. |
| Cloud | `node tests/cloud/run.mjs` | Sync harness and merge rules |

Three details matter for the genre work:

- `tests/study-recs/run.mjs` imports `js/genreProfiles.js`,
  `js/studyRecommendations.js`, and `js/studyCatalog.js`. It retires with the feature.
- `tests/study-lab/run.mjs` imports no genre module. It calls `intervalsForConcepts`
  from `js/studyLabModel.js`. One test name reads `genre concepts emphasize flat2 /
  tritone`, and that name may need an update, but the assertions survive.
- `tests/sync/profile.mjs` and `tests/cloud/recordMap.mjs` hold `profile.music` and
  `study.progress` inside their fixtures. These two suites define the compatibility
  requirement FR-048, so a blind delete of those sync scopes breaks them.

All seven suites above pass on the current `main` commit. That result is the baseline
for the change.

Available stubs for new Home and navigation tests:

- `tests/cloud/harness.mjs` provides `installLocalStorageShim`, `installWindowShim`,
  `installDocumentShim`, and `resetHarness`.
- `tests/gp-player/domShim.mjs` provides `installDomShim`.
- `tests/exercises/idbShim.mjs` provides an IndexedDB fake.
- `js/routineModel.js` falls back to in-memory storage when `window.localStorage` is
  absent, so `tests/routines/run.mjs` needs no shim today.

## 5. Verification commands

The repository has no lint step, no build step, and no CI. Verification runs by hand.

```bash
# Web app
python3 -m http.server 8080   # then open http://localhost:8080

# CLI smoke test
cd cli && node bin/musi.js --help

# Relevant suites
node tests/routines/run.mjs
node tests/workbooks/run.mjs
node tests/study-lab/run.mjs
node tests/cloud/run.mjs
```

After a change to JavaScript or CSS, do a hard reload, or bump the cache name in
`service-worker.js`.
