// The speed trainer: a tempo ladder that climbs and then stops.
//
// The trainer plays the set loops at each tempo, then raises the tempo by the
// increment. It stops at the end tempo and names the top tempo it reached.

import { el, pressable, stepper, toggle, notice } from './dom.js';
import { speedPlan, speedSteps, LIMITS } from '../engine/timeline.js';

const TIME_SIGNATURES = [2, 3, 4, 5, 6, 7];

/**
 * @param {Object} lab
 * @returns {{ root: HTMLElement, stop: Function }}
 */
export function createSpeedPanel(lab) {
  const settings = {
    timeSig: LIMITS.beatsPerBar.def,
    startBpm: LIMITS.bpm.def,
    endBpm: 120,
    increment: LIMITS.increment.def,
    barsPerLoop: LIMITS.barsPerLoop.def,
    loopsPerStep: LIMITS.loopsPerStep.def,
    countIn: true,
    initialCountIn: LIMITS.initialCountIn.def,
    stepCountIn: LIMITS.repeatCountIn.def,
  };

  let topReached = 0;

  const nowLine = el('p', { class: 'pl-now-line', text: 'Ready.' });
  nowLine.setAttribute('aria-live', 'polite');
  const stepLine = el('p', { class: 'pl-beat-line', text: '' });
  const problem = notice('', 'warn');
  problem.hidden = true;

  const sigRow = el('div', { class: 'pl-sig-row' });
  sigRow.setAttribute('role', 'group');
  sigRow.setAttribute('aria-label', 'Time signature');

  function paintSignatures() {
    sigRow.replaceChildren();
    for (const beats of TIME_SIGNATURES) {
      sigRow.appendChild(pressable({
        label: `${beats}/4`,
        className: beats === settings.timeSig ? 'pl-preset active' : 'pl-preset',
        pressed: beats === settings.timeSig,
        ariaLabel: `${beats} four time`,
        onPress: () => { settings.timeSig = beats; paintSignatures(); paintPreview(); },
      }));
    }
  }

  const startStep = stepper({
    label: 'Start tempo', value: settings.startBpm, min: LIMITS.bpm.min, max: LIMITS.bpm.max,
    unit: 'BPM', onChange: (v) => { settings.startBpm = v; paintPreview(); },
  });
  const endStep = stepper({
    label: 'End tempo', value: settings.endBpm, min: LIMITS.bpm.min, max: LIMITS.bpm.max,
    unit: 'BPM', onChange: (v) => { settings.endBpm = v; paintPreview(); },
  });
  const incStep = stepper({
    label: 'Tempo step', value: settings.increment,
    min: LIMITS.increment.min, max: LIMITS.increment.max,
    unit: 'BPM', onChange: (v) => { settings.increment = v; paintPreview(); },
  });
  const barsStep = stepper({
    label: 'Bars for each loop', value: settings.barsPerLoop,
    min: LIMITS.barsPerLoop.min, max: LIMITS.barsPerLoop.max,
    onChange: (v) => { settings.barsPerLoop = v; paintPreview(); },
  });
  const loopsStep = stepper({
    label: 'Loops before each rise', value: settings.loopsPerStep,
    min: LIMITS.loopsPerStep.min, max: LIMITS.loopsPerStep.max,
    onChange: (v) => { settings.loopsPerStep = v; paintPreview(); },
  });
  const initialStep = stepper({
    label: 'First count-in', value: settings.initialCountIn,
    min: LIMITS.initialCountIn.min, max: LIMITS.initialCountIn.max,
    onChange: (v) => { settings.initialCountIn = v; },
  });
  const riseStep = stepper({
    label: 'Count-in on each rise', value: settings.stepCountIn,
    min: LIMITS.repeatCountIn.min, max: LIMITS.repeatCountIn.max,
    onChange: (v) => { settings.stepCountIn = v; },
  });
  const countInToggle = toggle({
    label: 'Count in', checked: settings.countIn,
    onChange: (v) => {
      settings.countIn = v;
      initialStep.root.hidden = !v;
      riseStep.root.hidden = !v;
    },
  });

  const preview = el('p', { class: 'pl-preview', text: '' });

  function paintPreview() {
    const steps = speedSteps(settings);
    if (!steps.length) {
      preview.textContent = '';
      problem.textContent = 'The end tempo must be at or above the start tempo.';
      problem.hidden = false;
      startBtn.disabled = true;
      return;
    }
    problem.hidden = true;
    startBtn.disabled = false;
    const bars = settings.barsPerLoop * settings.loopsPerStep;
    const stepWord = steps.length === 1 ? 'step' : 'steps';
    const barWord = bars === 1 ? 'bar' : 'bars';
    preview.textContent = `${steps.length} ${stepWord} · ${bars} ${barWord} each · top ${steps[steps.length - 1]} BPM`;
  }

  const startBtn = pressable({
    label: 'Start Training',
    className: 'primary',
    onPress: () => (lab.activeTrainer() === 'speed' ? stop() : start()),
  });

  function paintRunning(running) {
    startBtn.textContent = running ? 'Stop Training' : 'Start Training';
    startBtn.classList.toggle('danger', running);
    if (!running) stepLine.textContent = '';
  }

  function start() {
    const plan = speedPlan(settings);
    if (!plan) {
      problem.textContent = 'The end tempo must be at or above the start tempo.';
      problem.hidden = false;
      return;
    }
    problem.hidden = true;
    topReached = settings.startBpm;
    const steps = speedSteps(settings);
    const started = lab.startTrainer({
      kind: 'speed',
      plan,
      label: `Practice Lab — speed to ${plan.topBpm} BPM`,
      handlers: {
        onSegment: ({ segment }) => {
          nowLine.textContent = segment.label;
          if (segment.phase === 'step') {
            topReached = Math.max(topReached, segment.bpm);
            const at = steps.indexOf(segment.bpm) + 1;
            stepLine.textContent = `Step ${at} of ${steps.length}`;
          }
        },
        onEnd: ({ completed }) => {
          paintRunning(false);
          nowLine.textContent = completed
            ? `Finished at ${topReached} BPM.`
            : `Stopped at ${topReached} BPM.`;
        },
      },
    });
    if (!started) return;
    paintRunning(true);
  }

  function stop() {
    lab.stopTrainer();
  }

  const root = el('div', { class: 'pl-trainer pl-speed' }, [
    el('p', { class: 'pl-trainer-lead', text: 'Climb the tempo in steps, and stop at the top.' }),
    el('div', { class: 'pl-field' }, [
      el('span', { class: 'pl-field-label', text: 'Time signature' }),
      sigRow,
    ]),
    el('div', { class: 'pl-grid' }, [startStep.root, endStep.root, incStep.root]),
    el('div', { class: 'pl-grid' }, [barsStep.root, loopsStep.root]),
    el('div', { class: 'pl-grid' }, [countInToggle.root, initialStep.root, riseStep.root]),
    preview,
    problem,
    el('div', { class: 'pl-row' }, [startBtn]),
    nowLine,
    stepLine,
  ]);

  lab.on('trainer', ({ kind, running }) => {
    if (kind === 'speed') paintRunning(running);
    else if (running) paintRunning(false);
  });

  paintSignatures();
  paintPreview();

  return {
    root,
    stop() { if (lab.activeTrainer() === 'speed') stop(); },
  };
}
