// Where every kit piece sits on a drum staff, and what a bar of drum music is
// made of.
//
// Drum music uses one five-line staff. The staff carries no pitch: each line
// and each space stands for one piece of the kit. This file states that map
// once, so the study page and the score player draw the same music.
//
// A "step" is one diatonic degree, which is half the distance between two
// staff lines. Step 0 is the top line. A larger step is lower on the staff.
//
//   step -2  ledger line above the staff   crash cymbal
//   step -1  space above the top line      hi-hat
//   step  0  line 5 (top)                  ride cymbal
//   step  1  space 4                       tom 1
//   step  2  line 4                        tom 2
//   step  3  space 3                       snare drum
//   step  5  space 2                       floor tom
//   step  7  space 1                       kick drum
//   step  8  line 1 (bottom)
//   step  9  space below the staff         hi-hat pedal

import { drumArticulationFromMidi } from './notation.js';

/** The staff has five lines. */
export const STAFF_LINE_COUNT = 5;

/** The step of the top line and the step of the bottom line. */
export const STAFF_TOP_STEP = 0;
export const STAFF_BOTTOM_STEP = 8;

/**
 * The place, the head shape, and the voice of each kit piece.
 *
 * `voice` is `up` for the hands and `down` for the feet. Drum music writes the
 * hands with stems up and the feet with stems down, so the two parts stay
 * apart on one staff.
 */
export const DRUM_STAFF_POSITIONS = {
  crash: { step: -2, head: 'x', voice: 'up' },
  splash: { step: -3, head: 'x', voice: 'up' },
  china: { step: -3, head: 'x', voice: 'up' },
  hihatClosed: { step: -1, head: 'x', voice: 'up' },
  hihatOpen: { step: -1, head: 'x', voice: 'up', open: true },
  hihatPedal: { step: 9, head: 'x', voice: 'down' },
  ride: { step: 0, head: 'x', voice: 'up' },
  rideBell: { step: 0, head: 'diamond', voice: 'up' },
  tomHigh: { step: 1, head: 'normal', voice: 'up' },
  tomMid: { step: 2, head: 'normal', voice: 'up' },
  snare: { step: 3, head: 'normal', voice: 'up' },
  snareGhost: { step: 3, head: 'normal', voice: 'up', ghost: true },
  snareFlam: { step: 3, head: 'normal', voice: 'up', flam: true },
  sideStick: { step: 3, head: 'cross', voice: 'up' },
  tomFloor: { step: 5, head: 'normal', voice: 'up' },
  kick: { step: 7, head: 'normal', voice: 'down' },
};

/** The kit sound each notation name plays. */
export const NOTATION_SOUND = {
  crash: 'crash',
  splash: 'crash',
  china: 'crash',
  hihatClosed: 'hihatClosed',
  hihatOpen: 'hihatOpen',
  hihatPedal: 'hihatClosed',
  ride: 'ride',
  rideBell: 'ride',
  tomHigh: 'tomHigh',
  tomMid: 'tomMid',
  snare: 'snare',
  snareGhost: 'snareGhost',
  snareFlam: 'snareFlam',
  sideStick: 'snare',
  tomFloor: 'tomFloor',
  kick: 'kick',
};

/** The name a reader sees for each place on the staff. */
export const NOTATION_LABELS = {
  crash: 'Crash cymbal',
  splash: 'Splash cymbal',
  china: 'China cymbal',
  hihatClosed: 'Closed hi-hat',
  hihatOpen: 'Open hi-hat',
  hihatPedal: 'Hi-hat pedal',
  ride: 'Ride cymbal',
  rideBell: 'Ride bell',
  tomHigh: 'Tom 1',
  tomMid: 'Tom 2',
  snare: 'Snare drum',
  snareGhost: 'Snare ghost note',
  snareFlam: 'Snare flam',
  sideStick: 'Side stick',
  tomFloor: 'Floor tom',
  kick: 'Kick drum',
};

/**
 * The hand that plays a note. Drum music writes a letter under the staff: R
 * for the right hand and L for the left hand. The letters are a sticking, so
 * they name the hand and never change the sound.
 */
export const STICKING_LABELS = { R: 'Right hand', L: 'Left hand' };

/**
 * The sticking letter of a note or of a score event, or an empty string.
 *
 * A note writes the hand as `hand`, and a score event can write it as `hand`
 * or as `sticking`. Both accept `R`, `L`, `right`, and `left`, in any case.
 *
 * @param {{ hand?: string, sticking?: string }|null|undefined} source
 * @returns {'R'|'L'|''}
 */
export function stickingOf(source) {
  const raw = source?.hand ?? source?.sticking ?? '';
  const text = String(raw).trim().toLowerCase();
  if (text === 'r' || text === 'right') return 'R';
  if (text === 'l' || text === 'left') return 'L';
  return '';
}

/** An articulation replaces the plain instrument with its own notation name. */
const ARTICULATION_NAME = {
  hihatPedal: 'hihatPedal',
  sideStick: 'sideStick',
  rideBell: 'rideBell',
  china: 'china',
  splash: 'splash',
};

/**
 * The notation name of a score event.
 * @param {{ instrument?: string, articulation?: string|null }} event
 * @returns {string}
 */
export function notationNameFor(event) {
  const artic = event?.articulation ?? drumArticulationFromMidi(event?.midi);
  if (artic && ARTICULATION_NAME[artic]) return ARTICULATION_NAME[artic];
  const inst = event?.instrument;
  if (inst && DRUM_STAFF_POSITIONS[inst]) return inst;
  return 'snare';
}

/**
 * The staff place of a kit piece, or null when the name is unknown.
 * @param {string} name
 * @returns {{ step: number, head: string, voice: string, open?: boolean, ghost?: boolean, flam?: boolean }|null}
 */
export function staffPositionFor(name) {
  return DRUM_STAFF_POSITIONS[name] || null;
}

/**
 * The reading chart: one row for each piece a beginner meets first.
 * `lines` holds the label the chart prints under the note, over two rows.
 */
export const DRUM_NOTATION_KEY = [
  {
    name: 'kick',
    lines: ['Kick/Bass', 'Drum'],
    title: 'Kick / Bass Drum',
    place: 'Space 1, under the middle of the staff.',
    note: 'The right foot plays it. It carries the pulse of the beat.',
  },
  {
    name: 'tomFloor',
    lines: ['Floor', 'Tom'],
    title: 'Floor Tom',
    place: 'Space 2.',
    note: 'The lowest tom. It stands on the floor beside the player.',
  },
  {
    name: 'tomHigh',
    lines: ['Tom', 'Drum 1'],
    title: 'Tom Drum 1',
    place: 'Space 4.',
    note: 'The highest tom, usually mounted over the kick drum.',
  },
  {
    name: 'tomMid',
    lines: ['Tom', 'Drum 2'],
    title: 'Tom Drum 2',
    place: 'Line 4.',
    note: 'The second mounted tom. A three-piece kit leaves this one out.',
  },
  {
    name: 'snare',
    lines: ['Snare', 'Drum'],
    title: 'Snare Drum',
    place: 'Space 3, the middle space.',
    note: 'The backbeat. In 4/4 rock it lands on beats 2 and 4.',
  },
  {
    name: 'ride',
    lines: ['Ride', 'Cymbal'],
    title: 'Ride Cymbal',
    place: 'Line 5, the top line. The head is a cross.',
    note: 'The steady cymbal for louder sections. It replaces the hi-hat.',
  },
  {
    name: 'hihatClosed',
    lines: ['Closed', 'Hi-Hat'],
    title: 'Closed Hi-Hat',
    place: 'The space above the top line. The head is a cross.',
    note: 'The usual timekeeper. The two cymbals stay shut.',
  },
  {
    name: 'hihatOpen',
    lines: ['Open', 'Hi-Hat'],
    title: 'Open Hi-Hat',
    place: 'The same place, with a circle around the cross.',
    note: 'The foot lets the cymbals apart, so the hit rings.',
  },
  {
    name: 'hihatPedal',
    lines: ['Hi-Hat', 'Pedal'],
    title: 'Hi-Hat Pedal',
    place: 'The space under the bottom line. The head is a cross.',
    note: 'The left foot shuts the hi-hat. It makes a short "chick".',
  },
  {
    name: 'crash',
    lines: ['Crash', 'Cymbal'],
    title: 'Crash Cymbal',
    place: 'The first ledger line above the staff. The head is a cross.',
    note: 'The accent cymbal. It marks a landing after a fill.',
  },
];

/** Marks a player writes over or under a note head. */
export const DRUM_ARTICULATION_KEY = [
  {
    id: 'accent',
    title: 'Accent',
    mark: '>',
    note: 'Play this note louder than the notes around it.',
  },
  {
    id: 'ghost',
    title: 'Ghost note',
    mark: '( )',
    note: 'Play this note very quietly, just under the main pattern.',
  },
  {
    id: 'flam',
    title: 'Flam',
    mark: 'grace note',
    note: 'A small note before the main note. Two hands strike almost together.',
  },
  {
    id: 'open',
    title: 'Open hi-hat',
    mark: 'o',
    note: 'A circle around the cross. The hi-hat rings until the next hit.',
  },
  {
    id: 'sticking',
    title: 'Sticking',
    mark: 'R L',
    note: 'A letter under the staff names the hand. R is the right hand and L '
      + 'is the left hand.',
  },
];

/** How long each note lasts, in quarter notes. */
export const NOTE_VALUE_ROWS = [
  { value: 1, name: 'Whole Note', beats: '4 Beats', perBar: 1 },
  { value: 2, name: 'Half Note', beats: '2 Beats', perBar: 2 },
  { value: 4, name: 'Quarter Note', beats: '1 Beat', perBar: 4 },
  { value: 8, name: 'Eighth Note', beats: '1/2 Beat', perBar: 8 },
  { value: 16, name: 'Sixteenth Note', beats: '1/4 Beat', perBar: 16 },
];

/**
 * The length of a note value in quarter notes.
 * @param {number} value 1, 2, 4, 8, 16 or 32
 * @param {number} dots
 * @returns {number}
 */
export function durationOf(value, dots = 0) {
  let base = 4 / value;
  let add = base;
  for (let i = 0; i < dots; i += 1) {
    add /= 2;
    base += add;
  }
  return base;
}

/**
 * The note value and the dot count of a length in quarter notes.
 * @param {number} quarters
 * @returns {{ value: number, dots: number }}
 */
export function noteValueOf(quarters) {
  const values = [1, 2, 4, 8, 16, 32];
  let best = { value: 4, dots: 0, error: Infinity };
  for (const value of values) {
    for (let dots = 0; dots <= 2; dots += 1) {
      const error = Math.abs(durationOf(value, dots) - quarters);
      if (error < best.error - 1e-9) best = { value, dots, error };
    }
  }
  return { value: best.value, dots: best.dots };
}

/** How many beams a note value carries. An eighth note carries one. */
export function beamCountOf(value) {
  if (value >= 32) return 3;
  if (value >= 16) return 2;
  if (value >= 8) return 1;
  return 0;
}

/** The length of one bar in quarter notes. */
export function barQuarters(timeSig) {
  const [count, unit] = timeSig || [4, 4];
  return (count * 4) / unit;
}

/**
 * The length of one beam group in quarter notes. A compound meter groups by
 * the dotted quarter, and every other meter groups by the quarter.
 */
export function beamUnitOf(timeSig) {
  const [count, unit] = timeSig || [4, 4];
  if (unit === 8 && count % 3 === 0) return 1.5;
  return 1;
}

function noteEntry(note) {
  if (typeof note === 'string') return { name: note, hand: '' };
  const name = note?.name || notationNameFor(note);
  return { ...note, name, hand: stickingOf(note) };
}

/**
 * Fill in the start time, the note value, and the note objects of every entry
 * of one voice. The input entries only carry `dur` and `notes`.
 *
 * @param {Array<{ dur: number, notes?: Array, rest?: boolean }>} entries
 * @returns {Array<object>}
 */
function normalizeVoice(entries) {
  const out = [];
  let start = 0;
  for (const entry of entries || []) {
    const dur = Number(entry.dur) || 0;
    if (dur <= 0) continue;
    const { value, dots } = noteValueOf(dur);
    const notes = (entry.notes || []).map(noteEntry);
    out.push({
      ...entry,
      start,
      dur,
      value,
      dots,
      notes,
      rest: entry.rest === true || notes.length === 0,
    });
    start += dur;
  }
  return out;
}

/**
 * Fill in every derived field of a list of bars, so the layout never has to
 * work them out again.
 *
 * A bar is `{ timeSig, voices: { up: [...], down: [...] } }`. Each entry of a
 * voice is `{ dur, notes }` or `{ dur, rest: true }`. `notes` holds notation
 * names, or objects with a name and marks such as `accent` or `flam`.
 *
 * @param {Array<object>} bars
 * @returns {Array<object>}
 */
export function normalizeBars(bars) {
  let barStart = 0;
  return (bars || []).map((bar, index) => {
    const timeSig = bar.timeSig || [4, 4];
    const quarters = barQuarters(timeSig);
    const voices = {
      up: normalizeVoice(bar.voices?.up),
      down: normalizeVoice(bar.voices?.down),
    };
    const out = {
      ...bar,
      index,
      timeSig,
      quarters,
      start: barStart,
      beamUnit: beamUnitOf(timeSig),
      voices,
    };
    barStart += quarters;
    return out;
  });
}

/** The velocity of one note, so a played bar sounds the way it reads. */
export function velocityForNote(note) {
  if (note?.ghost) return 0.3;
  if (note?.accent) return 1;
  if (note?.name === 'snareGhost') return 0.3;
  if (note?.name === 'sideStick') return 0.6;
  return 0.78;
}

/**
 * Turn normalized bars into the step pattern the drum engine plays.
 *
 * The engine runs on a fixed grid, so this rounds every start to the nearest
 * sixteenth note. A flam adds a grace hit one grid step early.
 *
 * @param {Array<object>} bars normalized bars
 * @param {string} id
 * @returns {{ id: string, subdivision: string, stepsPerBar: number, bars: number, steps: Array }}
 */
export function barsToPattern(bars, id = 'drum-staff') {
  const list = bars || [];
  const first = list[0];
  const quarters = first ? first.quarters : 4;
  const stepsPerBar = Math.round(quarters * 4);
  const steps = [];
  for (const bar of list) {
    for (const voiceName of ['up', 'down']) {
      for (const entry of bar.voices[voiceName] || []) {
        if (entry.rest) continue;
        const step = Math.round((bar.start + entry.start) * 4);
        for (const note of entry.notes) {
          const instrument = NOTATION_SOUND[note.name] || 'snare';
          if (note.flam && step > 0) {
            steps.push({ instrument, step: step - 1, velocity: 0.35 });
          }
          steps.push({ instrument, step, velocity: velocityForNote(note) });
        }
      }
    }
  }
  return {
    id,
    subdivision: '16th',
    stepsPerBar,
    bars: Math.max(1, list.length),
    steps,
  };
}

/**
 * Group the events of one measure into staff entries, one entry for each
 * distinct start. Score data holds a flat list of hits, and notation needs
 * them stacked by voice and by time.
 *
 * @param {Array<object>} events hits with `start` in quarter notes
 * @param {number} barStart start of the measure, in quarter notes
 * @param {number} quarters length of the measure, in quarter notes
 * @returns {{ up: Array, down: Array }}
 */
export function voicesFromEvents(events, barStart, quarters) {
  const byVoice = { up: new Map(), down: new Map() };
  // A grace stroke shares the start of the note it leans on, so it never gets
  // a column of its own. It marks that note as a flam instead.
  const graceAt = new Set();
  for (const ev of events || []) {
    if (ev?.grace !== true) continue;
    graceAt.add(`${Math.round((Number(ev.start) - barStart) * 48)}:${notationNameFor(ev)}`);
  }
  for (const ev of events || []) {
    if (ev?.grace === true) continue;
    const name = notationNameFor(ev);
    const place = staffPositionFor(name);
    if (!place) continue;
    const ticks = Math.round((Number(ev.start) - barStart) * 48);
    const at = ticks / 48;
    if (at < -1e-6 || at > quarters - 1e-6) continue;
    const slot = byVoice[place.voice];
    const list = slot.get(at) || [];
    list.push({
      name,
      accent: ev.accent === true,
      ghost: name === 'snareGhost',
      flam: ev.flam === true || name === 'snareFlam' || graceAt.has(`${ticks}:${name}`),
      hand: stickingOf(ev),
      duration: Number(ev.duration) || 0,
    });
    slot.set(at, list);
  }

  const build = (map) => {
    const starts = [...map.keys()].sort((a, b) => a - b);
    const entries = [];
    let cursor = 0;
    for (let i = 0; i < starts.length; i += 1) {
      const at = starts[i];
      if (at - cursor > 1e-6) entries.push(...fillRest(at - cursor));
      const notes = map.get(at);
      const next = i + 1 < starts.length ? starts[i + 1] : quarters;
      const gap = next - at;
      // A hit that says how long it lasts keeps its own value, and the space
      // after it becomes a rest. A hit with no length fills the gap.
      const own = Math.max(0, ...notes.map((note) => note.duration || 0));
      const dur = Math.max(0.125, own > 1e-6 ? Math.min(own, gap) : gap);
      entries.push({ dur, notes });
      cursor = at + dur;
    }
    if (quarters - cursor > 1e-6) entries.push(...fillRest(quarters - cursor));
    if (!entries.length) entries.push(...fillRest(quarters));
    return entries;
  };

  return { up: build(byVoice.up), down: build(byVoice.down) };
}

/** Break a gap into rests a reader knows. */
function fillRest(gap) {
  const out = [];
  let left = gap;
  const sizes = [4, 2, 1, 0.5, 0.25, 0.125];
  while (left > 1e-6) {
    const size = sizes.find((s) => s <= left + 1e-6);
    if (!size) break;
    out.push({ dur: size, rest: true });
    left -= size;
  }
  return out;
}

/**
 * One normalized bar built from a flat list of score hits.
 *
 * @param {Array<object>} events hits with `start` in quarter notes
 * @param {number} barStart start of the measure, in quarter notes
 * @param {number} quarters length of the measure, in quarter notes
 * @param {Array<number>} timeSig
 * @returns {object}
 */
export function staffBarFromEvents(events, barStart, quarters, timeSig = [4, 4]) {
  return normalizeBars([{
    timeSig,
    voices: voicesFromEvents(events, barStart, quarters),
  }])[0];
}

/**
 * Bars for a whole score measure list, ready for the staff layout.
 * @param {Array<object>} measures
 * @param {Array<object>} events
 * @returns {Array<object>}
 */
export function barsFromMeasures(measures, events) {
  const bars = (measures || []).map((measure) => {
    const start = Number(measure.startBeat) || 0;
    const end = Number(measure.endBeat) || (start + 4);
    const quarters = Math.max(0.25, end - start);
    const own = (events || []).filter((ev) => {
      const at = Number(ev.start);
      return at >= start - 1e-6 && at < end - 1e-6;
    });
    return {
      timeSig: measure.timeSig || [4, 4],
      voices: voicesFromEvents(own, start, quarters),
    };
  });
  return normalizeBars(bars);
}
