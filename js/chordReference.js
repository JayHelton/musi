import { parseNote, ROOTS, INTERVAL_LABELS, TUNINGS, NOTE_NAMES_SHARP } from './theory.js';
import { CHORDS, groupedChordEntries, getChordNotes, DARK_METAL_CHORDS } from './chords.js';
import { getSetting, saveSetting } from './persistence.js';
import { getContext, setContext, subscribeContext } from './musicalContext.js';
import { audioCtx, ensureAudio, midiFreq, getAnalyserDestination } from './audio.js';

// Short interval labels keyed by semitones-from-root within one octave. Used to
// colour every chord tone on the neck by its interval (matches the Scale ref).
const DEGREE_LABELS = {
  0:'R', 1:'b2', 2:'2', 3:'b3', 4:'3', 5:'4',
  6:'b5', 7:'5', 8:'b6', 9:'6', 10:'b7', 11:'7'
};
const CH_FB_DOTS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];

let chRoot = 'C';
let chChord = 'Major';
let chTuning = 'Standard';
let chFbStart = 0;
let chFbEnd = 15;
let chRootsOnly = false;
let chContextSubscribed = false;
let chFbWired = false;
let chOscillators = [];

function initChordRef() {
  const rootScroll = document.getElementById('sl-chord-root');
  if (!rootScroll) return;

  const ctx = getContext();
  chRoot = ROOTS.includes(ctx.root) ? ctx.root : chRoot;
  chChord = getSetting('chordref.chord', chChord, Object.keys(CHORDS));
  const tuningNames = Object.keys(TUNINGS);
  chTuning = getSetting('chordref.tuning', chTuning, tuningNames);
  chFbStart = Number(getSetting('chordref.fbStart', chFbStart));
  chFbEnd = Number(getSetting('chordref.fbEnd', chFbEnd));
  chRootsOnly = getSetting('chordref.rootsOnly', chRootsOnly, [true, false]);

  rootScroll.innerHTML = '';
  ROOTS.forEach(r => {
    const div = document.createElement('div');
    div.className = 'sl-item' + (r === chRoot ? ' active' : '');
    div.dataset.val = r;
    div.textContent = r;
    div.onclick = () => {
      rootScroll.querySelectorAll('.sl-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      chRoot = r;
      saveSetting('chordref.root', chRoot);
      setContext({ root: chRoot }, 'chordref');
      renderChordRef();
    };
    rootScroll.appendChild(div);
  });

  buildChordList();
  buildTuningList();
  wireFretboardControls();
  renderChordRef();

  if (!chContextSubscribed) {
    chContextSubscribed = true;
    subscribeContext(c => {
      if (c.root === chRoot) return;
      chRoot = c.root;
      syncChordSelection();
      renderChordRef();
    });
  }
}

function buildChordList() {
  const container = document.getElementById('sl-chord-type');
  if (!container) return;
  container.innerHTML = '';
  groupedChordEntries().forEach(({ type, val, label, dark }) => {
    if (type === 'label') {
      const group = document.createElement('div');
      group.className = 'sl-group-label';
      group.textContent = label;
      container.appendChild(group);
      return;
    }
    const div = document.createElement('div');
    div.className = 'sl-item chord-sl-item' + (val === chChord ? ' active' : '');
    div.dataset.val = val;
    div.innerHTML = `<span>${label}</span>` + (dark ? '<span class="chord-dark-badge" title="Great for darker metal / deathcore">dark</span>' : '');
    div.onclick = () => {
      container.querySelectorAll('.sl-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      chChord = val;
      saveSetting('chordref.chord', chChord);
      renderChordRef();
    };
    container.appendChild(div);
  });
}

function buildTuningList() {
  const container = document.getElementById('sl-chord-tuning');
  if (!container) return;
  container.innerHTML = '';
  Object.keys(TUNINGS).forEach(name => {
    const div = document.createElement('div');
    div.className = 'sl-item' + (name === chTuning ? ' active' : '');
    div.dataset.val = name;
    const strings = TUNINGS[name];
    div.innerHTML = `<span>${name}</span><span class="sl-item-sub">${strings.length}-string</span>`;
    div.onclick = () => {
      container.querySelectorAll('.sl-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      chTuning = name;
      saveSetting('chordref.tuning', chTuning);
      renderChordFretboard();
    };
    container.appendChild(div);
  });
}

function wireFretboardControls() {
  const start = document.getElementById('chord-fb-start');
  const end = document.getElementById('chord-fb-end');
  const rootsOnly = document.getElementById('chord-fb-rootsonly');
  if (!start || chFbWired) return;
  chFbWired = true;
  start.value = chFbStart;
  end.value = chFbEnd;
  rootsOnly.checked = chRootsOnly;

  const updateRange = () => {
    let s = Math.max(0, Math.min(24, Number(start.value) || 0));
    let e = Math.max(s + 1, Math.min(24, Number(end.value) || 15));
    chFbStart = s;
    chFbEnd = e;
    start.value = s;
    end.value = e;
    saveSetting('chordref.fbStart', chFbStart);
    saveSetting('chordref.fbEnd', chFbEnd);
    renderChordFretboard();
  };
  start.onchange = updateRange;
  end.onchange = updateRange;
  rootsOnly.onchange = () => {
    chRootsOnly = rootsOnly.checked;
    saveSetting('chordref.rootsOnly', chRootsOnly);
    renderChordFretboard();
  };
}

function syncChordSelection() {
  document.querySelectorAll('#sl-chord-root .sl-item').forEach(el =>
    el.classList.toggle('active', el.dataset.val === chRoot));
  document.querySelectorAll('#sl-chord-type .sl-item').forEach(el =>
    el.classList.toggle('active', el.dataset.val === chChord));
  document.querySelectorAll('#sl-chord-tuning .sl-item').forEach(el =>
    el.classList.toggle('active', el.dataset.val === chTuning));
}

// MIDI note numbers of each open string for the active tuning (low → high).
function chOpenMidis() {
  const strings = TUNINGS[chTuning] || TUNINGS['Standard'];
  return strings.map(s => {
    const p = parseNote(s.note);
    return p ? 12 * (s.oct + 1) + p.semi : 0;
  });
}

// Maps each pitch class in the chord to the interval/label to display, keeping
// the lowest-octave voice (so root wins over an octave doubling).
function chordPcMap() {
  const def = CHORDS[chChord];
  const rootP = parseNote(chRoot);
  const map = {};
  if (!def || !rootP) return map;
  def.tones.forEach(([, so, label]) => {
    const pc = (rootP.semi + so) % 12;
    const interval = so % 12;
    if (!(pc in map) || so < map[pc].semi) {
      map[pc] = { interval, label, isRoot: interval === 0, semi: so };
    }
  });
  return map;
}

function renderChordLegend(pcMap) {
  const el = document.getElementById('chord-fb-legend');
  if (!el) return;
  const items = Object.values(pcMap).sort((a, b) => a.interval - b.interval);
  el.innerHTML = items.map(it =>
    `<span class="ref-leg-item${it.isRoot ? ' root' : ''}">` +
    `<span class="ref-leg-swatch deg-${it.interval}"></span>` +
    `${it.label} · ${INTERVAL_LABELS[it.interval] || it.interval}</span>`
  ).join('');
}

// Renders the whole neck for the active tuning, highlighting every instance of a
// chord tone and colouring each by its interval above the root.
function renderChordFretboard() {
  const board = document.getElementById('chord-fretboard');
  if (!board) return;
  const rootP = parseNote(chRoot);
  const def = CHORDS[chChord];
  if (!rootP || !def) { board.innerHTML = ''; return; }

  const strings = TUNINGS[chTuning] || TUNINGS['Standard'];
  const openMidis = chOpenMidis();
  const pcMap = chordPcMap();

  const start = Math.max(0, Math.min(24, chFbStart));
  const end = Math.max(start + 1, Math.min(24, chFbEnd));
  const count = end - start + 1;
  const middleString = Math.floor(strings.length / 2);

  board.style.gridTemplateColumns = `34px repeat(${count}, minmax(30px, 1fr))`;

  let html = '<div class="ref-fb-corner"></div>';
  for (let f = start; f <= end; f++) html += `<div class="ref-fb-fretnum">${f}</div>`;

  for (let s = strings.length - 1; s >= 0; s--) {
    html += `<div class="ref-fb-strlabel">${strings[s].note}${strings[s].oct}</div>`;
    for (let f = start; f <= end; f++) {
      const pc = (openMidis[s] + f) % 12;
      const tone = pcMap[pc];
      const cls = ['ref-fb-cell'];
      if (f === 0) cls.push('nut');
      if (f > 0 && CH_FB_DOTS.includes(f) && s === middleString) cls.push('inlay');

      let inner = '';
      if (tone && !(chRootsOnly && !tone.isRoot)) {
        const noteCls = ['ref-note', `deg-${tone.interval}`];
        if (tone.isRoot) noteCls.push('root');
        const spelled = NOTE_NAMES_SHARP[pc];
        inner = `<span class="${noteCls.join(' ')}" title="${spelled} · ${tone.label} (${INTERVAL_LABELS[tone.interval] || tone.interval})">${tone.label}</span>`;
      }
      html += `<div class="${cls.join(' ')}">${inner}</div>`;
    }
  }
  board.innerHTML = html;

  const notes = getChordNotes(chRoot, chChord) || [];
  const uniqueNotes = [...new Set(notes)];
  const title = document.getElementById('chord-fb-title');
  const sub = document.getElementById('chord-fb-sub');
  if (title) title.textContent = `${chRoot}${def.sym} — ${chChord}`;
  if (sub) {
    sub.innerHTML = `<strong>${chTuning}</strong> · ${uniqueNotes.join(' · ')} · ` +
      `every instance across the neck, coloured by interval`;
  }
  renderChordLegend(pcMap);
}

function renderChordInfo() {
  const card = document.getElementById('chord-info-card');
  if (!card) return;
  const def = CHORDS[chChord];
  const notes = getChordNotes(chRoot, chChord);
  if (!def || !notes) { card.innerHTML = '<p style="color:var(--err)">Could not compute chord</p>'; return; }

  const formula = def.tones.map(t => t[2]).join(' – ');

  let html = `<div class="chord-ref-head">`;
  html += `<h3 class="chord-ref-name">${chRoot}${def.sym} <span class="chord-ref-full">${chChord}</span></h3>`;
  html += `<button class="btn sm chord-ref-play" id="chord-ref-play" type="button">&#9654; Play</button>`;
  html += `</div>`;
  html += `<div class="ref-info">Formula: <strong>${formula}</strong></div>`;
  html += `<div class="ref-info">Notes: <strong>${[...new Set(notes)].join(' · ')}</strong></div>`;

  html += `<table class="ref-table"><tr><th>Degree</th><th>Note</th><th>Interval</th><th>Semitones</th></tr>`;
  def.tones.forEach(([, so, label], i) => {
    const intLabel = INTERVAL_LABELS[so % 12] || (so + 'st');
    html += `<tr><td>${label}</td><td style="color:var(--accent);font-weight:600">${notes[i]}</td><td>${intLabel}</td><td>${so}</td></tr>`;
  });
  html += `</table>`;

  card.innerHTML = html;
  const playBtn = document.getElementById('chord-ref-play');
  if (playBtn) playBtn.onclick = playChordRef;
}

function playChordRef() {
  stopChordRef();
  const def = CHORDS[chChord];
  const rootP = parseNote(chRoot);
  if (!def || !rootP) return;
  ensureAudio();
  const now = audioCtx.currentTime;
  const baseMidi = 12 * (3 + 1) + rootP.semi; // root near octave 3
  const midis = def.tones.map(([, so]) => baseMidi + so);
  const vol = 0.15 / Math.max(1, midis.length);

  midis.forEach(midi => {
    const osc = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();
    const freq = midiFreq(midi);

    osc.type = 'sine';
    osc2.type = 'triangle';
    osc.frequency.value = freq;
    osc2.frequency.value = freq;

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(freq * 5, 5000), now);
    filter.frequency.exponentialRampToValueAtTime(Math.min(freq * 2, 2500), now + 1);
    filter.Q.value = 0.5;

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.04);
    gain.gain.setValueAtTime(vol * 0.8, now + 1.5);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(getAnalyserDestination());
    osc.start(now); osc.stop(now + 2.5);
    osc2.start(now); osc2.stop(now + 2.5);
    chOscillators.push({ osc, gain }, { osc: osc2, gain });
  });
}

function stopChordRef() {
  chOscillators.forEach(o => {
    try {
      o.gain.gain.cancelScheduledValues(audioCtx.currentTime);
      o.gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
      setTimeout(() => { try { o.osc.stop(); } catch (e) {} }, 60);
    } catch (e) {}
  });
  chOscillators = [];
}

function renderChordRef() {
  renderChordFretboard();
  renderChordInfo();
}

export { initChordRef, stopChordRef, chOscillators };
