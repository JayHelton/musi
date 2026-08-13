import assert from 'node:assert/strict';
import { pickNextCenterMidi, buildSequenceForTask } from '../../js/pitchExercises.js';

export function runTaskTests() {
  console.log('test: pickNextCenterMidi deprioritizes mastered notes');
  {
    const candidates = [60, 61, 62];
    const stats = {
      60: { attempts: 10, fails: 0, lastErrorAbs: 2, consecutivePasses: 2 },
      61: { attempts: 5, fails: 4, lastErrorAbs: 25, consecutivePasses: 0 },
      62: { attempts: 3, fails: 2, lastErrorAbs: 15, consecutivePasses: 0 },
    };

    let hits61 = 0;
    let hits62 = 0;
    const trials = 200;
    for (let i = 0; i < trials; i++) {
      const pick = pickNextCenterMidi(candidates, stats);
      if (pick === 61) hits61++;
      if (pick === 62) hits62++;
    }
    assert.ok(hits61 + hits62 > trials * 0.7, 'failing notes should dominate picks');
    assert.ok(hits61 > hits62, 'larger-error note should be picked more often');
  }

  console.log('test: interval sequence fits range');
  {
    const result = buildSequenceForTask({
      task: 'interval',
      low: 48,
      high: 72,
      intervalSemitones: 'P5',
      intervalDirection: 'ascending',
    });
    assert.equal(result.ok, true);
    assert.equal(result.midis.length, 1);
    assert.ok(result.anchorMidi != null);
    assert.equal(result.midis[0], result.anchorMidi + 7);
  }
}
