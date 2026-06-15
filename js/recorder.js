import { audioCtx, ensureAudio, getAnalyserDestination } from './audio.js';
import { NOTE_NAMES_SHARP, noteFromFreq } from './theory.js';

const recorder = {
  recording: false,
  playing: false,
  stream: null,
  mediaRecorder: null,
  chunks: [],
  mimeType: '',
  recAnalyser: null,
  recBuf: null,
  recRafId: null,
  startTime: 0,
  timerId: null,
  blob: null,
  blobUrl: null,
  audioEl: null,
  mediaElSource: null,
  playAnalyser: null,
  playBuf: null,
  playRafId: null,
  pcWeights: new Float32Array(12),
  sequence: [],
  lastFrameTime: 0,
  pendingMidi: null,
  pendingSince: 0,
  committedMidi: null,
  holdActive: false,
  holdPressed: false,
};

// Autocorrelation pitch detection (time-domain), same approach as the vocal trainer.
function autoCorrelate(buf, sampleRate) {
  let size = buf.length;
  let rms = 0;
  for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / size);
  if (rms < 0.01) return -1;

  let r1 = 0, r2 = size - 1;
  const thresh = 0.2;
  for (let i = 0; i < size / 2; i++) { if (Math.abs(buf[i]) < thresh) { r1 = i; break; } }
  for (let i = 1; i < size / 2; i++) { if (Math.abs(buf[size - i]) < thresh) { r2 = size - i; break; } }
  buf = buf.slice(r1, r2);
  size = buf.length;

  const c = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    let val = 0;
    for (let j = 0; j < size - i; j++) val += buf[j] * buf[j + i];
    c[i] = val;
  }

  let d1 = 0;
  while (c[d1] > c[d1 + 1]) d1++;
  let maxVal = -1, maxPos = -1;
  for (let i = d1; i < size; i++) {
    if (c[i] > maxVal) { maxVal = c[i]; maxPos = i; }
  }

  const T0 = maxPos;
  if (T0 === 0 || T0 >= size - 1) return -1;
  const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  const betterT0 = a ? T0 - b / (2 * a) : T0;
  return sampleRate / betterT0;
}

function rmsOf(buf) {
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  return Math.sqrt(rms / buf.length);
}

// Krumhansl-Schmuckler key profiles.
const MAJ_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MIN_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function pearson(x, y) {
  const n = x.length;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n; my /= n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i] - mx, b = y[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

function detectKey(weights) {
  let total = 0;
  for (let i = 0; i < 12; i++) total += weights[i];
  if (total <= 0) return [];
  const results = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const [mode, profile] of [['major', MAJ_PROFILE], ['minor', MIN_PROFILE]]) {
      const candidate = new Array(12);
      for (let pc = 0; pc < 12; pc++) candidate[pc] = profile[(pc - tonic + 12) % 12];
      const r = pearson(Array.from(weights), candidate);
      results.push({ tonic, mode, r });
    }
  }
  results.sort((a, b) => b.r - a.r);
  return results;
}

function keyLabel(k) {
  return NOTE_NAMES_SHARP[k.tonic] + ' ' + (k.mode === 'major' ? 'Major' : 'Minor');
}

function resetAnalysis() {
  recorder.pcWeights = new Float32Array(12);
  recorder.sequence = [];
  recorder.pendingMidi = null;
  recorder.pendingSince = 0;
  recorder.committedMidi = null;
}

function setLiveNote(info) {
  [
    { note: 'rec-note', cents: 'rec-cents', freq: 'rec-freq', centsClass: 'rec-cents' },
    { note: 'hold-rec-note', cents: 'hold-rec-cents', freq: 'hold-rec-freq', centsClass: 'hold-rec-cents' },
  ].forEach(target => {
    const noteEl = document.getElementById(target.note);
    const centsEl = document.getElementById(target.cents);
    const freqEl = document.getElementById(target.freq);
    if (!noteEl || !centsEl || !freqEl) return;
    if (info) {
      noteEl.textContent = info.name + info.oct;
      centsEl.textContent = (info.cents >= 0 ? '+' : '') + info.cents + ' cents';
      const absCents = Math.abs(info.cents);
      centsEl.className = target.centsClass + ' ' + (absCents <= 5 ? 'in-tune' : absCents <= 15 ? 'close' : 'off');
      freqEl.textContent = info.freq.toFixed(1) + ' Hz';
    } else {
      noteEl.textContent = '--';
      centsEl.textContent = '0 cents';
      centsEl.className = target.centsClass + ' off';
      freqEl.textContent = '-- Hz';
    }
  });
}

function renderSequence(containerId) {
  const c = document.getElementById(containerId);
  if (!c) return;
  if (!recorder.sequence.length) {
    c.innerHTML = '<span class="rec-seq-empty">No clear pitches detected</span>';
    return;
  }
  c.innerHTML = '';
  recorder.sequence.forEach((s, i) => {
    const chip = document.createElement('span');
    chip.className = 'rec-seq-chip';
    chip.dataset.idx = i;
    chip.textContent = s.name + s.oct;
    c.appendChild(chip);
  });
}

// Commit a stable pitch to the detected-note sequence.
function commitPitch(info, now) {
  const midi = info.midi;
  if (recorder.pendingMidi !== midi) {
    recorder.pendingMidi = midi;
    recorder.pendingSince = now;
    return;
  }
  if (now - recorder.pendingSince >= 110 && recorder.committedMidi !== midi) {
    recorder.committedMidi = midi;
    recorder.sequence.push({ name: info.name, oct: info.oct, midi });
    renderSequence('rec-live-seq');
    renderSequence('hold-rec-live-seq');
  }
}

function updateMeter(level) {
  ['rec-meter', 'hold-rec-meter'].forEach(id => {
    const meter = document.getElementById(id);
    if (meter) meter.style.transform = `scaleX(${level})`;
  });
}

function recordLoop() {
  if (!recorder.recording) return;
  recorder.recAnalyser.getFloatTimeDomainData(recorder.recBuf);
  const now = performance.now();
  const dt = recorder.lastFrameTime ? (now - recorder.lastFrameTime) / 1000 : 0;
  recorder.lastFrameTime = now;

  const level = Math.min(1, rmsOf(recorder.recBuf) * 6);
  updateMeter(level);

  const freq = autoCorrelate(recorder.recBuf, audioCtx.sampleRate);
  if (freq > 0 && freq < 2000) {
    const info = noteFromFreq(freq);
    setLiveNote(info);
    const pc = ((info.midi % 12) + 12) % 12;
    recorder.pcWeights[pc] += dt;
    commitPitch(info, now);
  } else {
    setLiveNote(null);
    recorder.pendingMidi = null;
    recorder.committedMidi = null;
  }
  recorder.recRafId = requestAnimationFrame(recordLoop);
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

function tickTimer() {
  const text = fmtTime((performance.now() - recorder.startTime) / 1000);
  ['rec-timer', 'hold-rec-timer'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  });
}

function pickMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  if (typeof MediaRecorder === 'undefined') return '';
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

function syncHoldRecordUi(active) {
  const overlay = document.getElementById('hold-rec-overlay');
  const btn = document.getElementById('hold-rec-btn');
  if (overlay) {
    overlay.classList.toggle('visible', active);
    overlay.setAttribute('aria-hidden', active ? 'false' : 'true');
  }
  if (btn) btn.classList.toggle('recording', active);
}

async function startRecording(trigger = 'panel') {
  ensureAudio();
  clearRecording(true);
  recorder.holdActive = trigger === 'hold';
  const statusEl = document.getElementById('rec-status');
  if (typeof MediaRecorder === 'undefined') {
    if (statusEl) statusEl.textContent = 'Recording is not supported in this browser';
    return;
  }
  try {
    recorder.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    if (statusEl) statusEl.textContent = 'Mic access denied or unavailable';
    syncHoldRecordUi(false);
    return;
  }

  if (recorder.holdActive && !recorder.holdPressed) {
    recorder.stream.getTracks().forEach(t => t.stop());
    recorder.stream = null;
    syncHoldRecordUi(false);
    recorder.holdActive = false;
    return;
  }

  const micSource = audioCtx.createMediaStreamSource(recorder.stream);
  recorder.recAnalyser = audioCtx.createAnalyser();
  recorder.recAnalyser.fftSize = 2048;
  recorder.recBuf = new Float32Array(recorder.recAnalyser.fftSize);
  micSource.connect(recorder.recAnalyser);

  recorder.mimeType = pickMimeType();
  recorder.chunks = [];
  recorder.mediaRecorder = new MediaRecorder(
    recorder.stream,
    recorder.mimeType ? { mimeType: recorder.mimeType } : undefined
  );
  recorder.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recorder.chunks.push(e.data); };
  recorder.mediaRecorder.onstop = finalizeRecording;
  recorder.mediaRecorder.start();

  resetAnalysis();
  renderSequence('rec-live-seq');
  renderSequence('hold-rec-live-seq');
  recorder.recording = true;
  recorder.startTime = performance.now();
  recorder.lastFrameTime = 0;

  const toggle = document.getElementById('rec-toggle');
  if (toggle) { toggle.classList.add('recording'); toggle.innerHTML = '&#9632; Stop'; }
  syncHoldRecordUi(true);
  document.getElementById('rec-live-label').textContent = 'Recording';
  document.getElementById('hold-rec-live-label').textContent = 'Recording';
  if (statusEl) statusEl.textContent = '';
  document.getElementById('rec-live-seq-wrap').style.display = 'block';
  document.getElementById('rec-playback-card').style.display = 'none';
  document.getElementById('rec-analysis-card').style.display = 'none';

  recorder.timerId = setInterval(tickTimer, 200);
  recordLoop();
}

function stopRecording() {
  if (!recorder.recording) return;
  recorder.recording = false;
  if (recorder.recRafId) { cancelAnimationFrame(recorder.recRafId); recorder.recRafId = null; }
  if (recorder.timerId) { clearInterval(recorder.timerId); recorder.timerId = null; }
  setLiveNote(null);
  updateMeter(0);
  const toggle = document.getElementById('rec-toggle');
  if (toggle) { toggle.classList.remove('recording'); toggle.innerHTML = '&#9679; Record'; }
  syncHoldRecordUi(false);
  document.getElementById('rec-live-label').textContent = 'Ready to record';
  document.getElementById('hold-rec-live-label').textContent = 'Hold to record';
  recorder.holdActive = false;
  recorder.holdPressed = false;
  try { recorder.mediaRecorder.stop(); } catch (e) { /* noop */ }
}

function finalizeRecording() {
  if (recorder.stream) { recorder.stream.getTracks().forEach(t => t.stop()); recorder.stream = null; }
  if (!recorder.chunks.length) return;

  recorder.blob = new Blob(recorder.chunks, { type: recorder.mimeType || 'audio/webm' });
  if (recorder.blobUrl) URL.revokeObjectURL(recorder.blobUrl);
  recorder.blobUrl = URL.createObjectURL(recorder.blob);

  setupAudioElement();

  document.getElementById('rec-playback-card').style.display = 'block';
  document.getElementById('rec-analysis-card').style.display = 'block';
  document.getElementById('rec-live-seq-wrap').style.display = 'none';

  renderSequence('rec-note-seq');
  renderKey();
}

function renderKey() {
  const keyEl = document.getElementById('rec-key');
  const altEl = document.getElementById('rec-key-alt');
  const ranked = detectKey(recorder.pcWeights);
  if (!ranked.length) {
    keyEl.textContent = '--';
    altEl.textContent = 'Not enough pitch data to estimate a key';
    return;
  }
  keyEl.textContent = keyLabel(ranked[0]);
  const alts = ranked.slice(1, 3).map(k => keyLabel(k)).join(' · ');
  altEl.textContent = alts ? 'Also possible: ' + alts : '';
}

function setupAudioElement() {
  if (!recorder.audioEl) {
    recorder.audioEl = new Audio();
    recorder.audioEl.addEventListener('ended', onPlaybackEnded);
  }
  recorder.audioEl.src = recorder.blobUrl;
  recorder.audioEl.load();

  if (!recorder.mediaElSource) {
    recorder.mediaElSource = audioCtx.createMediaElementSource(recorder.audioEl);
    recorder.playAnalyser = audioCtx.createAnalyser();
    recorder.playAnalyser.fftSize = 2048;
    recorder.playBuf = new Float32Array(recorder.playAnalyser.fftSize);
    recorder.mediaElSource.connect(recorder.playAnalyser);
    recorder.playAnalyser.connect(getAnalyserDestination());
  }
}

function highlightSeq(midi) {
  const c = document.getElementById('rec-note-seq');
  if (!c) return;
  c.querySelectorAll('.rec-seq-chip').forEach(chip => chip.classList.remove('active'));
  if (midi == null) return;
  // Highlight the closest matching upcoming/current chip by pitch.
  const chips = c.querySelectorAll('.rec-seq-chip');
  for (const chip of chips) {
    const idx = +chip.dataset.idx;
    if (recorder.sequence[idx] && recorder.sequence[idx].midi === midi) {
      chip.classList.add('active');
    }
  }
}

function playLoop() {
  if (!recorder.playing) return;
  recorder.playAnalyser.getFloatTimeDomainData(recorder.playBuf);
  const freq = autoCorrelate(recorder.playBuf, audioCtx.sampleRate);
  const noteEl = document.getElementById('rec-playnote');
  if (freq > 0 && freq < 2000) {
    const info = noteFromFreq(freq);
    if (noteEl) noteEl.textContent = info.name + info.oct;
    highlightSeq(info.midi);
  } else {
    if (noteEl) noteEl.textContent = '--';
    highlightSeq(null);
  }
  recorder.playRafId = requestAnimationFrame(playLoop);
}

function onPlaybackEnded() {
  recorder.playing = false;
  if (recorder.playRafId) { cancelAnimationFrame(recorder.playRafId); recorder.playRafId = null; }
  const btn = document.getElementById('rec-play');
  if (btn) btn.innerHTML = '&#9654; Play';
  const noteEl = document.getElementById('rec-playnote');
  if (noteEl) noteEl.textContent = '--';
  highlightSeq(null);
}

function startPlayback() {
  if (!recorder.audioEl) return;
  ensureAudio();
  recorder.audioEl.currentTime = 0;
  recorder.audioEl.play();
  recorder.playing = true;
  const btn = document.getElementById('rec-play');
  if (btn) btn.innerHTML = '&#9632; Stop';
  playLoop();
}

function stopPlayback() {
  if (recorder.audioEl) { recorder.audioEl.pause(); recorder.audioEl.currentTime = 0; }
  onPlaybackEnded();
}

function togglePlayback() {
  if (recorder.playing) stopPlayback(); else startPlayback();
}

function toggleRecording() {
  if (recorder.recording) stopRecording(); else startRecording();
}

function downloadRecording() {
  if (!recorder.blob || !recorder.blobUrl) return;
  let ext = 'webm';
  if (recorder.mimeType.includes('ogg')) ext = 'ogg';
  else if (recorder.mimeType.includes('mp4')) ext = 'm4a';
  const a = document.createElement('a');
  a.href = recorder.blobUrl;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  a.download = `musi-recording-${stamp}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function clearRecording(skipUi) {
  stopPlayback();
  if (recorder.blobUrl) { URL.revokeObjectURL(recorder.blobUrl); recorder.blobUrl = null; }
  recorder.blob = null;
  recorder.chunks = [];
  resetAnalysis();
  if (recorder.audioEl) recorder.audioEl.removeAttribute('src');
  if (!skipUi) {
    document.getElementById('rec-playback-card').style.display = 'none';
    document.getElementById('rec-analysis-card').style.display = 'none';
    const seqWrap = document.getElementById('rec-live-seq-wrap');
    if (seqWrap) seqWrap.style.display = 'none';
    const timer = document.getElementById('rec-timer');
    if (timer) timer.textContent = '0:00';
    const holdTimer = document.getElementById('hold-rec-timer');
    if (holdTimer) holdTimer.textContent = '0:00';
    setLiveNote(null);
    renderSequence('hold-rec-live-seq');
    updateMeter(0);
  }
}

function stopRecorder() {
  if (recorder.recording) stopRecording();
  if (recorder.playing) stopPlayback();
  if (recorder.stream) { recorder.stream.getTracks().forEach(t => t.stop()); recorder.stream = null; }
  syncHoldRecordUi(false);
  recorder.holdActive = false;
  recorder.holdPressed = false;
}

function initRecorder() {
  setLiveNote(null);
}

function initHoldRecordButton() {
  const btn = document.getElementById('hold-rec-btn');
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = '1';

  const begin = (e) => {
    e.preventDefault();
    if (recorder.recording) return;
    recorder.holdPressed = true;
    btn.setPointerCapture?.(e.pointerId);
    startRecording('hold');
  };
  const end = (e) => {
    e.preventDefault();
    recorder.holdPressed = false;
    if (btn.hasPointerCapture?.(e.pointerId)) btn.releasePointerCapture(e.pointerId);
    if (recorder.recording && recorder.holdActive) stopRecording();
  };

  btn.addEventListener('pointerdown', begin);
  btn.addEventListener('pointerup', end);
  btn.addEventListener('pointercancel', end);
  btn.addEventListener('lostpointercapture', () => {
    recorder.holdPressed = false;
    if (recorder.recording && recorder.holdActive) stopRecording();
  });
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

window.toggleRecording = toggleRecording;
window.togglePlayback = togglePlayback;
window.downloadRecording = downloadRecording;
window.clearRecording = clearRecording;

export { initRecorder, initHoldRecordButton, stopRecorder, recorder };
