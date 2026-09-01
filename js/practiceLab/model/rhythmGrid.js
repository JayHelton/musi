// The attack grid of Composition Lab.
//
// The grid holds rhythm and nothing else. One bar of 4/4 sixteenth notes gives
// sixteen slots, and each slot is on or off. The player designs the rhythm
// first and assigns scale degrees after. That separation is the point: a
// rhythm the player chose beats a rhythm that fell out of a pitch pattern.
//
// The randomiser works under constraints, so an exercise can ask for six
// attacks with a three-slot rest and one offbeat attack and get a grid that
// really meets that brief.
//
// This module is pure. It touches no screen, no clock, and no audio.

/** The grid sizes the lab offers. Sixteen slots is one bar of sixteenths. */
export const GRID_SIZES = [8, 12, 16, 24, 32];

/** The default grid: one bar of 4/4 sixteenth notes. */
export const DEFAULT_SLOTS = 16;

/** Slots per beat in the default grid. Slot 0, 4, 8, and 12 are the beats. */
export const SLOTS_PER_BEAT = 4;

/**
 * A grid of empty slots.
 * @param {number} [slots]
 * @returns {boolean[]}
 */
export function createGrid(slots = DEFAULT_SLOTS) {
  const size = GRID_SIZES.includes(slots) ? slots : DEFAULT_SLOTS;
  return new Array(size).fill(false);
}

/** A copy of a grid. The Motif Lab keeps one copy per variant. */
export function copyGrid(grid) {
  return Array.isArray(grid) ? grid.slice() : createGrid();
}

/**
 * A grid with one slot flipped.
 * @param {boolean[]} grid
 * @param {number} index
 * @returns {boolean[]} a new grid
 */
export function toggleSlot(grid, index) {
  const next = copyGrid(grid);
  if (index < 0 || index >= next.length) return next;
  next[index] = !next[index];
  return next;
}

/** A grid of the same size with every slot off. */
export function clearGrid(grid) {
  return createGrid(Array.isArray(grid) ? grid.length : DEFAULT_SLOTS);
}

/** True when the slot falls on a beat of the bar. */
export function isDownbeat(index, slotsPerBeat = SLOTS_PER_BEAT) {
  return index % slotsPerBeat === 0;
}

/**
 * The picture of a grid, such as "# . . # | # . . .".
 * @param {boolean[]} grid
 * @param {{on?: string, off?: string, slotsPerBeat?: number}} [options]
 * @returns {string}
 */
export function describeGrid(grid, { on = '■', off = '□', slotsPerBeat = SLOTS_PER_BEAT } = {}) {
  if (!Array.isArray(grid) || !grid.length) return '';
  const cells = grid.map(slot => (slot ? on : off));
  const groups = [];
  for (let i = 0; i < cells.length; i += slotsPerBeat) {
    groups.push(cells.slice(i, i + slotsPerBeat).join(' '));
  }
  return groups.join(' | ');
}

/**
 * What a grid contains.
 * @param {boolean[]} grid
 * @param {number} [slotsPerBeat]
 * @returns {{attacks: number, longestRest: number, offbeats: number,
 *   adjacentPairs: number, firstAttack: number, lastAttack: number,
 *   attackSlots: number[]}}
 */
export function gridStats(grid, slotsPerBeat = SLOTS_PER_BEAT) {
  const list = Array.isArray(grid) ? grid : [];
  const attackSlots = [];
  list.forEach((slot, i) => { if (slot) attackSlots.push(i); });

  let longestRest = 0;
  let run = 0;
  for (const slot of list) {
    if (slot) { run = 0; continue; }
    run += 1;
    if (run > longestRest) longestRest = run;
  }

  let adjacentPairs = 0;
  for (let i = 1; i < list.length; i += 1) {
    if (list[i] && list[i - 1]) adjacentPairs += 1;
  }

  const offbeats = attackSlots.filter(i => !isDownbeat(i, slotsPerBeat)).length;

  return {
    attacks: attackSlots.length,
    longestRest,
    offbeats,
    adjacentPairs,
    firstAttack: attackSlots.length ? attackSlots[0] : -1,
    lastAttack: attackSlots.length ? attackSlots[attackSlots.length - 1] : -1,
    attackSlots,
  };
}

/**
 * @typedef {Object} GridConstraints
 * @property {number} [attacks] the exact number of attacks
 * @property {number} [minRest] the shortest run of empty slots the grid must hold
 * @property {boolean} [requireOffbeat] at least one attack away from a beat
 * @property {boolean} [requireAdjacentPair] at least two attacks side by side
 * @property {boolean} [requireDownbeat] an attack on the first slot
 */

/**
 * Read a grid against a brief.
 * @param {boolean[]} grid
 * @param {GridConstraints} [constraints]
 * @param {number} [slotsPerBeat]
 * @returns {{ok: boolean, problems: string[], stats: Object}}
 */
export function checkConstraints(grid, constraints = {}, slotsPerBeat = SLOTS_PER_BEAT) {
  const stats = gridStats(grid, slotsPerBeat);
  const problems = [];

  if (constraints.attacks != null && stats.attacks !== constraints.attacks) {
    problems.push(`The brief asks for ${constraints.attacks} attacks. The grid holds ${stats.attacks}.`);
  }
  if (constraints.minRest != null && stats.longestRest < constraints.minRest) {
    problems.push(`The brief asks for a rest of ${constraints.minRest} slots. The longest rest is ${stats.longestRest}.`);
  }
  if (constraints.requireOffbeat && stats.offbeats < 1) {
    problems.push('The brief asks for at least one attack away from a beat.');
  }
  if (constraints.requireAdjacentPair && stats.adjacentPairs < 1) {
    problems.push('The brief asks for at least one pair of attacks side by side.');
  }
  if (constraints.requireDownbeat && !(grid || [])[0]) {
    problems.push('The brief asks for an attack on the first slot.');
  }

  return { ok: problems.length === 0, problems, stats };
}

/** The brief in words, for the exercise card. */
export function describeConstraints(constraints = {}) {
  const out = [];
  if (constraints.attacks != null) out.push(`${constraints.attacks} attacks.`);
  if (constraints.minRest != null) out.push(`At least one rest of ${constraints.minRest} slots.`);
  if (constraints.requireAdjacentPair) out.push('At least one pair of attacks side by side.');
  if (constraints.requireOffbeat) out.push('At least one attack away from a beat.');
  if (constraints.requireDownbeat) out.push('An attack on the first slot.');
  return out;
}

function shuffle(list, rng) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = out[i];
    out[i] = out[j];
    out[j] = swap;
  }
  return out;
}

/**
 * A grid that meets a brief.
 *
 * The function draws random attack sets and keeps the first that passes the
 * check. It gives up after a bounded number of tries and returns the best grid
 * it drew, so a brief that cannot be met still returns a usable rhythm.
 * @param {Object} options
 * @param {number} [options.slots]
 * @param {GridConstraints} [options.constraints]
 * @param {Function} [options.rng] a function that returns 0 to 1
 * @param {number} [options.tries]
 * @returns {{grid: boolean[], ok: boolean, problems: string[]}}
 */
export function randomGrid({ slots = DEFAULT_SLOTS, constraints = {}, rng = Math.random, tries = 400 } = {}) {
  const size = GRID_SIZES.includes(slots) ? slots : DEFAULT_SLOTS;
  const wanted = constraints.attacks != null
    ? Math.max(1, Math.min(size, constraints.attacks))
    : Math.max(2, Math.round(size / 3));

  const positions = [];
  for (let i = 0; i < size; i += 1) positions.push(i);

  let best = null;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const grid = new Array(size).fill(false);
    const chosen = shuffle(positions, rng).slice(0, wanted);
    for (const index of chosen) grid[index] = true;
    const result = checkConstraints(grid, constraints);
    if (result.ok) return { grid, ok: true, problems: [] };
    if (!best || result.problems.length < best.problems.length) {
      best = { grid, ok: false, problems: result.problems };
    }
  }
  return best || { grid: createGrid(size), ok: false, problems: ['No grid met the brief.'] };
}

/**
 * The degrees a player assigned to the attacks, kept beside the grid.
 * The list holds one entry per attack, in slot order. A resize or an edit of
 * the grid must keep the entries that still have an attack under them.
 * @param {boolean[]} grid
 * @param {Record<number, string>} [pitches] the degree of each slot
 * @returns {Record<number, string>} only the entries that sit on an attack
 */
export function prunePitches(grid, pitches = {}) {
  const out = {};
  (Array.isArray(grid) ? grid : []).forEach((slot, i) => {
    if (slot && pitches[i]) out[i] = pitches[i];
  });
  return out;
}

/**
 * The attack list as a reading line, such as "1 . b2 5".
 * @param {boolean[]} grid
 * @param {Record<number, string>} [pitches]
 * @returns {string}
 */
export function describeAssignment(grid, pitches = {}) {
  const stats = gridStats(grid);
  if (!stats.attacks) return 'No attacks yet.';
  return stats.attackSlots
    .map(slot => `${slot + 1}:${pitches[slot] || '?'}`)
    .join('  ');
}

/* --- transformations ------------------------------------------------- */

/**
 * Move every attack later by a number of slots. The bar wraps.
 * @param {boolean[]} grid
 * @param {number} steps
 * @returns {boolean[]}
 */
export function displaceGrid(grid, steps = 1) {
  const list = Array.isArray(grid) ? grid : [];
  const size = list.length;
  if (!size) return createGrid();
  const out = new Array(size).fill(false);
  list.forEach((slot, i) => {
    if (slot) out[(((i + steps) % size) + size) % size] = true;
  });
  return out;
}

/**
 * Spread the attacks over a wider or narrower span inside the same bar.
 * A factor above 1 expands the rhythm, and below 1 compresses it.
 * @param {boolean[]} grid
 * @param {number} factor
 * @returns {boolean[]}
 */
export function scaleGrid(grid, factor = 2) {
  const list = Array.isArray(grid) ? grid : [];
  const size = list.length;
  if (!size || !Number.isFinite(factor) || factor <= 0) return copyGrid(grid);
  const stats = gridStats(list);
  if (!stats.attacks) return copyGrid(grid);
  const anchor = stats.firstAttack;
  const out = new Array(size).fill(false);
  for (const slot of stats.attackSlots) {
    const moved = anchor + Math.round((slot - anchor) * factor);
    if (moved >= 0 && moved < size) out[moved] = true;
  }
  // An expansion can push every attack but the first out of the bar. Keep the
  // anchor so the result is still a rhythm.
  if (!out.some(Boolean)) out[anchor] = true;
  return out;
}

/** The grid read backwards. */
export function reverseGrid(grid) {
  return (Array.isArray(grid) ? grid : []).slice().reverse();
}
