// The pitch-runner exercise model: typed notes, stored config, Guitar Pro import.
// Run: node tests/exercises/runner-model.mjs

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGuitarPro } from '../../js/tab/guitarPro.js';
import { makeFixtures } from '../gp-player/fixtures/makeFixtures.mjs';
import {
  clampRunnerBeats,
  describeRunnerConfig,
  formatRunnerNotes,
  midiToNoteName,
  noteNameToMidi,
  normalizeRunnerConfig,
  parseRunnerNotes,
  runnerNoteBeats,
  runnerNoteRange,
  runnerNotesFromTabModel,
  runnerRunBeats,
  runnerTrackOptions,
  suggestOctaveShift,
  RUNNER_MAX_NOTES,
} from '../../js/runnerExerciseModel.js';

async function test(name, fn) {
  await fn();
  console.log('ok ', name);
}

await test('note names convert both ways', () => {
  assert.equal(noteNameToMidi('C4'), 60);
  assert.equal(noteNameToMidi('A4'), 69);
  assert.equal(noteNameToMidi('F#3'), 54);
  assert.equal(noteNameToMidi('Bb3'), 58);
  assert.equal(noteNameToMidi('C'), 60, 'a missing octave means octave 4');
  assert.equal(noteNameToMidi('H4'), null);
  assert.equal(noteNameToMidi(''), null);
  assert.equal(midiToNoteName(60), 'C4');
  assert.equal(midiToNoteName(54), 'F#3');
});

await test('typed notes carry a pitch and a hold length', () => {
  const parsed = parseRunnerNotes('C4 2, D4 1, E4');
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.notes, [
    { midi: 60, beats: 2 },
    { midi: 62, beats: 1 },
    { midi: 64, beats: 2 },
  ]);
  assert.deepEqual(parsed.errors, []);
});

await test('a note list accepts new lines and colons', () => {
  const parsed = parseRunnerNotes('C4:1\nG4:3');
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.notes, [
    { midi: 60, beats: 1 },
    { midi: 67, beats: 3 },
  ]);
});

await test('a bad entry reports an error and keeps the good ones out of ok', () => {
  const parsed = parseRunnerNotes('C4 2, zz 1');
  assert.equal(parsed.ok, false);
  assert.equal(parsed.notes.length, 1);
  assert.match(parsed.errors[0], /not a note name/);
});

await test('a hold length clamps to a quarter beat', () => {
  assert.equal(clampRunnerBeats(2.1), 2);
  assert.equal(clampRunnerBeats(0.01), 0.25);
  assert.equal(clampRunnerBeats(100), 16);
  assert.equal(clampRunnerBeats('nope'), 2);
});

await test('typed notes round-trip through the text form', () => {
  const parsed = parseRunnerNotes('C4 2, D4 1.5');
  assert.equal(formatRunnerNotes(parsed.notes), 'C4 2, D4 1.5');
});

await test('a run of more than the note limit stops at the limit', () => {
  const text = new Array(RUNNER_MAX_NOTES + 10).fill('C4 1').join(',');
  const parsed = parseRunnerNotes(text);
  assert.equal(parsed.notes.length, RUNNER_MAX_NOTES);
  assert.match(parsed.errors[0], /at most/);
});

await test('a stored config normalizes and a config without notes is dropped', () => {
  const config = normalizeRunnerConfig({
    source: 'manual',
    bpm: 5000,
    notes: [{ midi: 60, beats: 2 }, { midi: 'bad' }, { midi: 62, beats: 99 }],
    repeats: 3,
    restBeats: 0.5,
    metronome: false,
  });
  assert.equal(config.bpm, 300);
  assert.equal(config.repeats, 3);
  assert.equal(config.metronome, false);
  assert.equal(config.guide, true, 'guide stays on unless the record turns it off');
  assert.deepEqual(config.notes, [{ midi: 60, beats: 2 }, { midi: 62, beats: 16 }]);
  assert.equal(normalizeRunnerConfig({ notes: [] }), null);
  assert.equal(normalizeRunnerConfig(null), null);
});

await test('a run reports its range, its length, and a summary', () => {
  const config = normalizeRunnerConfig({
    bpm: 90, repeats: 2, restBeats: 1,
    notes: [{ midi: 60, beats: 2 }, { midi: 67, beats: 4 }],
  });
  assert.deepEqual(runnerNoteRange(config.notes), { low: 60, high: 67 });
  assert.equal(runnerRunBeats(config), 8, '2 + 4 beats of notes plus 2 beats of rest');
  assert.equal(describeRunnerConfig(config), '2 notes · C4–G4 · 90 BPM · 2×');
});

await test('a fixed note length holds every note the same', () => {
  const written = normalizeRunnerConfig({
    bpm: 90, repeats: 1, restBeats: 0,
    notes: [{ midi: 60, beats: 1 }, { midi: 67, beats: 4 }],
  });
  assert.equal(written.noteBeats, 0, 'a run with no fixed length keeps what it holds');
  assert.equal(runnerNoteBeats(written, written.notes[0]), 1);
  assert.equal(runnerNoteBeats(written, written.notes[1]), 4);
  assert.equal(runnerRunBeats(written), 5);

  const fixed = normalizeRunnerConfig({
    bpm: 90, repeats: 1, restBeats: 0, noteBeats: 2,
    notes: [{ midi: 60, beats: 1 }, { midi: 67, beats: 4 }],
  });
  assert.equal(fixed.noteBeats, 2);
  assert.equal(runnerNoteBeats(fixed, fixed.notes[0]), 2);
  assert.equal(runnerNoteBeats(fixed, fixed.notes[1]), 2);
  assert.equal(runnerRunBeats(fixed), 4);
  assert.deepEqual(
    fixed.notes,
    [{ midi: 60, beats: 1 }, { midi: 67, beats: 4 }],
    'the fixed length does not overwrite the written lengths',
  );
});

await test('a fixed note length stays in range', () => {
  assert.equal(normalizeRunnerConfig({ noteBeats: -3, notes: [{ midi: 60 }] }).noteBeats, 0);
  assert.equal(normalizeRunnerConfig({ noteBeats: 99, notes: [{ midi: 60 }] }).noteBeats, 16);
  assert.equal(normalizeRunnerConfig({ noteBeats: 1.1, notes: [{ midi: 60 }] }).noteBeats, 1);
  assert.equal(normalizeRunnerConfig({ notes: [{ midi: 60 }] }).noteBeats, 0);
});

// --- Guitar Pro import ------------------------------------------------------

function tabModel(events, tempo = 120) {
  return { events, tempo, measures: [], strings: [] };
}

await test('a Guitar Pro track becomes a run of single notes', () => {
  const model = tabModel([
    { midi: 55, start: 0, duration: 1 },
    { midi: 59, start: 0, duration: 1 },   // same start: the chord's top note wins
    { midi: 62, start: 1, duration: 2 },
    { midi: 64, start: 3, duration: 1, dead: true },   // dead notes drop out
    { midi: 65, start: 4, duration: 1, grace: true },  // grace notes drop out
    { midi: 67, start: 5, duration: 1 },
  ], 96);
  const result = runnerNotesFromTabModel(model);
  assert.equal(result.ok, true);
  assert.equal(result.bpm, 96);
  assert.deepEqual(result.notes, [
    { midi: 59, beats: 1 },
    { midi: 62, beats: 2 },
    { midi: 67, beats: 1 },
  ]);
});

await test('a tie lengthens the note before it', () => {
  const model = tabModel([
    { midi: 60, start: 0, duration: 2 },
    { midi: 60, start: 2, duration: 2, tie: true },
  ]);
  const result = runnerNotesFromTabModel(model);
  assert.deepEqual(result.notes, [{ midi: 60, beats: 4 }]);
});

await test('an octave shift moves the whole run', () => {
  const model = tabModel([{ midi: 48, start: 0, duration: 1 }]);
  assert.deepEqual(runnerNotesFromTabModel(model, { octaveShift: 1 }).notes, [{ midi: 60, beats: 1 }]);
  assert.deepEqual(runnerNotesFromTabModel(model, { octaveShift: -1 }).notes, [{ midi: 36, beats: 1 }]);
});

await test('a note the shift pushes out of the singable range is reported', () => {
  const model = tabModel([{ midi: 48, start: 0, duration: 1 }]);
  const result = runnerNotesFromTabModel(model, { octaveShift: -3 });
  assert.equal(result.ok, false);
  assert.equal(result.skipped, 1);
  assert.match(result.error, /Shift the octave/);
});

await test('a track with no pitched note reports why', () => {
  const result = runnerNotesFromTabModel(tabModel([{ midi: null, start: 0 }]));
  assert.equal(result.ok, false);
  assert.match(result.error, /no pitched notes/);
});

await test('the track picker lists only tracks that hold notes', () => {
  const options = runnerTrackOptions({
    tracks: [
      { name: 'Guitar', model: tabModel([{ midi: 60, start: 0, duration: 1 }]) },
      { name: 'Empty', model: tabModel([]) },
    ],
  });
  assert.equal(options.length, 1);
  assert.equal(options[0].name, 'Guitar');
  assert.equal(options[0].noteCount, 1);
});

await test('a low guitar part suggests an octave shift up', () => {
  assert.equal(suggestOctaveShift([{ midi: 40, beats: 1 }, { midi: 47, beats: 1 }]), 2);
  assert.equal(suggestOctaveShift([{ midi: 60, beats: 1 }, { midi: 67, beats: 1 }]), 0);
});

// --- a real Guitar Pro file -------------------------------------------------

await test('a real Guitar Pro file converts to a run', () => {
  const fixture = join(dirname(fileURLToPath(import.meta.url)), '..', 'gp-player', 'fixtures', 'ties-rhythm.gp5');
  if (!existsSync(fixture)) makeFixtures();
  const bytes = readFileSync(fixture);
  return parseGuitarPro(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
    .then((gp) => {
      const options = runnerTrackOptions(gp);
      assert.ok(options.length >= 1);
      const result = runnerNotesFromTabModel(gp.tracks[options[0].index].model);
      assert.equal(result.ok, true);
      assert.ok(result.notes.length > 0);
      result.notes.forEach((note) => {
        assert.ok(note.midi >= 24 && note.midi <= 96, 'every note stays in the singable range');
        assert.ok(note.beats >= 0.25 && note.beats <= 16, 'every hold length stays in range');
      });
      // The fixture holds a tie, so the run holds fewer notes than the track.
      assert.ok(result.notes.length < options[0].noteCount);
    });
});

console.log('\nall runner-model tests passed');
