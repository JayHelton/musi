# Movable Guitar Chord Reference Cards

Printable reference cards for **closed, movable** guitar chord shapes. Diagrams
are root-relative (labels like `R`, `3`, `b7`, `9`) — not a note-specific deck
in every key. The goal is learning usable chord *families*, not memorizing every
named chord everywhere.

## Deliverables

| Path | What |
|------|------|
| `index.html` | Filterable interactive viewer (print from the browser) |
| `data/shapes.js` | Source of truth for all shapes (ES module) |
| `data/shapes.json` | Same data as JSON (generated) |
| `dist/printable.html` | Static printable HTML (full deck) |
| `dist/printable-minimal.html` | Core-only deck |
| `dist/chord-cards.pdf` | Printable PDF (full deck) |
| `dist/chord-cards-minimal.pdf` | Core-only PDF |
| `src/` | Validation + rendering |
| `scripts/` | Validate / generate |

## Quick start

Serve the repo (or just this folder) over HTTP:

```bash
# from repo root
python3 -m http.server 8080
# open http://localhost:8080/chord-cards/
```

Or open the static printable file after generating:

```bash
cd chord-cards
node scripts/validate.mjs
node scripts/generate.mjs
node scripts/generate.mjs --deck=minimal
```

Print from the viewer (**Print / PDF**) or open `dist/printable.html` and print.
US Letter is the default page size; A4 works with minor margin tweaks in the
browser print dialog.

## How cards are organized

Each card is one pragmatic voicing:

- **Chord quality** — Major, m7, maj9, 7#11, …
- **Tuning family** — `standard` (EADGBE) or `drop` (DADGBE model)
- **Root string** — primarily 6 and 5; string 4 only for strong D-shape shells
- **Voicing tag** — Full / Shell / Compact / High-gain friendly / Advanced stretch
- **Deck tag** — `minimal` (core teaching set) or `expanded` (more colors)
- **Diagram** — 6 strings, frets relative to the root fret, muted strings as ×
- **Pattern** — plain-text relative form, e.g. `R R+2 R+2 R+1 R R`
- **Use / play / position notes** — when the grip is musically useful

### Filters in the HTML viewer

Tuning · chord family · root string · deck tag · voicing · search · interval
labels on/off · fingering on/off · minimal deck mode.

## Shape selection rules

Shapes were chosen for **playability and real-world use**, not theoretical
completeness:

1. No open-string / cowboy chords — every sounding note is fretted as part of a
   movable grip.
2. Prefer common grips (E- and A-shape families in standard; one-finger power +
   upper-structure colors in drop).
3. If a full stack is muddy or unplayable, ship a **shell** instead and say so.
4. 1–3 shapes per quality × tuning × root-string — not every possible fingering.
5. Drop shapes use **separate geometry** from standard. The low three strings
   sharing one fret is called out as the drop advantage.
6. Omit a root-string family when there is no strongly pragmatic grip.

### Assumptions

- **Drop model** is DADGBE. Relative intervals on strings 5–1 match other drop-6
  tunings; only the absolute pitch of the low string changes.
- **Interval labels** use chord-tone names (`9` not `2`, `#11` not `b5` when that
  is the intended function). `6` and `bb7` share a pitch class on diminished
  chords — cards label `6` for the dim7 tone.
- **Minimum fret**: cards note the lowest root fret that keeps every note fretted
  (typically fret 1+). Relative `R` means “at the root fret,” not an open string.
- **m11 / 11**: the practical guitar form is often without a fully voiced 3rd or
  9th; cards mark that honestly.
- **High gain**: prefer power and shell voicings; full jazz stacks are marked as
  clean-friendly where relevant.

## Data model

```json
{
  "id": "std-r6-maj9",
  "chordFamily": "extended",
  "chordType": "Maj9",
  "symbol": "maj9",
  "tuningType": "standard",
  "rootString": 6,
  "voicingCategory": "Full",
  "practicalTag": "minimal",
  "frets": [0, 2, 1, 1, 0, 2],
  "intervals": ["R", "5", "7", "3", "5", "9"],
  "fingering": [1, 4, 2, 3, 1, 4],
  "bestUse": "...",
  "playability": "...",
  "rootPositionNote": "...",
  "notes": "..."
}
```

`frets` / `intervals` / `fingering` run string **6 → 1**. `null` = muted.

## Validation

```bash
node scripts/validate.mjs
```

Checks:

- No open-string design (mute or fretted only)
- Root string labeled `R` and present
- Interval labels match pitch classes for the tuning
- Drop vs standard open-string offsets are correct
- Span / playability warnings for wide stretches

## Layout

Print layout targets **US Letter**, **2 cards × 2 rows per page**, high-contrast
black-and-white friendly with a small green accent that still reads in grayscale.
Cut lines are the card borders.
