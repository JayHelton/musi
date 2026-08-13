// Mic session helper for Study Lab — pitch tracker + matcher + optional drone.

import {
  audioCtx, ensureAudio, midiFreq, requestMicStream, releaseMicStream,
} from './audio.js';
import { createPitchTracker } from './pitch.js';
import { createPitchMatcher, midiToLabel } from './pitchMatch.js';
import { createStableNoteGate } from './interval-map/audioAnswer.js';

export function createStudyLabMic({
  holdMs = 280,
  toleranceCents = 40,
  onFrame = null,
} = {}) {
  const state = {
    running: false,
    stream: null,
    source: null,
    analyser: null,
    buf: null,
    rafId: null,
    tracker: null,
    matcher: createPitchMatcher({ holdMs, toleranceCents, windowCents: 200, graceMs: 160 }),
    gate: createStableNoteGate({ stableMs: holdMs, toleranceCents }),
    drone: null,
    droneMutedForScore: false,
  };

  async function start() {
    if (state.running) return;
    ensureAudio();
    state.stream = await requestMicStream({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
      },
    });
    state.source = audioCtx.createMediaStreamSource(state.stream);
    state.analyser = audioCtx.createAnalyser();
    state.analyser.fftSize = 4096;
    state.source.connect(state.analyser);
    state.buf = new Float32Array(state.analyser.fftSize);
    state.tracker = createPitchTracker({
      sampleRate: audioCtx.sampleRate,
      minClarity: 0.55,
      minRms: 0.01,
    });
    state.running = true;
    tick();
  }

  function stop() {
    state.running = false;
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = null;
    stopDrone();
    if (state.source) {
      try { state.source.disconnect(); } catch (_) { /* ignore */ }
      state.source = null;
    }
    state.analyser = null;
    if (state.stream) {
      releaseMicStream(state.stream);
      state.stream = null;
    }
    state.tracker = null;
  }

  function tick() {
    if (!state.running) return;
    state.analyser.getFloatTimeDomainData(state.buf);
    const tracked = state.tracker.process(state.buf);
    const { info, voiced, frequencyHz } = tracked;
    const now = performance.now();
    const count = !state.droneMutedForScore;
    const match = state.matcher.update(voiced ? frequencyHz : -1, now, count);
    const gate = state.gate.update(
      info?.midi ?? null,
      info?.cents ?? 0,
      now,
      { scoring: count },
    );
    if (typeof onFrame === 'function') {
      onFrame({
        freq: tracked.freq,
        info,
        match,
        gate,
        label: info ? midiToLabel(info.midi) : null,
      });
    }
    state.rafId = requestAnimationFrame(tick);
  }

  function setTargetMidi(midi) {
    state.matcher.setTarget(midi);
    state.gate.reset();
  }

  function clearTarget() {
    state.matcher.setTarget(null);
    state.gate.reset();
  }

  function startDrone(midi, { level = 0.08 } = {}) {
    ensureAudio();
    stopDrone();
    const freq = midiFreq(midi);
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();
    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.value = freq;
    osc2.frequency.value = freq;
    osc2.detune.value = -6;
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    gain.gain.value = 0.0001;
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    const t = audioCtx.currentTime;
    gain.gain.exponentialRampToValueAtTime(level, t + 0.2);
    osc1.start();
    osc2.start();
    state.drone = { osc1, osc2, gain, midi };
    // Soften mic scoring while drone is on — still allow progress but with
    // slightly higher bar via matcher; we keep scoring enabled for guitar.
    state.droneMutedForScore = false;
  }

  function stopDrone() {
    if (!state.drone) return;
    const dr = state.drone;
    const t = audioCtx.currentTime;
    try {
      dr.gain.gain.cancelScheduledValues(t);
      dr.gain.gain.setValueAtTime(dr.gain.gain.value, t);
      dr.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    } catch (_) { /* ignore */ }
    setTimeout(() => {
      try { dr.osc1.stop(); dr.osc2.stop(); } catch (_) { /* ignore */ }
    }, 180);
    state.drone = null;
  }

  function setDroneEnabled(on, midi) {
    if (on && midi != null) startDrone(midi);
    else stopDrone();
  }

  return {
    start,
    stop,
    setTargetMidi,
    clearTarget,
    startDrone,
    stopDrone,
    setDroneEnabled,
    get running() { return state.running; },
    get matcher() { return state.matcher; },
    get gate() { return state.gate; },
  };
}
