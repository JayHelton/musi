// Settings — defaults, audio, library transfer, storage, and advanced profile controls.

import { GENRE_LIST, GENRE_PRIORITIES, LEARNING_GOALS } from './genreProfiles.js';
import {
  getMusicProfile,
  saveMusicProfile,
  setGenrePriority,
  removeGenre,
  genreSummary,
  activeGenreEntries,
} from './musicProfile.js';
import {
  CATEGORIES,
  TOOLS,
  TOOL_ICONS,
  toolsInCategory,
  setFeatureEnabled,
  getEnabledFeatureIdsRaw,
} from './tools.js';
import { getMusicContext, setMusicContext, subscribeMusicContext } from './core/musicContext.js';
import { ROOTS } from './theory.js';
import { SCALES, shortScaleName } from './scales.js';
import { TUNING_CATALOG } from './tunings.js';
import { getMasterVolume, setMasterVolume } from './audio.js';
import { getSetting, saveSetting } from './persistence.js';
import { collectAttachedWorkbookIds } from './routineModel.js';
import { listWorkbooks, deleteWorkbooksNotAttached, pruneMissingExercisesAll } from './workbookModel.js';
import { getExercises, getExercisesWithoutFolder, deleteExercisesWithoutFolder } from './exercises.js';

const CONTEXT_SOURCE = 'music-prefs';
const TEMPO_MIN = 30;
const TEMPO_MAX = 300;
const INSTRUMENTS = [
  { id: 'guitar', label: 'Guitar' },
  { id: 'bass', label: 'Bass' },
  { id: 'piano', label: 'Piano' },
  { id: 'voice', label: 'Voice' },
  { id: 'drums', label: 'Drums' },
];

const NAV_PROTECTED_FEATURES = new Set(['home', 'train', 'study', 'create', 'settings', 'musicprefs']);

let host = null;
let contextUnsub = null;
let dialogRoot = null;

/**
 * Pure settings model for tests and render.
 * @param {{ profile?: object, context?: object }} [fixtures]
 */
export function buildSettingsModel(fixtures = {}) {
  const profile = fixtures.profile ?? getMusicProfile();
  const ctx = fixtures.context ?? getMusicContext();
  const genres = activeGenreEntries(profile)
    .slice()
    .sort((a, b) => (b.priority === 'primary' ? 1 : 0) - (a.priority === 'primary' ? 1 : 0));
  return {
    defaults: {
      instrument: ctx.instrument,
      tuningId: ctx.tuningId,
      root: ctx.root,
      scaleId: ctx.scaleId,
      tempoBpm: ctx.tempoBpm,
      keySignaturePreference: ctx.keySignaturePreference,
    },
    profile: {
      primaryGenre: genres[0]?.id || '',
      primaryGoal: profile.goals[0] || '',
      genreSummary: genreSummary(profile),
    },
    volume: Number(getSetting('global.volume', getMasterVolume())),
  };
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function groupGenres() {
  const groups = new Map();
  GENRE_LIST.forEach((g) => {
    const key = g.group || 'Other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(g);
  });
  return groups;
}

function genrePriority(profile, genreId) {
  return profile.genres.find((g) => g.id === genreId)?.priority || null;
}

function render() {
  if (!host) return;
  if (contextUnsub) {
    contextUnsub();
    contextUnsub = null;
  }

  host.innerHTML = `
    <div class="section-head">
      <div class="section-kicker">Settings</div>
      <h2>Settings</h2>
      <p>Defaults, audio, library transfer, and storage. Study review options live under Study › Review.</p>
    </div>

    <section class="mp-block mp-panel" aria-labelledby="mp-defaults-title">
      <h3 class="mp-block-title" id="mp-defaults-title">Defaults</h3>
      <p class="mp-block-help">Instrument, key, tempo, and spelling shared across Train, Study, and Create.</p>
      <div class="study-setup-strip mp-defaults-grid" id="mp-defaults-grid"></div>
      <div class="study-setup-strip mp-profile-simple" id="mp-profile-simple"></div>
    </section>

    <section class="mp-block mp-panel" aria-labelledby="mp-audio-title">
      <h3 class="mp-block-title" id="mp-audio-title">Audio</h3>
      <p class="mp-block-help">Global audio level for trainers, playback, and synth.</p>
      <div class="mp-volume-row">
        <label class="mp-field-label" for="mp-volume-slider">Volume</label>
        <input id="mp-volume-slider" type="range" min="0" max="150" step="1" value="100" aria-label="Global volume">
        <span id="mp-volume-value" class="mp-volume-value">100%</span>
      </div>
    </section>

    <section class="mp-block mp-panel" aria-labelledby="mp-library-title">
      <h3 class="mp-block-title" id="mp-library-title">Library &amp; transfer</h3>
      <p class="mp-block-help">Move your library to another device — no account needed.</p>
      <details class="sync-advanced" id="mp-sync-advanced">
        <summary class="sync-advanced-summary">Advanced options</summary>
        <div class="sync-scopes-label">What to include</div>
        <div class="sync-scope-list" id="mp-sync-scopes"></div>
      </details>
      <div class="sync-method sync-method-library">
        <div class="sync-estimate" id="mp-sync-bundle-estimate" aria-live="polite">Calculating…</div>
        <p class="sync-hint sync-hint-compact">Quick Share, USB, or cloud drive moves the file between devices.</p>
        <div class="sync-btn-row">
          <button type="button" class="btn sm primary" id="mp-sync-export-library">Export library</button>
          <button type="button" class="btn sm" id="mp-sync-import">Import</button>
        </div>
        <input type="file" id="mp-sync-import-input" class="sync-file-input" accept=".zip,.json,application/zip,application/json" hidden>
      </div>
      <div class="sync-method sync-method-settings sync-method-secondary">
        <p class="sync-hint sync-hint-compact">Settings and progress only — no exercise files.</p>
        <div class="sync-estimate sync-estimate-sub" id="mp-sync-payload-estimate" aria-live="polite">Calculating…</div>
        <div class="sync-btn-row">
          <button type="button" class="btn sm sync-btn-secondary" id="mp-sync-export">Export settings file</button>
        </div>
        <div class="sync-section-label sync-section-label-inline">QR transfer</div>
        <div class="sync-qr-warning" id="mp-sync-qr-warning" hidden aria-live="polite"></div>
        <div class="sync-btn-row">
          <button type="button" class="btn sm sync-btn-secondary" id="mp-sync-beam">Beam via QR</button>
          <button type="button" class="btn sm sync-btn-secondary" id="mp-sync-receive">Receive via QR</button>
        </div>
      </div>
      <div class="mp-library-cleanup" id="mp-cleanup-root"></div>
    </section>

    <section class="mp-block mp-panel" aria-labelledby="mp-storage-title">
      <h3 class="mp-block-title" id="mp-storage-title">Storage &amp; offline</h3>
      <p class="mp-block-help">Local persistence and offline readiness on this device.</p>
      <dl class="music-inspector-facts mp-storage-facts" id="mp-storage-facts"></dl>
    </section>

    <details class="mp-block mp-panel mp-advanced" id="mp-advanced">
      <summary class="mp-block-title mp-advanced-summary">Advanced</summary>
      <p class="mp-block-help">Optional tool visibility and detailed genre priorities. Navigation destinations cannot be hidden.</p>
      <div class="mp-feature-groups" id="mp-features"></div>
      <h4 class="mp-subtitle">Genre priorities</h4>
      <div class="mp-genre-groups" id="mp-genre-groups"></div>
    </details>
  `;

  paintDefaults();
  paintSimpleProfile();
  paintVolume();
  paintDeviceSync();
  paintLibraryCleanup();
  paintStorageInfo();
  paintFeatures();
  paintGenres(getMusicProfile());
}

function paintDefaults() {
  const grid = host?.querySelector('#mp-defaults-grid');
  if (!grid) return;

  const ctx = getMusicContext();
  grid.innerHTML = `
    <label class="study-setup-field">
      <span class="study-setup-label">Instrument</span>
      <select id="mp-default-instrument" class="study-setup-select"></select>
    </label>
    <label class="study-setup-field">
      <span class="study-setup-label">Tuning</span>
      <select id="mp-default-tuning" class="study-setup-select"></select>
    </label>
    <label class="study-setup-field">
      <span class="study-setup-label">Key</span>
      <select id="mp-default-root" class="study-setup-select"></select>
    </label>
    <label class="study-setup-field">
      <span class="study-setup-label">Mode / scale</span>
      <select id="mp-default-scale" class="study-setup-select"></select>
    </label>
    <label class="study-setup-field">
      <span class="study-setup-label">Tempo</span>
      <div class="context-tempo-row">
        <button type="button" class="context-step" id="mp-default-tempo-down" aria-label="Slower">-</button>
        <input type="number" id="mp-default-tempo" class="context-tempo-input study-setup-select" min="${TEMPO_MIN}" max="${TEMPO_MAX}" inputmode="numeric" aria-label="Tempo BPM">
        <span class="context-tempo-unit">BPM</span>
        <button type="button" class="context-step" id="mp-default-tempo-up" aria-label="Faster">+</button>
      </div>
    </label>
    <label class="study-setup-field">
      <span class="study-setup-label">Accidentals</span>
      <select id="mp-default-acc" class="study-setup-select">
        <option value="sharps">Sharps</option>
        <option value="flats">Flats</option>
      </select>
    </label>
  `;

  const instSel = grid.querySelector('#mp-default-instrument');
  INSTRUMENTS.forEach((item) => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.label;
    if (item.id === ctx.instrument) opt.selected = true;
    instSel.appendChild(opt);
  });

  const tuningSel = grid.querySelector('#mp-default-tuning');
  TUNING_CATALOG.forEach((preset) => {
    const opt = document.createElement('option');
    opt.value = preset.id;
    opt.textContent = preset.name;
    if (preset.id === ctx.tuningId) opt.selected = true;
    tuningSel.appendChild(opt);
  });

  const rootSel = grid.querySelector('#mp-default-root');
  ROOTS.forEach((r) => {
    const opt = document.createElement('option');
    opt.value = r;
    opt.textContent = r;
    if (r === ctx.root) opt.selected = true;
    rootSel.appendChild(opt);
  });

  const scaleSel = grid.querySelector('#mp-default-scale');
  Object.keys(SCALES).forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = shortScaleName(name);
    if (name === ctx.scaleId) opt.selected = true;
    scaleSel.appendChild(opt);
  });

  const tempoInput = grid.querySelector('#mp-default-tempo');
  const accSel = grid.querySelector('#mp-default-acc');
  tempoInput.value = ctx.tempoBpm;
  accSel.value = ctx.keySignaturePreference;

  const apply = () => {
    setMusicContext({
      instrument: instSel.value,
      tuningId: tuningSel.value,
      root: rootSel.value,
      scaleId: scaleSel.value,
      tempoBpm: Number(tempoInput.value),
      keySignaturePreference: accSel.value,
    }, CONTEXT_SOURCE);
  };

  instSel.onchange = apply;
  tuningSel.onchange = apply;
  rootSel.onchange = apply;
  scaleSel.onchange = apply;
  accSel.onchange = apply;
  tempoInput.onchange = apply;
  grid.querySelector('#mp-default-tempo-down').onclick = () => {
    setMusicContext({ tempoBpm: getMusicContext().tempoBpm - 1 }, CONTEXT_SOURCE);
  };
  grid.querySelector('#mp-default-tempo-up').onclick = () => {
    setMusicContext({ tempoBpm: getMusicContext().tempoBpm + 1 }, CONTEXT_SOURCE);
  };

  contextUnsub = subscribeMusicContext((next) => {
    if (instSel.value !== (next.instrument || '')) instSel.value = next.instrument || 'guitar';
    if (tuningSel.value !== next.tuningId) tuningSel.value = next.tuningId;
    if (rootSel.value !== next.root) rootSel.value = next.root;
    if (scaleSel.value !== next.scaleId) scaleSel.value = next.scaleId;
    if (Number(tempoInput.value) !== next.tempoBpm) tempoInput.value = next.tempoBpm;
    if (accSel.value !== next.keySignaturePreference) accSel.value = next.keySignaturePreference;
  });
}

function paintSimpleProfile() {
  const root = host?.querySelector('#mp-profile-simple');
  if (!root) return;
  const model = buildSettingsModel();
  root.innerHTML = `
    <label class="study-setup-field">
      <span class="study-setup-label">Primary genre</span>
      <select id="mp-simple-genre" class="study-setup-select" aria-label="Primary genre">
        <option value="">General theory</option>
        ${GENRE_LIST.map((g) =>
          `<option value="${g.id}"${model.profile.primaryGenre === g.id ? ' selected' : ''}>${escapeHtml(g.label)}</option>`
        ).join('')}
      </select>
    </label>
    <label class="study-setup-field">
      <span class="study-setup-label">Learning goal</span>
      <select id="mp-simple-goal" class="study-setup-select" aria-label="Learning goal">
        <option value="">None selected</option>
        ${LEARNING_GOALS.map((g) =>
          `<option value="${g.id}"${model.profile.primaryGoal === g.id ? ' selected' : ''}>${escapeHtml(g.label)}</option>`
        ).join('')}
      </select>
    </label>
    <p class="mp-block-help mp-profile-hint">${escapeHtml(model.profile.genreSummary)}</p>
  `;

  const genreSel = root.querySelector('#mp-simple-genre');
  const goalSel = root.querySelector('#mp-simple-goal');

  genreSel.onchange = () => {
    const id = genreSel.value;
    if (!id) {
      const profile = getMusicProfile();
      profile.genres.forEach((g) => removeGenre(g.id));
    } else {
      setGenrePriority(id, 'primary');
    }
    paintSimpleProfile();
    notifyProfileChanged();
  };

  goalSel.onchange = () => {
    const id = goalSel.value;
    saveMusicProfile({ goals: id ? [id] : [], onboarded: true });
    paintSimpleProfile();
    notifyProfileChanged();
  };
}

function paintVolume() {
  const slider = host?.querySelector('#mp-volume-slider');
  const valueLabel = host?.querySelector('#mp-volume-value');
  if (!slider) return;

  const saved = Number(getSetting('global.volume', getMasterVolume()));
  const initial = Number.isNaN(saved) ? getMasterVolume() : saved;
  setMasterVolume(initial);
  slider.value = String(Math.round(getMasterVolume() * 100));
  if (valueLabel) valueLabel.textContent = `${Math.round(getMasterVolume() * 100)}%`;

  slider.oninput = (e) => {
    const vol = Number(e.target.value) / 100;
    setMasterVolume(vol);
    saveSetting('global.volume', getMasterVolume());
    if (valueLabel) valueLabel.textContent = `${Math.round(getMasterVolume() * 100)}%`;
  };
}

let syncEstimateTimer = null;
let syncEstimateGen = 0;

function getSelectedSyncScopes(defaultIds) {
  const saved = getSetting('sync.scopes', null);
  if (Array.isArray(saved) && saved.length) {
    return saved.filter((id) => defaultIds.includes(id));
  }
  return [...defaultIds];
}

function syncAdvancedWasOpened() {
  return getSetting('sync.advancedOpened', false) === true;
}

function effectiveSyncScopes(readScopesFromUi, allIds) {
  if (!syncAdvancedWasOpened()) return [...allIds];
  const ids = readScopesFromUi();
  return ids.length ? ids : [...allIds];
}

function scheduleSyncEstimate(scopes) {
  clearTimeout(syncEstimateTimer);
  syncEstimateTimer = setTimeout(() => updateSyncEstimate(scopes), 300);
}

async function updateSyncEstimate(scopes) {
  const gen = ++syncEstimateGen;
  const bundleEl = host?.querySelector('#mp-sync-bundle-estimate');
  const payloadEl = host?.querySelector('#mp-sync-payload-estimate');
  const qrWarningEl = host?.querySelector('#mp-sync-qr-warning');
  const beamBtn = host?.querySelector('#mp-sync-beam');
  if (!bundleEl && !payloadEl) return;

  if (bundleEl) bundleEl.textContent = 'Calculating…';
  if (payloadEl) payloadEl.textContent = 'Calculating…';

  let bundleEstimate = null;
  try {
    const { estimateBundle } = await import('./sync/syncBundle.js');
    const { formatBundleEstimateText } = await import('./sync/syncUI.js');
    bundleEstimate = await estimateBundle({ scopes });
    if (gen === syncEstimateGen && bundleEl) {
      bundleEl.textContent = formatBundleEstimateText(bundleEstimate, scopes);
    }
  } catch (_) {
    if (gen === syncEstimateGen && bundleEl) {
      bundleEl.textContent = 'Could not estimate library size.';
    }
  }

  try {
    const { buildSnapshot } = await import('./sync/syncProfile.js');
    const { encodePayload, estimateTransfer } = await import('./sync/frames.js');
    const { DEFAULT_BEAM_FPS, formatPayloadBeamEstimate, evaluateQrBeamGate } = await import('./sync/syncUI.js');
    const snapshot = buildSnapshot({ scopes });
    const bytes = await encodePayload(snapshot);
    if (gen !== syncEstimateGen) return;

    if (payloadEl) {
      const est = estimateTransfer(bytes.length, { fps: DEFAULT_BEAM_FPS });
      payloadEl.textContent = formatPayloadBeamEstimate(bytes.length, est, { prefixAbout: true });
    }

    const gate = evaluateQrBeamGate({ scopes, bundleEstimate, payloadByteLength: bytes.length });
    if (qrWarningEl) {
      if (gate.warningText) {
        qrWarningEl.hidden = false;
        qrWarningEl.textContent = gate.warningText;
      } else {
        qrWarningEl.hidden = true;
        qrWarningEl.textContent = '';
      }
    }
    if (beamBtn) {
      beamBtn.disabled = !gate.allowBeam;
      beamBtn.title = gate.tooltip || '';
      beamBtn.classList.toggle('sync-btn-disabled', !gate.allowBeam);
    }
  } catch (_) {
    if (gen === syncEstimateGen && payloadEl) {
      payloadEl.textContent = 'Could not estimate payload size.';
    }
  }
}

function paintDeviceSync() {
  const scopeRoot = host?.querySelector('#mp-sync-scopes');
  const advancedDetails = host?.querySelector('#mp-sync-advanced');
  if (!scopeRoot) return;

  import('./sync/syncProfile.js').then(({ SYNC_SCOPES }) => {
    const allIds = SYNC_SCOPES.map((s) => s.id);
    const selected = getSelectedSyncScopes(allIds);
    if (!selected.length) selected.push(...allIds);

    scopeRoot.innerHTML = '';
    SYNC_SCOPES.forEach((scope) => {
      const row = document.createElement('label');
      row.className = 'sync-scope-row';
      const checked = selected.includes(scope.id);
      row.innerHTML = `
        <input type="checkbox" class="sync-scope-check" data-sync-scope="${scope.id}"${checked ? ' checked' : ''}>
        <span class="sync-scope-meta">
          <span class="sync-scope-label">${escapeHtml(scope.label)}</span>
          <span class="sync-scope-desc">${escapeHtml(scope.description)}</span>
        </span>
      `;
      scopeRoot.appendChild(row);
    });

    const readScopes = () => {
      const ids = [];
      scopeRoot.querySelectorAll('[data-sync-scope]').forEach((box) => {
        if (box.checked) ids.push(box.dataset.syncScope);
      });
      return ids.length ? ids : [...allIds];
    };
    const scopesForEstimate = () => effectiveSyncScopes(readScopes, allIds);

    scopeRoot.querySelectorAll('[data-sync-scope]').forEach((box) => {
      box.onchange = () => {
        saveSetting('sync.scopes', readScopes());
        scheduleSyncEstimate(scopesForEstimate());
      };
    });

    if (advancedDetails) {
      advancedDetails.addEventListener('toggle', () => {
        if (advancedDetails.open) {
          saveSetting('sync.advancedOpened', true);
          scheduleSyncEstimate(scopesForEstimate());
        }
      });
    }

    scheduleSyncEstimate(scopesForEstimate());

    const exportLibraryBtn = host.querySelector('#mp-sync-export-library');
    const importBtn = host.querySelector('#mp-sync-import');
    const importInput = host.querySelector('#mp-sync-import-input');
    const exportBtn = host.querySelector('#mp-sync-export');
    const beamBtn = host.querySelector('#mp-sync-beam');
    const receiveBtn = host.querySelector('#mp-sync-receive');

    if (exportLibraryBtn) {
      exportLibraryBtn.onclick = async () => {
        const { openBundleExport } = await import('./sync/syncUI.js');
        await openBundleExport({ scopes: [...allIds], trigger: exportLibraryBtn });
      };
    }
    if (importBtn && importInput) {
      importBtn.onclick = () => importInput.click();
      importInput.onchange = async () => {
        const file = importInput.files && importInput.files[0];
        importInput.value = '';
        if (!file) return;
        try {
          const { importFromFile } = await import('./sync/syncUI.js');
          await importFromFile(file, { trigger: importBtn });
        } catch (_) { /* ignore */ }
      };
    }
    if (exportBtn) {
      exportBtn.onclick = () => {
        const scopes = scopesForEstimate();
        import('./sync/syncProfile.js').then(({ buildSnapshot, serializeSnapshot, snapshotFilename }) => {
          const snapshot = buildSnapshot({ scopes });
          const text = serializeSnapshot(snapshot);
          const blob = new Blob([text], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = snapshotFilename(snapshot);
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        }).catch(() => { /* ignore */ });
      };
    }
    if (beamBtn) {
      beamBtn.onclick = async () => {
        if (beamBtn.disabled) return;
        const { openBeamDialog } = await import('./sync/syncUI.js');
        await openBeamDialog({ scopes: scopesForEstimate(), trigger: beamBtn });
      };
    }
    if (receiveBtn) {
      receiveBtn.onclick = async () => {
        const { openReceiveDialog } = await import('./sync/syncUI.js');
        await openReceiveDialog({ trigger: receiveBtn });
      };
    }
  }).catch(() => {
    const bundleEl = host?.querySelector('#mp-sync-bundle-estimate');
    const payloadEl = host?.querySelector('#mp-sync-payload-estimate');
    if (bundleEl) bundleEl.textContent = 'Device sync is not available.';
    if (payloadEl) payloadEl.textContent = 'Device sync is not available.';
  });
}

function paintStorageInfo() {
  const facts = host?.querySelector('#mp-storage-facts');
  if (!facts) return;

  const offlineReady = typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    && !!navigator.serviceWorker.controller;
  const idbOk = (() => {
    try { return typeof indexedDB !== 'undefined' && !!indexedDB; } catch (_) { return false; }
  })();

  facts.innerHTML = `
    <div class="music-inspector-fact"><dt>Offline app</dt><dd id="mp-storage-offline">${offlineReady ? 'Ready' : 'Install or reload to cache'}</dd></div>
    <div class="music-inspector-fact"><dt>File storage</dt><dd>${idbOk ? 'Available' : 'Unavailable'}</dd></div>
    <div class="music-inspector-fact"><dt>Disk use</dt><dd id="mp-storage-quota" aria-live="polite">Calculating…</dd></div>
    <div class="music-inspector-fact"><dt>Persistent</dt><dd id="mp-storage-persist" aria-live="polite">Checking…</dd></div>
  `;

  const quotaEl = facts.querySelector('#mp-storage-quota');
  const persistEl = facts.querySelector('#mp-storage-persist');

  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    navigator.storage.estimate().then((est) => {
      const used = est.usage != null ? formatBytes(est.usage) : 'Unknown';
      const quota = est.quota != null ? formatBytes(est.quota) : 'Unknown';
      if (quotaEl) quotaEl.textContent = `${used} of ${quota}`;
    }).catch(() => {
      if (quotaEl) quotaEl.textContent = 'Could not read';
    });
  } else if (quotaEl) {
    quotaEl.textContent = 'Not reported by browser';
  }

  if (typeof navigator !== 'undefined' && navigator.storage?.persisted) {
    navigator.storage.persisted().then((yes) => {
      if (persistEl) persistEl.textContent = yes ? 'Protected from eviction' : 'May be cleared under pressure';
    }).catch(() => {
      if (persistEl) persistEl.textContent = 'Unknown';
    });
  } else if (persistEl) {
    persistEl.textContent = 'Not reported by browser';
  }

  import('./attachments.js').then(({ ensurePersistentStorage }) => ensurePersistentStorage()).catch(() => {});
}

function formatBytes(n) {
  if (!Number.isFinite(n)) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function ensureDialogRoot() {
  if (dialogRoot) return dialogRoot;
  dialogRoot = document.createElement('div');
  dialogRoot.id = 'mp-dialog-root';
  document.body.appendChild(dialogRoot);
  return dialogRoot;
}

function closeDialog() {
  if (dialogRoot) dialogRoot.innerHTML = '';
}

function openConfirm(title, body, confirmLabel, onConfirm, { danger = false } = {}) {
  ensureDialogRoot();
  dialogRoot.innerHTML = '';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const dialog = document.createElement('div');
  dialog.className = 'modal-dialog modal-confirm';
  const heading = document.createElement('h3');
  heading.className = 'modal-title';
  heading.textContent = title;
  dialog.appendChild(heading);
  if (body) {
    const para = document.createElement('p');
    para.className = 'modal-body';
    para.textContent = body;
    dialog.appendChild(para);
  }
  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn sm';
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = closeDialog;
  const confirmBtn = document.createElement('button');
  confirmBtn.className = danger ? 'btn modal-danger' : 'btn primary';
  confirmBtn.type = 'button';
  confirmBtn.textContent = confirmLabel;
  confirmBtn.onclick = () => { closeDialog(); onConfirm(); };
  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDialog(); });
  dialogRoot.appendChild(overlay);
}

function getUnattachedWorkbookCount() {
  return listWorkbooks().filter((wb) => !collectAttachedWorkbookIds().has(wb.id)).length;
}

function paintLibraryCleanup() {
  const root = host?.querySelector('#mp-cleanup-root');
  if (!root) return;

  root.innerHTML = `
    <h4 class="mp-subtitle">Library cleanup</h4>
    <div class="mp-cleanup-row">
      <p class="mp-cleanup-count" id="mp-cleanup-wb-count"></p>
      <button type="button" class="btn sm" id="mp-cleanup-wb-btn">Delete unattached workbooks</button>
    </div>
    <div class="mp-cleanup-row">
      <p class="mp-cleanup-count" id="mp-cleanup-ex-count"></p>
      <button type="button" class="btn sm" id="mp-cleanup-ex-btn">Delete unfiled exercises</button>
    </div>
    <div id="mp-cleanup-status" class="mp-cleanup-status" aria-live="polite"></div>
  `;

  const wbCountEl = root.querySelector('#mp-cleanup-wb-count');
  const exCountEl = root.querySelector('#mp-cleanup-ex-count');
  const wbBtn = root.querySelector('#mp-cleanup-wb-btn');
  const exBtn = root.querySelector('#mp-cleanup-ex-btn');
  const statusEl = root.querySelector('#mp-cleanup-status');

  function refreshCounts() {
    const unattached = getUnattachedWorkbookCount();
    const unfiled = getExercisesWithoutFolder().length;
    if (wbCountEl) {
      wbCountEl.textContent = unattached === 1
        ? '1 workbook is not attached to any routine session.'
        : `${unattached} workbooks are not attached to any routine session.`;
    }
    if (exCountEl) {
      exCountEl.textContent = unfiled === 1
        ? '1 exercise is in No folder.'
        : `${unfiled} exercises are in No folder.`;
    }
    if (wbBtn) wbBtn.disabled = unattached === 0;
    if (exBtn) exBtn.disabled = unfiled === 0;
  }

  refreshCounts();

  if (wbBtn) {
    wbBtn.onclick = () => {
      const n = getUnattachedWorkbookCount();
      if (!n) return;
      openConfirm(
        'Delete unattached workbooks?',
        'These workbooks are not used by any routine session.',
        `Delete ${n} workbook${n === 1 ? '' : 's'}`,
        () => {
          const deleted = deleteWorkbooksNotAttached(collectAttachedWorkbookIds());
          statusEl.textContent = deleted === 1 ? 'Deleted 1 workbook.' : `Deleted ${deleted} workbooks.`;
          refreshCounts();
        },
        { danger: true },
      );
    };
  }

  if (exBtn) {
    exBtn.onclick = () => {
      const n = getExercisesWithoutFolder().length;
      if (!n) return;
      openConfirm(
        'Delete unfiled exercises?',
        'Exercises in "No folder" will be permanently removed.',
        `Delete ${n} exercise${n === 1 ? '' : 's'}`,
        async () => {
          const deleted = await deleteExercisesWithoutFolder();
          pruneMissingExercisesAll(getExercises().map((e) => e.id));
          statusEl.textContent = deleted === 1 ? 'Deleted 1 exercise.' : `Deleted ${deleted} exercises.`;
          refreshCounts();
        },
        { danger: true },
      );
    };
  }
}

function paintFeatures() {
  const root = host?.querySelector('#mp-features');
  if (!root) return;
  root.innerHTML = '';
  const stored = getEnabledFeatureIdsRaw();
  const enabledSet = stored === undefined ? new Set(TOOLS.map((t) => t.id)) : new Set(stored);

  CATEGORIES.forEach((cat) => {
    const tools = toolsInCategory(cat.id).filter((t) => !NAV_PROTECTED_FEATURES.has(t.id));
    if (!tools.length) return;
    const block = document.createElement('div');
    block.className = 'mp-feature-group';
    block.innerHTML = `<div class="mp-genre-group-label">${escapeHtml(cat.label)}</div>`;
    const list = document.createElement('div');
    list.className = 'mp-feature-list';
    tools.forEach((tool) => {
      const locked = tool.id === 'musicprefs';
      const on = locked || enabledSet.has(tool.id);
      const row = document.createElement('label');
      row.className = `mp-feature-row${on ? ' on' : ''}${locked ? ' locked' : ''}`;
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

  root.querySelectorAll('.mp-feature-check').forEach((input) => {
    if (input.disabled) return;
    input.onchange = () => {
      setFeatureEnabled(input.dataset.tool, input.checked);
      notifyFeaturesChanged();
      paintFeatures();
    };
  });
}

function paintGenres(profile) {
  const root = host?.querySelector('#mp-genre-groups');
  if (!root) return;
  root.innerHTML = '';
  groupGenres().forEach((genres, groupName) => {
    const block = document.createElement('div');
    block.className = 'mp-genre-group';
    block.innerHTML = `<div class="mp-genre-group-label">${escapeHtml(groupName)}</div>`;
    const list = document.createElement('div');
    list.className = 'mp-genre-list';
    genres.forEach((g) => {
      const pri = genrePriority(profile, g.id);
      const row = document.createElement('div');
      row.className = `mp-genre-row${pri && pri !== 'inactive' ? ' active' : ''}`;
      row.innerHTML = `
        <div class="mp-genre-meta">
          <div class="mp-genre-name">${escapeHtml(g.label)}</div>
          <div class="mp-genre-blurb">${escapeHtml(g.blurb)}</div>
        </div>
        <label class="mp-select-wrap">
          <span class="sr-only">Priority for ${escapeHtml(g.label)}</span>
          <select data-genre="${g.id}" class="mp-priority-select study-setup-select">
            <option value="">Not selected</option>
            ${GENRE_PRIORITIES.map((p) =>
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

  root.querySelectorAll('.mp-priority-select').forEach((sel) => {
    sel.onchange = () => {
      const id = sel.dataset.genre;
      if (!sel.value) removeGenre(id);
      else setGenrePriority(id, sel.value);
      paintGenres(getMusicProfile());
      paintSimpleProfile();
      notifyProfileChanged();
    };
  });
}

function notifyFeaturesChanged() {
  try {
    window.dispatchEvent(new CustomEvent('musi:features-changed'));
  } catch (_) { /* ignore */ }
}

function notifyProfileChanged() {
  try {
    window.dispatchEvent(new CustomEvent('musi:profile-changed'));
  } catch (_) { /* ignore */ }
}

export function initGlobalVolume() {
  const saved = Number(getSetting('global.volume', getMasterVolume()));
  const initial = Number.isNaN(saved) ? getMasterVolume() : saved;
  setMasterVolume(initial);
}

export function initMusicPreferences() {
  host = document.getElementById('music-prefs-root');
  if (!host) return;
  render();
}

export function refreshMusicPreferences() {
  if (host) render();
}
