// Shared metronome click voice.
//
// Every metronome surface (the standalone tool, score-synced playback, the
// companions, and the drills) calls into this module, so the click sounds the
// same everywhere. The user picks the voice in Settings; `soundPrefs.js` keeps
// the choice, and this file renders it.
//
// The default voice models a wood block: a short noise transient for the
// stick, a resonant body for the "tok", and one inharmonic partial for the
// bright edge. The attack starts at full level, because a ramp softens the
// transient and makes the click hard to hear against a mix.

import { getMetroVoice, voiceWave, voiceUserSoundId } from './soundPrefs.js';
import { decodeMetronomeSound } from './userSounds.js';

/** Body frequency of the click voice, per accent level. */
export const CLICK_TONE = {
  accent: 2100,
  beat: 1500,
  sub: 1150,
};

/** Peak gain of the standalone metronome tool and the practice drills. */
export const STANDALONE_CLICK_GAIN = {
  accent: 0.5,
  beat: 0.32,
};

let noiseBuffer = null;
let noiseBufferCtx = null;

/** Decoded buffers for the sound the user uploaded, per sound id. */
const sampleBuffers = new Map();

// A voice change must not change how loud the click is. The wood block is the
// reference level, and these numbers bring the other voices next to it.
const LEVEL_TRIM = {
  click: 0.62,
  cowbell: 0.64,
  beep: 0.55,
  hihat: 0.45,
  wave: 0.66,
};

function getNoiseBuffer(ctx) {
  if (noiseBuffer && noiseBufferCtx === ctx) return noiseBuffer;
  if (typeof ctx.createBuffer !== 'function') return null;
  const length = Math.max(1, Math.floor(ctx.sampleRate * 0.02));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  noiseBufferCtx = ctx;
  return buffer;
}

/**
 * Decode the uploaded click ahead of the first beat. The scheduler runs on the
 * audio clock and cannot wait for a decode, so it plays the wood block until
 * this resolves.
 * @param {AudioContext} ctx
 */
export async function prepareClickVoice(ctx) {
  const soundId = voiceUserSoundId(getMetroVoice());
  if (!soundId || !ctx) return null;
  if (sampleBuffers.has(soundId)) return sampleBuffers.get(soundId);
  const buffer = await decodeMetronomeSound(soundId, ctx);
  sampleBuffers.set(soundId, buffer || null);
  return buffer;
}

/** Drop a decoded click, e.g. after the user removes the sound. */
export function forgetClickVoice(soundId) {
  if (soundId) sampleBuffers.delete(soundId);
  else sampleBuffers.clear();
}

function noiseVoice(ctx, dest, when, { peak, decay, filterType, frequency, q = 1 }) {
  if (typeof ctx.createBufferSource !== 'function') return false;
  const buffer = getNoiseBuffer(ctx);
  if (!buffer) return false;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + decay);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  noise.start(when);
  noise.stop(when + decay + 0.01);
  return true;
}

function toneVoice(ctx, dest, when, { type, frequency, peak, decay, detune = 0 }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, when);
  if (detune && osc.detune) osc.detune.setValueAtTime(detune, when);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + decay);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(when);
  osc.stop(when + decay + 0.02);
}

function scheduleTransient(ctx, dest, when, tone, peak) {
  // A test stub can leave the buffer nodes out. The click still works without
  // the transient, so skip it instead of a failure.
  noiseVoice(ctx, dest, when, {
    peak: peak * 0.85,
    decay: 0.008,
    filterType: 'bandpass',
    frequency: Math.min(tone * 1.9, 12000),
    q: 1.1,
  });
}

/** The default voice: a wood block. */
function scheduleWoodBlock(ctx, dest, when, { tone, peak, decay }) {
  // Body: a square wave through a bandpass. The short pitch drop gives the
  // hollow wood character.
  const body = ctx.createOscillator();
  body.type = 'square';
  body.frequency.setValueAtTime(tone, when);
  body.frequency.exponentialRampToValueAtTime(tone * 0.86, when + decay);
  const bodyFilter = ctx.createBiquadFilter();
  bodyFilter.type = 'bandpass';
  bodyFilter.frequency.value = tone;
  // A wide resonance keeps the wood character but still passes the level that
  // makes the click cut through. A narrow one sounds soft.
  bodyFilter.Q.value = 6;
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(peak, when);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, when + decay);
  body.connect(bodyFilter);
  bodyFilter.connect(bodyGain);
  bodyGain.connect(dest);
  body.start(when);
  body.stop(when + decay + 0.02);

  // Partial: an inharmonic overtone that decays first. It puts the stick on the
  // front of the sound.
  toneVoice(ctx, dest, when, {
    type: 'sine',
    frequency: Math.min(tone * 2.76, 14000),
    peak: peak * 0.4,
    decay: decay * 0.5,
  });

  scheduleTransient(ctx, dest, when, tone, peak);
}

/** A dry tick with no pitch of its own. */
function scheduleStickClick(ctx, dest, when, { tone, peak, decay }) {
  const ok = noiseVoice(ctx, dest, when, {
    peak: peak * LEVEL_TRIM.click,
    decay: Math.min(decay, 0.014),
    filterType: 'highpass',
    frequency: Math.min(tone * 1.6, 9000),
    q: 0.7,
  });
  if (!ok) {
    toneVoice(ctx, dest, when, { type: 'square', frequency: tone, peak, decay: 0.01 });
  }
}

/** A clean digital tone. */
function scheduleBeep(ctx, dest, when, { tone, peak, decay }) {
  const level = peak * LEVEL_TRIM.beep;
  toneVoice(ctx, dest, when, { type: 'sine', frequency: tone, peak: level, decay });
  toneVoice(ctx, dest, when, {
    type: 'sine',
    frequency: tone * 2,
    peak: level * 0.22,
    decay: decay * 0.6,
  });
}

/** Two detuned square tones through a bandpass: the cowbell of drum machines. */
function scheduleCowbell(ctx, dest, when, { tone, peak, decay }) {
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = tone * 0.62;
  filter.Q.value = 2.4;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak * LEVEL_TRIM.cowbell, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + decay * 3);
  filter.connect(gain);
  gain.connect(dest);

  for (const ratio of [0.36, 0.53]) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(tone * ratio, when);
    osc.connect(filter);
    osc.start(when);
    osc.stop(when + decay * 3 + 0.02);
  }
}

/** A sharp crack with a very short body. */
function scheduleRimShot(ctx, dest, when, { tone, peak, decay }) {
  noiseVoice(ctx, dest, when, {
    peak,
    decay: Math.min(decay, 0.012),
    filterType: 'bandpass',
    frequency: Math.min(tone * 1.4, 10000),
    q: 2.2,
  });
  toneVoice(ctx, dest, when, {
    type: 'triangle',
    frequency: tone * 0.5,
    peak: peak * 0.7,
    decay: Math.min(decay, 0.02),
  });
}

/** A short burst of noise. */
function scheduleHiHat(ctx, dest, when, { tone, peak, decay }) {
  const ok = noiseVoice(ctx, dest, when, {
    peak: peak * LEVEL_TRIM.hihat,
    decay: Math.min(decay, 0.03),
    filterType: 'highpass',
    frequency: Math.min(tone * 3.4, 12000),
    q: 0.8,
  });
  if (!ok) scheduleBeep(ctx, dest, when, { tone, peak, decay });
}

/** One of the four basic waves the Keyboard tool offers. */
function scheduleWave(ctx, dest, when, { tone, peak, decay }, wave) {
  toneVoice(ctx, dest, when, { type: wave, frequency: tone, peak: peak * LEVEL_TRIM.wave, decay });
}

/**
 * The click the user uploaded. The accent plays it a little higher and louder,
 * so one file still marks beat one.
 */
function scheduleSample(ctx, dest, when, { tone, peak }, buffer) {
  if (typeof ctx.createBufferSource !== 'function') return false;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  // CLICK_TONE.accent is the highest tone, so the ratio raises the accent.
  source.playbackRate.value = Math.max(0.5, Math.min(2, tone / CLICK_TONE.beat));
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(Math.min(1, peak * 2), when);
  source.connect(gain);
  gain.connect(dest);
  source.start(when);
  return true;
}

const VOICE_RENDERERS = {
  woodblock: scheduleWoodBlock,
  click: scheduleStickClick,
  beep: scheduleBeep,
  cowbell: scheduleCowbell,
  rim: scheduleRimShot,
  hihat: scheduleHiHat,
};

/**
 * Schedule one metronome click at an absolute AudioContext time.
 * @param {AudioContext} ctx
 * @param {AudioNode} dest
 * @param {number} when
 * @param {{ tone?: number, peak?: number, decay?: number, voice?: string }} [options]
 */
export function scheduleClickSound(ctx, dest, when, options = {}) {
  if (!ctx || !dest) return;
  const peak = Math.max(0, Number(options.peak) || 0);
  if (peak <= 0) return;
  const tone = Number(options.tone) || CLICK_TONE.beat;
  const decay = Math.max(0.01, Number(options.decay) || 0.038);
  const shape = { tone, peak, decay };

  const voice = options.voice || getMetroVoice();

  const soundId = voiceUserSoundId(voice);
  if (soundId) {
    const buffer = sampleBuffers.get(soundId);
    // The buffer decodes off the audio thread. Until it lands, the wood block
    // keeps the beat rather than dropping it.
    if (buffer && scheduleSample(ctx, dest, when, shape, buffer)) return;
    scheduleWoodBlock(ctx, dest, when, shape);
    return;
  }

  const wave = voiceWave(voice);
  if (wave) {
    scheduleWave(ctx, dest, when, shape, wave);
    return;
  }

  const render = VOICE_RENDERERS[voice] || scheduleWoodBlock;
  render(ctx, dest, when, shape);
}
