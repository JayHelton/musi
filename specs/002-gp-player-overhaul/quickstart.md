# Quickstart: Guitar Pro Player Overhaul

**Feature**: `002-gp-player-overhaul` | **Date**: 2026-08-13 | **Plan**: [plan.md](./plan.md)

## Purpose

This guide validates the Guitar Pro player overhaul end to end.
A reader can prove playback, score rendering, practice controls, audio quality, and load behaviour.
Follow each section in order.
Do not use this file as an implementation guide.

## Prerequisites

- Node.js 18 or newer.
- Python 3 for the static HTTP server.
- `google-chrome` on PATH for the browser harness.
- Test fixtures from `tests/gp-player/fixtures/makeFixtures.mjs`.

The feature needs no `npm install` and no build step.
Run all commands from the repository root unless a command says otherwise.

Build byte fixtures before the first test run:

```bash
node tests/gp-player/fixtures/makeFixtures.mjs
```

The builder writes small `.gp` and `.gp5` files with Node only.
The repository stores no large binary file.

## Test fixtures

`tests/gp-player/fixtures/makeFixtures.mjs` builds every fixture below.
Each file name matches its musical content.

| Fixture | Musical content |
| --- | --- |
| `tempo-change.gp5` | Tempo changes from 90 to 140 at bar 9 |
| `repeat-8bar.gp5` | An 8 bar section with a repeat mark |
| `repeat-endings.gp5` | A repeat with two alternate endings |
| `nested-repeat.gp5` | A nested repeat inside another repeat |
| `ties-rhythm.gp5` | Ties across a bar line, rests, dotted notes, and tuplets |
| `two-voices.gp5` | Two voices in one bar |
| `techniques.gp5` | All 13 techniques from FR-021 |
| `meter-change.gp5` | A change from 6/8 to 4/4 at bar 17 |
| `large-200bar.gp5` | A 200 bar multi-track score for the load test |
| `seven-string.gp5` | A 7 string tuning score |
| `eight-string.gp5` | An 8 string tuning score |
| `odd-meter-13-16.gp5` | One bar in 13/16 |
| `many-tracks.gp5` | A score with 24 tracks |
| `drums-only.gp5` | A drum track and no pitched track |
| `one-bar.gp5` | A one bar score |
| `empty-trailing-bar.gp5` | A score with an empty trailing bar |
| `empty-track.gp5` | A score with a track that has no notes |
| `corrupt.bin` | A corrupt file |
| `legacy.gpx` | A `.gpx` file |
| `legacy.gp3` | A `.gp3` file |
| `legacy.gp4` | A `.gp4` file |

The builder also writes a `.gp` copy of these fixtures: `tempo-change.gp`,
`repeat-endings.gp`, `ties-rhythm.gp`, `two-voices.gp`, and `techniques.gp`. A `.gp` file is
a ZIP archive that holds `Content/score.gpif`. The builder writes that archive with
`node:zlib` only. The `.gp` copies prove the GPIF path, and the `.gp5` copies prove the
binary path. FR-057 needs both paths.

`tests/gp-player/fixtures/passages/` holds 10 fixed test passages.
SC-015 and SC-016 use these passages.
The team fixes the 10 passages before the first human test.
The team reuses the same 10 passages for every later test.

## Automated checks

Run each command from the repository root.
Each command must end with the listed line.

| Step | Command | Expected final line |
| --- | --- | --- |
| 1 | `node tests/gp-player/run.mjs` | `gp-player suite: ok` |
| 2 | `node tests/gp-player/parse.mjs` | `gp-player parse: ok` |
| 3 | `node tests/gp-player/play-order.mjs` | `gp-player play-order: ok` |
| 4 | `node tests/gp-player/timeline.mjs` | `gp-player timeline: ok` |
| 5 | `node tests/gp-player/score-layout.mjs` | `gp-player score-layout: ok` |
| 6 | `node tests/gp-player/offline-manifest.mjs` | `gp-player offline-manifest: ok` |
| 7 | `node tests/gp-player/smoke.mjs` | `gp-player smoke: ok` |
| 8 | `node tests/gp-player/wiring.mjs` | `gp player wiring: ok` |
| 9 | `node tests/gp-player/metronome.mjs` | `gp-player metronome: ok` |
| 10 | `node tests/gp-player/metro-click.mjs` | `metro-click.mjs: all tests passed` |
| 11 | `node tests/gp-player/loop-playback.mjs` | `gp loop playback: ok` |
| 12 | `node tests/gp-player/exercise-slice.mjs` | `gp exercise slice: ok` |
| 13 | `node tests/gp-player/exercise-import.mjs` | `gp exercise import: ok` |
| 14 | `node tests/gp-player/exercise-import-ui.mjs` | `gp exercise import ui: ok` |
| 15 | `node tests/gp-player/drum-parsing.mjs` | `gp-player drum parsing: ok` |
| 16 | `node tests/gp-player/drum-notation.mjs` | `gp-player drum notation: ok` |
| 17 | `node tests/exercises/run.mjs` | `exercises tests: ok` |
| 18 | `node tests/workbooks/run.mjs` | `workbook companion-panel: ok` |
| 19 | `node tests/companions/run.mjs` | `companions tests: ok` |
| 20 | `node tests/track-to-sheet/run.mjs` | `track-to-sheet: all tests passed` |
| 21 | `node tests/cloud/run.mjs` | `67 passed` |
| 22 | `cd cli && node bin/musi.js reference --root C --type "Major (Ionian)"` | `Scale Reference` in the banner |

The cloud suite count can rise when other work lands.
Treat a higher count as normal.
Treat a failure or a lower count as a problem.

### Browser harness

1. Open a terminal in the repository root.
2. Run `python3 -m http.server 8080`.
3. Open a second terminal in the repository root.
4. Run `node tests/gp-player/run-browser.mjs`.

Each harness page under `tests/gp-player/audio/` must print `RESULT: PASS` in the `#out` element.
The driver reports `PASS` or `FAIL` for each page.

## Browser audio measurements

Each page under `tests/gp-player/audio/` renders a short score with `OfflineAudioContext`.
The page writes measurements into `#out` and ends with `RESULT: PASS` or `RESULT: FAIL`.

| Harness page | What it measures | Pass threshold |
| --- | --- | --- |
| `onset-timing.html` | Note onset times against the timeline | Every onset is within 50 ms of the timeline value (SC-003) |
| `total-duration.html` | Total playback time against the score | Total time is within 1 % of the source score (SC-001) |
| `loop-boundary.html` | Loop pass gap and boundary click across 20 passes | No pass boundary gap is longer than 10 ms (SC-010) |
| `peak-headroom.html` | Peak output level for a dense chord passage | Peak stays below full scale with no clip (FR-051) |
| `long-drift.html` | Playhead drift across a long render | Drift never exceeds 200 ms and no unplanned gap exceeds 100 ms (SC-011) |
| `instrument-spectral.html` | Spectral difference between the bass voice and the guitar voice | Bass and guitar clusters separate with enough distance for SC-016 |

## Manual verification

Start the app before manual checks.

1. Open a terminal in the repository root.
2. Run `python3 -m http.server 8080`.
3. Open `http://localhost:8080` in the browser.
4. Open the Guitar Pro Player at `http://localhost:8080/#gpplayer`.

After you edit JavaScript or CSS, do a hard reload in the browser.
Or bump `CACHE_VERSION` in `service-worker.js`.
The current value is `v190-routine-sibling-switch-and-phone-layout`.

### User Story 1 — Playback matches the written score

1. Open `tempo-change.gp5`. Press Play from bar 1. Confirm the player speeds up at bar 9.
2. Open `repeat-8bar.gp5`. Press Play. Confirm the player plays the 8 bar section twice.
3. Open `repeat-endings.gp5`. Press Play. Confirm the player takes ending one, then ending two.
4. Open `ties-rhythm.gp5`. Play to the tied note across a bar line. Confirm the note sounds once and holds the combined length.
5. Open `ties-rhythm.gp5`. Play to a bar of rests. Confirm the player stays silent and the playhead advances.
6. Open `two-voices.gp5`. Press Play. Confirm the player sounds both voices.
7. Open a 5 minute score from the saved library. Watch the playhead during playback. Confirm the playhead sits on the sounding beat within 50 ms.
8. Start playback on any score. Switch to another browser tab for 10 seconds. Return to the player tab. Confirm the audio and the playhead stay in step.

### User Story 2 — The score shows rhythm and technique

1. Open a score with one quarter note and four sixteenth notes in one bar. Confirm each note shows its length.
2. Open a score with a half rest in one bar. Confirm the score shows a rest mark in the correct place.
3. Open `techniques.gp5`. Find a bend. Confirm the score draws a bend mark and the bend amount.
4. Open `techniques.gp5`. Find a slide between two notes. Confirm the score draws a slide line between them.
5. Open `techniques.gp5`. Find a hammer-on and a pull-off. Confirm the score draws an arc and the correct label.
6. Open `meter-change.gp5`. Read bar 17. Confirm the score shows both time signatures.
7. Open `repeat-endings.gp5`. Confirm the score shows repeat marks and alternate endings.
8. Set the browser width to 360 CSS pixels. Open any score with rhythm marks. Confirm fret numbers and rhythm marks stay legible.

### User Story 3 — Practice controls stay on the main screen

1. Open a score with at least 20 bars. Drag across bars 17 to 20 on the bar strip. Confirm the player loops those bars and shows the range.
2. Set a two bar loop. Play 20 passes. Listen at the boundary. Confirm no audible gap and no click.
3. Open a score with 4 tracks. Tap a track tab. Confirm the score and the playback switch to that track.
4. Start playback at 100 %. Set the speed to 70 % on the transport bar. Confirm the player slows down and keeps the current bar and beat.
5. Turn the count-in on. Press Play. Confirm the player clicks one bar and shows the count on screen.
6. Open a score with 3 tracks. Halve the drum volume in the track mixer. Confirm the drums lower and the other tracks stay unchanged.
7. Open the help panel from the menu or press `?`. Confirm the panel lists every keyboard shortcut.
8. Open the player on a phone in portrait. Confirm every primary control sits on screen at a usable size.
9. Open a score with two drum tracks. Select drum track 2. Confirm the player shows and plays drum track 2 only.

### User Story 4 — The playback sounds like the instruments

1. Open a score with a bass track and a guitar track. Press Play. Confirm the two tracks sound different.
2. Open a score with soft and loud notes. Press Play. Confirm the loud notes sound louder.
3. Open `techniques.gp5`. Play to a bend of one tone. Confirm the pitch rises by one tone.
4. Open `techniques.gp5`. Play to a palm muted passage. Confirm the notes sound short and damped.
5. Open a score with six note chords at speed. Press Play. Confirm the output does not distort.
6. Block audio autoplay in the browser. Press Play. Confirm the player states the cause and one next step.

### User Story 5 — The player opens a large score without a freeze

1. Open `large-200bar.gp5`. Confirm the player shows read progress and still answers taps during the read.
2. Open `large-200bar.gp5` on the test computer. Confirm the score appears within 3 seconds.
3. Set a loop on bars 5 to 9 at 60 %. Load another file. Confirm the player clears the loop and uses the new tempo.
4. Start playback. Leave the player screen. Confirm all audio stops at once.
5. Open `corrupt.bin`. Confirm the player names the problem and one next step.
6. Open `legacy.gpx`. Confirm the player asks for a `.gp` export and states how to make one.
7. Load the app online once. Stop the server. Reload the page offline. Open a saved score. Confirm every screen area and every control appears.
8. Turn on a screen reader. Play a score. Confirm the screen reader announces each new bar during playback.
9. Open any panel during playback. Close the panel. Confirm playback continues without a change.
10. Open a score that came from an audio transcription. Confirm the player shows the score and hides the source file actions.

## Accessibility checks

These steps cover FR-066 to FR-069.

### Screen reader bar announcement (FR-066)

1. Turn on NVDA on Windows, VoiceOver on macOS, or TalkBack on Android.
2. Open `http://localhost:8080/#gpplayer`.
3. Load any score and press Play.
4. Confirm the screen reader announces the current bar when the bar changes.

### Text name on every control (FR-067)

1. Open Chrome DevTools.
2. Open the Accessibility tree.
3. Walk every control on the transport bar, the practice rail, the track tabs, and each panel.
4. Confirm every control has a text name from `aria-label` or visible text.

### Keyboard-only transport (FR-068)

1. Open the player with the mouse unplugged or unused.
2. Tab to the transport bar.
3. Run Play, Pause, Stop, previous bar, next bar, speed change, loop toggle, metronome toggle, count-in toggle, and track choice with the keyboard alone.
4. Confirm each action works.

### Reduced motion setting (FR-069)

1. Turn on reduced motion in the operating system.
   Or enable **Emulate CSS media feature `prefers-reduced-motion: reduce`** in Chrome DevTools.
2. Open a score and press Play.
3. Confirm the score does not use smooth auto scroll.
4. Confirm essential feedback still appears without motion that depends on animation.

## Offline check

These steps cover FR-062 and SC-017.

1. Bump `CACHE_VERSION` in `service-worker.js` after you add or change player files.
2. Start `python3 -m http.server 8080` from the repository root.
3. Open `http://localhost:8080` in the browser.
4. Open the Guitar Pro Player and load any score once while online.
5. Stop the static server.
6. Hard reload the page.
7. Open the Guitar Pro Player again.
8. Open a saved score from the library.
9. Confirm every screen area and every control appears.
10. Confirm transport, track tabs, the practice rail, and each panel open without a network error.

## Mobile and layout checks

These steps cover SC-012, FR-043, and FR-030.

1. Open Chrome DevTools.
2. Enable device mode.
3. Set the viewport width to 360 CSS pixels.
4. Test portrait orientation. Confirm every primary control stays on screen and stays usable.
5. Test landscape orientation. Confirm every primary control stays on screen and stays usable.
6. Measure each primary control touch target. Confirm each target is at least 44 by 44 CSS pixels.
7. Open any score with fret numbers. Inspect a fret number in DevTools. Confirm the rendered size is at least 12 CSS pixels.

Primary controls are Play, Pause, Stop, previous bar, next bar, speed, loop, metronome, count-in, and track choice.

## Human listening and reading tests

These steps cover SC-015 and SC-016.

### Reading test (SC-015)

1. Fix the 10 passages in `tests/gp-player/fixtures/passages/` before the first test.
2. Reuse the same 10 passages for every later test.
3. Ask a guitar teacher to read each passage on screen with no audio.
4. The teacher confirms the drawn rhythm for each passage.
5. Record a pass when the teacher confirms the rhythm.
6. The team passes SC-015 when the teacher confirms at least 8 of 10 passages.

### Listening test (SC-016)

1. Use the same 10 fixed passages from `tests/gp-player/fixtures/passages/`.
2. Ask a listener to hear each passage.
3. Hide the track names from the listener.
4. The listener names which part is bass and which part is guitar.
5. Record a pass when the listener names both parts correctly.
6. The team passes SC-016 when the listener passes at least 9 of 10 passages.

The automated spectral check in `instrument-spectral.html` supports SC-016.
It does not replace the human listening test.

## Success criteria coverage

| Criterion | How the team measures it | Where |
| --- | --- | --- |
| SC-001 | Compare total playback time to the source score | `total-duration.html`; `node tests/gp-player/timeline.mjs` |
| SC-002 | Compare played bar order to the written bar order | `node tests/gp-player/play-order.mjs` |
| SC-003 | Measure playhead offset from the sounding note | `onset-timing.html`; User Story 1 step 7 |
| SC-004 | Count drawn techniques against file techniques | `node tests/gp-player/score-layout.mjs` |
| SC-005 | Time loop setup actions and count | User Story 3 step 1 |
| SC-006 | Count actions to switch track | User Story 3 step 3 |
| SC-007 | Time speed change actions and count | User Story 3 step 4 |
| SC-008 | Time first system render on a 200 bar score | User Story 5 step 2 |
| SC-009 | Measure input response during file read | User Story 5 step 1 |
| SC-010 | Measure loop boundary gap across 20 passes | `loop-boundary.html`; User Story 3 step 2 |
| SC-011 | Measure drift and unplanned gaps in a long session | `long-drift.html` |
| SC-012 | Check primary controls at 360 CSS pixels wide | Mobile and layout checks |
| SC-013 | Load a second score and inspect settings | User Story 5 step 3 |
| SC-014 | Leave the player and measure audio stop time | User Story 5 step 4 |
| SC-015 | Teacher reading test on 10 fixed passages | Human listening and reading tests — Reading test |
| SC-016 | Listener test on 10 fixed passages plus spectral check | Human listening and reading tests — Listening test; `instrument-spectral.html` |
| SC-017 | Open the player offline and inspect every control | Offline check |

## Regression checklist

Confirm these neighbour features still work after the overhaul.

- **Saved score library** — Save a score from the player. Open it from the library list on `#gpplayer`.
- **Exercises viewer** — Open a Guitar Pro exercise. Confirm playback and practice settings persist.
- **Workbooks player** — Open a workbook entry with a Guitar Pro score. Confirm the player mounts and plays.
- **Split-into-exercises studio** — Import a Guitar Pro file through Bulk Upload. Confirm section split still works.
- **Section notes** — Add a section note on a bar range. Confirm it persists across reload.
- **Drums import handoff** — Import a drum track in Drums. Confirm `Play in Guitar Pro Player` opens the score.
- **Track to Sheet handoff** — Transcribe audio in Track to Sheet. Confirm `Open in Guitar Pro Player` opens the score.
- **Voice Recorder riff handoff** — Record a riff. Confirm `Play in Guitar Pro Player` opens the score.
- **CLI tab analysis** — Run `cd cli && node bin/musi.js tab --file <path-to-score.gp5> --track 1`. Confirm the tab breakdown prints without error (FR-063 and FR-065).
