// The cadence model of Riff Spark.
//
// A cadence is one or two bars of sixteenth-note slots. Each slot is a rest or
// an attack, and each attack has a role: a low chug, a pitched note, or a
// chord stab. The model draws a cadence from a seed under a set of rules that
// come from riff writing, not from a coin:
//
//   - the first slot usually carries an attack, so the bar has gravity;
//   - a rest of two or three slots stays in the bar, because the silence
//     after an accent is part of the riff;
//   - a run of sixteenths has a length limit, apart from the burst shape;
//   - two to four attacks in ten become pitched notes, and those sit at the
//     end of a run or away from a beat, where the ear hears them.
//
// This module is pure. It touches no screen, no clock, and no audio.

import { createRng, randomSeed, shuffle } from './rng.js';

/**
 * The meters the tool offers. `slots` is the count of sixteenth notes in one
 * bar, and `pulse` is the count of slots between two clicks of the pulse.
 */
export const METERS = [
  { id: '4/4', label: '4/4', slots: 16, pulse: 4 },
  { id: '3/4', label: '3/4', slots: 12, pulse: 4 },
  { id: '5/4', label: '5/4', slots: 20, pulse: 4 },
  { id: '6/4', label: '6/4', slots: 24, pulse: 4 },
  { id: '5/8', label: '5/8', slots: 10, pulse: 2 },
  { id: '7/8', label: '7/8', slots: 14, pulse: 2 },
  { id: '9/8', label: '9/8', slots: 18, pulse: 2 },
];

export const DEFAULT_METER = '4/4';

/** The three roles an attack can carry. An empty string is a rest. */
export const ROLES = ['chug', 'note', 'stab'];

/** One character per role, for the text line. */
export const ROLE_MARKS = { '': '-', chug: 'X', note: 'o', stab: '#' };

/** What each role asks the guitar to play. */
export const ROLE_WORDS = {
  chug: 'Low chug on the root',
  note: 'Pitched note or slide',
  stab: 'Chord stab or octave',
};

/**
 * The density levels. `ratio` is the share of slots that carry an attack,
 * `minRest` is the rest the bar must keep, and `maxRun` is the longest run of
 * sixteenths the level allows.
 */
export const DENSITIES = [
  { id: 'sparse', label: 'Sparse', ratio: 0.25, minRest: 3, maxRun: 2 },
  { id: 'medium', label: 'Medium', ratio: 0.45, minRest: 2, maxRun: 4 },
  { id: 'dense', label: 'Dense', ratio: 0.7, minRest: 1, maxRun: 8 },
];

/** The shapes a draw can take. Each one is a riff-writing device. */
export const SHAPES = [
  {
    id: 'free',
    label: 'Free',
    blurb: 'A weighted draw. Beats carry more weight than offbeat sixteenths.',
  },
  {
    id: 'gallop',
    label: 'Gallop',
    blurb: 'An eighth and two sixteenths per beat, with some beats held or left out.',
  },
  {
    id: 'cell332',
    label: '3+3+2 cell',
    blurb: 'A cell of three, three, and two sixteenths, laid across the bar.',
  },
  {
    id: 'burst',
    label: 'Sustain then burst',
    blurb: 'One long attack, silence, and a burst of sixteenths at the end.',
  },
  {
    id: 'breakdown',
    label: 'Breakdown',
    blurb: 'Attacks on the beats, and one attack that breaks the expectation.',
  },
];

/** How bar two relates to bar one when a cadence has two bars. */
export const PAIRINGS = [
  { id: 'answer', label: 'Answer', blurb: 'Bar two keeps bar one and changes the ending.' },
  { id: 'displace', label: 'Displace', blurb: 'Bar two is bar one moved one eighth note later.' },
  { id: 'repeat', label: 'Repeat', blurb: 'Bar two is bar one again.' },
  { id: 'fresh', label: 'Fresh', blurb: 'Bar two is a new draw with the same settings.' },
];

/** The default draw settings. */
export const DEFAULT_SETTINGS = {
  meter: DEFAULT_METER,
  bars: 1,
  density: 'medium',
  shape: 'free',
  pairing: 'answer',
  noteShare: 0.3,
};

const MAX_BARS = 4;

export function meterById(id) {
  return METERS.find(m => m.id === id) || METERS[0];
}

export function densityById(id) {
  return DENSITIES.find(d => d.id === id) || DENSITIES[1];
}

export function shapeById(id) {
  return SHAPES.find(s => s.id === id) || SHAPES[0];
}

export function pairingById(id) {
  return PAIRINGS.find(p => p.id === id) || PAIRINGS[0];
}

function clampBars(bars) {
  const n = Math.round(Number(bars));
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(MAX_BARS, n));
}

function clampShare(share) {
  const n = Number(share);
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.noteShare;
  return Math.max(0, Math.min(1, n));
}

/* --- reading a cadence -------------------------------------------------- */

/**
 * What a list of cells contains.
 * @param {string[]} cells
 * @param {number} pulse slots between two pulse clicks
 */
export function cellStats(cells, pulse = 4) {
  const list = Array.isArray(cells) ? cells : [];
  const attackSlots = [];
  list.forEach((cell, i) => { if (cell) attackSlots.push(i); });

  let longestRest = 0;
  let longestRun = 0;
  let rest = 0;
  let run = 0;
  for (const cell of list) {
    if (cell) {
      run += 1;
      rest = 0;
    } else {
      rest += 1;
      run = 0;
    }
    if (rest > longestRest) longestRest = rest;
    if (run > longestRun) longestRun = run;
  }

  const count = (role) => list.filter(cell => cell === role).length;
  return {
    slots: list.length,
    attacks: attackSlots.length,
    rests: list.length - attackSlots.length,
    longestRest,
    longestRun,
    offbeats: attackSlots.filter(i => i % pulse !== 0).length,
    chugs: count('chug'),
    notes: count('note'),
    stabs: count('stab'),
    attackSlots,
    firstAttack: attackSlots.length ? attackSlots[0] : -1,
    lastAttack: attackSlots.length ? attackSlots[attackSlots.length - 1] : -1,
  };
}

/** The stats of a whole cadence. */
export function cadenceStats(cadence) {
  const meter = meterById(cadence?.meter);
  return cellStats(cadence?.cells || [], meter.pulse);
}

/**
 * The cells of one bar.
 * @param {Object} cadence
 * @param {number} bar zero-based
 * @returns {string[]}
 */
export function barCells(cadence, bar) {
  const meter = meterById(cadence?.meter);
  const cells = Array.isArray(cadence?.cells) ? cadence.cells : [];
  return cells.slice(bar * meter.slots, (bar + 1) * meter.slots);
}

/**
 * The text line of a cadence, such as "X - o X | X - - - || X - o X | # - - -".
 * Slots group by pulse, and bars split on a double bar.
 * @param {Object} cadence
 * @param {{marks?: Object}} [options]
 * @returns {string}
 */
export function describeCadence(cadence, { marks = ROLE_MARKS } = {}) {
  const meter = meterById(cadence?.meter);
  const bars = [];
  for (let b = 0; b < (cadence?.bars || 1); b += 1) {
    const cells = barCells(cadence, b);
    const groups = [];
    for (let i = 0; i < cells.length; i += meter.pulse) {
      groups.push(cells.slice(i, i + meter.pulse).map(cell => marks[cell] ?? marks['']).join(' '));
    }
    bars.push(groups.join(' | '));
  }
  return bars.join('  ||  ');
}

/** The count line of a cadence, such as "1 e & a 2 e & a". */
export function countLine(meterId) {
  const meter = meterById(meterId);
  const names = meter.pulse === 4 ? ['', 'e', '&', 'a'] : ['', '&'];
  const out = [];
  for (let i = 0; i < meter.slots; i += 1) {
    const beat = Math.floor(i / meter.pulse) + 1;
    const sub = i % meter.pulse;
    out.push(sub === 0 ? String(beat) : names[sub]);
  }
  return out;
}

/* --- drawing ------------------------------------------------------------ */

function slotWeight(index, pulse) {
  if (index % pulse === 0) return 1;
  if (index % 2 === 0) return 0.65;
  return 0.4;
}

/** Draw `count` distinct slots by weight. */
function weightedSlots(size, count, pulse, rng, fixed = []) {
  const chosen = new Set(fixed);
  const pool = [];
  for (let i = 0; i < size; i += 1) if (!chosen.has(i)) pool.push(i);
  while (chosen.size < count && pool.length) {
    const total = pool.reduce((sum, i) => sum + slotWeight(i, pulse), 0);
    let roll = rng() * total;
    let picked = pool.length - 1;
    for (let k = 0; k < pool.length; k += 1) {
      roll -= slotWeight(pool[k], pulse);
      if (roll <= 0) { picked = k; break; }
    }
    chosen.add(pool[picked]);
    pool.splice(picked, 1);
  }
  return [...chosen].sort((a, b) => a - b);
}

function problemsOf(flags, density) {
  const stats = cellStats(flags.map(on => (on ? 'chug' : '')), 4);
  const problems = [];
  const restPossible = flags.length - stats.attacks >= density.minRest;
  if (restPossible && stats.longestRest < density.minRest) problems.push('rest');
  if (stats.longestRun > density.maxRun) problems.push('run');
  return problems;
}

/**
 * A weighted draw of one bar under the density rules.
 * @returns {boolean[]}
 */
function drawFree(size, pulse, density, rng) {
  const target = Math.max(1, Math.min(size, Math.round(size * density.ratio)));
  let best = null;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const fixed = rng() < 0.85 ? [0] : [];
    const slots = weightedSlots(size, target, pulse, rng, fixed);
    const flags = new Array(size).fill(false);
    for (const i of slots) flags[i] = true;
    const problems = problemsOf(flags, density);
    if (!problems.length) return flags;
    if (!best || problems.length < best.problems.length) best = { flags, problems };
  }
  return best ? best.flags : new Array(size).fill(false);
}

function drawGallop(size, pulse, density, rng) {
  const flags = new Array(size).fill(false);
  const full = density.id === 'dense' ? 0.9 : density.id === 'medium' ? 0.7 : 0.45;
  for (let start = 0; start < size; start += 4) {
    const roll = rng();
    if (roll < full) {
      flags[start] = true;
      if (start + 2 < size) flags[start + 2] = true;
      if (start + 3 < size) flags[start + 3] = true;
    } else if (roll < full + 0.2 || start === 0) {
      flags[start] = true;
    }
  }
  return flags;
}

function drawCell332(size, pulse, density, rng) {
  const flags = new Array(size).fill(false);
  for (let i = 0; i < size; i += 1) {
    const at = i % 8;
    if (at === 0 || at === 3 || at === 6) flags[i] = true;
  }
  if (density.id === 'sparse') {
    // Drop one attack per cell, never the first slot.
    for (let start = 0; start < size; start += 8) {
      const drop = rng() < 0.5 ? start + 3 : start + 6;
      if (drop < size && drop !== 0) flags[drop] = false;
    }
  }
  if (density.id === 'dense') {
    for (let i = 0; i < size; i += 1) {
      const at = i % 8;
      if ((at === 2 || at === 5) && rng() < 0.6) flags[i] = true;
    }
  }
  return flags;
}

function drawBurst(size, pulse, density, rng) {
  const flags = new Array(size).fill(false);
  flags[0] = true;
  const burst = Math.max(2, Math.min(size - 2, Math.round(size * density.ratio * 0.6) + 1));
  for (let i = size - burst; i < size; i += 1) flags[i] = true;
  if (density.id !== 'sparse' && rng() < 0.5) {
    const mid = Math.min(size - burst - 1, pulse * 2);
    if (mid > 0) flags[mid] = true;
  }
  return flags;
}

function drawBreakdown(size, pulse, density, rng) {
  const flags = new Array(size).fill(false);
  const beats = [];
  for (let i = 0; i < size; i += pulse) beats.push(i);
  const keep = density.id === 'dense' ? beats
    : density.id === 'medium' ? beats.filter((_, k) => k !== 1)
      : beats.filter((_, k) => k % 2 === 0);
  for (const i of keep) flags[i] = true;

  // One attack breaks the expectation the beats set.
  const roll = rng();
  const last = keep[keep.length - 1];
  if (roll < 0.34 && last + 2 < size) {
    flags[last] = false;
    flags[last + 2] = true;
  } else if (roll < 0.67 && 2 < size) {
    flags[2] = true;
  } else if (last - 1 > 0) {
    flags[last] = false;
    flags[last - 1] = true;
  }
  return flags;
}

const DRAWERS = {
  free: drawFree,
  gallop: drawGallop,
  cell332: drawCell332,
  burst: drawBurst,
  breakdown: drawBreakdown,
};

/**
 * Give each attack a role.
 * @param {boolean[]} flags
 * @param {number} pulse
 * @param {number} noteShare 0 to 1, the share of attacks that become notes
 * @param {() => number} rng
 * @returns {string[]}
 */
export function assignRoles(flags, pulse, noteShare, rng) {
  const cells = flags.map(on => (on ? 'chug' : ''));
  const attacks = [];
  flags.forEach((on, i) => { if (on) attacks.push(i); });
  if (!attacks.length) return cells;

  const wanted = Math.round(attacks.length * clampShare(noteShare));
  const scored = attacks.map((slot) => {
    const followedByRest = slot + 1 >= flags.length || !flags[slot + 1];
    const offbeat = slot % pulse !== 0;
    return { slot, score: (followedByRest ? 2 : 0) + (offbeat ? 1 : 0) + rng() * 1.5 };
  });
  scored.sort((a, b) => b.score - a.score);
  for (const item of scored.slice(0, wanted)) cells[item.slot] = 'note';

  const last = attacks[attacks.length - 1];
  const restAfter = flags.length - 1 - last;
  if (restAfter >= 2 && rng() < 0.35) cells[last] = 'stab';
  return cells;
}

function drawBar({ meter, density, shape, noteShare }, rng) {
  const drawer = DRAWERS[shape.id] || drawFree;
  const flags = drawer(meter.slots, meter.pulse, density, rng);
  return assignRoles(flags, meter.pulse, noteShare, rng);
}

/** Bar two from bar one, by pairing. */
function pairBar(first, pairing, draw, meter, rng) {
  if (pairing.id === 'repeat') return first.slice();
  if (pairing.id === 'fresh') return draw(rng);
  if (pairing.id === 'displace') return displaceCells(first, 2);
  // Answer: keep the bar and redraw the last quarter of it.
  const tail = Math.max(meter.pulse, Math.round(meter.slots / 4));
  const cut = meter.slots - tail;
  const fresh = draw(rng);
  const out = first.slice(0, cut).concat(fresh.slice(cut));
  if (out.slice(cut).join('') === first.slice(cut).join('')) {
    // The redraw landed on the same ending. Flip the last attack to a rest,
    // or add one, so the answer differs from the question.
    const lastAttack = out.slice(cut).map((c, i) => (c ? cut + i : -1)).filter(i => i >= 0).pop();
    if (lastAttack != null) out[lastAttack] = '';
    else out[meter.slots - 2] = 'note';
  }
  return out;
}

/**
 * Draw a cadence.
 * @param {Object} [settings] see DEFAULT_SETTINGS; `seed` fixes the draw
 * @returns {Object} the cadence
 */
export function generateCadence(settings = {}) {
  const meter = meterById(settings.meter);
  const density = densityById(settings.density);
  const shape = shapeById(settings.shape);
  const pairing = pairingById(settings.pairing);
  const bars = clampBars(settings.bars ?? DEFAULT_SETTINGS.bars);
  const noteShare = clampShare(settings.noteShare ?? DEFAULT_SETTINGS.noteShare);
  const seed = settings.seed ? String(settings.seed) : randomSeed();
  const rng = createRng(seed);

  const draw = r => drawBar({ meter, density, shape, noteShare }, r);
  const first = draw(rng);
  let cells = first;
  for (let b = 1; b < bars; b += 1) {
    cells = cells.concat(pairBar(first, pairing, draw, meter, rng));
  }

  return {
    meter: meter.id,
    bars,
    cells,
    seed,
    density: density.id,
    shape: shape.id,
    pairing: pairing.id,
    noteShare,
  };
}

/* --- mutations ---------------------------------------------------------- */

/** The cells moved later by `steps` slots. The list wraps. */
export function displaceCells(cells, steps = 1) {
  const list = Array.isArray(cells) ? cells : [];
  const size = list.length;
  if (!size) return [];
  const out = new Array(size).fill('');
  list.forEach((cell, i) => {
    if (cell) out[(((i + steps) % size) + size) % size] = cell;
  });
  return out;
}

function withCells(cadence, cells) {
  return { ...cadence, cells };
}

/** Every attack moved later by `steps` slots, bar by bar. */
export function displaceCadence(cadence, steps = 1) {
  const meter = meterById(cadence.meter);
  let cells = [];
  for (let b = 0; b < cadence.bars; b += 1) {
    cells = cells.concat(displaceCells(barCells(cadence, b), steps));
  }
  return withCells(cadence, cells);
}

/** Every bar read backwards. */
export function reverseCadence(cadence) {
  let cells = [];
  for (let b = 0; b < cadence.bars; b += 1) {
    cells = cells.concat(barCells(cadence, b).slice().reverse());
  }
  return withCells(cadence, cells);
}

/**
 * Remove about one attack in three. The first slot of each bar stays.
 * @param {Object} cadence
 * @param {() => number} rng
 */
export function thinCadence(cadence, rng = Math.random) {
  const meter = meterById(cadence.meter);
  const cells = cadence.cells.slice();
  const attacks = [];
  cells.forEach((cell, i) => { if (cell && i % meter.slots !== 0) attacks.push(i); });
  const drop = shuffle(attacks, rng).slice(0, Math.max(1, Math.round(attacks.length / 3)));
  for (const i of drop) cells[i] = '';
  return withCells(cadence, cells);
}

/**
 * Add attacks on empty eighth-note slots, about one in three of them.
 * @param {Object} cadence
 * @param {() => number} rng
 */
export function thickenCadence(cadence, rng = Math.random) {
  const cells = cadence.cells.slice();
  const empty = [];
  cells.forEach((cell, i) => { if (!cell && i % 2 === 0) empty.push(i); });
  const add = shuffle(empty, rng).slice(0, Math.max(1, Math.round(empty.length / 3)));
  for (const i of add) cells[i] = 'chug';
  return withCells(cadence, cells);
}

/**
 * Redraw the ending of the last bar, so the phrase answers itself.
 * @param {Object} cadence
 * @param {() => number} rng
 */
export function answerCadence(cadence, rng = Math.random) {
  const meter = meterById(cadence.meter);
  const density = densityById(cadence.density);
  const shape = shapeById(cadence.shape);
  const last = cadence.bars - 1;
  const bar = barCells(cadence, last);
  const draw = r => drawBar({ meter, density, shape, noteShare: cadence.noteShare }, r);
  const answered = pairBar(bar, pairingById('answer'), draw, meter, rng);
  const cells = cadence.cells.slice(0, last * meter.slots).concat(answered);
  return withCells(cadence, cells);
}

/** Give every attack a new role. The rhythm stays. */
export function rerollRoles(cadence, rng = Math.random) {
  const meter = meterById(cadence.meter);
  const flags = cadence.cells.map(Boolean);
  return withCells(cadence, assignRoles(flags, meter.pulse, cadence.noteShare, rng));
}

/**
 * Change one slot. A rest becomes a chug, a chug a note, a note a stab, and a
 * stab a rest.
 */
export function cycleCell(cadence, index) {
  const cells = cadence.cells.slice();
  if (index < 0 || index >= cells.length) return cadence;
  const order = ['', ...ROLES];
  const at = order.indexOf(cells[index]);
  cells[index] = order[(at + 1) % order.length];
  return withCells(cadence, cells);
}

/**
 * Move the cadence into another meter. A shorter bar drops its last slots,
 * and a longer bar gains rests. That is the metric mutation: take an eighth
 * note out of 4/4 and the riff is in 7/8.
 */
export function changeMeter(cadence, meterId) {
  const from = meterById(cadence.meter);
  const to = meterById(meterId);
  if (from.id === to.id) return cadence;
  let cells = [];
  for (let b = 0; b < cadence.bars; b += 1) {
    const bar = barCells(cadence, b).slice(0, to.slots);
    while (bar.length < to.slots) bar.push('');
    cells = cells.concat(bar);
  }
  return { ...cadence, meter: to.id, cells };
}

/** Set the bar count. New bars copy the last bar; dropped bars go away. */
export function setBars(cadence, bars) {
  const meter = meterById(cadence.meter);
  const wanted = clampBars(bars);
  if (wanted === cadence.bars) return cadence;
  let cells = cadence.cells.slice(0, Math.min(wanted, cadence.bars) * meter.slots);
  const last = barCells(cadence, cadence.bars - 1);
  while (cells.length < wanted * meter.slots) cells = cells.concat(last);
  return { ...cadence, bars: wanted, cells };
}

/**
 * A cadence read back from storage. A bad value falls back to a fresh draw.
 * @param {*} raw
 * @returns {Object}
 */
export function normalizeCadence(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.cells)) {
    return generateCadence();
  }
  const meter = meterById(raw.meter);
  const bars = clampBars(raw.bars);
  const cells = raw.cells.slice(0, meter.slots * bars).map(cell => (ROLES.includes(cell) ? cell : ''));
  while (cells.length < meter.slots * bars) cells.push('');
  return {
    meter: meter.id,
    bars,
    cells,
    seed: typeof raw.seed === 'string' ? raw.seed : randomSeed(),
    density: densityById(raw.density).id,
    shape: shapeById(raw.shape).id,
    pairing: pairingById(raw.pairing).id,
    noteShare: clampShare(raw.noteShare ?? DEFAULT_SETTINGS.noteShare),
  };
}

/** The settings of a cadence, for the next draw. */
export function settingsOf(cadence) {
  return {
    meter: cadence.meter,
    bars: cadence.bars,
    density: cadence.density,
    shape: cadence.shape,
    pairing: cadence.pairing,
    noteShare: cadence.noteShare,
  };
}
