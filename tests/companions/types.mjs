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

assert.equal(COMPANION_TYPES.length, 5);
assert.deepEqual(COMPANION_TYPES.map((t) => t.id), [
  'scale-ref', 'triad-ref', 'sweep-ref', 'pitch-train', 'interval-orbit',
]);

const scaleDef = defaultCompanion('scale-ref');
assert.equal(scaleDef.type, 'scale-ref');
assert.equal(scaleDef.root, 'C');
assert.equal(scaleDef.tuning, 'Standard');
assert.equal(scaleDef.mapRange, undefined);

const orbitDef = defaultCompanion('interval-orbit');
assert.equal(orbitDef.type, 'interval-orbit');
assert.equal(orbitDef.root, 'C');
assert.equal(orbitDef.tuning, 'Standard');
assert.equal(orbitDef.fretStart, 0);
assert.equal(orbitDef.fretEnd, 12);
assert.equal(orbitDef.mapRange, 1);
assert.equal(orbitDef.level, 2);
assert.equal(orbitDef.mode, 'locate');

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
assert.equal(good.mapRange, undefined);

const orbit = normalizeCompanion({
  type: 'interval-orbit',
  root: 'G',
  tuning: 'Standard',
  fretStart: 0,
  fretEnd: 12,
  mapRange: 2,
  level: 3,
  mode: 'map',
});
assert.ok(orbit);
assert.equal(orbit.mapRange, 2);
assert.equal(orbit.level, 3);
assert.equal(orbit.mode, 'map');

const orbitClamp = normalizeCompanion({
  type: 'interval-orbit',
  root: 'A',
  mapRange: 9,
  level: 0,
  mode: 'quiz',
  fretStart: 20,
  fretEnd: 2,
});
assert.ok(orbitClamp);
assert.equal(orbitClamp.mapRange, 1);
assert.equal(orbitClamp.level, 2);
assert.equal(orbitClamp.mode, 'locate');
assert.ok(orbitClamp.fretStart <= orbitClamp.fretEnd);

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

const orbitDesc = describeCompanion({
  type: 'interval-orbit',
  root: 'G',
  mode: 'locate',
  mapRange: 1,
  tuning: 'Standard',
});
assert.match(orbitDesc, /Orbit · G · Locate · Local · Standard/);

console.log('companions types: ok');
