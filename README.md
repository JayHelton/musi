# Musi

Musi is an installable music theory and practice app for musicians who want one
fast place to learn, drill, hear, create, and analyze musical ideas. It combines
interactive education, browser-native audio tools, guitar-focused workflows, and
creative generators in a lightweight progressive web app.

The product goal is simple: make the practice room feel like a modern creative
workbench. Open Musi, pick what you want to sharpen, and move from theory to
sound without switching apps, installing plug-ins, or waiting on a backend.

## What Musi does

Musi is organized around four persistent destinations — **Home, Train, Study,
Create** — plus **Settings** in the application menu. Metronome, practice timer,
tuner, keyboard, recorder, loop controls, and the music inspector are contextual
utilities: they ride along with practice or appear in utility drawers, not as top-level
destinations.

### Home

- Objective cards for Train, Study, and Create with continue actions and quick stats.
- Resume pointers for active routines, Study Lab paths, and recent projects.
- Study recommendations and due-review summaries when applicable.

### Train

**Today** — active practice session cockpit, free practice, routine session launch,
manual attempt logging, and the persistent Practice Bar (metronome, timer, loop,
transport, session notes).

**Plans** — routines and ordered sessions (`Routine → Sessions → Workbooks →
Exercises`).

**Library** — exercises (tabs, PDFs, images, audio, video, links), workbooks,
Guitar Pro scores with practice player, drum patterns, and attachment media.

**Fundamentals** — grouped drills:

- **Theory Recall** — scale spelling quiz (seven diatonic modes, randomized roots,
  scoring, streaks, hints) and interval quiz (target notes from interval prompts in
  the shared musical context, easy/medium/hard).
- **Sight Reading** — treble and bass staff reading with instant feedback and score
  tracking.
- **Fretboard Drill** — interval recognition across guitar tunings including Standard,
  Drop D, Half Step Down, Drop C, Open G, Open D, and DADGAD (full catalog in
  `js/tunings.js`).
- **Harmony Practice** — chord workout drills.
- **Ear and Pitch** — vocal trainer (confidence-gated microphone pitch detection
  with note, frequency, and cents; configurable scale-segment playback at context
  tempo), Pitch runner (scrolling pitch game with piano-roll ladder, live trace,
  optional metronome and melody guide, score/combo/accuracy), ear trainer (identify
  notes in the shared key and scale with replay and streaks), and tuner panel.
- **Rhythm** — timing drills with metronome integration.

**Progress** — practice attempts, tempo history, mastery status, and due cold tests
(48-hour and 7-day gates).

### Study

**Learn** — Study Lab paths with genre-aware recommendations and concept progress.

**Explore** — reference surfaces driven by the shared music context:

- **Scales and Modes** — browse 27 scale and mode families with step patterns,
  intervals, semitone maps, key signatures, diatonic chords, and guitar-friendly
  three-notes-per-string layouts.
- **Harmony** — chord reference, triads, and circle of fifths.
- **Fretboard Map** — Interval Orbit: root-centered interval mapping with orbit
  sizes, find/identify/complete/formula drills, preset and custom progression
  improv loops, and session history.

**Review** — due concepts, recorded misses, and retention quizzes with the contextual
music inspector.

Every studied concept offers actions such as Practice this, Quiz this, Map on
fretboard, Hear it, Use in a progression, and Add to a routine or workbook.

### Create

**Projects** — songs and ideas with lyrics, recordings, notes, harmony progressions,
linked drum patterns, and attached practice material (songwriter workspace).

**Capture** — voice recorder: record vocal ideas, monitor live pitch, play back takes,
download audio, view detected notes, estimate key from pitch-class analysis, and map
a sung riff to guitar tab for the Guitar Pro player.

**Compose** — chord builder (select notes and octaves, hear voicings, analyze quality),
playable keyboard/drone panel, beat builder (drum machine patterns), and Import Melody
(beta transcription from audio via Track → Sheet).

### Settings (application menu)

Music preferences, enabled-feature toggles (legacy compatibility), global volume,
and device sync: export/import library bundles, settings JSON, and QR beam/receive
for smaller payloads.

### Routes

Canonical hash routes:

```text
#home
#train  #train/today  #train/plans  #train/library  #train/fundamentals  #train/progress
#study  #study/learn  #study/explore  #study/review
#create #create/projects #create/capture #create/compose
#settings
```

Subviews use query parameters, for example `#train/fundamentals?drill=scales`,
`#train/library?type=workbook&id=<id>`, `#study/explore?view=fretboard`,
`#create/projects?id=<id>&view=lyrics`, and `#train?panel=practice` for the
practice utility panel.

Legacy bookmarks (`#scales`, `#intervalorbit`, `#songwriter`, hub aliases, and the
full table in `js/routes.js`) still resolve and are normalized with
`history.replaceState` so Back does not trap on old links.

## Why it is useful

Musi bridges the gap between a theory worksheet and a creative instrument:

- **For students:** focused drills reinforce scales, intervals, notation, ear
  training, and fretboard fluency.
- **For singers:** live pitch feedback turns the browser into a reference tuner,
  recorder, and intonation coach.
- **For guitarists:** alternate tunings, tab rendering, 3-NPS references, Guitar Pro
  playback, and fretboard prompts keep theory connected to the instrument.
- **For songwriters:** projects, chord tools, beats, melody import, and capture
  make it easy to sketch and iterate on musical ideas.
- **For teachers:** the app offers quick, visual exercises that can be opened on
  any modern browser or installed as a standalone PWA.

## Technical highlights

- **Progressive web app:** `manifest.webmanifest` and `service-worker.js` make
  Musi installable and offline-capable with an app-shell cache; objective workspaces
  lazy-load after first use.
- **Static-first architecture:** the web app is plain HTML, CSS, and ES modules;
  no server, build step, or client framework is required.
- **Browser-native audio:** Web Audio powers synthesis, metronome scheduling,
  keyboard drones, riff playback, backing chords, analyzers, and dynamic
  compression.
- **Microphone workflows:** MediaRecorder and analyser nodes support vocal pitch
  tracking, recording, playback analysis, and downloadable takes.
- **Shared theory engine:** reusable modules handle note parsing, enharmonic
  spelling, scale definitions, intervals, tunings, and frequency-to-note mapping.
- **Shared music context:** instrument, tuning, key, scale, tempo, and meter persist
  across Train, Study, and Create with routine/project overrides.
- **Persistent preferences:** local storage remembers user selections and tool
  settings without requiring accounts or cloud sync.
- **Responsive interface:** bottom dock (mobile) and top nav (desktop) show exactly
  Home, Train, Study, and Create with 44px touch targets.
- **CLI companion:** the `cli/` package exposes terminal versions of core quiz
  and training activities using the same theory data as the web app.

## Project layout

```text
.
+-- index.html              # App shell and feature sections
+-- css/                    # Modular styles by feature area
+-- js/                     # ES modules for theory, tools, trainers, and audio
+-- icons/                  # PWA icons
+-- manifest.webmanifest    # Install metadata
+-- service-worker.js       # Offline app-shell cache
+-- cli/                    # Node CLI companion
```

## Run locally

Because Musi uses ES modules and a service worker, run it from a local static
server instead of opening `index.html` directly:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

For the CLI:

```bash
cd cli
node bin/musi.js
```

## Development and testing

Ad-hoc Node runners live under `tests/<suite>/run.mjs` (no framework, no build step).
Run any suite with:

```bash
node tests/<suite>/run.mjs
```

Refactor and core suites:

- `routes` — route parsing and legacy alias normalization
- `shell` — shell markup, registry/adapters, service-worker precache (Node)
- `characterization` — storage keys, routine export compatibility, legacy data
- `music-context` — shared context persistence and overrides
- `progress` — progress log and library facade
- `practice` — practice session lifecycle and clock
- `train` — Train workspace and Practice Bar
- `study-workspace` — Study workspace and music inspector
- `create` — projects, notes adapters, migrations
- `settings` — Settings workspace

Feature and integration suites:

- `routines`, `workbooks`, `exercises`, `interval-map`, `study-lab`, `study-recs`
- `companions`, `qr`, `gp-player`, `track-to-sheet`
- `sync` — `tests/sync/bundle.mjs`, `profile.mjs`, `frames.mjs`, `zip.mjs`, and
  `tests/sync/run-browser.mjs` (browser, static server required)

Browser regression (headless Chrome over CDP):

```bash
python3 -m http.server 8080   # from repo root — required
node tests/shell/run-browser.mjs
```

The browser suite exits non-zero if the static server is not reachable.

## Deploy

Musi can be deployed anywhere that serves static files, including GitHub Pages,
Netlify, Vercel static output, S3, or a basic web server. The service worker is
written with relative paths so the app can run from a domain root or a sub-path.

## Purpose

Musi is designed to make music theory practical, audible, and creative. It gives
learners the repetition they need, gives players immediate sound and visual
feedback, and gives creators a compact sketchpad for ideas - all from a fast,
installable web app.
