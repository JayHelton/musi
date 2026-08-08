// Music Preferences — genre priorities, learning goals, study balance,
// application preference, and temporary topic exclusions.

import { GENRE_LIST, GENRE_PRIORITIES, LEARNING_GOALS, CONCEPTS, conceptLabel } from './genreProfiles.js';
import {
  getMusicProfile,
  setGenrePriority,
  removeGenre,
  toggleGoal,
  toggleApplication,
  toggleExclusion,
  setStudyBalance,
  STUDY_BALANCES,
  APPLICATION_PREFS,
  genreSummary,
  hasActiveGenres,
} from './musicProfile.js';
import { buildRecommendations } from './studyRecommendations.js';
import { STUDY_CATALOG } from './studyCatalog.js';
import {
  CATEGORIES,
  TOOLS,
  TOOL_ICONS,
  toolsInCategory,
  setFeatureEnabled,
  getEnabledFeatureIdsRaw,
} from './tools.js';
import {
  getContext,
  setContext,
  subscribeContext,
  TEMPO_MIN,
  TEMPO_MAX,
  ITERATION_MODES,
  getIterationModeLabel,
} from './musicalContext.js';
import { shortScaleName } from './scales.js';
import { openRootPicker, openScalePicker } from './pickers.js';
import { getMasterVolume, setMasterVolume } from './audio.js';
import { getSetting, saveSetting } from './persistence.js';

const CONTEXT_SOURCE = 'music-prefs';
const MODE_ITEMS = ITERATION_MODES.map(m => ({ val: m, label: getIterationModeLabel(m) }));

let showSectionFn = null;
let host = null;
let contextUnsub = null;

function groupGenres() {
  const groups = new Map();
  GENRE_LIST.forEach(g => {
    const key = g.group || 'Other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(g);
  });
  return groups;
}

function genrePriority(profile, genreId) {
  return profile.genres.find(g => g.id === genreId)?.priority || null;
}

function render() {
  if (!host) return;
  if (contextUnsub) {
    contextUnsub();
    contextUnsub = null;
  }
  const profile = getMusicProfile();
  const rec = buildRecommendations({ limit: 1 });

  host.innerHTML = `
    <div class="section-head">
      <div class="section-kicker">Settings</div>
      <h2>Settings & Preferences</h2>
      <p>Choose which tools appear in the app, and tune genre settings that shape study context and priority — not shortcuts.</p>
    </div>

    <div class="mp-banner">
      <div class="mp-banner-kicker">Active profile</div>
      <div class="mp-banner-title">${escapeHtml(genreSummary(profile))}</div>
      <div class="mp-banner-sub">${hasActiveGenres(profile)
        ? 'Recommendations combine foundation, genre relevance, weakness, and review urgency.'
        : 'Add genres below to personalize recommendations. Foundation studies remain available either way.'}</div>
    </div>

    <section class="mp-block" id="mp-context-block">
      <h3 class="mp-block-title">Musical context</h3>
      <p class="mp-block-help">Default key, scale, and tempo shared across compatible tools.</p>
      <div class="context-field">
        <div class="context-field-label">Key</div>
        <button type="button" class="setup-chip context-pick-btn" id="mp-ctx-root-btn" aria-label="Change root">
          <span class="setup-chip-value" id="mp-ctx-root-val">C</span>
          <span class="setup-chip-hint">Change</span>
        </button>
        <div class="context-mode-row">
          <div class="context-field-label context-mode-label">Key progression</div>
          <div class="seg-row compact" id="mp-ctx-root-mode"></div>
        </div>
      </div>
      <div class="context-field">
        <div class="context-field-label">Mode / Scale</div>
        <button type="button" class="setup-chip context-pick-btn" id="mp-ctx-scale-btn" aria-label="Change scale">
          <span class="setup-chip-value" id="mp-ctx-scale-val">Major</span>
          <span class="setup-chip-hint">Change</span>
        </button>
        <div class="quick-scale-row" id="mp-ctx-quick-scales" aria-label="Quick scales"></div>
        <div class="context-mode-row">
          <div class="context-field-label context-mode-label">Scale progression</div>
          <div class="seg-row compact" id="mp-ctx-scale-mode"></div>
        </div>
      </div>
      <div class="context-field">
        <div class="context-field-label">Tempo</div>
        <div class="context-tempo-row">
          <button type="button" class="context-step" id="mp-ctx-tempo-down" aria-label="Slower">-</button>
          <input type="number" id="mp-ctx-tempo" class="context-tempo-input" min="${TEMPO_MIN}" max="${TEMPO_MAX}" inputmode="numeric">
          <span class="context-tempo-unit">BPM</span>
          <button type="button" class="context-step" id="mp-ctx-tempo-up" aria-label="Faster">+</button>
        </div>
      </div>
    </section>

    <section class="mp-block" id="mp-volume-block">
      <h3 class="mp-block-title">Volume</h3>
      <p class="mp-block-help">Global audio level for trainers, playback, and synth.</p>
      <div class="mp-volume-row">
        <input id="mp-volume-slider" type="range" min="0" max="150" step="1" value="100" aria-label="Global volume">
        <span id="mp-volume-value" class="mp-volume-value">100%</span>
      </div>
    </section>

    <section class="mp-block">
      <h3 class="mp-block-title">Features</h3>
      <p class="mp-block-help">Choose which tools appear in the toolbar and on Home. Settings stays available so you can turn them back on.</p>
      <div class="mp-feature-groups" id="mp-features"></div>
    </section>

    <section class="mp-block">
      <h3 class="mp-block-title">Genre priorities</h3>
      <p class="mp-block-help">Primary and secondary genres raise related concepts. General theory stays required.</p>
      <div class="mp-genre-groups" id="mp-genre-groups"></div>
    </section>

    <section class="mp-block">
      <h3 class="mp-block-title">Learning goals</h3>
      <p class="mp-block-help">Goals nudge application framing and concept weight.</p>
      <div class="mp-chip-grid" id="mp-goals"></div>
    </section>

    <section class="mp-block">
      <h3 class="mp-block-title">Study balance</h3>
      <p class="mp-block-help">Choose how aggressively genre color competes with foundation and review.</p>
      <div class="mp-balance" id="mp-balance"></div>
    </section>

    <section class="mp-block">
      <h3 class="mp-block-title">Application preference</h3>
      <p class="mp-block-help">Frames practice prompts after theory work — you still supply the musical answer.</p>
      <div class="mp-chip-grid" id="mp-apps"></div>
    </section>

    <section class="mp-block">
      <h3 class="mp-block-title">Pause topics</h3>
      <p class="mp-block-help">Temporarily exclude a concept without deleting it from your profile.</p>
      <div class="mp-chip-grid mp-exclusions" id="mp-exclusions"></div>
    </section>

    <section class="mp-block">
      <h3 class="mp-block-title">Preview</h3>
      <div class="mp-preview" id="mp-preview"></div>
    </section>
  `;

  paintMusicalContext();
  paintVolume();
  paintFeatures();
  paintGenres(profile);
  paintGoals(profile);
  paintBalance(profile);
  paintApps(profile);
  paintExclusions(profile);
  paintPreview(rec);
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

function markSegmentActive(container, val) {
  container.querySelectorAll('.seg-btn').forEach(el => {
    el.classList.toggle('active', el.dataset.val === val);
  });
}

function syncContextBlock(c) {
  const rootVal = host?.querySelector('#mp-ctx-root-val');
  const scaleVal = host?.querySelector('#mp-ctx-scale-val');
  const tempoInput = host?.querySelector('#mp-ctx-tempo');
  const rootModeRow = host?.querySelector('#mp-ctx-root-mode');
  const scaleModeRow = host?.querySelector('#mp-ctx-scale-mode');
  if (rootVal) rootVal.textContent = c.root;
  if (scaleVal) scaleVal.textContent = shortScaleName(c.scale);
  if (tempoInput && Number(tempoInput.value) !== c.tempo) tempoInput.value = c.tempo;
  if (rootModeRow) markSegmentActive(rootModeRow, c.rootMode);
  if (scaleModeRow) markSegmentActive(scaleModeRow, c.scaleMode);
  renderQuickScales();
}

function renderQuickScales() {
  const row = host?.querySelector('#mp-ctx-quick-scales');
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
      btn.onclick = () => setContext({ scale: name }, CONTEXT_SOURCE);
      row.appendChild(btn);
    });
  });
}

function paintMusicalContext() {
  const rootModeRow = host?.querySelector('#mp-ctx-root-mode');
  const scaleModeRow = host?.querySelector('#mp-ctx-scale-mode');
  const tempoInput = host?.querySelector('#mp-ctx-tempo');
  if (!rootModeRow || !scaleModeRow || !tempoInput) return;

  const c = getContext();
  buildSegmented(rootModeRow, MODE_ITEMS, c.rootMode, val => {
    setContext({ rootMode: val }, CONTEXT_SOURCE);
  });
  buildSegmented(scaleModeRow, MODE_ITEMS, c.scaleMode, val => {
    setContext({ scaleMode: val }, CONTEXT_SOURCE);
  });

  host.querySelector('#mp-ctx-root-btn').onclick = async () => {
    await openRootPicker({ value: getContext().root, source: CONTEXT_SOURCE });
  };
  host.querySelector('#mp-ctx-scale-btn').onclick = async () => {
    await openScalePicker({ value: getContext().scale, source: CONTEXT_SOURCE });
  };

  tempoInput.value = c.tempo;
  tempoInput.onchange = () => setContext({ tempo: Number(tempoInput.value) }, CONTEXT_SOURCE);
  host.querySelector('#mp-ctx-tempo-down').onclick = () => setContext({ tempo: getContext().tempo - 1 }, CONTEXT_SOURCE);
  host.querySelector('#mp-ctx-tempo-up').onclick = () => setContext({ tempo: getContext().tempo + 1 }, CONTEXT_SOURCE);

  renderQuickScales();
  contextUnsub = subscribeContext((ctx) => syncContextBlock(ctx));
}

function paintVolume() {
  const slider = host?.querySelector('#mp-volume-slider');
  const valueLabel = host?.querySelector('#mp-volume-value');
  if (!slider) return;

  const saved = Number(getSetting('global.volume', getMasterVolume()));
  const initial = Number.isNaN(saved) ? getMasterVolume() : saved;
  setMasterVolume(initial);
  slider.value = String(Math.round(getMasterVolume() * 100));
  if (valueLabel) valueLabel.textContent = Math.round(getMasterVolume() * 100) + '%';

  slider.oninput = (e) => {
    const vol = Number(e.target.value) / 100;
    setMasterVolume(vol);
    saveSetting('global.volume', getMasterVolume());
    if (valueLabel) valueLabel.textContent = Math.round(getMasterVolume() * 100) + '%';
  };
}

function paintFeatures() {
  const root = host.querySelector('#mp-features');
  if (!root) return;
  root.innerHTML = '';
  const stored = getEnabledFeatureIdsRaw();
  const enabledSet = stored === undefined
    ? new Set(TOOLS.map(t => t.id))
    : new Set(stored);

  CATEGORIES.forEach(cat => {
    const tools = toolsInCategory(cat.id);
    if (!tools.length) return;
    const block = document.createElement('div');
    block.className = 'mp-feature-group';
    block.innerHTML = `<div class="mp-genre-group-label">${escapeHtml(cat.label)}</div>`;
    const list = document.createElement('div');
    list.className = 'mp-feature-list';
    tools.forEach(tool => {
      const locked = tool.id === 'musicprefs';
      const on = locked || enabledSet.has(tool.id);
      const row = document.createElement('label');
      row.className = 'mp-feature-row' + (on ? ' on' : '') + (locked ? ' locked' : '');
      row.innerHTML = `
        <input type="checkbox" class="mp-feature-check" data-tool="${tool.id}"${on ? ' checked' : ''}${locked ? ' disabled' : ''}>
        <span class="mp-feature-icon">${TOOL_ICONS[tool.id] || ''}</span>
        <span class="mp-feature-meta">
          <span class="mp-feature-name">${escapeHtml(tool.label)}</span>
          <span class="mp-feature-desc">${escapeHtml(tool.description)}</span>
        </span>
        ${locked ? '<span class="mp-feature-lock" aria-hidden="true">Always on</span>' : ''}
      `;
      list.appendChild(row);
    });
    block.appendChild(list);
    root.appendChild(block);
  });

  root.querySelectorAll('.mp-feature-check').forEach(input => {
    if (input.disabled) return;
    input.onchange = () => {
      const id = input.dataset.tool;
      setFeatureEnabled(id, input.checked);
      notifyFeaturesChanged();
      paintFeatures();
    };
  });
}

function notifyFeaturesChanged() {
  try {
    window.dispatchEvent(new CustomEvent('musi:features-changed'));
  } catch (_) { /* ignore */ }
}

function paintGenres(profile) {
  const root = host.querySelector('#mp-genre-groups');
  if (!root) return;
  root.innerHTML = '';
  groupGenres().forEach((genres, groupName) => {
    const block = document.createElement('div');
    block.className = 'mp-genre-group';
    block.innerHTML = `<div class="mp-genre-group-label">${escapeHtml(groupName)}</div>`;
    const list = document.createElement('div');
    list.className = 'mp-genre-list';
    genres.forEach(g => {
      const pri = genrePriority(profile, g.id);
      const row = document.createElement('div');
      row.className = 'mp-genre-row' + (pri && pri !== 'inactive' ? ' active' : '');
      row.innerHTML = `
        <div class="mp-genre-meta">
          <div class="mp-genre-name">${escapeHtml(g.label)}</div>
          <div class="mp-genre-blurb">${escapeHtml(g.blurb)}</div>
        </div>
        <label class="mp-select-wrap">
          <span class="sr-only">Priority for ${escapeHtml(g.label)}</span>
          <select data-genre="${g.id}" class="mp-priority-select">
            <option value="">Not selected</option>
            ${GENRE_PRIORITIES.map(p =>
              `<option value="${p.id}"${pri === p.id ? ' selected' : ''}>${escapeHtml(p.label)}</option>`
            ).join('')}
          </select>
        </label>
      `;
      list.appendChild(row);
    });
    block.appendChild(list);
    root.appendChild(block);
  });

  root.querySelectorAll('.mp-priority-select').forEach(sel => {
    sel.onchange = () => {
      const id = sel.dataset.genre;
      const val = sel.value;
      if (!val) removeGenre(id);
      else setGenrePriority(id, val);
      render();
      notifyHome();
    };
  });
}

function paintGoals(profile) {
  const root = host.querySelector('#mp-goals');
  if (!root) return;
  root.innerHTML = '';
  LEARNING_GOALS.forEach(goal => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mp-chip' + (profile.goals.includes(goal.id) ? ' on' : '');
    btn.textContent = goal.label;
    btn.onclick = () => {
      toggleGoal(goal.id);
      render();
      notifyHome();
    };
    root.appendChild(btn);
  });
}

function paintBalance(profile) {
  const root = host.querySelector('#mp-balance');
  if (!root) return;
  root.innerHTML = '';
  STUDY_BALANCES.forEach(b => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mp-balance-card' + (profile.balance === b.id ? ' on' : '');
    btn.innerHTML = `
      <span class="mp-balance-label">${escapeHtml(b.label)}</span>
      <span class="mp-balance-desc">${escapeHtml(b.description)}</span>
    `;
    btn.onclick = () => {
      setStudyBalance(b.id);
      render();
      notifyHome();
    };
    root.appendChild(btn);
  });
}

function paintApps(profile) {
  const root = host.querySelector('#mp-apps');
  if (!root) return;
  root.innerHTML = '';
  APPLICATION_PREFS.forEach(app => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mp-chip' + (profile.applications.includes(app.id) ? ' on' : '');
    btn.textContent = app.label;
    btn.onclick = () => {
      toggleApplication(app.id);
      render();
      notifyHome();
    };
    root.appendChild(btn);
  });
}

function paintExclusions(profile) {
  const root = host.querySelector('#mp-exclusions');
  if (!root) return;
  // Offer concepts that appear in the catalog, plus any already excluded.
  const ids = new Set(STUDY_CATALOG.flatMap(s => s.concepts));
  profile.exclusions.forEach(id => ids.add(id));
  const list = [...ids]
    .filter(id => CONCEPTS[id])
    .sort((a, b) => conceptLabel(a).localeCompare(conceptLabel(b)))
    .slice(0, 36);

  root.innerHTML = '';
  list.forEach(id => {
    const on = profile.exclusions.includes(id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mp-chip mp-chip-mute' + (on ? ' on' : '');
    btn.textContent = conceptLabel(id);
    btn.title = on ? 'Click to resume' : 'Click to pause';
    btn.onclick = () => {
      toggleExclusion(id);
      render();
      notifyHome();
    };
    root.appendChild(btn);
  });
}

function paintPreview(recBundle) {
  const root = host.querySelector('#mp-preview');
  if (!root) return;
  const rec = recBundle.primary;
  if (!rec) {
    root.innerHTML = `<p class="mp-preview-empty">No study available with the current exclusions.</p>`;
    return;
  }
  root.innerHTML = `
    <div class="mp-preview-kicker">${escapeHtml(rec.categoryLabel)}</div>
    <div class="mp-preview-title">${escapeHtml(rec.title)}</div>
    <p class="mp-preview-body">${escapeHtml(rec.narrative)}</p>
    <ul class="mp-preview-reasons">
      ${rec.reasons.map(r => `<li>${escapeHtml(r)}</li>`).join('')}
    </ul>
    <p class="mp-preview-guard">${escapeHtml(rec.guardrail)}</p>
  `;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function notifyHome() {
  try {
    window.dispatchEvent(new CustomEvent('musi:profile-changed'));
  } catch (_) { /* ignore */ }
}

export function initGlobalVolume() {
  const saved = Number(getSetting('global.volume', getMasterVolume()));
  const initial = Number.isNaN(saved) ? getMasterVolume() : saved;
  setMasterVolume(initial);
}

export function initMusicPreferences({ showSection } = {}) {
  showSectionFn = showSection;
  host = document.getElementById('music-prefs-root');
  if (!host) return;
  render();
}

export function refreshMusicPreferences() {
  if (host) render();
}
