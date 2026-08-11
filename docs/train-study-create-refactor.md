# Train / Study / Create refactor — implementation contract

Authoritative contract for the navigation refactor. Every agent working on this
refactor must follow the interfaces below exactly so parallel work composes.

Product rule: **a capability becomes a persistent destination only when it
represents a user objective.** Everything else is a view, component, renderer,
panel, or contextual action inside Train, Study, or Create.

## 1. Ground rules

- Static, frontend-only PWA. No build step, no framework, no new dependencies.
- Plain ES modules under `js/`, plain CSS under `css/`.
- Atomic Purple Game Boy Color theme (`css/base.css` + `css/theme-gbc.css`
  tokens). Never introduce generic dark-dashboard styling or hard-coded
  `#0a0a0a`-style colors.
- Never delete or rewrite stored user records. Add adapters; migrate forward
  only, idempotently, keeping the original readable.
- Do not rewrite music-theory code, the Guitar Pro parser, or feature internals.
  This refactor changes **ownership, navigation, and composition**.
- Keep every existing `#sec-*` element id and every feature module's public
  `init*` / `stop*` function working.

## 2. Destinations and routes

Persistent destinations: **Home, Train, Study, Create**. `Settings` is reachable
from the application menu only. Everything else is a view, panel or action.

Canonical hash routes:

```
#home
#train  #train/today  #train/plans  #train/library  #train/fundamentals  #train/progress
#study  #study/learn  #study/explore  #study/review
#create #create/projects #create/capture #create/compose
#settings
```

Subviews use query parameters, e.g. `#train/fundamentals?drill=intervals`,
`#train/library?type=workbook&id=<id>`, `#study/explore?view=fretboard`,
`#create/projects?id=<id>&view=lyrics`.

Legacy hashes must keep working and are normalized with `history.replaceState`
(no extra back-stack entry). Full alias table lives in `js/routes.js`.

## 3. Module map

| Module | Responsibility |
| --- | --- |
| `js/routes.js` | Pure route data: objectives, views, legacy alias table, parse/format/resolve. No DOM. |
| `js/featureRegistry.js` | Feature metadata: id, owner objective, kind, canonical route, legacy routes, section id, lazy `load()`. |
| `js/featureAdapters.js` | Lazy mount/stop of legacy feature modules (dynamic `import()`), teardown bookkeeping. |
| `js/router.js` | Hash routing, legacy normalization, history, route subscriptions. |
| `js/workspaceLoader.js` | Lazy-loads and mounts one objective workspace at a time. |
| `js/workspaces/legacyHost.js` | Adopts/releases legacy `#sec-*` elements into workspace view containers. |
| `js/workspaces/{home,train,study,create,settings}.js` | Objective workspaces. |
| `js/core/musicContext.js` | Shared instrument/tuning/key/scale/tempo/meter context with overrides. |
| `js/core/musicInspector.js` | Contextual info + actions for a selected note/concept. |
| `js/practice/practiceSession.js` | One practice session: clock, metronome, loop, active item, attempts. |
| `js/ui/practiceBar.js` | Persistent Train transport bar bound to the practice session. |
| `js/progress/progressLog.js` | Practice attempts, mastery status, cold-test scheduling. |
| `js/library/libraryService.js` | Typed facade over exercises / workbooks / routines / scores / media. |
| `js/create/projectModel.js` | `MusicProject` records + songwriter/notes adapters. |
| `js/migrations/index.js` | Versioned, idempotent, non-destructive migrations. |

## 4. Interfaces

### 4.1 `js/routes.js`

```js
export const OBJECTIVES;            // [{ id, label, route, views: [...] }] for home/train/study/create
export const VIEWS;                 // { train: ['today', ...], study: [...], create: [...] }
export const LEGACY_ROUTES;         // { scales: '#train/fundamentals?drill=scales', ... }

export function parseRoute(hash);   // '#train/library?type=workbook' -> { objective, view, params, hash }
export function formatRoute(route); // { objective, view, params } -> '#train/library?type=workbook'
export function resolveHash(hash);  // -> { route, canonicalHash, redirected: boolean }
export function isSameView(a, b);   // same objective+view (params may differ)
export function withParams(route, patch); // -> new route object
```

`parseRoute` must be total: unknown input resolves to the Home route with
`route.unknown === true` so the shell can show a non-blocking message.

### 4.2 `js/featureRegistry.js`

```js
export const FEATURES = [
  {
    id: 'intervalorbit',
    owner: 'study',                 // 'train' | 'study' | 'create' | 'app' | 'utility'
    kind: 'screen',                 // 'screen' | 'panel' | 'renderer' | 'drill' | 'utility'
    label: 'Interval Map',
    sectionId: 'sec-intervalorbit',
    canonicalRoute: '#study/explore?view=fretboard',
    legacyRoutes: ['#intervalorbit', '#intervalmap'],
    capabilities: ['music-context', 'practice-action', 'audio'],
  },
];
export function getFeature(id);
export function featuresByOwner(owner);
```

Enabled-feature preferences must **not** gate navigation any more.

### 4.3 `js/featureAdapters.js`

```js
export async function mountFeature(id);        // dynamic import + init, idempotent
export function stopFeature(id);               // no-op when never loaded
export function stopFeaturesExcept(keepIds);   // teardown on navigation
export function isFeatureLoaded(id);
```

Each adapter entry: `{ load: () => import('./x.js'), init: (m) => m.initX(), stop: (m) => m.stopX() }`.
`stopFeature` must never import a module that was not already loaded.

### 4.4 `js/router.js`

```js
export function initRouter({ onRoute });  // wires hashchange/popstate, applies legacy normalization
export function navigate(target, { replace = false } = {}); // hash string or route object
export function setParams(patch, { replace = true } = {});  // stay on view, change params
export function currentRoute();
export function onRouteChange(fn);        // -> unsubscribe
```

Rules: forward navigation pushes one entry; legacy normalization and param
updates use `replaceState`; `popstate` never pushes; browser Back must walk
Home → objective → view → item without loops; an open utility panel closes on
Back instead of trapping it.

### 4.5 Workspace contract

```js
// js/workspaces/<objective>.js
export async function mount(container, route); // first entry into the objective
export async function update(route);           // navigation within the same objective
export function unmount();                     // leaving the objective
```

`workspaceLoader` caches module promises, calls `mount` once, `update` for
same-objective navigation, and `unmount` when leaving. Workspaces own their view
tab bar and render into `container` (`#workspace-root`).

### 4.6 `js/workspaces/legacyHost.js`

```js
export function adoptSection(sectionId, host);  // move #sec-* into host, mark active
export function releaseSection(sectionId);      // move back to <main>, deactivate
export function releaseAllExcept(sectionIds);
export function adoptedSections();
```

Legacy sections stay in `index.html`; workspaces borrow them. Feature modules
keep querying their own element ids, so nothing inside a feature changes.

### 4.7 `js/core/musicContext.js`

```js
// state: { instrument, tuningId, root, scaleId, modeId, keySignaturePreference, tempoBpm, meter }
export function getMusicContext();
export function setMusicContext(patch, source);   // persists stable defaults
export function pushOverride(id, patch);          // routine session / project scope
export function popOverride(id);
export function subscribeMusicContext(fn);        // -> unsubscribe
export function resetOverrides();
```

`root`, `scaleId` and `tempoBpm` stay bidirectionally synced with the existing
`js/musicalContext.js` (`context.*` settings keys) — that module remains the
storage for those three values. New fields persist under `context.instrument`,
`context.tuningId`, `context.mode`, `context.accidentals`, `context.meter`.
Overrides never overwrite the persisted defaults.

### 4.8 `js/practice/practiceSession.js`

```js
// state: { id, sourceType, sourceId, startedAt, elapsedMs, timerTargetMs, metronome,
//          loop, activeItemId, attemptIds, notes, status }
export function startSession({ sourceType, sourceId, items, timerTargetMs, metronome });
export function getSession();
export function endSession();                 // stops audio, flushes attempts
export function pauseSession(); resumeSession();
export function setActiveItem(itemId);
export function nextItem(); previousItem(); restartItem();
export function setMetronome(patch);          // bpm, subdivision, accents, playing
export function toggleMetronome();
export function setLoop(loop);
export function setNotes(text);
export function recordAttempt(partial);       // -> attempt id, delegates to progressLog
export function subscribeSession(fn);         // -> unsubscribe
export function restoreSession();             // recover an interrupted local session
```

One metronome only: the session drives `js/metronome.js`. No feature may start a
second global metronome while a session owns it. Audio must stop on
`endSession()` and must **not** stop during compatible navigation inside Train.
The module must import cleanly in Node (guard `document` / `window` / audio
access behind runtime checks) so it can be unit tested.

### 4.9 `js/ui/practiceBar.js`

```js
export function mountPracticeBar(host);  // -> { destroy, update }
export function isPracticeBarMounted();
```

Controls: play/pause metronome, BPM, subdivision, elapsed + countdown, loop
state (when supported), record take, previous / restart / next item, session
notes, end session. The bar is bounded: it must not push primary content below
the viewport (sticky region + bounded content area, 44px touch targets, visible
focus states).

### 4.10 `js/progress/progressLog.js`

```js
// attempt: { id, targetType, targetId, startedAt, durationMs, bpm, accuracy,
//            cleanTake, effort, status, notes }
export function logAttempt(attempt);        // -> normalized record
export function listAttempts(filter);
export function getTargetSummary(targetType, targetId);
export function dueColdTests(now);          // 48-hour and 7-day gates
export function recordStudyMiss(conceptId, detail);
export function dueStudyReviews(now);
```

Storage: `musi.progressLog` (`{ version: 1, attempts: [] }`), bounded size.
Status values stay `red | yellow | green | blue | null`.

### 4.11 `js/library/libraryService.js`

```js
// ref: { type: 'exercise'|'workbook'|'routine'|'score'|'audio'|'video'|'image'|'pdf'|'link'|'project', id }
export function listLibrary(filter);
export function getItem(ref);
export function resolveRefs(refs);
export function describeRef(ref);
```

A read facade over the existing stores. Do **not** merge stores in this release.

## 5. Feature ownership

| Feature id | Owner | Surface |
| --- | --- | --- |
| `scales`, `intervals` | Train | Fundamentals › Theory Recall |
| `sightreading` | Train | Fundamentals › Sight Reading |
| `fretboard` | Train | Fundamentals › Fretboard Drill |
| `chordlab` | Train | Fundamentals › Harmony Practice |
| `tuner` | Train + utility | Fundamentals › Ear and Pitch; tuner panel |
| `ear` | Train | Fundamentals › Ear and Pitch |
| `timing` | Train | Fundamentals › Rhythm |
| `exercises`, `workbooks` | Train | Library |
| `routines` | Train | Plans |
| `drums` | Train + Create | Train Library/practice; Create Beat Builder |
| `gpplayer` | Train renderer | Library item player / session player |
| `intervalorbit` | Study | Explore › Fretboard |
| `scaleref` | Study | Explore › Scales and Modes |
| `chords` | Study + Create | Explore › Harmony; Compose › Chord Builder |
| `triads`, `circle` | Study | Explore › Harmony |
| `studylab` | Study | Learn |
| `recorder` | Create + utility | Capture; Practice Bar record action |
| `songwriter` | Create | Projects |
| `notes` | contextual | Project/session/exercise/study note panels + Create inbox |
| `tracktosheet` | Create | Compose › Import Melody (Beta) |
| `keyboard` | utility | Study/Create utility drawer, Compose panel |
| `metronome`, `practice` | utility | Practice Bar |
| `musicprefs` | app | Application menu › Settings |

## 6. Workspace views

**Train** — Today (active session, next item, free practice), Plans (routines and
ordered sessions), Library (exercises, workbooks, scores, drums, media),
Fundamentals (drills by `?drill=`), Progress (attempts, tempo history, mastery,
due cold tests).

**Study** — Learn (Study Lab paths), Explore (`?view=` scales | chords | triads |
circle | fretboard), Review (due concepts, misses, retention). Every concept
offers: Practice this, Quiz this, Map on fretboard, Hear it, Use in a
progression, Add to a routine or workbook.

**Create** — Projects (songs/ideas with lyrics, recordings, notes, harmony,
beats, linked practice material), Capture (record/import, analyze, classify,
attach), Compose (chord builder, progressions, keyboard/drone, melody import,
beats).

The practice hierarchy stays explicit and unchanged:
`Routine → ordered Sessions → Workbooks → ordered Exercises → source material`.
Warm-ups are exercises inside applicable sessions; never generate a separate
warm-up session.

## 7. Persistence and migration

- Existing keys stay authoritative: `musi:settings`, `musi.exercises`,
  `musi.workbooks`, `musi.routines`, `musi.notes`, `musi.songs`,
  `musi.gpAnnotations`, IndexedDB `musi-attachments` / `musi-drums`.
- New keys: `musi.projects`, `musi.progressLog`, and settings key
  `migrations.version` plus `migrations.log`.
- Migrations are idempotent, versioned, and back up affected records before
  transforming. On failure: keep originals, continue through the compatibility
  adapter, show a non-blocking local error, allow export.
- Routine import/export (`kind: 'musi-routines'`, `version: 1`) must stay
  byte-compatible.
- `features.enabled` may no longer hide Home, Train, Study, Create or Settings.

## 8. Offline and performance

- Home and the shell work offline; objective chunks cache after first use.
- Home must not import Train, Study or Create modules until needed.
- `service-worker.js` enumerates precache URLs explicitly — every new JS/CSS file
  must be added there and `CACHE_VERSION` bumped.
- Do not delay Home on audio init, microphone permission, or library scanning.

## 9. Accessibility and responsive behavior

- Bottom nav (mobile) and top-level nav (desktop) both show exactly Home, Train,
  Study, Create.
- Text labels on all main actions; 44×44 CSS px touch targets; keyboard-accessible
  drawers; visible focus states on transport controls.
- Bounded score and fretboard regions never move persistent controls.
- Test 360×800 portrait, mobile landscape, 768 tablet, 1366×768, ultrawide.

## 10. Testing

Ad-hoc Node runners under `tests/<suite>/run.mjs`, `node:assert/strict`, no
framework. Reuse `tests/gp-player/domShim.mjs` and `tests/exercises/idbShim.mjs`.
Browser smoke tests drive headless Chrome over CDP like
`tests/sync/run-browser.mjs`.

Required coverage: route parsing and alias normalization, feature registry
validation, music-context overrides and persistence, practice-session lifecycle,
tempo phase transitions, attempt creation, migration idempotency, project and
note adapters, routine import/export compatibility, and a smoke test asserting
every legacy hash resolves to its documented destination.

## Implementation status

Shipped on this branch (derived from current code and test suites). Phases match
the parallel delivery order used during the refactor.

| Phase | Landed | Deferred / not wired |
| --- | --- | --- |
| **0 — Routes and loaders** | `js/routes.js` (objectives, views, `LEGACY_ROUTES`, parse/format/resolve); `js/featureRegistry.js`; `js/router.js`; `js/workspaceLoader.js`; `js/workspaces/legacyHost.js`; `js/featureAdapters.js` with lazy `mountFeature` / `stopFeaturesExcept`. Tests: `tests/routes/run.mjs`, `tests/shell/run.mjs` (registry/adapters). | — |
| **1 — Shell and Home** | Four-destination dock + app menu; `#workspace-root`; lazy Home (`js/workspaces/home.js`); boot splash; `main.js` bootstrap with `showSection` / `showHub` / `navigateLegacy` shims; removed hub/split/tool-catalog markup (see `tests/shell/regressions.mjs`). | `features.enabled` storage and toggles kept for compatibility (`js/tools.js`, Settings). |
| **2 — Train workspace** | `js/workspaces/train.js` — Today, Plans, Library (exercises, workbooks, scores/GP player, drums), Fundamentals drills, Progress; routine session item expansion; manual attempt log on Today. Tests: `tests/train/run.mjs`. | Fundamentals drill modules still write quiz stats via `js/stats.js` only — they do not auto-call `progressLog.logAttempt`. |
| **3 — Practice and library** | `js/practice/practiceSession.js` (single metronome owner, session restore); `js/ui/practiceBar.js`; `js/progress/progressLog.js`; `js/library/libraryService.js` facade over exercises/workbooks/routines/scores/media. Tests: `tests/practice/run.mjs`, `tests/progress/run.mjs`. | `libraryService.listLibrary()` has an empty `project` branch — `listProjectLibraryItems()` in `projectModel.js` is not wired. |
| **4 — Study workspace** | `js/workspaces/study.js` — Learn (Study Lab), Explore (scales, harmony, fretboard map), Review; `js/core/musicContext.js`; contextual `js/core/musicInspector.js` with study actions. Tests: `tests/study-workspace/run.mjs`, `tests/music-context/run.mjs`, `tests/study-lab/run.mjs`, `tests/study-recs/run.mjs`. | Inspector is context-driven (route/concept selection), not click-to-inspect on the fretboard. |
| **5 — Create workspace** | `js/workspaces/create.js` — Projects (songwriter + project tabs), Capture (recorder), Compose (chords, keyboard, beats, import melody); `js/create/projectModel.js` with song/notes adapters. Tests: `tests/create/run.mjs`, `tests/track-to-sheet/run.mjs`. | Legacy `#sec-backing` / `#sec-riff` sections remain in `index.html` but are not adopted by any workspace (`initBacking` / `initRiff` never imported). |
| **6 — Migrations, Settings, regression** | `js/migrations/index.js` (versions 1–4: projects-from-songs, notes-inbox, practice-defaults, progress-seed); `js/workspaces/settings.js`; characterization and browser suites. Tests: `tests/characterization/run.mjs`, `tests/settings/run.mjs`, `tests/shell/run-browser.mjs`. | Cloud sync modules remain local-only export/import/QR — no network sync in this release. |
