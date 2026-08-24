// Player for a pitch-runner exercise. It builds a runner stage inside the
// Exercises viewer and points the shared runner engine at it.
//
// The engine in js/pitchRunner.js owns the microphone and the timeline, so only
// one stage plays at a time. `mountRunnerExercise` attaches the engine to the
// stage it builds, and `destroy()` releases it again.

import { attachRunner } from './pitchRunner.js';
import {
  describeRunnerConfig,
  midiToNoteName,
  normalizeRunnerConfig,
  runnerRunBeats,
} from './runnerExerciseModel.js';

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach((child) => {
    if (child == null) return;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  });
  return node;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return mins ? `${mins}:${String(secs).padStart(2, '0')}` : `${secs}s`;
}

/** One chip per note, so the singer reads the run before it starts. */
function buildNoteStrip(notes) {
  const strip = el('div', { class: 'rx-notes', 'aria-label': 'Notes of this run' });
  notes.forEach((note) => {
    strip.appendChild(el('span', { class: 'rx-note' }, [
      el('b', { text: midiToNoteName(note.midi) }),
      el('i', { text: `${note.beats}` }),
    ]));
  });
  return strip;
}

/**
 * Build a runner stage in `host` and attach the engine to it.
 *
 * @param {HTMLElement} host
 * @param {object} rawConfig the stored runner config of the exercise
 * @param {{ onFinish?: (summary: object) => void }} [options]
 * @returns {{ destroy: () => void, stop: () => void }}
 */
export function mountRunnerExercise(host, rawConfig, { onFinish } = {}) {
  const config = normalizeRunnerConfig(rawConfig);
  if (!host) return { destroy() {}, stop() {} };

  if (!config) {
    host.appendChild(el('div', {
      class: 'ex-player-missing',
      text: 'This run holds no notes. Edit the exercise and add some.',
    }));
    return { destroy() {}, stop() {} };
  }

  const root = el('div', { class: 'rx-root' });

  const passes = config.repeats === 0
    ? 'endless'
    : `${config.repeats} time${config.repeats === 1 ? '' : 's'}`;
  const runSeconds = runnerRunBeats(config) * (60 / config.bpm)
    * (config.repeats === 0 ? 1 : config.repeats);
  const summaryText = config.repeats === 0
    ? describeRunnerConfig(config)
    : `${describeRunnerConfig(config)} · about ${formatDuration(runSeconds)}`;

  root.appendChild(el('p', { class: 'rx-summary', text: summaryText }));
  if (config.source === 'gp' && config.fileName) {
    root.appendChild(el('p', { class: 'rx-source', text: `From ${config.fileName}` }));
  }
  root.appendChild(buildNoteStrip(config.notes));

  const bpmDown = el('button', {
    type: 'button', class: 'pr-bpm-btn', 'aria-label': 'Slower', text: '−',
  });
  const bpmValue = el('b', { text: String(config.bpm) });
  const bpmUp = el('button', {
    type: 'button', class: 'pr-bpm-btn', 'aria-label': 'Faster', text: '+',
  });
  const tempoField = el('label', { class: 'pt-field' }, [
    el('span', { text: 'Tempo' }),
    el('span', { class: 'pr-tempo' }, [bpmDown, bpmValue, bpmUp]),
  ]);
  root.appendChild(el('div', { class: 'pt-controls rx-controls' }, [tempoField]));

  const metronome = el('input', { type: 'checkbox' });
  const guide = el('input', { type: 'checkbox' });
  root.appendChild(el('div', { class: 'pr-toggles' }, [
    el('label', { class: 'pr-check' }, [metronome, el('span', { text: 'Metronome click' })]),
    el('label', { class: 'pr-check' }, [guide, el('span', { text: 'Play melody guide' })]),
  ]));

  const score = el('span', { class: 'pr-stat-val', text: '0' });
  const combo = el('span', { class: 'pr-stat-val', text: '0' });
  const accuracy = el('span', { class: 'pr-stat-val', text: '--' });
  root.appendChild(el('div', { class: 'pr-hud' }, [
    el('div', { class: 'pr-stat' }, [score, el('span', { class: 'pr-stat-label', text: 'Score' })]),
    el('div', { class: 'pr-stat' }, [combo, el('span', { class: 'pr-stat-label', text: 'Combo' })]),
    el('div', { class: 'pr-stat' }, [accuracy, el('span', { class: 'pr-stat-label', text: 'Accuracy' })]),
  ]));

  const canvas = el('canvas');
  const judge = el('div', { class: 'pr-judge' });
  const overlay = el('div', { class: 'pr-overlay', text: 'Press start to play' });
  const stage = el('div', { class: 'pr-stage rx-stage' }, [canvas, judge, overlay]);
  root.appendChild(stage);

  const toggle = el('button', { class: 'btn primary', type: 'button', text: 'Start game' });
  root.appendChild(el('div', { class: 'rx-actions' }, [toggle]));

  const status = el('div', { class: 'pt-status', text: 'Mic off' });
  root.appendChild(status);
  root.appendChild(el('p', {
    class: 'rx-hint',
    text: `The run plays ${passes}. Sing each note as its bar crosses the line.`,
  }));

  host.appendChild(root);

  // The engine reads a fixed set of names. A stage that leaves one out simply
  // loses that control, so this stage binds only what it shows.
  const handle = attachRunner({
    dom: {
      'pr-toggle': toggle,
      'pr-status': status,
      'pr-judge': judge,
      'pr-score': score,
      'pr-combo': combo,
      'pr-accuracy': accuracy,
      'pr-canvas': canvas,
      'pr-stage': stage,
      'pr-overlay': overlay,
      'pr-bpm': bpmValue,
      'pr-bpm-down': bpmDown,
      'pr-bpm-up': bpmUp,
      'pr-metronome': metronome,
      'pr-guide': guide,
    },
    sequence: config,
    onFinish,
  });

  return {
    stop() { handle.stop(); },
    destroy() {
      handle.detach();
      if (root.parentNode) root.parentNode.removeChild(root);
    },
  };
}
