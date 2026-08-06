// Standalone Guitar Pro track player screen.
// Upload a .gp / .gp5 file, pick a track, practice with tempo / transpose / tuning.
// Saved scores live in the shared Exercises library.

import {
  mountGpPlayer,
  parseGuitarPro,
  isGuitarProName,
} from './gpPlayerUI.js';
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
} from './exercises.js';

const state = {
  bound: false,
  mount: null,
  fileName: '',
  bytes: null,
  gp: null,
  exerciseId: null,
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
  const box = $('gpp-status');
  if (!box) return;
  box.textContent = msg || '';
  box.dataset.kind = kind;
  box.hidden = !msg;
}

function setStageVisible(visible) {
  const stage = $('gpp-stage');
  const drop = $('gpp-drop');
  if (stage) stage.hidden = !visible;
  // Hide the upload drop while a score is open so the player isn't stacked under a second import UI.
  if (drop) drop.hidden = !!visible;
}

function destroyMount() {
  if (state.mount) {
    try { state.mount.destroy(); } catch (e) { /* ignore */ }
    state.mount = null;
  }
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

  const loadBtn = document.createElement('button');
  loadBtn.className = 'btn sm';
  loadBtn.type = 'button';
  loadBtn.textContent = 'Load another';
  loadBtn.addEventListener('click', () => {
    $('gpp-file')?.click();
  });
  wrap.appendChild(loadBtn);

  const saveBarsBtn = document.createElement('button');
  saveBarsBtn.className = 'btn sm primary';
  saveBarsBtn.type = 'button';
  saveBarsBtn.textContent = 'Save selected bars as Exercise';
  saveBarsBtn.addEventListener('click', () => saveSelectedBarsAsExercise());
  wrap.appendChild(saveBarsBtn);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn sm';
  saveBtn.type = 'button';
  saveBtn.textContent = state.exerciseId ? 'Full score in library' : 'Save full score';
  if (state.exerciseId) saveBtn.disabled = true;
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
  state.mount = mountGpPlayer(stage, {
    gpResult: state.gp,
    title: (state.fileName || 'score').replace(/\.(gp|gp5)$/i, ''),
    fileName: state.fileName,
    initialLoopEnabled: exercise ? !!exercise.loopEnabled : false,
    initialLoopStart: exercise?.measureStart,
    initialLoopEnd: exercise?.measureEnd,
    initialLoopStartBeat: exercise?.startBeat,
    initialLoopEndBeat: exercise?.endBeat,
    loopRestSec: exercise?.loopRestSec || 0,
    preferredTrackIndex: exercise?.preferredTrackIndex || 0,
    headerExtra: makeHeaderExtras(),
  });
}

async function loadFile(file, { exerciseId = null } = {}) {
  if (!file) return;
  if (!isGuitarProName(file.name)) {
    setStatus('Choose a Guitar Pro .gp or .gp5 file.', 'error');
    return;
  }
  setStatus(`Reading ${file.name}…`);
  try {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const gp = await parseGuitarPro(bytes);
    if (!(gp.tracks || []).length) {
      setStageVisible(false);
      const drumN = (gp.drumTracks || []).length;
      setStatus(
        drumN
          ? 'This file has drum parts but no fretted guitar/bass track. Open it in Drums to practice the kit.'
          : 'No fretted guitar/bass track found in that file.',
        'error'
      );
      return;
    }
    state.fileName = file.name;
    state.bytes = bytes;
    state.gp = gp;
    state.exerciseId = exerciseId;
    mountCurrent();
    const tempo = gp.tempo || gp.tracks[0]?.model?.tempo || 120;
    setStatus(`Loaded ${file.name} · ${gp.tracks.length} track${gp.tracks.length === 1 ? '' : 's'} · ${Math.round(tempo)} BPM`);
  } catch (err) {
    setStageVisible(false);
    setStatus(err?.message || 'Could not read that Guitar Pro file.', 'error');
  }
}

async function saveToLibrary() {
  if (!state.bytes) {
    setStatus('Load a Guitar Pro file first.', 'error');
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
    const name = (state.fileName || 'exercise').replace(/\.(gp|gp5)$/i, '');
    const meta = await saveFile({
      blob,
      name,
      type: 'application/x-guitar-pro',
      fileName: state.fileName || `${name}.gp`,
      size: blob.size,
      source: 'exercise',
    });
    if (!meta) {
      setStatus('Could not save file to storage.', 'error');
      return;
    }
    const item = addGpExerciseFromAttachment({
      attachmentId: meta.id,
      name,
      fileName: state.fileName || `${name}.gp`,
      type: 'application/x-guitar-pro',
      size: blob.size,
    });
    if (!item) {
      setStatus('Saved attachment, but library entry failed.', 'error');
      return;
    }
    state.exerciseId = item.id;
    mountCurrent();
    renderLibrary();
    setStatus(`Saved “${name}” to library (Exercises).`);
  } catch (err) {
    setStatus(err?.message || 'Save failed.', 'error');
  }
}

/** Save the currently highlighted / looped measure range as an Exercise. */
async function saveSelectedBarsAsExercise() {
  if (!state.bytes || !state.gp) {
    setStatus('Load a Guitar Pro file first.', 'error');
    return;
  }
  if (!attachmentsSupported()) {
    setStatus('Browser storage unavailable — cannot save exercise.', 'error');
    return;
  }
  const st = state.mount?.getState?.() || {};
  const measureCount = state.gp.tracks?.[st.trackIndex || 0]?.model?.measures?.length
    || state.gp.tracks?.[0]?.model?.measures?.length
    || 1;
  let a = Number.isFinite(st.loopStart) ? st.loopStart : 0;
  let b = Number.isFinite(st.loopEnd) ? st.loopEnd : Math.max(0, measureCount - 1);
  a = Math.max(0, Math.min(measureCount - 1, Math.floor(Math.min(a, b))));
  b = Math.max(a, Math.min(measureCount - 1, Math.floor(Math.max(a, b))));
  const base = (state.fileName || 'score').replace(/\.(gp|gp5)$/i, '');
  const name = `${base} · bars ${a + 1}–${b + 1}`;
  try {
    await ensurePersistentStorage();
    const blob = new Blob([state.bytes], { type: 'application/octet-stream' });
    const meta = await saveFile({
      blob,
      name: name.replace(/[^\w\- ]+/g, '').trim() || 'exercise',
      type: 'application/x-guitar-pro',
      fileName: state.fileName || `${base}.gp`,
      size: blob.size,
      source: 'exercise',
    });
    if (!meta) {
      setStatus('Could not save file to storage.', 'error');
      return;
    }
    const item = addGpExerciseFromAttachment({
      attachmentId: meta.id,
      name,
      fileName: state.fileName || `${base}.gp`,
      type: 'application/x-guitar-pro',
      size: blob.size,
      measureStart: a,
      measureEnd: b,
      startBeat: Number.isFinite(st.loopStartBeat) ? st.loopStartBeat : null,
      endBeat: Number.isFinite(st.loopEndBeat) ? st.loopEndBeat : null,
      loopEnabled: true,
      loopRestSec: Number.isFinite(st.loopRestSec) ? st.loopRestSec : 0,
      preferredTrackIndex: st.trackIndex || 0,
    });
    if (!item) {
      setStatus('Saved attachment, but library entry failed.', 'error');
      return;
    }
    renderLibrary();
    setStatus(`Saved “${item.name}” to Exercises (bars ${a + 1}–${b + 1}).`);
  } catch (err) {
    setStatus(err?.message || 'Save failed.', 'error');
  }
}

async function openLibraryItem(item) {
  if (!item?.attachmentId) {
    setStatus('That library item has no file attached.', 'error');
    return;
  }
  setStatus(`Opening “${item.name}”…`);
  const blob = await getFileBlob(item.attachmentId);
  if (!blob) {
    setStatus('This file is missing from storage. Re-upload it or delete the library entry.', 'error');
    return;
  }
  const file = new File([blob], item.fileName || `${item.name}.gp`, {
    type: item.type || 'application/octet-stream',
  });
  await loadFile(file, { exerciseId: item.id });
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
      disabled: active,
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
    const file = files && files[0];
    if (file) {
      state.exerciseId = null;
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
      drop.classList.add('is-drag');
    });
  });
  ['dragleave', 'drop'].forEach((type) => {
    drop.addEventListener(type, (e) => {
      e.preventDefault();
      drop.classList.remove('is-drag');
      if (type === 'drop') onFiles(e.dataTransfer?.files);
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
}

/** Load a GP file programmatically (e.g. from Exercises deep-link). */
export async function loadGpPlayerBytes(bytes, fileName = 'score.gp', opts = {}) {
  const file = new File([bytes], fileName, { type: 'application/octet-stream' });
  await loadFile(file, opts);
}
