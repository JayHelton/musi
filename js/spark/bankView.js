// The Bank tab of Riff Spark.
//
// Every kept idea, newest first. The player hears one, loads it back into
// the Cadence or the Pedal tone tab, sends it to Notes, copies its text, or
// drops it.

import { listIdeas, removeIdea, setIdeaNote, clearIdeas, ideaTitle, ideaText } from './ideaBank.js';
import { describeCadence } from './cadenceModel.js';
import { describePedal } from './pedalModel.js';
import { player, buildPattern, noteMap } from './playback.js';
import { addNote } from '../notes.js';
import { getContext } from '../musicalContext.js';
import { el, clear, btn, panel, hint } from './dom.js';
import { openSparkMode, flash, copyText } from './sparkNav.js';

/**
 * @param {{state: Object, save: Function}} deps
 * @returns {{root: HTMLElement, stop: Function}}
 */
export function createBankView({ state, save }) {
  const root = el('div', { class: 'sk-root' });
  const list = el('div', { class: 'sk-ideas' });
  let playingId = '';
  let noteTimer = null;

  function stopPlayback() {
    player.stop();
    playingId = '';
  }

  function play(idea) {
    if (playingId === idea.id) { stopPlayback(); paint(); return; }
    stopPlayback();
    const notes = idea.pedal ? noteMap(idea.pedal, idea.tonic, idea.tuning || getContext().tuning) : null;
    player.start(buildPattern({ cadence: idea.cadence, bpm: idea.tempo, pulseOn: state.pulseOn, notes }), {
      onStop: () => { if (playingId === idea.id) { playingId = ''; paint(); } },
    });
    playingId = idea.id;
    paint();
  }

  function load(idea) {
    stopPlayback();
    state.cadence = idea.cadence;
    state.draw = { ...state.draw, meter: idea.cadence.meter, bars: idea.cadence.bars, density: idea.cadence.density, shape: idea.cadence.shape, pairing: idea.cadence.pairing, noteShare: idea.cadence.noteShare };
    state.pedal = idea.pedal;
    save();
    openSparkMode(idea.pedal ? 'pedal' : 'cadence');
  }

  function toNotes(idea) {
    const note = addNote({ title: ideaTitle(idea), body: ideaText(idea) });
    flash(note ? 'Sent to Notes.' : 'Notes could not save the idea.');
  }

  async function copy(idea) {
    const ok = await copyText(ideaText(idea));
    flash(ok ? 'Copied.' : 'The clipboard is not available.');
  }

  function remove(idea) {
    if (playingId === idea.id) stopPlayback();
    removeIdea(idea.id);
    paint();
  }

  function ideaNode(idea) {
    const noteInput = el('textarea', {
      class: 'sk-text sk-idea-note', value: idea.note, placeholder: 'What works here? What would make it hit harder?', rows: 2,
      on: {
        input: () => {
          if (noteTimer) clearTimeout(noteTimer);
          noteTimer = setTimeout(() => setIdeaNote(idea.id, noteInput.value), 500);
        },
      },
    });
    noteInput.setAttribute('aria-label', `Note for ${ideaTitle(idea)}`);
    const playing = playingId === idea.id;
    return el('article', { class: `sk-idea${playing ? ' playing' : ''}` }, [
      el('div', { class: 'sk-idea-head' }, [
        el('h4', { class: 'sk-idea-title', text: ideaTitle(idea) }),
        el('span', { class: 'sk-idea-meta', text: `${idea.tempo} BPM · ${new Date(idea.createdAt).toLocaleDateString()}` }),
      ]),
      el('code', { class: 'sk-readout', text: describeCadence(idea.cadence) }),
      idea.pedal ? el('code', { class: 'sk-readout sk-readout-dim', text: describePedal(idea.cadence, idea.pedal, idea.tonic) }) : null,
      noteInput,
      el('div', { class: 'sk-row' }, [
        btn({ label: playing ? '■ Stop' : '▶ Play', className: playing ? 'primary' : '', onPress: () => play(idea) }),
        btn({ label: 'Load', onPress: () => load(idea), title: 'Open this idea in its tab' }),
        btn({ label: 'To Notes', onPress: () => toNotes(idea) }),
        btn({ label: 'Copy', onPress: () => copy(idea) }),
        btn({ label: 'Remove', className: 'danger', onPress: () => remove(idea) }),
      ]),
    ]);
  }

  function paint() {
    clear(list);
    const ideas = listIdeas();
    if (!ideas.length) {
      list.appendChild(hint('No ideas yet. Press Keep on the Cadence or the Pedal tone tab.'));
      clearButton.disabled = true;
      return;
    }
    clearButton.disabled = false;
    for (const idea of ideas) list.appendChild(ideaNode(idea));
  }

  const clearButton = btn({
    label: 'Clear the Bank', className: 'danger',
    onPress: () => {
      if (!window.confirm('Remove every kept idea?')) return;
      stopPlayback();
      clearIdeas();
      paint();
    },
  });

  const bank = panel('Bank');
  bank.head.appendChild(clearButton);
  bank.body.append(
    hint('Ideation and editing are separate jobs. Keep first, judge later, combine a rhythm from one idea with the pitches of another.'),
    list,
  );

  root.appendChild(bank.root);
  paint();

  return {
    root,
    stop() {
      stopPlayback();
      if (noteTimer) clearTimeout(noteTimer);
    },
  };
}
