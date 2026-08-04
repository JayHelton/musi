// Pure Study Lab walkthrough model — generates mic-gated practice steps
// from a recommended study. No DOM / audio dependencies (Node-testable).

import { SCALES } from './scales.js';
import { parseNote, NOTE_NAMES_SHARP } from './theory.js';
import { TUNINGS, pitchToMidi } from './tunings.js';

const DEGREE_LABELS = {
  0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
  6: 'b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
};

/** Semitone offsets for a named scale. */
export function scaleOffsets(scaleName) {
  const def = SCALES[scaleName];
  if (!def) return SCALES['Major (Ionian)'].map(([, so]) => so);
  return def.map(([, so]) => so);
}

export function rootPitchClass(rootStr) {
  const r = parseNote(rootStr);
  return r ? r.semi : 0;
}

export function midiLabel(midi) {
  const m = Math.round(midi);
  const name = NOTE_NAMES_SHARP[((m % 12) + 12) % 12];
  const oct = Math.floor(m / 12) - 1;
  return `${name}${oct}`;
}

export function openMidisForTuning(tuningName = 'Standard') {
  const strings = TUNINGS[tuningName] || TUNINGS.Standard;
  return strings.map(s => pitchToMidi(s));
}

/** Frets on one string that match scale pitch classes within a fret window. */
export function scaleFretsOnString({
  stringIndex,
  openMidis,
  rootPc,
  offsets,
  fretStart = 0,
  fretEnd = 12,
} = {}) {
  const open = openMidis[stringIndex];
  if (open == null) return [];
  const pcs = new Set(offsets.map(o => ((rootPc + o) % 12 + 12) % 12));
  const hits = [];
  for (let f = fretStart; f <= fretEnd; f++) {
    const midi = open + f;
    const pc = ((midi % 12) + 12) % 12;
    if (!pcs.has(pc)) continue;
    const degree = ((pc - rootPc) % 12 + 12) % 12;
    hits.push({
      string: stringIndex,
      fret: f,
      midi,
      pc,
      degree,
      degreeLabel: DEGREE_LABELS[degree] || String(degree),
      key: `${stringIndex}:${f}`,
    });
  }
  return hits;
}

/**
 * Descending scale sequence on one string (high fret → low).
 * Prefer an octave span when available (tonic up to +12).
 */
export function descendingScaleSequence(hits, rootPc) {
  if (!hits.length) return [];
  const sorted = hits.slice().sort((a, b) => b.fret - a.fret);
  // Prefer starting from a tonic (or its octave) near the top
  let startIdx = sorted.findIndex(h => h.pc === rootPc);
  if (startIdx < 0) startIdx = 0;
  const fromStart = sorted.slice(startIdx);
  // If we started mid-list, append lower notes below the start tonic
  const below = sorted.slice(0, startIdx).filter(h => h.fret < sorted[startIdx].fret);
  const seq = [...fromStart, ...below.filter(h => !fromStart.includes(h))];
  // Deduplicate by fret keeping order
  const seen = new Set();
  return seq.filter(h => {
    if (seen.has(h.fret)) return false;
    seen.add(h.fret);
    return true;
  });
}

/** Ascending then descending on one string. */
export function upDownScaleSequence(hits) {
  const asc = hits.slice().sort((a, b) => a.fret - b.fret);
  if (asc.length <= 1) return asc;
  const desc = asc.slice(0, -1).reverse();
  return [...asc, ...desc];
}

/** Box positions: scale notes across all strings in a fret window. */
export function scaleBoxPositions({
  openMidis,
  rootPc,
  offsets,
  fretStart = 0,
  fretEnd = 4,
} = {}) {
  const out = [];
  for (let s = 0; s < openMidis.length; s++) {
    out.push(...scaleFretsOnString({
      stringIndex: s,
      openMidis,
      rootPc,
      offsets,
      fretStart,
      fretEnd,
    }));
  }
  return out;
}

/** Triad tone pitch classes from scale degree (0-based) stacking 1-3-5. */
export function triadFromScaleDegree(offsets, degreeIndex = 0) {
  const n = offsets.length;
  if (!n) return [0, 4, 7];
  const i1 = degreeIndex % n;
  const i3 = (degreeIndex + 2) % n;
  const i5 = (degreeIndex + 4) % n;
  const root = offsets[i1];
  const third = offsets[i3] + (i3 < i1 ? 12 : 0);
  const fifth = offsets[i5] + (i5 < i1 ? 12 : 0);
  return [
    ((root % 12) + 12) % 12,
    ((third % 12) + 12) % 12,
    ((fifth % 12) + 12) % 12,
  ];
}

export function triadQuality(semis) {
  const [r, t, f] = semis.map(s => ((s % 12) + 12) % 12);
  const third = ((t - r) % 12 + 12) % 12;
  const fifth = ((f - r) % 12 + 12) % 12;
  if (third === 4 && fifth === 7) return 'major';
  if (third === 3 && fifth === 7) return 'minor';
  if (third === 3 && fifth === 6) return 'diminished';
  if (third === 4 && fifth === 8) return 'augmented';
  return 'other';
}

/** Intervals emphasized by concepts. */
export function intervalsForConcepts(concepts = []) {
  const set = new Set([0, 7]); // always root + fifth as anchors
  const map = {
    flat2: 1, flat3: 3, tritone: 6, flat6: 8, flat7: 10,
    interval_locations: [1, 3, 4, 6, 7, 10],
    diminished_triads: [3, 6],
    augmented_triads: [4, 8],
    major_minor_triads: [3, 4, 7],
    phrygian: 1,
    phrygian_dominant: [1, 4],
    harmonic_minor: [8, 11],
    blues_vocabulary: [3, 6],
    guide_tones: [4, 10, 11],
  };
  concepts.forEach(c => {
    const v = map[c];
    if (Array.isArray(v)) v.forEach(x => set.add(x));
    else if (typeof v === 'number') set.add(v);
  });
  return [...set].sort((a, b) => a - b);
}

function chordNameForQuality(q) {
  if (q === 'minor') return 'Minor';
  if (q === 'diminished') return 'Diminished Triad';
  if (q === 'augmented') return 'Augmented';
  return 'Major';
}

/**
 * Build a full Study Lab walkthrough for a catalog study.
 */
export function buildWalkthrough(study, {
  root = 'E',
  scale = null,
  tuning = 'Standard',
  fretEnd = 12,
} = {}) {
  const scaleName = scale || study?.scale || 'Natural Minor (Aeolian)';
  const rootPc = rootPitchClass(root);
  const offsets = scaleOffsets(scaleName);
  const openMidis = openMidisForTuning(tuning);
  const strings = TUNINGS[tuning] || TUNINGS.Standard;
  const concepts = study?.concepts || [];
  const steps = [];

  steps.push({
    id: 'intro',
    type: 'intro',
    title: study?.title || 'Recommended Study',
    prompt: study?.summary || 'Work through scale, interval, chord, and application steps with your guitar.',
    narrative: null,
    focus: study?.focus || [],
    mic: false,
  });

  // 1) Scale on heaviest string — descending fill
  const heavyHits = scaleFretsOnString({
    stringIndex: 0,
    openMidis,
    rootPc,
    offsets,
    fretStart: 0,
    fretEnd,
  });
  const descSeq = descendingScaleSequence(heavyHits, rootPc);
  if (descSeq.length >= 3) {
    steps.push({
      id: 'scale-string-heavy',
      type: 'scale-string',
      title: 'Scale on the heaviest string',
      prompt: `Play ${scaleName} descending on the lowest string (${strings[0].note}${strings[0].oct}). The board fills as each pitch is recognized.`,
      mic: true,
      drone: true,
      stringIndex: 0,
      direction: 'descending',
      scaleName,
      root,
      rootPc,
      offsets,
      tuning,
      openMidis,
      positions: heavyHits,
      sequence: descSeq.map(h => ({
        targetMidi: h.midi,
        pitchClass: h.pc,
        key: h.key,
        degreeLabel: h.degreeLabel,
        string: h.string,
        fret: h.fret,
      })),
      fretStart: 0,
      fretEnd,
    });
  }

  // 2) Optional second string transfer if concepts include fretboard_transfer
  if (concepts.includes('fretboard_transfer') || concepts.includes('interval_locations')) {
    const sIdx = Math.min(2, openMidis.length - 1);
    const hits = scaleFretsOnString({
      stringIndex: sIdx,
      openMidis,
      rootPc,
      offsets,
      fretStart: 0,
      fretEnd: Math.min(fretEnd, 12),
    });
    const seq = upDownScaleSequence(hits);
    if (seq.length >= 3) {
      steps.push({
        id: `scale-string-${sIdx}`,
        type: 'scale-string',
        title: 'Transfer: another string',
        prompt: `Rebuild the same scale up and down on string ${sIdx + 1} (${strings[sIdx].note}${strings[sIdx].oct}).`,
        mic: true,
        drone: true,
        stringIndex: sIdx,
        direction: 'up-down',
        scaleName,
        root,
        rootPc,
        offsets,
        tuning,
        openMidis,
        positions: hits,
        sequence: seq.map(h => ({
          targetMidi: h.midi,
          pitchClass: h.pc,
          key: h.key,
          degreeLabel: h.degreeLabel,
          string: h.string,
          fret: h.fret,
        })),
        fretStart: 0,
        fretEnd: Math.min(fretEnd, 12),
      });
    }
  }

  // 3) Five-fret box map — collect all scale PCs in the box (any order)
  const boxStart = 0;
  const boxEnd = 4;
  const box = scaleBoxPositions({
    openMidis, rootPc, offsets, fretStart: boxStart, fretEnd: boxEnd,
  });
  const boxPcs = [...new Set(offsets.map(o => ((rootPc + o) % 12 + 12) % 12))];
  steps.push({
    id: 'scale-box',
    type: 'scale-box',
    title: 'Five-fret region map',
    prompt: `Fill every scale pitch class in frets ${boxStart}–${boxEnd}. Play each degree anywhere in the box — the matching cells light up.`,
    mic: true,
    drone: true,
    scaleName,
    root,
    rootPc,
    offsets,
    tuning,
    openMidis,
    positions: box,
    targetPitchClasses: boxPcs,
    fretStart: boxStart,
    fretEnd: Math.max(boxEnd, 7),
  });

  // 4) Interval orbit — play emphasized intervals from a low-string root
  const intervals = intervalsForConcepts(concepts).filter(i => i !== 0).slice(0, 5);
  const anchorFret = heavyHits.find(h => h.pc === rootPc)?.fret ?? 0;
  const anchorMidi = openMidis[0] + anchorFret;
  if (intervals.length) {
    const orbitPositions = [];
    const orbitFretEnd = Math.min(fretEnd, 12);
    for (let s = 0; s < openMidis.length; s++) {
      for (let f = 0; f <= orbitFretEnd; f++) {
        const midi = openMidis[s] + f;
        const pc = ((midi % 12) + 12) % 12;
        const degree = ((pc - rootPc) % 12 + 12) % 12;
        if (degree !== 0 && !intervals.includes(degree)) continue;
        orbitPositions.push({
          string: s,
          fret: f,
          midi,
          pc,
          degree,
          degreeLabel: DEGREE_LABELS[degree] || String(degree),
          key: `${s}:${f}`,
        });
      }
    }
    steps.push({
      id: 'interval-orbit',
      type: 'interval-orbit',
      title: 'Interval orbit from the root',
      prompt: 'Play each highlighted interval from the anchored root. Audio checks pitch class — choose the frets yourself.',
      mic: true,
      drone: false,
      root,
      rootPc,
      tuning,
      openMidis,
      anchor: { string: 0, fret: anchorFret, midi: anchorMidi },
      intervals,
      positions: orbitPositions,
      sequence: intervals.map(ic => ({
        intervalClass: ic,
        degreeLabel: DEGREE_LABELS[ic] || String(ic),
        targetMidi: anchorMidi + ic,
        pitchClass: (rootPc + ic) % 12,
        anchorMidi,
      })),
      fretStart: 0,
      fretEnd: orbitFretEnd,
    });
  }

  // 5) Chord / triad discovery from scale degrees
  const wantsHarmony = concepts.some(c =>
    /triad|harmony|seventh|diminished|augmented|chord/i.test(c)
  ) || /triad|harmony|chord|seventh/i.test(study?.title || '');
  if (wantsHarmony || true) {
    // Always include at least one triad step — foundation guardrail
    const degreeIndexes = wantsHarmony ? [0, 1, 2, 4, 6].filter(i => i < offsets.length) : [0, 2];
    const unique = [];
    degreeIndexes.forEach(di => {
      const tones = triadFromScaleDegree(offsets, di);
      const triadRootPc = (rootPc + offsets[di % offsets.length]) % 12;
      const rel = tones.map(t => ((t - tones[0]) % 12 + 12) % 12);
      const q = triadQuality([0, rel[1], rel[2]]);
      const absPcs = tones.map(t => ((rootPc + t) % 12 + 12) % 12);
      const pos = [];
      for (let s = 0; s < openMidis.length; s++) {
        for (let f = 0; f <= 7; f++) {
          const midi = openMidis[s] + f;
          const pc = ((midi % 12) + 12) % 12;
          if (!absPcs.includes(pc)) continue;
          const degree = ((pc - triadRootPc) % 12 + 12) % 12;
          pos.push({
            string: s, fret: f, midi, pc, degree,
            degreeLabel: DEGREE_LABELS[degree] || String(degree),
            key: `${s}:${f}`,
          });
        }
      }
      unique.push({
        degreeIndex: di,
        scaleDegree: di + 1,
        quality: q,
        chordName: chordNameForQuality(q),
        pitchClasses: absPcs,
        triadRootPc,
        positions: pos,
      });
    });

    unique.slice(0, 3).forEach((triad, idx) => {
      steps.push({
        id: `chord-${idx}`,
        type: 'chord-tones',
        title: `Find the ${triad.chordName.toLowerCase()} triad (degree ${triad.scaleDegree})`,
        prompt: `Play the three chord tones of a ${triad.chordName.toLowerCase()} triad built on scale degree ${triad.scaleDegree}. Order is up to you — hit each pitch class once.`,
        mic: true,
        drone: true,
        dronePc: triad.triadRootPc,
        scaleName,
        root,
        rootPc,
        tuning,
        openMidis,
        positions: triad.positions,
        targetPitchClasses: triad.pitchClasses,
        quality: triad.quality,
        chordName: triad.chordName,
        fretStart: 0,
        fretEnd: 7,
      });
    });
  }

  // 6) Riff over drone — emphasize characteristic degrees
  const emphasize = intervalsForConcepts(concepts).filter(i => i !== 0 && i !== 7).slice(0, 3);
  const riffDegrees = emphasize.length ? emphasize : [3, 5];
  steps.push({
    id: 'drone-riff',
    type: 'drone-riff',
    title: 'Riff over a drone',
    prompt: `With a root drone sounding, create a short phrase that lands on ${riffDegrees.map(d => DEGREE_LABELS[d]).join(', ')}. Choose frets and rhythm yourself — the lab only checks that those degrees appear.`,
    mic: true,
    drone: true,
    scaleName,
    root,
    rootPc,
    offsets,
    tuning,
    openMidis,
    targetPitchClasses: riffDegrees.map(d => (rootPc + d) % 12),
    emphasizeDegrees: riffDegrees.map(d => DEGREE_LABELS[d]),
    positions: scaleBoxPositions({
      openMidis, rootPc, offsets, fretStart: 0, fretEnd: 7,
    }),
    fretStart: 0,
    fretEnd: 7,
    application: study?.application || null,
  });

  // 7) Application / wrap
  if (study?.application) {
    steps.push({
      id: 'application',
      type: 'application',
      title: 'Application',
      prompt: study.application,
      mic: false,
      drone: false,
      selfCheck: true,
    });
  }

  steps.push({
    id: 'complete',
    type: 'complete',
    title: 'Study complete',
    prompt: 'You walked scale mapping, intervals, chord tones, and a genre-framed application. Foundation method stayed universal — genre only framed the context.',
    mic: false,
  });

  return {
    studyId: study?.id || null,
    title: study?.title || 'Study Lab',
    scaleName,
    root,
    tuning,
    openMidis,
    strings,
    steps,
  };
}

export { DEGREE_LABELS };
