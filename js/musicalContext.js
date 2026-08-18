import { getSetting, saveSettings } from './persistence.js';
import { ROOTS, pick } from './theory.js';
import { SCALES, orderedScaleNames } from './scales.js';
import { TUNING_CATALOG } from './tunings.js';
import { MAX_MASTER_VOLUME, DEFAULT_MASTER_VOLUME } from './audio.js';

const DEFAULTS = {
  root: 'C',
  scale: 'Major (Ionian)',
  tempo: 120,
  tuning: 'Standard E',
  meter: '4/4',
  rootMode: 'fixed',
  scaleMode: 'fixed',
};
const TEMPO_MIN = 30;
const TEMPO_MAX = 300;

const NAV_ORIGINS = new Set(['tools', 'library', 'workbook', 'routine', 'search', 'recent', 'direct']);

const TUNING_NAMES = (() => {
  const names = new Set([DEFAULTS.tuning]);
  for (const preset of TUNING_CATALOG) {
    names.add(preset.name);
    for (const key of preset.legacyKeys || []) {
      if (key) names.add(key);
    }
  }
  return [...names];
})();

export const ITERATION_MODES = ['fixed', 'linear', 'random'];
const MODE_LABELS = { fixed: 'Fixed', linear: 'Linear', random: 'Random' };

const SCALE_ORDER = orderedScaleNames();

const listeners = new Set();
const scopes = new Map();
let nextScopeId = 1;

const ctx = {
  root: getSetting('context.root', DEFAULTS.root, ROOTS),
  scale: getSetting('context.scale', DEFAULTS.scale, Object.keys(SCALES)),
  tempo: clampTempo(Number(getSetting('context.tempo', DEFAULTS.tempo))),
  tuning: getSetting('context.tuning', DEFAULTS.tuning, TUNING_NAMES),
  meter: getSetting('context.meter', DEFAULTS.meter),
  rootMode: getSetting('context.rootMode', DEFAULTS.rootMode, ITERATION_MODES),
  scaleMode: getSetting('context.scaleMode', DEFAULTS.scaleMode, ITERATION_MODES),
};

function clampTempo(value) {
  if (!Number.isFinite(value)) return DEFAULTS.tempo;
  return Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, Math.round(value)));
}

function clampVolume(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return DEFAULT_MASTER_VOLUME;
  return Math.max(0, Math.min(MAX_MASTER_VOLUME, num));
}

function readVolume() {
  return clampVolume(getSetting('global.volume', DEFAULT_MASTER_VOLUME));
}

function fieldDefault(field) {
  if (field === 'root') return DEFAULTS.root;
  if (field === 'scale') return DEFAULTS.scale;
  if (field === 'tempo') return DEFAULTS.tempo;
  if (field === 'tuning') return DEFAULTS.tuning;
  if (field === 'meter') return DEFAULTS.meter;
  if (field === 'rootMode') return DEFAULTS.rootMode;
  if (field === 'scaleMode') return DEFAULTS.scaleMode;
  return null;
}

function buildKey(root, scale) {
  return `${root} ${scale}`;
}

function defaultsSnapshot() {
  return {
    root: ctx.root,
    scale: ctx.scale,
    tempo: ctx.tempo,
    tuning: ctx.tuning,
    meter: ctx.meter,
    rootMode: ctx.rootMode,
    scaleMode: ctx.scaleMode,
  };
}

function mergeScopeLayers(scope) {
  const merged = {
    ...defaultsSnapshot(),
    ...scope.originContext,
    ...scope.local,
  };
  merged.volume = readVolume();
  merged.key = buildKey(merged.root, merged.scale);
  merged.fallbacks = {};
  return merged;
}

function notifyScope(scope) {
  const effective = getEffective(scope.id);
  scope.listeners.forEach((fn) => {
    try {
      fn(effective);
    } catch (e) {
      // Keep one bad subscriber from breaking the rest of the chain.
    }
  });
}

function nextInList(list, current) {
  const idx = list.indexOf(current);
  if (idx < 0) return list[0];
  return list[(idx + 1) % list.length];
}

function advanceValue(current, list, mode) {
  if (mode === 'linear') return nextInList(list, current);
  if (mode === 'random') {
    if (list.length <= 1) return current;
    let next = current;
    let guard = 0;
    while (next === current && guard++ < 50) next = pick(list);
    return next;
  }
  return current;
}

export function openScope({ toolId, origin, originContext } = {}) {
  const scopeId = `scope-${nextScopeId++}`;
  const safeOrigin = NAV_ORIGINS.has(origin) ? origin : 'direct';
  scopes.set(scopeId, {
    id: scopeId,
    toolId: toolId || null,
    origin: safeOrigin,
    originContext: originContext && typeof originContext === 'object' ? { ...originContext } : {},
    local: {},
    listeners: new Set(),
  });
  return scopeId;
}

export function getEffective(scopeId, capabilities) {
  const scope = scopes.get(scopeId);
  if (!scope) {
    const merged = {
      ...defaultsSnapshot(),
      volume: readVolume(),
      key: buildKey(ctx.root, ctx.scale),
      fallbacks: {},
    };
    return merged;
  }

  const merged = mergeScopeLayers(scope);
  if (capabilities && typeof capabilities === 'object') {
    for (const [field, capability] of Object.entries(capabilities)) {
      if (!capability) continue;
      const resolved = resolveValue(field, merged[field], capability);
      if (resolved.fallbackFrom != null) {
        merged.fallbacks[field] = resolved;
        merged[field] = resolved.value;
        if (field === 'root' || field === 'scale') {
          merged.key = buildKey(merged.root, merged.scale);
        }
      }
    }
  }
  return merged;
}

export function setLocal(scopeId, partial) {
  const scope = scopes.get(scopeId);
  if (!scope || !partial || typeof partial !== 'object') return false;
  Object.assign(scope.local, partial);
  notifyScope(scope);
  return true;
}

export function setAsDefault(scopeId, fields) {
  const scope = scopes.get(scopeId);
  if (!scope || !Array.isArray(fields) || !fields.length) return false;

  const effective = mergeScopeLayers(scope);
  let changed = false;

  for (const field of fields) {
    if (field === 'root' && ROOTS.includes(effective.root) && effective.root !== ctx.root) {
      ctx.root = effective.root;
      changed = true;
    } else if (field === 'scale' && SCALES[effective.scale] && effective.scale !== ctx.scale) {
      ctx.scale = effective.scale;
      changed = true;
    } else if (field === 'tempo') {
      const next = clampTempo(Number(effective.tempo));
      if (next !== ctx.tempo) {
        ctx.tempo = next;
        changed = true;
      }
    } else if (field === 'tuning' && TUNING_NAMES.includes(effective.tuning) && effective.tuning !== ctx.tuning) {
      ctx.tuning = effective.tuning;
      changed = true;
    } else if (field === 'meter' && effective.meter && effective.meter !== ctx.meter) {
      ctx.meter = effective.meter;
      changed = true;
    } else if (field === 'rootMode' && ITERATION_MODES.includes(effective.rootMode) && effective.rootMode !== ctx.rootMode) {
      ctx.rootMode = effective.rootMode;
      changed = true;
    } else if (field === 'scaleMode' && ITERATION_MODES.includes(effective.scaleMode) && effective.scaleMode !== ctx.scaleMode) {
      ctx.scaleMode = effective.scaleMode;
      changed = true;
    }
  }

  if (!changed) return false;

  persistContext();
  notify('setAsDefault');
  notifyScope(scope);
  return true;
}

export function closeScope(scopeId) {
  const scope = scopes.get(scopeId);
  if (!scope) return false;
  scope.local = {};
  notifyScope(scope);
  return true;
}

export function resolveValue(field, value, capability = {}) {
  const { allowed, compatible } = capability;
  let ok = true;

  if (Array.isArray(allowed) && allowed.length) {
    ok = allowed.includes(value);
  }
  if (ok && typeof compatible === 'function') {
    ok = compatible(value);
  }
  if (ok) {
    return { value, fallbackFrom: null, reason: null };
  }

  let fallback = fieldDefault(field);
  if (Array.isArray(allowed) && allowed.length) {
    fallback = allowed[0];
  }

  return {
    value: fallback,
    fallbackFrom: value,
    reason: `incompatible-${field}`,
  };
}

export function subscribeScope(scopeId, fn) {
  const scope = scopes.get(scopeId);
  if (!scope) return () => {};
  scope.listeners.add(fn);
  return () => scope.listeners.delete(fn);
}

export function getContext() {
  return { ...ctx };
}

export function getIterationModeLabel(mode) {
  return MODE_LABELS[mode] || mode;
}

export function subscribeContext(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(source) {
  listeners.forEach((fn) => {
    try {
      fn(getContext(), source);
    } catch (e) {
      // Keep one bad subscriber from breaking the rest of the chain.
    }
  });
}

function persistContext() {
  saveSettings({
    'context.root': ctx.root,
    'context.scale': ctx.scale,
    'context.tempo': ctx.tempo,
    'context.tuning': ctx.tuning,
    'context.meter': ctx.meter,
    'context.rootMode': ctx.rootMode,
    'context.scaleMode': ctx.scaleMode,
  });
}

export function setContext(partial, source) {
  let changed = false;

  if (partial.root && ROOTS.includes(partial.root) && partial.root !== ctx.root) {
    ctx.root = partial.root;
    changed = true;
  }
  if (partial.scale && SCALES[partial.scale] && partial.scale !== ctx.scale) {
    ctx.scale = partial.scale;
    changed = true;
  }
  if (partial.tempo != null) {
    const next = clampTempo(Number(partial.tempo));
    if (next !== ctx.tempo) {
      ctx.tempo = next;
      changed = true;
    }
  }
  if (partial.tuning && TUNING_NAMES.includes(partial.tuning) && partial.tuning !== ctx.tuning) {
    ctx.tuning = partial.tuning;
    changed = true;
  }
  if (partial.meter && partial.meter !== ctx.meter) {
    ctx.meter = partial.meter;
    changed = true;
  }
  if (partial.rootMode && ITERATION_MODES.includes(partial.rootMode) && partial.rootMode !== ctx.rootMode) {
    ctx.rootMode = partial.rootMode;
    changed = true;
  }
  if (partial.scaleMode && ITERATION_MODES.includes(partial.scaleMode) && partial.scaleMode !== ctx.scaleMode) {
    ctx.scaleMode = partial.scaleMode;
    changed = true;
  }

  if (!changed) return false;

  persistContext();
  notify(source);
  return true;
}

export function advanceContext() {
  const nextRoot = advanceValue(ctx.root, ROOTS, ctx.rootMode);
  const nextScale = advanceValue(ctx.scale, SCALE_ORDER, ctx.scaleMode);

  if (nextRoot === ctx.root && nextScale === ctx.scale) return false;

  ctx.root = nextRoot;
  ctx.scale = nextScale;
  persistContext();
  notify('advance');
  return true;
}

export { TEMPO_MIN, TEMPO_MAX };
