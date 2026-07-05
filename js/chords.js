import { parseNote, spellNote } from './theory.js';

// Chord library used by the Chord mapping / reference view.
//
// Each chord is a list of tones described as [letterOffset, semitones, label]:
//   - letterOffset : diatonic letter steps above the root (mod 7). Lets us spell
//                    the note with the correct accidental (e.g. D#, not Eb, for a #9).
//   - semitones    : semitones above the root. May exceed 12 for extensions
//                    (9th = 14, 11th = 17, 13th = 21) so the formula stays readable.
//   - label        : scale-degree label shown in the formula and on the fretboard.
//
// `sym` is the short chord symbol appended to the root for display (e.g. C, Cm7).
export const CHORDS = {
  // --- Core chords -----------------------------------------------------------
  'Power Chord (5)':        { sym: '5',      tones: [[0,0,'R'],[4,7,'5']] },
  'Major':                  { sym: '',       tones: [[0,0,'R'],[2,4,'3'],[4,7,'5']] },
  'Major 7':                { sym: 'maj7',   tones: [[0,0,'R'],[2,4,'3'],[4,7,'5'],[6,11,'7']] },
  'Dominant 7':             { sym: '7',      tones: [[0,0,'R'],[2,4,'3'],[4,7,'5'],[6,10,'b7']] },
  'Augmented':              { sym: 'aug',    tones: [[0,0,'R'],[2,4,'3'],[4,8,'#5']] },
  'Sus 4':                  { sym: 'sus4',   tones: [[0,0,'R'],[3,5,'4'],[4,7,'5']] },
  'Sus 2':                  { sym: 'sus2',   tones: [[0,0,'R'],[1,2,'2'],[4,7,'5']] },
  'Add 9':                  { sym: 'add9',   tones: [[0,0,'R'],[2,4,'3'],[4,7,'5'],[1,14,'9']] },
  'Minor':                  { sym: 'm',      tones: [[0,0,'R'],[2,3,'b3'],[4,7,'5']] },
  'Minor 7':                { sym: 'm7',     tones: [[0,0,'R'],[2,3,'b3'],[4,7,'5'],[6,10,'b7']] },
  'Minor Major 7':          { sym: 'mMaj7',  tones: [[0,0,'R'],[2,3,'b3'],[4,7,'5'],[6,11,'7']] },
  'Half Diminished (m7b5)': { sym: 'm7b5',   tones: [[0,0,'R'],[2,3,'b3'],[4,6,'b5'],[6,10,'b7']] },
  'Diminished 7':           { sym: 'dim7',   tones: [[0,0,'R'],[2,3,'b3'],[4,6,'b5'],[6,9,'bb7']] },
  'Minor Add 9':            { sym: 'm(add9)',tones: [[0,0,'R'],[2,3,'b3'],[4,7,'5'],[1,14,'9']] },

  // --- Extended / metal chords ----------------------------------------------
  'Minor 6':                { sym: 'm6',     tones: [[0,0,'R'],[2,3,'b3'],[4,7,'5'],[5,9,'6']] },
  'Major 6':                { sym: '6',      tones: [[0,0,'R'],[2,4,'3'],[4,7,'5'],[5,9,'6']] },
  'Dominant 7 b9':          { sym: '7b9',    tones: [[0,0,'R'],[2,4,'3'],[4,7,'5'],[6,10,'b7'],[1,13,'b9']] },
  'Dominant 7 #9':          { sym: '7#9',    tones: [[0,0,'R'],[2,4,'3'],[4,7,'5'],[6,10,'b7'],[1,15,'#9']] },
  'Dominant 7 b5':          { sym: '7b5',    tones: [[0,0,'R'],[2,4,'3'],[4,6,'b5'],[6,10,'b7']] },
  'Dominant 7 #5':          { sym: '7#5',    tones: [[0,0,'R'],[2,4,'3'],[4,8,'#5'],[6,10,'b7']] },
  'Minor 9':                { sym: 'm9',     tones: [[0,0,'R'],[2,3,'b3'],[4,7,'5'],[6,10,'b7'],[1,14,'9']] },
  'Major 9':                { sym: 'maj9',   tones: [[0,0,'R'],[2,4,'3'],[4,7,'5'],[6,11,'7'],[1,14,'9']] },
  'Dominant 9':             { sym: '9',      tones: [[0,0,'R'],[2,4,'3'],[4,7,'5'],[6,10,'b7'],[1,14,'9']] },
  'Minor 11':               { sym: 'm11',    tones: [[0,0,'R'],[2,3,'b3'],[4,7,'5'],[6,10,'b7'],[1,14,'9'],[3,17,'11']] },
  'Major 11':               { sym: 'maj11',  tones: [[0,0,'R'],[2,4,'3'],[4,7,'5'],[6,11,'7'],[1,14,'9'],[3,17,'11']] },
  'Dominant 11':            { sym: '11',     tones: [[0,0,'R'],[2,4,'3'],[4,7,'5'],[6,10,'b7'],[1,14,'9'],[3,17,'11']] },
  'Minor 13':               { sym: 'm13',    tones: [[0,0,'R'],[2,3,'b3'],[4,7,'5'],[6,10,'b7'],[1,14,'9'],[3,17,'11'],[5,21,'13']] },
  'Dominant 13':            { sym: '13',     tones: [[0,0,'R'],[2,4,'3'],[4,7,'5'],[6,10,'b7'],[1,14,'9'],[3,17,'11'],[5,21,'13']] },

  // --- Metal-specific voicings / shapes -------------------------------------
  'Root + b2':              { sym: 'b2',     tones: [[0,0,'R'],[1,1,'b2']] },
  'Root + Major 2':         { sym: '2',      tones: [[0,0,'R'],[1,2,'2']] },
  'Root + b5':              { sym: 'b5',     tones: [[0,0,'R'],[4,6,'b5']] },
  'Root + Tritone':         { sym: 'TT',     tones: [[0,0,'R'],[3,6,'#4']] },
  'Root + Octave':          { sym: '8',      tones: [[0,0,'R'],[0,12,'8']] },
  'Root + 5th + Octave':    { sym: '5(8)',   tones: [[0,0,'R'],[4,7,'5'],[0,12,'8']] },
  'Root + b6':              { sym: 'b6',     tones: [[0,0,'R'],[5,8,'b6']] },
  'Root + b3 + b6':         { sym: 'b3b6',   tones: [[0,0,'R'],[2,3,'b3'],[5,8,'b6']] },
  'Minor Triad':            { sym: 'm(triad)', tones: [[0,0,'R'],[2,3,'b3'],[4,7,'5']] },
  'Major Triad':            { sym: '(triad)',  tones: [[0,0,'R'],[2,4,'3'],[4,7,'5']] },
  'Diminished Triad':       { sym: 'dim',    tones: [[0,0,'R'],[2,3,'b3'],[4,6,'b5']] },
  'Augmented Triad':        { sym: 'aug(triad)', tones: [[0,0,'R'],[2,4,'3'],[4,8,'#5']] },
};

// Display groups for the chord picker, in the order requested.
export const CHORD_LIST_GROUPS = [
  {
    label: 'Core',
    names: [
      'Power Chord (5)', 'Major', 'Major 7', 'Dominant 7', 'Augmented',
      'Sus 4', 'Sus 2', 'Add 9', 'Minor', 'Minor 7', 'Minor Major 7',
      'Half Diminished (m7b5)', 'Diminished 7', 'Minor Add 9',
    ],
  },
  {
    label: 'Extended / metal',
    names: [
      'Minor 6', 'Major 6', 'Dominant 7 b9', 'Dominant 7 #9', 'Dominant 7 b5',
      'Dominant 7 #5', 'Minor 9', 'Major 9', 'Dominant 9', 'Minor 11',
      'Major 11', 'Dominant 11', 'Minor 13', 'Dominant 13',
    ],
  },
  {
    label: 'Voicings / shapes',
    names: [
      'Root + b2', 'Root + Major 2', 'Root + b5', 'Root + Tritone',
      'Root + Octave', 'Root + 5th + Octave', 'Root + b6', 'Root + b3 + b6',
      'Minor Triad', 'Major Triad', 'Diminished Triad', 'Augmented Triad',
    ],
  },
];

// Chords especially useful for darker metal / deathcore. Flagged with a badge in
// the picker so they are easy to find at a glance.
export const DARK_METAL_CHORDS = new Set([
  'Minor Add 9', 'Sus 2', 'Sus 4', 'Minor 9', 'Minor 11', 'Diminished Triad',
  'Diminished 7', 'Half Diminished (m7b5)', 'Minor Major 7', 'Root + b2',
  'Root + Tritone', 'Root + b6',
]);

export function groupedChordEntries() {
  const entries = [];
  CHORD_LIST_GROUPS.forEach(group => {
    entries.push({ type: 'label', label: group.label });
    group.names.forEach(name => {
      if (CHORDS[name]) entries.push({ val: name, label: name, dark: DARK_METAL_CHORDS.has(name) });
    });
  });
  return entries;
}

/** All chord names in grouped display order. */
export function orderedChordNames() {
  return groupedChordEntries()
    .filter(e => e.type !== 'label')
    .map(e => e.val);
}

/** Spelled note names for a chord built on the given root (extensions included). */
export function getChordNotes(rootStr, chordName) {
  const r = parseNote(rootStr);
  const def = CHORDS[chordName];
  if (!r || !def) return null;
  return def.tones.map(([lo, so]) => spellNote(r.li, r.semi, lo, so % 12));
}
