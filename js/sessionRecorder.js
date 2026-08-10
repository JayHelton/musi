// DOM-free microphone capture for exercise practice takes.
// Prefers MediaRecorder (Opus/WebM) with a WAV fallback via Web Audio.

import { ensureAudio, audioCtx, requestMicStream, releaseMicStream } from './audio.js';

const COMPRESSED_BITRATE = 192000;

function buildMicConstraints() {
  const supported = (navigator.mediaDevices?.getSupportedConstraints?.()) || {};
  const audio = {};
  if (supported.echoCancellation) audio.echoCancellation = false;
  if (supported.noiseSuppression) audio.noiseSuppression = false;
  if (supported.autoGainControl) audio.autoGainControl = false;
  if (supported.channelCount) audio.channelCount = 1;
  if (supported.sampleRate) audio.sampleRate = 48000;
  return Object.keys(audio).length ? { audio } : { audio: true };
}

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return '';
}

function extFromMime(mime) {
  if (!mime) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  return 'webm';
}

function writeWavString(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

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
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
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

function peakNormalize(samples) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  if (peak < 0.0005) return samples;
  const gain = 0.97 / peak;
  for (let i = 0; i < samples.length; i++) samples[i] *= gain;
  return samples;
}

function rmsOf(buf) {
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  return Math.sqrt(rms / buf.length);
}

/**
 * @param {object} [options]
 * @param {'auto'|'webm'|'wav'} [options.format='auto']
 * @param {16|24} [options.bitDepth=16]
 * @param {boolean} [options.normalize=true]
 * @param {number} [options.autoStopMs=0] — 0 disables auto-stop
 * @param {(level: number) => void} [options.onLevel]
 * @param {(state: 'idle'|'recording'|'stopping') => void} [options.onStateChange]
 * @param {(err: Error) => void} [options.onError]
 */
export function createSessionRecorder(options = {}) {
  let state = 'idle';
  let stream = null;
  let mediaRecorder = null;
  let chunks = [];
  let mimeType = '';
  let fileExt = 'webm';
  let startTime = 0;
  let timerId = null;
  let rafId = null;
  let analyser = null;
  let analyserBuf = null;
  let micSource = null;
  let highpass = null;
  let captureGain = null;
  let silentSink = null;
  let pcmNode = null;
  let pcmChunks = [];
  let pcmIsWorklet = false;
  let workletReady = false;
  let captureSampleRate = 48000;
  let destroyed = false;

  const format = options.format === 'wav' || options.format === 'webm' ? options.format : 'auto';
  const bitDepth = options.bitDepth === 24 ? 24 : 16;
  const normalize = options.normalize !== false;
  const autoStopMs = Math.max(0, Number(options.autoStopMs) || 0);

  function emitState(next) {
    state = next;
    options.onStateChange?.(next);
  }

  function emitError(message) {
    options.onError?.(new Error(message));
  }

  function clearTimers() {
    if (timerId) { clearTimeout(timerId); timerId = null; }
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function releaseGraph() {
    clearTimers();
    try { pcmNode?.disconnect?.(); } catch (e) { /* ignore */ }
    try { captureGain?.disconnect?.(); } catch (e) { /* ignore */ }
    try { highpass?.disconnect?.(); } catch (e) { /* ignore */ }
    try { micSource?.disconnect?.(); } catch (e) { /* ignore */ }
    try { analyser?.disconnect?.(); } catch (e) { /* ignore */ }
    try { silentSink?.disconnect?.(); } catch (e) { /* ignore */ }
    pcmNode = null;
    captureGain = null;
    highpass = null;
    micSource = null;
    analyser = null;
    silentSink = null;
    if (stream) {
      releaseMicStream(stream);
      stream = null;
    }
    mediaRecorder = null;
    chunks = [];
    pcmChunks = [];
  }

  function levelLoop() {
    if (state !== 'recording' || !analyser || !analyserBuf) return;
    analyser.getFloatTimeDomainData(analyserBuf);
    const level = Math.min(1, rmsOf(analyserBuf) * 6);
    options.onLevel?.(level);
    rafId = requestAnimationFrame(levelLoop);
  }

  function buildCaptureGraph(ctx) {
    micSource = ctx.createMediaStreamSource(stream);
    highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 25;
    highpass.Q.value = 0.707;
    captureGain = ctx.createGain();
    captureGain.gain.value = 1;
    micSource.connect(highpass);
    highpass.connect(captureGain);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyserBuf = new Float32Array(analyser.fftSize);
    captureGain.connect(analyser);
  }

  async function startPcmCapture(ctx) {
    pcmChunks = [];
    captureSampleRate = ctx.sampleRate;
    silentSink = ctx.createGain();
    silentSink.gain.value = 0;
    silentSink.connect(ctx.destination);

    if (ctx.audioWorklet) {
      try {
        if (!workletReady) {
          await ctx.audioWorklet.addModule('js/recorderWorklet.js');
          workletReady = true;
        }
        pcmNode = new AudioWorkletNode(ctx, 'recorder-capture', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          channelCount: 1,
        });
        pcmNode.port.onmessage = (e) => { pcmChunks.push(e.data); };
        pcmIsWorklet = true;
        captureGain.connect(pcmNode);
        pcmNode.connect(silentSink);
        return;
      } catch (e) {
        workletReady = false;
      }
    }

    pcmNode = ctx.createScriptProcessor(4096, 1, 1);
    pcmIsWorklet = false;
    pcmNode.onaudioprocess = (e) => {
      pcmChunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    captureGain.connect(pcmNode);
    pcmNode.connect(silentSink);
  }

  function resolveCaptureMode() {
    if (format === 'wav') return 'wav';
    if (format === 'webm' && pickMimeType()) return 'webm';
    if (format === 'auto' && pickMimeType()) return 'webm';
    return 'wav';
  }

  async function start() {
    if (destroyed || state === 'recording') return false;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      emitError('Microphone capture is not supported in this browser.');
      return false;
    }
    try {
      stream = await requestMicStream(buildMicConstraints());
    } catch (e) {
      const denied = e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError';
      emitError(denied ? 'Microphone permission denied.' : (e?.message || 'Could not access microphone.'));
      return false;
    }

    const mode = resolveCaptureMode();
    chunks = [];
    mimeType = '';
    fileExt = mode === 'wav' ? 'wav' : extFromMime(pickMimeType());

    try {
      if (mode === 'webm') {
        mimeType = pickMimeType();
        mediaRecorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: COMPRESSED_BITRATE });
        mediaRecorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
        mediaRecorder.start(250);
        ensureAudio();
        buildCaptureGraph(audioCtx);
        levelLoop();
      } else {
        ensureAudio();
        buildCaptureGraph(audioCtx);
        await startPcmCapture(audioCtx);
        levelLoop();
      }
    } catch (e) {
      releaseGraph();
      emitError(e?.message || 'Could not start recording.');
      return false;
    }

    startTime = performance.now();
    emitState('recording');
    if (autoStopMs > 0) {
      timerId = setTimeout(() => { stop().catch(() => {}); }, autoStopMs);
    }
    return true;
  }

  function buildResultBlob() {
    if (mediaRecorder) {
      const type = mimeType || chunks[0]?.type || 'audio/webm';
      return { blob: new Blob(chunks, { type }), mimeType: type, extension: extFromMime(type) };
    }
    let samples = mergePcmChunks(pcmChunks);
    if (normalize) samples = peakNormalize(samples);
    const blob = encodeWav(samples, captureSampleRate, bitDepth);
    return { blob, mimeType: 'audio/wav', extension: 'wav' };
  }

  async function stop() {
    if (state !== 'recording') return null;
    emitState('stopping');
    clearTimers();
    options.onLevel?.(0);

    return new Promise((resolve) => {
      const finish = () => {
        const elapsed = Math.max(0, Math.round(performance.now() - startTime));
        const result = buildResultBlob();
        releaseGraph();
        emitState('idle');
        resolve({ ...result, durationMs: elapsed });
      };

      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.onstop = finish;
        try { mediaRecorder.stop(); } catch (e) { finish(); }
      } else {
        finish();
      }
    });
  }

  async function cancel() {
    if (state !== 'recording') return;
    emitState('stopping');
    clearTimers();
    options.onLevel?.(0);
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try { mediaRecorder.stop(); } catch (e) { /* ignore */ }
    }
    releaseGraph();
    emitState('idle');
  }

  function destroy() {
    destroyed = true;
    cancel();
    releaseGraph();
  }

  return {
    start,
    stop,
    cancel,
    isRecording: () => state === 'recording',
    getElapsedMs: () => (state === 'recording' ? Math.max(0, Math.round(performance.now() - startTime)) : 0),
    destroy,
  };
}
