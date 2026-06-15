import { getSelected, clearIntQTimers } from './scaleQuiz.js';
import { pick, normNote } from './theory.js';
import { getIntervalPool, computeInterval } from './intervals.js';
import { S } from './scaleQuiz.js';
import { getContext, subscribeContext } from './musicalContext.js';

export function newIntQ() {
  clearIntQTimers();
  // Root is inherited from the shared musical context; only difficulty is a
  // per-drill control.
  const root = getContext().root;
  const selDiff = getSelected('sl-int-diff');
  S.iq.diff = selDiff === 'random' ? 'easy' : selDiff;
  const pool = getIntervalPool(S.iq.diff);
  let attempts = 0, interval, answer;
  do {
    interval = pick(pool);
    answer = computeInterval(root, interval);
    attempts++;
  } while ((!answer || !/^[A-G](#{1,2}|b{1,2})?$/.test(answer)) && attempts < 200);

  if (!answer) return;
  S.iq.ans = normNote(answer);
  S.iq.name = `${interval[0]} above ${root}`;

  document.getElementById('iq-question').textContent =
    `${interval[0]} above ${root}`;
  document.getElementById('iq-feedback').className = 'feedback';
  document.getElementById('iq-feedback').textContent = '';
}

// Refresh the live question when the shared key changes while the Intervals
// drill is on screen.
subscribeContext(() => {
  if (document.getElementById('sec-intervals')?.classList.contains('active')) {
    newIntQ();
  }
});

window.newIntQ = newIntQ;
