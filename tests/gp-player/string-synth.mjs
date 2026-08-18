// Synth pack contract tests.
// Run: node tests/gp-player/string-synth.mjs

import assert from 'node:assert/strict';
import {
  renderVoiceSamples,
  renderRateFor,
  voiceLengthSec,
  presetForFamily,
  createVoiceBufferCache,
  VOICE_PRESETS,
} from '../../js/gpPlayer/stringSynth.js';

const CONTEXT_RATE = 48000;
const FAMILIES = ['cleanGuitar', 'acousticGuitar', 'distortedGuitar', 'bass', 'keys'];

function midiFreq(m) {
  return 440 * 2 ** ((m - 69) / 12);
}

function render(family, midi) {
  const sampleRate = renderRateFor(family, CONTEXT_RATE);
  const samples = renderVoiceSamples({ family, freq: midiFreq(midi), sampleRate });
  return { samples, sampleRate };
}

function peakOf(samples) {
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  return peak;
}

function rmsOf(samples, from, to) {
  let sum = 0;
  const start = Math.max(0, from);
  const end = Math.min(samples.length, to);
  for (let n = start; n < end; n += 1) sum += samples[n] * samples[n];
  const count = Math.max(1, end - start);
  return Math.sqrt(sum / count);
}

/** Estimate the pitch with autocorrelation. */
function estimateHz(samples, sampleRate, expectHz) {
  const start = Math.floor(sampleRate * 0.1);
  const minLag = Math.floor(sampleRate / (expectHz * 1.4));
  const maxLag = Math.ceil(sampleRate / (expectHz / 1.4));
  const size = Math.min(samples.length - start - maxLag, Math.floor(sampleRate * 0.3));
  assert.ok(size > 0, 'the render must be long enough to measure');

  const at = (lag) => {
    let sum = 0;
    for (let n = 0; n < size; n += 1) sum += samples[start + n] * samples[start + n + lag];
    return sum;
  };
  let bestLag = minLag;
  let best = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    const value = at(lag);
    if (value > best) {
      best = value;
      bestLag = lag;
    }
  }
  const y0 = at(bestLag - 1);
  const y2 = at(bestLag + 1);
  const shift = (0.5 * (y0 - y2)) / (y0 - 2 * best + y2 || 1);
  return sampleRate / (bestLag + shift);
}

/** Get the spectral centroid of one window. */
function centroid(samples, sampleRate, atSec) {
  const size = 2048;
  const start = Math.min(
    Math.max(0, Math.floor(atSec * sampleRate)),
    Math.max(0, samples.length - size),
  );
  let energy = 0;
  let weighted = 0;
  for (let k = 1; k < size / 2; k += 1) {
    let re = 0;
    let im = 0;
    for (let n = 0; n < size; n += 1) {
      const phi = (2 * Math.PI * k * n) / size;
      re += samples[start + n] * Math.cos(phi);
      im -= samples[start + n] * Math.sin(phi);
    }
    const mag = re * re + im * im;
    energy += mag;
    weighted += mag * ((k * sampleRate) / size);
  }
  return energy > 1e-12 ? weighted / energy : 0;
}

// ---- every family renders a clean block ----
for (const family of FAMILIES) {
  const { samples, sampleRate } = render(family, family === 'bass' ? 40 : 52);
  assert.ok(samples instanceof Float32Array, `${family} must render a Float32Array`);
  assert.ok(samples.length > sampleRate * 0.3, `${family} must render at least 0.3 s`);
  for (const v of samples) {
    assert.ok(Number.isFinite(v), `${family} must not render NaN or Infinity`);
  }
  const peak = peakOf(samples);
  assert.ok(peak > 0.9 && peak <= 1, `${family} must normalize the peak, got ${peak}`);
  assert.equal(Math.abs(samples[0]), 0, `${family} must start at zero`);
  assert.equal(Math.abs(samples[samples.length - 1]), 0, `${family} must end at zero`);
}

// ---- the render rate never goes above the rate of the context ----
assert.ok(renderRateFor('bass', 48000) <= 48000);
assert.equal(renderRateFor('cleanGuitar', 16000), 16000);
assert.equal(renderRateFor('unknown-family', 48000), renderRateFor('cleanGuitar', 48000));
assert.equal(presetForFamily('unknown-family'), VOICE_PRESETS.cleanGuitar);

// ---- the pitch of the string model stays in tune ----
for (const midi of [40, 52, 64, 76]) {
  const { samples, sampleRate } = render('cleanGuitar', midi);
  const want = midiFreq(midi);
  const got = estimateHz(samples, sampleRate, want);
  const cents = Math.abs(1200 * Math.log2(got / want));
  assert.ok(cents < 8, `cleanGuitar midi ${midi} must stay in tune, got ${cents.toFixed(1)} cents`);
}
for (const midi of [28, 40, 52]) {
  const { samples, sampleRate } = render('bass', midi);
  const want = midiFreq(midi);
  const got = estimateHz(samples, sampleRate, want);
  const cents = Math.abs(1200 * Math.log2(got / want));
  assert.ok(cents < 8, `bass midi ${midi} must stay in tune, got ${cents.toFixed(1)} cents`);
}

// ---- the note decays like a plucked string ----
for (const family of FAMILIES) {
  const { samples, sampleRate } = render(family, family === 'bass' ? 40 : 52);
  const head = rmsOf(samples, 0, Math.floor(sampleRate * 0.05));
  const tail = rmsOf(
    samples,
    samples.length - Math.floor(sampleRate * 0.2),
    samples.length,
  );
  assert.ok(head > tail * 2, `${family} must decay from the attack to the tail`);
}

// ---- a high note decays faster than a low note ----
const lowSec = voiceLengthSec('cleanGuitar', midiFreq(40));
const highSec = voiceLengthSec('cleanGuitar', midiFreq(76));
assert.ok(lowSec > highSec, 'a low note must ring longer than a high note');

// ---- the bass sits below the guitar in the spectrum ----
const bassRender = render('bass', 28);
const guitarRender = render('cleanGuitar', 64);
const bassCentroid = centroid(bassRender.samples, bassRender.sampleRate, 0.2);
const guitarCentroid = centroid(guitarRender.samples, guitarRender.sampleRate, 0.2);
assert.ok(
  guitarCentroid - bassCentroid > 350,
  `the centroid gap must pass 350 Hz, got ${(guitarCentroid - bassCentroid).toFixed(1)}`,
);
assert.ok(
  guitarCentroid / bassCentroid > 1.35,
  `the centroid ratio must pass 1.35, got ${(guitarCentroid / bassCentroid).toFixed(2)}`,
);

// ---- the render is the same every time ----
const firstRun = render('cleanGuitar', 55).samples;
const secondRun = render('cleanGuitar', 55).samples;
assert.equal(firstRun.length, secondRun.length, 'a repeated render must keep the length');
for (let n = 0; n < firstRun.length; n += 997) {
  assert.equal(firstRun[n], secondRun[n], 'a repeated render must produce the same samples');
}

// ---- the buffer cache builds one buffer per note ----
let created = 0;
const stubCtx = {
  sampleRate: CONTEXT_RATE,
  createBuffer(channels, length, sampleRate) {
    created += 1;
    const data = new Float32Array(length);
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: () => data,
      copyToChannel: (src) => data.set(src),
    };
  },
};

const cache = createVoiceBufferCache(stubCtx, { budgetSec: 8 });
const first = cache.get('cleanGuitar', midiFreq(52), 52);
assert.ok(first, 'the cache must build a buffer');
assert.equal(created, 1);
assert.equal(cache.get('cleanGuitar', midiFreq(52), 52), first, 'the cache must reuse a buffer');
assert.equal(created, 1);
assert.ok(first.sampleRate <= CONTEXT_RATE, 'the buffer rate must fit the context');

cache.get('cleanGuitar', midiFreq(53), 53);
cache.get('cleanGuitar', midiFreq(54), 54);
cache.get('cleanGuitar', midiFreq(55), 55);
cache.get('cleanGuitar', midiFreq(56), 56);
cache.get('cleanGuitar', midiFreq(57), 57);
assert.ok(cache.heldSeconds <= 8 + 3, 'the cache must stay near its budget');
assert.ok(cache.size >= 1, 'the cache must keep the newest buffers');

cache.clear();
assert.equal(cache.size, 0);
assert.equal(cache.heldSeconds, 0);

// ---- a context without createBuffer returns no buffer ----
const emptyCache = createVoiceBufferCache({ sampleRate: CONTEXT_RATE });
assert.equal(emptyCache.get('cleanGuitar', midiFreq(52), 52), null);

console.log('string-synth: ok');
