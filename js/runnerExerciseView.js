// Player for a pitch-runner exercise. It builds a runner stage inside the
// Exercises viewer and points the shared runner engine at it.
//
// The engine in js/pitchRunner.js owns the microphone and the timeline, so only
// one stage plays at a time. `mountRunnerExercise` attaches the engine to the
// stage it builds, and `destroy()` releases it again.

import { attachRunner } from './pitchRunner.js';
import { createInfoTip } from './uxPrimitives.js';
import {
  describeRunnerConfig,
  fillRunnerTextFromAnnotations,
  midiToNoteName,
  normalizeRunnerConfig,
  runnerNoteBeats,
  runnerRunBeats,
  runnerTextCount,
} from './runnerExerciseModel.js';
import {
  listAnnotations,
  scoreKeyFromAttachmentId,
  scoreKeyFromSession,
} from './gpAnnotations.js';

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

/**
 * The section notes Musi holds for the score a run came from.
 *
 * The GP player names a score by its attachment, or by the file name and the
 * byte length when it read the file without the library. A run keeps both, so
 * this reads the notes under either name.
 */
function annotationsOfSource(config) {
  const keys = [
    scoreKeyFromAttachmentId(config.attachmentId),
    scoreKeyFromSession({ fileName: config.fileName, byteLength: config.fileSize }),
  ].filter(Boolean);
  const out = [];
  const seen = new Set();
  for (const key of keys) {
    for (const anno of listAnnotations(key)) {
      if (seen.has(anno.id)) continue;
      seen.add(anno.id);
      out.push(anno);
    }
  }
  return out;
}

/**
 * One chip per note, so the singer can read the run. `shift` moves every chip
 * by the same number of semitones, so the list names the pitches the run plays
 * after a change of start octave.
 *
 * A note that carries the text of the score prints it under the pitch, so the
 * singer reads the whole plan before the run starts.
 *
 * A long run holds many notes, so the caller keeps the list closed and puts it
 * under the game. An open list at the top pushes the stage off the screen.
 */
function buildNoteList(config, shift = 0) {
  const strip = el('div', { class: 'rx-notes' });
  config.notes.forEach((note) => {
    const chip = el('span', { class: 'rx-note' }, [
      el('b', { text: midiToNoteName(note.midi + shift) }),
      el('i', { text: `${runnerNoteBeats(config, note)}` }),
    ]);
    if (note.text) chip.appendChild(el('em', { class: 'rx-note-text', text: note.text }));
    strip.appendChild(chip);
  });
  return strip;
}

/** The run with every note moved by the same number of semitones. */
function transposed(config, shift) {
  if (!shift) return config;
  return { ...config, notes: config.notes.map(note => ({ ...note, midi: note.midi + shift })) };
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
  let config = normalizeRunnerConfig(rawConfig);
  if (!host) return { destroy() {}, stop() {} };

  if (!config) {
    host.appendChild(el('div', {
      class: 'ex-player-missing',
      text: 'This run holds no notes. Edit the exercise and add some.',
    }));
    return { destroy() {}, stop() {} };
  }

  // The score can say what to sing on each pitch. The text of the file comes
  // first, and the section notes of the same score fill the notes it leaves
  // empty.
  config = fillRunnerTextFromAnnotations(config, annotationsOfSource(config));
  const hasNoteText = runnerTextCount(config) > 0;

  const root = el('div', { class: 'rx-root' });

  const passes = config.repeats === 0
    ? 'endless'
    : `${config.repeats} time${config.repeats === 1 ? '' : 's'}`;
  // Preview mode plays every pass twice, so the run takes twice as long.
  const runSeconds = runnerRunBeats(config) * (60 / config.bpm)
    * (config.repeats === 0 ? 1 : config.repeats)
    * (config.preview ? 2 : 1);
  const summaryOf = (shift) => {
    const line = describeRunnerConfig(transposed(config, shift));
    return config.repeats === 0 ? line : `${line} · about ${formatDuration(runSeconds)}`;
  };

  const summary = el('p', { class: 'rx-summary', text: summaryOf(0) });
  root.appendChild(summary);
  // A run that came from a file or from a take names its source, so the
  // singer knows which score or which recording the notes belong to.
  if (config.source !== 'manual' && config.fileName) {
    root.appendChild(el('p', { class: 'rx-source', text: `From ${config.fileName}` }));
  }

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
  // The run keeps its written pitches. Start octave moves the whole run into
  // the octave the singer reaches.
  const octave = el('select', { 'aria-label': 'Start octave' });
  const octaveField = el('label', { class: 'pt-field' }, [
    el('span', { text: 'Start octave' }),
    octave,
  ]);
  const audioDelay = el('input', {
    type: 'number', class: 'pr-delay-input', min: '0', step: '10',
    'aria-label': 'Audio delay in milliseconds',
  });
  const delayField = el('label', { class: 'pt-field' }, [
    el('span', { text: 'Audio delay (ms)' }),
    audioDelay,
  ]);
  root.appendChild(el('div', { class: 'pt-controls rx-controls' }, [tempoField, octaveField, delayField]));

  const metronome = el('input', { type: 'checkbox' });
  const guide = el('input', { type: 'checkbox' });
  const preview = el('input', { type: 'checkbox' });
  root.appendChild(el('div', { class: 'pr-toggles' }, [
    el('label', { class: 'pr-check' }, [metronome, el('span', { text: 'Metronome click' })]),
    el('label', { class: 'pr-check' }, [guide, el('span', { text: 'Play melody guide' })]),
    el('label', { class: 'pr-check' }, [preview, el('span', { text: 'Preview each pass' })]),
  ]));

  const score = el('span', { class: 'pr-stat-val', text: '0' });
  const combo = el('span', { class: 'pr-stat-val', text: '0' });
  const accuracy = el('span', { class: 'pr-stat-val', text: '--' });
  root.appendChild(el('div', { class: 'pr-hud' }, [
    el('div', { class: 'pr-stat' }, [score, el('span', { class: 'pr-stat-label', text: 'Score' })]),
    el('div', { class: 'pr-stat' }, [combo, el('span', { class: 'pr-stat-label', text: 'Combo' })]),
    el('div', { class: 'pr-stat' }, [accuracy, el('span', { class: 'pr-stat-label', text: 'Accuracy' })]),
  ]));

  // The text of the score for the note at the line. It names the vowel or the
  // exercise to do on that pitch. A run without text shows no field.
  const noteText = hasNoteText
    ? el('p', { class: 'pr-note-text', role: 'status', 'aria-live': 'polite' })
    : null;
  if (noteText) root.appendChild(noteText);

  const canvas = el('canvas');
  const judge = el('div', { class: 'pr-judge' });
  const overlay = el('div', { class: 'pr-overlay', text: 'Press start to play' });
  const stage = el('div', { class: 'pr-stage rx-stage' }, [canvas, judge, overlay]);
  root.appendChild(stage);

  // The rules of the run are one long paragraph. The info tip next to Start
  // holds them, so the stage and the button keep the screen.
  const hintText = `The run plays ${passes}. Sing each note as its bar crosses the line.`
    + ' Preview each pass plays the notes to you first. The hollow bars are the'
    + ' preview, and the solid bars are your turn to sing.'
    + ' Start octave moves the whole run into another octave, so you sing the'
    + ' same intervals where your voice reaches them.'
    + ' Bluetooth headphones play the sound late. Raise the audio delay until the'
    + ' click lands on the beat you see.'
    + (hasNoteText
      ? ' The Guitar Pro file names a vowel or an exercise for some notes.'
        + ' That text prints on the bar and above the stage.'
      : '');

  const toggle = el('button', { class: 'btn primary', type: 'button', text: 'Start game' });
  const hintTip = createInfoTip(hintText, { label: 'How this run works' });
  root.appendChild(el('div', { class: 'rx-actions' }, [toggle, hintTip]));

  const status = el('div', { class: 'pt-status', text: 'Mic off' });
  root.appendChild(status);
  let noteStrip = buildNoteList(config);
  root.appendChild(el('details', { class: 'rx-notes-box' }, [
    el('summary', {
      class: 'rx-notes-summary',
      text: `Notes (${config.notes.length})`,
    }),
    noteStrip,
  ]));

  host.appendChild(root);

  // The runner reports the octave the singer picks. The summary line and the
  // note list then name the pitches the run plays now.
  function showTranspose(shift) {
    summary.textContent = summaryOf(shift);
    const next = buildNoteList(config, shift);
    noteStrip.replaceWith(next);
    noteStrip = next;
  }

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
      'pr-preview': preview,
      'pr-audio-delay': audioDelay,
      'pr-octave': octave,
      'pr-note-text': noteText,
    },
    sequence: config,
    onFinish,
    onTranspose: showTranspose,
  });

  return {
    stop() { handle.stop(); },
    destroy() {
      handle.detach();
      if (root.parentNode) root.parentNode.removeChild(root);
    },
  };
}
