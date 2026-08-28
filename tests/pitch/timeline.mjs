import assert from 'node:assert/strict';
import {
  nextPassStartBeat,
  runnerPassPosition,
  runnerScoredBudget,
  runnerStepBudget,
  PASS_GAP_MIN_BEATS,
  RUNNER_BEATS_PER_MEASURE,
} from '../../js/runnerTimeline.js';

/** Walk the timeline and collect the place of every note. */
function plan(passLength, previewOn, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(runnerPassPosition(i, passLength, previewOn));
  return out;
}

export function runTimelineTests() {
  console.log('timeline test 1: preview off keeps one pass per phrase');
  {
    const steps = plan(3, false, 6);
    assert.deepEqual(steps.map(s => s.step), [0, 1, 2, 0, 1, 2]);
    assert.deepEqual(steps.map(s => s.pass), [0, 0, 0, 1, 1, 1]);
    assert.ok(steps.every(s => s.preview === false), 'no note previews');
  }

  console.log('timeline test 2: preview on plays each phrase twice');
  {
    const steps = plan(3, true, 12);
    // The app plays the phrase, then the singer sings the same phrase.
    assert.deepEqual(steps.map(s => s.preview), [
      true, true, true,
      false, false, false,
      true, true, true,
      false, false, false,
    ]);
    // Both passes hold the same notes in the same order.
    assert.deepEqual(steps.slice(0, 3).map(s => s.step), steps.slice(3, 6).map(s => s.step));
  }

  console.log('timeline test 3: a pass start is the first note of a pass');
  {
    const steps = plan(2, true, 6);
    assert.deepEqual(steps.map(s => s.passStart), [true, false, true, false, true, false]);
  }

  console.log('timeline test 4: an empty phrase has no place on the timeline');
  {
    assert.equal(runnerPassPosition(0, 0, true), null);
    assert.equal(runnerPassPosition(0, -3, false), null);
  }

  console.log('timeline test 5: preview doubles the timeline but not the score');
  {
    assert.equal(runnerStepBudget(4, 2, false), 8);
    assert.equal(runnerStepBudget(4, 2, true), 16);
    assert.equal(runnerScoredBudget(4, 2), 8);
    // An endless run has no budget, with or without preview.
    assert.equal(runnerStepBudget(4, 0, true), 0);
    assert.equal(runnerScoredBudget(4, 0), 0);
    assert.equal(runnerStepBudget(0, 3, true), 0);
  }

  console.log('timeline test 6: a new pass starts on the next bar line');
  {
    assert.equal(RUNNER_BEATS_PER_MEASURE, 4);
    // A phrase that ends part way through a bar waits for the next bar.
    assert.equal(nextPassStartBeat(9), 12);
    assert.equal(nextPassStartBeat(10.5), 12);
    // A phrase that ends on a bar line waits one whole bar, because the gap
    // keeps the app's voice away from the singer's first note.
    assert.equal(nextPassStartBeat(12), 16);
    assert.ok(PASS_GAP_MIN_BEATS > 0, 'the gap is not zero');
    assert.equal(nextPassStartBeat(NaN), 0);
  }
}
