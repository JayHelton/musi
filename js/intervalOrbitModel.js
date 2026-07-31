/**
 * Interval Orbit — shared music-theory / fretboard model.
 * Pitch-based interval calculation so drills work in any tuning.
 */

import { parseNote, NOTE_NAMES_SHARP, TUNINGS, ROOTS } from './theory.js';

export const ORBIT_LABELS = {
  0: 'R', 1: '♭2', 2: '2', 3: '♭3', 4: '3', 5: '4',
  6: '♭5', 7: '5', 8: '♭6', 9: '6', 10: '♭7', 11: '7',
};

export const ORBIT_LABELS_OCTAVE_8 = { ...ORBIT_LABELS, 0: 'R' };

export const DEGREE_LABELS = {
  0: '1', 1: '♭2', 2: '2', 3: '♭3', 4: '3', 5: '4',
  6: '♭5', 7: '5', 8: '♭6', 9: '6', 10: '♭7', 11: '7',
};

export const ALL_INTERVALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** Curriculum stages → interval semitone classes taught. */
export const STAGE_INTERVALS = {
  1: { name: 'Structural Anchors', intervals: [0, 5, 7] },
  2: { name: 'Major & Minor Identity', intervals: [0, 3, 4, 5, 7] },
  3: { name: 'Seventh Relationships', intervals: [0, 3, 4, 5, 7, 10, 11] },
  4: { name: 'Second Relationships', intervals: [0, 1, 2, 3, 4, 5, 7, 10, 11] },
  5: { name: 'Sixth Relationships', intervals: [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11] },
  6: { name: 'Tritone', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  7: { name: 'Complete Chromatic Map', intervals: ALL_INTERVALS },
};

export const ORBIT_DEFS = {
  1: {
    name: 'Local Shape',
    maxStringDist: 2,
    maxFretDist: 4,
    includeNearestOctave: true,
    defaultIntervals: [0, 1, 2, 3, 4, 5, 6, 7, 10],
  },
  2: {
    name: 'Position Map',
    maxStringDist: 3,
    maxFretDist: 7,
    includeNearestOctave: true,
    defaultIntervals: ALL_INTERVALS,
  },
  3: {
    name: 'Full Neck',
    maxStringDist: Infinity,
    maxFretDist: Infinity,
    includeNearestOctave: true,
    defaultIntervals: ALL_INTERVALS,
  },
};

export const CHORD_FORMULAS = {
  'Minor triad': [0, 3, 7],
  'Major triad': [0, 4, 7],
  'Sus2': [0, 2, 7],
  'Sus4': [0, 5, 7],
  'Diminished': [0, 3, 6],
  'Augmented': [0, 4, 8],
  'Power chord': [0, 7],
  'Minor add9': [0, 2, 3, 7],
  'Add9': [0, 2, 4, 7],
  'Minor 7': [0, 3, 7, 10],
  'Major 7': [0, 4, 7, 11],
  'Dominant 7': [0, 4, 7, 10],
};

export const QUALITY_FORMULAS = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  power: [0, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  add9: [0, 2, 4, 7],
  madd9: [0, 2, 3, 7],
};

/** Preset progressions: roman degrees relative to tonal center + quality key. */
export const PRESET_PROGRESSIONS = [
  {
    id: 'i-VI-III-VII',
    name: 'i–VI–III–VII',
    group: 'Minor / Metalcore',
    degrees: [
      { deg: 0, quality: 'minor' },
      { deg: 8, quality: 'major' },
      { deg: 3, quality: 'major' },
      { deg: 10, quality: 'major' },
    ],
    tip: 'Melodic metalcore, emotional choruses, lead melodies',
  },
  {
    id: 'i-VII-VI-VII',
    name: 'i–VII–VI–VII',
    group: 'Minor / Metalcore',
    degrees: [
      { deg: 0, quality: 'minor' },
      { deg: 10, quality: 'major' },
      { deg: 8, quality: 'major' },
      { deg: 10, quality: 'major' },
    ],
    tip: 'Repeating minor-key riffs, post-hardcore, anthemic melodies',
  },
  {
    id: 'i-VI-iv-VII',
    name: 'i–VI–iv–VII',
    group: 'Minor / Metalcore',
    degrees: [
      { deg: 0, quality: 'minor' },
      { deg: 8, quality: 'major' },
      { deg: 5, quality: 'minor' },
      { deg: 10, quality: 'major' },
    ],
    tip: 'Darker minor progressions, natural-minor melodies',
  },
  {
    id: 'i-iv-VI-V',
    name: 'i–iv–VI–V',
    group: 'Minor / Metalcore',
    degrees: [
      { deg: 0, quality: 'minor' },
      { deg: 5, quality: 'minor' },
      { deg: 8, quality: 'major' },
      { deg: 7, quality: 'major' },
    ],
    tip: 'Harmonic-minor tension, strong dominant resolution',
  },
  {
    id: 'i-bII',
    name: 'i–♭II',
    group: 'Modal Metal',
    degrees: [
      { deg: 0, quality: 'minor' },
      { deg: 1, quality: 'major' },
    ],
    tip: 'Phrygian riffs, breakdown tension, pedal-tone patterns',
  },
  {
    id: 'i-bII-bVII-i',
    name: 'i–♭II–♭VII–i',
    group: 'Modal Metal',
    degrees: [
      { deg: 0, quality: 'minor' },
      { deg: 1, quality: 'major' },
      { deg: 10, quality: 'major' },
      { deg: 0, quality: 'minor' },
    ],
    tip: 'Phrygian melodies, heavy chromatic movement',
  },
  {
    id: 'i-IV',
    name: 'i–IV',
    group: 'Modal Metal',
    degrees: [
      { deg: 0, quality: 'minor' },
      { deg: 5, quality: 'major' },
    ],
    tip: 'Dorian improvisation, bright minor melodies',
  },
  {
    id: 'I-V-vi-IV',
    name: 'I–V–vi–IV',
    group: 'Major / Practice',
    degrees: [
      { deg: 0, quality: 'major' },
      { deg: 7, quality: 'major' },
      { deg: 9, quality: 'minor' },
      { deg: 5, quality: 'major' },
    ],
    tip: 'Familiar harmony for chord-tone targeting',
  },
  {
    id: 'I-vi-IV-V',
    name: 'I–vi–IV–V',
    group: 'Major / Practice',
    degrees: [
      { deg: 0, quality: 'major' },
      { deg: 9, quality: 'minor' },
      { deg: 5, quality: 'major' },
      { deg: 7, quality: 'major' },
    ],
    tip: 'Classic pop cadence practice',
  },
  {
    id: 'vi-IV-I-V',
    name: 'vi–IV–I–V',
    group: 'Major / Practice',
    degrees: [
      { deg: 9, quality: 'minor' },
      { deg: 5, quality: 'major' },
      { deg: 0, quality: 'major' },
      { deg: 7, quality: 'major' },
    ],
    tip: 'Axis progression — chord-tone voice leading',
  },
];

export const DRILL_TYPES = [
  { id: 'find', label: 'Find the Interval' },
  { id: 'identify', label: 'Identify the Interval' },
  { id: 'complete', label: 'Complete the Orbit' },
  { id: 'formula', label: 'Formula Builder' },
  { id: 'improv', label: 'Improv Mode' },
];

export const LABEL_MODES = [
  { id: 'interval', label: 'Interval symbols' },
  { id: 'note', label: 'Note names' },
  { id: 'both', label: 'Both' },
  { id: 'degree', label: 'Degree numbers' },
  { id: 'hidden', label: 'Hidden' },
];

const GUITAR_TUNING_KEYS = Object.keys(TUNINGS).filter(
  (k) => !k.startsWith('Bass')
);

export function guitarTuningNames() {
  return GUITAR_TUNING_KEYS;
}

export function resolveTuning(name, customStrings) {
  if (name === 'Custom' && Array.isArray(customStrings) && customStrings.length) {
    return customStrings.map((s) => ({ note: s.note, oct: Number(s.oct) }));
  }
  return TUNINGS[name] || TUNINGS.Standard;
}

export function openMidisFromTuning(strings) {
  return strings.map((s) => {
    const p = parseNote(s.note);
    return p ? 12 * (s.oct + 1) + p.semi : 0;
  });
}

export function intervalClass(fretMidi, rootMidi) {
  return ((fretMidi - rootMidi) % 12 + 12) % 12;
}

export function intervalLabel(semi, { octaveAs8 = false } = {}) {
  const s = ((semi % 12) + 12) % 12;
  if (octaveAs8 && s === 0) return '8';
  return ORBIT_LABELS[s] || String(s);
}

export function noteLabel(midi) {
  return NOTE_NAMES_SHARP[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

/**
 * Adjacent-string intervals in semitones (open pitch).
 * Standard guitar has mostly +5 (P4); G→B is +4 (M3).
 */
export function stringIntervalSteps(openMidis) {
  const steps = [];
  for (let i = 0; i < openMidis.length - 1; i++) {
    steps.push(openMidis[i + 1] - openMidis[i]);
  }
  return steps;
}

/** Indices of lower string in a non-perfect-fourth pair (e.g. G string index). */
export function tuningBoundaryIndices(openMidis) {
  const steps = stringIntervalSteps(openMidis);
  const out = [];
  steps.forEach((st, i) => {
    if (st !== 5) out.push(i);
  });
  return out;
}

export function crossesTuningBoundary(stringA, stringB, openMidis) {
  const lo = Math.min(stringA, stringB);
  const hi = Math.max(stringA, stringB);
  const bounds = tuningBoundaryIndices(openMidis);
  return bounds.some((b) => b >= lo && b < hi);
}

export function positionDistance(a, b) {
  return Math.abs(a.string - b.string) + Math.abs(a.fret - b.fret);
}

/**
 * Collect fret positions inside an orbit around an anchor root.
 * Strings are indexed low→high (index 0 = lowest pitch / thickest string).
 */
export function collectOrbitPositions({
  rootString,
  rootFret,
  openMidis,
  orbitSize = 1,
  fretStart = 0,
  fretEnd = 15,
  enabledIntervals = null,
}) {
  const def = ORBIT_DEFS[orbitSize] || ORBIT_DEFS[1];
  const rootMidi = openMidis[rootString] + rootFret;
  const want = new Set(
    enabledIntervals || def.defaultIntervals
  );
  const positions = [];
  const stringCount = openMidis.length;

  for (let s = 0; s < stringCount; s++) {
    const sDist = Math.abs(s - rootString);
    if (sDist > def.maxStringDist) continue;
    for (let f = fretStart; f <= fretEnd; f++) {
      const fDist = Math.abs(f - rootFret);
      if (fDist > def.maxFretDist && !(s === rootString && f === rootFret)) continue;
      const midi = openMidis[s] + f;
      const ic = intervalClass(midi, rootMidi);
      if (!want.has(ic) && !(ic === 0 && midi !== rootMidi)) continue;
      // For orbit 1 default set, allow octave (ic 0 at different pitch) always
      if (!want.has(ic) && ic !== 0) continue;
      if (!want.has(0) && ic === 0 && midi !== rootMidi && !def.includeNearestOctave) continue;
      positions.push({
        string: s,
        fret: f,
        midi,
        interval: ic,
        isAnchor: s === rootString && f === rootFret,
        isOctave: ic === 0 && !(s === rootString && f === rootFret),
        stringDist: sDist,
        fretDist: fDist,
        crossesBoundary: crossesTuningBoundary(rootString, s, openMidis),
      });
    }
  }

  // Ensure nearest octave is present for orbit 1/2 even if outside fret window slightly
  if (def.includeNearestOctave) {
    let nearestOct = null;
    let best = Infinity;
    for (let s = 0; s < stringCount; s++) {
      for (let f = Math.max(0, fretStart); f <= Math.min(24, fretEnd); f++) {
        const midi = openMidis[s] + f;
        if (midi === rootMidi + 12 || midi === rootMidi - 12) {
          const d = Math.abs(s - rootString) + Math.abs(f - rootFret);
          if (d < best) {
            best = d;
            nearestOct = {
              string: s,
              fret: f,
              midi,
              interval: 0,
              isAnchor: false,
              isOctave: true,
              stringDist: Math.abs(s - rootString),
              fretDist: Math.abs(f - rootFret),
              crossesBoundary: crossesTuningBoundary(rootString, s, openMidis),
            };
          }
        }
      }
    }
    if (nearestOct && !positions.some((p) => p.string === nearestOct.string && p.fret === nearestOct.fret)) {
      positions.push(nearestOct);
    }
  }

  return { rootMidi, positions };
}

export function positionsMatchingInterval(positions, interval, { excludeAnchor = true } = {}) {
  return positions.filter((p) => {
    if (excludeAnchor && p.isAnchor) return false;
    return p.interval === interval || (interval === 0 && p.isOctave);
  });
}

export function nearestPosition(positions, interval, rootPos, opts = {}) {
  const cands = positionsMatchingInterval(positions, interval, opts);
  if (!cands.length) return null;
  cands.sort((a, b) => positionDistance(a, rootPos) - positionDistance(b, rootPos));
  return cands[0];
}

export function randomRootPosition(openMidis, fretStart, fretEnd, preferString = null) {
  const stringCount = openMidis.length;
  const s = preferString != null && preferString < stringCount
    ? preferString
    : Math.floor(Math.random() * stringCount);
  const f = fretStart + Math.floor(Math.random() * (fretEnd - fretStart + 1));
  return { string: s, fret: f, midi: openMidis[s] + f };
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function enabledIntervalsForStage(stage) {
  const st = STAGE_INTERVALS[stage] || STAGE_INTERVALS[1];
  return [...st.intervals];
}

export function formulaLabel(semis) {
  return semis.map((s) => intervalLabel(s)).join('–');
}

export function chordNameFromEvent(tonalCenterSemi, deg, quality) {
  const rootSemi = (tonalCenterSemi + deg) % 12;
  // Prefer flat spellings for chromatic degrees common in minor/metal progressions.
  const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const SHARPS = NOTE_NAMES_SHARP;
  const preferFlat = [1, 3, 6, 8, 10].includes(rootSemi);
  const root = (preferFlat ? FLATS : SHARPS)[rootSemi];
  const q = quality || 'major';
  const suffix =
    q === 'major' ? ''
      : q === 'minor' ? 'm'
        : q === 'power' ? '5'
          : q === 'dim' ? 'dim'
            : q === 'aug' ? 'aug'
              : q === 'sus2' ? 'sus2'
                : q === 'sus4' ? 'sus4'
                  : q === 'maj7' ? 'maj7'
                    : q === 'min7' ? 'm7'
                      : q === 'dom7' ? '7'
                        : q === 'add9' ? 'add9'
                          : q === 'madd9' ? 'm(add9)'
                            : '';
  return root + suffix;
}

export function buildProgressionChords(tonalCenter, degrees, beatsPerChord = 4) {
  const p = parseNote(tonalCenter);
  const center = p ? p.semi : 0;
  return degrees.map((d) => {
    const deg = typeof d === 'number' ? d : d.deg;
    const quality = typeof d === 'number' ? 'major' : (d.quality || 'major');
    const formula = QUALITY_FORMULAS[quality] || QUALITY_FORMULAS.major;
    const rootSemi = (center + deg) % 12;
    return {
      rootPitchClass: rootSemi,
      chordFormula: formula,
      bassPitchClass: rootSemi,
      duration: beatsPerChord,
      name: chordNameFromEvent(center, deg, quality),
      quality,
      deg,
    };
  });
}

/** Parse custom tuning like "C2 G2 C3 F3 A3 D4" or "Drop C style notes". */
export function parseCustomTuningText(text) {
  const parts = text.trim().split(/[\s,|]+/).filter(Boolean);
  const out = [];
  for (const part of parts) {
    const m = part.match(/^([A-Ga-g](?:#{1,2}|b{1,2}|x)?)(-?\d)$/);
    if (!m) return null;
    const note = m[1][0].toUpperCase() + m[1].slice(1).replace('x', '##');
    if (!parseNote(note.replace(/\d/g, ''))) {
      const p = parseNote(note);
      if (!p) return null;
    }
    const noteOnly = note.replace(/-?\d$/, '') || m[1];
    const clean = noteOnly[0].toUpperCase() + noteOnly.slice(1);
    if (!parseNote(clean)) return null;
    out.push({ note: clean, oct: Number(m[2]) });
  }
  if (out.length < 4 || out.length > 8) return null;
  return out;
}

export function masteryKey({
  interval,
  rootString,
  targetString,
  fretDir,
  stringDist,
  crossesBoundary,
  tuning,
  orbitSize,
  drillType,
}) {
  return [
    drillType,
    tuning,
    orbitSize,
    interval,
    `rs${rootString}`,
    `ts${targetString}`,
    fretDir,
    `sd${stringDist}`,
    crossesBoundary ? 'xb' : 'nx',
  ].join('|');
}

export function summarizeWeaknesses(mastery, limit = 5) {
  const rows = Object.entries(mastery || {})
    .map(([key, v]) => {
      const attempts = v.attempts || 0;
      const correct = v.correct || 0;
      const acc = attempts ? correct / attempts : 1;
      return { key, attempts, correct, acc, avgMs: v.totalMs && attempts ? v.totalMs / attempts : 0 };
    })
    .filter((r) => r.attempts >= 2 && r.acc < 0.75)
    .sort((a, b) => a.acc - b.acc || b.attempts - a.attempts);
  return rows.slice(0, limit);
}

export function describeMasteryKey(key) {
  const parts = key.split('|');
  if (parts.length < 9) return key;
  const [, tuning, orbit, interval, rs, ts, fretDir, sd, xb] = parts;
  const intLab = intervalLabel(Number(interval));
  const dir = fretDir === 'ahead' ? 'ahead' : fretDir === 'behind' ? 'behind' : 'same fret';
  const cross = xb === 'xb' ? ', crossing tuning boundary' : '';
  return `${intLab} from string ${Number(rs.slice(2)) + 1} → string ${Number(ts.slice(2)) + 1} (${dir}, ${sd.slice(2)} strings, ${tuning}, orbit ${orbit}${cross})`;
}

export { ROOTS, NOTE_NAMES_SHARP, TUNINGS };
