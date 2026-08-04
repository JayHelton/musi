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
  estimateBpm,
  midiToStaff,
  suggestClef,
} from '../../js/trackToSheet/transcribe.js';
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

console.log('track-to-sheet: all tests passed');
