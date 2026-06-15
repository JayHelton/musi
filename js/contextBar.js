import { getContext, setContext, subscribeContext, TEMPO_MIN, TEMPO_MAX } from './musicalContext.js';
import { ROOTS } from './theory.js';
import { groupedScaleEntries } from './scales.js';

const SOURCE = 'context-bar';

export function shortScaleName(name) {
  if (!name) return '';
  return name
    .replace('Major (Ionian)', 'Major')
    .replace('Natural Minor (Aeolian)', 'Minor')
    .replace('Melodic Minor (Asc)', 'Melodic Minor')
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .trim();
}

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
  container.querySelectorAll('.seg-btn,option').forEach(el => {
    if (el.tagName === 'OPTION') return;
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
  sheet.setAttribute('aria-label', 'Musical context');

  sheet.innerHTML = `
    <div class="context-sheet-handle"></div>
    <div class="context-sheet-title">Musical Context</div>
    <div class="context-field">
      <div class="context-field-label">Key</div>
      <div class="seg-row" id="ctx-root"></div>
    </div>
    <div class="context-field">
      <div class="context-field-label">Mode / Scale</div>
      <div class="seg-row" id="ctx-scale"></div>
      <select class="context-scale-select" id="ctx-scale-select" aria-label="All scales"></select>
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

  const rootRow = sheet.querySelector('#ctx-root');
  const scaleRow = sheet.querySelector('#ctx-scale');
  const scaleSelect = sheet.querySelector('#ctx-scale-select');
  const tempoInput = sheet.querySelector('#ctx-tempo');

  buildSegmented(rootRow, ROOTS.map(r => ({ val: r, label: r })), getContext().root, val => {
    setContext({ root: val }, SOURCE);
  });

  const allScales = groupedScaleEntries(false);
  const commonScales = allScales
    .filter(e => e.type !== 'label')
    .slice(0, 8)
    .map(e => ({ val: e.val, label: shortScaleName(e.label) }));
  buildSegmented(scaleRow, commonScales, getContext().scale, val => {
    setContext({ scale: val }, SOURCE);
  });

  allScales.forEach(({ type, val, label }) => {
    if (type === 'label') {
      const og = document.createElement('optgroup');
      og.label = label;
      scaleSelect.appendChild(og);
      return;
    }
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    const target = scaleSelect.lastElementChild;
    if (target && target.tagName === 'OPTGROUP') target.appendChild(opt);
    else scaleSelect.appendChild(opt);
  });
  scaleSelect.value = getContext().scale;
  scaleSelect.onchange = () => setContext({ scale: scaleSelect.value }, SOURCE);

  tempoInput.value = getContext().tempo;
  tempoInput.onchange = () => setContext({ tempo: Number(tempoInput.value) }, SOURCE);
  sheet.querySelector('#ctx-tempo-down').onclick = () => setContext({ tempo: getContext().tempo - 1 }, SOURCE);
  sheet.querySelector('#ctx-tempo-up').onclick = () => setContext({ tempo: getContext().tempo + 1 }, SOURCE);

  // Keep the editor controls in sync when context changes from anywhere.
  subscribeContext(c => {
    markActive(rootRow, c.root);
    markActive(scaleRow, c.scale);
    if (scaleSelect.value !== c.scale) scaleSelect.value = c.scale;
    if (Number(tempoInput.value) !== c.tempo) tempoInput.value = c.tempo;
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
