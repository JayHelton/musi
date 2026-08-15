// Standalone Guitar Pro track player screen.
// Upload a .gp / .gp5 file, pick a track, practice with tempo / transpose / tuning.
// Saved scores live in the shared Exercises library.

import {
  mountGpPlayer,
  isGuitarProName,
} from './gpPlayerUI.js';
import { parseGuitarProWithProgress } from './tab/gpParseClient.js';
import {
  saveFile,
  getFileBlob,
  attachmentsSupported,
  ensurePersistentStorage,
} from './attachments.js';
import {
  addGpExerciseFromAttachment,
  listGpExercises,
  renameExerciseItem,
  deleteExerciseItem,
  getExercise,
  updateExercisePracticeSettings,
  getCategories,
  addCategory,
  isTabModelItem,
} from './exercises.js';
import { resolveScoreKey, migrateAnnotations, copyAnnotations } from './gpAnnotations.js';
import { beatsFromMeasureRange } from './gpPlayer/rangeUtils.js';
import { formatBarRange } from './gpPlayer/measureDigest.js';
import {
  gpResultFromTabModelJson,
  serializeExerciseScore,
  sliceGpResultByBeats,
  segmentExerciseFileName,
} from './gpExerciseScore.js';

const state = {
  bound: false,
  mount: null,
  title: '',
  fileName: '',
  bytes: null,
  gp: null,
  exerciseId: null,
  attachmentId: null,
  loading: false,
  parseAbort: null,
};

let loadGeneration = 0;

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
  const box = $('gpp-status');
  if (!box) return;
  box.textContent = msg || '';
  box.dataset.kind = kind;
  box.hidden = !msg;
}

function setReadProgress(ratio) {
  const root = $('gpp-read-progress');
  const bar = $('gpp-read-progress-bar');
  const label = $('gpp-read-progress-label');
  if (!root || !bar || !label) return;
  if (ratio == null || !Number.isFinite(ratio)) {
    root.hidden = true;
    root.setAttribute('aria-valuenow', '0');
    bar.style.width = '0%';
    return;
  }
  const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  root.hidden = false;
  root.setAttribute('aria-valuenow', String(pct));
  bar.style.width = `${pct}%`;
  label.textContent = pct >= 100 ? 'Finishing…' : `Reading file… ${pct}%`;
}

function formatLoadError(err) {
  const msg = err?.message || '';
  if (!msg) {
    return 'Could not read that file. Choose another .gp or .gp5 file and try again.';
  }
  if (msg.includes('Guitar Pro 6 (.gpx)') || msg.includes('older binary Guitar Pro')) {
    return msg;
  }
  if (msg.includes('Unrecognized file')) {
    return `${msg} Export the score from Guitar Pro as .gp or .gp5 and try again.`;
  }
  if (msg.includes('no fretted') || msg.includes('no playable')) {
    return `${msg} Open the score in Guitar Pro and export a part with guitar, bass, or drums.`;
  }
  if (msg.includes('unexpected end of file') || msg.includes('no score.gpif')) {
    return `${msg} The file may be corrupt. Re-export it from Guitar Pro and try again.`;
  }
  return `${msg} Choose another .gp or .gp5 file and try again.`;
}

function setStageVisible(visible) {
  const stage = $('gpp-stage');
  const drop = $('gpp-drop');
  if (stage) stage.hidden = !visible;
  if (drop) drop.hidden = !!visible;
}

function setLoading(loading) {
  state.loading = !!loading;
  const drop = $('gpp-drop');
  const input = $('gpp-file');
  if (drop) drop.classList.toggle('is-loading', state.loading);
  if (input) input.disabled = state.loading;
  drop?.querySelectorAll('button').forEach((btn) => { btn.disabled = state.loading; });
}

function resetStandaloneShell() {
  const section = $('sec-gpplayer');
  const stage = $('gpp-stage');
  section?.classList.remove('gpp-score-loaded');
  if (typeof document !== 'undefined') {
    document.documentElement?.classList?.remove('gpp-player-locked');
  }
  if (stage) {
    stage.classList.remove('gpp-root', 'is-loading', 'gpp-has-layout-metrics');
    if (!state.mount) stage.innerHTML = '';
  }
}

function destroyMount() {
  if (state.parseAbort) {
    try { state.parseAbort.abort(); } catch (e) { /* ignore */ }
    state.parseAbort = null;
  }
  if (state.mount) {
    try { state.mount.destroy(); } catch (e) { /* ignore */ }
    state.mount = null;
  }
  resetStandaloneShell();
}

function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function makeHeaderExtras() {
  const wrap = document.createElement('div');
  wrap.className = 'gpp-head-extra-wrap';

  const noGpBytes = !state.bytes;
  const saveBarsBtn = document.createElement('button');
  saveBarsBtn.className = 'btn sm primary';
  saveBarsBtn.type = 'button';
  saveBarsBtn.textContent = 'Save as Exercise';
  saveBarsBtn.setAttribute('aria-label', 'Save selected bars as exercise');
  saveBarsBtn.title = 'Save selected bars as exercise';
  saveBarsBtn.addEventListener('click', () => saveSelectedBarsAsExercise());
  wrap.appendChild(saveBarsBtn);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn sm';
  saveBtn.type = 'button';
  saveBtn.textContent = state.exerciseId ? 'Full score in library' : 'Save full score';
  saveBtn.setAttribute('aria-label', state.exerciseId ? 'Full score already in library' : 'Save full score to library');
  saveBtn.title = state.exerciseId ? 'Full score already in library' : 'Save full score to library';
  if (state.exerciseId || noGpBytes) saveBtn.disabled = true;
  saveBtn.addEventListener('click', () => saveToLibrary());
  wrap.appendChild(saveBtn);

  return wrap;
}

function mountCurrent() {
  const stage = $('gpp-stage');
  if (!stage || !state.gp) return;
  destroyMount();
  setStageVisible(true);
  const exercise = state.exerciseId ? getExercise(state.exerciseId) : null;
  const displayTitle = state.title
    || (state.fileName || 'score').replace(/\.(gp|gp5|riff)$/i, '');
  const hasRange = exercise && (exercise.loopEnabled || exercise.measureStart != null);
  try {
    state.mount = mountGpPlayer(stage, {
      gpResult: state.gp,
      title: displayTitle,
      fileName: state.fileName,
      initialLoopEnabled: exercise ? !!exercise.loopEnabled : false,
      initialLoopStart: exercise?.measureStart,
      initialLoopEnd: exercise?.measureEnd,
      initialLoopStartBeat: exercise?.startBeat,
      initialLoopEndBeat: exercise?.endBeat,
      loopRestSec: exercise?.loopRestSec || 0,
      preferredTrackIndex: exercise?.preferredTrackIndex || 0,
      initialBpm: exercise?.bpm,
      initialTranspose: exercise?.transpose,
      initialTuning: exercise?.tuning,
      initialRetuneMode: exercise?.retuneMode,
      exerciseScope: !!hasRange,
      headerExtra: makeHeaderExtras(),
      onOpenFile: () => {
        if (!state.loading) $('gpp-file')?.click();
      },
      onCloseScore: unloadCurrentScore,
      scoreKey: resolveScoreKey({
        attachmentId: state.attachmentId,
        fileName: state.fileName,
        byteLength: state.bytes?.length,
      }),
      exerciseImport: state.gp ? {
        getFolders: () => getCategories(),
        createFolder: (name) => addCategory(name),
        importSegments: (segments, opts) => importSegmentsAsExercises(segments, opts),
      } : null,
    });
  } catch (err) {
    destroyMount();
    setStageVisible(false);
    setStatus(err?.message || 'Could not open the player.', 'error');
    console.error(err);
  }
}

function hasPlayableTracks(gp) {
  return (gp?.tracks?.length > 0) || (gp?.drumTracks?.length > 0);
}

async function loadFile(file, { exerciseId = null, attachmentId = null } = {}) {
  if (!file || state.loading) return;
  const isTab = isTabModelItem({ fileName: file.name, type: file.type });
  if (!isTab && !isGuitarProName(file.name)) {
    setStatus('Choose a Guitar Pro .gp or .gp5 file. Export older scores from Guitar Pro first.', 'error');
    return;
  }
  const gen = ++loadGeneration;
  setLoading(true);
  setStatus(`Reading ${file.name}…`);
  setReadProgress(0);
  destroyMount();
  const parseAbort = new AbortController();
  state.parseAbort = parseAbort;
  try {
    let gp;
    let bytes = null;
    if (isTab) {
      const raw = JSON.parse(await file.text());
      gp = gpResultFromTabModelJson(raw, {
        fallbackName: (file.name || 'Exercise').replace(/\.musi-tab\.json$/i, ''),
      });
    } else {
      const buf = await file.arrayBuffer();
      bytes = new Uint8Array(buf);
      gp = await parseGuitarProWithProgress(bytes, {
        signal: parseAbort.signal,
        onProgress: (ratio) => {
          if (!state.loading) return;
          setReadProgress(ratio);
        },
      });
    }
    // A newer load wins, and a cancelled read stops here.
    if (gen !== loadGeneration) return;
    if (parseAbort.signal.aborted) return;
    if (!hasPlayableTracks(gp)) {
      setStageVisible(false);
      setReadProgress(null);
      setStatus(
        'No playable tracks found in that file. Open it in Guitar Pro and export a part with guitar, bass, or drums.',
        'error',
      );
      return;
    }
    state.title = '';
    state.fileName = file.name;
    state.gp = gp;
    state.bytes = bytes;
    state.exerciseId = exerciseId;
    state.attachmentId = attachmentId;
    mountCurrent();
    const fretted = gp.tracks?.length || 0;
    const drums = gp.drumTracks?.length || 0;
    const tempo = gp.tempo || gp.tracks[0]?.model?.tempo || gp.drumTracks?.[0]?.model?.tempo || 120;
    const parts = [];
    if (fretted) parts.push(`${fretted} guitar/bass track${fretted === 1 ? '' : 's'}`);
    if (drums) parts.push(`${drums} drum part${drums === 1 ? '' : 's'}`);
    setStatus(`Loaded ${file.name} · ${parts.join(' · ')} · ${Math.round(tempo)} BPM`);
  } catch (err) {
    if (gen !== loadGeneration) return;
    if (err?.name === 'AbortError') return;
    destroyMount();
    setStageVisible(false);
    setStatus(formatLoadError(err), 'error');
  } finally {
    if (state.parseAbort === parseAbort) state.parseAbort = null;
    if (gen === loadGeneration) {
      setReadProgress(null);
      setLoading(false);
    }
  }
}

async function saveToLibrary() {
  if (!state.bytes) {
    setStatus(
      state.gp
        ? 'This riff was transcribed from audio — saving the full score as a GP file isn\u2019t available yet.'
        : 'Load a Guitar Pro file first.',
      'error'
    );
    return;
  }
  if (state.exerciseId && getExercise(state.exerciseId)) {
    setStatus('Already in your library.');
    renderLibrary();
    return;
  }
  if (!attachmentsSupported()) {
    setStatus('Browser storage unavailable — cannot save to library.', 'error');
    return;
  }
  try {
    await ensurePersistentStorage();
    const blob = new Blob([state.bytes], { type: 'application/octet-stream' });
    const defaultName = (state.fileName || 'exercise').replace(/\.(gp|gp5)$/i, '');
    const name = prompt('Exercise name', defaultName);
    if (name == null) return;
    const trimmed = name.trim() || defaultName;
    let attachmentId = state.attachmentId;
    if (attachmentId) {
      const existing = await getFileBlob(attachmentId);
      if (!existing) attachmentId = null;
    }
    let meta;
    if (attachmentId) {
      meta = { id: attachmentId };
    } else {
      meta = await saveFile({
        blob,
        name: trimmed,
        type: 'application/x-guitar-pro',
        fileName: state.fileName || `${trimmed}.gp`,
        size: blob.size,
        source: 'exercise',
      });
      if (!meta) {
        setStatus('Could not save file to storage.', 'error');
        return;
      }
      state.attachmentId = meta.id;
    }
    const st = state.mount?.getState?.() || {};
    const item = addGpExerciseFromAttachment({
      attachmentId: meta.id,
      name: trimmed,
      fileName: state.fileName || `${trimmed}.gp`,
      type: 'application/x-guitar-pro',
      size: blob.size,
      preferredTrackIndex: st.trackIndex >= 0 ? st.trackIndex : 0,
      bpm: st.bpm,
      transpose: Number.isFinite(st.transpose) ? st.transpose : 0,
      tuning: st.tuning ?? null,
      retuneMode: st.retuneMode === 'pitches' ? 'pitches' : 'fingerings',
    });
    if (!item) {
      setStatus('Saved attachment, but library entry failed.', 'error');
      return;
    }
    const fromKey = resolveScoreKey({
      fileName: state.fileName,
      byteLength: state.bytes?.length,
    });
    const toKey = resolveScoreKey({
      attachmentId: meta.id,
      fileName: state.fileName,
      byteLength: state.bytes?.length,
    });
    migrateAnnotations(fromKey, toKey);
    state.exerciseId = item.id;
    state.attachmentId = meta.id;
    mountCurrent();
    renderLibrary();
    setStatus(`Saved “${trimmed}” to library (Exercises).`);
  } catch (err) {
    setStatus(err?.message || 'Save failed.', 'error');
  }
}

function scoreBaseName(fileName) {
  return (fileName || 'score')
    .replace(/\.musi-tab\.json$/i, '')
    .replace(/\.(gp|gp5)$/i, '');
}

/** Bulk-import measure segments from the split panel into the Exercises library. */
async function importSegmentsAsExercises(segments, { categoryId = '' } = {}) {
  if (!state.gp) {
    return { ok: false, message: 'Load a Guitar Pro file first.' };
  }
  if (!attachmentsSupported()) {
    return { ok: false, message: 'Browser storage unavailable — cannot save exercises.' };
  }
  if (!Array.isArray(segments) || !segments.length) {
    return { ok: false, message: 'Group some bars first.' };
  }
  try {
    await ensurePersistentStorage();
    const base = scoreBaseName(state.fileName);
    const sourceFileName = state.fileName || `${base}.gp`;

    const st = state.mount?.getState?.() || {};
    const measureCount = state.gp.tracks?.[st.trackIndex >= 0 ? st.trackIndex : 0]?.model?.measures?.length
      || state.gp.tracks?.[0]?.model?.measures?.length
      || state.gp.drumTracks?.[0]?.model?.measures?.length
      || 1;
    const measures = state.gp.tracks?.[st.trackIndex >= 0 ? st.trackIndex : 0]?.model?.measures
      || state.gp.tracks?.[0]?.model?.measures
      || state.gp.drumTracks?.[0]?.model?.measures
      || [];

    let count = 0;
    // Reverse so addExercise prepends in score order (library reads top-to-bottom).
    for (const segment of [...segments].reverse()) {
      const rawStart = Number(segment?.startIdx);
      const rawEnd = Number(segment?.endIdx);
      if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) continue;
      const startIdx = Math.max(0, Math.min(measureCount - 1, Math.floor(Math.min(rawStart, rawEnd))));
      const endIdx = Math.max(startIdx, Math.min(measureCount - 1, Math.floor(Math.max(rawStart, rawEnd))));
      const beatFallback = beatsFromMeasureRange(measures, startIdx, endIdx);
      const startBeat = Number.isFinite(segment.startBeat) ? segment.startBeat : beatFallback.startBeat;
      const endBeat = Number.isFinite(segment.endBeat) ? segment.endBeat : beatFallback.endBeat;
      const name = (segment.name || '').trim()
        || formatBarRange(startIdx, endIdx)
        || `bars ${startIdx + 1}–${endIdx + 1}`;
      const slicedGp = sliceGpResultByBeats(state.gp, { startBeat, endBeat });
      const json = serializeExerciseScore(slicedGp, {
        sourceFileName,
        measureStart: startIdx,
        measureEnd: endIdx,
      });
      const blob = new Blob([json], { type: 'application/x-musi-tab-model' });
      const segFileName = segmentExerciseFileName(base, name);
      const meta = await saveFile({
        blob,
        name: name.replace(/[^\w\- ]+/g, '').trim() || 'exercise',
        type: 'application/x-musi-tab-model',
        fileName: segFileName,
        size: blob.size,
        source: 'exercise',
      });
      if (!meta) continue;
      const item = addGpExerciseFromAttachment({
        attachmentId: meta.id,
        name,
        fileName: segFileName,
        type: 'application/x-musi-tab-model',
        size: blob.size,
        categoryId,
        loopEnabled: true,
        loopRestSec: Number.isFinite(st.loopRestSec) ? st.loopRestSec : 0,
        preferredTrackIndex: st.trackIndex >= 0 ? st.trackIndex : 0,
        bpm: Number.isFinite(st.bpm) ? st.bpm : null,
        transpose: Number.isFinite(st.transpose) ? st.transpose : 0,
        tuning: st.tuning ?? null,
        retuneMode: st.retuneMode === 'pitches' ? 'pitches' : 'fingerings',
      });
      if (item) count += 1;
    }

    if (!count) {
      return { ok: false, message: 'Could not save any exercise segments.' };
    }

    renderLibrary();
    const rangeSummary = segments.length <= 4
      ? segments.map((s) => {
        const a = Math.min(s.startIdx, s.endIdx) + 1;
        const b = Math.max(s.startIdx, s.endIdx) + 1;
        return a === b ? `bar ${a}` : `bars ${a}–${b}`;
      }).join(', ')
      : '';
    const message = rangeSummary
      ? `Imported ${count} exercise${count === 1 ? '' : 's'} (${rangeSummary}).`
      : `Imported ${count} exercise${count === 1 ? '' : 's'}.`;
    setStatus(message);
    return { ok: true, count, message };
  } catch (err) {
    return { ok: false, message: err?.message || 'Save failed.' };
  }
}

/** Save the currently highlighted / looped measure range as an Exercise. */
async function saveSelectedBarsAsExercise() {
  if (!state.gp) {
    setStatus('Load a Guitar Pro file first.', 'error');
    return;
  }
  if (!attachmentsSupported()) {
    setStatus('Browser storage unavailable — cannot save exercise.', 'error');
    return;
  }
  const st = state.mount?.getState?.() || {};
  const measureCount = state.gp.tracks?.[st.trackIndex >= 0 ? st.trackIndex : 0]?.model?.measures?.length
    || state.gp.tracks?.[0]?.model?.measures?.length
    || state.gp.drumTracks?.[0]?.model?.measures?.length
    || 1;
  const measures = state.gp.tracks?.[st.trackIndex >= 0 ? st.trackIndex : 0]?.model?.measures
    || state.gp.tracks?.[0]?.model?.measures
    || state.gp.drumTracks?.[0]?.model?.measures
    || [];
  let a = Number.isFinite(st.loopStart) ? st.loopStart : 0;
  let b = Number.isFinite(st.loopEnd) ? st.loopEnd : Math.max(0, measureCount - 1);
  a = Math.max(0, Math.min(measureCount - 1, Math.floor(Math.min(a, b))));
  b = Math.max(a, Math.min(measureCount - 1, Math.floor(Math.max(a, b))));
  const base = scoreBaseName(state.fileName);
  const defaultName = `${base} · bars ${a + 1}–${b + 1}`;
  const prompted = prompt('Exercise name', defaultName);
  if (prompted == null) return;
  const name = prompted.trim() || defaultName;
  const isFullScore = a === 0 && b === measureCount - 1;
  const saveOriginalGp = isFullScore && state.bytes;
  try {
    await ensurePersistentStorage();
    let meta;
    let exerciseFileName;
    let exerciseType;
    let exerciseSize;
    if (saveOriginalGp) {
      const blob = new Blob([state.bytes], { type: 'application/octet-stream' });
      exerciseFileName = state.fileName || `${base}.gp`;
      exerciseType = 'application/x-guitar-pro';
      exerciseSize = blob.size;
      meta = await saveFile({
        blob,
        name: name.replace(/[^\w\- ]+/g, '').trim() || 'exercise',
        type: exerciseType,
        fileName: exerciseFileName,
        size: exerciseSize,
        source: 'exercise',
      });
    } else if (isFullScore) {
      const json = serializeExerciseScore(state.gp, {
        sourceFileName: state.fileName || `${base}.musi-tab.json`,
      });
      const blob = new Blob([json], { type: 'application/x-musi-tab-model' });
      exerciseFileName = state.fileName || `${base}.musi-tab.json`;
      exerciseType = 'application/x-musi-tab-model';
      exerciseSize = blob.size;
      meta = await saveFile({
        blob,
        name: name.replace(/[^\w\- ]+/g, '').trim() || 'exercise',
        type: exerciseType,
        fileName: exerciseFileName,
        size: exerciseSize,
        source: 'exercise',
      });
    } else {
      const beatFallback = beatsFromMeasureRange(measures, a, b);
      const startBeat = Number.isFinite(st.loopStartBeat) ? st.loopStartBeat : beatFallback.startBeat;
      const endBeat = Number.isFinite(st.loopEndBeat) ? st.loopEndBeat : beatFallback.endBeat;
      const slicedGp = sliceGpResultByBeats(state.gp, { startBeat, endBeat });
      const json = serializeExerciseScore(slicedGp, {
        sourceFileName: state.fileName || `${base}.gp`,
        measureStart: a,
        measureEnd: b,
      });
      const blob = new Blob([json], { type: 'application/x-musi-tab-model' });
      exerciseFileName = segmentExerciseFileName(base, name);
      exerciseType = 'application/x-musi-tab-model';
      exerciseSize = blob.size;
      meta = await saveFile({
        blob,
        name: name.replace(/[^\w\- ]+/g, '').trim() || 'exercise',
        type: exerciseType,
        fileName: exerciseFileName,
        size: exerciseSize,
        source: 'exercise',
      });
    }
    if (!meta) {
      setStatus('Could not save file to storage.', 'error');
      return;
    }
    const item = addGpExerciseFromAttachment({
      attachmentId: meta.id,
      name,
      fileName: exerciseFileName,
      type: exerciseType,
      size: exerciseSize,
      loopEnabled: true,
      loopRestSec: Number.isFinite(st.loopRestSec) ? st.loopRestSec : 0,
      preferredTrackIndex: st.trackIndex >= 0 ? st.trackIndex : 0,
      bpm: Number.isFinite(st.bpm) ? st.bpm : null,
      transpose: Number.isFinite(st.transpose) ? st.transpose : 0,
      tuning: st.tuning ?? null,
      retuneMode: st.retuneMode === 'pitches' ? 'pitches' : 'fingerings',
    });
    if (!item) {
      setStatus('Saved attachment, but library entry failed.', 'error');
      return;
    }
    if (saveOriginalGp) {
      const fromKey = resolveScoreKey({
        attachmentId: state.attachmentId,
        fileName: state.fileName,
        byteLength: state.bytes?.length,
      });
      const toKey = resolveScoreKey({
        attachmentId: meta.id,
        fileName: state.fileName,
        byteLength: state.bytes?.length,
      });
      copyAnnotations(fromKey, toKey);
    }
    if (Number.isFinite(st.bpm) && st.bpm !== item.bpm) {
      updateExercisePracticeSettings(item.id, { bpm: st.bpm });
    }
    renderLibrary();
    const barMsg = isFullScore ? 'full score' : `bars ${a + 1}–${b + 1}`;
    setStatus(`Saved “${item.name}” to Exercises (${barMsg}).`);
  } catch (err) {
    setStatus(err?.message || 'Save failed.', 'error');
  }
}

async function openLibraryItem(item) {
  if (!item?.attachmentId) {
    setStatus('That library item has no file attached.', 'error');
    return;
  }
  if (state.loading) return;
  setStatus(`Opening “${item.name}”…`);
  const blob = await getFileBlob(item.attachmentId);
  if (!blob) {
    setStatus('This file is missing from storage. Re-upload it or delete the library entry.', 'error');
    return;
  }
  const file = new File([blob], item.fileName || `${item.name}.gp`, {
    type: item.type || 'application/octet-stream',
  });
  await loadFile(file, { exerciseId: item.id, attachmentId: item.attachmentId });
}

function renderLibrary() {
  const root = $('gpp-library-list');
  if (!root) return;
  root.innerHTML = '';
  const items = listGpExercises();
  if (!items.length) {
    root.appendChild(el('div', {
      class: 'gpp-library-empty',
      text: 'Saved Guitar Pro scores appear here and in Exercises. Load a file, then Save to Library.',
    }));
    return;
  }
  items.forEach((item) => {
    const active = item.id === state.exerciseId;
    const card = el('div', { class: 'gpp-library-card' + (active ? ' is-active' : '') });
    card.appendChild(el('div', { class: 'gpp-library-card-head' }, [
      el('div', { class: 'gpp-library-card-title', text: item.name }),
      el('div', {
        class: 'gpp-library-card-meta',
        text: `${item.fileName || 'Guitar Pro'} · ${fmtSize(item.size)}`,
      }),
    ]));
    const actions = el('div', { class: 'gpp-library-card-actions' });
    actions.appendChild(el('button', {
      class: 'btn sm primary', type: 'button', text: active ? 'Playing' : 'Open',
      disabled: active || state.loading,
      onClick: () => openLibraryItem(item),
    }));
    actions.appendChild(el('button', {
      class: 'btn sm', type: 'button', text: 'Rename',
      onClick: () => {
        const next = prompt('Score name', item.name);
        if (next == null) return;
        renameExerciseItem(item.id, next);
        renderLibrary();
        if (item.id === state.exerciseId) mountCurrent();
      },
    }));
    actions.appendChild(el('button', {
      class: 'btn sm gpp-danger', type: 'button', text: 'Delete',
      onClick: async () => {
        if (!confirm(`Delete “${item.name}” from the library?`)) return;
        await deleteExerciseItem(item.id);
        if (state.exerciseId === item.id) {
          state.exerciseId = null;
          if (state.gp) mountCurrent();
        }
        renderLibrary();
        setStatus(`Deleted “${item.name}”.`);
      },
    }));
    card.appendChild(actions);
    root.appendChild(card);
  });
}

function bindDrop() {
  const drop = $('gpp-drop');
  const input = $('gpp-file');
  if (!drop || !input) return;

  const onFiles = (files) => {
    if (state.loading) return;
    const file = files && files[0];
    if (file) {
      state.exerciseId = null;
      state.attachmentId = null;
      loadFile(file);
    }
  };

  input.addEventListener('change', () => {
    onFiles(input.files);
    input.value = '';
  });

  ['dragenter', 'dragover'].forEach((type) => {
    drop.addEventListener(type, (e) => {
      e.preventDefault();
      if (!state.loading) drop.classList.add('is-drag');
    });
  });
  ['dragleave', 'drop'].forEach((type) => {
    drop.addEventListener(type, (e) => {
      e.preventDefault();
      drop.classList.remove('is-drag');
      if (type === 'drop' && !state.loading) onFiles(e.dataTransfer?.files);
    });
  });
}

function remountIfNeeded() {
  if (!state.gp) {
    setStageVisible(false);
    return;
  }
  if (state.mount) return;
  mountCurrent();
}

export function unloadCurrentScore() {
  loadGeneration += 1;
  setLoading(false);
  destroyMount();
  resetStandaloneShell();
  state.gp = null;
  state.bytes = null;
  state.title = '';
  state.fileName = '';
  state.exerciseId = null;
  state.attachmentId = null;
  setStageVisible(false);
  renderLibrary();
  setStatus('Score closed.');
}

export function initGpPlayer() {
  if (!state.bound) {
    state.bound = true;
    bindDrop();
  }
  remountIfNeeded();
  renderLibrary();
}

export function stopGpPlayer() {
  destroyMount();
  resetStandaloneShell();
  setReadProgress(null);
  setLoading(false);
}

/** Load a GP file programmatically (e.g. from Exercises deep-link). */
export async function loadGpPlayerBytes(bytes, fileName = 'score.gp', opts = {}) {
  const file = new File([bytes], fileName, { type: 'application/octet-stream' });
  await loadFile(file, opts);
}

/** Open the GP player with an in-memory parse result (no .gp file bytes). */
export function loadGpPlayerResult(gpResult, {
  title = 'Vocal riff',
  fileName = '',
  exerciseId = null,
} = {}) {
  if (!(gpResult?.tracks?.length)) {
    setStatus('No fretted guitar/bass track in that transcription.', 'error');
    return;
  }
  destroyMount();
  state.title = title;
  state.fileName = fileName || `${title}.riff`;
  state.bytes = null;
  state.gp = gpResult;
  state.exerciseId = exerciseId;
  try {
    mountCurrent();
    if (!state.mount) return null;
    const tempo = gpResult.tempo || gpResult.tracks[0]?.model?.tempo || 120;
    setStatus(
      `${title} · ${gpResult.tracks.length} track${gpResult.tracks.length === 1 ? '' : 's'} · ${Math.round(tempo)} BPM`
    );
    window.showSection?.('gpplayer');
    return state.mount;
  } catch (err) {
    setStageVisible(false);
    setStatus(err?.message || 'Could not open the player.', 'error');
    console.error(err);
    return null;
  }
}
