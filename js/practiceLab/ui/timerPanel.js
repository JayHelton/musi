// The practice timer panel: presets from 1 to 10 minutes.
//
// The timer is one tool inside the session. It never ends the session, and a
// session accepts any number of timer blocks. The sound at zero uses the click
// port, so it follows the click voice the player picked in Settings.

import { el, clear, pressable, panel } from './dom.js';
import { formatDuration } from '../model/session.js';

const PRESETS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * @param {Object} lab
 * @returns {{ root: HTMLElement, stop: Function }}
 */
export function createTimerPanel(lab) {
  const { countdown, ports } = lab;
  let minutes = 2;

  const readout = el('div', { class: 'pl-timer-readout', text: '2:00' });
  readout.setAttribute('role', 'timer');
  readout.setAttribute('aria-live', 'off');

  const status = el('p', { class: 'pl-timer-status', text: 'Pick a length and press Start.' });
  const presetRow = el('div', { class: 'pl-timer-presets' });
  presetRow.setAttribute('role', 'group');
  presetRow.setAttribute('aria-label', 'Timer length in minutes');

  const startBtn = pressable({
    label: 'Start Timer',
    className: 'primary',
    onPress: () => (countdown.isRunning() ? stopTimer() : startTimer()),
  });

  function paintPresets() {
    clear(presetRow);
    for (const value of PRESETS) {
      const btn = pressable({
        label: `${value}m`,
        className: value === minutes ? 'pl-preset active' : 'pl-preset',
        ariaLabel: `${value} minute timer`,
        pressed: value === minutes,
        onPress: () => {
          minutes = value;
          if (!countdown.isRunning()) readout.textContent = formatDuration(value * 60000);
          paintPresets();
        },
      });
      presetRow.appendChild(btn);
    }
  }

  function paintRunning(running) {
    startBtn.textContent = running ? 'Stop Timer' : 'Start Timer';
    startBtn.classList.toggle('danger', running);
    readout.classList.toggle('running', running);
  }

  /** A short two-note figure marks zero, so the player hears it across a room. */
  function soundAtZero() {
    const at = ports.click.now();
    if (!at) return;
    ports.click.schedule(at + 0.05, 'accent');
    ports.click.schedule(at + 0.28, 'accent');
    ports.click.schedule(at + 0.51, 'accent');
  }

  function startTimer() {
    ports.click.prime();
    const started = countdown.start(minutes, {
      onTick: ({ remainingMs }) => { readout.textContent = formatDuration(remainingMs); },
      onComplete: async ({ minutes: done }) => {
        readout.textContent = '0:00';
        status.textContent = `${done} minute block finished.`;
        paintRunning(false);
        soundAtZero();
        await lab.appendEntry('timer-complete', { minutes: done });
      },
      onStop: async ({ minutes: done, elapsedMs }) => {
        status.textContent = `Stopped after ${formatDuration(elapsedMs)}.`;
        paintRunning(false);
        readout.textContent = formatDuration(done * 60000);
        await lab.appendEntry('timer-stop', { minutes: done, elapsedMs });
      },
    });
    if (!started) return;
    status.textContent = `${minutes} minute block running.`;
    paintRunning(true);
    lab.appendEntry('timer-start', { minutes });
  }

  function stopTimer() {
    countdown.stop();
  }

  const view = panel('Timer', 'pl-timer');
  view.body.append(readout, presetRow, el('div', { class: 'pl-row' }, [startBtn]), status);

  paintPresets();
  paintRunning(false);

  return {
    root: view.root,
    stop() { if (countdown.isRunning()) countdown.stop(); },
  };
}
