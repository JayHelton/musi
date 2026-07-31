/**
 * Structured guitar/bass tuning catalog.
 * Generates the legacy TUNINGS object used across the app.
 */

import { parseNote, NOTE_NAMES_SHARP } from './theory.js';

/** @typedef {{ note: string, oct: number }} TuningPitch */
/** @typedef {{
 *   id: string,
 *   name: string,
 *   strings: number,
 *   category: string,
 *   pitches: TuningPitch[],
 *   aliases?: string[],
 *   tags?: string[],
 *   legacyKeys?: string[],
 * }} TuningPreset
 */

function P(note, oct) { return { note, oct }; }

/** @type {TuningPreset[]} */
export const TUNING_CATALOG = [
  {
    id: '6-e-std',
    name: 'E Standard',
    strings: 6,
    category: 'standard',
    pitches: [P('E',2), P('A',2), P('D',3), P('G',3), P('B',3), P('E',4)],
    aliases: ['EADGBE', 'Standard'],
    tags: ['standard'],
    legacyKeys: ['Standard'],
  },
  {
    id: '6-eb-std',
    name: 'Eb Standard',
    strings: 6,
    category: 'standard',
    pitches: [P('Eb',2), P('Ab',2), P('Db',3), P('Gb',3), P('Bb',3), P('Eb',4)],
    aliases: ['Half Step Down', 'Eb Ab Db Gb Bb Eb'],
    tags: ['standard', 'half-step'],
    legacyKeys: ['Half Step Down'],
  },
  {
    id: '6-d-std',
    name: 'D Standard',
    strings: 6,
    category: 'standard',
    pitches: [P('D',2), P('G',2), P('C',3), P('F',3), P('A',3), P('D',4)],
    aliases: ['DGCFAD'],
    tags: ['standard'],
    legacyKeys: [],
  },
  {
    id: '6-cs-std',
    name: 'C# / Db Standard',
    strings: 6,
    category: 'standard',
    pitches: [P('C#',2), P('F#',2), P('B',2), P('E',3), P('G#',3), P('C#',4)],
    aliases: ['Db Standard', 'C# F# B E G# C#'],
    tags: ['standard'],
    legacyKeys: [],
  },
  {
    id: '6-c-std',
    name: 'C Standard',
    strings: 6,
    category: 'standard',
    pitches: [P('C',2), P('F',2), P('Bb',2), P('Eb',3), P('G',3), P('C',4)],
    aliases: ['C F Bb Eb G C'],
    tags: ['standard'],
    legacyKeys: [],
  },
  {
    id: '6-b-std',
    name: 'B Standard',
    strings: 6,
    category: 'standard',
    pitches: [P('B',1), P('E',2), P('A',2), P('D',3), P('F#',3), P('B',3)],
    aliases: ['B E A D F# B'],
    tags: ['standard'],
    legacyKeys: [],
  },
  {
    id: '6-bb-std',
    name: 'Bb / A# Standard',
    strings: 6,
    category: 'standard',
    pitches: [P('Bb',1), P('Eb',2), P('Ab',2), P('Db',3), P('F',3), P('Bb',3)],
    aliases: ['A# Standard', 'Bb Eb Ab Db F Bb'],
    tags: ['standard'],
    legacyKeys: [],
  },
  {
    id: '6-a-std',
    name: 'A Standard',
    strings: 6,
    category: 'standard',
    pitches: [P('A',1), P('D',2), P('G',2), P('C',3), P('E',3), P('A',3)],
    aliases: ['A D G C E A'],
    tags: ['standard'],
    legacyKeys: [],
  },
  {
    id: '6-drop-d',
    name: 'Drop D',
    strings: 6,
    category: 'drop',
    pitches: [P('D',2), P('A',2), P('D',3), P('G',3), P('B',3), P('E',4)],
    aliases: ['DADGBE'],
    tags: ['drop', 'metal'],
    legacyKeys: [],
  },
  {
    id: '6-drop-cs',
    name: 'Drop C# / Db',
    strings: 6,
    category: 'drop',
    pitches: [P('C#',2), P('G#',2), P('C#',3), P('F#',3), P('A#',3), P('D#',4)],
    aliases: ['Drop Db'],
    tags: ['drop', 'metal'],
    legacyKeys: [],
  },
  {
    id: '6-drop-c',
    name: 'Drop C',
    strings: 6,
    category: 'drop',
    pitches: [P('C',2), P('G',2), P('C',3), P('F',3), P('A',3), P('D',4)],
    aliases: ['CGCFAD'],
    tags: ['drop', 'metal', 'metalcore'],
    legacyKeys: [],
  },
  {
    id: '6-drop-b',
    name: 'Drop B',
    strings: 6,
    category: 'drop',
    pitches: [P('B',1), P('F#',2), P('B',2), P('E',3), P('G#',3), P('C#',4)],
    aliases: [],
    tags: ['drop', 'metal'],
    legacyKeys: [],
  },
  {
    id: '6-drop-bb',
    name: 'Drop Bb / A#',
    strings: 6,
    category: 'drop',
    pitches: [P('Bb',1), P('F',2), P('Bb',2), P('Eb',3), P('G',3), P('C',4)],
    aliases: ['Drop A#'],
    tags: ['drop', 'metal'],
    legacyKeys: [],
  },
  {
    id: '6-drop-a',
    name: 'Drop A',
    strings: 6,
    category: 'drop',
    pitches: [P('A',1), P('E',2), P('A',2), P('D',3), P('F#',3), P('B',3)],
    aliases: [],
    tags: ['drop', 'metal'],
    legacyKeys: [],
  },
  {
    id: '6-drop-gs',
    name: 'Drop G# / Ab',
    strings: 6,
    category: 'drop',
    pitches: [P('G#',1), P('D#',2), P('G#',2), P('C#',3), P('F',3), P('A#',3)],
    aliases: ['Drop Ab'],
    tags: ['drop', 'metal'],
    legacyKeys: [],
  },
  {
    id: '6-drop-g',
    name: 'Drop G',
    strings: 6,
    category: 'drop',
    pitches: [P('G',1), P('D',2), P('G',2), P('C',3), P('E',3), P('A',3)],
    aliases: [],
    tags: ['drop', 'metal'],
    legacyKeys: [],
  },
  {
    id: '6-drop-fs',
    name: 'Drop F# / Gb',
    strings: 6,
    category: 'drop',
    pitches: [P('F#',1), P('C#',2), P('F#',2), P('B',2), P('D#',3), P('G#',3)],
    aliases: ['Drop Gb'],
    tags: ['drop', 'metal'],
    legacyKeys: [],
  },
  {
    id: '6-drop-f',
    name: 'Drop F',
    strings: 6,
    category: 'drop',
    pitches: [P('F',1), P('C',2), P('F',2), P('Bb',2), P('D',3), P('G',3)],
    aliases: [],
    tags: ['drop', 'metal'],
    legacyKeys: [],
  },
  {
    id: '6-drop-e',
    name: 'Drop E',
    strings: 6,
    category: 'drop',
    pitches: [P('E',1), P('B',1), P('E',2), P('A',2), P('C#',3), P('F#',3)],
    aliases: [],
    tags: ['drop', 'metal'],
    legacyKeys: [],
  },
  {
    id: '6-dadgad',
    name: 'DADGAD',
    strings: 6,
    category: 'alternate',
    pitches: [P('D',2), P('A',2), P('D',3), P('G',3), P('A',3), P('D',4)],
    aliases: ['DADGAD'],
    tags: ['alternate', 'open', 'folk'],
    legacyKeys: [],
  },
  {
    id: '6-ddrop-d',
    name: 'Double Drop D',
    strings: 6,
    category: 'alternate',
    pitches: [P('D',2), P('A',2), P('D',3), P('G',3), P('B',3), P('D',4)],
    aliases: ['DADGBD'],
    tags: ['alternate', 'drop'],
    legacyKeys: [],
  },
  {
    id: '6-open-d',
    name: 'Open D',
    strings: 6,
    category: 'alternate',
    pitches: [P('D',2), P('A',2), P('D',3), P('F#',3), P('A',3), P('D',4)],
    aliases: ['DADF#AD'],
    tags: ['alternate', 'open'],
    legacyKeys: [],
  },
  {
    id: '6-open-e',
    name: 'Open E',
    strings: 6,
    category: 'alternate',
    pitches: [P('E',2), P('B',2), P('E',3), P('G#',3), P('B',3), P('E',4)],
    aliases: ['EBEG#BE'],
    tags: ['alternate', 'open'],
    legacyKeys: [],
  },
  {
    id: '6-open-g',
    name: 'Open G',
    strings: 6,
    category: 'alternate',
    pitches: [P('D',2), P('G',2), P('D',3), P('G',3), P('B',3), P('D',4)],
    aliases: ['DGDGBD'],
    tags: ['alternate', 'open'],
    legacyKeys: [],
  },
  {
    id: '6-open-c',
    name: 'Open C / CGCGCE',
    strings: 6,
    category: 'alternate',
    pitches: [P('C',2), P('G',2), P('C',3), P('G',3), P('C',4), P('E',4)],
    aliases: ['CGCGCE', 'Open C'],
    tags: ['alternate', 'open'],
    legacyKeys: [],
  },
  {
    id: '6-facgce',
    name: 'FACGCE',
    strings: 6,
    category: 'alternate',
    pitches: [P('F',2), P('A',2), P('C',3), P('G',3), P('C',4), P('E',4)],
    aliases: ['FACGCE'],
    tags: ['alternate', 'open'],
    legacyKeys: [],
  },
  {
    id: '7-b-std',
    name: '7-String Standard',
    strings: 7,
    category: 'seven',
    pitches: [P('B',1), P('E',2), P('A',2), P('D',3), P('G',3), P('B',3), P('E',4)],
    aliases: ['B Standard 7', '7-String B Standard'],
    tags: ['seven', 'standard'],
    legacyKeys: [],
  },
  {
    id: '7-bb-std',
    name: '7-String Bb / A# Standard',
    strings: 7,
    category: 'seven',
    pitches: [P('Bb',1), P('Eb',2), P('Ab',2), P('Db',3), P('Gb',3), P('Bb',3), P('Eb',4)],
    aliases: ['7-String A# Standard'],
    tags: ['seven', 'standard'],
    legacyKeys: [],
  },
  {
    id: '7-a-std',
    name: '7-String A Standard',
    strings: 7,
    category: 'seven',
    pitches: [P('A',1), P('D',2), P('G',2), P('C',3), P('F',3), P('A',3), P('D',4)],
    aliases: [],
    tags: ['seven', 'standard'],
    legacyKeys: [],
  },
  {
    id: '7-gs-std',
    name: '7-String G# / Ab Standard',
    strings: 7,
    category: 'seven',
    pitches: [P('G#',1), P('C#',2), P('F#',2), P('B',2), P('E',3), P('G#',3), P('C#',4)],
    aliases: ['7-String Ab Standard'],
    tags: ['seven', 'standard'],
    legacyKeys: [],
  },
  {
    id: '7-g-std',
    name: '7-String G Standard',
    strings: 7,
    category: 'seven',
    pitches: [P('G',1), P('C',2), P('F',2), P('Bb',2), P('Eb',3), P('G',3), P('C',4)],
    aliases: [],
    tags: ['seven', 'standard'],
    legacyKeys: [],
  },
  {
    id: '7-fs-std',
    name: '7-String F# / Gb Standard',
    strings: 7,
    category: 'seven',
    pitches: [P('F#',1), P('B',1), P('E',2), P('A',2), P('D',3), P('F#',3), P('B',3)],
    aliases: ['7-String Gb Standard'],
    tags: ['seven', 'standard'],
    legacyKeys: [],
  },
  {
    id: '7-f-std',
    name: '7-String F Standard',
    strings: 7,
    category: 'seven',
    pitches: [P('F',1), P('Bb',1), P('Eb',2), P('Ab',2), P('Db',3), P('F',3), P('Bb',3)],
    aliases: [],
    tags: ['seven', 'standard'],
    legacyKeys: [],
  },
  {
    id: '7-drop-a',
    name: '7-String Drop A',
    strings: 7,
    category: 'seven',
    pitches: [P('A',1), P('E',2), P('A',2), P('D',3), P('G',3), P('B',3), P('E',4)],
    aliases: ['Drop A 7'],
    tags: ['seven', 'drop', 'metal'],
    legacyKeys: [],
  },
  {
    id: '7-drop-gs',
    name: '7-String Drop G# / Ab',
    strings: 7,
    category: 'seven',
    pitches: [P('G#',1), P('D#',2), P('G#',2), P('C#',3), P('F#',3), P('A#',3), P('D#',4)],
    aliases: ['7-String Drop Ab'],
    tags: ['seven', 'drop'],
    legacyKeys: [],
  },
  {
    id: '7-drop-g',
    name: '7-String Drop G',
    strings: 7,
    category: 'seven',
    pitches: [P('G',1), P('D',2), P('G',2), P('C',3), P('F',3), P('A',3), P('D',4)],
    aliases: [],
    tags: ['seven', 'drop'],
    legacyKeys: [],
  },
  {
    id: '7-drop-fs',
    name: '7-String Drop F# / Gb',
    strings: 7,
    category: 'seven',
    pitches: [P('F#',1), P('C#',2), P('F#',2), P('B',2), P('E',3), P('G#',3), P('C#',4)],
    aliases: ['7-String Drop F#', '7-String Drop Gb'],
    tags: ['seven', 'drop'],
    legacyKeys: ['7-String Drop F#'],
  },
  {
    id: '7-drop-f',
    name: '7-String Drop F',
    strings: 7,
    category: 'seven',
    pitches: [P('F',1), P('C',2), P('F',2), P('Bb',2), P('Eb',3), P('G',3), P('C',4)],
    aliases: [],
    tags: ['seven', 'drop'],
    legacyKeys: [],
  },
  {
    id: '7-drop-e',
    name: '7-String Drop E',
    strings: 7,
    category: 'seven',
    pitches: [P('E',1), P('B',1), P('E',2), P('A',2), P('D',3), P('F#',3), P('B',3)],
    aliases: [],
    tags: ['seven', 'drop'],
    legacyKeys: [],
  },
  {
    id: '7-drop-eb',
    name: '7-String Drop Eb / D#',
    strings: 7,
    category: 'seven',
    pitches: [P('Eb',1), P('Bb',1), P('Eb',2), P('Ab',2), P('Db',3), P('F',3), P('Bb',3)],
    aliases: ['7-String Drop D#'],
    tags: ['seven', 'drop'],
    legacyKeys: [],
  },
  {
    id: '7-drop-d',
    name: '7-String Drop D',
    strings: 7,
    category: 'seven',
    pitches: [P('D',1), P('A',1), P('D',2), P('G',2), P('C',3), P('E',3), P('A',3)],
    aliases: [],
    tags: ['seven', 'drop'],
    legacyKeys: [],
  },
  {
    id: '7-drop-cs',
    name: '7-String Drop C# / Db',
    strings: 7,
    category: 'seven',
    pitches: [P('C#',1), P('G#',1), P('C#',2), P('F#',2), P('B',2), P('D#',3), P('G#',3)],
    aliases: ['7-String Drop Db'],
    tags: ['seven', 'drop'],
    legacyKeys: [],
  },
  {
    id: '8-fs-std',
    name: '8-String Standard',
    strings: 8,
    category: 'eight',
    pitches: [P('F#',1), P('B',1), P('E',2), P('A',2), P('D',3), P('G',3), P('B',3), P('E',4)],
    aliases: [],
    tags: ['eight', 'standard'],
    legacyKeys: [],
  },
  {
    id: 'bass-4',
    name: 'Bass 4',
    strings: 4,
    category: 'bass',
    pitches: [P('E',1), P('A',1), P('D',2), P('G',2)],
    aliases: [],
    tags: ['bass'],
    legacyKeys: [],
  },
  {
    id: 'bass-5',
    name: 'Bass 5',
    strings: 5,
    category: 'bass',
    pitches: [P('B',0), P('E',1), P('A',1), P('D',2), P('G',2)],
    aliases: [],
    tags: ['bass'],
    legacyKeys: [],
  }
];

export const TUNING_CATEGORIES = [
  { id: 'standard', label: 'Standard-family' },
  { id: 'drop', label: 'Drop' },
  { id: 'alternate', label: 'Alternate / Open' },
  { id: 'seven', label: 'Seven-string' },
  { id: 'eight', label: 'Eight-string' },
  { id: 'bass', label: 'Bass' },
  { id: 'custom', label: 'Custom' },
];

const INTERVAL_NAMES = {
  1: 'minor 2nd', 2: 'major 2nd', 3: 'minor 3rd', 4: 'major 3rd',
  5: 'perfect 4th', 6: 'tritone', 7: 'perfect 5th', 8: 'minor 6th',
  9: 'major 6th', 10: 'minor 7th', 11: 'major 7th', 12: 'octave',
};

export function pitchToMidi(pitch) {
  const p = parseNote(pitch.note);
  if (!p) return null;
  return 12 * (Number(pitch.oct) + 1) + p.semi;
}

export function pitchesToMidi(pitches) {
  return pitches.map(pitchToMidi);
}

export function pitchSequenceString(pitches, { withOctave = false } = {}) {
  return pitches.map((p) => (withOctave ? `${p.note}${p.oct}` : p.note)).join(' ');
}

export function clonePitches(pitches) {
  return pitches.map((p) => ({ note: p.note, oct: Number(p.oct) }));
}

/** Build legacy TUNINGS map: preferred name + legacyKeys. */
export function buildTuningsObject(catalog = TUNING_CATALOG) {
  const out = {};
  for (const preset of catalog) {
    const pitches = clonePitches(preset.pitches);
    out[preset.name] = pitches;
    for (const key of preset.legacyKeys || []) {
      if (key && !out[key]) out[key] = pitches;
    }
  }
  return out;
}

export const TUNINGS = buildTuningsObject();

export function findPresetByName(name) {
  if (!name) return null;
  const lower = String(name).toLowerCase();
  return TUNING_CATALOG.find((p) =>
    p.name.toLowerCase() === lower
    || (p.legacyKeys || []).some((k) => k.toLowerCase() === lower)
    || (p.aliases || []).some((a) => a.toLowerCase() === lower)
    || p.id === name
  ) || null;
}

export function resolveTuningPitches(name, customStrings) {
  if (name === 'Custom' && Array.isArray(customStrings) && customStrings.length) {
    return clonePitches(customStrings);
  }
  if (TUNINGS[name]) return clonePitches(TUNINGS[name]);
  const preset = findPresetByName(name);
  if (preset) return clonePitches(preset.pitches);
  return clonePitches(TUNINGS.Standard || TUNING_CATALOG[0].pitches);
}

export function getAdjacentStringIntervals(pitches) {
  const midis = pitchesToMidi(pitches);
  const steps = [];
  for (let i = 0; i < midis.length - 1; i++) {
    const semis = midis[i + 1] - midis[i];
    steps.push({
      lowerIndex: i,
      upperIndex: i + 1,
      semitones: semis,
      name: INTERVAL_NAMES[semis] || `${semis} semitones`,
      type: classifyBoundaryType(semis, i, pitches.length),
    });
  }
  return steps;
}

export function classifyBoundaryType(semitones, lowerIndex, stringCount) {
  if (semitones === 5) return 'fourth';
  if (semitones === 4) return 'major-third';
  if (semitones === 7 && lowerIndex === 0) return 'drop';
  if (semitones === 7) return 'fifth';
  return 'custom';
}

export function getTuningGeometry(pitches) {
  const midis = pitchesToMidi(pitches);
  const adjacent = getAdjacentStringIntervals(pitches);
  return {
    stringCount: pitches.length,
    midis,
    adjacent,
    boundaries: adjacent.filter((a) => a.type !== 'fourth'),
    hasDropBoundary: adjacent.some((a) => a.type === 'drop'),
    hasMajorThirdBoundary: adjacent.some((a) => a.type === 'major-third'),
    pitchSequence: pitchSequenceString(pitches),
    pitchSequenceWithOctave: pitchSequenceString(pitches, { withOctave: true }),
  };
}

export function validateTuningPitches(pitches, { expectStrings = null, expectDrop = false } = {}) {
  const errors = [];
  if (!Array.isArray(pitches) || !pitches.length) {
    return { ok: false, errors: ['Tuning must include at least one string.'] };
  }
  if (expectStrings != null && pitches.length !== expectStrings) {
    errors.push(`Expected ${expectStrings} strings, got ${pitches.length}.`);
  }
  if (pitches.length < 4 || pitches.length > 8) {
    errors.push('String count must be between 4 and 8.');
  }
  const midis = [];
  pitches.forEach((p, i) => {
    if (!p || !parseNote(p.note)) errors.push(`String ${i + 1}: invalid note "${p?.note}".`);
    if (!Number.isFinite(Number(p?.oct))) errors.push(`String ${i + 1}: invalid octave.`);
    const m = pitchToMidi(p);
    if (m == null) errors.push(`String ${i + 1}: could not parse pitch.`);
    else midis.push(m);
  });
  for (let i = 0; i < midis.length - 1; i++) {
    if (!(midis[i] < midis[i + 1])) {
      errors.push(`Open-string pitches must ascend (string ${i + 1} → ${i + 2}).`);
    }
  }
  if (expectDrop && midis.length >= 2 && midis[1] - midis[0] !== 7) {
    errors.push('Drop tuning expects a perfect 5th between the lowest two strings.');
  }
  return { ok: errors.length === 0, errors, midis, geometry: errors.length ? null : getTuningGeometry(pitches) };
}

export function validateCatalog(catalog = TUNING_CATALOG) {
  const errors = [];
  const ids = new Set();
  const keys = new Set();
  for (const preset of catalog) {
    if (ids.has(preset.id)) errors.push(`Duplicate id: ${preset.id}`);
    ids.add(preset.id);
    const keysForPreset = [preset.name, ...(preset.legacyKeys || []).filter((k) => k && k !== preset.name)];
    for (const key of keysForPreset) {
      if (keys.has(key)) errors.push(`Duplicate tuning key: ${key}`);
      keys.add(key);
    }
    if (preset.strings !== preset.pitches.length) {
      errors.push(`${preset.id}: strings (${preset.strings}) != pitches (${preset.pitches.length})`);
    }
    const expectDrop = (preset.category === 'drop') || (preset.tags || []).includes('drop') && preset.category === 'seven' && /Drop/.test(preset.name);
    const isDrop = /drop/i.test(preset.name) && !/Double Drop|Open|DADGAD|FACGCE|CGCGCE/i.test(preset.name);
    const result = validateTuningPitches(preset.pitches, {
      expectStrings: preset.strings,
      expectDrop: isDrop,
    });
    if (!result.ok) errors.push(...result.errors.map((e) => `${preset.id}: ${e}`));
    const seq = pitchSequenceString(preset.pitches);
    const withOct = pitchSequenceString(preset.pitches, { withOctave: true });
    if (!seq) errors.push(`${preset.id}: empty pitch sequence`);
    // Enharmonic alias sanity: aliases that look like note sequences should match notes
    for (const alias of preset.aliases || []) {
      if (/^[A-G][#b]?([A-G][#b]?)+$/i.test(alias.replace(/\s+/g, '')) && alias.length >= 4 && !alias.includes(' ')) {
        const compact = preset.pitches.map((p) => p.note).join('');
        // Allow enharmonic differences in spelling for display aliases; skip hard fail
        void compact;
      }
      void withOct;
    }
  }
  return { ok: errors.length === 0, errors };
}

export function searchTunings(query, {
  stringCount = null,
  category = null,
  catalog = TUNING_CATALOG,
} = {}) {
  const q = String(query || '').trim().toLowerCase();
  return catalog.filter((preset) => {
    if (stringCount != null && preset.strings !== stringCount) return false;
    if (category && preset.category !== category && !(preset.tags || []).includes(category)) return false;
    if (!q) return true;
    const hay = [
      preset.id,
      preset.name,
      ...(preset.aliases || []),
      ...(preset.legacyKeys || []),
      ...(preset.tags || []),
      pitchSequenceString(preset.pitches),
      pitchSequenceString(preset.pitches, { withOctave: true }),
      preset.pitches.map((p) => p.note).join(''),
    ].join(' ').toLowerCase();
    return hay.includes(q) || q.split(/\s+/).every((part) => hay.includes(part));
  });
}

export function parseCustomTuningText(text) {
  const parts = String(text || '').trim().split(/[\s,|]+/).filter(Boolean);
  const out = [];
  for (const part of parts) {
    const m = part.match(/^([A-Ga-g](?:#{1,2}|b{1,2}|x)?)(-?\d)$/);
    if (!m) return null;
    const noteOnly = m[1][0].toUpperCase() + m[1].slice(1).replace('x', '##');
    if (!parseNote(noteOnly)) return null;
    out.push({ note: noteOnly, oct: Number(m[2]) });
  }
  if (out.length < 4 || out.length > 8) return null;
  return out;
}

export function createCustomTuningDraft(stringCount = 6, templateName = 'Standard') {
  const base = resolveTuningPitches(templateName);
  const pitches = [];
  for (let i = 0; i < stringCount; i++) {
    if (base[i]) pitches.push({ note: base[i].note, oct: base[i].oct });
    else {
      const prev = pitches[pitches.length - 1];
      const midi = pitchToMidi(prev) + 5;
      const note = NOTE_NAMES_SHARP[((midi % 12) + 12) % 12];
      const oct = Math.floor(midi / 12) - 1;
      pitches.push({ note, oct });
    }
  }
  return pitches;
}

