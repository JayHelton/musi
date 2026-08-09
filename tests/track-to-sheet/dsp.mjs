/**
 * Zero-dependency Node smoke tests for trackToSheet/dsp.js
 * Run: node tests/track-to-sheet/dsp.mjs
 */

import assert from 'node:assert/strict';
import {
  nextPow2,
  createFft,
  hannWindow,
  applyWindow,
  createPitchDetector,
  detectPitchFast,
  computeOnsetEnvelope,
  pickOnsets,
  tempoCandidatesFromEnvelope,
  movingMedian,
  median,
  normalizeInPlace,
  removeDcInPlace,
} from '../../js/trackToSheet/dsp.js';

const SR = 44100;

function sineBuf(freq, size, amp = 0.4) {
  const buf = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    buf[i] = amp * Math.sin((2 * Math.PI * freq * i) / SR);
  }
  return buf;
}

function sawBuf(freq, size, amp = 0.35, harmonics = 16) {
  const buf = new Float32Array(size);
  for (let h = 1; h <= harmonics; h++) {
    const a = amp / h;
    for (let i = 0; i < size; i++) {
      buf[i] += a * Math.sin((2 * Math.PI * freq * h * i) / SR);
    }
  }
  return buf;
}

function whiteNoise(size, amp = 0.3) {
  const buf = new Float32Array(size);
  for (let i = 0; i < size; i++) buf[i] = (Math.random() * 2 - 1) * amp;
  return buf;
}

function synthToneBursts(freq, burstTimes, burstSec = 0.06, gapSec = 0.12, amp = 0.4) {
  const totalSec = burstTimes[burstTimes.length - 1] + burstSec + 0.1;
  const n = Math.floor(totalSec * SR);
  const mono = new Float32Array(n);
  for (const t0 of burstTimes) {
    const i0 = Math.floor(t0 * SR);
    const i1 = Math.min(n, i0 + Math.floor(burstSec * SR));
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / SR;
      const env = Math.min(1, t * 80, (burstSec - t) * 80);
      mono[i] += amp * Math.sin((2 * Math.PI * freq * t) * env);
    }
  }
  return mono;
}

function synthClickTrain(bpm, beats, startSec = 0.1) {
  const beatSec = 60 / bpm;
  const totalSec = startSec + beats * beatSec + 0.2;
  const n = Math.floor(totalSec * SR);
  const mono = new Float32Array(n);
  for (let b = 0; b < beats; b++) {
    const t0 = startSec + b * beatSec;
    const i0 = Math.floor(t0 * SR);
    const clickLen = Math.min(400, n - i0);
    for (let k = 0; k < clickLen; k++) {
      const env = Math.exp(-k / 40);
      mono[i0 + k] += 0.7 * env * Math.sin((2 * Math.PI * 1000 * k) / SR);
    }
  }
  return mono;
}

const pitchAccuracy = {};

// ── nextPow2 ───────────────────────────────────────────────────
{
  assert.equal(nextPow2(1), 1);
  assert.equal(nextPow2(2), 2);
  assert.equal(nextPow2(3), 4);
  assert.equal(nextPow2(1024), 1024);
  assert.equal(nextPow2(1025), 2048);
}

// ── FFT round-trip and sine peak bin ───────────────────────────
{
  const size = 64;
  const fft = createFft(size);
  const re = new Float32Array(size);
  const im = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    re[i] = Math.sin((2 * Math.PI * 3 * i) / size);
    im[i] = 0.3 * Math.cos((2 * Math.PI * 5 * i) / size);
  }
  const origRe = Float32Array.from(re);
  const origIm = Float32Array.from(im);

  fft.forward(re, im);
  fft.inverse(re, im);

  for (let i = 0; i < size; i++) {
    assert.ok(Math.abs(re[i] - origRe[i]) < 1e-4, `re[${i}] round-trip`);
    assert.ok(Math.abs(im[i] - origIm[i]) < 1e-4, `im[${i}] round-trip`);
  }

  const freqBin = 5;
  const re2 = new Float32Array(size);
  const im2 = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    re2[i] = Math.sin((2 * Math.PI * freqBin * i) / size);
  }
  fft.forward(re2, im2);
  let peakBin = 0;
  let peakMag = 0;
  for (let k = 0; k < size / 2; k++) {
    const mag = Math.hypot(re2[k], im2[k]);
    if (mag > peakMag) {
      peakMag = mag;
      peakBin = k;
    }
  }
  assert.equal(peakBin, freqBin, `sine peak bin expected ${freqBin}, got ${peakBin}`);
}

// ── Hann window cache + applyWindow ────────────────────────────
{
  const w1 = hannWindow(128);
  const w2 = hannWindow(128);
  assert.equal(w1, w2, 'hannWindow should be cached');
  const src = sineBuf(220, 128);
  const dst = new Float32Array(128);
  applyWindow(dst, src, w1);
  const mid = 64;
  assert.ok(Math.abs(dst[mid] - src[mid]) > 1e-6, 'windowed mid sample should differ from raw');
}

// ── Pitch detector accuracy ────────────────────────────────────
{
  const size = 2048;
  const det = createPitchDetector({ windowSize: size, sampleRate: SR });

  for (const truth of [110, 440, 880]) {
    const buf = sineBuf(truth, size);
    const res = det.detect(buf, { minClarity: 0.5, minRms: 0.005 });
    const err = Math.abs(res.freq - truth);
    pitchAccuracy[truth] = { detected: res.freq, err, clarity: res.clarity };
    assert.ok(res.freq > 0, `${truth} Hz should be detected`);
    assert.ok(err < 1, `${truth} Hz within 1 Hz, got ${res.freq} (err ${err})`);
    assert.ok(res.candidates.length > 0, 'should expose NSDF candidates');
  }

  const saw = sawBuf(220, size);
  const sawRes = det.detect(saw, { minClarity: 0.45, minRms: 0.005 });
  pitchAccuracy.saw220 = { detected: sawRes.freq, clarity: sawRes.clarity };
  assert.ok(sawRes.freq > 0, 'saw should detect pitch');
  assert.ok(Math.abs(sawRes.freq - 220) < 1, `saw 220 Hz, got ${sawRes.freq}`);
  assert.ok(Math.abs(sawRes.freq - 440) > 5, 'should not octave-double to 440');
  assert.ok(Math.abs(sawRes.freq - 110) > 5, 'should not octave-halve to 110');

  const noise = whiteNoise(size);
  const noiseRes = detectPitchFast(noise, SR, { minClarity: 0.5 });
  pitchAccuracy.noise = { freq: noiseRes.freq, clarity: noiseRes.clarity };
  assert.ok(noiseRes.freq === -1 || noiseRes.clarity < 0.5, 'noise should be rejected');
}

// ── Pitch detector speed ───────────────────────────────────────
{
  const size = 2048;
  const det = createPitchDetector({ windowSize: size, sampleRate: SR });
  const buf = sineBuf(440, size);
  const frames = 400;
  const t0 = performance.now();
  for (let f = 0; f < frames; f++) det.detect(buf, { minClarity: 0.5 });
  const elapsed = performance.now() - t0;
  pitchAccuracy.speedMs = elapsed;
  pitchAccuracy.speedPerFrameUs = (elapsed / frames) * 1000;
  assert.ok(elapsed < 2000, `400 frames should finish < 2s, took ${elapsed.toFixed(1)} ms`);
}

// ── Onset envelope + pickOnsets ────────────────────────────────
{
  const burstTimes = [];
  for (let i = 0; i < 8; i++) burstTimes.push(0.15 + i * 0.18);
  const mono = synthToneBursts(220, burstTimes);
  const { envelope, hopSec } = computeOnsetEnvelope(mono, SR, { fftSize: 1024, hopSize: 256 });
  const onsets = pickOnsets(envelope, hopSec, { delta: 0.04 });
  assert.ok(onsets.length >= 6, `expected many onsets, got ${onsets.length}`);
  assert.ok(onsets.length <= 10, `too many onsets: ${onsets.length}`);

  const onsetErrors = [];
  for (const truth of burstTimes) {
    let best = Infinity;
    for (const o of onsets) best = Math.min(best, Math.abs(o.time - truth));
    onsetErrors.push(best);
    assert.ok(best < 0.025, `onset near ${truth}s off by ${(best * 1000).toFixed(1)} ms`);
  }
  pitchAccuracy.onsetErrorsMs = onsetErrors.map((e) => e * 1000);
  pitchAccuracy.onsetCount = onsets.length;
}

// ── Tempo from onset envelope ──────────────────────────────────
{
  for (const truth of [120, 92]) {
    const mono = synthClickTrain(truth, 16);
    const { envelope, hopSec } = computeOnsetEnvelope(mono, SR, { fftSize: 1024, hopSize: 256 });
    const cands = tempoCandidatesFromEnvelope(envelope, hopSec, { priorBpm: truth });
    assert.ok(cands.length > 0, `expected tempo candidates for ${truth} BPM`);
    const top = cands[0].bpm;
    pitchAccuracy[`tempo${truth}`] = { top, err: Math.abs(top - truth) };
    assert.ok(Math.abs(top - truth) <= 3, `${truth} BPM top candidate ${top.toFixed(2)}`);
  }
}

// ── Helpers ────────────────────────────────────────────────────
{
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);

  const mm = movingMedian([0, 10, 0, 10, 0], 1);
  assert.equal(mm[2], 0);

  const norm = new Float32Array([0, -2, 4]);
  normalizeInPlace(norm);
  assert.deepEqual(Array.from(norm), [0, -0.5, 1]);

  const dc = new Float32Array([1, 2, 3]);
  removeDcInPlace(dc);
  assert.ok(Math.abs(dc[0] + 1) < 1e-6);
  assert.ok(Math.abs(dc[1]) < 1e-6);
  assert.ok(Math.abs(dc[2] - 1) < 1e-6);
}

console.log('dsp: all tests passed');
