/**
 * Shared score fixtures for the gp-player score geometry pages.
 *
 * The alignment page and the visual page must show the same music, so both
 * import these builders.
 */

// The parser builds this array from the lowest string to the highest string,
// and it counts `stringIndex` in the same direction. See buildModel() in
// js/tab/gp5.js.
export const STRINGS = [
  { note: 'E', oct: 2, label: 'E', openMidi: 40 },
  { note: 'A', oct: 2, label: 'A', openMidi: 45 },
  { note: 'D', oct: 3, label: 'D', openMidi: 50 },
  { note: 'G', oct: 3, label: 'G', openMidi: 55 },
  { note: 'B', oct: 3, label: 'B', openMidi: 59 },
  { note: 'E', oct: 4, label: 'e', openMidi: 64 },
];

function beatOf(measureIndex, start, duration, noteValue, noteIndices) {
  return {
    measureIndex,
    voiceIndex: 0,
    start,
    duration,
    noteValue,
    dots: 0,
    tuplet: null,
    rest: false,
    noteIndices,
  };
}

/**
 * A guitar score with four bars.
 *
 * Bar 1 holds four hammer-ons on one string. That is the case that used to
 * draw every arc from the first note of the bar.
 * Bar 2 holds sixteenth notes across the strings.
 * Bar 3 holds bends. Bar 4 holds ties.
 */
export function guitarFixture() {
  const events = [];
  const beats = [];

  for (let i = 0; i < 5; i += 1) {
    events.push({
      start: i * 0.5,
      duration: 0.5,
      stringIndex: 3,
      fret: 5 + i,
      midi: 55 + 5 + i,
      dead: false,
      techniques: i === 0 ? [] : ['hammer'],
    });
    beats.push(beatOf(0, i * 0.5, 0.5, 8, [events.length - 1]));
  }

  for (let i = 0; i < 16; i += 1) {
    events.push({
      start: 4 + i * 0.25,
      duration: 0.25,
      stringIndex: i % 6,
      fret: 10 + (i % 3),
      midi: 40 + 10 + (i % 3),
      dead: false,
      techniques: [],
    });
    beats.push(beatOf(1, 4 + i * 0.25, 0.25, 16, [events.length - 1]));
  }

  for (let i = 0; i < 4; i += 1) {
    events.push({
      start: 8 + i,
      duration: 1,
      stringIndex: 4,
      fret: 7,
      midi: 59 + 7,
      dead: false,
      techniques: ['bend'],
      bend: { points: [{ position: 0, cents: 0 }, { position: 60, cents: 100 }] },
    });
    beats.push(beatOf(2, 8 + i, 1, 4, [events.length - 1]));
  }

  for (let i = 0; i < 4; i += 1) {
    events.push({
      start: 12 + i,
      duration: 1,
      stringIndex: 1,
      fret: 3,
      midi: 45 + 3,
      dead: false,
      techniques: [],
      tie: i > 0,
    });
    beats.push(beatOf(3, 12 + i, 1, 4, [events.length - 1]));
  }

  return {
    tuning: 'Standard',
    strings: STRINGS,
    events,
    beats,
    rests: [],
    measures: [0, 1, 2, 3].map((bar) => ({
      startBeat: bar * 4,
      endBeat: bar * 4 + 4,
      startSlot: bar * 4,
      endSlot: bar * 4 + 4,
      timeSig: [4, 4],
    })),
    tempo: 120,
    totalBeats: 16,
    techniqueCounts: {},
    warnings: [],
  };
}

/** A drum score with five kit lanes and sixteenth hi-hats. */
export function drumFixture() {
  const events = [];
  for (let bar = 0; bar < 2; bar += 1) {
    for (let i = 0; i < 16; i += 1) {
      const start = bar * 4 + i * 0.25;
      events.push({
        start, duration: 0.25, instrument: 'hihatClosed', midi: 42, velocity: 0.7,
      });
      if (i % 8 === 0) {
        events.push({
          start, duration: 0.25, instrument: 'kick', midi: 36, velocity: 0.9,
        });
      }
      if (i % 8 === 4) {
        events.push({
          start, duration: 0.25, instrument: 'snare', midi: 38, velocity: 0.9,
        });
      }
      if (i === 0) {
        events.push({
          start, duration: 0.25, instrument: 'crash', midi: 49, velocity: 1,
        });
      }
      if (i === 12) {
        events.push({
          start, duration: 0.25, instrument: 'tomFloor', midi: 41, velocity: 0.8,
        });
      }
    }
  }
  return {
    percussion: true,
    name: 'Drums',
    tempo: 120,
    events,
    measures: [0, 1].map((bar) => ({
      startBeat: bar * 4,
      endBeat: bar * 4 + 4,
      startSlot: bar * 4,
      endSlot: bar * 4 + 4,
      timeSig: [4, 4],
    })),
    slots: 8,
    totalBeats: 8,
    warnings: [],
  };
}
