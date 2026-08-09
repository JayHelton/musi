/**
 * Device sync UI — library bundle export/import, JSON/QR transfer, shared dialogs.
 */

import {
  SYNC_SCOPES,
  buildSnapshot,
  validateSnapshot,
  summarizeSnapshot,
  applySnapshot,
  parseSnapshotJson,
} from './syncProfile.js';
import { encodePayload, decodePayload, buildFrames, createFrameCollector, estimateTransfer } from './frames.js';
import { encodeQrMatrix, drawQrToCanvas } from '../qr/qrEncode.js';
import { startScanner, listVideoInputs } from './camera.js';
import { escapeHtml } from '../uxPrimitives.js';

const BEAM_SPEEDS = [
  { fps: 2, label: 'Slow (2 fps)' },
  { fps: 3, label: '3 fps' },
  { fps: 5, label: 'Normal (5 fps)' },
  { fps: 7, label: '7 fps' },
  { fps: 10, label: 'Fast (10 fps)' },
];

const DEFAULT_BEAM_FPS = 5;

/** Beam via QR is disabled when estimated transfer exceeds this many seconds. */
export const QR_BEAM_MAX_SECONDS = 180;

/** Show a QR impractical warning from this many seconds upward. */
const QR_BEAM_WARN_SECONDS = 60;

/** Auto-reload delay after a clean import (milliseconds). */
const AUTO_RELOAD_MS = 2000;

/** ZIP local file header signature (PK\x03\x04). */
const ZIP_LOCAL_HEADER = [0x50, 0x4b, 0x03, 0x04];

/** Shared default beam FPS for settings estimate and beam dialog speed control. */
export { DEFAULT_BEAM_FPS };

function formatFrameCount(frames) {
  const n = Number(frames);
  if (!Number.isFinite(n) || n < 0) return '0 QR frames';
  return n === 1 ? '1 QR frame' : `${n} QR frames`;
}

function formatBeamDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 1) return 'under a second';
  const totalSec = Math.round(seconds);
  if (totalSec < 60) {
    return totalSec === 1 ? 'roughly 1 second' : `roughly ${totalSec} seconds`;
  }
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const minPart = mins === 1 ? '1 min' : `${mins} min`;
  if (secs === 0) return `roughly ${minPart}`;
  const secPart = secs === 1 ? '1 sec' : `${secs} sec`;
  return `roughly ${minPart} ${secPart}`;
}

/**
 * Human-readable payload + QR transfer estimate (settings block and beam dialog).
 */
export function formatPayloadBeamEstimate(byteLength, { frames, seconds }, { prefixAbout = true } = {}) {
  const size = formatBytes(byteLength);
  const frameStr = formatFrameCount(frames);
  const durStr = formatBeamDuration(seconds);
  const core = `${size} — ${frameStr}, ${durStr} to beam`;
  return prefixAbout ? `About ${core}` : core;
}

/**
 * Human-readable bundle preflight line for the settings block.
 */
export function formatBundleEstimateText(estimate, scopes = []) {
  if (!estimate) return 'Could not estimate library size.';
  const parts = [];
  const fileCount = Number(estimate.fileCount) || 0;
  const patternCount = Number(estimate.patternCount) || 0;
  const snapshotBytes = Number(estimate.snapshotBytes) || 0;
  const totalBytes = Number(estimate.totalBytes) || 0;
  const fileBytes = Math.max(0, totalBytes - snapshotBytes);
  if (fileCount > 0) {
    const fileLabel = fileCount === 1 ? '1 exercise file' : `${fileCount} exercise files`;
    parts.push(`${fileLabel}, ${formatBytes(fileBytes)}`);
  }
  const scopeBits = [];
  if (patternCount > 0) {
    scopeBits.push(patternCount === 1 ? '1 drum pattern' : `${patternCount} drum patterns`);
  }
  if (scopes.includes('settings')) scopeBits.push('settings');
  if (scopes.includes('progress')) scopeBits.push('progress');
  if (scopeBits.length) {
    parts.push(parts.length ? `plus ${scopeBits.join(', ')}` : scopeBits.join(', '));
  }
  let text = parts.length ? parts.join(' — ') : 'Nothing selected to export';
  const missing = Array.isArray(estimate.missing) ? estimate.missing : [];
  if (missing.length > 0) {
    const n = missing.length;
    text += `. Warning: ${n} referenced file${n === 1 ? '' : 's'} missing on this device and will not be included.`;
  }
  return text;
}

/**
 * Decide whether Beam via QR should be allowed and what warning to show.
 */
export function evaluateQrBeamGate({ scopes = [], bundleEstimate = null, payloadByteLength = 0 } = {}) {
  const scopeList = Array.isArray(scopes) ? scopes : [];
  const fileCount = Number(bundleEstimate?.fileCount) || 0;
  const hasContentFiles = scopeList.includes('content') && fileCount > 0;
  const est = estimateTransfer(payloadByteLength, { fps: DEFAULT_BEAM_FPS });
  const warnings = [];

  if (hasContentFiles) {
    const fileLabel = fileCount === 1 ? '1 exercise file' : `${fileCount} exercise files`;
    warnings.push(
      `QR cannot transfer exercise files (${fileLabel} in your library). Use Export library for the full bundle.`,
    );
  }

  if (payloadByteLength > 0 && est.seconds >= QR_BEAM_WARN_SECONDS) {
    warnings.push(
      `Beaming the settings snapshot would take ${formatBeamDuration(est.seconds)} (${formatFrameCount(est.frames)}).`,
    );
  }

  const disableBeam = hasContentFiles || est.seconds >= QR_BEAM_MAX_SECONDS;
  let tooltip = '';
  if (disableBeam) {
    if (hasContentFiles) {
      tooltip = 'QR cannot carry exercise files. Use Export library instead.';
    } else {
      tooltip = `Estimated transfer exceeds ${formatBeamDuration(QR_BEAM_MAX_SECONDS)}. Use Export settings file or Export library instead.`;
    }
  }

  return {
    allowBeam: !disableBeam,
    warningText: warnings.join(' '),
    tooltip,
    estimate: est,
  };
}

let dialogRoot = null;
let focusReturn = null;
const cleanups = [];

function ensureDialogRoot() {
  if (dialogRoot) return dialogRoot;
  dialogRoot = document.createElement('div');
  dialogRoot.id = 'sync-dialog-root';
  document.body.appendChild(dialogRoot);
  return dialogRoot;
}

function addCleanup(fn) {
  cleanups.push(fn);
}

function closeModal() {
  while (cleanups.length) {
    const fn = cleanups.pop();
    try { fn(); } catch (_) { /* ignore */ }
  }
  if (dialogRoot) dialogRoot.innerHTML = '';
  const ret = focusReturn;
  focusReturn = null;
  if (ret && typeof ret.focus === 'function') {
    try { ret.focus(); } catch (_) { /* ignore */ }
  }
}

export function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso) {
  if (!iso) return 'Unknown';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString();
  } catch (_) {
    return String(iso);
  }
}

function scopeLabels(ids) {
  if (!Array.isArray(ids)) return '';
  return ids
    .map((id) => SYNC_SCOPES.find((s) => s.id === id)?.label || id)
    .join(', ');
}

function mountModal({ trigger, dialogClass = 'sync-dialog', title, bodyNodes = [], actions = [] }) {
  ensureDialogRoot();
  dialogRoot.innerHTML = '';
  focusReturn = trigger || null;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const dialog = document.createElement('div');
  dialog.className = `modal-dialog ${dialogClass}`;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  if (title) {
    const h = document.createElement('h3');
    h.className = 'modal-title';
    h.textContent = title;
    dialog.appendChild(h);
  }
  bodyNodes.forEach((node) => {
    if (node) dialog.appendChild(node);
  });

  if (actions.length) {
    const actionRow = document.createElement('div');
    actionRow.className = 'modal-actions';
    actions.forEach((btn) => actionRow.appendChild(btn));
    dialog.appendChild(actionRow);
  }

  overlay.appendChild(dialog);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  const onKey = (e) => {
    if (e.key === 'Escape') closeModal();
  };
  document.addEventListener('keydown', onKey);
  addCleanup(() => document.removeEventListener('keydown', onKey));

  dialogRoot.appendChild(overlay);

  const focusable = dialog.querySelector('button, input, select, textarea, [tabindex]');
  setTimeout(() => {
    if (focusable) focusable.focus();
    else dialog.focus();
  }, 40);

  const actionRow = dialog.querySelector('.modal-actions');
  return { overlay, dialog, actionRow };
}

function makeBtn(label, { primary = false, sm = true, onClick, disabled = false, title = '' } = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn' + (sm ? ' sm' : '') + (primary ? ' primary' : '');
  btn.textContent = label;
  if (disabled) btn.disabled = true;
  if (title) btn.title = title;
  btn.onclick = onClick;
  return btn;
}

function buildProgressElements() {
  const progressWrap = document.createElement('div');
  progressWrap.className = 'sync-progress-wrap';
  const progressBar = document.createElement('div');
  progressBar.className = 'sync-progress-bar';
  const progressFill = document.createElement('div');
  progressFill.className = 'sync-progress-fill';
  progressBar.appendChild(progressFill);
  const progressReadout = document.createElement('div');
  progressReadout.className = 'sync-progress-readout';
  progressReadout.setAttribute('aria-live', 'polite');
  progressReadout.textContent = 'Starting…';
  progressWrap.appendChild(progressBar);
  progressWrap.appendChild(progressReadout);
  return { progressWrap, progressFill, progressReadout };
}

function buildSnapshotSummaryElement(summary, { extraRows = [] } = {}) {
  const summaryEl = document.createElement('div');
  summaryEl.className = 'sync-summary';
  summaryEl.innerHTML = `
    <div class="sync-summary-row">
      <span class="sync-summary-label">Created</span>
      <span class="sync-summary-value">${escapeHtml(formatDate(summary.createdAt))}</span>
    </div>
    <div class="sync-summary-row">
      <span class="sync-summary-label">Scopes</span>
      <span class="sync-summary-value">${escapeHtml(scopeLabels(summary.scopes))}</span>
    </div>
    <div class="sync-summary-row">
      <span class="sync-summary-label">Size</span>
      <span class="sync-summary-value">${escapeHtml(formatBytes(summary.byteSize))}</span>
    </div>
  `;
  extraRows.forEach(({ label, value }) => {
    const row = document.createElement('div');
    row.className = 'sync-summary-row';
    row.innerHTML = `
      <span class="sync-summary-label">${escapeHtml(label)}</span>
      <span class="sync-summary-value">${escapeHtml(value)}</span>
    `;
    summaryEl.appendChild(row);
  });
  if (summary.items.length) {
    const itemsWrap = document.createElement('div');
    itemsWrap.className = 'sync-summary-items';
    summary.items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'sync-summary-item';
      row.textContent = `${item.label}: ${item.count}`;
      itemsWrap.appendChild(row);
    });
    summaryEl.appendChild(itemsWrap);
  }
  return summaryEl;
}

function buildImportModeChoiceElement() {
  const modeWrap = document.createElement('div');
  modeWrap.className = 'sync-mode-choice';

  const mergeLabel = document.createElement('label');
  mergeLabel.className = 'sync-mode-option';
  const mergeInput = document.createElement('input');
  mergeInput.type = 'radio';
  mergeInput.name = 'sync-import-mode';
  mergeInput.value = 'merge';
  mergeInput.checked = true;
  const mergeMeta = document.createElement('div');
  mergeMeta.className = 'sync-mode-meta';
  mergeMeta.innerHTML = `
    <span class="sync-mode-title">Merge</span>
    <span class="sync-mode-desc">Keep local work and add or update from the snapshot.</span>
  `;
  mergeLabel.appendChild(mergeInput);
  mergeLabel.appendChild(mergeMeta);

  const replaceLabel = document.createElement('label');
  replaceLabel.className = 'sync-mode-option';
  const replaceInput = document.createElement('input');
  replaceInput.type = 'radio';
  replaceInput.name = 'sync-import-mode';
  replaceInput.value = 'replace';
  const replaceMeta = document.createElement('div');
  replaceMeta.className = 'sync-mode-meta';
  replaceMeta.innerHTML = `
    <span class="sync-mode-title">Replace</span>
    <span class="sync-mode-desc">Overwrite the selected areas on this device with the snapshot.</span>
  `;
  replaceLabel.appendChild(replaceInput);
  replaceLabel.appendChild(replaceMeta);

  modeWrap.appendChild(mergeLabel);
  modeWrap.appendChild(replaceLabel);

  return {
    modeWrap,
    getMode: () => (replaceInput.checked ? 'replace' : 'merge'),
    disable: () => {
      mergeInput.disabled = true;
      replaceInput.disabled = true;
    },
  };
}

function renderSnapshotOutcomeHtml(outcome) {
  let html = '<strong>Import complete.</strong>';
  if (outcome.applied?.length) {
    html += `<br>Applied ${outcome.applied.length} data key(s).`;
  }
  if (outcome.skipped?.length) {
    html += `<br>Skipped ${outcome.skipped.length} key(s).`;
  }
  const countParts = Object.entries(outcome.counts || {}).map(([key, c]) => {
    const parts = [];
    if (c.added) parts.push(`${c.added} added`);
    if (c.updated) parts.push(`${c.updated} updated`);
    if (c.conflicts) parts.push(`${c.conflicts} conflicts`);
    if (c.removed) parts.push(`${c.removed} removed`);
    return parts.length ? `${escapeHtml(key)}: ${parts.join(', ')}` : null;
  }).filter(Boolean);
  if (countParts.length) {
    html += '<br>' + countParts.join('<br>');
  }
  if (outcome.errors?.length) {
    html += `<div class="sync-result-errors">${outcome.errors.map((e) => {
      const keyPart = e.key ? `${escapeHtml(e.key)}: ` : '';
      return keyPart + escapeHtml(e.message || 'Error');
    }).join('<br>')}</div>`;
  }
  return html;
}

function renderBundleOutcomeHtml(result) {
  const files = result.files || {};
  const drumPatterns = result.patterns || {};
  let html = '<strong>Library import complete.</strong>';
  const fileParts = [];
  if (files.added) fileParts.push(`${files.added} added`);
  if (files.replaced) fileParts.push(`${files.replaced} replaced`);
  if (files.skipped) fileParts.push(`${files.skipped} skipped`);
  if (files.failed) fileParts.push(`${files.failed} failed`);
  if (fileParts.length) {
    html += `<br>Files: ${fileParts.join(', ')}.`;
  }
  const patternParts = [];
  if (drumPatterns.added) patternParts.push(`${drumPatterns.added} added`);
  if (drumPatterns.replaced) patternParts.push(`${drumPatterns.replaced} replaced`);
  if (drumPatterns.skipped) patternParts.push(`${drumPatterns.skipped} skipped`);
  if (drumPatterns.failed) patternParts.push(`${drumPatterns.failed} failed`);
  if (patternParts.length) {
    html += `<br>Drum patterns: ${patternParts.join(', ')}.`;
  }
  if (result.snapshotOutcome) {
    html += '<br>' + renderSnapshotOutcomeHtml(result.snapshotOutcome).replace('<strong>Import complete.</strong>', 'Snapshot applied.');
  }
  const errors = Array.isArray(result.errors) ? result.errors : [];
  if (errors.length) {
    html += `<div class="sync-result-errors">${errors.map((e) => escapeHtml(e?.message || String(e))).join('<br>')}</div>`;
  }
  return html;
}

function snapshotOutcomeHasErrors(outcome) {
  return Array.isArray(outcome?.errors) && outcome.errors.length > 0;
}

function bundleOutcomeHasErrors(result) {
  if (!result) return true;
  if (Array.isArray(result.errors) && result.errors.length > 0) return true;
  if (snapshotOutcomeHasErrors(result.snapshotOutcome)) return true;
  if (Number(result.files?.failed) > 0) return true;
  if (Number(result.patterns?.failed) > 0) return true;
  return false;
}

function presentImportOutcome({ trigger, title = 'Import complete', html, hasErrors }) {
  const resultEl = document.createElement('div');
  resultEl.className = 'sync-result-block';
  resultEl.innerHTML = html;

  const reloadNote = document.createElement('p');
  reloadNote.className = 'sync-reload-note';
  reloadNote.setAttribute('aria-live', 'polite');

  let reloadTimer = null;
  const clearReloadTimer = () => {
    if (reloadTimer !== null) {
      clearTimeout(reloadTimer);
      reloadTimer = null;
    }
  };

  const actions = [];
  if (hasErrors) {
    reloadNote.textContent = 'Read the errors above, then reload when ready.';
    actions.push(makeBtn('Reload now', { primary: true, onClick: () => window.location.reload() }));
    actions.push(makeBtn('Close', { onClick: closeModal }));
  } else {
    reloadNote.textContent = 'Reloading…';
    reloadTimer = setTimeout(() => window.location.reload(), AUTO_RELOAD_MS);
    addCleanup(clearReloadTimer);
    actions.push(makeBtn('Cancel reload', {
      onClick: () => {
        clearReloadTimer();
        reloadNote.textContent = 'Reload when ready to pick up the new data.';
      },
    }));
    actions.push(makeBtn('Close', {
      onClick: () => {
        clearReloadTimer();
        closeModal();
      },
    }));
  }

  mountModal({
    trigger,
    title,
    bodyNodes: [resultEl, reloadNote],
    actions,
  });
}

function countLocalCollection(key, raw) {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw);
    if (key === 'musi.notes' || key === 'musi.songs') {
      return Array.isArray(parsed) ? parsed.length : 0;
    }
    if (key === 'musi.exercises') {
      return parsed && typeof parsed === 'object' && Array.isArray(parsed.items)
        ? parsed.items.length
        : 0;
    }
    if (key === 'musi.workbooks') {
      return parsed && typeof parsed === 'object' && Array.isArray(parsed.workbooks)
        ? parsed.workbooks.length
        : 0;
    }
    if (key === 'musi.routines') {
      return parsed && typeof parsed === 'object' && Array.isArray(parsed.routines)
        ? parsed.routines.length
        : 0;
    }
  } catch (_) { /* ignore */ }
  return 0;
}

/**
 * True when this device already has data in the incoming scopes that could collide.
 */
export async function hasLocalDataInScopes(scopes) {
  const allIds = SYNC_SCOPES.map((s) => s.id);
  const scopeIds = Array.isArray(scopes) && scopes.length
    ? scopes.filter((id) => allIds.includes(id))
    : allIds;

  if (scopeIds.includes('content')) {
    const contentKeys = ['musi.notes', 'musi.songs', 'musi.exercises', 'musi.workbooks', 'musi.routines'];
    for (const key of contentKeys) {
      try {
        const raw = localStorage.getItem(key);
        if (countLocalCollection(key, raw) > 0) return true;
      } catch (_) { /* ignore */ }
    }
    try {
      const { listAudioMeta } = await import('../attachments.js');
      const meta = await listAudioMeta();
      if (meta?.length > 0) return true;
    } catch (_) { /* ignore */ }
  }

  if (scopeIds.includes('settings')) {
    try {
      const raw = localStorage.getItem('musi:settings');
      if (raw) {
        const s = JSON.parse(raw);
        if (s['profile.music']?.genres?.length > 0) return true;
        if (Array.isArray(s['features.enabled'])) return true;
      }
      if (localStorage.getItem('musi.gpAutoFollow') != null
        || localStorage.getItem('musi.gpParchmentZoom') != null) {
        return true;
      }
    } catch (_) { /* ignore */ }
  }

  if (scopeIds.includes('progress')) {
    try {
      const raw = localStorage.getItem('musi:settings');
      if (raw) {
        const s = JSON.parse(raw);
        if (s.stats && Object.keys(s.stats).length > 0) return true;
        if (s['study.progress'] && Object.keys(s['study.progress']).length > 0) return true;
        if (Array.isArray(s['io.sessionHistory']) && s['io.sessionHistory'].length > 0) return true;
        if (s['io.mastery'] || s['io.masteryV2']) return true;
      }
    } catch (_) { /* ignore */ }
  }

  return false;
}

/**
 * Detect ZIP bundle vs JSON snapshot from file bytes (not extension or MIME).
 */
export async function detectImportFileKind(file) {
  if (!file) return 'unknown';
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (head.length >= 4 && ZIP_LOCAL_HEADER.every((b, i) => head[i] === b)) {
    return 'zip';
  }
  const lead = await file.slice(0, 1).text();
  if (lead === '{' || lead === '[') return 'json';
  return 'unknown';
}

/**
 * Shared import confirmation shell — snapshot JSON and library bundle.
 */
async function openImportConfirmShell({
  trigger,
  title = 'Confirm import',
  sourceLabel,
  summaryEl,
  scopes,
  onConfirm,
  resultRenderer,
  showModeChoice = true,
}) {
  const intro = document.createElement('p');
  intro.className = 'sync-dialog-body';
  intro.textContent = `Ready to import from ${sourceLabel}. Review what will be applied below.`;

  const modeChoice = showModeChoice ? buildImportModeChoiceElement() : null;
  const modeWrap = modeChoice?.modeWrap || null;

  const errorEl = document.createElement('div');
  errorEl.className = 'modal-errors';

  const cancelBtn = makeBtn('Cancel', { onClick: closeModal });
  const confirmBtn = makeBtn('Confirm import', { primary: true });

  confirmBtn.onclick = async () => {
    errorEl.textContent = '';
    const mode = modeChoice ? modeChoice.getMode() : 'merge';
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    try {
      const outcome = await onConfirm(mode);
      if (!outcome) {
        confirmBtn.disabled = false;
        cancelBtn.disabled = false;
        return;
      }
      if (modeChoice) modeChoice.disable();
      closeModal();
      const html = resultRenderer(outcome);
      const hasErrors = resultRenderer === renderBundleOutcomeHtml
        ? bundleOutcomeHasErrors(outcome)
        : snapshotOutcomeHasErrors(outcome);
      presentImportOutcome({ trigger, html, hasErrors });
    } catch (e) {
      errorEl.textContent = e?.message || 'Import failed.';
      confirmBtn.disabled = false;
      cancelBtn.disabled = false;
    }
  };

  const bodyNodes = [intro, summaryEl];
  if (modeWrap) bodyNodes.push(modeWrap);
  bodyNodes.push(errorEl);

  mountModal({
    trigger,
    title,
    bodyNodes,
    actions: [cancelBtn, confirmBtn],
  });
}

async function openProgressDialog({
  trigger,
  title,
  bodyText,
  onRun,
  formatProgress,
}) {
  const body = document.createElement('p');
  body.className = 'sync-dialog-body';
  body.textContent = bodyText || '';

  const { progressWrap, progressFill, progressReadout } = buildProgressElements();
  const status = document.createElement('div');
  status.className = 'sync-status-msg';

  const ac = new AbortController();
  let finished = false;

  const cancelBtn = makeBtn('Cancel', {
    onClick: () => {
      if (!finished) ac.abort();
      closeModal();
    },
  });

  addCleanup(() => {
    if (!finished) ac.abort();
  });

  mountModal({
    trigger,
    title,
    bodyNodes: [body, progressWrap, status],
    actions: [cancelBtn],
  });

  try {
    const result = await onRun(ac.signal, (progress) => {
      const text = formatProgress(progress);
      progressReadout.textContent = text;
      const total = Number(progress?.total) || 0;
      const done = Number(progress?.done) || Number(progress?.bytes) || 0;
      if (total > 0) {
        progressFill.style.width = `${Math.min(100, Math.round((done / total) * 100))}%`;
      }
    });
    finished = true;
    return result;
  } catch (e) {
    finished = true;
    if (e?.name === 'AbortError' || ac.signal.aborted) return null;
    status.className = 'sync-status-msg err';
    status.textContent = e?.message || 'Operation failed.';
    throw e;
  }
}

async function pipeStreamToWritable(stream, writable, { signal, onChunk } = {}) {
  const reader = stream.getReader();
  let bytesWritten = 0;
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.length) {
        await writable.write(value);
        bytesWritten += value.length;
        onChunk?.({ bytes: bytesWritten, chunk: value });
      }
    }
    await writable.close();
  } catch (e) {
    try { await writable.abort(); } catch (_) { /* ignore */ }
    try { reader.releaseLock(); } catch (_) { /* ignore */ }
    throw e;
  }
  try { reader.releaseLock(); } catch (_) { /* ignore */ }
  return bytesWritten;
}

async function collectStreamToBlob(stream, { signal, onProgress } = {}) {
  const reader = stream.getReader();
  const chunks = [];
  let bytes = 0;
  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const { done, value } = await reader.read();
    if (done) break;
    if (value?.length) {
      chunks.push(value);
      bytes += value.length;
      onProgress?.({ bytes, done: bytes, total: 0, name: '' });
    }
  }
  try { reader.releaseLock(); } catch (_) { /* ignore */ }
  return new Blob(chunks, { type: 'application/zip' });
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // A library bundle can be hundreds of megabytes, and revoking the URL before
  // the download has fully committed to it cancels the transfer. Hold the
  // reference well past the click; the page is short-lived enough that leaking
  // it until unload is cheaper than a truncated export.
  const revoke = () => URL.revokeObjectURL(url);
  setTimeout(revoke, 10 * 60 * 1000);
  window.addEventListener('pagehide', revoke, { once: true });
}

/**
 * Export a streamed ZIP library bundle with progress UI.
 */
export async function openBundleExport({ scopes, trigger } = {}) {
  const { createBundleStream, bundleFilename } = await import('./syncBundle.js');
  const suggestedName = bundleFilename();

  const formatExportProgress = (p, archiveTotalBytes) => {
    const written = Number(p?.bytes) || 0;
    const total = Number(archiveTotalBytes) || Number(p?.archiveTotal) || 0;
    const name = p?.name ? ` — ${p.name}` : '';
    const sizePart = total > 0
      ? `${formatBytes(written)} of ${formatBytes(total)}`
      : formatBytes(written);
    const countPart = p?.done && p?.total ? `${p.done} of ${p.total} items` : '';
    return [countPart, sizePart].filter(Boolean).join(' · ') + name;
  };

  let saveHandle = null;
  let downloadName = suggestedName;
  const archiveTotal = { value: 0 };

  if (typeof window.showSaveFilePicker === 'function') {
    try {
      saveHandle = await window.showSaveFilePicker({
        suggestedName: suggestedName,
        types: [{
          description: 'Musi library bundle',
          accept: { 'application/zip': ['.zip'] },
        }],
      });
    } catch (e) {
      if (e?.name === 'AbortError') return;
      saveHandle = null;
    }
  }

  await openProgressDialog({
    trigger,
    title: 'Export library',
    bodyText: 'Writing your library bundle. Keep this tab open until the export finishes.',
    formatProgress: (p) => formatExportProgress(p, archiveTotal.value),
    onRun: async (signal, report) => {
      const exportResult = await createBundleStream({
        scopes,
        onProgress: (p) => report({ ...p, archiveTotal: archiveTotal.value }),
      });
      const { stream, filename, totalBytes } = exportResult;
      archiveTotal.value = totalBytes || 0;
      downloadName = filename || suggestedName;

      if (saveHandle) {
        const writable = await saveHandle.createWritable();
        await pipeStreamToWritable(stream, writable, {
          signal,
          onChunk: ({ bytes }) => report({
            bytes,
            archiveTotal: archiveTotal.value,
            name: 'Writing to disk',
          }),
        });
        await exportResult.done;
        return { ok: true };
      }

      const blob = await collectStreamToBlob(stream, {
        signal,
        onProgress: (p) => report({ ...p, archiveTotal: archiveTotal.value }),
      });
      await exportResult.done;
      triggerBlobDownload(blob, downloadName);
      return { ok: true };
    },
  });
}

async function runBundleImportWithProgress(file, { trigger, scopes, mode } = {}) {
  const { importBundle } = await import('./syncBundle.js');
  const result = await openProgressDialog({
    trigger,
    title: 'Import library',
    bodyText: 'Applying library bundle. This may take a while for large libraries.',
    formatProgress: (p) => {
      const written = Number(p?.bytes) || 0;
      const total = Number(p?.total) || 0;
      const name = p?.name ? ` — ${p.name}` : '';
      const sizePart = total > 0
        ? `${formatBytes(written)} of ${formatBytes(total)}`
        : formatBytes(written);
      const countPart = p?.done && p?.total ? `File ${p.done} of ${p.total}` : '';
      return [countPart, sizePart].filter(Boolean).join(' · ') + name;
    },
    onRun: (signal, report) => importBundle(file, {
      mode,
      scopes,
      signal,
      onProgress: report,
    }),
  });
  if (!result) return;
  presentImportOutcome({
    trigger,
    html: renderBundleOutcomeHtml(result),
    hasErrors: bundleOutcomeHasErrors(result),
  });
}

/**
 * Read a bundle file, confirm when needed, import with progress, and show results.
 */
export async function importFromBundleFile(file, { trigger } = {}) {
  if (!file) return;
  const { readBundle } = await import('./syncBundle.js');

  const bundle = await readBundle(file);
  if (!bundle.ok) {
    mountModal({
      trigger,
      title: 'Import failed',
      bodyNodes: [
        (() => {
          const p = document.createElement('p');
          p.className = 'sync-dialog-body';
          p.textContent = bundle.error || 'Could not read library bundle.';
          return p;
        })(),
      ],
      actions: [makeBtn('Close', { onClick: closeModal })],
    });
    return;
  }

  const summary = summarizeSnapshot(bundle.snapshot);
  const manifest = bundle.manifest || {};
  const fileCount = manifest.fileCount ?? (bundle.entries?.length || 0);
  const patternCount = manifest.patternCount ?? manifest.patterns?.count ?? bundle.summary?.patternCount ?? 0;
  const bundleBytes = manifest.totalBytes ?? bundle.summary?.totalBytes ?? 0;
  const scopes = Array.isArray(manifest.scopes) && manifest.scopes.length
    ? manifest.scopes
    : summary.scopes;

  const hasCollision = await hasLocalDataInScopes(scopes);
  if (!hasCollision) {
    return runBundleImportWithProgress(file, { trigger, scopes, mode: 'merge' });
  }

  const extraRows = [
    {
      label: 'Bundle files',
      value: `${fileCount} file(s), ${formatBytes(bundleBytes)}`,
    },
  ];
  if (patternCount > 0) {
    extraRows.push({
      label: 'Drum patterns',
      value: `${patternCount} pattern(s)`,
    });
  }
  const summaryEl = buildSnapshotSummaryElement(summary, { extraRows });

  await openImportConfirmShell({
    trigger,
    sourceLabel: 'library bundle',
    summaryEl,
    scopes,
    showModeChoice: true,
    onConfirm: async (mode) => {
      closeModal();
      const { importBundle } = await import('./syncBundle.js');
      return await openProgressDialog({
        trigger,
        title: 'Import library',
        bodyText: 'Applying library bundle. This may take a while for large libraries.',
        formatProgress: (p) => {
          const written = Number(p?.bytes) || 0;
          const total = Number(p?.total) || 0;
          const name = p?.name ? ` — ${p.name}` : '';
          const sizePart = total > 0
            ? `${formatBytes(written)} of ${formatBytes(total)}`
            : formatBytes(written);
          const countPart = p?.done && p?.total ? `File ${p.done} of ${p.total}` : '';
          return [countPart, sizePart].filter(Boolean).join(' · ') + name;
        },
        onRun: (signal, report) => importBundle(file, {
          mode,
          scopes,
          signal,
          onProgress: report,
        }),
      });
    },
    resultRenderer: renderBundleOutcomeHtml,
  });
}

/**
 * Import from a file — auto-detects ZIP bundle vs JSON snapshot.
 */
export async function importFromFile(file, { trigger } = {}) {
  if (!file) return;
  const kind = await detectImportFileKind(file);
  if (kind === 'zip') {
    return importFromBundleFile(file, { trigger });
  }
  if (kind === 'json') {
    const text = await file.text();
    return importFromText(text, { trigger });
  }
  mountModal({
    trigger,
    title: 'Import failed',
    bodyNodes: [
      (() => {
        const p = document.createElement('p');
        p.className = 'sync-dialog-body';
        p.textContent = 'This file is not a Musi library bundle or settings file. Choose a .zip library export or a .json settings file from Musi.';
        return p;
      })(),
    ],
    actions: [makeBtn('Close', { onClick: closeModal })],
  });
}

/**
 * Beam snapshot data as animated QR frames.
 */
export async function openBeamDialog({ scopes, trigger } = {}) {
  let frames = [];
  let frameIndex = 0;
  let playing = true;
  let fps = DEFAULT_BEAM_FPS;
  let rafId = null;
  let lastTime = 0;
  let accumulator = 0;
  let wakeLock = null;
  let matrixCache = new Map();

  const controls = document.createElement('div');
  controls.className = 'sync-dialog-controls';

  const counter = document.createElement('div');
  counter.className = 'sync-frame-counter';
  counter.setAttribute('aria-live', 'polite');

  const playBtn = makeBtn('Pause', { onClick: () => {
    playing = !playing;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  } });

  const speedLabel = document.createElement('span');
  speedLabel.className = 'sync-speed-label';
  speedLabel.textContent = 'Speed';

  const speedSelect = document.createElement('select');
  speedSelect.className = 'sync-speed-select';
  speedSelect.setAttribute('aria-label', 'Beam speed');
  BEAM_SPEEDS.forEach(({ fps: f, label }) => {
    const opt = document.createElement('option');
    opt.value = String(f);
    opt.textContent = label;
    if (f === DEFAULT_BEAM_FPS) opt.selected = true;
    speedSelect.appendChild(opt);
  });
  speedSelect.onchange = () => {
    fps = Number(speedSelect.value) || DEFAULT_BEAM_FPS;
    updateBeamEstimate();
  };

  controls.appendChild(counter);
  controls.appendChild(playBtn);
  controls.appendChild(speedLabel);
  controls.appendChild(speedSelect);

  const instruction = document.createElement('p');
  instruction.className = 'sync-dialog-body';
  instruction.textContent = 'Open Receive via QR on the other device and hold the camera steady toward this screen. Frames loop so missed ones can be picked up on the next pass.';

  const bezel = document.createElement('div');
  bezel.className = 'sync-qr-bezel';
  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'sync-qr-canvas-wrap';
  const canvas = document.createElement('canvas');
  canvas.className = 'sync-qr-canvas';
  canvas.setAttribute('aria-label', 'QR code frame');
  canvasWrap.appendChild(canvas);
  bezel.appendChild(canvasWrap);

  const status = document.createElement('div');
  status.className = 'sync-status-msg';
  status.textContent = 'Preparing frames…';

  let payloadByteLength = 0;

  function updateBeamEstimate() {
    if (!payloadByteLength) return;
    const est = estimateTransfer(payloadByteLength, { fps });
    status.className = 'sync-status-msg';
    status.textContent = formatPayloadBeamEstimate(payloadByteLength, est, { prefixAbout: false });
  }

  function updateCounter() {
    if (!frames.length) {
      counter.textContent = 'Preparing…';
      return;
    }
    counter.textContent = `Frame ${frameIndex + 1} / ${frames.length}`;
  }

  function drawFrame(idx) {
    const text = frames[idx];
    if (!text) return;
    let matrix = matrixCache.get(text);
    if (!matrix) {
      matrix = encodeQrMatrix(text, { ecc: 'M', minVersion: 1, maxVersion: 22 });
      if (matrix) matrixCache.set(text, matrix);
    }
    if (matrix) {
      drawQrToCanvas(canvas, matrix, { dark: '#000000', light: '#ffffff' });
    }
  }

  function tick(now) {
    if (document.hidden) {
      lastTime = now;
      rafId = requestAnimationFrame(tick);
      return;
    }
    if (playing && frames.length) {
      const delta = lastTime ? now - lastTime : 0;
      lastTime = now;
      accumulator += delta;
      const frameMs = 1000 / fps;
      while (accumulator >= frameMs && frames.length) {
        accumulator -= frameMs;
        frameIndex = (frameIndex + 1) % frames.length;
        drawFrame(frameIndex);
        updateCounter();
      }
    } else {
      lastTime = now;
    }
    rafId = requestAnimationFrame(tick);
  }

  const onVisibility = () => {
    if (document.hidden) {
      lastTime = 0;
      accumulator = 0;
    }
  };

  addCleanup(() => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    document.removeEventListener('visibilitychange', onVisibility);
    if (wakeLock && typeof wakeLock.release === 'function') {
      try { wakeLock.release(); } catch (_) { /* ignore */ }
    }
    wakeLock = null;
  });

  document.addEventListener('visibilitychange', onVisibility);

  if (typeof navigator !== 'undefined' && navigator.wakeLock && typeof navigator.wakeLock.request === 'function') {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
    } catch (_) { /* silent */ }
  }

  mountModal({
    trigger,
    title: 'Beam via QR',
    bodyNodes: [instruction, controls, bezel, status],
    actions: [
      makeBtn('Close', { onClick: closeModal }),
    ],
  });

  try {
    const snapshot = buildSnapshot({ scopes });
    const bytes = await encodePayload(snapshot);
    const built = buildFrames(bytes);
    frames = built.frames;
    frameIndex = 0;
    accumulator = 0;
    payloadByteLength = bytes.length;
    updateBeamEstimate();
    updateCounter();
    drawFrame(0);
    rafId = requestAnimationFrame(tick);
  } catch (e) {
    status.className = 'sync-status-msg err';
    status.textContent = e?.message || 'Could not prepare QR frames.';
  }
}

/**
 * Receive QR frames via camera and import when complete.
 */
export async function openReceiveDialog({ trigger } = {}) {
  const collector = createFrameCollector();
  let scanner = null;
  let completing = false;

  const instruction = document.createElement('p');
  instruction.className = 'sync-dialog-body';
  instruction.textContent = 'Point the camera at the sending screen. Keep it steady until every frame is collected.';

  const cameraSelect = document.createElement('select');
  cameraSelect.className = 'sync-camera-picker';
  cameraSelect.hidden = true;
  cameraSelect.setAttribute('aria-label', 'Camera');

  const bezel = document.createElement('div');
  bezel.className = 'sync-video-bezel';
  const video = document.createElement('video');
  video.className = 'sync-video';
  video.setAttribute('playsinline', '');
  video.muted = true;
  const scanOverlay = document.createElement('div');
  scanOverlay.className = 'sync-scan-overlay';
  scanOverlay.setAttribute('aria-hidden', 'true');
  bezel.appendChild(video);
  bezel.appendChild(scanOverlay);

  const slowNote = document.createElement('p');
  slowNote.className = 'sync-dialog-note';
  slowNote.hidden = true;
  slowNote.textContent = 'This device uses the slower software scanner — hold the camera steady and wait a moment between frames.';

  const status = document.createElement('div');
  status.className = 'sync-status-msg';
  status.textContent = 'Starting camera…';

  const { progressWrap, progressFill, progressReadout } = buildProgressElements();
  progressReadout.textContent = 'Waiting for frames…';

  const missingEl = document.createElement('div');
  missingEl.className = 'sync-missing-list';
  missingEl.hidden = true;
  missingEl.setAttribute('aria-live', 'polite');

  function stopScanner() {
    if (scanner) {
      try { scanner.stop(); } catch (_) { /* ignore */ }
      scanner = null;
    }
  }

  addCleanup(stopScanner);

  function updateProgress() {
    const p = collector.progress();
    const ratio = p.total > 0 ? p.have / p.total : 0;
    progressFill.style.width = `${Math.round(ratio * 100)}%`;
    if (p.total > 0) {
      progressReadout.textContent = `Collected ${p.have} of ${p.total} frames`;
    } else {
      progressReadout.textContent = 'Waiting for frames…';
    }
    const missing = collector.missing();
    if (p.total > 0 && missing.length > 0) {
      missingEl.hidden = false;
      const shown = missing.length > 24
        ? `${missing.slice(0, 24).join(', ')}… (+${missing.length - 24} more)`
        : missing.join(', ');
      missingEl.textContent = `Still missing frame(s): ${shown}`;
    } else {
      missingEl.hidden = true;
    }
  }

  async function onComplete(bytes) {
    if (completing) return;
    completing = true;
    stopScanner();
    status.textContent = 'Decoding payload…';
    try {
      const value = await decodePayload(bytes);
      const validation = validateSnapshot(value);
      if (!validation.ok) {
        status.className = 'sync-status-msg err';
        status.textContent = validation.error || 'Invalid snapshot.';
        completing = false;
        return;
      }
      closeModal();
      await openImportConfirm({ snapshot: validation.snapshot, source: 'qr' });
    } catch (e) {
      status.className = 'sync-status-msg err';
      status.textContent = e?.message || 'Could not decode payload.';
      completing = false;
    }
  }

  function onText(text) {
    const result = collector.accept(text);
    if (result.error) {
      status.className = 'sync-status-msg warn';
      status.textContent = result.error;
    }
    updateProgress();
    if (result.done) {
      const bytes = collector.result();
      if (bytes) onComplete(bytes);
    }
  }

  mountModal({
    trigger,
    title: 'Receive via QR',
    bodyNodes: [instruction, cameraSelect, bezel, slowNote, status, progressWrap, missingEl],
    actions: [
      makeBtn('Close', { onClick: closeModal }),
    ],
  });

  try {
    const inputs = await listVideoInputs();
    if (inputs.length > 1) {
      cameraSelect.hidden = false;
      inputs.forEach((inp) => {
        const opt = document.createElement('option');
        opt.value = inp.deviceId;
        opt.textContent = inp.label || `Camera ${cameraSelect.options.length + 1}`;
        cameraSelect.appendChild(opt);
      });
      cameraSelect.onchange = () => {
        if (scanner && cameraSelect.value) {
          scanner.switchCamera(cameraSelect.value);
        }
      };
    }

    scanner = await startScanner({
      video,
      deviceId: inputs[0]?.deviceId || null,
      facingMode: 'environment',
      onText,
      onStatus: ({ state, message }) => {
        if (state === 'requesting') {
          status.className = 'sync-status-msg';
          status.textContent = message || 'Requesting camera…';
        } else if (state === 'scanning') {
          status.className = 'sync-status-msg';
          status.textContent = 'Scanning…';
        } else if (state === 'denied') {
          status.className = 'sync-status-msg err';
          status.textContent = message || 'Camera permission denied.';
        } else if (state === 'no-camera') {
          status.className = 'sync-status-msg err';
          status.textContent = message || 'No camera found.';
        } else if (state === 'stopped') {
          /* ignore */
        } else if (message) {
          status.className = 'sync-status-msg';
          status.textContent = message;
        }
      },
      onError: (e) => {
        status.className = 'sync-status-msg err';
        status.textContent = e?.message || 'Scanner error.';
      },
    });

    if (!scanner.usingNative()) {
      slowNote.hidden = false;
    }
  } catch (e) {
    status.className = 'sync-status-msg err';
    status.textContent = e?.message || 'Could not start camera.';
  }
}

/**
 * Confirm and apply an imported snapshot (JSON file or QR).
 */
export async function openImportConfirm({ snapshot, source = 'file', trigger } = {}) {
  if (!snapshot) return;

  const scopes = Array.isArray(snapshot.scopes) && snapshot.scopes.length
    ? snapshot.scopes
    : SYNC_SCOPES.map((s) => s.id);

  const hasCollision = await hasLocalDataInScopes(scopes);
  if (!hasCollision) {
    const outcome = await applySnapshot(snapshot, { mode: 'merge', scopes });
    presentImportOutcome({
      trigger,
      html: renderSnapshotOutcomeHtml(outcome),
      hasErrors: snapshotOutcomeHasErrors(outcome),
    });
    return;
  }

  const summary = summarizeSnapshot(snapshot);
  const sourceLabel = source === 'qr' ? 'QR transfer' : 'file import';
  const summaryEl = buildSnapshotSummaryElement(summary);

  await openImportConfirmShell({
    trigger,
    sourceLabel,
    summaryEl,
    scopes,
    showModeChoice: true,
    onConfirm: async (mode) => applySnapshot(snapshot, { mode, scopes }),
    resultRenderer: renderSnapshotOutcomeHtml,
  });
}

/**
 * Parse text, validate, and import (or confirm when local data collides).
 */
export async function importFromText(text, { trigger } = {}) {
  const parsed = parseSnapshotJson(text);
  if (!parsed.ok) {
    mountModal({
      trigger,
      title: 'Import failed',
      bodyNodes: [
        (() => {
          const p = document.createElement('p');
          p.className = 'sync-dialog-body';
          p.textContent = parsed.error || 'Invalid JSON in profile file.';
          return p;
        })(),
      ],
      actions: [makeBtn('Close', { onClick: closeModal })],
    });
    return;
  }
  const validation = validateSnapshot(parsed.snapshot);
  if (!validation.ok) {
    mountModal({
      trigger,
      title: 'Import failed',
      bodyNodes: [
        (() => {
          const p = document.createElement('p');
          p.className = 'sync-dialog-body';
          p.textContent = validation.error || 'Invalid snapshot.';
          return p;
        })(),
      ],
      actions: [makeBtn('Close', { onClick: closeModal })],
    });
    return;
  }

  const snapshot = validation.snapshot;
  const scopes = Array.isArray(snapshot.scopes) && snapshot.scopes.length
    ? snapshot.scopes
    : SYNC_SCOPES.map((s) => s.id);

  const hasCollision = await hasLocalDataInScopes(scopes);
  if (!hasCollision) {
    const outcome = await applySnapshot(snapshot, { mode: 'merge', scopes });
    presentImportOutcome({
      trigger,
      html: renderSnapshotOutcomeHtml(outcome),
      hasErrors: snapshotOutcomeHasErrors(outcome),
    });
    return;
  }

  return openImportConfirm({ snapshot, source: 'file', trigger });
}
