// The Chords view of the Theory tab.
//
// It answers two questions at once. The card row says which chords the mode
// gives, and the quality filter says where one quality sits inside the key —
// "show me every diminished 7 I can play here". The compare panel puts a
// second mode beside the first, so a switch from Natural Minor to Harmonic
// Minor shows exactly which chords moved.

import { el, clear, panel, select } from './dom.js';
import { CHORD_SIZES, keyChords, compareKeys, qualityIndex, scaleLabel } from '../model/theoryChords.js';

const ALL = '__all__';

/**
 * @param {{onSelectChord: Function, onSizeChange: Function, onCompareChange: Function}} handlers
 */
export function createChordsView({ onSelectChord, onSizeChange, onCompareChange, scaleOptions } = {}) {
  let quality = ALL;

  const sizeRow = el('div', { class: 'pl-chip-row plt-size-row' });
  const qualityRow = el('div', { class: 'pl-chip-row plt-quality-row' });
  const cardGrid = el('div', { class: 'plt-chord-grid' });
  const compareBody = el('div', { class: 'plt-compare' });
  const scaleNote = el('p', { class: 'pl-notice' });

  const comparePicker = select({
    label: 'Compare with',
    value: '',
    options: [{ id: '', label: 'No comparison' }, ...(scaleOptions || [])],
    onChange: (value) => onCompareChange?.(value),
  });

  const view = panel('Chords in this mode', 'plt-chords');
  view.head.appendChild(comparePicker.root);
  view.body.append(scaleNote, sizeRow, qualityRow, cardGrid, compareBody);

  /**
   * @param {Object} state
   * @param {string} state.root
   * @param {string} state.scale
   * @param {number} state.size
   * @param {string} state.compareScale
   * @param {Object|null} state.chord the chord in focus
   */
  function render(state) {
    const { root, scale, size, compareScale, chord } = state;
    const chords = keyChords(root, scale, size);

    scaleNote.hidden = chords.length > 0;
    if (!chords.length) {
      scaleNote.textContent = `${scaleLabel(scale)} does not have seven notes, so it builds no chord set. `
        + 'Pick a seven-note mode to see its chords. The neck above still shows every note of the scale.';
      clear(sizeRow); clear(qualityRow); clear(cardGrid); clear(compareBody);
      return;
    }

    paintSizes(size);
    paintQualities(root, scale);
    paintCards(chords, chord);
    paintCompare(root, scale, compareScale, size);
  }

  function paintSizes(size) {
    clear(sizeRow);
    sizeRow.appendChild(el('span', { class: 'pl-field-label', text: 'Build' }));
    for (const option of CHORD_SIZES) {
      const on = option.id === size;
      const btn = el('button', {
        type: 'button',
        class: `plt-pill${on ? ' active' : ''}`,
        text: option.label,
        on: { click: () => onSizeChange?.(option.id) },
      });
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      sizeRow.appendChild(btn);
    }
  }

  function paintQualities(root, scale) {
    clear(qualityRow);
    const groups = qualityIndex(root, scale);
    if (!groups.length) return;
    qualityRow.appendChild(el('span', { class: 'pl-field-label', text: 'Find a quality' }));

    const entries = [{ quality: ALL, name: 'Every chord', chords: [] }, ...groups];
    for (const group of entries) {
      const on = group.quality === quality;
      const count = group.chords.length;
      const btn = el('button', {
        type: 'button',
        class: `plt-pill${on ? ' active' : ''}`,
        text: count ? `${group.name} (${count})` : group.name,
        on: {
          click: () => {
            quality = group.quality;
            paintQualities(root, scale);
            paintCards(currentChords, currentFocus);
          },
        },
      });
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (group.quality !== ALL) {
        btn.title = group.chords.map(c => c.symbol).join(', ');
      }
      qualityRow.appendChild(btn);
    }
  }

  let currentChords = [];
  let currentFocus = null;
  let currentRoot = '';
  let currentScale = '';

  function paintCards(chords, focus) {
    currentChords = chords;
    currentFocus = focus;
    clear(cardGrid);

    // With a quality picked, the grid leaves the one-chord-per-degree layout
    // and lists every chord of that quality at every stack size.
    const list = quality === ALL
      ? chords
      : qualityIndex(currentRoot, currentScale).find(g => g.quality === quality)?.chords || [];

    if (!list.length) {
      cardGrid.appendChild(el('p', { class: 'pl-notice', text: 'This mode holds no chord of that quality.' }));
      return;
    }

    for (const item of list) {
      const on = !!focus && focus.id === item.id && focus.root === item.root;
      const card = el('button', {
        type: 'button',
        class: `plt-chord-card${on ? ' selected' : ''}`,
        on: { click: () => onSelectChord?.(item) },
      }, [
        el('span', { class: 'plt-chord-roman', text: item.roman }),
        el('span', { class: 'plt-chord-symbol', text: item.symbol }),
        el('span', { class: 'plt-chord-name', text: item.name }),
        el('span', { class: 'plt-chord-notes', text: item.notes.join(' ') }),
        el('span', { class: 'plt-chord-formula', text: item.formula.join(' ') }),
      ]);
      card.setAttribute('aria-pressed', on ? 'true' : 'false');
      cardGrid.appendChild(card);
    }
  }

  function paintCompare(root, scale, compareScale, size) {
    clear(compareBody);
    comparePicker.root.querySelector('select').value = compareScale || '';
    if (!compareScale || compareScale === scale) return;

    const result = compareKeys(root, scale, compareScale, size);
    if (!result) {
      compareBody.appendChild(el('p', {
        class: 'pl-notice',
        text: 'A comparison needs two seven-note modes.',
      }));
      return;
    }

    compareBody.append(
      el('div', { class: 'plt-compare-head' }, [
        el('span', { class: 'pl-field-label', text: 'What changes' }),
        el('span', {
          class: 'plt-compare-count',
          text: `${result.changed} of 7 chords move from ${scaleLabel(scale)} to ${scaleLabel(compareScale)}`,
        }),
      ]),
    );

    const table = el('div', { class: 'plt-compare-grid' });
    table.append(
      el('span', { class: 'plt-compare-th', text: 'Degree' }),
      el('span', { class: 'plt-compare-th', text: scaleLabel(scale) }),
      el('span', { class: 'plt-compare-th', text: scaleLabel(compareScale) }),
      el('span', { class: 'plt-compare-th', text: 'Notes that move' }),
    );

    for (const row of result.rows) {
      const moved = row.left.tones
        .map((tone, i) => (row.changedTones[i] ? `${tone.note} → ${row.right.tones[i]?.note || '—'}` : null))
        .filter(Boolean);
      const cls = row.changed ? ' changed' : '';
      table.append(
        el('span', { class: `plt-compare-cell${cls}`, text: row.left.roman }),
        el('button', {
          type: 'button',
          class: `plt-compare-cell chord${cls}`,
          text: row.left.symbol,
          on: { click: () => onSelectChord?.(row.left) },
        }),
        el('button', {
          type: 'button',
          class: `plt-compare-cell chord${cls}`,
          text: row.right.symbol,
          on: { click: () => onSelectChord?.({ ...row.right, fromScale: compareScale }) },
        }),
        el('span', { class: `plt-compare-cell moved${cls}`, text: moved.join(' · ') || 'no change' }),
      );
    }
    compareBody.appendChild(table);
  }

  return {
    root: view.root,
    render(state) {
      currentRoot = state.root;
      currentScale = state.scale;
      render(state);
    },
  };
}
