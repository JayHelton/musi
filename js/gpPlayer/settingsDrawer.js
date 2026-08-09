// Practice settings drawer / bottom sheet for the GP parchment player.

import { TUNINGS } from '../theory.js';
import { TUNING_CATALOG } from '../tunings.js';
import { el, uid } from './dom.js';
import {
  GPP_MIN_BPM,
  GPP_MAX_BPM,
  GPP_MIN_TEMPO_PCT,
  GPP_MAX_TEMPO_PCT,
  clampBpm,
  clampTempoPct,
} from './tempoRange.js';

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
} = {}) {
  const noop = {
    open() {},
    close() {},
    toggle() {},
    sync() {},
    destroy() {},
    isOpen: () => false,
  };
  if (!host || !stateController) return noop;

  const prefix = uidPrefix || uid('gpp-set');
  let openState = false;
  let sheetMode = false;

  const backdrop = el('div', { class: 'gpp-drawer-backdrop', 'aria-hidden': 'true' });
  const drawer = el('div', {
    class: 'gpp-drawer',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Practice settings',
  });
  const sheet = el('div', {
    class: 'gpp-sheet',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Practice settings',
  });
  sheet.appendChild(el('div', { class: 'gpp-sheet-handle' }));

  const drawerBody = el('div', { class: 'gpp-drawer-body' });
  const sheetBody = el('div', { class: 'gpp-drawer-body' });

  drawer.append(
    el('div', { class: 'gpp-drawer-head' }, [
      el('span', { class: 'gpp-drawer-title', text: 'Practice' }),
      el('button', {
        class: 'gpp-icon-btn gpp-drawer-close',
        type: 'button',
        text: '✕',
        'aria-label': 'Close settings',
        title: 'Close',
        onClick: () => close(),
      }),
    ]),
    drawerBody,
  );
  sheet.append(
    el('div', { class: 'gpp-drawer-head' }, [
      el('span', { class: 'gpp-drawer-title', text: 'Practice' }),
      el('button', {
        class: 'gpp-icon-btn gpp-drawer-close',
        type: 'button',
        text: '✕',
        'aria-label': 'Close settings',
        title: 'Close',
        onClick: () => close(),
      }),
    ]),
    sheetBody,
  );
  host.append(backdrop, drawer, sheet);

  const ids = {
    metro: `${prefix}-metro`,
    countIn: `${prefix}-countin`,
    loop: `${prefix}-loop`,
    loopStart: `${prefix}-loop-start`,
    loopEnd: `${prefix}-loop-end`,
    rest: `${prefix}-rest`,
    transpose: `${prefix}-transpose`,
    tuning: `${prefix}-tuning`,
    retuneFinger: `${prefix}-retune-finger`,
    retunePitch: `${prefix}-retune-pitch`,
    zoom: `${prefix}-zoom`,
    autoFollow: `${prefix}-autofollow`,
    bpm: `${prefix}-bpm`,
    bpmSlider: `${prefix}-bpm-slider`,
  };

  const controlsBody = el('div', { class: 'gpp-settings-body' });
  let controls = null;

  function buildControls() {
    controlsBody.innerHTML = '';

    const bpmInput = el('input', {
      type: 'number', class: 'gpp-num', id: ids.bpm,
      min: String(GPP_MIN_BPM), max: String(GPP_MAX_BPM), step: '1',
      'aria-label': 'BPM',
    });
    const bpmSlider = el('input', {
      type: 'range', class: 'gpp-slider', id: ids.bpmSlider,
      min: String(GPP_MIN_TEMPO_PCT), max: String(GPP_MAX_TEMPO_PCT), step: '1',
      'aria-label': 'Tempo percent',
    });
    const bpmPct = el('span', { class: 'gpp-pct', text: '100%' });
    const resetBpmBtn = el('button', {
      class: 'btn sm gpp-reset-bpm',
      type: 'button',
      text: 'Reset to original',
      'aria-label': 'Reset tempo to score BPM',
    });
    const metroCheck = el('input', { type: 'checkbox', id: ids.metro, 'aria-label': 'Metronome' });
    const countInCheck = el('input', { type: 'checkbox', id: ids.countIn, 'aria-label': 'Count-in' });
    const loopToggle = el('input', { type: 'checkbox', id: ids.loop });
    const loopStartSel = el('select', {
      class: 'gpp-select gpp-loop-sel', id: ids.loopStart, 'aria-label': 'Loop start bar',
    });
    const loopEndSel = el('select', {
      class: 'gpp-select gpp-loop-sel', id: ids.loopEnd, 'aria-label': 'Loop end bar',
    });
    const restInput = el('input', {
      type: 'number', class: 'gpp-num', id: ids.rest, min: '0', max: '30', step: '0.5',
      'aria-label': 'Rest seconds between loops',
    });
    const loopSelBtn = el('button', {
      class: 'gpp-loop-select-toggle',
      type: 'button',
      text: 'Loop Selection',
      'aria-label': 'Toggle loop selection mode on score',
    });
    const clearLoopBtn = el('button', {
      class: 'btn sm', type: 'button', text: 'Clear Loop', 'aria-label': 'Clear loop',
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

    const tempoSection = el('details', { class: 'gpp-settings-section', open: true }, [
      el('summary', { class: 'gpp-settings-section-title', text: 'Tempo' }),
      el('div', { class: 'gpp-settings-section-body' }, [
        el('div', { class: 'gpp-field' }, [
          el('div', { class: 'gpp-control-row' }, [bpmInput, el('span', { class: 'gpp-unit', text: 'BPM' }), bpmSlider, bpmPct]),
          el('div', { class: 'gpp-control-row gpp-tempo-reset-row' }, [resetBpmBtn]),
        ]),
        el('label', { class: 'gpp-check', for: ids.metro }, [metroCheck, el('span', { text: 'Metronome' })]),
        el('label', { class: 'gpp-check', for: ids.countIn }, [
          countInCheck,
          el('span', { text: 'Count-in (4-beat lead-in metronome before play)' }),
        ]),
      ]),
    ]);

    const loopSection = el('details', { class: 'gpp-settings-section', open: true }, [
      el('summary', { class: 'gpp-settings-section-title', text: 'Loop' }),
      el('div', { class: 'gpp-settings-section-body' }, [
        el('label', { class: 'gpp-check', for: ids.loop }, [loopToggle, el('span', { text: 'Enable loop' })]),
        el('div', { class: 'gpp-control-row' }, [
          el('span', { class: 'gpp-unit', text: 'Bars' }), loopStartSel,
          el('span', { class: 'gpp-unit', text: '–' }), loopEndSel,
        ]),
        el('div', { class: 'gpp-control-row' }, [
          el('span', { class: 'gpp-unit', text: 'Rest between loops' }), restInput,
          el('span', { class: 'gpp-unit', text: 'sec' }),
        ]),
        el('div', { class: 'gpp-control-row' }, [loopSelBtn, clearLoopBtn]),
      ]),
    ]);

    const scoreSection = el('details', { class: 'gpp-settings-section', open: true }, [
      el('summary', { class: 'gpp-settings-section-title', text: 'Score' }),
      el('div', { class: 'gpp-settings-section-body' }, [
        el('div', { class: 'gpp-field' }, [
          el('span', { class: 'gpp-control-label', text: 'Zoom' }),
          el('div', { class: 'gpp-control-row' }, [zoomInput, zoomPct]),
          zoomPresets,
        ]),
        el('label', { class: 'gpp-check', for: ids.autoFollow }, [
          autoFollowCheck, el('span', { text: 'Auto-follow playback' }),
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

    controlsBody.append(tempoSection, loopSection, scoreSection, pitchSection);

    metroCheck.addEventListener('change', () => {
      stateController.state.metronomeEnabled = !!metroCheck.checked;
      onChange?.({ metronome: true });
    });
    countInCheck.addEventListener('change', () => {
      stateController.state.countInEnabled = !!countInCheck.checked;
      onChange?.();
    });
    loopToggle.addEventListener('change', () => {
      stateController.state.loopEnabled = !!loopToggle.checked;
      onChange?.({ reload: true });
    });
    const onLoopMeasures = () => {
      stateController.setLoopMeasures(Number(loopStartSel.value) || 0, Number(loopEndSel.value) || 0);
      stateController.state.loopEnabled = true;
      loopToggle.checked = true;
      onChange?.({ reload: true });
    };
    loopStartSel.addEventListener('change', onLoopMeasures);
    loopEndSel.addEventListener('change', onLoopMeasures);
    restInput.addEventListener('change', () => {
      stateController.state.loopRestSec = Math.max(0, Math.min(30, Number(restInput.value) || 0));
      restInput.value = String(stateController.state.loopRestSec);
      onChange?.({ loopRest: true });
    });
    loopSelBtn.addEventListener('click', () => {
      stateController.state.loopSelectMode = !stateController.state.loopSelectMode;
      loopSelBtn.classList.toggle('is-on', stateController.state.loopSelectMode);
      onChange?.({ loopSelectMode: true });
    });
    clearLoopBtn.addEventListener('click', () => {
      stateController.clearLoop();
      onChange?.({ reload: true });
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
    bpmInput.addEventListener('change', () => {
      const st = stateController.state;
      st.bpmUserOverride = true;
      st.bpm = clampBpm(Number(bpmInput.value) || st.scoreBpm);
      syncBpmSliderFromBpm(bpmInput, bpmSlider, bpmPct);
      onChange?.({ reload: true });
    });
    bpmSlider.addEventListener('input', () => syncBpmFromSlider(bpmInput, bpmSlider, bpmPct));
    bpmSlider.addEventListener('change', () => {
      stateController.state.bpmUserOverride = true;
      syncBpmFromSlider(bpmInput, bpmSlider, bpmPct);
      onChange?.({ reload: true });
    });
    resetBpmBtn.addEventListener('click', () => {
      if (typeof stateController.resetBpm === 'function') stateController.resetBpm();
      syncBpmSliderFromBpm(bpmInput, bpmSlider, bpmPct);
      onChange?.({ reload: true });
    });

    return {
      bpmInput, bpmSlider, bpmPct, resetBpmBtn, metroCheck, countInCheck, loopToggle,
      loopStartSel, loopEndSel, restInput, loopSelBtn, transposeInput,
      tuningSelect, retuneFinger, retunePitch, zoomInput, zoomPct, autoFollowCheck,
      pitchSection,
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
    stateController.setParchmentZoom(pct / 100);
    onChange?.({ zoom: true });
    sync();
  }

  function syncBpmFromSlider(bpmInput, bpmSlider, bpmPct) {
    const st = stateController.state;
    const pct = clampTempoPct(Number(bpmSlider.value) || 100);
    st.bpmUserOverride = true;
    st.bpm = clampBpm(Math.round(st.scoreBpm * (pct / 100)));
    bpmInput.value = String(Math.round(st.bpm));
    bpmPct.textContent = `${pct}%`;
  }

  function syncBpmSliderFromBpm(bpmInput, bpmSlider, bpmPct) {
    const st = stateController.state;
    bpmInput.value = String(Math.round(st.bpm));
    const pct = st.scoreBpm ? Math.round((st.bpm / st.scoreBpm) * 100) : 100;
    bpmSlider.value = String(clampTempoPct(pct));
    bpmPct.textContent = `${bpmSlider.value}%`;
  }

  function syncResetBpmBtn(resetBpmBtn) {
    if (!resetBpmBtn) return;
    const st = stateController.state;
    const scoreRounded = Math.round(st.scoreBpm);
    const atScore = !st.bpmUserOverride && Math.round(st.bpm) === scoreRounded;
    resetBpmBtn.textContent = `Reset to ${scoreRounded} BPM`;
    resetBpmBtn.disabled = atScore;
    resetBpmBtn.title = atScore ? 'Already at score tempo' : `Restore score tempo (${scoreRounded} BPM)`;
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

  function rebuildLoopSelects(loopStartSel, loopEndSel) {
    const measures = stateController.state.viewModel?.measures || [];
    const last = Math.max(0, measures.length - 1);
    const st = stateController.state;
    st.loopStart = Math.max(0, Math.min(last, st.loopStart));
    st.loopEnd = Math.max(st.loopStart, Math.min(last, st.loopEnd));
    loopStartSel.innerHTML = '';
    loopEndSel.innerHTML = '';
    measures.forEach((m, i) => {
      const label = m.marker ? `${i + 1} · ${m.marker}` : String(i + 1);
      loopStartSel.appendChild(el('option', { value: String(i), text: label }));
      loopEndSel.appendChild(el('option', { value: String(i), text: label }));
    });
    loopStartSel.value = String(st.loopStart);
    loopEndSel.value = String(st.loopEnd);
  }

  function sync() {
    if (!controls) return;
    const st = stateController.state;
    syncBpmSliderFromBpm(controls.bpmInput, controls.bpmSlider, controls.bpmPct);
    syncResetBpmBtn(controls.resetBpmBtn);
    rebuildTuningSelect(controls.tuningSelect);
    rebuildLoopSelects(controls.loopStartSel, controls.loopEndSel);
    controls.metroCheck.checked = !!st.metronomeEnabled;
    controls.countInCheck.checked = !!st.countInEnabled;
    controls.loopToggle.checked = !!st.loopEnabled;
    controls.restInput.value = String(st.loopRestSec);
    controls.transposeInput.value = String(st.transpose);
    controls.retuneFinger.checked = st.retuneMode !== 'pitches';
    controls.retunePitch.checked = st.retuneMode === 'pitches';
    controls.zoomInput.value = String(Math.round(st.parchmentZoom * 100));
    controls.zoomPct.textContent = `${controls.zoomInput.value}%`;
    controls.autoFollowCheck.checked = !!st.autoFollow;
    controls.loopSelBtn.classList.toggle('is-on', !!st.loopSelectMode);
    if (controls.pitchSection) controls.pitchSection.hidden = st.viewKind !== 'guitar';
  }

  // Portrait phone sheet; landscape uses side drawer (must match gpplayer.css)
  const SHEET_MQ = '(max-width: 768px) and (min-height: 501px)';

  function detectSheetMode() {
    sheetMode = window.matchMedia(SHEET_MQ).matches;
  }

  const mq = window.matchMedia(SHEET_MQ);
  const onMq = () => { detectSheetMode(); if (openState) paintOpen(); };
  mq.addEventListener?.('change', onMq);

  function paintOpen() {
    detectSheetMode();
    placeBody();
    backdrop.classList.toggle('is-open', openState);
    drawer.classList.toggle('is-open', openState && !sheetMode);
    sheet.classList.toggle('is-open', openState && sheetMode);
    backdrop.setAttribute('aria-hidden', openState ? 'false' : 'true');
  }

  function open() { detectSheetMode(); openState = true; sync(); paintOpen(); }
  function close() { openState = false; paintOpen(); }
  function toggle() { if (openState) close(); else open(); }

  backdrop.addEventListener('click', () => close());
  function onKey(e) { if (e.key === 'Escape' && openState) close(); }
  document.addEventListener('keydown', onKey);

  function destroy() {
    mq.removeEventListener?.('change', onMq);
    document.removeEventListener('keydown', onKey);
    host.innerHTML = '';
  }

  placeBody();
  sync();

  return { open, close, toggle, sync, destroy, isOpen: () => openState };
}
