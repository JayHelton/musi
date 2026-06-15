import { SCALES, getScaleNotes, scaleStepPattern, ROOTS, ROOTS_RAND, normNote, pick } from '../shared.js';
import { c, print, banner, scoreLine, correctMsg, wrongMsg, askAnswer, choose, QUIT } from '../ui.js';

function parseUserNotes(raw) {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function runScaleQuiz(opts = {}) {
  banner('Scale Quiz', 'Spell every note of the named scale, in order.');

  let scaleType = opts.type;
  let root = opts.root;

  if (!scaleType) {
    scaleType = await choose('Scale type:', [
      { label: 'Random each question', value: 'random' },
      ...Object.keys(SCALES).map((n) => ({ label: n, value: n })),
    ]);
  }
  if (!root) {
    root = await choose('Root note:', [
      { label: 'Random each question', value: 'random' },
      ...ROOTS.map((r) => ({ label: r, value: r })),
    ]);
  }

  print();
  print(c.gray('Type the notes separated by spaces (e.g. "C D E F G A B").'));
  print(c.gray('Commands: ') + c.cyan('h') + c.gray(' hint · ') + c.cyan('s') + c.gray(' reveal · ') + c.cyan('q') + c.gray(' quit'));

  const stats = { right: 0, total: 0, streak: 0 };

  while (true) {
    const scaleName = scaleType === 'random' ? pick(Object.keys(SCALES)) : scaleType;
    const qRoot = root === 'random' ? pick(ROOTS_RAND) : root;
    const answer = getScaleNotes(qRoot, scaleName);
    if (!answer || answer.some((n) => n === null)) continue;

    print();
    print(c.bold(`Spell the ${c.accent(qRoot + ' ' + scaleName)} scale.`));

    const revealHint = () => print(c.yellow('  Hint: ') + c.gray('step pattern ' + scaleStepPattern(scaleName)));
    const reveal = () => print(c.yellow('  Answer: ') + c.gray(answer.join('  ')));

    const raw = await askAnswer(c.cyan('› '), { onHint: revealHint, onReveal: reveal });
    if (raw === QUIT) break;

    const userNotes = parseUserNotes(raw).map(normNote);
    const expected = answer.map(normNote);
    const correct =
      userNotes.length === expected.length && userNotes.every((n, i) => n === expected[i]);

    stats.total++;
    if (correct) {
      stats.right++;
      stats.streak++;
      print(correctMsg());
    } else {
      stats.streak = 0;
      print(wrongMsg(`The ${qRoot} ${scaleName} scale is: ${answer.join('  ')}`));
    }
    print(scoreLine(stats));
  }

  print();
  print(c.gray('Scale quiz finished. ') + scoreLine(stats));
  return stats;
}
