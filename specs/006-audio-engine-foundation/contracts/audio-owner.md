# Contract: audio owner

**Owner module**: `js/audio/audioOwner.js`

**Consumers**: `js/gpMixPlayer.js`, `js/gpPlayerUI.js`, `js/keyboard.js`, `js/drums/drumEngine.js`, `js/metronome.js`, study tone starters

**Requirements**: FR-001 to FR-006, SC-002, SC-007

This contract implements the owner registry that Feature 005 described and did not ship.
This feature does not ship the Audio Dock.

## 1. Purpose

Only one long-running audio owner may sound. A new claim stops or pauses the prior owner.
A refused claim leaves no half-started voice.

## 2. Interface

```javascript
export function claimAudio({ id, label, kind, onStop, onPause, canPause })
export function releaseAudio(handle)
export function getAudioOwner()
export function getActiveOwner()
export function subscribe(fn)
export function stopActive(reason)
```

`getAudioOwner()` and `getActiveOwner()` return the same record or `null`.

### 2.1 `claimAudio` arguments

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stable owner id |
| `label` | string | Source name |
| `kind` | string | `metronome`, `tone`, `score`, `recording`, or `media` |
| `onStop` | function | Stops playback and releases nodes |
| `onPause` | function | Optional pause |
| `canPause` | boolean | When true, a new claim pauses instead of stops |

### 2.2 Handle

A successful claim returns `{ id, label, kind }`.
A refused claim returns `null`.
The caller must not create playback nodes after `null`.

### 2.3 Kind policy

| Kind | On a new claim | Why |
| --- | --- | --- |
| `metronome` | stops | No position to keep |
| `tone` | stops | No position to keep |
| `score` | pauses | Position must survive |
| `recording` | asks first when Feature 005 ships a prompt; otherwise stops | Unsaved blob may exist |
| `media` | pauses | Position must survive |

When the active owner has `canPause: true` and `onPause`, a new claim calls `onPause`.
Otherwise the registry calls `onStop`.

## 3. Claim algorithm

1. Validate `id`, `label`, `kind`, and `onStop`.
2. When the new `id` matches the active owner, refresh callbacks and return the current handle.
3. When an active owner exists, apply the kind policy.
4. Store the new owner.
5. Notify `subscribe` listeners.
6. Return the new handle.

The caller must call `claimAudio` before it creates long-running nodes.

## 4. Short tones

A preview of three seconds or less must not call `claimAudio`.
It must play through `getMixDestination()` from `js/audio.js`.
A tone longer than three seconds must claim kind `tone`.

## 5. Stop cleanup

`onStop` must release every owned voice.
One second after `onStop`, a tester must find no owned voice from that owner.

## 6. Interaction with `stopOtherTools`

`stopOtherTools` in `js/main.js` stays for section-change clean-up.
The registry is the authority for concurrent owners.
A tool stopper should call `releaseAudio` or respond to `onStop`.

## 7. Guarantees

1. At most one owner holds the slot after `claimAudio` returns a handle.
2. A second claim stops or pauses the first owner.
3. A refused claim returns `null` and leaves no half-started voice.
4. `getAudioOwner()` matches the active owner.
5. `subscribe` listeners run after every transition.

## 8. Test hooks

| Case | Expected result |
| --- | --- |
| Second claim | Stops or pauses the first owner |
| Score then keyboard | Score pauses or stops. Keyboard sounds. |
| Preview under 3 s | Does not stop a running metronome |
| Stop cleanup | No owned voice after 1 second |
| Same id re-claim | Returns a handle. Does not stop itself. |
