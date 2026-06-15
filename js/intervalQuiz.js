import { getSelected, clearIntQTimers } from './scaleQuiz.js';
import { pick, ROOTS_RAND, normNote } from './theory.js';
import { getIntervalPool, computeInterval } from './intervals.js';
import { S } from './scaleQuiz.js';

export function newIntQ() {
  clearIntQTimers();
  const selRoot = getSelected('sl-int-root');
  const selDiff = getSelected('sl-int-diff');
  S.iq.diff = selDiff === 'random' ? 'easy' : selDiff;
  const pool = getIntervalPool(S.iq.diff);
  let attempts = 0, root, interval, answer;
  do {
    root = selRoot === 'random' ? pick(ROOTS_RAND) : selRoot;
    interval = pick(pool);
    answer = computeInterval(root, interval);
    attempts++;
  } while ((!answer || !/^[A-G](#{1,2}|b{1,2})?$/.test(answer)) && attempts < 200);

  if (!answer) return;
  S.iq.ans = normNote(answer);
  S.iq.name = `${interval[0]} above ${root}`;

  document.getElementById('iq-question').textContent =
    `What note is a ${interval[0]} above ${root}?`;
  document.getElementById('iq-feedback').className = 'feedback';
  document.getElementById('iq-feedback').textContent = '';
}

window.newIntQ = newIntQ;
