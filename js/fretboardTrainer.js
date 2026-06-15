import { parseNote, NOTE_NAMES_SHARP, ROOTS, TUNINGS } from './theory.js';
import { SCALES } from './scales.js';
import { getSetting, saveSetting } from './persistence.js';

const FB_FRETS = 15;
const FB_DOTS = [3,5,7,9,12,15];
const FB_DOUBLE_DOT = [12];
const FB_INT_NAMES = ['P1','m2','M2','m3','M3','P4','TT','P5','m6','M6','m7','M7'];

const FB_ADVANCE_MS = 1600;
const FB_FADE_START_MS = 1100;
const FB_SECTION_ID = 'sec-intervals';

const fb = {
  key: 'C', tuning: 'Standard',
  targetNote: null, targetMidi: null, targetInterval: null,
  selectedFret: null, selectedInterval: null,
  answered: false, right: 0, total: 0, streak: 0,
  _advTimer: null, _fadeTimer: null,
};

function fbClearTimers() {
  if (fb._advTimer) { clearTimeout(fb._advTimer); fb._advTimer = null; }
  if (fb._fadeTimer) { clearTimeout(fb._fadeTimer); fb._fadeTimer = null; }
}

function fbOpenMidis() {
  const strings = TUNINGS[fb.tuning];
  return strings.map(s => {
    const p = parseNote(s.note);
    return p ? 12 * (s.oct + 1) + p.semi : 0;
  });
}

function buildFretboard() {
  const board = document.getElementById('fb-board');
  const strings = TUNINGS[fb.tuning];
  const openMidis = fbOpenMidis();
  const cols = FB_FRETS + 2;
  board.style.gridTemplateColumns = `30px 40px repeat(${FB_FRETS}, 1fr)`;
  board.style.gridTemplateRows = `28px repeat(6, 36px)`;
  board.innerHTML = '';

  const hdr0 = document.createElement('div');
  hdr0.className = 'fb-header';
  board.appendChild(hdr0);
  const hdrNut = document.createElement('div');
  hdrNut.className = 'fb-header';
  hdrNut.textContent = '0';
  board.appendChild(hdrNut);
  for (let f = 1; f <= FB_FRETS; f++) {
    const hdr = document.createElement('div');
    hdr.className = 'fb-header';
    hdr.textContent = f;
    board.appendChild(hdr);
  }

  for (let s = 5; s >= 0; s--) {
    const label = document.createElement('div');
    label.className = 'fb-string-label';
    label.textContent = strings[s].note + strings[s].oct;
    board.appendChild(label);

    for (let f = 0; f <= FB_FRETS; f++) {
      const cell = document.createElement('div');
      const midi = openMidis[s] + f;
      const noteName = NOTE_NAMES_SHARP[midi % 12];
      const oct = Math.floor(midi / 12) - 1;
      cell.className = 'fb-cell' + (f === 0 ? ' nut' : '');
      if (f > 0 && FB_DOTS.includes(f) && s === 2) cell.classList.add('dot');
      cell.dataset.midi = midi;
      cell.dataset.string = s;
      cell.dataset.fret = f;
      cell.dataset.note = noteName + oct;
      cell.textContent = noteName + oct;

      cell.onclick = () => {
        if (fb.answered) return;
        board.querySelectorAll('.fb-cell').forEach(c => c.classList.remove('selected'));
        cell.classList.add('selected');
        fb.selectedFret = { midi, string: s, fret: f };
        checkFbAnswer();
      };
      board.appendChild(cell);
    }
  }
}

function buildIntervalButtons() {
  const container = document.getElementById('fb-intervals');
  container.innerHTML = '';
  const majorDef = SCALES['Major (Ionian)'];
  const scaleIntervals = majorDef.map(d => d[1]);
  scaleIntervals.forEach(semi => {
    const btn = document.createElement('button');
    btn.className = 'int-btn';
    btn.textContent = FB_INT_NAMES[semi];
    btn.dataset.semi = semi;
    btn.onclick = () => {
      if (fb.answered) return;
      container.querySelectorAll('.int-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      fb.selectedInterval = semi;
      checkFbAnswer();
    };
    container.appendChild(btn);
  });
}

function newFbQuestion() {
  fbClearTimers();
  fb.answered = false;
  fb.selectedFret = null;
  fb.selectedInterval = null;

  const board = document.getElementById('fb-board');
  board.querySelectorAll('.fb-cell').forEach(c => {
    c.classList.remove('selected', 'correct', 'wrong', 'reveal');
  });
  document.getElementById('fb-intervals').querySelectorAll('.int-btn').forEach(b => {
    b.classList.remove('selected', 'correct', 'wrong');
  });
  const feedback = document.getElementById('fb-feedback');
  feedback.className = 'fb-feedback';

  const rootP = parseNote(fb.key);
  if (!rootP) return;
  const rootSemi = rootP.semi;

  const majorDef = SCALES['Major (Ionian)'];
  const scaleIntervals = majorDef.map(d => d[1]);

  const pick_i = Math.floor(Math.random() * scaleIntervals.length);
  const interval = scaleIntervals[pick_i];
  const targetSemi = (rootSemi + interval) % 12;
  const targetName = NOTE_NAMES_SHARP[targetSemi];

  const openMidis = fbOpenMidis();
  const possibleMidis = [];
  for (let s = 0; s < 6; s++) {
    for (let f = 0; f <= FB_FRETS; f++) {
      const midi = openMidis[s] + f;
      if (midi % 12 === targetSemi) possibleMidis.push(midi);
    }
  }
  const chosenMidi = possibleMidis[Math.floor(Math.random() * possibleMidis.length)];

  fb.targetNote = targetName;
  fb.targetMidi = chosenMidi;
  fb.targetInterval = interval;

  const oct = Math.floor(chosenMidi / 12) - 1;
  document.getElementById('fb-question').innerHTML =
    `Key: <span class="highlight">${fb.key}</span> — Find <span class="highlight">${targetName}${oct}</span> on the fretboard and name its interval`;
}

function checkFbAnswer() {
  if (!fb.selectedFret || fb.selectedInterval === null || fb.answered) return;
  fb.answered = true;
  fb.total++;

  const fretCorrect = fb.selectedFret.midi === fb.targetMidi;
  const intCorrect = fb.selectedInterval === fb.targetInterval;
  const bothCorrect = fretCorrect && intCorrect;

  const board = document.getElementById('fb-board');
  const selectedCell = board.querySelector('.fb-cell.selected');
  if (selectedCell) {
    selectedCell.classList.remove('selected');
    selectedCell.classList.add(fretCorrect ? 'correct' : 'wrong');
  }

  if (!fretCorrect) {
    board.querySelectorAll('.fb-cell').forEach(c => {
      if (parseInt(c.dataset.midi) === fb.targetMidi) c.classList.add('reveal');
    });
  }

  const intContainer = document.getElementById('fb-intervals');
  const selectedBtn = intContainer.querySelector(`.int-btn[data-semi="${fb.selectedInterval}"]`);
  if (selectedBtn) {
    selectedBtn.classList.add(intCorrect ? 'correct' : 'wrong');
  }
  if (!intCorrect) {
    const correctBtn = intContainer.querySelector(`.int-btn[data-semi="${fb.targetInterval}"]`);
    if (correctBtn) correctBtn.classList.add('correct');
  }

  const feedback = document.getElementById('fb-feedback');
  if (bothCorrect) {
    fb.right++;
    fb.streak++;
    feedback.className = 'fb-feedback show correct';
    feedback.textContent = 'Correct!';
  } else {
    fb.streak = 0;
    const correctInt = FB_INT_NAMES[fb.targetInterval];
    let msg = 'Incorrect. ';
    if (!fretCorrect) msg += `The note was at a different position. `;
    if (!intCorrect) msg += `The interval is ${correctInt}.`;
    feedback.className = 'fb-feedback show wrong';
    feedback.textContent = msg;
  }

  document.getElementById('fb-right').textContent = fb.right;
  document.getElementById('fb-total').textContent = fb.total;
  document.getElementById('fb-streak').textContent = fb.streak;

  fb._fadeTimer = setTimeout(() => feedback.classList.add('fade-out'), FB_FADE_START_MS);
  fb._advTimer = setTimeout(() => {
    if (document.getElementById(FB_SECTION_ID).classList.contains('active')) newFbQuestion();
  }, FB_ADVANCE_MS);
}

function initFretboard() {
  const keyScroll = document.getElementById('sl-fb-key');
  const tuningScroll = document.getElementById('sl-fb-tuning');
  const tuningNames = Object.keys(TUNINGS);

  fb.key = getSetting('fb.key', fb.key, ROOTS);
  fb.tuning = getSetting('fb.tuning', fb.tuning, tuningNames);

  if (keyScroll.children.length) {
    buildFretboard();
    buildIntervalButtons();
    return;
  }

  ROOTS.forEach(r => {
    const div = document.createElement('div');
    div.className = 'sl-item' + (r === fb.key ? ' active' : '');
    div.dataset.val = r; div.textContent = r;
    div.onclick = () => {
      keyScroll.querySelectorAll('.sl-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      fb.key = r;
      saveSetting('fb.key', fb.key);
      fb.right = 0; fb.total = 0; fb.streak = 0;
      document.getElementById('fb-right').textContent = 0;
      document.getElementById('fb-total').textContent = 0;
      document.getElementById('fb-streak').textContent = 0;
      newFbQuestion();
    };
    keyScroll.appendChild(div);
  });

  tuningNames.forEach(name => {
    const div = document.createElement('div');
    div.className = 'sl-item' + (name === fb.tuning ? ' active' : '');
    div.dataset.val = name; div.textContent = name;
    div.onclick = () => {
      tuningScroll.querySelectorAll('.sl-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      fb.tuning = name;
      saveSetting('fb.tuning', fb.tuning);
      buildFretboard();
      if (fb.targetNote) newFbQuestion();
    };
    tuningScroll.appendChild(div);
  });

  buildFretboard();
  buildIntervalButtons();
}

window.newFbQuestion = newFbQuestion;

export { initFretboard, fb };
