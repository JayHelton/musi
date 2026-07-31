/**
 * Progress aggregation & recommended sessions for Interval Map.
 */

import { intervalLabel, describeInterval, MAP_RANGE_DEFS, LEVEL_DEFS } from './model.js';
import { revealUsage, REVEAL_LEVELS } from './reveal.js';

export const HISTORY_KEY = 'io.sessionHistory';
export const MASTERY_KEY = 'io.mastery';
export const MASTERY_V2_KEY = 'io.masteryV2';

/** Expanded mastery key capturing physical relationship dimensions. */
export function masteryKeyV2(meta) {
  return [
    meta.exerciseType || meta.drillType || 'locate',
    meta.inputMethod || 'click',
    meta.tuningFamily || meta.tuning || 'Standard',
    meta.mapRange ?? meta.orbitSize ?? 1,
    meta.intervalClass ?? meta.interval ?? 0,
    `rs${meta.rootString ?? 0}`,
    `ds${meta.deltaString ?? 0}`,
    `df${meta.deltaFret ?? 0}`,
    meta.direction || 'same',
    meta.sameString ? 'same' : 'cross',
    meta.boundaryType || (meta.crossesBoundary ? 'boundary' : 'standard'),
    meta.fretRegion || 'mid',
    meta.registerMode || 'n/a',
    meta.revealUsage || REVEAL_LEVELS.none,
  ].join('|');
}

/** Legacy mastery key (io.mastery) — keep writing for compatibility. */
export function masteryKeyLegacy(meta) {
  return [
    meta.exerciseType || meta.drillType || 'find',
    meta.tuning || 'Standard',
    meta.mapRange ?? meta.orbitSize ?? 1,
    meta.intervalClass ?? meta.interval ?? 0,
    `rs${meta.rootString ?? 0}`,
    `ts${meta.targetString ?? 0}`,
    meta.direction || meta.fretDir || 'same',
    `sd${Math.abs(meta.deltaString ?? meta.stringDist ?? 0)}`,
    meta.crossesBoundary ? 'xb' : 'nx',
  ].join('|');
}

export function fretRegion(fret) {
  if (fret <= 3) return 'nut';
  if (fret <= 7) return 'low';
  if (fret <= 12) return 'mid';
  return 'upper';
}

export function tuningFamily(tuningName = '') {
  const n = String(tuningName);
  if (/^Bass/.test(n)) return 'bass';
  if (/^8-String/.test(n)) return 'eight';
  if (/^7-String/.test(n)) return 'seven';
  if (/^Drop|^Double Drop/.test(n)) return 'drop';
  if (/Open|DADGAD|FACGCE|CGCGCE/.test(n)) return 'alternate';
  return 'standard';
}

export function boundaryTypeFromMeta(meta) {
  if (meta.boundaryType) return meta.boundaryType;
  if (!meta.crossesBoundary) return 'standard';
  const types = meta.boundaryTypes || [];
  if (types.some((t) => t.type === 'drop')) return 'drop';
  if (types.some((t) => t.type === 'major-third')) return 'major-third';
  if (types.length) return types[0].type;
  return 'boundary';
}

export function recordMasteryEntry(store, meta, { correct, ms, selfGrade = null, unaided = true }) {
  const key = masteryKeyV2({
    ...meta,
    tuningFamily: tuningFamily(meta.tuningName || meta.tuning),
    boundaryType: boundaryTypeFromMeta(meta),
    fretRegion: fretRegion(meta.rootFret ?? 0),
  });
  const row = store[key] || {
    attempts: 0,
    correct: 0,
    totalMs: 0,
    revealedAttempts: 0,
    selfKnew: 0,
    selfAlmost: 0,
    selfNeed: 0,
    unaidedAttempts: 0,
    unaidedCorrect: 0,
  };
  row.attempts += 1;
  if (correct) row.correct += 1;
  row.totalMs += ms || 0;
  if (!unaided) row.revealedAttempts += 1;
  if (unaided) {
    row.unaidedAttempts += 1;
    if (correct) row.unaidedCorrect += 1;
  }
  if (selfGrade === 'knew') row.selfKnew += 1;
  if (selfGrade === 'almost') row.selfAlmost += 1;
  if (selfGrade === 'need-practice') row.selfNeed += 1;
  store[key] = row;
  return key;
}

export function parseMasteryKey(key) {
  const p = key.split('|');
  if (p.length < 14) return null;
  return {
    exerciseType: p[0],
    inputMethod: p[1],
    tuningFamily: p[2],
    mapRange: Number(p[3]),
    intervalClass: Number(p[4]),
    rootString: Number(p[5].slice(2)),
    deltaString: Number(p[6].slice(2)),
    deltaFret: Number(p[7].slice(2)),
    direction: p[8],
    sameString: p[9] === 'same',
    boundaryType: p[10],
    fretRegion: p[11],
    registerMode: p[12],
    revealUsage: p[13],
  };
}

function acc(row) {
  const attempts = row.unaidedAttempts || row.attempts || 0;
  const correct = row.unaidedAttempts ? (row.unaidedCorrect || 0) : (row.correct || 0);
  return attempts ? correct / attempts : null;
}

export function aggregateIntervalMastery(store) {
  const by = {};
  for (const [key, row] of Object.entries(store || {})) {
    const meta = parseMasteryKey(key);
    if (!meta) continue;
    const ic = meta.intervalClass;
    by[ic] = by[ic] || { intervalClass: ic, attempts: 0, correct: 0 };
    by[ic].attempts += row.unaidedAttempts || row.attempts || 0;
    by[ic].correct += row.unaidedAttempts ? (row.unaidedCorrect || 0) : (row.correct || 0);
  }
  return Object.values(by)
    .map((r) => ({
      ...r,
      label: describeInterval(r.intervalClass).name,
      accuracy: r.attempts ? r.correct / r.attempts : null,
    }))
    .sort((a, b) => (a.accuracy ?? 1) - (b.accuracy ?? 1));
}

export function aggregateShapeMastery(store) {
  const groups = {
    'Same string': { attempts: 0, correct: 0 },
    'Adjacent string': { attempts: 0, correct: 0 },
    'Two strings away': { attempts: 0, correct: 0 },
    'Across B-string boundary': { attempts: 0, correct: 0 },
    'Across drop boundary': { attempts: 0, correct: 0 },
    'Lowest-string shapes': { attempts: 0, correct: 0 },
    'Root and octave shapes': { attempts: 0, correct: 0 },
  };
  for (const [key, row] of Object.entries(store || {})) {
    const meta = parseMasteryKey(key);
    if (!meta) continue;
    const attempts = row.unaidedAttempts || row.attempts || 0;
    const correct = row.unaidedAttempts ? (row.unaidedCorrect || 0) : (row.correct || 0);
    const absDs = Math.abs(meta.deltaString);
    if (meta.sameString || absDs === 0) {
      groups['Same string'].attempts += attempts;
      groups['Same string'].correct += correct;
    } else if (absDs === 1) {
      groups['Adjacent string'].attempts += attempts;
      groups['Adjacent string'].correct += correct;
    } else if (absDs === 2) {
      groups['Two strings away'].attempts += attempts;
      groups['Two strings away'].correct += correct;
    }
    if (meta.boundaryType === 'major-third') {
      groups['Across B-string boundary'].attempts += attempts;
      groups['Across B-string boundary'].correct += correct;
    }
    if (meta.boundaryType === 'drop') {
      groups['Across drop boundary'].attempts += attempts;
      groups['Across drop boundary'].correct += correct;
    }
    if (meta.rootString === 0) {
      groups['Lowest-string shapes'].attempts += attempts;
      groups['Lowest-string shapes'].correct += correct;
    }
    if (meta.intervalClass === 0) {
      groups['Root and octave shapes'].attempts += attempts;
      groups['Root and octave shapes'].correct += correct;
    }
  }
  return Object.entries(groups).map(([label, r]) => ({
    label,
    ...r,
    accuracy: r.attempts ? r.correct / r.attempts : null,
  }));
}

export function aggregateAnswerMethodMastery(store) {
  const labels = {
    click: 'Fretboard clicking',
    interval: 'Interval naming',
    note: 'Note naming',
    self: 'Self-check',
    audio: 'Playing',
    'audio-sequence': 'Played sequences',
    choice: 'Choice answers',
  };
  const by = {};
  for (const [key, row] of Object.entries(store || {})) {
    const meta = parseMasteryKey(key);
    if (!meta) continue;
    const id = meta.inputMethod || 'click';
    by[id] = by[id] || { id, label: labels[id] || id, attempts: 0, correct: 0 };
    by[id].attempts += row.unaidedAttempts || row.attempts || 0;
    by[id].correct += row.unaidedAttempts ? (row.unaidedCorrect || 0) : (row.correct || 0);
  }
  return Object.values(by).map((r) => ({
    ...r,
    accuracy: r.attempts ? r.correct / r.attempts : null,
  }));
}

export function aggregateTuningMastery(store) {
  const labels = {
    standard: 'Standard-family',
    drop: 'Drop tunings',
    seven: 'Seven-string',
    alternate: 'Alternate / open',
    eight: 'Eight-string',
    custom: 'Custom',
    bass: 'Bass',
  };
  const by = {};
  for (const [key, row] of Object.entries(store || {})) {
    const meta = parseMasteryKey(key);
    if (!meta) continue;
    const id = meta.tuningFamily || 'standard';
    by[id] = by[id] || { id, label: labels[id] || id, attempts: 0, correct: 0 };
    by[id].attempts += row.unaidedAttempts || row.attempts || 0;
    by[id].correct += row.unaidedAttempts ? (row.unaidedCorrect || 0) : (row.correct || 0);
  }
  return Object.values(by).map((r) => ({
    ...r,
    accuracy: r.attempts ? r.correct / r.attempts : null,
  }));
}

export function summarizeWeaknesses(store, limit = 5) {
  return Object.entries(store || {})
    .map(([key, row]) => {
      const meta = parseMasteryKey(key);
      const attempts = row.unaidedAttempts || row.attempts || 0;
      const correct = row.unaidedAttempts ? (row.unaidedCorrect || 0) : (row.correct || 0);
      const accuracy = attempts ? correct / attempts : 1;
      return { key, meta, attempts, correct, accuracy, label: describeMasteryV2(key) };
    })
    .filter((r) => r.attempts >= 2 && r.accuracy < 0.75)
    .sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts)
    .slice(0, limit);
}

export function describeMasteryV2(key) {
  const meta = parseMasteryKey(key);
  if (!meta) return key;
  const intLab = describeInterval(meta.intervalClass).name;
  const shape = meta.sameString
    ? 'same string'
    : Math.abs(meta.deltaString) === 1
      ? 'adjacent string'
      : `${Math.abs(meta.deltaString)} strings away`;
  const bound =
    meta.boundaryType === 'drop' ? 'drop boundary'
      : meta.boundaryType === 'major-third' ? 'B-string boundary'
        : meta.boundaryType === 'standard' ? 'standard zone'
          : meta.boundaryType;
  return `${intLab} · ${shape} · ${bound}`;
}

export function buildRecommendedSession(store, settings = {}) {
  const weak = summarizeWeaknesses(store, 8);
  const intervalRows = aggregateIntervalMastery(store);
  const shapeRows = aggregateShapeMastery(store);
  const tuningRows = aggregateTuningMastery(store);

  const weakInterval = intervalRows.find((r) => r.attempts >= 2 && (r.accuracy ?? 1) < 0.8);
  const weakShape = shapeRows.find((r) => r.attempts >= 2 && (r.accuracy ?? 1) < 0.8);
  const weakTuning = tuningRows.find((r) => r.attempts >= 2 && (r.accuracy ?? 1) < 0.8);

  let tuningName = settings.tuningName || 'Drop C';
  if (weakTuning?.id === 'drop') tuningName = settings.tuningName?.includes('Drop') ? settings.tuningName : 'Drop C';
  if (weakTuning?.id === 'seven') tuningName = '7-String Drop A';
  if (weakTuning?.id === 'standard') tuningName = 'Standard';

  const intervalClass = weakInterval?.intervalClass
    ?? weak[0]?.meta?.intervalClass
    ?? 3;

  const focus = weakShape?.label?.includes('drop')
    ? 'lowest-string'
    : weakShape?.label?.includes('B-string')
      ? 'b-boundary'
      : 'mixed';

  const inputMethod = (() => {
    const methods = aggregateAnswerMethodMastery(store);
    const audio = methods.find((m) => m.id === 'audio');
    if (!audio || (audio.attempts < 3)) return 'audio';
    if ((audio.accuracy ?? 1) < 0.7) return 'audio';
    return 'click';
  })();

  const level = settings.level || 2;
  const minutes = 3;

  const info = describeInterval(intervalClass);
  const summary = [
    `Recommended: ${minutes} minutes`,
    tuningName,
    focus === 'lowest-string' ? 'Lowest-string roots' : focus === 'b-boundary' ? 'B-string boundary shapes' : 'Mixed root strings',
    info.name.includes('3rd') ? 'Minor and major 3rds' : info.name,
    inputMethod === 'audio' ? 'Play-to-answer' : 'Click answer',
  ];

  return {
    minutes,
    tuningName,
    level,
    mapRange: settings.mapRange || 1,
    intervalClass,
    intervalFocus: intervalClass,
    exerciseType: inputMethod === 'audio' ? 'play-interval' : 'locate',
    inputMethod,
    dropZone: focus === 'lowest-string' ? 'lowest' : null,
    subview: inputMethod === 'audio' ? 'play' : 'quiz',
    summaryLines: summary,
    summaryText: summary.join('\n'),
    label: summary.join(' · '),
  };
}

export function migrateLegacyMastery(legacy) {
  // Read-only merge helper: expose legacy weaknesses without rewriting keys.
  const out = [];
  for (const [key, row] of Object.entries(legacy || {})) {
    const parts = key.split('|');
    if (parts.length < 9) continue;
    const interval = Number(parts[3]);
    out.push({
      key,
      label: `${intervalLabel(interval)} (legacy) · ${parts[1]}`,
      attempts: row.attempts || 0,
      correct: row.correct || 0,
      accuracy: row.attempts ? row.correct / row.attempts : null,
    });
  }
  return out.filter((r) => r.attempts >= 2 && (r.accuracy ?? 1) < 0.75)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 5);
}

export { revealUsage, MAP_RANGE_DEFS, LEVEL_DEFS };
