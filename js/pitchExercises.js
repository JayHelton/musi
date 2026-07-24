import { SCALES } from './scales.js';

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

export function chooseRootMidi(rootPc, lowMidi, highMidi, span) {
  const pc = ((rootPc % 12) + 12) % 12;
  const low = Math.floor(lowMidi);
  const high = Math.floor(highMidi);
  const maxRoot = high - Math.max(0, Math.floor(span));
  const first = low + (((pc - (low % 12)) % 12) + 12) % 12;

  // Prefer the lowest matching root whose whole pattern span fits the range.
  // If the selected range is narrower than the pattern, keep the historical
  // low-range anchor so the exercise remains predictable.
  if (maxRoot >= low && first <= maxRoot) return first;
  return first;
}
