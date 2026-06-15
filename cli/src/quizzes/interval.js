import { getIntervalPool, computeInterval, ROOTS, ROOTS_RAND, normNote, pick } from '../shared.js';
import { c, print, banner, scoreLine, correctMsg, wrongMsg, askAnswer, choose, QUIT } from '../ui.js';

export async function runIntervalQuiz(opts = {}) {
  banner('Interval Quiz', 'Name the note a given interval above the root.');

  let diff = opts.diff;
  let root = opts.root;

  if (!diff) {
    diff = await choose('Difficulty:', [
      { label: 'Easy (common intervals)', value: 'easy' },
      { label: 'Medium (+ augmented/diminished)', value: 'medium' },
      { label: 'Hard (+ exotic intervals)', value: 'hard' },
    ]);
  }
  if (!root) {
    root = await choose('Root note:', [
      { label: 'Random each question', value: 'random' },
      ...ROOTS.map((r) => ({ label: r, value: r })),
    ]);
  }

  const pool = getIntervalPool(diff);

  print();
  print(c.gray('Type the answer note (e.g. "F#", "Bb", "C").'));
  print(c.gray('Commands: ') + c.cyan('s') + c.gray(' reveal · ') + c.cyan('q') + c.gray(' quit'));

  const stats = { right: 0, total: 0, streak: 0 };

  while (true) {
    let qRoot, interval, answer;
    let attempts = 0;
    do {
      qRoot = root === 'random' ? pick(ROOTS_RAND) : root;
      interval = pick(pool);
      answer = computeInterval(qRoot, interval);
      attempts++;
    } while ((!answer) && attempts < 200);
    if (!answer) continue;

    print();
    print(c.bold(`What note is a ${c.accent(interval[0])} above ${c.accent(qRoot)}?`));

    const reveal = () => print(c.yellow('  Answer: ') + c.gray(answer));
    const raw = await askAnswer(c.cyan('› '), { onReveal: reveal });
    if (raw === QUIT) break;

    const correct = normNote(raw) === normNote(answer);
    stats.total++;
    if (correct) {
      stats.right++;
      stats.streak++;
      print(correctMsg());
    } else {
      stats.streak = 0;
      print(wrongMsg(`A ${interval[0]} above ${qRoot} is ${answer}.`));
    }
    print(scoreLine(stats));
  }

  print();
  print(c.gray('Interval quiz finished. ') + scoreLine(stats));
  return stats;
}
