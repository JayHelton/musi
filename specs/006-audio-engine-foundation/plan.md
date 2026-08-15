# Implementation Plan: Audio Engine Foundation

**Branch**: `006-audio-engine-foundation` | **Date**: 2026-08-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-audio-engine-foundation/spec.md`

## Summary

Build the shared audio foundation for later sample packs.

This feature adds one audio owner, one mix graph with track buses and a final safety stage, imported track volume and pan, a pack manifest contract, and a pack loader that ships no production samples. The current wavetable voices stay as the sounding fallback. The first score render does not wait for a pack. A missing pack uses the fallback and raises no unhandled error.

This feature records a new architecture decision that replaces decision D13 in `specs/002-gp-player-overhaul/research.md`. The old D13 text stays as history. See [research.md](./research.md) decision D1.

This feature does not add a production drum pack, a drone rewrite, or guitar sample voices. Those belong to Features 007, 008, and 009.

## Technical Context

**Language/Version**: JavaScript, ES2020 modules in the browser. Node.js 18 or newer for the test runners. The repository runs Node.js 22 today.

**Primary Dependencies**: None. The web app has no framework and no build step. The CLI has no npm dependency. This feature adds no dependency. It uses these platform APIs: Web Audio (`AudioContext`, `OfflineAudioContext`, `GainNode`, `StereoPannerNode`, `DynamicsCompressorNode`, `AnalyserNode`, `WaveShaperNode`), Cache Storage, and `fetch` for same-origin pack files.

**Storage**: Browser storage only. Cache Storage holds optional packs in a versioned cache that is not the app-shell cache. Local storage keeps existing practice settings. This feature adds no IndexedDB store.

**Testing**: Plain Node scripts under `tests/`. Keep `node tests/gp-player/run.mjs` as the Guitar Pro suite. Add Node tests for the owner, the manifest, the loader, and imported mix values. Add browser harness pages `audio-owner.html` and `pack-fallback.html` under `tests/gp-player/audio/`. Update `peak-headroom.html` to the `-1 dBFS` limit. Keep the current timing, loop, drift, and peak pages.

**Target Platform**: Evergreen browsers. Android Chrome as an installed PWA, plus desktop Chrome and Firefox, plus iOS Safari. Core playback must work offline with the synth fallback after one earlier online visit.

**Project Type**: Static frontend PWA at the repository root, with a zero-dependency Node CLI companion in `cli/`. This feature changes the web audio path only. The CLI gains no playback engine.

**Performance Goals**: The first score view does not wait for pack decode. A dense six-note chord stays at or below `-1 dBFS`. Note onset stays within 20 milliseconds of the scheduled start. A loop gap stays at or below 10 milliseconds. After a stop action, no owned voice remains after 1 second. New sound-engine code stays at or below 150 KiB before compression.

**Constraints**: No backend. No build step. No npm package in the CLI. No third-party audio URL. No production sample files in this feature. Optional packs must not sit in `PRECACHE_URLS`. The service worker must not delete pack caches when it activates a new app-shell cache. The Guitar Pro parser, score renderer, timeline, and practice UI stay in place.

**Scale/Scope**: One shared mix graph. One owner registry. Track buses for every Guitar Pro track in a score of up to about 24 tracks. A pack registry and loader that can later serve Features 007 and 009. About six new modules under `js/audio/`. Two new browser harness pages. One new architecture decision that replaces 002-D13.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
| --- | --- | --- |
| I. Static-First Architecture | Pass | No backend, no build step, no CLI npm package. Packs are same-origin static files. |
| II. Shared Theory Engine | Pass | This feature does not move theory logic. New modules live under `js/audio/` and stay free of CLI npm use. |
| III. Atomic Purple Game Boy Color UI | Pass | The status label uses the current player chrome and theme tokens. This feature adds no new visual system. |
| IV. Verify Before Ship | Pass | The plan keeps `node tests/gp-player/run.mjs`, extends the browser harness, and requires a hard reload or a service-worker cache bump. |
| V. Spec-Driven Feature Work | Pass | Feature 006 uses Spec Kit only. It does not add MiniSpec files to this folder. |

Post-design re-check: Pass. The contracts stay inside the static PWA. The pack cache rule keeps the app shell independent from optional packs.

## Project Structure

### Documentation (this feature)

```text
specs/006-audio-engine-foundation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── audio-owner.md
│   ├── mix-bus.md
│   ├── pack-manifest.md
│   └── pack-loader.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
js/
├── audio.js                      # KEEP. Owns AudioContext, mic, master volume.
├── audio/                        # NEW. Shared audio foundation.
│   ├── audioOwner.js             # NEW. Single long-running owner registry.
│   ├── mixBus.js                 # NEW. Track buses, mix, safety, analyser tap.
│   ├── samplePackRegistry.js     # NEW. Manifest contract and pack index.
│   └── sampleLoader.js           # NEW. Fetch, decode, progress, cancel, fallback.
├── gpMixPlayer.js                # EXTEND. Claim owner, use track buses, apply source mix.
├── gpPlayer/instrumentVoices.js  # KEEP as fallback. Change headroom rule.
├── gpPlayer/playerState.js       # EXTEND. Init volume and pan from trackInfo.
├── gpPlayer/trackMixer.js        # EXTEND. Show source mix. Keep mute and solo.
├── gpPlayerUI.js                 # EXTEND. Source status label. Claim on play.
├── keyboard.js                   # EXTEND. Claim and release the owner.
├── metronome.js                  # EXTEND. Claim and release the owner.
├── drums/drumEngine.js           # EXTEND. Claim and release the owner.
├── studyLabMic.js                # EXTEND. Claim the owner. Keep the current drone until Feature 008.
└── service-worker.js             # EXTEND. Precache new modules. Keep pack caches.

assets/audio/                     # NEW. Empty same-origin tree. No production samples.
├── packs/
│   └── README.md                 # NEW. Pack layout and license rule.
└── impulses/
    └── README.md                 # NEW. Reserved for Feature 010.

tests/gp-player/
├── run.mjs                       # KEEP. Must still pass.
├── run-browser.mjs               # EXTEND. Register new harness pages.
├── offline-manifest.mjs          # EXTEND. Precache new js/audio modules. Exclude packs.
├── audio-owner.mjs               # NEW. Node owner tests.
├── pack-manifest.mjs             # NEW. Manifest contract tests.
├── pack-loader.mjs               # NEW. Loader cancel and fallback tests.
├── imported-mix.mjs              # NEW. Source volume and pan tests.
└── audio/
    ├── peak-headroom.html        # EXTEND. Limit becomes -1 dBFS through the safety stage.
    ├── audio-owner.html          # NEW.
    └── pack-fallback.html        # NEW.
```

**Structure Decision**: Keep the static PWA at the repository root. Add a new `js/audio/` folder for the shared foundation. Keep `js/audio.js` as the single `AudioContext` owner. Do not add `sampleVoice.js` or `droneVoice.js` in this feature. Those modules belong to Features 009 and 008.

## Complexity Tracking

> No constitution violation. This table stays empty on purpose.

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| — | — | — |

## Phase 0 and Phase 1 outputs

- [research.md](./research.md) records the decisions, including the D13 replacement.
- [data-model.md](./data-model.md) names the owner, the buses, the manifest, and the load session.
- [contracts/](./contracts/) defines the owner, mix bus, manifest, and loader interfaces.
- [quickstart.md](./quickstart.md) lists the verification commands for this feature.
