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
The Guitar Pro player uses samples when the load session is ready. Otherwise it uses the synth pack.

To rebuild the committed MP3 files, run `python3 scripts/fetch-core-packs.py` from the repo root.

## Synth pack

The synth pack sounds when no sample pack is ready. It ships no audio files.
`js/gpPlayer/stringSynth.js` renders each note in the browser.

| Family | MIDI programs | Model |
| --- | --- | --- |
| `cleanGuitar` | 26–28 | Plucked string |
| `acousticGuitar` | 24, 25 | Plucked string with a body resonance |
| `distortedGuitar` | 29–31 | Plucked string with drive and an amp filter |
| `bass` | 32–39 | Plucked string, dark and long |
| `keys` | 0–23 | Additive partials with piano inharmonicity |

The plucked families use an extended Karplus-Strong model. A short noise burst
drives a tuned delay line. A damping filter in the loop removes the high
partials over time, the same way a real string loses them. The pick position
sets a comb notch, which gives the attack its edge.

The renderer builds one buffer for each family and each note. The player then
plays the buffer. The buffer holds the body of the tone. The playback stage adds
the velocity tone filter, the envelope, the bends, the slides, and the vibrato.

- The buffer cache holds about 60 seconds of audio for each audio context.
- The cache drops the least recent note when it passes that budget.
- `gpMixPlayer` prewarms the notes of the score in idle time at the start of playback.
- Each family renders at its own sample rate, because a dark voice needs fewer samples.

Run `node tests/gp-player/string-synth.mjs` to check tuning, decay, and the cache.
