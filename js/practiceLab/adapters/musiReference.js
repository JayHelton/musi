// The shared theory references, seen from inside Practice Lab.
//
// Study opens the Interval Reference, the Scale Reference, and the Chord
// Reference as tool pages. Composition Lab opens the same three views inside a
// drawer. `js/reference/` owns the data and the components, and this adapter is
// the one seam that reaches them.
//
// A micro app that mounts this feature on its own replaces this file.

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
  createIntervalReference,
  createScaleReferenceCard,
  createChordReferenceCard,
  createNeckView,
  openMidisOf,
  playChord,
  playMidis,
  stopChord,
  keyNotes,
  keyChords,
  scaleLabel,
} from '../../reference/index.js';
