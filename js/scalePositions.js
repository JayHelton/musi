/**
 * Scale position engine.
 *
 * A "position" is the guitarist's unit of scale practice: the hand stays over
 * one part of the neck and the player runs the scale through it. This module
 * builds the fingering for each position of any scale in any tuning.
 *
 * The rules below come from the published mode shapes and the published
 * pentatonic boxes:
 *
 * 1. A position starts on a scale note on the lowest string, and the run
 *    climbs from there. That note is the first note the player sounds.
 * 2. Each string takes the same number of scale notes. A seven-note scale
 *    takes three notes on each string, and a five-note scale takes two.
 * 3. The notes are consecutive. The player takes the next scale note each
 *    time, so the position holds one unbroken run of the scale.
 * 4. Each position starts on the next degree of the scale. A seven-note scale
 *    has seven positions and a pentatonic scale has five. Position 1 of the
 *    next octave follows the last position.
 *
 * Rules 1 to 3 put the first note at, or below, every other fret of the box.
 * The three-notes-per-string mode shapes hold this exactly: the root is the
 * lowest fret of the shape and the shape climbs from there. The pentatonic
 * boxes are the known exception. Box 3 and box 5 reach one fret back on the
 * D string and the G string, and that reach is part of the published shape.
 * `POSITION_REACH_BACK` is the size of the reach the engine accepts.
 *
 * Rule 2 also keeps an altered scale close to the scale it alters. The string
 * and the slot of each note follow the scale degree, not the fret, so a raised
 * seventh moves one dot and leaves the rest of the shape in place. Harmonic
 * minor is therefore the Aeolian shape with the seventh one fret higher.
 *
 * These rules make each shape deterministic, so the fingerings come out of the
 * scale itself and not out of a table. The engine therefore gives a pragmatic
 * shape for all 28 scales, for every mode, and for every tuning.
 *
 * The output matches the published box shapes. See tests/scale-positions.
 */

/** Fewest scale notes the hand takes on one string. */
export const MIN_NOTES_PER_STRING = 2;
/** Most scale notes the hand takes on one string. */
export const MAX_NOTES_PER_STRING = 4;
/**
 * Frets a box may reach below its first note.
 *
 * The published pentatonic boxes need one fret of reach. Symmetric scales such
 * as the diminished scales need two. A shape that needs more is not a box, so
 * the engine gives that string count more notes instead.
 */
export const POSITION_REACH_BACK = 2;

/** Semitone class (0-11) of a value. */
function pitchClass(value) {
  return ((value % 12) + 12) % 12;
}

/** First scale pitch above `midi`. */
function nextScaleMidi(midi, classes) {
  for (let step = 1; step <= 12; step++) {
    if (classes.has(pitchClass(midi + step))) return midi + step;
  }
  return midi + 12;
}

/** First scale pitch at or above `midi`. */
function scaleMidiFrom(midi, classes) {
  if (classes.has(pitchClass(midi))) return midi;
  return nextScaleMidi(midi, classes);
}

/**
 * Lays out the notes of one position, low string first.
 *
 * The run starts on `startMidi` on the lowest string and climbs. Each string
 * takes `perString` consecutive scale notes, so the shape follows the scale
 * degrees and not the frets.
 *
 * A regular tuning keeps the run unbroken, because `perString` notes of the
 * scale span about the same distance as the gap between two strings. A tuning
 * with a very wide gap can drop the run below the next open string. `jump`
 * says what to do then. The run lifts to the first scale note that string can
 * play, which skips a note but keeps the shape playable. Without `jump` the
 * run asks for a fret behind the nut, and the caller drops the position.
 *
 * The frets are not clamped to the neck. The caller checks that.
 *
 * @param {number[]} openMidis MIDI note of each open string, low string first
 * @param {Set<number>} classes semitone classes (0-11) of the scale
 * @param {number} startMidi MIDI note the position starts on
 * @param {number} perString scale notes to take on each string
 * @param {boolean} jump true to lift the run over a wide gap between strings
 * @returns {{string:number, fret:number, midi:number}[]} notes, low to high
 */
function layRun(openMidis, classes, startMidi, perString, jump) {
  const notes = [];
  let midi = startMidi;

  for (let s = 0; s < openMidis.length; s++) {
    if (jump && midi < openMidis[s]) midi = scaleMidiFrom(openMidis[s], classes);
    for (let i = 0; i < perString; i++) {
      notes.push({ string: s, fret: midi - openMidis[s], midi });
      midi = nextScaleMidi(midi, classes);
    }
  }
  return notes;
}

/**
 * Builds the positions of one scale for one note count, low on the neck first.
 *
 * The tonal centre starts position 1, and each position after it starts on the
 * next degree. The engine walks three octaves of the neck: the octave below
 * the low anchor, the anchor octave, and the octave above. Together these
 * cover the whole neck the reference draws.
 *
 * @param {number[]} openMidis MIDI note of each open string, low string first
 * @param {Set<number>} classes semitone classes (0-11) of the scale
 * @param {number[]} fromCentre semitones of each degree above the tonal centre
 * @param {number} modalRootSemi semitone class (0-11) of the tonal centre
 * @param {number} perString scale notes to take on each string
 * @param {boolean} jump true to lift the run over a wide gap between strings
 * @param {number} maxFret last fret of the neck
 * @returns {object[]} positions, in anchor-fret order
 */
function buildForCount(openMidis, classes, fromCentre, modalRootSemi, perString, jump, maxFret) {
  // Lowest fret on the low string that sounds the tonal centre.
  const baseFret = pitchClass(modalRootSemi - pitchClass(openMidis[0]));
  const positions = [];

  for (let octave = -1; octave <= 1; octave++) {
    for (let k = 0; k < fromCentre.length; k++) {
      const anchorFret = baseFret + fromCentre[k] + octave * 12;
      if (anchorFret < 0 || anchorFret > maxFret) continue;
      const notes = layRun(openMidis, classes, openMidis[0] + anchorFret, perString, jump);
      // A shape that runs off either end of the neck is not worth showing.
      if (notes.some(n => n.fret < 0 || n.fret > maxFret)) continue;
      const frets = notes.map(n => n.fret);
      const start = Math.min(...frets);
      const end = Math.max(...frets);
      positions.push({
        degree: k + 1,
        degreeSemi: fromCentre[k],
        anchorSemi: pitchClass(modalRootSemi + fromCentre[k]),
        anchorFret,
        perString,
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
  return positions;
}

/**
 * Picks the better of two candidate shapes.
 *
 * The shape must give the player a box to hold, so a candidate that puts
 * nothing on the neck loses to one that does. A candidate that keeps every
 * note at or above the first note of the run wins next, because that is
 * rule 1. The tightest box wins last, and a tie goes to the candidate the
 * engine tried first, which is the one that asks for the fewest notes.
 *
 * @param {{positions:object[], fits:boolean, span:number}|null} best the best
 *   candidate so far
 * @param {{positions:object[], fits:boolean, span:number}} next the candidate
 *   to compare
 * @returns {boolean} true when `next` is the better candidate
 */
function isBetterCount(best, next) {
  if (!best) return true;
  if (!next.positions.length) return false;
  if (!best.positions.length) return true;
  if (next.fits !== best.fits) return next.fits;
  return next.span < best.span;
}

/** How far a set of positions reaches below its first note, and how wide. */
function measurePositions(positions) {
  let reach = 0;
  let span = 0;
  positions.forEach(p => {
    reach = Math.max(reach, p.anchorFret - p.start);
    span = Math.max(span, p.span);
  });
  return { reach, span, fits: reach <= POSITION_REACH_BACK };
}

/**
 * Builds every position of a scale across the neck.
 *
 * The tonal centre picks which degree starts position 1. The scale itself does
 * not change, so a minor scale stays minor in every position. Only the note
 * the position starts on changes.
 *
 * The engine tries each note count and keeps the best one. The count must move
 * the hand about as far as the gap between two strings. Too few notes and the
 * run falls behind the first note, which breaks rule 1. Too many notes and the
 * box stops being a box. On a regular tuning the winner is three notes for a
 * seven-note scale and two notes for a pentatonic scale, which are the counts
 * the published shapes use.
 *
 * @param {object} opts
 * @param {number[]} opts.openMidis MIDI note of each open string, low first
 * @param {number[]} opts.semis semitones of each scale degree above the root
 * @param {number} opts.rootSemi semitone class (0-11) of the scale root
 * @param {number} [opts.modeIndex] degree that acts as the tonal centre
 * @param {number} [opts.maxFret] last fret of the neck
 * @returns {{
 *   index:number, degree:number, degreeSemi:number, anchorSemi:number,
 *   anchorFret:number, perString:number, isTonic:boolean, octave:number,
 *   start:number, end:number, span:number,
 *   notes:{string:number, fret:number, midi:number}[],
 * }[]} positions, low on the neck first
 */
export function buildScalePositions({ openMidis, semis, rootSemi, modeIndex = 0, maxFret = 24 }) {
  if (!Array.isArray(openMidis) || !openMidis.length) return [];
  if (!Array.isArray(semis) || !semis.length) return [];

  const count = semis.length;
  const mode = ((modeIndex % count) + count) % count;
  const modalRootSemi = pitchClass(rootSemi + semis[mode]);
  const classes = new Set(semis.map(s => pitchClass(rootSemi + s)));

  // Degrees measured from the tonal centre, so position 1 starts on it.
  const fromCentre = [];
  for (let k = 0; k < count; k++) {
    fromCentre.push(pitchClass(semis[(mode + k) % count] - semis[mode]));
  }

  // An unbroken run is worth more than any note count, so try every count
  // first. Only a tuning with a very wide gap between two strings needs the
  // run to jump, and then the jump is the only way to hold the shape.
  let best = null;
  for (const jump of [false, true]) {
    for (let perString = MIN_NOTES_PER_STRING; perString <= MAX_NOTES_PER_STRING; perString++) {
      const positions = buildForCount(
        openMidis, classes, fromCentre, modalRootSemi, perString, jump, maxFret,
      );
      const candidate = { positions, ...measurePositions(positions) };
      if (isBetterCount(best, candidate)) best = candidate;
    }
    if (best && best.positions.length) break;
  }

  const positions = best ? best.positions : [];
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
