# Quickstart: Tool-First Simplification

This guide validates the Tool-First Simplification feature after implementation.
The team ships nine work packages in order.
You run the matching section after each package.
You run the regression suite every time.

## Prerequisites

- Node.js 18 or newer.
- Python 3 for the static HTTP server.
- A desktop browser.
- A phone browser or a phone-sized viewport.
- A Guitar Pro file for the Score Player checks.
- The repository has no build step and no test framework.

## Start the app

1. Open a terminal in the repository root.
2. Run `python3 -m http.server 8080`.
3. Open `http://localhost:8080` in the browser.

The app must run over HTTP.
Direct file access breaks ES modules and the service worker.

After you edit JavaScript or CSS, do a hard reload in the browser.
Or bump `CACHE_VERSION` in `service-worker.js`.
The current value is `v190-routine-sibling-switch-and-phone-layout`.

## Record the baseline

Run each command from the repository root.
Each Node runner must exit with code 0.
`bash tests/supabase/run.sh` must fail in this environment.
It fails because the environment has no PostgreSQL server binaries.

```bash
set -e
node tests/workbooks/run.mjs
node tests/track-to-sheet/run.mjs
node tests/track-to-sheet/panel.mjs
node tests/track-to-sheet/options.mjs
node tests/track-to-sheet/dsp.mjs
node tests/track-to-sheet/accuracy.mjs
node tests/sync/zip.mjs
node tests/sync/profile.mjs
node tests/sync/frames.mjs
node tests/sync/bundle.mjs
node tests/study-lab/run.mjs
node tests/routines/run.mjs
node tests/routine-nav/run.mjs
node tests/qr/run.mjs
node tests/interval-map/run.mjs
node tests/genre-removal/run.mjs
node tests/exercises/run.mjs
node tests/companions/run.mjs
node tests/cloud/run.mjs
node tests/gp-player/wiring.mjs
node tests/gp-player/smoke.mjs
node tests/gp-player/metronome.mjs
node tests/gp-player/metro-click.mjs
node tests/gp-player/loop-playback.mjs
node tests/gp-player/exercise-slice.mjs
node tests/gp-player/exercise-import.mjs
node tests/gp-player/exercise-import-ui.mjs
node tests/gp-player/drum-parsing.mjs
node tests/gp-player/drum-notation.mjs
node tests/routes/run.mjs
node tests/migrations/run.mjs
node tests/shell/run.mjs
node tests/library/run.mjs
node tests/fretboard/run.mjs
node tests/removal-guard/run.mjs
node cli/bin/musi.js --help
node cli/bin/musi.js reference --root C --type "Major (Ionian)"
echo "All Node suites passed."
```

Run `bash tests/supabase/run.sh` separately.
Expect exit code 1 and the message `PostgreSQL server binaries not found`.

## Seed test data

Open the browser developer console on `http://localhost:8080`.
Paste and run each snippet below.
Reload after each snippet unless the snippet reloads for you.

### Notes (five unlinked notes)

```javascript
localStorage.setItem('musi.notes', JSON.stringify([
  {
    id: 'note-seed-001',
    title: 'Warm-up reminder',
    body: 'Stretch hands and wrists before scales.',
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
  },
  {
    id: 'note-seed-002',
    title: 'Chord voicing idea',
    body: 'Try drop-2 shapes on the middle four strings.',
    createdAt: '2026-08-02T10:15:00.000Z',
    updatedAt: '2026-08-03T11:00:00.000Z',
  },
  {
    id: 'note-seed-003',
    title: 'Metronome target',
    body: 'Hold 120 BPM for four bars with eighth-note subdivisions.',
    createdAt: '2026-08-04T14:30:00.000Z',
    updatedAt: '2026-08-04T14:30:00.000Z',
  },
  {
    id: 'note-seed-004',
    title: 'Ear training log',
    body: 'Major third and perfect fifth pairs still confuse me.',
    createdAt: '2026-08-05T08:00:00.000Z',
    updatedAt: '2026-08-06T09:45:00.000Z',
  },
  {
    id: 'note-seed-005',
    title: 'Setlist scratch',
    body: 'Opener, mid-tempo groove, ballad, encore riff.',
    createdAt: '2026-08-07T19:00:00.000Z',
    updatedAt: '2026-08-07T19:00:00.000Z',
  },
]));
location.reload();
```

Every note has no `linkedType` or `linkedId` field.
After migration every note must reach Unfiled Notes.

### Songs (two songs)

```javascript
localStorage.setItem('musi.songs', JSON.stringify([
  {
    id: 'song-seed-001',
    title: 'Neon Harbor',
    lyrics: 'Verse one\nChorus hook\nBridge lift',
    recordings: [],
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-10T12:00:00.000Z',
  },
  {
    id: 'song-seed-002',
    title: 'Copper Wire',
    lyrics: 'Intro riff\nVerse pattern\nOutro fade',
    recordings: [
      {
        id: 'att-rec-seed-001',
        name: 'Demo take',
        addedAt: '2026-08-05T16:00:00.000Z',
      },
    ],
    createdAt: '2026-08-03T09:00:00.000Z',
    updatedAt: '2026-08-11T09:00:00.000Z',
  },
]));
location.reload();
```

### Exercises, workbooks, and routines

```javascript
localStorage.setItem('musi.exercises', JSON.stringify({
  categories: [{ id: 'cat-seed-tabs', name: 'Tabs' }],
  items: [
    {
      id: 'ex-seed-001',
      name: 'Alternate picking etude',
      categoryId: 'cat-seed-tabs',
      attachmentId: '',
      url: 'https://example.com/exercises/alternate-picking.gp',
      fileName: 'alternate-picking.gp',
      type: 'application/guitar-pro',
      size: 0,
      addedAt: '2026-08-01T10:00:00.000Z',
    },
    {
      id: 'ex-seed-002',
      name: 'Sweep arpeggio drill',
      categoryId: 'cat-seed-tabs',
      attachmentId: '',
      url: 'https://example.com/exercises/sweep-arpeggio.gp',
      fileName: 'sweep-arpeggio.gp',
      type: 'application/guitar-pro',
      size: 0,
      addedAt: '2026-08-02T10:00:00.000Z',
    },
    {
      id: 'ex-seed-003',
      name: 'Broken attachment sample',
      categoryId: 'cat-seed-tabs',
      attachmentId: 'att-missing-seed-001',
      url: '',
      fileName: 'missing-file.gp',
      type: 'application/guitar-pro',
      size: 0,
      addedAt: '2026-08-03T10:00:00.000Z',
    },
  ],
}));
localStorage.setItem('musi.workbooks', JSON.stringify({
  folders: [{ id: 'wbf-seed-001', name: 'Technique' }],
  workbooks: [
    {
      id: 'wb-seed-001',
      name: 'Picking workbook',
      folderId: 'wbf-seed-001',
      entries: [
        { id: 'wbe-seed-001', exerciseId: 'ex-seed-001' },
        { id: 'wbe-seed-002', exerciseId: 'ex-seed-002' },
        { id: 'wbe-seed-broken', exerciseId: 'ex-missing-001' },
      ],
      companions: [],
      loopEnabled: true,
      activeEntryId: 'wbe-seed-001',
      createdAt: '2026-08-01T11:00:00.000Z',
      updatedAt: '2026-08-12T11:00:00.000Z',
    },
  ],
}));
localStorage.setItem('musi.routines', JSON.stringify({
  routines: [
    {
      id: 'rt-seed-active',
      name: 'Guitar practice',
      description: 'Active routine with one incomplete session.',
      sessions: [
        {
          id: 'rs-seed-warmup',
          name: 'Warm-up',
          notes: 'Chromatic runs at 90 BPM.',
          workbookIds: ['wb-seed-001'],
          durationMin: 10,
          metronome: { bpm: 90, beats: 4, subdiv: 'quarter', accentFirst: true },
          completed: true,
        },
        {
          id: 'rs-seed-main',
          name: 'Main drills',
          notes: 'Work through the picking workbook.',
          workbookIds: ['wb-seed-001'],
          durationMin: null,
          metronome: { bpm: 120, beats: 4, subdiv: 'eighth', accentFirst: true },
          completed: false,
        },
        {
          id: 'rs-seed-broken',
          name: 'Broken workbook ref',
          notes: 'Session names a workbook that does not exist.',
          workbookIds: ['wb-missing-001'],
          durationMin: null,
          metronome: { bpm: 100, beats: 4, subdiv: 'quarter', accentFirst: true },
          completed: false,
        },
      ],
      activeSessionId: 'rs-seed-main',
      createdAt: '2026-08-01T09:00:00.000Z',
      updatedAt: '2026-08-12T12:00:00.000Z',
    },
    {
      id: 'rt-seed-inactive',
      name: 'Archived drills',
      description: 'Inactive routine with all sessions complete.',
      sessions: [
        {
          id: 'rs-seed-archived',
          name: 'Review only',
          notes: 'All sessions marked complete.',
          workbookIds: [],
          durationMin: 15,
          metronome: { bpm: 80, beats: 4, subdiv: 'quarter', accentFirst: true },
          completed: true,
        },
      ],
      activeSessionId: 'rs-seed-archived',
      createdAt: '2026-07-01T09:00:00.000Z',
      updatedAt: '2026-07-15T12:00:00.000Z',
    },
  ],
}));
location.reload();
```

The workbook entry `wbe-seed-broken` names missing exercise id `ex-missing-001`.
The session `rs-seed-broken` names missing workbook id `wb-missing-001`.

### Drum patterns (IndexedDB and favorites)

```javascript
(async () => {
  const beatPattern = {
    id: 'usr-seed-beat-001',
    title: 'Rock Beat 1',
    category: 'beat',
    style: 'rock',
    tags: ['rock', 'groove'],
    difficulty: 2,
    bpmRange: [80, 120],
    meter: '4/4',
    subdivision: 'eighth',
    bars: 2,
    stepsPerBar: 16,
    steps: [
      { instrument: 'kick', step: 0, velocity: 100 },
      { instrument: 'kick', step: 8, velocity: 100 },
      { instrument: 'snare', step: 4, velocity: 110 },
      { instrument: 'snare', step: 12, velocity: 110 },
      { instrument: 'hihatClosed', step: 0, velocity: 70 },
      { instrument: 'hihatClosed', step: 2, velocity: 70 },
      { instrument: 'hihatClosed', step: 4, velocity: 70 },
      { instrument: 'hihatClosed', step: 6, velocity: 70 },
      { instrument: 'hihatClosed', step: 8, velocity: 70 },
      { instrument: 'hihatClosed', step: 10, velocity: 70 },
      { instrument: 'hihatClosed', step: 12, velocity: 70 },
      { instrument: 'hihatClosed', step: 14, velocity: 70 },
    ],
    tab: 'C | | | |\nH x-x-x-x-x-x-x-x-\nS | | o | | | o | |\nK o | | | o | | | |\n',
    builtin: false,
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
  };
  const fillPattern = {
    id: 'usr-seed-fill-001',
    title: 'Tom Fill 1',
    category: 'fill',
    style: 'rock',
    tags: ['fill', 'toms'],
    difficulty: 3,
    bpmRange: [90, 130],
    meter: '4/4',
    subdivision: 'sixteenth',
    bars: 1,
    stepsPerBar: 16,
    steps: [
      { instrument: 'tomHigh', step: 8, velocity: 100 },
      { instrument: 'tomMid', step: 10, velocity: 100 },
      { instrument: 'tomFloor', step: 12, velocity: 110 },
      { instrument: 'crash', step: 14, velocity: 120 },
    ],
    tab: 'C | | | | | | | o\nT1| | | | | o | | |\nT2| | | | | | o | |\nFT| | | | | | | o |\n',
    builtin: false,
    createdAt: '2026-08-02T10:00:00.000Z',
    updatedAt: '2026-08-02T10:00:00.000Z',
  };
  const gpImportPattern = {
    id: 'usr-seed-gp-001',
    title: 'GP Drum Section',
    category: 'exercise',
    style: 'metal',
    tags: ['guitar-pro', 'import'],
    difficulty: 4,
    bpmRange: [140, 160],
    meter: '4/4',
    subdivision: 'eighth',
    bars: 4,
    stepsPerBar: 16,
    parseMethod: 'visual-probability',
    steps: [
      { instrument: 'kick', step: 0, velocity: 100 },
      { instrument: 'kick', step: 6, velocity: 100 },
      { instrument: 'snare', step: 4, velocity: 110 },
      { instrument: 'snare', step: 12, velocity: 110 },
      { instrument: 'ride', step: 0, velocity: 80 },
      { instrument: 'ride', step: 2, velocity: 80 },
      { instrument: 'ride', step: 4, velocity: 80 },
      { instrument: 'ride', step: 6, velocity: 80 },
    ],
    tab: 'R x-x-x-x-x-x-x-x-\nS | | o | | | o | |\nK o | | o | | | | |\n',
    builtin: false,
    createdAt: '2026-08-03T10:00:00.000Z',
    updatedAt: '2026-08-03T10:00:00.000Z',
  };
  const builtinPattern = {
    id: 'builtin-rock-groove-01',
    title: 'Built-in Rock Groove',
    category: 'beat',
    style: 'rock',
    tags: ['builtin', 'rock'],
    difficulty: 1,
    bpmRange: [70, 100],
    meter: '4/4',
    subdivision: 'quarter',
    bars: 1,
    stepsPerBar: 8,
    steps: [
      { instrument: 'kick', step: 0, velocity: 100 },
      { instrument: 'snare', step: 4, velocity: 110 },
      { instrument: 'hihatClosed', step: 0, velocity: 70 },
      { instrument: 'hihatClosed', step: 2, velocity: 70 },
      { instrument: 'hihatClosed', step: 4, velocity: 70 },
      { instrument: 'hihatClosed', step: 6, velocity: 70 },
    ],
    tab: 'H x-x-x-x-\nS | | o |\nK o | | |\n',
    builtin: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('musi-drums', 1);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = (e) => {
      const idb = e.target.result;
      if (!idb.objectStoreNames.contains('patterns')) {
        idb.createObjectStore('patterns', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
  const tx = db.transaction('patterns', 'readwrite');
  const store = tx.objectStore('patterns');
  for (const p of [beatPattern, fillPattern, gpImportPattern, builtinPattern]) {
    store.put(p);
  }
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  const settings = JSON.parse(localStorage.getItem('musi:settings') || '{}');
  settings['drums.favorites'] = ['builtin-rock-groove-01'];
  localStorage.setItem('musi:settings', JSON.stringify(settings));
  location.reload();
})();
```

The snippet writes three user patterns and one built-in pattern.
It sets `drums.favorites` to `['builtin-rock-groove-01']`.

### Reset all local data

Paste and run this snippet to test the empty case.

```javascript
(async () => {
  const keys = [
    'musi:settings',
    'musi.notes',
    'musi.songs',
    'musi.exercises',
    'musi.workbooks',
    'musi.routines',
    'musi.gpAnnotations',
    'musi.gpAutoFollow',
    'musi.gpParchmentZoom',
    'musi.auth',
  ];
  for (const key of keys) localStorage.removeItem(key);
  sessionStorage.removeItem('musi.bootSplash.done');
  const dbNames = ['musi-attachments', 'musi-drums', 'musi-sync'];
  for (const name of dbNames) {
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  }
  location.reload();
})();
```

## Package validation

Run the regression suite before and after each work package.
Run only the checks for packages that already shipped.

### WP-01 — Compatibility tests and migrations

**Goal:** Migrations run on boot and preserve every stored record.

1. Run the reset snippet. Open `http://localhost:8080`. Boot completes with no
   error block. Library, Routines, and Tools favorites are empty. — FR-071, SC-010
2. Seed every snippet above. Reload once. Open the browser Application tab. Confirm
   `migrations.applied` in `musi:settings` lists `notes-unfiled.v1`,
   `exercise-metadata.v1`, and `drums-to-exercises.v1`. — FR-078
3. Reload the app a second time. Read `migrations.applied` again. No duplicate
   migration ids appear. Exercise, note, and drum exercise counts stay the same. —
   SC-007
4. Open Unfiled Notes. All five seeded notes keep the same `title`, `body`,
   `createdAt`, and `updatedAt`. — FR-072, SC-008
5. Open Library Exercises. Filter instrument `drums`. At least two migrated drum
   exercises appear. Each has `instrument` `drums`. — FR-074, FR-075, SC-009
6. Open one migrated drum exercise. Step data and `tab` text play in the shared
   practice player. — FR-075
7. Open the browser Application tab. Confirm the IndexedDB database `musi-drums`
   still exists until WP-09. — FR-076
8. Open workbook `wb-seed-001`. The broken entry shows a non-blocking missing
   exercise message. Other entries still open. — FR-071
9. Open routine `rt-seed-active`, session `rs-seed-broken`. The app reports the
   missing workbook without a block. — FR-071
10. Open each legacy hash from `contracts/route-map.md` section 4. Each hash opens
    the listed destination with no error dialog. — FR-079–FR-087, SC-006

### WP-02 — Tool-first shell and home

**Goal:** The root opens Tools with purpose navigation and no routine empty state.

1. Clear the hash. Reload. Tools home opens with Train selected. — FR-001, SC-003
2. Confirm section order: Train/Study/Create switch, Favorites (when present),
   Recents (when present), Continue a routine (when present), Search, Browse all
   tools. — FR-008
3. Run the reset snippet. Reload. Favorites, Recents, and Continue sections are
   absent. — FR-009, SC-005
4. Confirm Tools home shows no text `No routines yet`. — FR-010
5. At desktop width confirm the left rail lists Tools, Library, Routines, and
   Settings only. — FR-003, FR-005
6. At phone width confirm the bottom bar lists Tools, Library, Routines, and More
   only. — FR-004, FR-005
7. From Tools home under Train, open the Metronome card. The Metronome opens with
   no routine prompt. — FR-007, SC-002
8. From Tools home under Train, open the Tuner card in two interactions or fewer.
   — SC-001
9. Mark a tool as favorite. It appears under Favorites. Remove the favorite. The
   section hides when no favorites remain. — FR-013

### WP-03 — Common navigation and context behavior

**Goal:** Back, context precedence, audio ownership, and unsaved prompts work.

1. Open Scale Lab from Study. Press Back. Tools Study directory returns at the
   prior scroll position. — FR-027
2. Open Library, apply filters, open an exercise, press Back. Filters, sort, and
   scroll restore. — FR-028, SC-012
3. Open a workbook entry, press Back. The prior entry and scroll restore. — FR-029
4. Open routine `rt-seed-active` → session `rs-seed-main` → workbook
   `wb-seed-001` → exercise `ex-seed-001`. Press Back through workbook, session,
   and routine layers. — FR-029, SC-011
5. Run Search, open a result, press Back. Search state restores. — FR-030
6. Open a tool from Recents, press Back. Tools home returns at the Recents scroll
   position. — FR-030
7. Repeat one Back path with the browser Back control. The result matches the
   in-app Back control. — FR-031, SC-011
8. Change root in a tool without Set as default. Press Back. Parent context
   restores and saved defaults stay unchanged. — FR-021, FR-024
9. Change root, choose Set as default, open another compatible tool. The new
   default applies. — FR-023
10. Open a tool with an incompatible tuning from origin context. The app explains
    the fallback. — FR-025, SC-033
11. Start the Metronome, then start a score or tone in another tool. Only one audio
    owner plays. The Audio Dock shows the active source. — FR-055, SC-013
12. Stop all audio. The Audio Dock clears. — FR-057, SC-032
13. Record audio in Audio Studio without saving. Try to leave. The app offers Save,
    Discard, and Cancel. — FR-056, SC-014

### WP-04 — Study consolidation

**Goal:** Study labs replace scattered quizzes and share context.

1. Open Scale Lab. Confirm modes Overview, Neck, Harmony, Modes/Keys, and Guide. —
   FR-035
2. Open Fretboard & Interval Map. Confirm modes Learn, Map, Chord Tones, and
   Explain. — FR-035
3. Open Chord Lab. Confirm modes Reference, Map, Voicings, Triads/Sweeps, and
   Build. — FR-035
4. Search each Study lab screen. No streak counter, accuracy readout, or graded
   answer control appears. — FR-020, SC-004
5. Set root and scale in Scale Lab. Open Fretboard & Interval Map. The same root
   and scale appear when compatible. — FR-019, FR-036
6. Confirm one shared fretboard picture across Fretboard modes. — FR-092
7. Open `http://localhost:8080/#chordlab`. Chord Lab Reference opens with a
   dismissible one-time notice. Close it. Reload. The notice does not return. —
   FR-081, FR-088, SC-025
8. Open `http://localhost:8080/#intervalmap`. Fretboard & Interval Map opens at
   the mapped mode. — FR-079, FR-080

### WP-05 — Pitch, Ear, and Rhythm

**Goal:** Pitch & Ear Lab and Metronome own scored and tempo practice.

1. Open Pitch & Ear Lab. Switch among tuner, reference tone, pitch match, pitch
   runner, and ear identification. All modes live in one shell. — FR-037
2. Complete ear identification rounds. Scores or streaks appear only in Pitch &
   Ear Lab. — FR-038, SC-004
3. Open the Metronome from Tools. Set subdivisions, accents, tempo phases, and
   count-in. Playback runs with no routine required. — FR-039, SC-002
4. Start the Metronome in one tool and another metronome surface in a second tool.
   Only one tempo owner plays. — FR-094, SC-013
5. Open `http://localhost:8080/#timing`. The Metronome opens with a dismissible
   notice. No tap-scoring UI appears. — FR-082, FR-069
6. Open `http://localhost:8080/#practice`. Practice Plan opens inside Train. No
   timer starts on its own. — FR-040, FR-082
7. Open `http://localhost:8080/#keyboard`. The Study directory opens with a Pitch
   Reference notice. — FR-085

### WP-06 — Create consolidation

**Goal:** Audio Studio and Song Studio protect drafts and Unfiled Notes.

1. Open Audio Studio Capture. Record a short clip. Save to Exercise or Song. The
   original capture stays in the draft area until save completes. — FR-042
2. Open Audio Studio Analyze or Transcribe. Results stay drafts until you save
   them. The original audio file does not change. — FR-042
3. Open Song Studio. Edit lyrics. Pause typing. The header shows Saving, then
   Saved. — FR-060
4. Edit a song with unsaved changes. Try to leave. The app offers Save, Discard, or
   Keep editing. — FR-059
5. Open Unfiled Notes under Create. All five seeded notes appear with the same
   titles and bodies. — FR-072, SC-008
6. Open a legacy note. It stays unlinked until you attach it manually. — User Story 6

### WP-07 — Practice Library and Score Player

**Goal:** Library filters, imports, and Score Player behave as one hub.

1. Open Library. Confirm Exercises and Workbooks tabs. — FR-044
2. On Exercises, confirm filters for instrument, material type, technique, tuning,
   difficulty, tags, source, and favorite. — FR-045
3. Apply filters and scroll. Open an item. Press Back. List state restores. —
   FR-046, SC-012
4. Confirm one Add action per tab covers every supported create and import action. —
   FR-047
5. Import a file whose hash matches an existing exercise. The app offers
   `Open existing` and `Import another copy`. — FR-049
6. Open exercise `ex-seed-001`. The detail page lists workbook and routine
   references. — FR-050
7. Replace an exercise attachment. The exercise `id` and all references stay the
   same. — FR-050, SC-015
8. Open a Guitar Pro exercise in Score Player. Scroll the parchment. Transport
   controls stay visible. — FR-051, SC-030
9. With Loop Selection off, drag scrolls the score. With Loop Selection on, drag
   selects measures. — FR-052, SC-031
10. Select measures. Choose `Save as Exercise`. Confirm source score, track,
    measures, tempo, and tuning before create. — FR-053, SC-016
11. Open a migrated drum exercise. Step data and tab text play. — FR-075, SC-009

### WP-08 — Optional routine experience

**Goal:** Routines stay optional and never gate tools.

1. Open Routines. Active and inactive routines appear in separate groups. Each card
   shows Open, not Start. — FR-062, User Story 8
2. Open session `rs-seed-main`. No timer, elapsed clock, or auto completion
   appears. — FR-063, SC-006
3. Walk routine → session → workbook → exercise. Press Back at each level. Each
   press moves up one layer. — FR-061, FR-029
4. Confirm compact breadcrumbs show routine, session, and workbook origin. —
   FR-065
5. On an exercise inside a workbook, use Previous and Next. Auto-advance stays off
   by default. — FR-064
6. Mark optional completion on an exercise. The player stays on the exercise
   screen. — FR-064
7. With routines seeded, open Tools. Continue a routine appears. Tools home still
   shows no `No routines yet`. — FR-010, User Story 8
8. Open the Metronome from Tools while routines exist. No routine selection is
   required. — FR-007

### WP-09 — Settings and cleanup

**Goal:** Settings simplifies and legacy code retires.

1. Open Settings. Confirm Preferences, Audio, Data/Sync, and Cleanup. No Features
   section and no `features.enabled` control appear. — FR-066, FR-067
2. Without opening Settings, browse Tools and Library. Every retained tool remains
   reachable. — FR-068, SC-023
3. Run the reset snippet. Open Tools. Train, Study, and Create tools still open
   without a Settings visit. — User Story 9
4. Open `http://localhost:8080/#notes`. Unfiled Notes opens with a dismissible
   notice. — FR-085
5. Open `http://localhost:8080/#drums`. Library Exercises opens with a dismissible
   notice and a drums filter when migrated exercises exist. — FR-086
6. Open `http://localhost:8080/#studylab` and `#sightreading`. Each opens the
   mapped destination with the correct notice behavior. — FR-079, FR-083
7. Open the browser Network tab. Reload and visit every primary destination. No
   removed feature module loads. — FR-069, FR-070, SC-034
8. Confirm IndexedDB database `musi-drums` is gone after the WP-09 cleanup check
   passes. Migrated drum exercises still open from Library. — FR-076

## Accessibility and responsive checks

Run these checks in a desktop browser without extra tooling.

1. Complete Tools home browse, Library open and close, routine drill-down, Score
   Player transport use, and Audio Studio save or discard with the keyboard only. —
   SC-017
2. Navigate to a new page. Focus moves to the page heading. — FR-100
3. Open a dialog. Close it. Focus returns to the control that opened it. — FR-100
4. Inspect icon-only controls. Each has an accessible name in the accessibility
   tree. — FR-099
5. Inspect primary action buttons in the element inspector. Each target is at least
   44 by 44 CSS pixels. — FR-098, SC-018
6. Set browser zoom to 200% text on desktop width. Primary navigation labels and
   tool titles stay readable with no overlap. — FR-101, SC-019
7. Repeat step 6 at phone width. The Train, Study, Create switch stays usable. —
   SC-019
8. Enable reduced motion in the operating system or browser emulation. Nonessential
   motion reduces. Essential feedback stays visible. — FR-102
9. Hold a phone in landscape with safe-area insets. The app bar, bottom navigation,
   and Audio Dock respect the inset. — FR-102
10. Open a long Guitar Pro score and a long fretboard view. Fixed transport and
    playback controls stay visible during scroll. — FR-102, SC-030
11. Confirm pitch, note, interval, and completion states use text or icons, not
    colour alone. — FR-101

## Critical flows

The product owner uses these seven flows for package sign-off. — SC-022

### Flow 1 — Open the Tuner from Tools

1. Open `http://localhost:8080` with no hash.
2. Confirm Tools home shows Train selected.
3. Open the Tuner card.

**Expected result:** Pitch & Ear Lab Tuner opens in two interactions or fewer.

### Flow 2 — Start the Metronome without a routine

1. Open Tools under Train.
2. Open the Metronome card.
3. Set tempo and start playback.

**Expected result:** The Metronome runs with no routine, session, or timer prompt.

### Flow 3 — Study harmonic minor with chosen tuning

1. Open Tools under Study.
2. Open Scale Lab.
3. Set root to a harmonic-minor key and choose a tuning preset.
4. Open Fretboard & Interval Map.

**Expected result:** Both tools show the same root, scale, and tuning when compatible.

### Flow 4 — Score Player keeps transport visible

1. Open Library Exercises.
2. Open a Guitar Pro exercise in Score Player.
3. Scroll the parchment vertically.

**Expected result:** Transport controls stay visible during scroll.

### Flow 5 — Routine exercise and Back chain

1. Open Routines → `rt-seed-active` → `rs-seed-main` → `wb-seed-001` →
   `ex-seed-001`.
2. Press Back through workbook, session, and routine.

**Expected result:** Each Back press moves up exactly one layer in order.

### Flow 6 — Save a transcription

1. Open Audio Studio Transcribe.
2. Run transcription on a short audio sample.
3. Save the result to an Exercise or a Song.

**Expected result:** The saved record appears in Library or Songs. The draft area
clears after save.

### Flow 7 — Recover from empty Library and Routines

1. Run the reset snippet.
2. Open Tools. Do not open Settings.
3. Open Train, Study, and Create tools.

**Expected result:** Every retained tool opens with no blocking error and no Settings
visit.

## Migration retest matrix

| Fixture | How to create it | Expected result |
| --- | --- | --- |
| Empty data | Run the reset snippet | Migrations record ids; no error block; empty Library and Routines |
| Normal data | Run every seed snippet | Every record keeps ids, titles, bodies, and times; drum patterns become exercises with `instrument` `drums` |
| Duplicate content | Seed two notes with the same title | Both notes remain; neither merges; both stay in Unfiled Notes |
| Partial legacy record | Add a note with no `updatedAt` before first boot | `normalizeNote` fills `updatedAt` from `createdAt`; link fields default empty |
| Already-migrated record | Boot once, then add `linkedId` to one note manually | Second boot does not clear an existing link |
| Broken reference | Use the exercises/workbooks/routines seed as written | Migration deletes no record; missing refs show non-blocking messages on open |
| Repeated run | Boot twice on the same seeded data | `migrations.applied` unchanged after second boot; zero duplicate exercises or notes |

## Sign-off checklist

Complete this list per work package before the next package starts.

- [ ] All Node suites in **Record the baseline** exit 0
- [ ] `bash tests/supabase/run.sh` fails only for missing PostgreSQL binaries
- [ ] Browser check over `http://localhost:8080` passes for this package section
- [ ] `node cli/bin/musi.js --help` prints the activity list
- [ ] Mobile layout check passes at phone width
- [ ] Keyboard-only check passes for flows touched by this package
- [ ] Every legacy hash in `contracts/route-map.md` still resolves
- [ ] `CACHE_VERSION` in `service-worker.js` is bumped when JS or CSS changed
