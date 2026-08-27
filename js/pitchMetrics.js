import { midiFreq } from './audio.js';

export const ACCURACY_PROFILES = {
  learn: { id: 'learn', label: 'Learn', centerCents: 15, stabilityCents: 15, coverageBandCents: 30, requiredCoverage: 0.75, voicedCoverage: 0.80 },
  center: { id: 'center', label: 'Center', centerCents: 10, stabilityCents: 10, coverageBandCents: 20, requiredCoverage: 0.80, voicedCoverage: 0.85 },
  precision: { id: 'precision', label: 'Precision', centerCents: 5, stabilityCents: 7, coverageBandCents: 15, requiredCoverage: 0.85, voicedCoverage: 0.90 },
};

export const DEFAULT_PROFILE_ID = 'center';
export const HOLD_DURATIONS_MS = [750, 1000, 1500, 2000, 2500];
export const DEFAULT_HOLD_MS = 1000;

export const ONSET_IGNORE_MS = 250;
export const UNVOICED_RESET_MS = 250;
export const OFF_TARGET_CENTS = 50;
export const OFF_TARGET_RESET_MS = 200;
export const NO_STABLE_FUNDAMENTAL = 'No stable fundamental';

const SETTLE_WINDOW_MS = 90;
const VIBRATO_FIFTY_CENT_BAND = 0.9;

function clampDt(dt) {
  return Math.max(0, Math.min(250, dt));
}

function sampleWeight(sample, dt) {
  const clarity = sample.clarity ?? 1;
  return clampDt(dt) * clarity;
}

export function clarityWeightedMedian(pairs) {
  if (!pairs.length) return null;
  const sorted = [...pairs].sort((a, b) => a.value - b.value);
  const total = sorted.reduce((sum, p) => sum + p.weight, 0);
  if (total <= 0) return null;
  let cum = 0;
  for (const p of sorted) {
    cum += p.weight;
    if (cum >= total * 0.5) return p.value;
  }
  return sorted[sorted.length - 1].value;
}

function weightedMeanAbs(pairs) {
  if (!pairs.length) return null;
  let sumW = 0;
  let sum = 0;
  for (const p of pairs) {
    sumW += p.weight;
    sum += Math.abs(p.value) * p.weight;
  }
  return sumW > 0 ? sum / sumW : null;
}

function linearSlope(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
    sumXY += xs[i] * ys[i];
    sumXX += xs[i] * xs[i];
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  return (n * sumXY - sumX * sumY) / denom;
}

export function legacyProfileFromTolerance(toleranceCents) {
  const t = toleranceCents ?? 35;
  return {
    id: 'legacy',
    label: 'Legacy',
    centerCents: t,
    stabilityCents: t,
    coverageBandCents: Math.max(t, 20),
    requiredCoverage: 0.5,
    voicedCoverage: 0.5,
  };
}

export function analyzeVibrato(samples) {
  const voiced = samples.filter(s => s.voiced && s.centsFromTarget != null);
  if (!voiced.length) {
    return {
      centerErrorCents: null,
      extentCents: null,
      rateHz: null,
      symmetry: null,
      driftCentsPerSecond: null,
      inFiftyCentBand: 0,
    };
  }

  const pairs = [];
  for (let i = 0; i < voiced.length; i++) {
    const dt = i === 0 ? 16 : clampDt(voiced[i].timestampMs - voiced[i - 1].timestampMs);
    pairs.push({ value: voiced[i].centsFromTarget, weight: sampleWeight(voiced[i], dt) });
  }

  const centerErrorCents = clarityWeightedMedian(pairs);
  const deviations = voiced.map(s => s.centsFromTarget - centerErrorCents);
  const pos = deviations.filter(d => d > 0);
  const neg = deviations.filter(d => d < 0);
  const maxPos = pos.length ? Math.max(...pos) : 0;
  const maxNeg = neg.length ? Math.abs(Math.min(...neg)) : 0;
  const extentCents = (maxPos + maxNeg) / 2;
  const symmetry = (maxPos + maxNeg) > 0 ? Math.min(maxPos, maxNeg) / Math.max(maxPos, maxNeg) : 1;

  let crossings = 0;
  for (let i = 1; i < deviations.length; i++) {
    if ((deviations[i - 1] <= 0 && deviations[i] > 0) || (deviations[i - 1] >= 0 && deviations[i] < 0)) {
      crossings++;
    }
  }
  const durationSec = (voiced[voiced.length - 1].timestampMs - voiced[0].timestampMs) / 1000;
  const rateHz = durationSec > 0 ? crossings / (2 * durationSec) : null;

  const times = voiced.map(s => (s.timestampMs - voiced[0].timestampMs) / 1000);
  const driftCentsPerSecond = linearSlope(times, voiced.map(s => s.centsFromTarget));

  let inBandWeight = 0;
  let totalWeight = 0;
  for (let i = 0; i < voiced.length; i++) {
    const dt = i === 0 ? 16 : clampDt(voiced[i].timestampMs - voiced[i - 1].timestampMs);
    const w = sampleWeight(voiced[i], dt);
    totalWeight += w;
    if (Math.abs(voiced[i].centsFromTarget) <= OFF_TARGET_CENTS) inBandWeight += w;
  }
  const inFiftyCentBand = totalWeight > 0 ? inBandWeight / totalWeight : 0;

  return {
    centerErrorCents,
    extentCents,
    rateHz,
    symmetry,
    driftCentsPerSecond,
    inFiftyCentBand,
  };
}

export function correctionText(result) {
  if (!result) return NO_STABLE_FUNDAMENTAL;
  if (result.failureReason === NO_STABLE_FUNDAMENTAL) return NO_STABLE_FUNDAMENTAL;
  if (result.correction) return result.correction;

  const center = result.centerErrorCents;
  const stability = result.stabilityCents;
  const drift = result.driftCentsPerSecond;
  const profile = result.profile;

  if (center == null || !Number.isFinite(center)) return NO_STABLE_FUNDAMENTAL;

  if (profile && stability != null && Math.abs(center) <= profile.centerCents && stability > profile.stabilityCents) {
    return 'The pitch is centered but unstable';
  }

  if (drift != null && drift > 2 && result.settleTimeMs != null) {
    return 'The sustain drifts sharp';
  }

  if (result.settleTimeMs != null && center < -profile.centerCents * 0.5) {
    return 'The note starts flat and then reaches the center';
  }

  if (center > 0) return 'Move slightly lower';
  if (center < 0) return 'Move slightly higher';
  return NO_STABLE_FUNDAMENTAL;
}

function vibratoCenterStability(segments, blockMs = 400) {
  const voiced = segments.filter(s => s.voiced && s.centsFromTarget != null);
  if (voiced.length < 2) return null;

  const centers = [];
  let blockStart = voiced[0].timestampMs;
  let blockPairs = [];

  for (let i = 0; i < voiced.length; i++) {
    const s = voiced[i];
    const dt = i === 0 ? 16 : clampDt(s.timestampMs - voiced[i - 1].timestampMs);
    blockPairs.push({ value: s.centsFromTarget, weight: sampleWeight(s, dt) });

    if (s.timestampMs - blockStart >= blockMs || i === voiced.length - 1) {
      const center = clarityWeightedMedian(blockPairs);
      if (center != null) centers.push(center);
      blockStart = s.timestampMs;
      blockPairs = [];
    }
  }

  if (centers.length < 2) return 0;
  const globalCenter = centers.reduce((a, b) => a + b, 0) / centers.length;
  const devs = centers.map(c => Math.abs(c - globalCenter));
  devs.sort((a, b) => a - b);
  return devs[Math.floor(devs.length / 2)];
}

function pickFailureReason(metrics, profile, style, vibrato) {
  if (!metrics.hasVoicedInput) {
    return { failureReason: NO_STABLE_FUNDAMENTAL, correction: NO_STABLE_FUNDAMENTAL };
  }

  const { centerErrorCents, stabilityCents, inTuneCoverage, voicedCoverage, settleTimeMs, driftCentsPerSecond } = metrics;

  if (centerErrorCents == null) {
    return { failureReason: NO_STABLE_FUNDAMENTAL, correction: NO_STABLE_FUNDAMENTAL };
  }

  if (style === 'vibrato' && vibrato && vibrato.inFiftyCentBand < VIBRATO_FIFTY_CENT_BAND) {
    if (Math.abs(centerErrorCents) > profile.centerCents) {
      return {
        failureReason: centerErrorCents > 0 ? 'sharp' : 'flat',
        correction: centerErrorCents > 0 ? 'Move slightly lower' : 'Move slightly higher',
      };
    }
    return { failureReason: 'vibrato band', correction: 'The pitch is centered but unstable' };
  }

  if (Math.abs(centerErrorCents) > profile.centerCents) {
    return {
      failureReason: centerErrorCents > 0 ? 'sharp' : 'flat',
      correction: centerErrorCents > 0 ? 'Move slightly lower' : 'Move slightly higher',
    };
  }

  if (stabilityCents != null && stabilityCents > profile.stabilityCents) {
    return { failureReason: 'unstable', correction: 'The pitch is centered but unstable' };
  }

  if (inTuneCoverage != null && inTuneCoverage < profile.requiredCoverage) {
    if (driftCentsPerSecond != null && driftCentsPerSecond > 2) {
      return { failureReason: 'drift', correction: 'The sustain drifts sharp' };
    }
    if (settleTimeMs != null && centerErrorCents < 0) {
      return { failureReason: 'scoop', correction: 'The note starts flat and then reaches the center' };
    }
    return { failureReason: 'coverage', correction: 'The pitch is centered but unstable' };
  }

  if (voicedCoverage != null && voicedCoverage < profile.voicedCoverage) {
    return { failureReason: 'voiced', correction: NO_STABLE_FUNDAMENTAL };
  }

  return { failureReason: null, correction: null };
}

function computeMetrics(segments, profile, style, holdMs) {
  const voicedSegments = segments.filter(s => s.voiced && s.centsFromTarget != null);
  const hasVoicedInput = voicedSegments.length > 0;

  if (!segments.length) {
    return {
      hasVoicedInput: false,
      centerErrorCents: null,
      stabilityCents: null,
      meanAbsoluteErrorCents: null,
      inTuneCoverage: null,
      voicedCoverage: null,
      settleTimeMs: null,
      driftCentsPerSecond: null,
      postOnsetVoicedMs: 0,
      windowDurationMs: 0,
      passed: false,
      vibrato: null,
    };
  }

  const windowStart = segments[0].timestampMs;
  const windowEnd = segments[segments.length - 1].timestampMs;
  const windowDurationMs = windowEnd - windowStart;

  let voicedOnsetMs = null;
  for (const s of segments) {
    if (s.voiced) {
      voicedOnsetMs = s.timestampMs;
      break;
    }
  }

  let voicedMs = 0;
  let postOnsetVoicedMs = 0;
  const allPairs = [];
  const postOnsetPairs = [];
  let inTuneWeight = 0;
  let postOnsetTotalWeight = 0;

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (i === 0) continue;
    const prev = segments[i - 1];
    const dt = clampDt(s.timestampMs - prev.timestampMs);
    if (dt <= 0) continue;

    if (s.voiced && s.centsFromTarget != null) {
      const w = sampleWeight(s, dt);
      voicedMs += dt;
      allPairs.push({ value: s.centsFromTarget, weight: w });

      const afterOnset = voicedOnsetMs != null && (s.timestampMs - voicedOnsetMs) >= ONSET_IGNORE_MS;
      if (afterOnset) {
        postOnsetVoicedMs += dt;
        postOnsetPairs.push({ value: s.centsFromTarget, weight: w });
        postOnsetTotalWeight += w;
        if (Math.abs(s.centsFromTarget) <= profile.coverageBandCents) {
          inTuneWeight += w;
        }
      }
    }
  }

  const centerErrorCents = clarityWeightedMedian(postOnsetPairs.length ? postOnsetPairs : allPairs);

  const stabilitySource = (postOnsetPairs.length ? postOnsetPairs : allPairs).map(p => ({
    value: Math.abs(p.value - centerErrorCents),
    weight: p.weight,
  }));
  const stabilityCents = clarityWeightedMedian(stabilitySource);

  const maePairs = postOnsetPairs.length ? postOnsetPairs : allPairs;
  const meanAbsoluteErrorCents = weightedMeanAbs(maePairs);

  const inTuneCoverage = postOnsetTotalWeight > 0 ? inTuneWeight / postOnsetTotalWeight : null;
  const voicedCoverage = windowDurationMs > 0 ? voicedMs / windowDurationMs : null;

  let settleTimeMs = null;
  if (voicedOnsetMs != null && centerErrorCents != null) {
    let runMs = 0;
    let runCenter = [];
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      if (!s.voiced || s.centsFromTarget == null) continue;
      if (s.timestampMs < voicedOnsetMs) continue;

      const prevTs = i === 0 ? s.timestampMs : segments[i - 1].timestampMs;
      const dt = clampDt(s.timestampMs - prevTs) || 16;
      runMs += dt;
      runCenter.push({ value: s.centsFromTarget, weight: sampleWeight(s, dt) });

      if (runMs >= SETTLE_WINDOW_MS) {
        const center = clarityWeightedMedian(runCenter);
        if (center != null && Math.abs(center) <= profile.centerCents) {
          settleTimeMs = s.timestampMs - voicedOnsetMs;
          break;
        }
        runMs = SETTLE_WINDOW_MS / 2;
        runCenter = runCenter.slice(Math.floor(runCenter.length / 2));
      }
    }
  }

  const driftSamples = [];
  const driftTimes = [];
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (!s.voiced || s.centsFromTarget == null) continue;
    if (voicedOnsetMs != null && (s.timestampMs - voicedOnsetMs) < ONSET_IGNORE_MS) continue;
    driftSamples.push(s.centsFromTarget);
    driftTimes.push((s.timestampMs - (voicedOnsetMs ?? segments[0].timestampMs)) / 1000);
  }
  const driftCentsPerSecond = linearSlope(driftTimes, driftSamples);

  const vibrato = style === 'vibrato' ? analyzeVibrato(segments) : null;
  const gradeCenter = style === 'vibrato' && vibrato?.centerErrorCents != null
    ? vibrato.centerErrorCents
    : centerErrorCents;

  const gradeStability = style === 'vibrato'
    ? vibratoCenterStability(segments)
    : stabilityCents;

  const coverageOk = style === 'vibrato'
    ? vibrato != null && vibrato.inFiftyCentBand >= VIBRATO_FIFTY_CENT_BAND
    : inTuneCoverage != null && inTuneCoverage >= profile.requiredCoverage;

  const stabilityOk = style === 'vibrato'
    ? true
    : stabilityCents != null && stabilityCents <= profile.stabilityCents;

  const passed = windowDurationMs >= holdMs
    && postOnsetVoicedMs >= holdMs
    && gradeCenter != null
    && Math.abs(gradeCenter) <= profile.centerCents
    && stabilityOk
    && coverageOk
    && voicedCoverage != null
    && voicedCoverage >= profile.voicedCoverage;

  return {
    hasVoicedInput,
    centerErrorCents: gradeCenter,
    stabilityCents: style === 'vibrato' ? (gradeStability ?? 0) : stabilityCents,
    meanAbsoluteErrorCents,
    inTuneCoverage,
    voicedCoverage,
    settleTimeMs,
    driftCentsPerSecond,
    postOnsetVoicedMs,
    windowDurationMs,
    passed,
    vibrato,
    rawCenterErrorCents: centerErrorCents,
  };
}

export function createScoringWindow(opts = {}) {
  const profileId = opts.profileId ?? DEFAULT_PROFILE_ID;
  const profile = opts.profile
    ?? ACCURACY_PROFILES[profileId]
    ?? ACCURACY_PROFILES[DEFAULT_PROFILE_ID];
  const holdMs = opts.holdMs ?? DEFAULT_HOLD_MS;
  const style = opts.style ?? 'straight';
  const windowCents = opts.windowCents ?? 50;

  let targetMidi = opts.targetMidi ?? null;
  let segments = [];
  let lastTimestampMs = null;
  let lastVoicedMs = null;
  let offTargetSinceMs = null;
  let matched = false;
  let lastSample = null;

  function clearWindow() {
    segments = [];
    lastTimestampMs = null;
    lastVoicedMs = null;
    offTargetSinceMs = null;
  }

  function setTarget(midi) {
    targetMidi = midi == null ? null : Math.round(midi);
    matched = false;
    clearWindow();
  }

  function reset() {
    matched = false;
    clearWindow();
  }

  function markGuideTone() {
    matched = false;
    clearWindow();
  }

  function checkResets(sample) {
    if (!sample.voiced) {
      if (lastVoicedMs != null && sample.timestampMs - lastVoicedMs > UNVOICED_RESET_MS) {
        clearWindow();
      }
      offTargetSinceMs = null;
      return;
    }

    lastVoicedMs = sample.timestampMs;

    if (sample.centsFromTarget != null && Math.abs(sample.centsFromTarget) > OFF_TARGET_CENTS) {
      if (offTargetSinceMs == null) offTargetSinceMs = sample.timestampMs;
      else if (sample.timestampMs - offTargetSinceMs > OFF_TARGET_RESET_MS) {
        clearWindow();
        offTargetSinceMs = sample.timestampMs;
      }
    } else {
      offTargetSinceMs = null;
    }
  }

  function buildSnapshot(metrics, sample) {
    const centsOff = sample?.centsFromTarget ?? null;
    const hasPitch = sample?.voiced && sample?.frequencyHz > 0;
    const within = hasPitch && centsOff != null && Math.abs(centsOff) <= profile.centerCents;
    const progress = Math.max(0, Math.min(1, (metrics.postOnsetVoicedMs ?? 0) / holdMs));

    let proximity = 0;
    if (centsOff != null) {
      proximity = Math.max(0, 1 - Math.abs(centsOff) / windowCents);
    }

    const fail = pickFailureReason(metrics, profile, style, metrics.vibrato);

    return {
      active: targetMidi != null,
      freq: hasPitch ? sample.frequencyHz : -1,
      centsOff,
      within,
      progress,
      heldMs: metrics.postOnsetVoicedMs ?? 0,
      matched,
      proximity,
      offsetRatio: centsOff == null
        ? 0.5
        : 0.5 - Math.max(-1, Math.min(1, centsOff / windowCents)) / 2,
      voiced: !!sample?.voiced,
      centerErrorCents: metrics.centerErrorCents,
      stabilityCents: metrics.stabilityCents,
      meanAbsoluteErrorCents: metrics.meanAbsoluteErrorCents,
      inTuneCoverage: metrics.inTuneCoverage,
      voicedCoverage: metrics.voicedCoverage,
      settleTimeMs: metrics.settleTimeMs,
      driftCentsPerSecond: metrics.driftCentsPerSecond,
      failureReason: metrics.passed ? null : fail.failureReason,
      correction: metrics.passed ? null : fail.correction,
    };
  }

  function update(sample, { count = true } = {}) {
    if (targetMidi == null) {
      return {
        active: false, freq: -1, centsOff: null, within: false, progress: 0, heldMs: 0,
        matched: false, proximity: 0, offsetRatio: 0.5, voiced: false,
        centerErrorCents: null, stabilityCents: null, meanAbsoluteErrorCents: null,
        inTuneCoverage: null, voicedCoverage: null, settleTimeMs: null,
        driftCentsPerSecond: null, failureReason: null, correction: null,
      };
    }

    if (!count) {
      matched = false;
      clearWindow();
      lastSample = sample;
      const empty = computeMetrics([], profile, style, holdMs);
      return buildSnapshot(empty, sample);
    }

    const ts = sample.timestampMs ?? lastTimestampMs ?? 0;
    const normalized = {
      timestampMs: ts,
      frequencyHz: sample.frequencyHz ?? -1,
      centsFromTarget: sample.centsFromTarget ?? (
        sample.voiced && sample.frequencyHz > 0 && targetMidi != null
          ? 1200 * Math.log2(sample.frequencyHz / midiFreq(targetMidi))
          : null
      ),
      clarity: sample.clarity ?? 1,
      rms: sample.rms ?? 0,
      voiced: !!sample.voiced,
    };

    checkResets(normalized);

    if (segments.length === 0 || segments[segments.length - 1].timestampMs !== ts) {
      segments.push(normalized);
    }
    lastTimestampMs = ts;
    lastSample = normalized;

    const metrics = computeMetrics(segments, profile, style, holdMs);
    if (!matched && metrics.passed) matched = true;

    return buildSnapshot(metrics, normalized);
  }

  function finalize() {
    const metrics = computeMetrics(segments, profile, style, holdMs);
    if (!metrics.hasVoicedInput || metrics.windowDurationMs < holdMs) return null;

    const fail = pickFailureReason(metrics, profile, style, metrics.vibrato);
    return {
      targetMidi,
      startTimestampMs: segments[0]?.timestampMs ?? null,
      endTimestampMs: segments[segments.length - 1]?.timestampMs ?? null,
      centerErrorCents: metrics.centerErrorCents,
      stabilityCents: metrics.stabilityCents,
      meanAbsoluteErrorCents: metrics.meanAbsoluteErrorCents,
      inTuneCoverage: metrics.inTuneCoverage,
      voicedCoverage: metrics.voicedCoverage,
      settleTimeMs: metrics.settleTimeMs,
      driftCentsPerSecond: metrics.driftCentsPerSecond,
      passed: metrics.passed,
      failureReason: metrics.passed ? null : fail.failureReason,
      correction: metrics.passed ? null : fail.correction,
      profile,
    };
  }

  if (opts.targetMidi != null) setTarget(opts.targetMidi);

  return {
    setTarget,
    reset,
    markGuideTone,
    update,
    finalize,
    get target() { return targetMidi; },
    get profile() { return profile; },
    get holdMs() { return holdMs; },
    get windowCents() { return windowCents; },
    get style() { return style; },
  };
}

// Centered is the strict goal. The median pitch must sit on the target, and the
// tone must stay near the target for the full note.
const RUNNER_CENTER_CENTS = 10;
const RUNNER_CENTER_MAE = 15;

// Close and Miss use wide limits. The mean absolute error measures the distance
// from the target, so vibrato increases it even when the singer holds the correct
// note. A vibrato of plus or minus E cents gives a mean absolute error near
// 0.64 * E. The previous limit of 25 cents made a plus or minus 40-cent vibrato a
// Miss. Close now tests the median pitch first. The mean absolute error limit only
// rejects a tone that moves across most of a semitone.
const RUNNER_CLOSE_CENTER_CENTS = 30;
const RUNNER_CLOSE_MAE = 45;

const RUNNER_IN_TUNE_BAND = 20;
const RUNNER_ERROR_SCALE = 50;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function runnerJudge(centerErrorCents, meanAbsoluteErrorCents) {
  if (centerErrorCents == null || meanAbsoluteErrorCents == null) return 'miss';
  if (Math.abs(centerErrorCents) <= RUNNER_CENTER_CENTS && meanAbsoluteErrorCents <= RUNNER_CENTER_MAE) {
    return 'centered';
  }
  if (Math.abs(centerErrorCents) <= RUNNER_CLOSE_CENTER_CENTS && meanAbsoluteErrorCents <= RUNNER_CLOSE_MAE) {
    return 'close';
  }
  return 'miss';
}

/**
 * Score one Runner note from timestamped pitch samples.
 * Returns center, MAE, coverages, noteAccuracy, and Centered/Close/Miss.
 */
export function scoreRunnerNote(samples, targetMidi, startMs = null, endMs = null) {
  const segments = (startMs != null && endMs != null)
    ? samples.filter(s => s.timestampMs >= startMs && s.timestampMs < endMs)
    : [...samples];

  if (!segments.length) {
    return {
      targetMidi,
      centerErrorCents: null,
      meanAbsoluteErrorCents: null,
      inTuneCoverage: 0,
      voicedCoverage: 0,
      errorScore: 0,
      noteAccuracy: 0,
      result: 'miss',
    };
  }

  const windowStart = startMs ?? segments[0].timestampMs;
  const windowEnd = endMs ?? segments[segments.length - 1].timestampMs;
  const windowDurationMs = Math.max(1, windowEnd - windowStart);

  let voicedMs = 0;
  const voicedPairs = [];
  let inTuneWeight = 0;
  let voicedWeight = 0;

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const prevTs = i === 0 ? s.timestampMs : segments[i - 1].timestampMs;
    const dt = clampDt(s.timestampMs - prevTs) || 16;

    if (s.voiced && s.centsFromTarget != null) {
      const w = sampleWeight(s, dt);
      voicedMs += dt;
      voicedPairs.push({ value: s.centsFromTarget, weight: w });
      voicedWeight += w;
      if (Math.abs(s.centsFromTarget) <= RUNNER_IN_TUNE_BAND) {
        inTuneWeight += w;
      }
    }
  }

  const centerErrorCents = clarityWeightedMedian(voicedPairs);
  const meanAbsoluteErrorCents = weightedMeanAbs(voicedPairs);
  const voicedCoverage = voicedMs / windowDurationMs;
  const inTuneCoverage = voicedWeight > 0 ? inTuneWeight / voicedWeight : 0;
  const errorScore = clamp01(1 - (meanAbsoluteErrorCents ?? RUNNER_ERROR_SCALE) / RUNNER_ERROR_SCALE);
  const noteAccuracy = 100 * errorScore * voicedCoverage;
  const result = runnerJudge(centerErrorCents, meanAbsoluteErrorCents);

  return {
    targetMidi,
    centerErrorCents,
    meanAbsoluteErrorCents,
    inTuneCoverage,
    voicedCoverage,
    errorScore,
    noteAccuracy,
    result,
  };
}
