/**
 * Zero-dependency Node tests for the Audio Studio idea.
 *
 * The idea model is pure, so this runner reads it directly. The last test
 * renders a hummed line with the offline transcription and checks that the
 * idea holds the notes in the order they were sung.
 *
 * Run: node tests/audio-studio/run.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  IDEA_SOURCES,
  DEFAULT_IDEA_SOURCE,
  analysisOptionsForSource,
  noteFields,
  pitchClassWeights,
  keyPitchClasses,
  detectIdeaKey,
  markInKey,
  snapNotesToKey,
  buildIdea,
  rekeyIdea,
  nudgeNote,
  removeNote,
  transposeIdea,
  ideaRange,
  ideaBarCount,
  ideaSummary,
  ideaNamesLine,
  centsText,
  ideaToText,
  ideaPlaybackEvents,
  noteAtTime,
  ideaToTranscription,
} from '../../js/audioStudio/ideaModel.js';
import { analyzeMono } from '../../js/trackToSheet/transcribe.js';
import { runnerConfigFromTranscription } from '../../js/runnerExerciseModel.js';
import { transcriptionToGpResult } from '../../js/trackToSheet/toTabModel.js';
import { getTool } from '../../js/tools.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

/** A transcription note, as `transcribeBuffer` writes it. */
function tNote(midi, startSec, durationSec, extra = {}) {
  const { name, oct, label } = noteFields(midi);
  return {
    midi, name, oct, label, startSec, durationSec, cents: 0, clarity: 0.9, confidence: 0.9, ...extra,
  };
}

/** A melody in C major: C4 D4 E4 G4 E4 C4, one note every half second. */
function cMajorLine() {
  const midis = [60, 62, 64, 67, 64, 60];
  return {
    notes: midis.map((m, i) => tNote(m, i * 0.5, 0.42, { startBeat: i, durationBeats: 0.85 })),
    bpm: 120,
    beatsPerBar: 4,
    offsetSec: 0,
    durationSec: 3.1,
  };
}

/* ------------------------------------------------------------------ */
console.log('Sources');

await test('the sources are voice, guitar, and bass, and voice is the default', () => {
  assert.deepEqual(IDEA_SOURCES.map((s) => s.id), ['voice', 'guitar', 'bass']);
  assert.equal(DEFAULT_IDEA_SOURCE, 'voice');
});

await test('a source narrows the detector to its range', () => {
  assert.equal(analysisOptionsForSource('voice').range, 'voice');
  assert.equal(analysisOptionsForSource('bass').range, 'bass');
  assert.equal(analysisOptionsForSource('nonsense').range, 'voice');
  // The range wins over a stale manual band.
  assert.equal(analysisOptionsForSource('guitar').minFreq, null);
});

/* ------------------------------------------------------------------ */
console.log('Notes');

await test('a MIDI note names itself', () => {
  assert.deepEqual(noteFields(60), { midi: 60, name: 'C', oct: 4, label: 'C4' });
  assert.deepEqual(noteFields(69.4), { midi: 69, name: 'A', oct: 4, label: 'A4' });
  assert.equal(noteFields(58).label, 'A#3');
});

await test('the pitch-class weights follow how long each note held', () => {
  const w = pitchClassWeights([
    { midi: 60, durationSec: 1, confidence: 1 },
    { midi: 72, durationSec: 1, confidence: 1 },
    { midi: 62, durationSec: 0.25, confidence: 1 },
  ]);
  assert.ok(w[0] > w[2] * 3, 'C held four times as long as D');
  assert.equal(w[1], 0);
});

await test('a key names its seven pitch classes', () => {
  assert.deepEqual(keyPitchClasses(0, 'major'), [0, 2, 4, 5, 7, 9, 11]);
  assert.deepEqual(keyPitchClasses(9, 'minor'), [9, 11, 0, 2, 4, 5, 7]);
});

await test('the key of a C major line is C major', () => {
  const idea = buildIdea(cMajorLine());
  assert.ok(idea.key, 'a key is found');
  assert.equal(idea.key.label, 'C Major');
  assert.ok(idea.key.confidence > 0, 'the key has a confidence');
});

await test('two pitch classes name no key', () => {
  assert.equal(detectIdeaKey([tNote(60, 0, 1), tNote(67, 1, 1), tNote(60, 2, 1)]), null);
  assert.equal(buildIdea({ notes: [] }).key, null);
});

await test('a note outside the key is marked, and the snap moves it', () => {
  const key = { tonic: 0, mode: 'major', pcs: keyPitchClasses(0, 'major') };
  const notes = [
    { ...noteFields(60), cents: 10 },
    { ...noteFields(61), cents: -40 },   // C#4 sung flat: nearer to C4
    { ...noteFields(66), cents: 30 },    // F#4 sung sharp: nearer to G4
    { ...noteFields(64), cents: 0 },
  ];
  const marked = markInKey(notes, key);
  assert.deepEqual(marked.map((n) => n.inKey), [true, false, false, true]);

  const snapped = snapNotesToKey(marked, key);
  assert.deepEqual(snapped.map((n) => n.label), ['C4', 'C4', 'G4', 'E4']);
  assert.deepEqual(snapped.map((n) => n.snapped), [false, true, true, false]);
  assert.ok(snapped.every((n) => n.inKey));
  // The cents now read against the note the snap picked.
  assert.equal(snapped[1].cents, 50, 'C#4 at -40 cents is C4 at +60, clamped to +50');
  assert.equal(snapped[2].cents, -50, 'F#4 at +30 cents is G4 at -70, clamped to -50');
  // The original stays untouched.
  assert.equal(marked[1].label, 'C#4');
});

await test('no key means no snap', () => {
  const notes = [{ ...noteFields(61), cents: 0 }];
  const out = snapNotesToKey(notes, null);
  assert.equal(out[0].label, 'C#4');
  assert.notEqual(out[0], notes[0]);
});

/* ------------------------------------------------------------------ */
console.log('The idea');

await test('an idea keeps the notes in the order they were sung', () => {
  const source = cMajorLine();
  // Hand the notes over out of order. The idea sorts them by time.
  source.notes.reverse();
  const idea = buildIdea(source);
  assert.equal(ideaNamesLine(idea), 'C4 D4 E4 G4 E4 C4');
  assert.deepEqual(idea.notes.map((n) => n.id), ['n1', 'n2', 'n3', 'n4', 'n5', 'n6']);
  assert.equal(idea.bpm, 120);
  assert.equal(idea.beatsPerBar, 4);
  assert.equal(idea.source, 'voice');
  assert.equal(idea.snapToKey, false);
  assert.ok(idea.notes.every((n) => n.inKey));
});

await test('an idea built with the snap on moves only the out-of-key notes', () => {
  const source = cMajorLine();
  source.notes[3] = tNote(66, 1.5, 0.42, { cents: 35 });  // F#4 sung sharp, in a C line
  const plain = buildIdea(source);
  assert.equal(plain.notes[3].label, 'F#4');
  assert.equal(plain.notes[3].inKey, false);
  const snapped = buildIdea(source, { snapToKey: true });
  assert.equal(snapped.snapToKey, true);
  assert.equal(snapped.notes[3].label, 'G4');
  assert.equal(snapped.notes[3].sungMidi, 66);
  assert.equal(snapped.notes[3].snapped, true);
});

await test('the cents of a note come through, clamped, and read as a singer reads them', () => {
  const idea = buildIdea({ notes: [tNote(60, 0, 1, { cents: 12.4 }), tNote(62, 1, 1, { cents: -80 })] });
  assert.equal(idea.notes[0].cents, 12);
  assert.equal(idea.notes[1].cents, -50);
  assert.equal(centsText(12), '+12');
  assert.equal(centsText(-8), '-8');
  assert.equal(centsText(0), '0');
});

await test('a nudge moves one note, resets its cents, and names the key again', () => {
  const idea = buildIdea(cMajorLine());
  const moved = nudgeNote(idea, 'n2', -1);
  assert.equal(moved.notes[1].label, 'C#4');
  assert.equal(moved.notes[1].cents, 0);
  assert.equal(moved.notes[1].edited, true);
  assert.equal(moved.notes[1].inKey, false);
  // The rest keep their place, and the old idea keeps its note.
  assert.equal(moved.notes[0].label, 'C4');
  assert.equal(idea.notes[1].label, 'D4');
  assert.equal(nudgeNote(idea, 'n2', 0), idea);
  assert.equal(nudgeNote(idea, 'missing', 1).notes[1].label, 'D4');
});

await test('a nudge stays inside C1 to C7', () => {
  const idea = buildIdea({ notes: [tNote(24, 0, 1), tNote(96, 1, 1), tNote(60, 2, 1)] });
  assert.equal(nudgeNote(idea, 'n1', -1), idea);
  assert.equal(nudgeNote(idea, 'n2', 1), idea);
});

await test('a removed note leaves the others in time', () => {
  const idea = buildIdea(cMajorLine());
  const fewer = removeNote(idea, 'n3');
  assert.equal(ideaNamesLine(fewer), 'C4 D4 G4 E4 C4');
  assert.equal(fewer.notes[2].startSec, 1.5);
  assert.equal(removeNote(idea, 'missing'), idea);
});

await test('a transposed idea moves every note and its key', () => {
  const idea = buildIdea(cMajorLine());
  const up = transposeIdea(idea, 2);
  assert.equal(ideaNamesLine(up), 'D4 E4 F#4 A4 F#4 D4');
  assert.equal(up.key.label, 'D Major');
  assert.equal(transposeIdea(idea, 0), idea);
});

await test('rekey reads the key off the notes as they are now', () => {
  const idea = buildIdea(cMajorLine());
  const shifted = { ...idea, notes: idea.notes.map((n) => ({ ...n, ...noteFields(n.midi + 7) })) };
  assert.equal(rekeyIdea(shifted).key.label, 'G Major');
});

await test('the range, the bars, and the summary read off the idea', () => {
  const idea = buildIdea(cMajorLine());
  assert.deepEqual(ideaRange(idea.notes), { low: 60, high: 67, lowLabel: 'C4', highLabel: 'G4' });
  assert.equal(ideaRange([]), null);
  assert.equal(ideaBarCount(idea), 2);
  assert.equal(ideaBarCount({ notes: [] }), 0);
  const summary = ideaSummary(idea);
  assert.match(summary, /^6 notes · 3\.1 s · C4–G4 · C Major · ≈120 BPM$/);
  assert.equal(ideaSummary({ notes: [] }), 'No clear notes yet.');
});

await test('the text holds the names on one line and one row for each note', () => {
  const idea = buildIdea({ notes: [tNote(60, 0, 0.5, { cents: 12 }), tNote(62, 0.5, 0.5, { cents: -5 })] });
  const text = ideaToText(idea);
  const lines = text.split('\n');
  assert.equal(lines[1], 'C4 D4');
  assert.match(lines[3], /^C4\s+0\.00s\s+0\.50s\s+\+12c$/);
  assert.match(lines[4], /^D4\s+0\.50s\s+0\.50s\s+-5c$/);
  assert.equal(ideaToText({ notes: [] }), '');
});

await test('the playback events start at zero and keep the sung timing', () => {
  const idea = buildIdea({ notes: [tNote(60, 0.8, 0.4), tNote(64, 1.3, 0.6)] });
  const events = ideaPlaybackEvents(idea);
  assert.deepEqual(events.map((e) => e.midi), [60, 64]);
  assert.equal(events[0].atSec, 0);
  assert.ok(Math.abs(events[1].atSec - 0.5) < 1e-9);
  assert.equal(events[1].durationSec, 0.6);
  assert.deepEqual(ideaPlaybackEvents({ notes: [] }), []);
});

await test('the note at a moment of the take is the one that sounds then', () => {
  const idea = buildIdea(cMajorLine());
  assert.equal(noteAtTime(idea, 0.1).label, 'C4');
  assert.equal(noteAtTime(idea, 0.55).label, 'D4');
  assert.equal(noteAtTime(idea, 0.45), null);
  assert.equal(noteAtTime(idea, -1), null);
});

await test('the idea feeds the Pitch Runner and the tab builder', () => {
  const idea = buildIdea(cMajorLine());
  const back = ideaToTranscription(nudgeNote(idea, 'n1', 12));
  assert.equal(back.notes[0].midi, 72);
  assert.equal(back.notes[0].startBeat, 0);
  assert.equal(back.bpm, 120);

  const run = runnerConfigFromTranscription(back, { fileName: 'test' });
  assert.equal(run.ok, true);
  assert.equal(run.config.notes.length, 6);
  assert.equal(run.config.notes[0].midi, 72);

  const gp = transcriptionToGpResult(back, { name: 'Idea' });
  assert.equal(gp.tracks.length, 1);
  assert.equal(gp.tracks[0].model.events.length, 6);
  assert.match(gp.tracks[0].ascii, /\|/);
});

/* ------------------------------------------------------------------ */
console.log('A hummed line, end to end');

const SR = 44100;

function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A voice-like line: harmonics, an attack, a release, vibrato, and drift. */
function hum(events, { seed = 7, snrDb = 30 } = {}) {
  const rng = mulberry32(seed);
  const totalSec = Math.max(...events.map((e) => e.startSec + e.durationSec)) + 0.15;
  const n = Math.floor(totalSec * SR);
  const out = new Float32Array(n);
  for (const e of events) {
    const base = 440 * Math.pow(2, (e.midi - 69) / 12) * Math.pow(2, (e.cents || 0) / 1200);
    const i0 = Math.floor(e.startSec * SR);
    const i1 = Math.min(n, Math.floor((e.startSec + e.durationSec) * SR));
    // The phase accumulates, so the vibrato bends the pitch and nothing else.
    let phase = 0;
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / SR;
      const attack = Math.min(1, t / 0.03);
      const release = Math.min(1, (e.durationSec - t) / 0.06);
      const env = 0.7 * Math.max(0, Math.min(attack, release));
      const vib = Math.sin(2 * Math.PI * 5.5 * Math.max(0, t - 0.1)) * 25;
      const f = base * Math.pow(2, vib / 1200);
      phase += (2 * Math.PI * f) / SR;
      let s = 0;
      for (let h = 1; h <= 6; h++) s += Math.sin(phase * h) / Math.pow(h, 1.3);
      out[i] += s * 0.3 * env;
    }
  }
  let power = 0;
  for (let i = 0; i < n; i++) power += out[i] * out[i];
  const noiseAmp = Math.sqrt((power / n) / Math.pow(10, snrDb / 10));
  for (let i = 0; i < n; i++) out[i] += (rng() * 2 - 1) * noiseAmp;
  return out;
}

await test('a hummed A minor line comes back in the order it was sung', async () => {
  const beat = 0.5;
  const line = [
    { midi: 57, cents: 8 },   // A3
    { midi: 60, cents: -12 }, // C4
    { midi: 62, cents: 5 },   // D4
    { midi: 64, cents: 15 },  // E4
    { midi: 62, cents: -6 },  // D4
    { midi: 60, cents: 4 },   // C4
    { midi: 59, cents: -10 }, // B3
    { midi: 57, cents: 0 },   // A3
  ].map((e, i) => ({ ...e, startSec: 0.2 + i * beat, durationSec: beat * 0.86 }));
  const mono = hum(line);
  const transcription = await analyzeMono(mono, SR, { range: 'voice' });
  const idea = buildIdea(transcription);
  assert.equal(ideaNamesLine(idea), 'A3 C4 D4 E4 D4 C4 B3 A3', `got ${ideaNamesLine(idea)}`);
  assert.equal(idea.key.label, 'A Minor');
  assert.ok(idea.notes.every((n) => n.inKey), 'every note sits in A minor');
  // The notes keep their time, so the third note starts about one second in.
  assert.ok(Math.abs(idea.notes[2].startSec - 1.2) < 0.08, `third note at ${idea.notes[2].startSec}`);
  // The cents read the drift the voice sang, within the detector's reach.
  assert.ok(idea.notes[3].cents > 0, 'E4 was sung sharp');
  assert.ok(idea.notes[1].cents < 0, 'C4 was sung flat');
});

await test('a note hummed a quarter tone off snaps into the key', async () => {
  const beat = 0.5;
  const line = [
    { midi: 60, cents: 0 },
    { midi: 62, cents: 0 },
    { midi: 64, cents: 0 },
    { midi: 65, cents: 45 },  // F4 sung almost to F#4
    { midi: 67, cents: 0 },
    { midi: 64, cents: 0 },
    { midi: 60, cents: 0 },
  ].map((e, i) => ({ ...e, startSec: 0.2 + i * beat, durationSec: beat * 0.86 }));
  const transcription = await analyzeMono(hum(line, { seed: 3 }), SR, { range: 'voice' });
  const snapped = buildIdea(transcription, { snapToKey: true });
  assert.equal(snapped.key.label, 'C Major');
  assert.equal(ideaNamesLine(snapped), 'C4 D4 E4 F4 G4 E4 C4', `got ${ideaNamesLine(snapped)}`);
});

/* ------------------------------------------------------------------ */
console.log('The tool');

await test('the Audio Studio holds a record, an import, and a run mode', () => {
  const tool = getTool('audiostudio');
  assert.deepEqual(tool.modes.map((m) => m.id), ['capture', 'transcribe', 'run']);
  assert.equal(tool.defaultMode, 'capture');
});

await test('the page holds the idea card inside the record view and no analysis card', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes('id="rec-idea-card"'));
  assert.equal(html.includes('id="rec-analysis-card"'), false);
  assert.equal(html.includes('id="rec-riff-card"'), false);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
