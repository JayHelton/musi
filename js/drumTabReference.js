// Drum Tab reference page — what each line and each symbol in a drum tab means.
//
// The text and the worked bars live in `js/drums/tabReferenceModel.js`, which
// has no DOM. This file draws them and plays them with the built-in kit.

import { DRUM_TAB_LANES, DRUM_TAB_LEGEND } from './drums/notation.js';
import { trigger, schedulePattern, start, stop, setBpm, isPlaying } from './drums/drumEngine.js';
import {
  DRUM_TAB_EXAMPLES,
  GLYPH_NOTES,
  LANE_ALIASES,
  LANE_NOTES,
  LANE_SOUND,
  OTHER_SYMBOLS,
  countRow,
  examplePattern,
} from './drums/tabReferenceModel.js';

/** The sound each Musi symbol makes, so the reader can tap a row and hear it. */
const GLYPH_SOUND = {
  x: 'hihatClosed',
  X: 'crash',
  o: 'snare',
  O: 'hihatOpen',
  '+': 'hihatClosed',
  b: 'ride',
  '@': 'snare',
  g: 'snareGhost',
  f: 'snareFlam',
};

let root = null;
let playingId = '';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function safeTrigger(instrument) {
  try {
    trigger(instrument, 0.9);
  } catch (e) {
    /* audio may be blocked until the first gesture; the page still reads */
  }
}

function stopExample() {
  try {
    stop();
  } catch (e) { /* ignore */ }
  playingId = '';
  syncExampleButtons();
}

function syncExampleButtons() {
  if (!root) return;
  root.querySelectorAll('.dtr-play').forEach((btn) => {
    const on = btn.dataset.exampleId === playingId;
    btn.textContent = on ? '■ Stop' : '▶ Play';
    btn.classList.toggle('is-on', on);
  });
}

function playExample(example) {
  if (playingId === example.id) {
    stopExample();
    return;
  }
  try {
    stop();
    schedulePattern(examplePattern(example));
    setBpm(example.bpm);
    start();
    playingId = isPlaying() ? example.id : '';
  } catch (e) {
    playingId = '';
  }
  syncExampleButtons();
}

function buildIntro() {
  const card = el('div', 'quiz-card dtr-card');
  card.appendChild(el('h3', 'dtr-card-title', 'How a drum tab is laid out'));

  const list = el('ul', 'dtr-list');
  const points = [
    'Every line is one piece of the kit. The label on the left names it.',
    'The lines run from the highest piece to the lowest: cymbals on top, kick on the bottom. That is roughly how the kit sits in front of the player.',
    'Read left to right. One column is one moment in time, so everything in a column is struck together.',
    'A dash holds a column open. It means this line plays nothing at that moment.',
    'A vertical bar is a bar line. It marks the end of a measure.',
    'A count row under the bar names the beats, for example "1 + 2 + 3 + 4 +" for eighth notes.',
    'There is no single standard. Read the key at the top of a tab first, because writers spell the same hit in different ways.',
  ];
  for (const text of points) list.appendChild(el('li', null, text));
  card.appendChild(list);
  return card;
}

function buildLanes() {
  const card = el('div', 'quiz-card dtr-card');
  card.appendChild(el('h3', 'dtr-card-title', 'The lines'));
  card.appendChild(el('p', 'dtr-help', 'Tap a row to hear the piece.'));

  const table = el('div', 'dtr-table dtr-lanes');
  const head = el('div', 'dtr-row dtr-head');
  head.append(
    el('span', 'dtr-cell dtr-key', 'Musi'),
    el('span', 'dtr-cell dtr-name', 'Kit piece'),
    el('span', 'dtr-cell dtr-alias', 'Also written'),
  );
  table.appendChild(head);

  for (const lane of DRUM_TAB_LANES) {
    const row = el('button', 'dtr-row dtr-row-btn');
    row.type = 'button';
    row.append(
      el('span', 'dtr-cell dtr-key dtr-glyph', lane.label),
      el('span', 'dtr-cell dtr-name', lane.title),
      el('span', 'dtr-cell dtr-alias', LANE_ALIASES[lane.key] || ''),
    );
    const note = el('span', 'dtr-note', LANE_NOTES[lane.key] || '');
    row.appendChild(note);
    row.onclick = () => safeTrigger(LANE_SOUND[lane.key] || 'snare');
    table.appendChild(row);
  }

  card.appendChild(table);
  card.appendChild(el(
    'p',
    'dtr-help',
    'A tab may add a line for the hi-hat played with the foot. Writers label it Hf or HF, '
    + 'and Musi spells that hit with a plus on the hi-hat line.',
  ));
  return card;
}

function buildSymbols() {
  const card = el('div', 'quiz-card dtr-card');
  card.appendChild(el('h3', 'dtr-card-title', 'The symbols Musi draws'));
  card.appendChild(el('p', 'dtr-help', 'Tap a row to hear the hit.'));

  const table = el('div', 'dtr-table dtr-symbols');
  for (const entry of DRUM_TAB_LEGEND) {
    const row = el('button', 'dtr-row dtr-row-btn');
    row.type = 'button';
    row.append(
      el('span', 'dtr-cell dtr-key dtr-glyph', entry.glyph),
      el('span', 'dtr-cell dtr-name', entry.text),
    );
    row.appendChild(el('span', 'dtr-note', GLYPH_NOTES[entry.glyph] || ''));
    row.onclick = () => safeTrigger(GLYPH_SOUND[entry.glyph] || 'snare');
    table.appendChild(row);
  }
  card.appendChild(table);

  card.appendChild(el('h3', 'dtr-card-title dtr-subtitle', 'Symbols other writers use'));
  const other = el('div', 'dtr-table dtr-symbols');
  for (const entry of OTHER_SYMBOLS) {
    const row = el('div', 'dtr-row');
    row.append(
      el('span', 'dtr-cell dtr-key dtr-glyph', entry.glyph),
      el('span', 'dtr-cell dtr-name', entry.text),
    );
    other.appendChild(row);
  }
  card.appendChild(other);
  return card;
}

function buildExample(example) {
  const card = el('div', 'quiz-card dtr-card dtr-example');

  const head = el('div', 'dtr-example-head');
  head.appendChild(el('h3', 'dtr-card-title', example.title));
  const play = el('button', 'btn sm dtr-play', '▶ Play');
  play.type = 'button';
  play.dataset.exampleId = example.id;
  play.onclick = () => playExample(example);
  head.appendChild(play);
  card.appendChild(head);

  card.appendChild(el('p', 'dtr-help', example.help));

  const grid = el('pre', 'dtr-tab');
  const labelWidth = Math.max(...example.lines.map((line) => {
    const lane = DRUM_TAB_LANES.find((l) => l.key === line.lane);
    return (lane ? lane.label : line.lane).length;
  }));
  const rows = example.lines.map((line) => {
    const lane = DRUM_TAB_LANES.find((l) => l.key === line.lane);
    const label = (lane ? lane.label : line.lane).padEnd(labelWidth, ' ');
    return `${label}|${line.cells}|`;
  });
  // The count row lines up under the cells, past the label and the first bar line.
  const count = countRow(example.subdivision, example.stepsPerBar, example.bars || 1);
  rows.push(`${' '.repeat(labelWidth + 1)}${count}`);
  grid.textContent = rows.join('\n');
  card.appendChild(grid);
  return card;
}

export function initDrumTabReference() {
  root = document.getElementById('drumtab-body');
  if (!root || root.dataset.built === '1') {
    syncExampleButtons();
    return;
  }
  root.dataset.built = '1';

  root.append(buildIntro(), buildLanes(), buildSymbols());

  const examples = el('div', 'dtr-examples');
  examples.appendChild(el('h3', 'dtr-section-title', 'Read these bars'));
  for (const example of DRUM_TAB_EXAMPLES) examples.appendChild(buildExample(example));
  root.appendChild(examples);

  syncExampleButtons();
}

export function stopDrumTabReference() {
  if (playingId) stopExample();
}

