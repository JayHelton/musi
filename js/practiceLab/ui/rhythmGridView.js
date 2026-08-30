// The attack grid of Composition Lab.
//
// Sixteen slots make one bar of 4/4 sixteenth notes. A tap turns an attack on
// or off. The grid holds rhythm and nothing else, and the pitch row under it
// opens only after the player asks for it. That order is the exercise: design
// the rhythm, then choose what the attacks play.

import {
  DEFAULT_SLOTS, GRID_SIZES, createGrid, toggleSlot, clearGrid, copyGrid,
  randomGrid, gridStats, checkConstraints, describeGrid, describeConstraints,
  prunePitches, displaceGrid, scaleGrid, reverseGrid, isDownbeat,
} from '../model/rhythmGrid.js';
import { degreesOfScale, degreeById } from '../adapters/musiReference.js';
import { el, clear, panel, pressable, stepper, toggle, notice } from './dom.js';

/**
 * Build the attack grid panel.
 * @param {{onChange?: Function}} [handlers] `onChange` receives `{cells, pitches}`
 * @returns {{root: HTMLElement, render: Function, cells: Function, pitches: Function}}
 */
export function createRhythmGrid({ onChange } = {}) {
  let cells = createGrid();
  let pitches = {};
  let config = {};
  let context = null;
  let showPitches = false;
  let copies = [];

  const slotRow = el('div', { class: 'plc-grid-row' });
  const readout = el('p', { class: 'plc-grid-readout' });
  const statsLine = el('p', { class: 'pl-hint plc-grid-stats' });
  const briefLine = el('div', { class: 'plc-grid-brief' });
  const checkLine = el('div', { class: 'plc-grid-check' });
  const pitchRow = el('div', { class: 'plc-pitch-row' });
  const copyRow = el('div', { class: 'plc-copy-row' });

  const attackStep = stepper({
    label: 'Attacks', value: 6, min: 1, max: 32, step: 1,
    onChange: () => { /* the value is read when the player randomises */ },
  });
  const restToggle = toggle({
    label: 'Require a three-slot rest',
    checked: false,
    onChange: () => { /* read at randomise time */ },
  });
  const offbeatToggle = toggle({
    label: 'Require an offbeat attack',
    checked: false,
    onChange: () => { /* read at randomise time */ },
  });
  const pairToggle = toggle({
    label: 'Require an adjacent pair',
    checked: false,
    onChange: () => { /* read at randomise time */ },
  });

  const sizeSelect = el('select', {
    class: 'pl-select plc-grid-size',
    on: {
      change: () => {
        const slots = Number(sizeSelect.value) || DEFAULT_SLOTS;
        cells = createGrid(slots);
        pitches = {};
        emit();
        paint();
      },
    },
  }, GRID_SIZES.map(size => el('option', { value: String(size), text: `${size} slots` })));
  sizeSelect.value = String(DEFAULT_SLOTS);
  sizeSelect.setAttribute('aria-label', 'Slots in the bar');

  const actions = el('div', { class: 'pl-row plc-grid-actions' }, [
    pressable({ label: 'Clear', className: 'small', onPress: () => { cells = clearGrid(cells); pitches = {}; emit(); paint(); } }),
    pressable({ label: 'Randomize', className: 'small', onPress: () => randomize() }),
    pressable({ label: 'Copy', className: 'small', onPress: () => addCopy() }),
    pressable({ label: 'Displace', className: 'small', onPress: () => { cells = displaceGrid(cells, 1); pitches = {}; emit(); paint(); } }),
    pressable({ label: 'Expand', className: 'small', onPress: () => { cells = scaleGrid(cells, 2); pitches = {}; emit(); paint(); } }),
    pressable({ label: 'Compress', className: 'small', onPress: () => { cells = scaleGrid(cells, 0.5); pitches = {}; emit(); paint(); } }),
    pressable({ label: 'Reverse', className: 'small', onPress: () => { cells = reverseGrid(cells); pitches = {}; emit(); paint(); } }),
  ]);

  const pitchToggle = pressable({
    label: 'Assign degrees',
    className: 'small',
    onPress: () => { showPitches = !showPitches; paint(); },
  });

  const view = panel('Rhythm grid', 'plc-grid');
  view.body.append(
    briefLine,
    slotRow,
    readout,
    statsLine,
    checkLine,
    el('details', { class: 'plc-grid-options' }, [
      el('summary', { text: 'Grid options' }),
      el('div', { class: 'pl-grid' }, [
        el('label', { class: 'pl-field' }, [
          el('span', { class: 'pl-field-label', text: 'Bar length' }),
          sizeSelect,
        ]),
        attackStep.root,
        restToggle.root,
        offbeatToggle.root,
        pairToggle.root,
      ]),
    ]),
    actions,
    el('div', { class: 'pl-row' }, [pitchToggle]),
    pitchRow,
    copyRow,
  );

  function emit() {
    pitches = prunePitches(cells, pitches);
    onChange?.({ cells: copyGrid(cells), pitches: { ...pitches } });
  }

  function activeConstraints() {
    if (config.constraints) return config.constraints;
    const out = {};
    out.attacks = attackStep.value();
    if (restToggle.checked()) out.minRest = 3;
    if (offbeatToggle.checked()) out.requireOffbeat = true;
    if (pairToggle.checked()) out.requireAdjacentPair = true;
    return out;
  }

  function randomize() {
    const result = randomGrid({ slots: cells.length, constraints: activeConstraints() });
    cells = result.grid;
    pitches = {};
    emit();
    paint();
  }

  function addCopy() {
    copies = [...copies.slice(-3), { cells: copyGrid(cells), pitches: { ...pitches } }];
    paint();
  }

  function allowedDegrees() {
    if (Array.isArray(config.allowed) && config.allowed.length) return config.allowed;
    if (!context) return ['1', 'b3', '5'];
    const rows = degreesOfScale(context.collection);
    return rows.length ? rows.map(r => r.id) : ['1', 'b3', '5'];
  }

  function paintSlots() {
    clear(slotRow);
    cells.forEach((on, index) => {
      const beat = isDownbeat(index);
      const button = el('button', {
        type: 'button',
        class: `plc-slot${on ? ' on' : ''}${beat ? ' beat' : ''}`,
        on: { click: () => { cells = toggleSlot(cells, index); emit(); paint(); } },
      }, [
        el('span', { class: 'plc-slot-mark', text: on ? '■' : '□' }),
        el('span', { class: 'plc-slot-index', text: String(index + 1) }),
      ]);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
      button.setAttribute('aria-label', `Slot ${index + 1}${beat ? ', on a beat' : ''}`);
      slotRow.appendChild(button);
    });
  }

  function paintBrief() {
    clear(briefLine);
    const lines = config.constraints ? describeConstraints(config.constraints) : [];
    if (!lines.length) return;
    briefLine.appendChild(el('p', { class: 'pl-field-label', text: 'The brief' }));
    for (const line of lines) {
      briefLine.appendChild(el('p', { class: 'plc-brief-line', text: line }));
    }
  }

  function paintCheck() {
    clear(checkLine);
    if (!config.constraints) return;
    const result = checkConstraints(cells, config.constraints);
    if (result.ok) {
      checkLine.appendChild(notice('The grid meets the brief.', 'info'));
      return;
    }
    for (const problem of result.problems) {
      checkLine.appendChild(notice(problem, 'warn'));
    }
  }

  function paintPitches() {
    clear(pitchRow);
    pitchToggle.textContent = showPitches ? 'Hide degrees' : 'Assign degrees';
    if (!showPitches) return;
    const stats = gridStats(cells);
    if (!stats.attacks) {
      pitchRow.appendChild(el('p', { class: 'pl-hint', text: 'Put some attacks in the grid first.' }));
      return;
    }
    const options = allowedDegrees();
    pitchRow.appendChild(el('p', {
      class: 'pl-hint',
      text: 'The rhythm is fixed. Now choose what each attack plays.',
    }));
    const list = el('div', { class: 'plc-pitch-list' });
    for (const slot of stats.attackSlots) {
      const select = el('select', {
        class: 'pl-select plc-pitch-select',
        on: {
          change: () => {
            pitches = { ...pitches, [slot]: select.value };
            emit();
            paintReadout();
          },
        },
      }, [el('option', { value: '', text: '—' })]
        .concat(options.map(id => el('option', { value: id, text: id }))));
      select.value = pitches[slot] || '';
      select.setAttribute('aria-label', `Degree for slot ${slot + 1}`);
      list.appendChild(el('label', { class: 'plc-pitch-cell' }, [
        el('span', { class: 'plc-pitch-slot', text: `${slot + 1}` }),
        select,
      ]));
    }
    pitchRow.appendChild(list);

    const highlight = Array.isArray(config.highlight) ? config.highlight : [];
    if (highlight.length) {
      const rows = highlight.map(id => degreeById(id)).filter(Boolean);
      pitchRow.appendChild(el('p', {
        class: 'pl-hint',
        text: rows.map(r => `${r.id}: ${r.functions}`).join(' · '),
      }));
    }
  }

  function paintCopies() {
    clear(copyRow);
    if (!copies.length) return;
    copyRow.appendChild(el('p', { class: 'pl-field-label', text: 'Saved versions' }));
    copies.forEach((copy, i) => {
      copyRow.appendChild(el('div', { class: 'plc-copy' }, [
        el('code', { class: 'plc-copy-line', text: describeGrid(copy.cells) }),
        pressable({
          label: 'Load',
          className: 'small',
          onPress: () => {
            cells = copyGrid(copy.cells);
            pitches = { ...copy.pitches };
            emit();
            paint();
          },
        }),
        pressable({
          label: 'Remove',
          className: 'small',
          onPress: () => { copies = copies.filter((_, index) => index !== i); paintCopies(); },
        }),
      ]));
    });
  }

  function paintReadout() {
    readout.textContent = describeGrid(cells);
    const stats = gridStats(cells);
    const assigned = Object.keys(pitches).length;
    statsLine.textContent = `${stats.attacks} attacks · longest rest ${stats.longestRest} slots · `
      + `${stats.offbeats} away from a beat · ${stats.adjacentPairs} adjacent pairs`
      + (assigned ? ` · ${assigned} degrees assigned` : '');
  }

  function paint() {
    sizeSelect.value = String(cells.length);
    paintSlots();
    paintReadout();
    paintBrief();
    paintCheck();
    paintPitches();
    paintCopies();
  }

  /**
   * Paint the grid.
   * @param {Object} next
   * @param {boolean[]} [next.cells]
   * @param {Record<number,string>} [next.pitches]
   * @param {Object} [next.config] the workspace configuration of the exercise
   * @param {Object} [next.context] the lab context
   */
  function render(next = {}) {
    if (Array.isArray(next.cells) && next.cells.length) cells = next.cells.slice();
    if (next.pitches) pitches = { ...next.pitches };
    if (next.config) config = next.config;
    if (next.context) context = next.context;
    if (config.constraints && config.constraints.attacks != null) {
      attackStep.set(config.constraints.attacks, false);
    }
    if (config.assignAfter && !showPitches) showPitches = false;
    paint();
  }

  render();

  return {
    root: view.root,
    render,
    cells: () => copyGrid(cells),
    pitches: () => ({ ...pitches }),
  };
}

