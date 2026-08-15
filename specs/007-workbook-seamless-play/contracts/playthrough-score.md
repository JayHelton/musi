# Contract: playthrough score

**Owner modules**: `js/tab/tabModel.js`, `js/gpExerciseScore.js`, `js/workbookPlaythrough.js`

**Consumers**: `js/workbooks.js`, `js/gpPlayerUI.js`

## `concatModels(models)`

Join TabModel values in order.

1. Return `null` when the list is empty.
2. Clone the first model as the base.
3. Append each later model with beat, measure, event, and beat-index offsets.
4. Set `totalBeats` to the sum of part lengths.
5. Offset `tempoMap.barIndex` values. Add a tempo entry at a part start when that part's tempo differs from the previous part.

## `concatGpResults(results)`

Join `gpResult` values in order.

1. Return `null` when the list is empty.
2. Join guitar tracks and drum tracks by index.
3. When a part lacks a track at an index, pad with empty measures that match that part's length.
4. Set `tempo` from the first result.
5. Merge `warnings`.

## `findConsecutiveGpRun(entries, activeIndex)`

`entries` is `{ id, isGp }[]`.

1. Return `null` when the active entry is missing or is not Guitar Pro.
2. Expand left and right while `isGp` is true.
3. Return `{ startIndex, endIndex }`.

## `buildPlaythroughScore(parts)`

`parts` is `{ entryId, gp, name?, tempo? }[]`.

1. Join the `gp` values with `concatGpResults`.
2. Build `boundaries` from each part's measure count and `totalBeats`.
3. When a part name is set and the first bar of that part has no marker, set that marker to the name.

## `entryIdAtBeat(boundaries, beat)` / `entryIdAtMeasure(boundaries, measureIndex)`

Return the `entryId` whose range contains the position. A beat on a boundary belongs to the later part.

## `boundaryForEntry(boundaries, entryId)`

Return the boundary for that entry, or `null`.

## `mountGpPlayer` additions

| Option or handle | Behavior |
| --- | --- |
| `onPlaybackTick(info)` | Fires on each player tick with `currentSec`, `measureIndex`, and `beat` |
| `skipCountIn` | When true, `autoPlay` starts sound without count-in |
| `seekToBar(barIndex, { autoplay })` | Seek to that bar. Keep or start playback when `autoplay` is true or the player is already playing |
| `seekToBeat(beat, { autoplay })` | Same for a quarter-note position |
