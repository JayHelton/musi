// normalizeExerciseItem takes field round-trip and clamping.
// Run: node tests/exercises/normalize-takes.mjs

import assert from 'node:assert/strict';
import { installDomShim } from '../gp-player/domShim.mjs';

installDomShim();

const { normalizeExerciseItem } = await import('../../js/exercises.js');

const base = {
  id: 'ex-1',
  attachmentId: 'att-main',
  name: 'Scale drill',
  fileName: 'scale.mp3',
  type: 'audio/mpeg',
  size: 1000,
  addedAt: '2026-01-01T00:00:00.000Z',
};

const withTakes = normalizeExerciseItem({
  ...base,
  takes: [
    {
      id: 'take-1',
      attachmentId: 'att-t1',
      name: 'Take 1',
      type: 'audio/webm',
      durationMs: 4200,
      createdAt: '2026-01-02T00:00:00.000Z',
    },
    { id: '', attachmentId: 'bad' },
    null,
  ],
});
assert.equal(withTakes.takes.length, 1);
assert.deepEqual(withTakes.takes[0], {
  id: 'take-1',
  attachmentId: 'att-t1',
  name: 'Take 1',
  type: 'audio/webm',
  durationMs: 4200,
  createdAt: '2026-01-02T00:00:00.000Z',
});

const missingTakes = normalizeExerciseItem(base);
assert.deepEqual(missingTakes.takes, []);

const many = Array.from({ length: 60 }, (_, i) => ({
  id: `take-${i}`,
  attachmentId: `att-${i}`,
  name: `Take ${i}`,
  type: 'audio/wav',
  durationMs: 1000,
  createdAt: '2026-01-01T00:00:00.000Z',
}));
const clamped = normalizeExerciseItem({ ...base, takes: many });
assert.equal(clamped.takes.length, 50);

console.log('normalize-takes: ok');
console.log('\nall normalize-takes tests passed');
