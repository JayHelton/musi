# Implementation Plan: Practice Lab

**Branch**: `claude/practice-session-feature-gnyppl`

**Spec**: `specs/009-practice-lab/spec.md`

**Data model**: `specs/009-practice-lab/data-model.md`

## Summary

One folder holds the whole feature. A container builds the feature from injected
ports, so the database, the click voice, the audio owner, the camera, and the clock all
arrive from outside. Pure functions turn the trainer settings into a click plan. One
scheduler plays a plan on the audio clock. The user-interface files are new, and they
import nothing from another feature. A thin adapter mounts the feature as the
`practicelab` tool.

## Technical Context

- **Language**: ES modules, no build step, no framework.
- **Clock**: `AudioContext.currentTime` for the click, `Date.now()` for the log.
- **Storage**: IndexedDB database `musi-practice-lab`, version 1, four object stores.
- **Media**: `getUserMedia` and `MediaRecorder` for the mirror and the clips.
- **Tests**: a new Node runner, `tests/practice-lab/run.mjs`, with no browser.
- **Theme**: Game Boy Color tokens from `css/base.css` and `css/theme-gbc.css`.

## Constitution Check

| Principle | Result |
| --- | --- |
| I. Static-first architecture | Pass. No backend. IndexedDB only. |
| II. Shared theory engine | Pass. The feature adds no music theory. The CLI is untouched. |
| III. Atomic Purple Game Boy Color UI | Pass. `css/practice-lab.css` uses the theme tokens and the pixel fonts. The reference screenshots supply the layout only. |
| IV. Verify before ship | Pass. A Node runner covers the pure logic. A browser pass covers the audio, the camera, and the storage. |
| V. Spec-driven feature work | Pass. This directory holds the spec, the plan, the data model, and the tasks. |

## Project Structure

### Documentation (this feature)

```
specs/009-practice-lab/
├── spec.md
├── plan.md
├── data-model.md
└── tasks.md
```

### Source code (repository root)

```
js/practiceLab/
├── index.js                    # initPracticeLab / stopPracticeLab — the only export main.js uses
├── container.js                # createPracticeLab(ports) and defaultPorts()
├── ports.js                    # JSDoc typedefs for every port
├── adapters/
│   ├── idbStore.js             # IndexedDB adapter for the PracticeStore port
│   ├── memoryStore.js          # in-memory adapter for the Node tests
│   ├── musiClick.js            # ClickPort over js/audio.js + js/audio/clickSynth.js
│   ├── musiAudioSession.js     # AudioSessionPort over js/audio/audioOwner.js
│   ├── mediaVideo.js           # VideoPort over getUserMedia + MediaRecorder
│   └── realClock.js            # ClockPort and IdPort
├── engine/
│   ├── timeline.js             # pure plan builders: metronomePlan, ratioPlan, speedPlan
│   ├── expand.js               # pure segment expansion to click events, for tests
│   ├── scheduler.js            # lookahead player that walks a plan through the ports
│   └── countdown.js            # the 1–10 minute timer
├── model/
│   ├── session.js              # session record, log entry factory, totals
│   └── catalog.js              # seed catalogs, add, remove, normalise
└── ui/
    ├── dom.js                  # small element helpers, local to this feature
    ├── setupView.js            # instrument, technique, target, Start Session
    ├── sessionView.js          # the session layout and the panel wiring
    ├── timerPanel.js           # the 1–10 minute presets and the readout
    ├── metronomeBar.js         # the bottom bar
    ├── trainerTabs.js          # Metronome / Ratios / Speed tabs
    ├── ratiosPanel.js          # the ratios controls
    ├── speedPanel.js           # the speed controls
    ├── cameraPanel.js          # the mirror, the record control, the caps
    ├── logPanel.js             # the live log and the note field
    └── historyView.js          # the session list and the session detail
```

Files outside the folder that change:

| File | Change |
| --- | --- |
| `js/tools.js` | One `TOOLS` entry: id `practicelab`, area `train`, modes `session` and `history`, `context: []` |
| `js/main.js` | One import pair and one row in `TOOL_INITS` and `TOOL_STOPPERS` |
| `index.html` | One `<section id="sec-practicelab">` and one stylesheet link |
| `css/practice-lab.css` | New stylesheet |
| `service-worker.js` | The new files in the pre-cache list, and a new cache name |
| `tests/product-model/run.mjs` | The Train tool list, the mode list, and the context list |

## Dependency injection

`container.js` exports `createPracticeLab(ports)`. `index.js` calls it with
`defaultPorts()`. Nothing in `engine/`, `model/`, or `ui/` imports a module from
outside `js/practiceLab/`.

| Port | Methods | Default adapter |
| --- | --- | --- |
| `store` | `getCatalog`, `saveCatalog`, `createSession`, `endSession`, `getSession`, `listSessions`, `appendEntry`, `listEntries`, `saveClip`, `getClip`, `listClips`, `deleteClip`, `deleteSession` | `adapters/idbStore.js`; `adapters/memoryStore.js` in tests |
| `click` | `prime()`, `now()`, `schedule(atSec, level)`, `stop()` | `adapters/musiClick.js`, over `ensureAudio` and `audioCtx` in `js/audio.js` and `scheduleClickSound` in `js/audio/clickSynth.js` |
| `audioSession` | `claim(onStop)`, `release()` | `adapters/musiAudioSession.js`, over `claimAudio` and `releaseAudio` in `js/audio/audioOwner.js`, kind `metronome` |
| `video` | `openMirror()`, `startRecording()`, `stopRecording()`, `close()`, `capabilities()` | `adapters/mediaVideo.js` |
| `clock` | `nowMs()`, `setInterval`, `clearInterval` | `adapters/realClock.js`; a fake clock in tests |
| `ids` | `newId(prefix)` | `adapters/realClock.js` |
| `notify` | `toast(message)` | a small function passed in at the mount point |

A future micro app replaces `defaultPorts()` and mounts the same container. No other
change is needed.

## Timing model

A plan is an ordered list of segments. A segment holds one tempo, one subdivision, and
a beat count. The plan states whether it repeats, and from which segment index.

```
segment = { id, phase, bpm, beats, perBeat, accentEvery, label }
plan    = { id, kind, segments, loop, loopFrom, topBpm }
```

`perBeat` is the click count inside one beat: 1 for quarter notes, 2 for eighths, 3 for
triplets, 4 for sixteenths. One click lasts `60 / bpm / perBeat` seconds. The scheduler
never divides a segment across two tempos, so a tempo change starts a new segment.

`expand.js` turns segments into events for the tests:

```
event = { atSec, level, segmentId, beatIndex, subIndex }
level = 'accent' | 'beat' | 'sub'
```

- `metronomePlan({ bpm, beatsPerBar })` returns one segment that repeats.
- `ratioPlan({ bpm, beats, loopA, loopB, countIn, initialCountIn, repeatCountIn })`
  returns `[initial count-in, A, repeat count-in, B, repeat count-in]` with
  `loop: true` and `loopFrom: 1`. The cycle is therefore A, count-in, B, count-in, A,
  and so on. With the count-in off, the plan is `[A, B]` with `loopFrom: 0`.
- `speedPlan({ timeSig, startBpm, endBpm, increment, barsPerLoop, loopsPerStep,
  countIn, initialCountIn, stepCountIn })` returns one segment for each tempo step,
  each preceded by a count-in segment when the count-in is on, with `loop: false`.
  `topBpm` is the tempo of the last segment. The builder clamps the last step to
  `endBpm` and refuses a plan when `endBpm` is below `startBpm`.

`scheduler.js` holds a 100 ms lookahead and a 25 ms poll, the same shape the existing
metronome uses, but written for this feature. It reads `click.now()`, schedules every
event inside the window through `click.schedule()`, and reports the segment and the
tempo to the user interface on each beat. It stops itself at the end of a plan that
does not repeat.

## Screens

**Setup** — instrument chips, technique chips for that instrument, a target field, and
Start Session. Each chip holds a remove control. A text field adds a custom entry.

**Session** — a target line, the timer panel, the trainer tabs, the camera panel, the
log panel, and the metronome bar across the bottom of the view. The bar stays in place
while the panels scroll.

**History** — the session list, and a detail view with the full log and clip playback.

The tool page supplies the two mode tabs, `session` and `history`, through the existing
tool descriptor. The feature draws everything below them.

## Decisions

1. **One click at a time.** The lab claims the shared audio owner. Starting the
   Metronome tool stops the lab click, and the reverse. Inside the lab, starting one
   trainer stops the other two.
2. **The session record is written at the start.** A crash or a closed tab leaves an
   open session that the tool can continue, instead of losing the log.
3. **Blobs live in their own store.** The `entries` store stays small, so the log and
   the history list read quickly.
4. **The camera holds the microphone.** One `MediaRecorder` writes the video and the
   microphone sound. The click reaches the clip through the speakers. A clean mix of
   the click into the clip is out of scope.
5. **Caps on the recorder.** A duration cap of 5 minutes and a size cap of 128 MB. The
   recorder stops itself at either cap and saves what it holds.
6. **The tool id is `practicelab`.** `tests/product-model/run.mjs` bans `sec-practice`
   and the identifier `practiceTimer`. No new symbol uses either name.
7. **No shared user-interface primitives.** The feature draws its own chips, tabs, and
   sliders in `ui/dom.js`. It shares only the audio and the storage services, through
   ports.

## Verification

1. `node tests/practice-lab/run.mjs` — the plan builders, the expansion, the log model,
   the catalog, and the memory store.
2. `node tests/product-model/run.mjs` — the tool registry, the section, and the banned
   ids.
3. `node tests/routes/run.mjs` and `node tests/shell/run.mjs` — the route and the
   navigation.
4. `python3 -m http.server 8080`, then `http://localhost:8080/#practicelab`:
   - start a session, run a 1 minute timer to zero;
   - start the bottom metronome, change the tempo while it runs;
   - run the ratios trainer and count the clicks in each segment;
   - run a short speed ladder and confirm it stops at the end tempo;
   - record a 20 second clip, play it back, reload, and play it from the history;
   - open the Metronome tool while the lab click runs and confirm the lab click stops.
5. `node tests/appcheck/run.mjs --hash '#practicelab'` — no console errors on boot.
6. Hard reload after the service-worker cache name changes.
