// Quick musical context control for the app shell.
//
// The button sits next to the settings gear, at the top right of the content
// column. It shows the shared key, scale, and tempo of the tool on screen. A
// click opens a small panel. The panel writes the global musical context, so
// every compatible tool gets the new value.

import {
  getContext,
  setContext,
  subscribeContext,
  TEMPO_MIN,
  TEMPO_MAX,
} from '../musicalContext.js';
import { shortScaleName } from '../scales.js';
import { openRootPicker, openScalePicker, openTuningPicker, getQuickScales } from '../pickers.js';
import { toolContextFields } from '../tools.js';

const CONTEXT_SOURCE = 'context-quick';
const NOTE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';

let buttonEl = null;
let panelEl = null;
let activeFields = [];
let contextUnsub = null;
let dismissBound = false;
let openSectionFn = null;
let activeSectionId = null;

/**
 * Text for the quick context button.
 * @param {object} ctx a musical context snapshot
 * @param {string[]} fields the fields the tool reads
 * @returns {{key: string, tempo: string, tuning: string, label: string}}
 */
export function contextButtonText(ctx = {}, fields = []) {
  const list = Array.isArray(fields) ? fields : [];
  const hasRoot = list.includes('root');
  const hasScale = list.includes('scale');
  const hasTempo = list.includes('tempo');
  const hasTuning = list.includes('tuning');

  let key = '';
  if (hasRoot && hasScale) key = `${ctx.root} ${shortScaleName(ctx.scale)}`;
  else if (hasRoot) key = String(ctx.root || '');
  else if (hasScale) key = shortScaleName(ctx.scale);

  const tempo = hasTempo && ctx.tempo != null ? `${ctx.tempo}` : '';
  const tuning = hasTuning && ctx.tuning ? String(ctx.tuning) : '';

  const parts = [];
  if (hasRoot && hasScale) parts.push(`${ctx.root} ${ctx.scale}`);
  else if (hasRoot) parts.push(`Key ${ctx.root}`);
  else if (hasScale) parts.push(String(ctx.scale || ''));
  if (tempo) parts.push(`${tempo} BPM`);
  if (tuning) parts.push(tuning);

  return {
    key,
    tempo,
    tuning,
    label: `Musical context: ${parts.join(', ')}`,
  };
}

function clampTempo(value) {
  const num = Math.round(Number(value));
  if (!Number.isFinite(num)) return TEMPO_MIN;
  return Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, num));
}

function isOpen() {
  return !!panelEl && panelEl.classList.contains('open');
}

function paintButton() {
  if (!buttonEl) return;
  const text = contextButtonText(getContext(), activeFields);
  const keyEl = buttonEl.querySelector('.shell-context-key');
  const tempoEl = buttonEl.querySelector('.shell-context-tempo');
  const tuningEl = buttonEl.querySelector('.shell-context-tuning');
  if (keyEl) {
    keyEl.textContent = text.key;
    keyEl.hidden = !text.key;
  }
  if (tempoEl) {
    tempoEl.textContent = text.tempo;
    tempoEl.hidden = !text.tempo;
  }
  if (tuningEl) {
    tuningEl.textContent = text.tuning;
    tuningEl.hidden = !text.tuning;
  }
  buttonEl.setAttribute('aria-label', text.label);
  buttonEl.title = text.label;
}

function buildRootField() {
  const field = document.createElement('div');
  field.className = 'context-field';
  field.innerHTML = `
    <div class="context-field-label">Key</div>
    <button type="button" class="setup-chip context-pick-btn" data-ctx-role="root">
      <span class="setup-chip-value" data-ctx-value="root"></span>
      <span class="setup-chip-hint">Change</span>
    </button>
  `;
  field.querySelector('[data-ctx-role="root"]').onclick = async () => {
    await openRootPicker({ value: getContext().root, source: CONTEXT_SOURCE });
  };
  return field;
}

function buildScaleField() {
  const field = document.createElement('div');
  field.className = 'context-field';
  field.innerHTML = `
    <div class="context-field-label">Mode / Scale</div>
    <button type="button" class="setup-chip context-pick-btn" data-ctx-role="scale">
      <span class="setup-chip-value" data-ctx-value="scale"></span>
      <span class="setup-chip-hint">Change</span>
    </button>
    <div class="quick-scale-row" data-ctx-role="quick-scales" aria-label="Quick scales"></div>
  `;
  field.querySelector('[data-ctx-role="scale"]').onclick = async () => {
    await openScalePicker({ value: getContext().scale, source: CONTEXT_SOURCE });
  };
  return field;
}

function buildTempoField() {
  const field = document.createElement('div');
  field.className = 'context-field';
  field.innerHTML = `
    <div class="context-field-label">Tempo</div>
    <div class="context-tempo-row">
      <button type="button" class="context-step" data-ctx-role="tempo-down" aria-label="Slower">-</button>
      <input type="number" class="context-tempo-input" data-ctx-value="tempo"
        min="${TEMPO_MIN}" max="${TEMPO_MAX}" inputmode="numeric" aria-label="Tempo">
      <span class="context-tempo-unit">BPM</span>
      <button type="button" class="context-step" data-ctx-role="tempo-up" aria-label="Faster">+</button>
    </div>
  `;
  const input = field.querySelector('[data-ctx-value="tempo"]');
  input.onchange = () => setContext({ tempo: clampTempo(input.value) }, CONTEXT_SOURCE);
  field.querySelector('[data-ctx-role="tempo-down"]').onclick = () => {
    setContext({ tempo: clampTempo(getContext().tempo - 1) }, CONTEXT_SOURCE);
  };
  field.querySelector('[data-ctx-role="tempo-up"]').onclick = () => {
    setContext({ tempo: clampTempo(getContext().tempo + 1) }, CONTEXT_SOURCE);
  };
  return field;
}

function buildTuningField() {
  const field = document.createElement('div');
  field.className = 'context-field';
  field.innerHTML = `
    <div class="context-field-label">Tuning</div>
    <button type="button" class="setup-chip context-pick-btn" data-ctx-role="tuning">
      <span class="setup-chip-value" data-ctx-value="tuning"></span>
      <span class="setup-chip-hint">Change</span>
    </button>
  `;
  field.querySelector('[data-ctx-role="tuning"]').onclick = async () => {
    await openTuningPicker({ value: getContext().tuning, source: CONTEXT_SOURCE });
  };
  return field;
}

function paintQuickScales() {
  const row = panelEl?.querySelector('[data-ctx-role="quick-scales"]');
  if (!row) return;
  const current = getContext().scale;
  row.innerHTML = '';
  getQuickScales(5).forEach((name) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'quick-scale-chip' + (name === current ? ' active' : '');
    btn.textContent = shortScaleName(name);
    btn.onclick = () => setContext({ scale: name }, CONTEXT_SOURCE);
    row.appendChild(btn);
  });
}

function paintPanel() {
  if (!panelEl) return;
  const ctx = getContext();
  const rootVal = panelEl.querySelector('[data-ctx-value="root"]');
  const scaleVal = panelEl.querySelector('[data-ctx-value="scale"]');
  const tempoVal = panelEl.querySelector('[data-ctx-value="tempo"]');
  const tuningVal = panelEl.querySelector('[data-ctx-value="tuning"]');
  if (rootVal) rootVal.textContent = ctx.root;
  if (scaleVal) scaleVal.textContent = shortScaleName(ctx.scale);
  if (tempoVal && Number(tempoVal.value) !== ctx.tempo) tempoVal.value = ctx.tempo;
  if (tuningVal) tuningVal.textContent = ctx.tuning;
  paintQuickScales();
}

function buildPanel(fields) {
  const panel = document.createElement('div');
  panel.className = 'shell-context-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Musical context');

  const head = document.createElement('div');
  head.className = 'shell-context-panel-head';
  head.innerHTML = '<span class="shell-context-panel-title">Musical context</span>';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'shell-context-panel-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '✕';
  closeBtn.onclick = () => closeContextPanel();
  head.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'shell-context-panel-body';
  if (fields.includes('root')) body.appendChild(buildRootField());
  if (fields.includes('scale')) body.appendChild(buildScaleField());
  if (fields.includes('tempo')) body.appendChild(buildTempoField());
  if (fields.includes('tuning')) body.appendChild(buildTuningField());

  const help = document.createElement('p');
  help.className = 'shell-context-panel-help';
  help.textContent = 'This is the shared context. Every compatible tool uses it.';

  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'btn sm shell-context-panel-more';
  more.textContent = 'All settings';
  more.onclick = () => {
    closeContextPanel();
    if (openSectionFn) openSectionFn('musicprefs');
  };

  panel.append(head, body, help, more);
  return panel;
}

// A picker opens above the panel. A tap in that sheet must not close the
// panel, or the panel disappears each time the player picks a value.
const OVERLAY_SELECTOR = '.sel-sheet, .sel-sheet-overlay, .modal-overlay';

function onDocumentPointerDown(event) {
  if (!isOpen()) return;
  const target = event.target;
  if (panelEl?.contains(target)) return;
  if (buttonEl?.contains(target)) return;
  if (target?.closest?.(OVERLAY_SELECTOR)) return;
  closeContextPanel();
}

function onDocumentKeyDown(event) {
  if (!isOpen()) return;
  if (event.key === 'Escape') {
    event.stopPropagation();
    closeContextPanel();
    buttonEl?.focus?.();
  }
}

function bindDismiss() {
  if (dismissBound) return;
  dismissBound = true;
  document.addEventListener('pointerdown', onDocumentPointerDown, true);
  document.addEventListener('keydown', onDocumentKeyDown, true);
}

function positionPanel() {
  if (!panelEl || !buttonEl?.getBoundingClientRect) return;
  const rect = buttonEl.getBoundingClientRect();
  const width = panelEl.offsetWidth || 280;
  const viewportW = window.innerWidth || width;
  let left = rect.right - width;
  left = Math.max(8, Math.min(left, viewportW - width - 8));
  panelEl.style.left = `${Math.round(left)}px`;
  panelEl.style.top = `${Math.round(rect.bottom + 8)}px`;
}

export function closeContextPanel() {
  if (!panelEl) return;
  panelEl.classList.remove('open');
  panelEl.remove();
  panelEl = null;
  if (contextUnsub) {
    contextUnsub();
    contextUnsub = null;
  }
  buttonEl?.setAttribute('aria-expanded', 'false');
}

function openContextPanel() {
  if (isOpen()) {
    closeContextPanel();
    return;
  }
  if (!activeFields.length) return;
  panelEl = buildPanel(activeFields);
  document.body.appendChild(panelEl);
  panelEl.classList.add('open');
  buttonEl?.setAttribute('aria-expanded', 'true');
  paintPanel();
  positionPanel();
  bindDismiss();
  contextUnsub = subscribeContext(() => {
    paintPanel();
    paintButton();
  });
}

function buildButton() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'context-quick-trigger';
  btn.className = 'shell-context-btn';
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = `
    <span class="shell-context-icon" aria-hidden="true">${NOTE_ICON}</span>
    <span class="shell-context-key"></span>
    <span class="shell-context-tempo"></span>
    <span class="shell-context-tuning"></span>
  `;
  btn.onclick = () => openContextPanel();
  return btn;
}

/**
 * Build the quick context button once.
 * @param {{showSection?: Function}} options
 */
export function initContextQuick({ showSection } = {}) {
  if (typeof showSection === 'function') openSectionFn = showSection;
  if (!buttonEl) {
    buttonEl = buildButton();
    buttonEl.hidden = true;
    subscribeContext(() => paintButton());
  }
  return buttonEl;
}

/**
 * Show the button on a tool that reads the shared context, and hide it
 * everywhere else.
 * @param {string} sectionId the section on screen
 * @returns {boolean} true when the button is visible
 */
export function syncContextQuick(sectionId) {
  const id = sectionId || null;
  // The panel shows the fields of one tool. A move to another tool closes it.
  if (id !== activeSectionId && isOpen()) closeContextPanel();
  activeSectionId = id;

  activeFields = toolContextFields(id);
  const show = activeFields.length > 0;
  if (!buttonEl) return show;
  if (!show && isOpen()) closeContextPanel();
  buttonEl.hidden = !show;
  if (show) paintButton();
  return show;
}
