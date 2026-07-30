import { getContext, setContext, subscribeContext, TEMPO_MIN, TEMPO_MAX, ITERATION_MODES, getIterationModeLabel } from './musicalContext.js';
import { shortScaleName } from './scales.js';
import { openRootPicker, openScalePicker } from './pickers.js';

const SOURCE = 'context-bar';
const MODE_ITEMS = ITERATION_MODES.map(m => ({ val: m, label: getIterationModeLabel(m) }));

export { shortScaleName };

let pillText = null;
let sheet = null;
let editorBuilt = false;

function renderPill() {
  if (!pillText) return;
  const c = getContext();
  pillText.innerHTML =
    `<span class="cp-root">${c.root}</span>` +
    `<span class="cp-dot">&bull;</span>` +
    `<span class="cp-scale">${shortScaleName(c.scale)}</span>` +
    `<span class="cp-dot">&bull;</span>` +
    `<span class="cp-tempo">${c.tempo} BPM</span>`;
}

function buildSegmented(container, items, activeVal, onPick) {
  container.innerHTML = '';
  items.forEach(({ val, label }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'seg-btn' + (val === activeVal ? ' active' : '');
    btn.dataset.val = val;
    btn.textContent = label;
    btn.onclick = () => onPick(val);
    container.appendChild(btn);
  });
}

function markActive(container, val) {
  container.querySelectorAll('.seg-btn').forEach(el => {
    el.classList.toggle('active', el.dataset.val === val);
  });
}

function buildEditor() {
  if (editorBuilt) return;
  editorBuilt = true;

  const overlay = document.createElement('div');
  overlay.className = 'context-sheet-overlay';
  overlay.id = 'context-sheet-overlay';

  sheet = document.createElement('div');
  sheet.className = 'context-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Musical context');

  sheet.innerHTML = `
    <div class="context-sheet-handle"></div>
    <div class="context-sheet-title">Musical Context</div>
    <div class="context-field">
      <div class="context-field-label">Key</div>
      <button type="button" class="setup-chip context-pick-btn" id="ctx-root-btn" aria-label="Change root">
        <span class="setup-chip-value" id="ctx-root-val">C</span>
        <span class="setup-chip-hint">Change</span>
      </button>
      <div class="context-mode-row">
        <div class="context-field-label context-mode-label">Key progression</div>
        <div class="seg-row compact" id="ctx-root-mode"></div>
      </div>
    </div>
    <div class="context-field">
      <div class="context-field-label">Mode / Scale</div>
      <button type="button" class="setup-chip context-pick-btn" id="ctx-scale-btn" aria-label="Change scale">
        <span class="setup-chip-value" id="ctx-scale-val">Major</span>
        <span class="setup-chip-hint">Change</span>
      </button>
      <div class="quick-scale-row" id="ctx-quick-scales" aria-label="Quick scales"></div>
      <div class="context-mode-row">
        <div class="context-field-label context-mode-label">Scale progression</div>
        <div class="seg-row compact" id="ctx-scale-mode"></div>
      </div>
    </div>
    <div class="context-field">
      <div class="context-field-label">Tempo</div>
      <div class="context-tempo-row">
        <button type="button" class="context-step" id="ctx-tempo-down" aria-label="Slower">-</button>
        <input type="number" id="ctx-tempo" class="context-tempo-input" min="${TEMPO_MIN}" max="${TEMPO_MAX}" inputmode="numeric">
        <span class="context-tempo-unit">BPM</span>
        <button type="button" class="context-step" id="ctx-tempo-up" aria-label="Faster">+</button>
      </div>
    </div>
    <button type="button" class="btn primary context-done" id="ctx-done">Done</button>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(sheet);

  overlay.onclick = closeEditor;
  sheet.querySelector('#ctx-done').onclick = closeEditor;

  const rootModeRow = sheet.querySelector('#ctx-root-mode');
  const scaleModeRow = sheet.querySelector('#ctx-scale-mode');
  const tempoInput = sheet.querySelector('#ctx-tempo');

  buildSegmented(rootModeRow, MODE_ITEMS, getContext().rootMode, val => {
    setContext({ rootMode: val }, SOURCE);
  });
  buildSegmented(scaleModeRow, MODE_ITEMS, getContext().scaleMode, val => {
    setContext({ scaleMode: val }, SOURCE);
  });

  sheet.querySelector('#ctx-root-btn').onclick = async () => {
    await openRootPicker({ value: getContext().root, source: SOURCE });
  };
  sheet.querySelector('#ctx-scale-btn').onclick = async () => {
    await openScalePicker({ value: getContext().scale, source: SOURCE });
  };

  tempoInput.value = getContext().tempo;
  tempoInput.onchange = () => setContext({ tempo: Number(tempoInput.value) }, SOURCE);
  sheet.querySelector('#ctx-tempo-down').onclick = () => setContext({ tempo: getContext().tempo - 1 }, SOURCE);
  sheet.querySelector('#ctx-tempo-up').onclick = () => setContext({ tempo: getContext().tempo + 1 }, SOURCE);

  syncEditor(getContext());
  renderQuickScales();

  subscribeContext(c => {
    syncEditor(c);
    markActive(rootModeRow, c.rootMode);
    markActive(scaleModeRow, c.scaleMode);
    renderQuickScales();
  });
}

function syncEditor(c) {
  if (!sheet) return;
  const rootVal = sheet.querySelector('#ctx-root-val');
  const scaleVal = sheet.querySelector('#ctx-scale-val');
  const tempoInput = sheet.querySelector('#ctx-tempo');
  if (rootVal) rootVal.textContent = c.root;
  if (scaleVal) scaleVal.textContent = shortScaleName(c.scale);
  if (tempoInput && Number(tempoInput.value) !== c.tempo) tempoInput.value = c.tempo;
}

function renderQuickScales() {
  const row = sheet?.querySelector('#ctx-quick-scales');
  if (!row) return;
  import('./pickers.js').then(({ getQuickScales }) => {
    const c = getContext();
    const scales = getQuickScales(5);
    row.innerHTML = '';
    scales.forEach(name => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quick-scale-chip' + (name === c.scale ? ' active' : '');
      btn.textContent = shortScaleName(name);
      btn.onclick = () => setContext({ scale: name }, SOURCE);
      row.appendChild(btn);
    });
  });
}

function openEditor() {
  buildEditor();
  document.getElementById('context-sheet-overlay').classList.add('visible');
  sheet.classList.add('open');
}

function closeEditor() {
  const overlay = document.getElementById('context-sheet-overlay');
  if (overlay) overlay.classList.remove('visible');
  if (sheet) sheet.classList.remove('open');
}

export function initContextBar() {
  const pill = document.getElementById('context-pill');
  pillText = document.getElementById('context-pill-text');
  if (!pill) return;

  renderPill();
  pill.onclick = openEditor;
  subscribeContext(renderPill);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeEditor();
  });
}
