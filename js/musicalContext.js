import { getSetting, saveSettings } from './persistence.js';
import { ROOTS } from './theory.js';
import { SCALES } from './scales.js';

// Shared musical context that ties the individual utilities together so that a
// player can pick a key, mode, and tempo once and have every compatible tool
// follow along. State is persisted client-side and broadcast to subscribers.

const DEFAULTS = { root: 'C', scale: 'Major (Ionian)', tempo: 120 };
const TEMPO_MIN = 30;
const TEMPO_MAX = 300;

const listeners = new Set();

const ctx = {
  root: getSetting('context.root', DEFAULTS.root, ROOTS),
  scale: getSetting('context.scale', DEFAULTS.scale, Object.keys(SCALES)),
  tempo: clampTempo(Number(getSetting('context.tempo', DEFAULTS.tempo))),
};

function clampTempo(value) {
  if (!Number.isFinite(value)) return DEFAULTS.tempo;
  return Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, Math.round(value)));
}

export function getContext() {
  return { ...ctx };
}

// Subscribe to context changes. Returns an unsubscribe function. The callback
// receives (context, source) where source identifies who triggered the change
// so a tool can ignore echoes of its own updates if needed.
export function subscribeContext(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
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

  if (!changed) return false;

  saveSettings({
    'context.root': ctx.root,
    'context.scale': ctx.scale,
    'context.tempo': ctx.tempo,
  });

  listeners.forEach(fn => {
    try {
      fn(getContext(), source);
    } catch (e) {
      // Keep one bad subscriber from breaking the rest of the chain.
    }
  });

  return true;
}

export { TEMPO_MIN, TEMPO_MAX };
