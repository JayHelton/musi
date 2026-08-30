// The panel under the neck that explains one chord and shows how to play it.
//
// Both the Chords view and the Outside view open the same panel, so a borrowed
// chord reads exactly like a chord of the key. The panel holds three parts:
// what the chord is, how far the stack can go, and every voicing the neck
// offers for it.

import { el, clear, panel, pressable, notice } from './dom.js';
import { findVoicings, groupByPosition } from './voicings.js';
import { voicingCard } from './voicingCard.js';

/**
 * @param {{onVoicing: Function, onLadder: Function, onPlay: Function}} handlers
 * @returns {{root: HTMLElement, render: Function, clear: Function}}
 */
/** How many shapes the panel shows before the player asks for the rest. */
const FIRST_PAGE = 12;

export function createChordDetail({ onVoicing, onLadder, onPlay } = {}) {
  let showAll = false;
  let lastState = null;
  const view = panel('Chord', 'plt-detail');
  const headline = el('div', { class: 'plt-detail-head' });
  const ladderRow = el('div', { class: 'plt-ladder' });
  const voicingBody = el('div', { class: 'plt-voicing-body' });
  const empty = el('p', {
    class: 'pl-notice',
    text: 'Pick a chord to see its notes and every shape this tuning gives you.',
  });

  view.body.append(empty, headline, ladderRow, voicingBody);
  headline.hidden = true;
  ladderRow.hidden = true;
  voicingBody.hidden = true;

  /**
   * @param {Object} state
   * @param {Object} state.chord the chord to explain
   * @param {number[]} state.openMidis open-string MIDI notes, low string first
   * @param {number} state.stringCount
   * @param {Object} state.limits the voicing search limits
   * @param {Array} [state.ladder] the triad-to-13th stack of the same degree
   * @param {Object|null} [state.voicing] the voicing in focus
   * @param {string} [state.context] a line saying where the chord comes from
   */
  function render(state) {
    const { chord, openMidis, stringCount, limits, ladder = [], voicing = null, context = '' } = state;
    if (!chord) { reset(); return; }
    // A new chord starts at the first page of shapes again.
    if (!lastState || lastState.chord !== chord) showAll = false;
    lastState = state;

    empty.hidden = true;
    headline.hidden = false;
    voicingBody.hidden = false;
    view.head.querySelector('.pl-panel-title').textContent = chord.symbol;

    clear(headline);
    // `Node.append` writes the text "null" for a null child, so the panel adds
    // its optional parts through `el`, which drops them.
    headline.appendChild(el('div', { class: 'plt-detail-body' }, [
      el('div', { class: 'plt-detail-title' }, [
        chord.roman ? el('span', { class: 'plt-roman', text: chord.roman }) : null,
        el('span', { class: 'plt-detail-symbol', text: chord.symbol }),
        el('span', { class: 'plt-detail-name', text: chord.name }),
      ]),
      el('div', { class: 'plt-detail-rows' }, [
        row('Notes', chord.notes.join(' – ')),
        row('Formula', chord.formula.join(' – ')),
        chord.outsideNotes && chord.outsideNotes.length
          ? row('Outside the key', chord.outsideNotes.join(', '), 'outside')
          : row('Inside the key', 'Every tone belongs to this mode.'),
      ]),
      context ? el('p', { class: 'plt-detail-why', text: context }) : null,
      typeof onPlay === 'function'
        ? el('div', { class: 'plt-detail-actions' }, [
          pressable({ label: 'Hear it', className: 'small', onPress: () => onPlay(chord) }),
        ])
        : null,
    ]));

    clear(ladderRow);
    ladderRow.hidden = ladder.length < 2;
    if (ladder.length >= 2) {
      ladderRow.appendChild(el('span', { class: 'pl-field-label', text: 'Stack it further' }));
      const chips = el('div', { class: 'plt-ladder-row' });
      for (const step of ladder) {
        const on = step.size === chord.size;
        const btn = el('button', {
          type: 'button',
          class: `plt-ladder-chip${on ? ' active' : ''}`,
          text: step.symbol,
          on: { click: () => onLadder?.(step) },
        });
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.title = `${step.name} · ${step.notes.join(' ')}`;
        chips.appendChild(btn);
      }
      ladderRow.appendChild(chips);
    }

    clear(voicingBody);
    const found = findVoicings({ openMidis, tones: chord.tones, limits });
    const voicings = showAll ? found : found.slice(0, FIRST_PAGE);
    if (!found.length) {
      voicingBody.appendChild(notice(
        'This tuning gives no shape for that chord inside the current limits. '
        + 'Raise the last fret, or allow open strings.',
        'warn',
      ));
      return;
    }

    voicingBody.appendChild(el('span', {
      class: 'pl-field-label',
      text: found.length === voicings.length
        ? `${found.length} shape${found.length === 1 ? '' : 's'} on this neck`
        : `${voicings.length} of ${found.length} shapes on this neck`,
    }));

    for (const group of groupByPosition(voicings)) {
      const grid = el('div', { class: 'plt-voicing-grid' });
      for (const item of group.voicings) {
        grid.appendChild(voicingCard({
          voicing: item,
          stringCount,
          selected: !!voicing && voicing.id === item.id,
          onSelect: (picked) => onVoicing?.(picked),
        }));
      }
      voicingBody.append(
        el('div', { class: 'plt-voicing-zone', text: `Frets ${group.from}–${group.to}` }),
        grid,
      );
    }

    if (found.length > voicings.length) {
      voicingBody.appendChild(pressable({
        label: `Show the other ${found.length - voicings.length} shapes`,
        className: 'small',
        onPress: () => { showAll = true; render(lastState); },
      }));
    }
  }

  function row(label, value, kind = '') {
    return el('div', { class: `plt-detail-row${kind ? ` ${kind}` : ''}` }, [
      el('span', { class: 'plt-detail-key', text: label }),
      el('span', { class: 'plt-detail-value', text: value }),
    ]);
  }

  function reset() {
    empty.hidden = false;
    headline.hidden = true;
    ladderRow.hidden = true;
    voicingBody.hidden = true;
    view.head.querySelector('.pl-panel-title').textContent = 'Chord';
  }

  return { root: view.root, render, clear: reset };
}
