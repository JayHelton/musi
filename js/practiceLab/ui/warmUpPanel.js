// The warm-up of a drum session: one groove and one rudiment, picked for you.
//
// A player who chooses the warm-up spends the start of the session choosing.
// This panel makes the choice instead. It never offers what the last three
// sessions used, so the whole library comes round over time.
//
// The panel runs in two modes. On the setup screen it picks and re-rolls, and
// the value it holds goes onto the session record. Inside an open session it
// reads the record back and offers one button to log the warm-up as done.

import { el, clear, pressable, panel, notice } from './dom.js';
import { beatById, rudimentById, WARM_UP_COOLDOWN } from '../adapters/musiDrumLibrary.js';
import { createDrumScoreCard } from './drumScoreCard.js';

const LEAD = 'One groove and one rudiment. Play them before anything else.';
const RULE = `The picker skips whatever the last ${WARM_UP_COOLDOWN} sessions warmed up with.`;

/**
 * @param {Object} lab the Practice Lab service
 * @param {{ mode?: 'setup'|'session', onChange?: Function }} [options]
 * @returns {{
 *   root: HTMLElement, refresh: Function, choice: Function, stop: Function,
 * }}
 */
export function createWarmUpPanel(lab, { mode = 'setup', onChange } = {}) {
  const box = panel('Warm-up', 'pl-warmup');
  const body = box.body;
  let cards = [];
  let rolling = false;

  const rollBtn = pressable({
    label: 'Pick another',
    className: 'small',
    onPress: () => roll(),
    ariaLabel: 'Pick another warm-up',
  });

  const doneBtn = pressable({
    label: 'Warm-up done',
    className: 'small primary',
    onPress: async () => {
      doneBtn.disabled = true;
      await lab.completeWarmUp();
      doneBtn.textContent = 'Logged';
    },
  });

  if (mode === 'setup') box.head.appendChild(rollBtn);
  else box.head.appendChild(doneBtn);

  function stopCards() {
    for (const card of cards) card.stop();
    cards = [];
  }

  function current() {
    if (mode === 'session') return lab.session()?.warmUp || null;
    const picked = lab.warmUp();
    return picked ? { beatId: picked.beatId, rudimentId: picked.rudimentId } : null;
  }

  function paint() {
    stopCards();
    clear(body);
    const choice = current();
    const beat = beatById(choice?.beatId || '');
    const rudiment = rudimentById(choice?.rudimentId || '');

    body.appendChild(el('p', { class: 'pl-warmup-lead', text: LEAD }));

    if (!beat && !rudiment) {
      body.appendChild(notice(
        rolling ? 'Picking a warm-up…' : 'No warm-up is picked for this session.',
      ));
      return;
    }

    const list = el('div', { class: 'pl-warmup-list' });
    if (beat) {
      const card = createDrumScoreCard(beat, { kicker: 'Groove', compact: true });
      cards.push(card);
      list.appendChild(card.root);
    }
    if (rudiment) {
      const card = createDrumScoreCard(rudiment, { kicker: 'Rudiment', compact: true });
      cards.push(card);
      list.appendChild(card.root);
    }
    body.appendChild(list);
    body.appendChild(el('p', { class: 'pl-warmup-rule', text: RULE }));
  }

  async function roll() {
    if (rolling) return;
    rolling = true;
    rollBtn.disabled = true;
    paint();
    try {
      await lab.rollWarmUp();
    } finally {
      rolling = false;
      rollBtn.disabled = false;
      paint();
      onChange?.(current());
    }
  }

  paint();

  return {
    root: box.root,
    /** Pick a warm-up when none is on offer yet. The setup screen calls this. */
    async ensure() {
      if (mode !== 'setup') return current();
      if (!current()) await roll();
      return current();
    },
    refresh: paint,
    choice: current,
    stop: stopCards,
  };
}
