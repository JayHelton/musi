/**
 * The interval color table. This is the one source of truth for intervals.
 *
 * Musi already knows how to spell an interval and how to find it on a neck.
 * What it did not hold is the compositional meaning of a degree: what the
 * degree does to a listener, and what a writer uses it for. This module adds
 * that layer and keeps it beside the arithmetic, so one table serves the
 * Interval Reference in Study and the reference drawer in Composition Lab.
 *
 * The character words are guidance, not universal emotional definitions. A
 * degree behaves differently in a different context, and the table says so.
 *
 * This module is pure. It touches no DOM, no clock, and no audio.
 */

import { parseNote, spellNote, NOTE_NAMES_SHARP, INTERVAL_LABELS } from '../theory.js';
import { SCALES, scaleIntervalClasses, shortScaleName } from '../scales.js';

/**
 * @typedef {Object} IntervalDegree
 * @property {string} id the degree name, such as "b6"
 * @property {number} semitones distance above the tonic, 0 to 11
 * @property {number} letterStep letter names above the tonic, for spelling
 * @property {string} name the classic interval name
 * @property {string} character what the degree does to the ear
 * @property {string} functions what a writer uses the degree for
 * @property {string[]} examples short compositional examples
 */

/** The eleven degrees the reference names, tonic first. */
export const INTERVAL_DEGREES = [
  {
    id: '1',
    semitones: 0,
    letterStep: 0,
    name: 'Unison / tonic',
    character: 'Home, weight, finality',
    functions: 'Pedals, structural downbeats, phrase endings',
    examples: [
      'Hold the tonic under a moving line to fix the centre.',
      'Land on the tonic on the downbeat of the last bar.',
    ],
  },
  {
    id: 'b2',
    semitones: 1,
    letterStep: 1,
    name: 'Minor 2nd',
    character: 'Strong friction',
    functions: 'Phrygian color, semitone tension',
    examples: [
      'Attack the tonic from a semitone above, again and again.',
      'Put b2 on a weak slot and let it fall to the tonic.',
    ],
  },
  {
    id: '2',
    semitones: 2,
    letterStep: 1,
    name: 'Major 2nd',
    character: 'Motion, space',
    functions: 'Connection and melodic movement',
    examples: [
      'Use 2 as the step between 1 and b3.',
      'Give 2 a long value to open a phrase out.',
    ],
  },
  {
    id: 'b3',
    semitones: 3,
    letterStep: 2,
    name: 'Minor 3rd',
    character: 'Minor identity',
    functions: 'Establish minor quality',
    examples: [
      'State 1 then b3 in the first bar to set the quality.',
      'Answer a b3 phrase with the same rhythm on 5.',
    ],
  },
  {
    id: '3',
    semitones: 4,
    letterStep: 2,
    name: 'Major 3rd',
    character: 'Major brightness / tension in minor contexts',
    functions: 'Phrygian-dominant and altered colors',
    examples: [
      'Put 3 over a minor collection for a Phrygian-dominant edge.',
      'Move 3 to b3 between two sections and change nothing else.',
    ],
  },
  {
    id: '4',
    semitones: 5,
    letterStep: 3,
    name: 'Perfect 4th',
    character: 'Suspension',
    functions: 'Hold against tonic, prepare 5',
    examples: [
      'Sustain 4 over the tonic, then drop to 3 or b3.',
      'Use 4 as the approach note into 5.',
    ],
  },
  {
    id: '5',
    semitones: 7,
    letterStep: 4,
    name: 'Perfect 5th',
    character: 'Stability / power',
    functions: 'Reinforce tonic',
    examples: [
      'Double the tonic with 5 for weight without a quality.',
      'Start a phrase on 5 and end it on 1.',
    ],
  },
  {
    id: 'b6',
    semitones: 8,
    letterStep: 5,
    name: 'Minor 6th',
    character: 'Heavy downward gravity',
    functions: 'Minor/modal motion and dramatic descents',
    examples: [
      'Let b6 fall into 5 on a strong beat.',
      'Reach b6 as the top note of a phrase, then descend.',
    ],
  },
  {
    id: '6',
    semitones: 9,
    letterStep: 5,
    name: 'Major 6th',
    character: 'Lift / openness',
    functions: 'Dorian and contrasting colors',
    examples: [
      'Raise b6 to 6 to turn a minor idea toward Dorian.',
      'Place 6 high in the register to open the phrase.',
    ],
  },
  {
    id: 'b7',
    semitones: 10,
    letterStep: 6,
    name: 'Minor 7th',
    character: 'Open modal release',
    functions: 'Natural-minor/modal motion',
    examples: [
      'End a phrase on b7 to avoid a cadence.',
      'Step b7 to 1 for a modal, non-leading close.',
    ],
  },
  {
    id: '7',
    semitones: 11,
    letterStep: 6,
    name: 'Major 7th',
    character: 'Strong tonic pull',
    functions: 'Leading-tone cadences',
    examples: [
      'Save 7 for the final cadence and nowhere else.',
      'Approach 1 from 7 below to close a section.',
    ],
  },
];

/** The degree ids, in table order. */
export const DEGREE_IDS = INTERVAL_DEGREES.map(d => d.id);

const BY_ID = new Map(INTERVAL_DEGREES.map(d => [d.id, d]));
const BY_SEMITONES = new Map(INTERVAL_DEGREES.map(d => [d.semitones, d]));

/**
 * One degree by its name.
 * @param {string} id such as "b6"
 * @returns {IntervalDegree|null}
 */
export function degreeById(id) {
  return BY_ID.get(String(id)) || null;
}

/**
 * One degree by its distance in semitones.
 * The tritone has no row, so this returns null for 6 semitones.
 * @param {number} semitones 0 to 11
 * @returns {IntervalDegree|null}
 */
export function degreeBySemitones(semitones) {
  const wrapped = ((Number(semitones) % 12) + 12) % 12;
  return BY_SEMITONES.get(wrapped) || null;
}

/**
 * The short label of any distance, including the tritone.
 * @param {number} semitones
 * @returns {string}
 */
export function degreeLabel(semitones) {
  const wrapped = ((Number(semitones) % 12) + 12) % 12;
  const degree = BY_SEMITONES.get(wrapped);
  return degree ? degree.id : 'b5';
}

/**
 * The classic interval name of a distance, such as "m6".
 * @param {number} semitones
 * @returns {string}
 */
export function intervalName(semitones) {
  const wrapped = ((Number(semitones) % 12) + 12) % 12;
  return INTERVAL_LABELS[wrapped] || String(wrapped);
}

/**
 * The spelled note one degree above a tonic.
 * @param {string} tonic a note name such as "A#"
 * @param {string} degreeId such as "b6"
 * @returns {string} the note name, or '' when the tonic does not parse
 */
export function noteForDegree(tonic, degreeId) {
  const degree = degreeById(degreeId);
  const parsed = parseNote(String(tonic || ''));
  if (!degree || !parsed) return '';
  const spelled = spellNote(parsed.li, parsed.semi, degree.letterStep, degree.semitones);
  if (spelled) return spelled;
  return NOTE_NAMES_SHARP[(parsed.semi + degree.semitones) % 12];
}

/**
 * The pitch class one degree above a tonic.
 * @param {string} tonic
 * @param {string} degreeId
 * @returns {number} 0 to 11, or -1 when the tonic does not parse
 */
export function pitchClassForDegree(tonic, degreeId) {
  const degree = degreeById(degreeId);
  const parsed = parseNote(String(tonic || ''));
  if (!degree || !parsed) return -1;
  return (parsed.semi + degree.semitones) % 12;
}

/**
 * Every scale in the shared catalog that holds this degree.
 * @param {string} degreeId
 * @returns {{name: string, short: string}[]} scale names, catalog order
 */
export function scalesWithDegree(degreeId) {
  const degree = degreeById(degreeId);
  if (!degree) return [];
  return Object.keys(SCALES)
    .filter(name => scaleIntervalClasses(name).includes(degree.semitones))
    .map(name => ({ name, short: shortScaleName(name) }));
}

/**
 * The degrees one scale holds, in pitch order.
 * @param {string} scaleName a key of SCALES
 * @returns {IntervalDegree[]} the rows the scale contains
 */
export function degreesOfScale(scaleName) {
  const classes = scaleIntervalClasses(scaleName);
  if (!classes.length) return [];
  const seen = new Set();
  const out = [];
  for (const semi of classes) {
    const degree = degreeBySemitones(semi);
    if (!degree || seen.has(degree.id)) continue;
    seen.add(degree.id);
    out.push(degree);
  }
  return out;
}

/**
 * The degree that tells two scales apart, best first.
 *
 * The Recall exercises ask "what separates these two modes?", and this answers
 * it with the pitch classes one scale holds and the other does not.
 * @param {string} scaleA a key of SCALES
 * @param {string} scaleB a key of SCALES
 * @returns {{onlyInA: IntervalDegree[], onlyInB: IntervalDegree[], shared: IntervalDegree[]}}
 */
export function compareScaleDegrees(scaleA, scaleB) {
  const a = new Set(scaleIntervalClasses(scaleA));
  const b = new Set(scaleIntervalClasses(scaleB));
  const rows = semis => [...semis]
    .sort((x, y) => x - y)
    .map(semi => degreeBySemitones(semi))
    .filter(Boolean);
  return {
    onlyInA: rows([...a].filter(s => !b.has(s))),
    onlyInB: rows([...b].filter(s => !a.has(s))),
    shared: rows([...a].filter(s => b.has(s))),
  };
}

/**
 * Every place one degree sits on a neck, inside a fret range.
 * @param {Object} options
 * @param {string} options.tonic the tonal center
 * @param {string} options.degreeId such as "b6"
 * @param {number[]} options.openMidis the open-string MIDI notes, low string first
 * @param {number} [options.start] the first fret
 * @param {number} [options.end] the last fret
 * @returns {{string: number, fret: number, midi: number}[]} low string first
 */
export function fretsForDegree({ tonic, degreeId, openMidis, start = 0, end = 15 }) {
  const pc = pitchClassForDegree(tonic, degreeId);
  if (pc < 0 || !Array.isArray(openMidis)) return [];
  const first = Math.max(0, Math.min(start, end));
  const last = Math.max(first, Math.max(start, end));
  const out = [];
  openMidis.forEach((open, string) => {
    for (let fret = first; fret <= last; fret += 1) {
      const midi = open + fret;
      if (((midi % 12) + 12) % 12 === pc) out.push({ string, fret, midi });
    }
  });
  return out;
}
