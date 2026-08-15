// Movable sweep-picking library. Shapes are authored for root A from the
// Complete A-Centered Sweep-Picking Inversion Library (321 patterns), then
// transposed by semitone so any tonal center can be practised.

import { parseNote, spellNote, NOTE_NAMES_SHARP } from './theory.js';
import { standardSixStringOpenPc } from './tunings.js';
import { SWEEP_LIBRARY, SWEEP_LIBRARY_COUNT } from './data/sweepLibrary.js';

export { SWEEP_LIBRARY, SWEEP_LIBRARY_COUNT };

const A_SEMI = 9;

export const SWEEP_STRING_SETS = {
  3: { id: 3, label: '3-string', strings: ['G', 'B', 'e'], used: 'G-B-e' },
  4: { id: 4, label: '4-string', strings: ['D', 'G', 'B', 'e'], used: 'D-G-B-e' },
  5: { id: 5, label: '5-string', strings: ['A', 'D', 'G', 'B', 'e'], used: 'A-D-G-B-e' },
};

const INV_LABELS = ['Root', '1st', '2nd', '3rd', '4th', '5th'];
const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

function spellAbove(rootStr, letterOff, semiOff) {
  const r = parseNote(rootStr);
  if (!r) return '?';
  return spellNote(r.li, r.semi, letterOff, semiOff) || '?';
}

// Guide bass labels are A-centered ("C# in the bass"); rewrite them for the active Root.
function transposeBassLabel(rootStr, bassLabel) {
  if (!bassLabel) return '';
  const root = parseNote(rootStr);
  if (!root) return bassLabel;
  if (root.semi === A_SEMI && root.letter === 'A' && !root.acc) return bassLabel;

  const m = bassLabel.match(
    /^([A-G](?:#{1,2}|b{1,2})?)(?:\s*\(([A-G](?:#{1,2}|b{1,2})?)\))?\s+in the bass$/
  );
  if (!m) return bassLabel;

  const a = parseNote('A');
  const preferFlats = root.acc === 'b' || root.acc === 'bb' || (root.letter === 'F' && !root.acc);
  const pcNames = preferFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;

  function transposeName(name) {
    const n = parseNote(name);
    if (!n) return name;
    const lOff = (n.li - a.li + 7) % 7;
    const sOff = ((n.semi - a.semi) % 12 + 12) % 12;
    let spelled = spellNote(root.li, root.semi, lOff, sOff);
    if (!spelled || /#{2}|bb/.test(spelled)) {
      spelled = pcNames[((root.semi + sOff) % 12 + 12) % 12];
    }
    return spelled;
  }

  const primary = transposeName(m[1]);
  if (m[2]) {
    const alt = transposeName(m[2]);
    if (alt && alt !== primary) return `${primary} (${alt}) in the bass`;
  }
  return `${primary} in the bass`;
}

// Unique qualities in guide order.
const QUALITY_ORDER = [];
const seenQ = new Set();
SWEEP_LIBRARY.forEach((p) => {
  if (seenQ.has(p.id)) return;
  seenQ.add(p.id);
  QUALITY_ORDER.push({
    id: p.id,
    name: p.name,
    join: p.join,
    formula: p.formula,
  });
});

export function sweepQualities() {
  return QUALITY_ORDER.slice();
}

export function patternsForStringSet(stringSet) {
  const ids = new Set(
    SWEEP_LIBRARY.filter((p) => p.stringSet === stringSet).map((p) => p.id)
  );
  return QUALITY_ORDER.filter((q) => ids.has(q.id));
}

export function inversionOptionsFor(patternId, stringSet, rootStr = 'A') {
  return SWEEP_LIBRARY
    .filter((p) => p.id === patternId && p.stringSet === stringSet)
    .sort((a, b) => a.inversion - b.inversion)
    .map((p) => ({
      inv: p.inversion,
      label: INV_LABELS[p.inversion] || String(p.inversion),
      bassLabel: transposeBassLabel(rootStr, p.bassLabel || ''),
    }));
}

export function lookupPattern(patternId, stringSet, inversion = 0) {
  const matches = SWEEP_LIBRARY.filter(
    (p) => p.id === patternId && p.stringSet === stringSet
  );
  if (!matches.length) return null;
  return (
    matches.find((p) => p.inversion === inversion) ||
    matches.slice().sort((a, b) => a.inversion - b.inversion)[0]
  );
}

export function patternTitle(root, pattern, inversion = 0) {
  const base = pattern.join === '' ? `${root}${pattern.name}` : `${root} ${pattern.name}`;
  if (!inversion) return base;
  const label = INV_LABELS[inversion] || String(inversion);
  return `${base} · ${label} inv`;
}

export function transposeShift(rootStr, frets) {
  const root = parseNote(rootStr);
  if (!root) return 0;
  const shift = root.semi - A_SEMI;
  let best = shift;
  let bestCost = Infinity;
  for (const oct of [-24, -12, 0, 12, 24]) {
    const s = shift + oct;
    let hard = 0;
    let opens = 0;
    frets.forEach((f) => {
      const v = f + s;
      if (v < 0) hard += -v;
      else if (v === 0) opens += 1;
      else if (v > 24) hard += v - 24;
    });
    // Prefer fretted in-range shapes; open strings are fixed afterward via +12.
    const cost = hard * 1000 + opens * 100 + Math.abs(oct);
    if (cost < bestCost) {
      bestCost = cost;
      best = s;
    }
  }
  return best;
}

// Open strings are forbidden in sweeps — move that string's frets into the 12th zone.
export function banOpenStrings(events) {
  const openStrings = new Set(
    events.filter((e) => e.f === 0).map((e) => e.s)
  );
  if (!openStrings.size) return events;
  return events.map((e) => (
    openStrings.has(e.s) ? { ...e, f: e.f + 12 } : e
  ));
}

function clampHighStrings(events) {
  const highStrings = new Set(
    events.filter((e) => e.f > 24).map((e) => e.s)
  );
  if (!highStrings.size) return events;
  return events.map((e) => (
    highStrings.has(e.s) ? { ...e, f: e.f - 12 } : e
  ));
}

export function transposePattern(rootStr, pattern) {
  const baseFrets = pattern.events.map((e) => e.f);
  const shift = transposeShift(rootStr, baseFrets);
  let events = pattern.events.map((e) => ({
    s: e.s,
    f: e.f + shift,
    t: e.t || null,
  }));
  events = banOpenStrings(events);
  events = clampHighStrings(events);
  // Clamping high strings can reintroduce opens; ban once more if needed.
  events = banOpenStrings(events);
  return {
    ...pattern,
    title: patternTitle(rootStr, pattern, pattern.inversion || 0),
    shift,
    events,
  };
}

export function renderSweepTab(transposed, stringSet) {
  const set = SWEEP_STRING_SETS[stringSet];
  if (!set || !transposed?.events?.length) return '';

  const order = [...set.strings].reverse();
  const rows = Object.fromEntries(order.map((s) => [s, '']));

  transposed.events.forEach((ev) => {
    const token = ev.t ? `${ev.t}${ev.f}` : String(ev.f);
    const blank = '-'.repeat(token.length);
    order.forEach((s) => {
      rows[s] += '-' + (s === ev.s ? token : blank);
    });
  });

  let tab = '';
  order.forEach((s) => {
    tab += `${s}|${rows[s]}-|\n`;
  });
  return tab;
}

export function buildSweepLayout(rootStr, pattern) {
  const root = parseNote(rootStr);
  const tp = transposePattern(rootStr, pattern);
  const set = SWEEP_STRING_SETS[pattern.stringSet];
  if (!root || !set) return null;

  const byString = Object.fromEntries(set.strings.map((s) => [s, []]));
  tp.events.forEach((ev, order) => {
    const pc = ((standardSixStringOpenPc(ev.s) + ev.f) % 12 + 12) % 12;
    const interval = (pc - root.semi + 12) % 12;
    const existing = byString[ev.s].find((f) => f.fret === ev.f);
    if (existing) {
      if (order < existing.order) existing.order = order;
      if (ev.t && !existing.tech) existing.tech = ev.t;
      return;
    }
    byString[ev.s].push({
      fret: ev.f,
      interval,
      isRoot: interval === 0,
      noteName: NOTE_NAMES_SHARP[pc],
      order,
      tech: ev.t || null,
    });
  });

  return {
    title: tp.title,
    formula: pattern.formula,
    stringSet: pattern.stringSet,
    inversion: pattern.inversion || 0,
    bassLabel: transposeBassLabel(rootStr, pattern.bassLabel || ''),
    stringsUsed: set.used,
    events: tp.events,
    tab: renderSweepTab(tp, pattern.stringSet),
    strings: set.strings.map((s) => ({
      note: s,
      label: s,
      frets: byString[s],
    })),
  };
}

export function getSweepPattern(rootStr, stringSet, patternId, inversion = 0) {
  const pattern = lookupPattern(patternId, stringSet, inversion);
  if (!pattern) return null;
  const layout = buildSweepLayout(rootStr, pattern);
  const inversions = inversionOptionsFor(pattern.id, stringSet, rootStr);
  return {
    id: pattern.id,
    name: pattern.name,
    join: pattern.join,
    title: layout.title,
    formula: pattern.formula,
    stringSet,
    inversion: layout.inversion,
    bassLabel: layout.bassLabel,
    inversions,
    stringsUsed: layout.stringsUsed,
    tab: layout.tab,
    events: layout.events,
    strings: layout.strings,
    layout,
  };
}

export function getSweepLibrary(rootStr, stringSet, inversion = 0) {
  return patternsForStringSet(stringSet).map((q) =>
    getSweepPattern(rootStr, stringSet, q.id, inversion)
  ).filter(Boolean);
}

export const DIMINISHED_PRIORITY = {
  wholeHalf: {
    title: 'Whole-half diminished',
    scaleHint: (root) => [
      [0, 0], [1, 2], [2, 3], [3, 5], [4, 6], [5, 8], [5, 9], [6, 11],
    ].map(([lo, so]) => spellAbove(root, lo, so)).join(' '),
    prioritizeLabels: (root) => [
      `${root}dim7`,
      `${spellAbove(root, 1, 2)}dim7`,
      `${spellAbove(root, 3, 5)}m7b5`,
      `${spellAbove(root, 5, 8)}m7b5`,
      `${root}m6`,
      `${spellAbove(root, 2, 3)}m6`,
    ],
  },
  halfWhole: {
    title: 'Half-whole diminished (dominant)',
    scaleHint: (root) => [
      [0, 0], [1, 1], [2, 3], [2, 4], [4, 6], [4, 7], [5, 9], [6, 10],
    ].map(([lo, so]) => spellAbove(root, lo, so)).join(' '),
    prioritizeLabels: (root) => [
      `${root}7`,
      `${root}7b5`,
      `${root}7b9`,
      `${root}7#9`,
      `${root}13`,
      `${root}13b9`,
      `${root}7b9#11`,
      `${spellAbove(root, 1, 1)}dim7 over ${/^[AEIOUaeiou]/.test(root) ? 'an' : 'a'} ${root} pedal`,
    ],
  },
  sequence: {
    title: 'Movable diminished sequence',
    describe: (root) => {
      const a = root;
      const b = spellAbove(root, 2, 3);
      const c = spellAbove(root, 4, 6);
      const d = spellAbove(root, 5, 9);
      return `${a}dim7 → ${b}dim7 → ${c}dim7 → ${d}dim7`;
    },
    note: 'All four names contain the same notes. Move any dim7 sweep shape upward in three-fret increments. For half-whole dominant riffs, move Adim7 up one fret for Bbdim7 (A7b9 upper structure).',
  },
};
