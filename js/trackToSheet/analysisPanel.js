// Shared analysis-settings panel for recorder riff tab + Track → Sheet.
// Renders controls from ANALYSIS_OPTION_META so new knobs appear automatically.

import { getSetting, saveSetting } from '../persistence.js';
import {
  ANALYSIS_OPTION_META,
  ANALYSIS_PRESETS,
  DEFAULT_ANALYSIS_OPTIONS,
  applyPreset,
  normalizeAnalysisOptions,
  serializeAnalysisOptions,
  deserializeAnalysisOptions,
  describeAnalysisOptions,
} from './analysisOptions.js';

const PRESET_CHOICES = ANALYSIS_PRESETS.filter((p) => p !== 'custom');

const GROUPS = [
  {
    id: 'pitch',
    label: 'Pitch',
    keys: ['sensitivity', 'range'],
    advancedKeys: ['minFreq', 'maxFreq'],
  },
  {
    id: 'notes',
    label: 'Notes',
    keys: ['minNoteMs', 'vibratoCents', 'onsetSensitivity', 'splitRepeats'],
  },
  {
    id: 'rhythm',
    label: 'Rhythm',
    keys: ['tempoMode', 'bpm', 'beatsPerBar', 'quantizeGrid', 'quantizeStrength', 'timeResolution'],
  },
];

const VISIBLE_HINT_KEYS = new Set(['sensitivity', 'onsetSensitivity', 'tempoMode', 'quantizeGrid']);

function isDependencyMet(dependsOn, options) {
  if (!dependsOn) return true;
  for (const [key, expected] of Object.entries(dependsOn)) {
    const val = options[key];
    if (typeof expected === 'function') {
      if (!expected(val)) return false;
    } else if (val !== expected) {
      return false;
    }
  }
  return true;
}

function formatControlValue(key, value, meta) {
  if (value === null || value === undefined) return '';
  if (meta.kind === 'range') {
    const unit = meta.unit ? ` ${meta.unit}` : '';
    return `${value}${unit}`;
  }
  if (meta.kind === 'number' && meta.unit) return `${value} ${meta.unit}`;
  return String(value);
}

function displayValueForMeta(meta, value) {
  if (meta.kind === 'select' && meta.choices) {
    const match = meta.choices.find((c) => c.value === value);
    return match ? match.label : String(value);
  }
  return formatControlValue(meta.key, value, meta);
}

/**
 * @param {object} params
 * @param {HTMLElement|null} params.mount
 * @param {string} params.storageKey
 * @param {(options: object) => void|Promise<void>} params.onReanalyze
 * @param {string} params.idPrefix
 * @param {(options: object) => void} [params.onChange]
 */
export function createAnalysisPanel({
  mount,
  storageKey,
  onReanalyze,
  idPrefix,
  onChange,
}) {
  if (!mount) {
    return {
      getOptions: () => normalizeAnalysisOptions({}),
      setOptions: () => {},
      setBusy: () => {},
      setSummary: () => {},
      destroy: () => {},
    };
  }

  let options = deserializeAnalysisOptions(getSetting(storageKey, null));
  let busy = false;
  let syncing = false;

  const controls = new Map();
  let presetSelect = null;
  let reanalyzeBtn = null;
  let summaryTextEl = null;

  const details = document.createElement('details');
  details.className = 'analysis-panel';

  const summary = document.createElement('summary');
  summary.className = 'analysis-panel-summary';
  summaryTextEl = document.createElement('span');
  summaryTextEl.className = 'analysis-panel-summary-text';
  summary.appendChild(document.createTextNode('Analysis settings'));
  summary.appendChild(summaryTextEl);
  details.appendChild(summary);

  const body = document.createElement('div');
  body.className = 'analysis-panel-body';

  // Preset selector (derived meta, rendered separately at top).
  const presetRow = document.createElement('div');
  presetRow.className = 'analysis-panel-row analysis-panel-preset-row';
  const presetMeta = ANALYSIS_OPTION_META.preset;
  const presetId = `${idPrefix}-preset`;
  const presetLabel = document.createElement('label');
  presetLabel.className = 'analysis-panel-label';
  presetLabel.setAttribute('for', presetId);
  presetLabel.textContent = presetMeta.label;
  presetSelect = document.createElement('select');
  presetSelect.id = presetId;
  presetSelect.className = 'analysis-panel-select';
  presetSelect.title = presetMeta.hint || '';
  PRESET_CHOICES.forEach((name) => {
    const choice = presetMeta.choices.find((c) => c.value === name);
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = choice ? choice.label : name;
    presetSelect.appendChild(opt);
  });
  const customOpt = document.createElement('option');
  customOpt.value = 'custom';
  customOpt.textContent = 'Custom';
  presetSelect.appendChild(customOpt);
  presetRow.appendChild(presetLabel);
  presetRow.appendChild(presetSelect);
  body.appendChild(presetRow);

  presetSelect.addEventListener('change', () => {
    if (syncing) return;
    const name = presetSelect.value;
    if (name === 'custom') {
      options = normalizeAnalysisOptions({ ...options, preset: 'custom' });
    } else {
      options = applyPreset(name, options);
    }
    syncControlsFromOptions();
    persist(false);
  });

  function makeRow(key, meta) {
    if (meta.derived) return null;

    const row = document.createElement('div');
    row.className = 'analysis-panel-row';
    row.dataset.optionKey = key;

    const labelWrap = document.createElement('div');
    labelWrap.className = 'analysis-panel-label-wrap';

    const label = document.createElement('label');
    label.className = 'analysis-panel-label';
    const controlId = `${idPrefix}-${key}`;
    label.setAttribute('for', controlId);

    const labelText = document.createElement('span');
    labelText.className = 'analysis-panel-label-text';
    labelText.textContent = meta.label;
    label.appendChild(labelText);

    let valueEl = null;
    if (meta.kind === 'range') {
      valueEl = document.createElement('span');
      valueEl.className = 'analysis-panel-value';
      valueEl.setAttribute('aria-live', 'polite');
      label.appendChild(valueEl);
    } else if (meta.kind === 'number' && meta.unit) {
      valueEl = document.createElement('span');
      valueEl.className = 'analysis-panel-value';
      valueEl.setAttribute('aria-live', 'polite');
      label.appendChild(valueEl);
    }

    labelWrap.appendChild(label);

    if (VISIBLE_HINT_KEYS.has(key) && meta.hint) {
      const hint = document.createElement('p');
      hint.className = 'analysis-panel-hint';
      hint.textContent = meta.hint;
      labelWrap.appendChild(hint);
    }

    row.appendChild(labelWrap);

    let input = null;
    switch (meta.kind) {
      case 'range': {
        input = document.createElement('input');
        input.type = 'range';
        input.id = controlId;
        input.className = 'analysis-panel-range';
        input.min = String(meta.min);
        input.max = String(meta.max);
        input.step = String(meta.step ?? 0.01);
        input.title = meta.hint || '';
        break;
      }
      case 'number': {
        input = document.createElement('input');
        input.type = 'number';
        input.id = controlId;
        input.className = 'analysis-panel-number';
        if (meta.min != null) input.min = String(meta.min);
        if (meta.max != null) input.max = String(meta.max);
        if (meta.step != null) input.step = String(meta.step);
        input.title = meta.hint || '';
        input.placeholder = key === 'beatsPerBar' ? 'Auto' : '';
        break;
      }
      case 'select': {
        input = document.createElement('select');
        input.id = controlId;
        input.className = 'analysis-panel-select';
        input.title = meta.hint || '';
        (meta.choices || []).forEach((c) => {
          const opt = document.createElement('option');
          opt.value = c.value;
          opt.textContent = c.label;
          input.appendChild(opt);
        });
        break;
      }
      case 'toggle': {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.id = controlId;
        input.className = 'analysis-panel-toggle';
        input.title = meta.hint || '';
        break;
      }
      default:
        return null;
    }

    row.appendChild(input);

    const onUserInput = () => {
      if (syncing) return;
      let raw;
      if (meta.kind === 'toggle') raw = input.checked;
      else if (meta.kind === 'number') {
        const s = input.value.trim();
        if (s === '' && (key === 'bpm' || key === 'beatsPerBar' || key === 'minFreq' || key === 'maxFreq')) {
          raw = null;
        } else {
          raw = Number(s);
        }
      } else if (meta.kind === 'range') raw = Number(input.value);
      else raw = input.value;

      options = normalizeAnalysisOptions({ ...options, [key]: raw, preset: 'custom' });
      syncControlsFromOptions();
      persist(false);
    };

    input.addEventListener('input', onUserInput);
    if (meta.kind !== 'range') input.addEventListener('change', onUserInput);

    controls.set(key, { row, input, valueEl, meta });
    return row;
  }

  GROUPS.forEach((group) => {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'analysis-panel-group';
    const legend = document.createElement('legend');
    legend.className = 'analysis-panel-group-title';
    legend.textContent = group.label;
    fieldset.appendChild(legend);

    group.keys.forEach((key) => {
      const meta = ANALYSIS_OPTION_META[key];
      if (!meta) return;
      const row = makeRow(key, meta);
      if (row) fieldset.appendChild(row);
    });

    if (group.advancedKeys?.length) {
      const adv = document.createElement('details');
      adv.className = 'analysis-panel-advanced';
      const advSummary = document.createElement('summary');
      advSummary.textContent = 'Advanced';
      adv.appendChild(advSummary);
      group.advancedKeys.forEach((key) => {
        const meta = ANALYSIS_OPTION_META[key];
        if (!meta) return;
        const row = makeRow(key, meta);
        if (row) adv.appendChild(row);
      });
      fieldset.appendChild(adv);
    }

    body.appendChild(fieldset);
  });

  const actions = document.createElement('div');
  actions.className = 'analysis-panel-actions';

  reanalyzeBtn = document.createElement('button');
  reanalyzeBtn.type = 'button';
  reanalyzeBtn.className = 'btn primary analysis-panel-reanalyze';
  reanalyzeBtn.textContent = 'Re-analyze';
  reanalyzeBtn.addEventListener('click', () => {
    if (busy) return;
    const opts = normalizeAnalysisOptions({ ...options });
    onReanalyze?.(opts);
  });

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'btn analysis-panel-reset';
  resetBtn.textContent = 'Reset';
  resetBtn.addEventListener('click', () => {
    if (syncing) return;
    options = normalizeAnalysisOptions({});
    syncControlsFromOptions();
    persist(false);
  });

  actions.appendChild(reanalyzeBtn);
  actions.appendChild(resetBtn);
  body.appendChild(actions);

  details.appendChild(body);
  mount.appendChild(details);

  function updateSummary() {
    if (summaryTextEl) {
      summaryTextEl.textContent = ` — ${describeAnalysisOptions(options)}`;
    }
  }

  function persist(notify = true) {
    saveSetting(storageKey, serializeAnalysisOptions(options));
    updateSummary();
    if (notify) onChange?.(normalizeAnalysisOptions({ ...options }));
  }

  function syncControlsFromOptions() {
    syncing = true;
    const normalized = normalizeAnalysisOptions({ ...options });
    options = normalized;

    if (presetSelect) presetSelect.value = normalized.preset;

    for (const [key, ctrl] of controls) {
      const { row, input, valueEl, meta } = ctrl;
      const val = normalized[key];
      const enabled = isDependencyMet(meta.dependsOn, normalized);

      row.classList.toggle('is-disabled', !enabled);
      input.disabled = !enabled || busy;
      if (meta.kind === 'toggle') input.checked = !!val;
      else if (meta.kind === 'number') {
        input.value = val === null || val === undefined ? '' : String(val);
      }       else if (meta.kind === 'range') {
        input.value = String(val);
        const min = Number(meta.min ?? 0);
        const max = Number(meta.max ?? 1);
        const pct = max > min ? ((Number(val) - min) / (max - min)) * 100 : 0;
        input.style.setProperty('--range-pct', `${pct}%`);
      } else if (meta.kind === 'select') input.value = String(val);

      if (valueEl) {
        valueEl.textContent = enabled ? displayValueForMeta(meta, val) : '—';
      }
    }

    if (reanalyzeBtn) reanalyzeBtn.disabled = busy;
    syncing = false;
    updateSummary();
  }

  syncControlsFromOptions();

  return {
    getOptions() {
      return normalizeAnalysisOptions({ ...options });
    },
    setOptions(partial = {}) {
      options = normalizeAnalysisOptions({ ...options, ...partial });
      syncControlsFromOptions();
      updateSummary();
    },
    setBusy(isBusy) {
      busy = !!isBusy;
      syncControlsFromOptions();
    },
    setSummary(text) {
      if (summaryTextEl && text) summaryTextEl.textContent = ` — ${text}`;
    },
    destroy() {
      mount.innerHTML = '';
      controls.clear();
    },
  };
}
