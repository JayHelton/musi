/**
 * Smoke tests for Study Lab walkthrough model.
 * Run: node tests/study-lab/run.mjs
 */

import assert from 'node:assert/strict';
import { getStudyById } from '../../js/studyCatalog.js';
import {
  buildWalkthrough,
  scaleFretsOnString,
  descendingScaleSequence,
  openMidisForTuning,
  scaleOffsets,
  rootPitchClass,
  triadFromScaleDegree,
  triadQuality,
  intervalsForConcepts,
} from '../../js/studyLabModel.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

test('standard tuning open midis', () => {
  const open = openMidisForTuning('Standard');
  assert.deepEqual(open, [40, 45, 50, 55, 59, 64]);
});

test('harmonic minor frets on low E', () => {
  const open = openMidisForTuning('Standard');
  const hits = scaleFretsOnString({
    stringIndex: 0,
    openMidis: open,
    rootPc: rootPitchClass('E'),
    offsets: scaleOffsets('Harmonic Minor'),
    fretEnd: 12,
  });
  const labels = hits.map(h => h.degreeLabel);
  assert.ok(labels.includes('1'));
  assert.ok(labels.includes('7')); // raised 7
  assert.ok(labels.includes('b6'));
  const desc = descendingScaleSequence(hits, rootPitchClass('E'));
  assert.equal(desc[0].degreeLabel, '1');
  assert.ok(desc.length >= 7);
});

test('walkthrough includes mic-gated scale, orbit, chords, riff', () => {
  const study = getStudyById('harmonic-minor-harmony-symmetry');
  const wt = buildWalkthrough(study, { root: 'E', tuning: 'Standard' });
  const types = wt.steps.map(s => s.type);
  assert.ok(types.includes('intro'));
  assert.ok(types.includes('scale-string'));
  assert.ok(types.includes('scale-box'));
  assert.ok(types.includes('interval-orbit'));
  assert.ok(types.includes('chord-tones'));
  assert.ok(types.includes('drone-riff'));
  assert.ok(types.includes('application'));
  assert.ok(types.includes('complete'));

  const scaleStep = wt.steps.find(s => s.type === 'scale-string');
  assert.equal(scaleStep.stringIndex, 0);
  assert.ok(scaleStep.mic);
  assert.ok(scaleStep.sequence.length >= 5);
  assert.ok(scaleStep.positions.length >= 5);
});

test('triad qualities from harmonic minor degrees', () => {
  const offsets = scaleOffsets('Harmonic Minor');
  // i = minor, III = major/aug depending — degree 0 minor
  const i = triadFromScaleDegree(offsets, 0);
  const q0 = triadQuality([0, ((i[1] - i[0]) % 12 + 12) % 12, ((i[2] - i[0]) % 12 + 12) % 12]);
  assert.equal(q0, 'minor');
});

test('intervalsForConcepts maps flat2 to 1 and tritone to 6', () => {
  const ints = intervalsForConcepts(['flat2', 'tritone', 'phrygian']);
  assert.ok(ints.includes(1));
  assert.ok(ints.includes(6));
});

test('major-scale study still builds foundation walkthrough', () => {
  const study = getStudyById('major-scale-construction');
  const wt = buildWalkthrough(study, { root: 'C', tuning: 'Standard' });
  assert.ok(wt.steps.some(s => s.type === 'scale-string'));
  assert.ok(wt.steps.some(s => s.mic));
});

console.log(`\n${passed} tests passed`);
