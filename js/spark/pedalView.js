// The Pedal tone tab of Riff Spark.
//
// One low root, interrupted. The tab takes the rhythm of the Cadence tab and
// decides what each attack plays: the root on most, and a degree from a small
// set of anchors on the rest. The player hears the riff on a low guitar-like
// tone and reads it as notes or as degrees.

import { describeCadence, cadenceStats } from './cadenceModel.js';
import {
  PALETTES, RATIO_MIN, RATIO_MAX, paletteSemitones, generatePedal, describePedal, attackLine,
  colorOf, noteAbove, basePitchMidi,
} from './pedalModel.js';
import { getContext, subscribeContext } from '../musicalContext.js';
import { keepIdea } from './ideaBank.js';
import { player, buildPattern, noteMap } from './playback.js';
import { createTransport } from './transportBar.js';
import { createSlotGrid } from './slotGrid.js';
import { freshCadence } from './sparkState.js';
import { el, clear, btn, field, panel, hint, rangeField, stepper, toggle } from './dom.js';
import { openSparkMode, flash } from './sparkNav.js';
import { NOTE_NAMES_SHARP } from '../theory.js';

function midiName(midi) {
  return `${NOTE_NAMES_SHARP[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/**
 * @param {{state: Object, save: Function}} deps
 * @returns {{root: HTMLElement, stop: Function}}
 */
export function createPedalView({ state, save }) {
  const root = el('div', { class: 'sk-root' });
  let ctx = getContext();

  function semitones() {
    return paletteSemitones(state.pedalSettings.palette, ctx.scale);
  }

  function draw(seed = '') {
    state.pedal = generatePedal({
      cadence: state.cadence,
      semitones: semitones(),
      ratio: state.pedalSettings.ratio,
      anchors: state.pedalSettings.anchors,
      octaveUp: state.pedalSettings.octaveUp,
      seed,
    });
    save();
    paint();
    if (player.isRunning()) player.update(buildPattern(pattern()));
  }

  if (!state.pedal) draw();

  function pattern() {
    return {
      cadence: state.cadence,
      bpm: transport.tempo(),
      pulseOn: state.pulseOn,
      notes: noteMap(state.pedal, ctx.root, ctx.tuning),
    };
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

  /** A tap on an attack moves it to the next anchor, then back to the root. */
  function cyclePitch(index) {
    const event = state.pedal.events.find(e => e.slot === index);
    if (!event) return;
    const ring = [0, ...state.pedal.anchors];
    const at = ring.indexOf(event.semitones);
    event.semitones = ring[(at + 1) % ring.length];
    save();
    paint();
    if (player.isRunning()) player.update({ notes: noteMap(state.pedal, ctx.root, ctx.tuning) });
  }

  const grid = createSlotGrid({ onCell: cyclePitch });

  function labels() {
    const map = new Map();
    for (const event of state.pedal.events) {
      const name = state.showDegrees ? colorOf(event.semitones).id : noteAbove(ctx.root, event.semitones);
      map.set(event.slot, event.octave ? `${name}'` : name);
    }
    return map;
  }

  const noteLine = el('code', { class: 'sk-readout' });
  const degreeLine = el('code', { class: 'sk-readout sk-readout-dim' });
  const attackText = el('p', { class: 'sk-stats' });
  const rhythmLine = el('code', { class: 'sk-readout sk-readout-dim' });
  const contextLine = el('p', { class: 'sk-context-line' });
  const anchorList = el('div', { class: 'sk-anchors' });

  function paintAnchors() {
    clear(anchorList);
    for (const distance of state.pedal.anchors) {
      const row = colorOf(distance);
      anchorList.appendChild(el('div', { class: 'sk-anchor' }, [
        el('span', { class: 'sk-anchor-degree', text: row.id }),
        el('span', { class: 'sk-anchor-note', text: noteAbove(ctx.root, distance) }),
        el('span', { class: 'sk-anchor-text' }, [
          el('strong', { text: row.character }), ` — ${row.functions}.`,
        ]),
      ]));
    }
  }

  function paint() {
    grid.render({ cadence: state.cadence, labels: labels() });
    noteLine.textContent = describePedal(state.cadence, state.pedal, ctx.root);
    degreeLine.textContent = describePedal(state.cadence, state.pedal, ctx.root, { degrees: true });
    attackText.textContent = `Attacks: ${attackLine(state.pedal, ctx.root)} · seed ${state.pedal.seed}`;
    rhythmLine.textContent = describeCadence(state.cadence);
    const base = basePitchMidi(ctx.root, ctx.tuning);
    const stats = cadenceStats(state.cadence);
    const leaving = state.pedal.events.filter(e => e.semitones).length;
    contextLine.textContent = `Root ${ctx.root} at ${midiName(base)} on ${ctx.tuning} · `
      + `${leaving} of ${stats.attacks} attacks leave the root · change the root in the context row above.`;
    paintAnchors();
  }

  /* --- settings --------------------------------------------------------- */

  const paletteBlurb = hint('');
  const paletteRow = el('div', { class: 'sk-chips' });
  function paintPalettes() {
    clear(paletteRow);
    for (const palette of PALETTES) {
      const on = palette.id === state.pedalSettings.palette;
      const distances = palette.id === 'context' ? paletteSemitones('context', ctx.scale) : palette.semitones;
      paletteRow.appendChild(btn({
        label: palette.label,
        className: `sk-chip${on ? ' active' : ''}`,
        pressed: on,
        title: distances.map(d => colorOf(d).id).join(' '),
        onPress: () => { state.pedalSettings.palette = palette.id; save(); paintPalettes(); draw(); },
      }));
    }
    const current = PALETTES.find(p => p.id === state.pedalSettings.palette) || PALETTES[0];
    paletteBlurb.textContent = `${current.blurb} Degrees: ${semitones().map(d => colorOf(d).id).join(', ')}.`;
  }

  const ratio = rangeField({
    label: 'Attacks that leave the root',
    value: Math.round(state.pedalSettings.ratio * 100), min: RATIO_MIN * 100, max: RATIO_MAX * 100, step: 5,
    format: v => `${v}%`,
    onInput: (v) => { state.pedalSettings.ratio = v / 100; save(); },
  });

  const anchors = stepper({
    label: 'Anchor notes', value: state.pedalSettings.anchors, min: 1, max: 4,
    onChange: (n) => { state.pedalSettings.anchors = n; save(); },
  });

  const octave = toggle({
    label: 'Stabs jump an octave',
    checked: state.pedalSettings.octaveUp,
    onChange: (on) => { state.pedalSettings.octaveUp = on; save(); },
  });

  const degrees = toggle({
    label: 'Show degrees on the grid',
    checked: state.showDegrees,
    onChange: (on) => { state.showDegrees = on; save(); paint(); },
  });

  const drawRow = el('div', { class: 'sk-row' }, [
    btn({ label: 'Draw pitches', className: 'primary', onPress: () => draw() }),
    btn({ label: 'Same seed again', onPress: () => draw(state.pedal.seed) }),
    btn({ label: 'New rhythm too', title: 'Draw a new cadence under the Cadence settings, then new pitches', onPress: () => { state.cadence = freshCadence(state); draw(); } }),
  ]);

  /* --- keep ------------------------------------------------------------- */

  function keep() {
    const entry = keepIdea({ cadence: state.cadence, pedal: state.pedal, tempo: transport.tempo(), tonic: ctx.root, tuning: ctx.tuning });
    flash(entry ? 'Kept in the Bank.' : 'The Bank could not save the idea.');
  }

  const keepRow = el('div', { class: 'sk-row sk-keep-row' }, [
    btn({ label: 'Keep', className: 'primary', onPress: keep, title: 'Put this riff in the Bank' }),
    btn({ label: '← Change the rhythm', onPress: () => openSparkMode('cadence') }),
  ]);

  /* --- context ------------------------------------------------------------ */

  const unsubscribe = subscribeContext((next) => {
    const rootChanged = next.root !== ctx.root || next.tuning !== ctx.tuning;
    const scaleChanged = next.scale !== ctx.scale;
    ctx = next;
    if (scaleChanged && state.pedalSettings.palette === 'context') { paintPalettes(); draw(); return; }
    if (rootChanged) {
      paint();
      if (player.isRunning()) player.update({ notes: noteMap(state.pedal, ctx.root, ctx.tuning) });
    }
  });

  /* --- layout ------------------------------------------------------------ */

  const riff = panel('Pedal tone');
  riff.head.appendChild(transport.root);
  riff.body.append(
    contextLine,
    grid.root,
    hint('Tap an attack to move it to the next anchor, and back to the root.'),
    noteLine,
    degreeLine,
    attackText,
    el('p', { class: 'sk-field-label', text: 'Anchors' }),
    anchorList,
    keepRow,
  );

  const settings = panel('Palette');
  settings.body.append(
    paletteRow,
    paletteBlurb,
    el('div', { class: 'sk-controls' }, [ratio.root, anchors.root, octave.root, degrees.root]),
    drawRow,
    el('p', { class: 'sk-field-label', text: 'Rhythm' }),
    rhythmLine,
  );

  root.append(riff.root, settings.root);
  paintPalettes();
  paint();

  return {
    root,
    stop() {
      player.stop();
      transport.stop();
      unsubscribe();
    },
  };
}
