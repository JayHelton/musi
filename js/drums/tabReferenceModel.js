// DOM-free model for the Drum Tab reference page.
//
// Drum tab has no single standard. Two writers can spell the same hit with two
// different characters, so this file states what Musi draws first, then lists
// the spellings other writers use. The lane list and the symbol list come from
// `js/drums/notation.js`, so the page and the score views never drift apart.

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

/** Worked examples. Each one plays with the built-in kit.
 *
 * A row is one character per grid step. A `|` in a row is a bar line: it is
 * drawn, and it takes no step of its own.
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

