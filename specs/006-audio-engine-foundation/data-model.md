# Phase 1 Data Model: Audio Engine Foundation

**Feature**: `006-audio-engine-foundation` | **Date**: 2026-08-14 | **Plan**: [plan.md](./plan.md)

## Summary

This feature adds runtime audio entities. It does not replace `TabModel` or `TimedEvent`.
It reads `trackInfo.volume` and `trackInfo.pan` that Feature 002 already stores.
It adds no production sample files.

## Entity map

| Entity | Owner module | Status | Persists |
| --- | --- | --- | --- |
| Audio owner | `js/audio/audioOwner.js` | New | No |
| Track bus | `js/audio/mixBus.js` | New | No |
| Mix graph | `js/audio/mixBus.js`, `js/audio.js` | New / extended | No |
| Safety stage | `js/audio/mixBus.js` | New | No |
| Imported mix | `js/tab/tabModel.js` `trackInfo` | Existing | Yes, inside the score |
| Playback source state | `js/audio/sampleLoader.js` | New | No |
| Pack manifest | `js/audio/samplePackRegistry.js` | New | Same-origin JSON later |
| Pack load session | `js/audio/sampleLoader.js` | New | No |
| Pack cache entry | `service-worker.js` | New rule | Cache Storage |
| Practice track volume | `js/gpPlayer/playerState.js` | Extended | Yes, existing practice record |

## Audio owner

One long-running tool that may sound. Owner: `js/audio/audioOwner.js`. Status: new. Persists: no.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | Yes | Stable id, for example `gp-player` or `keyboard`. |
| `label` | string | Yes | Player-visible source name. |
| `kind` | string | Yes | One of `metronome`, `tone`, `score`, `recording`, `media`. |
| `onStop` | function | Yes | Stops playback and releases nodes. |
| `onPause` | function | No | Pauses and keeps position. |
| `canPause` | boolean | No | When true, a new claim pauses instead of stops. |
| `handle` | object | Yes | `{ id, label, kind }` returned by a successful claim. |

### Transitions

1. Empty → claimed: `claimAudio` stores the owner and returns a handle.
2. Claimed A → claimed B: the registry stops or pauses A, then stores B.
3. Claimed → empty: `releaseAudio` or `stopActive` clears the slot.
4. Refused: an unsaved recording prompt from Feature 005 may return `null`. This feature must treat `null` as failure.

### Validation

- `id`, `label`, `kind`, and `onStop` must be present.
- A short preview of three seconds or less must not create an owner.
- After `onStop`, the owner must leave no owned voice after 1 second.

## Track bus

Gain, pan, and a reserved EQ slot for one score track. Owner: `js/audio/mixBus.js`. Status: new. Persists: no.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `trackKey` | string | Yes | `guitar:0` or `drum:1`. |
| `gain` | number | Yes | Linear 0..1 after mute and solo. |
| `pan` | number | Yes | `-1` left to `1` right. |
| `muted` | boolean | Yes | When true, gain is 0. |
| `soloed` | boolean | Yes | When any track is soloed, non-solo tracks are silent. |
| `sourceVolume` | number | Yes | Imported `trackInfo.volume`, default `1`. |
| `sourcePan` | number | Yes | Imported `trackInfo.pan`, default `0`. |
| `userVolume` | number | No | Later learner override. |
| `eq` | object | No | Reserved. This feature leaves EQ flat. |
| `reverbSend` | number | No | Reserved. This feature keeps the send at 0. |

### Validation

- `gain` is 0..1.
- `pan` is -1..1.
- First load uses `sourceVolume` and `sourcePan` until the learner changes volume.

## Mix graph

Shared node order for the app. Owners: `js/audio.js` and `js/audio/mixBus.js`. Status: extended. Persists: no.

| Stage | Role |
| --- | --- |
| Track bus | Per-track gain and pan |
| Mix bus | Sum of dry track outputs |
| Compressor | Existing gentle compression |
| Master gain | User volume, including values above 1 |
| Safety stage | Peak limit at `-1 dBFS` |
| Analyser | Reads the protected output |
| Destination | Speakers |

There is one graph per `AudioContext`. The app must not create a second global context.

## Safety stage

Last gain limit before the speakers. Owner: `js/audio/mixBus.js`. Status: new. Persists: no.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `thresholdDb` | number | Yes | `-1` |
| `clipLinear` | number | Yes | `10 ** (-1 / 20)` |
| `peakDb` | number | No | Last measured peak for tests |

### Validation

- A dense six-note chord through this stage stays at or below `-1 dBFS`.
- Master volume `1.5` must not push the protected output above that limit.

## Imported mix

Volume and pan from the score. Owner: `js/tab/tabModel.js` `trackInfo`. Status: existing. Persists: inside the score.

| Field | Type | Range | Default |
| --- | --- | --- | --- |
| `volume` | number | 0..1 | `1` |
| `pan` | number | -1..1 | `0` |

`normalizeTrackInfo` already clamps these fields. This feature reads them. It does not change the parse contract.

## Playback source state

Learner-facing source label. Owner: `js/audio/sampleLoader.js`. Status: new. Persists: no.

| Value | When |
| --- | --- |
| `Loading guitar sounds` | A required pack fetch or decode is in progress. |
| `Studio ready` | A pack is present and ready. This feature has no production pack, so this value is for later features and fixtures. |
| `Synth fallback` | No pack, a failed pack, or the learner started before a pack was ready. |

### Transitions

1. Start → `Synth fallback` when no pack is needed or the pack is missing.
2. Start → `Loading guitar sounds` when a pack fetch begins.
3. Loading → `Studio ready` when decode succeeds.
4. Loading → `Synth fallback` when load or decode fails.
5. Ready pack must not replace an active note or an active loop pass. A new start may use the pack.

## Pack manifest

Description of one same-origin pack. Owner: `js/audio/samplePackRegistry.js`. Status: new. Persists: later as `assets/audio/packs/<id>/manifest.json`.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | Yes | Stable pack id, for example `core-drums`. |
| `version` | string | Yes | Pack version used in the cache name. |
| `license` | string | Yes | License name. |
| `attribution` | string | Yes | Credit text. |
| `sampleRate` | number | Yes | Hertz. |
| `instrument` | string | Yes | Instrument name. |
| `midiProgram` | number or number[] | No | Pitched program map. Required when the pack is not drums. |
| `drumNoteMap` | object | No | MIDI note to articulation map. Required when the pack is drums. |
| `samples` | SampleEntry[] | Yes | Sample list. May be empty in this feature. |

### SampleEntry

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `file` | string | Yes | Same-origin relative path. |
| `rootMidi` | number | Yes | Root MIDI note. |
| `velocityMin` | number | Yes | Inclusive 0..1 or 1..127. The registry documents one scale and keeps it. |
| `velocityMax` | number | Yes | Inclusive upper bound. |
| `roundRobin` | number | Yes | Round-robin index, 0-based. |
| `articulation` | string | Yes | Articulation name. |
| `loopStart` | number | No | Loop start in samples. |
| `loopEnd` | number | No | Loop end in samples. |
| `gainTrim` | number | Yes | Linear trim, default 1. |

### Validation

- `id` and `version` must be non-empty.
- `file` must be a same-origin relative path. It must not be an `http` URL to a foreign host.
- A production pack is out of scope. Tests may use a fixture manifest with zero or more tiny files.

## Pack load session

One attempt to fetch and decode packs for the current score. Owner: `js/audio/sampleLoader.js`. Status: new. Persists: no.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `scoreId` | string | Yes | Id of the score that started the load. |
| `packIds` | string[] | Yes | Packs the score needs. |
| `progress` | number | Yes | 0..1. |
| `status` | string | Yes | `idle`, `loading`, `ready`, `fallback`, `cancelled`. |
| `error` | string | No | Safe message for the fallback path. |
| `buffers` | object | No | Decoded buffers keyed by file path. |

### Transitions

1. `idle` → `loading` when a score asks for packs.
2. `loading` → `ready` when every required file decodes.
3. `loading` → `fallback` on miss, decode failure, or storage rejection.
4. `loading` → `cancelled` when a new score replaces the old score.
5. A cancelled session must not write buffers into the new score.

## Pack cache entry

Versioned Cache Storage record. Owner: `service-worker.js`. Status: new rule. Persists: yes.

| Field | Type | Meaning |
| --- | --- | --- |
| `cacheName` | string | `musi-pack-<packId>-<version>` |
| `urls` | string[] | Same-origin pack files |

The activate handler must keep names that start with `musi-pack-`. It may delete old app-shell names.

## Practice track volume

Existing learner override. Owner: `js/gpPlayer/playerState.js`. Status: extended. Persists: in the existing practice record.

This feature changes the first-load default from `1` to `trackInfo.volume`. It does not add a new storage key. A later user volume change still uses the existing save path.
