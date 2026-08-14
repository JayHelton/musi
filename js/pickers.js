// Domain pickers built on the selection sheet: root, scale, chord, tuning.
import { openSelectionSheet } from './selectionSheet.js';
import { getList, pushRecent, toggleFavorite, isFavorite } from './recents.js';
import { getSetting, saveSetting } from './persistence.js';
import { ROOTS, TUNINGS, NOTE_NAMES_SHARP } from './theory.js';
import { TUNING_CATALOG, findPresetByName, pitchSequenceString } from './tunings.js';
import { SCALES, shortScaleName } from './scales.js';
import { CHORDS, DARK_METAL_CHORDS } from './chords.js';
import { setContext, setLocal } from './musicalContext.js';

const ENHARMONIC_PAIRS = {
  'C#': 'Db', Db: 'C#',
  'D#': 'Eb', Eb: 'D#',
  'F#': 'Gb', Gb: 'F#',
  'G#': 'Ab', Ab: 'G#',
  'A#': 'Bb', Bb: 'A#',
};

// Display grid: naturals emphasized; accidentals show both spellings.
export const ROOT_GRID = [
  { id: 'C', label: 'C', natural: true },
  { id: 'C#', label: 'C#/Db', sharp: 'C#', flat: 'Db' },
  { id: 'D', label: 'D', natural: true },
  { id: 'D#', label: 'D#/Eb', sharp: 'D#', flat: 'Eb' },
  { id: 'E', label: 'E', natural: true },
  { id: 'F', label: 'F', natural: true },
  { id: 'F#', label: 'F#/Gb', sharp: 'F#', flat: 'Gb' },
  { id: 'G', label: 'G', natural: true },
  { id: 'G#', label: 'G#/Ab', sharp: 'G#', flat: 'Ab' },
  { id: 'A', label: 'A', natural: true },
  { id: 'A#', label: 'A#/Bb', sharp: 'A#', flat: 'Bb' },
  { id: 'B', label: 'B', natural: true },
];

export function getEnharmonicPref() {
  return getSetting('picker.enharmonic', 'auto', ['sharps', 'flats', 'auto']);
}

export function setEnharmonicPref(pref) {
  if (!['sharps', 'flats', 'auto'].includes(pref)) return;
  saveSetting('picker.enharmonic', pref);
}

function resolveRootId(cell) {
  if (cell.natural) return cell.id;
  const pref = getEnharmonicPref();
  if (pref === 'flats') return cell.flat;
  if (pref === 'sharps') return cell.sharp;
  // auto / contextual: prefer whatever is currently selected if related
  return cell.sharp;
}

function normalizeRootSelection(value) {
  if (ROOTS.includes(value)) return value;
  if (ENHARMONIC_PAIRS[value] && ROOTS.includes(ENHARMONIC_PAIRS[value])) {
    return ENHARMONIC_PAIRS[value];
  }
  return value;
}

function intervalFormulaFromScale(name) {
  const def = SCALES[name];
  if (!def) return '';
  const labels = {
    0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
    6: 'b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
  };
  // Blues has both b5 and 5 at letter-offset 4 — show both labels.
  return def.map(([, so]) => labels[((so % 12) + 12) % 12] || String(so)).join(' · ');
}

function chordFormula(name) {
  const def = CHORDS[name];
  if (!def) return '';
  return def.tones.map(([, , label]) => (label === 'R' ? '1' : label)).join(' · ');
}

const SCALE_CATEGORIES = [
  { id: 'common', label: 'Common' },
  { id: 'major-modes', label: 'Major scale modes' },
  { id: 'minor-modes', label: 'Natural minor and minor modes' },
  { id: 'harmonic', label: 'Harmonic minor modes' },
  { id: 'melodic', label: 'Melodic minor modes' },
  { id: 'penta', label: 'Pentatonic and blues' },
  { id: 'symmetric', label: 'Symmetric scales' },
  { id: 'dim-alt', label: 'Diminished and altered' },
  { id: 'exotic', label: 'Exotic scales' },
];

const SCALE_CATEGORY_MAP = {
  'Major (Ionian)': 'common',
  'Natural Minor (Aeolian)': 'common',
  'Dorian': 'major-modes',
  'Phrygian': 'major-modes',
  'Lydian': 'major-modes',
  'Mixolydian': 'major-modes',
  'Locrian': 'major-modes',
  'Harmonic Minor': 'harmonic',
  'Phrygian Dominant': 'harmonic',
  'Melodic Minor (Asc)': 'melodic',
  'Lydian Dominant': 'melodic',
  'Altered': 'dim-alt',
  'Major Pentatonic': 'penta',
  'Minor Pentatonic': 'penta',
  'Blues': 'penta',
  'Whole Tone': 'symmetric',
  'Diminished H-W': 'dim-alt',
  'Diminished W-H': 'dim-alt',
  'Hungarian Minor': 'exotic',
  'Double Harmonic Major': 'exotic',
  'Neapolitan Minor': 'exotic',
  'Neapolitan Major': 'exotic',
  'Persian': 'exotic',
  'Enigmatic': 'exotic',
  'Bebop Dominant': 'exotic',
  'Hirajoshi': 'exotic',
  'In-Sen': 'exotic',
};

// Also put natural minor under minor-modes for discoverability via category
// (it already appears in Common). Search still finds it either way.

const CHORD_CATEGORIES = [
  { id: 'triads', label: 'Triads' },
  { id: 'suspended', label: 'Suspended' },
  { id: 'added', label: 'Added-tone' },
  { id: 'sixth', label: 'Sixth chords' },
  { id: 'seventh', label: 'Seventh chords' },
  { id: 'extended', label: 'Extended chords' },
  { id: 'altered', label: 'Altered dominant' },
  { id: 'diminished', label: 'Diminished' },
  { id: 'augmented', label: 'Augmented' },
  { id: 'dark', label: 'Dark / metal' },
];

function chordCategory(name) {
  if (DARK_METAL_CHORDS.has(name) && /Root \+|b2|Tritone|b6|m7b5|dim|Minor 9|Minor 11|Minor Add/.test(name)) {
    // Prefer dark bucket for metal-oriented entries when they aren't core triads/7ths.
    if (name.startsWith('Root +') || name === 'Minor Add 9') return 'dark';
  }
  if (/Sus/.test(name)) return 'suspended';
  if (/Add/.test(name)) return 'added';
  if (name === 'Minor 6' || name === 'Major 6') return 'sixth';
  if (/b9|#9|b5|#5/.test(name) && /Dominant/.test(name)) return 'altered';
  if (/9|11|13/.test(name)) return 'extended';
  if (/Diminished|m7b5|Half Diminished/.test(name)) return 'diminished';
  if (/Augmented/.test(name)) return 'augmented';
  if (/7/.test(name) || name === 'Dominant 7') return 'seventh';
  if (/Triad|Major$|Minor$|Power|Power Chord/.test(name)) return 'triads';
  if (DARK_METAL_CHORDS.has(name)) return 'dark';
  return 'triads';
}

const TUNING_CATEGORIES = [
  { id: 'standard', label: 'Standard-family' },
  { id: 'drop', label: 'Drop' },
  { id: 'alternate', label: 'Alternate / Open' },
  { id: 'seven', label: 'Seven-string' },
  { id: 'eight', label: 'Eight-string' },
  { id: 'bass', label: 'Bass' },
  { id: 'custom', label: 'Custom' },
];

function tuningCategory(name) {
  if (name === 'Custom') return 'custom';
  const preset = findPresetByName(name);
  if (preset?.category) return preset.category === 'open' ? 'alternate' : preset.category;
  if (/^8-String/.test(name)) return 'eight';
  if (/^7-String/.test(name)) return 'seven';
  if (/^Bass/.test(name)) return 'bass';
  if (/Open|DADGAD|FACGCE|Double Drop/.test(name)) return 'alternate';
  if (/^Drop/.test(name)) return 'drop';
  return 'standard';
}

function tuningPitches(name) {
  const strings = TUNINGS[name];
  if (!strings) return '';
  return pitchSequenceString(strings);
}

function scaleKeywords(name) {
  const short = shortScaleName(name);
  const formula = intervalFormulaFromScale(name);
  const aliases = [];
  if (name.includes('Ionian')) aliases.push('ionian', 'major');
  if (name.includes('Aeolian')) aliases.push('aeolian', 'minor', 'natural minor');
  if (name.includes('Melodic')) aliases.push('jazz minor');
  if (name.includes('Whole Tone')) aliases.push('wholetone', 'whole-tone');
  if (name.includes('Diminished')) aliases.push('octatonic', 'dim');
  if (name.includes('Altered')) aliases.push('super locrian', 'diminished whole tone');
  return [short, formula.replace(/ · /g, ' '), formula.replace(/ · /g, ''), ...aliases];
}

function chordKeywords(name) {
  const def = CHORDS[name];
  const sym = def?.sym || '';
  const formula = chordFormula(name);
  const aliases = [sym, sym.toLowerCase()];
  if (sym === 'm7') aliases.push('min7', 'minor 7', 'minor7');
  if (sym === 'maj9') aliases.push('major 9', 'maj 9');
  if (sym === 'm7b5') aliases.push('half diminished', 'ø', 'min7b5');
  if (sym === '5') aliases.push('power', 'power chord');
  if (DARK_METAL_CHORDS.has(name)) aliases.push('dark', 'metal');
  if (sym.includes('#')) aliases.push(sym.replace('#', 'sharp'));
  return [formula.replace(/ · /g, ' '), ...aliases];
}

/** Route a picker write to the scope local layer or saved defaults. */
export function writePickerValue(scopeId, partial, source) {
  if (typeof scopeId === 'string' && scopeId.length > 0) {
    return setLocal(scopeId, partial);
  }
  return setContext(partial, source);
}

const COMMON_METERS = ['2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '9/8', '12/8'];

function buildTempoOptions(current) {
  const steps = [];
  for (let bpm = 40; bpm <= 240; bpm += 5) steps.push(bpm);
  const cur = Math.round(Number(current));
  if (Number.isFinite(cur) && cur >= 40 && cur <= 240 && !steps.includes(cur)) steps.push(cur);
  steps.sort((a, b) => a - b);
  return steps;
}

function meterOptions(current) {
  const meters = [...COMMON_METERS];
  if (current && !meters.includes(current)) meters.push(current);
  return meters;
}

/* ── Root picker ─────────────────────────────────────────────── */

export function openRootPicker({
  value,
  source = 'root-picker',
  syncContext = true,
  scopeId,
} = {}) {
  const current = normalizeRootSelection(value || 'C');
  const recent = getList('picker.recentRoots', ROOTS);
  const favorites = getList('picker.favoriteRoots', ROOTS);
  const pref = getEnharmonicPref();

  const items = ROOT_GRID.map(cell => {
    const id = cell.natural ? cell.id : (pref === 'flats' ? cell.flat : cell.sharp);
    return {
      id,
      label: cell.label,
      natural: !!cell.natural,
      keywords: cell.natural ? [cell.id] : [cell.sharp, cell.flat, cell.label],
    };
  });

  // Also allow selecting either enharmonic spelling via search
  ROOTS.forEach(r => {
    if (!items.some(it => it.id === r)) {
      items.push({ id: r, label: r, keywords: [r, ENHARMONIC_PAIRS[r]].filter(Boolean) });
    }
  });

  return openSelectionSheet({
    title: 'Root',
    value: current,
    search: true,
    searchPlaceholder: 'C, F#, Bb…',
    recent,
    favorites,
    grid: true,
    gridClass: 'root-grid',
    items,
    onToggleFavorite: (id) => toggleFavorite('picker.favoriteRoots', id, { allowed: ROOTS }),
    renderItem: (item, el) => {
      el.classList.toggle('root-natural', !!item.natural);
      el.innerHTML = `<span class="sel-item-label">${item.label}</span>`;
    },
    onSelect: (id) => {
      pushRecent('picker.recentRoots', id, { allowed: ROOTS });
      if (syncContext) writePickerValue(scopeId, { root: id }, source);
    },
  }).then(id => {
    // Pref toolbar: inject enharmonic toggle into header once sheet is open —
    // handled via a small floating control below when needed.
    return id;
  });
}

/** Open root picker with an enharmonic preference strip prepended via custom items category. */
export async function pickRoot(opts = {}) {
  // Lightweight pref cycle before opening: long-press not required; we expose
  // a sticky row by temporarily using categories for Recent/Favorites only.
  const pref = getEnharmonicPref();
  // Cycle hint stored for UI consumers
  saveSetting('picker.enharmonic', pref);
  const result = await openRootPicker(opts);
  return result;
}

export function cycleEnharmonicPref() {
  const order = ['auto', 'sharps', 'flats'];
  const cur = getEnharmonicPref();
  const next = order[(order.indexOf(cur) + 1) % order.length];
  setEnharmonicPref(next);
  return next;
}

/* ── Scale picker ────────────────────────────────────────────── */

export function openScalePicker({
  value,
  source = 'scale-picker',
  syncContext = true,
  scopeId,
} = {}) {
  const current = value && SCALES[value] ? value : 'Major (Ionian)';
  const recent = getList('picker.recentScales', Object.keys(SCALES));
  const favorites = getList('picker.favoriteScales', Object.keys(SCALES));

  const items = Object.keys(SCALES).map(name => ({
    id: name,
    label: shortScaleName(name),
    sub: intervalFormulaFromScale(name),
    meta: name !== shortScaleName(name) ? name : '',
    category: SCALE_CATEGORY_MAP[name] || 'exotic',
    keywords: scaleKeywords(name),
  }));

  // Ensure natural minor also searchable under minor-modes mentally via keywords
  return openSelectionSheet({
    title: 'Scale',
    value: current,
    searchPlaceholder: 'phrygian, b2, harmonic…',
    recent,
    favorites,
    categories: SCALE_CATEGORIES,
    items,
    onToggleFavorite: (id) => {
      toggleFavorite('picker.favoriteScales', id, { allowed: Object.keys(SCALES) });
    },
    onSelect: (id) => {
      pushRecent('picker.recentScales', id, { allowed: Object.keys(SCALES) });
      saveSetting('picker.lastScale', id);
      if (syncContext) writePickerValue(scopeId, { scale: id }, source);
    },
  });
}

export function getQuickScales(cap = 5) {
  const allowed = Object.keys(SCALES);
  const fav = getList('picker.favoriteScales', allowed);
  const recent = getList('picker.recentScales', allowed);
  const last = getSetting('picker.lastScale', null);
  const common = ['Major (Ionian)', 'Natural Minor (Aeolian)', 'Dorian', 'Phrygian', 'Minor Pentatonic'];
  const out = [];
  const add = (id) => {
    if (id && SCALES[id] && !out.includes(id)) out.push(id);
  };
  if (last) add(last);
  fav.forEach(add);
  recent.forEach(add);
  common.forEach(add);
  return out.slice(0, cap);
}

/* ── Chord quality picker ────────────────────────────────────── */

export function openChordPicker({ value } = {}) {
  const names = Object.keys(CHORDS);
  const current = value && CHORDS[value] ? value : 'Major';
  const recent = getList('picker.recentChords', names);
  const favorites = getList('picker.favoriteChords', names);

  const items = names.map(name => {
    const def = CHORDS[name];
    return {
      id: name,
      label: name,
      sub: `${def.sym ? def.sym + ' · ' : ''}${chordFormula(name)}`,
      meta: DARK_METAL_CHORDS.has(name) ? 'dark' : '',
      category: chordCategory(name),
      keywords: chordKeywords(name),
    };
  });

  return openSelectionSheet({
    title: 'Chord quality',
    value: current,
    searchPlaceholder: 'm7, maj9, 7#11, sus2…',
    recent,
    favorites,
    categories: CHORD_CATEGORIES,
    items,
    onToggleFavorite: (id) => toggleFavorite('picker.favoriteChords', id, { allowed: names }),
    onSelect: (id) => {
      pushRecent('picker.recentChords', id, { allowed: names });
      saveSetting('picker.lastChord', id);
    },
  });
}

/* ── Tuning picker ───────────────────────────────────────────── */

export function openTuningPicker({
  value,
  includeCustom = false,
  onCustom,
  stringCount = null,
  scopeId,
  source = 'tuning-picker',
  syncContext = true,
} = {}) {
  // Prefer catalog names (deduped) so legacy aliases don't double-list.
  const catalogNames = TUNING_CATALOG.map((p) => p.name);
  const legacyOnly = Object.keys(TUNINGS).filter((n) => !catalogNames.includes(n));
  const names = [...catalogNames, ...legacyOnly];
  const current = value && (TUNINGS[value] || value === 'Custom' || findPresetByName(value))
    ? (findPresetByName(value)?.name || value)
    : 'Standard';
  const recent = getList('picker.recentTunings', [...names, 'Custom']);
  const favorites = getList('picker.favoriteTunings', [...names, 'Custom']);

  const items = names
    .filter((name) => {
      if (stringCount == null) return true;
      const strings = TUNINGS[name];
      return strings && strings.length === stringCount;
    })
    .map((name) => {
      const strings = TUNINGS[name] || findPresetByName(name)?.pitches || [];
      const preset = findPresetByName(name);
      const seq = tuningPitches(name);
      return {
        id: name,
        label: name,
        sub: `${strings.length} string · ${seq}`,
        category: tuningCategory(name),
        keywords: [
          name,
          seq,
          String(strings.length),
          ...(preset?.aliases || []),
          ...(preset?.legacyKeys || []),
          ...(preset?.tags || []),
          strings.map((s) => s.note).join(''),
        ],
      };
    });

  if (includeCustom) {
    items.push({
      id: 'Custom',
      label: 'Custom…',
      sub: 'Open the custom tuning editor',
      category: 'custom',
      keywords: ['custom', 'editor'],
    });
  }

  return openSelectionSheet({
    title: 'Tuning',
    value: current,
    searchPlaceholder: 'Drop C, CGCFAD, 7-string…',
    recent,
    favorites,
    categories: TUNING_CATEGORIES,
    items,
    onToggleFavorite: (id) => toggleFavorite('picker.favoriteTunings', id, { allowed: [...names, 'Custom'] }),
    onSelect: (id) => {
      pushRecent('picker.recentTunings', id, { allowed: [...names, 'Custom'] });
      saveSetting('picker.lastTuning', id);
      if (id === 'Custom' && typeof onCustom === 'function') onCustom();
      else if (syncContext && typeof scopeId === 'string' && scopeId.length > 0) {
        writePickerValue(scopeId, { tuning: id }, source);
      }
    },
  });
}

/* ── Tempo picker ────────────────────────────────────────────── */

export function openTempoPicker({
  value,
  scopeId,
  source = 'tempo-picker',
  syncContext = true,
} = {}) {
  const current = Math.round(Number(value)) || 120;
  const tempos = buildTempoOptions(current);
  const recent = getList('picker.recentTempos', tempos.map(String));
  const favorites = getList('picker.favoriteTempos', tempos.map(String));

  const items = tempos.map((bpm) => ({
    id: String(bpm),
    label: `${bpm} BPM`,
    sub: bpm < 80 ? 'Slow' : bpm > 160 ? 'Fast' : 'Moderate',
    keywords: [String(bpm), `${bpm} bpm`, `${bpm} tempo`],
  }));

  return openSelectionSheet({
    title: 'Tempo',
    value: String(current),
    search: true,
    searchPlaceholder: '120, 90, 140…',
    recent,
    favorites,
    items,
    onToggleFavorite: (id) => toggleFavorite('picker.favoriteTempos', id, { allowed: tempos.map(String) }),
    onSelect: (id) => {
      const bpm = Number(id);
      pushRecent('picker.recentTempos', id, { allowed: tempos.map(String) });
      saveSetting('picker.lastTempo', bpm);
      if (syncContext) writePickerValue(scopeId, { tempo: bpm }, source);
    },
  });
}

/* ── Meter picker ────────────────────────────────────────────── */

export function openMeterPicker({
  value,
  scopeId,
  source = 'meter-picker',
  syncContext = true,
} = {}) {
  const current = value || '4/4';
  const meters = meterOptions(current);
  const recent = getList('picker.recentMeters', meters);
  const favorites = getList('picker.favoriteMeters', meters);

  const items = meters.map((meter) => ({
    id: meter,
    label: meter,
    sub: meter.endsWith('/8') ? 'Compound' : 'Simple',
    keywords: [meter, meter.replace('/', ' '), `${meter} time`],
  }));

  return openSelectionSheet({
    title: 'Meter',
    value: current,
    search: true,
    searchPlaceholder: '4/4, 3/4, 6/8…',
    recent,
    favorites,
    items,
    onToggleFavorite: (id) => toggleFavorite('picker.favoriteMeters', id, { allowed: meters }),
    onSelect: (id) => {
      pushRecent('picker.recentMeters', id, { allowed: meters });
      saveSetting('picker.lastMeter', id);
      if (syncContext) writePickerValue(scopeId, { meter: id }, source);
    },
  });
}

export function formatChordLabel(root, chordName) {
  const def = CHORDS[chordName];
  if (!def) return `${root} ${chordName}`;
  if (def.sym === '') return `${root} Major`;
  // Prefer friendly name for readability in headers
  return `${root} ${chordName.replace(/ \(.*\)/, '')}`;
}

export function formatChordSymbol(root, chordName) {
  const def = CHORDS[chordName];
  if (!def) return root;
  return root + (def.sym || '');
}

export { NOTE_NAMES_SHARP, shortScaleName };
