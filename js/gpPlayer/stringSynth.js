// Offline voice rendering for the Guitar Pro synth pack.
// Plucked families use an extended Karplus-Strong string model:
// a short noise burst drives a tuned delay line with a damping filter.
// The keys family uses additive partials with piano inharmonicity.
// The renderer builds one audio buffer per family and per note.
// The buffer cache keeps the cost of a repeated note near zero.

const LN_1000 = Math.log(1000);
const TWO_PI = Math.PI * 2;
const MAX_VOICE_SEC = 3;
const MIN_VOICE_SEC = 0.35;
const EDGE_FADE_SEC = 0.0015;
const TAIL_FADE_SEC = 0.05;
const DEFAULT_CACHE_SEC = 60;

/**
 * Voice presets, one per instrument family.
 *
 * String presets:
 * - t60 / t60Ref / t60Slope set the decay time against pitch.
 * - damp sets the loop filter, which controls the loss of high partials.
 * - pickPos sets the comb notch of the pick position.
 * - pickTone sets the lowpass of the pick, in Hz.
 *
 * Keys presets use partials, rolloff, strikePos, and inharmonicity.
 * pre, drive, and post shape the tone before the pack caches the buffer.
 * renderRate sets the sample rate of the render. A dark voice needs fewer
 * samples, so it renders faster and it holds less memory.
 * peak, toneBase, and toneVel apply at playback time.
 */
export const VOICE_PRESETS = {
  cleanGuitar: {
    kind: 'string',
    renderRate: 24000,
    t60: 1.7,
    t60Ref: 220,
    t60Slope: 0.5,
    damp: 0.14,
    dampSlope: 0.04,
    pickPos: 0.14,
    pickTone: 6400,
    pickClick: 0.18,
    pre: [{ type: 'highpass', freq: 90, q: 0.7 }],
    drive: 0,
    post: [
      { type: 'peaking', freq: 2400, q: 0.8, gainDb: 4 },
      { type: 'lowpass', freq: 8600, q: 0.7 },
    ],
    peak: 0.14,
    toneBase: 1200,
    toneVel: 7200,
  },
  acousticGuitar: {
    kind: 'string',
    renderRate: 24000,
    t60: 2.2,
    t60Ref: 220,
    t60Slope: 0.55,
    damp: 0.13,
    dampSlope: 0.04,
    pickPos: 0.11,
    pickTone: 6800,
    pickClick: 0.22,
    pre: [{ type: 'highpass', freq: 70, q: 0.7 }],
    drive: 0,
    post: [
      { type: 'peaking', freq: 120, q: 1.2, gainDb: 5 },
      { type: 'peaking', freq: 420, q: 1, gainDb: 2.5 },
      { type: 'peaking', freq: 2600, q: 0.8, gainDb: 2 },
      { type: 'lowpass', freq: 8200, q: 0.7 },
    ],
    peak: 0.15,
    toneBase: 1400,
    toneVel: 8000,
  },
  distortedGuitar: {
    kind: 'string',
    renderRate: 22050,
    t60: 2.6,
    t60Ref: 220,
    t60Slope: 0.3,
    damp: 0.33,
    dampSlope: 0.04,
    pickPos: 0.2,
    pickTone: 4200,
    pickClick: 0.12,
    pre: [
      { type: 'highpass', freq: 150, q: 0.7 },
      { type: 'peaking', freq: 800, q: 0.8, gainDb: 4 },
    ],
    drive: 7,
    post: [
      { type: 'highpass', freq: 110, q: 0.7 },
      { type: 'peaking', freq: 2200, q: 1.1, gainDb: 3 },
      { type: 'lowpass', freq: 3600, q: 0.9 },
    ],
    peak: 0.1,
    toneBase: 900,
    toneVel: 3200,
  },
  bass: {
    kind: 'string',
    renderRate: 16000,
    t60: 2.4,
    t60Ref: 82,
    t60Slope: 0.4,
    damp: 0.56,
    dampSlope: 0.05,
    pickPos: 0.24,
    pickTone: 2200,
    pickClick: 0.1,
    pre: [{ type: 'highpass', freq: 35, q: 0.7 }],
    drive: 1.2,
    post: [
      { type: 'peaking', freq: 90, q: 1, gainDb: 3.5 },
      { type: 'lowpass', freq: 850, q: 0.7 },
    ],
    peak: 0.17,
    toneBase: 260,
    toneVel: 900,
  },
  keys: {
    kind: 'keys',
    renderRate: 24000,
    t60: 2.6,
    t60Ref: 262,
    t60Slope: 0.6,
    partials: 20,
    rolloff: 1.25,
    strikePos: 0.13,
    inharmonicity: 0.0004,
    partialDamp: 0.55,
    thump: 0.09,
    pre: [{ type: 'highpass', freq: 45, q: 0.7 }],
    drive: 0,
    post: [
      { type: 'peaking', freq: 2000, q: 0.9, gainDb: 2 },
      { type: 'lowpass', freq: 7000, q: 0.7 },
    ],
    peak: 0.13,
    toneBase: 1100,
    toneVel: 7000,
  },
};

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Get one voice preset by family name.
 * @param {string} family
 */
export function presetForFamily(family) {
  return VOICE_PRESETS[family] || VOICE_PRESETS.cleanGuitar;
}

/**
 * Get the render sample rate of one family.
 * The rate never goes above the rate of the audio context.
 * @param {string} family
 * @param {number} contextRate
 */
export function renderRateFor(family, contextRate) {
  const ctxRate = clamp(contextRate, 8000, 192000);
  const preferred = presetForFamily(family).renderRate || ctxRate;
  return Math.min(ctxRate, Math.max(8000, preferred));
}

function decaySeconds(preset, freq) {
  const ratio = preset.t60Ref / Math.max(20, freq);
  return clamp(preset.t60 * ratio ** preset.t60Slope, 0.25, MAX_VOICE_SEC);
}

/**
 * Get the render length of one note, in seconds.
 * @param {string} family
 * @param {number} freq
 */
export function voiceLengthSec(family, freq) {
  const preset = presetForFamily(family);
  const t60 = decaySeconds(preset, freq);
  return clamp(t60 * 1.08 + 0.06, MIN_VOICE_SEC, MAX_VOICE_SEC);
}

/* A small deterministic noise source. The same note always renders the same
   samples, so a cached buffer and a fresh buffer sound identical. */
function makeNoise(seed) {
  let state = (seed >>> 0) || 1;
  return function next() {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return (state / 0xffffffff) * 2 - 1;
  };
}

function biquadCoefficients(stage, sampleRate) {
  const freq = clamp(stage.freq, 10, sampleRate * 0.45);
  const q = clamp(stage.q ?? 0.707, 0.05, 20);
  const w0 = (TWO_PI * freq) / sampleRate;
  const cosW = Math.cos(w0);
  const sinW = Math.sin(w0);
  const alpha = sinW / (2 * q);

  let b0 = 1;
  let b1 = 0;
  let b2 = 0;
  let a0 = 1;
  let a1 = 0;
  let a2 = 0;

  if (stage.type === 'lowpass') {
    b0 = (1 - cosW) / 2;
    b1 = 1 - cosW;
    b2 = b0;
    a0 = 1 + alpha;
    a1 = -2 * cosW;
    a2 = 1 - alpha;
  } else if (stage.type === 'highpass') {
    b0 = (1 + cosW) / 2;
    b1 = -(1 + cosW);
    b2 = b0;
    a0 = 1 + alpha;
    a1 = -2 * cosW;
    a2 = 1 - alpha;
  } else if (stage.type === 'peaking') {
    const a = 10 ** ((stage.gainDb || 0) / 40);
    b0 = 1 + alpha * a;
    b1 = -2 * cosW;
    b2 = 1 - alpha * a;
    a0 = 1 + alpha / a;
    a1 = -2 * cosW;
    a2 = 1 - alpha / a;
  } else {
    return null;
  }

  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0,
  };
}

/**
 * Apply one biquad stage to a sample block, in place.
 * @param {Float32Array} samples
 * @param {object} stage
 * @param {number} sampleRate
 */
export function applyBiquad(samples, stage, sampleRate) {
  const c = biquadCoefficients(stage, sampleRate);
  if (!c) return samples;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let n = 0; n < samples.length; n += 1) {
    const x0 = samples[n];
    const y0 = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    samples[n] = y0;
  }
  return samples;
}

function applyStages(samples, stages, sampleRate) {
  if (!Array.isArray(stages)) return samples;
  for (const stage of stages) applyBiquad(samples, stage, sampleRate);
  return samples;
}

function applyDrive(samples, amount) {
  if (!(amount > 0)) return samples;
  const norm = Math.tanh(amount);
  for (let n = 0; n < samples.length; n += 1) {
    samples[n] = Math.tanh(samples[n] * amount) / norm;
  }
  return samples;
}

function normalize(samples, target = 0.98) {
  let peak = 0;
  for (let n = 0; n < samples.length; n += 1) {
    const abs = Math.abs(samples[n]);
    if (abs > peak) peak = abs;
  }
  if (peak < 1e-6) return samples;
  const scale = target / peak;
  for (let n = 0; n < samples.length; n += 1) samples[n] *= scale;
  return samples;
}

function fadeEdges(samples, sampleRate) {
  const head = Math.max(1, Math.round(EDGE_FADE_SEC * sampleRate));
  const tail = Math.max(1, Math.round(TAIL_FADE_SEC * sampleRate));
  const len = samples.length;
  for (let n = 0; n < head && n < len; n += 1) samples[n] *= n / head;
  for (let n = 0; n < tail && n < len; n += 1) {
    samples[len - 1 - n] *= n / tail;
  }
  return samples;
}

function makeExcitation(preset, freq, sampleRate, noise) {
  const period = sampleRate / freq;
  const len = Math.max(8, Math.round(period));
  const raw = new Float32Array(len);
  const cutoff = clamp(preset.pickTone, 200, sampleRate * 0.45);
  const coef = Math.exp((-TWO_PI * cutoff) / sampleRate);
  let lp = 0;
  for (let n = 0; n < len; n += 1) {
    lp = (1 - coef) * noise() + coef * lp;
    raw[n] = lp;
  }

  // The pick position removes the partials with a node at that point.
  const combDelay = Math.max(1, Math.round(preset.pickPos * period));
  const out = new Float32Array(len);
  for (let n = 0; n < len; n += 1) {
    const prior = n >= combDelay ? raw[n - combDelay] : 0;
    out[n] = raw[n] - prior;
  }

  // A short click gives the attack its pick edge.
  const clickLen = Math.max(2, Math.round(sampleRate * 0.001));
  for (let n = 0; n < clickLen && n < len; n += 1) {
    out[n] += preset.pickClick * (1 - n / clickLen) * noise();
  }
  return normalize(out, 1);
}

function renderString(out, preset, freq, sampleRate, noise) {
  const period = sampleRate / freq;
  const octaves = Math.log2(Math.max(20, freq) / preset.t60Ref);
  const damp = clamp(preset.damp + preset.dampSlope * octaves, 0.02, 0.85);
  const t60 = decaySeconds(preset, freq);
  const loopGain = Math.exp(-LN_1000 / (freq * t60));

  // The loop filter adds delay, so the delay line gets shorter to stay in tune.
  // The phase delay of the one-pole filter changes with pitch.
  const w = (TWO_PI * freq) / sampleRate;
  const filterDelay = w > 0
    ? Math.atan2(damp * Math.sin(w), 1 - damp * Math.cos(w)) / w
    : damp / (1 - damp);
  const lineDelay = Math.max(2, period - filterDelay);
  const lineLen = Math.ceil(lineDelay) + 4;
  const line = new Float32Array(lineLen);
  const excitation = makeExcitation(preset, freq, sampleRate, noise);

  let write = 0;
  let lp = 0;
  for (let n = 0; n < out.length; n += 1) {
    let read = write - lineDelay;
    if (read < 0) read += lineLen;
    const i0 = Math.floor(read);
    const frac = read - i0;
    const s0 = line[i0 % lineLen];
    const s1 = line[(i0 + 1) % lineLen];
    const delayed = s0 + (s1 - s0) * frac;
    lp = (1 - damp) * delayed + damp * lp;
    const value = loopGain * lp + (n < excitation.length ? excitation[n] : 0);
    line[write] = value;
    write = (write + 1) % lineLen;
    out[n] = value;
  }
  return out;
}

function renderKeys(out, preset, freq, sampleRate, noise) {
  const len = out.length;
  const nyquist = sampleRate * 0.45;
  const baseT60 = decaySeconds(preset, freq);
  const inharm = preset.inharmonicity;
  const maxPartial = Math.min(preset.partials, Math.floor(nyquist / freq));

  for (let k = 1; k <= maxPartial; k += 1) {
    const partialFreq = freq * k * Math.sqrt(1 + inharm * k * k);
    if (partialFreq >= nyquist) break;
    const strike = Math.abs(Math.sin(Math.PI * k * preset.strikePos));
    const amp = (strike / k ** preset.rolloff) * 1;
    if (amp < 0.0008) continue;
    const t60 = baseT60 / (1 + preset.partialDamp * (k - 1));
    const decay = Math.exp(-LN_1000 / (t60 * sampleRate));
    const w = (TWO_PI * partialFreq) / sampleRate;
    const cosW = Math.cos(w);
    const sinW = Math.sin(w);
    let cosV = 1;
    let sinV = 0;
    let env = amp;
    for (let n = 0; n < len; n += 1) {
      out[n] += env * sinV;
      const nextCos = cosV * cosW - sinV * sinW;
      sinV = sinV * cosW + cosV * sinW;
      cosV = nextCos;
      env *= decay;
      if (env < 1e-6) break;
    }
  }

  // The hammer adds a short noise thump at the attack.
  const thumpLen = Math.max(4, Math.round(sampleRate * 0.02));
  const coef = Math.exp((-TWO_PI * 1600) / sampleRate);
  let lp = 0;
  for (let n = 0; n < thumpLen && n < len; n += 1) {
    lp = (1 - coef) * noise() + coef * lp;
    out[n] += preset.thump * lp * (1 - n / thumpLen);
  }
  return out;
}

/**
 * Render one note of one family into a sample block.
 * The function is pure. It does not need Web Audio.
 * @param {{ family: string, freq: number, sampleRate: number, seed?: number }} opts
 * @returns {Float32Array}
 */
export function renderVoiceSamples({ family, freq, sampleRate, seed = 0 }) {
  const preset = presetForFamily(family);
  const rate = clamp(sampleRate, 8000, 192000);
  const f = clamp(freq, 16, rate / 3);
  const len = Math.max(64, Math.round(voiceLengthSec(family, f) * rate));
  const out = new Float32Array(len);
  const noise = makeNoise(0x9e3779b9 ^ (Math.round(f * 4) + seed * 2654435761));

  if (preset.kind === 'keys') renderKeys(out, preset, f, rate, noise);
  else renderString(out, preset, f, rate, noise);

  applyStages(out, preset.pre, rate);
  applyDrive(out, preset.drive);
  applyStages(out, preset.post, rate);
  fadeEdges(out, rate);
  normalize(out, 0.98);
  return out;
}

/**
 * Build a per-context cache of rendered note buffers.
 * The cache drops the least recent buffer when it passes the budget.
 * @param {BaseAudioContext} audioCtx
 * @param {{ budgetSec?: number }} [opts]
 */
export function createVoiceBufferCache(audioCtx, opts = {}) {
  const budgetSec = Math.max(4, Number(opts.budgetSec) || DEFAULT_CACHE_SEC);
  const entries = new Map();
  let heldSec = 0;

  function evictOldest() {
    const first = entries.keys().next();
    if (first.done) return;
    const held = entries.get(first.value);
    entries.delete(first.value);
    heldSec -= held?.seconds || 0;
  }

  return {
    /**
     * Get the buffer of one note. Render it one time, then reuse it.
     * @param {string} family
     * @param {number} freq
     * @param {number} midi
     * @returns {AudioBuffer|null}
     */
    get(family, freq, midi) {
      if (typeof audioCtx?.createBuffer !== 'function') return null;
      const key = `${family}:${Math.round(midi * 2)}`;
      const hit = entries.get(key);
      if (hit) {
        entries.delete(key);
        entries.set(key, hit);
        return hit.buffer;
      }

      const contextRate = Number(audioCtx.sampleRate) || 48000;
      const sampleRate = renderRateFor(family, contextRate);
      const samples = renderVoiceSamples({ family, freq, sampleRate });
      let buffer = null;
      try {
        buffer = audioCtx.createBuffer(1, samples.length, sampleRate);
        if (typeof buffer?.copyToChannel === 'function') {
          buffer.copyToChannel(samples, 0);
        } else {
          buffer.getChannelData(0).set(samples);
        }
      } catch (e) {
        return null;
      }

      const seconds = samples.length / sampleRate;
      entries.set(key, { buffer, seconds });
      heldSec += seconds;
      while (heldSec > budgetSec && entries.size > 1) evictOldest();
      return buffer;
    },
    get size() { return entries.size; },
    get heldSeconds() { return heldSec; },
    clear() {
      entries.clear();
      heldSec = 0;
    },
  };
}
