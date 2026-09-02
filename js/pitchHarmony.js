/**
 * Harmony drill logic for the Pitch Runner.
 *
 * A harmony run holds one root note for the whole run. The singer sings a
 * harmony above or below that root. This module turns a set of interval ids
 * and a direction into the concrete MIDI notes the runner scrolls, and it
 * places the root inside the vocal range the player picked.
 *
 * The module holds no DOM code and no audio code, so the Node test runners can
 * import it.
 */

import { midiInRange, midiOctave, pickAnchorForOctave } from './pitchExercises.js';
import { parseNote } from './theory.js';

/**
 * The intervals the player can pick. `semitones` counts up from the root. The
 * direction decides the sign. Unison is not in the list: the runner drops a
 * detected pitch that sits on the root, because that pitch is the drone and
 * not the voice.
 */
export const HARMONY_INTERVALS = [
  { id: 'm2', semitones: 1,  label: 'm2', name: 'Minor 2nd' },
  { id: 'M2', semitones: 2,  label: 'M2', name: 'Major 2nd' },
  { id: 'm3', semitones: 3,  label: 'm3', name: 'Minor 3rd' },
  { id: 'M3', semitones: 4,  label: 'M3', name: 'Major 3rd' },
  { id: 'P4', semitones: 5,  label: 'P4', name: 'Perfect 4th' },
  { id: 'TT', semitones: 6,  label: 'TT', name: 'Tritone' },
  { id: 'P5', semitones: 7,  label: 'P5', name: 'Perfect 5th' },
  { id: 'm6', semitones: 8,  label: 'm6', name: 'Minor 6th' },
  { id: 'M6', semitones: 9,  label: 'M6', name: 'Major 6th' },
  { id: 'm7', semitones: 10, label: 'm7', name: 'Minor 7th' },
  { id: 'M7', semitones: 11, label: 'M7', name: 'Major 7th' },
  { id: 'P8', semitones: 12, label: 'P8', name: 'Perfect Octave' },
];

/** The intervals a new player starts with: a major third and a fifth. */
export const HARMONY_DEFAULT_IDS = ['M3', 'P5'];

/** Which side of the root the singer harmonises on. */
export const HARMONY_DIRECTIONS = [
  { id: 'above', label: 'Above the root' },
  { id: 'below', label: 'Below the root' },
  { id: 'both',  label: 'Both sides' },
];

export const HARMONY_DEFAULT_DIRECTION = 'above';

/** The drone level range. The drone must stay under the singing voice. */
export const DRONE_LEVEL_MIN = 0.05;
export const DRONE_LEVEL_MAX = 0.5;
export const DRONE_LEVEL_DEFAULT = 0.18;

/** How near the drone a detected pitch must be to count as drone bleed. */
export const DRONE_BLEED_CENTS = 55;

/** The interval with this id, or null. */
export function harmonyIntervalById(id) {
  return HARMONY_INTERVALS.find(i => i.id === id) || null;
}

/** Read a direction id. It returns the default for anything else. */
export function parseDirection(value) {
  return HARMONY_DIRECTIONS.some(d => d.id === value) ? value : HARMONY_DEFAULT_DIRECTION;
}

/**
 * Read a saved interval selection. It takes a comma string or an array, drops
 * every unknown id, and keeps the catalog order. It returns the default set
 * when nothing is left.
 * @returns {string[]}
 */
export function parseIntervalIds(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value == null ? '' : value).split(',');
  const wanted = new Set(raw.map(s => String(s).trim()).filter(Boolean));
  const ids = HARMONY_INTERVALS.filter(i => wanted.has(i.id)).map(i => i.id);
  return ids.length ? ids : [...HARMONY_DEFAULT_IDS];
}

/** Write an interval selection for `saveSetting`. */
export function serializeIntervalIds(ids) {
  return parseIntervalIds(ids).join(',');
}

/**
 * The signed semitone offsets one pass sings, sorted low to high. `both`
 * sings every interval below the root and then above it.
 * @param {string[]} ids interval ids
 * @param {string} direction 'above', 'below', or 'both'
 * @returns {number[]}
 */
export function harmonyOffsets(ids, direction) {
  const dir = parseDirection(direction);
  const semitones = parseIntervalIds(ids)
    .map(id => harmonyIntervalById(id).semitones);
  const signed = [];
  if (dir === 'below' || dir === 'both') signed.push(...semitones.map(s => -s));
  if (dir === 'above' || dir === 'both') signed.push(...semitones);
  return [...new Set(signed)].sort((a, b) => a - b);
}

/** The name of one harmony bar, e.g. `M3` or `M3 below`. */
export function harmonyLabelFor(offset) {
  const interval = HARMONY_INTERVALS.find(i => i.semitones === Math.abs(offset));
  if (!interval) return '';
  return offset < 0 ? `${interval.label} below` : interval.label;
}

/**
 * Every note of the root pitch class that sits inside the vocal range. The
 * drone holds one of these, so the singer hears a root they can also sing.
 */
function rootCandidates(rootPc, low, high) {
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  const pc = ((rootPc % 12) + 12) % 12;
  const first = lo + ((((pc - (lo % 12)) % 12) + 12) % 12);
  const out = [];
  for (let midi = first; midi <= hi; midi += 12) out.push(midi);
  return out;
}

/**
 * The root the drill holds.
 *
 * The singer picks the octave, and the pick takes the nearest octave that
 * still sings one interval or more. No pick keeps the root that sings the most
 * intervals. A tie then goes to the root nearest the middle of the range,
 * because that root is the easiest to sing.
 *
 * @param {{rootMidi: number, fits: number[], distance: number}[]} usable
 * @param {number|null} startOctave
 */
function pickHarmonyRoot(usable, startOctave) {
  // Number(null) is 0, so an empty pick must be rejected before the cast.
  const want = startOctave == null || startOctave === '' ? NaN : Number(startOctave);
  if (Number.isFinite(want)) {
    const rootMidi = pickAnchorForOctave(usable.map(item => item.rootMidi), want);
    return usable.find(item => item.rootMidi === rootMidi) || usable[0];
  }
  let best = usable[0];
  for (const item of usable) {
    if (item.fits.length > best.fits.length
      || (item.fits.length === best.fits.length && item.distance < best.distance)) {
      best = item;
    }
  }
  return best;
}

/**
 * Build one pass of a harmony run.
 *
 * The root is placed inside the vocal range, so an interval below the root
 * still has room. The root itself is not sung: the drone holds it.
 *
 * `startOctave` names the octave the root sits in. The build takes the nearest
 * octave that still sings an interval, and null lets the build pick the root.
 *
 * A wide pick does not always fit. A two-octave range holds a fifth each way
 * for most roots, but not for every root. The build then keeps the intervals
 * that fit and names the ones it dropped, so the drill still runs and the
 * player reads what happened.
 *
 * @param {{ rootName: string, intervalIds: string[], direction: string,
 *           low: number, high: number, startOctave: number|null }} options
 * @returns {{ ok: boolean, midis: number[], offsets: number[],
 *             rootMidi: number|null, dropped: number[], octaves: number[],
 *             error: string|null }}
 */
export function buildHarmonySequence({
  rootName = 'C',
  intervalIds = HARMONY_DEFAULT_IDS,
  direction = HARMONY_DEFAULT_DIRECTION,
  low,
  high,
  startOctave = null,
} = {}) {
  const wanted = harmonyOffsets(intervalIds, direction);
  if (!wanted.length) {
    return {
      ok: false, midis: [], offsets: [], rootMidi: null, dropped: [], octaves: [],
      error: 'Pick at least one interval.',
    };
  }
  const parsed = parseNote(rootName);
  const rootPc = parsed ? parsed.semi : 0;
  const candidates = rootCandidates(rootPc, low, high);
  if (!candidates.length) {
    return {
      ok: false, midis: [], offsets: [], rootMidi: null, dropped: [], octaves: [],
      error: 'The root does not fit the selected vocal range.',
    };
  }

  const rangeCenter = (Math.min(low, high) + Math.max(low, high)) / 2;
  const usable = [];
  for (const rootMidi of candidates) {
    const fits = wanted.filter(off => midiInRange(rootMidi + off, low, high));
    if (!fits.length) continue;
    usable.push({ rootMidi, fits, distance: Math.abs(rootMidi - rangeCenter) });
  }

  if (!usable.length) {
    return {
      ok: false, midis: [], offsets: [], rootMidi: null, dropped: [...wanted], octaves: [],
      error: 'These intervals do not fit the selected vocal range.',
    };
  }

  const best = pickHarmonyRoot(usable, startOctave);
  const kept = new Set(best.fits);
  return {
    ok: true,
    midis: best.fits.map(off => best.rootMidi + off),
    offsets: best.fits,
    rootMidi: best.rootMidi,
    dropped: wanted.filter(off => !kept.has(off)),
    octaves: usable.map(item => midiOctave(item.rootMidi)),
    error: null,
  };
}

/**
 * True when a detected pitch sits on the drone. The runner drops such a frame,
 * because the drone sounds for the whole run and the microphone hears it.
 *
 * The test uses the exact drone MIDI note and not its pitch class, so an
 * octave harmony still scores.
 */
export function isDroneBleed(freqHz, droneMidi, tolCents = DRONE_BLEED_CENTS) {
  if (!Number.isFinite(droneMidi)) return false;
  if (!Number.isFinite(freqHz) || freqHz <= 0) return false;
  const midiFloat = 69 + 12 * Math.log2(freqHz / 440);
  return Math.abs(midiFloat - droneMidi) * 100 <= tolCents;
}

/** True when the drone and every harmony note fit the range. */
export function harmonyFitsRange(rootMidi, offsets, low, high) {
  if (!Number.isFinite(rootMidi)) return false;
  return [0, ...offsets].every(off => midiInRange(rootMidi + off, low, high));
}

/** Read a drone level. It holds the value between the two limits. */
export function clampDroneLevel(value) {
  const level = Number(value);
  if (!Number.isFinite(level)) return DRONE_LEVEL_DEFAULT;
  return Math.min(DRONE_LEVEL_MAX, Math.max(DRONE_LEVEL_MIN, level));
}
