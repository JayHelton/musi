import { createPitchSmoother, createPitchTracker } from './pitch.js';

const WINDOW_SIZE = 4096;
const WORKLET_URL = 'js/pitchCaptureWorklet.js';
const WORKER_URL = 'js/pitchDetectWorker.js';

let workletModuleAdded = false;

function windowCenterDelayMs(sampleRate) {
  return (WINDOW_SIZE / sampleRate / 2) * 1000;
}

async function ensureWorkletModule(audioCtx) {
  if (workletModuleAdded || !audioCtx.audioWorklet) return workletModuleAdded;
  await audioCtx.audioWorklet.addModule(WORKLET_URL);
  workletModuleAdded = true;
  return true;
}

function makeWorker() {
  return new Worker(WORKER_URL, { type: 'module' });
}

export async function createPitchCapture(opts) {
  const audioCtx = opts.audioCtx;
  const stream = opts.stream;
  const onFrame = opts.onFrame;
  const sampleRate = audioCtx.sampleRate;
  const minClarity = opts.minClarity ?? 0.45;
  let minRms = opts.minRms ?? 0.003;
  const minFreq = opts.minFreq ?? 55;
  const maxFreq = opts.maxFreq ?? 1400;

  const smoother = createPitchSmoother(opts);
  let mode = 'pending';
  let stopped = false;
  let micSource = null;
  let workletNode = null;
  let silentSink = null;
  let worker = null;
  let workerSeq = 0;
  let analyser = null;
  let analyserBuf = null;
  let fallbackTracker = null;
  let rafId = null;

  function emitFrame(tracked, audioTime, analysisMs) {
    if (stopped || typeof onFrame !== 'function') return;
    const timestampMs = audioTime * 1000 - windowCenterDelayMs(sampleRate);
    onFrame({
      frequencyHz: tracked.frequencyHz,
      displayFrequencyHz: tracked.displayFrequencyHz,
      voiced: tracked.voiced,
      clarity: tracked.clarity,
      rms: tracked.rms,
      noteInfo: tracked.noteInfo,
      audioTime,
      timestampMs,
      analysisMs: analysisMs ?? 0,
    });
  }

  function handleDetection(msg) {
    const tracked = smoother.ingest({
      freq: msg.freq,
      clarity: msg.clarity,
      rms: msg.rms,
    });
    emitFrame(tracked, msg.audioTime, msg.analysisMs);
  }

  function setMinRms(next) {
    minRms = next;
    if (fallbackTracker?.setMinRms) fallbackTracker.setMinRms(next);
  }

  function reset() {
    smoother.reset();
    fallbackTracker?.reset();
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    try { workletNode?.disconnect?.(); } catch (e) { /* noop */ }
    try { micSource?.disconnect?.(); } catch (e) { /* noop */ }
    try { silentSink?.disconnect?.(); } catch (e) { /* noop */ }
    try { analyser?.disconnect?.(); } catch (e) { /* noop */ }
    workletNode = null;
    micSource = null;
    silentSink = null;
    analyser = null;
    if (worker) {
      worker.terminate();
      worker = null;
    }
  }

  async function startWorkletPath() {
    await ensureWorkletModule(audioCtx);
    if (!audioCtx.audioWorklet) throw new Error('AudioWorklet unavailable');

    worker = makeWorker();
    worker.onmessage = (e) => {
      if (stopped) return;
      handleDetection(e.data);
    };

    workletNode = new AudioWorkletNode(audioCtx, 'pitch-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
    });

    workletNode.port.onmessage = (e) => {
      if (stopped || !worker) return;
      const seq = workerSeq++;
      worker.postMessage({
        seq,
        buf: e.data.buf,
        audioTime: e.data.audioTime,
        sampleRate,
        minRms,
        minClarity,
        minFreq,
        maxFreq,
      });
    };

    silentSink = audioCtx.createGain();
    silentSink.gain.value = 0;
    silentSink.connect(audioCtx.destination);

    micSource = audioCtx.createMediaStreamSource(stream);
    micSource.connect(workletNode);
    workletNode.connect(silentSink);
    mode = 'worklet';
  }

  function startFallbackPath() {
    micSource = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = WINDOW_SIZE;
    analyser.smoothingTimeConstant = 0;
    analyserBuf = new Float32Array(analyser.fftSize);
    fallbackTracker = createPitchTracker({
      sampleRate,
      minRms,
      minClarity,
      minFreq,
      maxFreq,
      ...opts,
    });
    micSource.connect(analyser);

    const loop = () => {
      if (stopped) return;
      analyser.getFloatTimeDomainData(analyserBuf);
      const tracked = fallbackTracker.process(analyserBuf);
      const audioTime = audioCtx.currentTime;
      emitFrame(tracked, audioTime, 0);
      rafId = requestAnimationFrame(loop);
    };
    loop();
    mode = 'fallback';
  }

  try {
    await startWorkletPath();
  } catch (e) {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    startFallbackPath();
  }

  return {
    mode,
    stop,
    reset,
    setMinRms,
    get windowSize() { return WINDOW_SIZE; },
    get sampleRate() { return sampleRate; },
  };
}
