// The Prompts tab of Riff Spark.
//
// Cards, a brief, and the drill. A card is one push. A brief is four cards
// that make one session. The drill is the twenty-seven minute routine, with a
// clock on each step.

import {
  DECKS, DRILL_STEPS, drawCard, drawBrief, drillTotalMinutes, deckById,
} from './promptDeck.js';
import { el, clear, btn, panel, hint } from './dom.js';

function cardNode(card, deckLabel = '') {
  return el('article', { class: 'sk-card' }, [
    deckLabel ? el('span', { class: 'sk-card-deck', text: deckLabel }) : null,
    el('h4', { class: 'sk-card-title', text: card.title }),
    el('p', { class: 'sk-card-body', text: card.body }),
    card.hint ? el('p', { class: 'sk-card-hint', text: card.hint }) : null,
  ]);
}

function mmss(totalSec) {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * @returns {{root: HTMLElement, stop: Function}}
 */
export function createPromptsView() {
  const root = el('div', { class: 'sk-root' });

  /* --- one card ----------------------------------------------------------- */

  let deckId = 'restriction';
  let lastCardId = '';
  const cardHost = el('div', { class: 'sk-card-host' });
  const deckBlurb = hint('');
  const deckRow = el('div', { class: 'sk-chips' });

  function paintDecks() {
    clear(deckRow);
    for (const deck of DECKS) {
      const on = deck.id === deckId;
      deckRow.appendChild(btn({
        label: deck.label, className: `sk-chip${on ? ' active' : ''}`, pressed: on,
        onPress: () => { deckId = deck.id; lastCardId = ''; paintDecks(); draw(); },
      }));
    }
    deckBlurb.textContent = deckById(deckId).blurb;
  }

  function draw() {
    const card = drawCard(deckId, { exclude: lastCardId });
    lastCardId = card.id;
    clear(cardHost);
    cardHost.appendChild(cardNode(card));
  }

  const cardPanel = panel('One card');
  cardPanel.body.append(
    deckRow,
    deckBlurb,
    cardHost,
    el('div', { class: 'sk-row' }, [btn({ label: 'Draw a card', className: 'primary', onPress: draw })]),
  );

  /* --- the brief ---------------------------------------------------------- */

  const briefHost = el('div', { class: 'sk-brief' });
  const briefSeed = hint('');
  function brief() {
    const result = drawBrief();
    clear(briefHost);
    for (const { deck, card } of result.cards) briefHost.appendChild(cardNode(card, deckById(deck).label));
    briefSeed.textContent = `Brief ${result.seed}. Write for ten minutes under all four cards.`;
  }

  const briefPanel = panel('A brief');
  briefPanel.body.append(
    hint('One interval color, one restriction, one density arc, and one next step. Together they are a session.'),
    briefHost,
    briefSeed,
    el('div', { class: 'sk-row' }, [btn({ label: 'Draw a brief', className: 'primary', onPress: brief })]),
  );

  /* --- the drill ---------------------------------------------------------- */

  let stepIndex = -1;
  let remainingSec = 0;
  let timer = null;
  const stepList = el('ol', { class: 'sk-drill-steps' });
  const clock = el('div', { class: 'sk-drill-clock', text: '--:--' });
  const startButton = btn({ label: `Start the drill (${drillTotalMinutes()} min)`, className: 'primary', onPress: () => start() });
  const nextButton = btn({ label: 'Next step', onPress: () => advance(), disabled: true });
  const stopButton = btn({ label: 'Stop', onPress: () => stop(), disabled: true });

  function paintSteps() {
    clear(stepList);
    DRILL_STEPS.forEach((step, i) => {
      const state = i < stepIndex ? 'done' : i === stepIndex ? 'active' : '';
      stepList.appendChild(el('li', { class: `sk-drill-step ${state}`.trim() }, [
        el('span', { class: 'sk-drill-min', text: `${step.minutes} min` }),
        el('span', { class: 'sk-drill-text' }, [el('strong', { text: step.title }), ` ${step.body}`]),
      ]));
    });
  }

  function tick() {
    remainingSec -= 1;
    clock.textContent = mmss(remainingSec);
    if (remainingSec <= 0) advance();
  }

  function begin(index) {
    stepIndex = index;
    remainingSec = DRILL_STEPS[index].minutes * 60;
    clock.textContent = mmss(remainingSec);
    paintSteps();
  }

  function start() {
    stop();
    begin(0);
    timer = setInterval(tick, 1000);
    startButton.disabled = true;
    nextButton.disabled = false;
    stopButton.disabled = false;
  }

  function advance() {
    if (stepIndex + 1 >= DRILL_STEPS.length) {
      stop();
      clock.textContent = 'Done';
      return;
    }
    begin(stepIndex + 1);
  }

  function stop() {
    if (timer != null) clearInterval(timer);
    timer = null;
    stepIndex = -1;
    clock.textContent = '--:--';
    startButton.disabled = false;
    nextButton.disabled = true;
    stopButton.disabled = true;
    paintSteps();
  }

  const drillPanel = panel('The drill');
  drillPanel.head.appendChild(clock);
  drillPanel.body.append(
    hint('Do not judge during the drill. Keep every idea in the Bank and edit later.'),
    stepList,
    el('div', { class: 'sk-row' }, [startButton, nextButton, stopButton]),
  );

  root.append(cardPanel.root, briefPanel.root, drillPanel.root);
  paintDecks();
  draw();
  brief();
  paintSteps();

  return { root, stop };
}
