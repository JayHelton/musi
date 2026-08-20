// DOM-free model for the Drum Notation study page.
//
// The page teaches the staff first: five lines, one line or space for each
// piece of the kit. `DRUM_STAFF_EXAMPLES` holds the bars the page draws and
// plays. The staff places themselves come from `js/drums/staffNotation.js`.
//
// Text drum tab is the second format the page covers, because most tabs on the
// web still use it. Drum tab has no single standard, so this file states what
// Musi draws first, then lists the spellings other writers use. The lane list
// and the symbol list come from `js/drums/notation.js`, so the page and the
// score views never drift apart.

import { normalizeBars } from './staffNotation.js';

/** The instrument each lane plays when the reader taps it. */
export const LANE_SOUND = {
  crash: 'crash',
  ride: 'ride',
  hihat: 'hihatClosed',
  snare: 'snare',
  tomHigh: 'tomHigh',
  tomMid: 'tomMid',
  tomFloor: 'tomFloor',
  kick: 'kick',
};

/** How other writers label the same line. */
export const LANE_ALIASES = {
  crash: 'CC, Cr, C',
  ride: 'RD, RC, R',
  hihat: 'HH, H',
  snare: 'SD, SN, S',
  tomHigh: 'HT, T1, T',
  tomMid: 'MT, T2',
  tomFloor: 'FT, LT, F',
  kick: 'BD, B, K',
};

/** What each lane is, in one sentence. */
export const LANE_NOTES = {
  crash: 'The accent cymbal. It marks the first beat of a section or a landing after a fill.',
  ride: 'The steady cymbal for louder or more open sections. It replaces the hi-hat.',
  hihat: 'The usual timekeeper. Closed by default; an open hit gets its own symbol.',
  snare: 'The backbeat. In 4/4 rock it lands on beats 2 and 4.',
  tomHigh: 'The highest tom, usually mounted over the kick drum.',
  tomMid: 'The second mounted tom. A three-piece kit often leaves this line out.',
  tomFloor: 'The lowest tom, standing on the floor beside the player.',
  kick: 'The bass drum, played with the right foot. It sits on the bottom line.',
};

/** Where each Musi symbol usually appears, and what the player does. */
export const GLYPH_NOTES = {
  x: 'On a cymbal line. Strike the closed hi-hat or the ride with the stick tip.',
  X: 'A harder hit on a cymbal line, or a hi-hat struck while it is loose.',
  o: 'On a drum line. A plain hit on the snare, a tom, or the kick.',
  O: 'A stronger drum hit. On the hi-hat line it means the hi-hat is open.',
  '+': 'The hi-hat closed with the foot. It makes a short "chick".',
  b: 'The bell of the ride cymbal, struck with the shoulder of the stick.',
  '@': 'A cross stick: the stick lies on the head and the shaft strikes the rim.',
  g: 'A ghost note. Play it very quietly, just under the main pattern.',
  f: 'A flam. Two hands strike almost together, one grace note then the main hit.',
};

/** Spellings other writers use that Musi does not draw. */
export const OTHER_SYMBOLS = [
  { glyph: '-', text: 'Nothing on this line at this moment. It holds the column open.' },
  { glyph: '|', text: 'A bar line. It marks the end of a measure.' },
  { glyph: 'd', text: 'A drag: two quiet grace notes before the main hit.' },
  { glyph: 'r', text: 'A buzz roll, or a roll of unmeasured strokes.' },
  { glyph: '#', text: 'A choke: strike the cymbal, then grab it to stop the ring.' },
  {
    glyph: 'b / B',
    text: 'A soft or accented one-handed roll. Musi uses b for the ride bell instead, '
      + 'so read the key at the top of any tab before you play it.',
  },
];

/** Shorthand for one hit that the reader must play louder. */
const accent = (name) => ({ name, accent: true });
/** Shorthand for one hit that the reader must play very quietly. */
const ghost = (name) => ({ name, ghost: true });

/** A quarter-note rest. */
const rest = (dur) => ({ dur, rest: true });

/**
 * The bars the study page draws on a staff and plays with the built-in kit.
 *
 * Each bar holds two voices. `up` is what the hands play, and the layout draws
 * it with the stems up. `down` is what the feet play, with the stems down.
 * Every entry states its own length in quarter notes, so the layout can pick
 * the note value, the beams, and the rests without any grid.
 */
export const DRUM_STAFF_EXAMPLES = [
  {
    id: 'rock',
    title: 'Straight rock beat',
    help: 'The hi-hat keeps eighth notes. The kick takes beats 1 and 3, and the '
      + 'snare takes beats 2 and 4.',
    bpm: 92,
    tabId: 'rock',
    countPerQuarter: 2,
    bars: [{
      timeSig: [4, 4],
      voices: {
        up: [
          { dur: 0.5, notes: ['hihatClosed'] },
          { dur: 0.5, notes: ['hihatClosed'] },
          { dur: 0.5, notes: ['hihatClosed', 'snare'] },
          { dur: 0.5, notes: ['hihatClosed'] },
          { dur: 0.5, notes: ['hihatClosed'] },
          { dur: 0.5, notes: ['hihatClosed'] },
          { dur: 0.5, notes: ['hihatClosed', 'snare'] },
          { dur: 0.5, notes: ['hihatClosed'] },
        ],
        down: [
          { dur: 1, notes: ['kick'] },
          rest(1),
          { dur: 1, notes: ['kick'] },
          rest(1),
        ],
      },
    }],
  },
  {
    id: 'voices',
    title: 'Two voices: hands up, feet down',
    help: 'The ride and the snare point up, because the hands play them. The kick '
      + 'and the hi-hat pedal point down, because the feet play them.',
    bpm: 88,
    countPerQuarter: 2,
    bars: [{
      timeSig: [4, 4],
      voices: {
        up: [
          { dur: 1, notes: ['ride'] },
          { dur: 1, notes: ['ride', 'snare'] },
          { dur: 1, notes: ['ride'] },
          { dur: 1, notes: ['ride', 'snare'] },
        ],
        down: [
          { dur: 1, notes: ['kick'] },
          { dur: 1, notes: ['hihatPedal'] },
          { dur: 1, notes: ['kick'] },
          { dur: 1, notes: ['hihatPedal'] },
        ],
      },
    }],
  },
  {
    id: 'open',
    title: 'An open hi-hat',
    help: 'A circle around the cross opens the hi-hat. The last eighth note rings '
      + 'on into the next bar.',
    bpm: 92,
    tabId: 'open',
    countPerQuarter: 2,
    bars: [{
      timeSig: [4, 4],
      voices: {
        up: [
          { dur: 0.5, notes: ['hihatClosed'] },
          { dur: 0.5, notes: ['hihatClosed'] },
          { dur: 0.5, notes: ['hihatClosed', 'snare'] },
          { dur: 0.5, notes: ['hihatClosed'] },
          { dur: 0.5, notes: ['hihatClosed'] },
          { dur: 0.5, notes: ['hihatClosed'] },
          { dur: 0.5, notes: ['hihatClosed', 'snare'] },
          { dur: 0.5, notes: ['hihatOpen'] },
        ],
        down: [
          { dur: 1, notes: ['kick'] },
          rest(1),
          { dur: 1, notes: ['kick'] },
          rest(0.5),
          { dur: 0.5, notes: ['kick'] },
        ],
      },
    }],
  },
  {
    id: 'ghost',
    title: 'Accents and ghost notes',
    help: 'The snare on 2 and 4 carries an accent, so it is the loudest hit. The '
      + 'snare notes in brackets are ghost notes: play them very quietly.',
    bpm: 84,
    tabId: 'ghost',
    countPerQuarter: 4,
    bars: [{
      timeSig: [4, 4],
      voices: {
        up: [
          { dur: 0.5, notes: ['hihatClosed'] },
          { dur: 0.25, notes: ['hihatClosed'] },
          { dur: 0.25, notes: [ghost('snare')] },
          { dur: 0.5, notes: ['hihatClosed', accent('snare')] },
          { dur: 0.25, notes: ['hihatClosed'] },
          { dur: 0.25, notes: [ghost('snare')] },
          { dur: 0.5, notes: ['hihatClosed'] },
          { dur: 0.25, notes: ['hihatClosed'] },
          { dur: 0.25, notes: [ghost('snare')] },
          { dur: 0.5, notes: ['hihatClosed', accent('snare')] },
          { dur: 0.5, notes: ['hihatClosed'] },
        ],
        down: [
          { dur: 1, notes: ['kick'] },
          rest(1),
          { dur: 0.5, notes: ['kick'] },
          rest(0.5),
          { dur: 0.5, notes: ['kick'] },
          rest(0.5),
        ],
      },
    }],
  },
  {
    id: 'fill',
    title: 'A tom fill into a crash',
    help: 'The fill runs down the kit in sixteenth notes. The crash and the kick '
      + 'then land together on beat 1 of the next bar.',
    bpm: 92,
    tabId: 'fill',
    countPerQuarter: 4,
    bars: [
      {
        timeSig: [4, 4],
        voices: {
          up: [
            { dur: 0.5, notes: ['hihatClosed'] },
            { dur: 0.5, notes: ['hihatClosed'] },
            { dur: 0.5, notes: ['hihatClosed', 'snare'] },
            { dur: 0.5, notes: ['hihatClosed'] },
            { dur: 0.25, notes: ['snare'] },
            { dur: 0.25, notes: ['snare'] },
            { dur: 0.25, notes: ['tomHigh'] },
            { dur: 0.25, notes: ['tomHigh'] },
            { dur: 0.25, notes: ['tomMid'] },
            { dur: 0.25, notes: ['tomMid'] },
            { dur: 0.25, notes: ['tomFloor'] },
            { dur: 0.25, notes: ['tomFloor'] },
          ],
          down: [
            { dur: 1, notes: ['kick'] },
            rest(1),
            rest(1),
            rest(1),
          ],
        },
      },
      {
        timeSig: [4, 4],
        voices: {
          up: [
            { dur: 0.5, notes: [accent('crash')] },
            { dur: 0.5, notes: ['hihatClosed'] },
            { dur: 0.5, notes: ['hihatClosed', 'snare'] },
            { dur: 0.5, notes: ['hihatClosed'] },
            { dur: 0.5, notes: ['hihatClosed'] },
            { dur: 0.5, notes: ['hihatClosed'] },
            { dur: 0.5, notes: ['hihatClosed', 'snare'] },
            { dur: 0.5, notes: ['hihatClosed'] },
          ],
          down: [
            { dur: 1, notes: ['kick'] },
            rest(1),
            { dur: 1, notes: ['kick'] },
            rest(1),
          ],
        },
      },
    ],
  },
];

/** The same examples, with every derived field filled in. */
export function staffExampleBars(example) {
  return normalizeBars(example.bars);
}

/** The same bars written as text drum tab.
 *
 * The page shows these under each staff example, so a reader can match the two
 * formats. A row is one character per grid step. A `|` in a row is a bar line:
 * it is drawn, and it takes no step of its own.
 */
export const DRUM_TAB_EXAMPLES = [
  {
    id: 'rock',
    title: 'Straight rock beat',
    help: 'Eighth notes on the hi-hat. The kick takes 1 and 3, the snare takes 2 and 4.',
    subdivision: '8th',
    stepsPerBar: 8,
    bars: 1,
    bpm: 92,
    lines: [
      { lane: 'hihat', cells: 'x-x-x-x-' },
      { lane: 'snare', cells: '----o---' },
      { lane: 'kick', cells: 'o---o---' },
    ],
  },
  {
    id: 'open',
    title: 'The same beat with an open hi-hat',
    help: 'The last hi-hat is open, so it rings on into the next bar.',
    subdivision: '8th',
    stepsPerBar: 8,
    bars: 1,
    bpm: 92,
    lines: [
      { lane: 'hihat', cells: 'x-x-x-xO' },
      { lane: 'snare', cells: '----o---' },
      { lane: 'kick', cells: 'o---o--o' },
    ],
  },
  {
    id: 'ghost',
    title: 'Ghost notes and a cross stick',
    help: 'The quiet g hits fill the space around the backbeats. The @ replaces the snare hit.',
    subdivision: '16th',
    stepsPerBar: 16,
    bars: 1,
    bpm: 84,
    lines: [
      { lane: 'hihat', cells: 'x-x-x-x-x-x-x-x-' },
      { lane: 'snare', cells: '--g-@---g-g-@---' },
      { lane: 'kick', cells: 'o-----o---o-----' },
    ],
  },
  {
    id: 'fill',
    title: 'A tom fill into a crash',
    help: 'Two bars. The fill walks down the toms, then the crash and the kick land '
      + 'together on beat one of the next bar.',
    subdivision: '16th',
    stepsPerBar: 16,
    bars: 2,
    bpm: 92,
    lines: [
      { lane: 'crash', cells: '----------------|X---------------' },
      { lane: 'hihat', cells: '----------------|--x-x-x-x-x-x-x-' },
      { lane: 'snare', cells: 'o-o-o-----------|----o-------o---' },
      { lane: 'tomMid', cells: '------o-o-------|----------------' },
      { lane: 'tomFloor', cells: '----------o-o---|----------------' },
      { lane: 'kick', cells: '----------------|o-------o-------' },
    ],
  },
];

/** The count characters of one beat, per subdivision. */
const COUNT_TAIL = {
  '8th': ['+'],
  '16th': ['e', '+', 'a'],
  triplet: ['&', 'a'],
  sixEight: ['+'],
};

/**
 * The count row under a bar. It is one character per grid step, so every count
 * sits under the step it names.
 */
export function countRow(subdivision, stepsPerBar, bars) {
  const tail = COUNT_TAIL[subdivision] || COUNT_TAIL['16th'];
  const perBeat = tail.length + 1;
  const beats = Math.max(1, Math.round(stepsPerBar / perBeat));
  const bar = [];
  for (let beat = 1; beat <= beats; beat += 1) {
    bar.push(String(beat % 10));
    for (const mark of tail) bar.push(mark);
  }
  const one = bar.join('');
  // The bar line takes one column in the drawn row, so the count row needs it too.
  return Array.from({ length: Math.max(1, bars) }, () => one).join('|');
}

/** The instrument one example cell plays. */
export function soundForCell(lane, glyph) {
  if (lane === 'hihat') {
    if (glyph === 'O') return 'hihatOpen';
    return 'hihatClosed';
  }
  if (lane === 'snare') {
    if (glyph === 'g') return 'snareGhost';
    if (glyph === 'f') return 'snareFlam';
    return 'snare';
  }
  return LANE_SOUND[lane] || 'snare';
}

/** How hard one cell is struck. A capital X or O is the accent. */
export function velocityFor(glyph) {
  if (glyph === 'g') return 0.3;
  if (glyph === '@') return 0.6;
  if (glyph === 'X' || glyph === 'O') return 1;
  return 0.78;
}

/** Turn the example rows into the step list the drum engine plays. */
export function examplePattern(example) {
  const steps = [];
  for (const line of example.lines) {
    let step = 0;
    for (const glyph of line.cells) {
      // A bar line is drawn, but it is not a step of its own.
      if (glyph === '|') continue;
      if (glyph !== '-') {
        const instrument = soundForCell(line.lane, glyph);
        steps.push({ instrument, step, velocity: velocityFor(glyph) });
      }
      step += 1;
    }
  }
  return {
    id: `drumtab-${example.id}`,
    subdivision: example.subdivision,
    stepsPerBar: example.stepsPerBar,
    bars: example.bars || 1,
    steps,
  };
}

