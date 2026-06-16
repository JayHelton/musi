import { audioCtx, ensureAudio, midiFreq, getAnalyserDestination } from './audio.js';
import { parseNote, NOTE_NAMES_SHARP, noteFromFreq } from './theory.js';
import { getSetting, saveSetting } from './persistence.js';
import { getContext } from './musicalContext.js';
import { SCALES } from './scales.js';

const tuner = {
  running: false,
  stream: null,
  analyser: null,
  buf: null,
  rafId: null,
  refOsc: null,
  refGain: null,
  scalePlaying: false,
  scaleVoices: [],
  scaleTimers: [],
};

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

function tunerLoop() {
  if (!tuner.running) return;
  tuner.analyser.getFloatTimeDomainData(tuner.buf);
  const freq = autoCorrelate(tuner.buf, audioCtx.sampleRate);

  const noteEl = document.getElementById('tuner-note');
  const centsEl = document.getElementById('tuner-cents');
  const freqEl = document.getElementById('tuner-freq');
  const needle = document.getElementById('tuner-needle');

  if (freq > 0 && freq < 2000) {
    const info = noteFromFreq(freq);
    noteEl.textContent = info.name + info.oct;
    centsEl.textContent = (info.cents >= 0 ? '+' : '') + info.cents + ' cents';
    freqEl.textContent = freq.toFixed(1) + ' Hz';

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

async function startTuner() {
  ensureAudio();
  try {
    tuner.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = audioCtx.createMediaStreamSource(tuner.stream);
    tuner.analyser = audioCtx.createAnalyser();
    tuner.analyser.fftSize = 2048;
    tuner.buf = new Float32Array(tuner.analyser.fftSize);
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
  if (tuner.stream) { tuner.stream.getTracks().forEach(t => t.stop()); tuner.stream = null; }
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

// Play the shared musical context's scale ascending in the selected octave.
// Each scale degree gets one beat of a 4/4 measure at the context tempo,
// finishing on the root one octave above so the scale resolves.
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

  // Semitone offsets from the root, plus the octave above to complete the run.
  const offsets = def.map(d => d[1]);
  offsets.push(12);

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
  if (statusEl) statusEl.textContent = `Playing ${root} ${scale} at ${tempo} BPM`;

  const totalMs = (offsets.length * beatDur + 0.3) * 1000;
  tuner.scaleTimers.push(setTimeout(() => {
    tuner.scalePlaying = false;
    if (btn) btn.disabled = false;
    if (statusEl) statusEl.textContent = 'Plays the current key & scale, one beat per note';
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

function initTuner() {
  const octC = document.getElementById('vt-octaves');
  const notesC = document.getElementById('vt-notes');
  vtOctave = Number(getSetting('tuner.octave', vtOctave, [2,3,4,5,6]));
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
}

window.toggleTuner = toggleTuner;
window.playContextScale = playContextScale;

export { initTuner, stopTuner, stopContextScale, tuner };
