import assert from 'node:assert/strict';
import { midiFreq } from '../../js/audio.js';
import { midiInRange } from '../../js/pitchExercises.js';
import {
  buildHarmonySequence,
  clampDroneLevel,
  DRONE_LEVEL_DEFAULT,
  DRONE_LEVEL_MAX,
  DRONE_LEVEL_MIN,
  HARMONY_DEFAULT_IDS,
  HARMONY_DIRECTIONS,
  HARMONY_INTERVALS,
  harmonyLabelFor,
  harmonyOffsets,
  isDroneBleed,
  parseDirection,
  parseIntervalIds,
  serializeIntervalIds,
} from '../../js/pitchHarmony.js';

const RANGE_PRESETS = [
  { id: 'bass',     low: 40, high: 64 },
  { id: 'baritone', low: 43, high: 67 },
  { id: 'tenor',    low: 48, high: 72 },
  { id: 'alto',     low: 53, high: 77 },
  { id: 'soprano',  low: 60, high: 84 },
];

const ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export function runHarmonyTests() {
  console.log('test: harmony interval ids read back in catalog order');
  {
    assert.deepEqual(parseIntervalIds('P5,M3'), ['M3', 'P5'], 'ids keep the catalog order');
    assert.deepEqual(parseIntervalIds(['m3']), ['m3'], 'an array reads the same as a string');
    assert.deepEqual(parseIntervalIds('P5,nonsense'), ['P5'], 'an unknown id drops out');
    assert.deepEqual(parseIntervalIds(''), HARMONY_DEFAULT_IDS, 'an empty pick falls back');
    assert.deepEqual(parseIntervalIds('nope'), HARMONY_DEFAULT_IDS, 'only bad ids fall back');
    assert.equal(serializeIntervalIds(['P5', 'M3']), 'M3,P5', 'saving keeps the catalog order');
    assert.equal(parseIntervalIds('P1').length > 0, true, 'unison is not in the catalog');
    assert.equal(HARMONY_INTERVALS.some(i => i.semitones === 0), false, 'no unison interval');
  }

  console.log('test: harmony direction reads back, and anything else is Above');
  {
    for (const dir of HARMONY_DIRECTIONS) {
      assert.equal(parseDirection(dir.id), dir.id, `${dir.id} reads back`);
    }
    assert.equal(parseDirection('sideways'), 'above', 'an unknown direction is Above');
    assert.equal(parseDirection(undefined), 'above', 'no direction is Above');
  }

  console.log('test: harmony offsets are signed, sorted, and unique');
  {
    assert.deepEqual(harmonyOffsets(['M3', 'P5'], 'above'), [4, 7]);
    assert.deepEqual(harmonyOffsets(['M3', 'P5'], 'below'), [-7, -4]);
    assert.deepEqual(harmonyOffsets(['M3', 'P5'], 'both'), [-7, -4, 4, 7]);
    for (const dir of HARMONY_DIRECTIONS) {
      const offsets = harmonyOffsets(HARMONY_INTERVALS.map(i => i.id), dir.id);
      const sorted = [...offsets].sort((a, b) => a - b);
      assert.deepEqual(offsets, sorted, `${dir.id} offsets are sorted`);
      assert.equal(new Set(offsets).size, offsets.length, `${dir.id} offsets are unique`);
      assert.equal(offsets.includes(0), false, `${dir.id} never sings the root`);
    }
  }

  console.log('test: harmony bar labels name the interval and the side');
  {
    assert.equal(harmonyLabelFor(4), 'M3');
    assert.equal(harmonyLabelFor(-4), 'M3 below');
    assert.equal(harmonyLabelFor(12), 'P8');
    assert.equal(harmonyLabelFor(99), '', 'an unknown offset has no label');
  }

  console.log('test: every harmony note and the root fit the vocal range');
  {
    for (const preset of RANGE_PRESETS) {
      for (const root of ROOTS) {
        for (const dir of HARMONY_DIRECTIONS) {
          const built = buildHarmonySequence({
            rootName: root,
            intervalIds: ['m3', 'M3', 'P5'],
            direction: dir.id,
            low: preset.low,
            high: preset.high,
          });
          const where = `${root} ${dir.id} in ${preset.id}`;
          assert.equal(built.ok, true, `${where} must build`);
          assert.ok(
            midiInRange(built.rootMidi, preset.low, preset.high),
            `${where}: the root must sit inside the range`,
          );
          for (const midi of built.midis) {
            assert.ok(
              midiInRange(midi, preset.low, preset.high),
              `${where}: note ${midi} must fit the range`,
            );
          }
          for (const [i, off] of built.offsets.entries()) {
            assert.equal(built.midis[i], built.rootMidi + off,
              `${where}: every note comes off the placed root`);
          }
          assert.equal(built.midis.length, built.offsets.length, 'one note per offset');
          assert.equal(built.midis.includes(built.rootMidi), false,
            'the singer never sings the root');
        }
      }
    }
  }

  console.log('test: an interval that does not fit is dropped and named');
  {
    // A bass range holds 25 semitones. No Bb of that range has a fifth both
    // above it and below it, so the build keeps the side that fits.
    const built = buildHarmonySequence({
      rootName: 'Bb',
      intervalIds: ['P5'],
      direction: 'both',
      low: 40,
      high: 64,
    });
    assert.equal(built.ok, true, 'the drill still runs');
    assert.deepEqual(built.offsets, [7], 'only the fifth above fits');
    assert.deepEqual(built.dropped, [-7], 'the fifth below is named as dropped');
    assert.equal(built.midis[0], built.rootMidi + 7);
  }

  console.log('test: a build that fits everything drops nothing');
  {
    const built = buildHarmonySequence({
      rootName: 'C',
      intervalIds: HARMONY_DEFAULT_IDS,
      direction: 'above',
      low: 48,
      high: 72,
    });
    assert.equal(built.ok, true);
    assert.deepEqual(built.dropped, [], 'nothing is dropped');
    assert.deepEqual(built.offsets, [4, 7], 'a third and a fifth above');
  }

  console.log('test: the placed root carries the root pitch class');
  {
    const built = buildHarmonySequence({
      rootName: 'Eb',
      intervalIds: ['P5'],
      direction: 'above',
      low: 48,
      high: 72,
    });
    assert.equal(built.ok, true);
    assert.equal(((built.rootMidi % 12) + 12) % 12, 3, 'Eb is pitch class 3');
  }

  console.log('test: a range too narrow for any interval reports an error');
  {
    const built = buildHarmonySequence({
      rootName: 'C',
      intervalIds: ['P8'],
      direction: 'both',
      low: 60,
      high: 67,
    });
    assert.equal(built.ok, false, 'no octave fits an 8-semitone range');
    assert.ok(built.error && built.error.length > 0, 'the error must be nonempty');
    assert.equal(built.rootMidi, null, 'a failed build names no root');
    assert.deepEqual(built.midis, [], 'a failed build sings nothing');
  }

  console.log('test: a range with no root note reports an error');
  {
    const built = buildHarmonySequence({
      rootName: 'C',
      intervalIds: ['P5'],
      direction: 'above',
      low: 61,
      high: 71,
    });
    assert.equal(built.ok, false, 'no C sits between C#4 and B4');
    assert.ok(built.error && built.error.length > 0, 'the error must be nonempty');
  }

  console.log('test: a drone pitch is dropped, but an octave harmony still scores');
  {
    const droneMidi = 60;
    assert.equal(isDroneBleed(midiFreq(droneMidi), droneMidi), true, 'the drone pitch is bleed');
    assert.equal(isDroneBleed(midiFreq(droneMidi) * Math.pow(2, 40 / 1200), droneMidi), true,
      '40 cents off the drone is still bleed');
    assert.equal(isDroneBleed(midiFreq(droneMidi + 2), droneMidi), false,
      'a whole tone above the drone is the voice');
    assert.equal(isDroneBleed(midiFreq(droneMidi + 12), droneMidi), false,
      'an octave harmony must score');
    assert.equal(isDroneBleed(midiFreq(droneMidi - 12), droneMidi), false,
      'an octave below the drone must score');
    assert.equal(isDroneBleed(-1, droneMidi), false, 'no pitch is not bleed');
    assert.equal(isDroneBleed(midiFreq(60), null), false, 'no drone is not bleed');
  }

  console.log('test: the drone level stays between its limits');
  {
    assert.equal(clampDroneLevel(0), DRONE_LEVEL_MIN);
    assert.equal(clampDroneLevel(9), DRONE_LEVEL_MAX);
    assert.equal(clampDroneLevel('abc'), DRONE_LEVEL_DEFAULT);
    assert.equal(clampDroneLevel(0.2), 0.2);
  }
}
