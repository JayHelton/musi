/**
 * Shared observable music context for instrument, tuning, key, scale, tempo, and
 * meter. Dense screens read one effective state instead of separate selectors.
 * Persisted defaults live here. js/musicalContext.js stores root, scale, and tempo.
 * Scoped overrides stack for routines and projects. Overrides do not change stored
 * defaults.
 *
 * root, scaleId, and tempoBpm are not duplicated. They read and write through
 * js/musicalContext.js. External setContext updates propagate here. setMusicContext
 * writes back with source musicContext. The subscription bridge ignores echoes and
 * avoids update loops.
 */

import { getSetting, saveSettings } from '../persistence.js';
import { getContext, setContext, subscribeContext } from '../musicalContext.js';
import { ROOTS } from '../theory.js';
import { SCALES } from '../scales.js';
import { TUNING_CATALOG } from '../tunings.js';

const SYNC_SOURCE = 'musicContext';

const INSTRUMENT_VALUES = ['guitar', 'bass', 'piano', 'voice', 'drums'];
const KEY_SIGNATURE_VALUES = ['sharps', 'flats'];
const METER_DENOMINATORS = [1, 2, 4, 8, 16, 32];
const TEMPO_MIN = 30;
const TEMPO_MAX = 300;
const SCALE_IDS = Object.keys(SCALES);
const VALID_TUNING_IDS = new Set(TUNING_CATALOG.map((preset) => preset.id));

const STANDARD_GUITAR_TUNING_ID = (
  TUNING_CATALOG.find((preset) => preset.id === '6-e-std')
  || TUNING_CATALOG.find((preset) => preset.category === 'standard' && preset.strings === 6)
  || TUNING_CATALOG[0]
).id;

const DEFAULT_METER = { numerator: 4, denominator: 4 };

export const MUSIC_CONTEXT_DEFAULTS = Object.freeze({
  instrument: 'guitar',
  tuningId: STANDARD_GUITAR_TUNING_ID,
  root: 'C',
  scaleId: 'Major (Ionian)',
  modeId: null,
  keySignaturePreference: 'sharps',
  tempoBpm: 120,
  meter: Object.freeze({ numerator: 4, denominator: 4 }),
});

const STATE_KEYS = [
  'instrument',
  'tuningId',
  'root',
  'scaleId',
  'modeId',
  'keySignaturePreference',
  'tempoBpm',
  'meter',
];

const listeners = new Set();
const overrideStack = [];

const defaults = {
  instrument: loadInstrument(),
  tuningId: loadTuningId(),
  modeId: loadModeId(),
  keySignaturePreference: loadKeySignaturePreference(),
  meter: loadMeter(),
};

let lastEffective = snapshotState(buildEffectiveState());

subscribeContext((_ctx, source) => {
  if (source === SYNC_SOURCE) return;
  const prev = lastEffective;
  const next = buildEffectiveState();
  if (statesEqual(prev, next)) return;
  lastEffective = snapshotState(next);
  notifySubscribers(next, { source, changed: diffChanged(prev, next) });
});

function loadInstrument() {
  const value = getSetting('context.instrument', MUSIC_CONTEXT_DEFAULTS.instrument);
  if (value === null) return null;
  return INSTRUMENT_VALUES.includes(value) ? value : MUSIC_CONTEXT_DEFAULTS.instrument;
}

function loadTuningId() {
  const value = getSetting('context.tuningId', MUSIC_CONTEXT_DEFAULTS.tuningId);
  if (value === null) return null;
  return VALID_TUNING_IDS.has(value) ? value : MUSIC_CONTEXT_DEFAULTS.tuningId;
}

function loadModeId() {
  const value = getSetting('context.mode', MUSIC_CONTEXT_DEFAULTS.modeId);
  if (value === null) return null;
  return typeof value === 'string' && value.length ? value : MUSIC_CONTEXT_DEFAULTS.modeId;
}

function loadKeySignaturePreference() {
  const value = getSetting('context.accidentals', MUSIC_CONTEXT_DEFAULTS.keySignaturePreference);
  return KEY_SIGNATURE_VALUES.includes(value)
    ? value
    : MUSIC_CONTEXT_DEFAULTS.keySignaturePreference;
}

function loadMeter() {
  const raw = getSetting('context.meter', DEFAULT_METER);
  return normalizeMeter(raw, DEFAULT_METER);
}

function clampTempo(value) {
  if (!Number.isFinite(Number(value))) return null;
  return Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, Math.round(Number(value))));
}

function normalizeMeter(raw, fallback) {
  if (!raw || typeof raw !== 'object') return { ...fallback };
  const numerator = Number(raw.numerator);
  const denominator = Number(raw.denominator);
  const next = { ...fallback };
  if (Number.isFinite(numerator)) {
    next.numerator = Math.max(1, Math.min(32, Math.round(numerator)));
  }
  if (METER_DENOMINATORS.includes(denominator)) {
    next.denominator = denominator;
  }
  return next;
}

function metersEqual(a, b) {
  return a.numerator === b.numerator && a.denominator === b.denominator;
}

function snapshotState(state) {
  return { ...state, meter: { ...state.meter } };
}

function getSyncedFields() {
  const ctx = getContext();
  return {
    root: ctx.root,
    scaleId: ctx.scale,
    tempoBpm: ctx.tempo,
  };
}

function buildDefaultsState() {
  return {
    ...defaults,
    ...getSyncedFields(),
    meter: { ...defaults.meter },
  };
}

function buildEffectiveState() {
  const state = buildDefaultsState();
  for (const entry of overrideStack) {
    applyPatchToState(state, entry.patch);
  }
  return state;
}

function statesEqual(a, b) {
  return diffChanged(a, b).length === 0;
}

function diffChanged(prev, next) {
  const changed = [];
  for (const key of STATE_KEYS) {
    if (key === 'meter') {
      if (!metersEqual(prev.meter, next.meter)) changed.push('meter');
      continue;
    }
    if (prev[key] !== next[key]) changed.push(key);
  }
  return changed;
}

function applyPatchToState(state, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'meter') {
      state.meter = { ...state.meter, ...value };
      continue;
    }
    state[key] = value;
  }
}

function extractPatch(patch, baseState) {
  const out = {};

  if ('instrument' in patch) {
    const value = patch.instrument;
    if ((value === null || INSTRUMENT_VALUES.includes(value)) && value !== baseState.instrument) {
      out.instrument = value;
    }
  }

  if ('tuningId' in patch) {
    const value = patch.tuningId;
    if ((value === null || VALID_TUNING_IDS.has(value)) && value !== baseState.tuningId) {
      out.tuningId = value;
    }
  }

  if ('root' in patch) {
    const value = patch.root;
    if (ROOTS.includes(value) && value !== baseState.root) {
      out.root = value;
    }
  }

  if ('scaleId' in patch) {
    const value = patch.scaleId;
    if (SCALES[value] && value !== baseState.scaleId) {
      out.scaleId = value;
    }
  }

  if ('modeId' in patch) {
    const value = patch.modeId;
    const valid = value === null || (typeof value === 'string' && value.length > 0);
    if (valid && value !== baseState.modeId) {
      out.modeId = value;
    }
  }

  if ('keySignaturePreference' in patch) {
    const value = patch.keySignaturePreference;
    if (KEY_SIGNATURE_VALUES.includes(value) && value !== baseState.keySignaturePreference) {
      out.keySignaturePreference = value;
    }
  }

  if ('tempoBpm' in patch) {
    const value = clampTempo(patch.tempoBpm);
    if (value != null && value !== baseState.tempoBpm) {
      out.tempoBpm = value;
    }
  }

  if ('meter' in patch && patch.meter && typeof patch.meter === 'object') {
    const next = { ...baseState.meter };
    if (patch.meter.numerator != null) {
      const numerator = Number(patch.meter.numerator);
      if (Number.isFinite(numerator)) {
        next.numerator = Math.max(1, Math.min(32, Math.round(numerator)));
      }
    }
    if (patch.meter.denominator != null) {
      const denominator = Number(patch.meter.denominator);
      if (METER_DENOMINATORS.includes(denominator)) {
        next.denominator = denominator;
      }
    }
    if (!metersEqual(next, baseState.meter)) {
      out.meter = next;
    }
  }

  return out;
}

function extractLocalPatch(patch, baseState) {
  const validated = extractPatch(patch, baseState);
  const local = {};
  for (const key of ['instrument', 'tuningId', 'modeId', 'keySignaturePreference', 'meter']) {
    if (key in validated) local[key] = validated[key];
  }
  return local;
}

function extractSyncedPatch(patch, baseState) {
  const validated = extractPatch(patch, baseState);
  const synced = {};
  for (const key of ['root', 'scaleId', 'tempoBpm']) {
    if (key in validated) synced[key] = validated[key];
  }
  return synced;
}

function persistDefaults() {
  saveSettings({
    'context.instrument': defaults.instrument,
    'context.tuningId': defaults.tuningId,
    'context.mode': defaults.modeId,
    'context.accidentals': defaults.keySignaturePreference,
    'context.meter': { ...defaults.meter },
  });
}

function applyLocalPatch(localPatch) {
  let changed = false;
  for (const [key, value] of Object.entries(localPatch)) {
    if (key === 'meter') {
      if (!metersEqual(defaults.meter, value)) {
        defaults.meter = { ...value };
        changed = true;
      }
      continue;
    }
    if (defaults[key] !== value) {
      defaults[key] = value;
      changed = true;
    }
  }
  return changed;
}

function notifySubscribers(state, meta) {
  if (!meta.changed.length) return;
  const payload = snapshotState(state);
  const snapshot = [...listeners];
  for (const fn of snapshot) {
    try {
      fn(payload, meta);
    } catch (_) {
      // Keep one bad subscriber from breaking the rest of the chain.
    }
  }
}

export function getMusicContext() {
  return snapshotState(buildEffectiveState());
}

export function getMusicContextDefaults() {
  return snapshotState(buildDefaultsState());
}

export function setMusicContext(patch, source = SYNC_SOURCE) {
  const prev = lastEffective;
  const defaultState = buildDefaultsState();
  const localPatch = extractLocalPatch(patch, defaultState);
  const syncedPatch = extractSyncedPatch(patch, defaultState);

  let changed = applyLocalPatch(localPatch);
  if (changed) persistDefaults();

  if (Object.keys(syncedPatch).length) {
    const ctxPatch = {};
    if ('root' in syncedPatch) ctxPatch.root = syncedPatch.root;
    if ('scaleId' in syncedPatch) ctxPatch.scale = syncedPatch.scaleId;
    if ('tempoBpm' in syncedPatch) ctxPatch.tempo = syncedPatch.tempoBpm;
    if (setContext(ctxPatch, SYNC_SOURCE)) changed = true;
  }

  const next = buildEffectiveState();
  if (!statesEqual(prev, next)) {
    lastEffective = snapshotState(next);
    const changedFields = diffChanged(prev, next);
    if (changedFields.length) {
      notifySubscribers(next, { source, changed: changedFields });
    }
    return true;
  }

  return false;
}

export function pushOverride(id, patch) {
  const key = String(id || '');
  if (!key) return false;

  const prev = lastEffective;
  const validated = extractPatch(patch, prev);
  if (!Object.keys(validated).length) return false;

  const idx = overrideStack.findIndex((entry) => entry.id === key);
  if (idx >= 0) {
    overrideStack[idx] = { id: key, patch: validated };
  } else {
    overrideStack.push({ id: key, patch: validated });
  }

  const next = buildEffectiveState();
  if (statesEqual(prev, next)) return false;

  lastEffective = snapshotState(next);
  notifySubscribers(next, { source: `override:${key}`, changed: diffChanged(prev, next) });
  return true;
}

export function popOverride(id) {
  const key = String(id || '');
  if (!key) return false;

  const idx = overrideStack.findIndex((entry) => entry.id === key);
  if (idx < 0) return false;

  const prev = lastEffective;
  overrideStack.splice(idx, 1);

  const next = buildEffectiveState();
  lastEffective = snapshotState(next);
  notifySubscribers(next, { source: `override-pop:${key}`, changed: diffChanged(prev, next) });
  return true;
}

export function resetOverrides() {
  if (!overrideStack.length) return false;

  const prev = lastEffective;
  overrideStack.length = 0;

  const next = buildEffectiveState();
  lastEffective = snapshotState(next);
  notifySubscribers(next, { source: 'override-reset', changed: diffChanged(prev, next) });
  return true;
}

export function subscribeMusicContext(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
