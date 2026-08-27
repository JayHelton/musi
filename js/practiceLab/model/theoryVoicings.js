// The voicings of one chord on one neck.
//
// The Theory tab must answer "which of these chords can I actually play, and
// where?". A fixed shape library cannot answer that, because the tab must also
// cover a diminished major 7 in a drop tuning. So this module searches the neck
// itself: it puts the chord root on a bass string, looks at every chord tone
// inside a four-fret window above it, and keeps the combinations a hand can
// hold.
//
// Every function is pure. It takes the open-string MIDI notes and a set of
// pitch classes, and it returns plain data. There is no DOM and no audio here.

/** The search limits. A caller can raise or lower any of them. */
export const VOICING_DEFAULTS = {
  minFret: 0,
  maxFret: 15,
  /** The widest fret distance between the lowest and the highest fretted note. */
  maxSpan: 4,
  /** How many separate frets one hand can hold. A barre across one fret counts as one. */
  maxFingers: 4,
  /** The fewest sounding strings a voicing may use. */
  minVoices: 3,
  /** How many voicings to return. */
  limit: 24,
  /** Let a voicing use an open string. */
  allowOpen: true,
  /** Keep the chord root as the lowest sounding note. */
  rootInBass: true,
  /** How many silent strings may sit between two sounding strings. */
  maxInnerMutes: 1,
  /** Drop a voicing that only mutes strings of a better one. */
  dropSubsets: true,
};

function pcOf(midi) {
  return ((midi % 12) + 12) % 12;
}

/**
 * The frets on one string that sound one pitch class.
 * @returns {number[]} in ascending fret order
 */
export function fretsForPitchClass(openMidi, pc, minFret, maxFret) {
  const out = [];
  const first = ((pc - pcOf(openMidi)) % 12 + 12) % 12;
  for (let fret = first; fret <= maxFret; fret += 12) {
    if (fret >= minFret) out.push(fret);
  }
  return out;
}

// The tones a voicing must carry. The root names the chord, the third or the
// suspension names the quality, and the seventh names the colour. A fifth is
// the first tone a guitarist drops, so it is never required.
function requiredLabels(tones) {
  const labels = new Set(tones.map(t => t.label));
  const required = ['R'];
  for (const label of ['3', 'b3', '2', '4']) {
    if (labels.has(label)) { required.push(label); break; }
  }
  for (const label of ['7', 'b7', 'bb7']) {
    if (labels.has(label)) { required.push(label); break; }
  }
  // An altered fifth is the whole point of the chord, so keep it.
  for (const label of ['b5', '#5']) {
    if (labels.has(label)) required.push(label);
  }
  // A ninth, an eleventh, or a thirteenth is why the player picked the chord.
  for (const tone of tones) {
    if (tone.slot >= 4) required.push(tone.label);
  }
  return [...new Set(required)];
}

/**
 * Search one neck for the voicings of one chord.
 *
 * @param {Object} options
 * @param {number[]} options.openMidis open-string MIDI notes, low string first
 * @param {{pc:number, label:string, slot:number}[]} options.tones the chord tones
 * @param {Object} [options.limits] any field of VOICING_DEFAULTS
 * @returns {Array<{frets:(number|null)[], labels:(string|null)[], midis:(number|null)[],
 *   lowFret:number, highFret:number, span:number, fingers:number, voices:number,
 *   bassLabel:string, innerMutes:number, score:number, id:string}>}
 */
export function findVoicings({ openMidis, tones, limits = {} }) {
  const cfg = { ...VOICING_DEFAULTS, ...limits };
  // "No open strings" means no fret zero anywhere, so the shapes stay movable.
  if (!cfg.allowOpen) cfg.minFret = Math.max(1, cfg.minFret);
  const stringCount = openMidis.length;
  if (stringCount < 3 || !tones || !tones.length) return [];

  const labelByPc = new Map();
  for (const tone of tones) {
    if (!labelByPc.has(tone.pc)) labelByPc.set(tone.pc, tone.label);
  }
  const chordPcs = new Set(labelByPc.keys());
  const required = requiredLabels(tones);
  const rootPc = tones[0].pc;
  const bassPcs = cfg.rootInBass ? [rootPc] : [...chordPcs];

  const found = new Map();

  for (let bass = 0; bass <= stringCount - cfg.minVoices; bass++) {
    for (const bassPc of bassPcs) {
      const bassFrets = fretsForPitchClass(openMidis[bass], bassPc, cfg.minFret, cfg.maxFret);
      for (const bassFret of bassFrets) {
        collectFromBass({
          bass, bassFret, openMidis, stringCount, cfg, chordPcs, labelByPc, required, found,
        });
      }
    }
  }

  const list = [...found.values()];
  list.sort((a, b) => (b.score - a.score) || (a.lowFret - b.lowFret) || (a.span - b.span));
  const kept = cfg.dropSubsets ? dropSubsets(list) : list;
  return kept.slice(0, cfg.limit);
}

// Two voicings that press the same frets, where one only mutes strings the
// other plays, are one shape to the hand. Keep the one that scored higher.
function dropSubsets(list) {
  const kept = [];
  for (const candidate of list) {
    const covered = kept.some(better => isSubsetOf(candidate, better));
    if (!covered) kept.push(candidate);
  }
  return kept;
}

function isSubsetOf(small, big) {
  let sameCount = 0;
  for (let s = 0; s < small.frets.length; s++) {
    const a = small.frets[s];
    const b = big.frets[s];
    if (a == null) continue;
    if (a !== b) return false;
    sameCount += 1;
  }
  return sameCount > 0 && sameCount < big.voices;
}

// Build every playable combination that keeps `bassFret` as the lowest note.
function collectFromBass({ bass, bassFret, openMidis, stringCount, cfg, chordPcs, labelByPc, required, found }) {
  // The hand covers a window that starts one fret under the bass note, so a
  // shape such as a minor 7 with the b3 below the root still appears.
  const windowLow = Math.max(cfg.minFret, bassFret - 1);
  const windowHigh = Math.min(cfg.maxFret, bassFret + cfg.maxSpan - 1);

  const choices = [];
  for (let s = bass + 1; s < stringCount; s++) {
    const options = [null];
    for (let fret = windowLow; fret <= windowHigh; fret++) {
      const pc = pcOf(openMidis[s] + fret);
      if (chordPcs.has(pc)) options.push(fret);
    }
    if (cfg.allowOpen && windowLow > 0) {
      const openPc = pcOf(openMidis[s]);
      // An open string only works when it does not sit under the bass note.
      if (chordPcs.has(openPc) && openMidis[s] >= openMidis[bass] + bassFret) options.push(0);
    }
    choices.push(options);
  }

  const frets = new Array(stringCount).fill(null);
  for (let s = 0; s < bass; s++) frets[s] = null;
  frets[bass] = bassFret;

  walk(0);

  function walk(index) {
    if (index === choices.length) {
      const candidate = evaluate({ frets, openMidis, bass, cfg, labelByPc, required });
      if (candidate && (!found.has(candidate.id) || found.get(candidate.id).score < candidate.score)) {
        found.set(candidate.id, candidate);
      }
      return;
    }
    const stringIndex = bass + 1 + index;
    for (const option of choices[index]) {
      frets[stringIndex] = option;
      walk(index + 1);
    }
    frets[stringIndex] = null;
  }
}

// Turn one fret pattern into a voicing, or return null when a hand cannot hold
// it or the chord loses a tone it needs.
function evaluate({ frets, openMidis, bass, cfg, labelByPc, required }) {
  const sounding = [];
  for (let s = 0; s < frets.length; s++) {
    if (frets[s] != null) sounding.push(s);
  }
  if (sounding.length < cfg.minVoices) return null;

  // Count the silent strings that sit between two sounding strings.
  let innerMutes = 0;
  for (let s = sounding[0]; s <= sounding[sounding.length - 1]; s++) {
    if (frets[s] == null) innerMutes += 1;
  }
  if (innerMutes > cfg.maxInnerMutes) return null;

  const fretted = sounding.map(s => frets[s]).filter(f => f > 0);
  const lowFret = fretted.length ? Math.min(...fretted) : 0;
  const highFret = fretted.length ? Math.max(...fretted) : 0;
  const span = fretted.length ? highFret - lowFret + 1 : 1;
  if (span > cfg.maxSpan) return null;

  // A barre plays every string at one fret with one finger, so count frets.
  const fingers = new Set(fretted).size;
  if (fingers > cfg.maxFingers) return null;

  const labels = frets.map((fret, s) => (fret == null ? null : labelByPc.get(pcOf(openMidis[s] + fret)) || null));
  const present = new Set(labels.filter(Boolean));
  for (const label of required) {
    if (!present.has(label)) return null;
  }

  const midis = frets.map((fret, s) => (fret == null ? null : openMidis[s] + fret));
  const bassLabel = labels[bass] || 'R';

  let score = 0;
  score += sounding.length * 2;
  score += innerMutes === 0 ? 6 : 0;
  score += present.has('3') || present.has('b3') ? 3 : 0;
  score += present.has('b7') || present.has('7') || present.has('bb7') ? 2 : 0;
  score += bassLabel === 'R' ? 4 : 0;
  score -= span;
  score -= fingers;
  // A shape near the nut is easier to reach, so give it a small lift.
  score -= lowFret / 12;

  return {
    id: frets.map(f => (f == null ? 'x' : f)).join('-'),
    frets: frets.slice(),
    labels,
    midis,
    lowFret,
    highFret,
    span,
    fingers,
    voices: sounding.length,
    innerMutes,
    bassLabel,
    score: Math.round(score * 100) / 100,
  };
}

/**
 * Group voicings by the region of the neck they sit in.
 * The Chords view lists one row per region so the player can pick a position.
 * @param {Array} voicings from `findVoicings`
 * @param {number} [width] how many frets one region covers
 */
export function groupByPosition(voicings, width = 4) {
  const map = new Map();
  for (const voicing of voicings) {
    const zone = Math.floor(voicing.lowFret / width);
    const entry = map.get(zone) || { zone, from: zone * width, to: zone * width + width - 1, voicings: [] };
    entry.voicings.push(voicing);
    map.set(zone, entry);
  }
  return [...map.values()].sort((a, b) => a.from - b.from);
}
