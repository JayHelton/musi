// Exercise practice-take recorder UI: minimal bar + gear drawer for takes/settings.

import { saveFile, getFileBlob } from './attachments.js';
import { createSessionRecorder } from './sessionRecorder.js';

const SHEET_MQ = '(max-width: 768px) and (min-height: 501px)';
const TAKE_NAME_LIMIT = 120;
const FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node[k.toLowerCase()] = v;
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

function fmtDuration(ms) {
  const sec = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtTimestamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function trapFocus(container, e) {
  if (e.key !== 'Tab') return;
  const nodes = [...container.querySelectorAll(FOCUSABLE)]
    .filter((node) => node.offsetParent !== null || node === document.activeElement);
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * @param {HTMLElement} host — ex-player-pane
 * @param {object} api
 * @param {string} api.exerciseId
 * @param {() => Array} api.getTakes
 * @param {(take: object) => Promise<boolean>} api.onSaveTake
 * @param {(takeId: string) => Promise<boolean>} api.onDeleteTake
 * @param {(takeId: string, name: string) => Promise<boolean>} api.onRenameTake
 */
export function mountExerciseTakePanel(host, api) {
  const noop = { destroy() {}, stopRecording() {}, isRecording: () => false };
  if (!host || !api?.exerciseId) return noop;

  let drawerOpen = false;
  let sheetMode = false;
  let recorder = null;
  let timerId = null;
  let lastFocus = null;
  const takeUrls = new Map();

  const bar = el('div', { class: 'ex-take-bar', role: 'region', 'aria-label': 'Practice recording' });
  const recordBtn = el('button', {
    class: 'ex-take-record btn',
    type: 'button',
    'aria-label': 'Start recording',
    title: 'Record take',
  });
  recordBtn.appendChild(el('span', { class: 'ex-take-record-dot', 'aria-hidden': 'true' }));
  recordBtn.appendChild(el('span', { class: 'ex-take-record-label', text: 'Record' }));
  const timerEl = el('span', { class: 'ex-take-timer', text: '0:00', 'aria-live': 'polite' });
  const meterEl = el('div', { class: 'ex-take-meter', 'aria-hidden': 'true' });
  const meterFill = el('div', { class: 'ex-take-meter-fill' });
  meterEl.appendChild(meterFill);
  const gearBtn = el('button', {
    class: 'ex-take-gear btn sm',
    type: 'button',
    'aria-label': 'Recording settings and takes',
    title: 'Takes & settings',
    text: '⚙',
  });
  const bleedNote = el('p', {
    class: 'ex-take-bleed-note',
    text: 'Use headphones when the exercise audio is loud to reduce mic bleed.',
  });
  bar.append(recordBtn, timerEl, meterEl, gearBtn, bleedNote);
  host.appendChild(bar);

  const drawerRoot = el('div', { class: 'ex-take-drawer-root' });
  const backdrop = el('div', { class: 'ex-take-drawer-backdrop', 'aria-hidden': 'true' });
  const drawer = el('div', {
    class: 'ex-take-drawer',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Practice takes',
  });
  const sheet = el('div', {
    class: 'ex-take-sheet',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Practice takes',
  });
  sheet.appendChild(el('div', { class: 'ex-take-sheet-handle', 'aria-hidden': 'true' }));
  const drawerBody = el('div', { class: 'ex-take-drawer-body' });
  const sheetBody = el('div', { class: 'ex-take-drawer-body' });
  const panelBody = el('div', { class: 'ex-take-panel-body' });

  function head(title) {
    return el('div', { class: 'ex-take-drawer-head' }, [
      el('span', { class: 'ex-take-drawer-title', text: title }),
      el('button', {
        class: 'ex-take-drawer-close btn sm',
        type: 'button',
        text: '✕',
        'aria-label': 'Close takes panel',
        title: 'Close',
        onClick: () => closeDrawer(),
      }),
    ]);
  }

  drawer.append(head('Practice takes'), drawerBody);
  sheet.append(head('Practice takes'), sheetBody);
  drawerRoot.append(backdrop, drawer, sheet);
  host.appendChild(drawerRoot);

  const formatSelect = el('select', { class: 'ex-take-format', 'aria-label': 'Recording format' }, [
    el('option', { value: 'auto', text: 'Auto (WebM or WAV)' }),
    el('option', { value: 'webm', text: 'Compressed (WebM)' }),
    el('option', { value: 'wav', text: 'Lossless (WAV)' }),
  ]);
  const bitDepthSelect = el('select', { class: 'ex-take-bitdepth', 'aria-label': 'WAV bit depth' }, [
    el('option', { value: '16', text: '16-bit WAV' }),
    el('option', { value: '24', text: '24-bit WAV' }),
  ]);
  const normalizeCheck = el('input', { type: 'checkbox', class: 'ex-take-normalize', id: 'ex-take-normalize', checked: 'checked' });
  const autoStopSelect = el('select', { class: 'ex-take-autostop', 'aria-label': 'Auto-stop recording' }, [
    el('option', { value: '0', text: 'Off' }),
    el('option', { value: '60000', text: '1 minute' }),
    el('option', { value: '180000', text: '3 minutes' }),
    el('option', { value: '300000', text: '5 minutes' }),
    el('option', { value: '600000', text: '10 minutes' }),
  ]);
  const takesList = el('div', { class: 'ex-take-list', role: 'list' });
  const takesEmpty = el('p', { class: 'ex-take-empty', text: 'No takes yet. Hit Record to capture your performance.' });

  panelBody.append(
    el('section', { class: 'ex-take-drawer-section' }, [
      el('h4', { class: 'ex-take-drawer-section-title', text: 'Capture' }),
      el('label', { class: 'ex-take-field', for: 'ex-take-normalize' }, [
        normalizeCheck,
        el('span', { text: 'Normalize WAV peaks' }),
      ]),
      el('label', { class: 'ex-take-field' }, [
        el('span', { class: 'ex-take-field-label', text: 'Format' }),
        formatSelect,
      ]),
      el('label', { class: 'ex-take-field' }, [
        el('span', { class: 'ex-take-field-label', text: 'WAV depth' }),
        bitDepthSelect,
      ]),
      el('label', { class: 'ex-take-field' }, [
        el('span', { class: 'ex-take-field-label', text: 'Auto-stop' }),
        autoStopSelect,
      ]),
    ]),
    el('section', { class: 'ex-take-drawer-section' }, [
      el('h4', { class: 'ex-take-drawer-section-title', text: 'Takes' }),
      takesEmpty,
      takesList,
    ]),
  );

  function placeBody() {
    const target = sheetMode ? sheetBody : drawerBody;
    if (panelBody.parentElement !== target) target.appendChild(panelBody);
  }

  function detectSheetMode() {
    sheetMode = window.matchMedia(SHEET_MQ).matches;
  }

  function paintDrawer() {
    detectSheetMode();
    placeBody();
    backdrop.classList.toggle('is-open', drawerOpen);
    drawer.classList.toggle('is-open', drawerOpen && !sheetMode);
    sheet.classList.toggle('is-open', drawerOpen && sheetMode);
    backdrop.setAttribute('aria-hidden', drawerOpen ? 'false' : 'true');
    drawer.setAttribute('aria-hidden', drawerOpen && !sheetMode ? 'false' : 'true');
    sheet.setAttribute('aria-hidden', drawerOpen && sheetMode ? 'false' : 'true');
    document.body.classList.toggle('ex-take-drawer-open', drawerOpen);
  }

  function openDrawer() {
    if (drawerOpen) return;
    lastFocus = document.activeElement;
    drawerOpen = true;
    renderTakes();
    paintDrawer();
    const focusTarget = drawerOpen && sheetMode ? sheet : drawer;
    const closeBtn = focusTarget.querySelector('.ex-take-drawer-close');
    closeBtn?.focus();
  }

  function closeDrawer() {
    if (!drawerOpen) return;
    drawerOpen = false;
    paintDrawer();
    if (lastFocus && typeof lastFocus.focus === 'function') {
      try { lastFocus.focus(); } catch (e) { /* ignore */ }
    }
    lastFocus = null;
  }

  function recorderOptions() {
    return {
      format: formatSelect.value,
      bitDepth: Number(bitDepthSelect.value) === 24 ? 24 : 16,
      normalize: normalizeCheck.checked,
      autoStopMs: Number(autoStopSelect.value) || 0,
      onLevel: (level) => { meterFill.style.transform = `scaleX(${level})`; },
      onStateChange: (st) => {
        const rec = st === 'recording';
        bar.classList.toggle('is-recording', rec);
        recordBtn.setAttribute('aria-label', rec ? 'Stop recording' : 'Start recording');
        recordBtn.querySelector('.ex-take-record-label').textContent = rec ? 'Stop' : 'Record';
        if (!rec) meterFill.style.transform = 'scaleX(0)';
      },
      onError: (err) => {
        statusToast(err?.message || 'Recording failed.');
        stopTimer();
      },
    };
  }

  function statusToast(msg) {
    let note = bar.querySelector('.ex-take-status');
    if (!note) {
      note = el('span', { class: 'ex-take-status', role: 'status' });
      bar.insertBefore(note, bleedNote);
    }
    note.textContent = msg;
    clearTimeout(statusToast._t);
    statusToast._t = setTimeout(() => { if (note.parentElement) note.textContent = ''; }, 4000);
  }

  function startTimer() {
    stopTimer();
    const tick = () => {
      const ms = recorder?.getElapsedMs?.() || 0;
      timerEl.textContent = fmtDuration(ms);
    };
    tick();
    timerId = setInterval(tick, 250);
  }

  function stopTimer() {
    if (timerId) { clearInterval(timerId); timerId = null; }
    timerEl.textContent = '0:00';
  }

  async function toggleRecord() {
    if (recorder?.isRecording?.()) {
      const result = await recorder.stop();
      stopTimer();
      if (!result?.blob?.size) {
        statusToast('Recording was empty.');
        return;
      }
      const takes = api.getTakes() || [];
      const takeNum = takes.length + 1;
      const name = `Take ${takeNum}`;
      const meta = await saveFile({
        blob: result.blob,
        name,
        type: result.mimeType,
        fileName: `${name}.${result.extension}`,
        size: result.blob.size,
        source: 'exercise-take',
      });
      if (!meta) {
        statusToast('Could not save take — storage unavailable.');
        return;
      }
      const take = {
        id: `take-${Date.now().toString(36)}`,
        attachmentId: meta.id,
        name,
        type: result.mimeType,
        durationMs: result.durationMs,
        createdAt: meta.createdAt,
      };
      const ok = await api.onSaveTake(take);
      if (!ok) statusToast('Could not attach take to this exercise.');
      else {
        statusToast('Take saved.');
        renderTakes();
      }
      return;
    }

    if (!recorder) recorder = createSessionRecorder(recorderOptions());
    else {
      recorder.destroy();
      recorder = createSessionRecorder(recorderOptions());
    }
    const started = await recorder.start();
    if (started) startTimer();
  }

  function revokeTakeUrl(id) {
    const url = takeUrls.get(id);
    if (url) {
      try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
      takeUrls.delete(id);
    }
  }

  function revokeAllTakeUrls() {
    for (const id of [...takeUrls.keys()]) revokeTakeUrl(id);
  }

  async function renderTakes() {
    const takes = [...(api.getTakes() || [])].sort(
      (a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0),
    );
    takesList.innerHTML = '';
    takesEmpty.hidden = takes.length > 0;
    for (const take of takes) {
      const row = el('div', { class: 'ex-take-row', role: 'listitem' });
      const meta = el('div', { class: 'ex-take-row-meta' });
      const nameInput = el('input', {
        type: 'text',
        class: 'ex-take-name-input',
        value: take.name || 'Take',
        maxlength: String(TAKE_NAME_LIMIT),
        'aria-label': `Rename ${take.name || 'take'}`,
      });
      nameInput.addEventListener('change', async () => {
        const clean = nameInput.value.trim() || take.name;
        nameInput.value = clean;
        await api.onRenameTake(take.id, clean);
      });
      meta.append(
        nameInput,
        el('span', { class: 'ex-take-row-sub', text: `${fmtDuration(take.durationMs)} · ${fmtTimestamp(take.createdAt)}` }),
      );
      const audioWrap = el('div', { class: 'ex-take-audio-wrap' });
      const audio = el('audio', {
        class: 'ex-take-audio',
        controls: '',
        preload: 'metadata',
        'aria-label': `Play ${take.name || 'take'}`,
      });
      audioWrap.appendChild(audio);
      (async () => {
        const blob = await getFileBlob(take.attachmentId);
        if (!blob || !audio.isConnected) return;
        revokeTakeUrl(take.id);
        const url = URL.createObjectURL(blob);
        takeUrls.set(take.id, url);
        audio.src = url;
      })();

      const actions = el('div', { class: 'ex-take-row-actions' });
      const dl = el('a', {
        class: 'btn sm',
        text: 'Download',
        href: '#',
        'aria-label': `Download ${take.name || 'take'}`,
      });
      dl.addEventListener('click', async (e) => {
        e.preventDefault();
        const blob = await getFileBlob(take.attachmentId);
        if (!blob) return;
        const ext = (take.type || '').includes('wav') ? 'wav' : 'webm';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${take.name || 'take'}.${ext}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 500);
      });
      const del = el('button', {
        class: 'btn sm ex-take-del',
        type: 'button',
        text: 'Delete',
        'aria-label': `Delete ${take.name || 'take'}`,
        onClick: async () => {
          revokeTakeUrl(take.id);
          await api.onDeleteTake(take.id);
          renderTakes();
        },
      });
      actions.append(dl, del);
      row.append(meta, audioWrap, actions);
      takesList.appendChild(row);
    }
  }

  recordBtn.addEventListener('click', () => { toggleRecord().catch(() => {}); });
  gearBtn.addEventListener('click', () => { if (drawerOpen) closeDrawer(); else openDrawer(); });
  backdrop.addEventListener('click', () => closeDrawer());

  function onKey(e) {
    if (e.key === 'Escape' && drawerOpen) closeDrawer();
    if (drawerOpen) {
      const panel = sheetMode ? sheet : drawer;
      trapFocus(panel, e);
    }
  }
  document.addEventListener('keydown', onKey);

  const mq = window.matchMedia(SHEET_MQ);
  const onMq = () => { detectSheetMode(); if (drawerOpen) paintDrawer(); };
  mq.addEventListener?.('change', onMq);

  placeBody();
  renderTakes();

  function stopRecording() {
    if (recorder?.isRecording?.()) {
      recorder.cancel();
      stopTimer();
    }
  }

  function destroy() {
    stopRecording();
    recorder?.destroy?.();
    recorder = null;
    mq.removeEventListener?.('change', onMq);
    document.removeEventListener('keydown', onKey);
    closeDrawer();
    revokeAllTakeUrls();
    bar.remove();
    drawerRoot.remove();
    document.body.classList.remove('ex-take-drawer-open');
  }

  return { destroy, stopRecording, isRecording: () => !!recorder?.isRecording?.() };
}
