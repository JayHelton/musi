import { parseNote } from '../theory.js';
import { ensureAudio, requestMicStream, releaseMicStream, audioCtx } from '../audio.js';
import { createPitchTracker } from '../pitch.js';
import { createPitchMatcher, midiToLabel } from '../pitchMatch.js';
import { buildStages, chooseRootMidi } from '../pitchExercises.js';
import { createCompanionPanel } from './panel.js';

const WINDOW_CENTS = 200;
const DEFAULT_LOW = 48;
const DEFAULT_HIGH = 72;

export function mountPitchTrain(host, companion, options = {}) {
  const shell = createCompanionPanel(host, companion, options);

  const lock = document.createElement('p');
  lock.className = 'ec-sub';
  lock.textContent = `Locked: ${companion.root} · ${companion.scale}`;

  const readout = document.createElement('div');
  readout.className = 'ec-pitch-readout';

  const targetEl = document.createElement('div');
  targetEl.className = 'ec-pitch-target';
  targetEl.textContent = '--';

  const centsEl = document.createElement('div');
  centsEl.className = 'ec-pitch-cents';
  centsEl.textContent = '-- ¢';

  const meter = document.createElement('div');
  meter.className = 'ec-pitch-meter';
  const zone = document.createElement('div');
  zone.className = 'ec-pitch-zone';
  const puck = document.createElement('div');
  puck.className = 'ec-pitch-puck off';
  puck.textContent = '--';
  meter.append(zone, puck);

  const progress = document.createElement('div');
  progress.className = 'ec-pitch-progress';
  const progressBar = document.createElement('div');
  progressBar.className = 'ec-pitch-progress-bar';
  progress.appendChild(progressBar);

  readout.append(targetEl, centsEl, meter, progress);

  const status = document.createElement('p');
  status.className = 'ec-pitch-status';
  status.textContent = 'Tap Start to begin pitch practice.';

  const controls = document.createElement('div');
  controls.className = 'ec-pitch-controls';
  const startBtn = document.createElement('button');
  startBtn.type = 'button';
  startBtn.className = 'ec-btn ec-btn-start';
  startBtn.textContent = 'Start';
  const stopBtn = document.createElement('button');
  stopBtn.type = 'button';
  stopBtn.className = 'ec-btn ec-btn-stop';
  stopBtn.textContent = 'Stop';
  stopBtn.disabled = true;
  controls.append(startBtn, stopBtn);

  shell.body.append(lock, readout, status, controls);

  let running = false;
  let stream = null;
  let analyser = null;
  let source = null;
  let rafId = 0;
  let buf = null;
  let tracker = null;
  let matcher = null;
  let sequence = [];
  let noteIdx = 0;
  let completed = 0;
  let advanceTimer = 0;
  let advancing = false;

  function buildSequence() {
    const stages = buildStages(companion.scale, 'full');
    const stage = stages[0];
    const parsed = parseNote(companion.root);
    const rootPc = parsed ? parsed.semi : 0;
    const span = stage.offsets.reduce((m, o) => Math.max(m, o), 0);
    const rootMidi = chooseRootMidi(rootPc, DEFAULT_LOW, DEFAULT_HIGH, span);
    sequence = stage.offsets.map((off) => rootMidi + off);
    noteIdx = 0;
  }

  function currentTargetMidi() {
    return sequence[noteIdx];
  }

  function setTarget() {
    const midi = currentTargetMidi();
    if (matcher) matcher.setTarget(midi);
    if (midi != null) {
      const lbl = midiToLabel(midi);
      targetEl.textContent = lbl.full;
      const tol = matcher?.toleranceCents ?? 35;
      zone.style.height = `${Math.min(100, (tol / WINDOW_CENTS) * 100)}%`;
    } else {
      targetEl.textContent = '--';
    }
  }

  function renderMeter(res) {
    if (!res.active || res.freq <= 0 || res.centsOff == null) {
      puck.style.top = '50%';
      puck.className = 'ec-pitch-puck off';
      puck.textContent = '--';
      progressBar.style.width = `${(res.progress || 0) * 100}%`;
      centsEl.textContent = '-- ¢';
      centsEl.className = 'ec-pitch-cents off';
      return;
    }
    puck.style.top = `${res.offsetRatio * 100}%`;
    const absC = Math.abs(res.centsOff);
    const cls = res.within ? 'in' : absC <= matcher.toleranceCents * 2 ? 'close' : 'off';
    puck.className = `ec-pitch-puck ${cls}`;
    puck.textContent = midiToLabel(Math.round(res.freq ? 69 + 12 * Math.log2(res.freq / 440) : 0)).name;
    progressBar.style.width = `${res.progress * 100}%`;
    const sign = res.centsOff >= 0 ? '+' : '';
    centsEl.textContent = `${sign}${Math.round(res.centsOff)} ¢`;
    centsEl.className = `ec-pitch-cents ${cls}`;
  }

  function advance() {
    advancing = false;
    noteIdx += 1;
    if (noteIdx >= sequence.length) noteIdx = 0;
    setTarget();
    status.textContent = `Sing & hold · ${noteIdx + 1} of ${sequence.length}`;
  }

  function onMatched() {
    if (advancing) return;
    advancing = true;
    completed += 1;
    status.textContent = `Nice! ${midiToLabel(currentTargetMidi()).full} held. (${completed} passed)`;
    puck.className = 'ec-pitch-puck in';
    clearTimeout(advanceTimer);
    advanceTimer = setTimeout(() => { if (running) advance(); }, 650);
  }

  function loop() {
    if (!running) return;
    analyser.getFloatTimeDomainData(buf);
    const { freq } = tracker.process(buf);
    const now = performance.now();
    const res = matcher.update(freq > 0 ? freq : -1, now, true);
    renderMeter(res);
    if (res.matched && !advancing) onMatched();
    rafId = requestAnimationFrame(loop);
  }

  function stopSession({ keepStatus = false } = {}) {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    clearTimeout(advanceTimer);
    advancing = false;
    if (source) {
      try { source.disconnect(); } catch (e) { /* noop */ }
      source = null;
    }
    if (analyser) {
      try { analyser.disconnect(); } catch (e) { /* noop */ }
      analyser = null;
    }
    if (stream) {
      releaseMicStream(stream);
      stream = null;
    }
    tracker = null;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    if (!keepStatus) status.textContent = 'Stopped.';
    puck.className = 'ec-pitch-puck off';
  }

  async function startSession() {
    if (running) return;
    status.textContent = 'Requesting microphone…';
    status.classList.remove('ec-err');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone not available in this browser.');
      }
      ensureAudio();
      buildSequence();
      matcher = createPitchMatcher({ holdMs: 1000, toleranceCents: 35, windowCents: WINDOW_CENTS });
      setTarget();
      stream = await requestMicStream({ audio: true });
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      buf = new Float32Array(analyser.fftSize);
      tracker = createPitchTracker({
        sampleRate: audioCtx.sampleRate,
        maxFreq: 1400,
        minRms: 0.003,
        minClarity: 0.45,
      });
      running = true;
      startBtn.disabled = true;
      stopBtn.disabled = false;
      status.textContent = `Sing & hold · ${noteIdx + 1} of ${sequence.length}`;
      loop();
    } catch (e) {
      status.textContent = e?.message || 'Microphone access denied or unavailable.';
      status.classList.add('ec-err');
      stopSession({ keepStatus: true });
    }
  }

  startBtn.addEventListener('click', startSession);
  stopBtn.addEventListener('click', stopSession);

  buildSequence();
  setTarget();

  return {
    refresh() {
      buildSequence();
      if (matcher) setTarget();
      lock.textContent = `Locked: ${companion.root} · ${companion.scale}`;
    },
    stop() { stopSession(); },
    destroy() {
      stopSession();
      startBtn.removeEventListener('click', startSession);
      stopBtn.removeEventListener('click', stopSession);
      shell.destroy();
    },
  };
}
