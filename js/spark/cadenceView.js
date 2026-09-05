// The Cadence tab of Riff Spark.
//
// The player draws a rhythm on a grid of sixteenth-note slots, hears it as a
// loop over a pulse, and mutates it until it becomes a riff. Rhythm comes
// first; the Pedal tone tab decides the pitches after.

import {
  METERS, DENSITIES, SHAPES, PAIRINGS, ROLE_WORDS, ROLE_MARKS,
  generateCadence, cadenceStats, describeCadence, displaceCadence, reverseCadence,
  thinCadence, thickenCadence, answerCadence, rerollRoles, cycleCell, changeMeter, setBars,
  settingsOf, meterById,
} from './cadenceModel.js';
import { generatePedal, paletteSemitones } from './pedalModel.js';
import { getContext } from '../musicalContext.js';
import { keepIdea } from './ideaBank.js';
import { player, buildPattern } from './playback.js';
import { createTransport } from './transportBar.js';
import { createSlotGrid } from './slotGrid.js';
import { el, clear, btn, segmented, field, panel, hint, rangeField, stepper } from './dom.js';
import { openSparkMode, flash } from './sparkNav.js';

/**
 * @param {{state: Object, save: Function}} deps the shared state and its writer
 * @returns {{root: HTMLElement, stop: Function}}
 */
export function createCadenceView({ state, save }) {
  const root = el('div', { class: 'sk-root' });

  function commit(next, { redrawGrid = true } = {}) {
    state.cadence = next;
    state.draw = settingsOf(next);
    // A new rhythm makes the old pitches wrong. The pedal tab draws again.
    state.pedal = null;
    save();
    if (redrawGrid) paintGrid();
    paintReadout();
    paintMetric();
    if (player.isRunning()) player.update(buildPattern(pattern()));
  }

  function pattern() {
    return { cadence: state.cadence, bpm: transport.tempo(), pulseOn: state.pulseOn };
  }

  /* --- transport --------------------------------------------------------- */

  const transport = createTransport({
    pulseOn: state.pulseOn,
    onPlay: () => {
      player.start(buildPattern(pattern()), {
        onStep: ({ index }) => grid.setPlayhead(index),
        onStop: () => { transport.setPlaying(false); grid.setPlayhead(-1); },
      });
      transport.setPlaying(true);
    },
    onStop: () => player.stop(),
    onTempo: (bpm) => player.setBpm(bpm),
    onPulse: (on) => { state.pulseOn = on; save(); player.update({ pulseOn: on }); },
  });

  /* --- grid ---------------------------------------------------------------- */

  const grid = createSlotGrid({ onCell: (index) => commit(cycleCell(state.cadence, index)) });
  const readout = el('code', { class: 'sk-readout' });
  const statsLine = el('p', { class: 'sk-stats' });
  const seedLine = el('p', { class: 'sk-hint sk-seed-line' });

  function paintGrid() {
    grid.render({ cadence: state.cadence });
    meterSeg.set(state.cadence.meter);
    barStep.set(state.cadence.bars, false);
    pairingRow.hidden = state.cadence.bars < 2;
  }

  function paintReadout() {
    readout.textContent = describeCadence(state.cadence);
    const stats = cadenceStats(state.cadence);
    statsLine.textContent = `${stats.attacks} attacks · ${stats.chugs} chugs · ${stats.notes} notes · `
      + `${stats.stabs} stabs · longest rest ${stats.longestRest} · longest run ${stats.longestRun} · `
      + `${stats.offbeats} away from a beat`;
    seedLine.textContent = `Seed ${state.cadence.seed} · ${state.cadence.shape} · ${state.cadence.density}`;
  }

  const legend = el('p', { class: 'sk-legend' }, Object.keys(ROLE_WORDS).map(role => el('span', { class: `sk-legend-item ${role}` }, [
    el('code', { text: ROLE_MARKS[role] }), ` ${ROLE_WORDS[role]}`,
  ])).concat([el('span', { class: 'sk-legend-item' }, [el('code', { text: '-' }), ' Rest'])]));

  /* --- draw controls --------------------------------------------------- */

  const meterSeg = segmented({
    options: METERS.map(m => ({ id: m.id, label: m.label, title: `${m.slots} slots per bar` })),
    value: state.cadence.meter,
    ariaLabel: 'Meter',
    onChange: (id) => { state.draw.meter = id; commit(changeMeter(state.cadence, id)); },
  });

  const barStep = stepper({
    label: 'Bars', value: state.cadence.bars, min: 1, max: 4,
    onChange: (bars) => { state.draw.bars = bars; commit(setBars(state.cadence, bars)); },
  });

  const densitySeg = segmented({
    options: DENSITIES.map(d => ({ id: d.id, label: d.label })),
    value: state.draw.density,
    ariaLabel: 'Density',
    onChange: (id) => { state.draw.density = id; save(); },
  });

  const shapeBlurb = hint('');
  const shapeSeg = segmented({
    options: SHAPES.map(s => ({ id: s.id, label: s.label, title: s.blurb })),
    value: state.draw.shape,
    ariaLabel: 'Shape',
    onChange: (id) => { state.draw.shape = id; save(); paintShapeBlurb(); },
  });
  function paintShapeBlurb() {
    const shape = SHAPES.find(s => s.id === state.draw.shape) || SHAPES[0];
    shapeBlurb.textContent = shape.blurb;
  }
  paintShapeBlurb();

  const pairingSeg = segmented({
    options: PAIRINGS.map(p => ({ id: p.id, label: p.label, title: p.blurb })),
    value: state.draw.pairing,
    ariaLabel: 'Bar two',
    onChange: (id) => { state.draw.pairing = id; save(); },
  });
  const pairingRow = field('Bar two', pairingSeg.root);

  const noteShare = rangeField({
    label: 'Pitched attacks',
    value: Math.round((state.draw.noteShare ?? 0.3) * 100), min: 0, max: 60, step: 5,
    format: v => `${v}%`,
    onInput: (v) => { state.draw.noteShare = v / 100; save(); },
  });

  const seedInput = el('input', { type: 'text', class: 'sk-text sk-seed-input', value: '', placeholder: 'seed (optional)', maxLength: 24 });
  seedInput.setAttribute('aria-label', 'Seed for the next draw');

  function draw(seed = '') {
    const next = generateCadence({ ...state.draw, seed: seed || seedInput.value.trim() });
    seedInput.value = '';
    commit(next);
  }

  const drawRow = el('div', { class: 'sk-row' }, [
    btn({ label: 'Draw a rhythm', className: 'primary', onPress: () => draw() }),
    btn({ label: 'Same seed again', onPress: () => draw(state.cadence.seed), title: 'Draw the current seed again under the current settings' }),
    seedInput,
  ]);

  /* --- mutations ------------------------------------------------------- */

  const otherMeter = () => (state.cadence.meter === '7/8' ? '4/4' : '7/8');
  const metricButton = btn({ label: 'To 7/8', onPress: () => { state.draw.meter = otherMeter(); commit(changeMeter(state.cadence, otherMeter())); } });
  function paintMetric() { metricButton.textContent = `To ${otherMeter()}`; }

  const mutations = el('div', { class: 'sk-row sk-mutations' }, [
    btn({ label: 'Displace', title: 'Every attack one sixteenth later', onPress: () => commit(displaceCadence(state.cadence, 1)) }),
    btn({ label: 'Displace ½', title: 'Every attack one eighth later', onPress: () => commit(displaceCadence(state.cadence, 2)) }),
    btn({ label: 'Reverse', onPress: () => commit(reverseCadence(state.cadence)) }),
    btn({ label: 'Thin', title: 'Remove one attack in three', onPress: () => commit(thinCadence(state.cadence)) }),
    btn({ label: 'Thicken', title: 'Add attacks on empty eighth notes', onPress: () => commit(thickenCadence(state.cadence)) }),
    btn({ label: 'New ending', title: 'Redraw the last quarter of the last bar', onPress: () => commit(answerCadence(state.cadence)) }),
    btn({ label: 'Reroll roles', title: 'Keep the rhythm, change which attacks are pitched', onPress: () => commit(rerollRoles(state.cadence)) }),
    metricButton,
  ]);

  /* --- keep ------------------------------------------------------------- */

  function keep() {
    const ctx = getContext();
    const entry = keepIdea({ cadence: state.cadence, pedal: null, tempo: transport.tempo(), tonic: ctx.root, tuning: ctx.tuning });
    flash(entry ? 'Kept in the Bank.' : 'The Bank could not save the idea.');
  }

  function toPedal() {
    if (!state.pedal) {
      const ctx = getContext();
      state.pedal = generatePedal({
        cadence: state.cadence,
        semitones: paletteSemitones(state.pedalSettings.palette, ctx.scale),
        ...state.pedalSettings,
      });
      save();
    }
    openSparkMode('pedal');
  }

  const keepRow = el('div', { class: 'sk-row sk-keep-row' }, [
    btn({ label: 'Keep', className: 'primary', onPress: keep, title: 'Put this rhythm in the Bank' }),
    btn({ label: 'Give it pitches →', onPress: toPedal, title: 'Open the Pedal tone tab with this rhythm' }),
  ]);

  /* --- layout ------------------------------------------------------------ */

  const rhythm = panel('Cadence');
  rhythm.head.appendChild(transport.root);
  rhythm.body.append(
    grid.root,
    hint('Tap a slot to change it: rest, chug, note, stab. The loop follows while it plays.'),
    readout,
    legend,
    statsLine,
    seedLine,
    keepRow,
  );

  const drawPanel = panel('Draw');
  drawPanel.body.append(
    el('div', { class: 'sk-controls' }, [
      field('Meter', meterSeg.root),
      barStep.root,
      field('Density', densitySeg.root),
      el('div', { class: 'sk-field' }, [el('span', { class: 'sk-field-label', text: 'Shape' }), shapeSeg.root, shapeBlurb]),
      pairingRow,
      noteShare.root,
    ]),
    drawRow,
  );

  const mutatePanel = panel('Mutate');
  mutatePanel.body.append(
    hint('Change one thing. Keep the rest. A riff that changes everything at once teaches nothing.'),
    mutations,
  );

  root.append(rhythm.root, drawPanel.root, mutatePanel.root);

  paintGrid();
  paintReadout();
  paintMetric();

  return {
    root,
    stop() {
      player.stop();
      transport.stop();
    },
  };
}
