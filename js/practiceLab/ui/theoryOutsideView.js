// The Outside view of the Theory tab.
//
// Staying in one mode is a starting point, not a rule. This view shows the two
// normal ways to leave it:
//
//   * Bend a chord you already hold. Raise its fifth, flatten its third, or
//     give it a flat ninth. One tone steps out of the key and the chord gets a
//     new name.
//   * Take a chord from somewhere else. A parallel mode, the dominant of a
//     chord that is not the tonic, or the diminished 7 under it.
//
// Every card names the notes that leave the key, and the neck rings them, so
// the move is visible and not only a label.

import { el, clear, panel } from './dom.js';
import { keyChords, keyNotes, scaleLabel } from '../model/theoryChords.js';
import { alterationsFor, borrowedChords, outsideMoves } from '../model/theoryOutside.js';

/**
 * @param {{onSelectChord: Function}} handlers
 */
export function createOutsideView({ onSelectChord } = {}) {
  let bendDegree = 0;
  let openGroup = 'secondary';

  const bendRow = el('div', { class: 'pl-chip-row plt-bend-row' });
  const bendGrid = el('div', { class: 'plt-move-grid' });
  const groupRow = el('div', { class: 'pl-chip-row plt-group-row' });
  const groupBody = el('div', { class: 'plt-move-body' });
  const scaleNote = el('p', { class: 'pl-notice' });

  const bendPanel = panel('Bend a chord of the key', 'plt-bend');
  bendPanel.body.append(bendRow, bendGrid);

  const outPanel = panel('Take a chord from outside', 'plt-outside');
  outPanel.body.append(groupRow, groupBody);

  const root = el('div', { class: 'plt-outside-root' }, [scaleNote, bendPanel.root, outPanel.root]);

  let state = null;

  function render(next) {
    state = next;
    const { root: rootNote, scale, size, chord } = next;
    const chords = keyChords(rootNote, scale, size);

    scaleNote.hidden = chords.length > 0;
    bendPanel.root.hidden = !chords.length;
    outPanel.root.hidden = !chords.length;
    if (!chords.length) {
      scaleNote.textContent = `${scaleLabel(scale)} does not have seven notes, so it has no chord set to leave. `
        + 'Pick a seven-note mode to explore the moves out of a key.';
      return;
    }

    if (bendDegree >= chords.length) bendDegree = 0;
    paintBend(chords, rootNote, scale, chord);
    paintGroups(rootNote, scale, size, chord);
  }

  function paintBend(chords, rootNote, scale, focus) {
    clear(bendRow);
    bendRow.appendChild(el('span', { class: 'pl-field-label', text: 'Start from' }));
    chords.forEach((chord, i) => {
      const on = i === bendDegree;
      const btn = el('button', {
        type: 'button',
        class: `plt-pill${on ? ' active' : ''}`,
        text: chord.symbol,
        on: {
          click: () => {
            bendDegree = i;
            if (state) render(state);
          },
        },
      });
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      bendRow.appendChild(btn);
    });

    const key = keyNotes(rootNote, scale);
    const source = chords[bendDegree];
    const moves = alterationsFor(source, key ? key.pcs : []);

    clear(bendGrid);
    bendGrid.appendChild(el('p', {
      class: 'plt-move-lead',
      text: `Each card moves one tone of ${source.symbol}. A card marked "stays in the key" is a colour you `
        + 'already own. The rest borrow a note.',
    }));
    for (const move of moves) {
      bendGrid.appendChild(moveCard(move, focus, move.moveLabel));
    }
  }

  function paintGroups(rootNote, scale, size, focus) {
    const groups = outsideMoves(rootNote, scale, { size });
    const borrowed = borrowedChords(rootNote, scale, { size });
    const all = [
      ...groups,
      ...borrowed.map(group => ({
        id: `borrow:${group.source}`,
        label: `From ${group.label}`,
        hint: `Chords of ${group.label} that ${rootNote} ${scaleLabel(scale)} does not hold. `
          + 'This is modal interchange: the root stays, the mode changes for one chord.',
        chords: group.chords,
      })),
    ].filter(group => group.chords.length);

    if (!all.some(group => group.id === openGroup)) openGroup = all.length ? all[0].id : '';

    clear(groupRow);
    for (const group of all) {
      const on = group.id === openGroup;
      const btn = el('button', {
        type: 'button',
        class: `plt-pill${on ? ' active' : ''}`,
        text: `${group.label} (${group.chords.length})`,
        on: {
          click: () => {
            openGroup = group.id;
            if (state) render(state);
          },
        },
      });
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      groupRow.appendChild(btn);
    }

    clear(groupBody);
    const active = all.find(group => group.id === openGroup);
    if (!active) return;
    groupBody.appendChild(el('p', { class: 'plt-move-lead', text: active.hint }));
    const grid = el('div', { class: 'plt-move-grid' });
    for (const chord of active.chords) {
      grid.appendChild(moveCard(chord, focus, chord.role || chord.roman || ''));
    }
    groupBody.appendChild(grid);
  }

  function moveCard(chord, focus, kicker) {
    const on = !!focus && focus.symbol === chord.symbol && focus.formula.join() === chord.formula.join();
    const outside = chord.outsideNotes && chord.outsideNotes.length
      ? `Borrows ${chord.outsideNotes.join(', ')}`
      : 'Stays in the key';
    const card = el('button', {
      type: 'button',
      class: `plt-move-card${on ? ' selected' : ''}${chord.outsideNotes && chord.outsideNotes.length ? '' : ' inside'}`,
      on: { click: () => onSelectChord?.(chord) },
    }, [
      kicker ? el('span', { class: 'plt-move-kicker', text: kicker }) : null,
      el('span', { class: 'plt-move-symbol', text: chord.symbol }),
      el('span', { class: 'plt-move-name', text: chord.name }),
      el('span', { class: 'plt-move-notes', text: chord.notes.join(' ') }),
      el('span', { class: 'plt-move-outside', text: outside }),
      chord.why ? el('span', { class: 'plt-move-why', text: chord.why }) : null,
    ]);
    card.setAttribute('aria-pressed', on ? 'true' : 'false');
    return card;
  }

  return { root, render };
}
