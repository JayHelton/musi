/**
 * In-app movable chord cards UI for the Chords reference section.
 * Reuses the chord-cards shape library and diagram renderer.
 */
import { SHAPES } from '../chord-cards/data/shapes.js';
import {
  filterShapes,
  renderDiagramSVG,
  tuningLabel,
  rootStringLabel,
} from '../chord-cards/src/render.js';
import {
  patternString,
  minRootFret,
  fretSpan,
} from '../chord-cards/src/validate.js';
import { getSetting, saveSetting } from './persistence.js';

/** Map Chord reference picker names → movable-card chordType values. */
const CHORD_REF_TO_CARD_TYPE = {
  'Power Chord (5)': 'Power (5)',
  'Major': 'Major',
  'Minor': 'Minor',
  'Minor Triad': 'Minor',
  'Major Triad': 'Major',
  'Sus 2': 'Sus2',
  'Sus 4': 'Sus4',
  'Add 9': 'Add9',
  'Minor Add 9': 'Minor add9',
  'Major 6': 'Major 6',
  'Minor 6': 'Minor 6',
  'Major 7': 'Maj7',
  'Minor 7': 'Minor 7',
  'Dominant 7': 'Dominant 7',
  'Half Diminished (m7b5)': 'Half-diminished (m7b5)',
  'Diminished 7': 'Diminished 7',
  'Diminished Triad': 'Diminished triad',
  'Augmented': 'Augmented',
  'Augmented Triad': 'Augmented',
  'Major 9': 'Maj9',
  'Minor 9': 'Minor 9',
  'Dominant 9': 'Dominant 9',
  'Minor 11': 'Minor 11',
  'Dominant 11': 'Dominant 11 (no3)',
  'Major 11': 'Dominant 11 (no3)',
  'Dominant 13': 'Dominant 13',
  'Minor 13': 'Minor 13',
  'Dominant 7 b5': 'Dominant 7b5',
  'Dominant 7 #5': 'Dominant 7#5',
  'Dominant 7 b9': 'Dominant 13b9',
};

const state = {
  deck: 'minimal',
  tuning: 'all',
  family: 'all',
  rootString: 'all',
  followSelection: true,
  showIntervals: true,
  showFingering: false,
  q: '',
  wired: false,
  /** @type {string|null} */
  selectionChord: null,
  /** @type {string|null} */
  selectionTuning: null,
};

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function tuningFamilyFromName(name) {
  if (!name) return null;
  if (/^Drop/i.test(name)) return 'drop';
  if (
    name === 'Standard' ||
    name === 'Half Step Down' ||
    name === 'C Standard' ||
    /^7-String Standard/i.test(name) ||
    /^8-String Standard/i.test(name)
  ) {
    return 'standard';
  }
  // Open / specialty tunings: don't force a family filter
  return null;
}

function cardTypeForChordRef(chordName) {
  return CHORD_REF_TO_CARD_TYPE[chordName] || null;
}

function renderAppCard(shape) {
  const minR = minRootFret(shape.frets);
  const span = fretSpan(shape.frets);
  const pattern = patternString(shape.frets);
  const symbol = shape.symbol ? `(${shape.symbol})` : '';
  const diagram = renderDiagramSVG(shape, {
    showIntervals: state.showIntervals,
    showFingering: state.showFingering,
    theme: 'dark',
    width: 156,
    height: 138,
  });

  return `
<article class="mcc-card" data-id="${esc(shape.id)}">
  <header class="mcc-card-head">
    <div>
      <div class="mcc-card-title">${esc(shape.chordType)} <span class="mcc-sym">${esc(symbol)}</span></div>
      <div class="mcc-card-meta">${esc(tuningLabel(shape.tuningType))} · ${esc(rootStringLabel(shape.rootString))}</div>
    </div>
    <div class="mcc-badges">
      <span class="mcc-badge">${esc(shape.voicingCategory)}</span>
      <span class="mcc-badge ${shape.practicalTag === 'minimal' ? 'mcc-badge-core' : ''}">${shape.practicalTag === 'minimal' ? 'Core' : 'Extended'}</span>
    </div>
  </header>
  <div class="mcc-card-body">
    <div class="mcc-diagram">${diagram}</div>
    <div class="mcc-info">
      <p><span class="mcc-k">Pattern</span> <code>${esc(pattern)}</code></p>
      ${state.showFingering && shape.fingering ? `<p><span class="mcc-k">Fingers</span> <code>${shape.fingering.map((x) => (x == null ? 'x' : x)).join(' ')}</code></p>` : ''}
      <p><span class="mcc-k">Use</span> ${esc(shape.bestUse)}</p>
      <p><span class="mcc-k">Play</span> ${esc(shape.playability)}</p>
      <p><span class="mcc-k">Pos</span> ${esc(shape.rootPositionNote)} · fret ${minR}+ (span ${span})</p>
      ${shape.notes ? `<p class="mcc-note"><span class="mcc-k">Note</span> ${esc(shape.notes)}</p>` : ''}
    </div>
  </div>
</article>`;
}

function readControls() {
  const deck = document.getElementById('mcc-deck');
  const tuning = document.getElementById('mcc-tuning');
  const family = document.getElementById('mcc-family');
  const root = document.getElementById('mcc-root');
  const follow = document.getElementById('mcc-follow');
  const intervals = document.getElementById('mcc-intervals');
  const fingering = document.getElementById('mcc-fingering');
  const search = document.getElementById('mcc-search');

  if (deck) state.deck = deck.value;
  if (tuning) state.tuning = tuning.value;
  if (family) state.family = family.value;
  if (root) state.rootString = root.value;
  if (follow) state.followSelection = follow.checked;
  if (intervals) state.showIntervals = intervals.checked;
  if (fingering) state.showFingering = fingering.checked;
  if (search) state.q = search.value.trim();
}

function persistControls() {
  saveSetting('mcc.deck', state.deck);
  saveSetting('mcc.tuning', state.tuning);
  saveSetting('mcc.family', state.family);
  saveSetting('mcc.rootString', state.rootString);
  saveSetting('mcc.followSelection', state.followSelection, [true, false]);
  saveSetting('mcc.showIntervals', state.showIntervals, [true, false]);
  saveSetting('mcc.showFingering', state.showFingering, [true, false]);
}

function applySelectionHints(list) {
  let shapes = list;
  if (!state.followSelection) return shapes;

  const cardType = cardTypeForChordRef(state.selectionChord);
  const tunFam = tuningFamilyFromName(state.selectionTuning);

  if (cardType) {
    const matched = shapes.filter((s) => s.chordType === cardType);
    if (matched.length) shapes = matched;
  }
  // Only apply selection tuning when the toolbar tuning filter is "all"
  if (tunFam && state.tuning === 'all') {
    const matched = shapes.filter((s) => s.tuningType === tunFam);
    if (matched.length) shapes = matched;
  }
  return shapes;
}

function renderMovableChordCards(selection = {}) {
  const grid = document.getElementById('mcc-grid');
  const status = document.getElementById('mcc-status');
  const followHint = document.getElementById('mcc-follow-hint');
  if (!grid) return;

  if (selection.chord != null) state.selectionChord = selection.chord;
  if (selection.tuning != null) state.selectionTuning = selection.tuning;

  readControls();

  let shapes = filterShapes(SHAPES, {
    deck: state.deck,
    tuning: state.tuning,
    family: state.family,
    rootString: state.rootString,
    q: state.q,
  });

  const beforeFollow = shapes.length;
  shapes = applySelectionHints(shapes);

  if (followHint) {
    const cardType = cardTypeForChordRef(state.selectionChord);
    const tunFam = tuningFamilyFromName(state.selectionTuning);
    if (state.followSelection && (cardType || tunFam)) {
      const bits = [];
      if (cardType) bits.push(cardType);
      if (tunFam) bits.push(tunFam === 'drop' ? 'drop tuning' : 'standard tuning');
      followHint.textContent = bits.length
        ? `Following selection: ${bits.join(' · ')}`
        : '';
    } else {
      followHint.textContent = state.followSelection
        ? 'Following selection (no matching movable shape for this chord — showing filtered deck)'
        : '';
    }
  }

  if (status) {
    status.textContent = `${shapes.length} shape${shapes.length === 1 ? '' : 's'}` +
      (state.followSelection && shapes.length !== beforeFollow
        ? ` (from ${beforeFollow} after filters)`
        : ` of ${SHAPES.length}`);
  }

  if (!shapes.length) {
    grid.innerHTML = `<div class="mcc-empty">No movable shapes match these filters. Try turning off “Follow selection” or widening the deck.</div>`;
    return;
  }

  grid.innerHTML = shapes.map(renderAppCard).join('');
}

function wireControls() {
  if (state.wired) return;
  const ids = [
    'mcc-deck', 'mcc-tuning', 'mcc-family', 'mcc-root',
    'mcc-follow', 'mcc-intervals', 'mcc-fingering', 'mcc-search',
  ];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const ev = el.tagName === 'INPUT' && el.type === 'text' ? 'input' : 'change';
    el.addEventListener(ev, () => {
      readControls();
      persistControls();
      renderMovableChordCards();
    });
    if (el.tagName === 'INPUT' && el.type === 'search') {
      el.addEventListener('input', () => {
        readControls();
        renderMovableChordCards();
      });
    }
  });

  document.getElementById('mcc-print')?.addEventListener('click', () => {
    window.open('chord-cards/dist/printable.html', '_blank', 'noopener');
  });
  document.getElementById('mcc-open')?.addEventListener('click', () => {
    window.open('chord-cards/', '_blank', 'noopener');
  });

  state.wired = true;
}

function restoreControls() {
  const deck = document.getElementById('mcc-deck');
  const tuning = document.getElementById('mcc-tuning');
  const family = document.getElementById('mcc-family');
  const root = document.getElementById('mcc-root');
  const follow = document.getElementById('mcc-follow');
  const intervals = document.getElementById('mcc-intervals');
  const fingering = document.getElementById('mcc-fingering');

  if (deck) deck.value = getSetting('mcc.deck', 'minimal', ['all', 'minimal']);
  if (tuning) tuning.value = getSetting('mcc.tuning', 'all', ['all', 'standard', 'drop']);
  if (family) {
    family.value = getSetting('mcc.family', 'all', [
      'all', 'core', 'sevenths', 'extended', 'altered',
    ]);
  }
  if (root) root.value = getSetting('mcc.rootString', 'all', ['all', '6', '5', '4']);
  if (follow) follow.checked = getSetting('mcc.followSelection', true, [true, false]);
  if (intervals) intervals.checked = getSetting('mcc.showIntervals', true, [true, false]);
  if (fingering) fingering.checked = getSetting('mcc.showFingering', false, [true, false]);
}

function initMovableChordCards(selection = {}) {
  if (!document.getElementById('mcc-grid')) return;
  restoreControls();
  wireControls();
  if (selection.chord != null) state.selectionChord = selection.chord;
  if (selection.tuning != null) state.selectionTuning = selection.tuning;
  renderMovableChordCards(selection);
}

export {
  initMovableChordCards,
  renderMovableChordCards,
  cardTypeForChordRef,
};
