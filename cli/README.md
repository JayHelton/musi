# musi CLI

A terminal version of Musi's **Quiz** and **Train** sections, plus a **Learn**
(scale reference) browser — so you can drill music theory between compiles,
right from your shell.

It reuses the exact same music-theory logic as the web app
(`js/theory.js`, `js/scales.js`, `js/intervals.js`), so quizzes behave
identically. No build step and **zero npm dependencies** — just Node.

## Requirements

- Node.js 18+
- (Optional) a command-line audio player for the **ear trainer**, **pitch (scale
  playback)**, and **sight reading** note playback:
  - macOS: `afplay` (built in)
  - Linux: `paplay`, `aplay`, `ffplay`, or `play` (sox)
  - Windows: PowerShell (built in)

## Install / run

From the repo root:

```bash
cd cli
node bin/musi.js          # interactive menu
```

Or link it as a global `musi` command:

```bash
cd cli
npm link                  # now `musi` is on your PATH
musi
```

## Usage

Open the interactive menu:

```bash
musi
```

Or jump straight into an activity:

```bash
musi scale --root C --type "Major (Ionian)"
musi interval --diff medium
musi sight --clef Treble --diff easy
musi fretboard --key C --tuning Standard
musi ear --key D --mode easy
musi pitch --root A --type "Natural Minor (Aeolian)" --tempo 120
musi reference --root F --type Dorian
musi --help
```

If you omit flags, each activity asks you to pick its options interactively.

## Activities

| Command     | Section | What you practice |
|-------------|---------|-------------------|
| `scale`     | Quiz    | Spell every note of a named scale, in order |
| `interval`  | Quiz    | Name the note a given interval above a root |
| `sight`     | Quiz    | Read a note drawn on an ASCII staff (treble/bass); plays the note after each answer |
| `fretboard` | Train   | Locate a note on an ASCII fretboard and name its interval |
| `ear`       | Train   | Identify a scale degree by ear (plays tones) |
| `pitch`     | Pitch   | Play a scale (or segment) back at tempo, like the web Pitch tool |
| `reference` | Learn   | Browse scale degrees, intervals, diatonic chords & 3-NPS tab |

## In-quiz controls

While answering, type your answer, or one of:

- `q` — quit back to the menu
- `s` — reveal the answer
- `h` — show a hint (where available)
- `r` — replay the audio (ear trainer, sight reading)

Set `NO_COLOR=1` to disable ANSI colors.

## Flags

| Flag | Activities | Values |
|------|------------|--------|
| `--root` | scale, interval, reference | `C`, `F#`, `Bb`, … |
| `--type` | scale, reference | a scale name, e.g. `"Major (Ionian)"`, `Dorian` |
| `--diff` | interval, sight | `easy`, `medium`, `hard` |
| `--clef` | sight | `Treble`, `Bass`, `both` |
| `--key` | fretboard, ear | `C`, `F#`, … |
| `--tuning` | fretboard | `Standard`, `Drop D`, `DADGAD`, … |
| `--mode` | ear | `easy` (root first), `hard` (note only) |
| `--type` / `--scale` | pitch | a scale name, e.g. `"Major (Ionian)"`, `Dorian` |
| `--octave` | pitch | base octave `2`–`6` (default `4`) |
| `--tempo` | pitch | beats per minute `30`–`300` (default `100`) |
| `--start` | pitch | scale degree to start on (default `1`) |
| `--count` | pitch | number of notes to play `1`–`16` (default `8`) |
| `--step` | pitch | degree skip: `1` 2nds, `2` thirds, `3` fourths, `4` fifths |
