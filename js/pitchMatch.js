import { midiFreq } from './audio.js';
import { NOTE_NAMES_SHARP } from './theory.js';
import {
  ACCURACY_PROFILES,
  DEFAULT_HOLD_MS,
  DEFAULT_PROFILE_ID,
  createScoringWindow,
  legacyProfileFromTolerance,
} from './pitchMetrics.js';

const SHARP_NAMES = NOTE_NAMES_SHARP;

export function freqToMidiFloat(freq) {
  return 12 * Math.log2(freq / 440) + 69;
}

export function centsOffFromTarget(freq, targetMidi) {
  if (!(freq > 0)) return null;
  return 1200 * Math.log2(freq / midiFreq(targetMidi));
}

export function midiToLabel(midi) {
  const m = Math.round(midi);
  const name = SHARP_NAMES[((m % 12) + 12) % 12];
  const oct = Math.floor(m / 12) - 1;
  return { midi: m, name, oct, full: name + oct };
}

export function createPitchMatcher(opts = {}) {
  let profile;
  let holdMs;
  let profileId = opts.profileId ?? null;

  if (opts.profileId) {
    profile = ACCURACY_PROFILES[opts.profileId] ?? ACCURACY_PROFILES[DEFAULT_PROFILE_ID];
    holdMs = opts.holdMs ?? DEFAULT_HOLD_MS;
  } else if (opts.holdMs != null || opts.toleranceCents != null) {
    profile = legacyProfileFromTolerance(opts.toleranceCents ?? 35);
    holdMs = opts.holdMs ?? DEFAULT_HOLD_MS;
    profileId = 'legacy';
  } else {
    profile = ACCURACY_PROFILES[DEFAULT_PROFILE_ID];
    holdMs = opts.holdMs ?? DEFAULT_HOLD_MS;
    profileId = DEFAULT_PROFILE_ID;
  }

  const windowCents = opts.windowCents ?? (profileId === 'legacy' ? 200 : 50);
  const style = opts.style ?? 'straight';

  const window = createScoringWindow({
    profile,
    profileId: profileId ?? DEFAULT_PROFILE_ID,
    holdMs,
    style,
    windowCents,
    targetMidi: opts.targetMidi ?? null,
  });

  function sampleFromFreq(freq, nowMs) {
    const voiced = freq > 0;
    return {
      timestampMs: nowMs,
      frequencyHz: voiced ? freq : -1,
      centsFromTarget: voiced && window.target != null ? centsOffFromTarget(freq, window.target) : null,
      clarity: 1,
      rms: 0.1,
      voiced,
    };
  }

  function setTarget(midi) {
    window.setTarget(midi);
  }

  function reset() {
    window.reset();
  }

  function update(freq, nowMs, count = true) {
    const sample = (freq != null && typeof freq === 'object')
      ? freq
      : sampleFromFreq(freq, nowMs);
    if (sample.timestampMs == null) sample.timestampMs = nowMs;
    return window.update(sample, { count });
  }

  return {
    setTarget,
    update,
    reset,
    markGuideTone: () => window.markGuideTone(),
    finalize: () => window.finalize(),
    get target() { return window.target; },
    get toleranceCents() { return profile.centerCents; },
    get windowCents() { return window.windowCents; },
    get holdMs() { return holdMs; },
    get profile() { return profile; },
  };
}
