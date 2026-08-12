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
import { loadCloudConfig, isCloudEnabled } from './cloud/cloudConfig.js';
import { collectAttachedWorkbookIds } from './routineModel.js';
import { listWorkbooks, deleteWorkbooksNotAttached, pruneMissingExercisesAll } from './workbookModel.js';
import { getExercises, getExercisesWithoutFolder, deleteExercisesWithoutFolder } from './exercises.js';

const CONTEXT_SOURCE = 'music-prefs';
const MODE_ITEMS = ITERATION_MODES.map(m => ({ val: m, label: getIterationModeLabel(m) }));

let showSectionFn = null;
let host = null;
let contextUnsub = null;
let dialogRoot = null;

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

    <section class="mp-block" id="mp-sync-block">
      <h3 class="mp-block-title">Device sync</h3>
      <p class="mp-block-help">Move your library to another phone or PC. This works without an account.</p>

      <details class="sync-advanced" id="mp-sync-advanced">
        <summary class="sync-advanced-summary">Advanced options</summary>
        <div class="sync-scopes-label">What to include</div>
        <div class="sync-scope-list" id="mp-sync-scopes"></div>
      </details>

      <div class="sync-method sync-method-library">
        <div class="sync-estimate" id="mp-sync-bundle-estimate" aria-live="polite">Calculating…</div>
        <p class="sync-hint sync-hint-compact">Quick Share, a USB cable, or Drive moves the file between Android and Windows.</p>
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
    </section>

    <section class="mp-block" id="mp-cloud-block" hidden>
      <h3 class="mp-block-title">Cloud account</h3>
      <p class="mp-block-help">Sign in to keep your library the same on every device. An account is optional.</p>
      <div id="mp-cloud-root"></div>
    </section>

    <section class="mp-block" id="mp-library-cleanup">
      <h3 class="mp-block-title">Library cleanup</h3>
      <p class="mp-block-help">Quickly remove workbooks and exercises you are not organizing.</p>
      <div id="mp-cleanup-root"></div>
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
  paintDeviceSync();
  paintCloudSync();
  paintLibraryCleanup();
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
    const {
      DEFAULT_BEAM_FPS,
      formatPayloadBeamEstimate,
      evaluateQrBeamGate,
    } = await import('./sync/syncUI.js');
    const snapshot = buildSnapshot({ scopes });
    const bytes = await encodePayload(snapshot);
    if (gen !== syncEstimateGen) return;

    if (payloadEl) {
      const est = estimateTransfer(bytes.length, { fps: DEFAULT_BEAM_FPS });
      payloadEl.textContent = formatPayloadBeamEstimate(bytes.length, est, { prefixAbout: true });
    }

    const gate = evaluateQrBeamGate({
      scopes,
      bundleEstimate,
      payloadByteLength: bytes.length,
    });

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

let cloudUiUnmount = null;

async function paintCloudSync() {
  const block = host?.querySelector('#mp-cloud-block');
  if (!block) return;

  if (cloudUiUnmount) {
    cloudUiUnmount();
    cloudUiUnmount = null;
  }

  await loadCloudConfig();
  if (!isCloudEnabled()) {
    block.hidden = true;
    return;
  }

  block.hidden = false;
  const root = block.querySelector('#mp-cloud-root');
  if (!root) return;

  try {
    const cloudUI = await import('./cloud/cloudUI.js');
    await cloudUI.mountCloudUI(root);
    cloudUiUnmount = cloudUI.unmountCloudUI;
  } catch (_) {
    block.hidden = true;
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
      const boxes = scopeRoot.querySelectorAll('[data-sync-scope]');
      const ids = [];
      boxes.forEach((box) => {
        if (box.checked) ids.push(box.dataset.syncScope);
      });
      return ids.length ? ids : [...allIds];
    };

    const scopesForEstimate = () => effectiveSyncScopes(readScopes, allIds);

    scopeRoot.querySelectorAll('[data-sync-scope]').forEach((box) => {
      box.onchange = () => {
        const ids = readScopes();
        saveSetting('sync.scopes', ids);
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
        const scopes = scopesForEstimate();
        const { openBeamDialog } = await import('./sync/syncUI.js');
        await openBeamDialog({ scopes, trigger: beamBtn });
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
  const attached = collectAttachedWorkbookIds();
  return listWorkbooks().filter((wb) => !attached.has(wb.id)).length;
}

function paintLibraryCleanup() {
  const root = host?.querySelector('#mp-cleanup-root');
  if (!root) return;

  root.innerHTML = `
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

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg || '';
  }

  refreshCounts();

  if (wbBtn) {
    wbBtn.onclick = () => {
      const n = getUnattachedWorkbookCount();
      if (!n) return;
      openConfirm(
        'Delete unattached workbooks?',
        'These workbooks are not used by any routine session. Workbooks attached to a session are kept.',
        `Delete ${n} workbook${n === 1 ? '' : 's'}`,
        () => {
          const deleted = deleteWorkbooksNotAttached(collectAttachedWorkbookIds());
          setStatus(deleted === 1 ? 'Deleted 1 workbook.' : `Deleted ${deleted} workbooks.`);
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
        'Exercises in "No folder" will be permanently removed, including their files on this device.',
        `Delete ${n} exercise${n === 1 ? '' : 's'}`,
        async () => {
          const deleted = await deleteExercisesWithoutFolder();
          pruneMissingExercisesAll(getExercises().map((e) => e.id));
          setStatus(deleted === 1 ? 'Deleted 1 exercise.' : `Deleted ${deleted} exercises.`);
          refreshCounts();
        },
        { danger: true },
      );
    };
  }
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
