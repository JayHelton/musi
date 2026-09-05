/**
 * Zero-dependency Node tests for Riff Spark.
 *
 * The feature keeps its rules in pure functions with no screen, no clock, and
 * no audio, so this runner reads them directly. The views, the bank, the
 * saved state, and the audio ports touch the window and stay out of here.
 *
 * Run: node tests/spark/run.mjs
 */

import assert from 'node:assert/strict';

import { createRng, hashSeed, randomSeed, pickOne, shuffle } from '../../js/spark/rng.js';
import {
  METERS, DEFAULT_METER, ROLES, ROLE_MARKS, ROLE_WORDS, DENSITIES, SHAPES, PAIRINGS,
  DEFAULT_SETTINGS, meterById, densityById, shapeById, pairingById,
  cellStats, cadenceStats, barCells, describeCadence, countLine, assignRoles,
  generateCadence, displaceCells, displaceCadence, reverseCadence, thinCadence,
  thickenCadence, answerCadence, rerollRoles, cycleCell, changeMeter, setBars,
  normalizeCadence, settingsOf,
} from '../../js/spark/cadenceModel.js';
import {
  PALETTES, DEFAULT_PEDAL_SETTINGS, RATIO_MIN, RATIO_MAX, paletteById,
  paletteSemitones, colorOf, allColors, generatePedal, noteAbove, basePitchMidi,
  eventMidi, describePedal, attackLine, normalizePedal,
} from '../../js/spark/pedalModel.js';
import {
  DECKS, deckById, cardsOf, drawCard, drawBrief, intervalCards, DRILL_STEPS,
  drillTotalMinutes, DENSITY_ARCS, DENSITY_STEPS,
} from '../../js/spark/promptDeck.js';
import { createSparkPlayer } from '../../js/spark/sparkPlayer.js';
import {
  INTERVAL_DEGREES, TRITONE_DEGREE, degreeById, degreeBySemitones, degreeOrTritone,
} from '../../js/reference/intervalTable.js';
import { findPresetByName } from '../../js/tunings.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

/** A one-bar 4/4 cadence built by hand, so a check reads against a known bar. */
function handCadence(cells, extra = {}) {
  const bars = Math.max(1, Math.ceil(cells.length / 16));
  const padded = cells.slice();
  while (padded.length < bars * 16) padded.push('');
  return {
    meter: '4/4', bars, cells: padded, seed: 'hand', density: 'medium', shape: 'free',
    pairing: 'answer', noteShare: 0.3, ...extra,
  };
}

/* ------------------------------------------------------------------ */
console.log('The seeded random source');

test('the same seed gives the same sequence', () => {
  const a = createRng('riff');
  const b = createRng('riff');
  const seqA = Array.from({ length: 20 }, () => a());
  const seqB = Array.from({ length: 20 }, () => b());
  assert.deepEqual(seqA, seqB);
  const c = createRng('other');
  const seqC = Array.from({ length: 20 }, () => c());
  assert.notDeepEqual(seqA, seqC);
  const n1 = createRng(42);
  const n2 = createRng(42);
  assert.equal(n1(), n2());
});

test('every value sits in [0, 1)', () => {
  const rng = createRng('range');
  for (let i = 0; i < 5000; i += 1) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `value ${v} is out of range`);
  }
});

test('a hashed seed is stable and fits 32 bits', () => {
  assert.equal(hashSeed('riff'), hashSeed('riff'));
  assert.notEqual(hashSeed('riff'), hashSeed('riffs'));
  const h = hashSeed('riff');
  assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xFFFFFFFF);
  assert.equal(hashSeed(''), hashSeed(undefined));
  assert.equal(hashSeed(''), 2166136261);
});

test('a random seed is six characters from the readable alphabet', () => {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  for (let i = 1; i <= 50; i += 1) {
    const seed = randomSeed(createRng(i));
    assert.equal(seed.length, 6, `seed ${seed}`);
    for (const ch of seed) assert.ok(alphabet.includes(ch), `seed ${seed} uses ${ch}`);
  }
  assert.equal(randomSeed(createRng(7)), randomSeed(createRng(7)));
  assert.equal(randomSeed().length, 6);
});

test('a shuffle keeps the members and changes the order', () => {
  const list = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = shuffle(list, createRng('mix'));
  assert.deepEqual([...out].sort((a, b) => a - b), list);
  assert.deepEqual(list, [1, 2, 3, 4, 5, 6, 7, 8], 'the input changed');
  assert.notDeepEqual(out, list);
  assert.deepEqual(shuffle([], createRng('x')), []);
  assert.deepEqual(shuffle(list, createRng('mix')), out);
});

test('pickOne draws from the list and nothing from nothing', () => {
  const list = ['a', 'b', 'c'];
  const rng = createRng('pick');
  for (let i = 0; i < 50; i += 1) assert.ok(list.includes(pickOne(list, rng)));
  assert.equal(pickOne([], rng), undefined);
  assert.equal(pickOne(null, rng), undefined);
});

/* ------------------------------------------------------------------ */
console.log('The cadence model: tables');

test('every meter has a sane slot count and pulse', () => {
  assert.ok(METERS.length >= 5);
  const ids = new Set();
  for (const meter of METERS) {
    assert.ok(!ids.has(meter.id), `${meter.id} appears twice`);
    ids.add(meter.id);
    assert.ok(meter.slots >= 8 && meter.slots <= 32, `${meter.id} has ${meter.slots} slots`);
    assert.ok([2, 4].includes(meter.pulse), `${meter.id} has pulse ${meter.pulse}`);
    assert.equal(meter.slots % meter.pulse, 0, `${meter.id} does not divide by its pulse`);
    assert.ok(meter.label, `${meter.id} has no label`);
  }
  assert.equal(meterById('4/4').slots, 16);
  assert.equal(meterById('7/8').slots, 14);
  assert.equal(meterById('7/8').pulse, 2);
  assert.equal(meterById('nonsense').id, DEFAULT_METER);
});

test('the roles, densities, shapes, and pairings are complete', () => {
  assert.deepEqual(ROLES, ['chug', 'note', 'stab']);
  for (const role of ['', ...ROLES]) assert.equal(typeof ROLE_MARKS[role], 'string');
  for (const role of ROLES) assert.ok(ROLE_WORDS[role].length > 3);
  assert.deepEqual(DENSITIES.map(d => d.id), ['sparse', 'medium', 'dense']);
  for (const density of DENSITIES) {
    assert.ok(density.ratio > 0 && density.ratio < 1);
    assert.ok(density.minRest >= 1 && density.maxRun >= 1);
  }
  assert.deepEqual(SHAPES.map(s => s.id), ['free', 'gallop', 'cell332', 'burst', 'breakdown']);
  assert.deepEqual(PAIRINGS.map(p => p.id), ['answer', 'displace', 'repeat', 'fresh']);
  for (const item of [...SHAPES, ...PAIRINGS]) assert.ok(item.blurb.length > 5, `${item.id} has no blurb`);
  assert.equal(densityById('none').id, 'medium');
  assert.equal(shapeById('none').id, 'free');
  assert.equal(pairingById('none').id, 'answer');
  assert.ok(METERS.some(m => m.id === DEFAULT_SETTINGS.meter));
});

/* ------------------------------------------------------------------ */
console.log('The cadence model: drawing');

test('a fixed seed draws the same cadence twice', () => {
  for (const shape of SHAPES) {
    for (const density of DENSITIES) {
      const settings = { seed: 'same', shape: shape.id, density: density.id, bars: 2 };
      const a = generateCadence(settings);
      const b = generateCadence(settings);
      assert.deepEqual(a, b, `${shape.id} ${density.id}`);
      assert.equal(a.seed, 'same');
    }
  }
  assert.notDeepEqual(generateCadence({ seed: 'one' }).cells, generateCadence({ seed: 'two' }).cells);
});

test('a draw without a seed still carries one', () => {
  const cadence = generateCadence();
  assert.equal(cadence.seed.length, 6);
  assert.equal(cadence.cells.length, 16);
  assert.deepEqual(generateCadence({ seed: cadence.seed }).cells, cadence.cells);
});

test('the cells fill slots times bars for every meter and bar count', () => {
  for (const meter of METERS) {
    for (let bars = 1; bars <= 4; bars += 1) {
      for (const shape of SHAPES) {
        const cadence = generateCadence({ seed: `fill-${bars}`, meter: meter.id, bars, shape: shape.id });
        assert.equal(cadence.cells.length, meter.slots * bars, `${meter.id} x ${bars} ${shape.id}`);
        assert.equal(cadence.bars, bars);
        assert.equal(cadence.meter, meter.id);
        for (const cell of cadence.cells) {
          assert.ok(cell === '' || ROLES.includes(cell), `${meter.id} holds ${JSON.stringify(cell)}`);
        }
      }
    }
  }
});

test('the bar count clamps to one through four', () => {
  assert.equal(generateCadence({ seed: 'b', bars: 0 }).bars, 1);
  assert.equal(generateCadence({ seed: 'b', bars: 9 }).bars, 4);
  assert.equal(generateCadence({ seed: 'b', bars: 'nope' }).bars, 1);
  assert.equal(generateCadence({ seed: 'b', noteShare: 4 }).noteShare, 1);
  assert.equal(generateCadence({ seed: 'b', noteShare: -1 }).noteShare, 0);
});

test('the first slot usually carries an attack', () => {
  let hits = 0;
  for (let seed = 1; seed <= 100; seed += 1) {
    if (generateCadence({ seed: `down-${seed}`, shape: 'free' }).cells[0]) hits += 1;
  }
  assert.ok(hits >= 70, `only ${hits} of 100 free draws start on an attack`);
});

test('a sparse draw keeps a rest of three slots', () => {
  let kept = 0;
  for (let seed = 1; seed <= 100; seed += 1) {
    const cadence = generateCadence({ seed: `sparse-${seed}`, shape: 'free', density: 'sparse' });
    if (cellStats(cadence.cells).longestRest >= 3) kept += 1;
  }
  assert.ok(kept >= 90, `only ${kept} of 100 sparse draws keep a rest of three`);
});

test('a dense draw carries more attacks than a sparse one', () => {
  let dense = 0;
  let sparse = 0;
  for (let seed = 1; seed <= 50; seed += 1) {
    dense += cellStats(generateCadence({ seed: `dd-${seed}`, density: 'dense' }).cells).attacks;
    sparse += cellStats(generateCadence({ seed: `dd-${seed}`, density: 'sparse' }).cells).attacks;
  }
  assert.ok(dense / 50 > sparse / 50, `dense ${dense / 50} vs sparse ${sparse / 50}`);
  assert.ok(dense / 50 >= 8, `dense averages ${dense / 50}`);
  assert.ok(sparse / 50 <= 6, `sparse averages ${sparse / 50}`);
});

test('the 3+3+2 cell lands on its own slots', () => {
  for (let seed = 1; seed <= 10; seed += 1) {
    const cadence = generateCadence({ seed: `cell-${seed}`, shape: 'cell332', density: 'medium', meter: '4/4' });
    assert.deepEqual(cellStats(cadence.cells).attackSlots, [0, 3, 6, 8, 11, 14], `seed cell-${seed}`);
  }
  const sparse = generateCadence({ seed: 'cell-sparse', shape: 'cell332', density: 'sparse' });
  assert.equal(sparse.cells[0] !== '', true);
  assert.equal(cellStats(sparse.cells).attacks, 4);
});

test('the burst shape holds, waits, and runs to the bar line', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    for (const density of DENSITIES) {
      const cadence = generateCadence({ seed: `burst-${seed}`, shape: 'burst', density: density.id });
      const stats = cellStats(cadence.cells);
      assert.ok(cadence.cells[0], `seed burst-${seed} ${density.id} has no attack on slot 0`);
      assert.equal(stats.lastAttack, 15, `seed burst-${seed} ${density.id} does not end on the last slot`);
      assert.ok(stats.longestRun >= 2, `seed burst-${seed} ${density.id} has no run`);
      // The run at the end is unbroken.
      let run = 0;
      for (let i = 15; i >= 0 && cadence.cells[i]; i -= 1) run += 1;
      assert.ok(run >= 2, `seed burst-${seed} ${density.id} ends with a run of ${run}`);
    }
  }
});

test('a sparse breakdown stays sparse', () => {
  for (let seed = 1; seed <= 30; seed += 1) {
    const cadence = generateCadence({ seed: `bd-${seed}`, shape: 'breakdown', density: 'sparse' });
    const stats = cellStats(cadence.cells);
    assert.ok(stats.attacks <= 5, `seed bd-${seed} has ${stats.attacks} attacks`);
    assert.ok(stats.attacks >= 1);
  }
});

test('the gallop shape starts on the downbeat', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const cadence = generateCadence({ seed: `gallop-${seed}`, shape: 'gallop' });
    assert.ok(cadence.cells[0], `seed gallop-${seed} starts on a rest`);
  }
});

test('the repeat pairing copies bar one', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const cadence = generateCadence({ seed: `rep-${seed}`, bars: 2, pairing: 'repeat' });
    assert.deepEqual(barCells(cadence, 1), barCells(cadence, 0), `seed rep-${seed}`);
  }
  const four = generateCadence({ seed: 'rep-4', bars: 4, pairing: 'repeat' });
  for (let b = 1; b < 4; b += 1) assert.deepEqual(barCells(four, b), barCells(four, 0));
});

test('the displace pairing moves bar one an eighth note later', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const cadence = generateCadence({ seed: `disp-${seed}`, bars: 2, pairing: 'displace' });
    assert.deepEqual(barCells(cadence, 1), displaceCells(barCells(cadence, 0), 2), `seed disp-${seed}`);
  }
});

test('the answer pairing keeps three beats and changes the fourth', () => {
  for (let seed = 1; seed <= 50; seed += 1) {
    const cadence = generateCadence({ seed: `ans-${seed}`, bars: 2, pairing: 'answer', meter: '4/4' });
    const one = barCells(cadence, 0);
    const two = barCells(cadence, 1);
    assert.deepEqual(two.slice(0, 12), one.slice(0, 12), `seed ans-${seed} changes the head`);
    assert.ok(two.slice(12).some((cell, i) => cell !== one[12 + i]),
      `seed ans-${seed} keeps the tail: ${describeCadence(cadence)}`);
  }
});

test('the fresh pairing draws a bar of its own', () => {
  let different = 0;
  for (let seed = 1; seed <= 20; seed += 1) {
    const cadence = generateCadence({ seed: `fresh-${seed}`, bars: 2, pairing: 'fresh' });
    if (barCells(cadence, 1).join() !== barCells(cadence, 0).join()) different += 1;
  }
  assert.ok(different >= 15, `only ${different} of 20 fresh bars differ`);
});

test('assignRoles keeps the rhythm and honors the note share', () => {
  const flags = [true, false, true, true, false, false, true, false, true, false, false, false, true, false, false, false];
  const none = assignRoles(flags, 4, 0, createRng('roles'));
  assert.deepEqual(none.map(Boolean), flags);
  assert.equal(none.includes('note'), false);
  const all = assignRoles(flags, 4, 1, createRng('roles'));
  assert.deepEqual(all.map(Boolean), flags);
  assert.equal(all.filter(c => c === 'note').length >= 5, true);
  assert.deepEqual(assignRoles(new Array(16).fill(false), 4, 0.5, createRng('r')), new Array(16).fill(''));
  const half = assignRoles(flags, 4, 0.5, createRng('half'));
  assert.equal(half.filter(c => c === 'note').length, 3);
});

/* ------------------------------------------------------------------ */
console.log('The cadence model: reading');

test('the text line groups by pulse and splits bars on a double bar', () => {
  const cells = ['chug', '', 'note', 'chug', 'chug', '', '', '', 'stab', '', '', '', '', '', '', '',
    'chug', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'note'];
  const cadence = handCadence(cells);
  assert.equal(describeCadence(cadence),
    'X - o X | X - - - | # - - - | - - - -  ||  X - - - | - - - - | - - - - | - - - o');
  assert.equal(ROLE_MARKS.chug, 'X');
  assert.equal(ROLE_MARKS.note, 'o');
  assert.equal(ROLE_MARKS.stab, '#');
  assert.equal(ROLE_MARKS[''], '-');
  const seven = { ...handCadence(['chug', '', 'note', '']), meter: '7/8', bars: 1 };
  seven.cells = ['chug', '', 'note', '', '', '', '', '', '', '', '', '', '', 'stab'];
  assert.equal(describeCadence(seven), 'X - | o - | - - | - - | - - | - - | - #');
  assert.equal(describeCadence(cadence, { marks: { '': '.', chug: 'c', note: 'n', stab: 's' } }).slice(0, 7), 'c . n c');
});

test('the count line reads like a drummer', () => {
  const four = countLine('4/4');
  assert.equal(four.length, 16);
  assert.deepEqual(four.slice(0, 5), ['1', 'e', '&', 'a', '2']);
  assert.deepEqual(four.slice(12), ['4', 'e', '&', 'a']);
  const seven = countLine('7/8');
  assert.equal(seven.length, 14);
  for (let i = 0; i < 14; i += 1) {
    assert.equal(seven[i], i % 2 === 0 ? String(i / 2 + 1) : '&', `slot ${i}`);
  }
  assert.equal(countLine('5/4').length, 20);
});

test('the stats count what the bar holds', () => {
  const cells = ['chug', 'chug', '', '', '', '', 'note', '', '', '', '', '', '', '', 'stab', ''];
  const stats = cellStats(cells, 4);
  assert.equal(stats.slots, 16);
  assert.equal(stats.attacks, 4);
  assert.equal(stats.rests, 12);
  assert.equal(stats.chugs, 2);
  assert.equal(stats.notes, 1);
  assert.equal(stats.stabs, 1);
  assert.equal(stats.longestRest, 7);
  assert.equal(stats.longestRun, 2);
  assert.equal(stats.offbeats, 3);
  assert.deepEqual(stats.attackSlots, [0, 1, 6, 14]);
  assert.equal(stats.firstAttack, 0);
  assert.equal(stats.lastAttack, 14);
  const empty = cellStats([]);
  assert.equal(empty.attacks, 0);
  assert.equal(empty.firstAttack, -1);
  assert.equal(cellStats(null).slots, 0);
});

test('the cadence stats use the pulse of the meter', () => {
  const cells = ['chug', 'chug', 'note', '', 'chug', '', '', '', 'stab', '', '', '', '', '', ''];
  const seven = { meter: '7/8', bars: 1, cells: cells.slice(0, 14) };
  assert.equal(cadenceStats(seven).offbeats, 1);
  const four = { meter: '4/4', bars: 1, cells: cells.concat(['']) };
  assert.equal(cadenceStats(four).offbeats, 2);
  assert.equal(cadenceStats(null).attacks, 0);
});

test('barCells slices one bar at a time', () => {
  const cadence = generateCadence({ seed: 'bars', bars: 3, meter: '3/4' });
  assert.equal(barCells(cadence, 0).length, 12);
  assert.deepEqual(barCells(cadence, 2), cadence.cells.slice(24, 36));
  assert.deepEqual(barCells(cadence, 5), []);
});

/* ------------------------------------------------------------------ */
console.log('The cadence model: mutations');

test('displacing wraps inside each bar', () => {
  assert.deepEqual(displaceCells(['chug', '', '', 'note'], 1), ['note', 'chug', '', '']);
  assert.deepEqual(displaceCells(['chug', '', '', 'note'], -1), ['', '', 'note', 'chug']);
  assert.deepEqual(displaceCells([], 3), []);
  const cadence = generateCadence({ seed: 'wrap', bars: 2, pairing: 'fresh', density: 'dense' });
  const moved = displaceCadence(cadence, 2);
  assert.equal(moved.cells.length, cadence.cells.length);
  for (let b = 0; b < 2; b += 1) {
    assert.deepEqual(barCells(moved, b), displaceCells(barCells(cadence, b), 2), `bar ${b}`);
  }
  assert.deepEqual(displaceCadence(displaceCadence(cadence, 5), -5).cells, cadence.cells);
  assert.notEqual(moved, cadence);
});

test('reversing reads each bar backwards', () => {
  const cadence = generateCadence({ seed: 'rev', bars: 2, pairing: 'fresh' });
  const back = reverseCadence(cadence);
  for (let b = 0; b < 2; b += 1) {
    assert.deepEqual(barCells(back, b), barCells(cadence, b).slice().reverse(), `bar ${b}`);
  }
  assert.deepEqual(reverseCadence(back).cells, cadence.cells);
});

test('thinning drops an attack and never the downbeat', () => {
  for (let seed = 1; seed <= 30; seed += 1) {
    const cadence = generateCadence({ seed: `thin-${seed}`, density: 'dense', bars: 2, pairing: 'fresh' });
    const before = cellStats(cadence.cells);
    if (before.attacks < 2) continue;
    const thinned = thinCadence(cadence, createRng(`t${seed}`));
    const after = cellStats(thinned.cells);
    assert.ok(after.attacks < before.attacks, `seed thin-${seed} dropped nothing`);
    assert.equal(thinned.cells.length, cadence.cells.length);
    for (const b of [0, 16]) assert.equal(thinned.cells[b], cadence.cells[b], `seed thin-${seed} touched slot ${b}`);
    thinned.cells.forEach((cell, i) => {
      assert.ok(cell === '' || cell === cadence.cells[i], `seed thin-${seed} changed a role at ${i}`);
    });
  }
  const two = handCadence(['chug', '', '', '', 'chug']);
  assert.equal(cellStats(thinCadence(two, createRng('x')).cells).attacks, 1);
});

test('thickening only adds chugs on eighth-note slots', () => {
  for (let seed = 1; seed <= 30; seed += 1) {
    const cadence = generateCadence({ seed: `thick-${seed}`, density: 'sparse' });
    const thick = thickenCadence(cadence, createRng(`k${seed}`));
    assert.equal(thick.cells.length, cadence.cells.length);
    let added = 0;
    thick.cells.forEach((cell, i) => {
      if (cell === cadence.cells[i]) return;
      added += 1;
      assert.equal(cadence.cells[i], '', `seed thick-${seed} replaced an attack at ${i}`);
      assert.equal(cell, 'chug', `seed thick-${seed} added ${cell} at ${i}`);
      assert.equal(i % 2, 0, `seed thick-${seed} added on the odd slot ${i}`);
    });
    assert.ok(added >= 1, `seed thick-${seed} added nothing`);
  }
});

test('answering redraws the last beat of the last bar', () => {
  for (let seed = 1; seed <= 30; seed += 1) {
    const cadence = generateCadence({ seed: `answer-${seed}`, bars: 2, pairing: 'repeat' });
    const answered = answerCadence(cadence, createRng(`a${seed}`));
    assert.deepEqual(answered.cells.slice(0, 28), cadence.cells.slice(0, 28), `seed answer-${seed}`);
    assert.ok(answered.cells.slice(28).some((c, i) => c !== cadence.cells[28 + i]), `seed answer-${seed} kept the tail`);
  }
});

test('rerolling the roles keeps the rhythm', () => {
  const cadence = generateCadence({ seed: 'roles', density: 'dense' });
  const rolled = rerollRoles(cadence, createRng('again'));
  assert.deepEqual(rolled.cells.map(Boolean), cadence.cells.map(Boolean));
  for (const cell of rolled.cells) assert.ok(cell === '' || ROLES.includes(cell));
});

test('a tap cycles a slot through rest, chug, note, stab, rest', () => {
  let cadence = handCadence([]);
  const seen = [cadence.cells[3]];
  for (let i = 0; i < 4; i += 1) {
    cadence = cycleCell(cadence, 3);
    seen.push(cadence.cells[3]);
  }
  assert.deepEqual(seen, ['', 'chug', 'note', 'stab', '']);
  assert.equal(cadence.cells.filter(Boolean).length, 0);
  assert.equal(cycleCell(cadence, 99), cadence);
  assert.equal(cycleCell(cadence, -1), cadence);
});

test('a meter change keeps the head of each bar', () => {
  const cadence = generateCadence({ seed: 'meter', bars: 2, density: 'dense', pairing: 'fresh' });
  const seven = changeMeter(cadence, '7/8');
  assert.equal(seven.meter, '7/8');
  assert.equal(seven.cells.length, 28);
  for (let b = 0; b < 2; b += 1) {
    assert.deepEqual(barCells(seven, b), barCells(cadence, b).slice(0, 14), `bar ${b}`);
  }
  const back = changeMeter(seven, '4/4');
  assert.equal(back.cells.length, 32);
  for (let b = 0; b < 2; b += 1) {
    assert.deepEqual(barCells(back, b).slice(0, 14), barCells(seven, b), `bar ${b}`);
    assert.deepEqual(barCells(back, b).slice(14), ['', ''], `bar ${b} pads wrong`);
  }
  assert.equal(changeMeter(cadence, '4/4'), cadence);
  assert.equal(changeMeter(cadence, 'nonsense'), cadence);
});

test('the bar count grows by copying and shrinks by cropping', () => {
  const cadence = generateCadence({ seed: 'grow', bars: 2, pairing: 'fresh' });
  const three = setBars(cadence, 3);
  assert.equal(three.bars, 3);
  assert.equal(three.cells.length, 48);
  assert.deepEqual(three.cells.slice(0, 32), cadence.cells);
  assert.deepEqual(barCells(three, 2), barCells(cadence, 1));
  const one = setBars(three, 1);
  assert.equal(one.bars, 1);
  assert.deepEqual(one.cells, barCells(cadence, 0));
  assert.equal(setBars(cadence, 2), cadence);
  assert.equal(setBars(cadence, 99).bars, 4);
  assert.equal(setBars(cadence, 0).bars, 1);
});

test('a stored cadence repairs itself', () => {
  const repaired = normalizeCadence({
    meter: 'zzz', bars: 2, cells: ['chug', 'bad', 5, 'note', null], density: 'huge', shape: 'odd',
    pairing: 'none', noteShare: 7, seed: 'kept',
  });
  assert.equal(repaired.meter, '4/4');
  assert.equal(repaired.bars, 2);
  assert.equal(repaired.cells.length, 32);
  assert.deepEqual(repaired.cells.slice(0, 5), ['chug', '', '', 'note', '']);
  assert.equal(repaired.density, 'medium');
  assert.equal(repaired.shape, 'free');
  assert.equal(repaired.pairing, 'answer');
  assert.equal(repaired.noteShare, 1);
  assert.equal(repaired.seed, 'kept');
  const cropped = normalizeCadence({ meter: '7/8', bars: 1, cells: new Array(40).fill('chug') });
  assert.equal(cropped.cells.length, 14);
  assert.equal(normalizeCadence({ cells: [], seed: 9 }).seed.length, 6);
  for (const garbage of [null, undefined, 'text', 42, [], { cells: 'no' }]) {
    const fresh = normalizeCadence(garbage);
    assert.equal(fresh.cells.length, 16, `garbage ${JSON.stringify(garbage)}`);
    assert.equal(fresh.seed.length, 6);
    assert.deepEqual(generateCadence({ seed: fresh.seed }).cells, fresh.cells);
  }
});

test('a round trip through storage keeps a draw', () => {
  const cadence = generateCadence({ seed: 'store', bars: 3, meter: '5/4', density: 'dense', shape: 'gallop', pairing: 'displace' });
  assert.deepEqual(normalizeCadence(JSON.parse(JSON.stringify(cadence))), cadence);
});

test('the settings of a draw feed the next draw', () => {
  const cadence = generateCadence({ seed: 'set', bars: 2, meter: '7/8', density: 'sparse', shape: 'burst', pairing: 'repeat', noteShare: 0.5 });
  const settings = settingsOf(cadence);
  assert.deepEqual(settings, { meter: '7/8', bars: 2, density: 'sparse', shape: 'burst', pairing: 'repeat', noteShare: 0.5 });
  assert.deepEqual(generateCadence({ ...settings, seed: 'set' }), cadence);
  assert.deepEqual(Object.keys(settings).sort(), Object.keys(DEFAULT_SETTINGS).sort());
});

/* ------------------------------------------------------------------ */
console.log('The pedal model');

test('every named palette gives its own distances', () => {
  for (const palette of PALETTES) {
    if (palette.id === 'context') continue;
    assert.deepEqual(paletteSemitones(palette.id), palette.semitones, palette.id);
    assert.notEqual(paletteSemitones(palette.id), palette.semitones, `${palette.id} hands out its own list`);
    for (const s of palette.semitones) assert.ok(s >= 1 && s <= 11, `${palette.id} holds ${s}`);
    assert.ok(palette.blurb.length > 5, `${palette.id} has no blurb`);
  }
  assert.equal(paletteById('nothing').id, 'phrygian');
  assert.deepEqual(paletteSemitones('nothing'), [1, 3, 8]);
});

test('the context palette reads the shared scale', () => {
  assert.deepEqual(paletteSemitones('context', 'Phrygian Dominant'), [1, 4, 5, 7, 8, 10]);
  assert.deepEqual(paletteSemitones('context', 'Major (Ionian)'), [2, 4, 5, 7, 9, 11]);
  assert.deepEqual(paletteSemitones('context', 'no such scale'), [3, 7, 10]);
  assert.deepEqual(paletteSemitones('context'), [3, 7, 10]);
});

test('every distance has a color, the tritone included', () => {
  assert.equal(colorOf(6).id, 'b5');
  assert.equal(colorOf(1).id, 'b2');
  assert.equal(colorOf(0).id, '1');
  assert.equal(colorOf(18).id, 'b5');
  assert.equal(colorOf(-1).id, '7');
  const rows = allColors();
  assert.equal(rows.length, 11);
  assert.deepEqual(rows.map(r => r.semitones), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.ok(rows.some(r => r.id === 'b5'));
  assert.ok(rows.every(r => r.id !== '1'));
});

test('a fixed seed draws the same pedal twice', () => {
  const cadence = generateCadence({ seed: 'pedal', bars: 2, density: 'dense' });
  const a = generatePedal({ cadence, semitones: [1, 3, 8], seed: 'pedal', anchors: 3 });
  const b = generatePedal({ cadence, semitones: [1, 3, 8], seed: 'pedal', anchors: 3 });
  assert.deepEqual(a, b);
  assert.equal(a.seed, 'pedal');
  const c = generatePedal({ cadence, semitones: [1, 3, 8], seed: 'other', anchors: 3 });
  assert.notDeepEqual(a.events, c.events);
  assert.equal(generatePedal({ cadence, semitones: [1] }).seed.length, 6);
});

test('the pedal plays one event per attack and keeps the downbeat on the root', () => {
  for (let seed = 1; seed <= 60; seed += 1) {
    const shape = SHAPES[seed % SHAPES.length].id;
    const density = DENSITIES[seed % DENSITIES.length].id;
    const cadence = generateCadence({ seed: `pe-${seed}`, bars: 1 + (seed % 3), shape, density, pairing: 'fresh' });
    const palette = [1, 3, 6, 8, 11];
    const pedal = generatePedal({ cadence, semitones: palette, seed: `ps-${seed}`, anchors: 3 });
    const stats = cellStats(cadence.cells);
    assert.equal(pedal.events.length, stats.attacks, `seed pe-${seed}`);
    assert.deepEqual(pedal.events.map(e => e.slot), stats.attackSlots, `seed pe-${seed} events sit on the wrong slots`);
    if (cadence.cells[0]) {
      assert.equal(pedal.events[0].slot, 0, `seed pe-${seed}`);
      assert.equal(pedal.events[0].semitones, 0, `seed pe-${seed} leaves the root on slot 0`);
    }
    for (const event of pedal.events) {
      assert.equal(event.role, cadence.cells[event.slot], `seed pe-${seed} slot ${event.slot} role`);
      if (event.semitones) assert.ok(pedal.anchors.includes(event.semitones), `seed pe-${seed} plays ${event.semitones} off the anchors`);
    }
    assert.ok(pedal.anchors.length <= 3 && pedal.anchors.length >= 1, `seed pe-${seed} has ${pedal.anchors.length} anchors`);
    for (const a of pedal.anchors) assert.ok(palette.includes(a), `seed pe-${seed} anchor ${a} is off the palette`);
    assert.deepEqual(pedal.anchors, [...pedal.anchors].sort((x, y) => x - y));
  }
});

test('the anchors never outnumber the palette or the setting', () => {
  const cadence = generateCadence({ seed: 'anchors', density: 'dense' });
  assert.equal(generatePedal({ cadence, semitones: [1, 3], anchors: 4, seed: 'a' }).anchors.length, 2);
  assert.equal(generatePedal({ cadence, semitones: [1, 3, 6, 8, 11], anchors: 9, seed: 'a' }).anchors.length, 4);
  assert.equal(generatePedal({ cadence, semitones: [1, 3, 6], anchors: 0, seed: 'a' }).anchors.length, 1);
  assert.equal(generatePedal({ cadence, semitones: [1, 3, 6], seed: 'a' }).anchors.length, DEFAULT_PEDAL_SETTINGS.anchors);
  assert.deepEqual(generatePedal({ cadence, semitones: [], seed: 'a' }).anchors.every(a => [1, 3, 8].includes(a)), true);
});

test('the ratio clamps to the range the tool allows', () => {
  const cadence = generateCadence({ seed: 'ratio', density: 'dense' });
  assert.equal(generatePedal({ cadence, semitones: [1], ratio: 5, seed: 'r' }).ratio, RATIO_MAX);
  assert.equal(generatePedal({ cadence, semitones: [1], ratio: 0, seed: 'r' }).ratio, RATIO_MIN);
  assert.equal(generatePedal({ cadence, semitones: [1], ratio: 0.4, seed: 'r' }).ratio, 0.4);
  assert.equal(generatePedal({ cadence, semitones: [1], ratio: 'no', seed: 'r' }).ratio, DEFAULT_PEDAL_SETTINGS.ratio);
  assert.equal(RATIO_MIN, 0.1);
  assert.equal(RATIO_MAX, 0.6);
  const high = generatePedal({ cadence, semitones: [1, 3], ratio: 0.6, seed: 'r' });
  const low = generatePedal({ cadence, semitones: [1, 3], ratio: 0.1, seed: 'r' });
  assert.ok(high.events.filter(e => e.semitones).length > low.events.filter(e => e.semitones).length);
});

test('a stab plays the root an octave up when asked', () => {
  const cells = ['chug', '', 'chug', '', 'stab', '', '', '', 'chug', '', 'note', '', 'stab', '', '', ''];
  const cadence = handCadence(cells);
  const up = generatePedal({ cadence, semitones: [1, 3], seed: 'stab', octaveUp: true });
  const down = generatePedal({ cadence, semitones: [1, 3], seed: 'stab', octaveUp: false });
  assert.equal(up.octaveUp, true);
  assert.equal(down.octaveUp, false);
  for (const event of up.events) assert.equal(event.octave, event.role === 'stab' ? 1 : 0, `up slot ${event.slot}`);
  for (const event of down.events) assert.equal(event.octave, 0, `down slot ${event.slot}`);
  assert.equal(generatePedal({ cadence, semitones: [1], seed: 'stab' }).octaveUp, DEFAULT_PEDAL_SETTINGS.octaveUp);
  let seen = 0;
  for (let seed = 1; seed <= 100; seed += 1) {
    const drawn = generateCadence({ seed: `stab-${seed}` });
    if (!drawn.cells.includes('stab')) continue;
    seen += 1;
    const pedal = generatePedal({ cadence: drawn, semitones: [1, 3], seed: 'z', octaveUp: true });
    for (const event of pedal.events) assert.equal(event.octave, event.role === 'stab' ? 1 : 0, `seed stab-${seed}`);
  }
  assert.ok(seen > 0, 'no draw carried a stab');
});

test('bar two of a repeat mirrors bar one, apart from its last interruption', () => {
  // The model reads: "Bar two answers bar one: the same notes, and a new last
  // interruption." So the interruption slots of bar two are those of bar one,
  // and only the last of them may carry another degree.
  for (let seed = 1; seed <= 100; seed += 1) {
    const cadence = generateCadence({ seed: `rep${seed}`, bars: 2, pairing: 'repeat' });
    const pedal = generatePedal({ cadence, semitones: [1, 3, 8], seed: `rep${seed}` });
    const one = pedal.events.filter(e => e.slot < 16);
    const two = pedal.events.filter(e => e.slot >= 16);
    const slotsOne = one.filter(e => e.semitones).map(e => e.slot);
    const slotsTwo = two.filter(e => e.semitones).map(e => e.slot - 16);
    assert.deepEqual(slotsTwo, slotsOne,
      `seed rep${seed}: ${describeCadence(cadence)} interrupts bar one at ${slotsOne} and bar two at ${slotsTwo}`);
    const changed = two.filter((e, i) => e.semitones !== one[i].semitones).map(e => e.slot - 16);
    assert.ok(changed.length <= 1, `seed rep${seed} changes ${changed}`);
    if (changed.length) assert.equal(changed[0], slotsOne[slotsOne.length - 1], `seed rep${seed} changes a middle note`);
  }
});

test('the interruptions bar two shares with bar one keep their degree', () => {
  // The weaker rule the code does keep: an interruption that lands on the
  // same slot in both bars plays the same degree, except the last one.
  for (let seed = 1; seed <= 100; seed += 1) {
    const cadence = generateCadence({ seed: `rep${seed}`, bars: 2, pairing: 'repeat' });
    const pedal = generatePedal({ cadence, semitones: [1, 3, 8], seed: `rep${seed}` });
    const one = new Map(pedal.events.filter(e => e.slot < 16).map(e => [e.slot, e]));
    const two = pedal.events.filter(e => e.slot >= 16 && e.semitones);
    const last = two.length ? two[two.length - 1].slot - 16 : -1;
    for (const event of two) {
      const match = one.get(event.slot - 16);
      if (!match.semitones || event.slot - 16 === last) continue;
      assert.equal(event.semitones, match.semitones, `seed rep${seed} slot ${event.slot - 16}`);
    }
  }
});

test('a note above the tonic spells with the shared table', () => {
  assert.equal(noteAbove('A', 1), 'Bb');
  assert.equal(noteAbove('A', 6), 'Eb');
  assert.equal(noteAbove('E', 8), 'C');
  assert.equal(noteAbove('C', 11), 'B');
  assert.equal(noteAbove('A', 0), 'A');
  assert.equal(noteAbove('Bb', 1), 'Cb');
  assert.equal(noteAbove('H', 1), '');
});

test('the base pitch sits on the lowest string the tonic allows', () => {
  assert.ok(findPresetByName('E Standard'), 'E Standard is not in the catalog');
  assert.ok(findPresetByName('Drop C'), 'Drop C is not in the catalog');
  assert.equal(basePitchMidi('E', 'E Standard'), 40);
  assert.equal(basePitchMidi('A', 'E Standard'), 45);
  assert.equal(basePitchMidi('C', 'Drop C'), 36);
  assert.equal(basePitchMidi('C', 'E Standard'), 48);
  assert.equal(basePitchMidi('E', 'not a tuning'), 40);
  assert.equal(basePitchMidi('D', 'not a tuning'), 50);
  assert.equal(basePitchMidi('E'), 40);
  assert.equal(basePitchMidi('nonsense', 'E Standard'), 40);
});

test('an event turns into MIDI with its distance and its octave', () => {
  assert.equal(eventMidi({ semitones: 0, octave: 0 }, 40), 40);
  assert.equal(eventMidi({ semitones: 1, octave: 0 }, 40), 41);
  assert.equal(eventMidi({ semitones: 6, octave: 1 }, 40), 58);
  assert.equal(eventMidi({}, 45), 45);
});

test('the note line reads like the cadence line', () => {
  const cells = ['chug', '', 'chug', 'chug', 'note', '', '', '', 'stab', '', '', '', '', '', '', ''];
  const cadence = handCadence(cells);
  const pedal = {
    seed: 'x', anchors: [1, 3], ratio: 0.3, octaveUp: true,
    events: [
      { slot: 0, semitones: 0, role: 'chug', octave: 0 },
      { slot: 2, semitones: 0, role: 'chug', octave: 0 },
      { slot: 3, semitones: 1, role: 'chug', octave: 0 },
      { slot: 4, semitones: 3, role: 'note', octave: 0 },
      { slot: 8, semitones: 0, role: 'stab', octave: 1 },
    ],
  };
  assert.equal(describePedal(cadence, pedal, 'A'), "A - A Bb | C - - - | A' - - - | - - - -");
  assert.equal(describePedal(cadence, pedal, 'A', { degrees: true }), "1 - 1 b2 | b3 - - - | 1' - - - | - - - -");
  assert.equal(attackLine(pedal, 'A'), "A A Bb C A'");
  assert.equal(attackLine(pedal, 'A', { degrees: true }), "1 1 b2 b3 1'");
  assert.equal(attackLine(null, 'A'), '');
  const two = handCadence(cells.concat(['note']));
  const twoBar = { ...pedal, events: pedal.events.concat([{ slot: 16, semitones: 6, role: 'note', octave: 0 }]) };
  assert.equal(describePedal(two, twoBar, 'A').split('  ||  ').length, 2);
  assert.ok(describePedal(two, twoBar, 'A').endsWith('Eb - - - | - - - - | - - - - | - - - -'));
  const drawn = generateCadence({ seed: 'line' });
  const drawnPedal = generatePedal({ cadence: drawn, semitones: [1, 3], seed: 'line' });
  const line = describePedal(drawn, drawnPedal, 'E');
  const marks = describeCadence(drawn);
  assert.equal(line.split(' | ').length, marks.split(' | ').length);
  assert.equal(line.split(' ').filter(t => t === '-').length, marks.split(' ').filter(t => t === '-').length);
});

test('a stored pedal repairs itself or goes away', () => {
  for (const garbage of [null, undefined, 'text', 42, [], {}, { events: 'no' }]) {
    assert.equal(normalizePedal(garbage), null, `garbage ${JSON.stringify(garbage)}`);
  }
  const repaired = normalizePedal({
    seed: 7, anchors: [1, 'x', 3], ratio: 9, octaveUp: false,
    events: [
      { slot: '2', semitones: 13, role: 'weird', octave: 'yes' },
      { slot: -3, semitones: -1, role: 'note', octave: 0 },
      null, { slot: 'nope' },
    ],
  });
  assert.equal(repaired.seed.length, 6);
  assert.deepEqual(repaired.anchors, [1, 3]);
  assert.equal(repaired.ratio, RATIO_MAX);
  assert.equal(repaired.octaveUp, false);
  assert.deepEqual(repaired.events, [
    { slot: 2, semitones: 1, role: 'chug', octave: 1 },
    { slot: 0, semitones: 11, role: 'note', octave: 0 },
  ]);
  assert.equal(normalizePedal({ events: [] }).octaveUp, true);
  const cadence = generateCadence({ seed: 'round' });
  const pedal = generatePedal({ cadence, semitones: [1, 3, 8], seed: 'round' });
  assert.deepEqual(normalizePedal(JSON.parse(JSON.stringify(pedal))), pedal);
});

/* ------------------------------------------------------------------ */
console.log('The prompt decks');

test('every deck holds at least five distinct, complete cards', () => {
  assert.ok(DECKS.length >= 5);
  for (const deck of DECKS) {
    const cards = cardsOf(deck.id);
    assert.ok(cards.length >= 5, `${deck.id} has ${cards.length} cards`);
    const ids = new Set(cards.map(c => c.id));
    assert.equal(ids.size, cards.length, `${deck.id} repeats a card id`);
    for (const card of cards) {
      assert.ok(card.id && card.title.trim().length > 0, `${deck.id} has a card with no title`);
      assert.ok(card.body.trim().length > 5, `${deck.id}: ${card.id} has no body`);
      assert.ok(!/undefined|\[object/.test(card.title + card.body), `${deck.id}: ${card.id} is broken`);
    }
    assert.ok(deck.label && deck.blurb, `${deck.id} has no label`);
  }
  assert.equal(deckById('nothing').id, DECKS[0].id);
  assert.equal(cardsOf('nothing'), cardsOf(DECKS[0].id));
});

test('a draw never returns the card just seen', () => {
  for (const deck of DECKS) {
    const cards = cardsOf(deck.id);
    if (cards.length < 2) continue;
    const rng = createRng(`draw-${deck.id}`);
    const exclude = cards[0].id;
    for (let i = 0; i < 50; i += 1) {
      const card = drawCard(deck.id, { rng, exclude });
      assert.ok(card, `${deck.id} drew nothing`);
      assert.notEqual(card.id, exclude, `${deck.id} drew the excluded card`);
      assert.ok(cards.some(c => c.id === card.id), `${deck.id} drew a card from elsewhere`);
    }
  }
  assert.ok(drawCard('restriction', { rng: createRng('x') }).id);
});

test('a brief comes from one seed and walks the four decks in order', () => {
  const brief = drawBrief('brief');
  assert.equal(brief.seed, 'brief');
  assert.deepEqual(brief.cards.map(c => c.deck), ['interval', 'restriction', 'density', 'next']);
  for (const item of brief.cards) {
    assert.ok(cardsOf(item.deck).some(c => c.id === item.card.id), `${item.deck} card is off the deck`);
  }
  assert.deepEqual(drawBrief('brief'), brief);
  assert.notDeepEqual(drawBrief('other').cards.map(c => c.card.id), brief.cards.map(c => c.card.id));
  const unseeded = drawBrief();
  assert.equal(unseeded.seed.length, 6);
  assert.equal(unseeded.cards.length, 4);
});

test('the interval deck holds the eleven colors of the table', () => {
  const cards = intervalCards();
  assert.equal(cards.length, 11);
  assert.deepEqual(cards.map(c => c.id), ['interval-b2', 'interval-2', 'interval-b3', 'interval-3', 'interval-4',
    'interval-b5', 'interval-5', 'interval-b6', 'interval-6', 'interval-b7', 'interval-7']);
  const tritone = cards.find(c => c.id === 'interval-b5');
  assert.ok(tritone.title.includes('Tritone'));
  assert.ok(tritone.body.includes(TRITONE_DEGREE.character));
  assert.equal(tritone.hint, TRITONE_DEGREE.examples[0]);
});

test('the density arcs use only the named steps', () => {
  const ids = new Set(DENSITY_STEPS.map(s => s.id));
  for (const arc of DENSITY_ARCS) {
    assert.ok(arc.length >= 3);
    for (const step of arc) assert.ok(ids.has(step), `${step} is not a density step`);
  }
  const cards = cardsOf('density');
  assert.equal(cards.length, DENSITY_ARCS.length);
  assert.ok(cards[0].title.includes('→'));
});

test('the drill adds up to its own length', () => {
  assert.equal(DRILL_STEPS.length, 6);
  assert.equal(drillTotalMinutes(), 27);
  assert.equal(DRILL_STEPS.reduce((sum, s) => sum + s.minutes, 0), drillTotalMinutes());
  for (const step of DRILL_STEPS) {
    assert.ok(step.id && step.title && step.body, `${step.id} is incomplete`);
    assert.ok(step.minutes > 0);
  }
});

/* ------------------------------------------------------------------ */
console.log('The loop player');

/** An audio port that records every call and lets the test move the clock. */
function fakeAudio(startSec = 10) {
  const calls = [];
  let nowSec = startSec;
  return {
    calls,
    setNow(sec) { nowSec = sec; },
    now: () => nowSec,
    pulse: (when, accent) => calls.push({ kind: 'pulse', when, accent }),
    hit: (when, role) => calls.push({ kind: 'hit', when, role }),
    note: (when, midi, dur, role) => calls.push({ kind: 'note', when, midi, dur, role }),
  };
}

function fakeClock() {
  const log = { set: 0, cleared: 0 };
  return {
    log,
    setInterval() { log.set += 1; return 1; },
    clearInterval() { log.cleared += 1; },
  };
}

function near(a, b, message) {
  assert.ok(Math.abs(a - b) < 1e-9, `${message || ''} ${a} is not ${b}`);
}

const PATTERN = {
  cells: ['chug', '', 'note', '', 'chug', '', '', '', 'stab', '', '', '', 'chug', '', 'note', ''],
  slotsPerBar: 16,
  pulse: 4,
  bpm: 120,
  pulseOn: true,
  voice: 'hits',
};

test('the first slot lands sixty milliseconds out and the rest follow the tempo', () => {
  const audio = fakeAudio(10);
  const clock = fakeClock();
  const player = createSparkPlayer({ audio, clock, lookaheadSec: 10 });
  assert.equal(player.start({ ...PATTERN }), true);
  assert.equal(player.isRunning(), true);
  assert.equal(clock.log.set, 1);
  const hits = audio.calls.filter(c => c.kind !== 'pulse');
  near(hits[0].when, 10.06, 'first slot');
  const slotSec = 60 / 120 / 4;
  near(hits[1].when, 10.06 + 2 * slotSec, 'second attack');
  near(hits[2].when, 10.06 + 4 * slotSec, 'third attack');
  player.stop();
});

test('the pulse clicks on the beat and accents the bar', () => {
  const audio = fakeAudio(0);
  const player = createSparkPlayer({ audio, clock: fakeClock(), lookaheadSec: 0.06 + 17 * 0.125 });
  player.start({ ...PATTERN, cells: PATTERN.cells.concat(PATTERN.cells) });
  const slotSec = 0.125;
  const pulses = audio.calls.filter(c => c.kind === 'pulse');
  const indexOf = when => Math.round((when - 0.06) / slotSec);
  assert.ok(pulses.length >= 4);
  for (const pulse of pulses) {
    const index = indexOf(pulse.when);
    assert.equal(index % 4, 0, `pulse on slot ${index}`);
    assert.equal(pulse.accent, index % 16 === 0, `accent on slot ${index}`);
  }
  assert.deepEqual(pulses.slice(0, 5).map(p => p.accent), [true, false, false, false, true]);
  const first = indexOf(audio.calls[0].when);
  assert.equal(first, 0);
  player.stop();
  const quiet = fakeAudio(0);
  const silent = createSparkPlayer({ audio: quiet, clock: fakeClock(), lookaheadSec: 2 });
  silent.start({ ...PATTERN, pulseOn: false });
  assert.equal(quiet.calls.filter(c => c.kind === 'pulse').length, 0);
  silent.stop();
});

test('a rest schedules nothing', () => {
  const audio = fakeAudio(0);
  const player = createSparkPlayer({ audio, clock: fakeClock(), lookaheadSec: 2 });
  player.start({ ...PATTERN, pulseOn: false });
  const sounds = audio.calls.filter(c => c.kind !== 'pulse');
  assert.equal(sounds.length, 6);
  const slots = sounds.map(c => Math.round((c.when - 0.06) / 0.125));
  assert.deepEqual(slots, [0, 2, 4, 8, 12, 14]);
  assert.deepEqual(sounds.map(c => c.role), ['chug', 'note', 'chug', 'stab', 'chug', 'note']);
  player.stop();
});

test('the notes voice plays MIDI and holds until the next attack', () => {
  const audio = fakeAudio(0);
  const player = createSparkPlayer({ audio, clock: fakeClock(), lookaheadSec: 1.9 });
  const notes = new Map([[0, { midi: 40, role: 'chug' }], [2, { midi: 41, role: 'note' }], [12, { midi: 52, role: 'stab' }]]);
  player.start({ ...PATTERN, pulseOn: false, voice: 'notes', notes });
  const sounds = audio.calls.filter(c => c.kind !== 'pulse');
  const slotSec = 0.125;
  assert.deepEqual(sounds.map(c => c.kind), ['note', 'note', 'hit', 'hit', 'note', 'hit']);
  assert.equal(sounds[0].midi, 40);
  near(sounds[0].dur, 2 * slotSec, 'slot 0 duration');
  assert.equal(sounds[1].midi, 41);
  near(sounds[1].dur, 2 * slotSec, 'slot 2 duration');
  assert.equal(sounds[1].role, 'note');
  assert.equal(sounds[2].role, 'chug');
  assert.equal(sounds[4].midi, 52);
  near(sounds[4].dur, 2 * slotSec, 'slot 12 duration');
  assert.equal(sounds[4].role, 'stab');
  assert.equal(sounds[5].role, 'note');
  player.stop();
  const plain = fakeAudio(0);
  const noMap = createSparkPlayer({ audio: plain, clock: fakeClock(), lookaheadSec: 1.9 });
  noMap.start({ ...PATTERN, pulseOn: false, voice: 'notes' });
  assert.equal(plain.calls.every(c => c.kind === 'hit'), true);
  noMap.stop();
});

test('a slot reaches the screen when its time comes', () => {
  const audio = fakeAudio(0);
  const player = createSparkPlayer({ audio, clock: fakeClock(), lookaheadSec: 0.1 });
  const steps = [];
  player.start({ ...PATTERN }, { onStep: item => steps.push(item) });
  assert.equal(steps.length, 0);
  audio.setNow(0.05);
  player.__tick();
  assert.equal(steps.length, 0, 'a slot arrived early');
  audio.setNow(0.06);
  player.__tick();
  assert.equal(steps.length, 1);
  assert.equal(steps[0].index, 0);
  assert.equal(steps[0].loops, 0);
  assert.equal(steps[0].bar, 0);
  near(steps[0].atSec, 0.06, 'step time');
  audio.setNow(0.06 + 0.125 * 3 + 0.01);
  player.__tick();
  assert.deepEqual(steps.map(s => s.index), [0, 1, 2, 3]);
  player.stop();
});

test('the loop count climbs when the walk wraps', () => {
  const audio = fakeAudio(0);
  const player = createSparkPlayer({ audio, clock: fakeClock(), lookaheadSec: 0.1 });
  const steps = [];
  player.start({ ...PATTERN, cells: ['chug', '', 'note', ''], slotsPerBar: 4 }, { onStep: item => steps.push(item) });
  assert.equal(player.loopCount(), 0);
  for (let t = 0.1; t <= 1.3; t += 0.025) {
    audio.setNow(t);
    player.__tick();
  }
  assert.ok(player.loopCount() >= 2, `loops ${player.loopCount()}`);
  const wraps = steps.filter(s => s.index === 0);
  assert.deepEqual(wraps.slice(0, 3).map(s => s.loops), [0, 1, 2]);
  assert.equal(steps.every(s => s.bar === 0), true);
  player.stop();
});

test('a new cell list of another length restarts the walk', () => {
  const audio = fakeAudio(0);
  const player = createSparkPlayer({ audio, clock: fakeClock(), lookaheadSec: 0.1 });
  const steps = [];
  player.start({ ...PATTERN, pulseOn: false }, { onStep: item => steps.push(item) });
  audio.setNow(0.06 + 0.125 * 5);
  player.__tick();
  assert.equal(steps[steps.length - 1].index, 5);
  player.update({ cells: ['note', '', 'note', ''], slotsPerBar: 4 });
  assert.equal(player.currentPattern().cells.length, 4);
  audio.setNow(0.06 + 0.125 * 7);
  player.__tick();
  const after = steps.slice(6).map(s => s.index);
  assert.deepEqual(after.slice(0, 2), [0, 1]);
  const sameLength = createSparkPlayer({ audio: fakeAudio(0), clock: fakeClock(), lookaheadSec: 0.1 });
  const kept = [];
  sameLength.start({ ...PATTERN, pulseOn: false }, { onStep: item => kept.push(item) });
  sameLength.update({ cells: PATTERN.cells.slice().reverse() });
  audio.setNow(0);
  assert.equal(sameLength.currentPattern().cells[15], 'chug');
  sameLength.stop();
  player.stop();
});

test('a tempo change widens or narrows the spacing', () => {
  const audio = fakeAudio(0);
  const player = createSparkPlayer({ audio, clock: fakeClock(), lookaheadSec: 0.2 });
  player.start({ ...PATTERN, pulseOn: false, cells: new Array(16).fill('chug') });
  assert.equal(audio.calls.length, 2, 'two slots inside the first window');
  player.setBpm(60);
  assert.equal(player.currentPattern().bpm, 60);
  audio.setNow(2);
  player.__tick();
  const times = audio.calls.map(c => c.when);
  near(times[1] - times[0], 60 / 120 / 4, 'spacing before the change');
  // The time of the next slot was fixed when the last one was scheduled,
  // so the new spacing shows from the slot after that.
  near(times[2] - times[1], 60 / 120 / 4, 'the slot already booked');
  near(times[3] - times[2], 60 / 60 / 4, 'spacing after the change');
  near(times[4] - times[3], 60 / 60 / 4, 'spacing stays');
  player.setBpm('nonsense');
  assert.equal(player.currentPattern().bpm, 60);
  player.setBpm(0);
  assert.equal(player.currentPattern().bpm, 60);
  player.stop();
});

test('stopping reports the loops and clears the clock', () => {
  const audio = fakeAudio(0);
  const clock = fakeClock();
  const player = createSparkPlayer({ audio, clock, lookaheadSec: 0.1 });
  let stopped = null;
  player.start({ ...PATTERN }, { onStop: payload => { stopped = payload; } });
  audio.setNow(0.06 + 0.125 * 16);
  player.__tick();
  player.stop();
  assert.ok(stopped, 'onStop did not fire');
  assert.equal(stopped.loops, 1);
  assert.equal(stopped.pattern.cells.length, 16);
  assert.equal(player.isRunning(), false);
  assert.equal(player.currentPattern(), null);
  assert.equal(clock.log.cleared, 1);
  player.stop();
  assert.equal(clock.log.cleared, 1);
  player.__tick();
  assert.equal(player.isRunning(), false);
});

test('an empty pattern does not start', () => {
  const audio = fakeAudio(0);
  const clock = fakeClock();
  const player = createSparkPlayer({ audio, clock });
  assert.equal(player.start({ ...PATTERN, cells: [] }), false);
  assert.equal(player.start(null), false);
  assert.equal(player.start({ cells: 'no' }), false);
  assert.equal(player.isRunning(), false);
  assert.equal(clock.log.set, 0);
  assert.equal(audio.calls.length, 0);
  player.update({ bpm: 90 });
  player.setBpm(90);
  assert.equal(player.currentPattern(), null);
});

test('starting again stops the first run', () => {
  const audio = fakeAudio(0);
  const clock = fakeClock();
  const player = createSparkPlayer({ audio, clock, lookaheadSec: 0.05 });
  let stops = 0;
  player.start({ ...PATTERN }, { onStop: () => { stops += 1; } });
  player.start({ ...PATTERN, bpm: 90 });
  assert.equal(stops, 1);
  assert.equal(clock.log.cleared, 1);
  assert.equal(clock.log.set, 2);
  assert.equal(player.currentPattern().bpm, 90);
  player.stop();
  assert.equal(stops, 1);
});

/* ------------------------------------------------------------------ */
console.log('The tritone in the interval table');

test('the tritone row lives beside the table and not in it', () => {
  assert.equal(TRITONE_DEGREE.id, 'b5');
  assert.equal(TRITONE_DEGREE.semitones, 6);
  assert.equal(TRITONE_DEGREE.letterStep, 4);
  assert.ok(TRITONE_DEGREE.character.length > 3);
  assert.ok(TRITONE_DEGREE.functions.length > 3);
  assert.ok(TRITONE_DEGREE.examples.length >= 2);
  assert.equal(degreeById('b5'), null);
  assert.equal(degreeBySemitones(6), null);
  assert.equal(INTERVAL_DEGREES.length, 11);
  assert.equal(INTERVAL_DEGREES.some(d => d.semitones === 6), false);
});

test('degreeOrTritone covers all twelve distances', () => {
  assert.equal(degreeOrTritone(6), TRITONE_DEGREE);
  assert.equal(degreeOrTritone(3).id, 'b3');
  assert.equal(degreeOrTritone(0).id, '1');
  assert.equal(degreeOrTritone(18), TRITONE_DEGREE);
  assert.equal(degreeOrTritone(-6), TRITONE_DEGREE);
  for (let s = 0; s < 12; s += 1) {
    const row = degreeOrTritone(s);
    assert.equal(row.semitones, s, `distance ${s}`);
    assert.equal(colorOf(s), row, `pedal color ${s}`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
