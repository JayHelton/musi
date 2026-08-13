# Quickstart: Guitar Pro Player Unload

**Feature**: `003-gp-player-unload` | **Date**: 2026-08-13 | **Plan**: [plan.md](./plan.md)

## Purpose

This guide proves Close score on the Guitar Pro Player screen. Follow the steps in order.

## Prerequisites

- Node.js 18 or newer.
- Python 3 for the static HTTP server.

The feature needs no `npm install` and no build step.
Run all commands from the repository root.

## Automated checks

| Step | Command | Expected final line |
| --- | --- | --- |
| 1 | `node tests/gp-player/run.mjs` | `gp-player suite: ok` |
| 2 | `node tests/gp-player/unload.mjs` | `gp-player unload: ok` |
| 3 | `node cli/bin/musi.js --help` | Help text. Proves the CLI still starts. |

## Browser check

1. Serve the repo root:

```bash
python3 -m http.server 8080
```

2. Open `http://localhost:8080`.
3. Do a hard reload so the service worker picks up the new cache name.
4. Open the Guitar Pro Player tool.
5. Load a `.gp` or `.gp5` file, or open a saved score.
6. Confirm the score view.
7. Choose **Close score** in the header.
8. Confirm the drop area and the saved-score list.
9. Confirm the page did not reload.
10. If playback was on, confirm silence.
11. Load a second score. Confirm that score.
12. Close it again. Leave the tool. Return. Confirm the empty player.
13. Open the player menu on a loaded score. Confirm a **Close score** row.

## Pass rules

- SC-001: empty player in 1 action, under 3 seconds.
- SC-002: second score opens with no page refresh.
- SC-003: audio stops at once.
- SC-004: library scores remain.
- SC-005: leave and return still shows the empty player.
