// Chord Workout — a guided practice drill built on top of the shared music
// engine. The player is handed a random chord (built on the current global key)
// and works through a fixed routine: find three fretboard positions, play the
// arpeggio, play the 3-note and 5-note arpeggios, and play a scale position that
// fits the chord. They can record themselves so the app can check which chord
// tones they actually hit, and reveal a full worked answer.
//
// Everything reuses the existing theory/chord/scale libraries and the shared
// musical context so the chord root always follows the app-wide key.

import { parseNote, spellNote, ROOTS, TUNINGS, NOTE_NAMES_SHARP, INTERVAL_LABELS } from './theory.js';
import { CHORDS, getChordNotes } from './chords.js';
import { SCALES, getScaleNotes, scaleStepPattern } from './scales.js';
import { getSetting, saveSetting } from './persistence.js';
import { getContext, subscribeContext } from './musicalContext.js';
import {
  audioCtx, ensureAudio, midiFreq, getAnalyserDestination,
  requestMicStream, releaseMicStream,
} from './audio.js';
import { createPitchTracker } from './pitch.js';

// Interval (semitones-from-root) → short degree label, matching the chord ref.
const DEGREE_LABELS = {
  0: 'R', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
  6: 'b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
};

// The ten workout chords, each mapped to a chord definition in chords.js and a
// parent scale in scales.js that comfortably contains its chord tones.
const WORKOUT_CHORDS = [
  { key: 'Dominant 7',             label: 'Dom7',            scale: 'Mixolydian' },
  { key: 'Sus 4',                  label: 'Sus4',            scale: 'Mixolydian' },
  { key: 'Minor',                  label: 'Minor',           scale: 'Natural Minor (Aeolian)' },
  { key: 'Half Diminished (m7b5)', label: 'Half-Diminished', scale: 'Locrian' },
  { key: 'Major',                  label: 'Major',           scale: 'Major (Ionian)' },
  { key: 'Diminished 7',           label: 'Diminished',      scale: 'Diminished W-H' },
  { key: 'Minor 7',                label: 'Min7',            scale: 'Dorian' },
  { key: 'Sus 2',                  label: 'Sus2',            scale: 'Major (Ionian)' },
  { key: 'Augmented',              label: 'Augmented',       scale: 'Whole Tone' },
  { key: 'Major 7',                label: 'Maj7',            scale: 'Major (Ionian)' },
];

const WORKOUT_TASKS = [
  { id: 'positions', label: 'Find 3 positions of the chord across the neck' },
  { id: 'arpeggio',  label: 'Play the arpeggio (every chord tone)' },
  { id: 'threefive', label: 'Play the 3-note and 5-note arpeggios' },
  { id: 'scale',     label: 'Play a scale position that fits the chord' },
];

const CW_MAX_FRET = 15;
const CW_GRIP_SPAN = 4;
const CW_FB_DOTS = [3, 5, 7, 9, 12, 15];
const CW_NECK_END = 12;
const ARP_BASE_OCT = 3; // arpeggio playback centred around octave 3

const cw = {
  root: 'C',
  chordIdx: 0,
  tuning: 'Standard',
  done: {},
  answerShown: false,
  built: false,
  subscribed: false,
  // playback
  voices: [],
  timers: [],
  // recording
  rec: {
    running: false,
    stream: null,
    analyser: null,
    buf: null,
    rafId: null,
    tracker: null,
    notes: [],
    lastMidi: null,
    holdFrames: 0,
  },
};

// ---------------------------------------------------------------------------
// Chord / theory helpers
// ---------------------------------------------------------------------------

function currentChord() {
  return WORKOUT_CHORDS[cw.chordIdx] || WORKOUT_CHORDS[0];
}

function chordDef() {
  return CHORDS[currentChord().key];
}

// pc → { interval, label, isRoot, semi }, keeping the lowest voice for a pc.
function chordPcMap() {
  const def = chordDef();
  const rootP = parseNote(cw.root);
  const map = {};
  if (!def || !rootP) return map;
  def.tones.forEach(([, so, label]) => {
    const pc = (rootP.semi + so) % 12;
    const interval = ((so % 12) + 12) % 12;
    if (!(pc in map) || so < map[pc].semi) {
      map[pc] = { interval, label, isRoot: interval === 0, semi: so };
    }
  });
  return map;
}

// pc → spelled note name (e.g. 4 → 'E' or 'Fb' depending on the chord spelling).
function chordPcNames() {
  const def = chordDef();
  const rootP = parseNote(cw.root);
  const spelled = getChordNotes(cw.root, currentChord().key) || [];
  const map = {};
  if (!def || !rootP) return map;
  def.tones.forEach(([, so], i) => {
    const pc = (rootP.semi + so) % 12;
    if (!(pc in map) && spelled[i]) map[pc] = spelled[i];
  });
  return map;
}

function openMidisFor(tuning) {
  const strings = TUNINGS[tuning] || TUNINGS['Standard'];
  return strings.map(s => {
    const p = parseNote(s.note);
    return p ? 12 * (s.oct + 1) + p.semi : 0;
  });
}

function midiLabel(midi) {
  const name = NOTE_NAMES_SHARP[((midi % 12) + 12) % 12];
  const oct = Math.floor(midi / 12) - 1;
  return name + oct;
}

// ---------------------------------------------------------------------------
// Fretboard grip finding (adapted from chordReference, made stateless)
// ---------------------------------------------------------------------------

function toneCandidate(openMidi, pcMap, fret) {
  const pc = (openMidi + fret) % 12;
  const tone = pcMap[pc];
  if (!tone) return null;
  return { fret, pc, tone };
}

function candidatesForString(openMidi, pcMap, windowStart, windowEnd) {
  const out = [];
  const open = toneCandidate(openMidi, pcMap, 0);
  if (open) out.push(open);
  for (let fret = Math.max(1, windowStart); fret <= Math.min(CW_MAX_FRET, windowEnd); fret++) {
    const c = toneCandidate(openMidi, pcMap, fret);
    if (c) out.push(c);
  }
  return out;
}

function chooseGripCandidate(candidates, usedIntervals, needRoot) {
  let best = null;
  let bestScore = -Infinity;
  candidates.forEach(candidate => {
    let score = 0;
    if (!usedIntervals.has(candidate.tone.interval)) score += 60;
    if (candidate.tone.isRoot) score += needRoot ? 50 : 12;
    if (candidate.fret === 0) score += 16;
    else score += Math.max(0, 16 - candidate.fret);
    if (candidate.fret > 0 && candidate.fret <= 4) score += 6;
    if (score > bestScore) { best = candidate; bestScore = score; }
  });
  return best;
}

function buildGripForWindow(openMidis, pcMap, windowStart) {
  const windowEnd = windowStart === 0 ? CW_GRIP_SPAN : windowStart + CW_GRIP_SPAN - 1;
  const perString = openMidis.map(m => candidatesForString(m, pcMap, windowStart, windowEnd));
  const bassString = perString.findIndex(cs => cs.some(c => c.tone.isRoot));
  const firstPlayable = perString.findIndex(cs => cs.length);
  const startString = bassString >= 0 ? bassString : firstPlayable;
  if (startString < 0) return null;

  const strings = [];
  const usedIntervals = new Set();
  for (let s = 0; s < perString.length; s++) {
    if (s < startString) { strings.push({ muted: true }); continue; }
    const chosen = chooseGripCandidate(perString[s], usedIntervals, !usedIntervals.has(0));
    if (!chosen) { strings.push({ muted: true }); continue; }
    usedIntervals.add(chosen.tone.interval);
    strings.push(chosen);
  }

  const played = strings.filter(s => !s.muted);
  if (played.length < 2) return null;
  const fretted = played.map(s => s.fret).filter(f => f > 0);
  const uniqueFrets = [...new Set(fretted)].sort((a, b) => a - b);
  strings.forEach(string => {
    if (string.muted) return;
    string.finger = string.fret === 0 ? '0' : String(Math.min(4, uniqueFrets.indexOf(string.fret) + 1));
  });

  const coverage = usedIntervals.size;
  const hasRootBass = !strings[startString].muted && strings[startString].tone.isRoot;
  const openCount = played.filter(s => s.fret === 0).length;
  const fretSpan = uniqueFrets.length ? uniqueFrets[uniqueFrets.length - 1] - uniqueFrets[0] : 0;
  const score = coverage * 1000 + (hasRootBass ? 300 : 0) + played.length * 35 + openCount * 18 - fretSpan * 12 - windowStart;

  return {
    strings,
    startFret: uniqueFrets[0] || 0,
    endFret: uniqueFrets[uniqueFrets.length - 1] || 0,
    windowStart,
    score,
  };
}

// Up to `count` distinct grips spread across the neck (best first).
function findPositions(openMidis, pcMap, count) {
  const grips = [];
  for (let w = 0; w <= 12; w++) {
    const g = buildGripForWindow(openMidis, pcMap, w);
    if (g) grips.push(g);
  }
  grips.sort((a, b) => b.score - a.score);
  const chosen = [];
  for (const g of grips) {
    if (chosen.length >= count) break;
    if (chosen.some(c => Math.abs(c.startFret - g.startFret) < 2 && Math.abs(c.windowStart - g.windowStart) < 2)) continue;
    chosen.push(g);
  }
  // Present low-to-high on the neck so the shapes read like a journey up.
  return chosen.sort((a, b) => a.windowStart - b.windowStart);
}

// ---------------------------------------------------------------------------
// Arpeggio helpers
// ---------------------------------------------------------------------------

// Ascending unique chord-tone pitch classes (semitones from root, 0..11).
function chordSemis() {
  const def = chordDef();
  if (!def) return [0];
  const semis = [...new Set(def.tones.map(t => ((t[1] % 12) + 12) % 12))];
  return semis.sort((a, b) => a - b);
}

// N chord tones stacked upward from the root, wrapping into higher octaves.
function nNoteArpeggio(n, baseOct) {
  const rootP = parseNote(cw.root);
  if (!rootP) return [];
  const rootMidi = 12 * (baseOct + 1) + rootP.semi;
  const semis = chordSemis();
  const seq = [];
  let i = 0;
  let oct = 0;
  while (seq.length < n) {
    seq.push(rootMidi + semis[i] + 12 * oct);
    i++;
    if (i >= semis.length) { i = 0; oct++; }
  }
  return seq;
}

// Full one-octave arpeggio (all chord tones) plus the octave root on top.
function fullArpeggio(baseOct) {
  const rootP = parseNote(cw.root);
  if (!rootP) return [];
  const rootMidi = 12 * (baseOct + 1) + rootP.semi;
  const semis = chordSemis();
  return [...semis.map(s => rootMidi + s), rootMidi + 12];
}

// ---------------------------------------------------------------------------
// Audio playback
// ---------------------------------------------------------------------------

function stopWorkoutAudio() {
  cw.timers.forEach(id => clearTimeout(id));
  cw.timers = [];
  cw.voices.forEach(v => { try { v.stop(); } catch (e) {} });
  cw.voices = [];
  document.querySelectorAll('#sec-chordlab .cw-play-btn').forEach(b => b.classList.remove('playing'));
}

function scheduleTone(midi, startTime, duration, vol = 0.16) {
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
  gain.gain.linearRampToValueAtTime(vol, startTime + 0.02);
  gain.gain.setValueAtTime(vol * 0.8, startTime + sustain);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + sustain + release);

  osc.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  gain.connect(getAnalyserDestination());

  const stopAt = startTime + sustain + release + 0.05;
  osc.start(startTime); osc.stop(stopAt);
  osc2.start(startTime); osc2.stop(stopAt);
  cw.voices.push(osc, osc2);
  osc.onended = () => { cw.voices = cw.voices.filter(v => v !== osc && v !== osc2); };
}

// Play a melodic sequence of midis one after another, then re-enable the button.
function playSequence(midis, btn) {
  ensureAudio();
  stopWorkoutAudio();
  if (!midis.length) return;
  const beat = 0.42;
  const start = audioCtx.currentTime + 0.06;
  midis.forEach((m, i) => scheduleTone(m, start + i * beat, beat * 0.95));
  if (btn) btn.classList.add('playing');
  const totalMs = (midis.length * beat + 0.4) * 1000;
  cw.timers.push(setTimeout(() => {
    if (btn) btn.classList.remove('playing');
  }, totalMs));
}

// Strum a set of midis together (used for chord positions).
function playChordTones(midis, btn) {
  ensureAudio();
  stopWorkoutAudio();
  if (!midis.length) return;
  const start = audioCtx.currentTime + 0.05;
  const vol = 0.16 / Math.max(1, Math.sqrt(midis.length));
  midis.forEach((m, i) => scheduleTone(m, start + i * 0.03, 1.8, vol));
  if (btn) btn.classList.add('playing');
  cw.timers.push(setTimeout(() => { if (btn) btn.classList.remove('playing'); }, 2200));
}

// ---------------------------------------------------------------------------
// Rendering — prompt, tasks
// ---------------------------------------------------------------------------

function renderPrompt() {
  const def = chordDef();
  const nameEl = document.getElementById('cw-chord-name');
  const subEl = document.getElementById('cw-chord-sub');
  if (!nameEl || !def) return;
  const info = currentChord();
  nameEl.textContent = `${cw.root}${def.sym}`;
  const notes = getChordNotes(cw.root, info.key) || [];
  subEl.textContent = `${info.label} · ${[...new Set(notes)].join(' · ')}`;
}

function renderTasks() {
  const list = document.getElementById('cw-task-list');
  if (!list) return;
  list.innerHTML = '';
  WORKOUT_TASKS.forEach((task, i) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'cw-task' + (cw.done[task.id] ? ' done' : '');
    row.innerHTML =
      `<span class="cw-task-check" aria-hidden="true">${cw.done[task.id] ? '✓' : ''}</span>` +
      `<span class="cw-task-num">${i + 1}</span>` +
      `<span class="cw-task-label">${task.label}</span>`;
    row.onclick = () => {
      cw.done[task.id] = !cw.done[task.id];
      renderTasks();
    };
    list.appendChild(row);
  });
}

// ---------------------------------------------------------------------------
// Rendering — answer sections
// ---------------------------------------------------------------------------

function toneChip(midi, degMap, nameMap) {
  const pc = ((midi % 12) + 12) % 12;
  const tone = degMap[pc];
  const interval = tone ? tone.interval : pc;
  const label = tone ? tone.label : (DEGREE_LABELS[interval] || interval);
  const name = (nameMap && nameMap[pc]) || NOTE_NAMES_SHARP[pc];
  const oct = Math.floor(midi / 12) - 1;
  const rootCls = tone && tone.isRoot ? ' root' : '';
  return `<span class="cw-chip${rootCls}">` +
    `<span class="cw-chip-dot deg-${interval}"></span>` +
    `<span class="cw-chip-note">${name}${oct}</span>` +
    `<span class="cw-chip-deg">${label}</span></span>`;
}

function renderChipRow(midis, degMap, nameMap) {
  return `<div class="cw-chip-row">${midis.map(m => toneChip(m, degMap, nameMap)).join('')}</div>`;
}

// A compact left-to-right fretboard highlighting the tones in `degMap`.
function renderNeck(degMap, { emphasizeMap } = {}) {
  const strings = TUNINGS[cw.tuning] || TUNINGS['Standard'];
  const openMidis = openMidisFor(cw.tuning);
  const start = 0;
  const end = CW_NECK_END;
  const count = end - start + 1;
  const middleString = Math.floor(strings.length / 2);

  let html = `<div class="ref-fb-scroll"><div class="ref-fretboard" style="grid-template-columns:34px repeat(${count}, minmax(30px, 1fr))">`;
  html += '<div class="ref-fb-corner"></div>';
  for (let f = start; f <= end; f++) html += `<div class="ref-fb-fretnum">${f}</div>`;

  for (let s = strings.length - 1; s >= 0; s--) {
    html += `<div class="ref-fb-strlabel">${strings[s].note}${strings[s].oct}</div>`;
    for (let f = start; f <= end; f++) {
      const pc = (openMidis[s] + f) % 12;
      const tone = degMap[pc];
      const cls = ['ref-fb-cell'];
      if (f === 0) cls.push('nut');
      if (f > 0 && CW_FB_DOTS.includes(f) && s === middleString) cls.push('inlay');
      let inner = '';
      if (tone) {
        const noteCls = ['ref-note', `deg-${tone.interval}`];
        if (tone.isRoot) noteCls.push('root');
        if (emphasizeMap && !(pc in emphasizeMap)) noteCls.push('dim');
        inner = `<span class="${noteCls.join(' ')}" title="${NOTE_NAMES_SHARP[pc]} · ${tone.label}">${tone.label}</span>`;
      }
      html += `<div class="${cls.join(' ')}">${inner}</div>`;
    }
  }
  html += '</div></div>';
  return html;
}

function renderLegend(degMap) {
  const items = Object.values(degMap).sort((a, b) => a.interval - b.interval);
  return `<div class="ref-fb-legend">${items.map(it =>
    `<span class="ref-leg-item${it.isRoot ? ' root' : ''}">` +
    `<span class="ref-leg-swatch deg-${it.interval}"></span>` +
    `${it.label} · ${INTERVAL_LABELS[it.interval] || it.interval}</span>`
  ).join('')}</div>`;
}

function renderPositionDiagram(grip, strings) {
  const fretted = grip.strings.filter(s => !s.muted && s.fret > 0);
  const positionText = fretted.length ? `frets ${grip.startFret}–${grip.endFret}` : 'open position';
  let html = `<div class="cw-pos">`;
  html += `<div class="cw-pos-title">${positionText}</div>`;
  html += `<div class="chord-position-strings">`;
  grip.strings.forEach((string, i) => {
    const label = `${strings[i].note}${strings[i].oct}`;
    if (string.muted) {
      html += `<div class="chord-position-string muted"><span class="cps-label">${label}</span><span class="cps-dot">X</span><span class="cps-fret">mute</span></div>`;
      return;
    }
    const note = NOTE_NAMES_SHARP[string.pc];
    html += `<div class="chord-position-string">`;
    html += `<span class="cps-label">${label}</span>`;
    html += `<span class="cps-dot${string.tone.isRoot ? ' root' : ''}">${string.finger}</span>`;
    html += `<span class="cps-fret">fret ${string.fret}</span>`;
    html += `<span class="cps-tone">${note} · ${string.tone.label}</span>`;
    html += `</div>`;
  });
  html += `</div></div>`;
  return html;
}

function renderAnswer() {
  const box = document.getElementById('cw-answer');
  if (!box) return;
  const def = chordDef();
  const info = currentChord();
  if (!def) { box.innerHTML = ''; return; }

  const degMap = chordPcMap();
  const nameMap = chordPcNames();
  const strings = TUNINGS[cw.tuning] || TUNINGS['Standard'];
  const openMidis = openMidisFor(cw.tuning);

  // 1) Positions
  const positions = findPositions(openMidis, degMap, 3);
  let posHtml;
  if (positions.length) {
    posHtml = `<div class="cw-pos-grid">${positions.map((g, i) =>
      `<div class="cw-pos-card"><div class="cw-pos-kicker">Position ${i + 1}</div>` +
      renderPositionDiagram(g, strings) +
      `<button class="btn sm cw-play-btn" data-play="pos" data-idx="${i}">▶ Play</button></div>`
    ).join('')}</div>`;
  } else {
    posHtml = `<p class="cw-muted">No compact positions found in ${cw.tuning} for this chord — try Standard tuning.</p>`;
  }

  // 2) Arpeggio (full neck + spelled tones)
  const arpMidis = fullArpeggio(ARP_BASE_OCT);
  const arpHtml =
    renderChipRow(arpMidis, degMap, nameMap) +
    `<button class="btn sm cw-play-btn" data-play="arp">▶ Play arpeggio</button>` +
    renderNeck(degMap) +
    renderLegend(degMap);

  // 3) 3-note & 5-note arpeggios
  const three = nNoteArpeggio(3, ARP_BASE_OCT);
  const five = nNoteArpeggio(5, ARP_BASE_OCT);
  const threeFiveHtml =
    `<div class="cw-sub">3-note arpeggio</div>` +
    renderChipRow(three, degMap, nameMap) +
    `<button class="btn sm cw-play-btn" data-play="three">▶ Play 3-note</button>` +
    `<div class="cw-sub">5-note arpeggio</div>` +
    renderChipRow(five, degMap, nameMap) +
    `<button class="btn sm cw-play-btn" data-play="five">▶ Play 5-note</button>`;

  // 4) Scale position
  const scaleName = SCALES[info.scale] ? info.scale : 'Major (Ionian)';
  const scaleDef = SCALES[scaleName];
  const rootP = parseNote(cw.root);
  const scaleNotes = getScaleNotes(cw.root, scaleName) || [];
  const scaleDegMap = {};
  if (scaleDef && rootP) {
    scaleDef.forEach(([lo, so], i) => {
      const pc = (rootP.semi + so) % 12;
      const interval = ((so % 12) + 12) % 12;
      if (!(pc in scaleDegMap)) {
        scaleDegMap[pc] = {
          interval,
          label: DEGREE_LABELS[interval] || String(interval),
          isRoot: interval === 0,
        };
      }
    });
  }
  const scaleHtml =
    `<div class="ref-info">Suggested scale: <strong>${cw.root} ${scaleName}</strong></div>` +
    `<div class="ref-info">Notes: <strong>${scaleNotes.join(' · ')}</strong></div>` +
    `<div class="ref-info">Steps: <strong>${scaleStepPattern(scaleName)}</strong></div>` +
    `<button class="btn sm cw-play-btn" data-play="scale">▶ Play scale</button>` +
    renderNeck(scaleDegMap, { emphasizeMap: degMap }) +
    `<p class="cw-muted">Coloured circles are scale tones; the brighter ones are chord tones (root outlined).</p>`;

  box.innerHTML =
    section('1 · Three positions', posHtml) +
    section('2 · Arpeggio', arpHtml) +
    section('3 · 3-note &amp; 5-note arpeggios', threeFiveHtml) +
    section('4 · Scale position', scaleHtml);

  wireAnswerPlayButtons(positions, arpMidis, three, five, scaleName);
}

function section(title, inner) {
  return `<div class="cw-answer-section"><div class="cw-answer-title">${title}</div>${inner}</div>`;
}

function wireAnswerPlayButtons(positions, arpMidis, three, five, scaleName) {
  const box = document.getElementById('cw-answer');
  if (!box) return;
  const openMidis = openMidisFor(cw.tuning);
  box.querySelectorAll('.cw-play-btn').forEach(btn => {
    btn.onclick = () => {
      const kind = btn.dataset.play;
      if (kind === 'pos') {
        const grip = positions[Number(btn.dataset.idx)];
        if (!grip) return;
        const midis = grip.strings
          .map((s, i) => (s.muted ? null : openMidis[i] + s.fret))
          .filter(m => m != null);
        playChordTones(midis, btn);
      } else if (kind === 'arp') {
        playSequence([...arpMidis, ...arpMidis.slice(0, -1).reverse()], btn);
      } else if (kind === 'three') {
        playSequence(three, btn);
      } else if (kind === 'five') {
        playSequence(five, btn);
      } else if (kind === 'scale') {
        const rootP = parseNote(cw.root);
        const def = SCALES[scaleName];
        if (!rootP || !def) return;
        const rootMidi = 12 * (ARP_BASE_OCT + 1) + rootP.semi;
        const midis = def.map(([, so]) => rootMidi + so);
        midis.push(rootMidi + 12);
        playSequence(midis, btn);
      }
    };
  });
}

function updateAnswerVisibility() {
  const box = document.getElementById('cw-answer');
  const btn = document.getElementById('cw-toggle-answer');
  if (!box || !btn) return;
  box.hidden = !cw.answerShown;
  btn.textContent = cw.answerShown ? 'Hide Answer' : 'Show Answer';
  btn.classList.toggle('active', cw.answerShown);
  if (cw.answerShown) renderAnswer();
}

// ---------------------------------------------------------------------------
// Recording + feedback
// ---------------------------------------------------------------------------

function recStatus(msg) {
  const el = document.getElementById('cw-rec-status');
  if (el) el.textContent = msg;
}

function renderRecSeq() {
  const seq = document.getElementById('cw-rec-seq');
  if (!seq) return;
  if (!cw.rec.notes.length) { seq.innerHTML = ''; return; }
  seq.innerHTML = cw.rec.notes
    .map(n => `<span class="cw-rec-note">${n.name}${n.oct}</span>`)
    .join('');
}

function recLoop() {
  if (!cw.rec.running) return;
  cw.rec.analyser.getFloatTimeDomainData(cw.rec.buf);
  const { info } = cw.rec.tracker.process(cw.rec.buf);
  const live = document.getElementById('cw-rec-live');

  if (info) {
    if (live) {
      live.textContent = `${info.name}${info.oct}`;
      live.classList.add('active');
    }
    // Commit a note once it has been held a few frames and differs from the last.
    if (cw.rec.lastMidi === info.midi) {
      cw.rec.holdFrames++;
    } else {
      cw.rec.lastMidi = info.midi;
      cw.rec.holdFrames = 1;
    }
    if (cw.rec.holdFrames === 3) {
      const prev = cw.rec.notes[cw.rec.notes.length - 1];
      if (!prev || prev.midi !== info.midi) {
        cw.rec.notes.push({ midi: info.midi, name: info.name, oct: info.oct, pc: ((info.midi % 12) + 12) % 12 });
        renderRecSeq();
      }
    }
  } else if (live) {
    live.textContent = '--';
    live.classList.remove('active');
  }

  cw.rec.rafId = requestAnimationFrame(recLoop);
}

async function startRecording() {
  ensureAudio();
  cw.rec.notes = [];
  cw.rec.lastMidi = null;
  cw.rec.holdFrames = 0;
  renderRecSeq();
  const fbEl = document.getElementById('cw-rec-feedback');
  if (fbEl) { fbEl.innerHTML = ''; fbEl.className = 'cw-rec-feedback'; }

  try {
    try {
      cw.rec.stream = await requestMicStream({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch (e) {
      cw.rec.stream = await requestMicStream({ audio: true });
    }
    const source = audioCtx.createMediaStreamSource(cw.rec.stream);
    cw.rec.analyser = audioCtx.createAnalyser();
    cw.rec.analyser.fftSize = 4096;
    cw.rec.analyser.smoothingTimeConstant = 0;
    cw.rec.buf = new Float32Array(cw.rec.analyser.fftSize);
    cw.rec.tracker = createPitchTracker({
      sampleRate: audioCtx.sampleRate,
      minFreq: 40,
      maxFreq: 1500,
    });
    source.connect(cw.rec.analyser);
    cw.rec.running = true;
    const btn = document.getElementById('cw-rec-toggle');
    if (btn) { btn.textContent = '■ Stop'; btn.classList.add('recording'); }
    recStatus('Listening… play the chord tones or the arpeggio.');
    recLoop();
  } catch (e) {
    recStatus('Mic access denied or unavailable.');
  }
}

function analyseRecording() {
  const fbEl = document.getElementById('cw-rec-feedback');
  if (!fbEl) return;
  const degMap = chordPcMap();
  const nameMap = chordPcNames();
  const chordPcs = Object.keys(degMap).map(Number);
  const playedPcs = new Set(cw.rec.notes.map(n => n.pc));

  if (!cw.rec.notes.length) {
    fbEl.className = 'cw-rec-feedback show';
    fbEl.innerHTML = `<p class="cw-muted">No clear pitches detected. Try playing closer to the mic, one note at a time.</p>`;
    return;
  }

  const hit = chordPcs.filter(pc => playedPcs.has(pc));
  const missing = chordPcs.filter(pc => !playedPcs.has(pc));
  const extra = [...playedPcs].filter(pc => !(pc in degMap));

  const chip = (pc, mod) => {
    const tone = degMap[pc];
    const interval = tone ? tone.interval : pc;
    const label = tone ? tone.label : (DEGREE_LABELS[interval] || interval);
    const name = (nameMap && nameMap[pc]) || NOTE_NAMES_SHARP[pc];
    return `<span class="cw-chip ${mod}"><span class="cw-chip-dot deg-${interval}"></span>` +
      `<span class="cw-chip-note">${name}</span><span class="cw-chip-deg">${label}</span></span>`;
  };

  const allHit = missing.length === 0;
  const pct = Math.round((hit.length / Math.max(1, chordPcs.length)) * 100);
  let html = `<div class="cw-fb-score ${allHit ? 'good' : 'partial'}">` +
    `${allHit ? '✓ All chord tones hit!' : `You hit ${hit.length} of ${chordPcs.length} chord tones (${pct}%)`}</div>`;
  html += `<div class="cw-fb-group"><span class="cw-fb-label">Hit</span><div class="cw-chip-row">${
    hit.length ? hit.sort((a, b) => degMap[a].interval - degMap[b].interval).map(pc => chip(pc, 'hit')).join('') : '<span class="cw-muted">none</span>'
  }</div></div>`;
  if (missing.length) {
    html += `<div class="cw-fb-group"><span class="cw-fb-label">Missing</span><div class="cw-chip-row">${
      missing.sort((a, b) => degMap[a].interval - degMap[b].interval).map(pc => chip(pc, 'missing')).join('')
    }</div></div>`;
  }
  if (extra.length) {
    html += `<div class="cw-fb-group"><span class="cw-fb-label">Outside chord</span><div class="cw-chip-row">${
      extra.map(pc => `<span class="cw-chip extra"><span class="cw-chip-dot deg-${pc}"></span><span class="cw-chip-note">${NOTE_NAMES_SHARP[pc]}</span></span>`).join('')
    }</div></div>`;
  }
  fbEl.className = 'cw-rec-feedback show';
  fbEl.innerHTML = html;
}

function stopRecording(analyse = true) {
  cw.rec.running = false;
  if (cw.rec.rafId) { cancelAnimationFrame(cw.rec.rafId); cw.rec.rafId = null; }
  if (cw.rec.tracker) cw.rec.tracker.reset();
  if (cw.rec.stream) { releaseMicStream(cw.rec.stream); cw.rec.stream = null; }
  const btn = document.getElementById('cw-rec-toggle');
  if (btn) { btn.textContent = '● Record'; btn.classList.remove('recording'); }
  const live = document.getElementById('cw-rec-live');
  if (live) { live.textContent = '--'; live.classList.remove('active'); }
  if (analyse) {
    analyseRecording();
    recStatus('Tap Record to try again.');
  }
}

function toggleRecording() {
  if (cw.rec.running) stopRecording(true);
  else startRecording();
}

// ---------------------------------------------------------------------------
// Chord selection
// ---------------------------------------------------------------------------

function setChord(idx, { keepDone } = {}) {
  cw.chordIdx = ((idx % WORKOUT_CHORDS.length) + WORKOUT_CHORDS.length) % WORKOUT_CHORDS.length;
  saveSetting('chordWorkout.chordIdx', cw.chordIdx);
  if (!keepDone) cw.done = {};
  cw.answerShown = false;
  stopWorkoutAudio();
  renderPrompt();
  renderTasks();
  updateAnswerVisibility();
  // Reset any prior feedback since it referred to the previous chord.
  const fbEl = document.getElementById('cw-rec-feedback');
  if (fbEl) { fbEl.innerHTML = ''; fbEl.className = 'cw-rec-feedback'; }
  cw.rec.notes = [];
  renderRecSeq();
  recStatus('Play the chord tones and I\u2019ll check which ones you hit.');
}

function newChord() {
  let idx = cw.chordIdx;
  if (WORKOUT_CHORDS.length > 1) {
    while (idx === cw.chordIdx) idx = Math.floor(Math.random() * WORKOUT_CHORDS.length);
  }
  setChord(idx);
}

// ---------------------------------------------------------------------------
// Init / teardown
// ---------------------------------------------------------------------------

function buildTuningList() {
  const container = document.getElementById('sl-cw-tuning');
  if (!container || container.children.length) return;
  Object.keys(TUNINGS).forEach(name => {
    const div = document.createElement('div');
    div.className = 'sl-item' + (name === cw.tuning ? ' active' : '');
    div.dataset.val = name;
    const strings = TUNINGS[name];
    div.innerHTML = `<span>${name}</span><span class="sl-item-sub">${strings.length}-string</span>`;
    div.onclick = () => {
      container.querySelectorAll('.sl-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      cw.tuning = name;
      saveSetting('chordWorkout.tuning', cw.tuning);
      if (cw.answerShown) renderAnswer();
    };
    container.appendChild(div);
  });
}

function initChordWorkout() {
  const promptEl = document.getElementById('cw-chord-name');
  if (!promptEl) return;

  const ctx = getContext();
  cw.root = ROOTS.includes(ctx.root) ? ctx.root : cw.root;
  cw.tuning = getSetting('chordWorkout.tuning', cw.tuning, Object.keys(TUNINGS));
  cw.chordIdx = Number(getSetting('chordWorkout.chordIdx', cw.chordIdx));
  if (!Number.isInteger(cw.chordIdx) || cw.chordIdx < 0 || cw.chordIdx >= WORKOUT_CHORDS.length) {
    cw.chordIdx = 0;
  }

  buildTuningList();

  if (!cw.built) {
    cw.built = true;
    const newBtn = document.getElementById('cw-new-chord');
    if (newBtn) newBtn.onclick = newChord;
    const recBtn = document.getElementById('cw-rec-toggle');
    if (recBtn) recBtn.onclick = toggleRecording;
    const answerBtn = document.getElementById('cw-toggle-answer');
    if (answerBtn) answerBtn.onclick = () => {
      cw.answerShown = !cw.answerShown;
      updateAnswerVisibility();
    };
  }

  if (!cw.subscribed) {
    cw.subscribed = true;
    subscribeContext(c => {
      if (!ROOTS.includes(c.root) || c.root === cw.root) return;
      cw.root = c.root;
      renderPrompt();
      if (cw.answerShown) renderAnswer();
      // A key change invalidates any prior recording feedback.
      const fbEl = document.getElementById('cw-rec-feedback');
      if (fbEl) { fbEl.innerHTML = ''; fbEl.className = 'cw-rec-feedback'; }
      cw.rec.notes = [];
      renderRecSeq();
    });
  }

  renderPrompt();
  renderTasks();
  updateAnswerVisibility();
}

function stopChordWorkout() {
  stopWorkoutAudio();
  if (cw.rec.running) stopRecording(false);
}

export { initChordWorkout, stopChordWorkout, cw };
