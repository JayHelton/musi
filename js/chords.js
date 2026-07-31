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

// Short "sound and feeling" descriptions for each chord quality. These capture
// the emotional character / mood a chord tends to evoke so the reference card can
// go beyond the raw formula. Descriptions are intentionally concise (one line)
// and describe the chord's typical affect independent of the root note.
export const CHORD_MOODS = {
  // --- Core chords ---
  'Power Chord (5)':        'Neutral but powerful. With no third it is neither happy nor sad — a solid, aggressive foundation for rock and metal.',
  'Major':                  'Bright, stable, and happy. The sound of resolution and "home" — open, confident, and settled.',
  'Major 7':                'Dreamy, lush, and sophisticated. Warm and jazzy with a soft, floating sweetness.',
  'Dominant 7':             'Bluesy and restless. Full of tension that wants to resolve — the engine of blues, funk, and forward motion.',
  'Augmented':              'Unstable, suspenseful, and dreamlike. The raised fifth gives an eerie, unresolved "floating" quality.',
  'Sus 4':                  'Open and suspended. Neither major nor minor — builds anticipation that begs to fall back to the third.',
  'Sus 2':                  'Airy, open, and ambiguous. Bright but hollow, great for shimmering, spacious textures.',
  'Add 9':                  'Bright and colorful. A major chord with extra sparkle and shimmer, without heavy jazz weight.',
  'Minor':                  'Sad, dark, and introspective. The core of melancholy, tension, and emotional depth.',
  'Minor 7':                'Mellow, smooth, and pensive. Soft melancholy with a relaxed, soulful, jazzy warmth.',
  'Minor Major 7':          'Tense, haunting, and mysterious. A minor chord with an unsettling, film-noir edge.',
  'Half Diminished (m7b5)': 'Tense and melancholic. Dark and unresolved — a signature "yearning" color in minor jazz.',
  'Diminished 7':           'Anxious, dramatic, and unstable. Maximum tension — spooky and suspenseful, pulling hard to resolve.',
  'Minor Add 9':            'Melancholic yet lush. Dark minor color with an added shimmer — brooding but beautiful.',

  // --- Extended / metal chords ---
  'Minor 6':                'Bittersweet and nostalgic. Minor with a hopeful, jazzy lift — smooth and slightly noir.',
  'Major 6':                'Sweet, vintage, and cheerful. Warm and nostalgic with a relaxed, retro swing feel.',
  'Dominant 7 b9':          'Dark, dramatic tension. A Spanish/flamenco flavor — biting and menacing, with a strong pull to resolve.',
  'Dominant 7 #9':          'Gritty and funky — the "Hendrix chord." Clashing brightness over blues grit, edgy and electric.',
  'Dominant 7 b5':          'Tense and jazzy. A whole-tone color with an off-balance, floating instability.',
  'Dominant 7 #5':          'Restless and edgy. The raised fifth adds an augmented, unresolved bite.',
  'Minor 9':                'Lush, smooth, and sophisticated. Deep minor warmth with a silky R&B / neo-soul richness.',
  'Major 9':                'Warm, open, and dreamy. Expansive and sophisticated — sunny sophistication without tension.',
  'Dominant 9':             'Funky and soulful. Bluesy drive with extra color — the classic funk / Motown groove chord.',
  'Minor 11':               'Spacious, moody, and modern. Dark and atmospheric with a hovering, unresolved depth.',
  'Major 11':               'Ethereal and floating. Lush and expansive, with a slightly ambiguous shimmer from the 11th.',
  'Dominant 11':            'Suspended and funky. Open, soulful tension that hangs in the air before resolving.',
  'Minor 13':               'Rich, deep, and cinematic. Full and complex minor color — moody yet luxurious.',
  'Dominant 13':            'Full, bright, and jazzy. Rich dominant color with big-band warmth and forward drive.',

  // --- Metal-specific voicings / shapes ---
  'Root + b2':              'Dissonant and menacing. An ultra-tight semitone clash — dark, tense, and claustrophobic.',
  'Root + Major 2':         'Open and ambiguous. Hollow, ringing tension with a bright but unsettled edge.',
  'Root + b5':              'Ominous and unstable. The tritone "devil\'s interval" — dark, dissonant, and foreboding.',
  'Root + Tritone':         'Evil and unresolved. Pure tritone tension — one of the most restless, dissonant colors in metal.',
  'Root + Octave':          'Massive and neutral. The root doubled — thick, powerful, and tonally open.',
  'Root + 5th + Octave':    'Huge and powerful. A widened power chord — massive, solid, and heavy.',
  'Root + b6':              'Dark and dramatic. A tense, brooding minor color with a haunting lean.',
  'Root + b3 + b6':         'Bleak and ominous. Stacked minor darkness — heavy, dissonant, and oppressive.',
  'Minor Triad':            'Sad, dark, and introspective. The pure core of melancholy and emotional weight.',
  'Major Triad':            'Bright, stable, and happy. Pure, resolved, and confident.',
  'Diminished Triad':       'Tense and unstable. Dark and anxious, pulling strongly toward resolution.',
  'Augmented Triad':        'Dreamlike and unresolved. Eerie, suspenseful floating from the raised fifth.',
};

/** The "sound and feeling" description for a chord quality, if defined. */
export function getChordMood(chordName) {
  return CHORD_MOODS[chordName] || '';
}

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
