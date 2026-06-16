import { pick } from './theory.js';
import { getSetting, saveSetting } from './persistence.js';
import { recordAttempt } from './stats.js';

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_INDEX = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

const ADVANCE_MS = 1400;
const FADE_START_MS = 900;

const CLEFS = {
  Treble: { glyph: '\uD834\uDD1E', refDV: 38, glyphSize: 5.4, anchorLine: 3, lineToBaseline: 0.3373 },
  Bass:   { glyph: '\uD834\uDD22', refDV: 26, glyphSize: 3.4, anchorLine: 1, lineToBaseline: 0.5 },
};

const TOP_Y = 62;
const LINE_GAP = 14;
const HALF_GAP = LINE_GAP / 2;
const NOTE_X = 210;
const SVG_W = 300;
const SVG_H = 230;
const MID_Y = TOP_Y + LINE_GAP * 2;

const sr = {
  clef: 'Treble',
  diff: 'easy',
  activeClef: 'Treble',
  answer: null,
  answered: false,
  right: 0,
  total: 0,
  streak: 0,
  _advTimer: null,
  _fadeTimer: null,
};

function letterFromDV(d) {
  return LETTERS[((d % 7) + 7) % 7];
}

function yForDV(d, refDV) {
  return TOP_Y + (refDV - d) * HALF_GAP;
}

function yForStaffLine(lineIndex) {
  return TOP_Y + lineIndex * LINE_GAP;
}

function yForClef(clef) {
  const fontSize = clef.glyphSize * LINE_GAP;
  return yForStaffLine(clef.anchorLine) + fontSize * clef.lineToBaseline;
}

function clearTimers() {
  if (sr._advTimer) { clearTimeout(sr._advTimer); sr._advTimer = null; }
  if (sr._fadeTimer) { clearTimeout(sr._fadeTimer); sr._fadeTimer = null; }
}

function rangeForDiff(refDV) {
  const bottomDV = refDV - 8;
  const topDV = refDV;
  if (sr.diff === 'easy') return [bottomDV, topDV];
  if (sr.diff === 'medium') return [bottomDV - 3, topDV + 3];
  return [bottomDV - 6, topDV + 6];
}

function buildStaffSVG(noteDV, clefName) {
  const clef = CLEFS[clefName];
  const refDV = clef.refDV;
  const bottomDV = refDV - 8;
  const lines = [];

  for (let i = 0; i < 5; i++) {
    const y = yForStaffLine(i);
    lines.push(`<line class="staff-line" x1="20" y1="${y}" x2="${SVG_W - 20}" y2="${y}"/>`);
  }

  const ledgers = [];
  if (noteDV > refDV) {
    for (let k = refDV + 2; k <= noteDV; k += 2) {
      const y = yForDV(k, refDV);
      ledgers.push(`<line class="ledger-line" x1="${NOTE_X - 16}" y1="${y}" x2="${NOTE_X + 16}" y2="${y}"/>`);
    }
  } else if (noteDV < bottomDV) {
    for (let k = bottomDV - 2; k >= noteDV; k -= 2) {
      const y = yForDV(k, refDV);
      ledgers.push(`<line class="ledger-line" x1="${NOTE_X - 16}" y1="${y}" x2="${NOTE_X + 16}" y2="${y}"/>`);
    }
  }

  const noteY = yForDV(noteDV, refDV);
  const stemUp = noteY > MID_Y;
  const stemX = stemUp ? NOTE_X + 8.5 : NOTE_X - 8.5;
  const stemY2 = stemUp ? noteY - LINE_GAP * 3 : noteY + LINE_GAP * 3;
  const stem = `<line class="note-stem" x1="${stemX}" y1="${noteY}" x2="${stemX}" y2="${stemY2}"/>`;
  const head = `<g transform="rotate(-20 ${NOTE_X} ${noteY})"><ellipse class="note-head" cx="${NOTE_X}" cy="${noteY}" rx="9" ry="6.6"/></g>`;

  const glyphY = yForClef(clef);
  const glyph = `<text class="clef-glyph" x="26" y="${glyphY}" font-size="${clef.glyphSize * LINE_GAP}">${clef.glyph}</text>`;

  return `<svg class="sr-staff" viewBox="0 0 ${SVG_W} ${SVG_H}" width="${SVG_W}" preserveAspectRatio="xMidYMid meet">
    ${lines.join('')}
    ${glyph}
    ${ledgers.join('')}
    ${stem}
    ${head}
  </svg>`;
}

function newSightQ() {
  clearTimers();
  sr.answered = false;
  sr.answer = null;

  const clefName = sr.clef === 'both' ? pick(['Treble', 'Bass']) : sr.clef;
  sr.activeClef = clefName;
  const refDV = CLEFS[clefName].refDV;
  const [lo, hi] = rangeForDiff(refDV);
  const noteDV = lo + Math.floor(Math.random() * (hi - lo + 1));
  sr.answer = letterFromDV(noteDV);

  document.getElementById('sr-staff-wrap').innerHTML = buildStaffSVG(noteDV, clefName);
  document.getElementById('sr-question').innerHTML =
    `<span class="highlight">${clefName}</span> clef`;

  const fb = document.getElementById('sr-feedback');
  fb.className = 'fb-feedback';
  fb.textContent = '';

  document.getElementById('sr-answers').querySelectorAll('.letter-btn').forEach(b => {
    b.classList.remove('correct', 'wrong');
  });
}

function checkSightAnswer(letter, btn) {
  if (sr.answered || sr.answer === null) return;
  sr.answered = true;
  sr.total++;

  const correct = letter === sr.answer;
  recordAttempt('sightreading', correct);
  const fb = document.getElementById('sr-feedback');

  btn.classList.add(correct ? 'correct' : 'wrong');
  if (!correct) {
    document.getElementById('sr-answers').querySelectorAll('.letter-btn').forEach(b => {
      if (b.dataset.letter === sr.answer) b.classList.add('correct');
    });
  }

  if (correct) {
    sr.right++;
    sr.streak++;
    fb.className = 'fb-feedback show correct';
    fb.textContent = '✓';
  } else {
    sr.streak = 0;
    fb.className = 'fb-feedback show wrong';
    fb.textContent = `Expected: ${sr.answer}`;
  }

  document.getElementById('sr-right').textContent = sr.right;
  document.getElementById('sr-total').textContent = sr.total;
  document.getElementById('sr-streak').textContent = sr.streak;

  sr._fadeTimer = setTimeout(() => fb.classList.add('fade-out'), FADE_START_MS);
  sr._advTimer = setTimeout(() => {
    if (document.getElementById('sec-sightreading').classList.contains('active')) {
      newSightQ();
    }
  }, ADVANCE_MS);
}

function buildAnswerButtons() {
  const c = document.getElementById('sr-answers');
  c.innerHTML = '';
  LETTERS.forEach(letter => {
    const btn = document.createElement('button');
    btn.className = 'letter-btn';
    btn.textContent = letter;
    btn.dataset.letter = letter;
    btn.onclick = () => checkSightAnswer(letter, btn);
    c.appendChild(btn);
  });
}

function initSightReading() {
  const clefScroll = document.getElementById('sl-sr-clef');
  const diffScroll = document.getElementById('sl-sr-diff');
  const clefOptions = ['Treble', 'Bass', 'both'];
  const diffOptions = ['easy', 'medium', 'hard'];

  sr.clef = getSetting('sr.clef', sr.clef, clefOptions);
  sr.diff = getSetting('sr.diff', sr.diff, diffOptions);

  if (clefScroll.children.length) {
    if (!sr.answer) newSightQ();
    return;
  }

  clefOptions.map(val => ({
    val,
    label: val === 'both' ? 'Random clef' : val,
  })).forEach(({ val, label }) => {
    const div = document.createElement('div');
    div.className = 'sl-item' + (val === sr.clef ? ' active' : '');
    div.dataset.val = val;
    div.textContent = label;
    div.onclick = () => {
      clefScroll.querySelectorAll('.sl-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      sr.clef = val;
      saveSetting('sr.clef', sr.clef);
      resetSightScore();
      newSightQ();
    };
    clefScroll.appendChild(div);
  });

  [
    { val: 'easy', label: 'On staff' },
    { val: 'medium', label: '±1 ledger' },
    { val: 'hard', label: 'Wide range' },
  ].forEach(({ val, label }) => {
    const div = document.createElement('div');
    div.className = 'sl-item' + (val === sr.diff ? ' active' : '');
    div.dataset.val = val;
    div.textContent = label;
    div.onclick = () => {
      diffScroll.querySelectorAll('.sl-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      sr.diff = val;
      saveSetting('sr.diff', sr.diff);
      newSightQ();
    };
    diffScroll.appendChild(div);
  });

  buildAnswerButtons();
  newSightQ();
}

function resetSightScore() {
  sr.right = 0; sr.total = 0; sr.streak = 0;
  document.getElementById('sr-right').textContent = 0;
  document.getElementById('sr-total').textContent = 0;
  document.getElementById('sr-streak').textContent = 0;
}

window.newSightQ = newSightQ;
window.resetSightScore = resetSightScore;

export { initSightReading, sr, clearTimers as stopSightReading };
