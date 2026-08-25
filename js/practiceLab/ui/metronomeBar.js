// The compact metronome across the bottom of the session view.
//
// The bar holds the tempo, a minus control, a plus control, a start control,
// and a beat light. A tempo change while the click runs takes effect without a
// restart.

import { el, pressable, slider } from './dom.js';
import { metronomePlan, LIMITS, clampTo } from '../engine/timeline.js';

const STEP = 1;
const BIG_STEP = 5;

/**
 * @param {Object} lab
 * @returns {{ root: HTMLElement, stop: Function }}
 */
export function createMetronomeBar(lab) {
  let bpm = LIMITS.bpm.def;
  let bpmStart = bpm;
  let bpmLow = bpm;
  let bpmHigh = bpm;
  let startedMs = 0;

  const readout = el('output', { class: 'pl-metro-bpm', text: String(bpm) });
  readout.setAttribute('aria-live', 'off');
  readout.setAttribute('aria-label', 'Metronome tempo');

  const light = el('span', { class: 'pl-metro-light' });
  light.setAttribute('aria-hidden', 'true');

  const playBtn = pressable({
    label: '▶ Click',
    className: 'primary pl-metro-play',
    ariaLabel: 'Start the metronome',
    onPress: () => (lab.activeTrainer() === 'metronome' ? stop() : start()),
  });

  const tempoSlider = slider({
    label: 'Metronome tempo',
    className: 'pl-metro-slider',
    value: bpm,
    min: LIMITS.bpm.min,
    max: LIMITS.bpm.max,
    onInput: (value) => setBpm(value),
  });

  function setBpm(next) {
    const value = clampTo(LIMITS.bpm, next);
    if (value === bpm) return;
    bpm = value;
    readout.textContent = String(bpm);
    tempoSlider.set(bpm);
    if (lab.activeTrainer() === 'metronome') {
      bpmLow = Math.min(bpmLow, bpm);
      bpmHigh = Math.max(bpmHigh, bpm);
      lab.scheduler.setBpm(bpm);
    }
  }

  function flash(level) {
    light.classList.remove('on', 'accent');
    // Reading the layout restarts the animation on a back-to-back beat.
    void light.offsetWidth;
    light.classList.add('on');
    if (level === 'accent') light.classList.add('accent');
  }

  function paintRunning(running) {
    playBtn.textContent = running ? '■ Stop' : '▶ Click';
    playBtn.classList.toggle('danger', running);
    playBtn.setAttribute('aria-label', running ? 'Stop the metronome' : 'Start the metronome');
    root.classList.toggle('running', running);
    if (!running) light.classList.remove('on', 'accent');
  }

  function start() {
    bpmStart = bpm;
    bpmLow = bpm;
    bpmHigh = bpm;
    startedMs = lab.ports.clock.nowMs();
    const started = lab.startTrainer({
      kind: 'metronome',
      plan: metronomePlan({ bpm, beatsPerBar: 4 }),
      label: `Practice Lab — ${bpm} BPM`,
      handlers: {
        onBeat: (beat) => flash(beat.level),
        onEnd: async () => {
          paintRunning(false);
          const elapsedMs = Math.max(0, lab.ports.clock.nowMs() - startedMs);
          await lab.appendEntry('metronome-stop', {
            bpmStart,
            bpmEnd: bpm,
            bpmLow,
            bpmHigh,
            elapsedMs,
          });
        },
      },
    });
    if (!started) return;
    paintRunning(true);
    lab.appendEntry('metronome-start', { bpm, beatsPerBar: 4 });
  }

  function stop() {
    lab.stopTrainer();
  }

  const root = el('div', { class: 'pl-metro-bar' }, [
    el('div', { class: 'pl-metro-left' }, [
      light,
      el('div', { class: 'pl-metro-readout' }, [
        readout,
        el('span', { class: 'pl-metro-unit', text: 'BPM' }),
      ]),
    ]),
    el('div', { class: 'pl-metro-controls' }, [
      pressable({
        label: '−', className: 'pl-step-btn', ariaLabel: 'Tempo down',
        onPress: (event) => setBpm(bpm - (event.shiftKey ? BIG_STEP : STEP)),
      }),
      tempoSlider.node,
      pressable({
        label: '+', className: 'pl-step-btn', ariaLabel: 'Tempo up',
        onPress: (event) => setBpm(bpm + (event.shiftKey ? BIG_STEP : STEP)),
      }),
    ]),
    playBtn,
  ]);
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Metronome');

  // Another trainer, or another tool, can take the click. Keep the bar honest.
  lab.on('trainer', ({ kind, running }) => {
    if (kind !== 'metronome') {
      if (running) paintRunning(false);
      return;
    }
    paintRunning(running);
  });

  return {
    root,
    stop() { if (lab.activeTrainer() === 'metronome') stop(); },
  };
}
