// The self-report controls of vocal practice.
//
// Musi never scores a harsh vocal and never invents precision for a clean one.
// The singer reports the result of a repetition, and Musi writes it down.
//
// Two pieces live here:
//   - the outcome row: three chips the singer presses after a repetition
//   - the attempt form: effort, issue tags, and a short note after the run

import { el, chip, pressable } from './dom.js';
import {
  EFFORT_LEVELS,
  effortLabel,
  outcomeLabel,
  issueTagsOfStyle,
  issueLabel,
} from '../adapters/musiExerciseLibrary.js';

/**
 * The outcome row of one repetition.
 * @param {{ outcomes: string[], onPick: Function, title?: string }} options
 * @returns {{ root: HTMLElement }}
 */
export function createOutcomeRow({ outcomes, onPick, title = 'How did that rep go?' }) {
  const row = el('div', { class: 'pl-chip-row pl-vocal-outcomes' });
  for (const id of outcomes) {
    row.appendChild(chip({
      label: outcomeLabel(id),
      onSelect: () => onPick?.(id),
    }));
  }
  const root = el('div', { class: 'pl-vocal-report' }, [
    el('span', { class: 'pl-field-label', text: title }),
    row,
  ]);
  return { root };
}

/**
 * The optional report after a run: how hard it was, what went wrong, and a
 * note. Nothing here is required, so the singer can leave at once.
 *
 * @param {{ style: string, onSave: Function, onSkip?: Function, saveLabel?: string }} options
 * @returns {{ root: HTMLElement, value: Function, reset: Function }}
 */
export function createAttemptForm({ style, onSave, onSkip, saveLabel = 'Save attempt' }) {
  let effort = '';
  const issues = new Set();

  const effortRow = el('div', { class: 'pl-chip-row' });
  const issueRow = el('div', { class: 'pl-chip-row' });
  const note = el('input', {
    type: 'text', class: 'pl-text',
    placeholder: 'A short note (optional)',
    attrs: { 'aria-label': 'Attempt note', maxlength: '240' },
  });

  // A strained report is a record, never a reward. Musi shows a rest line and
  // never offers to raise the difficulty.
  const strainNote = el('p', {
    class: 'pl-notice pl-notice-warn',
    text: 'Strained is recorded, not rewarded. Rest before the next repetition.',
  });
  strainNote.hidden = true;

  function paintEffort() {
    effortRow.textContent = '';
    for (const id of EFFORT_LEVELS) {
      effortRow.appendChild(chip({
        label: effortLabel(id),
        selected: effort === id,
        onSelect: () => {
          effort = effort === id ? '' : id;
          strainNote.hidden = effort !== 'strained';
          paintEffort();
        },
      }));
    }
  }

  function paintIssues() {
    issueRow.textContent = '';
    for (const id of issueTagsOfStyle(style)) {
      issueRow.appendChild(chip({
        label: issueLabel(id),
        selected: issues.has(id),
        onSelect: () => {
          if (issues.has(id)) issues.delete(id);
          else issues.add(id);
          paintIssues();
        },
      }));
    }
  }

  function value() {
    return { effort, issues: [...issues], notes: note.value.trim() };
  }

  function reset() {
    effort = '';
    issues.clear();
    note.value = '';
    strainNote.hidden = true;
    paintEffort();
    paintIssues();
  }

  const actions = el('div', { class: 'pl-vocal-form-actions' }, [
    pressable({ label: saveLabel, className: 'primary', onPress: () => onSave?.(value()) }),
    onSkip ? pressable({ label: 'Skip', onPress: () => onSkip?.() }) : null,
  ]);

  const root = el('div', { class: 'pl-vocal-form' }, [
    el('span', { class: 'pl-field-label', text: 'Effort (optional)' }),
    effortRow,
    strainNote,
    el('span', { class: 'pl-field-label', text: 'What got in the way? (optional)' }),
    issueRow,
    note,
    actions,
  ]);

  paintEffort();
  paintIssues();

  return { root, value, reset };
}
