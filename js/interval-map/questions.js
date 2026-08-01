/**
 * Question generation for Fretboard Interval Map quiz / play / study modes.
 */

import {
  LEVEL_DEFS,
  MAP_RANGE_DEFS,
  INTERVAL_INFO,
  INTERVAL_PAIRS,
  ALL_INTERVALS,
  makeAnchor,
  positionsForInterval,
  collectMapPositions,
  getNearestPositionsByDirection,
  shapeVariantsForInterval,
  describeInterval,
  describeVector,
  noteLabel,
  pitchClassName,
  intervalClass,
  enabledIntervalsForLevel,
  randomRootPosition,
  pick,
  crossesTuningBoundary,
  boundariesBetweenPositions,
  relativeVector,
} from './model.js';

export const QUIZ_EXERCISES = [
  { id: 'locate', label: 'Locate an Interval', input: 'fretboard' },
  { id: 'name-interval', label: 'Name the Interval', input: 'interval' },
  { id: 'name-note', label: 'Name the Note', input: 'note' },
  { id: 'relationship', label: 'Identify the Relationship', input: 'mixed' },
  { id: 'complete-shape', label: 'Complete the Shape', input: 'fretboard' },
  { id: 'reverse-map', label: 'Reverse Mapping', input: 'choice' },
  { id: 'boundary-shift', label: 'Boundary Shift', input: 'fretboard' },
  { id: 'root-relocation', label: 'Root Relocation', input: 'fretboard' },
  { id: 'interval-pair', label: 'Interval Pair', input: 'fretboard' },
  { id: 'study-reveal', label: 'Reveal Study', input: 'self' },
];

export const PLAY_EXERCISES = [
  { id: 'play-interval', label: 'Play the Interval', input: 'audio' },
  { id: 'play-target', label: 'Play the Shown Target', input: 'audio' },
  { id: 'play-root-then', label: 'Play Root, Then Interval', input: 'audio' },
  { id: 'play-sequence', label: 'Play an Interval Sequence', input: 'audio' },
  { id: 'play-missing', label: 'Play the Missing Shape Tone', input: 'audio' },
  { id: 'hear-reproduce', label: 'Hear and Reproduce', input: 'audio' },
];

function baseMeta(ctx) {
  return {
    tuningName: ctx.tuningName,
    mapRange: ctx.mapRange,
    level: ctx.level,
    fretStart: ctx.fretStart,
    fretEnd: ctx.fretEnd,
    openMidis: ctx.openMidis,
  };
}

function chooseInterval(level, { allowRoot = false } = {}) {
  let ints = enabledIntervalsForLevel(level).filter((i) => allowRoot || i !== 0);
  if (!ints.length) ints = [5, 7, 3, 4];
  return pick(ints);
}

function ensureAnswers(positions, anchor, ic) {
  return positions.filter((p) => {
    if (p.isAnchor && ic !== 0) return false;
    if (ic === 12) return p.isOctave || (p.intervalClass === 0 && !p.isAnchor);
    return p.intervalClass === ic || (ic === 0 && (p.isAnchor || p.isOctave));
  });
}

function withNearest(answers, anchor) {
  const nearest = getNearestPositionsByDirection(answers, anchor, { excludeAnchor: true });
  return nearest;
}

export function generateValidQuestion(ctx) {
  const type = ctx.exerciseType || 'locate';
  const generators = {
    locate: generateLocate,
    'name-interval': generateNameInterval,
    'name-note': generateNameNote,
    relationship: generateRelationship,
    'complete-shape': generateCompleteShape,
    'reverse-map': generateReverseMap,
    'boundary-shift': generateBoundaryShift,
    'root-relocation': generateRootRelocation,
    'interval-pair': generateIntervalPair,
    'study-reveal': generateStudyReveal,
    'play-interval': generatePlayInterval,
    'play-target': generatePlayTarget,
    'play-root-then': generatePlayRootThen,
    'play-sequence': generatePlaySequence,
    'play-missing': generatePlayMissing,
    'hear-reproduce': generateHearReproduce,
  };
  const gen = generators[type] || generateLocate;

  for (let attempt = 0; attempt < 24; attempt++) {
    const q = gen(ctx);
    if (q && validateQuestion(q, ctx).ok) return q;
  }
  // Fallback: simple locate P5
  return generateLocate({ ...ctx, forceInterval: 7 });
}

function validateQuestion(q, ctx) {
  if (!q || !q.anchor) return { ok: false, reason: 'no-anchor' };
  if (q.anchor.fret < ctx.fretStart || q.anchor.fret > ctx.fretEnd) {
    return { ok: false, reason: 'anchor-out-of-range' };
  }
  if (q.requiresAudioPhysical) return { ok: false, reason: 'audio-physical' };
  if (q.answers && q.answers.length === 0 && q.needsAnswers !== false) {
    return { ok: false, reason: 'no-answers' };
  }
  if (q.requiresBoundary && !q.boundaryPresent) {
    return { ok: false, reason: 'missing-boundary' };
  }
  if (q.requiredString != null && (q.requiredString < 0 || q.requiredString >= ctx.openMidis.length)) {
    return { ok: false, reason: 'bad-string' };
  }
  const allowed = new Set(enabledIntervalsForLevel(ctx.level));
  if (q.intervalClass != null && q.intervalClass !== 12 && !allowed.has(q.intervalClass) && ctx.level < 5) {
    // pairs / octaves may use 12
    if (!(q.intervalClass === 0 && allowed.has(0))) {
      return { ok: false, reason: 'interval-not-in-level' };
    }
  }
  return { ok: true };
}

export function generateLocate(ctx) {
  const mode = ctx.locateMode || pick(['any', 'nearest', 'every', 'string', 'above', 'below', 'no-boundary']);
  const ic = ctx.forceInterval ?? chooseInterval(ctx.level);
  const preferLow = ctx.dropZone === 'lowest' ? 0 : null;
  const anchor = ctx.anchor || randomRootPosition(ctx.openMidis, ctx.fretStart, ctx.fretEnd, preferLow);
  const positions = positionsForInterval({
    anchor,
    openMidis: ctx.openMidis,
    intervalClass: ic,
    mapRange: ctx.mapRange,
    fretStart: ctx.fretStart,
    fretEnd: ctx.fretEnd,
  });
  let answers = ensureAnswers(positions, anchor, ic);
  if (mode === 'no-boundary') answers = answers.filter((p) => !p.crossesBoundary);
  if (mode === 'across-boundary') answers = answers.filter((p) => p.crossesBoundary);
  if (mode === 'string' || mode === 'on-string') {
    const s = ctx.requiredString != null ? ctx.requiredString : pick([...new Set(answers.map((a) => a.string))]);
    answers = answers.filter((p) => p.string === s);
  }
  if (mode === 'above') answers = answers.filter((p) => p.fret > anchor.fret || p.string > anchor.string);
  if (mode === 'below') answers = answers.filter((p) => p.fret < anchor.fret || p.string < anchor.string);
  if (!answers.length) return null;

  const nearest = withNearest(answers, anchor);
  const info = describeInterval(ic);
  const prompt = `Find a ${info.name.toLowerCase()} from the anchor root.`;
  return {
    id: `locate-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'locate',
    inputMethod: 'fretboard',
    prompt,
    intervalClass: ic,
    intervalInfo: info,
    targetNote: pitchClassName(anchor.midi + ic),
    anchor,
    answers: mode === 'nearest' ? (nearest.nearest ? [nearest.nearest] : answers.slice(0, 1)) : answers,
    allAnswers: answers,
    nearest: nearest.nearest,
    locateMode: mode,
    hideAnswers: true,
    hideSubject: false,
    scoring: mode === 'every' ? 'every' : mode === 'nearest' ? 'nearest' : 'any',
    ...baseMeta(ctx),
  };
}

export function generateNameInterval(ctx) {
  const ic = ctx.forceInterval ?? chooseInterval(ctx.level);
  const convention = ctx.labelConvention || pick(['quality', 'degree']);
  const anchor = ctx.anchor || randomRootPosition(ctx.openMidis, ctx.fretStart, ctx.fretEnd);
  const positions = positionsForInterval({
    anchor, openMidis: ctx.openMidis, intervalClass: ic,
    mapRange: ctx.mapRange, fretStart: ctx.fretStart, fretEnd: ctx.fretEnd,
  });
  const answers = ensureAnswers(positions, anchor, ic);
  if (!answers.length) return null;
  const target = pick(answers);
  const info = describeInterval(ic);
  return {
    id: `name-int-${Date.now()}`,
    type: 'name-interval',
    inputMethod: 'interval',
    prompt: 'What interval is this from the root?',
    intervalClass: ic,
    intervalInfo: info,
    convention,
    correctLabel: convention === 'quality' ? info.quality : info.degree,
    anchor,
    target,
    answers: [target],
    hideAnswers: false,
    hideSubject: true,
    ...baseMeta(ctx),
  };
}

export function generateNameNote(ctx) {
  const mode = pick(['from-interval', 'from-fret']);
  const ic = ctx.forceInterval ?? chooseInterval(ctx.level);
  const anchor = ctx.anchor || randomRootPosition(ctx.openMidis, ctx.fretStart, ctx.fretEnd);
  const info = describeInterval(ic);
  const targetNote = pitchClassName(((anchor.pitchClass + ic) % 12 + 12) % 12);
  if (mode === 'from-interval') {
    return {
      id: `name-note-${Date.now()}`,
      type: 'name-note',
      inputMethod: 'note',
      prompt: `The root is ${pitchClassName(anchor.midi)}. What note is the ${info.name.toLowerCase()}?`,
      intervalClass: ic,
      intervalInfo: info,
      anchor,
      targetNote,
      correctNote: targetNote,
      answers: [],
      needsAnswers: false,
      hideAnswers: true,
      ...baseMeta(ctx),
    };
  }
  const positions = positionsForInterval({
    anchor, openMidis: ctx.openMidis, intervalClass: ic,
    mapRange: ctx.mapRange, fretStart: ctx.fretStart, fretEnd: ctx.fretEnd,
  });
  const answers = ensureAnswers(positions, anchor, ic);
  if (!answers.length) return null;
  const target = pick(answers);
  return {
    id: `name-note-fret-${Date.now()}`,
    type: 'name-note',
    inputMethod: 'note',
    prompt: 'What note is the highlighted fret?',
    intervalClass: ic,
    intervalInfo: info,
    anchor,
    target,
    targetNote: pitchClassName(target.midi),
    correctNote: pitchClassName(target.midi),
    answers: [target],
    ...baseMeta(ctx),
  };
}

export function generateRelationship(ctx) {
  const ic = ctx.forceInterval ?? chooseInterval(ctx.level);
  const anchor = ctx.anchor || randomRootPosition(ctx.openMidis, ctx.fretStart, ctx.fretEnd);
  const positions = positionsForInterval({
    anchor, openMidis: ctx.openMidis, intervalClass: ic,
    mapRange: ctx.mapRange, fretStart: ctx.fretStart, fretEnd: ctx.fretEnd,
  });
  const answers = ensureAnswers(positions, anchor, ic);
  if (!answers.length) return null;
  const target = pick(answers);
  const vec = relativeVector(anchor, target);
  const info = describeInterval(ic);
  return {
    id: `rel-${Date.now()}`,
    type: 'relationship',
    inputMethod: 'mixed',
    prompt: `${describeVector(vec)}. What interval is this?`,
    intervalClass: ic,
    intervalInfo: info,
    anchor,
    target,
    answers: [target],
    vector: vec,
    boundaryStatus: target.crossesBoundary ? 'crosses' : 'none',
    ...baseMeta(ctx),
  };
}

export function generateCompleteShape(ctx) {
  const sets = [
    { name: 'Root and octave', intervals: [0, 12] },
    { name: 'Fourth and fifth', intervals: [5, 7] },
    { name: 'Minor and major 3rd', intervals: [3, 4] },
    { name: 'Minor and major 7th', intervals: [10, 11] },
  ];
  const set = pick(sets);
  const allowed = new Set(enabledIntervalsForLevel(ctx.level));
  const ints = set.intervals.filter((i) => i === 12 || allowed.has(i) || (i === 0 && allowed.has(0)));
  if (ints.length < 2 && ctx.level > 1) return null;
  const useInts = ints.length >= 2 ? ints : [5, 7];
  const anchor = ctx.anchor || randomRootPosition(ctx.openMidis, ctx.fretStart, ctx.fretEnd);
  const shown = [];
  const missing = [];
  for (const ic of useInts) {
    const positions = positionsForInterval({
      anchor, openMidis: ctx.openMidis, intervalClass: ic === 12 ? 12 : ic,
      mapRange: ctx.mapRange, fretStart: ctx.fretStart, fretEnd: ctx.fretEnd,
    });
    const answers = ensureAnswers(positions, anchor, ic === 12 ? 12 : ic);
    if (!answers.length) continue;
    const nearest = withNearest(answers, anchor).nearest || answers[0];
    if (shown.length === 0) shown.push({ ...nearest, intervalClass: ic === 12 ? 0 : ic });
    else missing.push({ ...nearest, intervalClass: ic === 12 ? 0 : ic });
  }
  if (!missing.length) return null;
  return {
    id: `complete-${Date.now()}`,
    type: 'complete-shape',
    inputMethod: 'fretboard',
    prompt: `Complete the ${set.name.toLowerCase()} shape.`,
    intervalClass: missing[0].intervalClass,
    intervalInfo: describeInterval(missing[0].intervalClass),
    anchor,
    shown,
    answers: missing,
    scoring: 'every',
    ...baseMeta(ctx),
  };
}

export function generateReverseMap(ctx) {
  const ic = ctx.forceInterval ?? chooseInterval(ctx.level);
  const anchor = ctx.anchor || randomRootPosition(ctx.openMidis, ctx.fretStart, ctx.fretEnd);
  const shape = shapeVariantsForInterval({
    anchor, openMidis: ctx.openMidis, intervalClass: ic,
    mapRange: ctx.mapRange, fretStart: ctx.fretStart, fretEnd: ctx.fretEnd,
  });
  if (!shape.variants.length) return null;
  const truth = pick(shape.variants);
  const lie = Math.random() < 0.45;
  let shownVector = { deltaString: truth.vector.deltaString, deltaFret: truth.vector.deltaFret };
  let correctChoice = 'correct';
  if (lie) {
    shownVector = {
      deltaString: truth.vector.deltaString,
      deltaFret: truth.vector.deltaFret + pick([1, -1, 2]),
    };
    // If a boundary exists for this string move, the answer may depend on boundary
    const probeString = anchor.string + shownVector.deltaString;
    if (probeString >= 0 && probeString < ctx.openMidis.length) {
      const bounds = boundariesBetweenPositions(anchor.string, probeString, ctx.openMidis);
      if (bounds.length) correctChoice = 'depends';
      else correctChoice = 'incorrect';
    } else {
      correctChoice = 'incorrect';
    }
  } else if (truth.crossesBoundary) {
    // Still correct for this specific string, but teach depends option
    correctChoice = 'correct';
  }
  const info = describeInterval(ic);
  return {
    id: `reverse-${Date.now()}`,
    type: 'reverse-map',
    inputMethod: 'choice',
    prompt: `${info.name}\n${describeVector(shownVector)}\nDoes this vector match?`,
    intervalClass: ic,
    intervalInfo: info,
    anchor,
    shownVector,
    correctChoice,
    choices: [
      { id: 'correct', label: 'Correct' },
      { id: 'incorrect', label: 'Incorrect' },
      { id: 'depends', label: 'Depends on the string boundary' },
    ],
    answers: truth.position ? [truth.position] : [],
    needsAnswers: false,
    ...baseMeta(ctx),
  };
}

export function generateBoundaryShift(ctx) {
  // Find a boundary in the tuning
  const bounds = [];
  for (let i = 0; i < ctx.openMidis.length - 1; i++) {
    if (crossesTuningBoundary(i, i + 1, ctx.openMidis)) {
      const b = boundariesBetweenPositions(i, i + 1, ctx.openMidis)[0];
      if (b) bounds.push(b);
    }
  }
  if (!bounds.length) return null;
  const b = pick(bounds);
  const ic = ctx.forceInterval ?? pick(enabledIntervalsForLevel(ctx.level).filter((x) => x !== 0).concat([4, 5, 7]));
  // Place anchor on the lower side of the boundary
  const anchor = makeAnchor({
    string: b.lowerIndex,
    fret: ctx.fretStart + 2 + Math.floor(Math.random() * Math.max(1, ctx.fretEnd - ctx.fretStart - 4)),
    openMidis: ctx.openMidis,
  });
  const positions = positionsForInterval({
    anchor, openMidis: ctx.openMidis, intervalClass: ic,
    mapRange: Math.max(2, ctx.mapRange), fretStart: ctx.fretStart, fretEnd: ctx.fretEnd,
  });
  const answers = ensureAnswers(positions, anchor, ic).filter((p) =>
    p.string === b.upperIndex || boundariesBetweenPositions(anchor.string, p.string, ctx.openMidis).some((x) => x.type === b.type)
  );
  if (!answers.length) return null;
  const info = describeInterval(ic);
  return {
    id: `bound-${Date.now()}`,
    type: 'boundary-shift',
    inputMethod: 'fretboard',
    prompt: b.type === 'drop'
      ? `Find the ${info.name.toLowerCase()} across the drop boundary.`
      : `Move this ${info.name.toLowerCase()} shape across the ${b.label}.`,
    intervalClass: ic,
    intervalInfo: info,
    anchor,
    answers,
    requiresBoundary: true,
    boundaryPresent: true,
    boundary: b,
    explanationAfter: true,
    ...baseMeta(ctx),
  };
}

export function generateRootRelocation(ctx) {
  const ic = ctx.forceInterval ?? chooseInterval(ctx.level);
  const anchor = ctx.anchor || randomRootPosition(ctx.openMidis, ctx.fretStart, ctx.fretEnd);
  const shape = shapeVariantsForInterval({
    anchor, openMidis: ctx.openMidis, intervalClass: ic,
    mapRange: ctx.mapRange, fretStart: ctx.fretStart, fretEnd: ctx.fretEnd,
  });
  if (!shape.nearest.nearest) return null;
  // New root elsewhere
  let newAnchor = randomRootPosition(ctx.openMidis, ctx.fretStart, ctx.fretEnd);
  for (let i = 0; i < 8 && newAnchor.string === anchor.string && newAnchor.fret === anchor.fret; i++) {
    newAnchor = randomRootPosition(ctx.openMidis, ctx.fretStart, ctx.fretEnd);
  }
  const newPositions = positionsForInterval({
    anchor: newAnchor, openMidis: ctx.openMidis, intervalClass: ic,
    mapRange: ctx.mapRange, fretStart: ctx.fretStart, fretEnd: ctx.fretEnd,
  });
  const answers = ensureAnswers(newPositions, newAnchor, ic);
  if (!answers.length) return null;
  const info = describeInterval(ic);
  return {
    id: `reloc-${Date.now()}`,
    type: 'root-relocation',
    inputMethod: 'fretboard',
    prompt: `The ${info.name.toLowerCase()} shape moved with the root. Recreate it from the new anchor.`,
    intervalClass: ic,
    intervalInfo: info,
    previousAnchor: anchor,
    previousTarget: shape.nearest.nearest,
    anchor: newAnchor,
    answers,
    ...baseMeta(ctx),
  };
}

export function generateIntervalPair(ctx) {
  const allowed = enabledIntervalsForLevel(ctx.level);
  const pairs = INTERVAL_PAIRS.filter(([a, b]) =>
    (a === 0 || allowed.includes(a)) && (b === 0 || allowed.includes(b))
  );
  if (!pairs.length) return null;
  const [a, b] = pick(pairs);
  const ask = pick([a, b]);
  const other = ask === a ? b : a;
  const anchor = ctx.anchor || randomRootPosition(ctx.openMidis, ctx.fretStart, ctx.fretEnd);
  const positions = positionsForInterval({
    anchor, openMidis: ctx.openMidis, intervalClass: ask,
    mapRange: ctx.mapRange, fretStart: ctx.fretStart, fretEnd: ctx.fretEnd,
  });
  const answers = ensureAnswers(positions, anchor, ask);
  if (!answers.length) return null;
  return {
    id: `pair-${Date.now()}`,
    type: 'interval-pair',
    inputMethod: 'fretboard',
    prompt: `Locate the ${describeInterval(ask).name} (pair of ${describeInterval(other).name}).`,
    intervalClass: ask,
    intervalInfo: describeInterval(ask),
    pairWith: other,
    anchor,
    answers,
    ...baseMeta(ctx),
  };
}

export function generateStudyReveal(ctx) {
  const ic = ctx.forceInterval ?? chooseInterval(ctx.level);
  const anchor = ctx.anchor || randomRootPosition(ctx.openMidis, ctx.fretStart, ctx.fretEnd);
  const shape = shapeVariantsForInterval({
    anchor, openMidis: ctx.openMidis, intervalClass: ic,
    mapRange: ctx.mapRange, fretStart: ctx.fretStart, fretEnd: ctx.fretEnd,
  });
  if (!shape.positions.length) return null;
  return {
    id: `study-${Date.now()}`,
    type: 'study-reveal',
    inputMethod: 'self',
    prompt: `Recall the ${shape.interval.name} shapes from the anchor, then reveal to check.`,
    intervalClass: ic,
    intervalInfo: shape.interval,
    targetNote: shape.targetNote,
    anchor,
    answers: shape.positions.filter((p) => !p.isAnchor),
    nearest: shape.nearest.nearest,
    hideAnswers: true,
    hideSubject: Math.random() < 0.35,
    hideAnchor: Math.random() < 0.15,
    selfCheck: true,
    ...baseMeta(ctx),
  };
}

function audioBase(ctx, ic, anchor) {
  const info = describeInterval(ic);
  const targetMidi = anchor.midi + (ic === 12 ? 12 : ic);
  return {
    intervalClass: ic,
    intervalInfo: info,
    targetNote: pitchClassName(targetMidi),
    targetMidi,
    anchor,
    answers: [],
    needsAnswers: false,
    inputMethod: 'audio',
    claimsPhysicalPosition: false,
    audioNote: 'Audio checks pitch only — not the exact string or fret.',
    ...baseMeta(ctx),
  };
}

export function generatePlayInterval(ctx) {
  const ic = ctx.forceInterval ?? chooseInterval(ctx.level);
  const anchor = ctx.anchor || randomRootPosition(ctx.openMidis, ctx.fretStart, ctx.fretEnd);
  const base = audioBase(ctx, ic, anchor);
  return {
    ...base,
    id: `play-int-${Date.now()}`,
    type: 'play-interval',
    prompt: `Root: ${anchor.label}\nPlay a ${base.intervalInfo.name.toLowerCase()}.`,
    registerMode: ctx.registerMode || 'pitchClass',
    directionMode: ctx.directionMode || 'any',
    sequence: null,
  };
}

export function generatePlayTarget(ctx) {
  const ic = ctx.forceInterval ?? chooseInterval(ctx.level);
  const anchor = ctx.anchor || randomRootPosition(ctx.openMidis, ctx.fretStart, ctx.fretEnd);
  const positions = positionsForInterval({
    anchor, openMidis: ctx.openMidis, intervalClass: ic,
    mapRange: ctx.mapRange, fretStart: ctx.fretStart, fretEnd: ctx.fretEnd,
  });
  const answers = ensureAnswers(positions, anchor, ic);
  if (!answers.length) return null;
  const target = pick(answers);
  const base = audioBase(ctx, ic, anchor);
  return {
    ...base,
    id: `play-tgt-${Date.now()}`,
    type: 'play-target',
    prompt: 'Play the highlighted target pitch.',
    target,
    targetMidi: target.midi,
    answers: [target],
    registerMode: ctx.registerMode || 'exact',
  };
}

export function generatePlayRootThen(ctx) {
  const ic = ctx.forceInterval ?? chooseInterval(ctx.level);
  const anchor = ctx.anchor || randomRootPosition(ctx.openMidis, ctx.fretStart, ctx.fretEnd);
  const base = audioBase(ctx, ic, anchor);
  return {
    ...base,
    id: `play-rt-${Date.now()}`,
    type: 'play-root-then',
    prompt: `Play the root, then its ${base.intervalInfo.name.toLowerCase()}.`,
    sequence: [
      { targetMidi: anchor.midi, anchorMidi: anchor.midi, intervalClass: 0, label: 'Root' },
      { targetMidi: base.targetMidi, anchorMidi: anchor.midi, intervalClass: ic, label: base.intervalInfo.name },
    ],
    registerMode: ctx.registerMode || 'pitchClass',
  };
}

export function generatePlaySequence(ctx) {
  const levelInts = enabledIntervalsForLevel(ctx.level).filter((i) => i !== 0);
  const seqIcs = levelInts.length >= 2
    ? [0, pick(levelInts), pick(levelInts.includes(7) ? [7, 12] : [pick(levelInts), 12])]
    : [0, 7, 12];
  const anchor = ctx.anchor || randomRootPosition(ctx.openMidis, ctx.fretStart, ctx.fretEnd);
  const sequence = seqIcs.map((ic) => {
    const semis = ic === 12 ? 12 : ic;
    return {
      targetMidi: anchor.midi + semis,
      anchorMidi: anchor.midi,
      intervalClass: ic === 12 ? 0 : ic,
      label: describeInterval(ic === 12 ? 12 : ic).name,
    };
  });
  return {
    id: `play-seq-${Date.now()}`,
    type: 'play-sequence',
    inputMethod: 'audio',
    prompt: `Play: ${sequence.map((s) => s.label).join(' → ')}`,
    intervalClass: seqIcs[1],
    intervalInfo: describeInterval(seqIcs[1]),
    anchor,
    sequence,
    registerMode: ctx.registerMode || 'pitchClass',
    answers: [],
    needsAnswers: false,
    claimsPhysicalPosition: false,
    ...baseMeta(ctx),
  };
}

export function generatePlayMissing(ctx) {
  const q = generateCompleteShape(ctx);
  if (!q) return null;
  const missing = q.answers[0];
  return {
    ...audioBase(ctx, missing.intervalClass, q.anchor),
    id: `play-miss-${Date.now()}`,
    type: 'play-missing',
    prompt: 'Play the missing shape tone.',
    shown: q.shown,
    target: missing,
    targetMidi: missing.midi,
    answers: [missing],
    registerMode: 'pitchClass',
  };
}

export function generateHearReproduce(ctx) {
  const q = generatePlayInterval(ctx);
  return {
    ...q,
    id: `hear-${Date.now()}`,
    type: 'hear-reproduce',
    prompt: `Listen to the root and interval, then play the target.`,
    earOnly: !!ctx.earOnly,
    allowTargetReplay: !ctx.earOnly,
  };
}

export function questionHasValidAnswerInRange(q, ctx) {
  return validateQuestion(q, ctx).ok;
}

export { validateQuestion, LEVEL_DEFS, MAP_RANGE_DEFS, QUIZ_EXERCISES as EXERCISE_TYPES };
