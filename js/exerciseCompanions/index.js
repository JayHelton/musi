import { normalizeCompanion } from './types.js';
import { mountScaleRef } from './scaleRef.js';
import { mountTriadRef } from './triadRef.js';
import { mountSweepRef } from './sweepRef.js';
import { mountPitchTrain } from './pitchTrain.js';
import { mountIntervalOrbit } from './intervalOrbit.js';
import { mountEarTrain } from './earTrain.js';
import { mountMetronome } from './metronome.js';

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

export {
  METRO_PROGRESSIONS,
  METRO_SUBDIVISIONS,
  METRO_SUBDIV_IDS,
  METRO_MAX_STEPS,
  METRO_MIN_BPM,
  METRO_MAX_BPM,
  METRO_MIN_STEP_SECONDS,
  METRO_MAX_STEP_SECONDS,
  METRO_MIN_BEATS,
  METRO_MAX_BEATS,
  METRO_MIN_STEP_BPM,
  METRO_MAX_STEP_BPM,
  METRO_MIN_ROUNDS,
  METRO_MAX_ROUNDS,
  describeMetronomePlan,
  formatMetroDuration,
  metroProgressionInfo,
  metroSubdivInfo,
  metronomePlanSteps,
  metronomePlanTotalSeconds,
  metronomeStepAt,
  normalizeMetroSteps,
} from './metronomePlan.js';

const MOUNTERS = {
  'scale-ref': mountScaleRef,
  'triad-ref': mountTriadRef,
  'sweep-ref': mountSweepRef,
  'pitch-train': mountPitchTrain,
  'interval-orbit': mountIntervalOrbit,
  'ear-train': mountEarTrain,
  metronome: mountMetronome,
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
    // `reason` tells a companion why it is being stopped. Pass 'pane-hidden'
    // when the tools pane goes off screen but the workbook stays open; a
    // companion that is safe to leave running (the metronome) can keep going.
    stop(reason) { handles.forEach((h) => h.stop(reason)); },
    destroy() {
      handles.forEach((h) => h.destroy());
      stack.remove();
    },
  };
}
