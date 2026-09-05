// The ratios trainer: two subdivisions, in turn, without an end.
//
// The trainer plays Loop 1, a count-in, Loop 2, a count-in, and repeats. It
// moves the hands between two speeds in short segments, and back again.

import { el, pressable, stepper, select, toggle } from './dom.js';
import { ratioPlan, SUBDIVISIONS, LIMITS } from '../engine/timeline.js';

/**
 * @param {Object} lab
 * @returns {{ root: HTMLElement, stop: Function }}
 */
export function createRatiosPanel(lab) {
  const settings = {
    bpm: LIMITS.bpm.def,
    beats: LIMITS.ratioBeats.def,
    loopA: 'eighth',
    loopB: 'sixteenth',
    countIn: true,
    initialCountIn: LIMITS.initialCountIn.def,
    repeatCountIn: LIMITS.repeatCountIn.def,
  };

  const nowLine = el('p', { class: 'pl-now-line', text: 'Ready.' });
  nowLine.setAttribute('aria-live', 'polite');
  const beatLine = el('p', { class: 'pl-beat-line', text: '' });

  const bpmStep = stepper({
    label: 'Tempo', value: settings.bpm, min: LIMITS.bpm.min, max: LIMITS.bpm.max,
    unit: 'BPM', onChange: (v) => { settings.bpm = v; },
  });
  const beatsStep = stepper({
    label: 'Beats for each segment', value: settings.beats,
    min: LIMITS.ratioBeats.min, max: LIMITS.ratioBeats.max,
    onChange: (v) => { settings.beats = v; },
  });
  const loopASelect = select({
    label: 'Loop 1', value: settings.loopA, options: SUBDIVISIONS,
    onChange: (v) => { settings.loopA = v; },
  });
  const loopBSelect = select({
    label: 'Loop 2', value: settings.loopB, options: SUBDIVISIONS,
    onChange: (v) => { settings.loopB = v; },
  });
  const initialStep = stepper({
    label: 'First count-in', value: settings.initialCountIn,
    min: LIMITS.initialCountIn.min, max: LIMITS.initialCountIn.max,
    onChange: (v) => { settings.initialCountIn = v; },
  });
  const repeatStep = stepper({
    label: 'Count-in on each switch', value: settings.repeatCountIn,
    min: LIMITS.repeatCountIn.min, max: LIMITS.repeatCountIn.max,
    onChange: (v) => { settings.repeatCountIn = v; },
  });
  const countInToggle = toggle({
    label: 'Count in', checked: settings.countIn,
    onChange: (v) => {
      settings.countIn = v;
      initialStep.root.hidden = !v;
      repeatStep.root.hidden = !v;
    },
  });

  const startBtn = pressable({
    label: 'Start Training',
    className: 'primary',
    onPress: () => (lab.activeTrainer() === 'ratio' ? stop() : start()),
  });

  function paintRunning(running) {
    startBtn.textContent = running ? 'Stop Training' : 'Start Training';
    startBtn.classList.toggle('danger', running);
    if (!running) beatLine.textContent = '';
  }

  function start() {
    const plan = ratioPlan(settings);
    const started = lab.startTrainer({
      kind: 'ratio',
      plan,
      label: `Practice Lab — ratios at ${settings.bpm} BPM`,
      handlers: {
        onSegment: ({ segment }) => { nowLine.textContent = segment.label; },
        onBeat: (beat) => {
          beatLine.textContent = `Beat ${beat.beatIndex + 1} of ${beat.segment.beats}`;
        },
        onEnd: ({ cycles }) => {
          paintRunning(false);
          nowLine.textContent = cycles ? `Ready. ${cycles} cycle${cycles === 1 ? '' : 's'} done.` : 'Ready.';
        },
      },
    });
    if (!started) return;
    paintRunning(true);
  }

  function stop() {
    lab.stopTrainer();
  }

  const root = el('div', { class: 'pl-trainer pl-ratios' }, [
    el('p', { class: 'pl-trainer-lead', text: 'Move between two subdivisions in short segments.' }),
    el('div', { class: 'pl-grid' }, [bpmStep.root, beatsStep.root, loopASelect.root, loopBSelect.root]),
    el('div', { class: 'pl-grid' }, [countInToggle.root, initialStep.root, repeatStep.root]),
    el('div', { class: 'pl-row' }, [startBtn]),
    nowLine,
    beatLine,
  ]);

  lab.on('trainer', ({ kind, running }) => {
    if (kind === 'ratio') paintRunning(running);
    else if (running) paintRunning(false);
  });

  return {
    root,
    stop() { if (lab.activeTrainer() === 'ratio') stop(); },
  };
}
