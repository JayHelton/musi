// Drum Notation study page.
//
// The page teaches the staff first. It draws a reading chart, a kit map, a
// note-value table, and worked bars that the reader can play. Every staff on
// the page comes from `js/drums/staffSvg.js`, so the page and the score player
// draw the same notation.
//
// The text drum tab section stays at the end, because most tabs on the web
// still use letters and dashes.

import { DRUM_TAB_LANES, DRUM_TAB_LEGEND } from './drums/notation.js';
import {
  trigger, schedulePattern, start, stop, setBpm, isPlaying, setCallbacks,
} from './drums/drumEngine.js';
import {
  DRUM_ARTICULATION_KEY,
  DRUM_NOTATION_KEY,
  NOTATION_SOUND,
  NOTE_VALUE_ROWS,
  barsToPattern,
  durationOf,
  normalizeBars,
} from './drums/staffNotation.js';
import { renderDrumStaff, renderStaffSample } from './drums/staffSvg.js';
import { renderKitMap } from './drums/kitMapSvg.js';
import {
  DRUM_STAFF_EXAMPLES,
  DRUM_TAB_EXAMPLES,
  GLYPH_NOTES,
  LANE_ALIASES,
  LANE_NOTES,
  LANE_SOUND,
  OTHER_SYMBOLS,
  countRow,
  staffExampleBars,
} from './drums/tabReferenceModel.js';

/** The sound each text-tab symbol makes, so the reader can tap a row and hear it. */
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
/** The playhead of each drawn example, keyed by example id. */
const playheads = new Map();

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function card(title, help) {
  const node = el('div', 'quiz-card dtr-card');
  if (title) node.appendChild(el('h3', 'dtr-card-title', title));
  if (help) node.appendChild(el('p', 'dtr-help', help));
  return node;
}

function scroller(child) {
  const box = el('div', 'dtr-scroll');
  box.appendChild(child);
  return box;
}

function safeTrigger(instrument) {
  try {
    trigger(instrument, 0.9);
  } catch (e) {
    /* audio may be blocked until the first gesture; the page still reads */
  }
}

/** Play the kit sound of one notation name. */
function playName(name) {
  safeTrigger(NOTATION_SOUND[name] || 'snare');
}

// ---------------------------------------------------------------- playback --

function stopExample() {
  try {
    stop();
    // The engine is shared, so the page hands the step callback back.
    setCallbacks({ onStep: null });
  } catch (e) { /* ignore */ }
  const head = playheads.get(playingId);
  if (head) head(null);
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
  root.querySelectorAll('.dtr-example').forEach((box) => {
    box.classList.toggle('is-playing', box.dataset.exampleId === playingId);
  });
}

function onEngineStep(step) {
  if (!playingId) return;
  const head = playheads.get(playingId);
  if (!head) return;
  // The engine counts sixteenth notes, and the staff counts quarter notes.
  head(step < 0 ? null : step / 4);
}

function playExample(example) {
  if (playingId === example.id) {
    stopExample();
    return;
  }
  const previous = playheads.get(playingId);
  if (previous) previous(null);
  try {
    stop();
    setCallbacks({ onStep: onEngineStep });
    schedulePattern(barsToPattern(staffExampleBars(example), `drumstaff-${example.id}`));
    setBpm(example.bpm);
    start();
    playingId = isPlaying() ? example.id : '';
  } catch (e) {
    playingId = '';
  }
  syncExampleButtons();
}

// ------------------------------------------------------------ page sections --

function buildIntro() {
  const node = card(
    'Reading drum music',
    'Drum music uses one staff of five lines. The staff carries no pitch. Each '
    + 'line and each space stands for one piece of the kit.',
  );
  const list = el('ul', 'dtr-list');
  const points = [
    'The kit sits on the staff the way it sits in front of the player: cymbals on top, snare and toms in the middle, kick on the bottom.',
    'A cymbal has a cross for its note head. A drum has a round note head.',
    'The hands point up and the feet point down. Two stems in one column mean the hands and the feet strike together.',
    'Read left to right. Everything in one column sounds at the same moment.',
    'A bar line closes a measure. The two numbers at the start are the time signature.',
  ];
  for (const text of points) list.appendChild(el('li', null, text));
  node.appendChild(list);
  return node;
}

/** Split a chart title over two short lines, the way a printed chart does. */
function labelLines(title) {
  const words = title.split(' ');
  if (words.length < 2) return [title, ''];
  const half = Math.ceil(words.length / 2);
  return [words.slice(0, half).join(' '), words.slice(half).join(' ')];
}

function buildNotationChart() {
  const node = card(
    'Basic drum notation',
    'This is the whole map. Tap a note to hear the piece it names.',
  );

  const bars = normalizeBars([{
    timeSig: [4, 4],
    voices: {
      // The chart shows where each note sits, so it draws every stem up.
      up: DRUM_NOTATION_KEY.map((row) => ({ dur: 1, notes: [row.name] })),
      down: [],
    },
  }]);
  // The bar is as long as the chart is wide, so the layout must not fold it.
  bars[0].quarters = DRUM_NOTATION_KEY.length;

  const { svg, layout } = renderDrumStaff(bars, {
    space: 11,
    quarterWidth: 86,
    barLeadIn: 44,
    barTrail: 40,
    padTop: 74,
    padBottom: 96,
    showClef: false,
    showTimeSig: false,
    showBarLines: false,
    stemMode: 'natural',
    className: 'dsn-staff--chart',
    title: 'Where each piece of the kit sits on the staff',
  });

  const NS = 'http://www.w3.org/2000/svg';
  const labelY = layout.staffBottom + layout.space * 3.4;
  DRUM_NOTATION_KEY.forEach((row, index) => {
    const column = layout.columns.find((c) => Math.abs(c.start - index) < 1e-6);
    if (!column) return;
    const lines = (row.lines && row.lines.length ? row.lines : labelLines(row.title))
      .filter(Boolean);
    lines.forEach((text, lineIndex) => {
      const label = document.createElementNS(NS, 'text');
      label.setAttribute('class', 'dsn-chartLabel');
      label.setAttribute('x', String(column.x));
      label.setAttribute('y', String(labelY + lineIndex * layout.space * 1.7));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size', String(layout.space * 1.25));
      label.textContent = text;
      svg.appendChild(label);
    });

    const hit = document.createElementNS(NS, 'rect');
    hit.setAttribute('class', 'dsn-hit');
    hit.setAttribute('x', String(column.x - layout.space * 2.6));
    hit.setAttribute('y', '0');
    hit.setAttribute('width', String(layout.space * 5.2));
    hit.setAttribute('height', String(layout.height));
    hit.setAttribute('tabindex', '0');
    hit.setAttribute('role', 'button');
    hit.setAttribute('aria-label', `${row.title}. ${row.place}`);
    const tip = document.createElementNS(NS, 'title');
    tip.textContent = `${row.title} — ${row.place}`;
    hit.appendChild(tip);
    hit.addEventListener('click', () => playName(row.name));
    hit.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        playName(row.name);
      }
    });
    svg.appendChild(hit);
  });

  node.appendChild(scroller(svg));

  const list = el('div', 'dtr-key-list');
  for (const row of DRUM_NOTATION_KEY) {
    const item = el('button', 'dtr-key-row');
    item.type = 'button';
    const sample = el('span', 'dtr-key-sample');
    sample.appendChild(renderStaffSample(row.name, { title: row.title }));
    item.appendChild(sample);
    const body = el('span', 'dtr-key-body');
    body.appendChild(el('span', 'dtr-key-name', row.title));
    body.appendChild(el('span', 'dtr-key-place', row.place));
    body.appendChild(el('span', 'dtr-key-note', row.note));
    item.appendChild(body);
    item.onclick = () => playName(row.name);
    list.appendChild(item);
  }
  node.appendChild(list);
  return node;
}

function buildKitMap() {
  const node = card(
    'The kit on the staff',
    'Each piece is drawn at the height of its own note. Tap a piece to hear it.',
  );
  node.appendChild(scroller(renderKitMap({ onPick: playName })));
  node.appendChild(el(
    'p',
    'dtr-help dtr-help-after',
    'The two cymbals off the top of the staff are the crash and the hi-hat. The '
    + 'hi-hat pedal sits under the staff, because the left foot plays it.',
  ));
  return node;
}

/** One note or one rest of a note value, drawn with no staff behind it. */
function valueSample(value, { asRest = false } = {}) {
  const dur = durationOf(value);
  const bars = normalizeBars([{
    timeSig: [4, 4],
    voices: {
      up: [asRest ? { dur, rest: true } : { dur, notes: ['snare'] }],
      down: [],
    },
  }]);
  // Every sample draws in the same box, so a whole note and a sixteenth note
  // appear at the same size.
  bars[0].quarters = 0.5;
  const { svg } = renderDrumStaff(bars, {
    space: 9,
    quarterWidth: 20,
    barLeadIn: 15,
    barTrail: 13,
    padLeft: 0,
    padRight: 0,
    padTop: 38,
    padBottom: 24,
    showClef: false,
    showTimeSig: false,
    showBarLines: false,
    showStaffLines: false,
    stemMode: 'natural',
    className: 'dsn-staff--value',
    title: asRest ? 'Rest' : 'Note',
  });
  return svg;
}

/** One 4/4 bar filled with notes of a single value. */
function valueBarSample(value, perBar) {
  const dur = durationOf(value);
  const bars = normalizeBars([{
    timeSig: [4, 4],
    voices: {
      up: Array.from({ length: perBar }, () => ({ dur, notes: ['snare'] })),
      down: [],
    },
  }]);
  const { svg } = renderDrumStaff(bars, {
    space: 7,
    quarterWidth: 48,
    barLeadIn: 14,
    barTrail: 12,
    padLeft: 2,
    padRight: 2,
    padTop: 32,
    padBottom: 14,
    showClef: false,
    showTimeSig: false,
    className: 'dsn-staff--valuebar',
    title: `${perBar} in one bar`,
  });
  return svg;
}

function buildNoteValues() {
  const node = card(
    'How long each note lasts',
    'The note head and the stem say which piece to strike. The tail of the note '
    + 'says how long to wait before the next one.',
  );

  const table = el('div', 'dtr-values');
  const head = el('div', 'dtr-value-row dtr-value-head');
  head.append(
    el('span', 'dtr-value-cell', 'Name'),
    el('span', 'dtr-value-cell', 'Note'),
    el('span', 'dtr-value-cell', 'Rest'),
    el('span', 'dtr-value-cell', 'Value'),
    el('span', 'dtr-value-cell dtr-value-bar', 'Notes per bar'),
  );
  table.appendChild(head);

  for (const row of NOTE_VALUE_ROWS) {
    const line = el('div', 'dtr-value-row');
    line.appendChild(el('span', 'dtr-value-cell dtr-value-name', row.name));
    const noteCell = el('span', 'dtr-value-cell');
    noteCell.appendChild(valueSample(row.value));
    line.appendChild(noteCell);
    const restCell = el('span', 'dtr-value-cell');
    restCell.appendChild(valueSample(row.value, { asRest: true }));
    line.appendChild(restCell);
    line.appendChild(el('span', 'dtr-value-cell dtr-value-beats', row.beats));
    const barCell = el('span', 'dtr-value-cell dtr-value-bar');
    barCell.appendChild(valueBarSample(row.value, row.perBar));
    line.appendChild(barCell);
    table.appendChild(line);
  }

  node.appendChild(scroller(table));
  node.appendChild(el(
    'p',
    'dtr-help dtr-help-after',
    'A rest holds the same length as its note, but the player strikes nothing. '
    + 'Two or more eighth notes in a row join under one beam instead of each '
    + 'note carrying its own tail.',
  ));
  return node;
}

function buildMarks() {
  const node = card(
    'Marks on a note',
    'These marks change how a note sounds, not which piece it names.',
  );
  const grid = el('div', 'dtr-marks');
  const samples = {
    accent: { name: 'snare', notes: [{ name: 'snare', accent: true }] },
    ghost: { name: 'snare', notes: [{ name: 'snare', ghost: true }] },
    flam: { name: 'snare', notes: [{ name: 'snare', flam: true }] },
    open: { name: 'hihatOpen', notes: ['hihatOpen'] },
  };
  for (const mark of DRUM_ARTICULATION_KEY) {
    const spec = samples[mark.id];
    const item = el('button', 'dtr-mark');
    item.type = 'button';
    const bars = normalizeBars([{
      timeSig: [4, 4],
      voices: { up: [{ dur: 1, notes: spec.notes }], down: [] },
    }]);
    bars[0].quarters = 1;
    const { svg } = renderDrumStaff(bars, {
      space: 9,
      quarterWidth: 30,
      barLeadIn: 30,
      barTrail: 22,
      padLeft: 2,
      padRight: 2,
      padTop: 44,
      padBottom: 26,
      showClef: false,
      showTimeSig: false,
      showBarLines: false,
      className: 'dsn-staff--mark',
      title: mark.title,
    });
    const box = el('span', 'dtr-mark-art');
    box.appendChild(svg);
    item.appendChild(box);
    const body = el('span', 'dtr-mark-body');
    body.appendChild(el('span', 'dtr-key-name', mark.title));
    body.appendChild(el('span', 'dtr-key-note', mark.note));
    item.appendChild(body);
    item.onclick = () => playName(spec.name);
    grid.appendChild(item);
  }
  node.appendChild(grid);
  return node;
}

function tabTextFor(example) {
  const source = DRUM_TAB_EXAMPLES.find((e) => e.id === example.tabId);
  if (!source) return null;
  const labelWidth = Math.max(...source.lines.map((line) => {
    const lane = DRUM_TAB_LANES.find((l) => l.key === line.lane);
    return (lane ? lane.label : line.lane).length;
  }));
  const rows = source.lines.map((line) => {
    const lane = DRUM_TAB_LANES.find((l) => l.key === line.lane);
    const label = (lane ? lane.label : line.lane).padEnd(labelWidth, ' ');
    return `${label}|${line.cells}|`;
  });
  const count = countRow(source.subdivision, source.stepsPerBar, source.bars || 1);
  rows.push(`${' '.repeat(labelWidth + 1)}${count}`);
  return rows.join('\n');
}

function buildExample(example) {
  const node = el('div', 'quiz-card dtr-card dtr-example');
  node.dataset.exampleId = example.id;

  const head = el('div', 'dtr-example-head');
  head.appendChild(el('h3', 'dtr-card-title', example.title));
  const play = el('button', 'btn sm dtr-play', '▶ Play');
  play.type = 'button';
  play.dataset.exampleId = example.id;
  play.onclick = () => playExample(example);
  head.appendChild(play);
  node.appendChild(head);

  node.appendChild(el('p', 'dtr-help', example.help));

  const bars = staffExampleBars(example);
  const { svg, setPlayhead } = renderDrumStaff(bars, {
    space: 10,
    quarterWidth: 66,
    countPerQuarter: example.countPerQuarter || 0,
    padTop: 52,
    padBottom: 56,
    className: 'dsn-staff--example',
    title: `${example.title}, in drum notation`,
  });
  playheads.set(example.id, setPlayhead);
  node.appendChild(scroller(svg));

  const tabText = tabTextFor(example);
  if (tabText) {
    const details = el('details', 'dtr-tab-toggle');
    details.appendChild(el('summary', null, 'The same bar as a text drum tab'));
    const pre = el('pre', 'dtr-tab');
    pre.textContent = tabText;
    details.appendChild(pre);
    node.appendChild(details);
  }
  return node;
}

function buildTextTab() {
  const node = card(
    'Text drum tab',
    'Most drum tabs on the web use letters and dashes instead of a staff. One row '
    + 'is one piece of the kit, and one column is one moment in time.',
  );

  const lanes = el('div', 'dtr-table dtr-lanes');
  const head = el('div', 'dtr-row dtr-head');
  head.append(
    el('span', 'dtr-cell dtr-key', 'Musi'),
    el('span', 'dtr-cell dtr-name', 'Kit piece'),
    el('span', 'dtr-cell dtr-alias', 'Also written'),
  );
  lanes.appendChild(head);
  for (const lane of DRUM_TAB_LANES) {
    const row = el('button', 'dtr-row dtr-row-btn');
    row.type = 'button';
    row.append(
      el('span', 'dtr-cell dtr-key dtr-glyph', lane.label),
      el('span', 'dtr-cell dtr-name', lane.title),
      el('span', 'dtr-cell dtr-alias', LANE_ALIASES[lane.key] || ''),
    );
    row.appendChild(el('span', 'dtr-note', LANE_NOTES[lane.key] || ''));
    row.onclick = () => safeTrigger(LANE_SOUND[lane.key] || 'snare');
    lanes.appendChild(row);
  }
  node.appendChild(lanes);

  node.appendChild(el('h3', 'dtr-card-title dtr-subtitle', 'The symbols Musi draws'));
  const symbols = el('div', 'dtr-table dtr-symbols');
  for (const entry of DRUM_TAB_LEGEND) {
    const row = el('button', 'dtr-row dtr-row-btn');
    row.type = 'button';
    row.append(
      el('span', 'dtr-cell dtr-key dtr-glyph', entry.glyph),
      el('span', 'dtr-cell dtr-name', entry.text),
    );
    row.appendChild(el('span', 'dtr-note', GLYPH_NOTES[entry.glyph] || ''));
    row.onclick = () => safeTrigger(GLYPH_SOUND[entry.glyph] || 'snare');
    symbols.appendChild(row);
  }
  node.appendChild(symbols);

  node.appendChild(el('h3', 'dtr-card-title dtr-subtitle', 'Symbols other writers use'));
  const other = el('div', 'dtr-table dtr-symbols');
  for (const entry of OTHER_SYMBOLS) {
    const row = el('div', 'dtr-row');
    row.append(
      el('span', 'dtr-cell dtr-key dtr-glyph', entry.glyph),
      el('span', 'dtr-cell dtr-name', entry.text),
    );
    other.appendChild(row);
  }
  node.appendChild(other);
  node.appendChild(el(
    'p',
    'dtr-help dtr-help-after',
    'Text drum tab has no single standard. Read the key at the top of a tab '
    + 'first, because writers spell the same hit in different ways.',
  ));
  return node;
}

// ------------------------------------------------------------------- mount --

export function initDrumTabReference() {
  root = document.getElementById('drumtab-body');
  if (!root || root.dataset.built === '1') {
    syncExampleButtons();
    return;
  }
  root.dataset.built = '1';
  playheads.clear();

  root.append(
    buildIntro(),
    buildNotationChart(),
    buildKitMap(),
    buildNoteValues(),
    buildMarks(),
  );

  const examples = el('div', 'dtr-examples');
  examples.appendChild(el('h3', 'dtr-section-title', 'Read and play these bars'));
  for (const example of DRUM_STAFF_EXAMPLES) examples.appendChild(buildExample(example));
  root.appendChild(examples);

  root.appendChild(buildTextTab());

  syncExampleButtons();
}

export function stopDrumTabReference() {
  if (playingId) stopExample();
}
