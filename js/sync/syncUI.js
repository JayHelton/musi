/**
 * Device sync UI — QR beam/receive dialogs and import confirmation.
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

function formatBytes(n) {
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

function makeBtn(label, { primary = false, sm = true, onClick } = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn' + (sm ? ' sm' : '') + (primary ? ' primary' : '');
  btn.textContent = label;
  btn.onclick = onClick;
  return btn;
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
  progressReadout.textContent = 'Waiting for frames…';
  progressWrap.appendChild(progressBar);
  progressWrap.appendChild(progressReadout);

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
 * Confirm and apply an imported snapshot.
 */
export async function openImportConfirm({ snapshot, source = 'file', trigger } = {}) {
  if (!snapshot) return;

  const summary = summarizeSnapshot(snapshot);
  const sourceLabel = source === 'qr' ? 'QR transfer' : 'file import';

  const intro = document.createElement('p');
  intro.className = 'sync-dialog-body';
  intro.textContent = `Ready to import from ${sourceLabel}. Review what will be applied below.`;

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

  const errorEl = document.createElement('div');
  errorEl.className = 'modal-errors';

  const resultEl = document.createElement('div');
  resultEl.hidden = true;

  const reloadNote = document.createElement('p');
  reloadNote.className = 'sync-reload-note';
  reloadNote.hidden = true;
  reloadNote.textContent = 'A full reload is needed so every screen picks up the new data.';

  const cancelBtn = makeBtn('Cancel', { onClick: closeModal });
  const confirmBtn = makeBtn('Confirm import', { primary: true });
  confirmBtn.onclick = async () => {
    errorEl.textContent = '';
    const mode = replaceInput.checked ? 'replace' : 'merge';
    const scopes = Array.isArray(snapshot.scopes) && snapshot.scopes.length
      ? snapshot.scopes
      : SYNC_SCOPES.map((s) => s.id);
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    try {
      const outcome = await applySnapshot(snapshot, { mode, scopes });
      mergeInput.disabled = true;
      replaceInput.disabled = true;

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

      resultEl.className = 'sync-result-block';
      resultEl.innerHTML = html;
      resultEl.hidden = false;
      reloadNote.hidden = false;

      const reloadBtn = makeBtn('Reload now', { primary: true, onClick: () => {
        window.location.reload();
      } });
      if (actionRow) actionRow.appendChild(reloadBtn);
    } catch (e) {
      errorEl.textContent = e?.message || 'Import failed.';
      confirmBtn.disabled = false;
      cancelBtn.disabled = false;
    }
  };

  let actionRow = null;
  const mounted = mountModal({
    trigger,
    title: 'Confirm import',
    bodyNodes: [intro, summaryEl, modeWrap, errorEl, resultEl, reloadNote],
    actions: [cancelBtn, confirmBtn],
  });
  actionRow = mounted.actionRow;
}

/**
 * Parse text, validate, and open import confirmation.
 */
export async function importFromText(text) {
  const parsed = parseSnapshotJson(text);
  if (!parsed.ok) {
    mountModal({
      trigger: null,
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
      trigger: null,
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
  return openImportConfirm({ snapshot: validation.snapshot, source: 'file' });
}
