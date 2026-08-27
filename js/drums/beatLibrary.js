// The drum beat library: the grooves a player should own, by genre.
//
// Each entry is short on purpose. A groove runs for three bars and the fourth
// bar answers it with a fill that belongs to the same genre, so one loop
// teaches the feel and the way out of it. No entry is longer than eight bars.
//
// The bars are written on the grid of `patternScore.js`. Read a row left to
// right: one character is one step, `|` groups the steps for the eye, and `-`
// means the lane rests. The `LR` row names the hand, so the player reads the
// sticking of every fill under the staff.
//
// Tempo is written as a quarter-note BPM, because that is what the player
// reads. A swing feel is written in 12/8 or 9/8, where the triplet already is
// the written subdivision, so the page reads the way the groove sounds. The
// `pulse` field gives the felt beat of those grooves.

/** Every genre in the library, in the order the browser lists them. */
export const BEAT_GENRES = [
  'Rock', 'Punk', 'Metal', 'Jazz', 'Blues', 'Funk', 'Latin', 'Reggae',
  'Country', 'Hip-Hop',
];

/** The grooves. Bars 1 to 3 hold the feel, and the last bar holds the fill. */
export const BEATS = [
  /* ---------------- Rock ---------------- */
  {
    id: 'rock-backbeat',
    name: 'Rock Backbeat',
    genre: 'Rock',
    level: 1,
    bpm: 110,
    timeSig: [4, 4],
    grid: 16,
    feel: 'Straight eighths',
    about: 'The first groove every drummer learns. The hi-hat keeps eighth '
      + 'notes, the snare answers on 2 and 4, and the kick holds 1 and 3.',
    fill: 'Bar 4 walks eighth notes from the snare down to the floor tom.',
    focus: 'Keep the hi-hat even. The snare must land with the hi-hat, not after it.',
    bars: [
      { C: 'x---|----|----|----', H: '--x-|x-x-|x-x-|x-x-', S: '----|o---|----|o---', K: 'o---|----|o---|----' },
      { H: 'x-x-|x-x-|x-x-|x-x-', S: '----|o---|----|o---', K: 'o---|----|o---|----' },
      { H: 'x-x-|x-x-|x-x-|x-x-', S: '----|o---|----|o---', K: 'o---|----|o---|----' },
      {
        H: 'x-x-|x-x-|----|----',
        S: '----|o---|o-o-|----',
        T2: '----|----|----|o---',
        FT: '----|----|----|--o-',
        K: 'o---|----|----|----',
        LR: '----|----|R-L-|R-L-',
      },
    ],
  },
  {
    id: 'rock-half-time',
    name: 'Half-Time Rock',
    genre: 'Rock',
    level: 2,
    bpm: 86,
    timeSig: [4, 4],
    grid: 16,
    feel: 'Straight eighths, snare on 3',
    about: 'The snare moves to beat 3 and the groove doubles in width. Rock '
      + 'ballads and heavy choruses live here.',
    fill: 'Bar 4 fills sixteenth notes on the snare and lands on the floor tom.',
    focus: 'Hold the tempo. A half-time groove tempts the hands to slow down.',
    bars: [
      { C: 'x---|----|----|----', H: '--x-|x-x-|x-x-|x-x-', S: '----|----|o---|----', K: 'o---|--o-|----|o---' },
      { H: 'x-x-|x-x-|x-x-|x-x-', S: '----|----|o---|----', K: 'o---|--o-|----|o---' },
      { H: 'x-x-|x-x-|x-x-|x-x-', S: '----|----|o---|----', K: 'o---|--o-|----|o---' },
      {
        H: 'x-x-|x-x-|----|----',
        S: '----|----|oooo|oo--',
        FT: '----|----|----|--oo',
        K: 'o---|--o-|----|----',
        LR: '----|----|RLRL|RLRL',
      },
    ],
  },
  {
    id: 'rock-sixteenth-hats',
    name: 'Sixteenth-Note Rock',
    genre: 'Rock',
    level: 2,
    bpm: 92,
    timeSig: [4, 4],
    grid: 16,
    feel: 'Straight sixteenths on the hi-hat',
    about: 'The hi-hat plays every sixteenth note and the kick answers between '
      + 'the backbeats. This is the pop and rock groove of the radio.',
    fill: 'Bar 4 runs sixteenth notes from the snare to the floor tom.',
    focus: 'Keep the sixteenth notes quiet under the backbeat.',
    bars: [
      { C: 'x---|----|----|----', H: '-xxx|xxxx|xxxx|xxxx', S: '----|o---|----|o---', K: 'o--o|----|o---|--o-' },
      { H: 'xxxx|xxxx|xxxx|xxxx', S: '----|o---|----|o---', K: 'o--o|----|o---|--o-' },
      { H: 'xxxx|xxxx|xxxx|xxxx', S: '----|o---|----|o---', K: 'o--o|----|o---|--o-' },
      {
        H: 'xxxx|xxxx|----|----',
        S: '----|o---|oooo|----',
        T2: '----|----|----|oo--',
        FT: '----|----|----|--oo',
        K: 'o--o|----|----|----',
        LR: '----|----|RLRL|RLRL',
      },
    ],
  },
  {
    id: 'rock-ride-groove',
    name: 'Hard Rock Ride',
    genre: 'Rock',
    level: 2,
    bpm: 132,
    timeSig: [4, 4],
    grid: 16,
    feel: 'Straight eighths on the ride',
    about: 'The hand moves to the ride and the kick fills the holes. The groove '
      + 'opens up for a loud chorus.',
    fill: 'Bar 4 drops sixteenth notes down the toms, two to a drum.',
    focus: 'Play the ride on the bow, not the bell, so the backbeat still cuts.',
    bars: [
      { C: 'x---|----|----|----', R: '--x-|x-x-|x-x-|x-x-', S: '----|o---|----|o---', K: 'o--o|--o-|o---|--o-' },
      { R: 'x-x-|x-x-|x-x-|x-x-', S: '----|o---|----|o---', K: 'o--o|--o-|o---|--o-' },
      { R: 'x-x-|x-x-|x-x-|x-x-', S: '----|o---|----|o---', K: 'o--o|--o-|o---|--o-' },
      {
        R: 'x-x-|x-x-|----|----',
        S: '----|o---|oo--|----',
        T1: '----|----|--oo|----',
        T2: '----|----|----|oo--',
        FT: '----|----|----|--oo',
        K: 'o---|----|----|----',
        LR: '----|----|RLRL|RLRL',
      },
    ],
  },

  /* ---------------- Punk ---------------- */
  {
    id: 'punk-skank',
    name: 'Skank Beat',
    genre: 'Punk',
    level: 2,
    bpm: 168,
    timeSig: [4, 4],
    grid: 16,
    feel: 'Fast eighths, snare on every upbeat',
    about: 'The kick takes every downbeat and the snare takes every upbeat. '
      + 'Ska punk and hardcore run on this groove.',
    fill: 'Bar 4 answers with a straight sixteenth-note snare roll.',
    focus: 'Stay relaxed. Speed comes from a loose grip, not from a hard hit.',
    bars: [
      { C: 'x---|----|----|----', H: '--x-|x-x-|x-x-|x-x-', S: '--o-|--o-|--o-|--o-', K: 'o---|o---|o---|o---' },
      { H: 'x-x-|x-x-|x-x-|x-x-', S: '--o-|--o-|--o-|--o-', K: 'o---|o---|o---|o---' },
      { H: 'x-x-|x-x-|x-x-|x-x-', S: '--o-|--o-|--o-|--o-', K: 'o---|o---|o---|o---' },
      {
        H: 'x-x-|x-x-|----|----',
        S: '--o-|--o-|oooo|oooo',
        K: 'o---|o---|----|o---',
        LR: '----|----|RLRL|RLRL',
      },
    ],
  },
  {
    id: 'punk-d-beat',
    name: 'D-Beat',
    genre: 'Punk',
    level: 2,
    bpm: 160,
    timeSig: [4, 4],
    grid: 16,
    feel: 'Straight eighths with a driving kick',
    about: 'The kick lands on 1 and on the "and" of 2, then repeats. Hardcore '
      + 'punk and crust take their name from this pattern.',
    fill: 'Bar 4 rolls the floor tom under the kick and pushes into the next bar.',
    focus: 'The kick pattern is the beat. Let the hi-hat stay flat and even.',
    bars: [
      { C: 'x---|----|----|----', H: '--x-|x-x-|x-x-|x-x-', S: '----|o---|----|o---', K: 'o---|--o-|o---|--o-' },
      { H: 'x-x-|x-x-|x-x-|x-x-', S: '----|o---|----|o---', K: 'o---|--o-|o---|--o-' },
      { H: 'x-x-|x-x-|x-x-|x-x-', S: '----|o---|----|o---', K: 'o---|--o-|o---|--o-' },
      {
        H: 'x-x-|x-x-|----|----',
        S: '----|o---|oo--|----',
        FT: '----|----|--oo|oooo',
        K: 'o---|--o-|----|o-o-',
        LR: '----|----|RLRL|RLRL',
      },
    ],
  },
  {
    id: 'punk-two-beat',
    name: 'Two-Beat Punk',
    genre: 'Punk',
    level: 1,
    bpm: 180,
    timeSig: [4, 4],
    grid: 16,
    feel: 'Fast eighths, kick in pairs',
    about: 'A pair of kicks opens beats 1 and 3, and the snare holds 2 and 4. '
      + 'This is the engine of first-wave punk rock.',
    fill: 'Bar 4 breaks into a stop-time snare figure.',
    focus: 'Keep the two kicks even. The second one wants to rush.',
    bars: [
      { C: 'x---|----|----|----', H: '--x-|x-x-|x-x-|x-x-', S: '----|o---|----|o---', K: 'o-o-|----|o-o-|----' },
      { H: 'x-x-|x-x-|x-x-|x-x-', S: '----|o---|----|o---', K: 'o-o-|----|o-o-|----' },
      { H: 'x-x-|x-x-|x-x-|x-x-', S: '----|o---|----|o---', K: 'o-o-|----|o-o-|----' },
      {
        H: 'x-x-|x-x-|----|----',
        S: '----|o---|o-oo|o-oo',
        K: 'o-o-|----|----|----',
        LR: '----|----|R-LR|L-RL',
      },
    ],
  },

  /* ---------------- Metal ---------------- */
  {
    id: 'metal-double-bass',
    name: 'Double Bass Drive',
    genre: 'Metal',
    level: 3,
    bpm: 144,
    timeSig: [4, 4],
    grid: 16,
    feel: 'Sixteenth-note double bass',
    about: 'Both feet run sixteenth notes while the hands hold the ride and the '
      + 'backbeat. The groove sits under most modern metal.',
    fill: 'Bar 4 drops the hands down the toms and never stops the feet.',
    focus: 'Match the two feet. Record yourself and listen for a limping pair.',
    bars: [
      { C: 'x---|----|----|----', R: '--x-|x-x-|x-x-|x-x-', S: '----|o---|----|o---', K: 'oooo|oooo|oooo|oooo' },
      { R: 'x-x-|x-x-|x-x-|x-x-', S: '----|o---|----|o---', K: 'oooo|oooo|oooo|oooo' },
      { R: 'x-x-|x-x-|x-x-|x-x-', S: '----|o---|----|o---', K: 'oooo|oooo|oooo|oooo' },
      {
        R: 'x-x-|x-x-|----|----',
        S: '----|o---|oo--|----',
        T1: '----|----|--oo|----',
        T2: '----|----|----|oo--',
        FT: '----|----|----|--oo',
        K: 'oooo|oooo|oooo|oooo',
        LR: '----|----|RLRL|RLRL',
      },
    ],
  },
  {
    id: 'metal-blast-beat',
    name: 'Traditional Blast Beat',
    genre: 'Metal',
    level: 3,
    bpm: 176,
    timeSig: [4, 4],
    grid: 16,
    feel: 'Alternating hands at eighth-note speed',
    about: 'The cymbal hand and the snare hand alternate, and the kick follows '
      + 'the cymbal. Death metal and grindcore use it as a wall of sound.',
    fill: 'Bar 4 collapses the blast into a snare burst and a floor tom landing.',
    focus: 'The two hands must be equally loud. A weak snare hand kills the blast.',
    bars: [
      { C: 'x---|----|----|----', H: '--x-|x-x-|x-x-|x-x-', S: '--o-|--o-|--o-|--o-', K: 'o---|o---|o---|o---' },
      { H: 'x-x-|x-x-|x-x-|x-x-', S: '--o-|--o-|--o-|--o-', K: 'o---|o---|o---|o---' },
      { H: 'x-x-|x-x-|x-x-|x-x-', S: '--o-|--o-|--o-|--o-', K: 'o---|o---|o---|o---' },
      {
        H: 'x-x-|x-x-|----|----',
        S: '--o-|--o-|oooo|oo--',
        FT: '----|----|----|--oo',
        K: 'o---|o---|o-o-|o-o-',
        LR: '----|----|RLRL|RLRL',
      },
    ],
  },
  {
    id: 'metal-thrash-gallop',
    name: 'Thrash Gallop',
    genre: 'Metal',
    level: 3,
    bpm: 165,
    timeSig: [4, 4],
    grid: 16,
    feel: 'Galloping kick under straight eighths',
    about: 'The kick plays an eighth note and two sixteenth notes on every beat. '
      + 'The gallop locks with the guitar riff of a thrash tune.',
    fill: 'Bar 4 answers with sixteenth notes on the snare into the low toms.',
    focus: 'Play the gallop from the ankle. A whole-leg stroke cannot keep up.',
    bars: [
      { C: 'c---|----|----|----', H: '--x-|x-x-|x-x-|x-x-', S: '----|o---|----|o---', K: 'o-oo|o-oo|o-oo|o-oo' },
      { H: 'x-x-|x-x-|x-x-|x-x-', S: '----|o---|----|o---', K: 'o-oo|o-oo|o-oo|o-oo' },
      { H: 'x-x-|x-x-|x-x-|x-x-', S: '----|o---|----|o---', K: 'o-oo|o-oo|o-oo|o-oo' },
      {
        H: 'x-x-|x-x-|----|----',
        S: '----|o---|oooo|o---',
        T2: '----|----|----|-oo-',
        FT: '----|----|----|---o',
        K: 'o-oo|o-oo|----|----',
        LR: '----|----|RLRL|RLRL',
      },
    ],
  },
  {
    id: 'metal-groove-half-time',
    name: 'Groove Metal Half-Time',
    genre: 'Metal',
    level: 2,
    bpm: 100,
    timeSig: [4, 4],
    grid: 16,
    feel: 'Half time with a syncopated kick',
    about: 'The snare waits for beat 3 and the kick answers the riff. Groove '
      + 'metal leans on the space between the hits.',
    fill: 'Bar 4 takes the snare through the toms and back for a kick pickup.',
    focus: 'Play the kick figure exactly. The groove lives or dies on it.',
    bars: [
      { C: 'c---|----|----|----', H: '--x-|x-x-|x-x-|x-x-', S: '----|----|o---|----', K: 'o-oo|----|o---|oo--' },
      { H: 'x-x-|x-x-|x-x-|x-x-', S: '----|----|o---|----', K: 'o-oo|----|o---|oo--' },
      { H: 'x-x-|x-x-|x-x-|x-x-', S: '----|----|o---|----', K: 'o-oo|----|o---|oo--' },
      {
        H: 'x-x-|x-x-|----|----',
        S: '----|----|o---|o-oo',
        T2: '----|----|-oo-|----',
        FT: '----|----|---o|----',
        K: 'o-oo|----|----|o---',
        LR: '----|----|RLRL|R-LR',
      },
    ],
  },

  /* ---------------- Jazz ---------------- */
  {
    id: 'jazz-medium-swing',
    name: 'Medium Swing',
    genre: 'Jazz',
    level: 2,
    bpm: 180,
    pulse: 120,
    timeSig: [12, 8],
    grid: 12,
    feel: 'Swing. The bar is 12/8, so one felt beat is a dotted quarter.',
    about: 'The ride cymbal carries the time, the hi-hat closes on 2 and 4, and '
      + 'the kick feathers under the band. This is the sound of jazz time.',
    fill: 'Bar 4 trades a triplet figure between the snare and the tom.',
    focus: 'Let the ride breathe. The second note of each pair is a triplet, not '
      + 'a sixteenth note.',
    bars: [
      { R: 'x--|x-x|x--|x-x', H: '---|+--|---|+--', K: 'o--|o--|o--|o--' },
      { R: 'x--|x-x|x--|x-x', H: '---|+--|---|+--', K: 'o--|o--|o--|o--' },
      { R: 'x--|x-x|x--|x-x', H: '---|+--|---|+--', S: '---|---|---|--g', K: 'o--|o--|o--|o--' },
      {
        R: 'x--|x-x|---|---',
        H: '---|+--|---|+--',
        S: '---|---|ooo|o-o',
        T2: '---|---|---|-o-',
        K: 'o--|o--|---|o--',
        LR: '---|---|RLR|LRL',
      },
    ],
  },
  {
    id: 'jazz-waltz',
    name: 'Jazz Waltz',
    genre: 'Jazz',
    level: 3,
    bpm: 180,
    pulse: 120,
    timeSig: [9, 8],
    grid: 9,
    feel: 'Swing in three. The bar is 9/8, so one felt beat is a dotted quarter.',
    about: 'Three felt beats to the bar with a swung ride. The hi-hat closes on '
      + '2 and 3 and holds the waltz upright.',
    fill: 'Bar 4 answers with a triplet turn on the snare and the tom.',
    focus: 'Count in three. The pattern is easy to hear as four and then it falls over.',
    bars: [
      { R: 'x--|x-x|x-x', H: '---|+--|+--', K: 'o--|---|---' },
      { R: 'x--|x-x|x-x', H: '---|+--|+--', K: 'o--|---|---' },
      { R: 'x--|x-x|x-x', H: '---|+--|+--', S: '---|---|--g', K: 'o--|---|---' },
      {
        R: 'x--|---|---',
        H: '---|+--|+--',
        S: '---|ooo|oo-',
        T2: '---|---|--o',
        K: 'o--|---|---',
        LR: '---|RLR|LRL',
      },
    ],
  },
  {
    id: 'jazz-big-band-shuffle',
    name: 'Big Band Shuffle',
    genre: 'Jazz',
    level: 2,
    bpm: 180,
    pulse: 120,
    timeSig: [12, 8],
    grid: 12,
    feel: 'Shuffle. The bar is 12/8, so one felt beat is a dotted quarter.',
    about: 'The ride shuffles on every beat and the snare takes the backbeat. '
      + 'A big band rides on this groove all night.',
    fill: 'Bar 4 answers the band with two beats of triplets on the snare.',
    focus: 'Drop the middle triplet of every beat. That silence is the shuffle.',
    bars: [
      { R: 'x-x|x-x|x-x|x-x', H: '---|+--|---|+--', S: '---|o--|---|o--', K: 'o--|---|o--|---' },
      { R: 'x-x|x-x|x-x|x-x', H: '---|+--|---|+--', S: '---|o--|---|o--', K: 'o--|---|o--|---' },
      { R: 'x-x|x-x|x-x|x-x', H: '---|+--|---|+--', S: '---|o--|---|o--', K: 'o--|---|o--|---' },
      {
        R: 'x-x|x-x|---|---',
        H: '---|+--|---|+--',
        S: '---|o--|ooo|oo-',
        T2: '---|---|---|--o',
        K: 'o--|---|---|o--',
        LR: '---|---|RLR|LRL',
      },
    ],
  },

  /* ---------------- Blues ---------------- */
  {
    id: 'blues-chicago-shuffle',
    name: 'Chicago Shuffle',
    genre: 'Blues',
    level: 1,
    bpm: 165,
    pulse: 110,
    timeSig: [12, 8],
    grid: 12,
    feel: 'Shuffle. The bar is 12/8, so one felt beat is a dotted quarter.',
    about: 'A shuffled hi-hat, a hard backbeat, and a kick on 1 and 3. Every '
      + 'blues band expects this groove.',
    fill: 'Bar 4 answers with a triplet pickup down to the floor tom.',
    focus: 'Keep the shuffle wide. A narrow shuffle turns into straight eighths.',
    bars: [
      { H: 'x-x|x-x|x-x|x-x', S: '---|o--|---|o--', K: 'o--|---|o--|---' },
      { H: 'x-x|x-x|x-x|x-x', S: '---|o--|---|o--', K: 'o--|---|o--|---' },
      { H: 'x-x|x-x|x-x|x-x', S: '---|o--|---|o--', K: 'o--|---|o--|---' },
      {
        H: 'x-x|x-x|---|---',
        S: '---|o--|o-o|oo-',
        FT: '---|---|---|--o',
        K: 'o--|---|---|o--',
        LR: '---|---|R-L|RLR',
      },
    ],
  },
  {
    id: 'blues-slow-twelve-eight',
    name: 'Slow Blues 12/8',
    genre: 'Blues',
    level: 1,
    bpm: 96,
    pulse: 64,
    timeSig: [12, 8],
    grid: 12,
    feel: 'Straight triplets in 12/8',
    about: 'The ride plays every triplet and the backbeat sits heavy. Slow blues '
      + 'gives every note room, so every note must be placed.',
    fill: 'Bar 4 walks a triplet fill from the snare down through the toms.',
    focus: 'Play the triplets evenly at low volume, then lift the backbeat over them.',
    bars: [
      { R: 'xxx|xxx|xxx|xxx', S: '---|o--|---|o--', K: 'o--|---|o--|---' },
      { R: 'xxx|xxx|xxx|xxx', S: '---|o--|---|o--', K: 'o--|---|o--|---' },
      { R: 'xxx|xxx|xxx|xxx', S: '---|o--|---|o--', K: 'o--|---|o--|---' },
      {
        R: 'xxx|xxx|---|---',
        S: '---|o--|oo-|---',
        T1: '---|---|--o|---',
        T2: '---|---|---|oo-',
        FT: '---|---|---|--o',
        K: 'o--|---|---|---',
        LR: '---|---|RLR|LRL',
      },
    ],
  },
  {
    id: 'blues-half-time-shuffle',
    name: 'Half-Time Shuffle',
    genre: 'Blues',
    level: 3,
    bpm: 150,
    pulse: 100,
    timeSig: [12, 8],
    grid: 12,
    feel: 'Shuffle with ghost notes. One felt beat is a dotted quarter.',
    about: 'A shuffled hi-hat over a snare that whispers the triplets and shouts '
      + 'on beat 3. The groove is hard and it must still sound easy.',
    fill: 'Bar 4 opens the ghost notes into a full triplet roll.',
    focus: 'The ghost notes stay very soft. Only beat 3 is loud.',
    bars: [
      { H: 'x-x|x-x|x-x|x-x', S: '--g|g-g|O--|g-g', K: 'o--|---|--o|---' },
      { H: 'x-x|x-x|x-x|x-x', S: '--g|g-g|O--|g-g', K: 'o--|---|--o|---' },
      { H: 'x-x|x-x|x-x|x-x', S: '--g|g-g|O--|g-g', K: 'o--|---|--o|---' },
      {
        H: 'x-x|x-x|---|---',
        S: '--g|g-g|Ooo|ooo',
        K: 'o--|---|---|---',
        LR: '---|---|RLR|LRL',
      },
    ],
  },

  /* ---------------- Funk ---------------- */
  {
    id: 'funk-ghost-notes',
    name: 'Sixteenth-Note Funk',
    genre: 'Funk',
    level: 3,
    bpm: 96,
    timeSig: [4, 4],
    grid: 16,
    feel: 'Straight sixteenths with ghost notes',
    about: 'The snare hand never stops. Between the backbeats it plays ghost '
      + 'notes so quiet that they read as texture, not as notes.',
    fill: 'Bar 4 lifts the ghost notes into a full sixteenth-note fill.',
    focus: 'Make the ghost notes almost silent. The gap in volume is the groove.',
    bars: [
      { H: 'xxxx|xxxx|xxxx|xxxx', S: '---g|o--g|--g-|o-g-', K: 'o--o|--o-|o---|--o-' },
      { H: 'xxxx|xxxx|xxxx|xxxx', S: '---g|o--g|--g-|o-g-', K: 'o--o|--o-|o---|--o-' },
      { H: 'xxxx|xxxx|xxxx|xxxx', S: '---g|o--g|--g-|o-g-', K: 'o--o|--o-|o---|--o-' },
      {
        H: 'xxxx|xxxx|----|----',
        S: '---g|o--g|ogoo|goo-',
        T2: '----|----|----|---o',
        K: 'o--o|--o-|----|o---',
        LR: '----|----|RLRL|RLRL',
      },
    ],
  },
  {
    id: 'funk-open-hats',
    name: 'Open Hi-Hat Funk',
    genre: 'Funk',
    level: 2,
    bpm: 108,
    timeSig: [4, 4],
    grid: 16,
    feel: 'Eighth notes with an open hi-hat on every upbeat',
    about: 'The hi-hat opens on every "and" and closes on the beat. The dance '
      + 'floor hears the foot as much as the hands.',
    fill: 'Bar 4 answers with a sixteenth-note snare fill into the toms.',
    focus: 'Close the hi-hat exactly on the beat. A late close smears the groove.',
    bars: [
      { H: 'x-O-|x-O-|x-O-|x-O-', S: '----|o---|----|o---', K: 'o--o|--o-|o---|--o-' },
      { H: 'x-O-|x-O-|x-O-|x-O-', S: '----|o---|----|o---', K: 'o--o|--o-|o---|--o-' },
      { H: 'x-O-|x-O-|x-O-|x-O-', S: '----|o---|----|o---', K: 'o--o|--o-|o---|--o-' },
      {
        H: 'x-O-|x-O-|----|----',
        S: '----|o---|oo-o|o---',
        T2: '----|----|----|-oo-',
        FT: '----|----|----|---o',
        K: 'o--o|--o-|----|----',
        LR: '----|----|RL-R|LRLR',
      },
    ],
  },
  {
    id: 'funk-linear',
    name: 'Linear Funk',
    genre: 'Funk',
    level: 3,
    bpm: 100,
    timeSig: [4, 4],
    grid: 16,
    feel: 'Linear sixteenths. No two limbs ever land together.',
    about: 'Every sixteenth note belongs to one limb only. The groove sounds '
      + 'busy and stays clean, because nothing doubles up.',
    fill: 'Bar 4 keeps the linear rule and moves the hands around the toms.',
    focus: 'Say the order out loud: foot, hand, hand, hand. Never two at once.',
    bars: [
      { K: 'o---|--o-|o---|--o-', H: '-x-x|-x-x|-x-x|-x-x', S: '--g-|o---|--g-|o---' },
      { K: 'o---|--o-|o---|--o-', H: '-x-x|-x-x|-x-x|-x-x', S: '--g-|o---|--g-|o---' },
      { K: 'o---|--o-|o---|--o-', H: '-x-x|-x-x|-x-x|-x-x', S: '--g-|o---|--g-|o---' },
      {
        K: 'o---|--o-|----|----',
        H: '-x-x|-x-x|----|----',
        S: '--g-|o---|oo--|----',
        T2: '----|----|--oo|----',
        FT: '----|----|----|oooo',
        LR: '----|----|RLRL|RLRL',
      },
    ],
  },

  /* ---------------- Latin ---------------- */
  {
    id: 'latin-bossa-nova',
    name: 'Bossa Nova',
    genre: 'Latin',
    level: 2,
    bpm: 128,
    timeSig: [4, 4],
    grid: 16,
    feel: 'Straight eighths with a two-bar clave',
    about: 'The side stick plays the bossa clave across two bars while the kick '
      + 'holds a steady surdo pattern. The groove must stay quiet.',
    fill: 'Bar 4 closes the clave and turns around on the toms.',
    focus: 'The clave takes two bars. Count both bars or the pattern flips.',
    bars: [
      { H: 'x-x-|x-x-|x-x-|x-x-', S: '@---|--@-|----|@---', K: 'o---|--o-|o---|--o-' },
      { H: 'x-x-|x-x-|x-x-|x-x-', S: '----|@---|--@-|----', K: 'o---|--o-|o---|--o-' },
      { H: 'x-x-|x-x-|x-x-|x-x-', S: '@---|--@-|----|@---', K: 'o---|--o-|o---|--o-' },
      {
        H: 'x-x-|x-x-|x-x-|x---',
        S: '----|@---|--@-|----',
        T1: '----|----|----|-o--',
        T2: '----|----|----|--o-',
        FT: '----|----|----|---o',
        K: 'o---|--o-|o---|--o-',
        LR: '----|----|----|-RLR',
      },
    ],
  },
  {
    id: 'latin-samba',
    name: 'Samba',
    genre: 'Latin',
    level: 3,
    bpm: 100,
    timeSig: [4, 4],
    grid: 16,
    feel: 'Felt in two, sixteenths in the hand',
    about: 'The right hand runs sixteenth notes, the left foot answers on 2 and '
      + '4, and the kick keeps the surdo alive on every eighth note.',
    fill: 'Bar 4 breaks to the floor tom while the feet hold the samba.',
    focus: 'The feet never change. Learn them first and add the hands after.',
    bars: [
      { R: 'xxxx|xxxx|xxxx|xxxx', H: '----|+---|----|+---', S: '--@-|@--@|--@-|@--@', K: 'o-o-|o-o-|o-o-|o-o-' },
      { R: 'xxxx|xxxx|xxxx|xxxx', H: '----|+---|----|+---', S: '--@-|@--@|--@-|@--@', K: 'o-o-|o-o-|o-o-|o-o-' },
      { R: 'xxxx|xxxx|xxxx|xxxx', H: '----|+---|----|+---', S: '--@-|@--@|--@-|@--@', K: 'o-o-|o-o-|o-o-|o-o-' },
      {
        R: 'xxxx|xxxx|----|----',
        H: '----|+---|----|+---',
        S: '--@-|@--@|o-o-|o---',
        FT: '----|----|-o-o|-ooo',
        K: 'o-o-|o-o-|o-o-|o-o-',
        LR: '----|----|RLRL|RLRL',
      },
    ],
  },

  /* ---------------- Reggae ---------------- */
  {
    id: 'reggae-one-drop',
    name: 'One Drop',
    genre: 'Reggae',
    level: 1,
    bpm: 78,
    timeSig: [4, 4],
    grid: 16,
    feel: 'Straight eighths with an empty beat 1',
    about: 'Beat 1 is silent. The kick and the side stick land together on beat '
      + '3, and the whole groove leans on that one point.',
    fill: 'Bar 4 answers with a soft tom figure and returns to the drop.',
    focus: 'Do not play beat 1. The silence is the name of the groove.',
    bars: [
      { H: 'x-x-|x-x-|x-x-|x-O-', S: '----|----|@---|----', K: '----|----|o---|----' },
      { H: 'x-x-|x-x-|x-x-|x-O-', S: '----|----|@---|----', K: '----|----|o---|----' },
      { H: 'x-x-|x-x-|x-x-|x-O-', S: '----|----|@---|----', K: '----|----|o---|----' },
      {
        H: 'x-x-|x-x-|----|----',
        S: '----|----|o---|o-o-',
        T2: '----|----|-oo-|----',
        FT: '----|----|----|-o-o',
        K: '----|----|o---|----',
        LR: '----|----|RLRL|RLRL',
      },
    ],
  },
  {
    id: 'reggae-rockers',
    name: 'Rockers',
    genre: 'Reggae',
    level: 2,
    bpm: 82,
    timeSig: [4, 4],
    grid: 16,
    feel: 'Straight eighths with the kick on every beat',
    about: 'The kick takes all four beats and the snare keeps beat 3. The groove '
      + 'pushes harder than the one drop and still stays behind the beat.',
    fill: 'Bar 4 rolls the snare through the toms without dropping the kick.',
    focus: 'Play the kick evenly. Every beat carries the same weight.',
    bars: [
      { H: 'x-x-|x-x-|x-x-|x-x-', S: '----|----|o---|----', K: 'o---|o---|o---|o---' },
      { H: 'x-x-|x-x-|x-x-|x-x-', S: '----|----|o---|----', K: 'o---|o---|o---|o---' },
      { H: 'x-x-|x-x-|x-x-|x-x-', S: '----|----|o---|----', K: 'o---|o---|o---|o---' },
      {
        H: 'x-x-|x-x-|----|----',
        S: '----|----|o-oo|o---',
        T2: '----|----|----|-oo-',
        FT: '----|----|----|---o',
        K: 'o---|o---|o---|o---',
        LR: '----|----|R-LR|LRLR',
      },
    ],
  },

  /* ---------------- Country ---------------- */
  {
    id: 'country-train-beat',
    name: 'Train Beat',
    genre: 'Country',
    level: 2,
    bpm: 120,
    timeSig: [4, 4],
    grid: 16,
    feel: 'Sixteenth notes on the snare, accents on 2 and 4',
    about: 'Both hands run sixteenth notes on the snare. The accents on 2 and 4 '
      + 'ride over a bed of ghost notes, and the beat sounds like a train.',
    fill: 'Bar 4 opens the accents out and lands on the toms.',
    focus: 'Alternate the hands strictly. The sticking is the whole exercise.',
    bars: [
      { S: 'gggg|Oggg|gggg|Oggg', H: '----|+---|----|+---', K: 'o---|----|o---|----', LR: 'RLRL|RLRL|RLRL|RLRL' },
      { S: 'gggg|Oggg|gggg|Oggg', H: '----|+---|----|+---', K: 'o---|----|o---|----', LR: 'RLRL|RLRL|RLRL|RLRL' },
      { S: 'gggg|Oggg|gggg|Oggg', H: '----|+---|----|+---', K: 'o---|----|o---|----', LR: 'RLRL|RLRL|RLRL|RLRL' },
      {
        S: 'gggg|Oggg|OgOg|Og--',
        T2: '----|----|----|--o-',
        FT: '----|----|----|---o',
        H: '----|+---|----|----',
        K: 'o---|----|----|o---',
        LR: 'RLRL|RLRL|RLRL|RLRL',
      },
    ],
  },

  /* ---------------- Hip-Hop ---------------- */
  {
    id: 'hiphop-boom-bap',
    name: 'Boom Bap',
    genre: 'Hip-Hop',
    level: 1,
    bpm: 88,
    timeSig: [4, 4],
    grid: 16,
    feel: 'Straight eighths, laid back',
    about: 'A hard kick, a hard snare, and nothing in the way. The groove leaves '
      + 'the space that a rapper needs.',
    fill: 'Bar 4 answers with a short snare figure on beat 4.',
    focus: 'Sit behind the click. Boom bap drags on purpose.',
    bars: [
      { H: 'x-x-|x-x-|x-x-|x-x-', S: '----|o---|----|o---', K: 'o--o|----|--o-|--o-' },
      { H: 'x-x-|x-x-|x-x-|x-x-', S: '----|o---|----|o---', K: 'o--o|----|--o-|--o-' },
      { H: 'x-x-|x-x-|x-x-|x-x-', S: '----|o---|----|o---', K: 'o--o|----|--o-|--o-' },
      {
        H: 'x-x-|x-x-|x-x-|----',
        S: '----|o---|----|o-oo',
        K: 'o--o|----|--o-|----',
        LR: '----|----|----|R-LR',
      },
    ],
  },
];

/** One beat by id, or null. */
export function beatById(id) {
  return BEATS.find((beat) => beat.id === id) || null;
}

/** The beats of one genre, in library order. */
export function beatsOfGenre(genre) {
  return BEATS.filter((beat) => beat.genre === genre);
}

/** The beat ids, in library order. */
export function beatIds() {
  return BEATS.map((beat) => beat.id);
}
