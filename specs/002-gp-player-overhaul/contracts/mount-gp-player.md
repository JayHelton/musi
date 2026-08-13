# Contract: Mount GP player

**Feature**: `002-gp-player-overhaul` | **Date**: 2026-08-13 | **Plan**: [../plan.md](../plan.md)

## Purpose

This contract fixes the embedder surface in `js/gpPlayerUI.js`. Five entry points mount the
same player. The overhaul must not break their option names or handle methods. New behaviour
arrives through new optional options only.

## Interface

### `mountGpPlayer(host, options) -> handle`

Module: `js/gpPlayerUI.js`

#### Current options (names from code)

| Option | Meaning |
| --- | --- |
| `gpResult` | Parsed score object from `parseGuitarPro` or `gpResultFromTabModelJson`. Required. |
| `title` | Display title in the score header. Default `'Guitar Pro'`. |
| `fileName` | Source file name for tooltips and provenance. Default `''`. |
| `preferredTrackIndex` | Initial track index. Default `0`. |
| `onAnalyze` | Optional callback when the learner runs tab analysis. |
| `headerExtra` | Optional `HTMLElement` appended to the score header. |
| `transportExtra` | Optional `HTMLElement` inserted into the transport dock. |
| `hideTitle` | When true, hide the title text in the header. Default `false`. |
| `initialLoopEnabled` | Start with loop on. Default `false`. |
| `initialLoopStart` | Initial loop start measure index. |
| `initialLoopEnd` | Initial loop end measure index. |
| `initialLoopStartBeat` | Initial loop start in quarter-note units. |
| `initialLoopEndBeat` | Initial loop end in quarter-note units. |
| `loopRestSec` | Rest duration between loop passes in seconds. Default `0`. |
| `onPracticeSettingsChange` | Callback with a practice-settings patch when settings change. |
| `onPlaybackEnd` | Callback when playback reaches the end. |
| `autoPlay` | Start playback after mount. Default `false`. |
| `exerciseScope` | When true, the score is a bar-range exercise. Default `false`. |
| `initialBpm` | Initial BPM override from saved settings. |
| `onOpenFile` | Callback for the open-file action in the standalone player. |
| `initialTranspose` | Initial transpose in semitones. |
| `initialTuning` | Initial tuning name. |
| `initialRetuneMode` | Initial retune mode (`preservePitch` or fingerings). |
| `disabled` | When true, show a loading state on the root. Default `false`. |
| `scoreKey` | Key for annotations and per-score prefs in local storage. Default `''`. |
| `exerciseImport` | Optional `{ getFolders, createFolder, importSegments }` for split-to-exercises. |
| `enableHostKeyboard` | When true, the host element receives transport keyboard shortcuts. Default `true`. |

#### New optional options (this feature)

| Option | Meaning |
| --- | --- |
| `initialTrackVolumes` | `{ guitars: number[], drums: number[] }` per-track gain 0..1. |
| `showStandardNotation` | Initial state of the optional notation staff. Default `false`. |
| `onAudioBlocked` | `({ cause, nextStep }) => void` when Web Audio cannot start. |
| `onReadProgress` | `(ratio: number) => void` during async parse of large files. |

#### Returned handle (current)

```javascript
{
  destroy: () => void,
  getState: () => object,
  play: () => void,
  stop: () => void,
  togglePlayPause: () => void,
  stepBpm: (delta: number) => void,
  setLoopEnabled: (on: boolean) => void,
  isLoopEnabled: () => boolean,
  player: object,                 // createGpMixPlayer instance
}
```

`getState()` returns the live player state object plus `viewModel`, `enabledGuitars`,
`enabledDrums`, and `metronomeEnabled`.

### `onPracticeSettingsChange` patch shape

`js/gpPlayer/playerState.js` calls `toPersistable()` and passes the result to
`onPracticeSettingsChange`. Current keys:

```text
preferredTrackIndex: number
loopEnabled: boolean
measureStart: number | null
measureEnd: number | null
startBeat: number | null
endBeat: number | null
loopRestSec: number
bpm: number | null              // null when the learner has not overridden tempo
transpose: number
tuning: string | null
retuneMode: string | null
```

New keys are additive. `filterPracticeSettingsPatch` in `js/gpExerciseScore.js` decides
what persists:

```javascript
filterPracticeSettingsPatch(patch, { sliced }) -> patch
```

When `sliced` is true, the filter removes `measureStart`, `measureEnd`, `startBeat`, and
`endBeat`. A sliced exercise score must not persist bar-range keys that would rebase to
`0..n` on reload.

### Score with no source bytes (audio transcription)

`js/gpPlayer.js` detects this case with `!state.bytes`.

- `loadGpPlayerResult` sets `state.bytes = null`.
- `loadFile` sets `state.bytes = null` when the file is a `musi-tab-model` JSON item.
- `makeHeaderExtras` sets `noGpBytes = !state.bytes`.
- When `noGpBytes` is true, the player disables actions that need GP source bytes:
  - `Save full score` button is disabled.
  - `saveToLibrary` shows an error when `!state.bytes`.

The player still mounts and plays the score. (FR-065)

## Embedder table

| Embedder | Options passed | Handle methods used |
| --- | --- | --- |
| `js/gpPlayer.js` | `gpResult`, `title`, `fileName`, `initialLoopEnabled`, `initialLoopStart`, `initialLoopEnd`, `initialLoopStartBeat`, `initialLoopEndBeat`, `loopRestSec`, `preferredTrackIndex`, `initialBpm`, `initialTranspose`, `initialTuning`, `initialRetuneMode`, `exerciseScope`, `headerExtra`, `onOpenFile`, `scoreKey`, `exerciseImport` | `destroy` |
| `js/exercises.js` | `gpResult`, `title`, `fileName`, `hideTitle`, `preferredTrackIndex`, `initialLoopEnabled`, loop range options, `loopRestSec`, `initialBpm`, `initialTranspose`, `initialTuning`, `initialRetuneMode`, `exerciseScope`, `onPracticeSettingsChange`, `scoreKey` | `destroy` |
| `js/workbooks.js` | Same as exercises, plus `headerExtra`, `transportExtra`, `onPlaybackEnd`, `autoPlay`, `enableHostKeyboard: false` | `destroy`, `togglePlayPause`, `stepBpm`, `setLoopEnabled`, `player.playing` (read) |
| `js/drums/drumsUI.js` | None directly. Calls `loadGpPlayerBytes(bytes, fileName)` which opens the standalone player. The standalone path passes the options listed for `js/gpPlayer.js`. | None on the mount handle (navigation only) |
| `js/trackToSheet.js` | None directly. Calls `loadGpPlayerResult(gp, { title, fileName })`. That sets `state.bytes = null` and mounts through `mountCurrent`. | None on the mount handle (returns mount from `loadGpPlayerResult` but caller does not keep it) |
| `js/recorder.js` | None directly. Calls `loadGpPlayerResult(recorder.gpResult, { title: 'Vocal riff', fileName: 'vocal-riff.riff' })`. | None on the mount handle |

Indirect helpers (unchanged names):

```javascript
// js/gpPlayer.js
loadGpPlayerBytes(bytes, fileName, opts) -> Promise
loadGpPlayerResult(gpResult, { title, fileName, exerciseId }) -> handle | null

// js/gpPlayerUI.js
openGpPlayerFromBytes(host, bytes, options) -> handle
parseGuitarPro(input) -> Promise
isGuitarProName(name) -> boolean
```

## Guarantees

1. Every current option name keeps its meaning. (plan compatibility rule 1)
2. Every current handle method keeps its signature. (plan compatibility rule 1)
3. `onPracticeSettingsChange` keeps the current patch shape. New keys are additive.
   (plan compatibility rule 2)
4. A new score load resets loop, speed, transpose, tuning, and selected track unless an
   `initial*` option overrides it. (FR-059)
5. After `destroy()`, the host element is empty and produces no audio or timers. (FR-060)
6. A score from an audio transcription opens with `state.bytes === null`. Actions that need
   source bytes are hidden or disabled. (FR-065)
7. Exercises, Workbooks, Drums import, Track to Sheet, and Voice Recorder entry points keep
   working. (FR-063)

## Errors

| Case | Required behaviour |
| --- | --- |
| `host` is null | Throw `mountGpPlayer: host required`. |
| `gpResult` has no playable tracks | Caller handles before mount. Standalone player shows a status message. |
| `onReadProgress` not supplied | Parse still runs. No progress UI in embedders that omit the callback. |
| `destroy()` called twice | Second call is a no-op. |

## Compatibility

### Must not change (reviewer checklist)

1. `mountGpPlayer(host, options)` export name and module path `js/gpPlayerUI.js`.
2. Every current option name in the table above. The current list holds 27 names.
3. All 9 handle members: `destroy`, `getState`, `play`, `stop`, `togglePlayPause`,
   `stepBpm`, `setLoopEnabled`, `isLoopEnabled`, `player`.
4. `onPracticeSettingsChange` patch keys listed above.
5. `filterPracticeSettingsPatch` signature and bar-range key stripping when `sliced` is true.
6. `loadGpPlayerBytes` and `loadGpPlayerResult` export names in `js/gpPlayer.js`.
7. `openGpPlayerFromBytes`, `parseGuitarPro`, and `isGuitarProName` re-exports from
   `js/gpPlayerUI.js`.
8. Workbook transport shortcuts that call `togglePlayPause`, `stepBpm`, and
   `setLoopEnabled`.
9. `state.bytes === null` as the no-source-bytes signal in `js/gpPlayer.js`.
10. `gpResult` top-level fields `tracks`, `drumTracks`, `parts`, `model`, `ascii`, `meta`,
    and `tempo`.

## Verification

1. Open a score from each embedder path in [quickstart.md](../quickstart.md). Confirm the
   player mounts and plays.
2. In Workbooks, call `togglePlayPause`, `stepBpm`, and `setLoopEnabled` from the workbook
   chrome. Confirm the player responds.
3. Open a transcription through Track to Sheet or Voice Recorder. Confirm save actions that
   need GP bytes are disabled.
4. Call `destroy()` from each embedder teardown path. Confirm no audio continues.
5. `tests/gp-player/offline-manifest.mjs` lists every module the player needs for offline
   open. (FR-062)
6. `node tests/gp-player/run.mjs` runs as the automated gate for parse and timeline suites
   that feed the player.
