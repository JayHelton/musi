// Settings screen — musical context, volume, device sync, and cloud sync.

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
import {
  getMasterVolume,
  setMasterVolume,
  MAX_MASTER_VOLUME,
  DEFAULT_MASTER_VOLUME,
} from './audio.js';
import { getSetting, saveSetting } from './persistence.js';
import {
  SCORE_VOICES,
  DRUM_VOICES,
  PITCH_VOICES,
  METRO_VOICES,
  getScoreVoice,
  setScoreVoice,
  getDrumVoice,
  setDrumVoice,
  getPitchVoice,
  setPitchVoice,
  getMetroVoice,
  setMetroVoice,
  userVoiceId,
  voiceUserSoundId,
} from './audio/soundPrefs.js';
import {
  listUserSounds,
  listInstrumentPacks,
  addMetronomeSound,
  addInstrumentPack,
  removeUserSound,
  userSoundsSupported,
  registerUserPacks,
  PACK_FILE_ACCEPT,
} from './audio/userSounds.js';
import { resetPitchVoice } from './audio/pitchVoice.js';
import { audioCtx, ensureAudio, getAnalyserDestination } from './audio.js';
import {
  CLICK_TONE,
  STANDALONE_CLICK_GAIN,
  scheduleClickSound,
  prepareClickVoice,
  forgetClickVoice,
} from './audio/clickSynth.js';
import { showAppToast } from './appToast.js';
import { loadCloudConfig, isCloudEnabled } from './cloud/cloudConfig.js';
import { pruneMissingExercisesAll } from './workbookModel.js';
import { getExercises, getExercisesWithoutFolder, deleteExercisesWithoutFolder } from './exercises.js';

const CONTEXT_SOURCE = 'music-prefs';
const MODE_ITEMS = ITERATION_MODES.map(m => ({ val: m, label: getIterationModeLabel(m) }));

let showSectionFn = null;
let host = null;
let contextUnsub = null;
let dialogRoot = null;

function render() {
  if (!host) return;
  if (contextUnsub) {
    contextUnsub();
    contextUnsub = null;
  }
  host.innerHTML = `
    <div class="section-head">
      <button type="button" class="tool-back">← Back</button>
      <h2>Settings</h2>
      <p>Set the musical context, the volume, and how this device syncs.</p>
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
      <p class="mp-block-help">Global audio level for trainers, playback, and synth. Levels above 100% add loudness. A limiter keeps the output safe.</p>
      <div class="mp-volume-row">
        <input id="mp-volume-slider" type="range" min="0" max="${Math.round(MAX_MASTER_VOLUME * 100)}" step="1" value="100" aria-label="Global volume">
        <span id="mp-volume-value" class="mp-volume-value">100%</span>
      </div>
    </section>

    <section class="mp-block" id="mp-sound-block">
      <h3 class="mp-block-title">Sounds</h3>
      <p class="mp-block-help">Pick the voice the score player and the metronome use. You can also install your own sounds on this device.</p>
      <div id="mp-sound-root"></div>
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
  `;

  paintMusicalContext();
  paintVolume();
  paintSounds();
  paintDeviceSync();
  paintCloudSync();
  paintLibraryCleanup();
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

function paintLibraryCleanup() {
  const root = host?.querySelector('#mp-cleanup-root');
  if (!root) return;

  root.innerHTML = `
    <div class="mp-cleanup-row">
      <p class="mp-cleanup-count" id="mp-cleanup-ex-count"></p>
      <button type="button" class="btn sm" id="mp-cleanup-ex-btn">Delete unfiled exercises</button>
    </div>
    <div id="mp-cleanup-status" class="mp-cleanup-status" aria-live="polite"></div>
  `;

  const exCountEl = root.querySelector('#mp-cleanup-ex-count');
  const exBtn = root.querySelector('#mp-cleanup-ex-btn');
  const statusEl = root.querySelector('#mp-cleanup-status');

  function refreshCounts() {
    const unfiled = getExercisesWithoutFolder().length;
    if (exCountEl) {
      exCountEl.textContent = unfiled === 1
        ? '1 exercise is in No folder.'
        : `${unfiled} exercises are in No folder.`;
    }
    if (exBtn) exBtn.disabled = unfiled === 0;
  }

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg || '';
  }

  refreshCounts();

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
  slider.max = String(Math.round(MAX_MASTER_VOLUME * 100));
  slider.value = String(Math.round(getMasterVolume() * 100));
  if (valueLabel) valueLabel.textContent = Math.round(getMasterVolume() * 100) + '%';

  slider.oninput = (e) => {
    const vol = Number(e.target.value) / 100;
    setMasterVolume(vol);
    saveSetting('global.volume', getMasterVolume());
    if (valueLabel) valueLabel.textContent = Math.round(getMasterVolume() * 100) + '%';
  };
}

/* ── Sounds ─────────────────────────────────────────────────── */

/** Play two clicks so the user hears the metronome voice they picked. */
function previewMetronomeVoice() {
  try {
    ensureAudio();
    if (!audioCtx) return;
    const dest = getAnalyserDestination();
    const at = audioCtx.currentTime + 0.06;
    scheduleClickSound(audioCtx, dest, at, {
      tone: CLICK_TONE.accent,
      peak: STANDALONE_CLICK_GAIN.accent,
      decay: 0.042,
    });
    scheduleClickSound(audioCtx, dest, at + 0.28, {
      tone: CLICK_TONE.beat,
      peak: STANDALONE_CLICK_GAIN.beat,
      decay: 0.036,
    });
  } catch (e) {
    /* a preview is optional */
  }
}

function voiceOptionsHtml(presets, sounds, current) {
  const rows = presets.map((v) => (
    `<option value="${escapeHtml(v.id)}"${v.id === current ? ' selected' : ''}>${escapeHtml(v.label)}</option>`
  ));
  if (sounds.length) {
    const own = sounds.map((snd) => {
      const id = userVoiceId(snd.id);
      return `<option value="${escapeHtml(id)}"${id === current ? ' selected' : ''}>${escapeHtml(snd.name)}</option>`;
    });
    rows.push(`<optgroup label="Installed">${own.join('')}</optgroup>`);
  }
  return rows.join('');
}

const PACK_KIND_LABELS = { percussion: 'Kit', pitched: 'Instrument' };

function soundListHtml(sounds, emptyText, { showKind = false } = {}) {
  if (!sounds.length) return `<p class="mp-sound-empty">${escapeHtml(emptyText)}</p>`;
  const rows = sounds.map((snd) => {
    const kind = showKind ? PACK_KIND_LABELS[snd.packKind] || 'Instrument' : '';
    const tag = kind ? `<span class="mp-sound-tag">${escapeHtml(kind)}</span>` : '';
    return `
    <li class="mp-sound-row">
      <span class="mp-sound-name">${escapeHtml(snd.name)}</span>
      ${tag}
      <button type="button" class="btn sm mp-sound-remove" data-sound-id="${escapeHtml(snd.id)}">Remove</button>
    </li>
  `;
  });
  return `<ul class="mp-sound-list">${rows.join('')}</ul>`;
}

function voiceHelpText(presets, current, fallback) {
  const preset = presets.find((v) => v.id === current);
  return preset?.help || fallback;
}

/** Wire one voice picker: paint the help line and save every choice. */
function wireVoiceField(root, {
  selectId, helpId, presets, get, set, fallbackHelp, onChange,
}) {
  const select = root.querySelector(`#${selectId}`);
  const help = root.querySelector(`#${helpId}`);
  if (!select) return;
  const syncHelp = () => {
    if (help) help.textContent = voiceHelpText(presets, get(), fallbackHelp);
  };
  select.onchange = () => {
    set(select.value);
    syncHelp();
    if (typeof onChange === 'function') onChange(get());
  };
  syncHelp();
}

/**
 * Put a surface back on its default when its voice names a sound the list no
 * longer offers. A pack the user removed, and a kit on a pitched surface, both
 * land here.
 */
function pruneMissingVoice(get, set, sounds, fallback) {
  const soundId = voiceUserSoundId(get());
  if (!soundId) return;
  if (sounds.some((snd) => snd.id === soundId)) return;
  set(fallback);
}

function paintSounds() {
  const root = host?.querySelector('#mp-sound-root');
  if (!root) return;

  registerUserPacks();
  const instruments = listInstrumentPacks('pitched');
  const kits = listInstrumentPacks('percussion');
  const packs = listUserSounds('instrument');
  const clicks = listUserSounds('metronome');
  const canInstall = userSoundsSupported();

  pruneMissingVoice(getScoreVoice, setScoreVoice, instruments, 'packs');
  pruneMissingVoice(getDrumVoice, setDrumVoice, kits, 'packs');
  pruneMissingVoice(getPitchVoice, setPitchVoice, instruments, 'tone');
  pruneMissingVoice(getMetroVoice, setMetroVoice, clicks, 'woodblock');

  root.innerHTML = `
    <div class="mp-sound-field">
      <label class="mp-sound-label" for="mp-score-voice">Score player — pitched tracks</label>
      <select id="mp-score-voice" class="mp-sound-select">
        ${voiceOptionsHtml(SCORE_VOICES, instruments, getScoreVoice())}
      </select>
      <p class="mp-sound-help" id="mp-score-voice-help"></p>
    </div>

    <div class="mp-sound-field">
      <label class="mp-sound-label" for="mp-drum-voice">Score player — percussion tracks</label>
      <select id="mp-drum-voice" class="mp-sound-select">
        ${voiceOptionsHtml(DRUM_VOICES, kits, getDrumVoice())}
      </select>
      <p class="mp-sound-help" id="mp-drum-voice-help"></p>
    </div>

    <div class="mp-sound-field">
      <label class="mp-sound-label" for="mp-pitch-voice">Pitch training</label>
      <select id="mp-pitch-voice" class="mp-sound-select">
        ${voiceOptionsHtml(PITCH_VOICES, instruments, getPitchVoice())}
      </select>
      <p class="mp-sound-help" id="mp-pitch-voice-help"></p>
    </div>

    <div class="mp-sound-field">
      <label class="mp-sound-label" for="mp-metro-voice">Metronome</label>
      <div class="mp-sound-row-inline">
        <select id="mp-metro-voice" class="mp-sound-select">
          ${voiceOptionsHtml(METRO_VOICES, clicks, getMetroVoice())}
        </select>
        <button type="button" class="btn sm" id="mp-metro-preview">Play</button>
      </div>
      <p class="mp-sound-help" id="mp-metro-voice-help"></p>
    </div>

    <details class="adv-options mp-sound-install">
      <summary><span class="adv-gear">⚙</span> Your own sounds</summary>
      <div class="mp-sound-install-body">
        <div class="mp-sound-group">
          <div class="mp-sound-group-title">Instrument packs</div>
          <p class="mp-sound-help">Add a ZIP with a <code>manifest.json</code>, a <code>.multisample</code> file, or a ZIP with an <code>.sfz</code> file and its audio files. See <code>assets/audio/packs/README.md</code> for the formats.</p>
          <label class="mp-sound-label" for="mp-pack-kind">This pack is</label>
          <select id="mp-pack-kind" class="mp-sound-select">
            <option value="auto" selected>Read the file</option>
            <option value="pitched">An instrument</option>
            <option value="percussion">A drum kit</option>
          </select>
          <p class="mp-sound-help">An instrument plays the pitched tracks and the pitch tools. A kit plays the percussion tracks.</p>
          ${soundListHtml(packs, 'No packs installed.', { showKind: true })}
          <button type="button" class="btn sm" id="mp-add-pack"${canInstall ? '' : ' disabled'}>Add a pack…</button>
          <input type="file" id="mp-add-pack-input" accept="${PACK_FILE_ACCEPT}" hidden>
        </div>
        <div class="mp-sound-group">
          <div class="mp-sound-group-title">Metronome sounds</div>
          <p class="mp-sound-help">One audio file per sound. The accent plays the same file a little higher and louder.</p>
          ${soundListHtml(clicks, 'No sounds installed.')}
          <button type="button" class="btn sm" id="mp-add-click"${canInstall ? '' : ' disabled'}>Add a sound…</button>
          <input type="file" id="mp-add-click-input" accept="audio/*,.wav,.mp3,.ogg,.m4a" hidden>
        </div>
        ${canInstall ? '' : '<p class="mp-sound-help">This browser has no file storage, so sounds cannot be installed here.</p>'}
      </div>
    </details>
  `;

  wireVoiceField(root, {
    selectId: 'mp-score-voice',
    helpId: 'mp-score-voice-help',
    presets: SCORE_VOICES,
    get: getScoreVoice,
    set: setScoreVoice,
    fallbackHelp: 'Plays the samples of the pack you installed. A new choice takes effect on the next score you open.',
    onChange: () => showAppToast('Score player sound saved. Reopen the score to hear it.'),
  });

  wireVoiceField(root, {
    selectId: 'mp-drum-voice',
    helpId: 'mp-drum-voice-help',
    presets: DRUM_VOICES,
    get: getDrumVoice,
    set: setDrumVoice,
    fallbackHelp: 'Plays the kit you installed. A new choice takes effect on the next score you open.',
    onChange: () => showAppToast('Percussion sound saved. Reopen the score to hear it.'),
  });

  wireVoiceField(root, {
    selectId: 'mp-pitch-voice',
    helpId: 'mp-pitch-voice-help',
    presets: PITCH_VOICES,
    get: getPitchVoice,
    set: setPitchVoice,
    fallbackHelp: 'Plays the samples of the pack you installed in the tuner, the pitch trainer, the runner, and the ear trainer.',
    onChange: () => {
      // The tools hold the samples of the voice that went. Drop them, so the
      // next note loads the new voice.
      resetPitchVoice();
      showAppToast('Pitch training sound saved.');
    },
  });

  wireVoiceField(root, {
    selectId: 'mp-metro-voice',
    helpId: 'mp-metro-voice-help',
    presets: METRO_VOICES,
    get: getMetroVoice,
    set: setMetroVoice,
    fallbackHelp: 'Plays the sound you installed.',
    onChange: () => {
      if (audioCtx) void prepareClickVoice(audioCtx).then(() => previewMetronomeVoice());
      else previewMetronomeVoice();
    },
  });

  root.querySelector('#mp-metro-preview').onclick = () => {
    if (audioCtx) void prepareClickVoice(audioCtx).then(() => previewMetronomeVoice());
    else previewMetronomeVoice();
  };

  wireSoundInstall(root, {
    buttonId: 'mp-add-pack',
    inputId: 'mp-add-pack-input',
    install: (file) => {
      const choice = root.querySelector('#mp-pack-kind')?.value || 'auto';
      const kind = choice === 'auto' ? undefined : choice;
      return addInstrumentPack(file, { kind });
    },
    okText: 'Pack installed.',
  });
  wireSoundInstall(root, {
    buttonId: 'mp-add-click',
    inputId: 'mp-add-click-input',
    install: (file) => addMetronomeSound(file),
    okText: 'Sound installed.',
  });

  root.querySelectorAll('.mp-sound-remove').forEach((btn) => {
    btn.onclick = async () => {
      btn.disabled = true;
      const id = btn.dataset.soundId;
      const result = await removeUserSound(id);
      forgetClickVoice(id);
      // The pitch tools hold the samples of the sound that went.
      resetPitchVoice();
      if (!result.ok) showAppToast(result.error);
      // The repaint puts every surface that named this sound back on its
      // default.
      paintSounds();
    };
  });
}

function wireSoundInstall(root, { buttonId, inputId, install, okText }) {
  const button = root.querySelector(`#${buttonId}`);
  const input = root.querySelector(`#${inputId}`);
  if (!button || !input) return;
  button.onclick = () => input.click();
  input.onchange = async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    button.disabled = true;
    try {
      const result = await install(file);
      if (!result.ok) {
        showAppToast(result.error);
        return;
      }
      showAppToast(okText);
      paintSounds();
    } catch (err) {
      showAppToast(err?.message || 'That file could not be installed.');
    } finally {
      button.disabled = false;
    }
  };
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const LOUDNESS_BOOST_KEY = 'audio.loudnessBoost.v1';

/**
 * Read the saved level and apply it to the master bus.
 * Musi was too quiet, so it raises a saved level below the new default one
 * time. The flag stops the raise from undoing a later choice by the user.
 */
export function initGlobalVolume() {
  const saved = Number(getSetting('global.volume', DEFAULT_MASTER_VOLUME));
  let initial = Number.isNaN(saved) ? DEFAULT_MASTER_VOLUME : saved;

  if (getSetting(LOUDNESS_BOOST_KEY, false) !== true) {
    if (initial < DEFAULT_MASTER_VOLUME) initial = DEFAULT_MASTER_VOLUME;
    saveSetting(LOUDNESS_BOOST_KEY, true);
    saveSetting('global.volume', initial);
  }

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
