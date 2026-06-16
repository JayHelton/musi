import { getSetting, saveSettings } from './persistence.js';
import { ROOTS, pick } from './theory.js';
import { SCALES, orderedScaleNames } from './scales.js';

// Shared musical context that ties the individual utilities together so that a
// player can pick a key, mode, and tempo once and have every compatible tool
// follow along. State is persisted client-side and broadcast to subscribers.

const DEFAULTS = {
  root: 'C',
  scale: 'Major (Ionian)',
  tempo: 120,
  rootMode: 'fixed',
  scaleMode: 'fixed',
};
const TEMPO_MIN = 30;
const TEMPO_MAX = 300;

export const ITERATION_MODES = ['fixed', 'linear', 'random'];
const MODE_LABELS = { fixed: 'Fixed', linear: 'Linear', random: 'Random' };

const SCALE_ORDER = orderedScaleNames();

const listeners = new Set();

const ctx = {
  root: getSetting('context.root', DEFAULTS.root, ROOTS),
  scale: getSetting('context.scale', DEFAULTS.scale, Object.keys(SCALES)),
  tempo: clampTempo(Number(getSetting('context.tempo', DEFAULTS.tempo))),
  rootMode: getSetting('context.rootMode', DEFAULTS.rootMode, ITERATION_MODES),
  scaleMode: getSetting('context.scaleMode', DEFAULTS.scaleMode, ITERATION_MODES),
};

function clampTempo(value) {
  if (!Number.isFinite(value)) return DEFAULTS.tempo;
  return Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, Math.round(value)));
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

export function getContext() {
  return { ...ctx };
}

export function getIterationModeLabel(mode) {
  return MODE_LABELS[mode] || mode;
}

// Subscribe to context changes. Returns an unsubscribe function. The callback
// receives (context, source) where source identifies who triggered the change
// so a tool can ignore echoes of its own updates if needed.
export function subscribeContext(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(source) {
  listeners.forEach(fn => {
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

// Advance key and/or scale to the next iteration based on each dimension's
// mode. Called by drills when transitioning to the next question.
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
