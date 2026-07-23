// Shared data shapes and small helpers for the guitar-tab analyzer.
//
// A parsed tab is described by a `TabModel`:
//   {
//     tuning: string,                 // tuning name (or 'Custom')
//     strings: [{ label, note, oct, openMidi }],  // low -> high index
//     events: [TabEvent],             // ordered by slot then string
//     slots: number,                  // total time slots (weak timing proxy)
//     measures: [{ startSlot, endSlot, marker }], // marker: section label or null
//     techniqueCounts: { [tech]: number },
//     warnings: string[],
//   }
//
// A `TabEvent` is one played note:
//   { slot, stringIndex, fret, midi, pc, techniques: string[], dead: bool }

import { parseNote, TUNINGS } from '../theory.js';

// Canonical technique identifiers and their human labels.
export const TECHNIQUE_LABELS = {
  hammer: 'Hammer-on',
  pull: 'Pull-off',
  slideUp: 'Slide up',
  slideDown: 'Slide down',
  slide: 'Slide',
  bend: 'Bend',
  release: 'Bend release',
  vibrato: 'Vibrato',
  tap: 'Tapping',
  slap: 'Slap',
  pop: 'Pop',
  harmonic: 'Harmonic',
  palmMute: 'Palm mute',
  dead: 'Dead / muted note',
  tremolo: 'Tremolo picking',
  trill: 'Trill',
};

// Legato techniques (smooth, un-picked note connections).
export const LEGATO_TECHNIQUES = new Set(['hammer', 'pull', 'slideUp', 'slideDown', 'slide']);

// Open-string MIDI for a tuning string descriptor { note, oct }.
export function stringOpenMidi(str) {
  const p = parseNote(str.note);
  if (!p) return null;
  return 12 * (str.oct + 1) + p.semi;
}

// Resolve a tuning name or a custom array to normalized string descriptors,
// ordered low -> high (matching the TUNINGS convention).
export function resolveTuning(tuning) {
  let arr = null;
  let name = 'Custom';
  if (typeof tuning === 'string' && TUNINGS[tuning]) {
    arr = TUNINGS[tuning];
    name = tuning;
  } else if (Array.isArray(tuning)) {
    arr = tuning;
  } else {
    arr = TUNINGS['Standard'];
    name = 'Standard';
  }
  const strings = arr.map((s) => ({
    note: s.note,
    oct: s.oct,
    label: s.note,
    openMidi: stringOpenMidi(s),
  }));
  return { name, strings };
}
