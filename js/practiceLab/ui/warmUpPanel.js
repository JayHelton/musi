// The drum warm-up: one groove and one rudiment, picked for you.
//
// A player who chooses the warm-up spends the start of the practice choosing.
// This panel makes the choice instead. It never offers what the last three
// picks gave, so the whole library comes round over time.
//
// The panel sits at the top of the Drums tab. It picks on its first paint and
// it re-rolls on request.

import { el, clear, pressable, panel, notice } from './dom.js';
import { beatById, rudimentById, WARM_UP_COOLDOWN } from '../adapters/musiDrumLibrary.js';
import { createDrumScoreCard } from './drumScoreCard.js';

const LEAD = 'One groove and one rudiment. Play them before anything else.';
const RULE = `The picker skips whatever the last ${WARM_UP_COOLDOWN} picks gave.`;

/**
 * @param {Object} lab the Practice Lab service
 * @param {{ onOpen?: Function }} [options] `onOpen` fires before a card mounts
 *   its player, so the tab can close the other scores
 * @returns {{ root: HTMLElement, refresh: Function, stop: Function }}
 */
export function createWarmUpPanel(lab, { onOpen } = {}) {
  const box = panel('Warm-up', 'pl-warmup');
  const body = box.body;
  let cards = [];
  let rolling = false;
  let failed = false;

  const rollBtn = pressable({
    label: 'Pick another',
    className: 'small',
    onPress: () => roll(),
    ariaLabel: 'Pick another warm-up',
  });
  box.head.appendChild(rollBtn);

  function stopCards() {
    for (const card of cards) card.stop();
    cards = [];
  }

  /** Only one score plays at a time, so opening a card closes the rest. */
  function closeOthers(card) {
    for (const other of cards) {
      if (other !== card && other.isOpen()) other.close();
    }
    onOpen?.(card);
  }

  function paint() {
    stopCards();
    clear(body);
    const choice = lab.warmUp();
    const beat = beatById(choice?.beatId || '');
    const rudiment = rudimentById(choice?.rudimentId || '');

    body.appendChild(el('p', { class: 'pl-warmup-lead', text: LEAD }));

    if (!beat && !rudiment) {
      const text = rolling
        ? 'Picking a warm-up…'
        : (failed ? 'The warm-up could not be picked. Press Pick another.' : 'No warm-up is picked yet.');
      body.appendChild(notice(text, failed ? 'warn' : 'info'));
      return;
    }

    const list = el('div', { class: 'pl-warmup-list' });
    for (const [pattern, kicker] of [[beat, 'Groove'], [rudiment, 'Rudiment']]) {
      if (!pattern) continue;
      const card = createDrumScoreCard(pattern, {
        kicker,
        compact: true,
        onOpen: () => closeOthers(card),
      });
      cards.push(card);
      list.appendChild(card.root);
    }
    body.appendChild(list);
    body.appendChild(el('p', { class: 'pl-warmup-rule', text: RULE }));
  }

  async function roll() {
    if (rolling) return;
    rolling = true;
    failed = false;
    rollBtn.disabled = true;
    paint();
    try {
      await lab.rollWarmUp();
    } catch (e) {
      failed = true;
    } finally {
      rolling = false;
      rollBtn.disabled = false;
      paint();
    }
  }

  paint();
  if (!lab.warmUp()) roll();

  return {
    root: box.root,
    refresh: paint,
    /** Close every open score of the warm-up. */
    closeAll() {
      for (const card of cards) if (card.isOpen()) card.close();
    },
    stop: stopCards,
  };
}
