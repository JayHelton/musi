/**
 * Zero-dependency Node smoke tests for Track → Sheet.
 * Run: node tests/track-to-sheet/run.mjs
 */

import assert from 'node:assert/strict';
import { detectPitch } from '../../js/pitch.js';
import {
  extractPitchFrames,
  segmentNotes,
  quantizeToScore,
  quantizeNotes,
  analyzeMono,
  estimateBpm,
  estimateTempo,
  midiToStaff,
  suggestClef,
} from '../../js/trackToSheet/transcribe.js';
import {
  chooseOctaveShift,
  notesToTabModel,
  tabModelToGpResult,
  transcriptionToGpResult,
} from '../../js/trackToSheet/toTabModel.js';
import { renderScoreSVG, notesToText } from '../../js/trackToSheet/score.js';

const SR = 44100;

function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** Render a sequence of pitched tones into a mono Float32Array. */
function synthMelody(events, sampleRate = SR) {
  // events: [{ midi, startSec, durationSec, amp? }]
  const totalSec = Math.max(...events.map(e => e.startSec + e.durationSec)) + 0.05;
  const n = Math.floor(totalSec * sampleRate);
  const out = new Float32Array(n);
  for (const e of events) {
    const f = midiToFreq(e.midi);
    const amp = e.amp ?? 0.35;
    const i0 = Math.floor(e.startSec * sampleRate);
    const i1 = Math.min(n, Math.floor((e.startSec + e.durationSec) * sampleRate));
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / sampleRate;
      // Short attack/release to avoid clicks confusing the detector.
      const env = Math.min(1, t * 40, (e.durationSec - t) * 40);
      out[i] += Math.sin(2 * Math.PI * f * t) * amp * Math.max(0, env);
    }
  }
  return out;
}

// ── Unit: midiToStaff ──────────────────────────────────────────
{
  const c4 = midiToStaff(60);
  assert.equal(c4.letter, 'C');
  assert.equal(c4.accidental, null);
  assert.equal(c4.dv, 28);

  const fs5 = midiToStaff(78, true);
  assert.equal(fs5.spelled, 'F#');
  assert.equal(fs5.accidental, '#');

  const bb3 = midiToStaff(58, false);
  assert.equal(bb3.spelled, 'Bb');
  assert.equal(bb3.accidental, 'b');
}

// ── Unit: detectPitch on a clean A4 sine ───────────────────────
{
  const freq = 440;
  const size = 2048;
  const buf = new Float32Array(size);
  for (let i = 0; i < size; i++) buf[i] = 0.4 * Math.sin(2 * Math.PI * freq * i / SR);
  const res = detectPitch(buf, SR, { minClarity: 0.5 });
  assert.ok(res.freq > 0, 'should detect pitch');
  assert.ok(Math.abs(res.freq - 440) < 3, `A4 ~440Hz, got ${res.freq}`);
}

// ── Pipeline: C4–E4–G4 melody ──────────────────────────────────
{
  const melody = [
    { midi: 60, startSec: 0.2, durationSec: 0.45 },  // C4
    { midi: 64, startSec: 0.75, durationSec: 0.45 }, // E4
    { midi: 67, startSec: 1.3, durationSec: 0.55 },  // G4
  ];
  const mono = synthMelody(melody);
  const frames = await extractPitchFrames(mono, SR, {
    windowSize: 2048,
    hopSize: 1024,
    minClarity: 0.5,
    minRms: 0.005,
  });
  assert.ok(frames.length > 10, 'expected many frames');

  const notes = segmentNotes(frames, { hopSec: 1024 / SR, minNoteSec: 0.08 });
  assert.ok(notes.length >= 3, `expected ≥3 notes, got ${notes.length}: ${notes.map(n => n.label).join(' ')}`);

  const midis = notes.map(n => n.midi);
  assert.ok(midis.includes(60), `missing C4 in ${midis}`);
  assert.ok(midis.includes(64), `missing E4 in ${midis}`);
  assert.ok(midis.includes(67), `missing G4 in ${midis}`);

  assert.equal(suggestClef(notes), 'Treble');

  const bpm = estimateBpm(notes);
  assert.ok(bpm >= 40 && bpm <= 240, `bpm out of range: ${bpm}`);

  const score = quantizeToScore(notes, 120, { beatsPerBar: 4 });
  assert.ok(score.events.some(e => e.type === 'note'), 'score should have notes');
  assert.ok(score.events.filter(e => e.type === 'note').length >= 3);

  const svg = renderScoreSVG({
    events: score.events,
    clef: 'Treble',
    bpm: 120,
    beatsPerBar: 4,
  });
  assert.match(svg, /tts-score/);
  assert.match(svg, /tts-note-head/);
  assert.match(svg, /clef/);

  const text = notesToText(notes);
  assert.match(text, /C4/);
  assert.match(text, /E4/);
}

// ── Bass clef suggestion ───────────────────────────────────────
{
  const low = [
    { midi: 40, startSec: 0, durationSec: 0.4 },
    { midi: 43, startSec: 0.5, durationSec: 0.4 },
    { midi: 45, startSec: 1.0, durationSec: 0.4 },
  ];
  assert.equal(suggestClef(low), 'Bass');
}

// ── Empty score ────────────────────────────────────────────────
{
  const empty = renderScoreSVG({ events: [] });
  assert.match(empty, /No pitched notes/);
}

// ── estimateTempo on synthetic quarter-note melody ─────────────
{
  const TRUTH_BPM = 112;
  const beatSec = 60 / TRUTH_BPM;
  const melody = [];
  for (let i = 0; i < 8; i++) {
    melody.push({
      midi: 60 + (i % 5),
      startSec: i * beatSec + 0.05,
      durationSec: beatSec * 0.85,
      label: `N${i}`,
      name: 'C',
      oct: 4,
      clarity: 0.9,
    });
  }
  const tempo = estimateTempo(melody);
  assert.ok(
    Math.abs(tempo.bpm - TRUTH_BPM) <= 8,
    `estimateTempo ${tempo.bpm} should be within 8 BPM of ${TRUTH_BPM}`,
  );
  assert.ok(tempo.beatsPerBar === 3 || tempo.beatsPerBar === 4);
  assert.ok(Number.isFinite(tempo.offsetSec));
  assert.ok(Number.isFinite(tempo.confidence));

  // estimateBpm stays compatible.
  const bpm = estimateBpm(melody);
  assert.ok(Math.abs(bpm - TRUTH_BPM) <= 8);
}

// ── quantizeToScore with offset ────────────────────────────────
{
  const beatSec = 0.5; // 120 BPM
  const notes = [
    { midi: 60, startSec: 0.25, durationSec: 0.4, name: 'C', oct: 4, label: 'C4', clarity: 1 },
    { midi: 62, startSec: 0.75, durationSec: 0.4, name: 'D', oct: 4, label: 'D4', clarity: 1 },
  ];
  const score = quantizeToScore(notes, 120, { beatsPerBar: 4, offsetSec: 0.25 });
  assert.ok(score.events.some((e) => e.type === 'note'));
  assert.equal(score.offsetSec, 0.25);
}

// ── notesToTabModel + tabModelToGpResult ───────────────────────
{
  const beatSec = 60 / 120;
  const notes = [
    { midi: 64, startSec: 0, durationSec: beatSec * 0.9, name: 'E', oct: 4, label: 'E4', clarity: 1 },
    { midi: 67, startSec: beatSec, durationSec: beatSec * 0.9, name: 'G', oct: 4, label: 'G4', clarity: 1 },
    { midi: 69, startSec: beatSec * 2, durationSec: beatSec * 0.9, name: 'A', oct: 4, label: 'A4', clarity: 1 },
  ];
  const model = notesToTabModel(notes, { bpm: 120, beatsPerBar: 4, offsetSec: 0 });
  assert.equal(model.events.length, 3);
  for (const ev of model.events) {
    assert.ok(Number.isFinite(ev.start), 'event needs start');
    assert.ok(Number.isFinite(ev.duration), 'event needs duration');
    assert.ok(ev.fret >= 0 && ev.fret <= 24, `fret ${ev.fret} out of range`);
    assert.ok(ev.stringIndex >= 0 && ev.stringIndex < model.strings.length);
  }
  const lastMeasure = model.measures[model.measures.length - 1];
  assert.ok(lastMeasure.endBeat >= model.totalBeats - 1e-6, 'measures should cover totalBeats');

  const gp = tabModelToGpResult(model, { name: 'Test riff' });
  assert.ok(gp.tracks[0].model);
  assert.ok(gp.tracks[0].ascii);
  assert.equal(gp.tracks[0].name, 'Test riff');
  assert.equal(gp.format, 'transcription');
  assert.ok(gp.meta.tuningPitches.length === 6);

  const gp2 = transcriptionToGpResult({ notes, bpm: 120, beatsPerBar: 4, offsetSec: 0 });
  assert.ok(gp2.tracks[0].model.events.length >= 3);
}

// ── Octave shift for high vocal notes ──────────────────────────
{
  const highNotes = [
    { midi: 84, startSec: 0, durationSec: 0.4, name: 'C', oct: 6, label: 'C6', clarity: 1 },
    { midi: 86, startSec: 0.5, durationSec: 0.4, name: 'D', oct: 6, label: 'D6', clarity: 1 },
  ];
  const shift = chooseOctaveShift(highNotes, { minMidi: 40, maxMidi: 76 });
  assert.ok(shift < 0, `expected downward shift, got ${shift}`);
  const model = notesToTabModel(highNotes, { bpm: 120, octaveShift: shift });
  for (const ev of model.events) {
    assert.ok(ev.midi >= 40 && ev.midi <= 88, `midi ${ev.midi} should be guitar-range after shift`);
  }
}

// ── quantizeNotes ──────────────────────────────────────────────
{
  const beatSec = 0.5;
  const notes = [
    { midi: 60, startSec: 0.02, durationSec: 0.48, name: 'C', oct: 4, label: 'C4', clarity: 1 },
    { midi: 62, startSec: 0.52, durationSec: 0.46, name: 'D', oct: 4, label: 'D4', clarity: 1 },
  ];
  const q = quantizeNotes(notes, {
    bpm: 120,
    beatsPerBar: 4,
    offsetSec: 0,
    gridDivisions: [1, 0.5, 0.25],
    quantizeStrength: 1,
  });
  assert.ok(q.notes.length === 2);
  assert.ok(q.notes[0].startBeat != null);
  assert.ok(q.notes[0].durationBeats != null);
  assert.ok(q.gridDivision > 0);
  assert.ok(q.fitScore >= 0);
}

// ── analyzeMono on synthetic melody ────────────────────────────
{
  const TRUTH_BPM = 100;
  const beatSec = 60 / TRUTH_BPM;
  const melody = [];
  const scale = [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65];
  for (let i = 0; i < scale.length; i++) {
    melody.push({
      midi: scale[i],
      startSec: i * beatSec * 0.5 + 0.05,
      durationSec: beatSec * 0.4,
      amp: 0.3,
    });
  }
  const mono = synthMelody(melody);
  const result = await analyzeMono(mono, SR, { preset: 'balanced' });
  assert.ok(result.notes.length >= 8, `expected many notes, got ${result.notes.length}`);
  assert.ok(result.frameCount > 10);
  assert.ok(result.onsets.length >= 4);
  assert.ok(result.grid.division > 0);
  assert.ok(Math.abs(result.bpm - TRUTH_BPM) <= TRUTH_BPM * 0.08,
    `tempo ${result.bpm} should be near ${TRUTH_BPM}`);
  assert.ok(result.score.events.some((e) => e.type === 'note'));
  assert.ok(result.diagnostics.voicedRatio > 0.1);
}

console.log('track-to-sheet: all tests passed');
