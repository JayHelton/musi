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
    label: 'Scale pyramid',
    hint: '1 | 1 2 1 | 1 2 3 2 1 ...',
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

export function buildPatternOffsets(scaleName, patternId) {
  const scale = selectedScaleOffsets(scaleName);
  const pattern = patternById(patternId);

  if (pattern.id === 'five-tone') {
    return ascendDescend(scale.slice(0, Math.min(5, scale.length)));
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
