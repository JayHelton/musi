// The shared theory references.
//
// Study mounts these views on tool pages. Composition Lab mounts the same
// views inside its reference drawer. One folder holds the components, and the
// numbers behind them come from js/scales.js, js/chords.js, and js/theory.js.
//
// Nothing in this folder reaches into a feature folder, so a feature can mount
// a reference without pulling a screen of another feature with it.

export {
  INTERVAL_DEGREES,
  DEGREE_IDS,
  degreeById,
  degreeBySemitones,
  degreeLabel,
  intervalName,
  noteForDegree,
  pitchClassForDegree,
  scalesWithDegree,
  degreesOfScale,
  compareScaleDegrees,
  fretsForDegree,
} from './intervalTable.js';

export { createIntervalReference } from './intervalReferenceView.js';
export { createScaleReferenceCard } from './scaleReferenceView.js';
export { createChordReferenceCard } from './chordReferenceView.js';
export { createNeckView, openMidisOf } from './neckView.js';
export { playChord, playMidis, stopChord } from './chordVoice.js';

export {
  CHORD_SIZES, MAX_STACK, keyNotes, keyChords, chordLadder, compareKeys,
  qualityIndex, describeStack, buildChord, isHeptatonic, scaleLabel, slotLabel,
} from './keyChords.js';
export { VOICING_DEFAULTS, findVoicings, fretsForPitchClass, groupByPosition } from './voicings.js';
export {
  BORROW_SOURCES, outsideTones, borrowedChords, secondaryDominants,
  tritoneSubs, leadingToneDiminished, alterationsFor, outsideMoves,
} from './outside.js';
