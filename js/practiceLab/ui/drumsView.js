// The Drums tab of the Practice Lab: the warm-up, the beat library, and the
// rudiment library.
//
// The tab answers one question — "what do I play today?" — and it answers it
// three times: a warm-up picked for you, a groove with a fill that belongs to
// its genre, and a rudiment with a full sticking. Every entry opens in the
// Guitar Pro player, so the player can hear it, loop it, and slow it down.
//
// The screen keeps one score open at a time. Two mounted players would fight
// over the audio and over the screen.

import { el, clear, chip, tabBar, notice } from './dom.js';
import {
  BEATS, BEAT_GENRES, RUDIMENTS, RUDIMENT_FAMILIES,
} from '../adapters/musiDrumLibrary.js';
import { createDrumScoreCard } from './drumScoreCard.js';
import { createWarmUpPanel } from './warmUpPanel.js';

const VIEWS = [
  { id: 'beats', label: 'Beats' },
  { id: 'rudiments', label: 'Rudiments' },
];

const LEAD = {
  beats: 'Three bars of the groove and one bar of a fill that fits the genre. '
    + 'No entry runs longer than eight bars.',
  rudiments: 'Every stroke names its hand. The first bar leads with the right '
    + 'hand and the second bar leads with the left.',
};

const ALL = '__all__';

/**
 * @param {Object} lab the Practice Lab service; it picks the warm-up
 * @returns {{ root: HTMLElement, stop: Function }}
 */
export function createDrumsView(lab) {
  let view = 'beats';
  const filter = { beats: ALL, rudiments: ALL };
  let cards = [];

  const lead = el('p', { class: 'pl-drums-lead', text: LEAD.beats });
  const filterRow = el('div', { class: 'pl-chip-row pl-drums-filter' });
  const list = el('div', { class: 'pl-drums-list' });

  const tabs = tabBar({
    tabs: VIEWS,
    active: view,
    ariaLabel: 'Drum library',
    onChange: (id) => { view = id; paint(); },
  });

  function stopCards() {
    for (const card of cards) card.stop();
    cards = [];
  }

  // Only one score plays at a time, so opening a card closes the rest, the
  // warm-up cards included.
  function closeOthers(card) {
    for (const other of cards) {
      if (other !== card && other.isOpen()) other.close();
    }
    if (card) warmUp.closeAll();
  }

  const warmUp = createWarmUpPanel(lab, { onOpen: () => closeOthers(null) });

  function groups() {
    return view === 'beats' ? BEAT_GENRES : RUDIMENT_FAMILIES;
  }

  function entries() {
    const all = view === 'beats' ? BEATS : RUDIMENTS;
    const key = view === 'beats' ? 'genre' : 'family';
    const pick = filter[view];
    return pick === ALL ? all : all.filter((entry) => entry[key] === pick);
  }

  function paintFilter() {
    clear(filterRow);
    const pick = filter[view];
    const options = [{ id: ALL, label: 'All' }, ...groups().map((g) => ({ id: g, label: g }))];
    for (const option of options) {
      filterRow.appendChild(chip({
        label: option.label,
        selected: option.id === pick,
        onSelect: () => { filter[view] = option.id; paint(); },
      }));
    }
  }

  function paintList() {
    stopCards();
    clear(list);
    const found = entries();
    if (!found.length) {
      list.appendChild(notice('Nothing here yet.'));
      return;
    }
    for (const entry of found) {
      // The card calls back before it mounts its player, so the one that was
      // open closes first.
      const card = createDrumScoreCard(entry, {
        kicker: view === 'beats' ? entry.genre : `${entry.family} rudiment`,
        onOpen: () => closeOthers(card),
      });
      cards.push(card);
      list.appendChild(card.root);
    }
  }

  function paint() {
    lead.textContent = LEAD[view];
    paintFilter();
    paintList();
  }

  const root = el('div', { class: 'pl-drums' }, [
    warmUp.root,
    el('div', { class: 'pl-drums-head' }, [
      el('h3', { class: 'pl-drums-title', text: 'Drum library' }),
      lead,
    ]),
    tabs.root,
    filterRow,
    list,
  ]);

  paint();

  return {
    root,
    stop() { stopCards(); warmUp.stop(); },
  };
}
