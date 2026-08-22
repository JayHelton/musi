import assert from 'node:assert/strict';
import { scoreRunnerNote } from '../../js/pitchMetrics.js';
import {
  buildSequenceForTask,
  midiInRange,
  SCALE_PATTERNS,
} from '../../js/pitchExercises.js';
import {
  planNotes,
  noteDurationBeats,
  noteStepBeats,
  listenPassBeats,
  visibleBeatsAhead,
  NOTE_LENGTHS,
  REST_CHOICES,
  LEAD_IN_BEATS,
  DEFAULT_RUNNER_TEMPO,
} from '../../js/pitchRunner.js';
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

  console.log('test: Runner note lengths include long sustains');
  {
    for (const beats of [1, 2, 3, 4, 6, 8]) {
      assert.ok(NOTE_LENGTHS.includes(beats), `note length ${beats} must be selectable`);
    }
    assert.deepEqual(REST_CHOICES, [0, 0.5, 1, 2], 'rest choices must be 0, 0.5, 1 and 2 beats');
    assert.equal(LEAD_IN_BEATS, 8, 'count-in must be two 4/4 measures');
    assert.ok(DEFAULT_RUNNER_TEMPO >= 60 && DEFAULT_RUNNER_TEMPO <= 90, 'runner tempo must start slow');
  }

  console.log('test: Runner rest adds empty space and keeps the note length');
  {
    // With no rest the bar is a little shorter than the note, so two bars do
    // not touch. The next note still starts one note length later.
    const tight = planNotes({
      patternSeq: [60, 62, 64],
      noteBeats: 2,
      restBeats: 0,
      startBeat: 0,
      untilBeat: 6,
    });
    assert.deepEqual(tight.notes.map(n => n.startBeat), [0, 2, 4], 'no rest steps by the note length');
    assert.ok(tight.notes[0].dur < 2, 'no rest keeps a small visual gap');
    assert.ok(tight.notes[0].dur > 1.7, 'the visual gap stays small');
    assert.equal(tight.nextBeat, 6, 'nextBeat must land on the next note start');
    assert.equal(tight.seqIdx, 3, 'seqIdx must advance one step for each note');

    // With a rest the bar keeps the full note length. The rest becomes real
    // empty space before the next note.
    const rested = planNotes({
      patternSeq: [60, 62, 64],
      noteBeats: 2,
      restBeats: 1,
      startBeat: 0,
      untilBeat: 9,
    });
    assert.deepEqual(rested.notes.map(n => n.startBeat), [0, 3, 6], 'rest 1 steps by 3 beats');
    rested.notes.forEach(n => assert.equal(n.dur, 2, 'the bar keeps the full note length'));
    const gap = rested.notes[1].startBeat - (rested.notes[0].startBeat + rested.notes[0].dur);
    assert.equal(gap, 1, 'the empty space must equal the rest');

    // A long note with a half-beat rest.
    const long = planNotes({
      patternSeq: [60],
      noteBeats: 8,
      restBeats: 0.5,
      startBeat: 4,
      untilBeat: 22,
    });
    assert.deepEqual(long.notes.map(n => n.startBeat), [4, 12.5, 21], 'long notes step by 8.5 beats');
    long.notes.forEach(n => assert.equal(n.dur, 8, 'a long bar lasts 8 beats'));

    // The plan repeats the melody, and it starts from the given index.
    const cycled = planNotes({
      patternSeq: [60, 62],
      noteBeats: 1,
      restBeats: 0,
      startBeat: 0,
      seqIdx: 1,
      untilBeat: 4,
    });
    assert.deepEqual(cycled.notes.map(n => n.midi), [62, 60, 62, 60], 'the melody must repeat');

    assert.equal(noteStepBeats(4, 2), 6, 'the step is the note length plus the rest');
    assert.equal(noteDurationBeats(4, 2), 4, 'a rest keeps the full note length');
    assert.equal(planNotes({ patternSeq: [], noteBeats: 2, restBeats: 1, startBeat: 0, untilBeat: 8 }).notes.length, 0,
      'an empty melody must plan no notes');
  }

  console.log('test: Runner listen phase lasts one pass of the melody');
  {
    assert.equal(listenPassBeats(5, 2, 1), 15, 'five notes of 2 beats plus 1 rest last 15 beats');
    assert.equal(listenPassBeats(8, 1, 0), 8, 'eight notes of 1 beat last 8 beats');
    assert.equal(listenPassBeats(0, 2, 1), 0, 'an empty melody has no listen phase');
    assert.equal(listenPassBeats(3, 8, 2), 30, 'long notes make a long listen phase');
  }

  console.log('test: Runner runway fits the note and the rest');
  {
    assert.equal(visibleBeatsAhead(1, 0), 6, 'a 1-beat note keeps the old runway');
    assert.equal(visibleBeatsAhead(2, 0), 8, 'a 2-beat note keeps the old runway');
    for (const beats of NOTE_LENGTHS) {
      for (const rest of REST_CHOICES) {
        const ahead = visibleBeatsAhead(beats, rest);
        assert.ok(ahead >= beats + rest + 4, `runway ${ahead} must fit ${beats} beats plus ${rest} rest`);
      }
    }
  }
}
