# Sound packs

Sound packs live under `assets/audio/packs/<id>/`.

Each pack has a `manifest.json` file and same-origin sample files listed in that manifest.

## Core packs

| Pack id | Instrument | MIDI programs | License |
| --- | --- | --- | --- |
| `core-guitar` | Electric guitar (Wavebase strat) | 26, 27, 28 | CC0-1.0 (Wavebase) |
| `core-guitar-steel` | Steel guitar (FluidR3) | 24, 25 | MIT (FluidR3) |
| `core-guitar-drive` | Overdriven guitar (FluidR3) | 29, 30, 31 | MIT (FluidR3) |
| `core-bass` | Bass (Wavebase) | 32–39 | CC0-1.0 (Wavebase) |
| `core-keys` | Piano (FluidR3) | 0–23 | MIT (FluidR3) |
| `core-drums` | Drum kit (Wavebase) | `drumNoteMap` | CC0-1.0 (Wavebase) |

Wavebase recordings are CC0-1.0. FluidR3 samples are MIT.

## Rules

- Use same-origin paths only. Do not load audio from a third-party URL.
- Do not put pack files in the app-shell precache list (`PRECACHE_URLS` in `service-worker.js`).
- The loader stores installed packs in Cache Storage under `musi-pack-<id>-<version>`.

## Registration

`js/audio/packCatalog.js` fetches each core manifest and registers it at score load.
The Guitar Pro player uses samples when the load session is ready. Otherwise it uses synth voices.

To rebuild the committed MP3 files, run `python3 scripts/fetch-core-packs.py` from the repo root.
