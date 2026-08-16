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

assert.equal(COMPANION_TYPES.length, 7);
assert.deepEqual(COMPANION_TYPES.map((t) => t.id), [
  'scale-ref', 'triad-ref', 'sweep-ref', 'pitch-train', 'interval-orbit', 'ear-train', 'metronome',
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

const earDef = defaultCompanion('ear-train');
assert.equal(earDef.type, 'ear-train');
assert.equal(earDef.root, 'C');
assert.equal(earDef.scale, 'Major (Ionian)');
assert.equal(earDef.earContext, 'root');
assert.equal(earDef.earPool, 'diatonic');
assert.equal(earDef.earAnswer, 'note');
assert.equal(earDef.fretStart, undefined);

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

const earNorm = normalizeCompanion({
  type: 'ear-train',
  root: 'D',
  scale: 'Dorian',
  earContext: 'melodic',
  earPool: 'chromatic',
  earAnswer: 'interval',
});
assert.ok(earNorm);
assert.equal(earNorm.earContext, 'melodic');
assert.equal(earNorm.earPool, 'chromatic');
assert.equal(earNorm.earAnswer, 'interval');

const earClamp = normalizeCompanion({
  type: 'ear-train',
  root: 'E',
  earContext: 'bad',
  earPool: 'whole-tone',
  earAnswer: 'chord',
});
assert.ok(earClamp);
assert.equal(earClamp.earContext, 'root');
assert.equal(earClamp.earPool, 'diatonic');
assert.equal(earClamp.earAnswer, 'note');

const earDesc = describeCompanion({
  type: 'ear-train',
  root: 'C',
  scale: 'Major (Ionian)',
  earContext: 'root',
  earAnswer: 'note',
});
assert.match(earDesc, /Ear · C Major · root first · note/);

// --- metronome -------------------------------------------------------------

const metroDef = defaultCompanion('metronome');
assert.equal(metroDef.type, 'metronome');
assert.equal(metroDef.progression, 'ramp');
assert.equal(metroDef.startBpm, 80);
assert.equal(metroDef.targetBpm, 120);
assert.equal(metroDef.stepBpm, 5);
assert.equal(metroDef.stepSeconds, 60);
assert.equal(metroDef.beatsPerBar, 4);
assert.equal(metroDef.subdiv, 'quarter');
assert.equal(metroDef.countIn, false);
assert.equal(metroDef.planLoop, false);
assert.deepEqual(metroDef.steps, []);
assert.equal(metroDef.fretStart, undefined);

// The metronome has no key, so it survives normalization without a root.
const metroNoRoot = normalizeCompanion({
  type: 'metronome',
  progression: 'ladder',
  startBpm: 72,
  stepSeconds: 45,
});
assert.ok(metroNoRoot, 'metronome normalizes without a root');
assert.equal(metroNoRoot.progression, 'ladder');
assert.equal(metroNoRoot.startBpm, 72);
assert.equal(metroNoRoot.stepSeconds, 45);
assert.equal(metroNoRoot.stringSet, undefined);

// Out-of-range plan values clamp instead of dropping the companion.
const metroClamp = normalizeCompanion({
  type: 'metronome',
  progression: 'nonsense',
  startBpm: 5000,
  targetBpm: 1,
  stepBpm: 900,
  stepSeconds: 0,
  rounds: 99,
  beatsPerBar: 40,
  subdiv: 'half',
  steps: [{ seconds: 30, bpm: 88, subdiv: 'triplet' }, 'junk'],
});
assert.ok(metroClamp);
assert.equal(metroClamp.progression, 'steady');
assert.equal(metroClamp.startBpm, 300);
assert.equal(metroClamp.targetBpm, 30);
assert.equal(metroClamp.stepBpm, 60);
assert.equal(metroClamp.stepSeconds, 5);
assert.equal(metroClamp.rounds, 16);
assert.equal(metroClamp.beatsPerBar, 12);
assert.equal(metroClamp.subdiv, 'quarter');
assert.equal(metroClamp.steps.length, 1);

// A saved plan round-trips through normalization unchanged.
const metroRound = normalizeCompanion(normalizeCompanion({
  type: 'metronome',
  progression: 'custom',
  steps: [
    { seconds: 60, bpm: 70, subdiv: 'quarter' },
    { seconds: 30, bpm: 100, subdiv: 'sixteenth' },
  ],
}));
assert.deepEqual(metroRound.steps, [
  { seconds: 60, bpm: 70, subdiv: 'quarter' },
  { seconds: 30, bpm: 100, subdiv: 'sixteenth' },
]);

const metroDesc = describeCompanion({
  type: 'metronome',
  progression: 'ramp',
  startBpm: 80,
  targetBpm: 100,
  stepBpm: 5,
  stepSeconds: 60,
});
assert.match(metroDesc, /Metronome · Step up · 80–100 BPM · 5 steps · 5:00/);

console.log('companions types: ok');
