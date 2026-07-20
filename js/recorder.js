import { audioCtx, ensureAudio, getAnalyserDestination, requestMicStream, releaseMicStream } from './audio.js';
import { NOTE_NAMES_SHARP, noteFromFreq } from './theory.js';
import { getSetting, saveSetting } from './persistence.js';
import { detectPitch } from './pitch.js';
import { saveAudio, attachmentsSupported } from './attachments.js';

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
  fileExt: 'webm',
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
  // Capture graph (web-audio processing chain shared by both formats).
  micSource: null,
  highpass: null,
  captureGain: null,
  captureDest: null,
  silentSink: null,
  pcmNode: null,
  pcmIsWorklet: false,
  pcmChunks: [],
  captureSampleRate: 48000,
  workletReady: false,
  // User-configurable capture options (persisted).
  format: 'wav',
  bitDepth: 24,
  normalize: true,
};

// Confidence-gated pitch detection shared with the vocal trainer. The
// `clarity` score rejects breath/room noise so spurious notes don't enter the
// detected-pitch sequence; returns -1 when no confident pitch is found.
function autoCorrelate(buf, sampleRate) {
  const { freq } = detectPitch(buf, sampleRate, { minClarity: 0.6 });
  return freq;
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

// High-quality bitrate for the compressed (Opus/AAC) path. 256 kbps is
// transparent for music while keeping file sizes reasonable.
const COMPRESSED_BITRATE = 256000;

// getUserMedia constraints tuned for music capture: disable the speech-oriented
// DSP (echo cancellation, noise suppression, auto gain) that pumps dynamics and
// gates sustained notes, and request a high, fixed sample rate.
function buildMicConstraints() {
  const supported = (navigator.mediaDevices.getSupportedConstraints &&
    navigator.mediaDevices.getSupportedConstraints()) || {};
  const audio = {};
  if (supported.echoCancellation) audio.echoCancellation = false;
  if (supported.noiseSuppression) audio.noiseSuppression = false;
  if (supported.autoGainControl) audio.autoGainControl = false;
  if (supported.channelCount) audio.channelCount = 1;
  if (supported.sampleRate) audio.sampleRate = 48000;
  return Object.keys(audio).length ? { audio } : { audio: true };
}

function writeWavString(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

// Encode mono Float32 samples to a PCM WAV blob (16- or 24-bit).
function encodeWav(samples, sampleRate, bitDepth) {
  const bytesPerSample = bitDepth === 24 ? 3 : 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeWavString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeWavString(view, 8, 'WAVE');
  writeWavString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, bitDepth, true);
  writeWavString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  if (bitDepth === 24) {
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      const v = Math.round(s * 8388607);
      view.setUint8(offset, v & 0xff);
      view.setUint8(offset + 1, (v >> 8) & 0xff);
      view.setUint8(offset + 2, (v >> 16) & 0xff);
      offset += 3;
    }
  } else {
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}

function mergePcmChunks(chunks) {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

// Scale peak amplitude to ~-0.3 dBFS so quiet takes are usable. Skips near-
// silent buffers to avoid amplifying the noise floor.
function peakNormalize(samples) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  if (peak < 0.0005) return samples;
  const target = 0.97;
  const gain = target / peak;
  for (let i = 0; i < samples.length; i++) samples[i] *= gain;
  return samples;
}

// Build the shared mic -> highpass -> gain processing chain. Returns the node
// whose output should feed the recorder destination / PCM tap.
function buildCaptureGraph() {
  recorder.micSource = audioCtx.createMediaStreamSource(recorder.stream);

  // Gentle high-pass removes DC offset and sub-sonic rumble below ~25 Hz.
  recorder.highpass = audioCtx.createBiquadFilter();
  recorder.highpass.type = 'highpass';
  recorder.highpass.frequency.value = 25;
  recorder.highpass.Q.value = 0.707;

  recorder.captureGain = audioCtx.createGain();
  recorder.captureGain.gain.value = 1;

  recorder.micSource.connect(recorder.highpass);
  recorder.highpass.connect(recorder.captureGain);

  recorder.recAnalyser = audioCtx.createAnalyser();
  recorder.recAnalyser.fftSize = 2048;
  recorder.recBuf = new Float32Array(recorder.recAnalyser.fftSize);
  recorder.captureGain.connect(recorder.recAnalyser);
}

async function startPcmCapture() {
  recorder.pcmChunks = [];
  recorder.captureSampleRate = audioCtx.sampleRate;

  // Silent sink keeps the capture node in the rendering graph without monitoring
  // the input back through the speakers (which would cause feedback).
  recorder.silentSink = audioCtx.createGain();
  recorder.silentSink.gain.value = 0;
  recorder.silentSink.connect(audioCtx.destination);

  if (audioCtx.audioWorklet) {
    try {
      if (!recorder.workletReady) {
        await audioCtx.audioWorklet.addModule('js/recorderWorklet.js');
        recorder.workletReady = true;
      }
      recorder.pcmNode = new AudioWorkletNode(audioCtx, 'recorder-capture', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
      });
      recorder.pcmNode.port.onmessage = (e) => { recorder.pcmChunks.push(e.data); };
      recorder.pcmIsWorklet = true;
      recorder.captureGain.connect(recorder.pcmNode);
      recorder.pcmNode.connect(recorder.silentSink);
      return;
    } catch (e) {
      recorder.workletReady = false;
    }
  }

  // Fallback: ScriptProcessorNode (deprecated but broadly supported).
  recorder.pcmNode = audioCtx.createScriptProcessor(4096, 1, 1);
  recorder.pcmIsWorklet = false;
  recorder.pcmNode.onaudioprocess = (e) => {
    recorder.pcmChunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  };
  recorder.captureGain.connect(recorder.pcmNode);
  recorder.pcmNode.connect(recorder.silentSink);
}

function teardownCaptureGraph() {
  if (recorder.pcmNode) {
    if (recorder.pcmIsWorklet && recorder.pcmNode.port) recorder.pcmNode.port.onmessage = null;
    else recorder.pcmNode.onaudioprocess = null;
    try { recorder.pcmNode.disconnect(); } catch (e) { /* noop */ }
    recorder.pcmNode = null;
  }
  if (recorder.silentSink) { try { recorder.silentSink.disconnect(); } catch (e) { /* noop */ } recorder.silentSink = null; }
  if (recorder.captureDest) { try { recorder.captureDest.disconnect(); } catch (e) { /* noop */ } recorder.captureDest = null; }
  if (recorder.captureGain) { try { recorder.captureGain.disconnect(); } catch (e) { /* noop */ } recorder.captureGain = null; }
  if (recorder.highpass) { try { recorder.highpass.disconnect(); } catch (e) { /* noop */ } recorder.highpass = null; }
  if (recorder.micSource) { try { recorder.micSource.disconnect(); } catch (e) { /* noop */ } recorder.micSource = null; }
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
    recorder.stream = await requestMicStream(buildMicConstraints());
  } catch (e) {
    if (statusEl) statusEl.textContent = 'Mic access denied or unavailable';
    syncHoldRecordUi(false);
    return;
  }

  if (recorder.holdActive && !recorder.holdPressed) {
    releaseMicStream(recorder.stream);
    recorder.stream = null;
    syncHoldRecordUi(false);
    recorder.holdActive = false;
    return;
  }

  buildCaptureGraph();

  const useWav = recorder.format === 'wav';
  if (useWav) {
    try {
      await startPcmCapture();
    } catch (e) {
      if (statusEl) statusEl.textContent = 'Lossless capture unavailable; using compressed';
      recorder.format = 'opus';
    }
  }

  if (recorder.format === 'wav') {
    recorder.mimeType = 'audio/wav';
    recorder.fileExt = 'wav';
    recorder.mediaRecorder = null;
  } else {
    // Compressed path records the processed signal via a MediaStream destination
    // so the high-pass filter is applied to the Opus/AAC output too.
    recorder.captureDest = audioCtx.createMediaStreamDestination();
    recorder.captureGain.connect(recorder.captureDest);
    recorder.mimeType = pickMimeType();
    recorder.fileExt = recorder.mimeType.includes('ogg') ? 'ogg'
      : recorder.mimeType.includes('mp4') ? 'm4a' : 'webm';
    recorder.chunks = [];
    const opts = recorder.mimeType
      ? { mimeType: recorder.mimeType, audioBitsPerSecond: COMPRESSED_BITRATE }
      : { audioBitsPerSecond: COMPRESSED_BITRATE };
    try {
      recorder.mediaRecorder = new MediaRecorder(recorder.captureDest.stream, opts);
    } catch (e) {
      recorder.mediaRecorder = new MediaRecorder(recorder.captureDest.stream,
        recorder.mimeType ? { mimeType: recorder.mimeType } : undefined);
    }
    recorder.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recorder.chunks.push(e.data); };
    recorder.mediaRecorder.onstop = finalizeRecording;
    recorder.mediaRecorder.start();
  }

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

  if (recorder.mediaRecorder) {
    try { recorder.mediaRecorder.stop(); } catch (e) { /* noop */ }
  } else {
    // WAV path: flush any buffered samples from the worklet, then finalize.
    if (recorder.pcmIsWorklet && recorder.pcmNode && recorder.pcmNode.port) {
      recorder.pcmNode.port.postMessage('flush');
      setTimeout(finalizeRecording, 60);
    } else {
      finalizeRecording();
    }
  }
}

function finalizeRecording() {
  if (recorder.stream) { releaseMicStream(recorder.stream); recorder.stream = null; }

  if (recorder.format === 'wav') {
    let samples = mergePcmChunks(recorder.pcmChunks);
    teardownCaptureGraph();
    if (!samples.length) return;
    if (recorder.normalize) samples = peakNormalize(samples);
    recorder.blob = encodeWav(samples, recorder.captureSampleRate, recorder.bitDepth);
  } else {
    teardownCaptureGraph();
    if (!recorder.chunks.length) return;
    recorder.blob = new Blob(recorder.chunks, { type: recorder.mimeType || 'audio/webm' });
  }

  if (recorder.blobUrl) URL.revokeObjectURL(recorder.blobUrl);
  recorder.blobUrl = URL.createObjectURL(recorder.blob);

  setupAudioElement();
  resetSaveButton();

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

// Saves the current take into the IndexedDB audio library so it persists.
// Library items remain until deleted manually.
async function saveRecording() {
  const btn = document.getElementById('rec-save');
  if (!recorder.blob) return;
  if (!attachmentsSupported()) {
    if (btn) btn.textContent = 'Storage unavailable';
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const ext = recorder.fileExt || 'webm';
  const meta = await saveAudio({
    blob: recorder.blob,
    name: `Recording ${stamp}`,
    type: recorder.blob.type || recorder.mimeType || '',
    fileName: `musi-recording-${stamp.replace(/[: ]/g, '-')}.${ext}`,
    size: recorder.blob.size,
    source: 'recording',
  });
  if (btn) {
    if (meta) { btn.textContent = 'Saved \u2713'; }
    else { btn.disabled = false; btn.textContent = 'Save failed — retry'; }
  }
}

function resetSaveButton() {
  const btn = document.getElementById('rec-save');
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = 'Save to Library';
}

function downloadRecording() {
  if (!recorder.blob || !recorder.blobUrl) return;
  const ext = recorder.fileExt || 'webm';
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
  recorder.pcmChunks = [];
  teardownCaptureGraph();
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
  if (recorder.stream) { releaseMicStream(recorder.stream); recorder.stream = null; }
  syncHoldRecordUi(false);
  recorder.holdActive = false;
  recorder.holdPressed = false;
}

function updateDepthVisibility() {
  const depthOpt = document.getElementById('rec-depth-opt');
  if (depthOpt) depthOpt.style.display = recorder.format === 'wav' ? '' : 'none';
}

function initRecorder() {
  setLiveNote(null);

  recorder.format = getSetting('recFormat', 'wav', ['wav', 'opus']);
  recorder.bitDepth = getSetting('recBitDepth', 24, [16, 24]);
  recorder.normalize = getSetting('recNormalize', true) !== false;

  const formatEl = document.getElementById('rec-format');
  if (formatEl && formatEl.dataset.wired) { updateDepthVisibility(); return; }

  if (formatEl) {
    formatEl.dataset.wired = '1';
    formatEl.value = recorder.format;
    formatEl.addEventListener('change', () => {
      recorder.format = formatEl.value === 'opus' ? 'opus' : 'wav';
      saveSetting('recFormat', recorder.format);
      updateDepthVisibility();
    });
  }
  const depthEl = document.getElementById('rec-depth');
  if (depthEl) {
    depthEl.value = String(recorder.bitDepth);
    depthEl.addEventListener('change', () => {
      recorder.bitDepth = depthEl.value === '16' ? 16 : 24;
      saveSetting('recBitDepth', recorder.bitDepth);
    });
  }
  const normEl = document.getElementById('rec-normalize');
  if (normEl) {
    normEl.checked = recorder.normalize;
    normEl.addEventListener('change', () => {
      recorder.normalize = normEl.checked;
      saveSetting('recNormalize', recorder.normalize);
    });
  }
  updateDepthVisibility();
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
window.saveRecording = saveRecording;
window.downloadRecording = downloadRecording;
window.clearRecording = clearRecording;

export { initRecorder, initHoldRecordButton, stopRecorder, recorder };
