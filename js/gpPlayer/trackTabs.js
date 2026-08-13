// Always-visible track tab strip for the GP player.

import { el } from './dom.js';

/**
 * @param {HTMLElement} host
 * @param {{ stateController: object, onSelectTrack?: (kind:string, index:number)=>void }} opts
 */
export function mountTrackTabs(host, { stateController, onSelectTrack } = {}) {
  const noop = { sync() {}, destroy() {} };
  if (!host || !stateController) return noop;

  host.innerHTML = '';
  host.classList.add('gpp-track-tabs');
  host.setAttribute('role', 'tablist');
  host.setAttribute('aria-label', 'Tracks');

  const strip = el('div', { class: 'gpp-track-tabs-strip' });
  host.appendChild(strip);

  let tabs = [];

  function buildTabs() {
    strip.innerHTML = '';
    tabs = [];
    const state = stateController.state;
    const gp = state.gp;

    (gp.tracks || []).forEach((track, i) => {
      tabs.push(makeTab('guitar', i, track.name || `Track ${i + 1}`, '🎸'));
    });
    (gp.drumTracks || []).forEach((track, i) => {
      tabs.push(makeTab('drum', i, track.name || 'Drums', '🥁'));
    });
  }

  function makeTab(kind, index, name, icon) {
    const isActive = stateController.state.viewKind === kind
      && stateController.state.viewIndex === index;
    const btn = el('button', {
      class: 'gpp-track-tab' + (isActive ? ' is-active' : ''),
      type: 'button',
      role: 'tab',
      'aria-selected': isActive ? 'true' : 'false',
      'aria-label': `Track ${name}`,
      title: name,
      text: `${icon} ${name}`,
      'data-kind': kind,
      'data-index': String(index),
    });
    btn.addEventListener('click', () => {
      if (isActive) return;
      onSelectTrack?.(kind, index);
    });
    strip.appendChild(btn);
    return { btn, kind, index };
  }

  function sync() {
    buildTabs();
  }

  function destroy() {
    host.innerHTML = '';
    host.classList.remove('gpp-track-tabs');
    tabs = [];
  }

  buildTabs();

  return { sync, destroy };
}
