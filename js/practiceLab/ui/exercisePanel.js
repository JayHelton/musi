// One exercise card in Composition Lab.
//
// The card is the same shape for every activity: a title, a prompt, a short
// brief, the fields the player writes into, the workspace the exercise needs,
// and three controls at the bottom.
//
// The order matters. Musi asks first and answers second. A player who presses
// Check with every field empty gets one prompt to commit an answer. A second
// press reveals it anyway, because a reference the player cannot reach is not
// a reference.

import { createRhythmGrid } from './rhythmGridView.js';
import { createCompositionFretboard } from './compositionFretboard.js';
import { createHearPanel } from './hearPanel.js';
import { cardById } from '../model/motifLab.js';
import { el, clear, panel, pressable, notice } from './dom.js';

/**
 * Build the exercise card.
 * @param {Object} handlers
 * @param {Function} handlers.onField runs with `(fieldId, value)`
 * @param {Function} handlers.onReveal runs when the player sees the answer
 * @param {Function} handlers.onNext runs when the player asks for another exercise
 * @param {Function} [handlers.onGrid] runs with `{cells, pitches}`
 * @param {Function} [handlers.onWorkspaceState] runs with the workspace state to save
 * @returns {{root: HTMLElement, render: Function, stop: Function}}
 */
export function createExercisePanel({ onField, onReveal, onNext, onGrid, onWorkspaceState } = {}) {
  let exercise = null;
  let context = null;
  let revealed = false;
  let armed = false;
  let written = {};

  const title = el('h3', { class: 'plc-ex-title' });
  const activity = el('span', { class: 'plc-ex-activity' });
  const prompt = el('p', { class: 'plc-ex-prompt' });
  const brief = el('ul', { class: 'plc-ex-brief' });
  const fields = el('div', { class: 'plc-ex-fields' });
  const workspace = el('div', { class: 'plc-ex-workspace' });
  const answerBox = el('div', { class: 'plc-ex-answer' });
  const message = el('div', { class: 'plc-ex-message' });

  const grid = createRhythmGrid({
    onChange: (state) => onGrid?.(state),
  });
  const fretboard = createCompositionFretboard({
    onChange: (marked) => onWorkspaceState?.({ marked }),
  });
  const hear = createHearPanel({
    onGuess: (guessValue) => onWorkspaceState?.({ guess: guessValue }),
  });

  const hintButton = pressable({ label: 'Hint', className: 'small', onPress: () => showHint() });
  const checkButton = pressable({ label: 'Check', className: 'primary', onPress: () => check() });
  const nextButton = pressable({ label: 'Next', onPress: () => onNext?.() });

  const actions = el('div', { class: 'pl-row plc-ex-actions' }, [hintButton, checkButton, nextButton]);

  const view = panel('Exercise', 'plc-exercise');
  view.head.appendChild(activity);
  view.body.append(title, prompt, brief, fields, workspace, answerBox, message, actions);

  function paintBrief() {
    clear(brief);
    const lines = exercise?.brief || [];
    brief.hidden = !lines.length;
    for (const line of lines) brief.appendChild(el('li', { text: line }));
  }

  function paintFields(answers) {
    clear(fields);
    written = { ...answers };
    const list = exercise?.fields || [];
    fields.hidden = !list.length;
    for (const field of list) {
      const value = answers[field.id] || '';
      const input = field.kind === 'textarea'
        ? el('textarea', {
          class: 'pl-textarea',
          value,
          rows: 2,
          placeholder: field.placeholder || '',
          on: {
            input: (event) => {
              written[field.id] = event.target.value;
              onField?.(field.id, event.target.value);
            },
          },
        })
        : el('input', {
          type: 'text',
          class: 'pl-text',
          value,
          placeholder: field.placeholder || '',
          on: {
            input: (event) => {
              written[field.id] = event.target.value;
              onField?.(field.id, event.target.value);
            },
          },
        });
      input.setAttribute('aria-label', field.label);
      fields.appendChild(el('label', { class: 'pl-field plc-ex-field' }, [
        el('span', { class: 'pl-field-label', text: field.label }),
        input,
      ]));
    }
  }

  function transformCard() {
    const card = cardById(exercise?.workspaceConfig?.cardId);
    const wrap = panel('Preserve and change', 'plc-transform');
    if (!card) {
      const axes = exercise?.workspaceConfig?.axes || [];
      wrap.body.append(
        el('p', { class: 'plc-keep', text: `Preserve: the axes you did not choose.` }),
        el('p', { class: 'plc-change', text: `Change: ${axes.join(' and ') || 'two axes'}.` }),
      );
      return wrap.root;
    }
    wrap.body.append(
      el('p', { class: 'plc-keep', text: `Preserve: ${card.preserve}` }),
      el('p', { class: 'plc-change', text: `Change: ${card.change}` }),
      el('p', { class: 'pl-hint', text: card.how }),
    );
    return wrap.root;
  }

  function paintWorkspace(saved) {
    clear(workspace);
    const kind = exercise?.workspace || 'none';
    if (kind === 'rhythm') {
      grid.render({
        cells: saved.cells,
        pitches: saved.pitches,
        config: exercise.workspaceConfig,
        context,
      });
      workspace.appendChild(grid.root);
      return;
    }
    if (kind === 'fretboard') {
      fretboard.render({
        context,
        config: exercise.workspaceConfig,
        marked: saved.marked || [],
        reset: !saved.marked,
      });
      workspace.appendChild(fretboard.root);
      return;
    }
    if (kind === 'hear') {
      hear.render({ context, config: exercise.workspaceConfig, guess: saved.guess || '' });
      workspace.appendChild(hear.root);
      return;
    }
    if (kind === 'transform') {
      workspace.appendChild(transformCard());
      if (exercise.workspaceConfig?.cardId && cardById(exercise.workspaceConfig.cardId)?.grid) {
        grid.render({ cells: saved.cells, pitches: saved.pitches, config: {}, context });
        workspace.appendChild(grid.root);
      }
    }
  }

  function paintAnswer() {
    clear(answerBox);
    if (!revealed || !exercise) return;
    answerBox.appendChild(el('p', { class: 'pl-field-label', text: exercise.selfCheck ? 'Something to check' : 'Reference answer' }));
    answerBox.appendChild(el('p', { class: 'plc-answer-text', text: exercise.answer || '' }));
  }

  function showHint() {
    clear(message);
    if (!exercise) return;
    const hint = exercise.hint
      || 'Open a reference from the row above. Nothing in it is marked as the answer.';
    message.appendChild(notice(hint, 'info'));
  }

  function hasWritten() {
    const list = exercise?.fields || [];
    if (!list.length) return true;
    return list.some(field => String(written[field.id] || '').trim().length > 0);
  }

  function check() {
    clear(message);
    if (!exercise) return;

    if (exercise.workspace === 'hear') {
      const result = hear.reveal();
      if (result && !result.answered) return;
    }
    if (exercise.workspace === 'fretboard') {
      fretboard.reveal();
    }

    if (!revealed && !hasWritten() && !armed && exercise.workspace !== 'fretboard') {
      armed = true;
      message.appendChild(notice(
        'Commit an answer first. Press Check again to see the reference answer anyway.',
        'warn',
      ));
      return;
    }

    armed = false;
    revealed = true;
    paintAnswer();
    onReveal?.();
  }

  /**
   * Paint the card.
   * @param {Object} next
   * @param {Object} next.exercise the concrete exercise
   * @param {Object} next.context the lab context
   * @param {Record<string,string>} [next.answers]
   * @param {boolean} [next.revealed]
   * @param {Object} [next.workspaceState] `cells`, `pitches`, `marked`, `guess`
   * @param {string} [next.progress] a line such as "Step 3 of 6"
   */
  function render(next = {}) {
    exercise = next.exercise || null;
    context = next.context || context;
    revealed = !!next.revealed;
    armed = false;
    clear(message);

    if (!exercise) {
      title.textContent = 'No exercise yet';
      prompt.textContent = 'Pick Quick Practice, a Guided Session, or a focus area above.';
      activity.textContent = '';
      clear(brief); clear(fields); clear(workspace); clear(answerBox);
      actions.hidden = true;
      return;
    }

    actions.hidden = false;
    title.textContent = exercise.title;
    prompt.textContent = exercise.prompt;
    activity.textContent = next.progress
      ? `${exercise.activity} · ${next.progress}`
      : exercise.activity;
    paintBrief();
    paintFields(next.answers || {});
    paintWorkspace(next.workspaceState || {});
    paintAnswer();
    checkButton.textContent = exercise.selfCheck ? 'Check' : 'Check answer';
  }

  return {
    root: view.root,
    render,
    grid,
    stop() { hear.stop(); },
  };
}
