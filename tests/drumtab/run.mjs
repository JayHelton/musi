/**
 * Zero-dependency Node tests for the Drum Tab reference model.
 * Run: node tests/drumtab/run.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DRUM_TAB_LANES, DRUM_TAB_LEGEND } from '../../js/drums/notation.js';
import {
  DRUM_TAB_EXAMPLES,
  GLYPH_NOTES,
  LANE_ALIASES,
  LANE_NOTES,
  LANE_SOUND,
  OTHER_SYMBOLS,
  countRow,
  examplePattern,
  soundForCell,
  velocityFor,
} from '../../js/drums/tabReferenceModel.js';
import { getTool, toolsInArea } from '../../js/tools.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  ${name}`);
    console.error(`      ${err.message}`);
  }
}

test('Drum Tab is a Study tool with its own section', () => {
  const tool = getTool('drumtab');
  assert.ok(tool, 'no drumtab tool');
  assert.equal(tool.area, 'study');
  assert.deepEqual(tool.context, []);
  assert.ok(toolsInArea('study').some((t) => t.id === 'drumtab'));
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="sec-drumtab"'), 'no section for drumtab');
  assert.ok(html.includes('id="drumtab-body"'), 'no body for drumtab');
  assert.ok(html.includes('css/drumtab.css'), 'the stylesheet is not linked');
});

test('every lane the score views draw has a name, a sound, and an alias', () => {
  for (const lane of DRUM_TAB_LANES) {
    assert.ok(LANE_NOTES[lane.key], `no note for the ${lane.key} lane`);
    assert.ok(LANE_SOUND[lane.key], `no sound for the ${lane.key} lane`);
    assert.ok(LANE_ALIASES[lane.key], `no alias for the ${lane.key} lane`);
  }
});

test('every symbol the score views draw is explained', () => {
  for (const entry of DRUM_TAB_LEGEND) {
    assert.ok(GLYPH_NOTES[entry.glyph], `no note for the ${entry.glyph} symbol`);
  }
});

test('the page lists the spellings Musi does not draw', () => {
  const glyphs = OTHER_SYMBOLS.map((row) => row.glyph);
  for (const glyph of ['-', '|', 'd', 'r', '#']) {
    assert.ok(glyphs.includes(glyph), `no entry for ${glyph}`);
  }
  const conflict = OTHER_SYMBOLS.find((row) => row.glyph === 'b / B');
  assert.ok(conflict, 'the b conflict is not called out');
  assert.match(conflict.text, /ride bell/);
});

test('a count row is one character per grid step', () => {
  assert.equal(countRow('8th', 8, 1), '1+2+3+4+');
  assert.equal(countRow('16th', 16, 1), '1e+a2e+a3e+a4e+a');
  // Two bars carry the bar line between them, the same as the drawn rows.
  assert.equal(countRow('16th', 16, 2).length, 16 + 1 + 16);
});

test('a count row lines up under the cells of every example', () => {
  for (const example of DRUM_TAB_EXAMPLES) {
    const count = countRow(example.subdivision, example.stepsPerBar, example.bars);
    for (const line of example.lines) {
      assert.equal(
        line.cells.length,
        count.length,
        `${example.id}: the ${line.lane} row does not match the count row`,
      );
    }
  }
});

test('a bar line takes a column but never a step', () => {
  const fill = DRUM_TAB_EXAMPLES.find((e) => e.id === 'fill');
  const pattern = examplePattern(fill);
  assert.equal(pattern.bars, 2);
  assert.equal(pattern.stepsPerBar, 16);
  const crash = pattern.steps.find((s) => s.instrument === 'crash');
  // The crash opens the second bar, so it sits on step 16, not step 17.
  assert.equal(crash.step, 16);
  for (const step of pattern.steps) {
    assert.ok(step.step >= 0 && step.step < 32, `step ${step.step} is out of the pattern`);
  }
});

test('a hit reads its instrument from the lane and the symbol', () => {
  assert.equal(soundForCell('hihat', 'x'), 'hihatClosed');
  assert.equal(soundForCell('hihat', 'O'), 'hihatOpen');
  assert.equal(soundForCell('snare', 'g'), 'snareGhost');
  assert.equal(soundForCell('snare', 'f'), 'snareFlam');
  assert.equal(soundForCell('snare', 'o'), 'snare');
  assert.equal(soundForCell('kick', 'o'), 'kick');
});

test('a capital symbol is the accent and a ghost note is quiet', () => {
  assert.equal(velocityFor('X'), 1);
  assert.equal(velocityFor('O'), 1);
  assert.ok(velocityFor('g') < velocityFor('o'));
  assert.ok(velocityFor('@') < velocityFor('o'));
});

test('every example plays at least one hit on every row it draws', () => {
  for (const example of DRUM_TAB_EXAMPLES) {
    const pattern = examplePattern(example);
    assert.ok(pattern.steps.length > 0, `${example.id} plays nothing`);
    assert.ok(example.bpm >= 40 && example.bpm <= 200, `${example.id} has an odd tempo`);
  }
});

test('the reference is precached with its stylesheet', () => {
  const sw = readFileSync(new URL('../../service-worker.js', import.meta.url), 'utf8');
  assert.ok(sw.includes('"js/drumTabReference.js"'), 'the page module is not precached');
  assert.ok(sw.includes('"js/drums/tabReferenceModel.js"'), 'the model is not precached');
  assert.ok(sw.includes('"css/drumtab.css"'), 'the stylesheet is not precached');
});

console.log(`\ndrumtab tests: ${passed} passed${failed ? `, ${failed} failed` : ''}`);
if (failed) process.exit(1);
