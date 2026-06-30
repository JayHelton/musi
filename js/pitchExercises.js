export const ARPEGGIOS = [
  { id: 'maj', label: 'Major triad', offsets: [0, 4, 7, 12] },
  { id: 'min', label: 'Minor triad', offsets: [0, 3, 7, 12] },
  { id: 'dom7', label: 'Dominant 7th', offsets: [0, 4, 7, 10, 12] },
  { id: 'maj7', label: 'Major 7th', offsets: [0, 4, 7, 11, 12] },
  { id: 'min7', label: 'Minor 7th', offsets: [0, 3, 7, 10, 12] },
  { id: 'dim7', label: 'Diminished 7th', offsets: [0, 3, 6, 9, 12] },
];

export const SCALE_SHAPES = {
  major: [0, 2, 4, 5, 7, 9, 11, 12],
  minor: [0, 2, 3, 5, 7, 8, 10, 12],
  majorPenta: [0, 2, 4, 7, 9, 12],
  minorPenta: [0, 3, 5, 7, 10, 12],
};

export const INTERVAL_SEQUENCE = [0, 2, 0, 4, 0, 5, 0, 7, 0, 9, 0, 11, 0, 12];

export function ascendDescend(offsets) {
  if (offsets.length <= 1) {
    return [...offsets];
  }
  const descending = offsets.slice(1, -1).reverse();
  return [...offsets, ...descending, offsets[0]];
}

export function buildStages() {
  const stages = [
    {
      id: 'intervals',
      label: 'Intervals from root',
      kind: 'intervals',
      offsets: [...INTERVAL_SEQUENCE],
    },
    {
      id: 'major',
      label: 'Major scale',
      kind: 'scale',
      offsets: ascendDescend(SCALE_SHAPES.major),
    },
    {
      id: 'minor',
      label: 'Minor scale',
      kind: 'scale',
      offsets: ascendDescend(SCALE_SHAPES.minor),
    },
    {
      id: 'majorPenta',
      label: 'Major pentatonic',
      kind: 'scale',
      offsets: ascendDescend(SCALE_SHAPES.majorPenta),
    },
    {
      id: 'minorPenta',
      label: 'Minor pentatonic',
      kind: 'scale',
      offsets: ascendDescend(SCALE_SHAPES.minorPenta),
    },
  ];

  for (const a of ARPEGGIOS) {
    stages.push({
      id: 'arp-' + a.id,
      label: a.label + ' arpeggio',
      kind: 'arpeggio',
      offsets: ascendDescend(a.offsets),
    });
  }

  return stages;
}

export function chooseRootMidi(rootPc, lowMidi, highMidi, span) {
  const pc = ((rootPc % 12) + 12) % 12;
  const low = Math.floor(lowMidi);

  // Lowest MIDI note with the requested pitch class that is >= lowMidi. Because
  // raising the root only pushes root+span higher, the lowest candidate is also
  // the one most likely to fit the range, so it doubles as the clamp fallback
  // when nothing fits.
  return low + (((pc - (low % 12)) % 12) + 12) % 12;
}
