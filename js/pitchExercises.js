import { SCALES } from './scales.js';
import { parseNote } from './theory.js';

export const INTERVAL_SEQUENCE = [0, 2, 0, 4, 0, 5, 0, 7, 0, 9, 0, 11, 0, 12];

export const SCALE_PATTERNS = [
  {
    id: 'full',
    label: 'Full scale up/down',
    hint: '1 2 3 4 5 6 7 8 7 6 5 4 3 2 1',
  },
  {
    id: 'five-tone',
    label: 'Five-tone warmup',
    hint: '1 2 3 4 5 4 3 2 1',
  },
  {
    id: 'penta-subset',
    label: 'Pentatonic subset',
    hint: '1 2 3 5 6 5 3 2 1',
  },
  {
    id: 'skip-tones',
    label: 'Skipping notes',
    hint: '1 3 5 6 5 3 1',
  },
  {
    id: 'interval-drill',
    label: 'Interval training',
    hint: '1-2 · 1-3 · 1-5 · 2-6',
  },
  {
    id: 'triad',
    label: 'Triad arpeggio',
    hint: '1 3 5 3 1',
  },
  {
    id: 'octave-arp',
    label: 'Octave arpeggio',
    hint: '1 3 5 8 5 3 1',
  },
  {
    id: 'thirds',
    label: 'Thirds ladder',
    hint: '1 3 2 4 3 5 ...',
  },
  {
    id: 'third-jumps',
    label: 'Third jumps',
    hint: '1 3 1 · 2 4 2 · 3 5 3 ...',
  },
  {
    id: 'fourth-jumps',
    label: 'Fourth jumps',
    hint: '1 4 1 · 2 5 2 · 3 6 3 ...',
  },
  {
    id: 'fifth-jumps',
    label: 'Fifth jumps',
    hint: '1 5 1 · 2 6 2 · 3 7 3 ...',
  },
  {
    id: 'mixed-fourths',
    label: 'Mixed fourths',
    hint: '1 4 6 8 6 4 1',
  },
  {
    id: 'mixed-sevenths',
    label: 'Mixed thirds + 7th',
    hint: '1 3 5 7 8 7 5 3 1',
  },
  {
    id: 'descending',
    label: 'Descending scale',
    hint: '8 7 6 5 4 3 2 1',
  },
  {
    id: 'top-five',
    label: 'Five-note descent',
    hint: '5 4 3 2 1 2 3 4 5',
  },
  {
    id: 'pyramid',
    label: 'Solfege ladder',
    hint: '1 2 1 | 1 2 3 2 1 | … | full octave',
  },
];

export function ascendDescend(offsets) {
  if (offsets.length <= 1) {
    return [...offsets];
  }
  const descending = offsets.slice(1, -1).reverse();
  return [...offsets, ...descending, offsets[0]];
}

function patternById(patternId) {
  return SCALE_PATTERNS.find(p => p.id === patternId) || SCALE_PATTERNS[0];
}

function selectedScaleOffsets(scaleName) {
  const def = SCALES[scaleName] || SCALES['Major (Ionian)'];
  const offsets = def.map(([, semitone]) => semitone);
  return [...offsets, 12];
}

function pickSteps(scale, indexes) {
  const last = scale.length - 1;
  return indexes.map(idx => scale[Math.min(idx, last)]);
}

function uniqueInOrder(offsets) {
  const seen = new Set();
  const out = [];
  for (const n of offsets) {
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/** Tone count excluding the trailing octave. */
function toneCount(scale) {
  return Math.max(0, scale.length - 1);
}

function isWideScale(scale) {
  return toneCount(scale) >= 7;
}

function buildThirds(scale) {
  const asc = [];
  for (let i = 0; i < scale.length - 2; i++) {
    asc.push(scale[i], scale[i + 2]);
  }

  const desc = [];
  for (let i = scale.length - 1; i >= 2; i--) {
    desc.push(scale[i], scale[i - 2]);
  }

  return [...asc, ...desc.slice(1)];
}

function buildPyramid(scale) {
  const offsets = [];
  for (let top = 0; top < scale.length; top++) {
    const segment = ascendDescend(scale.slice(0, top + 1));
    if (top > 0) offsets.push(...segment.slice(1));
    else offsets.push(...segment);
  }
  return offsets;
}

/** Out-and-back jumps of a fixed scale-degree span (3rd / 4th / 5th). */
function buildDegreeJumps(scale, span) {
  const offsets = [];
  for (let i = 0; i + span < scale.length; i++) {
    const a = scale[i];
    const b = scale[i + span];
    if (offsets.length && offsets[offsets.length - 1] === a) {
      offsets.push(b, a);
    } else {
      offsets.push(a, b, a);
    }
  }
  return offsets;
}

function appendOutAndBack(offsets, a, b) {
  if (offsets.length && offsets[offsets.length - 1] === a) {
    offsets.push(b, a);
  } else {
    offsets.push(a, b, a);
  }
}

/**
 * Lesson-style interval pairs:
 * 1→2, 1→3, 1→5, and 2→6 (each sung out and back).
 * On pentatonic-sized scales, 5th/6th use the nearer available degrees.
 */
function buildIntervalDrill(scale) {
  const fifthIdx = isWideScale(scale) ? 4 : Math.min(3, scale.length - 1);
  const sixthIdx = isWideScale(scale) ? 5 : Math.min(4, scale.length - 1);
  const pairs = [
    [0, 1],
    [0, 2],
    [0, fifthIdx],
    [1, sixthIdx],
  ];
  const offsets = [];
  for (const [aIdx, bIdx] of pairs) {
    if (bIdx >= scale.length || aIdx === bIdx) continue;
    appendOutAndBack(offsets, scale[aIdx], scale[bIdx]);
  }
  return offsets.length ? offsets : ascendDescend(scale.slice(0, Math.min(3, scale.length)));
}

/** Degrees 1 2 3 5 6 (+ octave) — major-pentatonic drill on a full major scale. */
function buildPentaSubset(scale) {
  if (!isWideScale(scale)) {
    return ascendDescend(scale);
  }
  return ascendDescend(uniqueInOrder(pickSteps(scale, [0, 1, 2, 4, 5, scale.length - 1])));
}

/** Lesson "skipping notes": Do-Mi-Sol-La (omit the 2nd), then back down. */
function buildSkipTones(scale) {
  const indexes = isWideScale(scale) ? [0, 2, 4, 5] : [0, 2, 3, 4];
  return ascendDescend(uniqueInOrder(pickSteps(scale, indexes)));
}

export function buildPatternOffsets(scaleName, patternId) {
  const scale = selectedScaleOffsets(scaleName);
  const pattern = patternById(patternId);

  if (pattern.id === 'five-tone') {
    return ascendDescend(scale.slice(0, Math.min(5, scale.length)));
  }
  if (pattern.id === 'penta-subset') {
    return buildPentaSubset(scale);
  }
  if (pattern.id === 'skip-tones') {
    return buildSkipTones(scale);
  }
  if (pattern.id === 'interval-drill') {
    return buildIntervalDrill(scale);
  }
  if (pattern.id === 'triad') {
    return ascendDescend(pickSteps(scale, [0, 2, 4]));
  }
  if (pattern.id === 'octave-arp') {
    return ascendDescend(pickSteps(scale, [0, 2, 4, scale.length - 1]));
  }
  if (pattern.id === 'thirds') {
    return buildThirds(scale);
  }
  if (pattern.id === 'third-jumps') {
    return buildDegreeJumps(scale, 2);
  }
  if (pattern.id === 'fourth-jumps') {
    return buildDegreeJumps(scale, 3);
  }
  if (pattern.id === 'fifth-jumps') {
    return buildDegreeJumps(scale, 4);
  }
  if (pattern.id === 'mixed-fourths') {
    return ascendDescend(uniqueInOrder(pickSteps(scale, [0, 3, 5, scale.length - 1])));
  }
  if (pattern.id === 'mixed-sevenths') {
    return ascendDescend(uniqueInOrder(pickSteps(scale, [0, 2, 4, 6, scale.length - 1])));
  }
  if (pattern.id === 'descending') {
    return [...scale].reverse();
  }
  if (pattern.id === 'top-five') {
    const top = scale.slice(0, Math.min(5, scale.length));
    return [...top].reverse().concat(top.slice(1));
  }
  if (pattern.id === 'pyramid') {
    return buildPyramid(scale);
  }

  return ascendDescend(scale);
}

export function buildStages(scaleName = 'Major (Ionian)', patternId = 'full') {
  const pattern = patternById(patternId);
  return [
    {
      id: `${scaleName}:${pattern.id}`,
      label: `${scaleName} · ${pattern.label}`,
      hint: pattern.hint,
      kind: 'scale-pattern',
      offsets: buildPatternOffsets(scaleName, pattern.id),
    },
  ];
}

export const INTERVAL_SEMITONES = {
  m2: 1, M2: 2, m3: 3, M3: 4, P4: 5, 'A4/d5': 6, P5: 7,
  m6: 8, M6: 9, m7: 10, M7: 11, P8: 12,
};

export function midiInRange(midi, low, high) {
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  return midi >= lo && midi <= hi;
}

export function chromaticMidisInRange(low, high) {
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  const midis = [];
  for (let m = lo; m <= hi; m++) midis.push(m);
  return midis;
}

/**
 * Place offsets (semitones from a root pitch class) into [low, high].
 * Returns { ok, midis, rootMidi, error }.
 */
export function placeOffsetsInRange(offsets, rootPc, low, high) {
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  const pc = ((rootPc % 12) + 12) % 12;
  if (!offsets.length) {
    return { ok: false, midis: [], rootMidi: null, error: 'No notes in pattern.' };
  }
  const span = offsets.reduce((m, o) => Math.max(m, o), 0);
  const first = lo + (((pc - (lo % 12)) % 12) + 12) % 12;

  for (let rootMidi = first; rootMidi <= hi; rootMidi += 12) {
    if (rootMidi + span > hi) break;
    const midis = offsets.map(off => rootMidi + off);
    if (midis.every(m => midiInRange(m, lo, hi))) {
      return { ok: true, midis, rootMidi, error: null };
    }
  }

  return {
    ok: false,
    midis: [],
    rootMidi: null,
    error: 'This pattern does not fit the selected range.',
  };
}

/** Validate a concrete midi array. ok:false with error if any note is outside. */
export function validateMidiSequence(midis, low, high) {
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  if (!midis.length) {
    return { ok: false, error: 'No notes in sequence.' };
  }
  for (const m of midis) {
    if (!midiInRange(m, lo, hi)) {
      return { ok: false, error: 'A note is outside the selected range.' };
    }
  }
  return { ok: true, error: null };
}

export function chooseRootMidi(rootPc, lowMidi, highMidi, span) {
  const pc = ((rootPc % 12) + 12) % 12;
  const lo = Math.floor(Math.min(lowMidi, highMidi));
  const hi = Math.floor(Math.max(lowMidi, highMidi));
  const maxRoot = hi - Math.max(0, Math.floor(span));
  const first = lo + (((pc - (lo % 12)) % 12) + 12) % 12;

  if (maxRoot >= lo && first <= maxRoot) return first;
  return first;
}

function fiveToneOffsets(scaleName) {
  const scale = selectedScaleOffsets(scaleName);
  return ascendDescend(scale.slice(0, Math.min(5, scale.length)));
}

function triadOffsets(scaleName) {
  const scale = selectedScaleOffsets(scaleName);
  return ascendDescend(pickSteps(scale, [0, 2, 4]));
}

function placeIntervalInRange(low, high, intervalSemitones, direction) {
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  const semis = INTERVAL_SEMITONES[intervalSemitones] ?? INTERVAL_SEMITONES.M2;
  const delta = direction === 'descending' ? -semis : semis;

  for (let anchor = lo; anchor <= hi; anchor++) {
    const target = anchor + delta;
    if (midiInRange(target, lo, hi)) {
      return { ok: true, midis: [target], anchorMidi: anchor, error: null };
    }
  }

  return {
    ok: false,
    midis: [],
    anchorMidi: null,
    error: 'This interval does not fit the selected range.',
  };
}

/**
 * Build a validated note sequence for a trainer task.
 */
export function buildSequenceForTask({
  task = 'pattern',
  patternId = 'full',
  scaleName = 'Major (Ionian)',
  rootName = 'C',
  low,
  high,
  intervalSemitones = 'M2',
  intervalDirection = 'ascending',
}) {
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);

  if (task === 'center' || task === 'land') {
    const midis = chromaticMidisInRange(lo, hi);
    if (!midis.length) {
      return { ok: false, midis: [], error: 'The selected range has no notes.' };
    }
    return { ok: true, midis, error: null };
  }

  if (task === 'interval') {
    return placeIntervalInRange(lo, hi, intervalSemitones, intervalDirection);
  }

  const parsed = parseNote(rootName);
  const rootPc = parsed ? parsed.semi : 0;
  const offsets = buildPatternOffsets(scaleName, patternId);
  let placed = placeOffsetsInRange(offsets, rootPc, lo, hi);

  if (!placed.ok && patternId !== 'five-tone') {
    placed = placeOffsetsInRange(fiveToneOffsets(scaleName), rootPc, lo, hi);
  }
  if (!placed.ok) {
    placed = placeOffsetsInRange(triadOffsets(scaleName), rootPc, lo, hi);
  }

  if (!placed.ok) {
    return { ok: false, midis: [], error: placed.error || 'This pattern does not fit the selected range.' };
  }
  return { ok: true, midis: placed.midis, rootMidi: placed.rootMidi, error: null };
}

/**
 * Pick the next target MIDI from candidates using adaptive note stats.
 * Higher priority for large errors, recent fails, and fewer consecutive passes.
 */
export function pickNextCenterMidi(candidates, stats = {}, boostMidis = []) {
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  const boostSet = new Set(boostMidis || []);

  const weights = candidates.map(midi => {
    const s = stats[midi] || { attempts: 0, fails: 0, lastErrorAbs: 0, consecutivePasses: 0 };
    let score = 1;
    score += s.lastErrorAbs * 0.15;
    score += s.fails * 2;
    if (s.consecutivePasses >= 2) score *= 0.2;
    else if (s.consecutivePasses === 1) score *= 0.6;
    score += Math.max(0, 3 - s.attempts) * 0.5;
    if (boostSet.has(midi)) score += 3;
    return Math.max(0.05, score);
  });

  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}
