# Guitar Tab Analyzer Roadmap

This document is the planning record for a new **Tab Analyzer** feature: paste or
upload a guitar tab (plain text or PDF), pick the tuning, and get an in‑depth
music‑theory breakdown — key / tonal center(s), chords and progression, the
scales and arpeggios used to build the riffs and solos, and a catalog of the
playing techniques employed.

Like the rest of Musi, the analyzer must ship as **static, zero‑build frontend
code** with a **shared CLI companion**. All heavy lifting (parsing + analysis)
lives in **pure, DOM‑free ES modules under `js/`** so the web view and the CLI
can both call it.

**Status:** Phases 0–4 are **Implemented** (text + best‑effort PDF, web view and
CLI parity). Phase 5 remains **Planned**.

## Status summary

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 0 | Extract shared detection engine (key + chord) from feature modules | Implemented |
| 1 | Text tab parser → structured note/event model (tuning‑aware) | Implemented |
| 2 | Key / tonal‑center + chord + progression (roman numerals) | Implemented |
| 3 | Scale detection, arpeggio detection, technique catalog, riff/solo segmentation | Implemented |
| 4 | Web UI, PDF ingestion, fretboard overlays, playback | Implemented |
| 5 | Advanced: windowed modulation, modal refinement, confidence, export | Planned |

### What shipped

- **Engine** (pure, CLI‑safe): `js/tab/tabParser.js`, `js/tab/tabModel.js`,
  `js/tab/tabAnalyzer.js`, and `js/analysis/{keyDetect,chordDetect,pitchClass,
  scaleDetect,arpeggios,techniques,segments}.js`.
- **Chromatic‑aware tonal center**: `tonalCenterReport` reports a tonic center
  with a confidence and a chromaticism score, and explicitly flags material that
  does not sit in one major/minor key (e.g. "F center (chromatic, minor‑ish)")
  instead of forcing a key — while still refusing to call true noise a center.
- **Web view**: `js/tabAnalyzer.js` + the `#sec-tabanalyzer` section, registered
  in `main.js`/`home.js`/`commandPalette.js`, styled by `css/tabanalyzer.css`,
  precached via `service-worker.js`. PDF import uses the analyzer's **own
  offline extractor** (`js/tab/pdfText.js`) — no third‑party library and no
  network, matching Musi's static/offline PWA rule. It parses the PDF object
  structure, inflates FlateDecode content streams via the platform
  `DecompressionStream`, and decodes glyph‑encoded fret numbers through each
  font's `/ToUnicode` CMap, then reflows the positioned text into editable
  monospaced rows. It is deliberately **parallel to and independent from** the
  drum PDF importer (`js/drums/pdfExtract.js`) so the two cannot break each
  other.
- **CLI**: `cli/src/analyzers/tab.js` wired as the `tab` activity
  (`--file`, `--tuning`), sharing the engine through `cli/src/shared.js`.

---

## Goals & non‑goals

**Goals**
- Accept a guitar/bass tab as **pasted text**, a **`.txt`/`.tab` file**, or a
  **PDF**, plus a chosen **tuning** (from `TUNINGS` in `js/theory.js`, incl.
  6/7/8‑string and bass).
- Produce an **in‑depth, section‑aware breakdown**:
  - overall **key / tonal center(s)** with confidence (and modulations),
  - **chords** (incl. power chords and slash chords) and the **progression**
    with **roman‑numeral** analysis relative to the detected key,
  - **scales/modes** used for melodic material, reported per riff/solo section,
  - **arpeggios** (chord‑outlining runs) distinguished from stepwise scale runs,
  - a **technique catalog** (bends, slides, hammer‑ons/pull‑offs, taps, palm
    mutes, vibrato, harmonics, tremolo picking, dead notes),
  - **note range / fretboard positions** used.
- Reuse existing engine tables and detection math; keep parsing/analysis pure so
  the **CLI reaches parity** with the web view.

**Non‑goals (initially)**
- Parsing binary **Guitar Pro** (`.gp/.gpx/.gp5`) or MusicXML files — out of
  scope; detect and message clearly. (Could be a later phase.)
- Reconstructing **exact rhythm/durations** — ASCII tab rarely encodes reliable
  timing. Analysis is pitch/technique‑centric; timing is approximated from
  column spacing only as a weak signal.
- Perfect PDF fidelity — PDF text extraction of monospaced tab is inherently
  lossy; we do best‑effort normalization and let the user correct the text.

---

## Architecture overview

New **pure modules** (no DOM, CLI‑safe) live under `js/tab/` and `js/analysis/`.
A thin **web view module** and a **CLI activity** wrap them. This mirrors how the
theory engine (`theory.js`, `scales.js`, `chords.js`) is shared with the CLI via
`cli/src/shared.js`.

```
js/
  tab/
    tabModel.js       # shared data shapes (typedefs / factory helpers)
    tabParser.js      # ASCII tab text -> structured model (tuning-aware)
    tabAnalyzer.js    # orchestrator: parse -> analyze -> report object
  analysis/
    pitchClass.js     # pitch-class histograms + weighting helpers
    keyDetect.js      # Krumhansl-Schmuckler (extracted) + windowed + modal
    chordDetect.js    # chord identification (extracted) + power/slash + roman
    scaleDetect.js    # score pitch-class sets against SCALES
    arpeggios.js      # chord-outline vs scale-run classification
    techniques.js     # technique extraction + stats
    segments.js       # riff vs solo segmentation
  tabAnalyzer.js       # WEB view module: initTabAnalyzer / stopTabAnalyzer
cli/
  src/analyzers/tab.js # runTabAnalyzer({ file, tuning, ... })
```

**Data flow**

```
raw text (paste / .txt / PDF-extracted)
   -> tabParser.parse(text, tuning)         => TabModel
   -> tabAnalyzer.analyze(TabModel)         => AnalysisReport
   -> renderers (web DOM / CLI ASCII)
```

The `AnalysisReport` is a plain serializable object so the same result can be
rendered as HTML (web), printed as ASCII (CLI), or exported (JSON/Markdown).

---

## Phase 0 — Extract a shared detection engine

Two detection routines already exist but are **buried inside feature/UI modules**
and are **not shared with the CLI**. Extract them first, with **no behavior
change**, so both the analyzer and the existing features use one implementation.

- **Key detection** — move the Krumhansl‑Schmuckler code out of `js/recorder.js`
  into `js/analysis/keyDetect.js`:
  - `MAJ_PROFILE`, `MIN_PROFILE`, `pearson`, `detectKey(weights)` (see
    `js/recorder.js` lines ~66–99). Export `detectKey` and a `keyLabel` helper.
  - `recorder.js` imports it back (keeps the exact current behavior).
- **Chord + key‑fit detection** — move from `js/chordBuilder.js` into
  `js/analysis/chordDetect.js`:
  - `CHORD_TYPES` table, `identifyChord(pitchClasses)`, `findKeys(pitchClasses)`
    (see `js/chordBuilder.js` lines ~7–90). Export these.
  - `chordBuilder.js` imports them back (unchanged behavior).
- Re‑export the new pure modules from `cli/src/shared.js` so the CLI can use
  them too.

**Why first:** avoids a third copy of key/chord math, and gives the analyzer a
tested starting point. This phase is mechanical and low‑risk (pure function
moves + import rewiring), but touches two shipping features so it should be
verified in the browser (chord builder) after the move.

---

## Phase 1 — Text tab parser → structured model

The core greenfield work. There is **no guitar‑tab parser today** (only drum‑tab
parsing in `js/drums/tabParser.js`, and tab *generators* in
`js/riffGenerator.js` / `js/scaleReference.js`). The drum parser's
`splitRow`/column approach is a useful template.

### 1.1 Block & string detection
- Split the text into **tab blocks**: consecutive groups of monospaced lines that
  look like string rows (contain `|`, `-`, digits, and technique glyphs).
- Determine the **string count** from the block (4/6/7/8) and map each row to a
  tuning string using the selected tuning (`TUNINGS[name]`). If the block has
  **string‑name labels** (`e|`, `B|`, `G|`, `D|`, `A|`, `E|`), use them to
  disambiguate order; otherwise assume conventional order (lowest string at the
  bottom row).
- Support **stacked blocks**: many tabs print sequential measures as repeated
  6‑line blocks down the page; concatenate them into one timeline.

### 1.2 Column model & fret extraction
- Treat each **character column** across the aligned rows as a **time slot**.
- Extract fret numbers, handling **multi‑digit frets** (`10`, `12`, `14`) that
  occupy adjacent columns; coalesce digits per row and record the slot index.
- Simultaneous entries in the same slot across rows → a **vertical group**
  (potential chord/dyad); a lone entry → a single note.
- Convert fret → MIDI → pitch class with the standard formula already used in
  `js/fretboardTrainer.js`:
  `openMidi = 12*(oct+1) + parseNote(note).semi; midi = openMidi + fret`.

### 1.3 Technique tokenization
Recognize inline technique glyphs and attach them to note events (and count them
for the technique catalog):

| Glyph(s) | Meaning |
| --- | --- |
| `h` | hammer‑on |
| `p` | pull‑off |
| `/` `\` | slide up / down |
| `b` `r` | bend / release (capture target where written, e.g. `7b9`) |
| `~` | vibrato |
| `x` | dead / muted note |
| `t` | tap |
| `PM` / `PM---` | palm mute (spans slots) |
| `*` `<>` `()` `[]` | harmonics (artificial / natural) / ghost / grace notes |
| repeated fast single notes / `trem` | tremolo picking (heuristic) |
| `|` `||` `:|` `|:` | bar lines / repeats (structure only) |

Unknown glyphs are recorded verbatim so nothing is silently dropped.

### 1.4 Output — `TabModel`
```js
{
  tuning: 'Standard',
  strings: [{ label:'E', openMidi:40 }, ...],   // low -> high index
  events: [                                       // ordered by slot
    { slot, stringIndex, fret, midi, pc, techniques:[...], isChordTone },
    ...
  ],
  columns,             // total slot count (weak timing proxy)
  measures: [{ startSlot, endSlot }],
  warnings: [...],     // alignment issues, ambiguous rows, dropped glyphs
}
```

**Edge cases to handle:** inconsistent spacing/misaligned columns; chord names or
lyrics printed above the staff; tie/legato continuations; `|`‑only measure
separators; empty lead‑in labels; bass (4/5‑string) tabs; capo notes.

**Deliverable for Phase 1:** the parser plus a minimal web section that shows the
normalized parse (detected strings, note count, warnings) so the parser can be
validated against real tabs before analysis is layered on. CLI can already read a
`.txt` file and print the parsed summary.

---

## Phase 2 — Key / tonal center, chords, progression

### 2.1 Pitch‑class profile (`analysis/pitchClass.js`)
- Build a 12‑bin pitch‑class histogram from `events`.
- Weighting options: by note **count**, and (optionally) by approximate
  **duration** from slot spacing. Down‑weight passing dead notes (`x`).

### 2.2 Key / tonal center (`analysis/keyDetect.js`)
- Run extracted **Krumhansl‑Schmuckler** `detectKey` over the whole‑piece
  histogram → ranked `{ tonic, mode, r }` candidates.
- Report the **top candidate as the tonal center** with a **confidence** derived
  from the correlation gap between #1 and #2. Power‑chord‑heavy riffs are
  intentionally ambiguous, so surface **multiple candidates** rather than forcing
  one key.
- Provide a **windowed** pass (per section/measure group) to flag **modulations
  / multiple tonal centers** (used fully in Phase 5; basic version here).

### 2.3 Chords & progression (`analysis/chordDetect.js`)
- For each **vertical group**, run extracted `identifyChord`, extended with:
  - **power chords** (`{0,7}`) and octaves,
  - **slash chords** using the **lowest sounding note** as the bass,
  - inversion awareness (bass ≠ root).
- Build the **progression** as an ordered chord list, then compute
  **roman numerals** relative to the detected key (major/minor diatonic function,
  with borrowed/chromatic chords flagged). Reuse `findKeys` for diatonic checks.
- Detect **repeated chord loops** (e.g. verse/chorus vamps) via sequence
  matching.

---

## Phase 3 — Scales, arpeggios, techniques, segmentation

### 3.1 Riff vs solo segmentation (`analysis/segments.js`)
Heuristic segmentation of the timeline into sections, since scale/technique
reporting is most useful per section:
- **Riff‑like:** low strings, power chords/dyads, palm muting, repetition, narrow
  melodic range.
- **Solo/lead‑like:** higher register, dense single‑note runs, bends/vibrato/
  taps, wider range, string skipping.
Output labeled sections with slot ranges; users can trust the labels loosely.

### 3.2 Scale detection (`analysis/scaleDetect.js`)
- Collect the pitch‑class set of **single‑note (melodic) material** per section.
- Score against the full **`SCALES`** library (27 scales/modes) for each possible
  root: reward coverage of used PCs and penalize out‑of‑scale PCs; bias the root
  toward the section's tonal center.
- Report a ranked list: **primary scale/mode + candidates** (e.g. "E Phrygian
  Dominant (fits 7/7), also E Phrygian, A Harmonic Minor"). This is new logic;
  today only major/minor key‑fit exists (`findKeys`).

### 3.3 Arpeggio detection (`analysis/arpeggios.js`)
- Slide a window over consecutive **single notes**; classify motion:
  - mostly **stepwise (m2/M2)** → **scale run**,
  - mostly **skips outlining a chord** (stacked 3rds / triad/7th tones) →
    **arpeggio**; name the implied chord via `identifyChord` on the window's PCs.
- Detect **sweep‑picking** style arpeggios (one note per string, ascending/
  descending across adjacent strings) as a special case, and **tapped
  arpeggios** when `t` glyphs are present.

### 3.4 Technique catalog (`analysis/techniques.js`)
- Aggregate technique tags from the parser into **counts + locations** and a
  per‑section summary: hammer‑ons/pull‑offs (legato), slides, bends (with target
  intervals when notated), vibrato, taps/tapping, palm mutes, harmonics, dead
  notes, tremolo picking.
- Surface simple **insights**, e.g. "solo is predominantly legato with position
  shifts via slides" or "riff uses palm‑muted power chords with chromatic
  passing tones".

### 3.5 Report assembly (`tab/tabAnalyzer.js`)
Combine everything into `AnalysisReport`:
```js
{
  tuning,
  tonalCenters: [{ key, mode, confidence }],
  modulations: [{ atSlot, from, to }],
  progression: [{ chord, roman, slot }],
  chordLoops: [...],
  sections: [
    { kind:'riff'|'solo', slotRange,
      scales:[{ name, root, fit }],
      arpeggios:[{ chord, slotRange }],
      techniques:{ ... }, range:{ lowMidi, highMidi } }
  ],
  noteHistogram, warnings,
}
```

---

## Phase 4 — Web UI, PDF ingestion, fretboard overlays, playback

### 4.1 Web view (`js/tabAnalyzer.js` + `#sec-tabanalyzer`)
Follow the standard feature‑registration path documented across the codebase:
1. **`index.html`** — add `<section id="sec-tabanalyzer" class="section">` with:
   a tuning picker (built from `TUNINGS`), a **paste textarea**, a **file input**
   (`accept=".txt,.tab,.text,application/pdf"`), an **Analyze** button, and
   result panels (summary, progression, sections, techniques).
2. **`js/main.js`** — import `initTabAnalyzer`/`stopTabAnalyzer`; add an entry to
   `TABS`, an icon in `ICONS`, and register in `TOOL_INITS`/`TOOL_STOPPERS`.
3. **`js/home.js`** — add `TITLES.tabanalyzer` / `DESCRIPTIONS.tabanalyzer`.
4. **`js/commandPalette.js`** — add `TOOL_TITLES` / `TOOL_KEYWORDS`.
5. **`css/tabanalyzer.css`** — new sheet (reuse `.guitar-tab-wrap` / degree
   colors from `css/generators.css`); link it in `index.html`.
6. **`service-worker.js`** — add new JS/CSS to `PRECACHE_URLS` and **bump the
   cache name** (currently `v69-…`) so clients pick up the new files.

Reuse existing UI patterns: `.sidebar-list`/`.sl-item` pickers, `.quiz-card`
panels, and persistence via `getSetting`/`saveSetting` (e.g. `tab.tuning`,
`tab.lastInput`).

### 4.2 PDF ingestion
- Zero‑build constraint: **vendor `pdf.js`** as a static ES module under
  `vendor/pdfjs/` (added to the service‑worker precache) and **lazy‑load** it
  only when a PDF is chosen, so the rest of the app stays lightweight and offline.
- Extract text page‑by‑page, then **normalize** into monospace‑style lines before
  handing to `tabParser` (join text items by x‑position into columns; this is
  best‑effort). Always show the extracted text in the textarea so the user can
  **fix misalignment** before analyzing.
- CLI PDF support is deferred (Node zero‑dep PDF text extraction is hard); the CLI
  accepts text/`.txt` first, with PDF as a possible later add.

### 4.3 Fretboard overlays & playback
- Render detected **scales** and **arpeggio shapes** on a fretboard using the
  existing reference‑fretboard rendering approach in `js/scaleReference.js`
  (`.ref-fretboard`, degree coloring).
- Optional **playback** of the parsed events and detected chords via the existing
  Web Audio engine (`js/audio.js`, mirroring `chordBuilder.js` voicing), with a
  stopper wired into `TOOL_STOPPERS`.

---

## Phase 5 — Advanced analysis & export

- **Windowed modulation / multiple tonal centers:** full section‑by‑section key
  tracking with a smoothing pass; visualize where the tonal center shifts.
- **Modal refinement:** disambiguate relative modes (e.g. E Phrygian vs C Major)
  using tonic emphasis — first/last notes of phrases, downbeat proxies, pedal
  tones, and the bass line.
- **Confidence model:** unified confidence for key, each chord, and each scale
  call, shown in the UI so users know what's a strong vs speculative read.
- **Export:** download the `AnalysisReport` as **Markdown or JSON**; optionally
  save into the existing Notes/Exercises stores.

---

## CLI parity

Add a `tab` activity that reuses the same pure modules:
- **`cli/src/analyzers/tab.js`** — `runTabAnalyzer({ file, tuning, key })`: read
  the text file, `parse` + `analyze`, print an ASCII report (tonal center,
  progression w/ roman numerals, per‑section scales/arpeggios/techniques).
- **`cli/src/menu.js`** — register `ACTIVITIES.tab = runTabAnalyzer` and add it to
  the interactive menu.
- **`cli/bin/musi.js`** — add a `tab` alias, `--file` and `--tuning` flags, and
  help text.
- **`cli/src/shared.js`** — re‑export the new `js/tab/*` and `js/analysis/*`
  modules.

Smoke test (per `AGENTS.md`): `node bin/musi.js tab --file sample.txt --tuning "Drop C"`.

---

## Reuse map

| Need | Reuse |
| --- | --- |
| Tunings (6/7/8‑string, bass) | `TUNINGS` (`js/theory.js`) |
| Note parsing / spelling | `parseNote`, `NOTE_NAMES_SHARP`, `INTERVAL_LABELS` |
| Fret → MIDI | formula in `js/fretboardTrainer.js` / `js/scaleReference.js` |
| Scale library + notes | `SCALES`, `getScaleNotes` (`js/scales.js`) |
| Chord library | `CHORDS`, `getChordNotes` (`js/chords.js`) |
| Chord identification | `identifyChord`/`findKeys` (extracted from `chordBuilder.js`) |
| Key detection | `detectKey` (extracted from `recorder.js`) |
| Tab text parsing pattern | `splitRow`/column loop in `js/drums/tabParser.js` |
| Fretboard rendering | `.ref-fretboard` approach in `js/scaleReference.js` |
| Tab display CSS | `.guitar-tab-wrap`, degree colors in `css/generators.css` |
| Audio playback | `js/audio.js`, voicing pattern in `chordBuilder.js` |
| Feature registration | `TABS`/`TOOL_INITS`/`TOOL_STOPPERS` in `js/main.js` |

---

## Key risks & mitigations

- **PDF → columns is lossy.** Monospacing is often destroyed. *Mitigation:*
  best‑effort x‑position reconstruction + always show editable extracted text;
  treat paste/`.txt` as the primary, most reliable path.
- **No reliable rhythm in ASCII tab.** *Mitigation:* keep analysis
  pitch/technique‑centric; use column spacing only as a weak duration weight.
- **Column alignment / multi‑digit frets.** *Mitigation:* explicit slot model,
  digit coalescing, and `warnings` for misaligned rows.
- **Key ambiguity from sparse pitch content** (power‑chord riffs). *Mitigation:*
  report ranked tonal‑center candidates with confidence, not a single answer.
- **Relative‑mode ambiguity.** *Mitigation:* Phase 5 tonic‑emphasis heuristics.
- **Binary Guitar Pro files.** *Mitigation:* detect and clearly message as
  unsupported; consider a dedicated later phase.
- **Service‑worker caching** can hide new assets. *Mitigation:* bump the cache
  name and precache list whenever files are added (per `AGENTS.md`).

## Verification (no test tooling in this repo)

Per `AGENTS.md`, "verifying" means exercising the CLI and the web UI:
- Curate a small corpus of real tabs (a metal riff in Drop C, a pentatonic blues
  solo, a sweep‑picked arpeggio étude, a bass line) plus tricky formatting cases.
- Web: serve the repo (`python3 -m http.server 8080`), paste/upload each sample,
  and confirm the breakdown matches known theory; hard‑reload after edits.
- CLI: run `node bin/musi.js tab --file <sample> --tuning <name>` and compare the
  ASCII report to the web output for parity.
