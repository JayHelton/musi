import { pick } from '../shared.js';
import { c, print, banner, scoreLine, correctMsg, wrongMsg, askAnswer, choose, QUIT } from '../ui.js';

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

// Diatonic step value (DV) system, matching the web sight-reading trainer.
const CLEFS = {
  Treble: { refDV: 38, symbol: '𝄞' },
  Bass: { refDV: 26, symbol: '𝄢' },
};

function letterFromDV(d) {
  return LETTERS[((d % 7) + 7) % 7];
}

function rangeForDiff(diff, refDV) {
  const bottomDV = refDV - 8;
  const topDV = refDV;
  if (diff === 'easy') return [bottomDV, topDV];
  if (diff === 'medium') return [bottomDV - 3, topDV + 3];
  return [bottomDV - 6, topDV + 6];
}

function ledgerNeeded(d, noteDV, refDV) {
  if (noteDV > refDV) return d >= refDV + 2 && d <= noteDV;
  if (noteDV < refDV - 8) return d <= refDV - 10 && d >= noteDV;
  return false;
}

function renderStaff(noteDV, refDV) {
  const WIDTH = 19;
  const NOTE_COL = 10;
  const lineDVs = [refDV, refDV - 2, refDV - 4, refDV - 6, refDV - 8];
  const topD = Math.max(refDV, noteDV) + 1;
  const botD = Math.min(refDV - 8, noteDV) - 1;
  const lines = [];

  for (let d = topD; d >= botD; d--) {
    const arr = Array(WIDTH).fill(' ');
    const isLine = lineDVs.includes(d);
    const evenOffset = (refDV - d) % 2 === 0;

    if (isLine) {
      arr.fill('─');
    } else if (evenOffset && ledgerNeeded(d, noteDV, refDV)) {
      arr[NOTE_COL - 1] = '─';
      arr[NOTE_COL] = '─';
      arr[NOTE_COL + 1] = '─';
    }

    let row = '  │ ' + arr.join('');
    if (d === noteDV) {
      const col = 4 + NOTE_COL;
      row = row.slice(0, col) + c.accent('●') + row.slice(col + 1);
    }
    lines.push(row);
  }
  return lines.join('\n');
}

export async function runSightReading(opts = {}) {
  banner('Sight Reading', 'Name the note drawn on the staff (letter only).');

  let clef = opts.clef;
  let diff = opts.diff;

  if (!clef) {
    clef = await choose('Clef:', [
      { label: 'Treble', value: 'Treble' },
      { label: 'Bass', value: 'Bass' },
      { label: 'Both (random)', value: 'both' },
    ]);
  }
  if (!diff) {
    diff = await choose('Difficulty:', [
      { label: 'Easy (notes on the staff)', value: 'easy' },
      { label: 'Medium (1-2 ledger lines)', value: 'medium' },
      { label: 'Hard (wide range)', value: 'hard' },
    ]);
  }

  print();
  print(c.gray('Type the note letter A-G. Commands: ') + c.cyan('s') + c.gray(' reveal · ') + c.cyan('q') + c.gray(' quit'));

  const stats = { right: 0, total: 0, streak: 0 };

  while (true) {
    const clefName = clef === 'both' ? pick(['Treble', 'Bass']) : clef;
    const refDV = CLEFS[clefName].refDV;
    const [lo, hi] = rangeForDiff(diff, refDV);
    const noteDV = lo + Math.floor(Math.random() * (hi - lo + 1));
    const answer = letterFromDV(noteDV);

    print();
    print(c.bold(`${CLEFS[clefName].symbol}  ${clefName} clef — name this note:`));
    print();
    print(renderStaff(noteDV, refDV));
    print();

    const reveal = () => print(c.yellow('  Answer: ') + c.gray(answer));
    const raw = await askAnswer(c.cyan('Note (A-G) › '), { onReveal: reveal });
    if (raw === QUIT) break;

    const guess = raw.trim().toUpperCase()[0] || '';
    const correct = guess === answer;
    stats.total++;
    if (correct) {
      stats.right++;
      stats.streak++;
      print(correctMsg());
    } else {
      stats.streak = 0;
      print(wrongMsg(`The note is ${answer}.`));
    }
    print(scoreLine(stats));
  }

  print();
  print(c.gray('Sight reading finished. ') + scoreLine(stats));
  return stats;
}
