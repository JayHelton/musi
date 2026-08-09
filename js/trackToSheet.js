// Track → Sheet: upload an isolated monophonic track, parse pitches, show
// basic sheet music. No source separation — feed it a single vocal/guitar/bass
// stem. Saved stems live in the shared Exercises library.

import { ensureAudio } from './audio.js';
import {
  decodeAudioFile,
  transcribeBuffer,
  quantizeToScore,
  suggestClef,
} from './trackToSheet/transcribe.js';
import { renderScoreSVG, notesToText } from './trackToSheet/score.js';
import { transcriptionToGpResult } from './trackToSheet/toTabModel.js';
import { loadGpPlayerResult } from './gpPlayer.js';
import {
  saveFile,
  getFileBlob,
  attachmentsSupported,
  ensurePersistentStorage,
} from './attachments.js';
import {
  addExerciseFromAttachment,
  listAudioExercises,
  renameExerciseItem,
  deleteExerciseItem,
  getExercise,
} from './exercises.js';
import { createAnalysisPanel } from './trackToSheet/analysisPanel.js';

const MAX_FILE_BYTES = 250 * 1024 * 1024;

const state = {
  fileName: null,
  fileBlob: null,
  audioBuffer: null,
  result: null,
  bpm: 120,
  clef: 'Treble',
  preferSharps: true,
  busy: false,
  objectUrl: null,
  bound: false,
  exerciseId: null,
  analysisPanel: null,
};

function $(id) {
  return document.getElementById(id);
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node[k.toLowerCase()] = v;
    else if (v === false || v == null) { /* skip */ }
    else if (k === 'value') node.value = v;
    else node.setAttribute(k, v === true ? '' : v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

function setStatus(msg, kind = '') {
  const box = $('tts-status');
  if (!box) return;
  box.textContent = msg || '';
  box.dataset.kind = kind;
  box.hidden = !msg;
}

function syncGpButton() {
  const btn = $('tts-open-gp');
  if (!btn) return;
  const hasNotes = !!(state.result?.notes?.length);
  btn.hidden = !hasNotes;
  btn.disabled = state.busy || !hasNotes;
}

function openInGpPlayer() {
  if (!state.result?.notes?.length) return;
  const gp = transcriptionToGpResult(state.result, {
    name: baseName(state.fileName),
    bpm: state.bpm,
    beatsPerBar: state.result.beatsPerBar ?? 4,
    offsetSec: state.result.offsetSec ?? 0,
  });
  loadGpPlayerResult(gp, {
    title: baseName(state.fileName),
    fileName: `${baseName(state.fileName)}.riff`,
  });
}

function syncSaveButton() {
  const btn = $('tts-save');
  if (!btn) return;
  const inLib = !!(state.exerciseId && getExercise(state.exerciseId));
  btn.disabled = state.busy || !state.fileBlob || inLib;
  btn.textContent = inLib ? 'In library' : 'Save to Library';
}

function setBusy(busy) {
  state.busy = busy;
  const btn = $('tts-transcribe');
  const input = $('tts-file');
  if (btn) btn.disabled = busy || !state.audioBuffer;
  if (input) input.disabled = busy;
  document.body.classList.toggle('tts-busy', busy);
  state.analysisPanel?.setBusy(busy);
  syncSaveButton();
  syncGpButton();
}

function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function baseName(fileName) {
  const name = fileName || 'stem';
  const dot = name.lastIndexOf('.');
  return (dot > 0 ? name.slice(0, dot) : name) || 'stem';
}

function renderNoteList(notes) {
  const box = $('tts-note-list');
  if (!box) return;
  if (!notes.length) {
    box.innerHTML = '<p class="tts-muted">No notes yet.</p>';
    return;
  }
  box.innerHTML = notes.map(n =>
    `<span class="tts-note-chip" title="${n.startSec.toFixed(2)}s · ${n.durationSec.toFixed(2)}s">${n.label}</span>`
  ).join('');
}

function paintScore(events, bpm, beatsPerBar) {
  const wrap = $('tts-score-wrap');
  if (!wrap) return;
  const width = Math.max(320, Math.min(720, wrap.clientWidth || 720));
  wrap.innerHTML = renderScoreSVG({
    events,
    clef: state.clef,
    bpm,
    beatsPerBar,
    preferSharps: state.preferSharps,
    maxWidth: width - 24,
  });
}

function syncControlsFromResult() {
  const clefSel = $('tts-clef');
  if (clefSel) clefSel.value = state.clef;
  const sharpSel = $('tts-accidentals');
  if (sharpSel) sharpSel.value = state.preferSharps ? 'sharps' : 'flats';
}

function syncTtsBpmInput(opts) {
  const bpmInput = $('tts-bpm');
  if (!bpmInput) return;
  const bpm = opts?.tempoMode === 'manual' && opts.bpm != null
    ? opts.bpm
    : (state.result?.bpm ?? opts?.bpm ?? state.bpm);
  bpmInput.value = String(bpm);
  state.bpm = Math.round(Number(bpm) || 120);
}

function syncPanelFromTtsBpm() {
  const bpmInput = $('tts-bpm');
  if (!state.analysisPanel || !bpmInput) return;
  const bpm = Math.max(40, Math.min(240, Math.round(Number(bpmInput.value) || 120)));
  state.analysisPanel.setOptions({ tempoMode: 'manual', bpm });
  state.bpm = bpm;
}

function renderDiagnostics(result) {
  const readouts = $('tts-readouts');
  const gridEl = $('tts-grid');
  const qualityEl = $('tts-quality');
  const fitEl = $('tts-tempo-fit');
  if (!result) {
    if (readouts) readouts.hidden = true;
    if (gridEl) gridEl.textContent = '--';
    if (qualityEl) qualityEl.textContent = '--';
    if (fitEl) fitEl.textContent = '--';
    return;
  }
  if (readouts) readouts.hidden = false;
  if (gridEl) gridEl.textContent = result.grid?.label || '--';
  if (qualityEl) {
    const diag = result.diagnostics;
    if (!diag) qualityEl.textContent = '--';
    else {
      const voiced = Math.round((diag.voicedRatio ?? 0) * 100);
      const count = diag.noteCount ?? result.notes?.length ?? 0;
      qualityEl.textContent = `${voiced}% voiced · ${count} notes`;
    }
  }
  if (fitEl) {
    fitEl.textContent = Number.isFinite(result.tempoConfidence)
      ? `${Math.round(result.tempoConfidence * 100)}%`
      : '--';
  }
}

function applyTranscriptionResult(result) {
  state.result = result;
  state.bpm = result.bpm;
  state.clef = suggestClef(result.notes);

  const panelOpts = state.analysisPanel?.getOptions();
  const nextOpts = { ...panelOpts };
  if (!panelOpts || panelOpts.tempoMode !== 'manual') {
    nextOpts.bpm = result.bpm;
    nextOpts.beatsPerBar = result.beatsPerBar;
  }
  state.analysisPanel?.setOptions(nextOpts);
  syncTtsBpmInput(state.analysisPanel?.getOptions() ?? nextOpts);
  syncControlsFromResult();
  renderNoteList(result.notes);
  paintScore(result.score.events, result.score.bpm, result.score.beatsPerBar);
  renderDiagnostics(result);
  syncGpButton();
}

async function onFileChosen(file, { exerciseId = null } = {}) {
  if (!file) return;
  setStatus(`Loading ${file.name}…`);
  setBusy(true);
  try {
    ensureAudio();
    const buf = await decodeAudioFile(file);
    state.fileName = file.name;
    state.fileBlob = file;
    state.audioBuffer = buf;
    state.result = null;
    state.exerciseId = exerciseId;

    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = URL.createObjectURL(file);
    const player = $('tts-player');
    if (player) {
      player.src = state.objectUrl;
      player.hidden = false;
    }

    const note = $('tts-file-note');
    if (note) {
      note.textContent = `${file.name} · ${buf.duration.toFixed(1)}s · ${buf.sampleRate} Hz · ${buf.numberOfChannels} ch`;
    }
    setStatus(exerciseId ? `Loaded “${baseName(file.name)}” from library.` : 'Ready to transcribe.', exerciseId ? 'ok' : '');
    const btn = $('tts-transcribe');
    if (btn) btn.disabled = false;
    const wrap = $('tts-score-wrap');
    if (wrap) wrap.innerHTML = '<p class="tts-muted">Hit Transcribe to parse pitches onto the staff.</p>';
    renderNoteList([]);
    renderDiagnostics(null);
    renderLibrary();
  } catch (err) {
    console.error(err);
    setStatus(`Could not decode audio: ${err.message || err}`, 'err');
    state.audioBuffer = null;
    state.fileBlob = null;
  } finally {
    setBusy(false);
  }
}

async function runTranscribe() {
  if (!state.audioBuffer || state.busy) return;
  setBusy(true);
  setStatus('Detecting pitches…');
  const progress = $('tts-progress');
  if (progress) {
    progress.hidden = false;
    progress.value = 0;
  }

  try {
    const options = {
      ...state.analysisPanel?.getOptions(),
      onProgress: (p) => {
        if (progress) progress.value = p;
        setStatus(`Detecting pitches… ${Math.round(p * 100)}%`);
      },
    };

    const result = await transcribeBuffer(state.audioBuffer, options);
    applyTranscriptionResult(result);

    const n = result.notes.length;
    const diag = result.diagnostics;
    let statusMsg = n
      ? `Found ${n} notes in ${result.durationSec.toFixed(1)}s (≈${result.bpm} BPM).`
      : 'No clear pitches found. Open Analysis settings and try the Sensitive preset.';
    if (n && (diag?.voicedRatio ?? 1) < 0.15) {
      statusMsg += ' Low voiced ratio — raise Pitch sensitivity or use Sensitive preset.';
    } else if (n && result.durationSec > 0 && n / result.durationSec > 8) {
      statusMsg += ' Many short notes — try Strict preset or lower Onset sensitivity.';
    }
    setStatus(statusMsg, n ? 'ok' : 'warn');
  } catch (err) {
    console.error(err);
    setStatus(`Transcription failed: ${err.message || err}`, 'err');
  } finally {
    if (progress) progress.hidden = true;
    setBusy(false);
  }
}

function requantizeAndPaint() {
  if (!state.result?.notes) return;
  const q = quantizeToScore(state.result.notes, state.bpm, { beatsPerBar: 4 });
  state.result.score = q;
  state.result.bpm = state.bpm;
  paintScore(q.events, q.bpm, 4);
}

function copyNoteList() {
  if (!state.result?.notes?.length) return;
  const text = notesToText(state.result.notes);
  navigator.clipboard?.writeText(text).then(() => {
    setStatus('Note list copied.', 'ok');
  }).catch(() => {
    setStatus('Could not copy to clipboard.', 'warn');
  });
}

async function saveToLibrary() {
  if (!state.fileBlob) {
    setStatus('Load an audio stem first.', 'err');
    return;
  }
  if (state.exerciseId && getExercise(state.exerciseId)) {
    setStatus('Already in your library.', 'ok');
    syncSaveButton();
    renderLibrary();
    return;
  }
  if (!attachmentsSupported()) {
    setStatus('Browser storage unavailable — cannot save to library.', 'err');
    return;
  }
  if (state.fileBlob.size > MAX_FILE_BYTES) {
    setStatus('File is too large to save (max 250 MB).', 'err');
    return;
  }

  setBusy(true);
  try {
    await ensurePersistentStorage();
    const name = baseName(state.fileName);
    const fileType = state.fileBlob.type || 'audio/wav';
    const meta = await saveFile({
      blob: state.fileBlob,
      name,
      type: fileType,
      fileName: state.fileName || `${name}.wav`,
      size: state.fileBlob.size,
      source: 'exercise',
    });
    if (!meta) {
      setStatus('Could not save file to storage.', 'err');
      return;
    }
    const item = addExerciseFromAttachment({
      attachmentId: meta.id,
      name,
      fileName: state.fileName || `${name}.wav`,
      type: fileType,
      size: state.fileBlob.size,
    });
    if (!item) {
      setStatus('Saved attachment, but library entry failed.', 'err');
      return;
    }
    state.exerciseId = item.id;
    renderLibrary();
    setStatus(`Saved “${name}” to library (Exercises).`, 'ok');
  } catch (err) {
    setStatus(err?.message || 'Save failed.', 'err');
  } finally {
    setBusy(false);
  }
}

async function openLibraryItem(item) {
  if (!item?.attachmentId) {
    setStatus('That library item has no file attached.', 'err');
    return;
  }
  setStatus(`Opening “${item.name}”…`);
  const blob = await getFileBlob(item.attachmentId);
  if (!blob) {
    setStatus('This file is missing from storage. Re-upload it or delete the library entry.', 'err');
    return;
  }
  const file = new File([blob], item.fileName || `${item.name}.wav`, {
    type: item.type || blob.type || 'audio/wav',
  });
  await onFileChosen(file, { exerciseId: item.id });
}

function renderLibrary() {
  const root = $('tts-library-list');
  if (!root) return;
  root.innerHTML = '';
  const items = listAudioExercises();
  if (!items.length) {
    root.appendChild(el('div', {
      class: 'tts-library-empty',
      text: 'Saved stems appear here and in Exercises. Load a track, then Save to Library.',
    }));
    return;
  }
  items.forEach((item) => {
    const active = item.id === state.exerciseId;
    const card = el('div', { class: 'tts-library-card' + (active ? ' is-active' : '') });
    card.appendChild(el('div', { class: 'tts-library-card-head' }, [
      el('div', { class: 'tts-library-card-title', text: item.name }),
      el('div', {
        class: 'tts-library-card-meta',
        text: `${item.fileName || 'Audio'} · ${fmtSize(item.size)}`,
      }),
    ]));
    const actions = el('div', { class: 'tts-library-card-actions' });
    actions.appendChild(el('button', {
      class: 'btn sm primary', type: 'button', text: active ? 'Loaded' : 'Open',
      disabled: active || state.busy,
      onClick: () => openLibraryItem(item),
    }));
    actions.appendChild(el('button', {
      class: 'btn sm', type: 'button', text: 'Rename',
      onClick: () => {
        const next = prompt('Stem name', item.name);
        if (next == null) return;
        renameExerciseItem(item.id, next);
        renderLibrary();
      },
    }));
    actions.appendChild(el('button', {
      class: 'btn sm tts-danger', type: 'button', text: 'Delete',
      onClick: async () => {
        if (!confirm(`Delete “${item.name}” from the library?`)) return;
        await deleteExerciseItem(item.id);
        if (state.exerciseId === item.id) {
          state.exerciseId = null;
          syncSaveButton();
        }
        renderLibrary();
        setStatus(`Deleted “${item.name}”.`, 'ok');
      },
    }));
    card.appendChild(actions);
    root.appendChild(card);
  });
  syncSaveButton();
}

function bind() {
  if (state.bound) return;
  state.bound = true;

  const fileInput = $('tts-file');
  fileInput?.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0];
    if (f) onFileChosen(f);
    fileInput.value = '';
  });

  $('tts-transcribe')?.addEventListener('click', runTranscribe);
  $('tts-copy')?.addEventListener('click', copyNoteList);
  $('tts-open-gp')?.addEventListener('click', openInGpPlayer);
  $('tts-save')?.addEventListener('click', saveToLibrary);

  $('tts-bpm')?.addEventListener('change', () => {
    const v = Number($('tts-bpm').value);
    if (v >= 40 && v <= 240) {
      syncPanelFromTtsBpm();
      requantizeAndPaint();
    }
  });

  $('tts-clef')?.addEventListener('change', () => {
    state.clef = $('tts-clef').value;
    if (state.result) paintScore(state.result.score.events, state.bpm, 4);
  });

  $('tts-accidentals')?.addEventListener('change', () => {
    state.preferSharps = $('tts-accidentals').value === 'sharps';
    if (state.result) paintScore(state.result.score.events, state.bpm, 4);
  });

  // Drag & drop on the drop zone
  const drop = $('tts-drop');
  if (drop) {
    const hi = (on) => drop.classList.toggle('dragover', on);
    drop.addEventListener('dragenter', (e) => { e.preventDefault(); hi(true); });
    drop.addEventListener('dragover', (e) => { e.preventDefault(); hi(true); });
    drop.addEventListener('dragleave', () => hi(false));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      hi(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) onFileChosen(f);
    });
  }
}

export function initTrackToSheet() {
  bind();
  const mount = $('tts-analysis-mount');
  if (mount && !mount.dataset.wired) {
    mount.dataset.wired = '1';
    state.analysisPanel = createAnalysisPanel({
      mount,
      storageKey: 'ttsAnalysisOptions',
      idPrefix: 'tts-analysis',
      onReanalyze: () => runTranscribe(),
      onChange: (opts) => {
        syncTtsBpmInput(opts);
        if (state.result && !state.busy) requantizeAndPaint();
      },
    });
  }
  const btn = $('tts-transcribe');
  if (btn) btn.disabled = !state.audioBuffer || state.busy;
  syncSaveButton();
  syncGpButton();
  renderLibrary();
}

export function stopTrackToSheet() {
  const player = $('tts-player');
  if (player && !player.paused) {
    player.pause();
  }
}
