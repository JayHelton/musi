// Track selector — the header control that names the viewed track.
//
// The button always shows the current track. It opens a list grouped by
// instrument family, with the instrument and the tuning under each name. A
// track switch keeps the playback beat, the loop, the speed, and the play
// state; the caller owns that rule.

import { el } from './dom.js';
import { icon } from './icons.js';
import { createPopover } from './popover.js';

/** Classify one track for the group headings. */
export function trackFamily(track, kind) {
  if (kind === 'drum') return 'drums';
  const name = String(track?.name || '');
  const strings = track?.model?.strings?.length || 0;
  if (/bass/i.test(name) || (strings > 0 && strings <= 5 && /bass|contra/i.test(name))) return 'bass';
  if (strings > 0 && strings <= 4) return 'bass';
  if (/vocal|voice|voix|sing/i.test(name)) return 'other';
  return 'guitars';
}

const FAMILY_LABEL = { guitars: 'Guitars', bass: 'Bass', drums: 'Drums', other: 'Other' };
const FAMILY_ORDER = ['guitars', 'bass', 'drums', 'other'];
const FAMILY_ICON = { guitars: 'guitar', bass: 'bass', drums: 'drums', other: 'note' };

/** A short instrument description for the second line of a row. */
export function trackMeta(track, kind) {
  if (kind === 'drum') return 'Drum kit';
  const parts = [];
  const info = track?.model?.trackInfo || {};
  if (info.instrumentName) parts.push(String(info.instrumentName));
  const strings = track?.model?.strings?.length || 0;
  if (strings) parts.push(`${strings}-string`);
  const tuning = track?.model?.tuning || track?.tuning;
  if (tuning && tuning !== '__file__') parts.push(String(tuning));
  const capo = Number(info.capo);
  if (Number.isFinite(capo) && capo > 0) parts.push(`Capo ${capo}`);
  return parts.join(' · ');
}

/**
 * @param {HTMLElement} host header slot for the button
 * @param {HTMLElement} overlayHost where the list opens
 * @param {{ stateController: object, onSelectTrack: (kind:string, index:number)=>void }} opts
 */
export function mountTrackSelector(host, overlayHost, { stateController, onSelectTrack } = {}) {
  const noop = { sync() {}, open() {}, close() {}, toggle() {}, isOpen: () => false, destroy() {}, detach() {} };
  if (!host || !stateController) return noop;

  host.innerHTML = '';
  host.classList.add('gpp-track-selector');

  const iconEl = el('span', { class: 'gpp-track-selector-icon', 'aria-hidden': 'true' });
  const nameEl = el('span', { class: 'gpp-track-selector-name' });
  const button = el('button', {
    class: 'gpp-track-selector-btn',
    type: 'button',
    'aria-label': 'Track',
    'aria-haspopup': 'dialog',
    'aria-expanded': 'false',
    title: 'Choose the track to view (T)',
  }, [iconEl, nameEl, el('span', { class: 'gpp-track-selector-caret', html: icon('chevronDown'), 'aria-hidden': 'true' })]);
  host.appendChild(button);

  const pop = createPopover(overlayHost || host, {
    id: 'tracks',
    title: 'Tracks',
    getAnchor: () => button,
    align: 'end',
    placement: 'below',
    width: 320,
  });
  const list = el('div', { class: 'gpp-track-list', role: 'listbox', 'aria-label': 'Tracks' });
  pop.body?.appendChild(list);

  function current() {
    const state = stateController.state;
    const gp = state.gp;
    if (state.viewKind === 'drum') {
      const t = gp.drumTracks?.[state.viewIndex];
      return { kind: 'drum', index: state.viewIndex, track: t, name: t?.name || 'Drums' };
    }
    const t = gp.tracks?.[state.viewIndex];
    return { kind: 'guitar', index: state.viewIndex, track: t, name: t?.name || `Track ${state.viewIndex + 1}` };
  }

  function buildList() {
    list.innerHTML = '';
    const state = stateController.state;
    const gp = state.gp;
    const groups = new Map();
    const push = (kind, index, track) => {
      const fam = trackFamily(track, kind);
      if (!groups.has(fam)) groups.set(fam, []);
      groups.get(fam).push({ kind, index, track });
    };
    (gp.tracks || []).forEach((t, i) => push('guitar', i, t));
    (gp.drumTracks || []).forEach((t, i) => push('drum', i, t));

    for (const fam of FAMILY_ORDER) {
      const rows = groups.get(fam);
      if (!rows?.length) continue;
      list.appendChild(el('div', { class: 'gpp-track-group-title', text: FAMILY_LABEL[fam] }));
      for (const { kind, index, track } of rows) {
        const active = state.viewKind === kind && state.viewIndex === index;
        const name = track?.name || (kind === 'drum' ? 'Drums' : `Track ${index + 1}`);
        const row = el('button', {
          class: `gpp-track-row${active ? ' is-active' : ''}`,
          type: 'button',
          role: 'option',
          'aria-selected': active ? 'true' : 'false',
          'aria-label': `View ${name}`,
          'data-kind': kind,
          'data-index': String(index),
          onClick: () => {
            pop.close();
            if (!active) onSelectTrack?.(kind, index);
          },
        }, [
          el('span', { class: 'gpp-track-row-check', html: active ? icon('check') : '', 'aria-hidden': 'true' }),
          el('span', { class: 'gpp-track-row-text' }, [
            el('span', { class: 'gpp-track-row-name', text: name }),
            el('span', { class: 'gpp-track-row-meta', text: trackMeta(track, kind) }),
          ]),
        ]);
        list.appendChild(row);
      }
    }
  }

  function sync() {
    const cur = current();
    const fam = trackFamily(cur.track, cur.kind);
    iconEl.innerHTML = icon(FAMILY_ICON[fam] || 'note');
    nameEl.textContent = cur.name;
    button.title = `${cur.name}. Choose the track to view (T)`;
    button.setAttribute('aria-label', `Track: ${cur.name}. Choose the track to view`);
    if (pop.isOpen()) buildList();
  }

  function open() {
    buildList();
    pop.open(button);
    button.setAttribute('aria-expanded', 'true');
  }
  function close() {
    pop.close();
    button.setAttribute('aria-expanded', 'false');
  }
  function toggle() {
    if (pop.isOpen()) close();
    else open();
  }

  button.addEventListener('click', () => toggle());

  sync();

  return {
    sync,
    open,
    close,
    toggle,
    isOpen: pop.isOpen,
    detach: pop.detach,
    destroy() {
      pop.destroy();
      host.innerHTML = '';
      host.classList.remove('gpp-track-selector');
    },
  };
}
