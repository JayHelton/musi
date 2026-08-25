# Data Model: Practice Lab

**Spec**: `specs/009-practice-lab/spec.md`

**Plan**: `specs/009-practice-lab/plan.md`

All data stays on the device. The feature sends nothing to a server.

## Database

- **Name**: `musi-practice-lab`
- **Version**: 1
- **Access**: only `js/practiceLab/adapters/idbStore.js` opens it.

The adapter is defensive, in the manner of `js/attachments.js`. When IndexedDB is not
available, every call resolves to a safe empty result and the user interface shows a
notice.

| Store | Key path | Indexes |
| --- | --- | --- |
| `sessions` | `id` | `startedAt`, `status` |
| `entries` | `id` | `sessionId`, `[sessionId+at]` |
| `clips` | `id` | `sessionId` |
| `catalog` | `id` | none |

## Session

```js
{
  id: 'pl-sess-<time36>-<rand>',
  startedAt: '2026-08-25T18:04:11.212Z',
  endedAt: '',                 // empty while the session is open
  status: 'active',            // 'active' | 'ended'
  instrument: 'Guitar',
  technique: 'Alternate Picking',
  target: 'Clean 16ths at 110 BPM on one string',
  totals: {
    timerMs: 0,                // the sum of the finished timer blocks
    clips: 0,
    topBpm: 0,                 // the best speed-trainer result of this session
  },
}
```

Rules:

- The record is written when the session starts.
- `endedAt` and `status` change when the player ends the session.
- `totals` is a cache of the log. The log is the source of truth.
- One session at most has the status `active`. The tool offers to continue it.

## Log entry

```js
{
  id: 'pl-ent-<time36>-<rand>',
  sessionId: 'pl-sess-…',
  at: '2026-08-25T18:07:40.006Z',
  kind: 'timer-complete',
  data: { minutes: 5 },
}
```

| Kind | `data` |
| --- | --- |
| `session-start` | `{ instrument, technique, target }` |
| `timer-start` | `{ minutes }` |
| `timer-complete` | `{ minutes }` |
| `timer-stop` | `{ minutes, elapsedMs }` |
| `metronome-start` | `{ bpm, beatsPerBar }` |
| `metronome-stop` | `{ bpmStart, bpmEnd, elapsedMs }` |
| `ratio-start` | `{ bpm, beats, loopA, loopB, countIn }` |
| `ratio-stop` | `{ cycles, elapsedMs }` |
| `speed-start` | `{ timeSig, startBpm, endBpm, increment, barsPerLoop, loopsPerStep }` |
| `speed-complete` | `{ topBpm, elapsedMs, finished }` |
| `clip-saved` | `{ clipId, durationMs, size }` |
| `note` | `{ text }` |
| `session-end` | `{ timerMs, clips, topBpm }` |

`speed-complete` carries `finished: false` when the player stopped the ladder early.
`topBpm` is then the last tempo the ladder reached.

## Clip

```js
{
  id: 'pl-clip-<time36>-<rand>',
  sessionId: 'pl-sess-…',
  entryId: 'pl-ent-…',
  blob: Blob,
  mime: 'video/webm;codecs=vp8,opus',
  durationMs: 30120,
  size: 4210331,
  createdAt: '2026-08-25T18:09:02.441Z',
}
```

Rules:

- The blob lives in its own store, so a log read never loads video.
- A delete removes the clip record and marks the `clip-saved` entry as removed.
- The adapter asks for persistent storage on the first write, in the manner of
  `ensurePersistentStorage` in `js/attachments.js`.
- Caps: 5 minutes and 128 MB. The recorder stops itself at either cap.

## Catalog

One record holds both catalogs.

```js
{
  id: 'catalog',
  instruments: [
    { id: 'guitar', label: 'Guitar', custom: false },
    { id: 'bass', label: 'Bass', custom: false },
    …
  ],
  techniques: {
    guitar: [
      { id: 'alternate-picking', label: 'Alternate Picking', custom: false },
      …
    ],
    …
  },
  hidden: { instruments: ['ukulele'], techniques: { guitar: ['economy-picking'] } },
  updatedAt: '2026-08-25T18:02:00.000Z',
}
```

Rules:

- The seed catalog lives in `js/practiceLab/model/catalog.js`.
- A removed seed entry goes in `hidden`, so a later release can change the seed list
  without bringing the removed entry back.
- A removed custom entry leaves the array.
- A label is trimmed, and the id is the lowercase label with hyphens for spaces.
- A duplicate label selects the entry that exists. It does not add a second entry.

### Seed instruments and techniques

| Instrument | Techniques |
| --- | --- |
| Guitar | Alternate Picking, Sweep Picking, Legato, Tapping, Hybrid Picking, Economy Picking, Bending, Vibrato, Palm Muting, String Skipping |
| Bass | Fingerstyle, Slap, Pop, Pick Playing, Muting, Position Shifts |
| Piano | Scales, Arpeggios, Hand Independence, Voicings, Sight Reading |
| Drums | Single Strokes, Double Strokes, Paradiddles, Foot Control, Independence |
| Voice | Breath Control, Pitch Accuracy, Range, Vowel Shape |

## Click plan

The plan is a value, not a state. The trainers build it, and the scheduler plays it.

```js
segment = {
  id: 'seg-2',
  phase: 'loop-a',       // 'count-in' | 'metronome' | 'loop-a' | 'loop-b' | 'step'
  bpm: 80,
  beats: 4,              // beats in this segment
  perBeat: 2,            // clicks in one beat: 1, 2, 3, or 4
  accentEvery: 4,        // accent one beat in this many; 0 for no accent
  label: '8th Notes',
}

plan = {
  id: 'plan-ratio-…',
  kind: 'metronome' | 'ratio' | 'speed',
  segments: [ … ],
  loop: true,
  loopFrom: 1,           // the segment the repeat starts from
  topBpm: 0,             // the speed plan only
}
```

`expand.js` turns segments into events, for the tests and for a preview:

```js
event = {
  atSec: 3.0,            // seconds from the plan start
  level: 'accent',       // 'accent' | 'beat' | 'sub'
  segmentId: 'seg-2',
  beatIndex: 0,
  subIndex: 0,
}
```

One click lasts `60 / bpm / perBeat` seconds. `level` is `accent` on the first click of
an accented beat, `beat` on the first click of any other beat, and `sub` on every other
click. Every click of a count-in segment is `accent`, so the player hears the switch.

### Subdivisions

| Id | Label | `perBeat` |
| --- | --- | --- |
| `quarter` | Quarter Notes | 1 |
| `eighth` | 8th Notes | 2 |
| `triplet` | Triplets | 3 |
| `sixteenth` | 16th Notes | 4 |

### Limits

| Setting | Range | Default |
| --- | --- | --- |
| Tempo | 30–300 BPM | 80 |
| Beats for each ratio segment | 1–16 | 4 |
| Initial count-in | 0–8 beats | 4 |
| Repeat count-in | 0–8 beats | 4 |
| Time signature | 2/4–7/4 | 4/4 |
| Speed increment | 1–20 BPM | 5 |
| Bars for each loop | 1–16 | 4 |
| Loops before each rise | 1–8 | 2 |
| Timer preset | 1–10 minutes | 2 |
