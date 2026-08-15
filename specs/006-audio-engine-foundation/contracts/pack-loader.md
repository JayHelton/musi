# Contract: pack loader

**Owner module**: `js/audio/sampleLoader.js`

**Consumers**: `js/gpMixPlayer.js`, `js/gpPlayerUI.js`

**Requirements**: FR-021 to FR-034, SC-001, SC-005, SC-011

## 1. Purpose

Fetch and decode the packs that the current score needs.
Keep score render and Play independent from pack decode.
Use the synth fallback after any failure.

## 2. Interface

```javascript
export function loadPacksForScore({
  scoreId,
  programs,
  drumNotes,
  audioCtx,
  onProgress,
})
// -> Promise<LoadResult>

export function getLoadState(scoreId)
export function cancelLoad(scoreId)
export function getPlaybackSourceState(scoreId)
export function canUsePackOnNextStart(scoreId)
```

### 2.1 `LoadResult`

```javascript
{
  status: 'ready' | 'fallback' | 'cancelled',
  packIds: string[],
  progress: 1,
  buffers: { [filePath]: AudioBuffer },
  error: string | null,
}
```

The loader must not throw to `window`.
A failure returns `status: 'fallback'`.

### 2.2 Progress

`onProgress({ loaded, total, fraction, label })` reports decode progress.
The player maps this to `Loading guitar sounds` while `fraction < 1`.

## 3. Rules

1. Read instrument programs and drum notes from the loaded score before a pack fetch.
2. Load only the packs that those programs need.
3. Decode each file one time per `AudioContext`. Share the buffer.
4. When `scoreId` changes, cancel the old session.
5. A cancelled session must not apply buffers to the new score.
6. A missing pack, a failed fetch, a failed decode, or a storage rejection returns fallback.
7. Score render must not `await` `loadPacksForScore`.
8. Play may start before the promise settles.
9. `canUsePackOnNextStart` is true only when status is `ready` and no note or loop pass is active.
10. Fetch URLs must be same-origin. Reject a third-party host.

## 4. Cache

The loader may write successful files into `musi-pack-<packId>-<version>`.
It must not add those files to `PRECACHE_URLS`.
If Cache Storage rejects the write, playback continues with in-memory buffers or fallback.

The service worker activate handler must keep `musi-pack-*` caches.

## 5. Source label

| Load state | Label |
| --- | --- |
| Loading | `Loading guitar sounds` |
| Ready | `Studio ready` |
| Fallback, cancelled, or no pack | `Synth fallback` |

This feature ships no production pack.
The default label after Play is `Synth fallback`.

## 6. Guarantees

1. First score render does not wait for pack decode.
2. Play before ready uses the synth fallback.
3. A failed load shows no unhandled error.
4. Optional pack files are absent from the first-visit app file list.
5. New sound-engine code stays at or below 150 KiB before compression.

## 7. Test hooks

| Case | Expected result |
| --- | --- |
| No registered pack | `status: 'fallback'`, label `Synth fallback` |
| Broken manifest | `status: 'fallback'`, no unhandled error |
| Score replace mid-load | Old session `cancelled`. New score does not receive old buffers. |
| Storage reject | Fallback or in-memory decode. Player stays usable. |
| First render | Score view appears before decode finishes |
| Precache list | No `assets/audio/packs/` entry |
