// The voices of Riff Spark.
//
// The cadence needs three sounds that a player can tell apart with eyes
// closed: a low chug, a pitched note, and a chord stab. The pedal riff needs
// a low guitar-like tone that can play a real pitch. The pulse under both is
// the shared click voice, played under the pattern so the hits sit on top.
//
// Every function schedules on the audio clock and returns at once.

import { CLICK_TONE, STANDALONE_CLICK_GAIN, scheduleClickSound } from '../audio/clickSynth.js';

/** How loud the pulse plays, relative to the standalone metronome. */
const PULSE_TRIM = 0.5;

let noiseBuffer = null;
let noiseBufferCtx = null;
let shaperCurve = null;

function getNoiseBuffer(ctx) {
  if (noiseBuffer && noiseBufferCtx === ctx) return noiseBuffer;
  if (typeof ctx.createBuffer !== 'function') return null;
  const length = Math.max(1, Math.floor(ctx.sampleRate * 0.05));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  noiseBufferCtx = ctx;
  return buffer;
}

function getShaperCurve() {
  if (shaperCurve) return shaperCurve;
  const size = 1024;
  const curve = new Float32Array(size);
  const drive = 3.2;
  for (let i = 0; i < size; i += 1) {
    const x = (i * 2) / size - 1;
    curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
  }
  shaperCurve = curve;
  return curve;
}

function noiseBurst(ctx, dest, when, { peak, decay, type, frequency, q = 1 }) {
  const buffer = getNoiseBuffer(ctx);
  if (!buffer || typeof ctx.createBufferSource !== 'function') return;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + decay);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  source.start(when);
  source.stop(when + decay + 0.01);
}

function sweepTone(ctx, dest, when, { type, from, to, sweep, peak, decay }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, when);
  osc.frequency.exponentialRampToValueAtTime(to, when + sweep);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + decay);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(when);
  osc.stop(when + decay + 0.02);
}

/**
 * The pulse click under the pattern.
 * @param {AudioContext} ctx
 * @param {AudioNode} dest
 * @param {number} when
 * @param {boolean} accent true on the first slot of a bar
 */
export function schedulePulse(ctx, dest, when, accent) {
  scheduleClickSound(ctx, dest, when, {
    tone: accent ? CLICK_TONE.accent : CLICK_TONE.sub,
    peak: (accent ? STANDALONE_CLICK_GAIN.accent : STANDALONE_CLICK_GAIN.beat) * PULSE_TRIM,
    decay: accent ? 0.04 : 0.03,
  });
}

/**
 * One unpitched hit of the cadence.
 * @param {AudioContext} ctx
 * @param {AudioNode} dest
 * @param {number} when
 * @param {string} role chug, note, or stab
 */
export function scheduleHit(ctx, dest, when, role) {
  if (role === 'note') {
    sweepTone(ctx, dest, when, { type: 'triangle', from: 440, to: 392, sweep: 0.05, peak: 0.4, decay: 0.1 });
    noiseBurst(ctx, dest, when, { peak: 0.2, decay: 0.014, type: 'bandpass', frequency: 1800, q: 1.2 });
    return;
  }
  if (role === 'stab') {
    for (const frequency of [110, 165, 220]) {
      sweepTone(ctx, dest, when, { type: 'sawtooth', from: frequency, to: frequency * 0.97, sweep: 0.18, peak: 0.16, decay: 0.2 });
    }
    noiseBurst(ctx, dest, when, { peak: 0.3, decay: 0.03, type: 'lowpass', frequency: 2600 });
    return;
  }
  // The chug: a fast pitch drop into the floor, and a short knock on the front.
  sweepTone(ctx, dest, when, { type: 'sine', from: 150, to: 46, sweep: 0.06, peak: 0.75, decay: 0.12 });
  noiseBurst(ctx, dest, when, { peak: 0.28, decay: 0.022, type: 'lowpass', frequency: 900 });
}

/** The length each role holds, in seconds, before the gate closes. */
const HOLD = { chug: 0.13, note: 0.55, stab: 0.4 };

/**
 * One pitched attack of the pedal riff. A low guitar-like tone: two detuned
 * saws and a sub octave, through a soft clip and a closing low-pass filter.
 * @param {AudioContext} ctx
 * @param {AudioNode} dest
 * @param {number} when
 * @param {number} midi
 * @param {number} durSec the time until the next attack
 * @param {string} role chug, note, or stab
 */
export function scheduleNote(ctx, dest, when, midi, durSec, role) {
  const hold = Math.max(0.06, Math.min(durSec - 0.02, HOLD[role] || HOLD.note));
  const frequency = 440 * Math.pow(2, (midi - 69) / 12);

  const shaper = ctx.createWaveShaper();
  shaper.curve = getShaperCurve();
  shaper.oversample = '2x';

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.9;
  const open = role === 'chug' ? 1300 : role === 'stab' ? 3200 : 2600;
  const close = role === 'chug' ? 380 : 900;
  filter.frequency.setValueAtTime(open, when);
  filter.frequency.exponentialRampToValueAtTime(close, when + hold);

  const gain = ctx.createGain();
  const peak = role === 'chug' ? 0.3 : role === 'stab' ? 0.26 : 0.27;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(peak, when + 0.004);
  gain.gain.setValueAtTime(peak, when + hold * 0.7);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + hold + 0.04);

  shaper.connect(filter);
  filter.connect(gain);
  gain.connect(dest);

  const voices = [
    { type: 'sawtooth', ratio: 1, detune: -7, level: 0.5 },
    { type: 'sawtooth', ratio: 1, detune: 7, level: 0.5 },
    { type: 'square', ratio: 0.5, detune: 0, level: 0.35 },
  ];
  for (const voice of voices) {
    const osc = ctx.createOscillator();
    osc.type = voice.type;
    osc.frequency.setValueAtTime(frequency * voice.ratio, when);
    if (osc.detune) osc.detune.setValueAtTime(voice.detune, when);
    const level = ctx.createGain();
    level.gain.value = voice.level;
    osc.connect(level);
    level.connect(shaper);
    osc.start(when);
    osc.stop(when + hold + 0.08);
  }

  // The pick: a short knock on the front of every attack.
  noiseBurst(ctx, dest, when, { peak: role === 'chug' ? 0.22 : 0.14, decay: 0.012, type: 'lowpass', frequency: 1800 });
}
