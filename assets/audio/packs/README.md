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

## Packs the user installs

The Settings screen has a Sounds block. It installs a pack from a file on this
device. Musi reads three formats:

| Format | The file to add | What Musi reads |
| --- | --- | --- |
| Musi pack | a ZIP with `manifest.json` | the manifest as it is |
| `.multisample` | the `.multisample` file | `multisample.xml` |
| SFZ | a ZIP with an `.sfz` file | the first `.sfz` file above its parts |

Every format is one archive that also holds the audio files. The files sit next
to the description file, or inside one folder with it. A `.multisample` file is
a ZIP, so you add it as it is. An SFZ instrument is a text file with no audio,
so put the `.sfz` file and its audio files in one ZIP first.

### The Musi pack format

The manifest is the same format as a core pack. A minimal pitched pack looks
like this:

```json
{
  "id": "my-nylon-guitar",
  "version": "1",
  "license": "CC0-1.0",
  "attribution": "Your name",
  "sampleRate": 44100,
  "instrument": "Nylon guitar",
  "midiProgram": [24, 25],
  "samples": [
    { "file": "n40.wav", "rootMidi": 40 },
    { "file": "n52.wav", "rootMidi": 52 }
  ]
}
```

Rules for an installed pack:

- Give the pack an `id` that no core pack uses.
- Keep every `file` value a plain relative name. An absolute path or a URL is
  rejected.
- The audio bytes go into the attachment store on this device. They do not sync
  and they do not reach the network.

### What the importer reads

`js/audio/packImport.js` turns an SFZ file or a `.multisample` file into the
manifest above.

- **SFZ opcodes:** `sample`, `key`, `lokey`, `hikey`, `pitch_keycenter`,
  `lovel`, `hivel`, `volume`, and `seq_position`. A region inherits the opcodes
  of the `<global>`, `<master>`, and `<group>` block above it. `<control>` sets
  `default_path`. A key is a number or a note name such as `c4` or `f#3`, and
  middle C is C4. The reader also handles `//` comments, `/* */` comments,
  `#define`, and `#include`.
- **`.multisample` elements:** the `file` and `gain` attributes of each
  `<sample>`, plus its `<key>` and `<velocity>` children.
- **Gain:** a `volume` opcode and a `gain` attribute are decibels. The importer
  writes `gainTrim` as a linear value.

### Pack kinds

Every pack is an **instrument** or a **drum kit**.

- A kit holds a `drumNoteMap`. The importer writes one when the file gives one
  key to each sound and the keys sit in the General MIDI percussion range.
- The user can state the kind before the import instead.
- An instrument shows in the pitched score list and in the pitch training list.
  A kit shows in the percussion list only.

An imported pack carries `pickOnly: true`, because SFZ and `.multisample` state
no MIDI program. Such a pack plays only when the user names it in Settings. It
never matches a track program or a drum note by itself.

### Limits

- A pack holds 128 sample files at most. A bigger library thins down: a round
  robin past the first one goes first, then the velocity layers collapse to one
  layer for each key, then the keys thin out evenly over the range.
- The whole file is 64 MB at most.

The Sounds block also installs a single audio file as a metronome click. The
accent plays the same file a little higher and a little louder.

## Which pack each surface plays

Each surface keeps its own voice setting, because each one has a different job.

| Surface | Setting | Default |
| --- | --- | --- |
| Score player, pitched tracks | `sound.scoreVoice` | the core packs |
| Score player, percussion tracks | `sound.drumVoice` | `core-drums` |
| Pitch training tools | `sound.pitchVoice` | the built-in trainer tone |
| Metronome | `sound.metroVoice` | the wood block |

`js/audio/soundPrefs.js` holds the four settings. The pitch tools read
`js/audio/pitchVoice.js`, which loads the chosen pack and plays one note for the
ear. Until the samples are ready, each tool plays its own oscillator, so a tool
is never silent while a pack loads.

Run `node tests/sounds/run.mjs` to check the four settings, the importer, and
the archive install path. Run `node tests/gp-player/drum-voice.mjs` to check
that the percussion tracks follow their own setting.

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
