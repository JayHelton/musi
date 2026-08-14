# Contract: audio owner

**Owner modules**: `js/audioOwner.js`, `js/audioDock.js`

**Consumers**: `js/main.js`, every tool that plays audio, records, or uses the microphone,
`js/gpPlayer.js`, `js/gpMixPlayer.js`

**Requirements**: FR-055, FR-056, FR-057, FR-058, FR-093

Per decision D16, one registry owns the active audio owner. The Audio Dock replaces
`js/nowPlaying.js` and the always-visible hold-record strip. Per decision D21,
`js/audio.js` keeps the `AudioContext` and the microphone stream.

## 1. Purpose

The player may run only one active audio owner at a time (FR-055). When the player
starts a second metronome, tone, score, recording, or media item, the app stops or
pauses the prior owner. The dock shows the active source while work continues (FR-057).
The app must not discard an unsaved recording without an explicit choice (FR-056).
Global volume controls playback only (FR-058). One module owns the microphone stream
and analysis rules (FR-093).

## 2. Current state

Verified facts from the codebase:

| Piece | Location | Role |
| --- | --- | --- |
| `ensureAudio`, `audioCtx` | `js/audio.js` | Owns the only `AudioContext` |
| `getAnalyserDestination` | `js/audio.js` | Bus entry for playback nodes |
| `requestMicStream`, `releaseMicStream` | `js/audio.js` | Single microphone stream owner |
| Bus chain | `js/audio.js` | Analyser, then compressor, then master gain, then destination |
| `showNowPlaying`, `hideNowPlaying`, `initNowPlaying` | `js/nowPlaying.js` | Display bar only; not a mutex |
| `stopOtherTools(keepIds)` | `js/main.js` | Runs a per-tool stopper on a section change |
| Chord preview, ear replay | Various modules | Short tones do not stop on a section change |
| Unsaved recording | `js/recorder.js` | No guard; `stopRecorder()` does not clear the blob |

No global single-owner registry exists today. A recording blob survives navigation
because `stopRecorder()` leaves the blob in memory.

## 3. Registry interface

**Module**: `js/audioOwner.js`

```javascript
export function claimAudio({ id, label, kind, onStop, onPause, canPause })  // -> handle | null
export function releaseAudio(handle)
export function getActiveOwner()
export function subscribe(fn)
export function stopActive(reason)
```

### 3.1 `claimAudio` arguments

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `string` | Stable owner id, for example `metronome` or `scoreplayer` |
| `label` | `string` | Player-visible source name for the dock |
| `kind` | `string` | One of the kind values in section 3.3 |
| `onStop` | `() => void` | Stops playback, recording, or mic work and releases nodes |
| `onPause` | `() => void` | Optional. Pauses while keeping position |
| `canPause` | `boolean` | When `true`, a new claim pauses instead of stops |

### 3.2 Handle

The registry returns a handle object `{ id, label, kind }` on success. The caller
passes the same handle to `releaseAudio`. A refused claim returns `null`.

### 3.3 Kind policy

A score and a media item keep their position, so the registry pauses them. A metronome
and a tone have no position to keep, so the registry stops them.

| Kind | On a new claim | Why |
| --- | --- | --- |
| `metronome` | stops | No position to keep |
| `tone` | stops | No position to keep |
| `score` | pauses | Position must survive |
| `recording` | asks first | Unsaved blob may exist (FR-056) |
| `media` | pauses | Position must survive |

When the active owner has `canPause: true`, a new claim calls `onPause` on the prior
owner. Otherwise the registry calls `onStop`.

## 4. Claim algorithm

When a caller invokes `claimAudio`, the registry runs these steps in order:

1. Validate `id`, `label`, `kind`, and `onStop`.
2. When the active owner has kind `recording` and the recording is unsaved, show the
   unsaved-recording prompt (section 5). When the player chooses Cancel, return `null`.
3. When an active owner exists and the new claim is not the same `id`, apply the kind
   policy from section 3.3 to the prior owner.
4. Call `onPause` or `onStop` on the prior owner as the policy requires.
5. Store the new owner record with its callbacks.
6. Notify every `subscribe` listener.
7. Return the new handle.

The caller must call `claimAudio` before it creates playback or capture nodes. When
the registry returns `null`, the caller must not leave a half-started audio node.

## 5. Recording exception

Per FR-056, a claim that would end an unsaved recording must ask first. The prompt
offers exactly these labels: **Save**, **Discard**, and **Cancel**.

| Player choice | Result |
| --- | --- |
| Save | The app saves the recording, then the claim proceeds |
| Discard | The app clears the unsaved blob, then the claim proceeds |
| Cancel | The recording stays unsaved; the claim returns `null` |

When the registry refuses a claim, `claimAudio` returns `null`. The caller must treat
`null` as failure and must not connect oscillators, schedulers, or capture nodes. A
refused claim must not leave a half-started audio node.

## 6. Short tones

A chord preview or an ear replay is a short tone. It must not stop a running metronome
by accident.

**Decision**: a preview tone with a scheduled duration of **3 seconds or less** uses a
separate non-exclusive path. It never calls `claimAudio`. It plays through
`getAnalyserDestination()` from `js/audio.js` like today.

**Risk accepted**: a preview tone may overlap another owner for up to 3 seconds. The
registry does not preempt the metronome for a preview. A tone longer than 3 seconds
must claim kind `tone` and preempt the prior owner.

## 7. Audio Dock interface

**Module**: `js/audioDock.js`

```javascript
export function initAudioDock(rootEl)
export function refreshAudioDock()
```

Per FR-057, the dock renders only while playback, recording, or microphone work is
active. When no owner is active, the dock hides and takes no space.

The dock shows:

1. The source label from the active owner.
2. The state, for example Playing, Paused, Recording, or Listening.
3. Elapsed time when useful, for example during recording or score playback.
4. A Stop control that calls `stopActive('dock')`.

| Owner state | Dock shows |
| --- | --- |
| Metronome playing | Source label, Playing, Stop |
| Score playing | Source label, Playing, elapsed time, Stop |
| Score paused | Source label, Paused, elapsed time, Stop |
| Media playing | Source label, Playing, elapsed time, Stop |
| Media paused | Source label, Paused, elapsed time, Stop |
| Recording active | Source label, Recording, elapsed time, Stop |
| Microphone active | Source label, Listening, Stop |
| Tone playing (claimed) | Source label, Playing, Stop |

Short preview tones that skip `claimAudio` do not appear in the dock.

## 8. What the change removes

| Removed piece | Notes |
| --- | --- |
| `js/nowPlaying.js` | Replaced by the dock |
| `#hold-rec-btn` | Always-visible hold-record button |
| `#hold-rec-overlay` | Pitch overlay panel |
| `#hold-rec-live-label` | Overlay label |
| `#hold-rec-note` | Overlay note readout |
| `#hold-rec-cents` | Overlay cents readout |
| `#hold-rec-freq` | Overlay frequency readout |
| `#hold-rec-meter` | Overlay level meter |
| `#hold-rec-timer` | Overlay timer |
| `#hold-rec-live-seq` | Overlay note sequence |
| Body class `hold-rec-relevant` | Visibility gate for the strip |
| `updateHoldRecordVisibility` | In `js/main.js` |
| Tool flag `holdRecord` | In `js/tools.js` |

Capture and pitch work move into tool pages and the conditional dock.

## 9. Volume

Per FR-058, global volume controls playback. It does not represent input gain. The
settings key stays `global.volume`. It maps to `setMasterVolume` in `js/audio.js`.

Input gain stays in Audio Studio capture controls or tool-local capture controls, on
the `captureGain` node in the active capture module such as `js/recorder.js`. It does
not use `global.volume`.

## 10. Microphone lifecycle

Per FR-093 and decision D21:

1. `js/audio.js` keeps `requestMicStream` and `releaseMicStream` as the single stream
   owner.
2. `js/pitch.js` stays the single live pitch detector for microphone work.
3. A tool that opens the microphone must call `claimAudio` with kind `recording` or a
   dedicated mic kind that follows the same ask-first rule when a blob is unsaved.
4. `releaseAudio` and `stopActive` must call `releaseMicStream` when mic work ends.

## 11. Interaction with `stopOtherTools`

`stopOtherTools(keepIds)` in `js/main.js` stays for section-change clean-up. It runs
per-tool stoppers from `TOOL_STOPPERS` when the player changes section.

The registry is the authority for concurrent audio owners. `stopOtherTools` cleans up
tool state when the section hides. Both exist during the transition because section
change and audio preemption are different events. A tool stopper should release its
audio claim through `releaseAudio` or respond to `onStop` from the registry.

## 12. Guarantees

1. At most one owner holds the registry slot after `claimAudio` returns a handle.
2. A second claim stops or pauses the first owner per the kind policy (FR-055).
3. An unsaved recording blocks a claim until the player chooses Save, Discard, or Cancel
   (FR-056).
4. A refused claim returns `null` and leaves no half-started audio node.
5. The dock shows only while an owner is active (FR-057).
6. `global.volume` affects playback only, not input gain (FR-058).
7. One microphone stream serves all capture and pitch tools (FR-093).
8. `subscribe` listeners receive a notification after every owner transition.

## 13. Test hooks

**Suite**: `tests/shell/run.mjs`

| Case | Expected result |
| --- | --- |
| Second claim | Stops or pauses the first owner |
| Pause-kind owner | Pauses and keeps position |
| Unsaved recording | Refuses claim until the player chooses Save, Discard, or Cancel |
| Preview tone under 3 s | Does not stop a running metronome |
| Dock after every transition | Label, state, elapsed time, and Stop match the owner state |
