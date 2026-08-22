/**
 * Scale position engine.
 *
 * A "position" is the guitarist's unit of scale practice: the left hand stays
 * over one span of frets and plays every scale note that falls under it. This
 * module builds the fingering for each position of any scale in any tuning.
 *
 * The rules below come from standard positional-playing practice:
 *
 * 1. A position is a four-fret span. The fret under the index finger names the
 *    position, so position 5 covers frets 5, 6, 7 and 8.
 * 2. The index finger reaches back one fret. This single stretch is what makes
 *    the classic shapes work — it is the reach that puts the low note of
 *    minor pentatonic box 3 on fret 9 while the hand sits at fret 10.
 * 3. The run only climbs. The player takes every scale note under the hand,
 *    string by string, and never repeats a pitch a lower string already
 *    sounded. On a regular tuning this makes the run unbroken: no scale note
 *    between the first and the last note of the position goes missing.
 * 4. Each position starts on the next degree of the scale. A seven-note scale
 *    has seven positions and a pentatonic scale has five. Position 1 of the
 *    next octave follows the last position.
 *
 * These four rules make each shape deterministic, so the fingerings come out
 * of the scale itself and not out of a table. The engine therefore gives a
 * pragmatic shape for all 28 scales, for every mode, and for every tuning.
 *
 * The output matches the published box shapes. See tests/scale-positions.
 */

/** Frets the index finger reaches below the fret that names the position. */
export const POSITION_REACH_BACK = 1;
/** Frets the hand covers, index finger included. */
export const POSITION_SPAN = 4;

/**
 * Lays out the notes of one position, low string first.
 *
 * The hand covers frets `anchorFret - 1` through `anchorFret + 2`, so on every
 * string the player takes the scale notes that fall under those frets. The run
 * only climbs: a note that the last string already sounded does not come back.
 * That one rule keeps the run unbroken on a regular tuning, and it lets a
 * tuning with a wide gap between two strings jump instead of stall.
 *
 * @param {number[]} openMidis MIDI note of each open string, low string first
 * @param {Set<number>} classes semitone classes (0-11) of the scale
 * @param {number} anchorFret fret that names the position, on the low string
 * @param {number} maxFret last fret of the neck
 * @returns {{string:number, fret:number, midi:number}[]} notes, low to high
 */
function layPositionNotes(openMidis, classes, anchorFret, maxFret) {
  const strings = openMidis.length;
  const lo = Math.max(0, anchorFret - POSITION_REACH_BACK);
  const hi = Math.min(maxFret, anchorFret + POSITION_SPAN - 1);

  const notes = [];
  // The position starts on its own degree, so nothing under the anchor counts.
  let last = openMidis[0] + anchorFret - 1;

  for (let s = 0; s < strings; s++) {
    for (let fret = lo; fret <= hi; fret++) {
      const midi = openMidis[s] + fret;
      if (midi <= last) continue;
      if (!classes.has(((midi % 12) + 12) % 12)) continue;
      notes.push({ string: s, fret, midi });
      last = midi;
    }
  }
  return notes;
}

/**
 * Builds every position of a scale across the neck.
 *
 * The tonal centre picks which degree starts position 1. The scale itself does
 * not change, so a minor scale stays minor in every position. Only the note
 * under the index finger changes.
 *
 * @param {object} opts
 * @param {number[]} opts.openMidis MIDI note of each open string, low first
 * @param {number[]} opts.semis semitones of each scale degree above the root
 * @param {number} opts.rootSemi semitone class (0-11) of the scale root
 * @param {number} [opts.modeIndex] degree that acts as the tonal centre
 * @param {number} [opts.maxFret] last fret of the neck
 * @returns {{
 *   index:number, degree:number, degreeSemi:number, anchorSemi:number,
 *   anchorFret:number, isTonic:boolean, octave:number,
 *   start:number, end:number, span:number,
 *   notes:{string:number, fret:number, midi:number}[],
 * }[]} positions, low on the neck first
 */
export function buildScalePositions({ openMidis, semis, rootSemi, modeIndex = 0, maxFret = 24 }) {
  if (!Array.isArray(openMidis) || !openMidis.length) return [];
  if (!Array.isArray(semis) || !semis.length) return [];

  const count = semis.length;
  const mode = ((modeIndex % count) + count) % count;
  const modalRootSemi = (((rootSemi + semis[mode]) % 12) + 12) % 12;
  const classes = new Set(semis.map(s => (((rootSemi + s) % 12) + 12) % 12));

  // Degrees measured from the tonal centre, so position 1 starts on it.
  const fromCentre = [];
  for (let k = 0; k < count; k++) {
    const raw = semis[(mode + k) % count] - semis[mode];
    fromCentre.push(((raw % 12) + 12) % 12);
  }

  // Lowest fret on the low string that sounds the tonal centre.
  const openPc = (((openMidis[0] % 12) + 12) % 12);
  const baseFret = (((modalRootSemi - openPc) % 12) + 12) % 12;

  const positions = [];
  // One octave below the low anchor, the anchor octave, and the octave above.
  // Together these cover the whole neck the reference draws.
  for (let octave = -1; octave <= 1; octave++) {
    for (let k = 0; k < count; k++) {
      const anchorFret = baseFret + fromCentre[k] + octave * 12;
      if (anchorFret - POSITION_REACH_BACK < 0) continue;
      if (anchorFret + POSITION_SPAN - 1 > maxFret) continue;
      const notes = layPositionNotes(openMidis, classes, anchorFret, maxFret);
      // A position the hand cannot cover on every string is not worth showing.
      if (new Set(notes.map(n => n.string)).size !== openMidis.length) continue;
      const frets = notes.map(n => n.fret);
      const start = Math.min(...frets);
      const end = Math.max(...frets);
      positions.push({
        degree: k + 1,
        degreeSemi: fromCentre[k],
        anchorSemi: (((modalRootSemi + fromCentre[k]) % 12) + 12) % 12,
        anchorFret,
        isTonic: k === 0,
        octave,
        start,
        end,
        span: end - start + 1,
        notes,
      });
    }
  }

  positions.sort((a, b) => a.anchorFret - b.anchorFret);
  positions.forEach((p, i) => { p.index = i; });
  return positions;
}

/** Position whose anchor fret sits closest to `fret`. Returns an index. */
export function nearestPositionIndex(positions, fret) {
  if (!positions.length) return 0;
  let best = 0;
  let bestGap = Infinity;
  positions.forEach((p, i) => {
    const gap = Math.abs(p.anchorFret - fret);
    if (gap < bestGap) { bestGap = gap; best = i; }
  });
  return best;
}

/**
 * Lookup keys for the notes of a position, in the form `"<string>:<fret>"`.
 * The fretboard asks about every cell it draws, so it needs a fast test.
 */
export function positionNoteKeys(position) {
  const keys = new Set();
  if (position) position.notes.forEach(n => keys.add(`${n.string}:${n.fret}`));
  return keys;
}
