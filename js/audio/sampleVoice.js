/**
 * Sample-based pitched and drum voices for pack playback.
 */

const VOICE_FADE_SEC = 0.008;
const PEAK_GAIN = 0.16;
const HEADROOM_TARGET = 0.9;

function clampVelocity(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.78;
  if (n > 1) return Math.max(0.05, Math.min(1, n / 127));
  return Math.max(0.05, Math.min(1, n));
}

function velocityInRange(sample, velocity) {
  const v = clampVelocity(velocity);
  const min = sample.velocityMin != null ? sample.velocityMin : 0;
  const max = sample.velocityMax != null ? sample.velocityMax : 1;
  return v >= min && v <= max;
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

/**
 * Pick the nearest pitched sample within seven semitones.
 * @param {object} manifest
 * @param {number} midi
 * @param {number} velocity
 * @returns {object|null}
 */
export function pickPitchedSample(manifest, midi, velocity) {
  if (!manifest?.samples?.length) return null;
  const target = Math.floor(Number(midi));
  if (!Number.isFinite(target)) return null;

  let best = null;
  let bestDist = Infinity;
  for (const sample of manifest.samples) {
    const root = Number(sample.rootMidi);
    if (!Number.isFinite(root)) continue;
    const dist = Math.abs(target - root);
    if (dist > 7) continue;
    if (!velocityInRange(sample, velocity)) continue;
    if (dist < bestDist) {
      bestDist = dist;
      best = sample;
    }
  }
  return best;
}

/**
 * Pick a drum sample by MIDI note or articulation name.
 * @param {object} manifest
 * @param {number|string} midiOrArticulation
 * @returns {object|null}
 */
export function pickDrumSample(manifest, midiOrArticulation) {
  if (!manifest?.samples?.length) return null;

  let articulation = null;
  if (typeof midiOrArticulation === 'string') {
    articulation = midiOrArticulation;
  } else {
    const midi = Math.floor(Number(midiOrArticulation));
    if (!Number.isFinite(midi)) return null;
    const map = manifest.drumNoteMap;
    if (map) {
      articulation = map[String(midi)] ?? map[midi];
    }
    if (!articulation) {
      for (const sample of manifest.samples) {
        if (Number(sample.rootMidi) === midi) return sample;
      }
      return null;
    }
  }

  for (const sample of manifest.samples) {
    if (sample.articulation === articulation) return sample;
  }
  return null;
}

/**
 * Schedule the playback rate of one buffer voice.
 * The rate carries the slide, the bend points, and the vibrato.
 * @param {AudioBufferSourceNode} source
 * @param {number} baseRate
 * @param {number} when
 * @param {number} durSec
 * @param {object|null} bend
 * @param {string|null} slideKind
 * @param {boolean} vibrato
 */
export function schedulePlaybackRate(source, baseRate, when, durSec, bend, slideKind, vibrato) {
  const rate = source.playbackRate;
  const slideCents = slideStartCents(slideKind);
  const startRate = baseRate * centsToRatio(slideCents);
  if (slideCents !== 0) {
    setParam(rate, startRate, when);
    expRampParam(rate, Math.max(0.01, baseRate), when + Math.min(0.08, durSec * 0.25));
  } else {
    setParam(rate, baseRate, when);
  }

  if (bend?.points?.length) {
    for (const pt of bend.points) {
      const off = Math.max(0, Math.min(1, Number(pt.offset) || 0));
      const cents = Number(pt.cents) || 0;
      const t = when + off * durSec;
      setParam(rate, baseRate * centsToRatio(cents), t);
    }
  }

  if (vibrato && durSec > 0.12) {
    const depth = baseRate * 0.012;
    const rateHz = 5.5;
    const cycles = Math.max(2, Math.floor(durSec * rateHz));
    for (let i = 1; i <= cycles; i += 1) {
      const t = when + (i / cycles) * durSec;
      const phase = i % 2 === 0 ? -depth : depth;
      rampParam(rate, baseRate + phase, t);
    }
    setParam(rate, baseRate, when + durSec);
  }
}

function makeVoiceHandle(audioCtx, source, gain, stopAt) {
  const handle = {
    osc: source,
    source,
    gain,
    stopAt,
    stopped: false,
    release(atTime) {
      if (handle.stopped) return;
      const t = Math.max(audioCtx.currentTime, atTime);
      try {
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), t);
        gain.gain.linearRampToValueAtTime(0.0001, t + VOICE_FADE_SEC);
        source.stop(t + VOICE_FADE_SEC + 0.002);
      } catch (e) { /* ignore */ }
      handle.stopped = true;
    },
    stopNow() {
      if (handle.stopped) return;
      try {
        gain.gain.cancelScheduledValues(audioCtx.currentTime);
        gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
        source.stop(audioCtx.currentTime + 0.001);
      } catch (e) { /* ignore */ }
      handle.stopped = true;
    },
  };
  return handle;
}

/**
 * Play one pitched sample with envelope and optional filter.
 */
export function playSampleNote({
  audioCtx,
  buffer,
  rootMidi,
  midi,
  when,
  durSec,
  velocity,
  techniques = [],
  bend = null,
  slideKind = null,
  chordSize = 1,
  destination,
  gainTrim = 1,
}) {
  const tech = techniques || [];
  const muted = tech.includes('palmMute') || tech.includes('dead');
  const vibrato = tech.includes('vibrato');

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;

  const filter = muted && typeof audioCtx.createBiquadFilter === 'function'
    ? audioCtx.createBiquadFilter()
    : null;
  const gain = audioCtx.createGain();

  const baseRate = 2 ** ((Number(midi) - Number(rootMidi)) / 12);
  schedulePlaybackRate(source, baseRate, when, durSec, bend, slideKind, vibrato);

  const trim = Number(gainTrim) || 1;
  const size = Math.max(1, Number(chordSize) || 1);
  const peak = PEAK_GAIN * clampVelocity(velocity) * (HEADROOM_TARGET / Math.sqrt(size)) * trim;

  const attack = 0.005;
  const decay = muted ? 0.07 : 0.2;
  const sustain = muted ? 0.45 : 0.55;
  const end = when + Math.max(0.04, durSec);
  const releaseTail = Math.min(decay, durSec * 0.45);

  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(peak, when + attack);
  gain.gain.setValueAtTime(peak * sustain, Math.max(when + attack, end - releaseTail));
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  if (filter) {
    filter.type = 'lowpass';
    setParam(filter.frequency, 1800, when);
    if (filter.Q) filter.Q.value = 0.6;
    source.connect(filter);
    filter.connect(gain);
  } else {
    source.connect(gain);
  }
  gain.connect(destination);

  const stopAt = end + 0.03;
  source.start(when);
  source.stop(stopAt);

  return makeVoiceHandle(audioCtx, source, gain, stopAt);
}

/**
 * Play one drum sample as a short one-shot hit.
 */
export function playDrumSample({
  audioCtx,
  buffer,
  when,
  velocity,
  destination,
  gainTrim = 1,
}) {
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  const gain = audioCtx.createGain();

  const trim = Number(gainTrim) || 1;
  const peak = 0.18 * clampVelocity(velocity) * trim;
  const dur = Math.min(buffer.duration || 0.2, 0.35);

  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);

  source.connect(gain);
  gain.connect(destination);

  const stopAt = when + dur + 0.02;
  source.start(when);
  source.stop(stopAt);

  return makeVoiceHandle(audioCtx, source, gain, stopAt);
}
