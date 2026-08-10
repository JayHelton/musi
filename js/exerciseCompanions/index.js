import { normalizeCompanion } from './types.js';
import { mountScaleRef } from './scaleRef.js';
import { mountTriadRef } from './triadRef.js';
import { mountSweepRef } from './sweepRef.js';
import { mountPitchTrain } from './pitchTrain.js';

export {
  COMPANION_TYPES,
  MAX_COMPANIONS,
  MAX_LABEL_LEN,
  MAX_FRET,
  DEFAULT_TUNING,
  defaultCompanion,
  normalizeCompanion,
  normalizeCompanions,
  describeCompanion,
} from './types.js';

const MOUNTERS = {
  'scale-ref': mountScaleRef,
  'triad-ref': mountTriadRef,
  'sweep-ref': mountSweepRef,
  'pitch-train': mountPitchTrain,
};

/**
 * Mount one companion widget into `host`.
 * @returns {{ destroy: () => void, refresh: () => void, stop: () => void }}
 */
export function mountCompanion(host, companion, options = {}) {
  const norm = normalizeCompanion(companion) || companion;
  const mount = MOUNTERS[norm.type];
  if (!mount || !host) {
    return { destroy() {}, refresh() {}, stop() {} };
  }
  return mount(host, norm, options);
}

/**
 * Mount a vertical stack of companions; invalid entries are skipped.
 */
export function mountCompanions(host, companions, options = {}) {
  if (!host) {
    return { destroy() {}, refresh() {}, stop() {} };
  }
  const stack = document.createElement('div');
  stack.className = 'ec-stack';
  host.appendChild(stack);
  const handles = (Array.isArray(companions) ? companions : [])
    .map((c) => normalizeCompanion(c))
    .filter(Boolean)
    .map((c) => mountCompanion(stack, c, options));

  return {
    refresh() { handles.forEach((h) => h.refresh()); },
    stop() { handles.forEach((h) => h.stop()); },
    destroy() {
      handles.forEach((h) => h.destroy());
      stack.remove();
    },
  };
}
