import { parseNote, NOTE_NAMES_SHARP, SCALES, ROOTS } from '../shared.js';
import { c, print, banner, scoreLine, correctMsg, wrongMsg, askAnswer, choose, QUIT } from '../ui.js';
import { audioAvailable, playSequence } from '../audio.js';

const TONE_DUR = 1.5;

export async function runEarTrainer(opts = {}) {
  banner('Ear Trainer', 'Identify the scale degree you hear.');

  if (!audioAvailable()) {
    print();
    print(c.err('No command-line audio player found, so the ear trainer cannot play tones.'));
    print(c.gray('Install one of: afplay (macOS, built-in), paplay/aplay (Linux ALSA/PulseAudio),'));
    print(c.gray('ffplay (ffmpeg), or sox (provides "play"). Then run the ear trainer again.'));
    return;
  }

  let key = opts.key;
  let mode = opts.mode;
  if (!key) key = await choose('Key:', ROOTS.map((r) => ({ label: r, value: r })));
  if (!mode) {
    mode = await choose('Mode:', [
      { label: 'Easy (root played first, then mystery note)', value: 'easy' },
      { label: 'Hard (mystery note only)', value: 'hard' },
    ]);
  }

  const rootP = parseNote(key);
  if (!rootP) {
    print(c.err('Invalid key.'));
    return;
  }
  const scaleIntervals = SCALES['Major (Ionian)'].map((d) => d[1]);
  const scalePCs = scaleIntervals.map((s) => (rootP.semi + s) % 12);
  const degreeNames = scalePCs.map((pc) => NOTE_NAMES_SHARP[pc]);

  print();
  print(c.gray('Answer with a note name (e.g. "F#") or scale degree (1-7).'));
  print(c.gray('Degrees: ') + degreeNames.map((n, i) => `${c.cyan(i + 1)}=${n}`).join('  '));
  print(c.gray('Commands: ') + c.cyan('r') + c.gray(' replay · ') + c.cyan('s') + c.gray(' reveal · ') + c.cyan('q') + c.gray(' quit'));

  const stats = { right: 0, total: 0, streak: 0 };

  const play = (targetSemi) => {
    const tones = [];
    if (mode === 'easy') {
      tones.push({ midi: 60 + rootP.semi, dur: TONE_DUR });
      tones.push({ midi: 60 + targetSemi, dur: TONE_DUR, gap: 0.2 });
    } else {
      tones.push({ midi: 60 + targetSemi, dur: TONE_DUR });
    }
    return playSequence(tones);
  };

  while (true) {
    const targetSemi = scalePCs[Math.floor(Math.random() * scalePCs.length)];
    const targetName = NOTE_NAMES_SHARP[targetSemi];
    const targetDegree = scalePCs.indexOf(targetSemi) + 1;

    print();
    print(c.bold(`Key ${c.accent(key)} — ${mode === 'easy' ? 'root then mystery note' : 'mystery note'} (listen)...`));
    await play(targetSemi);

    const reveal = () => print(c.yellow('  Answer: ') + c.gray(`${targetName} (degree ${targetDegree})`));
    const replay = () => play(targetSemi);
    const raw = await askAnswer(c.cyan('› '), { onReplay: replay, onReveal: reveal });
    if (raw === QUIT) break;

    let guessSemi = null;
    const trimmed = raw.trim();
    if (/^[1-7]$/.test(trimmed)) {
      guessSemi = scalePCs[Number(trimmed) - 1];
    } else {
      const p = parseNote(trimmed);
      if (p) guessSemi = p.semi;
    }

    if (guessSemi === null) {
      print(c.gray('  Could not read that. Enter a note name or a degree 1-7.'));
      continue;
    }

    const correct = guessSemi === targetSemi;
    stats.total++;
    if (correct) {
      stats.right++;
      stats.streak++;
      print(correctMsg());
    } else {
      stats.streak = 0;
      print(wrongMsg(`It was ${targetName} (degree ${targetDegree}).`));
    }
    print(scoreLine(stats));
  }

  print();
  print(c.gray('Ear trainer finished. ') + scoreLine(stats));
  return stats;
}
