/**
 * The shared Chord Reference.
 *
 * It answers the questions a writer asks about the chords of a key:
 *
 *   * Which chords does this root and this mode give me?
 *   * What changes when the mode changes?
 *   * How do I actually play this chord in this tuning?
 *   * How do I get out of the key on purpose?
 *
 * Every chord comes from `keyChords.js`, every shape from `voicings.js`, and
 * every way out from `outside.js`. No chord formula lives in this file.
 *
 * Study mounts this reference on a tool page. Composition Lab mounts the same
 * component inside its reference drawer. There is one implementation.
 */

import { TUNINGS, ROOTS } from '../theory.js';
import { SCALES, groupedScaleEntries } from '../scales.js';
import { resolveTuningKey } from '../tunings.js';
import { keyNotes, chordLadder, scaleLabel } from './keyChords.js';
import { createNeckView, openMidisOf } from './neckView.js';
import { createChordDetail } from './chordDetailView.js';
import { createChordsView } from './chordsView.js';
import { createOutsideView } from './outsideView.js';
import { playChord, stopChord } from './chordVoice.js';
import { el, clear, tabBar } from './dom.js';

const VIEWS = [
  { id: 'chords', label: 'In the key' },
  { id: 'outside', label: 'Outside' },
];

function scaleOptionList() {
  return groupedScaleEntries(false)
    .filter(entry => entry.type !== 'label')
    .map(entry => ({ id: entry.val, label: entry.label }));
}

/**
 * Build the Chord Reference.
 * @param {Object} [options]
 * @param {boolean} [options.compact] draw the short form for a drawer
 * @param {boolean} [options.showNeck] draw the neck above the views
 * @param {Function} [options.onRangeChange] runs with `{start, end}`
 * @returns {{root: HTMLElement, render: Function, stop: Function}}
 */
export function createChordReferenceCard({ compact = false, showNeck = true, onRangeChange } = {}) {
  let state = {
    root: 'C',
    scale: 'Major (Ionian)',
    tuning: 'Standard',
    size: 4,
    compareScale: '',
    view: 'chords',
    chord: null,
    voicing: null,
    chordContext: '',
    fretStart: 0,
    fretEnd: 15,
  };

  const limits = { maxFret: 15, allowOpen: true, rootInBass: true };

  const neck = showNeck
    ? createNeckView({
      onRangeChange: (range) => {
        state.fretStart = range.start;
        state.fretEnd = range.end;
        onRangeChange?.(range);
        paintNeck();
      },
      onLabelChange: () => paintNeck(),
    })
    : null;

  const detail = createChordDetail({
    onVoicing: (voicing) => {
      state.voicing = state.voicing && state.voicing.id === voicing.id ? null : voicing;
      paintNeck();
      paintDetail();
    },
    onLadder: (step) => { state.chord = step; state.voicing = null; paint(); },
    onPlay: (chord) => playChord(chord, state.voicing),
  });

  const chordsView = createChordsView({
    scaleOptions: scaleOptionList(),
    onSelectChord: chord => selectChord(chord),
    onSizeChange: (size) => { state.size = size; state.chord = null; state.voicing = null; paint(); },
    onCompareChange: (value) => { state.compareScale = value; paint(); },
  });

  const outsideView = createOutsideView({
    onSelectChord: chord => selectChord(chord, chord.why || ''),
  });

  const panels = { chords: chordsView.root, outside: outsideView.root };
  for (const [id, node] of Object.entries(panels)) {
    node.id = `mref-chord-panel-${id}`;
    node.setAttribute('role', 'tabpanel');
  }

  const tabs = tabBar({
    tabs: VIEWS,
    active: state.view,
    ariaLabel: 'Chord views',
    onChange: (id) => { state.view = id; paint(); },
  });
  tabs.root.querySelectorAll('.pl-tab').forEach((button, index) => {
    const id = VIEWS[index].id;
    button.id = `mref-chord-tab-${id}`;
    button.setAttribute('aria-controls', `mref-chord-panel-${id}`);
  });

  const root = el('div', { class: `mref-root mref-chords${compact ? ' compact' : ''}` }, [
    neck ? neck.root : null,
    el('div', { class: 'plt-tabrow' }, [tabs.root]),
    el('div', { class: 'plt-view-body' }, Object.values(panels)),
    detail.root,
  ]);

  function currentStrings() {
    return TUNINGS[state.tuning] || TUNINGS.Standard;
  }

  function selectChord(chord, why = '') {
    const same = state.chord
      && state.chord.symbol === chord.symbol
      && state.chord.formula.join() === chord.formula.join();
    state.chord = same ? null : chord;
    state.voicing = null;
    state.chordContext = same ? '' : why;
    paint();
  }

  function paintNeck() {
    if (!neck) return;
    const key = keyNotes(state.root, state.scale);
    if (!key) return;
    const strings = currentStrings();
    const chordLine = state.chord
      ? `${state.chord.symbol} — ${state.chord.notes.join(' ')}`
      : key.notes.join(' ');
    neck.render({
      strings,
      openMidis: openMidisOf(strings),
      keyPcs: key.pcs,
      keyNotes: key.notes,
      tonicPc: key.pcs[0],
      chord: state.chord,
      voicing: state.voicing,
      summary: `${state.root} ${scaleLabel(state.scale)} · ${state.tuning} · ${chordLine}`
        + (state.voicing ? ' · one shape in focus' : ''),
    });
  }

  function paintDetail() {
    const strings = currentStrings();
    if (!state.chord) { detail.clear(); return; }
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

  function paint() {
    for (const [id, node] of Object.entries(panels)) node.hidden = id !== state.view;
    tabs.setActive(state.view);
    paintNeck();
    if (state.view === 'chords') chordsView.render({ ...state });
    if (state.view === 'outside') outsideView.render({ ...state });
    paintDetail();
  }

  /**
   * Paint the reference.
   * @param {Object} next `root`, `scale`, `tuning`, `fretStart`, `fretEnd`
   */
  function render(next = {}) {
    const key = next.root !== state.root || next.scale !== state.scale;
    state = { ...state, ...next };
    if (!SCALES[state.scale]) state.scale = 'Major (Ionian)';
    if (!ROOTS.includes(state.root)) state.root = 'C';
    const tuning = resolveTuningKey(state.tuning);
    if (tuning && TUNINGS[tuning]) state.tuning = tuning;
    if (key) { state.chord = null; state.voicing = null; }
    if (neck) neck.setRange(state.fretStart, state.fretEnd);
    paint();
  }

  render();

  return {
    root,
    render,
    stop() { stopChord(); },
  };
}
