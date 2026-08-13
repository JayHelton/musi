import assert from 'node:assert/strict';
import { scoreRunnerNote } from '../../js/pitchMetrics.js';
import {
  buildSequenceForTask,
  midiInRange,
  SCALE_PATTERNS,
} from '../../js/pitchExercises.js';
import { samplesForTone } from './helpers.mjs';

const TARGET_MIDI = 69;

export function runRunnerTests() {
  console.log('test 13: Runner does not mark +29-cent tone as Centered');
  {
    const samples = samplesForTone({ fps: 60, durationMs: 1000, centsOff: 29, targetMidi: TARGET_MIDI });
    const scored = scoreRunnerNote(samples, TARGET_MIDI);
    assert.notEqual(scored.result, 'centered', '+29 cents must not be Centered');
    assert.ok(scored.noteAccuracy < 50 || scored.result === 'miss', 'accuracy must be low or Miss');
    assert.ok(Math.abs(scored.centerErrorCents - 29) < 1, 'center should be near +29');
  }

  console.log('test: stable 0-cent tone is Centered with high accuracy');
  {
    const samples = samplesForTone({ fps: 60, durationMs: 1000, centsOff: 0, targetMidi: TARGET_MIDI });
    const scored = scoreRunnerNote(samples, TARGET_MIDI);
    assert.equal(scored.result, 'centered', '0 cents should be Centered');
    assert.ok(scored.noteAccuracy >= 90, `accuracy ${scored.noteAccuracy} should be high`);
  }

  console.log('test: +9-cent stable tone is Centered');
  {
    const samples = samplesForTone({ fps: 60, durationMs: 1000, centsOff: 9, targetMidi: TARGET_MIDI });
    const scored = scoreRunnerNote(samples, TARGET_MIDI);
    assert.equal(scored.result, 'centered', '+9 cents with low MAE should be Centered');
  }

  console.log('test: +18-cent tone is Close or Miss');
  {
    const samples = samplesForTone({ fps: 60, durationMs: 1000, centsOff: 18, targetMidi: TARGET_MIDI });
    const scored = scoreRunnerNote(samples, TARGET_MIDI);
    assert.ok(scored.result === 'close' || scored.result === 'miss', '+18 cents should be Close or Miss');
    assert.notEqual(scored.result, 'centered', '+18 cents must not be Centered');
  }

  console.log('test: Runner pattern sequences stay inside range');
  {
    const low = 48;
    const high = 60;
    for (const pattern of SCALE_PATTERNS) {
      const built = buildSequenceForTask({
        task: 'pattern',
        patternId: pattern.id,
        scaleName: 'Major (Ionian)',
        rootName: 'C',
        low,
        high,
      });
      if (!built.ok) continue;
      for (const m of built.midis) {
        assert.ok(midiInRange(m, low, high), `${pattern.id} midi ${m} must fit ${low}–${high}`);
      }
    }

    const tight = buildSequenceForTask({
      task: 'pattern',
      patternId: 'full',
      scaleName: 'Major (Ionian)',
      rootName: 'C',
      low: 60,
      high: 62,
    });
    assert.equal(tight.ok, false, 'full scale should not fit a 3-semitone range');
    assert.ok(tight.error && tight.error.length > 0, 'range error must be nonempty');
  }
}
