// The session layout: the target line, the panels, and the metronome bar.
//
// The bar stays across the bottom of the view while the panels scroll.

import { el, pressable, notice } from './dom.js';
import { createTimerPanel } from './timerPanel.js';
import { createTrainerTabs } from './trainerTabs.js';
import { createCameraPanel } from './cameraPanel.js';
import { createLogPanel } from './logPanel.js';
import { createMetronomeBar } from './metronomeBar.js';
import { formatDuration, plural } from '../model/session.js';

/**
 * @param {Object} lab
 * @param {{ onEnded: Function }} handlers
 * @returns {{ root: HTMLElement, stop: Function, refresh: Function }}
 */
export function createSessionView(lab, { onEnded } = {}) {
  const session = lab.session();

  const timer = createTimerPanel(lab);
  const trainers = createTrainerTabs(lab);
  const camera = createCameraPanel(lab);
  const log = createLogPanel(lab);
  const metro = createMetronomeBar(lab);

  const totalsLine = el('p', { class: 'pl-session-totals', text: '' });

  function paintTotals() {
    const totals = lab.session()?.totals || { timerMs: 0, clips: 0, topBpm: 0 };
    const parts = [`${formatDuration(totals.timerMs)} on the clock`, plural(totals.clips, 'clip')];
    if (totals.topBpm) parts.push(`top ${totals.topBpm} BPM`);
    totalsLine.textContent = parts.join(' · ');
  }

  const endBtn = pressable({
    label: 'End Session',
    className: 'danger',
    onPress: async () => {
      endBtn.disabled = true;
      try {
        const ended = await lab.endSession();
        onEnded?.(ended);
      } finally {
        endBtn.disabled = false;
      }
    },
  });

  const head = el('header', { class: 'pl-session-head' }, [
    el('div', { class: 'pl-session-id' }, [
      el('h3', { class: 'pl-session-title', text: `${session.instrument} · ${session.technique}` }),
      el('p', { class: 'pl-session-target', text: session.target }),
      totalsLine,
    ]),
    endBtn,
  ]);

  const grid = el('div', { class: 'pl-session-grid' }, [
    el('div', { class: 'pl-col' }, [timer.root, trainers.root]),
    el('div', { class: 'pl-col' }, [camera.root, log.root]),
  ]);

  const children = [head];
  if (lab.state.resumed) {
    children.push(notice(
      'You left this session open. Carry on with it, or press End Session to close it.',
    ));
  }
  if (!lab.state.canSave) {
    children.push(notice(
      'This browser blocks storage. The session runs, but the log will not survive a reload.',
      'warn',
    ));
  }
  children.push(grid, metro.root);

  const root = el('div', { class: 'pl-session' }, children);

  const offLog = lab.on('log', () => { log.refresh(); paintTotals(); });
  const offClips = lab.on('clips', () => { log.refresh(); paintTotals(); });
  paintTotals();

  return {
    root,
    refresh() { log.refresh(); paintTotals(); },
    /** Stop the click, the timer, the camera, and any recording. */
    stop() {
      offLog();
      offClips();
      timer.stop();
      trainers.stop();
      metro.stop();
      camera.stop();
    },
  };
}
