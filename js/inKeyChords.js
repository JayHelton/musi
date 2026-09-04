/**
 * The in-key chord quality reference.
 *
 * The Map view of the Chord Reference answers "what does a chord look like on
 * the neck". This panel answers the question that comes before it: "which
 * chords does this key give me, and what quality is each one?".
 *
 * A seven-note key builds one triad on each degree. Three of those triads are
 * major, three are minor, and one is diminished in the major scale. Other modes
 * move that map, and Harmonic Minor even adds an augmented triad. The panel
 * marks each of the four traditional qualities — major, minor, diminished and
 * augmented — with its own colour, so the quality of a degree is readable at a
 * glance.
 *
 * The chords come from `reference/keyChords.js`, so this panel and the shared
 * Chord Reference name one chord set for a key. No chord formula lives here.
 */

import { ROOTS, NOTE_NAMES_SHARP } from './theory.js';
import { SCALES, groupedScaleEntries } from './scales.js';
import { getSetting, saveSetting } from './persistence.js';
import { getContext } from './musicalContext.js';
import { keyChords, keyNotes } from './reference/keyChords.js';

const DEFAULT_SCALE = 'Major (Ionian)';

// The four traditional triad qualities, in the order the summary lists them.
// `catalog` names the chord in js/chords.js that the Map view draws.
const TRADITIONAL_QUALITIES = [
  { quality: 'major', name: 'Major', catalog: 'Major' },
  { quality: 'minor', name: 'Minor', catalog: 'Minor' },
  { quality: 'diminished', name: 'Diminished', catalog: 'Diminished Triad' },
  { quality: 'augmented', name: 'Augmented', catalog: 'Augmented' },
];

// Qualities outside the traditional four still open on the neck, because some
// modes stack a suspension or an altered fifth on one of their degrees.
const EXTRA_CATALOG = { sus2: 'Sus 2', sus4: 'Sus 4' };

const QUALITY_CATALOG = Object.fromEntries([
  ...TRADITIONAL_QUALITIES.map(q => [q.quality, q.catalog]),
  ...Object.entries(EXTRA_CATALOG),
]);

let ikRoot = 'C';
let ikScale = DEFAULT_SCALE;
let ikSelect = null;
let ikWired = false;

/** The seven-note scales, which are the only scales that stack into triads. */
function heptatonicScaleEntries() {
  return groupedScaleEntries(false)
    .filter(entry => entry.type === 'label' || SCALES[entry.val]?.length === 7);
}

/** A root the Map view accepts. Spellings such as "E#" fall back to "F". */
function neckRoot(chord) {
  if (ROOTS.includes(chord.root)) return chord.root;
  return NOTE_NAMES_SHARP[chord.rootPc] || 'C';
}

/** True when the chord is one of the four traditional triad qualities. */
function isTraditional(chord) {
  return TRADITIONAL_QUALITIES.some(entry => entry.quality === chord.quality);
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
  ));
}

function buildRootPicker() {
  const select = document.getElementById('inkey-root');
  if (!select) return;
  select.innerHTML = ROOTS
    .map(root => `<option value="${root}"${root === ikRoot ? ' selected' : ''}>${root}</option>`)
    .join('');
}

function buildScalePicker() {
  const select = document.getElementById('inkey-scale');
  if (!select) return;
  let html = '';
  let open = false;
  heptatonicScaleEntries().forEach(entry => {
    if (entry.type === 'label') {
      if (open) html += '</optgroup>';
      html += `<optgroup label="${escapeHtml(entry.label)}">`;
      open = true;
      return;
    }
    const on = entry.val === ikScale ? ' selected' : '';
    html += `<option value="${escapeHtml(entry.val)}"${on}>${escapeHtml(entry.label)}</option>`;
  });
  if (open) html += '</optgroup>';
  select.innerHTML = html;
}

function renderSummary(chords) {
  const box = document.getElementById('inkey-summary');
  if (!box) return;

  const items = TRADITIONAL_QUALITIES.map(({ quality, name }) => {
    const list = chords.filter(chord => chord.quality === quality);
    const text = list.length ? list.map(chord => chord.symbol).join(' · ') : 'none in this key';
    return `<div class="inkey-sum-item q-${quality}${list.length ? '' : ' empty'}">` +
      `<span class="inkey-sum-name">${name} (${list.length})</span>` +
      `<span class="inkey-sum-chords">${escapeHtml(text)}</span></div>`;
  });

  const others = chords.filter(chord => !isTraditional(chord));
  if (others.length) {
    const text = others.map(chord => `${chord.symbol} (${chord.name})`).join(' · ');
    items.push('<div class="inkey-sum-item q-other">' +
      `<span class="inkey-sum-name">Other (${others.length})</span>` +
      `<span class="inkey-sum-chords">${escapeHtml(text)}</span></div>`);
  }

  box.innerHTML = items.join('');
}

function renderCards(chords, onSelectChord) {
  const grid = document.getElementById('inkey-grid');
  if (!grid) return;
  grid.innerHTML = chords.map(chord => {
    const cls = `inkey-card q-${escapeHtml(chord.quality)}${isTraditional(chord) ? '' : ' other'}`;
    return `<button type="button" class="${cls}" data-degree="${chord.degree}">` +
      `<span class="inkey-roman">${escapeHtml(chord.roman)}</span>` +
      `<span class="inkey-symbol">${escapeHtml(chord.symbol)}</span>` +
      `<span class="inkey-quality">${escapeHtml(chord.name)}</span>` +
      `<span class="inkey-notes">${escapeHtml(chord.notes.join(' '))}</span>` +
      '</button>';
  }).join('');

  grid.querySelectorAll('.inkey-card').forEach(card => {
    const chord = chords[Number(card.dataset.degree)];
    if (!chord) return;
    const catalog = QUALITY_CATALOG[chord.quality];
    if (!catalog) {
      card.disabled = true;
      card.title = `${chord.name} has no single shape in the chord list.`;
      return;
    }
    card.title = `Show ${chord.symbol} on the neck in the Map view`;
    card.onclick = () => onSelectChord?.({ root: neckRoot(chord), chord: catalog });
  });
}

/** Draw the panel for the key that the pickers hold. */
export function renderInKeyChords() {
  const grid = document.getElementById('inkey-grid');
  if (!grid) return;
  const chords = keyChords(ikRoot, ikScale, 3);
  const label = document.getElementById('inkey-key-label');
  if (label) label.textContent = keyNotes(ikRoot, ikScale)?.notes.join(' ') || '';

  if (!chords.length) {
    grid.innerHTML = '<p class="inkey-empty">This scale does not have seven notes, so it builds no triad set.</p>';
    const box = document.getElementById('inkey-summary');
    if (box) box.innerHTML = '';
    return;
  }

  renderSummary(chords);
  renderCards(chords, ikSelect);
}

/**
 * Build the panel and its pickers.
 * @param {Object} [handlers]
 * @param {Function} [handlers.onSelectChord] runs with `{root, chord}` on a tap
 */
export function initInKeyChords({ onSelectChord } = {}) {
  const rootSelect = document.getElementById('inkey-root');
  if (!rootSelect) return;
  ikSelect = onSelectChord;

  const ctx = getContext();
  const contextRoot = ROOTS.includes(ctx.root) ? ctx.root : 'C';
  const contextScale = SCALES[ctx.scale]?.length === 7 ? ctx.scale : DEFAULT_SCALE;
  ikRoot = getSetting('chordref.keyRoot', contextRoot, ROOTS);
  ikScale = getSetting('chordref.keyScale', contextScale, Object.keys(SCALES));
  if (SCALES[ikScale]?.length !== 7) ikScale = DEFAULT_SCALE;

  buildRootPicker();
  buildScalePicker();

  if (!ikWired) {
    ikWired = true;
    rootSelect.onchange = () => {
      ikRoot = ROOTS.includes(rootSelect.value) ? rootSelect.value : ikRoot;
      saveSetting('chordref.keyRoot', ikRoot);
      renderInKeyChords();
    };
    const scaleSelect = document.getElementById('inkey-scale');
    if (scaleSelect) {
      scaleSelect.onchange = () => {
        if (SCALES[scaleSelect.value]?.length === 7) ikScale = scaleSelect.value;
        saveSetting('chordref.keyScale', ikScale);
        renderInKeyChords();
      };
    }
  }

  renderInKeyChords();
}
