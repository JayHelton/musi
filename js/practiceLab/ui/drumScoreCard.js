// One drum pattern on screen: the heading, the notes about it, and the score.
//
// The score is the Guitar Pro player. It reads the same object a loaded `.gp`
// file produces, so a beat from this library keeps the transport, the loop, the
// tempo control, and the count-in that every other score has.
//
// The player is heavy, so it only mounts when the card asks for it. A card that
// stays closed costs one heading.

import { el, clear, pressable } from './dom.js';
import { gpResultOf } from '../adapters/musiDrumLibrary.js';
import { mountGpPlayer } from '../adapters/musiScoreMount.js';

/** `4/4`, or `12/8`. */
function timeSigLabel(pattern) {
  const [count, unit] = pattern?.timeSig || [4, 4];
  return `${count}/${unit}`;
}

/**
 * The tempo line of a card. A swing pattern is written in a compound meter, so
 * the felt beat and the written quarter note are two different numbers and the
 * reader needs both.
 */
export function tempoLabel(pattern) {
  if (Number.isFinite(pattern?.pulse) && pattern.pulse > 0) {
    return `${pattern.pulse} BPM felt · ${pattern.bpm} BPM written`;
  }
  return `${pattern.bpm} BPM`;
}

/**
 * @param {Object} pattern a beat or a rudiment
 * @param {{
 *   kicker?: string,
 *   open?: boolean,
 *   compact?: boolean,
 *   actions?: HTMLElement[],
 *   onOpen?: Function,
 * }} [options]
 * @returns {{ root: HTMLElement, open: Function, close: Function, stop: Function, isOpen: Function }}
 */
export function createDrumScoreCard(pattern, {
  kicker = '',
  open: openAtStart = false,
  compact = false,
  actions = [],
  onOpen = null,
} = {}) {
  let mount = null;
  let opened = false;

  const stage = el('div', { class: 'pl-drum-stage' });
  stage.hidden = true;

  const toggle = pressable({
    label: 'Show the score',
    className: 'small',
    onPress: () => (opened ? close() : open()),
  });

  const facts = [
    pattern.genre || pattern.family,
    timeSigLabel(pattern),
    tempoLabel(pattern),
    pattern.feel,
  ].filter(Boolean);

  const head = el('div', { class: 'pl-drum-head' }, [
    el('div', { class: 'pl-drum-id' }, [
      kicker ? el('span', { class: 'pl-drum-kicker', text: kicker }) : null,
      el('h4', { class: 'pl-drum-name', text: pattern.name }),
      el('p', { class: 'pl-drum-facts', text: facts.join(' · ') }),
    ]),
    el('div', { class: 'pl-drum-actions' }, [...actions, toggle]),
  ]);

  const notes = el('div', { class: 'pl-drum-notes' }, [
    pattern.sticking
      ? el('p', { class: 'pl-drum-sticking' }, [
        el('span', { class: 'pl-drum-tag', text: 'Sticking' }),
        el('code', { class: 'pl-drum-sticking-text', text: pattern.sticking }),
      ])
      : null,
    pattern.about ? el('p', { class: 'pl-drum-about', text: pattern.about }) : null,
    pattern.fill ? el('p', { class: 'pl-drum-line', text: pattern.fill }) : null,
    pattern.focus
      ? el('p', { class: 'pl-drum-line pl-drum-focus' }, [
        el('span', { class: 'pl-drum-tag', text: 'Watch for' }),
        el('span', { text: pattern.focus }),
      ])
      : null,
  ]);

  const root = el('article', { class: `pl-drum-card${compact ? ' compact' : ''}` }, [
    head, notes, stage,
  ]);

  function open() {
    if (opened) return;
    onOpen?.();
    opened = true;
    stage.hidden = false;
    toggle.textContent = 'Hide the score';
    if (mount) return;
    clear(stage);
    try {
      mount = mountGpPlayer(stage, {
        gpResult: gpResultOf(pattern),
        title: pattern.name,
        fileName: `${pattern.id}.musi`,
        hideTitle: true,
        scoreKey: `drum-library:${pattern.id}`,
        initialBpm: pattern.bpm,
        initialLoopEnabled: true,
        enableHostKeyboard: false,
      });
    } catch (error) {
      clear(stage);
      stage.appendChild(el('p', {
        class: 'pl-notice pl-notice-warn',
        text: error?.message || 'This pattern could not be drawn.',
      }));
    }
  }

  function close() {
    opened = false;
    stage.hidden = true;
    toggle.textContent = 'Show the score';
  }

  /** Drop the player. The screen calls this when it leaves. */
  function stop() {
    if (mount && typeof mount.destroy === 'function') mount.destroy();
    mount = null;
    opened = false;
  }

  if (openAtStart) open();

  return { root, open, close, stop, isOpen: () => opened };
}
