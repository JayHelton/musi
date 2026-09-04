// Mixer drawer content — one row per track with mute, solo, and volume.
//
// Mute and solo are separate states. A solo isolates one track and keeps the
// mute states of the other tracks, so the mix comes back when the solo ends.
// The row of the viewed track carries a mark, and a tap on a name views that
// track in the score.

import { el } from './dom.js';
import { icon } from './icons.js';
import { trackFamily, trackMeta } from './trackSelector.js';

const FAMILY_ICON = { guitars: 'guitar', bass: 'bass', drums: 'drums', other: 'note' };

/**
 * @param {HTMLElement} host
 * @param {{ stateController: object, onChange?: (patch?:object)=>void, onViewTrack?: (kind:string, index:number)=>void }} opts
 */
export function mountTrackMixer(host, { stateController, onChange, onViewTrack } = {}) {
  const noop = { sync() {}, destroy() {} };
  if (!host || !stateController) return noop;

  host.innerHTML = '';
  host.classList.add('gpp-mixer');

  const head = el('div', { class: 'gpp-mixer-head' });
  const resetBtn = el('button', {
    class: 'gpp-text-btn gpp-mixer-reset',
    type: 'button',
    text: 'Reset mix',
    'aria-label': 'Unmute every track and clear the solo',
    title: 'Unmute every track and clear the solo',
  });
  resetBtn.addEventListener('click', () => {
    stateController.playAll();
    onChange?.();
    sync();
  });
  head.appendChild(resetBtn);
  const list = el('div', { class: 'gpp-mix-list', role: 'list', 'aria-label': 'Track mixer' });
  host.append(head, list);

  let rows = [];

  function buildRows() {
    list.innerHTML = '';
    rows = [];
    const gp = stateController.state.gp;
    (gp.tracks || []).forEach((track, i) => rows.push(makeRow('guitar', i, track)));
    (gp.drumTracks || []).forEach((track, i) => rows.push(makeRow('drum', i, track)));
  }

  function makeRow(kind, index, track) {
    const state = stateController.state;
    const name = track?.name || (kind === 'drum' ? 'Drums' : `Track ${index + 1}`);
    const isViewing = state.viewKind === kind && state.viewIndex === index;
    const isSolo = state.solo?.kind === kind && state.solo.index === index;
    const enabled = kind === 'guitar' ? state.enabledGuitars[index] : state.enabledDrums[index];
    const muted = !enabled;
    const volume = stateController.getTrackVolume(kind, index);
    const fam = trackFamily(track, kind);

    const nameBtn = el('button', {
      class: 'gpp-mix-name',
      type: 'button',
      'aria-label': isViewing ? `${name}, viewed in the score` : `View ${name} in the score`,
      title: isViewing ? 'This track is in the score' : 'View this track in the score',
      'aria-pressed': isViewing ? 'true' : 'false',
    }, [
      el('span', { class: 'gpp-mix-icon', html: icon(FAMILY_ICON[fam] || 'note'), 'aria-hidden': 'true' }),
      el('span', { class: 'gpp-mix-text' }, [
        el('span', { class: 'gpp-mix-title', text: name }),
        el('span', { class: 'gpp-mix-meta', text: trackMeta(track, kind) }),
      ]),
      isViewing ? el('span', { class: 'gpp-mix-viewing', text: 'Viewing' }) : null,
    ]);
    nameBtn.addEventListener('click', () => { if (!isViewing) onViewTrack?.(kind, index); });

    const muteBtn = el('button', {
      class: `gpp-mix-toggle gpp-mix-mute${muted ? ' is-on' : ''}`,
      type: 'button',
      text: 'M',
      'aria-label': `Mute ${name}`,
      'aria-pressed': muted ? 'true' : 'false',
      title: muted ? 'Muted. Press to unmute' : 'Mute',
    });
    muteBtn.addEventListener('click', () => {
      const nowEnabled = kind === 'guitar' ? state.enabledGuitars[index] : state.enabledDrums[index];
      stateController.setTrackEnabled(kind, index, !nowEnabled);
      onChange?.({ mute: true, kind, index, muted: nowEnabled });
      sync();
    });

    const soloBtn = el('button', {
      class: `gpp-mix-toggle gpp-mix-solo${isSolo ? ' is-on' : ''}`,
      type: 'button',
      text: 'S',
      'aria-label': `Solo ${name}`,
      'aria-pressed': isSolo ? 'true' : 'false',
      title: isSolo ? 'Solo on. Press to hear every track' : 'Solo this track',
    });
    soloBtn.addEventListener('click', () => {
      stateController.toggleSolo(kind, index);
      onChange?.({ solo: true, kind, index });
      sync();
    });

    const volInput = el('input', {
      type: 'range',
      class: 'gpp-slider gpp-mix-volume',
      min: '0',
      max: '100',
      step: '1',
      value: String(Math.round(volume * 100)),
      'aria-label': `Volume ${name}`,
      title: `Volume for ${name}`,
    });
    volInput.addEventListener('input', () => {
      const gain = Math.max(0, Math.min(1, Number(volInput.value) / 100));
      stateController.setTrackVolume(kind, index, gain);
      onChange?.({ volume: true, kind, index, gain });
    });

    const controls = el('div', { class: 'gpp-mix-controls' }, [muteBtn, soloBtn, volInput]);
    const row = el('div', {
      class: 'gpp-mix-row'
        + (muted ? ' is-muted' : '')
        + (isSolo ? ' is-solo' : '')
        + (state.solo && !isSolo ? ' is-dimmed' : '')
        + (isViewing ? ' is-viewing' : ''),
      role: 'listitem',
    }, [nameBtn, controls]);
    list.appendChild(row);
    return { row, muteBtn, soloBtn, volInput, kind, index };
  }

  function sync() {
    buildRows();
  }

  function destroy() {
    host.innerHTML = '';
    host.classList.remove('gpp-mixer');
    rows = [];
  }

  buildRows();

  return { sync, destroy };
}
