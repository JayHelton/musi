import { audioCtx, ensureAudio, midiFreq, getAnalyserDestination, requestMicStream, releaseMicStream } from './audio.js';
import { parseNote, spellNote, NOTE_NAMES_SHARP } from './theory.js';
import { getSetting, saveSetting } from './persistence.js';
import { getContext, subscribeContext } from './musicalContext.js';
import { SCALES } from './scales.js';
import { createPitchTracker } from './pitch.js';
import { pt, stopPitchTrainer } from './pitchTrainer.js';
import { runner, stopPitchRunner } from './pitchRunner.js';

// Ensure the other mic-driven tools in this section release the microphone
// before the tuner grabs it.
function stopPitchTrainerIfRunning() {
  if (pt && pt.running) stopPitchTrainer();
  if (runner && runner.running) stopPitchRunner();
}

const tuner = {
  running: false,
  stream: null,
  analyser: null,
  buf: null,
  rafId: null,
  tracker: null,
  refOsc: null,
  refGain: null,
  scalePlaying: false,
  scaleVoices: [],
  scaleTimers: [],
};

function tunerLoop() {
  if (!tuner.running) return;
  tuner.analyser.getFloatTimeDomainData(tuner.buf);
  const { info } = tuner.tracker.process(tuner.buf);

  const noteEl = document.getElementById('tuner-note');
  const centsEl = document.getElementById('tuner-cents');
  const freqEl = document.getElementById('tuner-freq');
  const needle = document.getElementById('tuner-needle');

  if (info) {
    noteEl.textContent = info.name + info.oct;
    centsEl.textContent = (info.cents >= 0 ? '+' : '') + info.cents + ' cents';
    freqEl.textContent = info.freq.toFixed(1) + ' Hz';

    const absCents = Math.abs(info.cents);
    centsEl.className = 'tuner-cents ' + (absCents <= 5 ? 'in-tune' : absCents <= 15 ? 'close' : 'off');

    const pct = Math.max(-50, Math.min(50, info.cents));
    const angle = (pct / 50) * 45;
    needle.style.transform = `translateX(-50%) rotate(${angle}deg)`;
  } else {
    noteEl.textContent = '--';
    centsEl.textContent = '0 cents';
    centsEl.className = 'tuner-cents off';
    freqEl.textContent = '-- Hz';
    needle.style.transform = 'translateX(-50%) rotate(0deg)';
  }

  tuner.rafId = requestAnimationFrame(tunerLoop);
}

// Mic constraints tuned for focusing on a single nearby voice: browser noise
// suppression and echo cancellation help reject room/background noise and
// speaker bleed, while a mono channel keeps the pitch analysis clean. The
// clarity gate in the tracker is level-independent, so auto gain control is
// harmless and helps quiet singers register.
function buildTunerConstraints() {
  return {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    },
  };
}

async function startTuner() {
  // Only one mic-driven tool in the Pitch section runs at a time.
  stopPitchTrainerIfRunning();
  ensureAudio();
  try {
    try {
      tuner.stream = await requestMicStream(buildTunerConstraints());
    } catch (constraintErr) {
      // Some devices reject specific constraints; fall back to a plain request.
      tuner.stream = await requestMicStream({ audio: true });
    }
    const source = audioCtx.createMediaStreamSource(tuner.stream);
    tuner.analyser = audioCtx.createAnalyser();
    // A larger window gives the autocorrelation enough periods to lock onto low
    // voices confidently and keeps the clarity score stable.
    tuner.analyser.fftSize = 4096;
    tuner.analyser.smoothingTimeConstant = 0;
    tuner.buf = new Float32Array(tuner.analyser.fftSize);
    tuner.tracker = createPitchTracker({ sampleRate: audioCtx.sampleRate });
    source.connect(tuner.analyser);
    tuner.running = true;
    document.getElementById('tuner-toggle').textContent = 'Mic off';
    document.getElementById('tuner-status').textContent = 'Listening...';
    tunerLoop();
  } catch (e) {
    document.getElementById('tuner-status').textContent = 'Mic access denied or unavailable';
  }
}

function stopTuner() {
  tuner.running = false;
  if (tuner.rafId) { cancelAnimationFrame(tuner.rafId); tuner.rafId = null; }
  if (tuner.tracker) tuner.tracker.reset();
  if (tuner.stream) { releaseMicStream(tuner.stream); tuner.stream = null; }
  stopRefTone();
  stopContextScale();
  document.getElementById('tuner-toggle').textContent = 'Mic on';
  document.getElementById('tuner-status').textContent = 'Mic off';
}

function toggleTuner() {
  if (tuner.running) stopTuner(); else startTuner();
}

function playRefTone(noteStr, oct) {
  stopRefTone();
  ensureAudio();
  const p = parseNote(noteStr);
  if (!p) return;
  const midi = 12 * (oct + 1) + p.semi;
  const freq = midiFreq(midi);
  const osc = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();
  const t = audioCtx.currentTime;

  osc.type = 'sine';
  osc2.type = 'triangle';
  osc.frequency.value = freq;
  osc2.frequency.value = freq;

  filter.type = 'lowpass';
  filter.frequency.value = Math.min(freq * 3.5, 4500);
  filter.Q.value = 0.5;

  gain.gain.setValueAtTime(0.001, t);
  gain.gain.linearRampToValueAtTime(0.15, t + 0.06);
  gain.gain.setValueAtTime(0.12, t + 1.6);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 2.2);

  osc.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  gain.connect(getAnalyserDestination());
  osc.start(t);
  osc2.start(t);
  tuner.refOsc = osc;
  tuner.refOsc2 = osc2;
  tuner.refGain = gain;
  setTimeout(() => stopRefTone(), 2300);
}

function stopRefTone() {
  if (tuner.refOsc) {
    try {
      const t = audioCtx.currentTime;
      tuner.refGain.gain.setValueAtTime(tuner.refGain.gain.value, t);
      tuner.refGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      setTimeout(() => { try { tuner.refOsc.stop(); if (tuner.refOsc2) tuner.refOsc2.stop(); } catch(e) {} }, 150);
    } catch(e) {}
    tuner.refOsc = null; tuner.refOsc2 = null; tuner.refGain = null;
  }
}

// Schedule a single scale tone at an absolute AudioContext time. Voices are
// tracked so an in-progress scale can be stopped cleanly.
function playScaleTone(midi, startTime, duration) {
  const freq = midiFreq(midi);
  const osc = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();

  osc.type = 'sine';
  osc2.type = 'triangle';
  osc.frequency.value = freq;
  osc2.frequency.value = freq;

  filter.type = 'lowpass';
  filter.frequency.value = Math.min(freq * 3.5, 4500);
  filter.Q.value = 0.5;

  const sustain = duration * 0.55;
  const release = duration * 0.4;
  gain.gain.setValueAtTime(0.001, startTime);
  gain.gain.linearRampToValueAtTime(0.16, startTime + 0.02);
  gain.gain.setValueAtTime(0.13, startTime + sustain);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + sustain + release);

  osc.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  gain.connect(getAnalyserDestination());

  const stopAt = startTime + sustain + release + 0.05;
  osc.start(startTime);
  osc2.start(startTime);
  osc.stop(stopAt);
  osc2.stop(stopAt);

  tuner.scaleVoices.push(osc, osc2);
  osc.onended = () => {
    tuner.scaleVoices = tuner.scaleVoices.filter(v => v !== osc && v !== osc2);
  };
}

// Labels for the degree-skip between played notes. A skip of 1 walks the scale
// step by step; a skip of 2 walks in thirds, which spells triads/arpeggios.
const STEP_LABELS = { 1: 'scale steps (2nds)', 2: 'thirds (triads)', 3: 'fourths', 4: 'fifths' };

function ordinal(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return n + 'th';
  switch (n % 10) {
    case 1: return n + 'st';
    case 2: return n + 'nd';
    case 3: return n + 'rd';
    default: return n + 'th';
  }
}

// Build semitone offsets (relative to the root) for the configured segment,
// wrapping across octaves as scale degrees run past one octave. With a step of
// 1 this is a contiguous scale run; with a step of 2 it walks in thirds so the
// sequence spells triads and seventh-chord arpeggios.
function buildScaleSegment(def, startIdx, count, step) {
  const base = def.map(d => d[1]);
  const n = base.length;
  const seq = [];
  for (let i = 0; i < count; i++) {
    const degree = startIdx + i * step;
    const oct = Math.floor(degree / n);
    const within = ((degree % n) + n) % n;
    seq.push(base[within] + 12 * oct);
  }
  return seq;
}

function scaleIdleStatus() {
  const startDeg = vtScaleStart + 1;
  const stepLabel = STEP_LABELS[vtScaleStep] || `${ordinal(vtScaleStep + 1)}s`;
  return `Plays ${vtScaleCount} notes from the ${ordinal(startDeg)} degree in ${stepLabel}`;
}

// Play a configurable segment of the shared musical context's scale in the
// selected octave. The starting degree, number of notes, and degree-skip are
// user-controlled so triads (start on any degree, skip thirds) and other
// segmented runs can be drilled. Each note gets one beat at the context tempo.
function playContextScale() {
  ensureAudio();
  stopContextScale();
  stopRefTone();

  const { root, scale, tempo } = getContext();
  const r = parseNote(root);
  const def = SCALES[scale];
  const statusEl = document.getElementById('vt-scale-status');
  if (!r || !def) {
    if (statusEl) statusEl.textContent = 'Could not play the current scale';
    return;
  }

  const startIdx = Math.min(Math.max(0, vtScaleStart), def.length - 1);
  const count = Math.max(1, vtScaleCount);
  const step = Math.max(1, vtScaleStep);
  const offsets = buildScaleSegment(def, startIdx, count, step);

  const rootMidi = 12 * (vtOctave + 1) + r.semi;
  const beatDur = 60 / tempo;
  const noteDur = beatDur * 0.92;
  const start = audioCtx.currentTime + 0.08;

  offsets.forEach((semi, i) => {
    playScaleTone(rootMidi + semi, start + i * beatDur, noteDur);
  });

  tuner.scalePlaying = true;
  const btn = document.getElementById('vt-play-scale');
  if (btn) btn.disabled = true;
  const stepLabel = STEP_LABELS[step] || `${ordinal(step + 1)}s`;
  if (statusEl) {
    statusEl.textContent = `Playing ${root} ${scale} · ${count} notes from the ${ordinal(startIdx + 1)} in ${stepLabel}`;
  }

  const totalMs = (offsets.length * beatDur + 0.3) * 1000;
  tuner.scaleTimers.push(setTimeout(() => {
    tuner.scalePlaying = false;
    if (btn) btn.disabled = false;
    if (statusEl) statusEl.textContent = scaleIdleStatus();
  }, totalMs));
}

function stopContextScale() {
  tuner.scaleTimers.forEach(id => clearTimeout(id));
  tuner.scaleTimers = [];
  tuner.scaleVoices.forEach(v => { try { v.stop(); } catch (e) {} });
  tuner.scaleVoices = [];
  tuner.scalePlaying = false;
  const btn = document.getElementById('vt-play-scale');
  if (btn) btn.disabled = false;
}

let vtOctave = 4;
let vtScaleStart = 0;   // 0-based scale degree the segment starts on
let vtScaleCount = 8;   // number of notes to play
let vtScaleStep = 1;    // degree-skip between played notes (1=steps, 2=thirds...)

const SCALE_COUNT_MAX = 16;

// Rebuild the start-degree options for the active scale, spelled in the active
// key. Called on init and whenever the shared context changes scale/key.
function refreshScaleControls() {
  const startSel = document.getElementById('vt-scale-start');
  const statusEl = document.getElementById('vt-scale-status');
  if (!startSel) return;

  const { root, scale } = getContext();
  const def = SCALES[scale];
  const r = parseNote(root);
  if (!def || !r) return;
  const n = def.length;
  if (vtScaleStart >= n) vtScaleStart = 0;

  startSel.innerHTML = '';
  def.forEach((d, i) => {
    const spelled = spellNote(r.li, r.semi, d[0], d[1]) || NOTE_NAMES_SHARP[(r.semi + d[1]) % 12];
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `${ordinal(i + 1)} · ${spelled}`;
    startSel.appendChild(opt);
  });
  startSel.value = String(vtScaleStart);

  if (statusEl && !tuner.scalePlaying) statusEl.textContent = scaleIdleStatus();
}

function initTuner() {
  const octC = document.getElementById('vt-octaves');
  const notesC = document.getElementById('vt-notes');
  vtOctave = Number(getSetting('tuner.octave', vtOctave, [2,3,4,5,6]));
  vtScaleStart = Math.max(0, Number(getSetting('tuner.scaleStart', vtScaleStart)) || 0);
  vtScaleCount = Math.min(SCALE_COUNT_MAX, Math.max(1, Number(getSetting('tuner.scaleCount', vtScaleCount)) || vtScaleCount));
  vtScaleStep = Number(getSetting('tuner.scaleStep', vtScaleStep, [1, 2, 3, 4]));
  if (octC.children.length) return;

  for (let o = 2; o <= 6; o++) {
    const btn = document.createElement('button');
    btn.className = 'oct-btn' + (o === vtOctave ? ' active' : '');
    btn.textContent = o;
    btn.onclick = () => {
      octC.querySelectorAll('.oct-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      vtOctave = o;
      saveSetting('tuner.octave', vtOctave);
    };
    octC.appendChild(btn);
  }

  NOTE_NAMES_SHARP.forEach(name => {
    const btn = document.createElement('button');
    btn.className = 'letter-btn' + (name.length > 1 ? ' accidental' : '');
    btn.textContent = name;
    btn.onclick = () => playRefTone(name, vtOctave);
    notesC.appendChild(btn);
  });

  const startSel = document.getElementById('vt-scale-start');
  const countSel = document.getElementById('vt-scale-count');
  const stepSel = document.getElementById('vt-scale-step');

  if (countSel && !countSel.children.length) {
    for (let i = 1; i <= SCALE_COUNT_MAX; i++) {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = String(i);
      countSel.appendChild(opt);
    }
  }
  if (countSel) {
    countSel.value = String(vtScaleCount);
    countSel.onchange = () => {
      vtScaleCount = Math.min(SCALE_COUNT_MAX, Math.max(1, Number(countSel.value) || 1));
      saveSetting('tuner.scaleCount', vtScaleCount);
      const statusEl = document.getElementById('vt-scale-status');
      if (statusEl && !tuner.scalePlaying) statusEl.textContent = scaleIdleStatus();
    };
  }
  if (stepSel) {
    stepSel.value = String(vtScaleStep);
    stepSel.onchange = () => {
      vtScaleStep = Number(stepSel.value) || 1;
      saveSetting('tuner.scaleStep', vtScaleStep);
      const statusEl = document.getElementById('vt-scale-status');
      if (statusEl && !tuner.scalePlaying) statusEl.textContent = scaleIdleStatus();
    };
  }
  if (startSel) {
    startSel.onchange = () => {
      vtScaleStart = Math.max(0, Number(startSel.value) || 0);
      saveSetting('tuner.scaleStart', vtScaleStart);
      const statusEl = document.getElementById('vt-scale-status');
      if (statusEl && !tuner.scalePlaying) statusEl.textContent = scaleIdleStatus();
    };
  }

  refreshScaleControls();
  subscribeContext(refreshScaleControls);
}

window.toggleTuner = toggleTuner;
window.playContextScale = playContextScale;

export { initTuner, stopTuner, stopContextScale, tuner };
