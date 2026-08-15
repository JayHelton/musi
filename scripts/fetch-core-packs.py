#!/usr/bin/env python3
"""Fetch licensed core packs and write manifests. Run from the repo root."""

from __future__ import annotations

import json
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKS = ROOT / "assets" / "audio" / "packs"
TMP = ROOT / ".tmp-pack-fetch"

WAVEBASE = "https://media.githubusercontent.com/media/cluesurf/wavebase/make"
FLUID = (
    "https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/"
    "gh-pages/FluidR3_GM"
)

PC_WAVE = {
    "C": 0, "Cx": 1, "D": 2, "Dx": 3, "E": 4, "F": 5,
    "Fx": 6, "G": 7, "Gx": 8, "A": 9, "Ax": 10, "B": 11,
}
PC_FLUID = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]


def midi_from_wave_token(token: str) -> int | None:
    for name, pc in sorted(PC_WAVE.items(), key=lambda x: -len(x[0])):
        if token.startswith(name) and token[len(name) :].isdigit():
            octave = int(token[len(name) :])
            return (octave + 1) * 12 + pc
    return None


def fluid_name(midi: int) -> str:
    pc = midi % 12
    octave = midi // 12 - 1
    return f"{PC_FLUID[pc]}{octave}"


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"GET {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "musi-pack-fetch/1"})
    with urllib.request.urlopen(req, timeout=60) as res:
        data = res.read()
    if len(data) < 200:
        raise RuntimeError(f"Tiny response for {url} ({len(data)} bytes)")
    dest.write_bytes(data)


def to_mp3(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(src),
        "-ac", "1", "-ar", "44100",
        "-c:a", "libmp3lame", "-q:a", "4",
        str(dest),
    ]
    subprocess.run(cmd, check=True)


def write_license(pack_dir: Path, text: str) -> None:
    (pack_dir / "LICENSE.txt").write_text(text.strip() + "\n", encoding="utf-8")


def write_manifest(pack_dir: Path, manifest: dict) -> None:
    (pack_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n",
        encoding="utf-8",
    )


def sample_entry(file: str, root_midi: int, articulation: str) -> dict:
    return {
        "file": file,
        "rootMidi": root_midi,
        "velocityMin": 0,
        "velocityMax": 1,
        "roundRobin": 0,
        "articulation": articulation,
        "loopStart": None,
        "loopEnd": None,
        "gainTrim": 1,
    }


def index_wavebase(folder: str, names: list[str]) -> dict[int, str]:
    out: dict[int, str] = {}
    for name in names:
        if "-as-" not in name:
            continue
        token = name.rsplit("-as-", 1)[1].removesuffix(".wav")
        midi = midi_from_wave_token(token)
        if midi is None:
            continue
        out[midi] = f"{WAVEBASE}/{folder}/{name}"
    return out


STRAT_FILES = [
    "string-1-A-as-A4.wav", "string-1-A-as-A5.wav",
    "string-1-Ax-as-Ax4.wav", "string-1-Ax-as-Ax5.wav",
    "string-1-B-as-B4.wav", "string-1-B-as-B5.wav",
    "string-1-C-as-C5.wav", "string-1-C-as-C6.wav",
    "string-1-Cx-as-Cx5.wav", "string-1-Cx-as-Cx6.wav",
    "string-1-D-as-D5.wav", "string-1-Dx-as-Dx5.wav",
    "string-1-E-as-E4.wav", "string-1-E-as-E5.wav",
    "string-1-F-as-F4.wav", "string-1-F-as-F5.wav",
    "string-1-Fx-as-Fx4.wav", "string-1-Fx-as-Fx5.wav",
    "string-1-G-as-G4.wav", "string-1-G-as-G5.wav",
    "string-1-Gx-as-Gx4.wav", "string-1-Gx-as-Gx5.wav",
    "string-2-B-as-B3.wav", "string-2-C-as-C4.wav",
    "string-2-Cx-as-Cx4.wav", "string-2-D-as-D4.wav",
    "string-2-Dx-as-Dx4.wav",
    "string-3-A-as-A3.wav", "string-3-Ax-as-Ax3.wav",
    "string-3-G-as-G3.wav", "string-3-Gx-as-Gx3.wav",
    "string-4-D-as-D3.wav", "string-4-Dx-as-Dx3.wav",
    "string-4-E-as-E3.wav", "string-4-F-as-F3.wav",
    "string-4-Fx-as-Fx3.wav",
    "string-5-A-as-A2.wav", "string-5-Ax-as-Ax2.wav",
    "string-5-B-as-B2.wav", "string-5-C-as-C3.wav",
    "string-5-Cx-as-Cx3.wav",
    "string-6-D-as-D2.wav", "string-6-Dx-as-Dx2.wav",
    "string-6-E-as-E2.wav", "string-6-F-as-F2.wav",
    "string-6-Fx-as-Fx2.wav", "string-6-G-as-G2.wav",
    "string-6-Gx-as-Gx2.wav",
]

BASS_FILES = [
    "string-1-A-as-A2.wav", "string-1-A-as-A3.wav",
    "string-1-Ax-as-Ax2.wav", "string-1-Ax-as-Ax3.wav",
    "string-1-B-as-B2.wav", "string-1-B-as-B3.wav",
    "string-1-C-as-C3.wav", "string-1-C-as-C4.wav",
    "string-1-Cx-as-Cx3.wav", "string-1-Cx-as-Cx4.wav",
    "string-1-D-as-D3.wav", "string-1-D-as-D4.wav",
    "string-1-Dx-as-Dx3.wav", "string-1-Dx-as-Dx4.wav",
    "string-1-E-as-E3.wav", "string-1-E-as-E4.wav",
    "string-1-F-as-F3.wav", "string-1-F-as-F4.wav",
    "string-1-Fx-as-Fx3.wav", "string-1-Fx-as-Fx4.wav",
    "string-1-G-as-G2.wav", "string-1-G-as-G3.wav", "string-1-G-as-G4.wav",
    "string-1-Gx-as-Gx2.wav", "string-1-Gx-as-Gx3.wav",
    "string-2-D-as-D2.wav", "string-2-Dx-as-Dx2.wav",
    "string-2-E-as-E2.wav", "string-2-F-as-F2.wav", "string-2-Fx-as-Fx2.wav",
    "string-3-A-as-A1.wav", "string-3-Ax-as-Ax1.wav",
    "string-3-B-as-B1.wav", "string-3-C-as-C2.wav", "string-3-Cx-as-Cx2.wav",
    "string-4-D-as-D1.wav", "string-4-Dx-as-Dx1.wav",
    "string-4-E-as-E1.wav", "string-4-F-as-F1.wav",
    "string-4-Fx-as-Fx1.wav", "string-4-G-as-G1.wav", "string-4-Gx-as-Gx1.wav",
]


def pick_every(midis: list[int], step: int) -> list[int]:
    return [m for i, m in enumerate(sorted(midis)) if i % step == 0]


def build_pitched_from_wavebase(
    pack_id: str,
    instrument: str,
    programs,
    folder: str,
    files: list[str],
    lo: int,
    hi: int,
    step: int,
    license_text: str,
) -> None:
    pack_dir = PACKS / pack_id
    pack_dir.mkdir(parents=True, exist_ok=True)
    index = index_wavebase(folder, files)
    wanted = [m for m in range(lo, hi + 1) if m in index][::step]
    if not wanted:
        raise RuntimeError(f"No wavebase notes for {pack_id}")
    samples = []
    for midi in wanted:
        name = f"n{midi}.mp3"
        raw = TMP / pack_id / f"{midi}.wav"
        dest = pack_dir / name
        if not dest.exists():
            download(index[midi], raw)
            to_mp3(raw, dest)
        samples.append(sample_entry(name, midi, "sustain"))
    write_license(pack_dir, license_text)
    write_manifest(pack_dir, {
        "id": pack_id,
        "version": "1",
        "license": "CC0-1.0",
        "attribution": "ClueSurf Wavebase public-domain recordings",
        "sampleRate": 44100,
        "instrument": instrument,
        "midiProgram": programs,
        "samples": samples,
    })


def build_pitched_from_fluid(
    pack_id: str,
    instrument: str,
    programs,
    fluid_folder: str,
    midis: list[int],
    license_text: str,
) -> None:
    pack_dir = PACKS / pack_id
    pack_dir.mkdir(parents=True, exist_ok=True)
    samples = []
    for midi in midis:
        name = f"n{midi}.mp3"
        dest = pack_dir / name
        if not dest.exists():
            url = f"{FLUID}/{fluid_folder}/{fluid_name(midi)}.mp3"
            download(url, dest)
            if dest.stat().st_size < 200:
                raise RuntimeError(f"Bad FluidR3 file {dest}")
        samples.append(sample_entry(name, midi, "sustain"))
    write_license(pack_dir, license_text)
    write_manifest(pack_dir, {
        "id": pack_id,
        "version": "1",
        "license": "MIT",
        "attribution": "FluidR3 GM by Frank Wen, rendered by midi-js-soundfonts",
        "sampleRate": 44100,
        "instrument": instrument,
        "midiProgram": programs,
        "samples": samples,
    })


def build_drums(license_text: str) -> None:
    pack_id = "core-drums"
    pack_dir = PACKS / pack_id
    pack_dir.mkdir(parents=True, exist_ok=True)
    hits = [
        ("kick.wav", "kick", [35, 36]),
        ("snare.wav", "snare", [38, 40]),
        ("stick.wav", "snareGhost", [37, 39]),
        ("hat-closed.wav", "hihatClosed", [42, 44]),
        ("hat-opened.wav", "hihatOpen", [46]),
        ("crash.wav", "crash", [49, 52, 55, 57]),
        ("ride.wav", "ride", [51, 53, 59]),
        ("tom.wav", "tomMid", [45, 47]),
        ("tom-2.wav", "tomHigh", [48, 50]),
        ("kick-2.wav", "tomFloor", [41, 43]),
    ]
    samples = []
    drum_map = {}
    for src_name, artic, notes in hits:
        dest_name = f"{artic}.mp3"
        dest = pack_dir / dest_name
        if not dest.exists():
            raw = TMP / pack_id / src_name
            download(f"{WAVEBASE}/base/drum/{src_name}", raw)
            to_mp3(raw, dest)
        root = notes[0]
        samples.append(sample_entry(dest_name, root, artic))
        for n in notes:
            drum_map[str(n)] = artic
    write_license(pack_dir, license_text)
    write_manifest(pack_dir, {
        "id": pack_id,
        "version": "1",
        "license": "CC0-1.0",
        "attribution": "ClueSurf Wavebase public-domain drum hits",
        "sampleRate": 44100,
        "instrument": "Drum kit",
        "midiProgram": None,
        "drumNoteMap": drum_map,
        "samples": samples,
    })


WAVE_LICENSE = """
Wavebase instrument recordings by ClueSurf.
License: public domain / CC0-1.0.
Source: https://github.com/cluesurf/wavebase
"""

FLUID_LICENSE = """
Fluid (R3) SoundFont
Copyright (c) 2000-2002, 2008 Frank Wen <getfrank@gmail.com>
Released under the MIT license.

These MP3 notes were rendered by midi-js-soundfonts
(https://github.com/gleitz/midi-js-soundfonts) from FluidR3_GM.sf2.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""


def main() -> int:
    TMP.mkdir(parents=True, exist_ok=True)
    PACKS.mkdir(parents=True, exist_ok=True)

    guitar_step = 3
    build_pitched_from_wavebase(
        "core-guitar",
        "Electric guitar",
        [26, 27, 28],
        "base/guitar/stratocaster",
        STRAT_FILES,
        40,
        84,
        guitar_step,
        WAVE_LICENSE,
    )
    build_pitched_from_wavebase(
        "core-bass",
        "Electric bass",
        [32, 33, 34, 35, 36, 37, 38, 39],
        "base/bass",
        BASS_FILES,
        28,
        67,
        guitar_step,
        WAVE_LICENSE,
    )
    build_drums(WAVE_LICENSE)

    steel = list(range(40, 85, 3))
    keys = list(range(36, 85, 3))
    drive = list(range(40, 85, 3))
    build_pitched_from_fluid(
        "core-guitar-steel",
        "Steel-string guitar",
        [24, 25],
        "acoustic_guitar_steel-mp3",
        steel,
        FLUID_LICENSE,
    )
    build_pitched_from_fluid(
        "core-guitar-drive",
        "Overdriven guitar",
        [29, 30, 31],
        "overdriven_guitar-mp3",
        drive,
        FLUID_LICENSE,
    )
    build_pitched_from_fluid(
        "core-keys",
        "Acoustic piano",
        list(range(0, 24)),
        "acoustic_grand_piano-mp3",
        keys,
        FLUID_LICENSE,
    )
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
