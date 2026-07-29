#!/usr/bin/env node
/**
 * Authoritative movable chord shape library.
 * Generated/maintained as a single source — run validate.mjs after edits.
 */
export const TUNING_OFFSETS = {
  // Semitone offsets of open strings 6→1 relative to open string 6
  standard: [0, 5, 10, 15, 19, 24], // E A D G B E
  drop: [0, 7, 12, 17, 21, 26], // D A D G B E (model for all drop-6)
};

/** @typedef {'core'|'sevenths'|'extended'|'altered'} ChordFamily */
/** @typedef {'standard'|'drop'} TuningType */
/** @typedef {'Full'|'Shell'|'Compact'|'High-gain friendly'|'Clean-friendly'|'Advanced stretch'} VoicingCategory */
/** @typedef {'minimal'|'expanded'} PracticalTag */

/**
 * @typedef {Object} ChordShape
 * @property {string} id
 * @property {ChordFamily} chordFamily
 * @property {string} chordType
 * @property {string} symbol
 * @property {TuningType} tuningType
 * @property {4|5|6} rootString
 * @property {VoicingCategory} voicingCategory
 * @property {PracticalTag} practicalTag
 * @property {(number|null)[]} frets
 * @property {(string|null)[]} intervals
 * @property {(number|string|null)[]=} fingering
 * @property {string} bestUse
 * @property {string} playability
 * @property {string} rootPositionNote
 * @property {string=} notes
 */

/** @type {ChordShape[]} */
export const SHAPES = [
  // ═══════════════════════════════════════════════════════════════════════════
  // STANDARD — root string 6
  // ═══════════════════════════════════════════════════════════════════════════
  s('std-r6-5', 'core', 'Power (5)', '5', 'standard', 6, 'High-gain friendly', 'minimal',
    [0, 2, 2, null, null, null], ['R', '5', 'R', null, null, null], [1, 3, 4, null, null, null],
    'High-gain rhythm foundation; pairs with palm mute',
    'Compact shell — usable anywhere above fret 1',
    'Root on string 6; classic power-chord grip'),

  s('std-r6-major', 'core', 'Major', '', 'standard', 6, 'Full', 'minimal',
    [0, 2, 2, 1, 0, 0], ['R', '5', 'R', '3', '5', 'R'], [1, 3, 4, 2, 1, 1],
    'Clean tonic color; primary movable major grip',
    'Full voicing — barre index across the root fret',
    'Root on string 6; mirrors open E major'),

  s('std-r6-minor', 'core', 'Minor', 'm', 'standard', 6, 'Full', 'minimal',
    [0, 2, 2, 0, 0, 0], ['R', '5', 'R', 'b3', '5', 'R'], [1, 3, 4, 1, 1, 1],
    'Clean or light-gain minor tonic',
    'Full voicing — easiest full barre of the E family',
    'Root on string 6; mirrors open E minor'),

  s('std-r6-sus2', 'core', 'Sus2', 'sus2', 'standard', 6, 'Full', 'minimal',
    [0, 2, 4, 2, 0, 0], ['R', '5', '9', '11', '5', 'R'], [1, 2, 4, 3, 1, 1],
    'Open, ambiguous color — pads and indie textures',
    'Advanced stretch — best at or above fret 3',
    'Root on string 6; 9 on string 4 (string 3 adds 11)',
    'Classic Esus2 footprint; the 11 is a natural neighbor tone'),

  s('std-r6-sus4', 'core', 'Sus4', 'sus4', 'standard', 6, 'Full', 'minimal',
    [0, 2, 2, 2, 0, 0], ['R', '5', 'R', '4', '5', 'R'], [1, 2, 3, 4, 1, 1],
    'Resolves strongly to major/minor; anthem and rock cadences',
    'Full voicing — compact and ergonomic',
    'Root on string 6; 4 on string 3'),

  s('std-r6-add9', 'core', 'Add9', 'add9', 'standard', 6, 'Full', 'minimal',
    [0, 2, 2, 1, 0, 2], ['R', '5', 'R', '3', '5', '9'], [1, 3, 4, 2, 1, 4],
    'Best as a clean tonic color chord',
    'Full voicing — pinky reaches the 9 on string 1',
    'Root on string 6; 9 on high E'),

  s('std-r6-madd9', 'core', 'Minor add9', 'm(add9)', 'standard', 6, 'Full', 'expanded',
    [0, 2, 2, 0, 0, 2], ['R', '5', 'R', 'b3', '5', '9'], [1, 3, 4, 1, 1, 4],
    'Dark, modern minor color — clean or light drive',
    'Full voicing — same pinky reach as add9',
    'Root on string 6; 9 on high E'),

  s('std-r6-6', 'core', 'Major 6', '6', 'standard', 6, 'Full', 'expanded',
    [0, 2, 2, 1, 2, 0], ['R', '5', 'R', '3', '6', 'R'], [1, 3, 4, 2, 4, 1],
    'Vintage / jump-blues tonic color',
    'Full voicing — pinky on string 2 at +2',
    'Root on string 6; 6 replaces the high 5'),

  s('std-r6-m6', 'core', 'Minor 6', 'm6', 'standard', 6, 'Full', 'expanded',
    [0, 2, 2, 0, 2, 0], ['R', '5', 'R', 'b3', '6', 'R'], [1, 3, 4, 1, 4, 1],
    'Jazz / Latin minor color',
    'Full voicing — compact',
    'Root on string 6',
    'Contains a tritone (b3–6) — watch muddiness under gain'),

  s('std-r6-69', 'core', '6/9', '6/9', 'standard', 6, 'Full', 'expanded',
    [0, 2, 2, 1, 2, 2], ['R', '5', 'R', '3', '6', '9'], [1, 3, 3, 2, 4, 4],
    'Lush clean tonic — jazz, soul, fusion',
    'Full voicing — best above fret 3',
    'Root on string 6'),

  s('std-r6-maj7', 'sevenths', 'Maj7', 'maj7', 'standard', 6, 'Full', 'minimal',
    [0, 2, 1, 1, 0, 0], ['R', '5', '7', '3', '5', 'R'], [1, 4, 2, 3, 1, 1],
    'Best as a clean tonic color chord',
    'Full voicing — compact and highly usable',
    'Root on string 6; 7 on string 4'),

  s('std-r6-m7', 'sevenths', 'Minor 7', 'm7', 'standard', 6, 'Full', 'minimal',
    [0, 2, 2, 0, 3, 0], ['R', '5', 'R', 'b3', 'b7', 'R'], [1, 2, 3, 1, 4, 1],
    'ii / vi / i7 in pop, jazz, R&B',
    'Full voicing — pinky takes b7 on string 2',
    'Root on string 6'),

  s('std-r6-m7-shell', 'sevenths', 'Minor 7', 'm7', 'standard', 6, 'Shell', 'minimal',
    [0, 2, 0, 0, 0, 0], ['R', '5', 'b7', 'b3', '5', 'R'], [1, 3, 1, 1, 1, 1],
    'Works well under gain as a shell voicing',
    'Compact shell — one of the easiest m7 grips',
    'Root on string 6',
    'Preferred under distortion; full m7 can get muddy'),

  s('std-r6-7', 'sevenths', 'Dominant 7', '7', 'standard', 6, 'Full', 'minimal',
    [0, 2, 0, 1, 0, 0], ['R', '5', 'b7', '3', '5', 'R'], [1, 3, 1, 2, 1, 1],
    'Best as a dominant tension chord — blues, funk, rock V',
    'Full voicing — very compact',
    'Root on string 6; b7 on string 4'),

  s('std-r6-m7b5', 'sevenths', 'Half-diminished (m7b5)', 'm7b5', 'standard', 6, 'Full', 'minimal',
    [0, 1, 2, 0, 3, null], ['R', 'b5', 'R', 'b3', 'b7', null], [1, 2, 3, 1, 4, null],
    'iiø in minor keys; jazz cadence setup',
    'Full voicing — best above fret 2',
    'Root on string 6; b5 on string 5',
    'Mute high E to keep the voicing clear'),

  s('std-r6-dim7', 'sevenths', 'Diminished 7', 'dim7', 'standard', 6, 'Compact', 'minimal',
    [0, 1, 2, 0, 2, null], ['R', 'b5', 'R', 'b3', '6', null], [1, 2, 4, 1, 3, null],
    'Passing / diminished-approach chord',
    'Compact — repeats every three frets',
    'Root on string 6; bb7 labeled as 6 (enharmonic)',
    'Symmetric — same shape moves ±3 frets'),

  s('std-r6-7sus4', 'sevenths', '7sus4', '7sus4', 'standard', 6, 'Full', 'minimal',
    [0, 2, 0, 2, 0, 0], ['R', '5', 'b7', '4', '5', 'R'], [1, 3, 1, 4, 1, 1],
    'Dominant suspension — gospel, fusion, rock builds',
    'Full voicing — compact',
    'Root on string 6',
    'Also doubles as a practical 11(no3) color'),

  s('std-r6-7sus2', 'sevenths', '7sus2', '7sus2', 'standard', 6, 'Shell', 'expanded',
    [0, 2, 0, 2, 0, 2], ['R', '5', 'b7', '11', '5', '9'], [1, 2, 1, 3, 1, 4],
    'Modern dominant color without the 3rd',
    'Shell-leaning — best above fret 3',
    'Root on string 6; 9 on high E',
    'No 3rd — ambiguous major/minor dominant; string 3 is 11'),

  s('std-r6-maj7sus2', 'sevenths', 'Maj7sus2', 'maj7sus2', 'standard', 6, 'Shell', 'expanded',
    [0, 2, 1, 2, 0, 0], ['R', '5', '7', '11', '5', 'R'], [1, 3, 2, 4, 1, 1],
    'Airy tonic color — ambient / modern jazz',
    'Shell — omits the 3rd by design',
    'Root on string 6'),

  s('std-r6-maj9', 'extended', 'Maj9', 'maj9', 'standard', 6, 'Full', 'minimal',
    [0, 2, 1, 1, 0, 2], ['R', '5', '7', '3', '5', '9'], [1, 4, 2, 3, 1, 4],
    'Best as a clean tonic color chord',
    'Full voicing — maj7 + pinky 9',
    'Root on string 6',
    'One of the most useful movable maj9 grips'),

  s('std-r6-m9', 'extended', 'Minor 9', 'm9', 'standard', 6, 'Full', 'minimal',
    [0, 2, 0, 0, 0, 2], ['R', '5', 'b7', 'b3', '5', '9'], [1, 3, 1, 1, 1, 4],
    'Soul / neo-soul / jazz minor color',
    'Full voicing — compact and very common',
    'Root on string 6',
    'Shell-friendly under light gain; muddy if overdriven hard'),

  s('std-r6-9', 'extended', 'Dominant 9', '9', 'standard', 6, 'Full', 'minimal',
    [0, 2, 0, 1, 0, 2], ['R', '5', 'b7', '3', '5', '9'], [1, 3, 1, 2, 1, 4],
    'Best as a dominant tension chord — funk and blues',
    'Full voicing — compact',
    'Root on string 6'),

  s('std-r6-m11', 'extended', 'Minor 11', 'm11', 'standard', 6, 'Shell', 'minimal',
    [0, 2, 0, 2, 0, 0], ['R', '5', 'b7', '11', '5', 'R'], [1, 3, 1, 4, 1, 1],
    'Modern minor color — jazz, fusion, R&B',
    'Compact shell — highly pragmatic',
    'Root on string 6; 11 on string 3',
    'Omits explicit b3; reads as m11 in minor contexts (same grip as 7sus4/11)'),

  s('std-r6-11', 'extended', 'Dominant 11 (no3)', '11', 'standard', 6, 'Full', 'expanded',
    [0, 2, 0, 2, 0, 0], ['R', '5', 'b7', '11', '5', 'R'], [1, 3, 1, 4, 1, 1],
    'Dominant suspension / 11 color without clashing 3',
    'Full voicing — same grip as 7sus4',
    'Root on string 6',
    'Practical form is 11(no3); the 3 clashes with 11'),

  s('std-r6-13', 'extended', 'Dominant 13', '13', 'standard', 6, 'Shell', 'minimal',
    [0, 2, 0, 1, 2, 0], ['R', '5', 'b7', '3', '13', 'R'], [1, 3, 1, 2, 4, 1],
    'Best as a dominant tension chord — jazz / blues turnarounds',
    'Shell-leaning full grip — omit 9/11 by design',
    'Root on string 6; 13 on string 2'),

  s('std-r6-m13', 'extended', 'Minor 13', 'm13', 'standard', 6, 'Shell', 'expanded',
    [0, 2, 0, 0, 2, 0], ['R', '5', 'b7', 'b3', '13', 'R'], [1, 3, 1, 1, 4, 1],
    'Jazz minor color — use sparingly',
    'Shell — best above fret 3',
    'Root on string 6'),

  s('std-r6-maj13', 'extended', 'Maj13', 'maj13', 'standard', 6, 'Shell', 'expanded',
    [0, 2, 1, 1, 2, 0], ['R', '5', '7', '3', '13', 'R'], [1, 4, 2, 3, 4, 1],
    'Lush clean tonic — fusion / jazz ballad',
    'Shell — best above fret 3',
    'Root on string 6'),

  s('std-r6-aug', 'altered', 'Augmented', 'aug', 'standard', 6, 'Shell', 'minimal',
    [0, null, 2, 1, 1, null], ['R', null, 'R', '3', '#5', null], [1, null, 3, 2, 2, null],
    'Clear + triad without mud',
    'Compact shell — preferred under gain',
    'Root on string 6'),

  s('std-r6-aug-full', 'altered', 'Augmented', 'aug', 'standard', 6, 'Full', 'expanded',
    [0, 3, 2, 1, 1, 0], ['R', 'b6', 'R', '3', '#5', 'R'], [1, 4, 3, 2, 2, 1],
    'Dramatic tonic or V+ approach',
    'Full voicing — moderate stretch',
    'Root on string 6',
    'String 5 tone is enharmonic b6/#5 class'),

  s('std-r6-dim', 'altered', 'Diminished triad', 'dim', 'standard', 6, 'Shell', 'minimal',
    [0, 1, 2, 0, null, null], ['R', 'b5', 'R', 'b3', null, null], [1, 2, 3, 1, null, null],
    'Passing diminished color',
    'Compact shell',
    'Root on string 6'),

  s('std-r6-7sharp5', 'altered', 'Dominant 7#5', '7#5', 'standard', 6, 'Full', 'expanded',
    [0, 3, 0, 1, 1, 0], ['R', '#5', 'b7', '3', '#5', 'R'], [1, 4, 1, 2, 3, 1],
    'Altered dominant — resolves strongly to I',
    'Full voicing — best above fret 2',
    'Root on string 6',
    'Also called aug7 when the +5 is primary'),

  s('std-r6-7flat5', 'altered', 'Dominant 7b5', '7b5', 'standard', 6, 'Shell', 'expanded',
    [0, 1, 0, 1, null, null], ['R', 'b5', 'b7', '3', null, null], [1, 2, 1, 3, null, null],
    'Altered dominant / tritone-sub color',
    'Compact shell — very usable',
    'Root on string 6'),

  s('std-r6-7sharp11', 'altered', 'Dominant 7#11', '7#11', 'standard', 6, 'Shell', 'expanded',
    [0, 1, 0, 1, 0, 0], ['R', '#11', 'b7', '3', '5', 'R'], [1, 2, 1, 3, 1, 1],
    'Lydian-dominant / V7#11 color — fusion and jazz',
    'Compact shell',
    'Root on string 6; #11 on string 5',
    'b5 and #11 share pitch class; context chooses the label'),

  s('std-r6-13flat9', 'altered', 'Dominant 13b9', '13b9', 'standard', 6, 'Shell', 'expanded',
    [0, 2, 0, 1, 2, 1], ['R', '5', 'b7', '3', '13', 'b9'], [1, 3, 1, 2, 4, 2],
    'Best as a dominant tension chord — jazz turnaround',
    'Advanced stretch — best above fret 4',
    'Root on string 6'),

  // ═══════════════════════════════════════════════════════════════════════════
  // STANDARD — root string 5
  // ═══════════════════════════════════════════════════════════════════════════
  s('std-r5-5', 'core', 'Power (5)', '5', 'standard', 5, 'High-gain friendly', 'minimal',
    [null, 0, 2, 2, null, null], [null, 'R', '5', 'R', null, null], [null, 1, 3, 4, null, null],
    'High-gain rhythm on A-string roots',
    'Compact shell',
    'Root on string 5'),

  s('std-r5-major', 'core', 'Major', '', 'standard', 5, 'Full', 'minimal',
    [null, 0, 2, 2, 2, 0], [null, 'R', '5', 'R', '3', '5'], [null, 1, 2, 3, 4, 1],
    'Clean tonic — second essential movable major',
    'Full voicing — three-finger cluster on the +2 frets',
    'Root on string 5; mirrors open A major'),

  s('std-r5-minor', 'core', 'Minor', 'm', 'standard', 5, 'Full', 'minimal',
    [null, 0, 2, 2, 1, 0], [null, 'R', '5', 'R', 'b3', '5'], [null, 1, 3, 4, 2, 1],
    'Clean minor tonic on A-string roots',
    'Full voicing — compact',
    'Root on string 5; mirrors open A minor'),

  s('std-r5-sus2', 'core', 'Sus2', 'sus2', 'standard', 5, 'Full', 'minimal',
    [null, 0, 2, 2, 0, 0], [null, 'R', '5', 'R', '9', '5'], [null, 1, 3, 4, 1, 1],
    'Open sus color — preferred movable sus2',
    'Full voicing — easier than root-6 sus2',
    'Root on string 5; 9 on string 2'),

  s('std-r5-sus4', 'core', 'Sus4', 'sus4', 'standard', 5, 'Full', 'minimal',
    [null, 0, 2, 2, 3, 0], [null, 'R', '5', 'R', '4', '5'], [null, 1, 2, 3, 4, 1],
    'Suspension resolving to major/minor',
    'Full voicing — slight stretch on string 2',
    'Root on string 5',
    'Best at or above fret 2'),

  s('std-r5-add9', 'core', 'Add9', 'add9', 'standard', 5, 'Full', 'minimal',
    [null, 0, 2, 4, 2, 0], [null, 'R', '5', '9', '3', '5'], [null, 1, 2, 4, 3, 1],
    'Best as a clean tonic color chord',
    'Full voicing — moderate stretch',
    'Root on string 5; 9 on string 3'),

  s('std-r5-madd9', 'core', 'Minor add9', 'm(add9)', 'standard', 5, 'Full', 'expanded',
    [null, 0, 2, 4, 1, 0], [null, 'R', '5', '9', 'b3', '5'], [null, 1, 2, 4, 1, 1],
    'Dark clean minor color',
    'Full voicing — best above fret 3',
    'Root on string 5'),

  s('std-r5-6', 'core', 'Major 6', '6', 'standard', 5, 'Full', 'expanded',
    [null, 0, 2, 2, 2, 2], [null, 'R', '5', 'R', '3', '6'], [null, 1, 2, 3, 4, 4],
    'Vintage tonic color on A-string roots',
    'Full voicing — barre the +2 cluster including high E',
    'Root on string 5'),

  s('std-r5-m6', 'core', 'Minor 6', 'm6', 'standard', 5, 'Full', 'expanded',
    [null, 0, 2, 2, 1, 2], [null, 'R', '5', 'R', 'b3', '6'], [null, 1, 3, 4, 2, 4],
    'Jazz / Latin minor color',
    'Full voicing — compact',
    'Root on string 5'),

  s('std-r5-69', 'core', '6/9', '6/9', 'standard', 5, 'Advanced stretch', 'expanded',
    [null, 0, 2, 4, 2, 2], [null, 'R', '5', '9', '3', '6'], [null, 1, 2, 4, 3, 3],
    'Full 6/9 color when stretch allows',
    'Advanced stretch — best above fret 4',
    'Root on string 5'),

  s('std-r5-maj7', 'sevenths', 'Maj7', 'maj7', 'standard', 5, 'Full', 'minimal',
    [null, 0, 2, 1, 2, 0], [null, 'R', '5', '7', '3', '5'], [null, 1, 3, 2, 4, 1],
    'Best as a clean tonic color chord',
    'Full voicing — very common jazz/pop grip',
    'Root on string 5'),

  s('std-r5-m7', 'sevenths', 'Minor 7', 'm7', 'standard', 5, 'Full', 'minimal',
    [null, 0, 2, 0, 1, 0], [null, 'R', '5', 'b7', 'b3', '5'], [null, 1, 3, 1, 2, 1],
    'ii / vi workhorse in every style',
    'Full voicing — compact and ergonomic',
    'Root on string 5',
    'One of the most used movable chords on guitar'),

  s('std-r5-7', 'sevenths', 'Dominant 7', '7', 'standard', 5, 'Full', 'minimal',
    [null, 0, 2, 0, 2, 0], [null, 'R', '5', 'b7', '3', '5'], [null, 1, 3, 1, 4, 1],
    'Best as a dominant tension chord',
    'Full voicing — compact',
    'Root on string 5'),

  s('std-r5-m7b5', 'sevenths', 'Half-diminished (m7b5)', 'm7b5', 'standard', 5, 'Full', 'minimal',
    [null, 0, 1, 0, 1, null], [null, 'R', 'b5', 'b7', 'b3', null], [null, 1, 2, 1, 3, null],
    'iiø in minor — jazz cadences',
    'Compact shell/full hybrid',
    'Root on string 5',
    'Mute high E for clarity'),

  s('std-r5-dim7', 'sevenths', 'Diminished 7', 'dim7', 'standard', 5, 'Full', 'minimal',
    [null, 0, 1, 2, 1, 2], [null, 'R', 'b5', 'R', 'b3', '6'], [null, 1, 2, 4, 3, 4],
    'Full dim7 color with bb7 (labeled 6)',
    'Full voicing — best above fret 3',
    'Root on string 5',
    'bb7 enharmonically labeled 6; shape moves in minor thirds'),

  s('std-r5-7sus4', 'sevenths', '7sus4', '7sus4', 'standard', 5, 'Full', 'minimal',
    [null, 0, 2, 0, 3, 0], [null, 'R', '5', 'b7', '4', '5'], [null, 1, 2, 1, 4, 1],
    'Dominant suspension',
    'Full voicing — slight stretch',
    'Root on string 5'),

  s('std-r5-7sus2', 'sevenths', '7sus2', '7sus2', 'standard', 5, 'Full', 'expanded',
    [null, 0, 2, 0, 0, 0], [null, 'R', '5', 'b7', '9', '5'], [null, 1, 3, 1, 1, 1],
    'Modern dominant without 3rd',
    'Full voicing — very easy',
    'Root on string 5'),

  s('std-r5-maj7sus2', 'sevenths', 'Maj7sus2', 'maj7sus2', 'standard', 5, 'Shell', 'expanded',
    [null, 0, 2, 1, 0, 0], [null, 'R', '5', '7', '9', '5'], [null, 1, 3, 2, 1, 1],
    'Airy tonic — ambient / modern',
    'Shell — no 3rd',
    'Root on string 5'),

  s('std-r5-maj9', 'extended', 'Maj9', 'maj9', 'standard', 5, 'Shell', 'minimal',
    [null, 0, 2, 1, 0, 0], [null, 'R', '5', '7', '9', '5'], [null, 1, 3, 2, 1, 1],
    'Best as a clean tonic color chord',
    'Shell — omits 3; still reads maj9',
    'Root on string 5',
    'Extremely common pragmatic maj9'),

  s('std-r5-m9', 'extended', 'Minor 9', 'm9', 'standard', 5, 'Advanced stretch', 'minimal',
    [null, 0, 2, 4, 1, 3], [null, 'R', '5', '9', 'b3', 'b7'], [null, 1, 2, 4, 1, 3],
    'Soul / jazz minor color',
    'Advanced stretch — best above fret 4',
    'Root on string 5; b7 on high E',
    'Prefer root-6 m9 if the stretch is uncomfortable'),

  s('std-r5-9', 'extended', 'Dominant 9', '9', 'standard', 5, 'Full', 'minimal',
    [null, 0, 2, 4, 2, 3], [null, 'R', '5', '9', '3', 'b7'], [null, 1, 2, 4, 3, 3],
    'Best as a dominant tension chord — funk staple',
    'Full voicing — best above fret 3',
    'Root on string 5; b7 on high E'),

  s('std-r5-m11', 'extended', 'Minor 11', 'm11', 'standard', 5, 'Shell', 'minimal',
    [null, 0, 0, 0, 1, 0], [null, 'R', '11', 'b7', 'b3', '5'], [null, 1, 1, 1, 2, 1],
    'Modern minor — one of the best m11 grips on guitar',
    'Compact shell — barre + one finger',
    'Root on string 5; 11 on string 4',
    'Must sit at fret ≥1 so every string is fretted (closed)'),

  s('std-r5-11', 'extended', 'Dominant 11 (no3)', '11', 'standard', 5, 'Full', 'expanded',
    [null, 0, 2, 0, 3, 0], [null, 'R', '5', 'b7', '11', '5'], [null, 1, 2, 1, 4, 1],
    'Dominant 11 without the clashing 3',
    'Full voicing — same as 7sus4',
    'Root on string 5'),

  s('std-r5-13', 'extended', 'Dominant 13', '13', 'standard', 5, 'Shell', 'minimal',
    [null, 0, 2, 0, 2, 2], [null, 'R', '5', 'b7', '3', '13'], [null, 1, 2, 1, 3, 4],
    'Best as a dominant tension chord with clear 13',
    'Shell-leaning — compact',
    'Root on string 5; 13 on high E'),

  s('std-r5-m13', 'extended', 'Minor 13', 'm13', 'standard', 5, 'Shell', 'expanded',
    [null, 0, 2, 0, 1, 2], [null, 'R', '5', 'b7', 'b3', '13'], [null, 1, 2, 1, 1, 4],
    'Jazz minor color',
    'Shell — best above fret 3',
    'Root on string 5; 13 on high E'),

  s('std-r5-aug', 'altered', 'Augmented', 'aug', 'standard', 5, 'Full', 'minimal',
    [null, 0, 3, 2, 2, 1], [null, 'R', '#5', 'R', '3', '#5'], [null, 1, 4, 2, 3, 1],
    'Dramatic + color on A-string roots',
    'Full voicing — moderate stretch',
    'Root on string 5',
    'Symmetric augmented — moves in major thirds'),

  s('std-r5-dim', 'altered', 'Diminished triad', 'dim', 'standard', 5, 'Shell', 'minimal',
    [null, 0, 1, 2, 1, null], [null, 'R', 'b5', 'R', 'b3', null], [null, 1, 2, 4, 3, null],
    'Passing diminished triad',
    'Compact shell',
    'Root on string 5'),

  s('std-r5-7sharp5', 'altered', 'Dominant 7#5', '7#5', 'standard', 5, 'Shell', 'expanded',
    [null, 0, 3, 0, 2, 1], [null, 'R', '#5', 'b7', '3', '#5'], [null, 1, 4, 1, 3, 2],
    'Altered dominant',
    'Shell — best above fret 3',
    'Root on string 5'),

  s('std-r5-7flat5', 'altered', 'Dominant 7b5', '7b5', 'standard', 5, 'Shell', 'expanded',
    [null, 0, 1, 0, 2, null], [null, 'R', 'b5', 'b7', '3', null], [null, 1, 2, 1, 3, null],
    'Altered / tritone-sub dominant',
    'Compact shell',
    'Root on string 5'),

  s('std-r5-7sharp11', 'altered', 'Dominant 7#11', '7#11', 'standard', 5, 'Shell', 'expanded',
    [null, 0, 1, 0, 2, 0], [null, 'R', '#11', 'b7', '3', '5'], [null, 1, 2, 1, 3, 1],
    'Lydian dominant color',
    'Compact shell',
    'Root on string 5; #11 on string 4'),

  s('std-r5-13flat9', 'altered', 'Dominant 13b9', '13b9', 'standard', 5, 'Shell', 'expanded',
    [null, 0, 2, 3, 2, 2], [null, 'R', '5', 'b9', '3', '13'], [null, 1, 2, 3, 2, 4],
    'Best as a dominant tension chord',
    'Shell — omits b7 (implied by dominant function); best above fret 3',
    'Root on string 5; b9 on string 3'),

  // ═══════════════════════════════════════════════════════════════════════════
  // STANDARD — root string 4 (pragmatic D-shape shells only)
  // ═══════════════════════════════════════════════════════════════════════════
  s('std-r4-major', 'core', 'Major', '', 'standard', 4, 'Shell', 'expanded',
    [null, null, 0, 2, 3, 2], [null, null, 'R', '5', 'R', '3'], [null, null, 1, 2, 4, 3],
    'Clean triad shell on D-string roots',
    'Compact shell — mirrors open D major',
    'Root on string 4'),

  s('std-r4-minor', 'core', 'Minor', 'm', 'standard', 4, 'Shell', 'expanded',
    [null, null, 0, 2, 3, 1], [null, null, 'R', '5', 'R', 'b3'], [null, null, 1, 3, 4, 2],
    'Minor triad shell on D-string roots',
    'Compact shell — mirrors open D minor',
    'Root on string 4'),

  s('std-r4-maj7', 'sevenths', 'Maj7', 'maj7', 'standard', 4, 'Shell', 'minimal',
    [null, null, 0, 2, 2, 2], [null, null, 'R', '5', '7', '3'], [null, null, 1, 2, 2, 2],
    'Best as a clean tonic shell',
    'Compact shell — excellent jazz grip',
    'Root on string 4',
    'One of the best maj7 shells on guitar'),

  s('std-r4-7', 'sevenths', 'Dominant 7', '7', 'standard', 4, 'Shell', 'minimal',
    [null, null, 0, 2, 1, 2], [null, null, 'R', '5', 'b7', '3'], [null, null, 1, 3, 2, 4],
    'Best as a dominant tension shell',
    'Compact shell',
    'Root on string 4'),

  s('std-r4-m7', 'sevenths', 'Minor 7', 'm7', 'standard', 4, 'Shell', 'minimal',
    [null, null, 0, 2, 1, 1], [null, null, 'R', '5', 'b7', 'b3'], [null, null, 1, 4, 2, 3],
    'ii / vi shell on D-string roots',
    'Compact shell',
    'Root on string 4'),

  // ═══════════════════════════════════════════════════════════════════════════
  // DROP — root string 6 (DADGBE model)
  // ═══════════════════════════════════════════════════════════════════════════
  s('drop-r6-5', 'core', 'Power (5)', '5', 'drop', 6, 'High-gain friendly', 'minimal',
    [0, 0, 0, null, null, null], ['R', '5', 'R', null, null, null], [1, 1, 1, null, null, null],
    'Works well under gain — drop-tuning one-finger power chord',
    'Compact shell — low three strings share the same fret',
    'Root on string 6',
    'Core drop-tuning advantage'),

  s('drop-r6-major', 'core', 'Major', '', 'drop', 6, 'Full', 'minimal',
    [0, 0, 0, 2, 3, 2], ['R', '5', 'R', '5', 'R', '3'], [1, 1, 1, 2, 4, 3],
    'Clean or light-gain tonic in drop',
    'Full voicing — one-finger barre + D-shape on top',
    'Root on string 6; mirrors drop “000232” geometry'),

  s('drop-r6-minor', 'core', 'Minor', 'm', 'drop', 6, 'Full', 'minimal',
    [0, 0, 0, 2, 3, 1], ['R', '5', 'R', '5', 'R', 'b3'], [1, 1, 1, 3, 4, 2],
    'Minor tonic in drop — metal / rock',
    'Full voicing — compact on top of power barre',
    'Root on string 6'),

  s('drop-r6-sus2', 'core', 'Sus2', 'sus2', 'drop', 6, 'Shell', 'minimal',
    [0, 0, 0, null, null, 0], ['R', '5', 'R', null, null, '9'], [1, 1, 1, null, null, 1],
    'High-gain friendly sus2 — open high E is a 9 above the drop root',
    'Compact shell',
    'Root on string 6; 9 on high E',
    'Drop-specific: high E is naturally a 9th above the low root'),

  s('drop-r6-sus4', 'core', 'Sus4', 'sus4', 'drop', 6, 'Shell', 'minimal',
    [0, 0, 0, null, null, 3], ['R', '5', 'R', null, null, '4'], [1, 1, 1, null, null, 4],
    'Suspension over drop power foundation',
    'Compact shell',
    'Root on string 6; 4 on high E'),

  s('drop-r6-add9', 'core', 'Add9', 'add9', 'drop', 6, 'Full', 'minimal',
    [0, 0, 2, 2, 3, 2], ['R', '5', '9', '5', 'R', '3'], [1, 1, 2, 3, 4, 3],
    'Best as a clean tonic color chord in drop',
    'Full voicing — 9 on the octave-D string at +2',
    'Root on string 6'),

  s('drop-r6-madd9', 'core', 'Minor add9', 'm(add9)', 'drop', 6, 'Full', 'expanded',
    [0, 0, 2, 2, 3, 1], ['R', '5', '9', '5', 'R', 'b3'], [1, 1, 2, 3, 4, 2],
    'Dark minor color over drop power',
    'Full voicing — best above fret 2',
    'Root on string 6'),

  s('drop-r6-6', 'core', 'Major 6', '6', 'drop', 6, 'Shell', 'expanded',
    [0, 0, 0, null, 0, 2], ['R', '5', 'R', null, '13', '3'], [1, 1, 1, null, 1, 3],
    '6/13 color with major 3 — clean drop tonic',
    'Compact shell',
    'Root on string 6; open-B relative is 13/6',
    'Label 13 here is the 6th degree (same pitch class)'),

  s('drop-r6-m6', 'core', 'Minor 6', 'm6', 'drop', 6, 'Shell', 'expanded',
    [0, 0, 0, null, 0, 1], ['R', '5', 'R', null, '13', 'b3'], [1, 1, 1, null, 1, 2],
    'Minor 6 color over drop power',
    'Compact shell',
    'Root on string 6'),

  s('drop-r6-maj7', 'sevenths', 'Maj7', 'maj7', 'drop', 6, 'Shell', 'minimal',
    [0, 0, 0, null, 2, 2], ['R', '5', 'R', null, '7', '3'], [1, 1, 1, null, 2, 3],
    'Best as a clean tonic color chord in drop',
    'Compact shell over power barre',
    'Root on string 6; 7 on string 2, 3 on string 1'),

  s('drop-r6-m7', 'sevenths', 'Minor 7', 'm7', 'drop', 6, 'Shell', 'minimal',
    [0, 0, 0, null, 1, 1], ['R', '5', 'R', null, 'b7', 'b3'], [1, 1, 1, null, 2, 3],
    'Works well under gain as a shell voicing',
    'Compact shell',
    'Root on string 6'),

  s('drop-r6-7', 'sevenths', 'Dominant 7', '7', 'drop', 6, 'Shell', 'minimal',
    [0, 0, 0, null, 1, 2], ['R', '5', 'R', null, 'b7', '3'], [1, 1, 1, null, 2, 3],
    'Best as a dominant tension chord in drop',
    'Compact shell — high-gain friendly',
    'Root on string 6'),

  s('drop-r6-m7b5', 'sevenths', 'Half-diminished (m7b5)', 'm7b5', 'drop', 6, 'Shell', 'minimal',
    [0, null, 0, 1, 1, 1], ['R', null, 'R', 'b5', 'b7', 'b3'], [1, null, 1, 2, 3, 4],
    'iiø in minor — jazz / prog',
    'Compact shell',
    'Root on string 6',
    'Drop: G+1 = b5'),

  s('drop-r6-dim7', 'sevenths', 'Diminished 7', 'dim7', 'drop', 6, 'Shell', 'minimal',
    [0, null, 0, 1, 0, 1], ['R', null, 'R', 'b5', '6', 'b3'], [1, null, 1, 3, 1, 2],
    'Passing diminished in drop context',
    'Compact shell',
    'Root on string 6; bb7 labeled 6 on string 2'),

  s('drop-r6-7sus4', 'sevenths', '7sus4', '7sus4', 'drop', 6, 'Shell', 'minimal',
    [0, 0, 0, null, 1, 3], ['R', '5', 'R', null, 'b7', '4'], [1, 1, 1, null, 2, 4],
    'Dominant suspension over drop power',
    'Compact shell',
    'Root on string 6'),

  s('drop-r6-maj9', 'extended', 'Maj9', 'maj9', 'drop', 6, 'Shell', 'minimal',
    [0, 0, 2, null, 2, 2], ['R', '5', '9', null, '7', '3'], [1, 1, 2, null, 3, 4],
    'Best as a clean tonic color chord',
    'Shell — best above fret 2',
    'Root on string 6'),

  s('drop-r6-m9', 'extended', 'Minor 9', 'm9', 'drop', 6, 'Shell', 'minimal',
    [0, 0, 2, null, 1, 1], ['R', '5', '9', null, 'b7', 'b3'], [1, 1, 2, null, 3, 4],
    'Dark minor 9 over drop foundation',
    'Shell — best above fret 2',
    'Root on string 6',
    'Under heavy gain, mute G–E and keep power'),

  s('drop-r6-9', 'extended', 'Dominant 9', '9', 'drop', 6, 'Shell', 'minimal',
    [0, 0, 2, null, 1, 2], ['R', '5', '9', null, 'b7', '3'], [1, 1, 2, null, 3, 4],
    'Best as a dominant tension chord',
    'Shell — best above fret 2',
    'Root on string 6'),

  s('drop-r6-m11', 'extended', 'Minor 11', 'm11', 'drop', 6, 'Shell', 'minimal',
    [0, 0, 0, 0, 1, 1], ['R', '5', 'R', '11', 'b7', 'b3'], [1, 1, 1, 1, 2, 3],
    'Modern minor 11 in drop',
    'Compact shell — open G is naturally an 11 above the drop root',
    'Root on string 6; 11 on string 3'),

  s('drop-r6-11', 'extended', 'Dominant 11 (no3)', '11', 'drop', 6, 'Shell', 'expanded',
    [0, 0, 0, 0, 1, 3], ['R', '5', 'R', '11', 'b7', '4'], [1, 1, 1, 1, 2, 4],
    'Dominant 11 without 3',
    'Compact shell',
    'Root on string 6',
    '4 on high E reinforces the sus/11 color'),

  s('drop-r6-13', 'extended', 'Dominant 13', '13', 'drop', 6, 'Shell', 'minimal',
    [0, 0, 0, null, 0, 2], ['R', '5', 'R', null, '13', '3'], [1, 1, 1, null, 1, 3],
    'Best as a dominant tension chord',
    'Compact shell — add b7 on G at +5 when desired',
    'Root on string 6; 13 on string 2 (natural in drop)'),

  s('drop-r6-aug', 'altered', 'Augmented', 'aug', 'drop', 6, 'Shell', 'minimal',
    [0, null, 0, 3, null, 2], ['R', null, 'R', '#5', null, '3'], [1, null, 1, 3, null, 2],
    'Clear + triad over drop root/octave',
    'Compact shell',
    'Root on string 6'),

  s('drop-r6-dim', 'altered', 'Diminished triad', 'dim', 'drop', 6, 'Shell', 'minimal',
    [0, null, 0, 1, null, 1], ['R', null, 'R', 'b5', null, 'b3'], [1, null, 1, 2, null, 3],
    'Passing diminished shell',
    'Compact shell',
    'Root on string 6'),

  s('drop-r6-7sharp5', 'altered', 'Dominant 7#5', '7#5', 'drop', 6, 'Shell', 'expanded',
    [0, null, 0, 3, 1, 2], ['R', null, 'R', '#5', 'b7', '3'], [1, null, 1, 4, 2, 3],
    'Altered dominant in drop',
    'Shell — best above fret 3',
    'Root on string 6'),

  s('drop-r6-7flat5', 'altered', 'Dominant 7b5', '7b5', 'drop', 6, 'Shell', 'expanded',
    [0, null, 0, 1, 1, 2], ['R', null, 'R', 'b5', 'b7', '3'], [1, null, 1, 2, 3, 4],
    'Altered / tritone-sub dominant',
    'Compact shell — high-gain friendly',
    'Root on string 6'),

  s('drop-r6-7sharp11', 'altered', 'Dominant 7#11', '7#11', 'drop', 6, 'Shell', 'expanded',
    [0, 0, 0, 1, 1, 2], ['R', '5', 'R', '#11', 'b7', '3'], [1, 1, 1, 2, 3, 4],
    'Lydian-dominant color in drop',
    'Compact shell',
    'Root on string 6; #11 on string 3'),

  s('drop-r6-13flat9', 'altered', 'Dominant 13b9', '13b9', 'drop', 6, 'Shell', 'expanded',
    [0, 0, 1, null, 0, 2], ['R', '5', 'b9', null, '13', '3'], [1, 1, 2, null, 1, 3],
    'Best as a dominant tension chord',
    'Shell — best above fret 3',
    'Root on string 6',
    'Lean shell; add b7 on G+5 when desired'),

  // ═══════════════════════════════════════════════════════════════════════════
  // DROP — root string 5 (upper strings match standard A-shapes)
  // ═══════════════════════════════════════════════════════════════════════════
  s('drop-r5-5', 'core', 'Power (5)', '5', 'drop', 5, 'High-gain friendly', 'minimal',
    [null, 0, 2, 2, null, null], [null, 'R', '5', 'R', null, null], [null, 1, 3, 4, null, null],
    'A-string power — same geometry as standard on strings 5–1',
    'Compact shell',
    'Root on string 5'),

  s('drop-r5-major', 'core', 'Major', '', 'drop', 5, 'Full', 'minimal',
    [null, 0, 2, 2, 2, 0], [null, 'R', '5', 'R', '3', '5'], [null, 1, 2, 3, 4, 1],
    'Clean tonic on A-string roots',
    'Full voicing',
    'Root on string 5',
    'Upper-string shapes transfer from standard'),

  s('drop-r5-minor', 'core', 'Minor', 'm', 'drop', 5, 'Full', 'minimal',
    [null, 0, 2, 2, 1, 0], [null, 'R', '5', 'R', 'b3', '5'], [null, 1, 3, 4, 2, 1],
    'Minor tonic on A-string roots',
    'Full voicing',
    'Root on string 5'),

  s('drop-r5-maj7', 'sevenths', 'Maj7', 'maj7', 'drop', 5, 'Full', 'minimal',
    [null, 0, 2, 1, 2, 0], [null, 'R', '5', '7', '3', '5'], [null, 1, 3, 2, 4, 1],
    'Best as a clean tonic color chord',
    'Full voicing',
    'Root on string 5'),

  s('drop-r5-m7', 'sevenths', 'Minor 7', 'm7', 'drop', 5, 'Full', 'minimal',
    [null, 0, 2, 0, 1, 0], [null, 'R', '5', 'b7', 'b3', '5'], [null, 1, 3, 1, 2, 1],
    'ii / vi workhorse — transfers from standard',
    'Full voicing',
    'Root on string 5'),

  s('drop-r5-7', 'sevenths', 'Dominant 7', '7', 'drop', 5, 'Full', 'minimal',
    [null, 0, 2, 0, 2, 0], [null, 'R', '5', 'b7', '3', '5'], [null, 1, 3, 1, 4, 1],
    'Best as a dominant tension chord',
    'Full voicing',
    'Root on string 5'),

  s('drop-r5-m11', 'extended', 'Minor 11', 'm11', 'drop', 5, 'Shell', 'minimal',
    [null, 0, 0, 0, 1, 0], [null, 'R', '11', 'b7', 'b3', '5'], [null, 1, 1, 1, 2, 1],
    'Modern minor — same pragmatic grip as standard',
    'Compact shell',
    'Root on string 5',
    'Closed when root fret ≥ 1'),

  s('drop-r5-9', 'extended', 'Dominant 9', '9', 'drop', 5, 'Full', 'expanded',
    [null, 0, 2, 4, 2, 3], [null, 'R', '5', '9', '3', 'b7'], [null, 1, 2, 4, 3, 3],
    'Funk / blues dominant on A-string roots',
    'Full voicing — best above fret 3',
    'Root on string 5'),
];

/** Helper to keep shape literals readable */
function s(id, chordFamily, chordType, symbol, tuningType, rootString, voicingCategory, practicalTag,
  frets, intervals, fingering, bestUse, playability, rootPositionNote, notes) {
  const shape = {
    id, chordFamily, chordType, symbol, tuningType, rootString,
    voicingCategory, practicalTag, frets, intervals, fingering,
    bestUse, playability, rootPositionNote,
  };
  if (notes) shape.notes = notes;
  return shape;
}

/** Unique chord types covered */
export function chordTypesInLibrary() {
  return [...new Set(SHAPES.map((x) => x.chordType))].sort();
}
