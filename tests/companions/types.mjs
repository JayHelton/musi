import assert from 'node:assert/strict';
import {
  COMPANION_TYPES,
  MAX_COMPANIONS,
  MAX_LABEL_LEN,
  defaultCompanion,
  normalizeCompanion,
  normalizeCompanions,
  describeCompanion,
} from '../../js/exerciseCompanions/types.js';

assert.equal(COMPANION_TYPES.length, 4);
assert.deepEqual(COMPANION_TYPES.map((t) => t.id), [
  'scale-ref', 'triad-ref', 'sweep-ref', 'pitch-train',
]);

const scaleDef = defaultCompanion('scale-ref');
assert.equal(scaleDef.type, 'scale-ref');
assert.equal(scaleDef.root, 'C');
assert.equal(scaleDef.tuning, 'Standard');

const good = normalizeCompanion({
  type: 'scale-ref',
  root: 'G',
  scale: 'Dorian',
  tuning: 'Standard',
  fretStart: 3,
  fretEnd: 10,
  label: 'My scale',
});
assert.ok(good);
assert.equal(good.root, 'G');
assert.equal(good.scale, 'Dorian');
assert.equal(good.fretStart, 3);
assert.equal(good.fretEnd, 10);
assert.equal(good.label, 'My scale');
assert.ok(good.id);

assert.equal(normalizeCompanion({ type: 'nope', root: 'C' }), null);
assert.equal(normalizeCompanion({ type: 'scale-ref', root: 'not-a-note' }), null);

const inverted = normalizeCompanion({
  type: 'scale-ref',
  root: 'C',
  fretStart: 18,
  fretEnd: 5,
});
assert.ok(inverted);
assert.ok(inverted.fretStart <= inverted.fretEnd);

const longLabel = normalizeCompanion({
  type: 'triad-ref',
  root: 'A',
  label: 'x'.repeat(MAX_LABEL_LEN + 40),
});
assert.ok(longLabel);
assert.equal(longLabel.label.length, MAX_LABEL_LEN);

const badTuning = normalizeCompanion({
  type: 'scale-ref',
  root: 'E',
  tuning: 'Imaginary Tuning',
});
assert.equal(badTuning.tuning, 'Standard');

const list = normalizeCompanions([
  { type: 'scale-ref', root: 'C' },
  { type: 'bad', root: 'C' },
  { type: 'pitch-train', root: 'D' },
  { id: 'dup', type: 'sweep-ref', root: 'A' },
  { id: 'dup', type: 'sweep-ref', root: 'G' },
  ...Array.from({ length: MAX_COMPANIONS + 4 }, (_, i) => ({
    type: 'scale-ref',
    root: 'C',
    id: `extra-${i}`,
  })),
]);
assert.equal(list.length, MAX_COMPANIONS);
assert.equal(list.filter((c) => c.type === 'pitch-train').length, 1);
const ids = list.map((c) => c.id);
assert.equal(new Set(ids).size, ids.length);

const desc = describeCompanion({
  type: 'scale-ref',
  root: 'G',
  scale: 'Major (Ionian)',
  tuning: 'Standard',
});
assert.match(desc, /Scale · G/);
assert.match(desc, /Major \(Ionian\)/);

const triadDesc = describeCompanion({
  type: 'triad-ref',
  root: 'E',
  quality: 'minor',
  tuning: 'Standard',
});
assert.match(triadDesc, /Triad · E Minor/);

console.log('companions types: ok');
