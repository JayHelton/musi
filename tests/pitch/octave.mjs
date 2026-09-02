import assert from 'node:assert/strict';
import {
  buildSequenceForTask,
  midiInRange,
  midiOctave,
  pickAnchorForOctave,
  placeOffsetsInRange,
  SCALE_PATTERNS,
} from '../../js/pitchExercises.js';
import { buildHarmonySequence, HARMONY_DIRECTIONS } from '../../js/pitchHarmony.js';
import {
  normalizeRunnerConfig,
  runnerOctaveShifts,
  RUNNER_MAX_MIDI,
  RUNNER_MIN_MIDI,
} from '../../js/runnerExerciseModel.js';

const RANGE_PRESETS = [
  { id: 'bass',     low: 40, high: 64 },
  { id: 'baritone', low: 43, high: 67 },
  { id: 'tenor',    low: 48, high: 72 },
  { id: 'alto',     low: 53, high: 77 },
  { id: 'soprano',  low: 60, high: 84 },
];

const ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export function runOctaveTests() {
  console.log('test: an octave number counts middle C as C4');
  {
    assert.equal(midiOctave(60), 4);
    assert.equal(midiOctave(48), 3);
    assert.equal(midiOctave(59), 3, 'B3 sits under middle C');
    assert.equal(midiOctave(84), 6);
  }

  console.log('test: the anchor pick takes the octave, or the nearest one');
  {
    const anchors = [48, 60, 72];
    assert.equal(pickAnchorForOctave([], 4), null, 'no anchor gives no pick');
    assert.equal(pickAnchorForOctave(anchors), 48, 'no octave keeps the lowest anchor');
    assert.equal(pickAnchorForOctave(anchors, null), 48, 'null is no octave');
    assert.equal(pickAnchorForOctave(anchors, 4), 60, 'octave 4 takes C4');
    assert.equal(pickAnchorForOctave(anchors, 5), 72, 'octave 5 takes C5');
    assert.equal(pickAnchorForOctave(anchors, 1), 48, 'a low octave takes the lowest anchor');
    assert.equal(pickAnchorForOctave(anchors, 9), 72, 'a high octave takes the highest anchor');
  }

  console.log('test: a placed pattern names every octave it fits in');
  {
    const offsets = [0, 2, 4, 5, 7, 9, 11, 12];
    const placed = placeOffsetsInRange(offsets, 0, 48, 84);
    assert.equal(placed.ok, true);
    assert.deepEqual(placed.octaves, [3, 4, 5], 'C3, C4, and C5 all hold the pattern');
    assert.equal(placed.rootMidi, 48, 'no pick keeps the lowest root');

    const high = placeOffsetsInRange(offsets, 0, 48, 84, 5);
    assert.equal(high.rootMidi, 72, 'octave 5 starts the pattern on C5');
    assert.deepEqual(high.octaves, placed.octaves, 'the choices do not change with the pick');

    const missing = placeOffsetsInRange(offsets, 0, 48, 84, 9);
    assert.equal(missing.rootMidi, 72, 'an octave above the range takes the highest root');

    const tooWide = placeOffsetsInRange([0, 24], 0, 48, 60, 3);
    assert.equal(tooWide.ok, false, 'a pattern that does not fit still fails');
    assert.deepEqual(tooWide.octaves, [], 'a failed placement offers no octave');
  }

  console.log('test: a start octave moves the melody and keeps it in the vocal range');
  {
    for (const preset of RANGE_PRESETS) {
      for (const root of ROOTS) {
        for (const pattern of SCALE_PATTERNS) {
          const auto = buildSequenceForTask({
            task: 'pattern',
            patternId: pattern.id,
            scaleName: 'Major (Ionian)',
            rootName: root,
            low: preset.low,
            high: preset.high,
          });
          if (!auto.ok) continue;
          for (const octave of auto.octaves) {
            const built = buildSequenceForTask({
              task: 'pattern',
              patternId: pattern.id,
              scaleName: 'Major (Ionian)',
              rootName: root,
              low: preset.low,
              high: preset.high,
              startOctave: octave,
            });
            assert.equal(built.ok, true, `${root} ${pattern.id} fits octave ${octave}`);
            assert.equal(
              midiOctave(built.rootMidi), octave,
              `${root} ${pattern.id} starts in octave ${octave}`,
            );
            built.midis.forEach((midi) => {
              assert.equal(
                midiInRange(midi, preset.low, preset.high), true,
                `${root} ${pattern.id} keeps ${midi} inside the ${preset.id} range`,
              );
            });
          }
        }
      }
    }
  }

  console.log('test: the melody keeps its shape in every octave');
  {
    const low = buildSequenceForTask({
      task: 'pattern',
      patternId: 'interval-drill',
      scaleName: 'Major (Ionian)',
      rootName: 'C',
      low: 48,
      high: 84,
      startOctave: 3,
    });
    const high = buildSequenceForTask({
      task: 'pattern',
      patternId: 'interval-drill',
      scaleName: 'Major (Ionian)',
      rootName: 'C',
      low: 48,
      high: 84,
      startOctave: 4,
    });
    assert.equal(high.rootMidi - low.rootMidi, 12, 'one octave separates the two roots');
    assert.deepEqual(
      high.midis.map(midi => midi - 12), low.midis,
      'every note moves by the same octave',
    );
  }

  console.log('test: a harmony drill starts in the octave the singer picks');
  {
    const auto = buildHarmonySequence({
      rootName: 'C',
      intervalIds: ['M3', 'P5'],
      direction: 'above',
      low: 48,
      high: 72,
    });
    assert.equal(auto.ok, true);
    assert.deepEqual(auto.octaves, [3, 4], 'C3 and C4 both hold the drill');
    assert.equal(auto.rootMidi, 60, 'no pick keeps the root near the middle of the range');

    const low = buildHarmonySequence({
      rootName: 'C',
      intervalIds: ['M3', 'P5'],
      direction: 'above',
      low: 48,
      high: 72,
      startOctave: 3,
    });
    assert.equal(low.rootMidi, 48, 'octave 3 drops the root to C3');
    assert.deepEqual(low.midis, [52, 55], 'the singer keeps the same two intervals');
    assert.deepEqual(low.dropped, [], 'no interval drops out');
  }

  console.log('test: every harmony octave keeps the notes in the vocal range');
  {
    for (const preset of RANGE_PRESETS) {
      for (const root of ROOTS) {
        for (const dir of HARMONY_DIRECTIONS) {
          const auto = buildHarmonySequence({
            rootName: root,
            intervalIds: ['m3', 'P5', 'P8'],
            direction: dir.id,
            low: preset.low,
            high: preset.high,
          });
          if (!auto.ok) continue;
          for (const octave of auto.octaves) {
            const built = buildHarmonySequence({
              rootName: root,
              intervalIds: ['m3', 'P5', 'P8'],
              direction: dir.id,
              low: preset.low,
              high: preset.high,
              startOctave: octave,
            });
            assert.equal(built.ok, true, `${root} ${dir.id} still runs in octave ${octave}`);
            assert.equal(midiOctave(built.rootMidi), octave, 'the root takes the picked octave');
            assert.ok(built.midis.length > 0, 'the pass sings one interval or more');
            [built.rootMidi, ...built.midis].forEach((midi) => {
              assert.equal(
                midiInRange(midi, preset.low, preset.high), true,
                `${root} ${dir.id} keeps ${midi} inside the ${preset.id} range`,
              );
            });
          }
        }
      }
    }
  }

  console.log('test: a saved run moves by whole octaves and stays playable');
  {
    const notes = [{ midi: 60, beats: 2 }, { midi: 67, beats: 2 }];
    const shifts = runnerOctaveShifts(notes);
    assert.ok(shifts.includes(0), 'the written octave is always a choice');
    shifts.forEach((octaves) => {
      notes.forEach((note) => {
        const moved = note.midi + octaves * 12;
        assert.ok(
          moved >= RUNNER_MIN_MIDI && moved <= RUNNER_MAX_MIDI,
          `${moved} stays inside the runner MIDI range`,
        );
      });
    });

    const wide = runnerOctaveShifts([{ midi: RUNNER_MIN_MIDI + 2, beats: 2 }, { midi: RUNNER_MAX_MIDI - 2, beats: 2 }]);
    assert.deepEqual(wide, [0], 'a run that fills the range cannot move');
    assert.deepEqual(runnerOctaveShifts([]), [0], 'an empty run cannot move');

    const config = normalizeRunnerConfig({ notes: [{ midi: 67, beats: 2 }], bpm: 80 });
    const anchors = runnerOctaveShifts(config.notes).map(octaves => config.notes[0].midi + octaves * 12);
    assert.equal(pickAnchorForOctave(anchors, 3), 55, 'octave 3 drops G4 to G3');
    assert.equal(midiOctave(pickAnchorForOctave(anchors, 4)), 4, 'octave 4 keeps G4');
  }
}
