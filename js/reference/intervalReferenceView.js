/**
 * The Interval Reference.
 *
 * One table names each degree above the tonic, what it does to the ear, and
 * what a writer uses it for. A row opens a detail panel with the distance in
 * semitones, the note above the current tonal center, the places that note
 * sits on the current instrument, the scales that hold the degree, and two
 * short compositional examples.
 *
 * Study mounts this view as a tool page. Composition Lab mounts the same view
 * inside a reference drawer. There is one component and one table.
 *
 * The view never opens a row on its own. An exercise asks for an answer first,
 * so the reference must not point at the answer before the player commits.
 */

import { INTERVAL_DEGREES, degreeById, intervalName, noteForDegree, scalesWithDegree, fretsForDegree } from './intervalTable.js';
import { renderFretboard } from '../scaleFretboard.js';
import { openMidisOf } from './neckView.js';
import { el, clear, infoRow, block } from './dom.js';

/**
 * Build the Interval Reference.
 * @param {Object} [handlers]
 * @param {Function} [handlers.onSelect] runs with the degree id, or '' on close
 * @param {boolean} [handlers.compact] draw the short form for a drawer
 * @returns {{root: HTMLElement, render: Function, select: Function, selected: Function}}
 */
export function createIntervalReference({ onSelect, compact = false } = {}) {
  let state = {
    tonic: 'C',
    strings: [],
    fretStart: 0,
    fretEnd: 12,
  };
  let selected = '';

  const intro = el('p', {
    class: 'mref-intro',
    text: 'The words below describe how each degree tends to behave. They are guidance, '
      + 'not fixed emotional meanings. The same degree changes job when the context changes.',
  });

  const table = el('div', { class: 'mref-int-table' });
  const detail = el('div', { class: 'mref-int-detail' });

  const root = el('div', { class: `mref-root mref-intervals${compact ? ' compact' : ''}` }, [
    intro, table, detail,
  ]);

  function head() {
    return el('div', { class: 'mref-int-head' }, [
      el('span', { text: 'Degree' }),
      el('span', { text: 'Note' }),
      el('span', { text: 'Character' }),
      el('span', { text: 'Common compositional functions' }),
    ]);
  }

  function paintTable() {
    clear(table);
    table.appendChild(head());
    for (const degree of INTERVAL_DEGREES) {
      const on = degree.id === selected;
      const note = noteForDegree(state.tonic, degree.id) || '—';
      const row = el('button', {
        type: 'button',
        class: `mref-int-row${on ? ' active' : ''}`,
        on: { click: () => select(on ? '' : degree.id) },
      }, [
        el('span', { class: `mref-degree deg-${degree.semitones}`, text: degree.id }),
        el('span', { class: 'mref-int-note', text: note }),
        el('span', { class: 'mref-int-character', text: degree.character }),
        el('span', { class: 'mref-int-function', text: degree.functions }),
      ]);
      row.setAttribute('aria-pressed', on ? 'true' : 'false');
      row.setAttribute('aria-label',
        `${degree.id}, ${degree.name}, ${note} above ${state.tonic}. ${degree.character}.`);
      table.appendChild(row);
    }
  }

  function paintNeck(degree) {
    const strings = state.strings || [];
    if (!strings.length) return null;
    const openMidis = openMidisOf(strings);
    const spots = fretsForDegree({
      tonic: state.tonic,
      degreeId: degree.id,
      openMidis,
      start: state.fretStart,
      end: state.fretEnd,
    });
    const keys = new Set(spots.map(s => `${s.string}:${s.fret}`));
    const tonicSpots = fretsForDegree({
      tonic: state.tonic,
      degreeId: '1',
      openMidis,
      start: state.fretStart,
      end: state.fretEnd,
    });
    const tonicKeys = new Set(tonicSpots.map(s => `${s.string}:${s.fret}`));

    const board = el('div', { class: 'ref-fretboard mref-board' });
    renderFretboard({
      board,
      strings,
      openMidis,
      start: state.fretStart,
      end: state.fretEnd,
      box: null,
      noteFor: ({ string, fret }) => {
        const key = `${string}:${fret}`;
        if (keys.has(key)) {
          return {
            label: degree.id,
            classes: [`deg-${degree.semitones}`, 'in-pos'],
            title: `${noteForDegree(state.tonic, degree.id)} · ${degree.id} above ${state.tonic}`,
          };
        }
        if (tonicKeys.has(key)) {
          return {
            label: '1',
            classes: ['deg-0', 'root', 'dim'],
            title: `${state.tonic} · the tonal center`,
          };
        }
        return null;
      },
    });
    const wrap = el('div', { class: 'ref-fb-scroll' }, [board]);
    const spot = block('On the neck', 'mref-int-neck');
    spot.body.append(
      el('p', {
        class: 'mref-hint',
        text: `${spots.length} place${spots.length === 1 ? '' : 's'} between fret `
          + `${state.fretStart} and fret ${state.fretEnd}. The dim markers are the tonal center.`,
      }),
      wrap,
    );
    return spot.root;
  }

  function paintDetail() {
    clear(detail);
    const degree = degreeById(selected);
    if (!degree) {
      detail.appendChild(el('p', {
        class: 'mref-hint',
        text: 'Pick a degree to see its distance, its note above the current tonal center, '
          + 'where it sits on the neck, and the scales that hold it.',
      }));
      return;
    }

    const note = noteForDegree(state.tonic, degree.id) || '—';
    const scales = scalesWithDegree(degree.id);
    const facts = block(`${degree.id} — ${degree.name}`, 'mref-int-facts');
    facts.body.append(
      infoRow('Distance', `${degree.semitones} semitone${degree.semitones === 1 ? '' : 's'} · ${intervalName(degree.semitones)}`),
      infoRow(`Above ${state.tonic}`, note),
      infoRow('Character', degree.character),
      infoRow('Functions', degree.functions),
    );

    const examples = block('Compositional examples', 'mref-int-examples');
    for (const line of degree.examples) {
      examples.body.appendChild(el('p', { class: 'mref-example', text: line }));
    }

    const inScales = block('Scales and modes that hold it', 'mref-int-scales');
    inScales.body.appendChild(el('div', { class: 'mref-tag-row' },
      scales.map(s => el('span', { class: 'mref-tag', text: s.short, attrs: { title: s.name } }))));

    detail.append(facts.root, examples.root, inScales.root);
    const neck = paintNeck(degree);
    if (neck) detail.appendChild(neck);
  }

  function select(id) {
    selected = degreeById(id) ? id : '';
    paintTable();
    paintDetail();
    onSelect?.(selected);
  }

  /**
   * Paint the reference.
   * @param {Object} next
   * @param {string} next.tonic the tonal center
   * @param {{note:string,oct:number}[]} [next.strings] the tuning
   * @param {number} [next.fretStart]
   * @param {number} [next.fretEnd]
   */
  function render(next = {}) {
    state = { ...state, ...next };
    paintTable();
    paintDetail();
  }

  render();

  return {
    root,
    render,
    select,
    selected: () => selected,
  };
}
