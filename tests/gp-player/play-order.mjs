// Play-order expansion tests for repeat marks and alternate endings.
// Run: node tests/gp-player/play-order.mjs

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGuitarPro } from '../../js/tab/guitarPro.js';
import { buildPlayOrder } from '../../js/tab/playOrder.js';
import { makeFixtures } from './fixtures/makeFixtures.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, 'fixtures');

function fixtureBytes(name) {
  return readFileSync(join(FIXTURE_DIR, name));
}

function ensureFixtures() {
  if (!existsSync(join(FIXTURE_DIR, 'repeat-endings.gp5'))) {
    makeFixtures();
  }
}

function makeExampleMeasures() {
  return Array.from({ length: 8 }, (_, i) => ({
    startSlot: i,
    endSlot: i + 1,
    startBeat: i * 4,
    endBeat: (i + 1) * 4,
    repeat:
      i === 1
        ? { open: true, closeCount: null, endings: null }
        : i === 3
          ? { open: false, closeCount: 2, endings: null }
          : i === 4
            ? { open: false, closeCount: null, endings: [1] }
            : i === 5
              ? { open: false, closeCount: null, endings: [2] }
              : null,
  }));
}

ensureFixtures();

// Empty measures.
const empty = buildPlayOrder([]);
assert.deepEqual(empty, {
  passes: [],
  barOrder: [],
  flattened: false,
  warnings: [],
});

// An 8 bar score with an intro bar, a repeat, and two alternate endings that
// follow the close bar. A close count of 2 plays the section two times, so
// ending 1 sounds on pass 1 and ending 2 sounds on pass 2.
//
// Note: the worked example table in data-model.md shows three passes of the
// body. That table disagrees with its own close-count rule and with guarantee
// 4 in contracts/score-timeline.md. This suite follows the contract.
const exampleMeasures = makeExampleMeasures();
const example = buildPlayOrder(exampleMeasures);
const exampleBarOrder = [0, 1, 2, 3, 4, 1, 2, 3, 5, 6, 7];
assert.deepEqual(example.barOrder, exampleBarOrder, 'worked example barOrder');
assert.equal(example.flattened, false);
assert.equal(example.passes.length, exampleBarOrder.length);
assert.equal(example.passes[0].index, 0);
assert.equal(example.passes[0].barIndex, 0);
assert.equal(example.passes[0].passIndex, 0);
assert.equal(example.passes[0].endingNumber, null);
assert.equal(example.passes[0].startQuarter, 0);
assert.equal(example.passes[0].endQuarter, 4);
assert.equal(example.passes[4].barIndex, 4);
assert.equal(example.passes[4].endingNumber, 1);
assert.equal(example.passes[8].barIndex, 5);
assert.equal(example.passes[8].endingNumber, 2);
// The body sounds two times, so bar 2 carries pass index 0 then pass index 1.
assert.deepEqual(
  example.passes.filter((p) => p.barIndex === 2).map((p) => p.passIndex),
  [0, 1],
  'body pass count',
);
assert.equal(example.passes[9].barIndex, 6);
assert.equal(example.passes[9].startQuarter, 36);
assert.equal(example.passes[10].endQuarter, 44);

// maxPasses guard stops expansion and adds a warning.
const capped = buildPlayOrder(exampleMeasures, { maxPasses: 5 });
assert.equal(capped.passes.length, 5);
assert.ok(
  capped.warnings.some((w) => w.toLowerCase().includes('maxpasses')),
  'maxPasses warning',
);

// Two sections one after the other. Each section keeps its own play count.
const twoSections = buildPlayOrder([
  { startBeat: 0, endBeat: 4, repeat: { open: true, closeCount: null, endings: null } },
  { startBeat: 4, endBeat: 8, repeat: null },
  { startBeat: 8, endBeat: 12, repeat: { open: false, closeCount: 2, endings: null } },
  { startBeat: 12, endBeat: 16, repeat: { open: true, closeCount: null, endings: null } },
  { startBeat: 16, endBeat: 20, repeat: null },
  { startBeat: 20, endBeat: 24, repeat: { open: false, closeCount: 3, endings: null } },
]);
assert.deepEqual(
  twoSections.barOrder,
  [0, 1, 2, 0, 1, 2, 3, 4, 5, 3, 4, 5, 3, 4, 5],
  'two sequential sections',
);

// Fixture: repeat-endings.gp5 and repeat-endings.gp — both parse paths.
// Guitar Pro puts the close mark on the last bar of ending 1, so bar 3 holds
// ending 1 and the close mark, and bar 4 holds ending 2.
const expectedRepeatBarOrder = [0, 1, 2, 3, 0, 1, 2, 4];
for (const name of ['repeat-endings.gp5', 'repeat-endings.gp']) {
  const parsed = await parseGuitarPro(fixtureBytes(name));
  const order = buildPlayOrder(parsed.tracks[0].model.measures);
  assert.deepEqual(order.barOrder, expectedRepeatBarOrder, `${name} barOrder`);
  const taken = order.passes.filter((p) => p.endingNumber != null);
  assert.deepEqual(
    taken.map((p) => [p.barIndex, p.endingNumber]),
    [[3, 1], [4, 2]],
    `${name} endings in order`,
  );
}

// Fixture: nested-repeat.gp5 — flatten with warning.
const nested = await parseGuitarPro(fixtureBytes('nested-repeat.gp5'));
const nestedOrder = buildPlayOrder(nested.tracks[0].model.measures);
assert.equal(nestedOrder.flattened, true, 'nested-repeat flattened flag');
assert.ok(
  nestedOrder.warnings.some((w) => w.toLowerCase().includes('flatten')),
  'nested-repeat flatten warning',
);
assert.deepEqual(nestedOrder.barOrder, [0, 1, 2, 3, 4], 'nested-repeat linear barOrder');
assert.equal(nestedOrder.passes.length, 5);

// Fixture: repeat-8bar.gp5 — the 8 bar section sounds two times.
const repeat8 = await parseGuitarPro(fixtureBytes('repeat-8bar.gp5'));
const repeat8Order = buildPlayOrder(repeat8.tracks[0].model.measures);
assert.deepEqual(
  repeat8Order.barOrder,
  [0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7],
  'repeat-8bar barOrder',
);
assert.equal(repeat8Order.passes[15].endQuarter, 64, 'repeat-8bar total quarters');

console.log('gp-player play-order: ok');
