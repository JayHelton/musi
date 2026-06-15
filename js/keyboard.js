import { ensureAudio, midiFreq, audioCtx, getAnalyserDestination } from './audio.js';
import { NOTE_NAMES_SHARP } from './theory.js';
import { S } from './scaleQuiz.js';

export const QWERTY_ROWS = ['qwertyu','asdfghj','zxcvbnm'];
export const QWERTY_MAP = {};
(function(){
  const octaves = [2,3,4];
  const whiteNotes = [0,2,4,5,7,9,11];
  for (let r = 0; r < 3; r++) {
    const row = QWERTY_ROWS[r];
    for (let k = 0; k < 7; k++) {
      QWERTY_MAP[row[k]] = 12*(octaves[r]+1) + whiteNotes[k];
    }
  }
})();

export function buildKeyboard() {
  const oct = 2, span = 3;
  const piano = document.getElementById('piano');
  piano.innerHTML = '';
  const ww = 48, bw = 30;
  const totalWhite = span * 7;
  piano.style.width = totalWhite * ww + 'px';
  piano.style.height = '200px';

  const blackAt = [1,2,4,5,6];

  for (let o = 0; o < span; o++) {
    const curOct = oct + o;
    const whiteNotes = [0,2,4,5,7,9,11];
    const whiteNames = ['C','D','E','F','G','A','B'];
    const qRow = QWERTY_ROWS[o];
    for (let w = 0; w < 7; w++) {
      const midi = 12*(curOct+1) + whiteNotes[w];
      const key = document.createElement('div');
      key.className = 'white-key' + (S.kb.drones[midi] ? ' active' : '');
      key.dataset.midi = midi;
      key.style.left = (o*7+w)*ww + 'px';
      key.style.width = ww + 'px';
      key.style.position = 'absolute';
      const lbl = document.createElement('span');
      lbl.className = 'klabel';
      lbl.innerHTML = `<b>${qRow[w].toUpperCase()}</b><br>${whiteNames[w]}${curOct}`;
      key.appendChild(lbl);
      key.onmousedown = () => toggleDrone(midi);
      piano.appendChild(key);
    }
    const blackSemis = [1,3,6,8,10];
    for (let b = 0; b < 5; b++) {
      const midi = 12*(curOct+1) + blackSemis[b];
      const key = document.createElement('div');
      key.className = 'black-key' + (S.kb.drones[midi] ? ' active' : '');
      key.dataset.midi = midi;
      key.style.left = ((o*7 + blackAt[b])*ww - bw/2) + 'px';
      key.onmousedown = () => toggleDrone(midi);
      piano.appendChild(key);
    }
  }
  updateDroneDisplay();
}

export function toggleDrone(midi) {
  ensureAudio();
  if (S.kb.drones[midi]) {
    const dr = S.kb.drones[midi];
    dr.gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.08);
    setTimeout(() => { dr.osc1.stop(); dr.osc2.stop(); }, 100);
    delete S.kb.drones[midi];
  } else {
    const freq = midiFreq(midi);
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc1.type = S.kb.wave;
    osc2.type = S.kb.wave;
    osc1.frequency.value = freq;
    osc2.frequency.value = freq * 1.003;
    gain.gain.value = S.kb.vol;
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(getAnalyserDestination());
    osc1.start();
    osc2.start();
    S.kb.drones[midi] = { osc1, osc2, gain };
  }
  document.querySelectorAll(`[data-midi="${midi}"]`).forEach(el => {
    el.classList.toggle('active', !!S.kb.drones[midi]);
  });
  updateDroneDisplay();
}

export function stopAll() {
  Object.keys(S.kb.drones).forEach(midi => {
    const dr = S.kb.drones[midi];
    dr.gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.05);
    setTimeout(() => { dr.osc1.stop(); dr.osc2.stop(); }, 60);
  });
  S.kb.drones = {};
  document.querySelectorAll('.white-key,.black-key').forEach(el => el.classList.remove('active'));
  updateDroneDisplay();
}

export function updateDroneDisplay() {
  const dd = document.getElementById('drone-display');
  const midis = Object.keys(S.kb.drones).map(Number).sort((a,b)=>a-b);
  if (!midis.length) { dd.innerHTML = '<span style="color:var(--muted);font-size:.85rem">No active drones</span>'; return; }
  dd.innerHTML = midis.map(m => {
    const oct = Math.floor(m/12)-1;
    const name = NOTE_NAMES_SHARP[m%12] + oct;
    const freq = midiFreq(m).toFixed(1);
    return `<span class="drone-chip" onclick="toggleDrone(${m})" title="${freq} Hz">${name}</span>`;
  }).join('');
}

window.toggleDrone = toggleDrone;
window.stopAll = stopAll;
