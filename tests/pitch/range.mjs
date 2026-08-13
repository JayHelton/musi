import assert from 'node:assert/strict';
import {
  buildSequenceForTask,
  chromaticMidisInRange,
  midiInRange,
  placeOffsetsInRange,
  validateMidiSequence,
  buildPatternOffsets,
  chooseRootMidi,
} from '../../js/pitchExercises.js';
import { parseNote } from '../../js/theory.js';

export function runRangeTests() {
  console.log('test 11: generated targets stay inside selected range');
  {
    const low = 48;
    const high = 60;
    const result = buildSequenceForTask({
      task: 'pattern',
      patternId: 'five-tone',
      scaleName: 'Major (Ionian)',
      rootName: 'C',
      low,
      high,
    });
    assert.equal(result.ok, true, 'five-tone in C3–C4 should fit');
    for (const m of result.midis) {
      assert.ok(midiInRange(m, low, high), `midi ${m} must be in ${low}–${high}`);
    }

    const center = buildSequenceForTask({ task: 'center', low, high });
    assert.equal(center.ok, true);
    for (const m of center.midis) {
      assert.ok(midiInRange(m, low, high), `center midi ${m} in range`);
    }

    const land = buildSequenceForTask({ task: 'land', low, high });
    assert.equal(land.ok, true);
    for (const m of land.midis) {
      assert.ok(midiInRange(m, low, high), `land midi ${m} in range`);
    }
  }

  console.log('test 12: invalid range or pattern produces a clear error');
  {
    const low = 60;
    const high = 62;

    for (const patternId of ['full', 'octave-arp']) {
      const result = buildSequenceForTask({
        task: 'pattern',
        patternId,
        scaleName: 'Major (Ionian)',
        rootName: 'C',
        low,
        high,
      });
      assert.equal(result.ok, false, `${patternId} should not fit 60–62`);
      assert.ok(result.error && result.error.length > 0, 'error string must be nonempty');
    }

    const inverted = buildSequenceForTask({ task: 'center', low: 62, high: 60 });
    assert.equal(inverted.ok, true);
    assert.equal(inverted.midis.length, 3);

    const noNotes = validateMidiSequence([], 48, 60);
    assert.equal(noNotes.ok, false);
    assert.ok(noNotes.error);

    const placed = placeOffsetsInRange([0, 12], 0, 62, 60);
    assert.equal(placed.ok, false);

    const valid = validateMidiSequence([61, 63], 60, 62);
    assert.equal(valid.ok, false);
    assert.ok(valid.error);

    const chrom = chromaticMidisInRange(62, 60);
    assert.deepEqual(chrom, [60, 61, 62]);
  }

  console.log('test: chooseRootMidi prefers lowest fitting octave');
  {
    const rootPc = parseNote('C').semi;
    const root = chooseRootMidi(rootPc, 48, 60, 12);
    assert.ok(root + 12 <= 60, `root ${root} + span 12 must fit high 60`);
    assert.equal(root, 48);
  }
}
