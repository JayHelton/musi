import { c, print, clear, banner, choose, ask, closeRl } from './ui.js';
import { runScaleQuiz } from './quizzes/scale.js';
import { runIntervalQuiz } from './quizzes/interval.js';
import { runSightReading } from './quizzes/sight.js';
import { runFretboard } from './trainers/fretboard.js';
import { runEarTrainer } from './trainers/ear.js';
import { runPitch } from './trainers/pitch.js';
import { runReference } from './reference.js';

const ACTIVITIES = {
  scale: runScaleQuiz,
  interval: runIntervalQuiz,
  sight: runSightReading,
  fretboard: runFretboard,
  ear: runEarTrainer,
  pitch: runPitch,
  reference: runReference,
};

export async function runActivity(name, opts = {}) {
  const fn = ACTIVITIES[name];
  if (!fn) {
    print(c.err(`Unknown activity: ${name}`));
    return;
  }
  await fn(opts);
}

export async function runMenu() {
  while (true) {
    clear();
    banner('musi', 'Music theory quizzes & training tools — in your terminal');
    const choice = await choose(
      'What do you want to practice?',
      [
        { label: c.bold('Quiz') + c.gray('  · Scale spelling'), value: 'scale' },
        { label: c.bold('Quiz') + c.gray('  · Intervals'), value: 'interval' },
        { label: c.bold('Quiz') + c.gray('  · Sight reading'), value: 'sight' },
        { label: c.bold('Train') + c.gray(' · Fretboard'), value: 'fretboard' },
        { label: c.bold('Train') + c.gray(' · Ear training'), value: 'ear' },
        { label: c.bold('Pitch') + c.gray(' · Play scales'), value: 'pitch' },
        { label: c.bold('Learn') + c.gray(' · Scale reference'), value: 'reference' },
        { label: c.gray('Quit'), value: '__quit__' },
      ],
      { defaultIndex: 0 }
    );

    if (choice === '__quit__') {
      print();
      print(c.gray('Keep practicing. See you next session.'));
      closeRl();
      return;
    }

    await runActivity(choice);
    print();
    await ask(c.gray('Press Enter to return to the main menu... '));
  }
}
