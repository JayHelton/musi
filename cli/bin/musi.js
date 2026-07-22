#!/usr/bin/env node
import { runMenu, runActivity } from '../src/menu.js';
import { c, print, closeRl } from '../src/ui.js';

const ALIASES = {
  scale: 'scale',
  scales: 'scale',
  interval: 'interval',
  intervals: 'interval',
  sight: 'sight',
  sightreading: 'sight',
  'sight-reading': 'sight',
  fretboard: 'fretboard',
  fret: 'fretboard',
  ear: 'ear',
  pitch: 'pitch',
  play: 'pitch',
  tuner: 'pitch',
  reference: 'reference',
  ref: 'reference',
  learn: 'reference',
  tab: 'tab',
  tabs: 'tab',
  analyze: 'tab',
  analyse: 'tab',
};

const FLAG_MAP = {
  '--root': 'root',
  '--type': 'type',
  '--scale': 'type',
  '--diff': 'diff',
  '--difficulty': 'diff',
  '--clef': 'clef',
  '--key': 'key',
  '--tuning': 'tuning',
  '--file': 'file',
  '--tab': 'file',
  '--mode': 'mode',
  '--octave': 'octave',
  '--tempo': 'tempo',
  '--start': 'start',
  '--count': 'count',
  '--step': 'step',
};

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (FLAG_MAP[a]) {
      opts[FLAG_MAP[a]] = argv[++i];
    } else if (a.includes('=') && a.startsWith('--')) {
      const [k, v] = a.split('=');
      if (FLAG_MAP[k]) opts[FLAG_MAP[k]] = v;
    }
  }
  return opts;
}

function printHelp() {
  print(c.bold('musi') + c.gray(' — music theory quizzes & training tools in your terminal'));
  print();
  print(c.bold('Usage:'));
  print('  musi                      ' + c.gray('Open the interactive menu'));
  print('  musi <activity> [flags]   ' + c.gray('Jump straight into an activity'));
  print();
  print(c.bold('Activities:'));
  print('  scale       ' + c.gray('Scale spelling quiz   (--root, --type)'));
  print('  interval    ' + c.gray('Interval quiz         (--root, --diff easy|medium|hard)'));
  print('  sight       ' + c.gray('Sight reading quiz    (--clef Treble|Bass|both, --diff)'));
  print('  fretboard   ' + c.gray('Fretboard trainer     (--key, --tuning)'));
  print('  ear         ' + c.gray('Ear trainer           (--key, --mode easy|hard)'));
  print('  pitch       ' + c.gray('Play scales           (--root, --type, --octave, --tempo, --start, --count, --step)'));
  print('  reference   ' + c.gray('Scale reference/learn (--root, --type)'));
  print('  tab         ' + c.gray('Analyze a guitar tab  (--file .txt/.gp, --tuning)'));
  print();
  print(c.bold('Examples:'));
  print('  musi scale --root C --type "Major (Ionian)"');
  print('  musi interval --diff medium');
  print('  musi pitch --root A --type "Natural Minor (Aeolian)" --tempo 120');
  print('  musi reference --root F --type Dorian');
  print('  musi tab --file solo.txt --tuning "Drop C"');
  print('  musi tab --file song.gp');
  print();
  print(c.gray('During a quiz: type your answer, or use q (quit), s (reveal), h (hint), r (replay).'));
}

async function main() {
  const argv = process.argv.slice(2);
  const first = argv[0];

  if (first === '-h' || first === '--help' || first === 'help') {
    printHelp();
    closeRl();
    return;
  }

  if (!first) {
    await runMenu();
    closeRl();
    return;
  }

  const activity = ALIASES[first.toLowerCase()];
  if (!activity) {
    print(c.err(`Unknown command: ${first}`));
    print();
    printHelp();
    closeRl();
    return;
  }

  const opts = parseArgs(argv.slice(1));
  await runActivity(activity, opts);
  closeRl();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
