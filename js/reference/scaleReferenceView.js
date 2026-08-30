/**
 * The shared Scale Reference.
 *
 * It answers the four questions a writer asks about a collection: which notes,
 * which degrees, which step pattern, and where the notes sit on the neck. The
 * numbers come from `js/scales.js`, the same catalog the Scale Reference tool
 * reads, so the two screens never disagree.
 *
 * The card keeps its own root and its own scale. A player can look up another
 * mode inside a drawer without moving the tonal center of the exercise.
 */

import {
  SCALES, getScaleNotes, groupedScaleEntries, scaleStepPattern, shortScaleName,
  scaleIntervalClasses,
} from '../scales.js';
import { ROOTS, TUNINGS } from '../theory.js';
import { resolveTuningKey } from '../tunings.js';
import { degreeLabel, degreeBySemitones } from './intervalTable.js';
import { keyNotes } from './keyChords.js';
import { createNeckView, openMidisOf } from './neckView.js';
import { el, clear, infoRow, block } from './dom.js';

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
    (group || node).appendChild(el('option', { value: entry.val, text: entry.label }));
  }
  node.value = value;
  node.setAttribute('aria-label', 'Scale or mode');
  return node;
}

function pickList(label, value, options, onChange) {
  const node = el('select', {
    class: 'pl-select',
    on: { change: () => onChange(node.value) },
  }, options.map(opt => el('option', { value: opt, text: opt })));
  node.value = options.includes(value) ? value : options[0];
  node.setAttribute('aria-label', label);
  return node;
}

/**
 * Build the Scale Reference.
 * @param {Object} [options]
 * @param {boolean} [options.compact] draw the short form for a drawer
 * @param {Function} [options.onRangeChange] runs with `{start, end}`
 * @returns {{root: HTMLElement, render: Function, stop: Function}}
 */
export function createScaleReferenceCard({ compact = false, onRangeChange } = {}) {
  let state = {
    root: 'C',
    scale: 'Major (Ionian)',
    tuning: 'Standard',
    fretStart: 0,
    fretEnd: 12,
  };

  const rootNode = pickList('Root note', state.root, ROOTS, (value) => {
    state.root = value;
    paint();
  });
  const scaleNode = scaleSelect(state.scale, (value) => { state.scale = value; paint(); });
  const tuningNode = pickList('Tuning', state.tuning, Object.keys(TUNINGS), (value) => {
    state.tuning = value;
    paint();
  });

  const controls = el('div', { class: 'mref-controls' }, [
    el('label', { class: 'mref-field' }, [
      el('span', { class: 'mref-field-label', text: 'Root' }), rootNode,
    ]),
    el('label', { class: 'mref-field' }, [
      el('span', { class: 'mref-field-label', text: 'Scale or mode' }), scaleNode,
    ]),
    el('label', { class: 'mref-field' }, [
      el('span', { class: 'mref-field-label', text: 'Tuning' }), tuningNode,
    ]),
  ]);

  const facts = block('Formula', 'mref-scale-facts');
  const degreeRow = el('div', { class: 'mref-degree-row' });

  const neck = createNeckView({
    onRangeChange: (range) => {
      state.fretStart = range.start;
      state.fretEnd = range.end;
      onRangeChange?.(range);
      paintNeck();
    },
    onLabelChange: () => paintNeck(),
  });

  const root = el('div', { class: `mref-root mref-scales${compact ? ' compact' : ''}` }, [
    controls, facts.root, degreeRow, neck.root,
  ]);

  function paintFacts() {
    clear(facts.body);
    const notes = getScaleNotes(state.root, state.scale);
    if (!notes) {
      facts.body.appendChild(el('p', { class: 'mref-hint', text: 'That root and scale do not spell.' }));
      return;
    }
    const classes = scaleIntervalClasses(state.scale);
    facts.body.append(
      infoRow('Notes', notes.join(' – ')),
      infoRow('Degrees', classes.map(degreeLabel).join(' ')),
      infoRow('Steps', scaleStepPattern(state.scale) || '—'),
      infoRow('Note count', `${notes.length} notes`),
    );
  }

  function paintDegrees() {
    clear(degreeRow);
    const notes = getScaleNotes(state.root, state.scale);
    const classes = scaleIntervalClasses(state.scale);
    if (!notes) return;
    classes.forEach((semi, i) => {
      const degree = degreeBySemitones(semi);
      degreeRow.appendChild(el('span', { class: `mref-degree-cell deg-${semi}` }, [
        el('span', { class: 'mref-degree-name', text: degreeLabel(semi) }),
        el('span', { class: 'mref-degree-note', text: notes[i] || '' }),
        el('span', {
          class: 'mref-degree-char',
          text: degree ? degree.character : 'Tritone color',
        }),
      ]));
    });
  }

  function paintNeck() {
    const key = keyNotes(state.root, state.scale);
    const strings = TUNINGS[state.tuning] || TUNINGS.Standard;
    if (!key) return;
    neck.render({
      strings,
      openMidis: openMidisOf(strings),
      keyPcs: key.pcs,
      keyNotes: key.notes,
      tonicPc: key.pcs[0],
      chord: null,
      voicing: null,
      summary: `${state.root} ${shortScaleName(state.scale)} · ${state.tuning} · ${key.notes.join(' ')}`,
    });
  }

  function paint() {
    rootNode.value = state.root;
    scaleNode.value = state.scale;
    tuningNode.value = state.tuning;
    paintFacts();
    paintDegrees();
    paintNeck();
  }

  /**
   * Paint the reference.
   * @param {Object} next `root`, `scale`, `tuning`, `fretStart`, `fretEnd`
   */
  function render(next = {}) {
    state = { ...state, ...next };
    if (!SCALES[state.scale]) state.scale = 'Major (Ionian)';
    if (!ROOTS.includes(state.root)) state.root = 'C';
    const tuning = resolveTuningKey(state.tuning);
    if (tuning && TUNINGS[tuning]) state.tuning = tuning;
    neck.setRange(state.fretStart, state.fretEnd);
    paint();
  }

  render();

  return { root, render, stop() { /* the scale card holds no voice */ } };
}
