/**
 * Zero-dependency Node tests for analysis options contract.
 * Run: node tests/track-to-sheet/options.mjs
 */

import assert from 'node:assert/strict';
import {
  ANALYSIS_PRESETS,
  DEFAULT_ANALYSIS_OPTIONS,
  ANALYSIS_OPTION_META,
  PRESET_OPTIONS,
  applyPreset,
  normalizeAnalysisOptions,
  resolveAnalysisOptions,
  serializeAnalysisOptions,
  deserializeAnalysisOptions,
  describeAnalysisOptions,
  isDefaultAnalysisOptions,
  diffFromPreset,
} from '../../js/trackToSheet/analysisOptions.js';

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ── Defaults resolve; frozen default never mutated ─────────────
{
  const defaults = { ...DEFAULT_ANALYSIS_OPTIONS };
  const resolved = resolveAnalysisOptions();
  assert.equal(resolved.preset, 'balanced');
  assert.equal(resolved.sensitivity, 0.5);
  assert.equal(resolved.minNoteMs, 70);
  assert.ok(resolved.derived);
  assert.ok(Number.isFinite(resolved.derived.minClarity));
  assert.ok(Number.isFinite(resolved.derived.minRms));

  normalizeAnalysisOptions({ sensitivity: 999, preset: 'strict' });
  deserializeAnalysisOptions({ minNoteMs: 200 });
  applyPreset('sensitive');
  assert.deepEqual(DEFAULT_ANALYSIS_OPTIONS, defaults);
  assert.ok(Object.isFrozen(DEFAULT_ANALYSIS_OPTIONS));
}

// ── Meta table completeness ─────────────────────────────────────
{
  for (const key of Object.keys(DEFAULT_ANALYSIS_OPTIONS)) {
    const meta = ANALYSIS_OPTION_META[key];
    assert.ok(meta, `missing ANALYSIS_OPTION_META for ${key}`);
    assert.ok(meta.label && meta.label.length > 0, `empty label for ${key}`);
    assert.ok(meta.hint && meta.hint.length > 0, `empty hint for ${key}`);
    if (meta.kind === 'select') {
      assert.ok(Array.isArray(meta.choices) && meta.choices.length > 0, `choices for ${key}`);
      const defaultVal = DEFAULT_ANALYSIS_OPTIONS[key];
      assert.ok(
        meta.choices.some((c) => c.value === defaultVal),
        `default ${defaultVal} missing from choices for ${key}`,
      );
    }
  }
  assert.deepEqual(ANALYSIS_PRESETS, ['balanced', 'sensitive', 'strict', 'custom']);
  assert.ok(PRESET_OPTIONS.balanced);
  assert.ok(PRESET_OPTIONS.sensitive);
  assert.ok(PRESET_OPTIONS.strict);
}

// ── Clamping and coercion ───────────────────────────────────────
{
  const hi = normalizeAnalysisOptions({ sensitivity: 99, onsetSensitivity: -5 });
  assert.equal(hi.sensitivity, 1);
  assert.equal(hi.onsetSensitivity, 0);

  const lo = normalizeAnalysisOptions({ sensitivity: '0.25', minNoteMs: '120' });
  assert.equal(lo.sensitivity, 0.25);
  assert.equal(lo.minNoteMs, 120);

  const nan = normalizeAnalysisOptions({
    sensitivity: NaN,
    minNoteMs: Infinity,
    vibratoCents: 'oops',
    bpm: null,
  });
  assert.equal(nan.sensitivity, DEFAULT_ANALYSIS_OPTIONS.sensitivity);
  assert.equal(nan.minNoteMs, DEFAULT_ANALYSIS_OPTIONS.minNoteMs);
  assert.equal(nan.vibratoCents, DEFAULT_ANALYSIS_OPTIONS.vibratoCents);

  const bools = normalizeAnalysisOptions({ splitRepeats: 0 });
  assert.equal(bools.splitRepeats, false);
  const bools2 = normalizeAnalysisOptions({ splitRepeats: 'yes' });
  assert.equal(bools2.splitRepeats, true);
}

// ── Unknown keys dropped; bad enums fall back ───────────────────
{
  const out = normalizeAnalysisOptions({
    sensitivity: 0.6,
    notARealKey: 42,
    range: 'spaceship',
    quantizeGrid: '1/64',
    tempoMode: 'warp',
  });
  assert.equal(out.sensitivity, 0.6);
  assert.ok(!('notARealKey' in out));
  assert.equal(out.range, DEFAULT_ANALYSIS_OPTIONS.range);
  assert.equal(out.quantizeGrid, DEFAULT_ANALYSIS_OPTIONS.quantizeGrid);
  assert.equal(out.tempoMode, DEFAULT_ANALYSIS_OPTIONS.tempoMode);
}

// ── Presets affect derived thresholds ───────────────────────────
{
  const balanced = resolveAnalysisOptions({ preset: 'balanced' });
  const sensitive = resolveAnalysisOptions({ preset: 'sensitive' });
  const strict = resolveAnalysisOptions({ preset: 'strict' });

  assert.ok(sensitive.derived.minClarity < balanced.derived.minClarity);
  assert.ok(balanced.derived.minClarity < strict.derived.minClarity);

  assert.ok(sensitive.derived.minRms < balanced.derived.minRms);
  assert.ok(balanced.derived.minRms < strict.derived.minRms);

  assert.ok(sensitive.derived.onsetDelta < strict.derived.onsetDelta);

  assert.equal(sensitive.minNoteMs, 45);
  assert.equal(strict.minNoteMs, 110);
}

// ── Preset application with explicit overrides ──────────────────
{
  const mixed = normalizeAnalysisOptions({ preset: 'strict', sensitivity: 0.9 });
  assert.equal(mixed.preset, 'strict');
  assert.equal(mixed.sensitivity, 0.9);
  assert.equal(mixed.minNoteMs, 110);
}

// ── applyPreset helpers ─────────────────────────────────────────
{
  const custom = applyPreset('custom', { sensitivity: 0.42, preset: 'balanced' });
  assert.equal(custom.preset, 'custom');
  assert.equal(custom.sensitivity, 0.42);

  const unknown = applyPreset('alien');
  assert.equal(unknown.preset, 'balanced');

  const sens = applyPreset('sensitive');
  assert.equal(sens.onsetSensitivity, 0.68);
}

// ── Range Hz mapping and min/max correction ─────────────────────
{
  const cases = [
    ['auto', 55, 2000],
    ['voice', 70, 1200],
    ['bass', 35, 500],
    ['guitar', 70, 1400],
    ['wide', 30, 2200],
  ];
  for (const [range, minHz, maxHz] of cases) {
    const r = resolveAnalysisOptions({ range });
    assert.equal(r.derived.minFreq, minHz, `minFreq for ${range}`);
    assert.equal(r.derived.maxFreq, maxHz, `maxFreq for ${range}`);
  }

  const explicit = resolveAnalysisOptions({ minFreq: 100, maxFreq: 800, range: 'auto' });
  assert.equal(explicit.derived.minFreq, 100);
  assert.equal(explicit.derived.maxFreq, 800);

  const swapped = resolveAnalysisOptions({ minFreq: 1500, maxFreq: 200 });
  assert.ok(swapped.derived.minFreq < swapped.derived.maxFreq);
  assert.equal(swapped.derived.minFreq, 200);
  assert.equal(swapped.derived.maxFreq, 1500);
}

// ── Quantize grid mapping ───────────────────────────────────────
{
  const off = resolveAnalysisOptions({ quantizeGrid: 'off' });
  assert.deepEqual(off.derived.gridDivisions, []);
  assert.equal(off.derived.allowTriplets, false);

  const q16 = resolveAnalysisOptions({ quantizeGrid: '1/16' });
  assert.deepEqual(q16.derived.gridDivisions, [0.25]);
  assert.equal(q16.derived.allowTriplets, false);

  const q8t = resolveAnalysisOptions({ quantizeGrid: '1/8t' });
  assert.deepEqual(q8t.derived.gridDivisions, [1 / 3]);
  assert.equal(q8t.derived.allowTriplets, true);

  const q16t = resolveAnalysisOptions({ quantizeGrid: '1/16t' });
  assert.deepEqual(q16t.derived.gridDivisions, [1 / 6]);
  assert.equal(q16t.derived.allowTriplets, true);

  const auto = resolveAnalysisOptions({ quantizeGrid: 'auto' });
  assert.deepEqual(auto.derived.gridDivisions, [1, 0.5, 0.25, 1 / 3, 1 / 6]);
  assert.equal(auto.derived.allowTriplets, true);

  const q4 = resolveAnalysisOptions({ quantizeGrid: '1/4' });
  assert.deepEqual(q4.derived.gridDivisions, [1]);
  const q8 = resolveAnalysisOptions({ quantizeGrid: '1/8' });
  assert.deepEqual(q8.derived.gridDivisions, [0.5]);
  const q32 = resolveAnalysisOptions({ quantizeGrid: '1/32' });
  assert.deepEqual(q32.derived.gridDivisions, [0.125]);
}

// ── Time resolution hop sizes ───────────────────────────────────
{
  const high = resolveAnalysisOptions({ timeResolution: 'high' });
  assert.equal(high.derived.windowSize, 2048);
  assert.equal(high.derived.hopSize, 256);
  assert.equal(high.derived.hopSec, 256 / 44100);

  const std = resolveAnalysisOptions({ timeResolution: 'standard' });
  assert.equal(std.derived.hopSize, 512);
}

// ── Tempo mode clears manual BPM ────────────────────────────────
{
  const auto = normalizeAnalysisOptions({ tempoMode: 'auto', bpm: 140 });
  assert.equal(auto.bpm, null);

  const manual = normalizeAnalysisOptions({ tempoMode: 'manual', bpm: 140 });
  assert.equal(manual.bpm, 140);

  const resolved = resolveAnalysisOptions({ tempoMode: 'manual', bpm: 96 });
  assert.equal(resolved.derived.bpm, 96);
  const resolvedAuto = resolveAnalysisOptions({ tempoMode: 'auto', bpm: 96 });
  assert.equal(resolvedAuto.derived.bpm, null);
}

// ── Serialize / deserialize round-trip ──────────────────────────
{
  const opts = normalizeAnalysisOptions({
    preset: 'custom',
    sensitivity: 0.62,
    quantizeGrid: '1/8',
    tempoMode: 'manual',
    bpm: 132,
    splitRepeats: false,
  });
  const round = deserializeAnalysisOptions(JSON.stringify(serializeAnalysisOptions(opts)));
  assert.ok(deepEqual(round, normalizeAnalysisOptions(opts)));

  const nullish = deserializeAnalysisOptions(null);
  assert.ok(isDefaultAnalysisOptions(nullish));
  assert.ok(isDefaultAnalysisOptions(deserializeAnalysisOptions(undefined)));
  assert.ok(isDefaultAnalysisOptions(deserializeAnalysisOptions('not json')));
  assert.ok(isDefaultAnalysisOptions(deserializeAnalysisOptions(42)));
  assert.ok(isDefaultAnalysisOptions(deserializeAnalysisOptions([])));
}

// ── describeAnalysisOptions ─────────────────────────────────────
{
  const def = describeAnalysisOptions(DEFAULT_ANALYSIS_OPTIONS);
  assert.ok(def.length > 0);
  assert.match(def, /Balanced/);
  assert.match(def, /70 ms/);

  const custom = describeAnalysisOptions({
    preset: 'strict',
    minNoteMs: 110,
    quantizeGrid: '1/32',
    tempoMode: 'manual',
    bpm: 88,
  });
  assert.ok(custom.length > 0);
  assert.match(custom, /Strict/);
  assert.match(custom, /88 BPM/);
}

// ── isDefaultAnalysisOptions & diffFromPreset ───────────────────
{
  assert.ok(isDefaultAnalysisOptions(DEFAULT_ANALYSIS_OPTIONS));
  assert.ok(!isDefaultAnalysisOptions({ sensitivity: 0.6 }));

  const diffs = diffFromPreset(normalizeAnalysisOptions({ preset: 'sensitive' }));
  assert.ok(diffs.length === 0);

  const customDiffs = diffFromPreset(normalizeAnalysisOptions({
    preset: 'sensitive',
    minNoteMs: 99,
  }));
  assert.deepEqual(customDiffs, ['minNoteMs']);
}

console.log('analysis-options: all tests passed');
