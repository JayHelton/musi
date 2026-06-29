// Rule-based, fully deterministic drum-fill generator (no AI, no network).
// Given a style/difficulty/length spec it returns a complete DrumPattern that
// can be auditioned, copied as tab, or loaded into the sequencer. The same
// seed always yields the same fill.

import { stepsPerBeat } from './types.js';
import { renderTab } from './tabRenderer.js';

const BEATS_FOR_LENGTH = { '2-beat': 2, '1-bar': 4, '2-bar': 8 };

const STYLE_BPM = {
  rock: [70, 140], punk: [140, 210], metal: [100, 200],
  deathcore: [90, 180], funk: [80, 130], shuffle: [80, 150],
};

export const FILL_TEMPLATES = {
  rock: ['snareBuild', 'tomDescent', 'snareToToms', 'flamAccent'],
  punk: ['pickupBurst', 'fastSnare', 'snareTomSnare'],
  metal: ['doubleKickBurst', 'tomBurst', 'snareKickAlternation'],
  deathcore: ['stopStart', 'syncopatedTomBurst', 'breakdownFill', 'doubleKickResolve'],
  funk: ['linearGhostFill', 'openHatLinear', 'snareGhostAnswer'],
  shuffle: ['tripletSnare', 'tripletTomDescent', 'bonhamTriplet'],
};

// --- Seeded RNG (mulberry32 + xfnv1a string hash) -------------------------
function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function chance(rng, p) { return rng() < p; }
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// --- Generation helpers ---------------------------------------------------
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function strideForDensity(density, per) {
  switch (density) {
    case 1: return per;                       // one hit per beat
    case 2: return Math.max(2, Math.round(per / 2));
    case 3: return 2;
    case 4: return 1;
    default: return 1;                        // every step
  }
}

function accentVel(step, per) { return step % per === 0 ? 1.0 : 0.78; }

// Build a context describing the grid.
function makeCtx(input) {
  let subdivision = input.subdivision || '16th';
  if (input.style === 'shuffle') subdivision = 'triplet';
  const per = stepsPerBeat(subdivision);
  const beats = BEATS_FOR_LENGTH[input.length] || 4;
  const total = beats * per;
  const density = clamp((input.density || 3) + Math.round((input.difficulty - 3) / 2), 1, 5);
  return { subdivision, per, beats, total, density };
}

// --- Templates: each returns PatternStep-ish {instrument, step, velocity} --
function tomDescent(ctx, rng) {
  const { total, per, density } = ctx;
  const voices = ['snare', 'tomHigh', 'tomMid', 'tomFloor'];
  const stride = strideForDensity(density, per);
  const steps = [];
  const zone = total / voices.length;
  for (let i = 0; i < total; i++) {
    if (i % stride !== 0 && !(density >= 4 && chance(rng, 0.6))) continue;
    const v = voices[clamp(Math.floor(i / zone), 0, voices.length - 1)];
    steps.push({ instrument: v, step: i, velocity: accentVel(i, per) });
  }
  return steps;
}

function snareBuild(ctx, rng) {
  const { total, per, density } = ctx;
  const stride = strideForDensity(density, per);
  const steps = [];
  for (let i = 0; i < total; i++) {
    const accelerate = i > total * 0.6 ? 1 : stride; // tighten towards the end
    if (i % accelerate === 0) steps.push({ instrument: 'snare', step: i, velocity: accentVel(i, per) });
  }
  return steps;
}

function snareToToms(ctx, rng) {
  const { total, per } = ctx;
  const steps = [];
  const half = Math.floor(total / 2);
  for (let i = 0; i < total; i++) {
    if (i < half) steps.push({ instrument: 'snare', step: i, velocity: accentVel(i, per) });
    else {
      const v = i < total * 0.75 ? 'tomHigh' : 'tomFloor';
      steps.push({ instrument: v, step: i, velocity: accentVel(i, per) });
    }
  }
  return steps;
}

function flamAccent(ctx, rng) {
  const { total, per } = ctx;
  const steps = [];
  for (let i = 0; i < total; i++) {
    if (i % per === 0) steps.push({ instrument: 'snareFlam', step: i, velocity: 0.95 });
    else if (i % Math.max(2, Math.round(per / 2)) === 0) steps.push({ instrument: 'snare', step: i, velocity: 0.8 });
  }
  return steps;
}

function pickupBurst(ctx, rng) {
  const { total, per } = ctx;
  const steps = [];
  for (let i = 0; i < total; i++) steps.push({ instrument: 'snare', step: i, velocity: i % per === 0 ? 1 : 0.85 });
  return steps;
}

function fastSnare(ctx, rng) {
  const { total, per } = ctx;
  const steps = [];
  for (let i = 0; i < total; i++) steps.push({ instrument: 'snare', step: i, velocity: accentVel(i, per) });
  return steps;
}

function snareTomSnare(ctx, rng) {
  const { total, per } = ctx;
  const steps = [];
  const q = Math.floor(total / 4);
  for (let i = 0; i < total; i++) {
    const v = (i >= q && i < total - q) ? (i < total / 2 ? 'tomHigh' : 'tomFloor') : 'snare';
    steps.push({ instrument: v, step: i, velocity: accentVel(i, per) });
  }
  return steps;
}

function doubleKickBurst(ctx, rng) {
  const { total, per } = ctx;
  const steps = [];
  for (let i = 0; i < total; i++) {
    steps.push({ instrument: 'kick', step: i, velocity: 0.85 });
    if (i % per === 0) steps.push({ instrument: 'snare', step: i, velocity: 1 });
  }
  return steps;
}

function tomBurst(ctx, rng) {
  const { total, per } = ctx;
  const voices = ['tomHigh', 'tomMid', 'tomFloor'];
  const steps = [];
  for (let i = 0; i < total; i++) {
    const v = voices[clamp(Math.floor(i / (total / voices.length)), 0, voices.length - 1)];
    steps.push({ instrument: v, step: i, velocity: accentVel(i, per) });
    if (chance(rng, 0.4)) steps.push({ instrument: 'kick', step: i, velocity: 0.7 });
  }
  return steps;
}

function snareKickAlternation(ctx, rng) {
  const { total, per } = ctx;
  const steps = [];
  for (let i = 0; i < total; i++) {
    steps.push({ instrument: i % 2 === 0 ? 'snare' : 'kick', step: i, velocity: accentVel(i, per) });
  }
  return steps;
}

function stopStart(ctx, rng) {
  const { total, per } = ctx;
  const steps = [];
  for (let i = 0; i < total; i++) {
    // Leave deliberate space; hit on beats and a few syncopations.
    if (i % per === 0) { steps.push({ instrument: 'snare', step: i, velocity: 1 }); steps.push({ instrument: 'kick', step: i, velocity: 0.9 }); }
    else if (chance(rng, 0.28)) steps.push({ instrument: 'kick', step: i, velocity: 0.8 });
  }
  // a china/crash accent at the front
  steps.push({ instrument: 'crash', step: 0, velocity: 1 });
  return steps;
}

function syncopatedTomBurst(ctx, rng) {
  const { total, per } = ctx;
  const voices = ['tomHigh', 'tomMid', 'tomFloor'];
  const steps = [];
  for (let i = 0; i < total; i++) {
    if (chance(rng, 0.7)) {
      const v = voices[clamp(Math.floor(i / (total / voices.length)), 0, voices.length - 1)];
      steps.push({ instrument: v, step: i, velocity: accentVel(i, per) });
    }
    if (i % per === 0 || chance(rng, 0.35)) steps.push({ instrument: 'kick', step: i, velocity: 0.8 });
  }
  return steps;
}

function breakdownFill(ctx, rng) {
  const { total, per } = ctx;
  const steps = [];
  for (let i = 0; i < total; i++) {
    if (i % per === 0) steps.push({ instrument: 'crash', step: i, velocity: 0.9 });
    if (i % Math.max(2, per - 1) === 0 || chance(rng, 0.4)) steps.push({ instrument: 'kick', step: i, velocity: 0.95 });
    if (i % per === Math.floor(per / 2)) steps.push({ instrument: 'snare', step: i, velocity: 1 });
  }
  return steps;
}

function doubleKickResolve(ctx, rng) {
  const { total, per } = ctx;
  const steps = [];
  for (let i = 0; i < total; i++) {
    steps.push({ instrument: 'kick', step: i, velocity: 0.85 });
    if (i % per === 0) steps.push({ instrument: i >= total - per ? 'crash' : 'snare', step: i, velocity: 1 });
  }
  return steps;
}

function linearGhostFill(ctx, rng) {
  const { total, per } = ctx;
  const steps = [];
  const cycle = ['hihatClosed', 'snareGhost', 'kick'];
  for (let i = 0; i < total; i++) {
    let inst = cycle[i % cycle.length];
    if (i % per === 0) { steps.push({ instrument: 'snare', step: i, velocity: 0.9 }); continue; }
    steps.push({ instrument: inst, step: i, velocity: inst === 'snareGhost' ? 0.3 : 0.6 });
  }
  return steps;
}

function openHatLinear(ctx, rng) {
  const { total, per } = ctx;
  const steps = [];
  for (let i = 0; i < total; i++) {
    if (i % per === 0) steps.push({ instrument: 'snare', step: i, velocity: 0.85 });
    else if (i % per === per - 1) steps.push({ instrument: 'hihatOpen', step: i, velocity: 0.6 });
    else if (chance(rng, 0.5)) steps.push({ instrument: 'snareGhost', step: i, velocity: 0.3 });
    if (chance(rng, 0.4)) steps.push({ instrument: 'kick', step: i, velocity: 0.6 });
  }
  return steps;
}

function snareGhostAnswer(ctx, rng) {
  const { total, per } = ctx;
  const steps = [];
  for (let i = 0; i < total; i++) {
    if (i % per === 0) steps.push({ instrument: 'snare', step: i, velocity: 0.9 });
    else steps.push({ instrument: 'snareGhost', step: i, velocity: 0.3 });
  }
  return steps;
}

function tripletSnare(ctx, rng) {
  const { total } = ctx;
  const steps = [];
  for (let i = 0; i < total; i++) {
    if (i % 3 === 1 && chance(rng, 0.7)) continue; // skip the middle triplet often
    steps.push({ instrument: 'snare', step: i, velocity: i % 3 === 0 ? 1 : 0.78 });
  }
  return steps;
}

function tripletTomDescent(ctx, rng) {
  const { total } = ctx;
  const voices = ['snare', 'tomHigh', 'tomMid', 'tomFloor'];
  const steps = [];
  for (let i = 0; i < total; i++) {
    if (i % 3 === 1 && chance(rng, 0.5)) continue;
    const v = voices[clamp(Math.floor(i / (total / voices.length)), 0, voices.length - 1)];
    steps.push({ instrument: v, step: i, velocity: i % 3 === 0 ? 1 : 0.78 });
  }
  return steps;
}

function bonhamTriplet(ctx, rng) {
  const { total } = ctx;
  const cycle = ['tomHigh', 'tomFloor', 'kick'];
  const steps = [];
  for (let i = 0; i < total; i++) {
    steps.push({ instrument: cycle[i % 3], step: i, velocity: i % 3 === 0 ? 0.95 : 0.8 });
  }
  return steps;
}

const GENERATORS = {
  snareBuild, tomDescent, snareToToms, flamAccent,
  pickupBurst, fastSnare, snareTomSnare,
  doubleKickBurst, tomBurst, snareKickAlternation,
  stopStart, syncopatedTomBurst, breakdownFill, doubleKickResolve,
  linearGhostFill, openHatLinear, snareGhostAnswer,
  tripletSnare, tripletTomDescent, bonhamTriplet,
};

const PRACTICE_NOTES = {
  rock: 'Keep the backbeat steady and land the downbeat after the fill cleanly.',
  punk: 'Drive hard and stay relaxed — speed comes from looseness, not tension.',
  metal: 'Lock the feet to the click; bury the beater and keep the snare even.',
  deathcore: 'Mind the space — let the silences breathe between bursts.',
  funk: 'Bury the ghost notes low and let the accents pop; keep the hat loose.',
  shuffle: 'Feel the triplet pulse; skip the middle note without rushing.',
};

function applyOptions(steps, input, ctx) {
  let out = steps;
  if (!input.includeKick) out = out.filter((s) => s.instrument !== 'kick');
  if (!input.includeFlams) {
    out = out.map((s) => (s.instrument === 'snareFlam' ? { ...s, instrument: 'snare' } : s));
  }
  if (!input.includeGhosts) {
    out = out.filter((s) => s.instrument !== 'snareGhost');
  }
  if (input.includeFlams && input.style !== 'funk') {
    // Promote the very first downbeat snare to a flam for a stronger entrance.
    const first = out.find((s) => s.step === 0 && s.instrument === 'snare');
    if (first) first.instrument = 'snareFlam';
  }
  // De-duplicate identical instrument+step collisions.
  const seen = new Set();
  out = out.filter((s) => {
    const k = s.instrument + ':' + s.step;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return out;
}

let counter = 0;

/**
 * @param {object} input FillGeneratorInput
 * @returns {import('./types.js').DrumPattern}
 */
export function generateFill(input) {
  const spec = {
    style: input.style || 'rock',
    difficulty: clamp(input.difficulty || 3, 1, 5),
    length: input.length || '1-bar',
    subdivision: input.subdivision || '16th',
    density: clamp(input.density || 3, 1, 5),
    includeKick: input.includeKick !== false,
    includeFlams: !!input.includeFlams,
    includeGhosts: !!input.includeGhosts,
    resolveWithCrash: input.resolveWithCrash !== false,
    seed: input.seed || String(Date.now()) + ':' + (counter++),
  };
  const rng = mulberry32(hashSeed(`${spec.style}|${spec.difficulty}|${spec.length}|${spec.subdivision}|${spec.density}|${spec.seed}`));

  const ctx = makeCtx(spec);
  const templates = FILL_TEMPLATES[spec.style] || FILL_TEMPLATES.rock;
  const templateName = pick(rng, templates);
  let steps = (GENERATORS[templateName] || tomDescent)(ctx, rng);
  steps = applyOptions(steps, spec, ctx);
  steps = steps
    .filter((s) => s.step >= 0 && s.step < ctx.total)
    .map((s) => ({ instrument: s.instrument, step: s.step, velocity: s.velocity, probability: 1 }))
    .sort((a, b) => a.step - b.step);

  const bars = spec.length === '2-bar' ? 2 : 1;
  const stepsPerBar = ctx.total / bars;
  const bpm = STYLE_BPM[spec.style] || [80, 140];

  const pattern = {
    id: `fill-${Date.now().toString(36)}-${Math.floor(rng() * 1e6).toString(36)}`,
    title: `${cap(spec.style)} Fill (${spec.length}, D${spec.difficulty})`,
    category: 'fill',
    style: spec.style,
    difficulty: spec.difficulty,
    bpmRange: bpm,
    meter: ctx.subdivision === 'triplet' ? '12/8' : '4/4',
    subdivision: ctx.subdivision,
    bars,
    stepsPerBar,
    beatsPerBar: stepsPerBar / ctx.per,
    recommendedLoopBars: 1,
    notes: `${PRACTICE_NOTES[spec.style] || ''}${spec.resolveWithCrash ? ' Resolve to a crash + kick on the next downbeat.' : ''}`.trim(),
    steps,
    template: templateName,
    resolveWithCrash: spec.resolveWithCrash,
    seed: spec.seed,
    tab: '',
    builtin: false,
  };
  pattern.tab = renderTab(pattern);
  return pattern;
}
