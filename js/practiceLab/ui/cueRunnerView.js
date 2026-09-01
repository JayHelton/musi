// The Cue Runner screen.
//
// The runner shows one step at a time: what to do, how long is left, and what
// comes next. It plays no audio and it judges nothing. The singer reports the
// result of every repetition.
//
// The timing comes from the shared countdown through `engine/cueRun.js`, so
// this feature builds no second timer and no second metronome.

import { el, clear, pressable, notice } from './dom.js';
import { createCueRun } from '../engine/cueRun.js';
import { createOutcomeRow } from './vocalAttemptForm.js';
import { withRepReports } from '../model/vocal.js';
import {
  expandCueSteps,
  cueStepTitle,
  cueStepKicker,
  formatCueClock,
  outcomeSetOf,
} from '../adapters/musiExerciseLibrary.js';

/**
 * @param {Object} options
 * @param {Object} options.exercise the library exercise
 * @param {Object} options.clock the clock port
 * @param {(outcome: string, rep: number) => void} options.onRepResult
 * @param {(result: {completed: boolean, reps: number}) => void} options.onEnd
 * @returns {{ root: HTMLElement, stop: Function }}
 */
export function createCueRunnerView({ exercise, clock, onRepResult, onEnd }) {
  const steps = withRepReports(expandCueSteps(exercise?.cue));
  const outcomes = outcomeSetOf(exercise);
  const run = createCueRun({ clock });
  run.load(steps);

  let reportedReps = 0;

  const repLine = el('p', { class: 'pl-cue-rep', text: '' });
  const kicker = el('p', { class: 'pl-cue-kicker', text: 'READY' });
  const title = el('h3', { class: 'pl-cue-title', text: exercise?.name || 'Cue exercise' });
  const detail = el('p', { class: 'pl-cue-detail', text: '' });
  const clockLine = el('p', { class: 'pl-cue-clock', text: '' });
  const nextLine = el('p', { class: 'pl-cue-next', text: '' });
  const reportWrap = el('div', { class: 'pl-cue-report' });
  reportWrap.hidden = true;

  const startBtn = pressable({ label: 'Start', className: 'primary', onPress: () => start() });
  const pauseBtn = pressable({ label: 'Pause', onPress: () => togglePause() });
  const stopBtn = pressable({ label: 'Stop', className: 'danger', onPress: () => stop() });
  const nextBtn = pressable({ label: 'Next', onPress: () => run.next() });
  pauseBtn.disabled = true;
  nextBtn.hidden = true;

  const stage = el('div', { class: 'pl-cue-stage' }, [
    repLine, kicker, title, detail, clockLine, nextLine, reportWrap,
  ]);

  const root = el('div', { class: 'pl-cue' }, [
    stage,
    el('div', { class: 'pl-cue-actions' }, [startBtn, pauseBtn, nextBtn, stopBtn]),
  ]);

  if (!steps.length) {
    clear(stage);
    stage.appendChild(notice('This cue exercise holds no steps. Edit it in the library.', 'warn'));
    startBtn.disabled = true;
  }

  function paintIdle() {
    repLine.textContent = '';
    kicker.textContent = 'READY';
    title.textContent = exercise?.name || 'Cue exercise';
    detail.textContent = '';
    clockLine.textContent = '';
    nextLine.textContent = '';
    reportWrap.hidden = true;
    nextBtn.hidden = true;
    pauseBtn.disabled = true;
    pauseBtn.textContent = 'Pause';
    startBtn.disabled = !steps.length;
  }

  function paintNext(step) {
    if (!step) {
      nextLine.textContent = 'NEXT — end of the exercise';
      return;
    }
    if (step.report) {
      nextLine.textContent = 'NEXT — report the rep';
      return;
    }
    const seconds = step.type === 'checkpoint' ? '' : ` ${formatCueClock(step.duration)}`;
    nextLine.textContent = `NEXT — ${cueStepKicker(step)} ${cueStepTitle(step)}${seconds}`.trim();
  }

  function paintReport(rep) {
    clear(reportWrap);
    const row = createOutcomeRow({
      outcomes,
      title: `Rep ${rep} — how did that go?`,
      onPick: (id) => {
        reportedReps += 1;
        onRepResult?.(id, rep);
        reportWrap.hidden = true;
        run.next();
      },
    });
    reportWrap.appendChild(row.root);
    reportWrap.appendChild(pressable({
      label: 'Skip the report',
      className: 'small',
      onPress: () => { reportWrap.hidden = true; run.next(); },
    }));
    reportWrap.hidden = false;
  }

  function paintStep({ entry, remainingMs }) {
    const { step, rep, reps } = entry;
    repLine.textContent = `REP ${rep} / ${reps}`;
    stage.dataset.step = step.type;
    if (step.report) {
      kicker.textContent = 'REPORT';
      title.textContent = 'How did that rep go?';
      detail.textContent = '';
      clockLine.textContent = '';
      nextBtn.hidden = true;
      paintNext(entry.next);
      paintReport(rep);
      return;
    }
    reportWrap.hidden = true;
    kicker.textContent = cueStepKicker(step);
    title.textContent = cueStepTitle(step);
    detail.textContent = step.detail || '';
    clockLine.textContent = step.type === 'checkpoint' ? '' : formatCueClock(remainingMs / 1000);
    nextBtn.hidden = step.type !== 'checkpoint';
    paintNext(entry.next);
  }

  function start() {
    if (!steps.length) return;
    reportedReps = 0;
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    run.start({
      onStep: (payload) => paintStep(payload),
      onTick: ({ remainingMs }) => {
        clockLine.textContent = formatCueClock(remainingMs / 1000);
      },
      onEnd: ({ completed }) => {
        paintIdle();
        kicker.textContent = completed ? 'DONE' : 'STOPPED';
        onEnd?.({ completed, reps: reportedReps });
      },
    });
  }

  function togglePause() {
    if (run.isPaused()) {
      run.resume();
      pauseBtn.textContent = 'Pause';
      return;
    }
    run.pause();
    pauseBtn.textContent = 'Resume';
  }

  function stop() {
    run.stop();
  }

  paintIdle();

  return {
    root,
    /** Stop the run. Stop is available at every step and on the way out. */
    stop() { run.stop(); },
  };
}
