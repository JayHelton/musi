import { parseNote } from '../theory.js';
import { SCALES, shortScaleName } from '../scales.js';
import { TRIAD_QUALITIES } from '../triadReference.js';
import { SWEEP_STRING_SETS, sweepQualities } from '../sweepPatterns.js';
import { TUNINGS, findPresetByName } from '../tunings.js';
import { MAP_RANGE_DEFS, LEVEL_DEFS } from '../interval-map/model.js';

export const MAX_COMPANIONS = 8;
export const MAX_LABEL_LEN = 80;
export const MAX_FRET = 24;
export const DEFAULT_TUNING = 'Standard';

const TYPE_IDS = new Set(['scale-ref', 'triad-ref', 'sweep-ref', 'pitch-train', 'interval-orbit']);

export const COMPANION_TYPES = [
  {
    id: 'scale-ref',
    label: 'Scale reference',
    description: 'Fretboard diagram for a locked root and scale.',
    needs: ['root', 'scale', 'tuning', 'fretRange'],
  },
  {
    id: 'triad-ref',
    label: 'Triad reference',
    description: 'Closed triad voicings on a chosen string set.',
    needs: ['root', 'quality', 'stringSet', 'tuning', 'fretRange'],
  },
  {
    id: 'sweep-ref',
    label: 'Sweep / arpeggio reference',
    description: 'Sweep-picking pattern with pick-stroke order.',
    needs: ['root', 'pattern', 'stringSet', 'inversion'],
  },
  {
    id: 'pitch-train',
    label: 'Pitch trainer',
    description: 'Sing-and-hold drill locked to a root and scale.',
    needs: ['root', 'scale'],
  },
  {
    id: 'interval-orbit',
    label: 'Interval orbit',
    description: 'Locked root-centered interval map and locate drill on the fretboard.',
    needs: ['root', 'tuning', 'fretRange', 'mapRange', 'level', 'mode'],
  },
];

const TYPE_BY_ID = Object.fromEntries(COMPANION_TYPES.map((t) => [t.id, t]));

function companionId() {
  return `cmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function isValidTuning(name) {
  if (!name || typeof name !== 'string') return false;
  if (TUNINGS[name]) return true;
  return !!findPresetByName(name);
}

function normalizeTuning(raw) {
  const name = typeof raw === 'string' ? raw.trim() : '';
  return isValidTuning(name) ? name : DEFAULT_TUNING;
}

function normalizeRoot(raw) {
  if (raw == null || raw === '') return null;
  const p = parseNote(String(raw));
  if (!p) return null;
  const acc = p.acc === '##' ? '##' : p.acc || '';
  return p.letter + acc;
}

function normalizeScale(raw) {
  const name = typeof raw === 'string' ? raw.trim() : '';
  return SCALES[name] ? name : 'Major (Ionian)';
}

function normalizeQuality(raw) {
  const id = typeof raw === 'string' ? raw.trim() : '';
  return TRIAD_QUALITIES.some((q) => q.id === id) ? id : 'major';
}

function normalizeStringSetTriad(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function normalizeSweepStringSet(raw) {
  const n = Number(raw);
  if (n === 3 || n === 4 || n === 5) return n;
  return 3;
}

function normalizePatternId(raw) {
  const id = typeof raw === 'string' ? raw.trim() : '';
  if (id && sweepQualities().some((q) => q.id === id)) return id;
  return sweepQualities()[0]?.id || 'maj';
}

function normalizeInversion(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(5, Math.floor(n));
}

function normalizeFretRange(startRaw, endRaw, defaults = { start: 0, end: 12 }) {
  let start = Number.isFinite(Number(startRaw)) ? Math.floor(Number(startRaw)) : defaults.start;
  let end = Number.isFinite(Number(endRaw)) ? Math.floor(Number(endRaw)) : defaults.end;
  start = Math.max(0, Math.min(MAX_FRET, start));
  end = Math.max(0, Math.min(MAX_FRET, end));
  if (end < start) [start, end] = [end, start];
  if (end - start > MAX_FRET) end = Math.min(MAX_FRET, start + MAX_FRET);
  return { fretStart: start, fretEnd: end };
}

function normalizeMapRange(raw) {
  const n = Number(raw);
  if (n === 1 || n === 2 || n === 3) return n;
  return 1;
}

function normalizeLevel(raw) {
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 1 && n <= 5) return Math.floor(n);
  return 2;
}

function normalizeMode(raw) {
  const m = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return m === 'map' ? 'map' : 'locate';
}

function normalizeLabel(raw) {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim();
  if (!s) return '';
  return s.length > MAX_LABEL_LEN ? s.slice(0, MAX_LABEL_LEN) : s;
}

export function defaultCompanion(type) {
  const def = TYPE_BY_ID[type];
  if (!def) return null;
  const base = {
    id: companionId(),
    type,
    root: 'C',
    scale: 'Major (Ionian)',
    quality: 'major',
    stringSet: 0,
    patternId: normalizePatternId(),
    inversion: 0,
    tuning: DEFAULT_TUNING,
    fretStart: 0,
    fretEnd: 12,
    collapsed: false,
    label: '',
  };
  if (type === 'triad-ref') {
    base.fretEnd = 15;
    base.stringSet = 3;
  }
  if (type === 'sweep-ref') {
    base.root = 'A';
    base.stringSet = 3;
  }
  if (type === 'pitch-train') {
    base.fretStart = undefined;
    base.fretEnd = undefined;
  }
  if (type === 'interval-orbit') {
    base.mapRange = 1;
    base.level = 2;
    base.mode = 'locate';
  }
  return base;
}

export function normalizeCompanion(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = typeof raw.type === 'string' ? raw.type.trim() : '';
  if (!TYPE_IDS.has(type)) return null;

  const root = normalizeRoot(raw.root);
  if (!root) return null;

  const tuning = normalizeTuning(raw.tuning);
  const scale = normalizeScale(raw.scale);
  const quality = normalizeQuality(raw.quality);
  const patternId = normalizePatternId(raw.patternId ?? raw.pattern);
  const inversion = normalizeInversion(raw.inversion);
  const label = normalizeLabel(raw.label);
  const collapsed = !!raw.collapsed;
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : companionId();

  let stringSet;
  let fretStart;
  let fretEnd;

  if (type === 'sweep-ref') {
    stringSet = normalizeSweepStringSet(raw.stringSet);
    const frets = normalizeFretRange(0, MAX_FRET, { start: 0, end: MAX_FRET });
    fretStart = frets.fretStart;
    fretEnd = frets.fretEnd;
  } else if (type === 'triad-ref') {
    stringSet = normalizeStringSetTriad(raw.stringSet);
    const frets = normalizeFretRange(raw.fretStart, raw.fretEnd, { start: 0, end: 15 });
    fretStart = frets.fretStart;
    fretEnd = frets.fretEnd;
  } else if (type === 'scale-ref') {
    stringSet = undefined;
    const frets = normalizeFretRange(raw.fretStart, raw.fretEnd, { start: 0, end: 12 });
    fretStart = frets.fretStart;
    fretEnd = frets.fretEnd;
  } else if (type === 'interval-orbit') {
    stringSet = undefined;
    const frets = normalizeFretRange(raw.fretStart, raw.fretEnd, { start: 0, end: 12 });
    fretStart = frets.fretStart;
    fretEnd = frets.fretEnd;
  } else {
    stringSet = undefined;
    fretStart = undefined;
    fretEnd = undefined;
  }

  const base = {
    id,
    type,
    root,
    scale,
    quality,
    stringSet,
    patternId,
    inversion,
    tuning,
    fretStart,
    fretEnd,
    collapsed,
    label,
  };

  if (type === 'interval-orbit') {
    base.mapRange = normalizeMapRange(raw.mapRange);
    base.level = normalizeLevel(raw.level);
    base.mode = normalizeMode(raw.mode);
  }

  return base;
}

export function normalizeCompanions(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    if (out.length >= MAX_COMPANIONS) break;
    const norm = normalizeCompanion(item);
    if (!norm) continue;
    let id = norm.id;
    if (seen.has(id)) {
      id = companionId();
      norm.id = id;
    }
    seen.add(id);
    out.push(norm);
  }
  return out;
}

export function describeCompanion(companion) {
  if (!companion || !TYPE_BY_ID[companion.type]) return '';
  const root = companion.root || 'C';
  const scaleShort = shortScaleName(companion.scale || 'Major (Ionian)');
  const tuning = companion.tuning || DEFAULT_TUNING;

  if (companion.type === 'scale-ref') {
    return `Scale · ${root} ${companion.scale || 'Major (Ionian)'} · ${tuning}`;
  }
  if (companion.type === 'triad-ref') {
    const q = TRIAD_QUALITIES.find((x) => x.id === companion.quality) || TRIAD_QUALITIES[0];
    return `Triad · ${root} ${q.name} · ${tuning}`;
  }
  if (companion.type === 'sweep-ref') {
    const set = SWEEP_STRING_SETS[companion.stringSet] || SWEEP_STRING_SETS[3];
    const pat = sweepQualities().find((p) => p.id === companion.patternId);
    return `Sweep · ${root} ${pat?.name || 'pattern'} · ${set.label}`;
  }
  if (companion.type === 'pitch-train') {
    return `Pitch · ${root} ${scaleShort} · sing & hold`;
  }
  if (companion.type === 'interval-orbit') {
    const modeLabel = companion.mode === 'map' ? 'Map' : 'Locate';
    const rangeDef = MAP_RANGE_DEFS[companion.mapRange] || MAP_RANGE_DEFS[1];
    const rangeShort = rangeDef.id === 'local' ? 'Local'
      : rangeDef.id === 'position' ? 'Position'
        : 'Full';
    return `Orbit · ${root} · ${modeLabel} · ${rangeShort} · ${tuning}`;
  }
  return TYPE_BY_ID[companion.type].label;
}
