// Browser-only drum engine: a small Web Audio synthesizer kit plus a
// look-ahead scheduler. There are no sample assets and no external libraries —
// every drum voice is synthesized, exactly like the rest of Musi's audio
// (metronome, keyboard, ear trainer). This keeps the feature fully static,
// offline-capable and free of missing-sample failure modes.
//
// Public API mirrors the spec: init(), start(), stop(), pause(), setBpm(),
// schedulePattern(), trigger() (one-shot audition) and dispose().

import { audioCtx, ensureAudio, getAnalyserDestination } from '../audio.js';
import { stepsPerBeat } from './types.js';

let noiseBuffer = null;
function getNoise(ctx) {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const len = Math.floor(ctx.sampleRate * 1.2);
  noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

function env(ctx, gainNode, time, peak, decay, attack = 0.001) {
  const g = gainNode.gain;
  g.cancelScheduledValues(time);
  g.setValueAtTime(0.0001, time);
  g.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + attack);
  g.exponentialRampToValueAtTime(0.0001, time + attack + decay);
}

// --- Individual voices ----------------------------------------------------
function voiceKick(ctx, out, time, vel) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(48, time + 0.12);
  env(ctx, gain, time, vel, 0.34);
  osc.connect(gain).connect(out);
  osc.start(time);
  osc.stop(time + 0.4);
}

function voiceSnare(ctx, out, time, vel, ghost) {
  const noise = ctx.createBufferSource();
  noise.buffer = getNoise(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = ghost ? 1400 : 1800;
  const nGain = ctx.createGain();
  env(ctx, nGain, time, vel * (ghost ? 0.5 : 0.9), ghost ? 0.07 : 0.16);
  noise.connect(hp).connect(nGain).connect(out);
  noise.start(time);
  noise.stop(time + 0.25);

  const osc = ctx.createOscillator();
  const oGain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(190, time);
  osc.frequency.exponentialRampToValueAtTime(120, time + 0.1);
  env(ctx, oGain, time, vel * (ghost ? 0.18 : 0.4), 0.1);
  osc.connect(oGain).connect(out);
  osc.start(time);
  osc.stop(time + 0.2);
}

function voiceHat(ctx, out, time, vel, open) {
  const noise = ctx.createBufferSource();
  noise.buffer = getNoise(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7000;
  const gain = ctx.createGain();
  env(ctx, gain, time, vel * 0.5, open ? 0.32 : 0.05);
  noise.connect(hp).connect(gain).connect(out);
  noise.start(time);
  noise.stop(time + (open ? 0.45 : 0.12));
}

function voiceCymbal(ctx, out, time, vel, ride) {
  const noise = ctx.createBufferSource();
  noise.buffer = getNoise(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = ride ? 'bandpass' : 'highpass';
  bp.frequency.value = ride ? 5200 : 5000;
  bp.Q.value = ride ? 1.2 : 0.6;
  const gain = ctx.createGain();
  env(ctx, gain, time, vel * (ride ? 0.32 : 0.42), ride ? 0.3 : 1.0);
  noise.connect(bp).connect(gain).connect(out);
  noise.start(time);
  noise.stop(time + (ride ? 0.5 : 1.2));

  if (ride) {
    const osc = ctx.createOscillator();
    const oGain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 380;
    env(ctx, oGain, time, vel * 0.12, 0.25);
    osc.connect(oGain).connect(out);
    osc.start(time);
    osc.stop(time + 0.3);
  }
}

function voiceTom(ctx, out, time, vel, freq) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, time);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.6, time + 0.2);
  env(ctx, gain, time, vel * 0.85, 0.3);
  osc.connect(gain).connect(out);
  osc.start(time);
  osc.stop(time + 0.4);
}

// Schedules one instrument hit at an absolute AudioContext time.
function triggerVoice(instrument, time, vel) {
  const ctx = audioCtx;
  if (!ctx) return;
  const out = getAnalyserDestination();
  const v = Math.max(0.02, Math.min(1.4, vel));
  switch (instrument) {
    case 'kick': return voiceKick(ctx, out, time, v);
    case 'snare': return voiceSnare(ctx, out, time, v, false);
    case 'snareGhost': return voiceSnare(ctx, out, time, v, true);
    case 'snareFlam':
      voiceSnare(ctx, out, Math.max(ctx.currentTime, time - 0.02), 0.45, true);
      return voiceSnare(ctx, out, time, Math.max(v, 0.9), false);
    case 'hihatClosed': return voiceHat(ctx, out, time, v, false);
    case 'hihatOpen': return voiceHat(ctx, out, time, v, true);
    case 'crash': return voiceCymbal(ctx, out, time, v, false);
    case 'ride': return voiceCymbal(ctx, out, time, v, true);
    case 'tomHigh': return voiceTom(ctx, out, time, v, 220);
    case 'tomMid': return voiceTom(ctx, out, time, v, 160);
    case 'tomFloor': return voiceTom(ctx, out, time, v, 110);
    default: return undefined;
  }
}

function metroClick(time, accent) {
  const ctx = audioCtx;
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = accent ? 2000 : 1500;
  gain.gain.setValueAtTime(accent ? 0.22 : 0.13, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
  osc.connect(gain).connect(getAnalyserDestination());
  osc.start(time);
  osc.stop(time + 0.04);
}

// --- Engine ---------------------------------------------------------------
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;

const engine = {
  pattern: null,
  stepMap: [],            // stepMap[step] = [{instrument, velocity, probability}]
  total: 0,
  per: 4,                 // steps per beat
  bpm: 110,
  swing: 0,               // 0..1
  humanizeTime: 0,        // 0..1 -> up to ~22ms jitter
  humanizeVel: 0,         // 0..1 -> up to ~0.3 velocity jitter
  laneVolume: {},         // instrument -> 0..1.4
  muted: new Set(),
  soloed: new Set(),
  loopStart: 0,
  loopEnd: 0,
  looping: true,
  metronome: false,
  countIn: false,
  crashOnLoopStart: false,
  resolveFill: false,

  playing: false,
  _timer: null,
  _nextTime: 0,
  _step: 0,
  _countLeft: 0,
  _loopCount: 0,
  onStep: null,
  onLoop: null,
};

function secondsPerStep() {
  return (60 / engine.bpm) / engine.per;
}

function laneAudible(instrument) {
  if (engine.soloed.size > 0) {
    // A soloed snare also implies its ghost/flam variants, and vice versa.
    if (instrument.startsWith('snare') && [...engine.soloed].some((s) => s.startsWith('snare'))) return true;
    if (instrument.startsWith('hihat') && [...engine.soloed].some((s) => s.startsWith('hihat'))) return true;
    return engine.soloed.has(instrument);
  }
  if (engine.muted.has(instrument)) return false;
  if (instrument.startsWith('snare') && engine.muted.has('snare') && instrument !== 'snare') {
    // muting the snare lane mutes ghost/flam too
    return false;
  }
  if (instrument.startsWith('hihat') && engine.muted.has('hihatClosed') && instrument === 'hihatOpen') {
    return false;
  }
  return true;
}

function laneVol(instrument) {
  const key = instrument.startsWith('snare') ? 'snare'
    : instrument.startsWith('hihat') ? 'hihatClosed' : instrument;
  const v = engine.laneVolume[key];
  return v === undefined ? 1 : v;
}

function swingOffset(step) {
  if (!engine.swing) return 0;
  if (engine.per !== 2 && engine.per !== 4) return 0; // only straight 8th/16th
  // Delay the off-grid subdivisions (every other step).
  if (step % 2 === 1) return engine.swing * secondsPerStep() * 0.6;
  return 0;
}

function jitterTime() {
  if (!engine.humanizeTime) return 0;
  return (Math.random() * 2 - 1) * engine.humanizeTime * 0.022;
}

function jitterVel(v) {
  if (!engine.humanizeVel) return v;
  const j = (Math.random() * 2 - 1) * engine.humanizeVel * 0.3;
  return Math.max(0.05, Math.min(1.3, v + j));
}

function buildStepMap(pattern) {
  const total = (pattern.stepsPerBar || 16) * Math.max(1, pattern.bars || 1);
  const map = new Array(total).fill(null).map(() => []);
  for (const s of pattern.steps || []) {
    if (s.step >= 0 && s.step < total) {
      map[s.step].push({
        instrument: s.instrument,
        velocity: s.velocity ?? 0.72,
        probability: s.probability ?? 1,
      });
    }
  }
  return { map, total };
}

export function initEngine() {
  ensureAudio();
}

export function schedulePattern(pattern, opts = {}) {
  engine.pattern = pattern;
  const { map, total } = buildStepMap(pattern);
  engine.stepMap = map;
  engine.total = total;
  engine.per = stepsPerBeat(pattern.subdivision);
  if (opts.loopStart != null) engine.loopStart = Math.max(0, Math.min(total - 1, opts.loopStart));
  else engine.loopStart = 0;
  if (opts.loopEnd != null) engine.loopEnd = Math.max(engine.loopStart, Math.min(total - 1, opts.loopEnd));
  else engine.loopEnd = total - 1;
  engine.resolveFill = !!opts.resolveFill;
  // If we are playing, keep the playhead within the (possibly new) loop window.
  if (engine._step >= total) engine._step = engine.loopStart;
}

export function setLoop(start, end) {
  engine.loopStart = Math.max(0, Math.min(engine.total - 1, start));
  engine.loopEnd = Math.max(engine.loopStart, Math.min(engine.total - 1, end));
}

export function setBpm(bpm) {
  engine.bpm = Math.max(20, Math.min(320, Number(bpm) || 110));
}
export function getBpm() { return engine.bpm; }

export function setEngineOptions(opts = {}) {
  if (opts.swing != null) engine.swing = Math.max(0, Math.min(1, opts.swing));
  if (opts.humanizeTime != null) engine.humanizeTime = Math.max(0, Math.min(1, opts.humanizeTime));
  if (opts.humanizeVel != null) engine.humanizeVel = Math.max(0, Math.min(1, opts.humanizeVel));
  if (opts.looping != null) engine.looping = !!opts.looping;
  if (opts.metronome != null) engine.metronome = !!opts.metronome;
  if (opts.countIn != null) engine.countIn = !!opts.countIn;
  if (opts.crashOnLoopStart != null) engine.crashOnLoopStart = !!opts.crashOnLoopStart;
  if (opts.resolveFill != null) engine.resolveFill = !!opts.resolveFill;
}

export function setLaneVolume(instrument, v) {
  engine.laneVolume[instrument] = Math.max(0, Math.min(1.4, v));
}
export function setMuted(instrument, on) {
  if (on) engine.muted.add(instrument); else engine.muted.delete(instrument);
}
export function setSoloed(instrument, on) {
  if (on) engine.soloed.add(instrument); else engine.soloed.delete(instrument);
}
export function clearMuteSolo() { engine.muted.clear(); engine.soloed.clear(); }
export function getMuted() { return new Set(engine.muted); }
export function getSoloed() { return new Set(engine.soloed); }

// Audition a single instrument immediately (used when toggling a cell or
// previewing a lane sound).
export function trigger(instrument, velocity = 0.9) {
  ensureAudio();
  triggerVoice(instrument, audioCtx.currentTime + 0.001, velocity);
}

function scheduleStep(step, time) {
  const events = engine.stepMap[step] || [];
  for (const ev of events) {
    if (!laneAudible(ev.instrument)) continue;
    if (ev.probability < 1 && Math.random() > ev.probability) continue;
    const t = time + swingOffset(step) + jitterTime();
    const vel = jitterVel(ev.velocity) * laneVol(ev.instrument);
    triggerVoice(ev.instrument, Math.max(audioCtx.currentTime, t), vel);
  }
  // Metronome click on each beat.
  if (engine.metronome && step % engine.per === 0) {
    metroClick(time, step === engine.loopStart);
  }
  // Resolve-fill: crash + kick on the downbeat after the loop window.
  if (engine.resolveFill && step === engine.loopStart && engine._loopCount > 0) {
    triggerVoice('crash', time, 1);
    triggerVoice('kick', time, 1);
  } else if (engine.crashOnLoopStart && step === engine.loopStart && engine._loopCount > 0) {
    triggerVoice('crash', time, 0.95);
  }

  if (engine.onStep) {
    const delay = Math.max(0, (time - audioCtx.currentTime) * 1000);
    const s = step;
    setTimeout(() => { if (engine.playing) engine.onStep(s); }, delay);
  }
}

function scheduler() {
  if (!engine.playing) return;
  const dur = secondsPerStep();
  while (engine._nextTime < audioCtx.currentTime + SCHEDULE_AHEAD) {
    if (engine._countLeft > 0) {
      metroClick(engine._nextTime, engine._countLeft === Math.round(engine.total / engine.per));
      engine._nextTime += 60 / engine.bpm;
      engine._countLeft--;
      continue;
    }
    scheduleStep(engine._step, engine._nextTime);
    engine._nextTime += dur;
    if (engine._step >= engine.loopEnd) {
      if (!engine.looping) {
        const endAt = engine._nextTime;
        const ms = Math.max(0, (endAt - audioCtx.currentTime) * 1000);
        engine.playing = 'stopping';
        setTimeout(() => { if (engine.playing === 'stopping') stop(); }, ms + 60);
        return;
      }
      engine._step = engine.loopStart;
      engine._loopCount++;
      if (engine.onLoop) {
        const delay = Math.max(0, (engine._nextTime - audioCtx.currentTime) * 1000);
        const n = engine._loopCount;
        setTimeout(() => { if (engine.playing) engine.onLoop(n); }, delay);
      }
    } else {
      engine._step++;
    }
  }
  engine._timer = setTimeout(scheduler, LOOKAHEAD_MS);
}

export function start(opts = {}) {
  if (!engine.pattern) return;
  ensureAudio();
  if (engine.playing) stop();
  engine.playing = true;
  engine._loopCount = 0;
  engine._step = opts.fromStep != null ? opts.fromStep : engine.loopStart;
  engine._countLeft = engine.countIn ? Math.max(1, Math.round(engine.total / engine.per)) : 0;
  engine._nextTime = audioCtx.currentTime + 0.08;
  scheduler();
}

export function stop() {
  engine.playing = false;
  if (engine._timer) { clearTimeout(engine._timer); engine._timer = null; }
  engine._step = engine.loopStart;
  if (engine.onStep) engine.onStep(-1);
}

export function pause() {
  if (!engine.playing) return;
  engine.playing = false;
  if (engine._timer) { clearTimeout(engine._timer); engine._timer = null; }
}

export function resume() {
  if (engine.playing || !engine.pattern) return;
  ensureAudio();
  engine.playing = true;
  engine._nextTime = audioCtx.currentTime + 0.06;
  scheduler();
}

export function isPlaying() { return engine.playing === true; }
export function getLoopCount() { return engine._loopCount; }

export function setCallbacks({ onStep, onLoop } = {}) {
  if (onStep !== undefined) engine.onStep = onStep;
  if (onLoop !== undefined) engine.onLoop = onLoop;
}

export function dispose() {
  stop();
  engine.onStep = null;
  engine.onLoop = null;
  engine.pattern = null;
  engine.stepMap = [];
  clearMuteSolo();
}
