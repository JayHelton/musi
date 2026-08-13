import { getSetting } from './persistence.js';

const STORAGE_KEY = 'musi:pitchAttempts';
const MAX_ATTEMPTS = 500;

const DEFAULT_REGISTER_PRESETS = [
  { id: 'chest', low: 41, high: 62 },
  { id: 'mix', low: 64, high: 71 },
  { id: 'head', low: 67, high: 76 },
];

const FALLBACK_SPLITS = { chestMax: 59, mixMax: 71 };

function storage() {
  try {
    return typeof globalThis !== 'undefined' ? globalThis.localStorage : null;
  } catch (e) {
    return null;
  }
}

function canUseStorage() {
  return !!storage();
}

function readRawAttempts() {
  const ls = storage();
  if (!ls) return [];
  try {
    const raw = ls.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function writeAttempts(attempts) {
  const ls = storage();
  if (!ls) return;
  try {
    ls.setItem(STORAGE_KEY, JSON.stringify(attempts));
  } catch (e) {
    // Ignore quota failures; attempts stay in memory for this session.
  }
}

export function loadAttempts() {
  return readRawAttempts();
}

export function recordAttempt(record) {
  if (!record || typeof record !== 'object') return loadAttempts();
  const attempts = readRawAttempts();
  attempts.push(record);
  const capped = attempts.length > MAX_ATTEMPTS
    ? attempts.slice(attempts.length - MAX_ATTEMPTS)
    : attempts;
  writeAttempts(capped);
  return capped;
}

export function getRegisterBounds(customPresets) {
  const source = Array.isArray(customPresets) && customPresets.length
    ? customPresets
    : DEFAULT_REGISTER_PRESETS;
  const bounds = {};
  for (const preset of source) {
    if (!preset?.id || preset.low == null || preset.high == null) continue;
    bounds[preset.id] = {
      low: Math.min(preset.low, preset.high),
      high: Math.max(preset.low, preset.high),
    };
  }
  return bounds;
}

function registerForMidi(midi, bounds) {
  const order = ['chest', 'mix', 'head'];
  for (const id of order) {
    const row = bounds[id];
    if (row && midi >= row.low && midi <= row.high) return id;
  }
  if (midi <= FALLBACK_SPLITS.chestMax) return 'chest';
  if (midi <= FALLBACK_SPLITS.mixMax) return 'mix';
  return 'head';
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function summarizeRegister(rows) {
  const absErrors = [];
  const centers = [];
  const stabilities = [];
  const settles = [];
  let passes = 0;

  for (const row of rows) {
    if (row.centerErrorCents != null && Number.isFinite(row.centerErrorCents)) {
      centers.push(row.centerErrorCents);
      absErrors.push(Math.abs(row.centerErrorCents));
    }
    if (row.stabilityCents != null && Number.isFinite(row.stabilityCents)) {
      stabilities.push(row.stabilityCents);
    }
    if (row.settleTimeMs != null && Number.isFinite(row.settleTimeMs)) {
      settles.push(row.settleTimeMs);
    }
    if (row.passed) passes += 1;
  }

  const n = rows.length;
  return {
    avgAbsCenterError: mean(absErrors),
    biasCents: mean(centers),
    avgStability: mean(stabilities),
    avgSettleMs: mean(settles),
    passRate: n ? passes / n : null,
    n,
  };
}

export function summarizeAttempts(attempts, registerBounds) {
  const list = Array.isArray(attempts) ? attempts : [];
  const bounds = registerBounds || getRegisterBounds(getSetting('pitchTrainer.customPresets', null));

  const absErrors = [];
  const centers = [];
  const stabilities = [];
  const settles = [];
  let passes = 0;

  const byMidi = {};
  const byRegister = { chest: [], mix: [], head: [] };

  for (const row of list) {
    if (row.centerErrorCents != null && Number.isFinite(row.centerErrorCents)) {
      centers.push(row.centerErrorCents);
      absErrors.push(Math.abs(row.centerErrorCents));
    }
    if (row.stabilityCents != null && Number.isFinite(row.stabilityCents)) {
      stabilities.push(row.stabilityCents);
    }
    if (row.settleTimeMs != null && Number.isFinite(row.settleTimeMs)) {
      settles.push(row.settleTimeMs);
    }
    if (row.passed) passes += 1;

    const midi = row.targetMidi;
    if (midi != null && Number.isFinite(midi)) {
      const bucket = byMidi[midi] || { midi, n: 0, passes: 0, absSum: 0 };
      bucket.n += 1;
      if (row.passed) bucket.passes += 1;
      if (row.centerErrorCents != null && Number.isFinite(row.centerErrorCents)) {
        bucket.absSum += Math.abs(row.centerErrorCents);
      }
      byMidi[midi] = bucket;

      const reg = registerForMidi(midi, bounds);
      byRegister[reg].push(row);
    }
  }

  const weakNotes = Object.values(byMidi)
    .map(bucket => ({
      midi: bucket.midi,
      absError: bucket.n ? bucket.absSum / bucket.n : 0,
      passRate: bucket.n ? bucket.passes / bucket.n : 0,
      n: bucket.n,
    }))
    .sort((a, b) => {
      if (b.absError !== a.absError) return b.absError - a.absError;
      if (a.passRate !== b.passRate) return a.passRate - b.passRate;
      return b.n - a.n;
    });

  const n = list.length;

  return {
    avgAbsCenterError: mean(absErrors),
    biasCents: mean(centers),
    avgStability: mean(stabilities),
    avgSettleMs: mean(settles),
    passRate: n ? passes / n : null,
    weakNotes,
    byRegister: {
      chest: summarizeRegister(byRegister.chest),
      mix: summarizeRegister(byRegister.mix),
      head: summarizeRegister(byRegister.head),
    },
  };
}

export function weakMidiSet(summary, limit = 5) {
  if (!summary?.weakNotes?.length) return [];
  return summary.weakNotes.slice(0, limit).map(row => row.midi);
}
