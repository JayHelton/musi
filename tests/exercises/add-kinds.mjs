// New exercises join the folder the library has open, and the two kinds that
// need no file (a pitch run, a written exercise) round-trip through storage.
// Run: node tests/exercises/add-kinds.mjs

import assert from 'node:assert/strict';
import { installDomShim } from '../gp-player/domShim.mjs';
import { installIdbShim } from './idbShim.mjs';

installDomShim();
installIdbShim();

const storage = new Map();
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, value); },
  removeItem(key) { storage.delete(key); },
  clear() { storage.clear(); },
};

function mount(id, tag = 'div') {
  const node = document.createElement(tag);
  node.id = id;
  document.body.appendChild(node);
  return node;
}

[
  'sec-exercises', 'ex-list', 'ex-category-list', 'ex-tools', 'ex-status',
  'ex-bulk-bar', 'ex-workspace', 'ex-player-pane', 'ex-player-title',
  'ex-player-actions', 'ex-player-body',
].forEach((id) => mount(id));
mount('ex-crumbs', 'nav');
mount('ex-file-input', 'input');
mount('ex-bulk-file-input', 'input');
mount('ex-player-back', 'button');
document.getElementById('ex-player-pane').hidden = true;

storage.set('musi.exercises', JSON.stringify({
  categories: [
    { id: 'cat-warm', name: 'Warm-ups', parentId: '' },
    { id: 'cat-scale', name: 'Scales', parentId: 'cat-warm' },
  ],
  items: [],
}));

const ex = await import('../../js/exercises.js');
ex.invalidateExercisesCache?.();
ex.initExercises();

async function test(name, fn) {
  await fn();
  console.log(`ok  ${name}`);
}

const RUN = {
  source: 'manual',
  bpm: 100,
  notes: [{ midi: 60, beats: 2 }, { midi: 64, beats: 2 }],
  repeats: 2,
};

await test('a new exercise lands at the root while the root is open', async () => {
  assert.equal(ex.defaultExerciseFolder(), '');
  const item = ex.addRunnerExercise({ name: 'Root run', config: RUN });
  assert.equal(item.categoryId, '');
});

await test('a new exercise lands in the folder the browser has open', async () => {
  ex.selectExerciseFolder('cat-scale');
  assert.equal(ex.defaultExerciseFolder(), 'cat-scale');

  const run = ex.addRunnerExercise({ name: 'Scale run', config: RUN });
  assert.equal(run.categoryId, 'cat-scale');

  const note = ex.addNoteExercise({ name: 'Practice plan', body: 'Slow first.' });
  assert.equal(note.categoryId, 'cat-scale');

  const fromFile = ex.addExerciseFromAttachment({
    attachmentId: 'att-1', name: 'Etude', fileName: 'etude.pdf', type: 'application/pdf', size: 10,
  });
  assert.equal(fromFile.categoryId, 'cat-scale', 'a save from another tool follows the open folder too');
});

await test('a named folder still wins over the open folder', async () => {
  const item = ex.addRunnerExercise({ name: 'Filed run', config: RUN, categoryId: 'cat-warm' });
  assert.equal(item.categoryId, 'cat-warm');
  const rooted = ex.addRunnerExercise({ name: 'Rooted run', config: RUN, categoryId: '' });
  assert.equal(rooted.categoryId, '', 'an empty folder id means the root, not the open folder');
});

await test('a pitch run keeps its config through a reload', async () => {
  const item = ex.addRunnerExercise({
    name: 'Five tone',
    config: { source: 'manual', bpm: 88, notes: [{ midi: 62, beats: 3 }], repeats: 4 },
  });
  assert.equal(item.kind, 'runner');
  assert.equal(ex.mediaKind(item), 'runner');
  assert.equal(ex.mediaKindLabel(item), 'Pitch run');

  ex.invalidateExercisesCache();
  const reloaded = ex.getExercise(item.id);
  assert.equal(reloaded.kind, 'runner');
  assert.equal(reloaded.runner.bpm, 88);
  assert.equal(reloaded.runner.repeats, 4);
  assert.deepEqual(reloaded.runner.notes, [{ midi: 62, beats: 3 }]);
});

await test('a written exercise keeps its text and its files', async () => {
  const item = ex.addNoteExercise({
    name: 'Warm-up routine',
    body: 'Five minutes of long tones.\n\nThen thirds.',
    attachments: [
      { attachmentId: 'att-a', name: 'Sheet', fileName: 'sheet.pdf', type: 'application/pdf', size: 42 },
    ],
  });
  assert.equal(item.kind, 'note');
  assert.equal(ex.mediaKind(item), 'note');
  assert.equal(ex.mediaKindLabel(item), 'Written');

  ex.invalidateExercisesCache();
  const reloaded = ex.getExercise(item.id);
  assert.match(reloaded.body, /long tones/);
  assert.equal(reloaded.attachments.length, 1);
  assert.equal(reloaded.attachments[0].attachmentId, 'att-a');
});

await test('a run with no notes is not stored', async () => {
  assert.equal(ex.addRunnerExercise({ name: 'Empty', config: { notes: [] } }), null);
  assert.equal(ex.normalizeExerciseItem({ id: 'x', kind: 'runner', runner: { notes: [] } }), null);
});

await test('an edit replaces the stored content', async () => {
  const item = ex.addNoteExercise({ name: 'Draft', body: 'first' });
  const next = ex.updateExerciseContent(item.id, { name: 'Final', body: 'second' });
  assert.equal(next.name, 'Final');
  assert.equal(next.body, 'second');
  ex.invalidateExercisesCache();
  assert.equal(ex.getExercise(item.id).body, 'second');
});

await test('an old record with no kind still reads as a file or a link', async () => {
  const file = ex.normalizeExerciseItem({
    id: 'old-1', name: 'Old', attachmentId: 'att-old', fileName: 'x.pdf', type: 'application/pdf',
  });
  assert.equal(file.kind, 'file');
  const link = ex.normalizeExerciseItem({ id: 'old-2', name: 'Old link', url: 'https://example.com/a' });
  assert.equal(link.kind, 'link');
  assert.equal(ex.normalizeExerciseItem({ id: 'old-3', name: 'Nothing' }), null);
});

await test('a cue exercise keeps its steps and its vocal tags through a reload', async () => {
  const item = ex.addCueExercise({
    name: 'Immediate Low Activation',
    categoryId: 'cat-warm',
    config: {
      repetitions: 5,
      steps: [
        { type: 'perform', duration: 4, text: 'Neutral false-cord low' },
        { type: 'rest', duration: 8 },
      ],
    },
    vocal: { style: 'harsh', registers: ['low'], focus: ['activation'] },
  });
  assert.equal(item.kind, 'cue');
  assert.equal(ex.mediaKind(item), 'cue');
  assert.equal(ex.mediaKindLabel(item), 'Cue exercise');
  assert.equal(item.instrument, 'voice');

  ex.invalidateExercisesCache();
  const reloaded = ex.getExercise(item.id);
  assert.equal(reloaded.kind, 'cue');
  assert.equal(reloaded.cue.repetitions, 5);
  assert.equal(reloaded.cue.steps.length, 2);
  assert.equal(reloaded.cue.steps[1].type, 'rest');
  assert.equal(reloaded.cue.steps[1].duration, 8, 'the rest keeps the length the author wrote');
  assert.deepEqual(reloaded.tags, ['vocal:harsh', 'register:low', 'focus:activation']);
});

await test('a cue exercise with no step is not stored', async () => {
  assert.equal(ex.addCueExercise({ name: 'Empty', config: { steps: [] } }), null);
  assert.equal(ex.normalizeExerciseItem({ id: 'x', kind: 'cue', cue: { steps: [] } }), null);
});

await test('a pitch run can carry clean vocal tags', async () => {
  const item = ex.addRunnerExercise({
    name: 'G4 Reliability',
    config: RUN,
    vocal: { style: 'clean', registers: ['mix'], focus: ['g4-reliability'] },
  });
  assert.equal(item.instrument, 'voice');
  assert.deepEqual(item.tags, ['vocal:clean', 'register:mix', 'focus:g4-reliability']);
});

console.log('\nall add-kinds tests passed');
