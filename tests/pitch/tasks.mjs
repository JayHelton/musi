import assert from 'node:assert/strict';
import {
  pickNextCenterMidi,
  buildSequenceForTask,
  buildPatternOffsets,
  applyDirection,
  SEQUENCE_DIRECTIONS,
} from '../../js/pitchExercises.js';

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

  console.log('test: sequence direction changes the run shape');
  {
    const scale = 'Major (Ionian)';
    const natural = buildPatternOffsets(scale, 'full');
    assert.deepEqual(buildPatternOffsets(scale, 'full', 'natural'), natural, 'natural must not change the pattern');

    const up = buildPatternOffsets(scale, 'full', 'up');
    assert.deepEqual(up, [0, 2, 4, 5, 7, 9, 11, 12], 'up must ascend once');

    const down = buildPatternOffsets(scale, 'full', 'down');
    assert.deepEqual(down, [...up].reverse(), 'down must be the reverse of up');

    const updown = buildPatternOffsets(scale, 'full', 'updown');
    assert.equal(updown[0], 0, 'up and down must start on the root');
    assert.equal(updown[updown.length - 1], 0, 'up and down must return to the root');
    assert.equal(Math.max(...updown), 12, 'up and down must reach the octave');

    // A descending catalog pattern still gives a real ascent.
    const flipped = buildPatternOffsets(scale, 'descending', 'up');
    assert.deepEqual(flipped, [0, 2, 4, 5, 7, 9, 11, 12], 'up must ascend for a descending pattern');

    assert.deepEqual(applyDirection([], 'up'), [], 'an empty pattern stays empty');
    assert.deepEqual(applyDirection([5], 'updown'), [5], 'one note stays one note');
    assert.equal(SEQUENCE_DIRECTIONS.length, 4, 'four run directions must exist');
  }

  console.log('test: a directed run still fits the selected range');
  {
    for (const direction of SEQUENCE_DIRECTIONS.map(d => d.id)) {
      const built = buildSequenceForTask({
        task: 'pattern',
        patternId: 'full',
        scaleName: 'Major (Ionian)',
        rootName: 'C',
        direction,
        low: 48,
        high: 72,
      });
      assert.equal(built.ok, true, `${direction} must fit 48-72`);
      for (const m of built.midis) {
        assert.ok(m >= 48 && m <= 72, `${direction} midi ${m} must fit the range`);
      }
    }
  }
}
