// Standalone Guitar Pro track player screen.
// Upload a .gp / .gp5 file, pick a track, practice with tempo / transpose / tuning.

import {
  mountGpPlayer,
  parseGuitarPro,
  isGuitarProName,
} from './gpPlayerUI.js';
import { saveFile, attachmentsSupported, ensurePersistentStorage } from './attachments.js';

const state = {
  bound: false,
  mount: null,
  fileName: '',
  bytes: null,
  gp: null,
};

function $(id) {
  return document.getElementById(id);
}

function setStatus(msg, kind = '') {
  const el = $('gpp-status');
  if (!el) return;
  el.textContent = msg || '';
  el.dataset.kind = kind;
  el.hidden = !msg;
}

function setStageVisible(visible) {
  const stage = $('gpp-stage');
  if (stage) stage.hidden = !visible;
}

function destroyMount() {
  if (state.mount) {
    try { state.mount.destroy(); } catch (e) { /* ignore */ }
    state.mount = null;
  }
}

async function loadFile(file) {
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
    state.fileName = file.name;
    state.bytes = bytes;
    state.gp = gp;
    destroyMount();
    const stage = $('gpp-stage');
    if (!stage) return;
    setStageVisible(true);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn sm';
    saveBtn.type = 'button';
    saveBtn.textContent = 'Save to Exercises';
    saveBtn.addEventListener('click', () => saveToExercises(file));

    state.mount = mountGpPlayer(stage, {
      gpResult: gp,
      title: file.name.replace(/\.(gp|gp5)$/i, ''),
      fileName: file.name,
      headerExtra: saveBtn,
      onAnalyze: () => {
        window.__musiGpHandoff = {
          bytes,
          name: file.name,
          trackIndex: state.mount?.getState()?.trackIndex || 0,
        };
        location.hash = 'tabanalyzer';
        setTimeout(() => {
          if (window.__musiGpHandoff && typeof window.__musiLoadGpHandoff === 'function') {
            window.__musiLoadGpHandoff(window.__musiGpHandoff);
          }
        }, 50);
      },
    });
    const tempo = gp.tempo || gp.tracks[0]?.model?.tempo || 120;
    setStatus(`Loaded ${file.name} · ${gp.tracks.length} track${gp.tracks.length === 1 ? '' : 's'} · ${Math.round(tempo)} BPM`);
  } catch (err) {
    setStageVisible(false);
    setStatus(err?.message || 'Could not read that Guitar Pro file.', 'error');
  }
}

async function saveToExercises(file) {
  if (!attachmentsSupported()) {
    setStatus('Browser storage unavailable — cannot save to Exercises.', 'error');
    return;
  }
  try {
    await ensurePersistentStorage();
    const { getExercises } = await import('./exercises.js');
    // Persist via the same attachment path Exercises uses, then inject metadata.
    const blob = file instanceof Blob ? file : new Blob([state.bytes], { type: 'application/octet-stream' });
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
    // exercises.js stores its own list — use its public-ish path by dispatching a custom event
    // or importing a helper. Prefer a dedicated export.
    const { addGpExerciseFromAttachment } = await import('./exercises.js');
    if (typeof addGpExerciseFromAttachment === 'function') {
      addGpExerciseFromAttachment({
        attachmentId: meta.id,
        name,
        fileName: state.fileName || `${name}.gp`,
        type: 'application/x-guitar-pro',
        size: blob.size,
      });
      setStatus(`Saved “${name}” to Exercises.`);
    } else {
      void getExercises;
      setStatus('Saved attachment, but Exercises helper is unavailable.', 'error');
    }
  } catch (err) {
    setStatus(err?.message || 'Save failed.', 'error');
  }
}

function bindDrop() {
  const drop = $('gpp-drop');
  const input = $('gpp-file');
  if (!drop || !input) return;

  const onFiles = (files) => {
    const file = files && files[0];
    if (file) loadFile(file);
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
  const stage = $('gpp-stage');
  if (!stage) return;
  setStageVisible(true);
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn sm';
  saveBtn.type = 'button';
  saveBtn.textContent = 'Save to Exercises';
  saveBtn.addEventListener('click', () => {
    const file = new File([state.bytes], state.fileName || 'score.gp', { type: 'application/octet-stream' });
    saveToExercises(file);
  });
  state.mount = mountGpPlayer(stage, {
    gpResult: state.gp,
    title: (state.fileName || 'score').replace(/\.(gp|gp5)$/i, ''),
    fileName: state.fileName,
    headerExtra: saveBtn,
    onAnalyze: () => {
      window.__musiGpHandoff = {
        bytes: state.bytes,
        name: state.fileName,
        trackIndex: state.mount?.getState()?.trackIndex || 0,
      };
      location.hash = 'tabanalyzer';
      setTimeout(() => {
        if (window.__musiGpHandoff && typeof window.__musiLoadGpHandoff === 'function') {
          window.__musiLoadGpHandoff(window.__musiGpHandoff);
        }
      }, 50);
    },
  });
}

export function initGpPlayer() {
  if (!state.bound) {
    state.bound = true;
    bindDrop();
  }
  remountIfNeeded();
}

export function stopGpPlayer() {
  destroyMount();
}

/** Load a GP file programmatically (e.g. from Exercises deep-link). */
export async function loadGpPlayerBytes(bytes, fileName = 'score.gp') {
  const file = new File([bytes], fileName, { type: 'application/octet-stream' });
  await loadFile(file);
}
