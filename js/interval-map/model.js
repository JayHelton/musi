/**
 * Fretboard Interval Map — pitch-based geometry model.
 * All calculations derive from open-string MIDI pitches (no hard-coded diagrams).
 */

import { parseNote, NOTE_NAMES_SHARP, ROOTS } from '../theory.js';
import {
  TUNINGS,
  resolveTuningPitches,
  pitchToMidi,
  getTuningGeometry,
  getAdjacentStringIntervals,
  classifyBoundaryType,
  parseCustomTuningText,
} from '../tunings.js';

export const INTERVAL_INFO = {
  0:  { name: 'Root',        quality: 'R',  degree: '1',  semis: 0,  sound: 'Home pitch — the anchor everything relates to.' },
  1:  { name: 'Minor 2nd',   quality: 'm2', degree: '♭2', semis: 1,  sound: 'Tight dissonance, half-step above the root.' },
  2:  { name: 'Major 2nd',   quality: 'M2', degree: '2',  semis: 2,  sound: 'Stepwise motion — melodic and open.' },
  3:  { name: 'Minor 3rd',   quality: 'm3', degree: '♭3', semis: 3,  sound: 'Minor color — darker triad quality.' },
  4:  { name: 'Major 3rd',   quality: 'M3', degree: '3',  semis: 4,  sound: 'Major color — brighter triad quality.' },
  5:  { name: 'Perfect 4th', quality: 'P4', degree: '4',  semis: 5,  sound: 'Strong consonant frame, power-chord cousin.' },
  6:  { name: 'Tritone',     quality: 'TT', degree: '♭5', semis: 6,  sound: 'Unstable tension — splits the octave.' },
  7:  { name: 'Perfect 5th', quality: 'P5', degree: '5',  semis: 7,  sound: 'Powerful open consonance — power-chord core.' },
  8:  { name: 'Minor 6th',   quality: 'm6', degree: '♭6', semis: 8,  sound: 'Minor-leaning stretch above the fifth.' },
  9:  { name: 'Major 6th',   quality: 'M6', degree: '6',  semis: 9,  sound: 'Bright stretch — inversion of the minor third.' },
  10: { name: 'Minor 7th',   quality: 'm7', degree: '♭7', semis: 10, sound: 'Dominant / minor-seventh color.' },
  11: { name: 'Major 7th',   quality: 'M7', degree: '7',  semis: 11, sound: 'Lush major-seventh tension below the octave.' },
  12: { name: 'Octave',      quality: 'P8', degree: '8',  semis: 12, sound: 'Same note name, one register higher.' },
};

export const ALL_INTERVALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
export const CHORD_TONE_INTERVALS = [0, 3, 4, 7, 10, 11];

/** Map ranges (legacy orbitSize 1/2/3 preserved in storage). */
export const MAP_RANGE_DEFS = {
  1: {
    id: 'local',
    name: 'Local Shape',
    maxStringDist: 2,
    maxFretDist: 4,
    includeNearestOctave: true,
  },
  2: {
    id: 'position',
    name: 'Position Map',
    maxStringDist: 3,
    maxFretDist: 7,
    includeNearestOctave: true,
  },
  3: {
    id: 'full',
    name: 'Full Neck',
    maxStringDist: Infinity,
    maxFretDist: Infinity,
    includeNearestOctave: true,
  },
};

/** Shorter curriculum — 5 levels. */
export const LEVEL_DEFS = {
  1: {
    name: 'Root, Octave, Fourth, Fifth',
    short: 'Level 1',
    intervals: [0, 5, 7],
    lesson: 'These are the strongest geometric anchors on the neck.',
  },
  2: {
    name: 'Major and Minor Color',
    short: 'Level 2',
    intervals: [0, 3, 4, 5, 7],
    lesson: 'Add minor and major thirds for triad color while reviewing Level 1.',
  },
  3: {
    name: 'Seconds and Sevenths',
    short: 'Level 3',
    intervals: [0, 1, 2, 3, 4, 5, 7, 10, 11],
    lesson: 'Paired inversions: m2↔M7 and M2↔m7 around the same anchor.',
  },
  4: {
    name: 'Sixths and Tritone',
    short: 'Level 4',
    intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    lesson: 'Complete the remaining color tones: sixths and the tritone.',
  },
  5: {
    name: 'Complete Chromatic Map',
    short: 'Level 5',
    intervals: ALL_INTERVALS,
    lesson: 'Mix every interval across strings, boundaries, tunings, and answer methods.',
  },
};

export const INTERVAL_PAIRS = [
  [1, 11], [2, 10], [3, 9], [4, 8], [5, 7], [6, 6], [0, 0],
];

export const BOUNDARY_LABELS = {
  fourth: 'Standard fourth',
  'major-third': 'B-string boundary · M3',
  drop: 'Drop boundary · P5',
  fifth: 'Perfect-fifth boundary',
  custom: 'Custom boundary',
};

export function openMidisFromTuning(strings) {
  return strings.map((s) => {
    const m = pitchToMidi(s);
    return m == null ? 0 : m;
  });
}

export function intervalClass(fretMidi, rootMidi) {
  return ((fretMidi - rootMidi) % 12 + 12) % 12;
}

export function noteLabel(midi) {
  return NOTE_NAMES_SHARP[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

export function pitchClassName(midi) {
  return NOTE_NAMES_SHARP[((midi % 12) + 12) % 12];
}

export function intervalLabel(semi, { octaveAs8 = false, convention = 'degree' } = {}) {
  const s = ((semi % 12) + 12) % 12;
  if (octaveAs8 && s === 0) return '8';
  const info = INTERVAL_INFO[s];
  if (!info) return String(s);
  if (convention === 'quality') return info.quality;
  return info.degree;
}

export function describeInterval(semi) {
  const s = semi === 12 ? 12 : ((semi % 12) + 12) % 12;
  const info = INTERVAL_INFO[s] || INTERVAL_INFO[0];
  return {
    ...info,
    compact: `${info.quality} · ${info.degree} · ${info.semis} semitone${info.semis === 1 ? '' : 's'}`,
  };
}

export function makeAnchor({ string, fret, openMidis }) {
  const midi = openMidis[string] + fret;
  return {
    string,
    fret,
    midi,
    pitchClass: ((midi % 12) + 12) % 12,
    noteName: pitchClassName(midi),
    label: noteLabel(midi),
  };
}

export function relativeVector(anchor, position) {
  return {
    deltaString: position.string - anchor.string,
    deltaFret: position.fret - anchor.fret,
  };
}

export function boundaryTypeBetweenStrings(lowerIndex, openMidis) {
  if (lowerIndex < 0 || lowerIndex >= openMidis.length - 1) return null;
  const semis = openMidis[lowerIndex + 1] - openMidis[lowerIndex];
  return {
    lowerIndex,
    upperIndex: lowerIndex + 1,
    semitones: semis,
    type: classifyBoundaryType(semis, lowerIndex, openMidis.length),
    label: BOUNDARY_LABELS[classifyBoundaryType(semis, lowerIndex, openMidis.length)] || BOUNDARY_LABELS.custom,
  };
}

export function boundariesBetweenPositions(stringA, stringB, openMidis) {
  const lo = Math.min(stringA, stringB);
  const hi = Math.max(stringA, stringB);
  const out = [];
  for (let i = lo; i < hi; i++) {
    const b = boundaryTypeBetweenStrings(i, openMidis);
    if (b && b.type !== 'fourth') out.push(b);
  }
  return out;
}

export function crossesTuningBoundary(stringA, stringB, openMidis) {
  return boundariesBetweenPositions(stringA, stringB, openMidis).length > 0;
}

export function positionDistance(a, b) {
  return Math.abs(a.string - b.string) + Math.abs(a.fret - b.fret);
}

export function enrichPosition(pos, anchor, openMidis) {
  const vec = relativeVector(anchor, pos);
  const boundaryTypes = boundariesBetweenPositions(anchor.string, pos.string, openMidis);
  return {
    ...pos,
    deltaString: vec.deltaString,
    deltaFret: vec.deltaFret,
    crossesBoundary: boundaryTypes.length > 0,
    boundaryTypes,
    direction: vec.deltaFret > 0 ? 'ahead' : vec.deltaFret < 0 ? 'behind' : 'same',
    sameString: pos.string === anchor.string,
  };
}

/**
 * Collect positions for an interval (or set) around an anchor within a map range.
 */
export function positionsForInterval({
  anchor,
  openMidis,
  intervalClass: ic,
  mapRange = 1,
  fretStart = 0,
  fretEnd = 15,
  includeOctaveAsRootClass = true,
}) {
  const def = MAP_RANGE_DEFS[mapRange] || MAP_RANGE_DEFS[1];
  const want = ic === 12 ? 0 : ic;
  const stringCount = openMidis.length;
  const positions = [];

  for (let s = 0; s < stringCount; s++) {
    const sDist = Math.abs(s - anchor.string);
    if (sDist > def.maxStringDist) continue;
    for (let f = fretStart; f <= fretEnd; f++) {
      const fDist = Math.abs(f - anchor.fret);
      if (fDist > def.maxFretDist && !(s === anchor.string && f === anchor.fret)) continue;
      const midi = openMidis[s] + f;
      const cls = intervalClass(midi, anchor.midi);
      const isAnchor = s === anchor.string && f === anchor.fret;
      const isOctave = cls === 0 && !isAnchor && Math.abs(midi - anchor.midi) % 12 === 0 && midi !== anchor.midi;

      if (want === 0) {
        if (!(isAnchor || isOctave || (includeOctaveAsRootClass && cls === 0))) continue;
        if (ic === 12 && isAnchor) continue;
        if (ic === 0 && isOctave && !includeOctaveAsRootClass) continue;
      } else if (cls !== want) {
        continue;
      }

      positions.push(enrichPosition({
        string: s,
        fret: f,
        midi,
        intervalClass: cls,
        pitchClass: ((midi % 12) + 12) % 12,
        isAnchor,
        isOctave,
        stringDist: sDist,
        fretDist: fDist,
      }, anchor, openMidis));
    }
  }

  if ((want === 0 || ic === 12) && def.includeNearestOctave) {
    let nearestOct = null;
    let best = Infinity;
    for (let s = 0; s < stringCount; s++) {
      for (let f = Math.max(0, fretStart); f <= Math.min(24, fretEnd); f++) {
        const midi = openMidis[s] + f;
        if (midi === anchor.midi + 12 || midi === anchor.midi - 12) {
          const d = Math.abs(s - anchor.string) + Math.abs(f - anchor.fret);
          if (d < best) {
            best = d;
            nearestOct = enrichPosition({
              string: s,
              fret: f,
              midi,
              intervalClass: 0,
              pitchClass: ((midi % 12) + 12) % 12,
              isAnchor: false,
              isOctave: true,
              stringDist: Math.abs(s - anchor.string),
              fretDist: Math.abs(f - anchor.fret),
            }, anchor, openMidis);
          }
        }
      }
    }
    if (nearestOct && !positions.some((p) => p.string === nearestOct.string && p.fret === nearestOct.fret)) {
      positions.push(nearestOct);
    }
  }

  return positions;
}

export function collectMapPositions({
  anchor,
  openMidis,
  mapRange = 1,
  fretStart = 0,
  fretEnd = 15,
  enabledIntervals = ALL_INTERVALS,
}) {
  const want = new Set(enabledIntervals);
  const all = [];
  const seen = new Set();
  for (const ic of want) {
    const list = positionsForInterval({
      anchor,
      openMidis,
      intervalClass: ic,
      mapRange,
      fretStart,
      fretEnd,
    });
    for (const p of list) {
      const key = `${p.string}:${p.fret}`;
      if (seen.has(key)) continue;
      if (!want.has(p.intervalClass) && !(p.isOctave && want.has(0))) continue;
      seen.add(key);
      all.push(p);
    }
  }
  // Always include anchor
  if (!seen.has(`${anchor.string}:${anchor.fret}`)) {
    all.push(enrichPosition({
      string: anchor.string,
      fret: anchor.fret,
      midi: anchor.midi,
      intervalClass: 0,
      pitchClass: anchor.pitchClass,
      isAnchor: true,
      isOctave: false,
      stringDist: 0,
      fretDist: 0,
    }, anchor, openMidis));
  }
  return all;
}

export function getCanonicalPositions(positions, { excludeAnchor = true } = {}) {
  return positions.filter((p) => !(excludeAnchor && p.isAnchor));
}

export function getNearestPositionsByDirection(positions, anchor, { excludeAnchor = true } = {}) {
  const cands = getCanonicalPositions(positions, { excludeAnchor });
  const groups = { same: null, higher: null, lower: null, above: null, below: null };
  let bestAny = null;
  for (const p of cands) {
    const d = positionDistance(p, anchor);
    if (!bestAny || d < positionDistance(bestAny, anchor)) bestAny = p;
    if (p.string === anchor.string) {
      if (!groups.same || d < positionDistance(groups.same, anchor)) groups.same = p;
    } else if (p.string > anchor.string) {
      if (!groups.higher || d < positionDistance(groups.higher, anchor)) groups.higher = p;
    } else if (p.string < anchor.string) {
      if (!groups.lower || d < positionDistance(groups.lower, anchor)) groups.lower = p;
    }
    if (p.fret > anchor.fret) {
      if (!groups.above || d < positionDistance(groups.above, anchor)) groups.above = p;
    } else if (p.fret < anchor.fret) {
      if (!groups.below || d < positionDistance(groups.below, anchor)) groups.below = p;
    }
  }
  return { nearest: bestAny, ...groups, all: cands };
}

export function describeVector(vec) {
  const parts = [];
  if (vec.deltaString === 0) parts.push('Same string');
  else if (vec.deltaString > 0) parts.push(`${vec.deltaString} string${vec.deltaString === 1 ? '' : 's'} higher`);
  else parts.push(`${Math.abs(vec.deltaString)} string${vec.deltaString === -1 ? '' : 's'} lower`);

  if (vec.deltaFret === 0) parts.push('same fret');
  else if (vec.deltaFret > 0) parts.push(`+${vec.deltaFret} fret${vec.deltaFret === 1 ? '' : 's'}`);
  else parts.push(`${vec.deltaFret} fret${vec.deltaFret === -1 ? '' : 's'}`);
  return parts.join(' · ');
}

export function shapeVariantsForInterval({
  anchor,
  openMidis,
  intervalClass: ic,
  mapRange = 2,
  fretStart = 0,
  fretEnd = 15,
}) {
  const positions = positionsForInterval({
    anchor, openMidis, intervalClass: ic, mapRange, fretStart, fretEnd,
  }).filter((p) => !p.isAnchor || ic === 0);
  const nearest = getNearestPositionsByDirection(positions, anchor);
  const targetNote = pitchClassName((anchor.midi + (ic === 12 ? 12 : ic)) % 12 === 0 && ic !== 0
    ? anchor.midi + ic
    : anchor.midi + (ic === 12 ? 12 : ic));
  // Fix target note via pitch class
  const targetPc = ((anchor.pitchClass + (ic === 12 ? 0 : ic)) % 12 + 12) % 12;
  const targetNoteName = NOTE_NAMES_SHARP[targetPc];

  const variants = [];
  for (const p of [nearest.same, nearest.higher, nearest.lower].filter(Boolean)) {
    variants.push({
      position: p,
      vector: { deltaString: p.deltaString, deltaFret: p.deltaFret },
      label: describeVector(p),
      crossesBoundary: p.crossesBoundary,
      boundaryTypes: p.boundaryTypes,
    });
  }
  return {
    interval: describeInterval(ic === 12 ? 12 : ic),
    targetNote: targetNoteName,
    targetMidi: anchor.midi + (ic === 12 ? 12 : ic),
    variants,
    nearest,
    positions,
  };
}

export function getIntervalExplanation({
  anchor,
  position,
  openMidis,
  tuningName = '',
}) {
  const ic = intervalClass(position.midi, anchor.midi);
  const info = describeInterval(position.isOctave ? 12 : ic);
  const vec = relativeVector(anchor, position);
  const bounds = boundariesBetweenPositions(anchor.string, position.string, openMidis);
  const geometry = getTuningGeometry(
    openMidis.map((m, i) => ({
      note: NOTE_NAMES_SHARP[((m % 12) + 12) % 12],
      oct: Math.floor(m / 12) - 1,
      _midi: m,
      _i: i,
    }))
  );

  let boundaryText = 'No unusual tuning boundary is crossed.';
  if (bounds.length) {
    boundaryText = bounds.map((b) => {
      if (b.type === 'drop') {
        return `In ${tuningName || 'this tuning'}, the lowest two open strings are a perfect 5th apart. Crossing that drop boundary changes the fret offset versus a standard fourth.`;
      }
      if (b.type === 'major-third') {
        return `This shape crosses the major-third boundary (often the B-string pair). Adjacent-string fret offsets shift by one fret versus fourth-tuned pairs.`;
      }
      return `Crosses a ${b.label.toLowerCase()} (${b.semitones} semitones between open strings).`;
    }).join(' ');
  }

  return {
    interval: info,
    vectorLabel: describeVector(vec),
    deltaString: vec.deltaString,
    deltaFret: vec.deltaFret,
    boundaryText,
    boundaries: bounds,
    adjacent: getAdjacentStringIntervals(
      // rebuild pitches from midis for display
      openMidis.map((m) => ({
        note: NOTE_NAMES_SHARP[((m % 12) + 12) % 12],
        oct: Math.floor(m / 12) - 1,
      }))
    ),
    geometrySummary: geometry.adjacent.map((a) => a.type).join(', '),
  };
}

export function compareTuningShapes({
  intervalClass: ic,
  rootString,
  rootFret,
  tuningA,
  tuningB,
  mapRange = 2,
  fretStart = 0,
  fretEnd = 15,
}) {
  const pitchesA = resolveTuningPitches(tuningA);
  const pitchesB = resolveTuningPitches(tuningB);
  const openA = openMidisFromTuning(pitchesA);
  const openB = openMidisFromTuning(pitchesB);
  if (rootString >= openA.length || rootString >= openB.length) {
    return { ok: false, error: 'Root string is outside one of the tunings.' };
  }
  const anchorA = makeAnchor({ string: rootString, fret: rootFret, openMidis: openA });
  const anchorB = makeAnchor({ string: rootString, fret: rootFret, openMidis: openB });
  const shapeA = shapeVariantsForInterval({
    anchor: anchorA, openMidis: openA, intervalClass: ic, mapRange, fretStart, fretEnd,
  });
  const shapeB = shapeVariantsForInterval({
    anchor: anchorB, openMidis: openB, intervalClass: ic, mapRange, fretStart, fretEnd,
  });
  return {
    ok: true,
    tuningA,
    tuningB,
    interval: describeInterval(ic),
    a: shapeA,
    b: shapeB,
  };
}

export function rootsMatchingPitchClass(openMidis, pitchClass, fretStart, fretEnd) {
  const out = [];
  for (let s = 0; s < openMidis.length; s++) {
    for (let f = fretStart; f <= fretEnd; f++) {
      const midi = openMidis[s] + f;
      if (((midi % 12) + 12) % 12 === pitchClass) {
        out.push(makeAnchor({ string: s, fret: f, openMidis }));
      }
    }
  }
  return out;
}

export function randomRootPosition(openMidis, fretStart, fretEnd, preferString = null) {
  const stringCount = openMidis.length;
  const s = preferString != null && preferString < stringCount
    ? preferString
    : Math.floor(Math.random() * stringCount);
  const f = fretStart + Math.floor(Math.random() * (fretEnd - fretStart + 1));
  return makeAnchor({ string: s, fret: f, openMidis });
}

export function enabledIntervalsForLevel(level) {
  const st = LEVEL_DEFS[level] || LEVEL_DEFS[1];
  return [...st.intervals];
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function guitarTuningNames() {
  return Object.keys(TUNINGS).filter((k) => !k.startsWith('Bass'));
}

export {
  TUNINGS,
  ROOTS,
  NOTE_NAMES_SHARP,
  resolveTuningPitches,
  getTuningGeometry,
  getAdjacentStringIntervals,
  parseCustomTuningText,
  parseNote,
};
