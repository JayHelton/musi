import { parseNote, ROOTS_RAND, pick } from './theory.js';
import { getScaleNotes, scaleStepPattern } from './scales.js';
import { saveSetting } from './persistence.js';
import { recordAttempt } from './stats.js';

export const S = {
  sq: {score:0,total:0,streak:0,ans:null,name:'',hint:''},
  iq: {score:0,total:0,streak:0,ans:null,diff:'easy',name:''},
  kb: {wave:'sine',vol:0.3,oct:3,span:2,drones:{}},
};

const ADVANCE_MS = 1400;
const FADE_START_MS = 900;
let sqTimers = { adv: null, fade: null };
let iqTimers = { adv: null, fade: null };

function clearQuizTimers(t) {
  if (t.adv) { clearTimeout(t.adv); t.adv = null; }
  if (t.fade) { clearTimeout(t.fade); t.fade = null; }
}

function scheduleAdvance(t, feedbackEl, nextFn) {
  clearQuizTimers(t);
  t.fade = setTimeout(() => feedbackEl.classList.add('fade-out'), FADE_START_MS);
  t.adv = setTimeout(nextFn, ADVANCE_MS);
}

// One button per pitch class. Accidental pitch classes show both enharmonic
// spellings (e.g. C\u266F/D\u266D) because they are the same note. `value` is a
// parseable canonical spelling used for pitch-class comparison and audio.
export const CHROMATIC_BUTTONS = [
  { label: 'C',           value: 'C'  },
  { label: 'C\u266F/D\u266D', value: 'C#' },
  { label: 'D',           value: 'D'  },
  { label: 'D\u266F/E\u266D', value: 'D#' },
  { label: 'E',           value: 'E'  },
  { label: 'F',           value: 'F'  },
  { label: 'F\u266F/G\u266D', value: 'F#' },
  { label: 'G',           value: 'G'  },
  { label: 'G\u266F/A\u266D', value: 'G#' },
  { label: 'A',           value: 'A'  },
  { label: 'A\u266F/B\u266D', value: 'A#' },
  { label: 'B',           value: 'B'  },
];
const noteInput = { scale: [] };

export const SCALE_DRILL_MODES = [
  'Major (Ionian)',
  'Dorian',
  'Phrygian',
  'Lydian',
  'Mixolydian',
  'Natural Minor (Aeolian)',
  'Locrian',
];

const scaleDrill = {
  modeIndex: -1,
  lastRoot: null,
};

export function pickScaleDrillRoot(previousRoot, roots = ROOTS_RAND) {
  if (roots.length <= 1) return roots[0] || '';
  return pick(roots.filter(root => root !== previousRoot));
}

export function nextScaleDrillPrompt() {
  scaleDrill.modeIndex = (scaleDrill.modeIndex + 1) % SCALE_DRILL_MODES.length;
  scaleDrill.lastRoot = pickScaleDrillRoot(scaleDrill.lastRoot);
  return {
    root: scaleDrill.lastRoot,
    scaleName: SCALE_DRILL_MODES[scaleDrill.modeIndex],
  };
}

export function buildNoteButtons(containerId, quiz) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  CHROMATIC_BUTTONS.forEach(({ label, value }) => {
    const btn = document.createElement('button');
    btn.className = 'letter-btn' + (value.length > 1 ? ' accidental' : '');
    btn.textContent = label;
    btn.onclick = () => {
      if (quiz === 'scale') {
        noteInput.scale.push({ value, label });
        renderScaleDisplay();
      } else {
        submitIntervalNote(value);
      }
    };
    container.appendChild(btn);
  });
}

export function renderScaleDisplay() {
  const d = document.getElementById('sq-display');
  if (noteInput.scale.length === 0) {
    d.innerHTML = '';
    d.classList.add('empty');
  } else {
    d.classList.remove('empty');
    d.innerHTML = noteInput.scale.map(n =>
      `<span class="note-chip">${n.label}</span>`
    ).join('');
  }
}

export function noteUndo() { noteInput.scale.pop(); renderScaleDisplay(); }
export function noteClear() { noteInput.scale = []; renderScaleDisplay(); }

export function submitIntervalNote(note) {
  if (!S.iq.ans) return;
  const fb = document.getElementById('iq-feedback');
  const userPc = parseNote(note)?.semi;
  const ansPc = parseNote(S.iq.ans)?.semi;
  const correct = userPc != null && userPc === ansPc;
  S.iq.total++;
  recordAttempt('interval', correct);
  if (correct) {
    S.iq.score++; S.iq.streak++;
    fb.className = 'feedback correct';
    fb.textContent = '✓';
  } else {
    S.iq.streak = 0;
    fb.className = 'feedback wrong';
    fb.textContent = `Expected: ${S.iq.ans}`;
  }
  document.getElementById('iq-score').textContent = `${S.iq.score} / ${S.iq.total}`;
  document.getElementById('iq-streak').textContent = S.iq.streak;
  S.iq.ans = null;
  scheduleAdvance(iqTimers, fb, () => { if (window.nextIntQ) window.nextIntQ(); });
}

export function getSelected(containerId) {
  const el = document.querySelector(`#${containerId} .sl-item.active`);
  return el ? el.dataset.val : 'random';
}
export function selectItem(containerId, val) {
  document.querySelectorAll(`#${containerId} .sl-item`).forEach(el => {
    el.classList.toggle('active', el.dataset.val === val);
  });
  saveSetting(containerId, val);
}

export function clearIntQTimers() { clearQuizTimers(iqTimers); }

export function newScaleQ() {
  clearQuizTimers(sqTimers);
  const { root, scaleName } = nextScaleDrillPrompt();

  const notes = getScaleNotes(root, scaleName);
  if (!notes || notes.some(n => n === null)) {
    document.getElementById('sq-question').textContent =
      `${root} ${scaleName} can't be spelled here.`;
    S.sq.ans = null;
    return;
  }

  S.sq.ans = notes;
  S.sq.name = root + ' ' + scaleName;
  S.sq.hint = scaleStepPattern(scaleName);

  document.getElementById('sq-question').textContent =
    `${root} ${scaleName} — ${notes.length} notes`;
  noteInput.scale = [];
  renderScaleDisplay();
  document.getElementById('sq-feedback').className = 'feedback';
  document.getElementById('sq-feedback').textContent = '';
  document.getElementById('sq-hint-bar').innerHTML =
    '<button onclick="showScaleHint()">Pattern</button>';
}

export function showScaleHint() {
  document.getElementById('sq-hint-bar').innerHTML =
    `<span class="hint-text">${S.sq.hint}</span>`;
}

export function checkScaleA() {
  if (!S.sq.ans) return;
  // Compare by pitch class so enharmonic spellings (C\u266F vs D\u266D) match.
  const userPcs = noteInput.scale.map(n => parseNote(n.value)?.semi);
  const expectedPcs = S.sq.ans.map(n => parseNote(n)?.semi);
  const fb = document.getElementById('sq-feedback');

  const correct = userPcs.length === expectedPcs.length &&
    userPcs.every((p,i) => p != null && p === expectedPcs[i]);

  S.sq.total++;
  recordAttempt('scale', correct);
  if (correct) {
    S.sq.score++;
    S.sq.streak++;
    fb.className = 'feedback correct';
    fb.textContent = '✓';
  } else {
    S.sq.streak = 0;
    fb.className = 'feedback wrong';
    fb.textContent = `Expected: ${S.sq.ans.join('  ')}`;
  }
  document.getElementById('sq-score').textContent = `${S.sq.score} / ${S.sq.total}`;
  document.getElementById('sq-streak').textContent = S.sq.streak;
  S.sq.ans = null;
  scheduleAdvance(sqTimers, fb, nextScaleQ);
}

function nextScaleQ() {
  newScaleQ();
}

export function resetScore(which) {
  if (which === 'scale') {
    S.sq.score = S.sq.total = S.sq.streak = 0;
    document.getElementById('sq-score').textContent = '0 / 0';
    document.getElementById('sq-streak').textContent = '0';
  } else {
    S.iq.score = S.iq.total = S.iq.streak = 0;
    document.getElementById('iq-score').textContent = '0 / 0';
    document.getElementById('iq-streak').textContent = '0';
  }
}

window.newScaleQ = newScaleQ;
window.showScaleHint = showScaleHint;
window.checkScaleA = checkScaleA;
window.noteUndo = noteUndo;
window.noteClear = noteClear;
window.resetScore = resetScore;
