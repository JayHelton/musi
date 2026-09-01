// The neck workspace of Composition Lab.
//
// The Map exercises ask the player to find a degree, build a cell, or walk a
// route. The player taps frets, and only then does Musi show where the degree
// really sits. Nothing on the neck names the answer before the attempt.
//
// The drawing comes from the shared neck renderer, the same one the Scale
// Reference and the reference drawer use. This file adds the tap layer and the
// scoring.

import { renderFretboard } from '../adapters/musiNeck.js';
import { degreeLabel, noteForDegree, pitchClassForDegree, openMidisOf } from '../adapters/musiReference.js';
import { parseNote, NOTE_NAMES_SHARP } from '../adapters/musiTheory.js';
import { stringsOf } from '../model/compositionContext.js';
import { el, clear, panel, pressable, notice } from './dom.js';

/**
 * Build the neck workspace.
 * @param {{onChange?: Function}} [handlers] `onChange` receives the marked keys
 * @returns {{root: HTMLElement, render: Function, reveal: Function, score: Function,
 *   marked: Function, reset: Function}}
 */
export function createCompositionFretboard({ onChange } = {}) {
  let context = null;
  let config = {};
  let marked = new Set();
  let revealed = false;

  const board = el('div', { class: 'ref-fretboard plc-board' });
  const scroll = el('div', { class: 'ref-fb-scroll' }, [board]);
  const caption = el('p', { class: 'plc-board-caption' });
  const result = el('div', { class: 'plc-board-result' });

  const clearButton = pressable({
    label: 'Clear taps',
    className: 'small',
    onPress: () => { marked = new Set(); revealed = false; clear(result); paint(); onChange?.([...marked]); },
  });

  const view = panel('Neck', 'plc-neck');
  view.head.appendChild(el('div', { class: 'pl-row' }, [clearButton]));
  view.body.append(caption, scroll, result);

  board.addEventListener('click', (event) => {
    const cell = event.target.closest('.ref-fb-cell');
    if (!cell) return;
    const key = `${cell.dataset.string}:${cell.dataset.fret}`;
    if (marked.has(key)) marked.delete(key);
    else marked.add(key);
    paint();
    onChange?.([...marked]);
  });

  /** The frets the exercise asks for, as `string:fret` keys. */
  function targetKeys() {
    if (!context) return new Set();
    const strings = stringsOf(context);
    const openMidis = openMidisOf(strings);
    const targets = Array.isArray(config.targets) ? config.targets : [];
    const wanted = new Set(targets.map(id => pitchClassForDegree(context.tonic, id)).filter(pc => pc >= 0));
    const start = context.fretStart;
    const end = config.fretEnd != null ? Math.min(config.fretEnd, context.fretEnd) : context.fretEnd;
    const keys = new Set();
    openMidis.forEach((open, string) => {
      for (let fret = start; fret <= end; fret += 1) {
        const pc = (((open + fret) % 12) + 12) % 12;
        if (wanted.has(pc)) keys.add(`${string}:${fret}`);
      }
    });
    return keys;
  }

  function degreeOfPc(pc) {
    if (!context) return '';
    const parsed = parseNote(context.tonic);
    if (!parsed) return '';
    return degreeLabel(((pc - parsed.semi) % 12 + 12) % 12);
  }

  function paint() {
    if (!context) return;
    const strings = stringsOf(context);
    if (!strings.length) {
      clear(scroll);
      scroll.appendChild(el('p', { class: 'pl-hint', text: 'This instrument has no neck. Use the written fields instead.' }));
      return;
    }
    const targets = new Set(Array.isArray(config.targets) ? config.targets : []);
    const keys = targetKeys();
    const end = config.fretEnd != null ? Math.min(config.fretEnd, context.fretEnd) : context.fretEnd;

    renderFretboard({
      board,
      strings,
      openMidis: openMidisOf(strings),
      start: context.fretStart,
      end,
      box: null,
      noteFor: ({ string, fret, pc }) => {
        const key = `${string}:${fret}`;
        const isMarked = marked.has(key);
        const isTarget = keys.has(key);
        if (!isMarked && !(revealed && isTarget)) return null;
        const degree = degreeOfPc(pc);
        const parsed = parseNote(context.tonic);
        const semi = parsed ? ((pc - parsed.semi) % 12 + 12) % 12 : 0;
        const classes = [`deg-${semi}`];
        if (semi === 0) classes.push('root');
        if (isMarked) classes.push('anchor');
        if (revealed && isTarget && !isMarked) classes.push('in-pos');
        if (revealed && isMarked && !isTarget) classes.push('out-of-key');
        return {
          label: degree,
          classes,
          title: `${NOTE_NAMES_SHARP[pc]} · ${degree} above ${context.tonic}`,
        };
      },
    });

    const list = [...targets].join(', ') || 'any degree';
    caption.textContent = `${context.tonic} ${list} · ${context.tuning || 'no tuning'} · `
      + `frets ${context.fretStart}–${end} · ${marked.size} tapped`;
  }

  /** Show the frets the exercise asked for and score the taps. */
  function reveal() {
    revealed = true;
    const keys = targetKeys();
    const hits = [...marked].filter(key => keys.has(key));
    const misses = [...keys].filter(key => !marked.has(key));
    const wrong = [...marked].filter(key => !keys.has(key));

    clear(result);
    const targets = Array.isArray(config.targets) ? config.targets : [];
    const notes = targets.map(id => `${id} = ${noteForDegree(context.tonic, id)}`).join(' · ');
    result.appendChild(el('p', { class: 'pl-hint', text: notes }));
    result.appendChild(notice(
      `${hits.length} right, ${wrong.length} wrong, ${misses.length} still to find.`,
      wrong.length ? 'warn' : 'info',
    ));
    if (config.minStrings) {
      const strings = new Set(hits.map(key => key.split(':')[0]));
      result.appendChild(notice(
        `You covered ${strings.size} string${strings.size === 1 ? '' : 's'}. `
        + `The brief asks for ${config.minStrings}.`,
        strings.size >= config.minStrings ? 'info' : 'warn',
      ));
    }
    if (config.maxTaps && marked.size > config.maxTaps) {
      result.appendChild(notice(`The brief allows ${config.maxTaps} notes. You tapped ${marked.size}.`, 'warn'));
    }
    if (config.oneString) {
      const strings = new Set([...marked].map(key => key.split(':')[0]));
      result.appendChild(notice(
        strings.size <= 1
          ? 'Every attack sits on one string. That is a horizontal route.'
          : `Your taps cross ${strings.size} strings. Try to keep the route on one.`,
        strings.size <= 1 ? 'info' : 'warn',
      ));
    }
    paint();
    return { hits: hits.length, misses: misses.length, wrong: wrong.length };
  }

  /** The score without showing anything. */
  function score() {
    const keys = targetKeys();
    const hits = [...marked].filter(key => keys.has(key)).length;
    return { hits, total: keys.size, taps: marked.size };
  }

  /**
   * Paint the workspace.
   * @param {Object} next `context`, `config`, `marked`
   */
  function render(next = {}) {
    if (next.context) context = next.context;
    if (next.config) config = next.config;
    if (Array.isArray(next.marked)) marked = new Set(next.marked);
    if (next.reset) { marked = new Set(); revealed = false; clear(result); }
    paint();
  }

  return {
    root: view.root,
    render,
    reveal,
    score,
    marked: () => [...marked],
    reset() { marked = new Set(); revealed = false; clear(result); paint(); },
  };
}
