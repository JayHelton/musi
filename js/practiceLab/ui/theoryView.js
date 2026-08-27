// The Theory tab of the Practice Lab.
//
// One screen answers the questions a player asks while working on a key:
//
//   * What are the notes, and where do they sit on my neck?
//   * Which chords does this mode give me, and how do I play each one?
//   * What changes if I move from Natural Minor to Harmonic Minor?
//   * How do I get out of the key on purpose?
//
// The neck stays on screen for every view, because every answer is a place on
// the neck. The three views under it change what the neck lights up.
//
// The tab reads and writes the shared musical context, so the root, the mode,
// and the tuning follow the player into the Scale Reference and back.

import {
  ROOTS, TUNINGS, SCALES, INTERVAL_LABELS, groupedScaleEntries, scaleStepPattern,
  shortScaleName, resolveTuningKey,
} from '../adapters/musiTheory.js';
import {
  getContext, setContext, subscribeContext, getSetting, saveSetting,
} from '../adapters/musiPrefs.js';
import { el, clear, panel, tabBar, toggle, stepper } from './dom.js';
import { keyNotes, keyChords, chordLadder, scaleLabel } from '../model/theoryChords.js';
import { createTheoryNeck, openMidisOf } from './theoryNeck.js';
import { createChordDetail } from './theoryChordDetail.js';
import { createChordsView } from './theoryChordsView.js';
import { createOutsideView } from './theoryOutsideView.js';
import { playChord, stopChord } from '../adapters/musiChordVoice.js';

const VIEWS = [
  { id: 'notes', label: 'Notes' },
  { id: 'chords', label: 'Chords' },
  { id: 'outside', label: 'Outside' },
];

/** One-tap modes. They cover the switch a player makes most often. */
const QUICK_MODES = [
  'Major (Ionian)',
  'Natural Minor (Aeolian)',
  'Harmonic Minor',
  'Melodic Minor (Asc)',
  'Dorian',
  'Phrygian',
  'Mixolydian',
  'Lydian',
];

const SETTINGS = {
  view: 'pl.theory.view',
  size: 'pl.theory.size',
  compare: 'pl.theory.compare',
  tuning: 'pl.theory.tuning',
  fbStart: 'pl.theory.fbStart',
  fbEnd: 'pl.theory.fbEnd',
  maxFret: 'pl.theory.maxFret',
  allowOpen: 'pl.theory.allowOpen',
  rootInBass: 'pl.theory.rootInBass',
};

function scaleOptionList() {
  return groupedScaleEntries(false)
    .filter(entry => entry.type !== 'label')
    .map(entry => ({ id: entry.val, label: entry.label }));
}

/** A select that keeps the group headings of the scale list. */
function scaleSelect(value, onChange) {
  const node = el('select', {
    class: 'pl-select',
    on: { change: () => onChange(node.value) },
  });
  let group = null;
  for (const entry of groupedScaleEntries(false)) {
    if (entry.type === 'label') {
      group = el('optgroup');
      group.label = entry.label;
      node.appendChild(group);
      continue;
    }
    const option = el('option', { value: entry.val, text: entry.label });
    (group || node).appendChild(option);
  }
  node.value = value;
  node.setAttribute('aria-label', 'Mode or scale');
  return node;
}

function tuningSelect(value, onChange) {
  const node = el('select', {
    class: 'pl-select',
    on: { change: () => onChange(node.value) },
  }, Object.keys(TUNINGS).map(name => el('option', { value: name, text: name })));
  node.value = value;
  node.setAttribute('aria-label', 'Tuning');
  return node;
}

/**
 * Build the Theory tab.
 * @returns {{root: HTMLElement, stop: Function}}
 */
export function createTheoryView() {
  const context = getContext();

  const state = {
    root: ROOTS.includes(context.root) ? context.root : 'C',
    scale: SCALES[context.scale] ? context.scale : 'Major (Ionian)',
    tuning: resolveTuningKey(context.tuning) || getSetting(SETTINGS.tuning, 'Standard'),
    view: getSetting(SETTINGS.view, 'chords', VIEWS.map(v => v.id)),
    size: Number(getSetting(SETTINGS.size, 4)) || 4,
    compareScale: getSetting(SETTINGS.compare, ''),
    chord: null,
    voicing: null,
    chordContext: '',
  };

  const limits = {
    maxFret: Number(getSetting(SETTINGS.maxFret, 15)) || 15,
    allowOpen: getSetting(SETTINGS.allowOpen, true, [true, false]),
    rootInBass: getSetting(SETTINGS.rootInBass, true, [true, false]),
  };

  // --- controls ------------------------------------------------------------

  const rootRow = el('div', { class: 'plt-root-row' });
  const quickRow = el('div', { class: 'pl-chip-row plt-quick-row' });
  const modeNode = scaleSelect(state.scale, (value) => {
    state.scale = value;
    state.chord = null;
    state.voicing = null;
    setContext({ scale: value }, 'practicelab-theory');
    paint();
  });
  const tuningNode = tuningSelect(state.tuning, (value) => {
    state.tuning = value;
    state.voicing = null;
    saveSetting(SETTINGS.tuning, value);
    setContext({ tuning: value }, 'practicelab-theory');
    paint();
  });
  const summary = el('p', { class: 'plt-summary' });

  const maxFretStep = stepper({
    label: 'Search up to fret', value: limits.maxFret, min: 5, max: 24, step: 1,
    onChange: (value) => {
      limits.maxFret = value;
      saveSetting(SETTINGS.maxFret, value);
      paint();
    },
  });
  const openToggle = toggle({
    label: 'Allow open strings',
    checked: limits.allowOpen,
    onChange: (checked) => {
      limits.allowOpen = checked;
      saveSetting(SETTINGS.allowOpen, checked);
      paint();
    },
  });
  const bassToggle = toggle({
    label: 'Root in the bass',
    checked: limits.rootInBass,
    onChange: (checked) => {
      limits.rootInBass = checked;
      saveSetting(SETTINGS.rootInBass, checked);
      paint();
    },
  });

  const shapeOptions = el('details', { class: 'plt-shape-options' }, [
    el('summary', { text: 'Shape options' }),
    el('div', { class: 'pl-grid' }, [maxFretStep.root, openToggle.root, bassToggle.root]),
  ]);

  const controls = panel('Key', 'plt-controls');
  controls.body.append(
    el('div', { class: 'plt-control-grid' }, [
      // A <label> forwards a click to the first control it holds, so the root
      // chips sit in a plain group instead. A label here would move every tap
      // back to the first chip.
      el('div', { class: 'pl-field', attrs: { role: 'group', 'aria-label': 'Root note' } }, [
        el('span', { class: 'pl-field-label', text: 'Root' }),
        rootRow,
      ]),
      el('label', { class: 'pl-field' }, [
        el('span', { class: 'pl-field-label', text: 'Mode or scale' }),
        modeNode,
      ]),
      el('label', { class: 'pl-field' }, [
        el('span', { class: 'pl-field-label', text: 'Tuning' }),
        tuningNode,
      ]),
    ]),
    quickRow,
    summary,
    shapeOptions,
  );

  // --- neck, views, detail -------------------------------------------------

  const neck = createTheoryNeck({
    onRangeChange: ({ start, end }) => {
      saveSetting(SETTINGS.fbStart, start);
      saveSetting(SETTINGS.fbEnd, end);
      paintNeck();
    },
    onLabelChange: () => paintNeck(),
  });
  neck.setRange(
    Number(getSetting(SETTINGS.fbStart, 0)) || 0,
    Number(getSetting(SETTINGS.fbEnd, 15)) || 15,
  );

  const detail = createChordDetail({
    onVoicing: (voicing) => {
      state.voicing = state.voicing && state.voicing.id === voicing.id ? null : voicing;
      paintNeck();
      paintDetail();
    },
    onLadder: (step) => {
      state.chord = step;
      state.voicing = null;
      paint();
    },
    onPlay: (chord) => playChord(chord, state.voicing),
  });

  const chordsView = createChordsView({
    scaleOptions: scaleOptionList(),
    onSelectChord: (chord) => selectChord(chord),
    onSizeChange: (size) => {
      state.size = size;
      saveSetting(SETTINGS.size, size);
      state.chord = null;
      state.voicing = null;
      paint();
    },
    onCompareChange: (value) => {
      state.compareScale = value;
      saveSetting(SETTINGS.compare, value);
      paint();
    },
  });

  const outsideView = createOutsideView({
    onSelectChord: (chord) => selectChord(chord, chord.why || ''),
  });

  const notesPanel = panel('Notes of the key', 'plt-notes');
  const notesBody = el('div', { class: 'plt-notes-body' });
  notesPanel.body.appendChild(notesBody);

  const panels = {
    notes: notesPanel.root,
    chords: chordsView.root,
    outside: outsideView.root,
  };
  for (const [id, node] of Object.entries(panels)) {
    node.id = `plt-panel-${id}`;
    node.setAttribute('role', 'tabpanel');
    node.setAttribute('aria-labelledby', `plt-tab-${id}`);
  }

  const tabs = tabBar({
    tabs: VIEWS.map(v => ({ id: v.id, label: v.label })),
    active: state.view,
    ariaLabel: 'Theory views',
    onChange: (id) => {
      state.view = id;
      saveSetting(SETTINGS.view, id);
      paint();
    },
  });
  // The tab bar shares its markup with the trainer tabs, so give the buttons
  // ids of their own and keep the two bars apart for a screen reader.
  tabs.root.querySelectorAll('.pl-tab').forEach((button, index) => {
    const id = VIEWS[index].id;
    button.id = `plt-tab-${id}`;
    button.setAttribute('aria-controls', `plt-panel-${id}`);
  });

  const viewBody = el('div', { class: 'plt-view-body' }, Object.values(panels));

  const root = el('div', { class: 'plt-root' }, [
    controls.root,
    neck.root,
    el('div', { class: 'plt-tabrow' }, [tabs.root]),
    viewBody,
    detail.root,
  ]);

  // --- state changes -------------------------------------------------------

  function selectChord(chord, why = '') {
    const same = state.chord
      && state.chord.symbol === chord.symbol
      && state.chord.formula.join() === chord.formula.join();
    state.chord = same ? null : chord;
    state.voicing = null;
    state.chordContext = same ? '' : why;
    paint();
  }

  function currentStrings() {
    return TUNINGS[state.tuning] || TUNINGS.Standard;
  }

  function paintRoots() {
    clear(rootRow);
    for (const note of ROOTS) {
      const on = note === state.root;
      const btn = el('button', {
        type: 'button',
        class: `plt-root-chip${on ? ' active' : ''}`,
        text: note,
        on: {
          click: () => {
            state.root = note;
            state.chord = null;
            state.voicing = null;
            setContext({ root: note }, 'practicelab-theory');
            paint();
          },
        },
      });
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      rootRow.appendChild(btn);
    }
  }

  function paintQuickModes() {
    clear(quickRow);
    quickRow.appendChild(el('span', { class: 'pl-field-label', text: 'Quick switch' }));
    for (const name of QUICK_MODES) {
      if (!SCALES[name]) continue;
      const on = name === state.scale;
      const btn = el('button', {
        type: 'button',
        class: `plt-pill${on ? ' active' : ''}`,
        text: shortScaleName(name),
        on: {
          click: () => {
            state.scale = name;
            state.chord = null;
            state.voicing = null;
            modeNode.value = name;
            setContext({ scale: name }, 'practicelab-theory');
            paint();
          },
        },
      });
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      quickRow.appendChild(btn);
    }
  }

  function paintNeck() {
    const key = keyNotes(state.root, state.scale);
    if (!key) return;
    const strings = currentStrings();
    const chordLine = state.chord
      ? `${state.chord.symbol} — ${state.chord.notes.join(' ')}`
      : `${key.notes.join(' ')}`;
    const voicingLine = state.voicing ? ' · one shape in focus' : '';
    neck.render({
      strings,
      openMidis: openMidisOf(strings),
      keyPcs: key.pcs,
      keyNotes: key.notes,
      tonicPc: key.pcs[0],
      chord: state.chord,
      voicing: state.voicing,
      summary: `${state.root} ${scaleLabel(state.scale)} · ${state.tuning} · ${chordLine}${voicingLine}`,
    });
  }

  function paintNotes() {
    const key = keyNotes(state.root, state.scale);
    clear(notesBody);
    if (!key) return;
    const degreeLabels = ['R', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
    // Each cell also names the chord that degree carries, so the note grid and
    // the chord grid read as one key and not as two lists.
    const chords = keyChords(state.root, state.scale, state.size);
    const grid = el('div', { class: 'plt-note-grid' });
    key.notes.forEach((note, i) => {
      const interval = ((key.pcs[i] - key.pcs[0]) % 12 + 12) % 12;
      const chord = chords[i] || null;
      const cell = el('button', {
        type: 'button',
        class: 'plt-note-cell',
        on: { click: () => (chord ? selectChord(chord) : null) },
        disabled: !chord,
      }, [
        el('span', { class: 'plt-note-degree', text: degreeLabels[i] || `${i + 1}` }),
        el('span', { class: 'plt-note-name', text: note }),
        el('span', { class: 'plt-note-swatch deg-' + interval }),
        el('span', { class: 'plt-note-interval', text: INTERVAL_LABELS[interval] || String(interval) }),
        chord ? el('span', { class: 'plt-note-chord', text: chord.symbol }) : null,
      ]);
      if (chord) cell.title = `${chord.name} · ${chord.notes.join(' ')}`;
      grid.appendChild(cell);
    });
    notesBody.append(
      el('div', { class: 'plt-detail-rows' }, [
        infoRow('Notes', key.notes.join(' – ')),
        infoRow('Steps', scaleStepPattern(state.scale) || '—'),
        infoRow('Note count', `${key.size} notes`),
      ]),
      grid,
      el('p', {
        class: 'pl-hint',
        text: 'Turn on "Show note names" over the neck to read letters instead of scale degrees.',
      }),
    );
  }

  function infoRow(label, value) {
    return el('div', { class: 'plt-detail-row' }, [
      el('span', { class: 'plt-detail-key', text: label }),
      el('span', { class: 'plt-detail-value', text: value }),
    ]);
  }

  function paintDetail() {
    const strings = currentStrings();
    if (!state.chord) {
      detail.clear();
      return;
    }
    const ladder = state.chord.degree >= 0 && state.chord.inKey
      ? chordLadder(state.root, state.scale, state.chord.degree)
      : [];
    detail.render({
      chord: state.chord,
      openMidis: openMidisOf(strings),
      stringCount: strings.length,
      limits,
      ladder,
      voicing: state.voicing,
      context: state.chordContext,
    });
  }

  function paintSummary() {
    const chords = keyChords(state.root, state.scale, state.size);
    const set = chords.length ? chords.map(c => c.symbol).join('  ') : 'no seven-note chord set';
    summary.textContent = `${state.root} ${scaleLabel(state.scale)}: ${set}`;
  }

  function paint() {
    paintRoots();
    paintQuickModes();
    modeNode.value = state.scale;
    tuningNode.value = state.tuning;
    paintSummary();
    paintNeck();

    for (const [id, node] of Object.entries(panels)) node.hidden = id !== state.view;
    tabs.setActive(state.view);

    if (state.view === 'notes') paintNotes();
    if (state.view === 'chords') chordsView.render({ ...state });
    if (state.view === 'outside') outsideView.render({ ...state });

    paintDetail();
  }

  const unsubscribe = subscribeContext((next, source) => {
    if (source === 'practicelab-theory') return;
    let changed = false;
    if (next.root !== state.root && ROOTS.includes(next.root)) { state.root = next.root; changed = true; }
    if (next.scale !== state.scale && SCALES[next.scale]) { state.scale = next.scale; changed = true; }
    const tuning = resolveTuningKey(next.tuning);
    if (tuning && tuning !== state.tuning && TUNINGS[tuning]) { state.tuning = tuning; changed = true; }
    if (!changed) return;
    state.chord = null;
    state.voicing = null;
    paint();
  });

  paint();

  return {
    root,
    stop() {
      stopChord();
      unsubscribe();
    },
  };
}
