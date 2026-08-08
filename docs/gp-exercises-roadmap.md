# Guitar Pro Exercises — Roadmap

Plan for using Guitar Pro files as a **local exercise library**: upload once,
open on demand, practice with tempo-aware playback. Builds on work already
shipped in Tab Analyzer and the Exercises library.

**Web-only.** No new CLI activity or playback path for this feature. Like the
rest of Musi, it stays **static, zero-build, and offline**.

## Why this feature

Musi already reads `.gp` / `.gp5` for theory analysis. Separately, Exercises
stores PDFs, media, and links in IndexedDB for on-demand practice. The gap:

| Need | Today |
| ---- | ----- |
| Keep a personal bank of GP études / drills | Exercises does not accept `.gp` / `.gp5` |
| Open a stored score and hear it | Tab Analyzer Play uses **equal slot timing** (0.16s/slot), not GP tempo/durations |
| Practice UX (loop, slow down, pick a section) | Neither Exercises nor Tab Analyzer offers this |
| Revisit the same file without re-uploading | Tab Analyzer is session-only; Exercises is the persistent store |

**Product goal:** treat Guitar Pro files as first-class practice assets —
store them in Exercises, open a practice player on demand, optionally jump into
analysis.

## Current foundation (do not rebuild)

| Piece | Where | Notes |
| ----- | ----- | ----- |
| GP7/8 + GP5 parsers | `js/tab/guitarPro.js`, `js/tab/gp5.js` | Exact frets/MIDI/techniques; multi-track |
| Shared model | `js/tab/tabModel.js` | Events keyed by **slot**; no duration/tempo fields yet |
| Analysis | `js/tab/tabAnalyzer.js` + `js/analysis/*` | Key, chords, scales, techniques, segments |
| Web Tab Analyzer | `js/tabAnalyzer.js`, `#sec-tabanalyzer` | Upload → Parts → Analyze → Play |
| Exercises library | `js/exercises.js` + `js/attachments.js` | `musi.exercises` + IndexedDB blobs; viewer for pdf/image/audio/video/link |
| Audio bus | `js/audio.js` | Web Audio oscillators; no SoundFont/MIDI I/O |

**Known timing gap (intentional for ASCII analysis):** GPIF/GP5 carry rhythm
and tempo, but parsers advance one slot per beat and **skip duration bytes**
(GP5) / do not map Rhythm refs (GPIF). Playback cannot sound musical until the
model keeps time.

## Design decision: extend Musi vs vendor alphaTab

| Option | Pros | Cons |
| ------ | ---- | ---- |
| **A. Extend own engine** (recommended) | Matches zero-dep / offline rules; small surface; already maps techniques into Musi analysis | Must add rhythm + a practice scheduler ourselves; no engraved score view |
| **B. Vendor alphaTab** | Full score render + SoundFont playback + GP3–8 | Large dependency, SoundFont assets, workers; fights static/zero-dep; overkill for “play my étude” |

**Decision: Option A.** Keep parsing in `js/tab/*`. Add rhythm to `TabModel`,
a small tempo-aware player, and wire Exercises to open GP files into a practice
view. Revisit alphaTab only if we later want full engraved notation.

## Goals & non-goals

**Goals**
- Upload `.gp` / `.gp5` into the **Exercises** library (folders, rename, delete).
- Open a stored file into a **practice player**: play / pause / stop, tempo
  control (% or BPM), loop selection (measures or markers), track picker.
- Preserve **exact** frets, tuning, techniques from the existing parsers.
- Optional one-tap path into Tab Analyzer analysis for the same model.

**Non-goals (v1)**
- Any new CLI surface (no `play-tab`, no CLI verification requirement).
- Engraved notation / alphaTab-style sheet rendering.
- SoundFont / realistic guitar amp modeling (oscillator / simple synth is enough).
- Writing or editing Guitar Pro files.
- Cloud sync or a remote exercise catalog.
- Full support for `.gp3` / `.gp4` / `.gpx` (keep detect + re-export message).
- Multi-track mixdown as a DAW (one fretted track at a time is the default).

## Architecture

```
Exercises (storage + library UI)
   └─ attachment Blob (.gp / .gp5)
         │
         ▼
parseGuitarPro(bytes)          # existing
         │
         ▼
TabModel + rhythm metadata     # extended
         │
    ┌────┴────┐
    ▼         ▼
Practice      analyzeModel()   # existing analysis
player UI     (optional deep-link)
    │
    ▼
tabPlayer.schedule(model, opts) → Web Audio
```

**New / extended modules (proposed):**

| Module | Role |
| ------ | ---- |
| `js/tab/tabModel.js` | Add optional `tempo`, per-event `duration`, measure time signatures |
| `js/tab/guitarPro.js` / `gp5.js` | Map beat Rhythm / duration + score tempo onto the model |
| `js/tab/tabPlayer.js` | Scheduler: events → timed note list (start, dur, midi, techniques) |
| `js/gpPractice.js` (web) | Practice overlay: transport, loop, tempo, ASCII or compact tab strip |
| `js/exercises.js` | Accept GP types; `mediaKind === 'gp'` → open practice player |

Reuse: `attachments.js`, Exercises folder UX, `audio.js`, Tab Analyzer track
picker patterns, measure `marker` fields already imported from GPIF sections.

## Data model extension

Extend `TabEvent` and `TabModel` **optionally** so ASCII-parsed tabs keep working:

```js
// TabModel additions (GP-backed models only at first)
{
  tempo: 120,                    // BPM from score (or first tempo change)
  tempoMap: [{ slot, bpm }],     // optional; v1 can use a single tempo
  events: [{
    slot, stringIndex, fret, midi, pc, techniques, dead,
    duration: 1,                 // in quarter-note units (e.g. 0.25 = 16th)
    // or ticks: number          // alternative: fixed PPQ ticks
  }],
  measures: [{
    startSlot, endSlot, marker,
    timeSig: [4, 4],             // optional
  }],
}
```

**Playback timing:**  
`seconds = (durationInQuarters) * (60 / bpm)`.  
ASCII models without `duration` fall back to today’s equal-slot Play.

**GPIF sources (already in the ZIP XML):** Beat → Rhythm id → note value /
dots / tuplet; score/master-bar tempo; master-bar time signature.  
**GP5:** duration + tuplet bytes currently skipped in `gp5.js` — stop skipping
and attach them when building events.

## Phased delivery

### Phase 0 — Exercises accepts Guitar Pro (storage only)

**Scope:** Make `.gp` / `.gp5` first-class library items without a full player.

- Extend file accept list and `mediaKind()` → `'gp'`.
- Icon + label (“Guitar Pro”) in the library list.
- On Open: load blob, `parseGuitarPro`, show a simple overlay:
  - title, track/parts list, tuning, note/measure counts, section markers
  - actions: **Download**, **Analyze in Tab Analyzer** (hand off bytes/model),
    **Play** (existing equal-slot play as interim)
- Persist `preferredTrackIndex` on the exercise item (optional metadata field).

**Why first:** Delivers “store exercises on demand” immediately; validates the
attachment path before investing in rhythm.

**Touch:** `js/exercises.js`, Exercises section markup / CSS if needed,
`service-worker.js` cache bump if new modules are added.

### Phase 1 — Rhythm-aware TabModel from GP

**Scope:** Preserve tempo and beat durations from `.gp` / `.gp5`.

- GPIF: resolve each Beat’s Rhythm (value, dots, tuplet) → quarter-length.
- GP5: read duration / tuplet instead of skipping; map to the same units.
- Score tempo (+ basic tempo changes if cheap).
- Leave ASCII parser unchanged (`duration` absent → legacy behavior).
- Smoke-check in the browser: after Open, surface `tempo` and a few event
  durations in the overlay (or console) to confirm mapping.

**Risk:** Tied notes, grace notes, tuplets, alternate endings — v1 can treat
grace as zero/steal-from-next and ignore repeats/alt endings (linear play).

### Phase 2 — Practice player

**Scope:** On-demand practice UX on top of the timed model.

- New `js/tab/tabPlayer.js`: schedule pitched events with look-ahead (pattern
  from `metronome.js` / `drumEngine.js`).
- Web UI (`gpPractice` overlay or dedicated panel inside Exercises viewer):
  - Play / Pause / Stop
  - Tempo slider (e.g. 50%–150% of score BPM, or absolute BPM)
  - Loop: whole file, measure range, or named marker (Intro / Verse / …)
  - Track picker (reuse Tab Analyzer Parts pattern)
  - Optional click track (reuse metronome)
  - Compact scrolling highlight of current measure / ASCII strip (no engraving)
- Wire Exercises Open for `kind === 'gp'` to this player.
- Tab Analyzer Play switches to the same scheduler when `model.tempo` is set.
- `TOOL_STOPPERS` / viewer close must stop audio.

### Phase 3 — Practice polish & library UX

- Count-in (1 bar).
- Loop with gap / seamless.
- “A–B” scrubbers on the measure strip.
- Remember last tempo % and track per exercise item in `musi.exercises`.
- Folder suggestions or tags: `technique`, `speed`, `song`, etc. (soft; user-defined folders already exist).
- “Save to Exercises” from Tab Analyzer after a GP upload (closes Phase 5
  export idea from `docs/tab-analyzer-roadmap.md` for this path).

### Phase 4 — Split one score into many exercises (shipped)

The GP Player header has a **Split** button that opens a full-screen studio for
carving a loaded score into several named exercises in one pass (e.g. bars 1–5,
6–7, 8–10).

| Piece | Where |
| ----- | ----- |
| Per-measure summary (marker, time signature, note count, fret range, techniques, drum hits, beat sparkline, repeated-bar detection) | `js/gpPlayer/measureDigest.js` |
| Segment list model (add / rename / nudge, overlap trimming, coverage, auto-split by marker / every N bars / from section notes) | `js/gpPlayer/exerciseSegments.js` |
| Bar-map + segment-list UI, drag & keyboard range selection, per-segment loop preview | `js/gpPlayer/exerciseImportPanel.js`, `css/gpimport.css` |
| Mount + loop-state snapshot/restore for previews | `js/gpPlayerUI.js` (`exerciseImport` option) |
| Bulk save into the library | `js/gpPlayer.js` (`importSegmentsAsExercises`) |

Every exercise created from one score **shares a single stored `.gp` blob**
instead of a copy per bar range, so `js/exercises.js` releases an attachment
only when the last item referencing it is deleted.

The panel is only offered where the score exists as `.gp` bytes — the Exercises
inline viewer and audio-transcribed riffs do not show it.

### Later / out of scope until needed

- `.gp3` / `.gp4` / `.gpx` readers.
- Repeat / alternate-ending expansion for faithful form playback.
- Multi-track playback (rhythm guitar + lead).
- SoundFont or sampled guitar.
- MusicXML import.
- Cloud / shared exercise packs.
- CLI playback or a dedicated CLI activity for this feature.

## UX sketch (Exercises → Open)

1. Library row shows a Guitar Pro badge and file size.
2. **Open** → full-screen practice overlay (same shell pattern as today’s
   `ex-viewer-*`, not a new app section).
3. Header: exercise name · track select · Close / Download / Analyze.
4. Body: transport + tempo + loop controls; measure/marker strip; optional
   ASCII tab of the active loop.
5. Escape / section change stops playback (mirror current viewer teardown).

No new home-hub tool required for v1 — Exercises remains the entry point.
Tab Analyzer stays the deep analysis surface.

## Verification (no test framework)

Per `AGENTS.md`, verify in the browser:

1. Add 2–3 small fixture `.gp` / `.gp5` études under something like
   `docs/fixtures/gp/` (short, known BPM, clear rhythms) if licensing allows;
   otherwise document manual test files.
2. Web: `python3 -m http.server 8080` → Exercises → upload → Open → Play at
   100% and 70% tempo; loop two measures; switch tracks; Analyze handoff.
3. Hard-reload after JS/CSS edits (service worker).

## Risks & mitigations

| Risk | Mitigation |
| ---- | ---------- |
| Rhythm mapping bugs (tuplets, dots) | Start with common values (1/1 … 1/16 + dotted + triplet); warn on unknown |
| Large GP files vs 250 MB Exercises cap | Cap already exists; GP scores are usually small |
| IndexedDB quota on mobile | Existing `ensurePersistentStorage()`; surface clear errors |
| Users expect engraved tab | Copy: “Practice player — tones + tab strip, not full Guitar Pro UI” |
| Service worker stale assets | Bump `CACHE_VERSION` / `PRECACHE_URLS` when modules land |
| Scope creep into DAW | One track, oscillator tones, loop/tempo only in v1 |

## Suggested implementation order

1. **Phase 0** — store + open + analyze handoff (smallest user-visible win).
2. **Phase 1** — rhythm on `TabModel` (unblocks real play).
3. **Phase 2** — practice player (core “on demand” experience).
4. **Phase 3** — polish + Tab Analyzer → Exercises save.

## Relationship to Tab Analyzer roadmap

- Does **not** replace Tab Analyzer; it productizes GP as an **exercise format**.
- Phase 1 here feeds better Play inside Tab Analyzer (same scheduler).
- “Save into Exercises” overlaps Tab Analyzer Phase 5 export — implement once
  and share from both surfaces.
- Older GP formats remain “re-export to `.gp`/`.gp5`” as today.
