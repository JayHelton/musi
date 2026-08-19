// Shared state and helpers for the Intervals drill and the keyboard.

import { parseNote } from './theory.js';
import { saveSetting } from './persistence.js';
import { recordAttempt } from './stats.js';

export const S = {
  iq: { score: 0, total: 0, streak: 0, ans: null, diff: 'easy', name: '' },
  kb: { wave: 'sine', vol: 0.3, oct: 3, span: 2, drones: {} },
};

const ADVANCE_MS = 1400;
const FADE_START_MS = 900;
const iqTimers = { adv: null, fade: null };

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
// spellings (e.g. C♯/D♭) because they are the same note. `value` is a
// parseable canonical spelling used for pitch-class comparison and audio.
export const CHROMATIC_BUTTONS = [
  { label: 'C',           value: 'C'  },
  { label: 'C♯/D♭', value: 'C#' },
  { label: 'D',           value: 'D'  },
  { label: 'D♯/E♭', value: 'D#' },
  { label: 'E',           value: 'E'  },
  { label: 'F',           value: 'F'  },
  { label: 'F♯/G♭', value: 'F#' },
  { label: 'G',           value: 'G'  },
  { label: 'G♯/A♭', value: 'G#' },
  { label: 'A',           value: 'A'  },
  { label: 'A♯/B♭', value: 'A#' },
  { label: 'B',           value: 'B'  },
];

export function buildNoteButtons(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  CHROMATIC_BUTTONS.forEach(({ label, value }) => {
    const btn = document.createElement('button');
    btn.className = 'letter-btn' + (value.length > 1 ? ' accidental' : '');
    btn.textContent = label;
    btn.onclick = () => submitIntervalNote(value);
    container.appendChild(btn);
  });
}

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

export function resetIntervalScore() {
  S.iq.score = S.iq.total = S.iq.streak = 0;
  document.getElementById('iq-score').textContent = '0 / 0';
  document.getElementById('iq-streak').textContent = '0';
}

window.resetScore = resetIntervalScore;
