// The Hear workspace of Composition Lab.
//
// A drone holds the tonal center. The player sings or names the degree, and
// only then does Musi play it. The panel never plays the answer first: the
// Check control belongs to the exercise card, and it calls `reveal` here.
//
// Four shapes cover the Hear exercises:
//
//   sing     — hold the drone, ask for a named degree, play it on Check.
//   identify — hold the drone, play a hidden degree, offer choices.
//   center   — the same collection over one of two drones.
//   compare  — one line over two drones in turn.

import { startDrone, playPitch, stopAllTones, isDroneOn } from '../adapters/musiDrone.js';
import { degreeById, noteForDegree, pitchClassForDegree } from '../adapters/musiReference.js';
import { parseNote } from '../adapters/musiTheory.js';
import { el, clear, panel, pressable, notice } from './dom.js';

function pitchClassOf(note) {
  const parsed = parseNote(String(note || ''));
  return parsed ? parsed.semi : -1;
}

/**
 * Build the Hear workspace.
 * @param {{onGuess?: Function}} [handlers]
 * @returns {{root: HTMLElement, render: Function, reveal: Function, guess: Function, stop: Function}}
 */
export function createHearPanel({ onGuess } = {}) {
  let context = null;
  let config = {};
  let guess = '';
  let droneNote = '';

  const line = el('p', { class: 'plc-hear-line' });
  const controls = el('div', { class: 'pl-row plc-hear-controls' });
  const choices = el('div', { class: 'pl-chip-row plc-hear-choices' });
  const result = el('div', { class: 'plc-hear-result' });

  const view = panel('Hear', 'plc-hear');
  view.body.append(line, controls, choices, result);

  function droneLabel() {
    return isDroneOn() ? 'Stop the drone' : `Hold the ${droneNote} drone`;
  }

  function paintControls() {
    clear(controls);
    const droneButton = pressable({
      label: droneLabel(),
      className: 'primary',
      onPress: () => {
        startDrone(pitchClassOf(droneNote));
        paintControls();
      },
    });
    controls.appendChild(droneButton);

    if (config.mode === 'identify' || config.mode === 'center') {
      controls.appendChild(pressable({
        label: 'Play the hidden pitch',
        onPress: () => playHidden(),
      }));
    }
    if (config.mode === 'compare' && config.altNote) {
      controls.appendChild(pressable({
        label: `Hold the ${config.altNote} drone`,
        onPress: () => {
          droneNote = config.altNote;
          startDrone(pitchClassOf(config.altNote));
          paintLine();
          paintControls();
        },
      }));
      controls.appendChild(pressable({
        label: `Back to ${context.tonic}`,
        onPress: () => {
          droneNote = context.tonic;
          startDrone(pitchClassOf(context.tonic));
          paintLine();
          paintControls();
        },
      }));
    }
    controls.appendChild(pressable({
      label: 'Silence',
      className: 'small',
      onPress: () => { stopAllTones(); paintControls(); },
    }));
  }

  function playHidden() {
    if (!context) return;
    if (config.mode === 'center') {
      // The hidden thing is which drone is home, so the pitch to sound is the
      // drone itself, not a degree above it.
      const pc = config.degreeId === '1'
        ? pitchClassOf(context.tonic)
        : pitchClassOf(config.altNote || context.tonic);
      playPitch(pc, { octave: 3 });
      return;
    }
    const pc = pitchClassForDegree(context.tonic, config.degreeId);
    if (pc >= 0) playPitch(pc);
  }

  function paintLine() {
    if (!context) return;
    if (config.mode === 'sing') {
      const degree = degreeById(config.degreeId);
      line.textContent = `Drone on ${droneNote}. Sing ${config.degreeId}`
        + (degree ? ` — ${degree.character.toLowerCase()}.` : '.');
      return;
    }
    if (config.mode === 'identify') {
      line.textContent = `Drone on ${droneNote}. Play the hidden pitch, then name it.`;
      return;
    }
    if (config.mode === 'center') {
      line.textContent = `Drone on ${droneNote}. Musi plays one of two candidates for home.`;
      return;
    }
    line.textContent = `Drone on ${droneNote}. Play your line over each drone in turn.`;
  }

  function paintChoices() {
    clear(choices);
    const list = Array.isArray(config.choices) ? config.choices : [];
    if (!list.length) return;
    for (const id of list) {
      const on = id === guess;
      const button = el('button', {
        type: 'button',
        class: `plc-choice${on ? ' active' : ''}`,
        text: id,
        on: {
          click: () => {
            guess = on ? '' : id;
            paintChoices();
            onGuess?.(guess);
          },
        },
      });
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
      choices.appendChild(button);
    }
  }

  /** Sound the answer and say whether the guess was right. */
  function reveal() {
    clear(result);
    if (!context) return null;
    playHidden();
    const list = Array.isArray(config.choices) ? config.choices : [];
    if (!list.length) return null;
    const right = guess === config.degreeId;
    if (!guess) {
      result.appendChild(notice('Pick an answer first, then press Check again.', 'warn'));
      return { answered: false, right: false };
    }
    const note = config.mode === 'center'
      ? (config.degreeId === '1' ? context.tonic : config.altNote)
      : noteForDegree(context.tonic, config.degreeId);
    result.appendChild(notice(
      right
        ? `Right. It was ${config.degreeId} — ${note}.`
        : `It was ${config.degreeId} — ${note}. You chose ${guess}.`,
      right ? 'info' : 'warn',
    ));
    return { answered: true, right };
  }

  /**
   * Paint the workspace.
   * @param {Object} next `context`, `config`, `guess`
   */
  function render(next = {}) {
    if (next.context) context = next.context;
    if (next.config) config = next.config;
    guess = typeof next.guess === 'string' ? next.guess : '';
    droneNote = context ? context.tonic : '';
    clear(result);
    paintLine();
    paintControls();
    paintChoices();
  }

  return {
    root: view.root,
    render,
    reveal,
    guess: () => guess,
    stop() { stopAllTones(); },
  };
}

