import { parseNote, NOTE_NAMES_SHARP, TUNINGS, INTERVAL_LABELS } from './theory.js';
import { SCALES } from './scales.js';
import { getSetting, saveSetting } from './persistence.js';
import { getContext, subscribeContext, advanceContext } from './musicalContext.js';

const FB_DOTS = [3,5,7,9,12,15];

const FB_ADVANCE_MS = 1600;
const FB_FADE_START_MS = 1100;
const FB_MODES = [
  { val: 'interval', label: 'Interval' },
  { val: 'note', label: 'Note' },
  { val: 'chordTone', label: 'Chord tones' },
];
const CHORD_ROLE_LABELS = ['R', '3', '5', '7'];

const fb = {
  key: 'C',
  tuning: 'Standard',
  scale: 'Major (Ionian)',
  mode: 'interval',
  fretStart: 0,
  fretEnd: 15,
  showLabels: false,
  showIntervals: false,
  targetNote: null, targetMidi: null, targetInterval: null,
  targetRole: null,
  selectedFret: null, selectedInterval: null,
  answered: false, right: 0, total: 0, streak: 0,
  _advTimer: null, _fadeTimer: null,
};

let fbBuilt = false;
let fbContextSubscribed = false;

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

function activeFretRange() {
  const start = Math.max(0, Math.min(24, Number(fb.fretStart) || 0));
  const end = Math.max(start + 1, Math.min(24, Number(fb.fretEnd) || 15));
  fb.fretStart = start;
  fb.fretEnd = end;
  return { start, end, count: end - start + 1 };
}

function scaleIntervals() {
  const def = SCALES[fb.scale] || SCALES['Major (Ionian)'];
  return def.map(d => d[1]);
}

function chordToneIntervals() {
  const ints = scaleIntervals();
  const roles = [0, 2, 4, 6].filter(i => ints[i] !== undefined);
  return roles.map((scaleIdx, i) => ({
    semi: ints[scaleIdx] % 12,
    role: CHORD_ROLE_LABELS[i],
  }));
}

function intervalLabel(semi) {
  return INTERVAL_LABELS[((semi % 12) + 12) % 12] || `${semi} st`;
}

function buildFretboard() {
  const board = document.getElementById('fb-board');
  const strings = TUNINGS[fb.tuning];
  const openMidis = fbOpenMidis();
  const rootP = parseNote(fb.key);
  const rootSemi = rootP ? rootP.semi : 0;
  const scaleSemis = new Set(scaleIntervals().map(semi => (rootSemi + semi) % 12));
  const { start, end, count } = activeFretRange();
  board.style.gridTemplateColumns = `34px repeat(${count}, minmax(38px, 1fr))`;
  board.style.gridTemplateRows = `24px repeat(${strings.length}, 32px)`;
  board.innerHTML = '';

  const hdr0 = document.createElement('div');
  hdr0.className = 'fb-header';
  board.appendChild(hdr0);
  for (let f = start; f <= end; f++) {
    const hdr = document.createElement('div');
    hdr.className = 'fb-header';
    hdr.textContent = f;
    board.appendChild(hdr);
  }

  const middleString = Math.floor(strings.length / 2);
  for (let s = strings.length - 1; s >= 0; s--) {
    const label = document.createElement('div');
    label.className = 'fb-string-label';
    label.textContent = strings[s].note + strings[s].oct;
    board.appendChild(label);

    for (let f = start; f <= end; f++) {
      const cell = document.createElement('div');
      const midi = openMidis[s] + f;
      const noteName = NOTE_NAMES_SHARP[midi % 12];
      const oct = Math.floor(midi / 12) - 1;
      cell.className = 'fb-cell' + (f === 0 ? ' nut' : '');
      const interval = (midi % 12 - rootSemi + 12) % 12;
      if (scaleSemis.has(midi % 12)) cell.classList.add('in-scale');
      if (fb.showLabels || fb.showIntervals) cell.classList.add('show-label');
      if (f > 0 && FB_DOTS.includes(f) && s === middleString) cell.classList.add('dot');
      cell.dataset.midi = midi;
      cell.dataset.string = s;
      cell.dataset.fret = f;
      cell.dataset.note = noteName + oct;
      cell.dataset.interval = interval;
      cell.textContent = fb.showIntervals ? intervalLabel(interval) : noteName + oct;

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
  const label = document.getElementById('fb-answer-label');
  container.innerHTML = '';
  if (fb.mode === 'note') {
    container.hidden = true;
    label.textContent = 'Find the target note';
    return;
  }
  container.hidden = false;
  const intervals = fb.mode === 'chordTone'
    ? chordToneIntervals()
    : scaleIntervals().map(semi => ({ semi, role: intervalLabel(semi) }));
  label.textContent = fb.mode === 'chordTone' ? 'Chord tone role' : 'Interval from root';
  intervals.forEach(({ semi, role }) => {
    const btn = document.createElement('button');
    btn.className = 'int-btn';
    btn.textContent = role || intervalLabel(semi);
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

  const choices = fb.mode === 'chordTone'
    ? chordToneIntervals()
    : scaleIntervals().map(semi => ({ semi, role: intervalLabel(semi) }));
  const choice = choices[Math.floor(Math.random() * choices.length)];
  const interval = choice.semi;
  const targetSemi = (rootSemi + interval) % 12;
  const targetName = NOTE_NAMES_SHARP[targetSemi];

  const openMidis = fbOpenMidis();
  const possibleMidis = [];
  const strings = TUNINGS[fb.tuning];
  const { start, end } = activeFretRange();
  for (let s = 0; s < strings.length; s++) {
    for (let f = start; f <= end; f++) {
      const midi = openMidis[s] + f;
      if (midi % 12 === targetSemi) possibleMidis.push(midi);
    }
  }
  if (!possibleMidis.length) return;
  const chosenMidi = possibleMidis[Math.floor(Math.random() * possibleMidis.length)];

  fb.targetNote = targetName;
  fb.targetMidi = chosenMidi;
  fb.targetInterval = interval;
  fb.targetRole = choice.role || intervalLabel(interval);

  const oct = Math.floor(chosenMidi / 12) - 1;
  const modeLabel = fb.mode === 'note' ? 'locate' : fb.mode === 'chordTone' ? `find ${fb.targetRole}` : 'locate + name';
  document.getElementById('fb-question').innerHTML =
    `<span class="highlight">${fb.key}</span> · ${fb.scale} · ${modeLabel} <span class="highlight">${targetName}${oct}</span>`;
}

function checkFbAnswer() {
  if (!fb.selectedFret || fb.answered) return;
  if (fb.mode !== 'note' && fb.selectedInterval === null) return;
  fb.answered = true;
  fb.total++;

  const fretCorrect = fb.selectedFret.midi === fb.targetMidi;
  const intCorrect = fb.mode === 'note' || fb.selectedInterval === fb.targetInterval;
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
  if (fb.mode !== 'note') {
    const selectedBtn = intContainer.querySelector(`.int-btn[data-semi="${fb.selectedInterval}"]`);
    if (selectedBtn) {
      selectedBtn.classList.add(intCorrect ? 'correct' : 'wrong');
    }
    if (!intCorrect) {
      const correctBtn = intContainer.querySelector(`.int-btn[data-semi="${fb.targetInterval}"]`);
      if (correctBtn) correctBtn.classList.add('correct');
    }
  }

  const feedback = document.getElementById('fb-feedback');
  if (bothCorrect) {
    fb.right++;
    fb.streak++;
    feedback.className = 'fb-feedback show correct';
    feedback.textContent = '✓';
  } else {
    fb.streak = 0;
    const correctInt = fb.mode === 'chordTone' ? fb.targetRole : intervalLabel(fb.targetInterval);
    let msg = '';
    if (!fretCorrect) msg += 'Wrong position. ';
    if (!intCorrect) msg += `Expected: ${correctInt}.`;
    feedback.className = 'fb-feedback show wrong';
    feedback.textContent = msg;
  }

  document.getElementById('fb-right').textContent = fb.right;
  document.getElementById('fb-total').textContent = fb.total;
  document.getElementById('fb-streak').textContent = fb.streak;

  fb._fadeTimer = setTimeout(() => feedback.classList.add('fade-out'), FB_FADE_START_MS);
  fb._advTimer = setTimeout(() => {
    if (document.getElementById('sec-fretboard').classList.contains('active')) {
      advanceContext();
      newFbQuestion();
    }
  }, FB_ADVANCE_MS);
}

function updateFbScore() {
  document.getElementById('fb-right').textContent = fb.right;
  document.getElementById('fb-total').textContent = fb.total;
  document.getElementById('fb-streak').textContent = fb.streak;
}

function resetFbScore() {
  fb.right = 0;
  fb.total = 0;
  fb.streak = 0;
  updateFbScore();
}

function buildChoiceList(container, items, active, onPick) {
  items.forEach(({ type, val, label }) => {
    if (type === 'label') {
      const group = document.createElement('div');
      group.className = 'sl-group-label';
      group.textContent = label;
      container.appendChild(group);
      return;
    }
    const div = document.createElement('div');
    div.className = 'sl-item' + (val === active ? ' active' : '');
    div.dataset.val = val;
    div.textContent = label;
    div.onclick = () => {
      container.querySelectorAll('.sl-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      onPick(val);
    };
    container.appendChild(div);
  });
}

function wireWorkbenchControls() {
  const start = document.getElementById('fb-fret-start');
  const end = document.getElementById('fb-fret-end');
  const labels = document.getElementById('fb-show-labels');
  const intervals = document.getElementById('fb-show-intervals');
  if (!start || start.dataset.wired) return;
  start.dataset.wired = '1';
  start.value = fb.fretStart;
  end.value = fb.fretEnd;
  labels.checked = fb.showLabels;
  intervals.checked = fb.showIntervals;

  const updateRange = () => {
    fb.fretStart = Number(start.value);
    fb.fretEnd = Number(end.value);
    activeFretRange();
    start.value = fb.fretStart;
    end.value = fb.fretEnd;
    saveSetting('fb.fretStart', fb.fretStart);
    saveSetting('fb.fretEnd', fb.fretEnd);
    buildFretboard();
    if (fb.targetNote) newFbQuestion();
  };
  start.onchange = updateRange;
  end.onchange = updateRange;
  labels.onchange = () => {
    fb.showLabels = labels.checked;
    saveSetting('fb.showLabels', fb.showLabels);
    buildFretboard();
  };
  intervals.onchange = () => {
    fb.showIntervals = intervals.checked;
    saveSetting('fb.showIntervals', fb.showIntervals);
    buildFretboard();
  };
}

function initFretboard() {
  const tuningScroll = document.getElementById('sl-fb-tuning');
  const modeScroll = document.getElementById('sl-fb-mode');
  const tuningNames = Object.keys(TUNINGS);

  // Key and scale are inherited from the shared musical context instead of
  // per-drill selectors, so the fretboard always quizzes the player's current
  // key and mode.
  const ctx = getContext();
  fb.key = ctx.root;
  fb.scale = ctx.scale;
  fb.tuning = getSetting('fb.tuning', fb.tuning, tuningNames);
  fb.mode = getSetting('fb.mode', fb.mode, FB_MODES.map(o => o.val));
  fb.fretStart = Number(getSetting('fb.fretStart', fb.fretStart));
  fb.fretEnd = Number(getSetting('fb.fretEnd', fb.fretEnd));
  fb.showLabels = getSetting('fb.showLabels', fb.showLabels, [true, false]);
  fb.showIntervals = getSetting('fb.showIntervals', fb.showIntervals, [true, false]);
  wireWorkbenchControls();

  if (!fbContextSubscribed) {
    fbContextSubscribed = true;
    subscribeContext((c, source) => {
      if (source === 'advance') {
        fb.key = c.root;
        fb.scale = c.scale;
        return;
      }
      if (c.root === fb.key && c.scale === fb.scale) return;
      fb.key = c.root;
      fb.scale = c.scale;
      if (!fbBuilt) return;
      fb.right = 0; fb.total = 0; fb.streak = 0;
      updateFbScore();
      buildFretboard();
      buildIntervalButtons();
      if (document.getElementById('sec-fretboard')?.classList.contains('active')) {
        newFbQuestion();
      }
    });
  }

  if (tuningScroll.children.length) {
    buildFretboard();
    buildIntervalButtons();
    return;
  }
  fbBuilt = true;

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

  buildChoiceList(modeScroll, FB_MODES, fb.mode, val => {
    fb.mode = val;
    saveSetting('fb.mode', val);
    buildIntervalButtons();
    if (fb.targetNote) newFbQuestion();
  });

  buildFretboard();
  buildIntervalButtons();
}

window.newFbQuestion = newFbQuestion;
window.resetFbScore = resetFbScore;

export { initFretboard, fb };
