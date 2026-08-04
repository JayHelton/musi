// Concept-level practice history for study recommendations.
// Tracks last review / completion per concept and recent study ids
// so the scorer can apply review urgency and variety penalties.

import { getSetting, saveSetting } from './persistence.js';
import { getStatsSnapshot } from './stats.js';

const PROGRESS_KEY = 'study.progress';
const DAY_MS = 86400000;

const DEFAULT_PROGRESS = () => ({
  version: 1,
  concepts: {}, // conceptId -> { lastReviewedAt, completions, misses, hintHeavy }
  recentStudies: [], // { id, at } newest first, capped
  lastPrimaryId: null,
  lastPrimaryAt: 0,
});

function normalize(raw) {
  const base = DEFAULT_PROGRESS();
  if (!raw || typeof raw !== 'object') return base;
  const concepts = (raw.concepts && typeof raw.concepts === 'object') ? raw.concepts : {};
  const recentStudies = Array.isArray(raw.recentStudies) ? raw.recentStudies.slice(0, 20) : [];
  return {
    version: 1,
    concepts,
    recentStudies,
    lastPrimaryId: raw.lastPrimaryId || null,
    lastPrimaryAt: typeof raw.lastPrimaryAt === 'number' ? raw.lastPrimaryAt : 0,
  };
}

export function getStudyProgress() {
  return normalize(getSetting(PROGRESS_KEY, null));
}

function saveProgress(progress) {
  saveSetting(PROGRESS_KEY, normalize(progress));
  return getStudyProgress();
}

function touchConcept(concepts, conceptId, patch) {
  const row = concepts[conceptId] || {
    lastReviewedAt: 0,
    completions: 0,
    misses: 0,
    hintHeavy: 0,
  };
  concepts[conceptId] = { ...row, ...patch };
}

/** Record that a recommended study was started. */
export function recordStudyStarted(study) {
  if (!study) return getStudyProgress();
  const progress = getStudyProgress();
  const now = Date.now();
  const concepts = { ...progress.concepts };
  (study.concepts || []).forEach(c => {
    touchConcept(concepts, c, { lastReviewedAt: now });
  });
  const recentStudies = [
    { id: study.id, at: now },
    ...progress.recentStudies.filter(r => r.id !== study.id),
  ].slice(0, 20);
  return saveProgress({
    ...progress,
    concepts,
    recentStudies,
    lastPrimaryId: study.id,
    lastPrimaryAt: now,
  });
}

/** Record a completed study (user marks done or finishes linked drill streak). */
export function recordStudyCompleted(study) {
  if (!study) return getStudyProgress();
  const progress = getStudyProgress();
  const now = Date.now();
  const concepts = { ...progress.concepts };
  (study.concepts || []).forEach(c => {
    const row = concepts[c] || {
      lastReviewedAt: 0, completions: 0, misses: 0, hintHeavy: 0,
    };
    touchConcept(concepts, c, {
      lastReviewedAt: now,
      completions: (row.completions || 0) + 1,
    });
  });
  return saveProgress({ ...progress, concepts });
}

/** Soft signal from drills: map skill attempts into concept weakness. */
export function recordConceptSignal(conceptIds, { correct = true, hintHeavy = false } = {}) {
  if (!Array.isArray(conceptIds) || !conceptIds.length) return getStudyProgress();
  const progress = getStudyProgress();
  const concepts = { ...progress.concepts };
  const now = Date.now();
  conceptIds.forEach(c => {
    const row = concepts[c] || {
      lastReviewedAt: 0, completions: 0, misses: 0, hintHeavy: 0,
    };
    touchConcept(concepts, c, {
      lastReviewedAt: now,
      misses: correct ? row.misses : (row.misses || 0) + 1,
      hintHeavy: hintHeavy ? (row.hintHeavy || 0) + 1 : row.hintHeavy,
      completions: correct ? (row.completions || 0) + 1 : row.completions,
    });
  });
  return saveProgress({ ...progress, concepts });
}

export function daysSinceReview(conceptId, progress = getStudyProgress()) {
  const row = progress.concepts[conceptId];
  if (!row || !row.lastReviewedAt) return Infinity;
  return (Date.now() - row.lastReviewedAt) / DAY_MS;
}

export function conceptWeakness(conceptId, progress = getStudyProgress()) {
  const row = progress.concepts[conceptId];
  if (!row) return 0;
  const attempts = (row.completions || 0) + (row.misses || 0);
  if (attempts < 2) return row.hintHeavy ? Math.min(1, row.hintHeavy * 0.25) : 0;
  const missRate = (row.misses || 0) / attempts;
  const hintBoost = Math.min(0.4, (row.hintHeavy || 0) * 0.1);
  return Math.min(1, missRate + hintBoost);
}

/** Days since a study id was last started. */
export function daysSinceStudy(studyId, progress = getStudyProgress()) {
  const hit = progress.recentStudies.find(r => r.id === studyId);
  if (!hit) return Infinity;
  return (Date.now() - hit.at) / DAY_MS;
}

/**
 * Infer coarse concept weakness from today's skill stats when concept
 * history is still thin.
 */
export function skillWeaknessHints() {
  const snap = getStatsSnapshot();
  const weakLabel = snap.weakest?.label;
  if (!weakLabel) return {};
  const map = {
    Scales: ['major_scale', 'natural_minor', 'harmonic_minor', 'modal_comparison'],
    Intervals: ['interval_locations', 'flat2', 'tritone', 'flat3'],
    Fretboard: ['fretboard_transfer', 'interval_locations', 'low_register_mapping'],
    'Interval Map': ['interval_locations', 'fretboard_transfer', 'wide_intervals'],
    Ear: ['root_blind_quality', 'interval_locations', 'major_minor_triads'],
  };
  const concepts = map[weakLabel] || [];
  const out = {};
  concepts.forEach(c => { out[c] = 0.65; });
  return out;
}

/** Known-concept set: concepts with enough successful completions. */
export function knownConcepts(progress = getStudyProgress(), minCompletions = 2) {
  const known = new Set();
  Object.entries(progress.concepts).forEach(([id, row]) => {
    if ((row.completions || 0) >= minCompletions) known.add(id);
  });
  // Bootstrap: if the user has practiced scales today with decent accuracy,
  // treat major_scale as known enough to unlock genre vocabulary.
  const snap = getStatsSnapshot();
  if (snap.accuracy != null && snap.accuracy >= 70 && snap.minutesToday > 0) {
    known.add('major_scale');
    known.add('interval_locations');
  }
  return known;
}
