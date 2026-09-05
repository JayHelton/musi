// The Practice tab: the timer, the trainers, the camera, and the click.
//
// There is nothing to start and nothing to end. Every tool is ready the
// moment the tab opens, and the click bar stays across the bottom of the view
// while the panels scroll.

import { el, notice } from './dom.js';
import { createTimerPanel } from './timerPanel.js';
import { createTrainerTabs } from './trainerTabs.js';
import { createCameraPanel } from './cameraPanel.js';
import { createMetronomeBar } from './metronomeBar.js';

/**
 * @param {Object} lab
 * @returns {{ root: HTMLElement, stop: Function }}
 */
export function createPracticeView(lab) {
  const timer = createTimerPanel(lab);
  const trainers = createTrainerTabs(lab);
  const camera = createCameraPanel(lab);
  const metro = createMetronomeBar(lab);

  const grid = el('div', { class: 'pl-practice-grid' }, [
    el('div', { class: 'pl-col' }, [timer.root, trainers.root]),
    el('div', { class: 'pl-col' }, [camera.root]),
  ]);

  const children = [];
  if (!lab.state.canSave) {
    children.push(notice(
      'This browser blocks storage. The tools run, but a take will not survive a reload.',
      'warn',
    ));
  }
  children.push(grid, metro.root);

  const root = el('div', { class: 'pl-practice' }, children);

  return {
    root,
    /** Stop the click, the timer, the camera, and any recording. */
    stop() {
      timer.stop();
      trainers.stop();
      metro.stop();
      camera.stop();
    },
  };
}
