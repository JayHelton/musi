import { audioCtx, ensureAudio, midiFreq, getAnalyserDestination } from './audio.js';
import { parseNote, ROOTS, TUNINGS } from './theory.js';
import { showNowPlaying, hideNowPlaying } from './nowPlaying.js';
import { SCALES } from './scales.js';

const riffState = {
  key: 'C', scale: 'Major (Ionian)', tuning: 'Standard',
  notes: [], playing: false,
  _timer: null, _nextTime: 0, _noteIdx: 0, _activeOscs: [],
};

function generateRiff() {
  stopRiff();
  const scaleKey = riffState.scale;
  const def = SCALES[scaleKey];
  if (!def) return;

  const r = parseNote(riffState.key);
  if (!r) return;

  const semis = def.map(d => d[1]);
  const numDeg = semis.length;

  const bars = parseInt(document.getElementById('riff-length').value) || 2;
  const density = document.getElementById('riff-density').value;
  const notesPerBeat = density === 'sixteenth' ? 4 : density === 'eighth' ? 2 : 1;
  const totalNotes = bars * 4 * notesPerBeat;

  const chordTones = [0, Math.min(2, numDeg - 1), Math.min(4, numDeg - 1)];
  let curDeg = chordTones[Math.floor(Math.random() * chordTones.length)];
  const startOctOptions = [-1, -1, 0, 0];
  let curOct = startOctOptions[Math.floor(Math.random() * startOctOptions.length)];
  let lastLeap = 0;

  const melody = [];

  for (let i = 0; i < totalNotes; i++) {
    const semi = semis[((curDeg % numDeg) + numDeg) % numDeg] + curOct * 12;
    const midi = 12 * (3 + 1) + r.semi + semi;
    melody.push({ deg: curDeg, semi, midi });

    if (i === totalNotes - 1) break;

    let nextDeg, nextOct = curOct;
    const maxRange = Math.floor(numDeg * 1.5);

    if (Math.abs(lastLeap) >= 4) {
      nextDeg = curDeg + (lastLeap > 0 ? -1 : 1);
      lastLeap = nextDeg - curDeg;
    } else {
      const roll = Math.random();
      let step;
      if (roll < 0.7) {
        step = Math.random() < 0.5 ? 1 : -1;
      } else if (roll < 0.9) {
        step = (Math.random() < 0.5 ? 1 : -1) * (Math.floor(Math.random() * 2) + 2);
      } else {
        step = (Math.random() < 0.5 ? 1 : -1) * (Math.floor(Math.random() * 3) + 4);
      }

      const totalDeg = curDeg + curOct * numDeg;
      if (totalDeg + step > maxRange) step = -Math.abs(step);
      if (totalDeg + step < -Math.floor(numDeg * 0.5)) step = Math.abs(step);

      nextDeg = curDeg + step;
      lastLeap = step;
    }

    while (nextDeg >= numDeg) { nextDeg -= numDeg; nextOct++; }
    while (nextDeg < 0) { nextDeg += numDeg; nextOct--; }

    if (nextOct > 1) { nextOct = 1; }
    if (nextOct < -2) { nextOct = -2; }
    if (nextDeg >= numDeg) { nextDeg = numDeg - 1; }
    if (nextDeg < 0) { nextDeg = 0; }

    const nextMidi = 12 * (4 + 1) + r.semi + semis[nextDeg] + nextOct * 12;
    if (melody.length > 0 && nextMidi === melody[melody.length - 1].midi) {
      nextDeg = (nextDeg + 1) % numDeg;
    }

    if (i === totalNotes - 2) {
      const stableDegrees = [0, Math.min(4, numDeg - 1)];
      nextDeg = stableDegrees[Math.floor(Math.random() * stableDegrees.length)];
      nextOct = curOct;
    }

    curDeg = nextDeg;
    curOct = nextOct;
  }

  riffState.notes = melody;
  renderRiffTab();
}

function riffToTab() {
  const tuningName = document.getElementById('riff-tuning').value || 'Standard';
  const strings = TUNINGS[tuningName];
  const openMidis = strings.map(s => {
    const p = parseNote(s.note);
    return p ? 12 * (s.oct + 1) + p.semi : 0;
  });
  const labels = strings.map(s => s.note + s.oct);

  const notePositions = [];

  riffState.notes.forEach((n, idx) => {
    let bestStr = -1, bestFret = -1, bestScore = Infinity;
    for (let s = 0; s < 6; s++) {
      const fret = n.midi - openMidis[s];
      if (fret < 0 || fret > 22) continue;
      const fretPenalty = fret <= 12 ? fret : fret + 5;
      const lowFretBonus = fret >= 5 ? 0 : (5 - fret) * 2;
      const stringPenalty = s * 6;
      const score = fretPenalty + lowFretBonus + stringPenalty;
      if (score < bestScore) { bestScore = score; bestStr = s; bestFret = fret; }
    }
    if (bestStr === -1) { bestStr = 5; bestFret = Math.min(22, Math.max(0, n.midi - openMidis[5])); }
    notePositions.push({ str: bestStr, fret: bestFret });
  });

  const maxLabel = Math.max(...labels.map(l => l.length));
  let tab = '';
  for (let s = strings.length - 1; s >= 0; s--) {
    const lbl = labels[s].padStart(maxLabel);
    let line = lbl + '|-';
    riffState.notes.forEach((n, i) => {
      const pos = notePositions[i];
      const cell = pos.str === s ? String(pos.fret).padStart(2, '-') : '--';
      line += `<span class="rn" data-ri="${i}">${cell}--</span>`;
    });
    line += '|';
    tab += line + '\n';
  }
  return tab;
}

function renderRiffTab() {
  const output = document.getElementById('riff-output');
  if (!riffState.notes.length) {
    output.innerHTML = '<p style="color:var(--muted);font-size:.9rem">Press Generate to create a riff</p>';
    return;
  }
  const tab = riffToTab();
  output.innerHTML = `<pre id="riff-pre">${tab}</pre>`;
}

function playRiff() {
  if (!riffState.notes.length) return;
  stopRiff();
  ensureAudio();
  riffState.playing = true;
  riffState._noteIdx = 0;
  riffState._nextTime = audioCtx.currentTime + 0.05;
  riffState._activeOscs = [];
  document.getElementById('riff-play').textContent = 'Stop';
  showNowPlaying(`Riff \u2014 ${riffState.key} ${riffState.scale}`, stopRiff);
  riffScheduler();
}

function highlightRiffNote(idx) {
  document.querySelectorAll('.rn.playing').forEach(el => el.classList.remove('playing'));
  document.querySelectorAll(`.rn[data-ri="${idx}"]`).forEach(el => el.classList.add('playing'));
}

function riffScheduler() {
  if (!riffState.playing) return;
  const bpm = parseInt(document.getElementById('riff-bpm').value) || 110;
  const density = document.getElementById('riff-density').value;
  const notesPerBeat = density === 'sixteenth' ? 4 : density === 'eighth' ? 2 : 1;
  const noteDur = 60 / bpm / notesPerBeat;
  const scheduleAhead = 0.12;

  while (riffState._nextTime < audioCtx.currentTime + scheduleAhead) {
    if (riffState._noteIdx >= riffState.notes.length) {
      const stopDelay = Math.max(0, (riffState._nextTime - audioCtx.currentTime) * 1000);
      setTimeout(() => stopRiff(), stopDelay);
      return;
    }
    const n = riffState.notes[riffState._noteIdx];
    const osc = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();
    const freq = midiFreq(n.midi);

    osc.type = 'sawtooth';
    osc2.type = 'sine';
    osc.frequency.value = freq;
    osc2.frequency.value = freq;

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(freq * 4, 5000), riffState._nextTime);
    filter.frequency.exponentialRampToValueAtTime(Math.min(freq * 1.5, 2000), riffState._nextTime + noteDur * 0.6);
    filter.Q.value = 1;

    gain.gain.setValueAtTime(0.001, riffState._nextTime);
    gain.gain.linearRampToValueAtTime(0.12, riffState._nextTime + 0.008);
    gain.gain.setValueAtTime(0.1, riffState._nextTime + noteDur * 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, riffState._nextTime + noteDur * 0.95);

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(getAnalyserDestination());
    osc.start(riffState._nextTime); osc.stop(riffState._nextTime + noteDur + 0.02);
    osc2.start(riffState._nextTime); osc2.stop(riffState._nextTime + noteDur + 0.02);
    riffState._activeOscs.push({ osc, gain }, { osc: osc2, gain });

    const visualIdx = riffState._noteIdx;
    const delay = Math.max(0, (riffState._nextTime - audioCtx.currentTime) * 1000);
    setTimeout(() => { if (riffState.playing) highlightRiffNote(visualIdx); }, delay);

    riffState._nextTime += noteDur;
    riffState._noteIdx++;
  }
  riffState._timer = setTimeout(riffScheduler, 25);
}

function stopRiff() {
  riffState.playing = false;
  if (riffState._timer) { clearTimeout(riffState._timer); riffState._timer = null; }
  riffState._activeOscs.forEach(o => {
    try { o.gain.gain.cancelScheduledValues(audioCtx.currentTime);
      o.gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.03);
      setTimeout(() => { try { o.osc.stop(); } catch(e) {} }, 40);
    } catch(e) {}
  });
  riffState._activeOscs = [];
  document.getElementById('riff-play').textContent = 'Play';
  document.querySelectorAll('.rn.playing').forEach(el => el.classList.remove('playing'));
  hideNowPlaying();
}

function toggleRiffPlay() {
  if (riffState.playing) stopRiff(); else playRiff();
}

function initRiff() {
  const keyScroll = document.getElementById('sl-riff-key');
  const scaleScroll = document.getElementById('sl-riff-scale');
  const tuningSel = document.getElementById('riff-tuning');

  if (keyScroll.children.length) return;

  ROOTS.forEach(r => {
    const div = document.createElement('div');
    div.className = 'sl-item' + (r === riffState.key ? ' active' : '');
    div.dataset.val = r; div.textContent = r;
    div.onclick = () => {
      keyScroll.querySelectorAll('.sl-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      riffState.key = r;
    };
    keyScroll.appendChild(div);
  });

  Object.keys(SCALES).forEach(name => {
    const div = document.createElement('div');
    div.className = 'sl-item' + (name === riffState.scale ? ' active' : '');
    div.dataset.val = name; div.textContent = name;
    div.onclick = () => {
      scaleScroll.querySelectorAll('.sl-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      riffState.scale = name;
    };
    scaleScroll.appendChild(div);
  });

  Object.keys(TUNINGS).forEach(name => {
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    tuningSel.appendChild(opt);
  });
}

const composer = {
  notes: [],
  playing: false,
  _timer: null, _nextTime: 0, _noteIdx: 0, _activeOscs: [],
};

const NOTE_LABELS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const LENGTH_LABELS = {'0.25':'16th','0.5':'8th','1':'♩','1.5':'♩.','2':'𝅗𝅥','3':'𝅗𝅥.','4':'𝅝'};

function initComposerNotes() {
  const sel = document.getElementById('comp-note');
  if (!sel || sel.children.length) return;
  NOTE_LABELS.forEach(n => {
    const opt = document.createElement('option');
    opt.value = n; opt.textContent = n;
    sel.appendChild(opt);
  });
}

function composerAddNote() {
  const note = document.getElementById('comp-note').value;
  const oct = parseInt(document.getElementById('comp-oct').value);
  const len = parseFloat(document.getElementById('comp-len').value);
  const semi = NOTE_LABELS.indexOf(note);
  const midi = 12 * (oct + 1) + semi;
  composer.notes.push({ note, oct, semi, midi, beats: len, rest: false });
  renderComposerTimeline();
}

function composerAddRest() {
  const len = parseFloat(document.getElementById('comp-len').value);
  composer.notes.push({ note: 'Rest', oct: 0, semi: -1, midi: -1, beats: len, rest: true });
  renderComposerTimeline();
}

function composerRemoveNote(idx) {
  composer.notes.splice(idx, 1);
  renderComposerTimeline();
}

function composerCycleLength(idx) {
  const options = [0.25, 0.5, 1, 1.5, 2, 3, 4];
  const cur = options.indexOf(composer.notes[idx].beats);
  composer.notes[idx].beats = options[(cur + 1) % options.length];
  renderComposerTimeline();
}

function composerClear() {
  stopComposer();
  composer.notes = [];
  renderComposerTimeline();
}

function renderComposerTimeline() {
  const container = document.getElementById('comp-timeline');
  if (!composer.notes.length) {
    container.innerHTML = '<p style="color:var(--muted);font-size:.85rem;margin:0">Add notes to compose a riff</p>';
    return;
  }
  container.innerHTML = '';
  composer.notes.forEach((n, i) => {
    const chip = document.createElement('div');
    chip.className = 'comp-chip' + (n.rest ? ' rest' : '') + (composer.playing && i === composer._noteIdx ? ' playing' : '');
    chip.dataset.ci = i;

    const label = document.createElement('span');
    label.className = 'comp-chip-label';
    label.textContent = n.rest ? 'Rest' : n.note + n.oct;
    chip.appendChild(label);

    const lenBadge = document.createElement('span');
    lenBadge.className = 'comp-chip-len';
    lenBadge.textContent = LENGTH_LABELS[String(n.beats)] || n.beats + 'b';
    lenBadge.title = 'Click to cycle note length';
    lenBadge.onclick = (e) => { e.stopPropagation(); composerCycleLength(i); };
    chip.appendChild(lenBadge);

    const del = document.createElement('span');
    del.className = 'comp-chip-del';
    del.textContent = '×';
    del.onclick = (e) => { e.stopPropagation(); composerRemoveNote(i); };
    chip.appendChild(del);

    container.appendChild(chip);
  });
}

function playComposer() {
  if (!composer.notes.length) return;
  stopComposer();
  ensureAudio();
  composer.playing = true;
  composer._noteIdx = 0;
  composer._nextTime = audioCtx.currentTime + 0.05;
  composer._activeOscs = [];
  document.getElementById('comp-play').textContent = 'Stop';
  showNowPlaying('Composer Riff', stopComposer);
  composerScheduler();
}

function composerScheduler() {
  if (!composer.playing) return;
  const bpm = parseInt(document.getElementById('comp-bpm').value) || 110;
  const scheduleAhead = 0.12;

  while (composer._nextTime < audioCtx.currentTime + scheduleAhead) {
    if (composer._noteIdx >= composer.notes.length) {
      const stopDelay = Math.max(0, (composer._nextTime - audioCtx.currentTime) * 1000);
      setTimeout(() => stopComposer(), stopDelay);
      return;
    }
    const n = composer.notes[composer._noteIdx];
    const noteDur = (60 / bpm) * n.beats;

    if (!n.rest) {
      const freq = midiFreq(n.midi);
      const osc = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const filter = audioCtx.createBiquadFilter();
      const gain = audioCtx.createGain();

      osc.type = 'sawtooth';
      osc2.type = 'sine';
      osc.frequency.value = freq;
      osc2.frequency.value = freq;

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(freq * 4, 5000), composer._nextTime);
      filter.frequency.exponentialRampToValueAtTime(Math.min(freq * 1.5, 2000), composer._nextTime + noteDur * 0.6);
      filter.Q.value = 1;

      gain.gain.setValueAtTime(0.001, composer._nextTime);
      gain.gain.linearRampToValueAtTime(0.12, composer._nextTime + 0.008);
      gain.gain.setValueAtTime(0.1, composer._nextTime + noteDur * 0.5);
      gain.gain.exponentialRampToValueAtTime(0.001, composer._nextTime + noteDur * 0.95);

      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(getAnalyserDestination());
      osc.start(composer._nextTime); osc.stop(composer._nextTime + noteDur + 0.02);
      osc2.start(composer._nextTime); osc2.stop(composer._nextTime + noteDur + 0.02);
      composer._activeOscs.push({ osc, gain }, { osc: osc2, gain });
    }

    const visualIdx = composer._noteIdx;
    const delay = Math.max(0, (composer._nextTime - audioCtx.currentTime) * 1000);
    setTimeout(() => {
      if (composer.playing) highlightComposerNote(visualIdx);
    }, delay);

    composer._nextTime += noteDur;
    composer._noteIdx++;
  }
  composer._timer = setTimeout(composerScheduler, 25);
}

function highlightComposerNote(idx) {
  document.querySelectorAll('.comp-chip.playing').forEach(el => el.classList.remove('playing'));
  const chip = document.querySelector(`.comp-chip[data-ci="${idx}"]`);
  if (chip) chip.classList.add('playing');
}

function stopComposer() {
  composer.playing = false;
  if (composer._timer) { clearTimeout(composer._timer); composer._timer = null; }
  composer._activeOscs.forEach(o => {
    try {
      o.gain.gain.cancelScheduledValues(audioCtx.currentTime);
      o.gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.03);
      setTimeout(() => { try { o.osc.stop(); } catch(e) {} }, 40);
    } catch(e) {}
  });
  composer._activeOscs = [];
  document.getElementById('comp-play').textContent = 'Play';
  document.querySelectorAll('.comp-chip.playing').forEach(el => el.classList.remove('playing'));
  hideNowPlaying();
}

function toggleComposerPlay() {
  if (composer.playing) stopComposer(); else playComposer();
}

window.generateRiff = generateRiff;
window.toggleRiffPlay = toggleRiffPlay;
window.stopRiff = stopRiff;
window.composerAddNote = composerAddNote;
window.composerAddRest = composerAddRest;
window.composerClear = composerClear;
window.toggleComposerPlay = toggleComposerPlay;

export { initRiff, stopRiff, riffState, initComposerNotes, stopComposer, composer };
