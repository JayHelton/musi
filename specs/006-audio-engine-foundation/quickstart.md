# Quickstart: Audio Engine Foundation

**Feature**: `006-audio-engine-foundation` | **Date**: 2026-08-14 | **Plan**: [plan.md](./plan.md)

## Purpose

This guide validates the audio engine foundation.
A reader can prove fallback playback, one audio owner, imported mix, peak safety, and pack fallback.
Follow each section in order.
Do not use this file as an implementation guide.

## Prerequisites

- Node.js 18 or newer.
- Python 3 for the static HTTP server.
- `google-chrome` on PATH for the browser harness.

The feature needs no `npm install` and no build step.
Run all commands from the repository root unless a command says otherwise.

Build Guitar Pro fixtures before the first test run:

```bash
node tests/gp-player/fixtures/makeFixtures.mjs
```

## 1. Current Guitar Pro suite

The current suite must keep its pass result.

```bash
node tests/gp-player/run.mjs
```

Expected: every current Guitar Pro Node test passes.

## 2. New Node tests

After implementation, run the new Node files through the same suite or directly:

```bash
node tests/gp-player/audio-owner.mjs
node tests/gp-player/pack-manifest.mjs
node tests/gp-player/pack-loader.mjs
node tests/gp-player/imported-mix.mjs
node tests/gp-player/offline-manifest.mjs
```

Expected:

- A second claim stops or pauses the first owner.
- A foreign pack URL fails parse.
- A missing pack returns `status: 'fallback'` and does not throw.
- A score with `trackInfo.volume` `0.4` and pan `-1` applies those values on first load.
- New `js/audio/*.js` files sit in the app-shell list.
- `assets/audio/packs/` files do not sit in the app-shell list.

## 3. Browser harness

Start the static server:

```bash
python3 -m http.server 8080
```

In another terminal:

```bash
node tests/gp-player/run-browser.mjs peak-headroom.html audio-owner.html pack-fallback.html onset-timing.html loop-boundary.html
```

Expected:

- `peak-headroom.html` reports a protected peak at or below `-1 dBFS`.
- `audio-owner.html` reports one active owner after a paired start.
- `pack-fallback.html` reports fallback with no unhandled error.
- Onset error stays at or below 20 milliseconds.
- Loop gap stays at or below 10 milliseconds.

## 4. First render and Play

1. Open `http://localhost:8080`.
2. Open a saved Guitar Pro score.
3. Confirm the score appears before any pack status reaches `Studio ready`.
4. Press Play at once.
5. Confirm sound starts and the status shows `Synth fallback`.

Expected: the score does not wait for extra sound files.

## 5. Owner check

1. Start Guitar Pro playback.
2. Open the keyboard and play a held note.
3. Confirm the score stops or pauses.
4. Start the metronome.
5. Confirm the keyboard stops.

Expected: only one long-running source remains.

## 6. Imported mix

1. Open a score whose tracks have different source volumes and opposite pan.
2. Press Play without a mixer change.
3. Confirm the quieter track is quieter.
4. Confirm the panned track is stronger on the named side.
5. Mute one track. Confirm the other tracks keep their mix.

## 7. Size and cache

Measure new sound-engine files:

```bash
wc -c js/audio/*.js
```

Expected: the total stays at or below 150 KiB.

Inspect `service-worker.js`:

- `CACHE_VERSION` has a new value.
- `PRECACHE_URLS` includes each new `js/audio/` module.
- `PRECACHE_URLS` omits `assets/audio/packs/`.
- The activate handler keeps cache names that start with `musi-pack-`.

## 8. Offline fallback

1. Load the app once while online.
2. Turn the network off.
3. Reload.
4. Open a saved score and press Play.

Expected: the synth fallback still sounds. The score still appears.

## Out of scope for this guide

- Drum sample choke and round robin. Those belong to Feature 007.
- Keyboard Play and Drone modes. Those belong to Feature 008.
- Guitar and bass sample voices. Those belong to Feature 009.
- Pack install UI and the listening lab. Those belong to Feature 010.
