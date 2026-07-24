import { parseNote, NOTE_NAMES_SHARP, SCALES, ROOTS, TUNINGS } from '../shared.js';
import { c, print, banner, scoreLine, correctMsg, wrongMsg, ask, askAnswer, choose, QUIT } from '../ui.js';

const FB_FRETS = 15;
const FB_DOTS = [3, 5, 7, 9, 12, 15];
const FB_INT_NAMES = ['P1', 'm2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5', 'm6', 'M6', 'm7', 'M7'];
const FB_MODES = [
  { label: 'Find interval — tap the interval (no note name)', value: 'findInterval' },
  { label: 'Locate + name — find the note and name its interval', value: 'interval' },
  { label: 'Note — locate the note only', value: 'note' },
];

function fbOpenMidis(tuning) {
  return TUNINGS[tuning].map((s) => {
    const p = parseNote(s.note);
    return p ? 12 * (s.oct + 1) + p.semi : 0;
  });
}

function renderBoard(tuning, highlight) {
  const strings = TUNINGS[tuning];
  const openMidis = fbOpenMidis(tuning);
  const GUT = 6;
  const total = GUT + (FB_FRETS + 1) * 6;
  const out = [];

  const hdr = Array(total).fill(' ');
  for (let f = 0; f <= FB_FRETS; f++) {
    const col = GUT + f * 6 + 2;
    const numStr = String(f);
    const start = col - (numStr.length - 1);
    for (let i = 0; i < numStr.length; i++) hdr[start + i] = numStr[i];
  }
  out.push(c.gray(hdr.join('')));

  for (let s = 5; s >= 0; s--) {
    const stringNum = 6 - s;
    let row = `${stringNum} ${strings[s].note}`.padEnd(5) + '│';
    for (let f = 0; f <= FB_FRETS; f++) {
      const midi = openMidis[s] + f;
      const hot = highlight && highlight.has(midi);
      const mark = hot ? c.accent('●') : '─';
      row += '──' + mark + '──│';
    }
    out.push(row);
  }

  const dots = Array(total).fill(' ');
  for (let f = 0; f <= FB_FRETS; f++) {
    if (FB_DOTS.includes(f)) dots[GUT + f * 6 + 2] = '•';
  }
  out.push(c.gray(dots.join('')));
  return out.join('\n');
}

function parsePosition(raw, openMidis) {
  const m = raw.trim().match(/^(\d)\D+(\d{1,2})$/);
  if (!m) return { error: 'Format: "1 5" means 1st string (high), 5th fret.' };
  const stringNum = Number(m[1]);
  const fret = Number(m[2]);
  if (stringNum < 1 || stringNum > 6 || fret < 0 || fret > FB_FRETS) {
    return { error: 'String must be 1-6 and fret 0-15.' };
  }
  return { midi: openMidis[6 - stringNum] + fret, stringNum, fret };
}

export async function runFretboard(opts = {}) {
  banner('Fretboard Trainer', 'Practice locating notes and intervals on the neck.');

  let key = opts.key;
  let tuning = opts.tuning;
  let mode = opts.mode;

  if (!key) {
    key = await choose('Key:', ROOTS.map((r) => ({ label: r, value: r })));
  }
  if (!tuning) {
    tuning = await choose('Tuning:', Object.keys(TUNINGS).map((t) => ({ label: t, value: t })));
  }
  if (!mode) {
    mode = await choose('Mode:', FB_MODES);
  }
  if (!FB_MODES.some((m) => m.value === mode)) {
    print(c.err(`Unknown mode: ${mode}. Use findInterval, interval, or note.`));
    return;
  }

  const rootP = parseNote(key);
  if (!rootP) {
    print(c.err('Invalid key.'));
    return;
  }
  const scaleIntervals = SCALES['Major (Ionian)'].map((d) => d[1]);
  const openMidis = fbOpenMidis(tuning);

  print();
  print(c.gray('Strings are numbered 1 (high) to 6 (low). Enter a position as "string fret".'));
  print(c.gray('Commands: ') + c.cyan('s') + c.gray(' reveal · ') + c.cyan('q') + c.gray(' quit'));

  const stats = { right: 0, total: 0, streak: 0 };

  outer: while (true) {
    const interval = scaleIntervals[Math.floor(Math.random() * scaleIntervals.length)];
    const targetSemi = (rootP.semi + interval) % 12;
    const targetName = NOTE_NAMES_SHARP[targetSemi];
    const intName = FB_INT_NAMES[interval];

    const possibleMidis = [];
    for (let s = 0; s < 6; s++) {
      for (let f = 0; f <= FB_FRETS; f++) {
        const midi = openMidis[s] + f;
        if (midi % 12 === targetSemi) possibleMidis.push(midi);
      }
    }
    const chosenMidi = possibleMidis[Math.floor(Math.random() * possibleMidis.length)];
    const oct = Math.floor(chosenMidi / 12) - 1;
    const targetMatches = new Set(
      mode === 'findInterval' ? possibleMidis : possibleMidis.filter((m) => m === chosenMidi)
    );

    print();
    if (mode === 'findInterval') {
      print(c.bold(`Key ${c.accent(key)} Major — find ${c.accent(intName)} anywhere on the neck.`));
    } else if (mode === 'note') {
      print(c.bold(`Key ${c.accent(key)} — find ${c.accent(targetName + oct)} on the neck.`));
    } else {
      print(c.bold(`Key ${c.accent(key)} — find ${c.accent(targetName + oct)} on the neck and name its interval from the root.`));
    }
    print();
    print(renderBoard(tuning, null));

    const revealBoard = () => {
      print();
      print(renderBoard(tuning, targetMatches));
      print(c.yellow('  Interval: ') + c.gray(intName));
    };

    let posMidi = null;
    while (posMidi === null) {
      const raw = await askAnswer(c.cyan('Position (string fret) › '), { onReveal: revealBoard });
      if (raw === QUIT) break outer;
      const parsed = parsePosition(raw, openMidis);
      if (parsed.error) {
        print(c.gray('  ' + parsed.error));
        continue;
      }
      posMidi = parsed.midi;
    }

    let selSemi = interval;
    let intCorrect = true;
    if (mode === 'interval') {
      print(c.gray('  Intervals: ') + scaleIntervals.map((s) => FB_INT_NAMES[s]).join(' '));
      selSemi = null;
      while (selSemi === null) {
        const raw = (await ask(c.cyan('Interval › '))).trim();
        if (raw.toLowerCase() === 'q') break outer;
        const idx = FB_INT_NAMES.findIndex((n) => n.toLowerCase() === raw.toLowerCase());
        if (idx === -1) {
          print(c.gray('  Enter one of: ') + scaleIntervals.map((s) => FB_INT_NAMES[s]).join(' '));
          continue;
        }
        selSemi = idx;
      }
      intCorrect = selSemi === interval;
    }

    const fretCorrect = mode === 'findInterval'
      ? (posMidi % 12) === targetSemi
      : posMidi === chosenMidi;
    stats.total++;
    if (fretCorrect && intCorrect) {
      stats.right++;
      stats.streak++;
      print(correctMsg());
    } else {
      stats.streak = 0;
      let msg = '';
      if (!fretCorrect) {
        msg += mode === 'findInterval'
          ? `Wrong interval — look for ${intName}. `
          : 'Wrong position. ';
      }
      if (!intCorrect) msg += `Interval is ${intName}. `;
      print(wrongMsg(msg.trim()));
      revealBoard();
    }
    print(scoreLine(stats));
  }

  print();
  print(c.gray('Fretboard trainer finished. ') + scoreLine(stats));
  return stats;
}
