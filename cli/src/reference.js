import { parseNote, SCALES, getScaleNotes, scaleStepPattern, ROOTS, INTERVAL_LABELS } from './shared.js';
import { c, print, banner, choose, ask } from './ui.js';

const DEGREE_ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const TRIAD_SUFFIX = ['', 'm', 'm', '', '', 'm', 'dim'];
const SEVENTH_SUFFIX = ['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5'];
const KEY_SIGS = {
  C: 'none', G: '1#', D: '2#', A: '3#', E: '4#', B: '5#', 'F#': '6#', Gb: '6b',
  Db: '5b', Ab: '4b', Eb: '3b', Bb: '2b', F: '1b', 'C#': '7#', Cb: '7b',
};

function compute3NPS(rootStr, scaleName) {
  const r = parseNote(rootStr);
  if (!r) return null;
  const def = SCALES[scaleName];
  if (!def) return null;
  const semis = def.map((d) => d[1]);
  const allSemis = [];
  for (let oct = 0; oct < 5; oct++) semis.forEach((s) => allSemis.push(s + oct * 12));
  const rootFret = (((r.semi - 4) % 12) + 12) % 12;
  const openStrings = [0, 5, 10, 15, 19, 24];
  const labels = ['E', 'A', 'D', 'G', 'B', 'e'];
  const result = [];
  let ni = 0;
  for (let s = 0; s < 6; s++) {
    const frets = [];
    for (let n = 0; n < 3; n++) {
      if (ni >= allSemis.length) break;
      frets.push(rootFret + allSemis[ni] - openStrings[s]);
      ni++;
    }
    result.push({ label: labels[s], frets });
  }
  return result;
}

function render3NPSTab(rootStr, scaleName) {
  const pattern = compute3NPS(rootStr, scaleName);
  if (!pattern) return '';
  const reversed = [...pattern].reverse();
  let tab = '';
  reversed.forEach((s) => {
    const fretStr = s.frets.map((f) => String(f).padStart(2, '-')).join('---');
    tab += s.label + '|---' + fretStr + '---|\n';
  });
  return tab;
}

export function printScaleReference(root, scaleName) {
  const notes = getScaleNotes(root, scaleName);
  if (!notes) {
    print(c.err('Could not compute that scale.'));
    return;
  }
  const def = SCALES[scaleName];

  banner(`${root} ${scaleName}`, 'Scale reference');
  print();
  print(c.bold('Step pattern: ') + c.accent(scaleStepPattern(scaleName)));
  if (KEY_SIGS[root] && scaleName === 'Major (Ionian)') {
    print(c.bold('Key signature: ') + c.accent(KEY_SIGS[root]));
  }

  print();
  print(c.gray('  Deg   Note   Interval   Semitones'));
  print(c.gray('  ───   ────   ────────   ─────────'));
  notes.forEach((note, i) => {
    const semi = def[i][1];
    const intLabel = INTERVAL_LABELS[semi % 12] || semi + 'st';
    print(
      '  ' +
        String(i + 1).padEnd(6) +
        c.accent(String(note).padEnd(7)) +
        String(intLabel).padEnd(11) +
        String(semi)
    );
  });

  if (scaleName === 'Major (Ionian)' && notes.length === 7) {
    print();
    print(c.bold('Diatonic triads:'));
    print('  ' + notes.map((n, i) => `${DEGREE_ROMAN[i]}: ${c.accent(n + TRIAD_SUFFIX[i])}`).join('   '));
    print(c.bold('Diatonic 7ths:'));
    print('  ' + notes.map((n, i) => `${DEGREE_ROMAN[i]}: ${c.accent(n + SEVENTH_SUFFIX[i])}`).join('   '));
  }

  const tab = render3NPSTab(root, scaleName);
  if (tab) {
    const rootP = parseNote(root);
    const startFret = (((rootP.semi - 4) % 12) + 12) % 12;
    print();
    print(c.bold(`3-Notes-Per-String pattern `) + c.gray(`(root at fret ${startFret} on low E)`));
    print();
    print(c.cyan(tab.replace(/\n$/, '')));
  }
}

export async function runReference(opts = {}) {
  banner('Scale Reference', 'Browse scales: degrees, intervals, chords, and fretboard patterns.');

  if (opts.root && opts.type) {
    printScaleReference(opts.root, opts.type);
    return;
  }

  while (true) {
    const root = await choose('Root note:', [
      { label: 'Back to main menu', value: '__back__' },
      ...ROOTS.map((r) => ({ label: r, value: r })),
    ]);
    if (root === '__back__') return;

    const scaleName = await choose('Scale:', Object.keys(SCALES).map((n) => ({ label: n, value: n })));
    print();
    printScaleReference(root, scaleName);
    print();
    const again = (await ask(c.gray('Press Enter to look up another scale, or "q" to go back: '))).trim().toLowerCase();
    if (again === 'q') return;
  }
}
