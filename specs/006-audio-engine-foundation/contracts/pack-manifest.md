# Contract: pack manifest

**Owner module**: `js/audio/samplePackRegistry.js`

**Consumers**: `js/audio/sampleLoader.js`, later Features 007 and 009

**Requirements**: FR-019, FR-020, FR-034, FR-035

## 1. Purpose

Describe a same-origin sound pack without shipping production samples in this feature.

## 2. Path

```text
assets/audio/packs/<pack-id>/manifest.json
assets/audio/packs/<pack-id>/<sample-file>
assets/audio/impulses/<impulse-file>
```

This feature may add the folders and a README.
It must not add production `wav` or `flac` files.

## 3. Manifest shape

```json
{
  "id": "core-drums",
  "version": "1",
  "license": "CC0-1.0",
  "attribution": "Musi test fixture",
  "sampleRate": 48000,
  "instrument": "Drum kit",
  "midiProgram": null,
  "drumNoteMap": { "36": "kick" },
  "samples": [
    {
      "file": "kick-v1-rr0.wav",
      "rootMidi": 36,
      "velocityMin": 0,
      "velocityMax": 1,
      "roundRobin": 0,
      "articulation": "kick",
      "loopStart": null,
      "loopEnd": null,
      "gainTrim": 1
    }
  ]
}
```

A pitched pack uses `midiProgram` and may omit `drumNoteMap`.
A drum pack uses `drumNoteMap` and may set `midiProgram` to `null`.

## 4. Validation

`parsePackManifest(json)` must:

1. Reject a missing `id`, `version`, `license`, `attribution`, `sampleRate`, or `instrument`.
2. Reject a foreign `http` or `https` host in any `file` field.
3. Reject a `file` that leaves the pack directory.
4. Accept an empty `samples` array.
5. Return `{ ok: true, manifest }` or `{ ok: false, error }`.

Velocity fields use the 0..1 scale.
A fixture that uses 1..127 must be normalized on parse.

## 5. Registry

```javascript
export function parsePackManifest(json)
export function registerPack(manifest)
export function getPack(packId)
export function listPacks()
export function packsForPrograms(programs)
export function packsForDrumMap(noteNumbers)
```

`packsForPrograms` returns the pack ids that cover the MIDI programs in the current score.
With no registered pack, it returns `[]`.

## 6. License

Each later production pack must commit license text beside the manifest.
This feature commits no production license file because it ships no production pack.

## 7. Test hooks

| Case | Expected result |
| --- | --- |
| Valid empty samples | `{ ok: true }` |
| Missing id | `{ ok: false }` |
| Foreign file URL | `{ ok: false }` |
| Path escape `../` | `{ ok: false }` |
| `packsForPrograms([27])` with no packs | `[]` |
