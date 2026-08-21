/**
 * Zero-dependency Node tests for the Drum Notation study page.
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
  STICKING_SYMBOLS,
  countRow,
  examplePattern,
  soundForCell,
  velocityFor,
} from '../../js/drums/tabReferenceModel.js';
import {
  DRUM_ARTICULATION_KEY,
  DRUM_NOTATION_KEY,
  DRUM_STAFF_POSITIONS,
  NOTATION_LABELS,
  NOTATION_SOUND,
  NOTE_VALUE_ROWS,
  STICKING_LABELS,
  barsToPattern,
  durationOf,
  noteValueOf,
  normalizeBars,
  staffBarFromEvents,
  staffPositionFor,
  stickingOf,
  voicesFromEvents,
} from '../../js/drums/staffNotation.js';
import { layoutDrumStaff } from '../../js/drums/staffLayout.js';
import { DRUM_STAFF_EXAMPLES, staffExampleBars } from '../../js/drums/tabReferenceModel.js';
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

test('the page splits over the tabs of the tool page', () => {
  const tool = getTool('drumtab');
  assert.ok(tool.modes?.length >= 3, 'a long page needs tabs');
  assert.ok(
    tool.modes.some((mode) => mode.id === tool.defaultMode),
    'the default tab must be one of the tabs',
  );
  const page = readFileSync(new URL('../../js/drumTabReference.js', import.meta.url), 'utf8');
  for (const mode of tool.modes) {
    assert.ok(page.includes(`panel('${mode.id}'`), `no panel for the ${mode.id} tab`);
  }
  // The tab row belongs to the tool-page shell, so the ids must agree.
  assert.ok(page.includes("'tool-page-modes-drumtab'"), 'the page must name the tab row');
});

test('Drum Notation is a Study tool with its own section', () => {
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
    if (!example.sticking) continue;
    assert.equal(
      example.sticking.length,
      count.length,
      `${example.id}: the hand row does not match the count row`,
    );
    for (const glyph of example.sticking) {
      assert.ok('RL-|'.includes(glyph), `${example.id}: ${glyph} is not a hand`);
    }
  }
});

test('a hand row only names a step that some lane strikes', () => {
  for (const example of DRUM_TAB_EXAMPLES) {
    if (!example.sticking) continue;
    for (let i = 0; i < example.sticking.length; i += 1) {
      const hand = example.sticking[i];
      if (hand === '-' || hand === '|') continue;
      const struck = example.lines.some((line) => !'-|'.includes(line.cells[i]));
      assert.ok(struck, `${example.id}: the hand at column ${i} strikes nothing`);
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

// ---------------------------------------------------------- staff notation --

test('every piece the chart names has a place, a sound, and a label', () => {
  for (const row of DRUM_NOTATION_KEY) {
    const place = staffPositionFor(row.name);
    assert.ok(place, `no staff place for ${row.name}`);
    assert.ok(place.voice === 'up' || place.voice === 'down', `${row.name} has no voice`);
    assert.ok(NOTATION_SOUND[row.name], `no sound for ${row.name}`);
    assert.ok(NOTATION_LABELS[row.name], `no label for ${row.name}`);
    assert.ok(row.lines.length === 2, `${row.name} needs a two-line chart label`);
  }
});

test('the staff places follow the standard drum key', () => {
  assert.equal(DRUM_STAFF_POSITIONS.crash.step, -2, 'the crash takes the ledger line above');
  assert.equal(DRUM_STAFF_POSITIONS.hihatClosed.step, -1, 'the hi-hat takes the space above');
  assert.equal(DRUM_STAFF_POSITIONS.ride.step, 0, 'the ride takes the top line');
  assert.equal(DRUM_STAFF_POSITIONS.tomHigh.step, 1);
  assert.equal(DRUM_STAFF_POSITIONS.tomMid.step, 2);
  assert.equal(DRUM_STAFF_POSITIONS.snare.step, 3, 'the snare takes the middle space');
  assert.equal(DRUM_STAFF_POSITIONS.tomFloor.step, 5);
  assert.equal(DRUM_STAFF_POSITIONS.kick.step, 7, 'the kick takes the bottom space');
  assert.equal(DRUM_STAFF_POSITIONS.hihatPedal.step, 9, 'the pedal sits under the staff');
  assert.equal(DRUM_STAFF_POSITIONS.kick.voice, 'down');
  assert.equal(DRUM_STAFF_POSITIONS.hihatPedal.voice, 'down');
  assert.equal(DRUM_STAFF_POSITIONS.snare.voice, 'up');
});

test('a cymbal takes a cross head and a drum takes a round head', () => {
  for (const name of ['crash', 'ride', 'hihatClosed', 'hihatOpen', 'hihatPedal']) {
    assert.equal(DRUM_STAFF_POSITIONS[name].head, 'x', `${name} needs a cross head`);
  }
  for (const name of ['kick', 'snare', 'tomHigh', 'tomMid', 'tomFloor']) {
    assert.equal(DRUM_STAFF_POSITIONS[name].head, 'normal', `${name} needs a round head`);
  }
  assert.equal(DRUM_STAFF_POSITIONS.hihatOpen.open, true, 'an open hi-hat carries a ring');
});

test('a note value and a length name the same note', () => {
  for (const row of NOTE_VALUE_ROWS) {
    const quarters = durationOf(row.value);
    assert.equal(quarters * row.perBar, 4, `${row.name} must fill one 4/4 bar`);
    assert.deepEqual(noteValueOf(quarters), { value: row.value, dots: 0 });
  }
  assert.deepEqual(noteValueOf(1.5), { value: 4, dots: 1 }, 'a dotted quarter is 1.5 beats');
  assert.equal(durationOf(4, 1), 1.5);
});

test('every worked bar fills its own time signature', () => {
  for (const example of DRUM_STAFF_EXAMPLES) {
    const bars = staffExampleBars(example);
    assert.ok(bars.length >= 1, `${example.id} draws no bar`);
    for (const bar of bars) {
      for (const voice of ['up', 'down']) {
        const entries = bar.voices[voice];
        if (!entries.length) continue;
        const total = entries.reduce((sum, entry) => sum + entry.dur, 0);
        assert.ok(
          Math.abs(total - bar.quarters) < 1e-6,
          `${example.id} bar ${bar.index} voice ${voice} holds ${total} of ${bar.quarters} beats`,
        );
      }
    }
  }
});

test('every worked bar plays inside its own grid', () => {
  for (const example of DRUM_STAFF_EXAMPLES) {
    const bars = staffExampleBars(example);
    const pattern = barsToPattern(bars, example.id);
    assert.ok(pattern.steps.length > 0, `${example.id} plays nothing`);
    const limit = pattern.stepsPerBar * pattern.bars;
    for (const step of pattern.steps) {
      assert.ok(step.step >= 0 && step.step < limit, `${example.id} step ${step.step} is out of range`);
    }
    assert.ok(example.bpm >= 40 && example.bpm <= 200, `${example.id} has an odd tempo`);
  }
});

test('the hands take the stems up and the feet take the stems down', () => {
  const events = [
    { start: 0, instrument: 'hihatClosed', duration: 0.5 },
    { start: 0, instrument: 'kick', duration: 1 },
    { start: 0.5, instrument: 'hihatClosed', duration: 0.5 },
    { start: 1, instrument: 'snare', duration: 1, accent: true },
    { start: 2, instrument: 'kick', duration: 1 },
  ];
  const bar = staffBarFromEvents(events, 0, 4, [4, 4]);
  assert.equal(bar.voices.up[0].notes[0].name, 'hihatClosed');
  assert.equal(bar.voices.down[0].notes[0].name, 'kick');
  // The kick lasts one beat, so a rest holds the beat after it.
  assert.equal(bar.voices.down[1].rest, true);
  const accented = bar.voices.up.find((entry) => entry.notes.some((n) => n.accent));
  assert.ok(accented, 'the accent must survive the split');
});

test('a grace stroke marks its note as a flam and takes no column', () => {
  const events = [
    { start: 0, instrument: 'snare', duration: 0.5, grace: true },
    { start: 0, instrument: 'snare', duration: 0.5 },
  ];
  const voices = voicesFromEvents(events, 0, 4);
  assert.equal(voices.up[0].notes.length, 1, 'the grace stroke shares the column of its note');
  assert.equal(voices.up[0].notes[0].flam, true);
});

test('a hit reads its place from the articulation, then from the midi number', () => {
  const byArticulation = voicesFromEvents(
    [{ start: 0, instrument: 'hihatClosed', articulation: 'hihatPedal', duration: 4 }], 0, 4,
  );
  assert.equal(byArticulation.down[0].notes[0].name, 'hihatPedal');
  const byMidi = voicesFromEvents(
    [{ start: 0, instrument: 'snare', midi: 37, duration: 4 }], 0, 4,
  );
  assert.equal(byMidi.up[0].notes[0].name, 'sideStick');
});

test('the layout draws five staff lines and beams a pair of eighth notes', () => {
  const bars = normalizeBars([{
    timeSig: [4, 4],
    voices: {
      up: [
        { dur: 0.5, notes: ['hihatClosed'] },
        { dur: 0.5, notes: ['hihatClosed'] },
        { dur: 1, notes: ['snare'] },
        { dur: 2, notes: ['ride'] },
      ],
      down: [{ dur: 1, notes: ['kick'] }, { dur: 3, rest: true }],
    },
  }]);
  const layout = layoutDrumStaff(bars);
  const roles = layout.elements.reduce((acc, el) => {
    acc[el.role] = (acc[el.role] || 0) + 1;
    return acc;
  }, {});
  assert.equal(roles.staffLine, 5, 'a staff has five lines');
  assert.equal(roles.beam, 1, 'the two eighth notes join under one beam');
  assert.ok(roles.headX >= 2, 'the hi-hat and the ride take cross heads');
  assert.ok(roles.head >= 2, 'the snare and the kick take round heads');
  assert.ok(layout.width > 0 && layout.height > 0);
  assert.ok(layout.columns.length >= 6, 'every entry of both voices gets a column');
});

test('the layout lifts the crash onto a ledger line', () => {
  const bars = normalizeBars([{
    timeSig: [4, 4],
    voices: { up: [{ dur: 4, notes: ['crash'] }], down: [] },
  }]);
  const layout = layoutDrumStaff(bars);
  const ledgers = layout.elements.filter((el) => el.role === 'ledger');
  assert.equal(ledgers.length, 1, 'the crash needs one ledger line');
  assert.ok(ledgers[0].y1 < layout.staffTop, 'the ledger line sits above the staff');
});

// ------------------------------------------------------------- sticking --

test('a hand reads from a letter or from a word, in any case', () => {
  assert.equal(stickingOf({ hand: 'R' }), 'R');
  assert.equal(stickingOf({ hand: 'l' }), 'L');
  assert.equal(stickingOf({ hand: 'Right' }), 'R');
  assert.equal(stickingOf({ hand: ' left ' }), 'L');
  // A score event may name the same thing `sticking`.
  assert.equal(stickingOf({ sticking: 'R' }), 'R');
  assert.equal(stickingOf({ hand: 'foot' }), '');
  assert.equal(stickingOf({}), '');
  assert.equal(stickingOf(null), '');
});

test('both hands carry a name the page can print', () => {
  assert.equal(STICKING_LABELS.R, 'Right hand');
  assert.equal(STICKING_LABELS.L, 'Left hand');
  assert.deepEqual(STICKING_SYMBOLS.map((row) => row.glyph), ['R', 'L']);
  for (const row of STICKING_SYMBOLS) {
    assert.ok(row.text && row.note, `the ${row.glyph} row needs a name and a note`);
  }
  const mark = DRUM_ARTICULATION_KEY.find((row) => row.id === 'sticking');
  assert.ok(mark, 'the marks key must cover the sticking');
});

test('a normalized note keeps the hand that plays it', () => {
  const bars = normalizeBars([{
    timeSig: [4, 4],
    voices: {
      up: [
        { dur: 1, notes: [{ name: 'snare', hand: 'R' }] },
        { dur: 1, notes: ['snare'] },
      ],
      down: [{ dur: 2, notes: [{ name: 'kick', hand: 'nonsense' }] }],
    },
  }]);
  assert.equal(bars[0].voices.up[0].notes[0].hand, 'R');
  assert.equal(bars[0].voices.up[1].notes[0].hand, '', 'a note with no hand keeps an empty one');
  assert.equal(bars[0].voices.down[0].notes[0].hand, '', 'a word that names no hand is dropped');
});

test('a score event carries its hand onto the staff', () => {
  const voices = voicesFromEvents([
    { start: 0, instrument: 'snare', duration: 0.5, hand: 'right' },
    { start: 0.5, instrument: 'snare', duration: 0.5, sticking: 'L' },
    { start: 1, instrument: 'snare', duration: 0.5 },
  ], 0, 4);
  assert.equal(voices.up[0].notes[0].hand, 'R');
  assert.equal(voices.up[1].notes[0].hand, 'L');
  assert.equal(voices.up[2].notes[0].hand, '');
});

test('the layout draws one letter per column, under the staff', () => {
  const bars = normalizeBars([{
    timeSig: [4, 4],
    voices: {
      up: [
        { dur: 1, notes: [{ name: 'snare', hand: 'R' }] },
        { dur: 1, notes: [{ name: 'snare', hand: 'L' }] },
        { dur: 1, rest: true },
        // Two pieces struck together share one column, so they share one letter.
        { dur: 1, notes: [{ name: 'hihatClosed', hand: 'R' }, { name: 'snare', hand: 'L' }] },
      ],
      down: [{ dur: 4, notes: ['kick'] }],
    },
  }]);
  const layout = layoutDrumStaff(bars);
  const letters = layout.elements.filter((el) => el.role === 'sticking');
  assert.deepEqual(letters.map((el) => el.text), ['R', 'L', 'R']);
  assert.ok(
    letters.every((el) => el.y > layout.staffBottom),
    'the letters sit under the staff',
  );
  assert.ok(letters[0].x < letters[1].x, 'the letters follow the notes across the bar');
  assert.equal(letters[0].title, 'Right hand', 'a letter carries the name of its hand');
  assert.ok(layout.height > layout.staffBottom, 'the staff makes room for the row');
});

test('a bar with no hand draws no letter and keeps the count row in place', () => {
  const plain = normalizeBars([{
    timeSig: [4, 4],
    voices: { up: [{ dur: 1, notes: ['snare'] }, { dur: 3, rest: true }], down: [] },
  }]);
  const withHand = normalizeBars([{
    timeSig: [4, 4],
    voices: {
      up: [{ dur: 1, notes: [{ name: 'snare', hand: 'R' }] }, { dur: 3, rest: true }],
      down: [],
    },
  }]);
  const bare = layoutDrumStaff(plain, { countPerQuarter: 2 });
  const stuck = layoutDrumStaff(withHand, { countPerQuarter: 2 });
  assert.equal(bare.elements.filter((el) => el.role === 'sticking').length, 0);
  const countOf = (layout) => layout.elements.find((el) => el.role === 'countBeat').y;
  assert.ok(countOf(stuck) > countOf(bare), 'the hand row pushes the count row down');
  const letter = stuck.elements.find((el) => el.role === 'sticking');
  assert.ok(letter.y < countOf(stuck), 'the hand row sits above the count row');

  // The staff can turn the row off, for a view that has no room for it.
  const off = layoutDrumStaff(withHand, { showSticking: false });
  assert.equal(off.elements.filter((el) => el.role === 'sticking').length, 0);
});

test('the sticking example teaches singles and then a paradiddle', () => {
  const example = DRUM_STAFF_EXAMPLES.find((ex) => ex.id === 'sticking');
  assert.ok(example, 'the page must teach the sticking');
  const bars = staffExampleBars(example);
  const handsOf = (bar) => bar.voices.up.map((entry) => entry.notes[0].hand).join('');
  assert.equal(handsOf(bars[0]), 'RLRLRLRL', 'the first bar alternates');
  assert.equal(handsOf(bars[1]), 'RLRRLRLL', 'the second bar is a paradiddle');
  const letters = layoutDrumStaff(bars).elements.filter((el) => el.role === 'sticking');
  assert.equal(letters.length, 16, 'every note of the example names its hand');
});

test('every mark of the key has a drawn sample on the page', () => {
  const page = readFileSync(new URL('../../js/drumTabReference.js', import.meta.url), 'utf8');
  for (const mark of DRUM_ARTICULATION_KEY) {
    assert.ok(page.includes(`${mark.id}: {`), `the page draws no sample for ${mark.id}`);
    assert.ok(mark.title && mark.note, `${mark.id} needs a title and a note`);
  }
});

test('the reference is precached with its stylesheet', () => {
  const sw = readFileSync(new URL('../../service-worker.js', import.meta.url), 'utf8');
  assert.ok(sw.includes('"js/drumTabReference.js"'), 'the page module is not precached');
  assert.ok(sw.includes('"js/drums/tabReferenceModel.js"'), 'the model is not precached');
  assert.ok(sw.includes('"css/drumtab.css"'), 'the stylesheet is not precached');
  for (const file of ['staffNotation.js', 'staffLayout.js', 'staffSvg.js', 'kitMapSvg.js']) {
    assert.ok(sw.includes(`"js/drums/${file}"`), `js/drums/${file} is not precached`);
  }
});

console.log(`\ndrum notation tests: ${passed} passed${failed ? `, ${failed} failed` : ''}`);
if (failed) process.exit(1);
