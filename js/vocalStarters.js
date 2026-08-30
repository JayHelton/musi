// The starter vocal exercises.
//
// These are definitions, not a library. Practice Lab writes them into the
// Practice Library folder the singer chooses, and from that moment they are
// normal library exercises: the singer renames them, edits them, moves them,
// or deletes them. Musi keeps no private vocal exercise store.
//
// A clean exercise is a pitch-runner exercise, so the existing Pitch Runner
// plays it. A harsh exercise is a cue exercise, so the Cue Runner plays it and
// judges nothing.
//
// This module holds no DOM code, so the Node test runners can import it.

import { vocalTags } from './vocalExerciseModel.js';

const C3 = 48; const D3 = 50; const E3 = 52; const F3 = 53;
const G3 = 55; const C4 = 60; const D4 = 62;
const E4 = 64; const F4 = 65; const FS4 = 66; const G4 = 67; const A4 = 69;
const B4 = 71; const C5 = 72; const D5 = 74; const E5 = 76;

/** A note list from a pitch list, with one hold length for every note. */
function line(midis, beats = 2) {
  return midis.map(midi => ({ midi, beats }));
}

function run(notes, { bpm = 80, repeats = 4, restBeats = 2, countInBeats = 4 } = {}) {
  return {
    source: 'manual',
    bpm,
    notes,
    noteBeats: 0,
    restBeats,
    repeats,
    countInBeats,
    metronome: true,
    guide: true,
    preview: false,
  };
}

function cue(steps, { repetitions = 5, restBetweenReps = 0 } = {}) {
  return { repetitions, restBetweenReps, steps };
}

const perform = (duration, text, detail = '') => ({ type: 'perform', duration, text, detail });
const rest = (duration, text = '') => ({ type: 'rest', duration, text });
const phrase = (duration, text) => ({ type: 'phrase', duration, text });
const move = (duration, from, to) => ({ type: 'transition', duration, from, to });
const check = text => ({ type: 'checkpoint', text });

/**
 * The clean starters. Every one is a pitch-runner exercise, so the singer
 * reads the target pitch and the existing runner scores it.
 */
export const CLEAN_STARTERS = [
  {
    name: 'Chest Clean Onset',
    registers: ['chest'],
    focus: ['clean-onset', 'pitch-stability'],
    runner: run(line([C3, C3, E3, C3], 2), { bpm: 72, repeats: 4 }),
    note: 'Start each note with no scoop and no breath before the tone.',
  },
  {
    name: 'Chest Sustained Tone',
    registers: ['chest'],
    focus: ['sustained-tone', 'pitch-stability'],
    runner: run(line([C3, E3, G3], 8), { bpm: 66, repeats: 3, restBeats: 4 }),
    note: 'Hold each note steady. Keep the volume level from start to end.',
  },
  {
    name: 'Chest Dynamic Control',
    registers: ['chest'],
    focus: ['dynamic-control'],
    runner: run(line([D3, D3, F3, D3], 4), { bpm: 66, repeats: 4, restBeats: 4 }),
    note: 'Sing the first note soft and the next note full. Keep the pitch still.',
  },
  {
    name: 'Chest Vowel Consistency — AH EE OO',
    registers: ['chest'],
    focus: ['vowel-consistency'],
    runner: run(line([E3, E3, E3, E3], 3), { bpm: 70, repeats: 4 }),
    note: 'One vowel per note: AH, EE, OO, AH. The tone must not change shape.',
  },
  {
    name: 'Chest → Mix Climb',
    registers: ['chest', 'mix'],
    focus: ['chest-to-mix', 'pitch-stability'],
    runner: run(line([C3, E3, G3, C4, E4], 2), { bpm: 76, repeats: 4 }),
    note: 'Let the weight drop as the line climbs. Do not carry the chest sound up.',
  },
  {
    name: 'D4–E4 Ease',
    registers: ['mix'],
    focus: ['d4-e4-ease'],
    runner: run(line([D4, E4, D4, E4, D4], 2), { bpm: 80, repeats: 5 }),
    note: 'Keep the throat open and the volume moderate. This range must feel easy.',
  },
  {
    name: 'F4 Stability',
    registers: ['mix'],
    focus: ['f4-stability'],
    runner: run(line([D4, F4, D4, F4], 3), { bpm: 76, repeats: 5 }),
    note: 'Hold F4 without pushing. The pitch must not drift.',
  },
  {
    name: 'F#4 Stability',
    registers: ['mix'],
    focus: ['fs4-stability'],
    runner: run(line([D4, FS4, D4, FS4], 3), { bpm: 76, repeats: 5 }),
    note: 'The same shape as F4, one semitone higher. Keep the same effort.',
  },
  {
    name: 'G4 Reliability — GEE',
    registers: ['mix'],
    focus: ['g4-reliability', 'vowel-consistency'],
    runner: run(line([G4, G4, G4, G4], 3), { bpm: 78, repeats: 5, restBeats: 4 }),
    note: 'G4 as the target, not as the top of a scale. Sing GEE on every note.',
  },
  {
    name: 'G4 Approach — Step Up',
    registers: ['mix'],
    focus: ['g4-reliability', 'd4-e4-ease'],
    runner: run(line([E4, F4, FS4, G4], 3), { bpm: 76, repeats: 5 }),
    note: 'Walk up to G4 and hold it. Keep the same effort on every step.',
  },
  {
    name: 'G4 Vowel Consistency',
    registers: ['mix'],
    focus: ['g4-vowel-consistency', 'vowel-consistency'],
    runner: run(line([G4, G4, G4, G4], 4), { bpm: 72, repeats: 4, restBeats: 4 }),
    note: 'One vowel per note: EE, EH, AH, OH. The pitch and the volume stay equal.',
  },
  {
    name: 'Twang — Bright Resonance',
    registers: ['mix'],
    focus: ['twang', 'controlled-intensity'],
    runner: run(line([E4, G4, E4], 3), { bpm: 78, repeats: 5 }),
    note: 'Aim for a bright, narrow sound. Add brightness, not volume.',
  },
  {
    name: 'Controlled Intensity',
    registers: ['mix'],
    focus: ['controlled-intensity', 'dynamic-control'],
    runner: run(line([F4, F4, F4], 6), { bpm: 70, repeats: 4, restBeats: 4 }),
    note: 'Grow each note from soft to full and back. Stop before the throat grips.',
  },
  {
    name: 'Mix → Head Slide',
    registers: ['mix', 'head'],
    focus: ['mix-to-head'],
    runner: run(line([G4, A4, B4, C5], 2), { bpm: 76, repeats: 4 }),
    note: 'Release weight on every step. The change of gear must not click.',
  },
  {
    name: 'Head Clean Onset',
    registers: ['head'],
    focus: ['clean-onset', 'pitch-accuracy'],
    runner: run(line([C5, C5, D5, C5], 2), { bpm: 76, repeats: 4 }),
    note: 'Land on the pitch at once. No slide up to the note.',
  },
  {
    name: 'Head Sustained Stability',
    registers: ['head'],
    focus: ['sustained-stability', 'dynamic-control'],
    runner: run(line([C5, E5], 8), { bpm: 66, repeats: 3, restBeats: 4 }),
    note: 'Hold the note quiet and steady. Keep the air flow even.',
  },
  {
    name: 'Head Agility',
    registers: ['head'],
    focus: ['agility', 'pitch-accuracy'],
    runner: run(line([C5, D5, E5, D5, C5], 1), { bpm: 92, repeats: 5 }),
    note: 'Light and fast. Every note keeps its own pitch.',
  },
  {
    name: 'Head → Mix Descent',
    registers: ['head', 'mix'],
    focus: ['head-to-mix'],
    runner: run(line([C5, B4, A4, G4], 2), { bpm: 76, repeats: 4 }),
    note: 'Add weight step by step. The descent must stay smooth.',
  },
];

/**
 * The harsh starters. Every one is a cue exercise: timed instructions, timed
 * rest, and a self-reported result. Nothing here scores the sound.
 */
export const HARSH_STARTERS = [
  // ---- low ----
  {
    name: 'Immediate Low Activation',
    registers: ['low'],
    focus: ['activation', 'consistency'],
    cue: cue([
      perform(4, 'Neutral false-cord low', 'Immediate onset. Stable coordination.'),
      rest(8, 'Breathe low and slow'),
    ], { repetitions: 5 }),
    note: 'The one question: does the low arrive at once, with no search?',
  },
  {
    name: 'Low Start / Stop',
    registers: ['low'],
    focus: ['start-stop', 'activation'],
    cue: cue([
      perform(2, 'Low on', 'Clean start.'),
      rest(2, 'Off'),
      perform(2, 'Low on', 'Clean stop, no tail.'),
      rest(6),
    ], { repetitions: 5 }),
    note: 'The start and the stop must both be clean. No creak at the end.',
  },
  {
    name: 'Low Sustain',
    registers: ['low'],
    focus: ['sustain', 'depth'],
    cue: cue([
      perform(6, 'Hold the low', 'Steady weight. Steady air.'),
      rest(12, 'Full recovery'),
    ], { repetitions: 4 }),
    note: 'Length is not the goal. Stop the moment the sound loses its centre.',
  },
  {
    name: 'Dark ↔ Forward Low',
    registers: ['low'],
    focus: ['character', 'consistency'],
    cue: cue([
      perform(4, 'Neutral low'),
      rest(6),
      perform(4, 'Dark low', 'More room, more depth.'),
      rest(6),
      perform(4, 'Forward low', 'More edge, more cut.'),
      rest(10),
    ], { repetitions: 3 }),
    note: 'Change the character on purpose. The pitch area stays the same.',
  },
  {
    name: 'Covered ↔ Open Low',
    registers: ['low'],
    focus: ['character'],
    cue: cue([
      perform(4, 'Covered low'),
      rest(6),
      perform(4, 'Open low'),
      rest(10),
    ], { repetitions: 4 }),
  },
  {
    name: 'Low Diction',
    registers: ['low'],
    focus: ['diction'],
    cue: cue([
      phrase(4, 'BREAK — DOWN — HOLD'),
      rest(6),
      phrase(6, 'Drag the whole weight down'),
      rest(10),
    ], { repetitions: 4 }),
    note: 'Say the words in the low sound. Musi grades no words.',
  },
  {
    name: 'Low → Mid',
    registers: ['low', 'mid'],
    focus: ['transition', 'activation'],
    cue: cue([
      perform(3, 'Set the low'),
      move(3, 'low', 'mid'),
      rest(10, 'Reset the placement'),
    ], { repetitions: 5 }),
  },
  {
    name: 'Low → High',
    registers: ['low', 'high'],
    focus: ['transition'],
    cue: cue([
      perform(3, 'Set the low'),
      move(3, 'low', 'high'),
      rest(12, 'Full recovery'),
    ], { repetitions: 4 }),
  },

  // ---- mid ----
  {
    name: 'Immediate Mid Activation',
    registers: ['mid'],
    focus: ['activation', 'consistency'],
    cue: cue([
      perform(4, 'Neutral mid', 'The anchor scream. Immediate onset.'),
      rest(8),
    ], { repetitions: 5 }),
    note: 'Mid is the anchor. Every session can start here.',
  },
  {
    name: 'Mid Start / Stop',
    registers: ['mid'],
    focus: ['start-stop'],
    cue: cue([
      perform(2, 'Mid on'),
      rest(2, 'Off'),
      perform(2, 'Mid on'),
      rest(6),
    ], { repetitions: 5 }),
  },
  {
    name: 'Mid Sustain',
    registers: ['mid'],
    focus: ['sustain'],
    cue: cue([
      perform(6, 'Hold the mid', 'Steady, not loud.'),
      rest(12, 'Full recovery'),
    ], { repetitions: 4 }),
  },
  {
    name: 'Mid Dynamics',
    registers: ['mid'],
    focus: ['dynamics', 'character'],
    cue: cue([
      perform(4, 'Quiet mid'),
      rest(6),
      perform(4, 'Full mid', 'More sound, same coordination.'),
      rest(10),
    ], { repetitions: 4 }),
    note: 'Volume comes from support, not from squeeze.',
  },
  {
    name: 'Mid Diction',
    registers: ['mid'],
    focus: ['diction'],
    cue: cue([
      phrase(4, 'CUT — THE — LINE'),
      rest(6),
      phrase(6, 'Every word lands on the beat'),
      rest(10),
    ], { repetitions: 4 }),
  },
  {
    name: 'Mid → Low',
    registers: ['mid', 'low'],
    focus: ['transition'],
    cue: cue([
      perform(3, 'Set the mid'),
      move(3, 'mid', 'low'),
      rest(10),
    ], { repetitions: 5 }),
  },
  {
    name: 'Mid → High',
    registers: ['mid', 'high'],
    focus: ['transition'],
    cue: cue([
      perform(3, 'Set the mid'),
      move(3, 'mid', 'high'),
      rest(12),
    ], { repetitions: 4 }),
  },
  {
    name: 'High → Mid',
    registers: ['high', 'mid'],
    focus: ['transition'],
    cue: cue([
      perform(3, 'Set the high'),
      move(3, 'high', 'mid'),
      rest(12),
    ], { repetitions: 4 }),
  },
  {
    name: 'Mid Character Control',
    registers: ['mid'],
    focus: ['character', 'consistency'],
    cue: cue([
      perform(4, 'Dense mid'),
      rest(6),
      perform(4, 'Cutting mid'),
      rest(6),
      perform(4, 'Neutral mid'),
      rest(10),
    ], { repetitions: 3 }),
  },

  // ---- high ----
  {
    name: 'Immediate High Activation',
    registers: ['high'],
    focus: ['activation', 'consistency'],
    cue: cue([
      check('Set the placement. Press Next when you are ready.'),
      perform(3, 'Neutral high', 'Repeatable setup. No search.'),
      rest(10),
    ], { repetitions: 5 }),
    note: 'A repeatable setup matters more than the top of the range.',
  },
  {
    name: 'High Start / Stop',
    registers: ['high'],
    focus: ['start-stop'],
    cue: cue([
      perform(2, 'High on'),
      rest(3, 'Off'),
      perform(2, 'High on'),
      rest(8),
    ], { repetitions: 5 }),
  },
  {
    name: 'High Sustain',
    registers: ['high'],
    focus: ['sustain'],
    cue: cue([
      perform(4, 'Hold the high', 'Stop early if it slips.'),
      rest(12, 'Full recovery'),
    ], { repetitions: 4 }),
  },
  {
    name: 'High Endurance',
    registers: ['high'],
    focus: ['endurance', 'consistency'],
    cue: cue([
      perform(5, 'High, repeatable'),
      rest(5, 'Short recovery'),
    ], { repetitions: 6 }),
    note: 'Work and rest at an even density. This is not a longest-scream test.',
  },
  {
    name: 'Bright ↔ Gritty High',
    registers: ['high'],
    focus: ['brightness', 'grit', 'character'],
    cue: cue([
      perform(3, 'Bright high'),
      rest(6),
      perform(3, 'Gritty high'),
      rest(10),
    ], { repetitions: 4 }),
  },
  {
    name: 'Cleaner ↔ Grittier High',
    registers: ['high'],
    focus: ['grit', 'character'],
    cue: cue([
      perform(3, 'Cleaner high', 'Less noise, same placement.'),
      rest(6),
      perform(3, 'Grittier high', 'Add grit on purpose.'),
      rest(10),
    ], { repetitions: 4 }),
  },
  {
    name: 'High Diction',
    registers: ['high'],
    focus: ['diction'],
    cue: cue([
      phrase(3, 'TEAR — IT — OPEN'),
      rest(8),
      phrase(5, 'Words stay clear at the top'),
      rest(10),
    ], { repetitions: 4 }),
  },
  {
    name: 'High → Low',
    registers: ['high', 'low'],
    focus: ['transition'],
    cue: cue([
      perform(3, 'Set the high'),
      move(3, 'high', 'low'),
      rest(12),
    ], { repetitions: 4 }),
  },
  {
    name: 'Low → Mid → High',
    registers: ['low', 'mid', 'high'],
    focus: ['transition', 'consistency'],
    cue: cue([
      perform(3, 'Set the low'),
      move(3, 'low', 'mid'),
      move(3, 'mid', 'high'),
      rest(14, 'Full recovery'),
    ], { repetitions: 4 }),
  },
  {
    name: 'High → Mid → Low',
    registers: ['high', 'mid', 'low'],
    focus: ['transition', 'consistency'],
    cue: cue([
      perform(3, 'Set the high'),
      move(3, 'high', 'mid'),
      move(3, 'mid', 'low'),
      rest(14, 'Full recovery'),
    ], { repetitions: 4 }),
  },
  {
    name: 'Low → Mid → High → Mid → Low',
    registers: ['low', 'mid', 'high'],
    focus: ['transition', 'endurance'],
    cue: cue([
      perform(2, 'Set the low'),
      move(2, 'low', 'mid'),
      move(2, 'mid', 'high'),
      move(2, 'high', 'mid'),
      move(2, 'mid', 'low'),
      rest(16, 'Full recovery'),
    ], { repetitions: 3 }),
  },
];

/**
 * The starter definitions of one style.
 * @param {string} style 'clean' or 'harsh'
 */
export function startersOfStyle(style) {
  return style === 'harsh' ? HARSH_STARTERS : style === 'clean' ? CLEAN_STARTERS : [];
}

/**
 * Turn one starter definition into a Practice Library exercise record.
 *
 * The record is a normal exercise. Once it is written, the library owns it.
 *
 * @param {Object} definition one entry of CLEAN_STARTERS or HARSH_STARTERS
 * @param {{ style: string, folderId: string }} target
 * @returns {Object} an exercise record, ready for `createExercise`
 */
export function starterExerciseRecord(definition, { style, folderId = '' } = {}) {
  const kind = style === 'harsh' ? 'cue' : 'runner';
  const record = {
    name: definition.name,
    kind,
    categoryId: folderId,
    instrument: 'voice',
    materialType: 'exercise',
    tags: vocalTags({
      style,
      registers: definition.registers,
      focus: definition.focus,
    }),
    source: 'Musi vocal starters',
  };
  if (kind === 'cue') record.cue = definition.cue;
  else record.runner = definition.runner;
  if (definition.note) record.technique = definition.note;
  return record;
}

/** Every starter of one style, as exercise records. */
export function starterExerciseRecords({ style, folderId = '' } = {}) {
  return startersOfStyle(style).map(def => starterExerciseRecord(def, { style, folderId }));
}
