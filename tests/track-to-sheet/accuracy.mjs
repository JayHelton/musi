/**
 * Deterministic accuracy suite for offline monophonic transcription.
 * Run: node tests/track-to-sheet/accuracy.mjs
 */

import assert from 'node:assert/strict';
import { analyzeMono } from '../../js/trackToSheet/transcribe.js';

const SR = 44100;
const SR_ALT = 48000;

// ── Seeded PRNG (mulberry32) ───────────────────────────────────
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function centsToRatio(cents) {
  return Math.pow(2, cents / 1200);
}

// ── Realistic voice-like synthesiser ───────────────────────────
/**
 * @param {Array<{midi:number,startSec:number,durationSec:number,amp?:number}>} events
 * @param {object} [opts]
 */
function synthVoice(events, opts = {}) {
  const sampleRate = opts.sampleRate ?? SR;
  const rng = mulberry32(opts.seed ?? 42);
  const harmonicCount = opts.harmonicCount ?? 7;
  const harmonicDecay = opts.harmonicDecay ?? 1.2;
  const attackSec = (opts.attackMs ?? 20) / 1000;
  const releaseSec = (opts.releaseMs ?? 80) / 1000;
  const sustainLevel = opts.sustainLevel ?? 0.75;
  const vibratoDepthCents = opts.vibratoDepthCents ?? 30;
  const vibratoRateHz = opts.vibratoRateHz ?? 5.5;
  const vibratoDelaySec = opts.vibratoDelaySec ?? 0.1;
  const legato = opts.legato ?? false;
  const legatoOverlapSec = opts.legatoOverlapSec ?? 0.03;
  const timingJitterMs = opts.timingJitterMs ?? 3;
  const pitchJitterCents = opts.pitchJitterCents ?? 5;
  const snrDb = opts.snrDb ?? Infinity;
  const baseAmp = opts.amp ?? 0.35;

  const humanised = events.map((e, idx) => {
    const tJit = (rng() * 2 - 1) * timingJitterMs / 1000;
    const pJit = (rng() * 2 - 1) * pitchJitterCents;
    let start = e.startSec + tJit;
    let dur = e.durationSec;
    if (legato && idx > 0) dur += legatoOverlapSec;
    return {
      ...e,
      startSec: Math.max(0, start),
      durationSec: dur,
      pitchCents: pJit,
      amp: e.amp ?? baseAmp,
    };
  });

  const totalSec = Math.max(
    ...humanised.map((e) => e.startSec + e.durationSec),
    0.1,
  ) + 0.15;
  const n = Math.floor(totalSec * sampleRate);
  const out = new Float32Array(n);

  for (const e of humanised) {
    const baseFreq = midiToFreq(e.midi) * centsToRatio(e.pitchCents ?? 0);
    const i0 = Math.floor(e.startSec * sampleRate);
    const i1 = Math.min(n, Math.floor((e.startSec + e.durationSec) * sampleRate));
    const decaySec = releaseSec;
    const sustainStart = attackSec;
    const sustainEnd = Math.max(sustainStart, e.durationSec - decaySec);

    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / sampleRate;
      let env;
      if (t < attackSec) {
        env = t / attackSec;
      } else if (t < sustainEnd) {
        env = sustainLevel;
      } else {
        const rel = (t - sustainEnd) / Math.max(decaySec, 1e-6);
        env = sustainLevel * Math.max(0, 1 - rel);
      }

      const vib = vibratoDepthCents > 0
        ? Math.sin(2 * Math.PI * vibratoRateHz * Math.max(0, t - vibratoDelaySec))
        : 0;
      const freq = baseFreq * centsToRatio(vib * vibratoDepthCents);

      let sample = 0;
      for (let h = 1; h <= harmonicCount; h++) {
        const ha = 1 / Math.pow(h, harmonicDecay);
        sample += ha * Math.sin(2 * Math.PI * freq * h * t);
      }
      out[i] += sample * e.amp * env;
    }
  }

  if (Number.isFinite(snrDb) && snrDb < 120) {
    let sigPow = 0;
    for (let i = 0; i < n; i++) sigPow += out[i] * out[i];
    sigPow /= n;
    const noisePow = sigPow / Math.pow(10, snrDb / 10);
    const noiseAmp = Math.sqrt(noisePow);
    for (let i = 0; i < n; i++) {
      out[i] += (rng() * 2 - 1) * noiseAmp;
    }
  }

  return out;
}

/** Build truth note list from events (post-humanisation metadata stripped). */
function truthFromEvents(events, bpm, opts = {}) {
  const beatSec = 60 / bpm;
  return events.map((e) => ({
    midi: e.midi,
    startSec: e.startSec,
    durationSec: e.durationSec,
    startBeat: e.startBeat ?? e.startSec / beatSec,
    durationBeats: e.durationBeats ?? e.durationSec / beatSec,
  }));
}

function scaleEvents(midis, bpm, noteBeats, startSec = 0.08, gapFrac = 0.12) {
  const beatSec = 60 / bpm;
  const noteSec = noteBeats * beatSec;
  const gap = noteSec * gapFrac;
  return midis.map((midi, i) => ({
    midi,
    startSec: startSec + i * noteSec,
    durationSec: noteSec - gap,
    startBeat: (startSec + i * noteSec) / beatSec,
    durationBeats: noteBeats * (1 - gapFrac),
  }));
}

// ── Ground-truth scoring ─────────────────────────────────────
function matchNotes(truth, detected, tolSec) {
  const det = detected.slice().sort((a, b) => a.startSec - b.startSec);
  const tr = truth.slice().sort((a, b) => a.startSec - b.startSec);
  const used = new Set();
  const matched = [];
  const onsetErrs = [];
  const durationErrs = [];
  let pitchCorrect = 0;
  let octaveErrors = 0;

  for (const t of tr) {
    let best = -1;
    let bestDist = Infinity;
    for (let j = 0; j < det.length; j++) {
      if (used.has(j)) continue;
      const d = Math.abs(det[j].startSec - t.startSec);
      if (d <= tolSec && d < bestDist) {
        bestDist = d;
        best = j;
      }
    }
    if (best < 0) continue;
    used.add(best);
    const dNote = det[best];
    const onsetErr = dNote.startSec - t.startSec;
    const durErr = dNote.durationSec - t.durationSec;
    onsetErrs.push(onsetErr);
    durationErrs.push(durErr);
    matched.push({ truth: t, detected: dNote });
    if (dNote.midi === t.midi) {
      pitchCorrect++;
    } else if (Math.abs(dNote.midi - t.midi) % 12 === 0) {
      octaveErrors++;
    }
  }

  const missed = tr.length - matched.length;
  const extra = det.length - matched.length;
  return {
    matched,
    missed,
    extra,
    pitchCorrect,
    octaveErrors,
    onsetErrs,
    durationErrs,
  };
}

function median(arr) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function computeMetrics(truth, detected, tolSec, truthBpm, detectedBpm) {
  const m = matchNotes(truth, detected, tolSec);
  const recall = truth.length ? m.matched.length / truth.length : 1;
  const precision = detected.length ? m.matched.length / detected.length : (truth.length ? 0 : 1);
  const f1 = recall + precision > 0 ? (2 * recall * precision) / (recall + precision) : 0;
  const pitchAccuracy = m.matched.length ? m.pitchCorrect / m.matched.length : 1;
  const octaveRate = m.matched.length ? m.octaveErrors / m.matched.length : 0;

  const onsetAbs = m.onsetErrs.map((e) => Math.abs(e));
  const durAbs = m.durationErrs.map((e) => Math.abs(e));
  const durFrac = m.matched.map(({ truth: t, detected: d }) =>
    t.durationSec > 0 ? Math.abs(d.durationSec - t.durationSec) / t.durationSec : 0,
  );

  return {
    recall,
    precision,
    f1,
    pitchAccuracy,
    octaveErrors: m.octaveErrors,
    octaveRate,
    medianOnsetMs: median(onsetAbs) * 1000,
    meanOnsetMs: mean(onsetAbs) * 1000,
    medianDurMs: median(durAbs) * 1000,
    meanDurMs: mean(durAbs) * 1000,
    medianDurFrac: median(durFrac),
    meanDurFrac: mean(durFrac),
    matched: m.matched.length,
    missed: m.missed,
    extra: m.extra,
    truthCount: truth.length,
    detectedCount: detected.length,
    truthBpm,
    detectedBpm,
    bpmErr: Math.abs((detectedBpm ?? 0) - truthBpm),
  };
}

function report(label, metrics) {
  console.log(
    `[${label}]`
    + ` recall=${metrics.recall.toFixed(3)} prec=${metrics.precision.toFixed(3)}`
    + ` pitch=${metrics.pitchAccuracy.toFixed(3)} oct=${metrics.octaveErrors}`
    + ` onsetMed=${metrics.medianOnsetMs.toFixed(1)}ms`
    + ` durMed=${(metrics.medianDurFrac * 100).toFixed(1)}%`
    + ` notes=${metrics.detectedCount}/${metrics.truthCount}`
    + ` bpm=${metrics.detectedBpm} (Δ${metrics.bpmErr.toFixed(1)})`,
  );
}

async function analyze(mono, sampleRate, options = {}) {
  return analyzeMono(mono, sampleRate, options);
}

const scenarioMetrics = [];

function recordScenario(label, metrics) {
  scenarioMetrics.push({ label, ...metrics });
  report(label, metrics);
}

// ── Scenario 1: Clean quarter-note scale, 100 BPM ────────────
{
  const BPM = 100;
  const beatSec = 60 / BPM;
  const scale = [60, 62, 64, 65, 67, 69, 71, 72];
  const truth = scaleEvents(scale, BPM, 1, 0.1, 0.1);
  const mono = synthVoice(truth, {
    seed: 101, attackMs: 18, releaseMs: 70, vibratoDepthCents: 0,
  });
  const result = await analyze(mono, SR);
  const metrics = computeMetrics(truth, result.notes, beatSec * 0.35, BPM, result.bpm);
  recordScenario('1-clean-quarters-100bpm', metrics);
  assert.ok(metrics.recall >= 0.95, `recall ${metrics.recall}`);
  assert.equal(metrics.pitchAccuracy, 1.0, `pitch ${metrics.pitchAccuracy}`);
  assert.ok(metrics.bpmErr <= 2, `bpm err ${metrics.bpmErr}`);
  assert.ok(metrics.medianOnsetMs < 30, `onset ${metrics.medianOnsetMs}ms`);
  assert.ok(metrics.medianDurFrac < 0.15, `dur frac ${metrics.medianDurFrac}`);
}

// ── Scenario 2: Eighth notes at 140 BPM, harmonic-rich ───────
{
  const BPM = 140;
  const beatSec = 60 / BPM;
  const scale = [64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83];
  const truth = scaleEvents(scale, BPM, 0.5, 0.08, 0.08);
  const mono = synthVoice(truth, {
    seed: 202,
    harmonicCount: 8,
    harmonicDecay: 1.15,
    attackMs: 12,
    releaseMs: 45,
    vibratoDepthCents: 0,
  });
  const result = await analyze(mono, SR);
  const metrics = computeMetrics(truth, result.notes, beatSec * 0.4, BPM, result.bpm);
  recordScenario('2-eighths-140bpm', metrics);
  // Accept exact half/double only when within 3 BPM of 70/280 — otherwise fail.
  const bpmOk = metrics.bpmErr <= 3
    || (Math.abs(result.bpm - BPM / 2) <= 3)
    || (Math.abs(result.bpm - BPM * 2) <= 3);
  assert.ok(bpmOk, `bpm ${result.bpm} vs ${BPM}`);
  assert.ok(metrics.recall >= 0.9, `recall ${metrics.recall}`);
  assert.ok(metrics.pitchAccuracy >= 0.95, `pitch ${metrics.pitchAccuracy}`);
}

// ── Scenario 3: Sixteenth notes at 90 BPM ──────────────────────
{
  const BPM = 90;
  const beatSec = 60 / BPM;
  const pattern = [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60, 59];
  const truth = scaleEvents(pattern, BPM, 0.25, 0.1, 0.06);
  const mono = synthVoice(truth, { seed: 303, attackMs: 10, releaseMs: 35, vibratoDepthCents: 0 });
  const result = await analyze(mono, SR, { minNoteMs: 40 });
  const metrics = computeMetrics(truth, result.notes, beatSec * 0.45, BPM, result.bpm);
  recordScenario('3-sixteenths-90bpm', metrics);
  assert.ok(metrics.recall >= 0.85, `recall ${metrics.recall}`);
  const gridOk = result.grid.label === '1/16' || result.grid.division <= 0.25;
  assert.ok(gridOk, `grid ${result.grid.label} div=${result.grid.division}`);
}

// ── Scenario 4: Repeated same pitch (8 articulations) ─────────
{
  const BPM = 96;
  const beatSec = 60 / BPM;
  const truth = Array.from({ length: 8 }, (_, i) => ({
    midi: 67,
    startSec: 0.1 + i * beatSec,
    durationSec: beatSec * 0.72,
    startBeat: (0.1 + i * beatSec) / beatSec,
    durationBeats: 0.72,
  }));
  const mono = synthVoice(truth, { seed: 404, attackMs: 15, releaseMs: 55, vibratoDepthCents: 0 });
  const result = await analyze(mono, SR, { onsetSensitivity: 0.62 });
  const metrics = computeMetrics(truth, result.notes, beatSec * 0.4, BPM, result.bpm);
  recordScenario('4-repeated-pitch', metrics);
  assert.ok(Math.abs(result.notes.length - truth.length) <= 1,
    `count ${result.notes.length} vs ${truth.length}`);
}

// ── Scenario 5: Vibrato-heavy sustained melody ─────────────────
{
  const BPM = 88;
  const beatSec = 60 / BPM;
  const midis = [60, 64, 67, 72, 67, 64];
  const truth = scaleEvents(midis, BPM, 1, 0.12, 0.08);
  const mono = synthVoice(truth, {
    seed: 505,
    vibratoDepthCents: 40,
    vibratoRateHz: 5.8,
    vibratoDelaySec: 0.05,
    attackMs: 25,
    releaseMs: 90,
  });
  const result = await analyze(mono, SR, { vibratoCents: 85 });
  const metrics = computeMetrics(truth, result.notes, beatSec * 0.45, BPM, result.bpm);
  recordScenario('5-vibrato-sustained', metrics);
  assert.ok(Math.abs(result.notes.length - truth.length) <= 1,
    `shattered: ${result.notes.length} vs ${truth.length}`);
  assert.equal(metrics.pitchAccuracy, 1.0, `pitch ${metrics.pitchAccuracy}`);
}

// ── Scenario 6: Low register / bass range ──────────────────────
{
  const BPM = 92;
  const beatSec = 60 / BPM;
  const midis = [36, 38, 40, 41, 43, 45, 47, 48];
  const truth = scaleEvents(midis, BPM, 1, 0.15, 0.1);
  const mono = synthVoice(truth, {
    seed: 606,
    harmonicCount: 6,
    attackMs: 22,
    releaseMs: 85,
    vibratoDepthCents: 0,
  });
  const result = await analyze(mono, SR, { range: 'bass' });
  const metrics = computeMetrics(truth, result.notes, beatSec * 0.4, BPM, result.bpm);
  recordScenario('6-bass-register', metrics);
  assert.ok(metrics.recall >= 0.85, `recall ${metrics.recall}`);
  assert.equal(metrics.octaveErrors, 0, `octave errors ${metrics.octaveErrors}`);
}

// ── Scenario 7: High register ────────────────────────────────
{
  const BPM = 108;
  const beatSec = 60 / BPM;
  const midis = [76, 78, 79, 81, 83, 84, 86, 88];
  const truth = scaleEvents(midis, BPM, 1, 0.1, 0.1);
  const mono = synthVoice(truth, { seed: 707, attackMs: 14, releaseMs: 60, vibratoDepthCents: 0 });
  const result = await analyze(mono, SR, { range: 'wide' });
  const metrics = computeMetrics(truth, result.notes, beatSec * 0.4, BPM, result.bpm);
  recordScenario('7-high-register', metrics);
  assert.ok(metrics.recall >= 0.85, `recall ${metrics.recall}`);
  assert.equal(metrics.octaveErrors, 0, `octave errors ${metrics.octaveErrors}`);
}

// ── Scenario 8: Noisy take ~12 dB SNR, sensitive preset ────────
{
  const BPM = 100;
  const beatSec = 60 / BPM;
  const scale = [60, 62, 64, 65, 67, 69, 71, 72];
  const truth = scaleEvents(scale, BPM, 1, 0.12, 0.1);
  const mono = synthVoice(truth, { seed: 808, snrDb: 12, vibratoDepthCents: 0 });
  const result = await analyze(mono, SR, { preset: 'sensitive' });
  const metrics = computeMetrics(truth, result.notes, beatSec * 0.45, BPM, result.bpm);
  recordScenario('8-noisy-sensitive', metrics);
  assert.ok(metrics.recall >= 0.75, `recall ${metrics.recall}`);
  assert.ok(metrics.precision >= 0.7, `precision ${metrics.precision}`);
}

// ── Scenario 9: Silence / pure noise ─────────────────────────
{
  const n = Math.floor(2 * SR);
  const rng = mulberry32(909);
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = (rng() * 2 - 1) * 0.02;
  const result = await analyze(mono, SR, { preset: 'sensitive' });
  recordScenario('9-silence-noise', {
    recall: 1, precision: 1, pitchAccuracy: 1, octaveErrors: 0,
    medianOnsetMs: 0, medianDurFrac: 0, detectedCount: result.notes.length,
    truthCount: 0, truthBpm: 0, detectedBpm: result.bpm, bpmErr: 0,
  });
  assert.ok(result.notes.length <= 2, `notes ${result.notes.length}`);
}

// ── Scenario 10: Legato overlapping notes ──────────────────────
{
  const BPM = 84;
  const beatSec = 60 / BPM;
  const midis = [55, 57, 59, 60, 62, 64];
  const truth = scaleEvents(midis, BPM, 1, 0.1, 0.05);
  const mono = synthVoice(truth, { seed: 1010, legato: true, legatoOverlapSec: 0.04, vibratoDepthCents: 0 });
  const result = await analyze(mono, SR);
  const metrics = computeMetrics(truth, result.notes, beatSec * 0.45, BPM, result.bpm);
  recordScenario('10-legato', metrics);
  assert.ok(metrics.recall >= 0.85, `recall ${metrics.recall}`);
}

// ── Scenario 11: Dotted / mixed rhythm ───────────────────────
{
  const BPM = 96;
  const beatSec = 60 / BPM;
  const rhythm = [
    { beats: 1, midi: 60 },
    { beats: 0.5, midi: 62 },
    { beats: 1.5, midi: 64 },
    { beats: 0.5, midi: 65 },
    { beats: 1, midi: 67 },
    { beats: 0.75, midi: 69 },
    { beats: 0.25, midi: 71 },
    { beats: 1, midi: 72 },
  ];
  let cursor = 0.1;
  const truth = rhythm.map((r) => {
    const startSec = cursor;
    const durationSec = r.beats * beatSec * 0.88;
    cursor += r.beats * beatSec;
    return {
      midi: r.midi,
      startSec,
      durationSec,
      startBeat: startSec / beatSec,
      durationBeats: r.beats * 0.88,
    };
  });
  const mono = synthVoice(truth, { seed: 1111, attackMs: 16, releaseMs: 50, vibratoDepthCents: 0 });
  const result = await analyze(mono, SR);
  const tol = beatSec * 0.4;
  const m = matchNotes(truth, result.notes, tol);
  let rhythmOk = 0;
  const gridUnit = result.grid.division || 0.25;
  for (const { truth: t, detected: d } of m.matched) {
    const qTruth = Math.round(t.durationBeats / gridUnit) * gridUnit;
    const qDet = d.durationBeats != null
      ? Math.round(d.durationBeats / gridUnit) * gridUnit
      : Math.round((d.durationSec / beatSec) / gridUnit) * gridUnit;
    if (Math.abs(qDet - qTruth) <= gridUnit + 1e-6) rhythmOk++;
  }
  const rhythmFrac = m.matched.length ? rhythmOk / m.matched.length : 0;
  const metrics = computeMetrics(truth, result.notes, tol, BPM, result.bpm);
  metrics.rhythmQuantOk = rhythmFrac;
  recordScenario('11-mixed-rhythm', metrics);
  assert.ok(rhythmFrac >= 0.8, `rhythm quant ${rhythmFrac}`);
}

// ── Scenario 12: Preset behaviour ──────────────────────────────
{
  const BPM = 100;
  const beatSec = 60 / BPM;
  const scale = [60, 62, 64, 65, 67, 69, 71, 72];
  const truth = scaleEvents(scale, BPM, 1, 0.1, 0.1);
  const noisy = synthVoice(truth, { seed: 1212, snrDb: 14 });
  const clean = synthVoice(truth, { seed: 1213, vibratoDepthCents: 0 });

  const sens = await analyze(noisy, SR, { preset: 'sensitive' });
  const strict = await analyze(noisy, SR, { preset: 'strict' });
  const mSens = computeMetrics(truth, sens.notes, beatSec * 0.4, BPM, sens.bpm);
  const mStrict = computeMetrics(truth, strict.notes, beatSec * 0.4, BPM, strict.bpm);
  assert.ok(sens.notes.length >= strict.notes.length,
    `sensitive ${sens.notes.length} < strict ${strict.notes.length}`);
  assert.ok(mStrict.precision >= mSens.precision,
    `strict prec ${mStrict.precision} < sensitive ${mSens.precision}`);

  for (const preset of ['balanced', 'sensitive', 'strict']) {
    const r = await analyze(clean, SR, { preset });
    const m = computeMetrics(truth, r.notes, beatSec * 0.4, BPM, r.bpm);
    assert.equal(m.pitchAccuracy, 1.0, `${preset} pitch ${m.pitchAccuracy}`);
  }
  recordScenario('12-presets', {
    ...mSens,
    label: 'noisy-sensitive',
    strictPrecision: mStrict.precision,
    sensCount: sens.notes.length,
    strictCount: strict.notes.length,
  });
}

// ── Scenario 13: Manual tempo override ─────────────────────────
{
  const BPM = 100;
  const beatSec = 60 / BPM;
  const truth = scaleEvents([60, 64, 67, 72], BPM, 1, 0.1, 0.1);
  const mono = synthVoice(truth, { seed: 1313, vibratoDepthCents: 0 });
  const manual = await analyze(mono, SR, { tempoMode: 'manual', bpm: 128 });
  assert.equal(manual.bpm, 128, `manual bpm ${manual.bpm}`);

  const triple = await analyze(mono, SR, { beatsPerBar: 3 });
  assert.equal(triple.beatsPerBar, 3, `beatsPerBar ${triple.beatsPerBar}`);
  recordScenario('13-manual-tempo', {
    recall: 1, precision: 1, pitchAccuracy: 1, octaveErrors: 0,
    medianOnsetMs: 0, medianDurFrac: 0,
    detectedCount: manual.notes.length, truthCount: truth.length,
    truthBpm: 128, detectedBpm: manual.bpm, bpmErr: 0,
  });
}

// ── Scenario 14: Determinism ───────────────────────────────────
{
  const truth = scaleEvents([60, 62, 64, 65], 100, 1, 0.1, 0.1);
  const mono = synthVoice(truth, { seed: 1414, vibratoDepthCents: 0 });
  const a = await analyze(mono, SR);
  const b = await analyze(mono, SR);
  assert.deepEqual(
    a.notes.map((n) => ({ midi: n.midi, startSec: n.startSec, durationSec: n.durationSec })),
    b.notes.map((n) => ({ midi: n.midi, startSec: n.startSec, durationSec: n.durationSec })),
  );
  recordScenario('14-determinism', {
    recall: 1, precision: 1, pitchAccuracy: 1, octaveErrors: 0,
    medianOnsetMs: 0, medianDurFrac: 0,
    detectedCount: a.notes.length, truthCount: truth.length,
    truthBpm: 100, detectedBpm: a.bpm, bpmErr: 0,
  });
}

// ── Scenario 15: Sample-rate independence (MIDI sequence) ────
{
  const BPM = 100;
  const midis = [60, 62, 64, 65, 67, 69, 71, 72];
  const truth = scaleEvents(midis, BPM, 1, 0.1, 0.1);
  const mono44 = synthVoice(truth, { seed: 1515, sampleRate: SR, vibratoDepthCents: 0 });
  const mono48 = synthVoice(truth, { seed: 1515, sampleRate: SR_ALT, vibratoDepthCents: 0 });
  const r44 = await analyze(mono44, SR);
  const r48 = await analyze(mono48, SR_ALT);
  const seq44 = r44.notes.map((n) => n.midi);
  const seq48 = r48.notes.map((n) => n.midi);
  assert.deepEqual(seq44, seq48, `44k ${seq44} vs 48k ${seq48}`);
  const metrics = computeMetrics(truth, r44.notes, (60 / BPM) * 0.4, BPM, r44.bpm);
  recordScenario('15-sample-rate', metrics);
}

// ── Scenario 16: Performance guard (30 s in < 20 s) ────────────
{
  const BPM = 110;
  const beatSec = 60 / BPM;
  const seconds = 30;
  const events = [];
  const scale = [60, 62, 64, 65, 67, 69, 71, 72];
  for (let t = 0.1; t < seconds - beatSec; t += beatSec * 0.5) {
    events.push({
      midi: scale[events.length % scale.length],
      startSec: t,
      durationSec: beatSec * 0.4,
    });
  }
  const mono = synthVoice(events, { seed: 1616 });
  const t0 = Date.now();
  await analyze(mono, SR);
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 20000, `perf ${elapsed}ms for 30s audio`);
  recordScenario('16-performance', {
    recall: 1, precision: 1, pitchAccuracy: 1, octaveErrors: 0,
    medianOnsetMs: 0, medianDurFrac: 0,
    detectedCount: events.length, truthCount: events.length,
    truthBpm: BPM, detectedBpm: BPM, bpmErr: 0,
    elapsedMs: elapsed,
  });
}

console.log('track-to-sheet accuracy: all tests passed');
