// The trainer tabs of the session view.
//
// The lab holds one active trainer. Starting one stops the other two, because
// the container claims the shared audio owner for each start.
//
// The Metronome tab is a short note, because the metronome bar stays across
// the bottom of the view at all times.

import { el, tabBar, panel } from './dom.js';
import { createRatiosPanel } from './ratiosPanel.js';
import { createSpeedPanel } from './speedPanel.js';

const TABS = [
  { id: 'metronome', label: 'Metronome' },
  { id: 'ratios', label: 'Ratios' },
  { id: 'speed', label: 'Speed' },
];

/**
 * @param {Object} lab
 * @returns {{ root: HTMLElement, stop: Function }}
 */
export function createTrainerTabs(lab) {
  const ratios = createRatiosPanel(lab);
  const speed = createSpeedPanel(lab);

  const metronomeNote = el('div', { class: 'pl-trainer pl-metro-note' }, [
    el('p', {
      class: 'pl-trainer-lead',
      text: 'The click sits across the bottom of this screen. Set the tempo there and press Click.',
    }),
    el('p', {
      class: 'pl-hint',
      text: 'Hold Shift on the minus or plus control to move the tempo in steps of five.',
    }),
  ]);

  const panels = {
    metronome: metronomeNote,
    ratios: ratios.root,
    speed: speed.root,
  };

  for (const [id, node] of Object.entries(panels)) {
    node.id = `pl-panel-${id}`;
    node.setAttribute('role', 'tabpanel');
    node.setAttribute('aria-labelledby', `pl-tab-${id}`);
  }

  const body = el('div', { class: 'pl-trainer-body' }, Object.values(panels));

  function show(id) {
    for (const [key, node] of Object.entries(panels)) node.hidden = key !== id;
  }

  const tabs = tabBar({
    tabs: TABS,
    active: 'metronome',
    ariaLabel: 'Trainers',
    onChange: show,
  });

  const view = panel('Trainers', 'pl-trainers');
  view.head.appendChild(tabs.root);
  view.body.appendChild(body);
  show('metronome');

  return {
    root: view.root,
    stop() { ratios.stop(); speed.stop(); },
  };
}
