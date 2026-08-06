// Track mixer drawer content — enable, solo, view per guitar/bass/drum track.

import { el } from './dom.js';

function trackTypeLabel(track, kind) {
  if (kind === 'drum') return 'Drums';
  const tuning = track.tuning || '';
  if (/bass/i.test(track.name || '') || (track.model?.strings?.length || 0) <= 4) return 'Bass';
  return tuning || 'Guitar';
}

/**
 * @param {HTMLElement} host
 * @param {{ stateController: object, onChange?: ()=>void, onViewTrack?: (kind:string, index:number)=>void }} opts
 */
export function mountTrackMixer(host, { stateController, onChange, onViewTrack } = {}) {
  const noop = { sync() {}, destroy() {} };
  if (!host || !stateController) return noop;

  host.innerHTML = '';
  const list = el('div', { class: 'gpp-mix-list', 'aria-label': 'Track mixer' });
  host.appendChild(list);

  const playAllBtn = el('button', {
    class: 'btn sm gpp-transport-btn',
    type: 'button',
    text: 'Play all',
    'aria-label': 'Play all tracks',
    title: 'Enable all tracks and clear solo',
  });
  playAllBtn.addEventListener('click', () => {
    stateController.playAll();
    onChange?.();
    sync();
  });
  host.insertBefore(playAllBtn, list);

  let rows = [];

  function buildRows() {
    list.innerHTML = '';
    rows = [];
    const { state, gp } = stateController;

    (gp.tracks || []).forEach((track, i) => {
      rows.push(makeRow('guitar', i, track));
    });
    (gp.drumTracks || []).forEach((track, i) => {
      rows.push(makeRow('drum', i, track));
    });
  }

  function makeRow(kind, index, track) {
    const isViewing = state.viewKind === kind && state.viewIndex === index;
    const isSolo = state.solo?.kind === kind && state.solo.index === index;
    const enabled = kind === 'guitar'
      ? state.enabledGuitars[index]
      : state.enabledDrums[index];

    const enableCb = el('input', {
      type: 'checkbox',
      class: 'gpp-mix-mute',
      checked: enabled ? 'checked' : false,
      'aria-label': `Enable ${track.name}`,
    });
    const soloBtn = el('button', {
      class: 'btn sm gpp-mix-solo',
      type: 'button',
      text: 'S',
      'aria-label': `Solo ${track.name}`,
      title: 'Solo this track',
    });
    const nameBtn = el('button', {
      class: 'gpp-mix-name',
      type: 'button',
      text: track.name || (kind === 'drum' ? 'Drums' : 'Track'),
      title: 'View this track in the score',
    });
    const typeEl = el('span', { class: 'gpp-mix-type', text: trackTypeLabel(track, kind) });
    const viewEl = isViewing
      ? el('span', { class: 'gpp-mix-viewing', text: 'View' })
      : el('button', {
        class: 'btn sm',
        type: 'button',
        text: 'View',
        'aria-label': `View ${track.name}`,
        title: 'View this track in the score',
      });

    const row = el('div', {
      class: 'gpp-mix-row'
        + (enabled ? '' : ' is-muted')
        + (isSolo ? ' is-solo' : '')
        + (isViewing ? ' is-viewing' : ''),
    }, [enableCb, soloBtn, nameBtn, typeEl, viewEl]);

    enableCb.addEventListener('change', () => {
      stateController.setTrackEnabled(kind, index, enableCb.checked);
      onChange?.();
      sync();
    });
    soloBtn.addEventListener('click', () => {
      stateController.toggleSolo(kind, index);
      onChange?.();
      sync();
    });
    const viewHandler = () => onViewTrack?.(kind, index);
    nameBtn.addEventListener('click', viewHandler);
    if (viewEl.tagName === 'BUTTON') viewEl.addEventListener('click', viewHandler);

    list.appendChild(row);
    return { row, enableCb, soloBtn, kind, index };
  }

  function sync() {
    buildRows();
  }

  function destroy() {
    host.innerHTML = '';
    rows = [];
  }

  buildRows();

  return { sync, destroy };
}
