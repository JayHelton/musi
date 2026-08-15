// Per-family wavetable voices for Guitar Pro playback.
// Each family uses a PeriodicWave table, an envelope, and a lowpass filter.
// Drum hits stay in js/drums/drumEngine.js.

import { midiFreq } from '../audio.js';
import { playSampleNote } from '../audio/sampleVoice.js';

const VOICE_FADE_SEC = 0.008;
const MAX_ACTIVE_VOICES = 48;
const HEADROOM_TARGET = 0.9;

const FAMILIES = {
  cleanGuitar: {
    harmonics: [1, 0.55, 0.32, 0.2, 0.12, 0.07, 0.04],
    fallbackType: 'triangle',
    attack: 0.005,
    decay: 0.2,
    sustain: 0.55,
    filterBase: 3200,
    filterVel: 4200,
    peak: 0.14,
    distort: false,
  },
  distortedGuitar: {
    harmonics: [1, 0.72, 0.48, 0.3, 0.18, 0.1],
    fallbackType: 'sawtooth',
    attack: 0.003,
    decay: 0.24,
    sustain: 0.62,
    filterBase: 3000,
    filterVel: 4600,
    peak: 0.11,
    distort: true,
  },
  acousticGuitar: {
    harmonics: [1, 0.58, 0.32, 0.16, 0.08, 0.04],
    fallbackType: 'triangle',
    attack: 0.002,
    decay: 0.28,
    sustain: 0.42,
    filterBase: 3400,
    filterVel: 4800,
    peak: 0.15,
    distort: false,
  },
  bass: {
    harmonics: [1, 0.12, 0.04, 0.01],
    fallbackType: 'sine',
    attack: 0.004,
    decay: 0.3,
    sustain: 0.5,
    filterBase: 280,
    filterVel: 220,
    peak: 0.17,
    distort: false,
  },
  keys: {
    harmonics: [1, 0.28, 0.14, 0.08, 0.05, 0.03],
    fallbackType: 'square',
    attack: 0.001,
    decay: 0.35,
    sustain: 0.28,
    filterBase: 4200,
    filterVel: 6200,
    peak: 0.13,
    distort: false,
  },
};

const periodicCache = new WeakMap();

function clampVelocity(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.78;
  return Math.max(0.05, Math.min(1, n));
}

function makeDistortionCurve(amount = 0.35) {
  const n = 256;
  const curve = new Float32Array(n);
  const k = amount * 100;
  for (let i = 0; i < n; i += 1) {
    const x = (i * 2) / (n - 1) - 1;
    curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

function getPeriodicWave(ctx, familyDef) {
  if (typeof ctx.createPeriodicWave !== 'function') return null;
  let cache = periodicCache.get(ctx);
  if (!cache) {
    cache = new Map();
    periodicCache.set(ctx, cache);
  }
  const key = familyDef.fallbackType;
  if (cache.has(key)) return cache.get(key);
  const imag = new Float32Array(familyDef.harmonics.length + 1);
  const real = new Float32Array(familyDef.harmonics.length + 1);
  familyDef.harmonics.forEach((mag, i) => {
    imag[i + 1] = mag;
  });
  const wave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  cache.set(key, wave);
  return wave;
}

function centsToRatio(cents) {
  return 2 ** (cents / 1200);
}

function setParam(param, value, time) {
  if (typeof param?.setValueAtTime === 'function') {
    param.setValueAtTime(value, time);
  } else if (param) {
    param.value = value;
  }
}

function rampParam(param, value, time) {
  if (typeof param?.linearRampToValueAtTime === 'function') {
    param.linearRampToValueAtTime(value, time);
  } else if (param) {
    param.value = value;
  }
}

function expRampParam(param, value, time) {
  if (typeof param?.exponentialRampToValueAtTime === 'function') {
    param.exponentialRampToValueAtTime(Math.max(0.0001, value), time);
  } else if (param) {
    param.value = value;
  }
}

function slideStartCents(slideKind) {
  switch (slideKind) {
    case 'intoFromBelow': return -100;
    case 'intoFromAbove': return 100;
    case 'legato':
    case 'shift':
      return -35;
    default: return 0;
  }
}

function vibratoDepthHz(baseFreq) {
  return Math.max(2, baseFreq * 0.012);
}

/**
 * Map a MIDI program number to an instrument family name.
 * @param {number} program
 */
export function familyForProgram(program) {
  const p = Math.max(0, Math.min(127, Math.floor(Number(program) || 0)));
  if (p >= 32 && p <= 39) return 'bass';
  if (p === 24 || p === 25) return 'acousticGuitar';
  if (p >= 26 && p <= 28) return 'cleanGuitar';
  if (p >= 29 && p <= 31) return 'distortedGuitar';
  if (p <= 23) return 'keys';
  return 'cleanGuitar';
}

/**
 * Build a voice factory for one AudioContext.
 * @param {AudioContext} audioCtx
 */
export function createVoiceFactory(audioCtx) {
  const active = [];

  function dropVoice(handle) {
    const idx = active.indexOf(handle);
    if (idx >= 0) active.splice(idx, 1);
  }

  function stealOldest() {
    if (!active.length) return;
    const oldest = active.shift();
    try { oldest.stopNow(); } catch (e) { /* ignore */ }
  }

  function headroomGain(velocity, familyPeak, chordSize = 1) {
    const size = Math.max(1, Number(chordSize) || 1);
    return familyPeak * clampVelocity(velocity) * (HEADROOM_TARGET / Math.sqrt(size));
  }

  function schedulePitch(osc, baseFreq, when, durSec, bend, slideKind, vibrato) {
    const freq = osc.frequency;
    const slideCents = slideStartCents(slideKind);
    const startFreq = baseFreq * centsToRatio(slideCents);
    if (slideCents !== 0) {
      setParam(freq, startFreq, when);
      expRampParam(freq, Math.max(20, baseFreq), when + Math.min(0.08, durSec * 0.25));
    } else {
      setParam(freq, baseFreq, when);
    }

    if (bend?.points?.length) {
      for (const pt of bend.points) {
        const off = Math.max(0, Math.min(1, Number(pt.offset) || 0));
        const cents = Number(pt.cents) || 0;
        const t = when + off * durSec;
        setParam(freq, baseFreq * centsToRatio(cents), t);
      }
    }

    if (vibrato && durSec > 0.12) {
      const depth = vibratoDepthHz(baseFreq);
      const rate = 5.5;
      const cycles = Math.max(2, Math.floor(durSec * rate));
      for (let i = 1; i <= cycles; i += 1) {
        const t = when + (i / cycles) * durSec;
        const phase = i % 2 === 0 ? -depth : depth;
        rampParam(freq, baseFreq + phase, t);
      }
      setParam(freq, baseFreq, when + durSec);
    }
  }

  function playNote({
    family,
    midi,
    when,
    durSec,
    velocity,
    techniques = [],
    bend = null,
    slideKind = null,
    chordSize = 1,
    destination,
    pack = null,
  }) {
    if (pack?.buffer) {
      return playSampleNote({
        audioCtx,
        buffer: pack.buffer,
        rootMidi: pack.rootMidi,
        midi,
        when,
        durSec,
        velocity,
        techniques,
        bend,
        slideKind,
        chordSize,
        destination,
        gainTrim: pack.gainTrim ?? 1,
      });
    }

    const familyDef = FAMILIES[family] || FAMILIES.cleanGuitar;
    const tech = techniques || [];
    const muted = tech.includes('palmMute') || tech.includes('dead');
    const vibrato = tech.includes('vibrato');

    while (active.length >= MAX_ACTIVE_VOICES) stealOldest();

    const osc = audioCtx.createOscillator();
    const filter = typeof audioCtx.createBiquadFilter === 'function'
      ? audioCtx.createBiquadFilter()
      : null;
    const shaper = familyDef.distort && typeof audioCtx.createWaveShaper === 'function'
      ? audioCtx.createWaveShaper()
      : null;
    const gain = audioCtx.createGain();

    const wave = getPeriodicWave(audioCtx, familyDef);
    if (wave && typeof osc.setPeriodicWave === 'function') {
      osc.setPeriodicWave(wave);
    } else {
      osc.type = familyDef.fallbackType || 'triangle';
    }

    if (shaper) {
      shaper.curve = makeDistortionCurve(0.32);
      shaper.oversample = '2x';
    }

    const baseFreq = midiFreq(midi);
    const vel = clampVelocity(velocity);
    let decay = familyDef.decay;
    let sustain = familyDef.sustain;
    let filterCut = familyDef.filterBase + vel * familyDef.filterVel;
    if (muted) {
      decay *= 0.35;
      sustain *= 0.45;
      filterCut *= 0.55;
    }

    if (filter) {
      filter.type = 'lowpass';
      setParam(filter.frequency, filterCut, when);
      if (filter.Q) filter.Q.value = muted ? 0.6 : 0.9;
    }

    const peak = headroomGain(velocity, familyDef.peak, chordSize);
    const attack = familyDef.attack;
    const releaseTail = Math.min(decay, durSec * 0.45);
    const end = when + Math.max(0.04, durSec);

    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(peak, when + attack);
    gain.gain.setValueAtTime(peak * sustain, Math.max(when + attack, end - releaseTail));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    schedulePitch(osc, baseFreq, when, durSec, bend, slideKind, vibrato);

    let tail = osc;
    if (filter) {
      osc.connect(filter);
      tail = filter;
    }
    if (shaper) {
      tail.connect(shaper);
      tail = shaper;
    }
    tail.connect(gain);
    gain.connect(destination);

    const handle = {
      osc,
      gain,
      filter,
      shaper,
      stopAt: end + 0.03,
      stopped: false,
      release(atTime) {
        if (handle.stopped) return;
        const t = Math.max(audioCtx.currentTime, atTime);
        try {
          gain.gain.cancelScheduledValues(t);
          gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), t);
          gain.gain.linearRampToValueAtTime(0.0001, t + VOICE_FADE_SEC);
          osc.stop(t + VOICE_FADE_SEC + 0.002);
        } catch (e) { /* ignore */ }
        handle.stopped = true;
        dropVoice(handle);
      },
      stopNow() {
        if (handle.stopped) return;
        try {
          gain.gain.cancelScheduledValues(audioCtx.currentTime);
          gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
          osc.stop(audioCtx.currentTime + 0.001);
        } catch (e) { /* ignore */ }
        handle.stopped = true;
        dropVoice(handle);
      },
    };

    osc.start(when);
    osc.stop(end + 0.03);
    if (typeof osc.addEventListener === 'function') {
      osc.addEventListener('ended', () => dropVoice(handle), { once: true });
    } else {
      osc.onended = () => dropVoice(handle);
    }

    active.push(handle);
    return handle;
  }

  return {
    familyForProgram,
    playNote,
    get activeCount() { return active.length; },
    stopAll() {
      while (active.length) {
        const v = active.pop();
        try { v.stopNow(); } catch (e) { /* ignore */ }
      }
    },
  };
}
