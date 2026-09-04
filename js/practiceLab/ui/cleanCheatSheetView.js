// The clean-vocal cheat sheet drawer.
//
// The drawer shell, the cards, the tables, and the lists come from
// `cheatSheetDrawer.js`, which the harsh sheet shares. This file holds only
// what is specific to clean vocals: which panel shows what, and the row label
// each model field carries.

import { el, notice } from './dom.js';
import {
  cheatCard,
  rowsOf,
  groupHeading,
  rulesList,
  ladderList,
  flagList,
  simpleTable,
  createCheatDrawer,
} from './cheatSheetDrawer.js';
import {
  CLEAN_CHEAT_TABS,
  CLEAN_WARM_UP,
  CLEAN_REGISTER_CARDS,
  HEAD_VS_FALSETTO,
  TWANG,
  NOSE_PINCH_TEST,
  BELTING,
  RESONANCE_CONTROLS,
  RESONANCE_WORK,
  SOVT_NOTES,
  CLEAN_FRY,
  LOW_NOTES,
  VOICE_MYTHS,
  CLEAN_RED_FLAGS,
  CLEAN_CHEAT_SOURCES,
} from '../model/cleanCheatSheet.js';

/** The row order of a register card. Every register answers the same four. */
const REGISTER_FIELDS = [
  ['whatItIs', 'What it is'],
  ['cues', 'Find it'],
  ['feelsLike', 'Feels like'],
];

/** The row order of a card that also says what the sound is like. */
const SOUND_FIELDS = [
  ['whatItIs', 'What it is'],
  ['soundsLike', 'Sounds like'],
  ['cues', 'Find it'],
  ['feelsLike', 'Feels like'],
];

/** The row order of a card with no separate sound description. */
const PLAIN_FIELDS = [
  ['whatItIs', 'What it is'],
  ['cues', 'Find it'],
  ['feelsLike', 'Feels like'],
];

/** One card built straight from a model entry that carries its own tone. */
function cardOf(data, fields) {
  return cheatCard({
    tone: data.tone,
    title: data.label,
    rows: rowsOf(fields, data),
    caution: data.watchFor ? ['Watch for', data.watchFor] : null,
  });
}

function registerCard(key) {
  const data = CLEAN_REGISTER_CARDS[key];
  return cheatCard({
    tone: data.tone,
    title: data.label,
    rows: rowsOf(REGISTER_FIELDS, data),
    caution: ['Watch for', data.watchFor],
  });
}

function controlTable() {
  return simpleTable(
    ['You move', 'It changes', 'You hear'],
    RESONANCE_CONTROLS.map(row => [row.control, row.changes, row.result]),
  );
}

function mythTable() {
  return simpleTable(
    ['You often hear', 'What is actually true'],
    VOICE_MYTHS.map(row => [row.myth, row.truth]),
  );
}

/**
 * Build the clean-vocal cheat sheet drawer.
 * @returns {{root: HTMLElement, open: Function, close: Function, toggle: Function,
 *   isOpen: Function, stop: Function}}
 */
export function createCleanCheatSheet() {
  const panels = {
    warmup: el('div', { class: 'pl-cheat-panel' }, [
      notice('Warm up in this order. The semi-occluded work is not optional — it lowers the pressure your folds need before you ask them for anything.'),
      ladderList(CLEAN_WARM_UP),
    ]),
    registers: el('div', { class: 'pl-cheat-panel pl-cheat-panel-cards' }, [
      notice('One continuum, not three boxes. Chest is one muscle leading, head is the other, and mix is the balance between them.'),
      registerCard('chest'),
      registerCard('mix'),
      registerCard('head'),
      groupHeading('The question everyone asks'),
      cardOf(HEAD_VS_FALSETTO, SOUND_FIELDS),
    ]),
    power: el('div', { class: 'pl-cheat-panel pl-cheat-panel-cards' }, [
      notice('Loudness comes from the shape of the tube, not from force at the folds. Twang is the cheapest volume you will ever get.'),
      cardOf(TWANG, SOUND_FIELDS),
      cardOf(NOSE_PINCH_TEST, PLAIN_FIELDS),
      groupHeading('Belting'),
      cardOf(BELTING, SOUND_FIELDS),
    ]),
    resonance: el('div', { class: 'pl-cheat-panel pl-cheat-panel-cards' }, [
      notice('The folds make the sound. The tract above them only lifts some harmonics and damps others. It adds no new frequency.'),
      controlTable(),
      cardOf(RESONANCE_WORK, PLAIN_FIELDS),
      cardOf(SOVT_NOTES, PLAIN_FIELDS),
    ]),
    edges: el('div', { class: 'pl-cheat-panel pl-cheat-panel-cards' }, [
      notice('Both ends of the voice want the same thing: firm closure and very little air.'),
      cardOf(CLEAN_FRY, SOUND_FIELDS),
      cardOf(LOW_NOTES, SOUND_FIELDS),
    ]),
    myths: el('div', { class: 'pl-cheat-panel' }, [
      notice('A singer who chases a sensation instead of a muscle balance stays stuck. Keep the cues. Drop the explanations.'),
      mythTable(),
      rulesList([
        'Sensation is feedback, not mechanism. Every placement cue describes a feeling, not a sound.',
        'Your own voice reaches you through bone, which cuts the highs. You sound thinner outside your head than inside it. Record yourself.',
        'Loudness and carrying power come from the tube, not from the folds. Shape before you push.',
      ]),
    ]),
    redflags: el('div', { class: 'pl-cheat-panel' }, [
      flagList(CLEAN_RED_FLAGS),
      notice('A practice reminder, not medical advice.', 'warn'),
    ]),
  };

  return createCheatDrawer({
    idPrefix: 'clean',
    title: 'Clean Vocal Cheat Sheet',
    tabs: CLEAN_CHEAT_TABS,
    panels,
    sources: CLEAN_CHEAT_SOURCES,
  });
}
