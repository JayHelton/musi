// Practice settings drawer / bottom sheet for the GP parchment player.

import { TUNINGS } from '../theory.js';
import { TUNING_CATALOG } from '../tunings.js';
import { el, uid } from './dom.js';
import { icon } from './icons.js';

function tuningOptionsFor(stringCount) {
  const names = Object.keys(TUNINGS).filter((n) => TUNINGS[n].length === stringCount);
  const catalogNames = TUNING_CATALOG
    .filter((p) => p.strings === stringCount)
    .map((p) => p.name);
  const ordered = [];
  for (const n of catalogNames) if (names.includes(n) && !ordered.includes(n)) ordered.push(n);
  for (const n of names) if (!ordered.includes(n)) ordered.push(n);
  return ordered;
}

function stringPitchLabel(str) {
  return `${str.note}${str.oct}`;
}

/**
 * @param {HTMLElement} host
 */
export function mountSettingsDrawer(host, {
  stateController,
  onChange,
  uidPrefix = 'gpp',
  getShowNotation = () => false,
  getZoomLimit = () => Infinity,
  onSpeedPct = null,
  onTempoReset = null,
} = {}) {
  const noop = {
    open() {},
    close() {},
    toggle() {},
    sync() {},
    destroy() {},
    isOpen: () => false,
    detach() {},
  };
  if (!host || !stateController) return noop;

  const prefix = uidPrefix || uid('gpp-set');
  let openState = false;
  let sheetMode = false;
  let keyHandler = null;
  let mq = null;
  let onMq = null;

  const backdrop = el('div', { class: 'gpp-drawer-backdrop', 'aria-hidden': 'true' });
  const drawer = el('div', {
    class: 'gpp-drawer',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Player settings',
  });
  const sheet = el('div', {
    class: 'gpp-sheet',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Player settings',
  });
  sheet.appendChild(el('div', { class: 'gpp-sheet-handle' }));

  const drawerBody = el('div', { class: 'gpp-drawer-body' });
  const sheetBody = el('div', { class: 'gpp-drawer-body' });

  drawer.append(
    el('div', { class: 'gpp-drawer-head' }, [
      el('span', { class: 'gpp-drawer-title', text: 'Settings' }),
      el('button', {
        class: 'gpp-icon-btn gpp-drawer-close',
        type: 'button',
        html: icon('close'),
        'aria-label': 'Close settings',
        title: 'Close',
        onClick: () => close(),
      }),
    ]),
    drawerBody,
  );
  sheet.append(
    el('div', { class: 'gpp-drawer-head' }, [
      el('span', { class: 'gpp-drawer-title', text: 'Settings' }),
      el('button', {
        class: 'gpp-icon-btn gpp-drawer-close',
        type: 'button',
        html: icon('close'),
        'aria-label': 'Close settings',
        title: 'Close',
        onClick: () => close(),
      }),
    ]),
    sheetBody,
  );
  host.append(backdrop, drawer, sheet);

  const ids = {
    rest: `${prefix}-rest`,
    transpose: `${prefix}-transpose`,
    tuning: `${prefix}-tuning`,
    retuneFinger: `${prefix}-retune-finger`,
    retunePitch: `${prefix}-retune-pitch`,
    speed: `${prefix}-speed`,
    zoom: `${prefix}-zoom`,
    autoFollow: `${prefix}-autofollow`,
    notation: `${prefix}-notation`,
  };

  const controlsBody = el('div', { class: 'gpp-settings-body' });
  let controls = null;

  function zoomLimitMaxPct() {
    let limit = Infinity;
    try {
      const raw = getZoomLimit?.();
      if (typeof raw === 'number' && Number.isFinite(raw)) limit = raw;
    } catch (e) { /* no limit */ }
    if (limit === Infinity) return 250;
    const pct = Math.floor(limit * 100);
    return Math.max(75, Math.min(250, pct));
  }

  function applyZoomLimit() {
    if (!controls?.zoomInput) return;
    const maxPct = zoomLimitMaxPct();
    controls.zoomInput.max = String(maxPct);
    const curPct = Number(controls.zoomInput.value) || 100;
    if (curPct > maxPct) {
      controls.zoomInput.value = String(maxPct);
      controls.zoomPct.textContent = `${maxPct}%`;
      stateController.setParchmentZoom(maxPct / 100);
      onChange?.({ zoom: true });
    } else {
      controls.zoomPct.textContent = `${controls.zoomInput.value}%`;
    }
    if (controls.zoomLimitNote) {
      if (maxPct < 250) {
        controls.zoomLimitNote.textContent =
          `Zoom stops at ${maxPct}%, so the score fits the width.`;
        controls.zoomLimitNote.hidden = false;
      } else {
        controls.zoomLimitNote.hidden = true;
      }
    }
  }

  function buildControls() {
    controlsBody.innerHTML = '';

    const restInput = el('input', {
      type: 'number', class: 'gpp-num', id: ids.rest, min: '0', max: '30', step: '0.5',
      'aria-label': 'Rest seconds between loops',
    });
    const transposeInput = el('input', {
      type: 'number', class: 'gpp-num', id: ids.transpose, min: '-12', max: '12', step: '1',
      'aria-label': 'Transpose semitones',
    });
    const tuningSelect = el('select', { class: 'gpp-select', id: ids.tuning, 'aria-label': 'Tuning' });
    const retuneFinger = el('input', {
      type: 'radio', name: `${prefix}-retune`, id: ids.retuneFinger, value: 'fingerings', checked: 'checked',
    });
    const retunePitch = el('input', {
      type: 'radio', name: `${prefix}-retune`, id: ids.retunePitch, value: 'pitches',
    });
    const zoomInput = el('input', {
      type: 'range', class: 'gpp-slider', id: ids.zoom, min: '75', max: '250', step: '1',
      'aria-label': 'Score zoom percent',
    });
    const zoomPct = el('span', { class: 'gpp-pct', text: '100%' });
    const zoomLimitNote = el('div', { class: 'gpp-zoom-limit-note', hidden: true });
    const zoomPresets = el('div', { class: 'gpp-control-row' });
    [100, 150, 200].forEach((pct) => {
      zoomPresets.appendChild(el('button', {
        class: 'btn sm', type: 'button', text: `${pct}%`,
        onClick: () => setZoomPct(pct),
      }));
    });
    const autoFollowCheck = el('input', {
      type: 'checkbox', id: ids.autoFollow, 'aria-label': 'Auto-follow playback',
    });
    const notationCheck = el('input', {
      type: 'checkbox', id: ids.notation, 'aria-label': 'Show standard notation staff',
    });


    const loopSection = el('details', { class: 'gpp-settings-section', open: true }, [
      el('summary', { class: 'gpp-settings-section-title', text: 'Loop' }),
      el('div', { class: 'gpp-settings-section-body' }, [
        el('div', { class: 'gpp-control-row' }, [
          el('span', { class: 'gpp-unit', text: 'Rest between loops' }), restInput,
          el('span', { class: 'gpp-unit', text: 'sec' }),
        ]),
      ]),
    ]);

    const scoreSection = el('details', { class: 'gpp-settings-section', open: true }, [
      el('summary', { class: 'gpp-settings-section-title', text: 'Score' }),
      el('div', { class: 'gpp-settings-section-body' }, [
        el('div', { class: 'gpp-field' }, [
          el('span', { class: 'gpp-control-label', text: 'Zoom' }),
          el('div', { class: 'gpp-control-row' }, [zoomInput, zoomPct]),
          zoomPresets,
          zoomLimitNote,
        ]),
        el('label', { class: 'gpp-check', for: ids.autoFollow }, [
          autoFollowCheck, el('span', { text: 'Follow the playhead during playback' }),
        ]),
        el('label', { class: 'gpp-check gpp-fret-only', for: ids.notation }, [
          notationCheck, el('span', { text: 'Standard notation staff' }),
        ]),
      ]),
    ]);

    const pitchSection = el('details', { class: 'gpp-settings-section gpp-fret-only', open: true }, [
      el('summary', { class: 'gpp-settings-section-title', text: 'Pitch & tuning' }),
      el('div', { class: 'gpp-settings-section-body' }, [
        el('div', { class: 'gpp-field' }, [
          el('span', { class: 'gpp-control-label', text: 'Transpose' }),
          el('div', { class: 'gpp-control-row' }, [
            el('button', { class: 'btn sm', type: 'button', text: '−', onClick: () => applyTranspose(stateController.state.transpose - 1) }),
            transposeInput,
            el('button', { class: 'btn sm', type: 'button', text: '+', onClick: () => applyTranspose(stateController.state.transpose + 1) }),
            el('span', { class: 'gpp-unit', text: 'semitones' }),
          ]),
        ]),
        el('div', { class: 'gpp-field' }, [
          el('span', { class: 'gpp-control-label', text: 'Tuning' }),
          tuningSelect,
          el('div', { class: 'gpp-control-row' }, [
            el('label', { class: 'gpp-check', for: ids.retuneFinger }, [retuneFinger, el('span', { text: 'Keep fingerings' })]),
            el('label', { class: 'gpp-check', for: ids.retunePitch }, [retunePitch, el('span', { text: 'Keep pitches' })]),
          ]),
        ]),
      ]),
    ]);

    controlsBody.append(scoreSection, loopSection, pitchSection);

    restInput.addEventListener('change', () => {
      stateController.state.loopRestSec = Math.max(0, Math.min(30, Number(restInput.value) || 0));
      restInput.value = String(stateController.state.loopRestSec);
      onChange?.({ loopRest: true });
    });
    transposeInput.addEventListener('change', () => applyTranspose(transposeInput.value));
    tuningSelect.addEventListener('change', () => {
      stateController.state.tuning = tuningSelect.value === '__file__' ? null : tuningSelect.value;
      onChange?.({ reload: true });
    });
    retuneFinger.addEventListener('change', () => {
      if (retuneFinger.checked) {
        stateController.state.retuneMode = 'fingerings';
        onChange?.({ reload: true });
      }
    });
    retunePitch.addEventListener('change', () => {
      if (retunePitch.checked) {
        stateController.state.retuneMode = 'pitches';
        onChange?.({ reload: true });
      }
    });
    zoomInput.addEventListener('input', () => {
      const pct = Number(zoomInput.value) || 100;
      zoomPct.textContent = `${pct}%`;
      stateController.setParchmentZoom(pct / 100);
      onChange?.({ zoom: true });
    });
    autoFollowCheck.addEventListener('change', () => {
      stateController.setAutoFollow(!!autoFollowCheck.checked);
      onChange?.({ autoFollow: true });
    });
    notationCheck.addEventListener('change', () => {
      onChange?.({ notation: !!notationCheck.checked });
    });

    return {
      restInput, transposeInput, tuningSelect, retuneFinger, retunePitch,
      zoomInput, zoomPct, zoomLimitNote, autoFollowCheck, notationCheck, pitchSection, scoreSection,
    };
  }

  controls = buildControls();

  function placeBody() {
    const target = sheetMode ? sheetBody : drawerBody;
    if (controlsBody.parentElement !== target) target.appendChild(controlsBody);
  }

  function applyTranspose(n) {
    stateController.state.transpose = Math.max(-12, Math.min(12, Number(n) || 0));
    onChange?.({ reload: true });
    sync();
  }

  function setZoomPct(pct) {
    const maxPct = zoomLimitMaxPct();
    const clamped = Math.min(Number(pct) || 100, maxPct);
    stateController.setParchmentZoom(clamped / 100);
    onChange?.({ zoom: true });
    sync();
  }

  function rebuildTuningSelect(tuningSelect) {
    const model = stateController.state.baseModel;
    tuningSelect.innerHTML = '';
    if (!model?.strings) return;
    tuningSelect.appendChild(el('option', {
      value: '__file__',
      text: `File: ${model.tuning} (${model.strings.map(stringPitchLabel).join(' ')})`,
    }));
    for (const name of tuningOptionsFor(model.strings.length)) {
      if (name === model.tuning) continue;
      tuningSelect.appendChild(el('option', {
        value: name,
        text: `${name} (${TUNINGS[name].map((s) => s.note).join(' ')})`,
      }));
    }
    tuningSelect.value = stateController.state.tuning || '__file__';
  }

  function sync() {
    if (!controls) return;
    const st = stateController.state;
    rebuildTuningSelect(controls.tuningSelect);
    controls.restInput.value = String(st.loopRestSec);
    controls.transposeInput.value = String(st.transpose);
    controls.retuneFinger.checked = st.retuneMode !== 'pitches';
    controls.retunePitch.checked = st.retuneMode === 'pitches';
    controls.zoomInput.value = String(Math.round(st.parchmentZoom * 100));
    applyZoomLimit();
    controls.autoFollowCheck.checked = !!st.autoFollow;
    controls.notationCheck.checked = !!getShowNotation();
    if (controls.pitchSection) controls.pitchSection.hidden = st.viewKind !== 'guitar';
    if (controls.scoreSection) {
      const notationLabel = controls.scoreSection.querySelector('.gpp-check.gpp-fret-only');
      if (notationLabel) notationLabel.hidden = st.viewKind !== 'guitar';
    }
  }

  const SHEET_MQ = '(max-width: 599px)';

  function detectSheetMode() {
    sheetMode = window.matchMedia(SHEET_MQ).matches;
  }

  function attachListeners() {
    if (keyHandler) return;
    keyHandler = (e) => { if (e.key === 'Escape' && openState) close(); };
    document.addEventListener('keydown', keyHandler);
    mq = window.matchMedia(SHEET_MQ);
    onMq = () => { detectSheetMode(); if (openState) paintOpen(); };
    mq.addEventListener?.('change', onMq);
    backdrop.addEventListener('click', onBackdropClick);
  }

  function onBackdropClick() {
    close();
  }

  function detachListeners() {
    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }
    if (mq && onMq) {
      mq.removeEventListener?.('change', onMq);
      mq = null;
      onMq = null;
    }
    backdrop.removeEventListener('click', onBackdropClick);
  }

  function paintOpen() {
    detectSheetMode();
    placeBody();
    backdrop.classList.toggle('is-open', openState);
    drawer.classList.toggle('is-open', openState && !sheetMode);
    sheet.classList.toggle('is-open', openState && sheetMode);
    backdrop.setAttribute('aria-hidden', openState ? 'false' : 'true');
  }

  function open() {
    detectSheetMode();
    openState = true;
    attachListeners();
    sync();
    paintOpen();
  }

  function close() {
    if (!openState) return;
    openState = false;
    paintOpen();
    detachListeners();
  }

  function toggle() {
    if (openState) close();
    else open();
  }

  function destroy() {
    detachListeners();
    host.innerHTML = '';
  }

  placeBody();
  sync();

  return { open, close, toggle, sync, destroy, isOpen: () => openState, detach: detachListeners };
}
