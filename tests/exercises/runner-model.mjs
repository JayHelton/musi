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
  clampRunnerText,
  describeRunnerConfig,
  fillRunnerTextFromAnnotations,
  formatRunnerNotes,
  midiToNoteName,
  noteNameToMidi,
  normalizeRunnerConfig,
  parseRunnerNotes,
  runnerNoteBeats,
  runnerNoteRange,
  runnerConfigFromTranscription,
  runnerNotesFromTabModel,
  runnerNotesFromTranscription,
  runnerRunBeats,
  runnerTextCount,
  runnerTrackOptions,
  suggestOctaveShift,
  RUNNER_MAX_NOTES,
  RUNNER_TEXT_LIMIT,
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
  assert.equal(config.preview, false, 'preview stays off unless the record turns it on');
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

await test('a run in preview mode says so and keeps the flag', () => {
  const config = normalizeRunnerConfig({
    bpm: 90, repeats: 2, restBeats: 1, preview: true,
    notes: [{ midi: 60, beats: 2 }, { midi: 67, beats: 4 }],
  });
  assert.equal(config.preview, true);
  assert.equal(describeRunnerConfig(config), '2 notes · C4–G4 · 90 BPM · 2× · preview');
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
  // Each note keeps the beat it sat on, so a section note can find it again.
  assert.deepEqual(result.notes, [
    { midi: 59, beats: 1, scoreBeat: 0 },
    { midi: 62, beats: 2, scoreBeat: 1 },
    { midi: 67, beats: 1, scoreBeat: 5 },
  ]);
});

await test('a tie lengthens the note before it', () => {
  const model = tabModel([
    { midi: 60, start: 0, duration: 2 },
    { midi: 60, start: 2, duration: 2, tie: true },
  ]);
  const result = runnerNotesFromTabModel(model);
  assert.deepEqual(result.notes, [{ midi: 60, beats: 4, scoreBeat: 0 }]);
});

await test('an octave shift moves the whole run', () => {
  const model = tabModel([{ midi: 48, start: 0, duration: 1 }]);
  assert.deepEqual(runnerNotesFromTabModel(model, { octaveShift: 1 }).notes, [{ midi: 60, beats: 1, scoreBeat: 0 }]);
  assert.deepEqual(runnerNotesFromTabModel(model, { octaveShift: -1 }).notes, [{ midi: 36, beats: 1, scoreBeat: 0 }]);
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

// --- the text the score writes over a note ----------------------------------

await test('note text keeps one short line', () => {
  assert.equal(clampRunnerText('  mee \n may  '), 'mee may');
  assert.equal(clampRunnerText(''), '');
  assert.equal(clampRunnerText(null), '');
  assert.equal(clampRunnerText('x'.repeat(200)).length, RUNNER_TEXT_LIMIT);
});

await test('a beat text of the file lands on the note it sits over', () => {
  const model = {
    ...tabModel([
      { midi: 60, start: 0, duration: 1, beatIndex: 0 },
      { midi: 62, start: 1, duration: 1, beatIndex: 1 },
    ]),
    beats: [{ start: 0, text: 'mee' }, { start: 1 }],
  };
  const result = runnerNotesFromTabModel(model);
  assert.equal(result.notes[0].text, 'mee');
  assert.equal(result.notes[1].text, undefined);
  assert.equal(runnerTextCount({ notes: result.notes }), 1);
});

await test('a section marker names the first note of a bar with no beat text', () => {
  const model = {
    ...tabModel([
      { midi: 60, start: 0, duration: 1, beatIndex: 0 },
      { midi: 62, start: 4, duration: 1, beatIndex: 1 },
      { midi: 64, start: 5, duration: 1, beatIndex: 2 },
    ]),
    beats: [{ start: 0, text: 'mee' }, { start: 4 }, { start: 5 }],
    measures: [
      { startBeat: 0, endBeat: 4, marker: 'Sirens' },
      { startBeat: 4, endBeat: 8, marker: 'Lip trills' },
    ],
  };
  const result = runnerNotesFromTabModel(model);
  // The beat text wins over the marker of its own bar.
  assert.equal(result.notes[0].text, 'mee');
  assert.equal(result.notes[1].text, 'Lip trills');
  // Only the first note of the section carries the marker.
  assert.equal(result.notes[2].text, undefined);
});

await test('a section note of the score fills the notes that hold no text', () => {
  const config = normalizeRunnerConfig({
    notes: [
      { midi: 60, beats: 1, scoreBeat: 0, text: 'mee' },
      { midi: 62, beats: 1, scoreBeat: 4 },
      { midi: 64, beats: 1, scoreBeat: 12 },
    ],
  });
  const filled = fillRunnerTextFromAnnotations(config, [
    { id: 'a', startBeat: 0, endBeat: 16, title: 'Whole warm-up' },
    { id: 'b', startBeat: 4, endBeat: 8, title: 'Hum, then ee' },
  ]);
  assert.equal(filled.notes[0].text, 'mee', 'the text of the file wins');
  assert.equal(filled.notes[1].text, 'Hum, then ee', 'the narrowest section note wins');
  assert.equal(filled.notes[2].text, 'Whole warm-up');
  assert.equal(runnerTextCount(filled), 3);
});

await test('a run with no section note and no beat text stays as it is', () => {
  const config = normalizeRunnerConfig({ notes: [{ midi: 60, beats: 1 }] });
  assert.equal(fillRunnerTextFromAnnotations(config, []), config);
  assert.equal(fillRunnerTextFromAnnotations(config, [{ startBeat: 0, endBeat: 4, title: 'Ah' }]), config);
});

await test('a stored run keeps the note text, the beat, and the file size', () => {
  const config = normalizeRunnerConfig({
    notes: [{ midi: 60, beats: 1, text: '  mee  ', scoreBeat: 2.5 }],
    fileSize: 4096,
  });
  assert.deepEqual(config.notes, [{ midi: 60, beats: 1, text: 'mee', scoreBeat: 2.5 }]);
  assert.equal(config.fileSize, 4096);
  assert.equal(normalizeRunnerConfig({ notes: [{ midi: 60 }] }).fileSize, 0);
});

await test('the summary line says when a run carries text', () => {
  const config = normalizeRunnerConfig({
    notes: [{ midi: 60, beats: 2, text: 'mee' }, { midi: 67, beats: 2 }],
  });
  assert.equal(describeRunnerConfig(config), '2 notes · C4–G4 · 90 BPM · 2× · with text');
});

await test('a Guitar Pro warm-up file carries its text into the run', () => {
  const fixture = join(dirname(fileURLToPath(import.meta.url)), '..', 'gp-player', 'fixtures', 'vocal-text.gp5');
  if (!existsSync(fixture)) makeFixtures();
  const bytes = readFileSync(fixture);
  return parseGuitarPro(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
    .then((gp) => {
      const result = runnerNotesFromTabModel(gp.tracks[0].model, { octaveShift: 1 });
      assert.equal(result.ok, true);
      assert.deepEqual(result.notes.map((n) => n.text), ['mee', 'may', 'mah', 'Lip trills']);
      assert.deepEqual(result.notes.map((n) => n.scoreBeat), [0, 1, 2, 3]);
    });
});


// --- Audio Studio transcription import -------------------------------------

/** One transcription note, as the Audio Studio makes it. */
function heard(midi, startBeat, durationBeats) {
  return {
    midi,
    startBeat,
    durationBeats,
    startSec: startBeat / 2,
    durationSec: durationBeats / 2,
    label: 'x',
  };
}

await test('a transcription becomes a runner note list', () => {
  const result = runnerNotesFromTranscription({
    bpm: 120,
    notes: [heard(60, 0, 1), heard(64, 1, 2), heard(67, 3, 0.5)],
  });
  assert.equal(result.ok, true);
  assert.equal(result.bpm, 120);
  assert.equal(result.skipped, 0);
  assert.deepEqual(result.notes, [
    { midi: 60, beats: 1, scoreBeat: 0 },
    { midi: 64, beats: 2, scoreBeat: 1 },
    { midi: 67, beats: 0.5, scoreBeat: 3 },
  ]);
});

await test('the import reads seconds when the take skipped the beat grid', () => {
  const result = runnerNotesFromTranscription({
    bpm: 120,
    notes: [{ midi: 60, startSec: 0, durationSec: 1 }],
  });
  assert.equal(result.ok, true);
  // 120 BPM makes one beat 0.5 seconds, so one second is two beats.
  assert.deepEqual(result.notes, [{ midi: 60, beats: 2, scoreBeat: 0 }]);
});

await test('the import drops a very short detection artifact', () => {
  const result = runnerNotesFromTranscription({
    bpm: 120,
    notes: [heard(60, 0, 1), heard(61, 1, 0.05)],
  });
  assert.equal(result.notes.length, 1);
  assert.equal(result.skipped, 1);
});

await test('the import puts the notes in time order', () => {
  const result = runnerNotesFromTranscription({
    bpm: 90,
    notes: [heard(67, 2, 1), heard(60, 0, 1), heard(64, 1, 1)],
  });
  assert.deepEqual(result.notes.map((n) => n.midi), [60, 64, 67]);
});

await test('the import shifts the octave and drops what leaves the range', () => {
  const up = runnerNotesFromTranscription({ bpm: 120, notes: [heard(60, 0, 1)] }, { octaveShift: 1 });
  assert.deepEqual(up.notes, [{ midi: 72, beats: 1, scoreBeat: 0 }]);
  const out = runnerNotesFromTranscription({ bpm: 120, notes: [heard(95, 0, 1)] }, { octaveShift: 3 });
  assert.equal(out.ok, false);
  assert.equal(out.skipped, 1);
  assert.match(out.error, /octave/);
});

await test('a take without pitches makes no run', () => {
  const result = runnerNotesFromTranscription({ bpm: 120, notes: [] });
  assert.equal(result.ok, false);
  assert.match(result.error, /no detected pitches/i);
});

await test('the import keeps at most the note limit of a run', () => {
  const notes = [];
  for (let i = 0; i < RUNNER_MAX_NOTES + 6; i += 1) notes.push(heard(60, i, 1));
  const result = runnerNotesFromTranscription({ bpm: 120, notes });
  assert.equal(result.notes.length, RUNNER_MAX_NOTES);
  assert.equal(result.skipped, 6);
});

await test('a transcription becomes a stored runner config', () => {
  const built = runnerConfigFromTranscription(
    { bpm: 96, notes: [heard(60, 0, 1), heard(62, 1, 1)] },
    { fileName: 'vocal riff', repeats: 2 },
  );
  assert.equal(built.ok, true);
  assert.equal(built.config.source, 'audio');
  assert.equal(built.config.bpm, 96);
  assert.equal(built.config.repeats, 2);
  assert.equal(built.config.fileName, 'vocal riff');
  assert.equal(built.config.notes.length, 2);
  assert.equal(describeRunnerConfig(built.config), '2 notes · C4–D4 · 96 BPM · 2×');
});

await test('a take without playable notes builds no config', () => {
  const built = runnerConfigFromTranscription({ bpm: 96, notes: [] }, { fileName: 'quiet' });
  assert.equal(built.ok, false);
  assert.equal(built.config, null);
});

console.log('\nall runner-model tests passed');
