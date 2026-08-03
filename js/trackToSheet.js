// Track → Sheet: upload an isolated monophonic track, parse pitches, show
// basic sheet music. No source separation — feed it a single vocal/guitar/bass
// stem.

import { ensureAudio } from './audio.js';
import {
  decodeAudioFile,
  transcribeBuffer,
  quantizeToScore,
  suggestClef,
} from './trackToSheet/transcribe.js';
import { renderScoreSVG, notesToText } from './trackToSheet/score.js';

const state = {
  fileName: null,
  audioBuffer: null,
  result: null,
  bpm: 120,
  clef: 'Treble',
  preferSharps: true,
  busy: false,
  objectUrl: null,
  bound: false,
};

function $(id) {
  return document.getElementById(id);
}

function setStatus(msg, kind = '') {
  const el = $('tts-status');
  if (!el) return;
  el.textContent = msg || '';
  el.dataset.kind = kind;
  el.hidden = !msg;
}

function setBusy(busy) {
  state.busy = busy;
  const btn = $('tts-transcribe');
  const input = $('tts-file');
  if (btn) btn.disabled = busy || !state.audioBuffer;
  if (input) input.disabled = busy;
  document.body.classList.toggle('tts-busy', busy);
}

function renderNoteList(notes) {
  const el = $('tts-note-list');
  if (!el) return;
  if (!notes.length) {
    el.innerHTML = '<p class="tts-muted">No notes yet.</p>';
    return;
  }
  el.innerHTML = notes.map(n =>
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
  const bpmInput = $('tts-bpm');
  if (bpmInput) bpmInput.value = String(state.bpm);
  const clefSel = $('tts-clef');
  if (clefSel) clefSel.value = state.clef;
  const sharpSel = $('tts-accidentals');
  if (sharpSel) sharpSel.value = state.preferSharps ? 'sharps' : 'flats';
}

async function onFileChosen(file) {
  if (!file) return;
  setStatus(`Loading ${file.name}…`);
  setBusy(true);
  try {
    ensureAudio();
    const buf = await decodeAudioFile(file);
    state.fileName = file.name;
    state.audioBuffer = buf;
    state.result = null;

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
    setStatus('Ready to transcribe.');
    const btn = $('tts-transcribe');
    if (btn) btn.disabled = false;
    $('tts-score-wrap').innerHTML = '<p class="tts-muted">Hit Transcribe to parse pitches onto the staff.</p>';
    renderNoteList([]);
  } catch (err) {
    console.error(err);
    setStatus(`Could not decode audio: ${err.message || err}`, 'err');
    state.audioBuffer = null;
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
    // Always estimate tempo from onsets first; the BPM field can re-quantize after.
    const result = await transcribeBuffer(state.audioBuffer, {
      onProgress: (p) => {
        if (progress) progress.value = p;
        setStatus(`Detecting pitches… ${Math.round(p * 100)}%`);
      },
    });

    state.result = result;
    state.bpm = result.bpm;
    state.clef = suggestClef(result.notes);
    syncControlsFromResult();
    renderNoteList(result.notes);
    paintScore(result.score.events, result.score.bpm, result.score.beatsPerBar);

    const n = result.notes.length;
    setStatus(
      n
        ? `Found ${n} notes in ${result.durationSec.toFixed(1)}s (≈${result.bpm} BPM).`
        : 'No clear pitches found. Use a dry, isolated monophonic stem.',
      n ? 'ok' : 'warn'
    );
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

  $('tts-bpm')?.addEventListener('change', () => {
    const v = Number($('tts-bpm').value);
    if (v >= 40 && v <= 240) {
      state.bpm = Math.round(v);
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
  const btn = $('tts-transcribe');
  if (btn) btn.disabled = !state.audioBuffer || state.busy;
}

export function stopTrackToSheet() {
  const player = $('tts-player');
  if (player && !player.paused) {
    player.pause();
  }
}
