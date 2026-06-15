import { audioCtx, ensureAudio, midiFreq, getAnalyserDestination } from './audio.js';
import { parseNote, NOTE_NAMES_SHARP, noteFromFreq } from './theory.js';

const tuner = {
  running: false,
  stream: null,
  analyser: null,
  buf: null,
  rafId: null,
  refOsc: null,
  refGain: null,
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
    document.getElementById('tuner-toggle').textContent = 'Stop';
    document.getElementById('tuner-status').textContent = 'Sing a note...';
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
  document.getElementById('tuner-toggle').textContent = 'Start Listening';
  document.getElementById('tuner-status').textContent = 'Press Start to begin singing';
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
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = midiFreq(midi);
  gain.gain.value = 0.25;
  osc.connect(gain);
  gain.connect(getAnalyserDestination());
  osc.start();
  tuner.refOsc = osc;
  tuner.refGain = gain;
  setTimeout(() => stopRefTone(), 2000);
}

function stopRefTone() {
  if (tuner.refOsc) {
    try {
      tuner.refGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
      setTimeout(() => { try { tuner.refOsc.stop(); } catch(e) {} }, 60);
    } catch(e) {}
    tuner.refOsc = null; tuner.refGain = null;
  }
}

let vtOctave = 4;

function initTuner() {
  const octC = document.getElementById('vt-octaves');
  const notesC = document.getElementById('vt-notes');
  if (octC.children.length) return;

  for (let o = 2; o <= 6; o++) {
    const btn = document.createElement('button');
    btn.className = 'oct-btn' + (o === vtOctave ? ' active' : '');
    btn.textContent = o;
    btn.onclick = () => {
      octC.querySelectorAll('.oct-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      vtOctave = o;
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

export { initTuner, stopTuner, tuner };
