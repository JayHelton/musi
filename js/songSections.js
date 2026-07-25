// Song Sections — carve practice loops from uploaded tracks, annotate them,
// and estimate key / tonal center for the whole song or a single section.
//
// Audio blobs live in IndexedDB (attachments, source: 'songsection'). Project
// metadata (sections, notes, cached analysis) lives in localStorage.

import { audioCtx, ensureAudio, getAnalyserDestination } from './audio.js';
import { saveAudio, getAudioBlob, deleteAudio, attachmentsSupported } from './attachments.js';
import { analyzeAudioKey, summarizeKeyAnalysis } from './analysis/audioKey.js';
import { NOTE_NAMES_SHARP } from './theory.js';

const STORAGE_KEY = 'musi.songsections';
const TITLE_LIMIT = 120;
const NAME_LIMIT = 80;
const NOTES_LIMIT = 20000;
const AUTOSAVE_MS = 500;
const WAVE_BINS = 1200;

const state = {
  projects: [],
  selectedId: null,
  selectedSectionId: null,
  bound: false,
  // Runtime (not persisted)
  audioId: null,
  buffer: null,
  peaks: null,
  blobUrl: null,
  audioEl: null,
  mediaSource: null,
  playing: false,
  looping: true,
  rafId: null,
  drag: null, // 'start' | 'end' | 'playhead' | null
  selStart: 0,
  selEnd: 0,
  analysing: false,
  autosaveTimer: null,
};

function canUseStorage() {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch (e) {
    return false;
  }
}

function readStore() {
  if (!canUseStorage()) return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    return null;
  }
}

function writeStore(value) {
  if (!canUseStorage()) return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
    return true;
  } catch (e) {
    return false;
  }
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowISO() {
  return new Date().toISOString();
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function parseTimeInput(str, fallback = 0) {
  if (typeof str !== 'string') return fallback;
  const t = str.trim();
  if (!t) return fallback;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.max(0, Number(t));
  const parts = t.split(':').map(Number);
  if (parts.some((p) => Number.isNaN(p))) return fallback;
  if (parts.length === 2) return Math.max(0, parts[0] * 60 + parts[1]);
  if (parts.length === 3) return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  return fallback;
}

function normalizeSection(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const start = Number(raw.start) || 0;
  let end = Number(raw.end);
  if (!Number.isFinite(end) || end <= start) end = start + 1;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid('sec'),
    name: String(raw.name || 'Section').slice(0, NAME_LIMIT),
    start,
    end,
    notes: String(raw.notes || '').slice(0, NOTES_LIMIT),
    analysis: raw.analysis && typeof raw.analysis === 'object' ? raw.analysis : null,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : nowISO(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : nowISO(),
  };
}

function normalizeProject(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const created = typeof raw.createdAt === 'string' ? raw.createdAt : nowISO();
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid('song'),
    title: String(raw.title || 'Untitled song').slice(0, TITLE_LIMIT),
    audioId: typeof raw.audioId === 'string' ? raw.audioId : null,
    fileName: typeof raw.fileName === 'string' ? raw.fileName : '',
    duration: Number(raw.duration) || 0,
    analysis: raw.analysis && typeof raw.analysis === 'object' ? raw.analysis : null,
    sections: Array.isArray(raw.sections)
      ? raw.sections.map(normalizeSection).filter(Boolean)
      : [],
    createdAt: created,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : created,
  };
}

function loadProjects() {
  const raw = readStore();
  if (!raw) {
    state.projects = [];
    state.selectedId = null;
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    state.projects = Array.isArray(parsed.projects)
      ? parsed.projects.map(normalizeProject).filter(Boolean)
      : [];
    state.selectedId = typeof parsed.selectedId === 'string' ? parsed.selectedId : null;
    if (state.selectedId && !state.projects.some((p) => p.id === state.selectedId)) {
      state.selectedId = null;
    }
  } catch (e) {
    state.projects = [];
    state.selectedId = null;
  }
}

function persist() {
  writeStore(JSON.stringify({
    projects: state.projects,
    selectedId: state.selectedId,
  }));
}

function schedulePersist() {
  if (state.autosaveTimer) clearTimeout(state.autosaveTimer);
  state.autosaveTimer = setTimeout(() => {
    state.autosaveTimer = null;
    persist();
  }, AUTOSAVE_MS);
}

function currentProject() {
  return state.projects.find((p) => p.id === state.selectedId) || null;
}

function currentSection() {
  const p = currentProject();
  if (!p || !state.selectedSectionId) return null;
  return p.sections.find((s) => s.id === state.selectedSectionId) || null;
}

function touchProject(project) {
  project.updatedAt = nowISO();
  schedulePersist();
}

// --- Waveform peaks --------------------------------------------------------

function computePeaks(buffer, bins = WAVE_BINS) {
  const ch0 = buffer.getChannelData(0);
  const len = ch0.length;
  const block = Math.max(1, Math.floor(len / bins));
  const peaks = new Float32Array(bins);
  for (let i = 0; i < bins; i++) {
    const start = i * block;
    const end = Math.min(len, start + block);
    let peak = 0;
    for (let j = start; j < end; j++) {
      const a = Math.abs(ch0[j]);
      if (a > peak) peak = a;
    }
    peaks[i] = peak;
  }
  return peaks;
}

function drawWaveform() {
  const canvas = document.getElementById('ss-wave');
  if (!canvas || !state.peaks) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 640;
  const cssH = canvas.clientHeight || 96;
  if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
  }
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Track background
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.fillRect(0, 0, w, h);

  const duration = state.buffer ? state.buffer.duration : 1;
  const selX0 = (state.selStart / duration) * w;
  const selX1 = (state.selEnd / duration) * w;

  // Selection region
  ctx.fillStyle = 'rgba(255,107,53,0.18)';
  ctx.fillRect(selX0, 0, Math.max(1, selX1 - selX0), h);

  // Waveform
  const mid = h / 2;
  const peaks = state.peaks;
  const step = w / peaks.length;
  ctx.fillStyle = 'rgba(232,232,232,0.55)';
  for (let i = 0; i < peaks.length; i++) {
    const amp = peaks[i] * (mid - 2);
    const x = i * step;
    ctx.fillRect(x, mid - amp, Math.max(1, step * 0.7), amp * 2);
  }

  // Section markers
  const project = currentProject();
  if (project) {
    for (const sec of project.sections) {
      const x0 = (sec.start / duration) * w;
      const x1 = (sec.end / duration) * w;
      const active = sec.id === state.selectedSectionId;
      ctx.fillStyle = active ? 'rgba(255,107,53,0.28)' : 'rgba(46,204,113,0.14)';
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), h);
      ctx.fillStyle = active ? '#ff6b35' : 'rgba(46,204,113,0.7)';
      ctx.fillRect(x0, 0, Math.max(2, 2 * dpr), h);
      ctx.fillRect(x1 - Math.max(2, 2 * dpr), 0, Math.max(2, 2 * dpr), h);
    }
  }

  // Selection handles
  ctx.fillStyle = '#ff6b35';
  ctx.fillRect(selX0 - 1 * dpr, 0, 3 * dpr, h);
  ctx.fillRect(selX1 - 1 * dpr, 0, 3 * dpr, h);

  // Playhead
  if (state.audioEl && Number.isFinite(state.audioEl.currentTime)) {
    const px = (state.audioEl.currentTime / duration) * w;
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(px - 1 * dpr, 0, 2 * dpr, h);
  }
}

// --- Audio load / playback -------------------------------------------------

function teardownAudioEl() {
  stopPlayback();
  if (state.audioEl) {
    try { state.audioEl.pause(); } catch (e) { /* noop */ }
    state.audioEl.removeAttribute('src');
    state.audioEl.load();
  }
  if (state.blobUrl) {
    URL.revokeObjectURL(state.blobUrl);
    state.blobUrl = null;
  }
  // MediaElementSource can only be created once per element; keep the pair.
}

async function decodeBlob(blob) {
  ensureAudio();
  const ab = await blob.arrayBuffer();
  // Offline decode prefers a copy; some browsers detach the buffer.
  return await audioCtx.decodeAudioData(ab.slice(0));
}

async function loadProjectAudio(project) {
  teardownAudioEl();
  state.buffer = null;
  state.peaks = null;
  state.audioId = null;
  state.selStart = 0;
  state.selEnd = 0;
  drawWaveform();
  updateTransportUi();

  if (!project || !project.audioId) {
    setStatus('Upload an audio file to start carving sections.');
    return;
  }
  if (!attachmentsSupported()) {
    setStatus('Local audio storage is unavailable in this browser.');
    return;
  }

  setStatus('Loading audio…');
  const blob = await getAudioBlob(project.audioId);
  if (!blob) {
    setStatus('Audio file missing — re-upload the track.');
    return;
  }

  try {
    const buffer = await decodeBlob(blob);
    state.buffer = buffer;
    state.peaks = computePeaks(buffer);
    state.audioId = project.audioId;
    state.blobUrl = URL.createObjectURL(blob);
    project.duration = buffer.duration;
    touchProject(project);

    ensureAudioEl();
    state.audioEl.src = state.blobUrl;
    state.audioEl.load();

    state.selStart = 0;
    state.selEnd = Math.min(buffer.duration, Math.max(4, buffer.duration * 0.15));
    syncSelInputs();
    drawWaveform();
    updateTransportUi();
    setStatus('');
  } catch (e) {
    console.warn('Song Sections decode failed', e);
    setStatus('Could not decode this audio file. Try WAV, MP3, or OGG.');
  }
}

function ensureAudioEl() {
  if (state.audioEl) return state.audioEl;
  ensureAudio();
  const el = new Audio();
  el.preload = 'auto';
  el.addEventListener('timeupdate', onTimeUpdate);
  el.addEventListener('ended', onEnded);
  try {
    state.mediaSource = audioCtx.createMediaElementSource(el);
    state.mediaSource.connect(getAnalyserDestination());
  } catch (e) {
    // Fallback: play through the element directly if the graph fails.
  }
  state.audioEl = el;
  return el;
}

function onTimeUpdate() {
  const el = state.audioEl;
  if (!el) return;
  if (state.looping) {
    const end = state.selEnd;
    const start = state.selStart;
    if (el.currentTime >= end - 0.02) {
      el.currentTime = start;
    }
  }
  updateTransportUi();
  drawWaveform();
}

function onEnded() {
  if (state.looping && state.playing) {
    state.audioEl.currentTime = state.selStart;
    state.audioEl.play().catch(() => {});
    return;
  }
  stopPlayback();
}

function startPlayback() {
  if (!state.audioEl || !state.buffer) return;
  ensureAudio();
  const el = state.audioEl;
  if (el.currentTime < state.selStart || el.currentTime >= state.selEnd) {
    el.currentTime = state.selStart;
  }
  el.play().then(() => {
    state.playing = true;
    updateTransportUi();
    drawLoop();
  }).catch(() => {
    setStatus('Playback was blocked — tap Play again.');
  });
}

function stopPlayback() {
  state.playing = false;
  if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
  if (state.audioEl) {
    try { state.audioEl.pause(); } catch (e) { /* noop */ }
  }
  updateTransportUi();
  drawWaveform();
}

function drawLoop() {
  if (!state.playing) return;
  drawWaveform();
  updateTransportUi();
  state.rafId = requestAnimationFrame(drawLoop);
}

function togglePlayback() {
  if (state.playing) stopPlayback();
  else startPlayback();
}

// --- Analysis --------------------------------------------------------------

function renderAnalysis(targetId, summary, emptyText) {
  const el = document.getElementById(targetId);
  if (!el) return;
  if (!summary) {
    el.innerHTML = `<p class="ss-muted">${emptyText}</p>`;
    return;
  }
  const conf = Math.round((summary.confidence || 0) * 100);
  const alts = (summary.candidates || [])
    .slice(1, 3)
    .map((c) => c.label)
    .filter(Boolean)
    .join(' · ');
  const tonic = Number.isInteger(summary.tonicPc)
    ? NOTE_NAMES_SHARP[summary.tonicPc]
    : '—';
  el.innerHTML = `
    <div class="ss-key-main">${escapeHtml(summary.descriptor || '—')}</div>
    <div class="ss-key-meta">
      <span>Tonal center: <strong>${escapeHtml(tonic)}</strong></span>
      <span>Confidence: <strong>${conf}%</strong></span>
      ${summary.isChromatic ? '<span class="ss-badge">Chromatic</span>' : ''}
    </div>
    ${alts ? `<div class="ss-key-alt">Also possible: ${escapeHtml(alts)}</div>` : ''}
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function runAnalysis({ startSec, endSec, onDone }) {
  if (!state.buffer || state.analysing) return;
  state.analysing = true;
  setStatus('Analysing pitch content…');
  const progress = document.getElementById('ss-progress');
  if (progress) { progress.hidden = false; progress.value = 0; }
  try {
    const result = await analyzeAudioKey(state.buffer, {
      startSec,
      endSec,
      onProgress: (frac) => {
        if (progress) progress.value = frac;
        setStatus(`Analysing… ${Math.round(frac * 100)}%`);
      },
    });
    const summary = summarizeKeyAnalysis(result);
    if (result.pitchedFrames < 8) {
      setStatus('Not enough clear pitches to estimate a key — try a clearer or longer section.');
    } else {
      setStatus('');
    }
    if (onDone) onDone(summary, result);
  } catch (e) {
    console.warn('Song Sections analysis failed', e);
    setStatus('Analysis failed. Try a shorter section or another file.');
  } finally {
    state.analysing = false;
    if (progress) progress.hidden = true;
  }
}

async function analyzeSong() {
  const project = currentProject();
  if (!project || !state.buffer) return;
  await runAnalysis({
    startSec: 0,
    endSec: state.buffer.duration,
    onDone: (summary) => {
      project.analysis = summary;
      touchProject(project);
      renderAnalysis('ss-song-analysis', summary, 'No analysis yet.');
      renderProjectList();
    },
  });
}

async function analyzeSelectionOrSection() {
  const project = currentProject();
  if (!project || !state.buffer) return;
  const section = currentSection();
  const start = section ? section.start : state.selStart;
  const end = section ? section.end : state.selEnd;
  await runAnalysis({
    startSec: start,
    endSec: end,
    onDone: (summary) => {
      if (section) {
        section.analysis = summary;
        section.updatedAt = nowISO();
        touchProject(project);
        renderAnalysis('ss-section-analysis', summary, 'No section analysis yet.');
        renderSections();
      } else {
        renderAnalysis('ss-section-analysis', summary, 'No section analysis yet.');
      }
    },
  });
}

// --- Sections CRUD ---------------------------------------------------------

function createSectionFromSelection() {
  const project = currentProject();
  if (!project || !state.buffer) return;
  let start = Math.min(state.selStart, state.selEnd);
  let end = Math.max(state.selStart, state.selEnd);
  if (end - start < 0.25) {
    end = Math.min(state.buffer.duration, start + 1);
  }
  const n = project.sections.length + 1;
  const section = normalizeSection({
    id: uid('sec'),
    name: `Section ${n}`,
    start,
    end,
    notes: '',
  });
  project.sections.push(section);
  state.selectedSectionId = section.id;
  touchProject(project);
  renderSections();
  renderSectionDetail();
  drawWaveform();
}

function deleteSection(id) {
  const project = currentProject();
  if (!project) return;
  const idx = project.sections.findIndex((s) => s.id === id);
  if (idx < 0) return;
  project.sections.splice(idx, 1);
  if (state.selectedSectionId === id) state.selectedSectionId = null;
  touchProject(project);
  renderSections();
  renderSectionDetail();
  drawWaveform();
}

function selectSection(id) {
  const project = currentProject();
  if (!project) return;
  const sec = project.sections.find((s) => s.id === id);
  if (!sec) return;
  state.selectedSectionId = id;
  state.selStart = sec.start;
  state.selEnd = sec.end;
  syncSelInputs();
  if (state.audioEl) state.audioEl.currentTime = sec.start;
  renderSections();
  renderSectionDetail();
  drawWaveform();
  updateTransportUi();
}

function applySectionEditsFromForm() {
  const project = currentProject();
  const section = currentSection();
  if (!project || !section) return;
  const nameEl = document.getElementById('ss-sec-name');
  const notesEl = document.getElementById('ss-sec-notes');
  const startEl = document.getElementById('ss-sec-start');
  const endEl = document.getElementById('ss-sec-end');
  if (nameEl) section.name = String(nameEl.value || 'Section').slice(0, NAME_LIMIT);
  if (notesEl) section.notes = String(notesEl.value || '').slice(0, NOTES_LIMIT);
  if (startEl) section.start = clamp(parseTimeInput(startEl.value, section.start), 0, project.duration || 1e9);
  if (endEl) section.end = clamp(parseTimeInput(endEl.value, section.end), 0, project.duration || 1e9);
  if (section.end <= section.start) section.end = section.start + 0.25;
  state.selStart = section.start;
  state.selEnd = section.end;
  section.updatedAt = nowISO();
  touchProject(project);
  syncSelInputs();
  renderSections();
  drawWaveform();
}

// --- Export trim -----------------------------------------------------------

function encodeWavMono(samples, sampleRate) {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([view], { type: 'audio/wav' });
}

function mixRangeToMono(buffer, startSec, endSec) {
  const sr = buffer.sampleRate;
  const start = Math.floor(clamp(startSec, 0, buffer.duration) * sr);
  const end = Math.floor(clamp(endSec, 0, buffer.duration) * sr);
  const len = Math.max(0, end - start);
  const out = new Float32Array(len);
  const ch = buffer.numberOfChannels;
  for (let c = 0; c < ch; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) out[i] += data[start + i];
  }
  if (ch > 1) {
    const inv = 1 / ch;
    for (let i = 0; i < len; i++) out[i] *= inv;
  }
  return out;
}

function downloadSelection() {
  if (!state.buffer) return;
  const start = Math.min(state.selStart, state.selEnd);
  const end = Math.max(state.selStart, state.selEnd);
  const samples = mixRangeToMono(state.buffer, start, end);
  if (!samples.length) return;
  const blob = encodeWavMono(samples, state.buffer.sampleRate);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const project = currentProject();
  const section = currentSection();
  const base = (section && section.name) || (project && project.title) || 'section';
  a.href = url;
  a.download = `${base.replace(/[^\w\-]+/g, '_').slice(0, 40)}_${formatTime(start).replace(/:/g, '-')}-${formatTime(end).replace(/:/g, '-')}.wav`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// --- Project CRUD ----------------------------------------------------------

async function createProjectFromFile(file) {
  if (!file) return;
  if (!attachmentsSupported()) {
    setStatus('Local audio storage is unavailable — cannot save the file.');
    return;
  }
  setStatus('Saving audio…');
  const meta = await saveAudio({
    blob: file,
    name: file.name || 'Song',
    type: file.type || '',
    fileName: file.name || '',
    size: file.size,
    source: 'songsection',
  });
  if (!meta) {
    setStatus('Could not save the audio file.');
    return;
  }
  const project = normalizeProject({
    id: uid('song'),
    title: (file.name || 'Untitled song').replace(/\.[^.]+$/, '').slice(0, TITLE_LIMIT),
    audioId: meta.id,
    fileName: file.name || '',
    sections: [],
  });
  state.projects.unshift(project);
  state.selectedId = project.id;
  state.selectedSectionId = null;
  persist();
  renderProjectList();
  renderWorkspace();
  await loadProjectAudio(project);
  // Auto-analyse the full track once loaded.
  if (state.buffer) analyzeSong();
}

async function deleteProject(id) {
  const idx = state.projects.findIndex((p) => p.id === id);
  if (idx < 0) return;
  const [removed] = state.projects.splice(idx, 1);
  if (removed && removed.audioId) {
    try { await deleteAudio(removed.audioId); } catch (e) { /* noop */ }
  }
  if (state.selectedId === id) {
    state.selectedId = state.projects[0] ? state.projects[0].id : null;
    state.selectedSectionId = null;
  }
  persist();
  renderProjectList();
  renderWorkspace();
  const next = currentProject();
  if (next) await loadProjectAudio(next);
  else {
    teardownAudioEl();
    state.buffer = null;
    state.peaks = null;
    drawWaveform();
    setStatus('Upload an audio file to start carving sections.');
  }
}

async function selectProject(id) {
  if (state.selectedId === id) return;
  stopPlayback();
  state.selectedId = id;
  state.selectedSectionId = null;
  persist();
  renderProjectList();
  renderWorkspace();
  await loadProjectAudio(currentProject());
}

// --- UI binding / render ---------------------------------------------------

function setStatus(msg) {
  const el = document.getElementById('ss-status');
  if (el) el.textContent = msg || '';
}

function syncSelInputs() {
  const a = document.getElementById('ss-sel-start');
  const b = document.getElementById('ss-sel-end');
  if (a) a.value = formatTime(state.selStart);
  if (b) b.value = formatTime(state.selEnd);
  const len = document.getElementById('ss-sel-len');
  if (len) len.textContent = formatTime(Math.max(0, state.selEnd - state.selStart));
}

function updateTransportUi() {
  const playBtn = document.getElementById('ss-play');
  if (playBtn) {
    playBtn.innerHTML = state.playing ? '&#9632; Stop' : '&#9654; Play loop';
    playBtn.disabled = !state.buffer;
  }
  const t = document.getElementById('ss-time');
  if (t) {
    const cur = state.audioEl ? state.audioEl.currentTime : 0;
    const dur = state.buffer ? state.buffer.duration : 0;
    t.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
  }
  const loopBtn = document.getElementById('ss-loop');
  if (loopBtn) loopBtn.classList.toggle('active', state.looping);
  ['ss-mark-start', 'ss-mark-end', 'ss-add-section', 'ss-analyze-song', 'ss-analyze-sel', 'ss-download'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = !state.buffer || state.analysing;
  });
}

function renderProjectList() {
  const list = document.getElementById('ss-project-list');
  const empty = document.getElementById('ss-project-empty');
  if (!list) return;
  list.innerHTML = '';
  if (!state.projects.length) {
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  state.projects.forEach((p) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ss-project-item' + (p.id === state.selectedId ? ' active' : '');
    const key = p.analysis && p.analysis.descriptor ? p.analysis.descriptor : 'No key yet';
    btn.innerHTML = `
      <span class="ss-project-title">${escapeHtml(p.title)}</span>
      <span class="ss-project-meta">${p.sections.length} section${p.sections.length === 1 ? '' : 's'} · ${escapeHtml(key)}</span>
    `;
    btn.onclick = () => selectProject(p.id);
    list.appendChild(btn);
  });
}

function renderSections() {
  const list = document.getElementById('ss-section-list');
  if (!list) return;
  const project = currentProject();
  list.innerHTML = '';
  if (!project || !project.sections.length) {
    list.innerHTML = '<p class="ss-muted">No sections yet. Drag the orange handles on the waveform (or use Mark start / Mark end), then Add section.</p>';
    return;
  }
  project.sections
    .slice()
    .sort((a, b) => a.start - b.start)
    .forEach((sec) => {
      const row = document.createElement('div');
      row.className = 'ss-section-row' + (sec.id === state.selectedSectionId ? ' active' : '');
      const notePreview = sec.notes.trim()
        ? escapeHtml(sec.notes.trim().split('\n')[0].slice(0, 60))
        : '<span class="ss-muted">No notes</span>';
      const key = sec.analysis && sec.analysis.descriptor
        ? `<span class="ss-sec-key">${escapeHtml(sec.analysis.descriptor)}</span>`
        : '';
      row.innerHTML = `
        <button type="button" class="ss-section-main">
          <span class="ss-section-name">${escapeHtml(sec.name)}</span>
          <span class="ss-section-times">${formatTime(sec.start)} – ${formatTime(sec.end)}</span>
          <span class="ss-section-note">${notePreview}</span>
          ${key}
        </button>
        <button type="button" class="btn sm ss-sec-play" title="Play this section">&#9654;</button>
        <button type="button" class="btn sm ss-sec-del" title="Delete section">&#10005;</button>
      `;
      row.querySelector('.ss-section-main').onclick = () => selectSection(sec.id);
      row.querySelector('.ss-sec-play').onclick = () => {
        selectSection(sec.id);
        startPlayback();
      };
      row.querySelector('.ss-sec-del').onclick = () => {
        if (confirm(`Delete “${sec.name}”?`)) deleteSection(sec.id);
      };
      list.appendChild(row);
    });
}

function renderSectionDetail() {
  const empty = document.getElementById('ss-section-empty');
  const body = document.getElementById('ss-section-body');
  const section = currentSection();
  if (!section) {
    if (empty) empty.style.display = '';
    if (body) body.style.display = 'none';
    renderAnalysis('ss-section-analysis', null, 'Select a section (or analyse the current selection).');
    return;
  }
  if (empty) empty.style.display = 'none';
  if (body) body.style.display = '';
  const nameEl = document.getElementById('ss-sec-name');
  const notesEl = document.getElementById('ss-sec-notes');
  const startEl = document.getElementById('ss-sec-start');
  const endEl = document.getElementById('ss-sec-end');
  if (nameEl) nameEl.value = section.name;
  if (notesEl) notesEl.value = section.notes;
  if (startEl) startEl.value = formatTime(section.start);
  if (endEl) endEl.value = formatTime(section.end);
  renderAnalysis('ss-section-analysis', section.analysis, 'No section analysis yet.');
}

function renderWorkspace() {
  const project = currentProject();
  const empty = document.getElementById('ss-workspace-empty');
  const body = document.getElementById('ss-workspace');
  if (!project) {
    if (empty) empty.style.display = '';
    if (body) body.style.display = 'none';
    return;
  }
  if (empty) empty.style.display = 'none';
  if (body) body.style.display = '';
  const title = document.getElementById('ss-title');
  if (title) title.value = project.title;
  renderAnalysis('ss-song-analysis', project.analysis, 'Hit Analyse song to estimate key / tonal center.');
  renderSections();
  renderSectionDetail();
  updateTransportUi();
}

function xToTime(clientX, canvas) {
  const rect = canvas.getBoundingClientRect();
  const frac = clamp((clientX - rect.left) / rect.width, 0, 1);
  const dur = state.buffer ? state.buffer.duration : 0;
  return frac * dur;
}

function hitHandle(clientX, canvas) {
  if (!state.buffer) return null;
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const dur = state.buffer.duration;
  const sx = (state.selStart / dur) * rect.width;
  const ex = (state.selEnd / dur) * rect.width;
  if (Math.abs(x - sx) <= 10) return 'start';
  if (Math.abs(x - ex) <= 10) return 'end';
  return 'playhead';
}

function bindWaveform() {
  const canvas = document.getElementById('ss-wave');
  if (!canvas) return;

  const onPointerDown = (e) => {
    if (!state.buffer) return;
    canvas.setPointerCapture(e.pointerId);
    state.drag = hitHandle(e.clientX, canvas);
    const t = xToTime(e.clientX, canvas);
    if (state.drag === 'playhead') {
      if (state.audioEl) state.audioEl.currentTime = t;
      // Clicking inside the selection keeps it; outside expands the nearer edge.
      if (t < state.selStart || t > state.selEnd) {
        if (Math.abs(t - state.selStart) <= Math.abs(t - state.selEnd)) state.selStart = t;
        else state.selEnd = t;
        if (state.selEnd < state.selStart) {
          const tmp = state.selStart; state.selStart = state.selEnd; state.selEnd = tmp;
        }
      }
    } else if (state.drag === 'start') {
      state.selStart = clamp(t, 0, state.selEnd - 0.05);
    } else if (state.drag === 'end') {
      state.selEnd = clamp(t, state.selStart + 0.05, state.buffer.duration);
    }
    syncSelInputs();
    drawWaveform();
  };

  const onPointerMove = (e) => {
    if (!state.drag || !state.buffer) return;
    const t = xToTime(e.clientX, canvas);
    if (state.drag === 'start') state.selStart = clamp(t, 0, state.selEnd - 0.05);
    else if (state.drag === 'end') state.selEnd = clamp(t, state.selStart + 0.05, state.buffer.duration);
    else if (state.drag === 'playhead' && state.audioEl) state.audioEl.currentTime = t;
    syncSelInputs();
    drawWaveform();
  };

  const onPointerUp = () => {
    if (!state.drag) return;
    state.drag = null;
    // Keep the selected section in sync if one is active.
    const section = currentSection();
    const project = currentProject();
    if (section && project) {
      section.start = state.selStart;
      section.end = state.selEnd;
      section.updatedAt = nowISO();
      touchProject(project);
      renderSections();
      renderSectionDetail();
    }
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
}

function bindUi() {
  if (state.bound) return;
  state.bound = true;

  const fileInput = document.getElementById('ss-file');
  if (fileInput) {
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (file) await createProjectFromFile(file);
    });
  }

  const uploadBtn = document.getElementById('ss-upload');
  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener('click', () => fileInput.click());
  }

  document.getElementById('ss-play')?.addEventListener('click', togglePlayback);
  document.getElementById('ss-loop')?.addEventListener('click', () => {
    state.looping = !state.looping;
    updateTransportUi();
  });
  document.getElementById('ss-mark-start')?.addEventListener('click', () => {
    if (!state.audioEl || !state.buffer) return;
    state.selStart = clamp(state.audioEl.currentTime, 0, state.selEnd - 0.05);
    syncSelInputs();
    drawWaveform();
  });
  document.getElementById('ss-mark-end')?.addEventListener('click', () => {
    if (!state.audioEl || !state.buffer) return;
    state.selEnd = clamp(state.audioEl.currentTime, state.selStart + 0.05, state.buffer.duration);
    syncSelInputs();
    drawWaveform();
  });
  document.getElementById('ss-add-section')?.addEventListener('click', createSectionFromSelection);
  document.getElementById('ss-analyze-song')?.addEventListener('click', analyzeSong);
  document.getElementById('ss-analyze-sel')?.addEventListener('click', analyzeSelectionOrSection);
  document.getElementById('ss-download')?.addEventListener('click', downloadSelection);
  document.getElementById('ss-delete-project')?.addEventListener('click', () => {
    const p = currentProject();
    if (!p) return;
    if (confirm(`Delete “${p.title}” and its audio?`)) deleteProject(p.id);
  });

  document.getElementById('ss-title')?.addEventListener('input', (e) => {
    const p = currentProject();
    if (!p) return;
    p.title = String(e.target.value || '').slice(0, TITLE_LIMIT);
    touchProject(p);
    renderProjectList();
  });

  ['ss-sec-name', 'ss-sec-notes', 'ss-sec-start', 'ss-sec-end'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      applySectionEditsFromForm();
    });
    el.addEventListener('change', () => {
      applySectionEditsFromForm();
    });
  });

  document.getElementById('ss-sel-start')?.addEventListener('change', (e) => {
    if (!state.buffer) return;
    state.selStart = clamp(parseTimeInput(e.target.value, state.selStart), 0, state.selEnd - 0.05);
    syncSelInputs();
    drawWaveform();
  });
  document.getElementById('ss-sel-end')?.addEventListener('change', (e) => {
    if (!state.buffer) return;
    state.selEnd = clamp(parseTimeInput(e.target.value, state.selEnd), state.selStart + 0.05, state.buffer.duration);
    syncSelInputs();
    drawWaveform();
  });

  bindWaveform();
  window.addEventListener('resize', () => drawWaveform());
}

export function initSongSections() {
  loadProjects();
  bindUi();
  renderProjectList();
  renderWorkspace();
  const project = currentProject();
  if (project) {
    // Reload audio when re-entering the view so playback is ready.
    if (!state.buffer || state.audioId !== project.audioId) {
      loadProjectAudio(project);
    } else {
      drawWaveform();
      updateTransportUi();
    }
  } else {
    setStatus('Upload an audio file to start carving sections.');
  }
}

export function stopSongSections() {
  stopPlayback();
  if (state.autosaveTimer) {
    clearTimeout(state.autosaveTimer);
    state.autosaveTimer = null;
    persist();
  }
}
