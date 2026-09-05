// The Audio Studio recorder.
//
// The Record tab captures a take, then reads the idea out of it: the notes
// the singer sang, in the order they sang them. The idea model lives in
// js/audioStudio/ideaModel.js, the roll and the chips in ideaView.js, and the
// playback tone in ideaSynth.js. This file owns the microphone, the take, and
// the wiring between them.

import { audioCtx, ensureAudio, getAnalyserDestination, requestMicStream, releaseMicStream } from './audio.js';
import { noteFromFreq } from './theory.js';
import { getSetting, saveSetting } from './persistence.js';
import { detectPitch } from './pitch.js';
import { saveAudio, attachmentsSupported } from './attachments.js';
import { decodeAudioFile, transcribeBuffer } from './trackToSheet/transcribe.js';
import { createAnalysisPanel } from './trackToSheet/analysisPanel.js';
import { transcriptionToGpResult } from './trackToSheet/toTabModel.js';
import { setAudioStudioRun, openAudioStudioRunner } from './audioStudioRunner.js';
import { registerUnsaved, clearUnsaved } from './shell/unsavedGuard.js';
import { claimAudio, releaseAudio } from './audioOwner.js';
import { openSelectionSheet } from './selectionSheet.js';
import { loadGpPlayerResult } from './gpPlayer.js';
import {
  IDEA_SOURCES,
  DEFAULT_IDEA_SOURCE,
  analysisOptionsForSource,
  buildIdea,
  ideaBarCount,
  ideaToText,
  ideaToTranscription,
  ideaPlaybackEvents,
  noteAtTime,
} from './audioStudio/ideaModel.js';
import { createIdeaView } from './audioStudio/ideaView.js';
import { createIdeaSynth } from './audioStudio/ideaSynth.js';

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
  playRafId: null,
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
  // The idea read out of the take.
  transcription: null,
  idea: null,
  ideaSource: DEFAULT_IDEA_SOURCE,
  ideaSnap: false,
  runnerReady: false,
  riffBusy: false,
  audioBuffer: null,
};

let riffAnalysisPanel = null;
let recorderAudioHandle = null;
let playbackAudioHandle = null;
let ideaAudioHandle = null;
let ideaView = null;
let ideaSynth = null;

/** Give the audio slot back once the microphone closes. */
function releaseRecorderAudio() {
  if (!recorderAudioHandle) return;
  releaseAudio(recorderAudioHandle);
  recorderAudioHandle = null;
}

async function promptRecorderAudio({ title, choices }) {
  const choiceId = await openSelectionSheet({
    title,
    items: choices.map((label) => ({ id: label, label })),
    search: false,
  });
  return choiceId;
}

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

function resetAnalysis() {
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
  recorder.lastFrameTime = now;

  const level = Math.min(1, rmsOf(recorder.recBuf) * 6);
  updateMeter(level);

  const freq = autoCorrelate(recorder.recBuf, audioCtx.sampleRate);
  if (freq > 0 && freq < 2000) {
    const info = noteFromFreq(freq);
    setLiveNote(info);
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
  ideaSynth?.stop();
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

  const handle = await claimAudio({
    id: 'recorder',
    label: 'Audio Studio',
    kind: 'recording',
    unsaved: !!recorder.blob,
    onStop: () => stopRecorder(),
    handlers: { save: saveRecording, discard: clearRecording },
  }, promptRecorderAudio);
  if (!handle) {
    releaseMicStream(recorder.stream);
    recorder.stream = null;
    syncHoldRecordUi(false);
    return;
  }
  recorderAudioHandle = handle;

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
  ideaSynth?.stop();

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
  // The microphone is closed, so the slot goes free. The take itself stays
  // under the unsaved guard until the player saves or discards it.
  releaseRecorderAudio();

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
  document.getElementById('rec-live-seq-wrap').style.display = 'none';

  showIdeaCard();
  recognizeRiff();

  registerUnsaved('recorder', {
    describe: () => 'Unsaved recording',
    save: () => saveRecording(),
    discard: () => clearRecording(),
  });
}

function setRiffStatus(msg, kind = '') {
  const el = document.getElementById('rec-idea-status');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('is-err', kind === 'err');
  el.classList.toggle('is-ok', kind === 'ok');
}

/** Enable the idea actions only while an idea holds notes and nothing runs. */
function syncIdeaActions() {
  const hasNotes = !!recorder.idea?.notes?.length;
  const busy = recorder.riffBusy;
  const set = (id, disabled) => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = disabled;
  };
  set('rec-idea-play', busy || !hasNotes);
  set('rec-idea-runner', busy || !recorder.runnerReady);
  set('rec-idea-copy', busy || !hasNotes);
  set('rec-idea-tab', busy || !hasNotes);
  set('rec-riff-recognize', busy || !recorder.blob);
  const snap = document.getElementById('rec-idea-snap');
  if (snap) snap.disabled = busy;
  for (const chip of document.querySelectorAll('#rec-idea-source .rec-idea-source-chip')) {
    chip.disabled = busy;
  }
}

function setRiffBusy(busy) {
  recorder.riffBusy = busy;
  const progress = document.getElementById('rec-idea-progress');
  const bpmEl = document.getElementById('rec-riff-bpm');
  const meterEl = document.getElementById('rec-riff-meter');
  if (bpmEl) bpmEl.disabled = busy;
  if (meterEl) meterEl.disabled = busy;
  if (progress) progress.hidden = !busy;
  riffAnalysisPanel?.setBusy(busy);
  syncIdeaActions();
}

function syncRiffTempoInputs(opts) {
  const bpmEl = document.getElementById('rec-riff-bpm');
  const meterEl = document.getElementById('rec-riff-meter');
  const bpm = opts?.tempoMode === 'manual' && opts.bpm != null
    ? opts.bpm
    : (recorder.transcription?.bpm ?? opts?.bpm ?? 120);
  const beats = opts?.beatsPerBar ?? recorder.transcription?.beatsPerBar ?? 4;
  if (bpmEl) bpmEl.value = String(bpm);
  if (meterEl) meterEl.value = String(Number(beats) === 3 ? 3 : 4);
}

function syncPanelFromRiffInputs() {
  const bpmEl = document.getElementById('rec-riff-bpm');
  const meterEl = document.getElementById('rec-riff-meter');
  if (!riffAnalysisPanel || !bpmEl || !meterEl) return;
  const bpm = Math.max(40, Math.min(240, Math.round(Number(bpmEl.value) || 120)));
  const beatsPerBar = Number(meterEl.value) === 3 ? 3 : 4;
  riffAnalysisPanel.setOptions({ tempoMode: 'manual', bpm, beatsPerBar });
}

function getRiffMeta() {
  const opts = riffAnalysisPanel?.getOptions();
  if (opts) {
    const bpm = opts.tempoMode === 'manual' && opts.bpm != null
      ? opts.bpm
      : (recorder.transcription?.bpm ?? opts.bpm ?? 120);
    const beatsPerBar = opts.beatsPerBar ?? recorder.transcription?.beatsPerBar ?? 4;
    return {
      bpm: Math.max(40, Math.min(240, Math.round(Number(bpm) || 120))),
      beatsPerBar: Number(beatsPerBar) === 3 ? 3 : 4,
    };
  }
  const bpmEl = document.getElementById('rec-riff-bpm');
  const meterEl = document.getElementById('rec-riff-meter');
  const bpm = Math.max(40, Math.min(240, Math.round(Number(bpmEl?.value) || 120)));
  const beatsPerBar = Number(meterEl?.value) === 3 ? 3 : 4;
  return { bpm, beatsPerBar };
}

function renderRiffMeta(bars, confidence) {
  const barsEl = document.getElementById('rec-riff-bars');
  const confEl = document.getElementById('rec-riff-confidence');
  if (barsEl) barsEl.textContent = bars > 0 ? String(bars) : '--';
  if (confEl) {
    confEl.textContent = Number.isFinite(confidence)
      ? `${Math.round(confidence * 100)}%`
      : '--';
  }
}

function renderRiffDiagnostics(result) {
  const gridEl = document.getElementById('rec-riff-grid');
  const qualityEl = document.getElementById('rec-riff-quality');
  const guidanceEl = document.getElementById('rec-riff-guidance');
  const grid = result?.grid;
  const diag = result?.diagnostics;
  if (gridEl) gridEl.textContent = grid?.label || '--';
  if (qualityEl) {
    if (!diag) qualityEl.textContent = '--';
    else {
      const voiced = Math.round((diag.voicedRatio ?? 0) * 100);
      const count = diag.noteCount ?? result?.notes?.length ?? 0;
      qualityEl.textContent = `${voiced}% voiced · ${count} notes`;
    }
  }
  if (guidanceEl) {
    const notes = result?.notes ?? [];
    const duration = result?.durationSec ?? 0;
    const voicedRatio = diag?.voicedRatio ?? 0;
    let msg = '';
    if (!notes.length || voicedRatio < 0.15) {
      msg = 'Low pitch detection — sing closer to the microphone, or open Analysis settings and try the Sensitive preset.';
    } else if (duration > 0 && notes.length / duration > 8) {
      msg = 'Many short notes detected — try the Strict preset, or lower Onset sensitivity.';
    }
    guidanceEl.textContent = msg;
    guidanceEl.hidden = !msg;
  }
}

/** Draw the idea and keep the actions honest. */
function paintIdea() {
  ideaView?.render(recorder.idea);
  syncIdeaActions();
  const tabWrap = document.getElementById('rec-idea-tab-wrap');
  if (tabWrap && !tabWrap.hidden) paintIdeaTab();
}

/**
 * Read the tempo and the meter of the panel back into the idea, then tell the
 * user whether the take can go to the Pitch Runner.
 */
function refreshRiffRun() {
  if (!recorder.transcription?.notes?.length || !recorder.idea) {
    recorder.runnerReady = false;
    renderRiffMeta(0, recorder.transcription?.tempoConfidence);
    syncIdeaActions();
    return;
  }
  const { bpm, beatsPerBar } = getRiffMeta();
  recorder.transcription.bpm = bpm;
  recorder.transcription.beatsPerBar = beatsPerBar;
  recorder.idea = { ...recorder.idea, bpm, beatsPerBar };
  recorder.runnerReady = recorder.idea.notes.length > 0;
  renderRiffMeta(ideaBarCount(recorder.idea), recorder.transcription.tempoConfidence);
  paintIdea();
}

/** Build the idea again from the transcription. An edit of a note is lost. */
function rebuildIdea() {
  if (!recorder.transcription) {
    recorder.idea = null;
    recorder.runnerReady = false;
    paintIdea();
    return;
  }
  recorder.idea = buildIdea(recorder.transcription, {
    snapToKey: recorder.ideaSnap,
    source: recorder.ideaSource,
  });
  refreshRiffRun();
}

function applyTranscriptionResult(result) {
  recorder.transcription = result;

  const panelOpts = riffAnalysisPanel?.getOptions();
  const nextOpts = { ...panelOpts };
  if (!panelOpts || panelOpts.tempoMode !== 'manual') {
    nextOpts.bpm = result.bpm;
    nextOpts.beatsPerBar = result.beatsPerBar;
  }
  riffAnalysisPanel?.setOptions(nextOpts);
  syncRiffTempoInputs(riffAnalysisPanel?.getOptions() ?? nextOpts);

  renderRiffDiagnostics(result);
  rebuildIdea();
}

async function runRiffAnalysis({ decodeFirst = false } = {}) {
  if (recorder.riffBusy) return;
  if (decodeFirst && !recorder.blob) return;
  if (!decodeFirst && !recorder.audioBuffer && !recorder.blob) return;

  ideaSynth?.stop();
  setRiffBusy(true);
  const progress = document.getElementById('rec-idea-progress');
  if (progress) {
    progress.hidden = false;
    progress.value = 0;
  }

  try {
    ensureAudio();
    if (decodeFirst || !recorder.audioBuffer) {
      if (!recorder.blob) return;
      setRiffStatus('Decoding audio…');
      recorder.audioBuffer = await decodeAudioFile(recorder.blob);
    }

    // The source chip names the band; the panel holds the rest.
    const options = {
      ...riffAnalysisPanel?.getOptions(),
      ...analysisOptionsForSource(recorder.ideaSource),
      onProgress: (p) => {
        if (progress) progress.value = p;
        setRiffStatus(`Reading the notes… ${Math.round(p * 100)}%`);
      },
    };

    setRiffStatus('Reading the notes…');
    const result = await transcribeBuffer(recorder.audioBuffer, options);
    applyTranscriptionResult(result);

    if (!result.notes.length) {
      setRiffStatus('No clear notes found. Sing closer to the microphone, or try the Sensitive preset under Tempo and analysis.', 'err');
      return;
    }
    const n = recorder.idea?.notes?.length || 0;
    setRiffStatus(`Read ${n} note${n === 1 ? '' : 's'} in ${result.durationSec.toFixed(1)} s. Press Play notes to check them.`, 'ok');
  } catch (err) {
    console.error(err);
    recorder.transcription = null;
    recorder.idea = null;
    recorder.runnerReady = false;
    renderRiffMeta(0, null);
    renderRiffDiagnostics(null);
    paintIdea();
    setRiffStatus(`Reading failed: ${err.message || err}`, 'err');
  } finally {
    setRiffBusy(false);
  }
}

async function recognizeRiff() {
  await runRiffAnalysis({ decodeFirst: true });
}

/** Send the notes of the idea to the Pitch Runner pane and open it. */
function sendRiffToRunner() {
  if (!recorder.runnerReady || recorder.riffBusy || !recorder.idea) return;
  refreshRiffRun();
  const ok = setAudioStudioRun(ideaToTranscription(recorder.idea), {
    name: 'Idea',
    origin: 'record',
  });
  if (!ok) {
    setRiffStatus('These notes do not fit a run. Try a longer or clearer take.', 'err');
    return;
  }
  ideaSynth?.stop();
  openAudioStudioRunner();
  setRiffStatus('Sent to the Pitch Runner.', 'ok');
}

/* ---- the idea actions ---- */

function onIdeaChanged(next) {
  recorder.idea = next;
  recorder.runnerReady = next.notes.length > 0;
  renderRiffMeta(ideaBarCount(next), recorder.transcription?.tempoConfidence);
  paintIdea();
}

function toggleIdeaPlayback() {
  if (!ideaSynth) return;
  if (ideaSynth.isPlaying()) {
    ideaSynth.stop();
    return;
  }
  if (!recorder.idea?.notes?.length) return;
  if (recorder.playing) stopPlayback();
  const handle = claimAudio({
    id: 'recorder-idea',
    label: 'Audio Studio — idea',
    kind: 'tone',
    onStop: () => ideaSynth?.stop(),
  });
  if (!handle || typeof handle.then === 'function') return;
  ideaAudioHandle = handle;
  const started = ideaSynth.play(ideaPlaybackEvents(recorder.idea));
  if (!started) {
    releaseAudio(ideaAudioHandle);
    ideaAudioHandle = null;
    return;
  }
  const btn = document.getElementById('rec-idea-play');
  if (btn) btn.innerHTML = '&#9632; Stop notes';
}

function onIdeaPlaybackEnded() {
  const btn = document.getElementById('rec-idea-play');
  if (btn) btn.innerHTML = '&#9654; Play notes';
  ideaView?.setPlayhead(null);
  if (ideaAudioHandle) {
    releaseAudio(ideaAudioHandle);
    ideaAudioHandle = null;
  }
}

function copyIdeaNotes() {
  if (!recorder.idea?.notes?.length) return;
  const text = ideaToText(recorder.idea);
  if (!navigator.clipboard?.writeText) {
    setRiffStatus('This browser cannot copy to the clipboard.', 'err');
    return;
  }
  navigator.clipboard.writeText(text).then(() => {
    setRiffStatus('Notes copied.', 'ok');
  }).catch(() => {
    setRiffStatus('Could not copy to the clipboard.', 'err');
  });
}

/** The idea as a Guitar Pro result: a tab on the neck at the tempo shown. */
function ideaGpResult() {
  if (!recorder.idea?.notes?.length) return null;
  try {
    return transcriptionToGpResult(ideaToTranscription(recorder.idea), { name: 'Idea' });
  } catch (err) {
    console.error(err);
    return null;
  }
}

function paintIdeaTab() {
  const text = document.getElementById('rec-idea-tab-text');
  if (!text) return;
  const gp = ideaGpResult();
  const ascii = gp?.tracks?.[0]?.ascii || '';
  text.textContent = ascii || 'No notes to place on the tab.';
}

function toggleIdeaTab() {
  const wrap = document.getElementById('rec-idea-tab-wrap');
  const btn = document.getElementById('rec-idea-tab');
  if (!wrap) return;
  wrap.hidden = !wrap.hidden;
  if (btn) btn.setAttribute('aria-expanded', wrap.hidden ? 'false' : 'true');
  if (!wrap.hidden) paintIdeaTab();
}

function openIdeaInScorePlayer() {
  const gp = ideaGpResult();
  if (!gp) return;
  ideaSynth?.stop();
  if (recorder.playing) stopPlayback();
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  loadGpPlayerResult(gp, { title: `Idea ${stamp}`, fileName: `idea-${stamp.replace(/[: ]/g, '-')}.riff` });
}

function setIdeaSource(id) {
  const next = IDEA_SOURCES.some((s) => s.id === id) ? id : DEFAULT_IDEA_SOURCE;
  recorder.ideaSource = next;
  saveSetting('recIdeaSource', next);
  paintIdeaSources();
  riffAnalysisPanel?.setOptions(analysisOptionsForSource(next));
  if (recorder.audioBuffer || recorder.blob) runRiffAnalysis({ decodeFirst: !recorder.audioBuffer });
}

function paintIdeaSources() {
  const box = document.getElementById('rec-idea-source');
  if (!box) return;
  box.innerHTML = '';
  for (const source of IDEA_SOURCES) {
    const on = source.id === recorder.ideaSource;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `btn sm rec-idea-source-chip${on ? ' active' : ''}`;
    chip.textContent = source.label;
    chip.title = source.hint;
    chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    chip.disabled = recorder.riffBusy;
    chip.addEventListener('click', () => { if (!on) setIdeaSource(source.id); });
    box.appendChild(chip);
  }
}

function clearRiffState() {
  ideaSynth?.stop();
  recorder.transcription = null;
  recorder.idea = null;
  recorder.runnerReady = false;
  recorder.audioBuffer = null;
  recorder.riffBusy = false;
  const card = document.getElementById('rec-idea-card');
  if (card) card.style.display = 'none';
  setRiffStatus('');
  renderRiffMeta(0, null);
  renderRiffDiagnostics(null);
  const tabWrap = document.getElementById('rec-idea-tab-wrap');
  if (tabWrap) tabWrap.hidden = true;
  const tabBtn = document.getElementById('rec-idea-tab');
  if (tabBtn) tabBtn.setAttribute('aria-expanded', 'false');
  const progress = document.getElementById('rec-idea-progress');
  if (progress) {
    progress.hidden = true;
    progress.value = 0;
  }
  paintIdea();
}

function showIdeaCard() {
  const card = document.getElementById('rec-idea-card');
  if (card) card.style.display = 'block';
  ideaView?.relayout();
}

function setupAudioElement() {
  if (!recorder.audioEl) {
    recorder.audioEl = new Audio();
    recorder.audioEl.addEventListener('ended', onPlaybackEnded);
  }
  recorder.audioEl.src = recorder.blobUrl;
  recorder.audioEl.load();

  // The element plays through the shared mix bus, so the master volume and
  // the compressor apply to the take as they do to every other sound.
  if (!recorder.mediaElSource) {
    recorder.mediaElSource = audioCtx.createMediaElementSource(recorder.audioEl);
    recorder.playAnalyser = audioCtx.createGain();
    recorder.mediaElSource.connect(recorder.playAnalyser);
    recorder.playAnalyser.connect(getAnalyserDestination());
  }
}

/** Follow the take on the roll: the note that sounds now lights up. */
function playLoop() {
  if (!recorder.playing) return;
  const sec = recorder.audioEl ? recorder.audioEl.currentTime : 0;
  const noteEl = document.getElementById('rec-playnote');
  const current = ideaView ? ideaView.setPlayhead(sec) : noteAtTime(recorder.idea, sec);
  if (noteEl) noteEl.textContent = current ? current.label : '--';
  recorder.playRafId = requestAnimationFrame(playLoop);
}

function onPlaybackEnded() {
  recorder.playing = false;
  if (recorder.playRafId) { cancelAnimationFrame(recorder.playRafId); recorder.playRafId = null; }
  if (playbackAudioHandle) {
    releaseAudio(playbackAudioHandle);
    playbackAudioHandle = null;
  }
  const btn = document.getElementById('rec-play');
  if (btn) btn.innerHTML = '&#9654; Play';
  const noteEl = document.getElementById('rec-playnote');
  if (noteEl) noteEl.textContent = '--';
  ideaView?.setPlayhead(null);
}

function startPlayback() {
  if (!recorder.audioEl) return;
  ensureAudio();
  ideaSynth?.stop();
  const handle = claimAudio({
    id: 'recorder-playback',
    label: 'Audio Studio — take',
    kind: 'media',
    onStop: () => stopPlayback(),
  });
  if (!handle || typeof handle.then === 'function') return;
  playbackAudioHandle = handle;
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
    if (meta) {
      btn.textContent = 'Saved \u2713';
      clearUnsaved('recorder');
    } else { btn.disabled = false; btn.textContent = 'Save failed — retry'; }
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
  clearUnsaved('recorder');
  recorder.chunks = [];
  recorder.pcmChunks = [];
  teardownCaptureGraph();
  resetAnalysis();
  clearRiffState();
  if (recorder.audioEl) recorder.audioEl.removeAttribute('src');
  if (!skipUi) {
    document.getElementById('rec-playback-card').style.display = 'none';
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
  ideaSynth?.stop();
  if (recorder.stream) { releaseMicStream(recorder.stream); recorder.stream = null; }
  releaseRecorderAudio();
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

  recorder.ideaSource = getSetting('recIdeaSource', DEFAULT_IDEA_SOURCE, IDEA_SOURCES.map((s) => s.id));
  recorder.ideaSnap = getSetting('recIdeaSnap', false) === true;

  const recognizeBtn = document.getElementById('rec-riff-recognize');
  if (recognizeBtn && !recognizeBtn.dataset.wired) {
    recognizeBtn.dataset.wired = '1';
    recognizeBtn.addEventListener('click', () => runRiffAnalysis({ decodeFirst: !recorder.audioBuffer }));
  }
  const wire = (id, fn) => {
    const btn = document.getElementById(id);
    if (btn && !btn.dataset.wired) {
      btn.dataset.wired = '1';
      btn.addEventListener('click', fn);
    }
  };
  wire('rec-idea-runner', sendRiffToRunner);
  wire('rec-idea-play', toggleIdeaPlayback);
  wire('rec-idea-copy', copyIdeaNotes);
  wire('rec-idea-tab', toggleIdeaTab);
  wire('rec-idea-open-score', openIdeaInScorePlayer);

  const snapEl = document.getElementById('rec-idea-snap');
  if (snapEl && !snapEl.dataset.wired) {
    snapEl.dataset.wired = '1';
    snapEl.checked = recorder.ideaSnap;
    snapEl.addEventListener('change', () => {
      recorder.ideaSnap = snapEl.checked;
      saveSetting('recIdeaSnap', recorder.ideaSnap);
      rebuildIdea();
    });
  }
  paintIdeaSources();

  if (!ideaView) {
    const rollEl = document.getElementById('rec-idea-roll');
    const notesEl = document.getElementById('rec-idea-notes');
    const editorEl = document.getElementById('rec-idea-editor');
    const summaryEl = document.getElementById('rec-idea-summary');
    if (rollEl && notesEl && editorEl) {
      ideaView = createIdeaView({ rollEl, notesEl, editorEl, summaryEl, onChange: onIdeaChanged });
      window.addEventListener('resize', () => ideaView?.relayout());
    }
  }
  if (!ideaSynth) {
    ideaSynth = createIdeaSynth({
      onTick: (sec) => {
        const first = recorder.idea?.notes?.length
          ? Math.min(...recorder.idea.notes.map((n) => n.startSec))
          : 0;
        ideaView?.setPlayhead(first + sec);
      },
      onEnd: onIdeaPlaybackEnded,
    });
  }
  syncIdeaActions();
  const bpmEl = document.getElementById('rec-riff-bpm');
  if (bpmEl && !bpmEl.dataset.wired) {
    bpmEl.dataset.wired = '1';
    bpmEl.addEventListener('change', () => {
      syncPanelFromRiffInputs();
      if (recorder.transcription) refreshRiffRun();
    });
  }
  const meterEl = document.getElementById('rec-riff-meter');
  if (meterEl && !meterEl.dataset.wired) {
    meterEl.dataset.wired = '1';
    meterEl.addEventListener('change', () => {
      syncPanelFromRiffInputs();
      if (recorder.transcription) refreshRiffRun();
    });
  }

  const riffMount = document.getElementById('rec-riff-analysis-mount');
  if (riffMount && !riffMount.dataset.wired) {
    riffMount.dataset.wired = '1';
    riffAnalysisPanel = createAnalysisPanel({
      mount: riffMount,
      storageKey: 'recRiffAnalysisOptions',
      idPrefix: 'rec-riff-analysis',
      onReanalyze: () => runRiffAnalysis({ decodeFirst: false }),
      onChange: (opts) => {
        syncRiffTempoInputs(opts);
        if (recorder.transcription && !recorder.riffBusy) refreshRiffRun();
      },
    });
  }
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
window.recognizeRiff = recognizeRiff;
window.sendRiffToRunner = sendRiffToRunner;
window.toggleIdeaPlayback = toggleIdeaPlayback;

export { initRecorder, initHoldRecordButton, stopRecorder, recorder };
