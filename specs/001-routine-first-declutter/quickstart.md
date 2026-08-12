# Quickstart: Routine-First Declutter

This guide validates the Routine-First Declutter feature after implementation.
Follow each section in order.
Confirm that Home, routine layers, Settings, and Study Lab match the spec.

## Prerequisites

- Node.js 18 or newer.
- Python 3 for the static HTTP server.
- A desktop or mobile browser.
- The repository has no build step and no test framework.

## Start the app

1. Open a terminal in the repository root.
2. Run `python3 -m http.server 8080`.
3. Open `http://localhost:8080` in the browser.

The app must run over HTTP.
Direct file access breaks ES modules and the service worker.

After you edit JavaScript or CSS, do a hard reload in the browser.
Or bump `CACHE_VERSION` in `service-worker.js` so the service worker fetches new files.

## Seed test data

### Write three sample routines

Open the browser developer console on `http://localhost:8080`.
Paste and run this snippet.

```javascript
localStorage.setItem('musi.routines', JSON.stringify({
  routines: [
    {
      id: 'rt-guitar',
      name: 'Guitar',
      description: 'Daily guitar drills and mode work.',
      sessions: [
        {
          id: 'rs-guitar-theory',
          name: 'Music Theory',
          notes: 'Scale quiz and interval review.',
          workbookIds: [],
          durationMin: 10,
          metronome: { bpm: 90, beats: 4, subdiv: 'quarter', accentFirst: true },
          completed: true,
        },
        {
          id: 'rs-guitar-warmup',
          name: 'Warm-up',
          notes: 'Chromatic runs and spider exercises.',
          workbookIds: [],
          durationMin: 5,
          metronome: { bpm: 100, beats: 4, subdiv: 'quarter', accentFirst: true },
          completed: true,
        },
        {
          id: 'rs-guitar-gallop',
          name: 'Gallop Picking',
          notes: 'Triplet gallop patterns at target BPM.',
          workbookIds: [],
          durationMin: null,
          metronome: { bpm: 140, beats: 4, subdiv: 'eighth', accentFirst: true },
          completed: false,
        },
        {
          id: 'rs-guitar-downpick',
          name: 'Down-picking Stamina',
          notes: 'Sustained down-picking sets.',
          workbookIds: [],
          durationMin: 16,
          metronome: { bpm: 150, beats: 4, subdiv: 'quarter', accentFirst: true },
          completed: false,
        },
        {
          id: 'rs-guitar-modal',
          name: 'Modal Practice',
          notes: 'One mode per day across the neck.',
          workbookIds: [],
          durationMin: 10,
          metronome: { bpm: 110, beats: 4, subdiv: 'quarter', accentFirst: true },
          completed: false,
        },
        {
          id: 'rs-guitar-intervals',
          name: 'Interval Training',
          notes: 'Ear training for intervals.',
          workbookIds: [],
          durationMin: 8,
          metronome: { bpm: 100, beats: 4, subdiv: 'quarter', accentFirst: true },
          completed: false,
        },
      ],
      activeSessionId: 'rs-guitar-modal',
      createdAt: '2026-08-01T09:00:00.000Z',
      updatedAt: '2026-08-12T12:00:00.000Z',
    },
    {
      id: 'rt-drums',
      name: 'Drums',
      description: 'Drum kit practice and fill work.',
      sessions: [
        {
          id: 'rs-drums-warmup',
          name: 'Stick Warm-up',
          notes: 'Rudiments and stick control.',
          workbookIds: [],
          durationMin: 10,
          metronome: { bpm: 100, beats: 4, subdiv: 'quarter', accentFirst: true },
          completed: true,
        },
        {
          id: 'rs-drums-groove',
          name: 'Groove Practice',
          notes: 'Rock and metal grooves.',
          workbookIds: [],
          durationMin: 20,
          metronome: { bpm: 120, beats: 4, subdiv: 'quarter', accentFirst: true },
          completed: false,
        },
        {
          id: 'rs-drums-fills',
          name: 'Fill Generator',
          notes: 'Generated fills at rising tempo.',
          workbookIds: [],
          durationMin: 15,
          metronome: { bpm: 130, beats: 4, subdiv: 'eighth', accentFirst: true },
          completed: false,
        },
        {
          id: 'rs-drums-gp',
          name: 'Guitar Pro Import',
          notes: 'Practice imported drum sections.',
          workbookIds: [],
          durationMin: null,
          metronome: { bpm: 100, beats: 4, subdiv: 'quarter', accentFirst: true },
          completed: false,
        },
      ],
      activeSessionId: 'rs-drums-fills',
      createdAt: '2026-08-02T09:00:00.000Z',
      updatedAt: '2026-08-11T12:00:00.000Z',
    },
    {
      id: 'rt-harsh',
      name: 'Harsh Vocals',
      description: 'Weekly harsh vocal schedule.',
      sessions: [
        {
          id: 'rs-harsh-warmup',
          name: 'Warm-up',
          notes: 'Lip trills and gentle sirens.',
          workbookIds: [],
          durationMin: 10,
          metronome: { bpm: 80, beats: 4, subdiv: 'quarter', accentFirst: true },
          completed: true,
        },
        {
          id: 'rs-harsh-technique',
          name: 'Technique Drills',
          notes: 'Fry screams and false cord activation.',
          workbookIds: [],
          durationMin: 45,
          metronome: { bpm: 90, beats: 4, subdiv: 'quarter', accentFirst: true },
          completed: false,
        },
        {
          id: 'rs-harsh-endurance',
          name: 'Endurance Building',
          notes: 'Sustained growls in timed sets.',
          workbookIds: [],
          durationMin: 30,
          metronome: { bpm: 85, beats: 4, subdiv: 'quarter', accentFirst: true },
          completed: false,
        },
        {
          id: 'rs-harsh-rest',
          name: 'Rest Day',
          notes: 'Light warm-up only.',
          workbookIds: [],
          durationMin: 15,
          metronome: { bpm: 70, beats: 4, subdiv: 'quarter', accentFirst: true },
          completed: false,
        },
      ],
      activeSessionId: 'rs-harsh-technique',
      createdAt: '2026-08-03T09:00:00.000Z',
      updatedAt: '2026-08-10T12:00:00.000Z',
    },
  ],
}));
location.reload();
```

The envelope shape is `{ "routines": [ ... ] }` under key `musi.routines`.

### Clear routine data

Paste and run this snippet to test the empty state.

```javascript
localStorage.removeItem('musi.routines');
location.reload();
```

### Write a stale genre profile

Paste and run this snippet before boot.
Then confirm the app leaves the value untouched.

```javascript
const settings = JSON.parse(localStorage.getItem('musi:settings') || '{}');
settings['profile.music'] = {
  version: 1,
  genres: [{ id: 'metal', priority: 'primary' }],
  goals: ['harmony'],
  balance: 'genre',
  applications: ['fretboard'],
  exclusions: ['tritone'],
  influenceNotes: 'stale seed for quickstart',
  onboarded: true,
  updatedAt: Date.now(),
};
localStorage.setItem('musi:settings', JSON.stringify(settings));
location.reload();
```

The settings key is `musi:settings`.
The genre subkey is `profile.music`.

## Manual checks

### User Story 1 — Reach every routine from Home

1. Clear routine data. Open Home. Home shows title `No routines yet`, text `Create a routine or import a Musi routine file.`, primary `New Routine`, and secondary `Import Routine`. — SC-002
2. Seed one routine only (remove the other two from the seed snippet). Open Home. Home shows exactly one card under heading `Routines`. — SC-002
3. Seed all three routines. Open Home. Home shows three cards. — SC-002
4. With three routines seeded, each card shows the routine name, description, current session name, completed count, total count, and a compact progress indicator. — SC-003
5. With three routines seeded, card order is Guitar, then Drums, then Harsh Vocals. — FR-005
6. Tap any part of a routine card. The routine overview opens. The card has no separate start control. — SC-001
7. From the empty state, activate `New Routine`. The creation flow runs and Home shows the new card. — SC-002
8. From the empty state, activate `Import Routine`. The import flow runs and Home shows the imported card. — SC-007
9. On Home, confirm these blocks are absent: pocket theory hero, continue-practice card, start-study action, study recommendation card, genre profile prompt, foundation-study prompt, quick-start tool cards, category cards, and expanded tool catalog. — SC-005
10. Home still shows one small secondary `Browse tools` action. It opens the existing tool browser. — FR-009
11. Open the Guitar routine. Before and after, read `localStorage` for `musi.routines`. Drums and Harsh Vocals data stay unchanged. — SC-004

### User Story 2 — Move through routine layers and step back one layer

Prepare for workbook checks: in Exercises, ensure at least one exercise exists.
Create a workbook that holds that exercise.
Attach the workbook to the Guitar `Modal Practice` session.

12. Open Guitar, then `Modal Practice`, then the attached workbook, then an exercise inside it. Each step adds one layer above the parent. — SC-008
13. From the exercise layer, press the visible Musi Back control once. The workbook layer reappears. — SC-008
14. Press Back again through session and routine layers until Home appears. Each press moves up exactly one layer. — SC-009
15. Repeat step 14 with the browser Back control. The result matches the Musi Back control. — SC-008
16. From Home, press Back again. The app stays on Home. No navigation loop occurs. — SC-009
17. Open a session layer. Scroll the routine overview. Open a child layer. Press Back. The routine overview returns at the earlier scroll position. — SC-010
18. Open a workbook that holds a study companion. Open the companion. Press Back. The session layer reappears. — SC-008
19. Open `http://localhost:8080/#routines?routine=rt-guitar&session=rs-guitar-modal&workbook=<workbookId>` in a new tab. The app rebuilds parent layers and shows the workbook layer. One Musi Back press reaches the session address. — SC-011
20. Open `http://localhost:8080/#routines?routine=rt-guitar&session=invalid-session-id`. The app shows the routine overview and a non-blocking message. — SC-012
21. Open `http://localhost:8080/#routines?routine=invalid-routine-id`. The app returns to Home and shows a non-blocking message. — SC-012
22. Open a routine card with the keyboard. Move one layer deeper with the keyboard. Return to the parent layer with the keyboard. — SC-015

### User Story 3 — Open routine content without a tracked practice session

23. Open any session layer. The layer shows no start control, no end control, no countdown, no elapsed time, and no time summary. — SC-006
24. Open a session layer. The layer shows no input labelled `Target duration (min)`. — SC-006
25. Open an incomplete session. The session completion state does not change until you use the explicit completion control. — FR-020
26. Mark a session complete with the explicit control. The Home card counts update. — SC-014
27. Start the session metronome. The metronome runs and no session clock appears. — SC-006

### User Story 4 — Practice without genre setup

28. With the stale genre seed loaded, open the browser developer tools Application tab. Confirm `musi:settings` still holds the same `profile.music` value after boot. — FR-041
29. Open Settings. Settings shows default musical context, audio volume, device sync, import and export, and feature visibility. Settings shows no genre control and no recommendation preview. — SC-005
30. Open Study Lab. A study opens and the walkthrough runs with no genre configuration step. — FR-043
31. Visit Home, Settings, and Study Lab. The browser error log shows no missing-module, missing-selector, or missing-stylesheet error. — SC-013
32. Routine cards and routine layers use the shared theme colours and pixel fonts. No new colour values or font families appear on those surfaces. — SC-016

## Route reference

Routine state travels in fragment parameters per FR-029.
Replace placeholder ids with ids from your seed data or library.

| Address shape | Layer shown |
| --- | --- |
| `/` | Home, which holds the routine dashboard |
| `#routines` | The routines list layer |
| `#routines?routine=<routineId>` | Routine overview |
| `#routines?routine=<routineId>&session=<sessionId>` | Session detail |
| `#routines?routine=<routineId>&session=<sessionId>&workbook=<workbookId>` | Workbook detail |
| `#routines?routine=<routineId>&session=<sessionId>&workbook=<workbookId>&exercise=<exerciseId>` | Exercise |
| `#routines?routine=<routineId>&session=<sessionId>&companion=<companionId>` | Study companion |

Prefix each shape with `http://localhost:8080/`. The parameter order is fixed, so the app
writes the keys in the order `routine`, `session`, `workbook`, `exercise`, and
`companion`. See `contracts/routine-route.md`.

## Automated checks

Run each command from the repository root.
Each command must end with the listed line.

```bash
node tests/routines/run.mjs
```

Expected final line: `34 tests passed`

```bash
node tests/workbooks/run.mjs
```

Expected final line: `workbook companion-panel: ok`

```bash
node tests/study-lab/run.mjs
```

Expected final line: `6 tests passed`

```bash
node tests/companions/run.mjs
```

Expected final line: `companions tests: ok`

```bash
node tests/cloud/run.mjs
```

Expected final line: `67 passed`

The cloud suite grows when other work lands. Treat a higher count as normal. Treat a
failure or a lower count as a problem.

```bash
node tests/sync/profile.mjs
```

Expected final line: `15 tests passed`

```bash
cd cli && node bin/musi.js --help
```

Expected final line: `During a quiz: type your answer, or use q (quit), s (reveal), h (hint), r (replay).`

`node tests/study-recs/run.mjs` retires with this feature.
The file absence is the expected result after implementation.

## Import and export check

1. Seed the three routines from the seed snippet above.
2. Open the Routines tool or a routine overview layer.
3. Select the Guitar routine.
4. Activate the `Export` control for that routine.
5. Save the JSON file.
6. Open the file in a text editor.
7. Confirm a session entry still holds `durationMin` (for example `10` on `Music Theory`).
8. Clear routine data with the clear snippet.
9. Activate the `Import` control (`rt-import-btn` in the Routines tool, or `Import Routine` on Home).
10. Select the saved JSON file.
11. Export the Guitar routine again.
12. Confirm the second file holds the same `durationMin` values as the first file.
13. Open the Guitar `Modal Practice` session in the app.
14. Confirm no screen shows the `durationMin` value.

Expected result: `durationMin` survives export and import.
No routine screen displays that value.

## Known limits

Microphone and audio features need a real browser with Web Audio and microphone access.
A headless check cannot cover them.
This quickstart does not validate vocal trainer, voice recorder, or ear trainer audio paths.
