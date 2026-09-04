// Metronome + tempo-ramp overlay for the GP player.

import { el } from './dom.js';
import { icon } from './icons.js';
import {
  GPP_METRO_SUBDIVISIONS,
  GPP_RAMP_INTERVAL_MODES,
  deriveBeatsPerMeasure,
  normalizeMetronomeConfig,
  normalizeTempoRampConfig,
} from './metronomeState.js';
import { GPP_MIN_BPM, GPP_MAX_BPM, clampBpm } from './tempoRange.js';

/**
 * @param {HTMLElement} host
 */
export function mountMetronomePanel(host, {
  stateController,
  getMeasureIndex = () => 0,
  getRampStatus = () => ({}),
  onChange,
  uidPrefix = 'gpp-metro',
} = {}) {
  const noop = {
    open() {},
    close() {},
    toggle() {},
    sync() {},
    syncStatus() {},
    destroy() {},
    isOpen: () => false,
  };
  if (!host || !stateController) return noop;

  const prefix = uidPrefix || 'gpp-metro';
  let openState = false;
  let sheetMode = false;

  const backdrop = el('div', { class: 'gpp-drawer-backdrop', 'aria-hidden': 'true' });
  const drawer = el('div', {
    class: 'gpp-drawer gpp-metronome-drawer',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Metronome',
  });
  const sheet = el('div', {
    class: 'gpp-sheet gpp-metronome-sheet',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Metronome',
  });
  sheet.appendChild(el('div', { class: 'gpp-sheet-handle' }));

  const drawerBody = el('div', { class: 'gpp-drawer-body' });
  const sheetBody = el('div', { class: 'gpp-drawer-body' });

  drawer.append(
    el('div', { class: 'gpp-drawer-head' }, [
      el('span', { class: 'gpp-drawer-title', text: 'Metronome' }),
      el('button', {
        class: 'gpp-icon-btn gpp-drawer-close',
        type: 'button',
        html: icon('close'),
        'aria-label': 'Close metronome',
        title: 'Close',
        onClick: () => close(),
      }),
    ]),
    drawerBody,
  );
  sheet.append(
    el('div', { class: 'gpp-drawer-head' }, [
      el('span', { class: 'gpp-drawer-title', text: 'Metronome' }),
      el('button', {
        class: 'gpp-icon-btn gpp-drawer-close',
        type: 'button',
        html: icon('close'),
        'aria-label': 'Close metronome',
        title: 'Close',
        onClick: () => close(),
      }),
    ]),
    sheetBody,
  );
  host.append(backdrop, drawer, sheet);

  const controlsBody = el('div', { class: 'gpp-settings-body gpp-metronome-body' });
  let controls = null;

  function emit(patch) {
    onChange?.(patch);
  }

  function applyMetro(patch) {
    const st = stateController.state;
    st.metro = normalizeMetronomeConfig({ ...st.metro, ...patch });
    st.metronomeEnabled = !!st.metro.enabled;
    st.countInEnabled = !!st.metro.countInEnabled;
    stateController.persistMetroPrefs?.();
    emit({ metronome: true });
  }

  function applyRamp(patch) {
    const st = stateController.state;
    st.tempoRamp = normalizeTempoRampConfig({ ...st.tempoRamp, ...patch });
    stateController.persistMetroPrefs?.();
    emit({ ramp: true });
  }

  function rebuildAccentGrid(accentGrid, beats) {
    accentGrid.innerHTML = '';
    const st = stateController.state;
    const pattern = st.metro.accentPattern.slice(0, beats);
    while (pattern.length < beats) pattern.push(pattern.length === 0);
    for (let i = 0; i < beats; i++) {
      const btn = el('button', {
        class: `gpp-accent-btn${pattern[i] ? ' is-on' : ''}`,
        type: 'button',
        text: String(i + 1),
        'aria-label': `Beat ${i + 1} accent ${pattern[i] ? 'on' : 'off'}`,
        'aria-pressed': pattern[i] ? 'true' : 'false',
        onClick: () => {
          const next = [...st.metro.accentPattern];
          while (next.length < beats) next.push(false);
          next[i] = !next[i];
          applyMetro({ accentPattern: next });
          sync();
        },
      });
      accentGrid.appendChild(btn);
    }
  }

  function buildControls() {
    controlsBody.innerHTML = '';
    const st = stateController.state;

    const enableCheck = el('input', {
      type: 'checkbox',
      id: `${prefix}-enable`,
      'aria-label': 'Enable metronome click',
    });
    const volumeInput = el('input', {
      type: 'range',
      class: 'gpp-slider',
      id: `${prefix}-vol`,
      min: '0',
      max: '100',
      step: '1',
      'aria-label': 'Metronome volume',
    });
    const volumePct = el('span', { class: 'gpp-pct', text: '100%' });

    const subdivPicker = el('div', {
      class: 'gpp-metro-subdiv-picker',
      role: 'radiogroup',
      'aria-label': 'Subdivision',
    });
    const subdivBtns = {};
    GPP_METRO_SUBDIVISIONS.forEach((s) => {
      const btn = el('button', {
        class: 'gpp-metro-subdiv-btn',
        type: 'button',
        role: 'radio',
        text: s.label,
        'data-subdiv': s.id,
        'aria-label': `${s.label} subdivision`,
        onClick: () => {
          applyMetro({ subdiv: s.id });
          sync();
        },
      });
      subdivBtns[s.id] = btn;
      subdivPicker.appendChild(btn);
    });

    const beatsOverrideCheck = el('input', {
      type: 'checkbox',
      id: `${prefix}-beats-override`,
      'aria-label': 'Override beats per measure',
    });
    const beatsInput = el('input', {
      type: 'number',
      class: 'gpp-num',
      id: `${prefix}-beats`,
      min: '1',
      max: '12',
      step: '1',
      'aria-label': 'Beats per measure',
    });
    const accentGrid = el('div', { class: 'gpp-accent-grid', 'aria-label': 'Accent pattern' });

    const countInCheck = el('input', {
      type: 'checkbox',
      id: `${prefix}-countin`,
      'aria-label': 'Count-in before play',
    });
    const countInBeatsInput = el('input', {
      type: 'number',
      class: 'gpp-num',
      id: `${prefix}-countin-beats`,
      min: '1',
      max: '32',
      step: '1',
      'aria-label': 'Count-in beats or bars',
    });
    const countInBarsCheck = el('input', {
      type: 'checkbox',
      id: `${prefix}-countin-bars`,
      'aria-label': 'Count-in in bars instead of beats',
    });

    const clickSection = el('details', { class: 'gpp-settings-section', open: true }, [
      el('summary', { class: 'gpp-settings-section-title', text: 'Click' }),
      el('div', { class: 'gpp-settings-section-body' }, [
        el('label', { class: 'gpp-check', for: `${prefix}-enable` }, [
          enableCheck, el('span', { text: 'Enable click' }),
        ]),
        el('div', { class: 'gpp-field' }, [
          el('span', { class: 'gpp-control-label', text: 'Volume' }),
          el('div', { class: 'gpp-control-row' }, [volumeInput, volumePct]),
        ]),
        el('div', { class: 'gpp-field' }, [
          el('span', { class: 'gpp-control-label', text: 'Subdivision' }),
          subdivPicker,
        ]),
        el('div', { class: 'gpp-field' }, [
          el('span', { class: 'gpp-control-label', text: 'Time signature' }),
          el('div', { class: 'gpp-control-row' }, [
            el('span', { class: 'gpp-unit', text: 'Beats' }),
            beatsInput,
            el('label', { class: 'gpp-check', for: `${prefix}-beats-override` }, [
              beatsOverrideCheck, el('span', { text: 'Override score' }),
            ]),
          ]),
        ]),
        el('div', { class: 'gpp-field' }, [
          el('span', { class: 'gpp-control-label', text: 'Accents' }),
          accentGrid,
        ]),
      ]),
    ]);

    const countInSection = el('details', { class: 'gpp-settings-section', open: true }, [
      el('summary', { class: 'gpp-settings-section-title', text: 'Count-in' }),
      el('div', { class: 'gpp-settings-section-body' }, [
        el('label', { class: 'gpp-check', for: `${prefix}-countin` }, [
          countInCheck, el('span', { text: 'Count-in before play' }),
        ]),
        el('div', { class: 'gpp-control-row' }, [
          el('span', { class: 'gpp-unit', text: 'Length' }),
          countInBeatsInput,
          el('label', { class: 'gpp-check', for: `${prefix}-countin-bars` }, [
            countInBarsCheck, el('span', { text: 'Bars' }),
          ]),
        ]),
      ]),
    ]);

    const rampEnableCheck = el('input', {
      type: 'checkbox',
      id: `${prefix}-ramp-enable`,
      'aria-label': 'Enable tempo ramp',
    });
    const rampStartInput = el('input', {
      type: 'number',
      class: 'gpp-num',
      id: `${prefix}-ramp-start`,
      min: String(GPP_MIN_BPM),
      max: String(GPP_MAX_BPM),
      step: '1',
      'aria-label': 'Ramp start BPM',
      placeholder: 'Current',
    });
    const rampTargetInput = el('input', {
      type: 'number',
      class: 'gpp-num',
      id: `${prefix}-ramp-target`,
      min: String(GPP_MIN_BPM),
      max: String(GPP_MAX_BPM),
      step: '1',
      'aria-label': 'Ramp target BPM',
    });
    const rampStepInput = el('input', {
      type: 'number',
      class: 'gpp-num',
      id: `${prefix}-ramp-step`,
      min: '-40',
      max: '40',
      step: '1',
      'aria-label': 'Ramp BPM step',
    });
    const rampIntervalInput = el('input', {
      type: 'number',
      class: 'gpp-num',
      id: `${prefix}-ramp-interval`,
      min: '1',
      max: '600',
      step: '1',
      'aria-label': 'Ramp interval value',
    });
    const rampModeSelect = el('select', {
      class: 'gpp-select',
      id: `${prefix}-ramp-mode`,
      'aria-label': 'Ramp interval mode',
    });
    GPP_RAMP_INTERVAL_MODES.forEach((mode) => {
      const label = mode === 'seconds' ? 'Seconds' : mode === 'loops' ? 'Loop passes' : 'Measures';
      rampModeSelect.appendChild(el('option', { value: mode, text: label }));
    });
    const rampHoldCheck = el('input', {
      type: 'checkbox',
      id: `${prefix}-ramp-hold`,
      'aria-label': 'Hold at target tempo',
    });
    const rampStatusEl = el('div', { class: 'gpp-ramp-status', 'aria-live': 'polite' });

    const rampSection = el('details', { class: 'gpp-settings-section', open: true }, [
      el('summary', { class: 'gpp-settings-section-title', text: 'Tempo ramp' }),
      el('div', { class: 'gpp-settings-section-body' }, [
        el('label', { class: 'gpp-check', for: `${prefix}-ramp-enable` }, [
          rampEnableCheck, el('span', { text: 'Increase tempo while playing' }),
        ]),
        el('div', { class: 'gpp-control-row' }, [
          el('span', { class: 'gpp-unit', text: 'Start' }), rampStartInput,
          el('span', { class: 'gpp-unit', text: 'Target' }), rampTargetInput,
        ]),
        el('div', { class: 'gpp-control-row' }, [
          el('span', { class: 'gpp-unit', text: 'Step' }), rampStepInput,
          el('span', { class: 'gpp-unit', text: 'BPM' }),
        ]),
        el('div', { class: 'gpp-control-row' }, [
          el('span', { class: 'gpp-unit', text: 'Every' }), rampIntervalInput, rampModeSelect,
        ]),
        el('label', { class: 'gpp-check', for: `${prefix}-ramp-hold` }, [
          rampHoldCheck, el('span', { text: 'Hold at target (else stop when reached)' }),
        ]),
        rampStatusEl,
      ]),
    ]);

    controlsBody.append(clickSection, countInSection, rampSection);

    enableCheck.addEventListener('change', () => {
      applyMetro({ enabled: !!enableCheck.checked });
      sync();
    });
    volumeInput.addEventListener('input', () => {
      const pct = Number(volumeInput.value) || 0;
      volumePct.textContent = `${pct}%`;
      applyMetro({ volume: pct / 100 });
    });
    beatsOverrideCheck.addEventListener('change', () => {
      const model = stateController.state.viewModel;
      const derived = deriveBeatsPerMeasure(model, getMeasureIndex());
      applyMetro({
        beatsPerMeasureOverride: !!beatsOverrideCheck.checked,
        beatsPerMeasure: beatsOverrideCheck.checked
          ? stateController.state.metro.beatsPerMeasure
          : derived,
      });
      sync();
    });
    beatsInput.addEventListener('change', () => {
      const beats = Math.max(1, Math.min(12, Math.round(Number(beatsInput.value) || 4)));
      applyMetro({ beatsPerMeasure: beats, beatsPerMeasureOverride: true });
      sync();
    });
    countInCheck.addEventListener('change', () => {
      applyMetro({ countInEnabled: !!countInCheck.checked });
      sync();
    });
    countInBeatsInput.addEventListener('change', () => {
      applyMetro({ countInBeats: Math.max(1, Math.round(Number(countInBeatsInput.value) || 4)) });
      sync();
    });
    countInBarsCheck.addEventListener('change', () => {
      applyMetro({ countInUseBars: !!countInBarsCheck.checked });
      sync();
    });
    rampEnableCheck.addEventListener('change', () => {
      applyRamp({ enabled: !!rampEnableCheck.checked });
      sync();
    });
    rampStartInput.addEventListener('change', () => {
      const v = rampStartInput.value.trim();
      applyRamp({ startBpm: v ? clampBpm(Number(v)) : null });
      sync();
    });
    rampTargetInput.addEventListener('change', () => {
      applyRamp({ targetBpm: clampBpm(Number(rampTargetInput.value) || 140) });
      sync();
    });
    rampStepInput.addEventListener('change', () => {
      const step = Math.round(Number(rampStepInput.value) || 5);
      applyRamp({ stepBpm: step === 0 ? 5 : step });
      sync();
    });
    rampIntervalInput.addEventListener('change', () => {
      applyRamp({ intervalValue: Math.max(1, Math.round(Number(rampIntervalInput.value) || 4)) });
      sync();
    });
    rampModeSelect.addEventListener('change', () => {
      applyRamp({ intervalMode: rampModeSelect.value });
      sync();
    });
    rampHoldCheck.addEventListener('change', () => {
      applyRamp({ holdAtTarget: !!rampHoldCheck.checked });
      sync();
    });

    return {
      enableCheck,
      volumeInput,
      volumePct,
      subdivBtns,
      beatsOverrideCheck,
      beatsInput,
      accentGrid,
      countInCheck,
      countInBeatsInput,
      countInBarsCheck,
      rampEnableCheck,
      rampStartInput,
      rampTargetInput,
      rampStepInput,
      rampIntervalInput,
      rampModeSelect,
      rampHoldCheck,
      rampStatusEl,
    };
  }

  controls = buildControls();

  function placeBody() {
    const target = sheetMode ? sheetBody : drawerBody;
    if (controlsBody.parentElement !== target) target.appendChild(controlsBody);
  }

  function syncRampStatus() {
    if (!controls?.rampStatusEl) return;
    const status = getRampStatus() || {};
    if (!status.enabled) {
      controls.rampStatusEl.textContent = '';
      controls.rampStatusEl.hidden = true;
      return;
    }
    if (status.active) {
      controls.rampStatusEl.hidden = false;
      controls.rampStatusEl.textContent = `Ramp: ${Math.round(status.currentBpm)} → ${Math.round(status.targetBpm)} BPM · next in ${status.nextIn || '—'}`;
    } else if (status.finished) {
      controls.rampStatusEl.hidden = false;
      controls.rampStatusEl.textContent = `Ramp complete at ${Math.round(status.currentBpm || status.targetBpm)} BPM`;
    } else {
      controls.rampStatusEl.hidden = false;
      controls.rampStatusEl.textContent = `Ramp armed: ${Math.round(status.targetBpm)} BPM target`;
    }
  }

  function syncStatus() {
    if (!openState || !controls) return;
    syncRampStatus();
  }

  function sync() {
    if (!controls) return;
    const st = stateController.state;
    const metro = st.metro;
    st.metronomeEnabled = !!metro.enabled;
    st.countInEnabled = !!metro.countInEnabled;
    const ramp = st.tempoRamp;
    const model = st.viewModel;
    const derivedBeats = deriveBeatsPerMeasure(model, getMeasureIndex());

    if (!metro.beatsPerMeasureOverride) {
      metro.beatsPerMeasure = derivedBeats;
    }

    controls.enableCheck.checked = !!metro.enabled;
    controls.volumeInput.value = String(Math.round((metro.volume ?? 1) * 100));
    controls.volumePct.textContent = `${controls.volumeInput.value}%`;
    GPP_METRO_SUBDIVISIONS.forEach((s) => {
      const btn = controls.subdivBtns[s.id];
      if (!btn) return;
      const on = metro.subdiv === s.id;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    controls.beatsOverrideCheck.checked = !!metro.beatsPerMeasureOverride;
    controls.beatsInput.value = String(metro.beatsPerMeasure);
    controls.beatsInput.disabled = !metro.beatsPerMeasureOverride;
    rebuildAccentGrid(controls.accentGrid, metro.beatsPerMeasure);
    controls.countInCheck.checked = !!metro.countInEnabled;
    controls.countInBeatsInput.value = String(metro.countInBeats);
    controls.countInBarsCheck.checked = !!metro.countInUseBars;

    controls.rampEnableCheck.checked = !!ramp.enabled;
    controls.rampStartInput.value = ramp.startBpm != null ? String(Math.round(ramp.startBpm)) : '';
    controls.rampTargetInput.value = String(Math.round(ramp.targetBpm));
    controls.rampStepInput.value = String(ramp.stepBpm);
    controls.rampIntervalInput.value = String(ramp.intervalValue);
    controls.rampModeSelect.value = ramp.intervalMode;
    controls.rampHoldCheck.checked = !!ramp.holdAtTarget;
    syncRampStatus();
  }

  const SHEET_MQ = '(max-width: 599px)';

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

  return { open, close, toggle, sync, syncStatus, destroy, isOpen: () => openState };
}
