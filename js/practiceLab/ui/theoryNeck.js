// The neck of the Theory tab.
//
// One neck serves every view. What changes is which notes it lights:
//
//   * no chord chosen — every note of the key, coloured by scale degree;
//   * a chord chosen — the tones of that chord, with the rest of the key dim;
//   * a voicing chosen — the frets that voicing presses, ringed on the neck;
//   * an out-of-key chord chosen — its outside tones ringed as borrowed notes.
//
// The drawing itself comes from `js/scaleFretboard.js`, the same neck the Scale
// Reference draws, so the two screens read the same way.

import { renderFretboard, MAX_FRET } from '../adapters/musiNeck.js';
import { INTERVAL_LABELS, NOTE_NAMES_SHARP, parseNote } from '../adapters/musiTheory.js';
import { el, panel, stepper, toggle } from './dom.js';

const DEGREE_LABELS = {
  0: 'R', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
  6: 'b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
};

/** Open-string MIDI notes of a tuning, low string first. */
export function openMidisOf(strings) {
  return strings.map((s) => {
    const parsed = parseNote(s.note);
    return parsed ? 12 * (s.oct + 1) + parsed.semi : 0;
  });
}

/**
 * Build the neck panel.
 * @param {{onRangeChange: Function, onLabelChange: Function}} handlers
 * @returns {{root: HTMLElement, render: Function, setRange: Function}}
 */
export function createTheoryNeck({ onRangeChange, onLabelChange } = {}) {
  let start = 0;
  let end = 15;
  let labelMode = 'degree';

  const board = el('div', { class: 'ref-fretboard plt-neck-board' });
  const scroll = el('div', { class: 'ref-fb-scroll' }, [board]);
  const legend = el('div', { class: 'plt-neck-legend' });
  const caption = el('p', { class: 'plt-neck-caption' });

  const startStep = stepper({
    label: 'First fret', value: start, min: 0, max: MAX_FRET - 1, step: 1,
    onChange: (value) => {
      start = Math.min(value, end - 1);
      startStep.set(start, false);
      onRangeChange?.({ start, end });
    },
  });
  const endStep = stepper({
    label: 'Last fret', value: end, min: 1, max: MAX_FRET, step: 1,
    onChange: (value) => {
      end = Math.max(value, start + 1);
      endStep.set(end, false);
      onRangeChange?.({ start, end });
    },
  });
  const labelToggle = toggle({
    label: 'Show note names',
    checked: false,
    onChange: (checked) => {
      labelMode = checked ? 'note' : 'degree';
      onLabelChange?.(labelMode);
    },
  });

  const view = panel('Neck', 'plt-neck');
  view.head.appendChild(el('div', { class: 'plt-neck-controls' }, [
    startStep.root, endStep.root, labelToggle.root,
  ]));
  view.body.append(caption, scroll, legend);

  /**
   * Paint the neck.
   * @param {Object} state
   * @param {{note:string, oct:number}[]} state.strings the tuning
   * @param {number[]} state.openMidis open-string MIDI notes
   * @param {number[]} state.keyPcs the pitch classes of the key
   * @param {string[]} state.keyNotes the spelled note of each key pitch class
   * @param {number} state.tonicPc the pitch class of the tonic
   * @param {Object|null} state.chord the chord in focus, or null
   * @param {Object|null} state.voicing the voicing in focus, or null
   * @param {string} state.summary the caption line
   */
  function render(state) {
    const {
      strings, openMidis, keyPcs, keyNotes: names, tonicPc,
      chord = null, voicing = null, summary = '',
    } = state;

    const inKey = new Set(keyPcs);
    const nameByPc = new Map();
    keyPcs.forEach((pc, i) => { if (!nameByPc.has(pc)) nameByPc.set(pc, names[i]); });

    const chordLabels = new Map();
    if (chord) {
      for (const tone of chord.tones) {
        if (!chordLabels.has(tone.pc)) chordLabels.set(tone.pc, tone);
      }
    }
    const voicingKeys = new Set();
    if (voicing) {
      voicing.frets.forEach((fret, s) => { if (fret != null) voicingKeys.add(`${s}:${fret}`); });
    }

    renderFretboard({
      board,
      strings,
      openMidis,
      start,
      end,
      box: null,
      noteFor: ({ string, fret, pc }) => {
        const tone = chordLabels.get(pc);
        const isKeyNote = inKey.has(pc);
        if (!tone && !isKeyNote) return null;
        // With a voicing in focus, the neck shows that shape and nothing else
        // gets in its way.
        const onVoicing = voicingKeys.has(`${string}:${fret}`);
        if (voicing && !onVoicing && !tone) return null;

        const interval = ((pc - tonicPc) % 12 + 12) % 12;
        const classes = [`deg-${interval}`];
        if (pc === tonicPc) classes.push('root');
        if (!isKeyNote) classes.push('out-of-key');
        if (chord) classes.push(tone ? 'in-pos' : 'dim');
        if (onVoicing) classes.push('anchor');
        if (voicing && !onVoicing) classes.push('dim');

        const noteName = nameByPc.get(pc) || (tone ? tone.note : NOTE_NAMES_SHARP[pc]);
        const label = labelMode === 'note'
          ? noteName
          : (tone ? tone.label : DEGREE_LABELS[interval]);
        return {
          label,
          classes,
          title: `${noteName} · ${INTERVAL_LABELS[interval] || interval} of the key`
            + (tone ? ` · ${tone.label} of ${chord.symbol}` : '')
            + (isKeyNote ? '' : ' · outside the key'),
        };
      },
    });

    caption.textContent = summary;
    paintLegend(chord, tonicPc, nameByPc, names, keyPcs);
  }

  function paintLegend(chord, tonicPc, nameByPc, names, keyPcs) {
    legend.textContent = '';
    const source = chord
      ? chord.tones.map(t => ({ pc: t.pc, label: t.label, note: t.note }))
      : keyPcs.map((pc, i) => ({
        pc,
        label: DEGREE_LABELS[((pc - tonicPc) % 12 + 12) % 12],
        note: names[i],
      }));
    for (const item of source) {
      const interval = ((item.pc - tonicPc) % 12 + 12) % 12;
      legend.appendChild(el('span', { class: 'plt-legend-item' }, [
        el('span', { class: `plt-legend-swatch deg-${interval}` }),
        el('span', { class: 'plt-legend-text', text: `${item.note} ${item.label}` }),
      ]));
    }
  }

  function setRange(nextStart, nextEnd) {
    start = nextStart;
    end = nextEnd;
    startStep.set(start, false);
    endStep.set(end, false);
  }

  return {
    root: view.root,
    render,
    setRange,
    get range() { return { start, end }; },
    get labelMode() { return labelMode; },
  };
}
