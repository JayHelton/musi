/**
 * Zero-dependency Node tests for vocal practice.
 *
 * The cue model, the vocal metadata, and the starter definitions are pure, so
 * this runner reads them directly. No DOM and no storage.
 *
 * Run: node tests/vocal/run.mjs
 */

import assert from 'node:assert/strict';

import {
  CUE_STEP_TYPES,
  CUE_MAX_STEPS,
  normalizeCueStep,
  normalizeCueConfig,
  defaultCueConfig,
  cueStepTitle,
  cueStepKicker,
  cueStepSeconds,
  cueRepSeconds,
  cueRunSeconds,
  cueHasCheckpoint,
  expandCueSteps,
  formatCueClock,
  describeCueConfig,
  parseCueSteps,
  formatCueSteps,
} from '../../js/cueExerciseModel.js';

import {
  VOCAL_STYLES,
  CLEAN_REGISTERS,
  HARSH_REGISTERS,
  ACTIVATION_OUTCOMES,
  QUALITY_OUTCOMES,
  EFFORT_LEVELS,
  CLEAN_ISSUE_TAGS,
  HARSH_ISSUE_TAGS,
  registersOfStyle,
  focusOfMode,
  vocalStyleOf,
  registersOf,
  focusOf,
  readVocalMeta,
  vocalTags,
  withVocalTags,
  isVocalExercise,
  matchesVocalMode,
  filterVocalExercises,
  describeVocalExercise,
  outcomeSetOf,
  issueTagsOfStyle,
} from '../../js/vocalExerciseModel.js';

import {
  CLEAN_STARTERS,
  HARSH_STARTERS,
  startersOfStyle,
  starterExerciseRecord,
  starterExerciseRecords,
} from '../../js/vocalStarters.js';
import {
  HARSH_CHEAT_TABS,
  WARM_UP_LADDER,
  FALSE_CORD_REGISTERS,
  TRUE_CORD_HIGHS,
  TONGUE_TONE_TABLE,
  TONGUE_RULES,
  RED_FLAGS,
  CHEAT_SHEET_SOURCES,
} from '../../js/practiceLab/model/harshCheatSheet.js';

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

/* ------------------------------------------------------------------ */
console.log('Cue model');

test('the MVP holds five step types and no more', () => {
  assert.deepEqual(CUE_STEP_TYPES, ['perform', 'rest', 'transition', 'phrase', 'checkpoint']);
});

test('an unknown step type is refused', () => {
  assert.equal(normalizeCueStep({ type: 'sing', duration: 4 }), null);
  assert.equal(normalizeCueStep(null), null);
});

test('a checkpoint carries no length', () => {
  const step = normalizeCueStep({ type: 'checkpoint', text: 'Ready?', duration: 9 });
  assert.equal(step.duration, undefined);
  assert.equal(cueStepSeconds(step), 0);
});

test('a transition keeps both registers and reads as an arrow', () => {
  const step = normalizeCueStep({ type: 'transition', duration: 3, from: 'low', to: 'high' });
  assert.equal(step.from, 'low');
  assert.equal(step.to, 'high');
  assert.equal(cueStepTitle(step), 'LOW → HIGH');
  assert.equal(cueStepKicker(step), 'TRANSITION');
});

test('a config with no step is refused', () => {
  assert.equal(normalizeCueConfig({ steps: [] }), null);
  assert.equal(normalizeCueConfig({ steps: [{ type: 'nope' }] }), null);
  assert.equal(normalizeCueConfig(null), null);
});

test('the step count is capped', () => {
  const steps = Array.from({ length: CUE_MAX_STEPS + 8 }, () => ({ type: 'rest', duration: 1 }));
  assert.equal(normalizeCueConfig({ steps }).steps.length, CUE_MAX_STEPS);
});

test('a rest step keeps the length the author wrote', () => {
  const config = normalizeCueConfig({
    repetitions: 3,
    steps: [{ type: 'perform', duration: 4, text: 'Low' }, { type: 'rest', duration: 8 }],
  });
  assert.equal(config.steps[1].duration, 8);
  assert.equal(cueRepSeconds(config), 12);
  assert.equal(cueRunSeconds(config), 36);
});

test('the rest between reps counts only between them', () => {
  const config = { repetitions: 3, restBetweenReps: 10, steps: [{ type: 'perform', duration: 5 }] };
  assert.equal(cueRunSeconds(config), 5 * 3 + 10 * 2);
});

test('the expansion repeats every step and keeps the order', () => {
  const steps = expandCueSteps({
    repetitions: 2,
    steps: [
      { type: 'perform', duration: 4, text: 'Low' },
      { type: 'rest', duration: 8 },
    ],
  });
  assert.equal(steps.length, 4);
  assert.deepEqual(steps.map(s => s.step.type), ['perform', 'rest', 'perform', 'rest']);
  assert.deepEqual(steps.map(s => s.rep), [1, 1, 2, 2]);
  assert.equal(steps[0].next.type, 'rest');
  assert.equal(steps[3].next, null);
});

test('the rest between reps becomes its own step', () => {
  const steps = expandCueSteps({
    repetitions: 2,
    restBetweenReps: 6,
    steps: [{ type: 'perform', duration: 4, text: 'Low' }],
  });
  assert.deepEqual(steps.map(s => s.step.type), ['perform', 'rest', 'perform']);
  assert.equal(steps[1].step.duration, 6);
});

test('a checkpoint is reported', () => {
  assert.equal(cueHasCheckpoint({ steps: [{ type: 'perform', duration: 2 }] }), false);
  assert.equal(cueHasCheckpoint({ steps: [{ type: 'checkpoint' }] }), true);
});

test('the clock reads minutes and seconds', () => {
  assert.equal(formatCueClock(0), '0:00');
  assert.equal(formatCueClock(8), '0:08');
  assert.equal(formatCueClock(96), '1:36');
});

test('the summary counts the steps, the reps, and the time', () => {
  const line = describeCueConfig({
    repetitions: 5,
    steps: [{ type: 'perform', duration: 4, text: 'Low' }, { type: 'rest', duration: 8 }],
  });
  assert.match(line, /2 steps/);
  assert.match(line, /5 reps/);
  assert.match(line, /1:00/);
});

test('the default config plays', () => {
  assert.ok(normalizeCueConfig(defaultCueConfig()));
});

/* ------------------------------------------------------------------ */
console.log('Typed step list');

test('one step per line, with the type first', () => {
  const parsed = parseCueSteps([
    'perform 4 Neutral false-cord low',
    'rest 8',
    'transition 3 low > high',
    'phrase 6 Bite the wire',
    'checkpoint Set the placement',
  ].join('\n'));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.steps.map(s => s.type),
    ['perform', 'rest', 'transition', 'phrase', 'checkpoint']);
  assert.equal(parsed.steps[0].text, 'Neutral false-cord low');
  assert.equal(parsed.steps[2].to, 'high');
});

test('a line with no length is reported', () => {
  const parsed = parseCueSteps('perform Neutral low');
  assert.equal(parsed.ok, false);
  assert.match(parsed.errors[0], /no length/);
});

test('an unknown type is reported', () => {
  const parsed = parseCueSteps('shout 4 Something');
  assert.equal(parsed.ok, false);
  assert.match(parsed.errors[0], /step type/);
});

test('a transition needs two registers', () => {
  assert.equal(parseCueSteps('transition 3 low').ok, false);
  assert.equal(parseCueSteps('transition 3 low -> mid').ok, true);
  assert.equal(parseCueSteps('transition 3 mid to high').ok, true);
});

test('a step list round-trips through the typed form', () => {
  const text = 'perform 4 Neutral low\nrest 8\ntransition 3 low > high\ncheckpoint Ready';
  const parsed = parseCueSteps(text);
  assert.equal(formatCueSteps(parsed.steps), text);
});

/* ------------------------------------------------------------------ */
console.log('Vocal metadata');

test('the styles and the registers match the product', () => {
  assert.deepEqual(VOCAL_STYLES, ['clean', 'harsh']);
  assert.deepEqual(CLEAN_REGISTERS, ['chest', 'mix', 'head']);
  assert.deepEqual(HARSH_REGISTERS, ['low', 'mid', 'high']);
  assert.deepEqual(registersOfStyle('clean'), CLEAN_REGISTERS);
  assert.deepEqual(registersOfStyle('harsh'), HARSH_REGISTERS);
  assert.deepEqual(registersOfStyle('nonsense'), []);
});

test('G4 is a focus of the mix register, not only the top of a scale', () => {
  assert.ok(focusOfMode('clean', 'mix').includes('g4-reliability'));
  assert.ok(focusOfMode('clean', 'mix').includes('g4-vowel-consistency'));
});

test('the tags read back as the metadata that wrote them', () => {
  const tags = vocalTags({ style: 'clean', registers: ['mix', 'head'], focus: ['g4-reliability'] });
  const item = { kind: 'runner', tags };
  assert.equal(vocalStyleOf(item), 'clean');
  assert.deepEqual(registersOf(item), ['mix', 'head']);
  assert.deepEqual(focusOf(item), ['g4-reliability']);
  assert.deepEqual(readVocalMeta(item), {
    practiceType: 'vocal',
    vocalStyle: 'clean',
    registers: ['mix', 'head'],
    focus: ['g4-reliability'],
  });
});

test('a register of the other style is dropped', () => {
  const item = { kind: 'runner', tags: ['vocal:clean', 'register:low', 'register:mix'] };
  assert.deepEqual(registersOf(item), ['mix']);
});

test('an exercise with no vocal tag is not vocal', () => {
  assert.equal(isVocalExercise({ kind: 'runner', tags: ['warm-up'] }), false);
  assert.equal(readVocalMeta({ kind: 'runner' }), null);
});

test('a replacement keeps every tag that is not vocal', () => {
  const tags = ['warm-up', 'vocal:harsh', 'register:low', 'focus:activation'];
  const next = withVocalTags(tags, { style: 'harsh', registers: ['mid'], focus: [] });
  assert.deepEqual(next, ['warm-up', 'vocal:harsh', 'register:mid']);
});

test('a cleared style drops the vocal tags and keeps the rest', () => {
  const next = withVocalTags(['warm-up', 'vocal:clean', 'register:mix'], { style: '' });
  assert.deepEqual(next, ['warm-up']);
});

test('a clean mode matches a pitch-runner exercise only', () => {
  const runner = { kind: 'runner', tags: vocalTags({ style: 'clean', registers: ['mix'] }) };
  const cue = { kind: 'cue', tags: vocalTags({ style: 'clean', registers: ['mix'] }) };
  assert.equal(matchesVocalMode(runner, { style: 'clean', register: 'mix' }), true);
  assert.equal(matchesVocalMode(cue, { style: 'clean', register: 'mix' }), false);
  assert.equal(matchesVocalMode(runner, { style: 'clean', register: 'head' }), false);
  assert.equal(matchesVocalMode(runner, { style: 'harsh', register: 'low' }), false);
});

test('a harsh mode matches a cue exercise only', () => {
  const cue = { kind: 'cue', tags: vocalTags({ style: 'harsh', registers: ['low'] }) };
  const runner = { kind: 'runner', tags: vocalTags({ style: 'harsh', registers: ['low'] }) };
  assert.equal(matchesVocalMode(cue, { style: 'harsh', register: 'low' }), true);
  assert.equal(matchesVocalMode(runner, { style: 'harsh', register: 'low' }), false);
});

test('a transition exercise belongs to more than one register', () => {
  const item = { kind: 'cue', tags: vocalTags({ style: 'harsh', registers: ['low', 'mid'] }) };
  assert.equal(matchesVocalMode(item, { style: 'harsh', register: 'low' }), true);
  assert.equal(matchesVocalMode(item, { style: 'harsh', register: 'mid' }), true);
  assert.equal(matchesVocalMode(item, { style: 'harsh', register: 'high' }), false);
});

test('the filter sorts by name and reads the search', () => {
  const items = [
    { id: 'b', name: 'Low Sustain', kind: 'cue', tags: vocalTags({ style: 'harsh', registers: ['low'] }) },
    { id: 'a', name: 'Immediate Low Activation', kind: 'cue', tags: vocalTags({ style: 'harsh', registers: ['low'], focus: ['activation'] }) },
    { id: 'c', name: 'Mid Sustain', kind: 'cue', tags: vocalTags({ style: 'harsh', registers: ['mid'] }) },
    { id: 'd', name: 'A file', kind: 'file' },
  ];
  const low = filterVocalExercises(items, { style: 'harsh', register: 'low' });
  assert.deepEqual(low.map(i => i.id), ['a', 'b']);
  const found = filterVocalExercises(items, { style: 'harsh', register: 'low', search: 'sustain' });
  assert.deepEqual(found.map(i => i.id), ['b']);
});

test('the picker line names the registers and the focus', () => {
  const item = { kind: 'cue', tags: vocalTags({ style: 'harsh', registers: ['low'], focus: ['activation'] }) };
  assert.equal(describeVocalExercise(item), 'Low — Immediate activation');
});

test('an activation exercise reports immediate, searched, or missed', () => {
  const item = { kind: 'cue', tags: vocalTags({ style: 'harsh', registers: ['low'], focus: ['activation'] }) };
  assert.deepEqual(outcomeSetOf(item), ACTIVATION_OUTCOMES);
});

test('a switching exercise reports the same three', () => {
  const item = { kind: 'cue', tags: vocalTags({ style: 'harsh', registers: ['low'], focus: ['transition'] }) };
  assert.deepEqual(outcomeSetOf(item), ACTIVATION_OUTCOMES);
});

test('every other exercise reports clean, unstable, or stopped', () => {
  const item = { kind: 'cue', tags: vocalTags({ style: 'harsh', registers: ['low'], focus: ['sustain'] }) };
  assert.deepEqual(outcomeSetOf(item), QUALITY_OUTCOMES);
});

test('the result vocabulary and the effort list stay small', () => {
  assert.deepEqual(ACTIVATION_OUTCOMES, ['immediate', 'searched', 'missed']);
  assert.deepEqual(QUALITY_OUTCOMES, ['clean', 'unstable', 'stopped']);
  assert.deepEqual(EFFORT_LEVELS, ['easy', 'working', 'strained']);
  assert.deepEqual(issueTagsOfStyle('harsh'), HARSH_ISSUE_TAGS);
  assert.deepEqual(issueTagsOfStyle('clean'), CLEAN_ISSUE_TAGS);
});

/* ------------------------------------------------------------------ */
console.log('Starter exercises');

test('every clean starter is a playable pitch run', () => {
  for (const def of CLEAN_STARTERS) {
    const record = starterExerciseRecord(def, { style: 'clean', folderId: 'f1' });
    assert.equal(record.kind, 'runner', def.name);
    assert.ok(record.runner.notes.length, def.name);
    assert.equal(record.categoryId, 'f1');
    assert.equal(vocalStyleOf(record), 'clean', def.name);
    assert.ok(registersOf(record).length, def.name);
  }
});

test('every harsh starter is a playable cue exercise', () => {
  for (const def of HARSH_STARTERS) {
    const record = starterExerciseRecord(def, { style: 'harsh', folderId: 'f2' });
    assert.equal(record.kind, 'cue', def.name);
    const config = normalizeCueConfig(record.cue);
    assert.ok(config, def.name);
    assert.ok(config.steps.length, def.name);
    assert.equal(vocalStyleOf(record), 'harsh', def.name);
    assert.ok(registersOf(record).length, def.name);
  }
});

test('the named exercises of the product are all there', () => {
  const names = HARSH_STARTERS.map(d => d.name);
  for (const name of [
    'Immediate Low Activation', 'Low Start / Stop', 'Low Sustain', 'Dark ↔ Forward Low',
    'Covered ↔ Open Low', 'Low Diction', 'Low → Mid', 'Low → High',
    'Immediate Mid Activation', 'Mid Start / Stop', 'Mid Sustain', 'Mid Dynamics',
    'Mid Diction', 'Mid → Low', 'Mid → High', 'High → Mid', 'Mid Character Control',
    'Immediate High Activation', 'High Start / Stop', 'High Sustain', 'High Endurance',
    'Bright ↔ Gritty High', 'Cleaner ↔ Grittier High', 'High Diction', 'High → Low',
  ]) {
    assert.ok(names.includes(name), `missing ${name}`);
  }
});

test('every harsh register has an activation exercise', () => {
  for (const register of HARSH_REGISTERS) {
    const found = HARSH_STARTERS.some(def => (
      def.registers.includes(register) && def.focus.includes('activation')
    ));
    assert.ok(found, `no activation exercise for ${register}`);
  }
});

test('every clean register has at least one exercise', () => {
  for (const register of CLEAN_REGISTERS) {
    assert.ok(CLEAN_STARTERS.some(def => def.registers.includes(register)), register);
  }
});

test('G4 is trainable as its own target', () => {
  const g4 = CLEAN_STARTERS.filter(def => def.focus.includes('g4-reliability'));
  assert.ok(g4.length >= 2);
  const gee = g4.find(def => def.name === 'G4 Reliability — GEE');
  assert.ok(gee);
  assert.ok(gee.runner.notes.every(note => note.midi === 67));
});

test('every harsh starter holds rest, so nothing runs without recovery', () => {
  for (const def of HARSH_STARTERS) {
    const hasRest = def.cue.steps.some(step => step.type === 'rest');
    assert.ok(hasRest, `${def.name} holds no rest`);
  }
});

test('the endurance exercise uses work and rest density, not a longest scream', () => {
  const def = HARSH_STARTERS.find(d => d.name === 'High Endurance');
  assert.equal(def.cue.repetitions, 6);
  assert.deepEqual(def.cue.steps.map(s => s.duration), [5, 5]);
});

test('the records of one style all carry that style', () => {
  const records = starterExerciseRecords({ style: 'harsh', folderId: 'f3' });
  assert.equal(records.length, HARSH_STARTERS.length);
  assert.ok(records.every(r => vocalStyleOf(r) === 'harsh'));
  assert.ok(records.every(r => r.instrument === 'voice'));
});

test('an unknown style has no starters', () => {
  assert.deepEqual(startersOfStyle('nonsense'), []);
  assert.deepEqual(starterExerciseRecords({ style: '', folderId: 'f' }), []);
});

/* ------------------------------------------------------------------ */
console.log('Harsh cheat sheet');

test('the cheat sheet names five tabs, in a fixed order', () => {
  assert.deepEqual(HARSH_CHEAT_TABS.map(t => t.id),
    ['warmup', 'falsecord', 'truecord', 'tongue', 'redflags']);
  assert.ok(HARSH_CHEAT_TABS.every(t => t.label));
});

test('the warm-up ladder ends on false cord, not on distortion', () => {
  assert.ok(WARM_UP_LADDER.length >= 4);
  assert.ok(WARM_UP_LADDER.every(row => row.step && row.detail));
  assert.match(WARM_UP_LADDER[0].step, /Hydrate/i);
  assert.match(WARM_UP_LADDER.at(-1).step, /false cord/i);
});

test('the false-cord registers match the Harsh registers of the vocal model', () => {
  assert.deepEqual(Object.keys(FALSE_CORD_REGISTERS), HARSH_REGISTERS);
});

test('every false-cord card answers the same five questions', () => {
  const fields = ['label', 'activation', 'placement', 'mouth', 'breath', 'feelsLike'];
  for (const register of HARSH_REGISTERS) {
    const card = FALSE_CORD_REGISTERS[register];
    for (const field of fields) {
      assert.ok(typeof card[field] === 'string' && card[field].length > 0, `${register}.${field}`);
    }
  }
});

test('true-cord highs are a distinct technique with a hard stop', () => {
  const fields = ['label', 'whatItIs', 'warmIntoLast', 'activation', 'ridingIt', 'placement', 'breath', 'hardStop'];
  for (const field of fields) {
    assert.ok(typeof TRUE_CORD_HIGHS[field] === 'string' && TRUE_CORD_HIGHS[field].length > 0, field);
  }
  assert.match(TRUE_CORD_HIGHS.whatItIs, /true/i);
});

test('the tongue table pairs every position with an effect and a register', () => {
  assert.ok(TONGUE_TONE_TABLE.length >= 4);
  for (const row of TONGUE_TONE_TABLE) {
    assert.ok(row.position, 'position');
    assert.ok(row.effect, 'effect');
    assert.ok(row.pairsWith, 'pairsWith');
  }
  assert.ok(TONGUE_RULES.length >= 2);
});

test('the red flags are non-empty stop-now reminders', () => {
  assert.ok(RED_FLAGS.length >= 3);
  assert.ok(RED_FLAGS.every(text => typeof text === 'string' && text.length > 10));
});

test('every source carries a label and a URL', () => {
  assert.ok(CHEAT_SHEET_SOURCES.length >= 3);
  for (const source of CHEAT_SHEET_SOURCES) {
    assert.ok(source.label, 'label');
    assert.match(source.url, /^https:\/\//, source.label);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
