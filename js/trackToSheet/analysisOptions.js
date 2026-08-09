// Shared analysis-option contract for Track → Sheet transcription.
// Pure data + mapping — no DOM, storage, or Web Audio. Safe to import from Node
// smoke tests and the browser transcription pipeline alike.

export const ANALYSIS_PRESETS = ['balanced', 'sensitive', 'strict', 'custom'];

export const DEFAULT_ANALYSIS_OPTIONS = Object.freeze({
  preset: 'balanced',
  sensitivity: 0.5,
  minNoteMs: 70,
  vibratoCents: 65,
  onsetSensitivity: 0.5,
  splitRepeats: true,
  range: 'auto',
  minFreq: null,
  maxFreq: null,
  tempoMode: 'auto',
  bpm: null,
  beatsPerBar: null,
  quantizeGrid: 'auto',
  quantizeStrength: 1,
  timeResolution: 'high',
});

/** UI metadata for every user-facing analysis knob. */
export const ANALYSIS_OPTION_META = Object.freeze({
  preset: {
    key: 'preset',
    label: 'Preset',
    kind: 'select',
    derived: true,
    choices: [
      { value: 'balanced', label: 'Balanced' },
      { value: 'sensitive', label: 'Sensitive' },
      { value: 'strict', label: 'Strict' },
      { value: 'custom', label: 'Custom' },
    ],
    hint: 'Starting profile; custom keeps your manual tweaks.',
  },
  sensitivity: {
    key: 'sensitivity',
    label: 'Pitch sensitivity',
    kind: 'range',
    min: 0,
    max: 1,
    step: 0.01,
    hint: 'Higher picks up quiet or breathy notes; lower ignores background noise.',
  },
  minNoteMs: {
    key: 'minNoteMs',
    label: 'Shortest note',
    kind: 'number',
    min: 20,
    max: 500,
    step: 5,
    unit: 'ms',
    hint: 'Notes shorter than this are treated as blips and discarded.',
  },
  vibratoCents: {
    key: 'vibratoCents',
    label: 'Vibrato tolerance',
    kind: 'number',
    min: 20,
    max: 150,
    step: 5,
    unit: 'cents',
    hint: 'How much pitch wobble still counts as one sustained note.',
  },
  onsetSensitivity: {
    key: 'onsetSensitivity',
    label: 'Onset sensitivity',
    kind: 'range',
    min: 0,
    max: 1,
    step: 0.01,
    hint: 'Higher splits repeated notes and re-articulations more aggressively.',
  },
  splitRepeats: {
    key: 'splitRepeats',
    label: 'Split repeats',
    kind: 'toggle',
    hint: 'Use detected onsets to separate repeated same-pitch notes.',
  },
  range: {
    key: 'range',
    label: 'Pitch range',
    kind: 'select',
    choices: [
      { value: 'auto', label: 'Auto' },
      { value: 'voice', label: 'Voice' },
      { value: 'bass', label: 'Bass' },
      { value: 'guitar', label: 'Guitar' },
      { value: 'wide', label: 'Wide' },
    ],
    hint: 'Frequency band searched for pitch; narrows the detector to your instrument.',
  },
  minFreq: {
    key: 'minFreq',
    label: 'Min frequency',
    kind: 'number',
    min: 20,
    max: 5000,
    step: 1,
    unit: 'Hz',
    advanced: true,
    hint: 'Lowest pitch searched; overrides the range preset when set.',
  },
  maxFreq: {
    key: 'maxFreq',
    label: 'Max frequency',
    kind: 'number',
    min: 20,
    max: 5000,
    step: 1,
    unit: 'Hz',
    advanced: true,
    hint: 'Highest pitch searched; overrides the range preset when set.',
  },
  tempoMode: {
    key: 'tempoMode',
    label: 'Tempo',
    kind: 'select',
    choices: [
      { value: 'auto', label: 'Auto-detect' },
      { value: 'manual', label: 'Manual BPM' },
    ],
    hint: 'Whether timing is inferred from the recording or locked to a set BPM.',
  },
  bpm: {
    key: 'bpm',
    label: 'BPM',
    kind: 'number',
    min: 40,
    max: 240,
    step: 1,
    dependsOn: { tempoMode: 'manual' },
    hint: 'Beats per minute used when tempo is set manually.',
  },
  beatsPerBar: {
    key: 'beatsPerBar',
    label: 'Beats per bar',
    kind: 'number',
    min: 2,
    max: 8,
    step: 1,
    hint: 'Bar length for quantization; leave unset to auto-detect 3 or 4.',
  },
  quantizeGrid: {
    key: 'quantizeGrid',
    label: 'Quantize grid',
    kind: 'select',
    choices: [
      { value: 'off', label: 'Off' },
      { value: 'auto', label: 'Auto' },
      { value: '1/4', label: '1/4 notes' },
      { value: '1/8', label: '1/8 notes' },
      { value: '1/16', label: '1/16 notes' },
      { value: '1/32', label: '1/32 notes' },
      { value: '1/8t', label: '1/8 triplets' },
      { value: '1/16t', label: '1/16 triplets' },
    ],
    hint: 'Rhythmic grid notes snap to when quantizing.',
  },
  quantizeStrength: {
    key: 'quantizeStrength',
    label: 'Quantize strength',
    kind: 'range',
    min: 0,
    max: 1,
    step: 0.01,
    dependsOn: { quantizeGrid: (v) => v !== 'off' },
    hint: 'How tightly note starts snap to the grid; lower keeps more raw timing.',
  },
  timeResolution: {
    key: 'timeResolution',
    label: 'Time resolution',
    kind: 'select',
    choices: [
      { value: 'standard', label: 'Standard' },
      { value: 'high', label: 'High' },
    ],
    hint: 'Analysis detail versus speed; high is slower but catches shorter notes.',
  },
});

/** Preset-specific overrides layered on top of balanced defaults. */
export const PRESET_OPTIONS = Object.freeze({
  balanced: Object.freeze({
    preset: 'balanced',
    sensitivity: 0.5,
    minNoteMs: 70,
    vibratoCents: 65,
    onsetSensitivity: 0.5,
  }),
  sensitive: Object.freeze({
    preset: 'sensitive',
    sensitivity: 0.72,
    minNoteMs: 55,
    vibratoCents: 78,
    onsetSensitivity: 0.58,
  }),
  strict: Object.freeze({
    preset: 'strict',
    sensitivity: 0.28,
    minNoteMs: 110,
    vibratoCents: 45,
    onsetSensitivity: 0.35,
  }),
});

const OPTION_KEYS = Object.keys(DEFAULT_ANALYSIS_OPTIONS);
const PRESET_TUNING_KEYS = ['sensitivity', 'minNoteMs', 'vibratoCents', 'onsetSensitivity'];
const REF_SAMPLE_RATE = 44100;

const RANGE_FREQ = Object.freeze({
  auto: { min: 55, max: 2000 },
  voice: { min: 70, max: 1200 },
  bass: { min: 35, max: 500 },
  guitar: { min: 70, max: 1400 },
  wide: { min: 30, max: 2200 },
});

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function logLerp(a, b, t) {
  return a * Math.pow(b / a, t);
}

function choiceValues(meta) {
  return meta.choices ? meta.choices.map((c) => c.value) : [];
}

function normalizeNumber(value, meta, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const min = meta.min ?? -Infinity;
  const max = meta.max ?? Infinity;
  return clamp(n, min, max);
}

function normalizeNullableNumber(value, meta, fallback) {
  if (value === null || value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const min = meta.min ?? -Infinity;
  const max = meta.max ?? Infinity;
  return clamp(n, min, max);
}

function normalizeSelect(value, meta, fallback) {
  const choices = choiceValues(meta);
  return choices.includes(value) ? value : fallback;
}

function normalizeBoolean(value, fallback) {
  if (value === undefined) return fallback;
  return !!value;
}

/**
 * Apply a named preset onto a base option object, returning a fresh copy.
 * Unknown names fall back to balanced; custom only sets the preset label.
 */
export function applyPreset(name, base = DEFAULT_ANALYSIS_OPTIONS) {
  const source = { ...base };
  if (name === 'custom') {
    return { ...source, preset: 'custom' };
  }
  const presetName = PRESET_OPTIONS[name] ? name : 'balanced';
  const preset = PRESET_OPTIONS[presetName];
  return {
    ...source,
    ...preset,
    preset: presetName,
  };
}

/**
 * Merge partial input into a complete, validated option object.
 * Preset values apply first unless the caller explicitly overrides those keys.
 */
export function normalizeAnalysisOptions(partial = {}) {
  let input = partial;
  if (typeof input === 'string') {
    try {
      input = JSON.parse(input);
    } catch {
      input = {};
    }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    input = {};
  }

  const presetRaw = input.preset;
  const presetName = ANALYSIS_PRESETS.includes(presetRaw) ? presetRaw : DEFAULT_ANALYSIS_OPTIONS.preset;

  let merged = { ...DEFAULT_ANALYSIS_OPTIONS };

  if (presetName !== 'custom' && PRESET_OPTIONS[presetName]) {
    const presetVals = PRESET_OPTIONS[presetName];
    for (const key of PRESET_TUNING_KEYS) {
      if (!(key in input)) {
        merged[key] = presetVals[key];
      }
    }
    merged.preset = presetName;
  } else if (presetName === 'custom') {
    merged.preset = 'custom';
  }

  for (const key of OPTION_KEYS) {
    if (!(key in input)) continue;
    const meta = ANALYSIS_OPTION_META[key];
    const fallback = merged[key];
    const raw = input[key];

    switch (meta.kind) {
      case 'range':
      case 'number':
        if (key === 'bpm' || key === 'beatsPerBar' || key === 'minFreq' || key === 'maxFreq') {
          merged[key] = normalizeNullableNumber(raw, meta, fallback);
        } else {
          merged[key] = normalizeNumber(raw, meta, fallback);
        }
        break;
      case 'select':
        merged[key] = normalizeSelect(raw, meta, fallback);
        break;
      case 'toggle':
        merged[key] = normalizeBoolean(raw, fallback);
        break;
      default:
        break;
    }
  }

  if (merged.tempoMode !== 'manual') {
    merged.bpm = null;
  }

  return merged;
}

function resolveFreqBounds(options) {
  const rangeBounds = RANGE_FREQ[options.range] ?? RANGE_FREQ.auto;
  let minFreq = options.minFreq != null ? options.minFreq : rangeBounds.min;
  let maxFreq = options.maxFreq != null ? options.maxFreq : rangeBounds.max;

  const minMeta = ANALYSIS_OPTION_META.minFreq;
  const maxMeta = ANALYSIS_OPTION_META.maxFreq;
  minFreq = normalizeNumber(minFreq, minMeta, rangeBounds.min);
  maxFreq = normalizeNumber(maxFreq, maxMeta, rangeBounds.max);

  if (minFreq >= maxFreq) {
    if (options.minFreq != null && options.maxFreq != null) {
      const swapMin = Math.min(minFreq, maxFreq);
      const swapMax = Math.max(minFreq, maxFreq);
      minFreq = swapMin;
      maxFreq = swapMax;
    } else {
      minFreq = rangeBounds.min;
      maxFreq = rangeBounds.max;
    }
  }

  return { minFreq, maxFreq };
}

function resolveQuantizeGrid(quantizeGrid) {
  switch (quantizeGrid) {
    case 'off':
      return { gridDivisions: [], allowTriplets: false };
    case '1/4':
      return { gridDivisions: [1], allowTriplets: false };
    case '1/8':
      return { gridDivisions: [0.5], allowTriplets: false };
    case '1/16':
      return { gridDivisions: [0.25], allowTriplets: false };
    case '1/32':
      return { gridDivisions: [0.125], allowTriplets: false };
    case '1/8t':
      return { gridDivisions: [1 / 3], allowTriplets: true };
    case '1/16t':
      return { gridDivisions: [1 / 6], allowTriplets: true };
    case 'auto':
      return { gridDivisions: [1, 0.5, 0.25, 1 / 3, 1 / 6], allowTriplets: true };
    default:
      return { gridDivisions: [1, 0.5, 0.25, 1 / 3, 1 / 6], allowTriplets: true };
  }
}

/**
 * Normalize user options and derive low-level DSP thresholds the engine consumes.
 */
export function resolveAnalysisOptions(partial = {}) {
  const normalized = normalizeAnalysisOptions(partial);
  const { minFreq, maxFreq } = resolveFreqBounds(normalized);

  // sensitivity 0..1: clarity gate and RMS noise floor
  const s = normalized.sensitivity;
  const minClarity = lerp(0.78, 0.34, s);
  const minRms = logLerp(0.014, 0.0022, s);
  const frameConfidence = Math.min(0.95, minClarity + 0.08);

  const minNoteSec = normalized.minNoteMs / 1000;

  // onsetSensitivity 0..1: spectral-flux peak picking
  const os = normalized.onsetSensitivity;
  const onsetDelta = lerp(0.16, 0.025, os);
  const onsetMinSepSec = lerp(0.09, 0.035, os);

  const timeResolution = normalized.timeResolution;
  const windowSize = 2048;
  const hopSize = timeResolution === 'standard' ? 512 : 256;
  const hopSec = hopSize / REF_SAMPLE_RATE;
  const minVoicedFrames = Math.max(2, Math.round(minNoteSec / hopSec * 0.6));

  const { gridDivisions, allowTriplets } = resolveQuantizeGrid(normalized.quantizeGrid);

  const derived = {
    minFreq,
    maxFreq,
    minClarity,
    minRms,
    frameConfidence,
    minNoteSec,
    minVoicedFrames,
    pitchTolCents: normalized.vibratoCents,
    onsetDelta,
    onsetMinSepSec,
    windowSize,
    hopSize,
    hopSec,
    gridDivisions,
    allowTriplets,
    quantizeStrength: normalized.quantizeStrength,
    beatsPerBar: normalized.beatsPerBar,
    bpm: normalized.tempoMode === 'manual' ? normalized.bpm : null,
  };

  return { ...normalized, derived };
}

/** Strip defaults so only meaningful overrides are persisted. */
export function serializeAnalysisOptions(options) {
  const normalized = normalizeAnalysisOptions(options);
  const out = {};
  for (const key of OPTION_KEYS) {
    if (normalized[key] !== DEFAULT_ANALYSIS_OPTIONS[key]) {
      out[key] = normalized[key];
    }
  }
  return out;
}

/** Parse stored JSON/objects safely, always returning validated options. */
export function deserializeAnalysisOptions(raw) {
  if (raw === null || raw === undefined) {
    return normalizeAnalysisOptions({});
  }
  if (typeof raw === 'string') {
    try {
      return normalizeAnalysisOptions(JSON.parse(raw));
    } catch {
      return normalizeAnalysisOptions({});
    }
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return normalizeAnalysisOptions({});
  }
  return normalizeAnalysisOptions(raw);
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function presetLabel(preset) {
  const meta = ANALYSIS_OPTION_META.preset;
  const match = meta.choices.find((c) => c.value === preset);
  return match ? match.label : capitalize(preset);
}

function quantizeLabel(grid) {
  const meta = ANALYSIS_OPTION_META.quantizeGrid;
  const match = meta.choices.find((c) => c.value === grid);
  return match ? match.label : grid;
}

/** One-line human summary for status bars and saved-setting labels. */
export function describeAnalysisOptions(options) {
  const opts = normalizeAnalysisOptions(options);
  const parts = [
    presetLabel(opts.preset),
    `${opts.minNoteMs} ms min`,
    `${quantizeLabel(opts.quantizeGrid)} grid`,
    opts.tempoMode === 'manual' && opts.bpm != null
      ? `${opts.bpm} BPM`
      : 'auto tempo',
  ];
  return parts.join(' · ');
}

/** True when every field matches balanced defaults (including preset). */
export function isDefaultAnalysisOptions(options) {
  const normalized = normalizeAnalysisOptions(options);
  for (const key of OPTION_KEYS) {
    if (normalized[key] !== DEFAULT_ANALYSIS_OPTIONS[key]) return false;
  }
  return true;
}

/** Keys that differ from the named preset's baseline values. */
export function diffFromPreset(options) {
  const normalized = normalizeAnalysisOptions(options);
  const presetName = PRESET_OPTIONS[normalized.preset] ? normalized.preset : 'balanced';
  const baseline = applyPreset(presetName, DEFAULT_ANALYSIS_OPTIONS);
  const changed = [];
  for (const key of OPTION_KEYS) {
    if (normalized[key] !== baseline[key]) changed.push(key);
  }
  return changed;
}
