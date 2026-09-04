// The harsh-vocal cheat sheet drawer.
//
// The drawer shell, the cards, the tables, and the lists come from
// `cheatSheetDrawer.js`, which the clean sheet shares. This file holds only
// what is specific to harsh vocals: which panel shows what, and the row label
// each model field carries.
//
// The model holds the text and no labels, so the field order below is the one
// place that decides how a card reads.

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
  HARSH_CHEAT_TABS,
  WARM_UP_LADDER,
  MECHANISM_MAP,
  FALSE_CORD_REGISTERS,
  SUPRAGLOTTIC_SOURCES,
  TRUE_CORD_HIGHS,
  HYBRID_SCREAM,
  TONGUE_TONE_TABLE,
  TONGUE_RULES,
  GUTTURAL_LOWS,
  GUTTURAL_RULES,
  TROUBLESHOOTING,
  RED_FLAGS,
  CHEAT_SHEET_SOURCES,
} from '../model/harshCheatSheet.js';

const REGISTER_FIELDS = [
  ['activation', 'Activation'],
  ['cues', 'Try these'],
  ['placement', 'Placement'],
  ['mouth', 'Mouth & tongue'],
  ['breath', 'Breath'],
  ['feelsLike', 'Feels like'],
];

const TRUE_CORD_FIELDS = [
  ['whatItIs', 'What it is'],
  ['warmIntoLast', 'Warm into this last'],
  ['activation', 'Activation'],
  ['cues', 'Try these'],
  ['ridingIt', 'Riding it'],
  ['placement', 'Placement'],
  ['breath', 'Breath'],
];

const SUPRAGLOTTIC_FIELDS = [
  ['whatVibrates', 'What vibrates'],
  ['soundsLike', 'Sounds like'],
  ['findIt', 'Find it'],
  ['cues', 'Try these'],
  ['feelsLike', 'Feels like'],
];

const HYBRID_FIELDS = [
  ['whatItIs', 'What it is'],
  ['prerequisite', 'Learn these first'],
  ['soundsLike', 'Sounds like'],
  ['activation', 'Activation'],
  ['cues', 'Try these'],
  ['feelsLike', 'Feels like'],
];

const GUTTURAL_FIELDS = [
  ['whatItIs', 'What it is'],
  ['shape', 'Shape'],
  ['activation', 'Activation'],
  ['cues', 'Try these'],
  ['feelsLike', 'Feels like'],
];

function registerCard(register, data) {
  return cheatCard({
    tone: register,
    title: data.label,
    rows: rowsOf(REGISTER_FIELDS, data),
  });
}

function mechanismTable() {
  return simpleTable(
    ['Sound', 'What vibrates', 'Where it is on this sheet'],
    MECHANISM_MAP.map(row => [row.sound, row.vibrates, row.sits]),
  );
}

function tongueTable() {
  return simpleTable(
    ['Tongue position', 'Vowel', 'Effect', 'Pairs with'],
    TONGUE_TONE_TABLE.map(row => [row.position, row.vowel, row.effect, row.pairsWith]),
  );
}

/**
 * Build the harsh-vocal cheat sheet drawer.
 * @returns {{root: HTMLElement, open: Function, close: Function, toggle: Function,
 *   isOpen: Function, stop: Function}}
 */
export function createHarshCheatSheet() {
  const panels = {
    warmup: el('div', { class: 'pl-cheat-panel' }, [
      notice('The order that gets you into distortion safely — hydrate, breathe, then warm up in this order.'),
      ladderList(WARM_UP_LADDER),
    ]),
    falsecord: el('div', { class: 'pl-cheat-panel pl-cheat-panel-cards' }, [
      notice('Every sound on this tab happens above the true vocal folds. Learn one at a time.'),
      mechanismTable(),
      groupHeading('False cord, by register'),
      registerCard('low', FALSE_CORD_REGISTERS.low),
      registerCard('mid', FALSE_CORD_REGISTERS.mid),
      registerCard('high', FALSE_CORD_REGISTERS.high),
      groupHeading('Other sources above the cords'),
      ...SUPRAGLOTTIC_SOURCES.map(entry => cheatCard({
        tone: entry.tone,
        title: entry.label,
        rows: rowsOf(SUPRAGLOTTIC_FIELDS, entry),
        caution: ['Watch for', entry.watchFor],
      })),
    ]),
    truecord: el('div', { class: 'pl-cheat-panel pl-cheat-panel-cards' }, [
      cheatCard({
        tone: 'truecord',
        title: TRUE_CORD_HIGHS.label,
        rows: rowsOf(TRUE_CORD_FIELDS, TRUE_CORD_HIGHS),
        caution: ['Hard stop', TRUE_CORD_HIGHS.hardStop],
      }),
      cheatCard({
        tone: HYBRID_SCREAM.tone,
        title: HYBRID_SCREAM.label,
        rows: rowsOf(HYBRID_FIELDS, HYBRID_SCREAM),
        caution: ['Watch for', HYBRID_SCREAM.watchFor],
      }),
    ]),
    tongue: el('div', { class: 'pl-cheat-panel' }, [
      tongueTable(),
      rulesList(TONGUE_RULES),
      groupHeading('Lows and gutturals'),
      notice('Use control, not volume. That is the whole section.', 'warn'),
      ...GUTTURAL_LOWS.map(entry => cheatCard({
        tone: entry.tone,
        title: entry.label,
        rows: rowsOf(GUTTURAL_FIELDS, entry),
        caution: ['Watch for', entry.watchFor],
      })),
      rulesList(GUTTURAL_RULES),
    ]),
    fixit: el('div', { class: 'pl-cheat-panel pl-cheat-panel-cards' }, [
      notice('Every card above teaches one sound. This tab covers what applies to all of them, and it is the part most singers skip.'),
      ...TROUBLESHOOTING.map(entry => cheatCard({
        tone: entry.tone,
        title: entry.label,
        rows: [['Problem', entry.problem], ['Do this', entry.fix]],
      })),
    ]),
    redflags: el('div', { class: 'pl-cheat-panel' }, [
      flagList(RED_FLAGS),
      notice('A practice reminder, not medical advice.', 'warn'),
    ]),
  };

  return createCheatDrawer({
    idPrefix: 'harsh',
    title: 'Harsh Vocal Cheat Sheet',
    tabs: HARSH_CHEAT_TABS,
    panels,
    sources: CHEAT_SHEET_SOURCES,
  });
}
