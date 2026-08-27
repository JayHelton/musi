// The rudiment library: the hand patterns behind every fill and every groove.
//
// The single-stroke family is not here. Every entry mixes the hands in a way
// that a straight alternation does not teach: a diddle, a flam, or a drag.
//
// Every rudiment carries a full sticking, so the player reads the hand of each
// stroke under the staff. Each entry runs two bars: the first bar leads with
// the right hand and the second bar leads with the left, because a rudiment is
// only learned when both hands can start it.
//
// The `sticking` field spells the pattern in the way a teacher writes it. A
// capital letter is a full stroke and a lowercase letter is a grace stroke, so
// `lR` is a flam and `llR` is a drag.
//
// A triplet rudiment is written in 6/8, where the triplet already is the
// written subdivision. The `pulse` field gives the felt beat of those entries.

/** The four rudiment families of the Percussive Arts Society list. */
export const RUDIMENT_FAMILIES = ['Roll', 'Diddle', 'Flam', 'Drag'];

/** The rudiments, ordered by family and then by difficulty. */
export const RUDIMENTS = [
  /* ---------------- Roll rudiments ---------------- */
  {
    id: 'double-stroke-roll',
    name: 'Double Stroke Open Roll',
    family: 'Roll',
    pas: 6,
    level: 1,
    bpm: 80,
    timeSig: [4, 4],
    grid: 16,
    sticking: 'RR LL RR LL',
    about: 'Two strokes for every hand, over and over. The open roll is the '
      + 'root of every roll rudiment on the list.',
    focus: 'Both strokes of a pair must sound the same. Play the second stroke, '
      + 'do not let the stick bounce it.',
    bars: [
      { S: 'oooo|oooo|oooo|oooo', LR: 'RRLL|RRLL|RRLL|RRLL' },
      { S: 'oooo|oooo|oooo|oooo', LR: 'LLRR|LLRR|LLRR|LLRR' },
    ],
  },
  {
    id: 'five-stroke-roll',
    name: 'Five Stroke Roll',
    family: 'Roll',
    pas: 7,
    level: 1,
    bpm: 80,
    timeSig: [4, 4],
    grid: 16,
    sticking: 'RRLL R  ·  LLRR L',
    about: 'Two diddles and one accented stroke. It is the shortest roll a '
      + 'drummer uses inside a groove.',
    focus: 'The accent ends the roll. Bring the accented stick up high before it.',
    bars: [
      { S: 'oooo|O---|oooo|O---', LR: 'RRLL|R---|LLRR|L---' },
      { S: 'oooo|O---|oooo|O---', LR: 'RRLL|R---|LLRR|L---' },
    ],
  },
  {
    id: 'six-stroke-roll',
    name: 'Six Stroke Roll',
    family: 'Roll',
    pas: 11,
    level: 2,
    bpm: 120,
    pulse: 80,
    timeSig: [6, 8],
    grid: 6,
    sticking: 'R LL RR L  ·  L RR LL R',
    about: 'An accent, two diddles, and an accent. The rudiment drops straight '
      + 'into a fill, because the accents fall on the beat.',
    focus: 'Only the outer strokes are loud. Bury the two diddles under them.',
    bars: [
      { S: 'Ooo|ooO', LR: 'RLL|RRL' },
      { S: 'Ooo|ooO', LR: 'LRR|LLR' },
    ],
  },
  {
    id: 'seven-stroke-roll',
    name: 'Seven Stroke Roll',
    family: 'Roll',
    pas: 9,
    level: 2,
    bpm: 80,
    timeSig: [4, 4],
    grid: 16,
    sticking: 'RRLLRR L  ·  LLRRLL R',
    about: 'Three diddles and an accent. The roll starts on one hand and ends '
      + 'on the other, so it alternates by itself.',
    focus: 'Count the diddles. Six strokes, then the accent, every time.',
    bars: [
      { S: 'oooo|ooO-|oooo|ooO-', LR: 'RRLL|RRL-|LLRR|LLR-' },
      { S: 'oooo|ooO-|oooo|ooO-', LR: 'RRLL|RRL-|LLRR|LLR-' },
    ],
  },
  {
    id: 'nine-stroke-roll',
    name: 'Nine Stroke Roll',
    family: 'Roll',
    pas: 10,
    level: 2,
    bpm: 80,
    timeSig: [4, 4],
    grid: 16,
    sticking: 'RRLLRRLL R  ·  LLRRLLRR L',
    about: 'Four diddles and an accent. It fills two beats and lands on the '
      + 'third, which makes it a ready-made pickup.',
    focus: 'Keep the eight roll strokes even, then open the accent right out.',
    bars: [
      { S: 'oooo|oooo|O---|----', LR: 'RRLL|RRLL|R---|----' },
      { S: 'oooo|oooo|O---|----', LR: 'LLRR|LLRR|L---|----' },
    ],
  },

  /* ---------------- Diddle rudiments ---------------- */
  {
    id: 'single-paradiddle',
    name: 'Single Paradiddle',
    family: 'Diddle',
    pas: 16,
    level: 1,
    bpm: 80,
    timeSig: [4, 4],
    grid: 16,
    sticking: 'RLRR LRLL',
    about: 'Two singles and a diddle. The lead hand changes every four strokes, '
      + 'so the accent moves around the kit on its own.',
    focus: 'Accent the first stroke of each group and keep the other three flat.',
    bars: [
      { S: 'Oooo|Oooo|Oooo|Oooo', LR: 'RLRR|LRLL|RLRR|LRLL' },
      { S: 'Oooo|Oooo|Oooo|Oooo', LR: 'LRLL|RLRR|LRLL|RLRR' },
    ],
  },
  {
    id: 'double-paradiddle',
    name: 'Double Paradiddle',
    family: 'Diddle',
    pas: 17,
    level: 2,
    bpm: 120,
    pulse: 80,
    timeSig: [6, 8],
    grid: 6,
    sticking: 'RLRLRR  ·  LRLRLL',
    about: 'Four singles and a diddle. Six strokes fit one triplet beat, so the '
      + 'rudiment sits inside a shuffle or a jazz fill.',
    focus: 'Keep the four singles even before the diddle closes the group.',
    bars: [
      { S: 'Ooo|ooo', LR: 'RLR|LRR' },
      { S: 'Ooo|ooo', LR: 'LRL|RLL' },
    ],
  },
  {
    id: 'triple-paradiddle',
    name: 'Triple Paradiddle',
    family: 'Diddle',
    pas: 18,
    level: 2,
    bpm: 76,
    timeSig: [4, 4],
    grid: 16,
    sticking: 'RLRLRLRR  ·  LRLRLRLL',
    about: 'Six singles and a diddle. Eight strokes fill two beats of sixteenth '
      + 'notes, so the accent lands on every other beat.',
    focus: 'Do not rush the singles. The diddle must not arrive early.',
    bars: [
      { S: 'Oooo|oooo|Oooo|oooo', LR: 'RLRL|RLRR|LRLR|LRLL' },
      { S: 'Oooo|oooo|Oooo|oooo', LR: 'LRLR|LRLL|RLRL|RLRR' },
    ],
  },
  {
    id: 'paradiddle-diddle',
    name: 'Single Paradiddle-Diddle',
    family: 'Diddle',
    pas: 19,
    level: 2,
    bpm: 120,
    pulse: 80,
    timeSig: [6, 8],
    grid: 6,
    sticking: 'RLRRLL  ·  LRLLRR',
    about: 'Two singles and two diddles. The lead hand never changes, so the '
      + 'rudiment repeats on one side and moves easily around the toms.',
    focus: 'The two diddles must match. Play the second stroke of each one.',
    bars: [
      { S: 'Ooo|ooo', LR: 'RLR|RLL' },
      { S: 'Ooo|ooo', LR: 'LRL|LRR' },
    ],
  },

  /* ---------------- Flam rudiments ---------------- */
  {
    id: 'flam',
    name: 'Flam',
    family: 'Flam',
    pas: 20,
    level: 1,
    bpm: 76,
    timeSig: [4, 4],
    grid: 4,
    sticking: 'lR  rL',
    about: 'A grace stroke lands just before the main stroke. Two sticks make '
      + 'one thick note, and every flam rudiment starts here.',
    focus: 'Set the heights first: the grace stick low, the main stick high. '
      + 'Drop both at once and the flam spaces itself.',
    bars: [
      { S: 'f|f|f|f', LR: 'R|L|R|L' },
      { S: 'f|f|f|f', LR: 'L|R|L|R' },
    ],
  },
  {
    id: 'flam-tap',
    name: 'Flam Tap',
    family: 'Flam',
    pas: 22,
    level: 2,
    bpm: 80,
    timeSig: [4, 4],
    grid: 8,
    sticking: 'lR R  rL L',
    about: 'A flam and then a tap with the same hand. The stick that plays the '
      + 'flam stays down and takes the tap off the rebound.',
    focus: 'The tap comes from the bounce. Do not lift the stick between the two.',
    bars: [
      { S: 'Fo|Fo|Fo|Fo', LR: 'RR|LL|RR|LL' },
      { S: 'Fo|Fo|Fo|Fo', LR: 'LL|RR|LL|RR' },
    ],
  },
  {
    id: 'flam-accent',
    name: 'Flam Accent',
    family: 'Flam',
    pas: 21,
    level: 2,
    bpm: 120,
    pulse: 80,
    timeSig: [6, 8],
    grid: 6,
    sticking: 'lR L R  ·  rL R L',
    about: 'Triplets with a flam on the first stroke of each group. The hands '
      + 'alternate, so the flam swaps sides every three notes.',
    focus: 'Only the flam is loud. The two taps after it stay low and even.',
    bars: [
      { S: 'Foo|Foo', LR: 'RLR|LRL' },
      { S: 'Foo|Foo', LR: 'LRL|RLR' },
    ],
  },
  {
    id: 'flamacue',
    name: 'Flamacue',
    family: 'Flam',
    pas: 23,
    level: 3,
    bpm: 72,
    timeSig: [4, 4],
    grid: 16,
    sticking: 'lR L R L rL',
    about: 'A flam, three taps, and a closing flam. The accent sits on the '
      + 'second note, not on the flam, which is what makes it hard.',
    focus: 'Play the accent after the flam. The flam itself stays quiet.',
    bars: [
      { S: 'fOoo|f---|fOoo|f---', LR: 'RLRL|L---|LRLR|R---' },
      { S: 'fOoo|f---|fOoo|f---', LR: 'RLRL|L---|LRLR|R---' },
    ],
  },
  {
    id: 'flam-paradiddle',
    name: 'Flam Paradiddle',
    family: 'Flam',
    pas: 24,
    level: 3,
    bpm: 72,
    timeSig: [4, 4],
    grid: 16,
    sticking: 'lR L R R  ·  rL R L L',
    about: 'A single paradiddle with a flam on the accent. It is the fastest '
      + 'way to move a paradiddle around the kit and keep the accent thick.',
    focus: 'Keep the diddle even under the flam. The flam must not push it late.',
    bars: [
      { S: 'Fooo|Fooo|Fooo|Fooo', LR: 'RLRR|LRLL|RLRR|LRLL' },
      { S: 'Fooo|Fooo|Fooo|Fooo', LR: 'LRLL|RLRR|LRLL|RLRR' },
    ],
  },
  {
    id: 'pataflafla',
    name: 'Pataflafla',
    family: 'Flam',
    pas: 26,
    level: 3,
    bpm: 72,
    timeSig: [4, 4],
    grid: 16,
    sticking: 'lR L R rL',
    about: 'Four sixteenth notes with a flam on the first and on the last. Both '
      + 'hands have to lead a flam inside one beat.',
    focus: 'The two inner taps stay soft. Do not let the second flam arrive early.',
    bars: [
      { S: 'FooF|FooF|FooF|FooF', LR: 'RLRL|LRLR|RLRL|LRLR' },
      { S: 'FooF|FooF|FooF|FooF', LR: 'LRLR|RLRL|LRLR|RLRL' },
    ],
  },
  {
    id: 'swiss-army-triplet',
    name: 'Swiss Army Triplet',
    family: 'Flam',
    pas: 28,
    level: 3,
    bpm: 120,
    pulse: 80,
    timeSig: [6, 8],
    grid: 6,
    sticking: 'lR R L  ·  rL L R',
    about: 'A flam, a tap on the same hand, and a single on the other. It sounds '
      + 'like a flam accent but one hand does twice the work.',
    focus: 'Keep the lead hand relaxed. It plays the flam and the tap in a row.',
    bars: [
      { S: 'Foo|Foo', LR: 'RRL|RRL' },
      { S: 'Foo|Foo', LR: 'LLR|LLR' },
    ],
  },

  /* ---------------- Drag rudiments ---------------- */
  {
    id: 'drag',
    name: 'Drag (Ruff)',
    family: 'Drag',
    pas: 31,
    level: 1,
    bpm: 72,
    timeSig: [4, 4],
    grid: 4,
    sticking: 'llR  rrL',
    about: 'Two grace strokes lead into the main stroke. A flam has one grace '
      + 'stroke, and a drag has two.',
    focus: 'The two grace strokes come from one controlled bounce, not from two '
      + 'separate lifts.',
    bars: [
      { S: 'd|d|d|d', LR: 'R|L|R|L' },
      { S: 'd|d|d|d', LR: 'L|R|L|R' },
    ],
  },
  {
    id: 'single-drag-tap',
    name: 'Single Drag Tap',
    family: 'Drag',
    pas: 32,
    level: 2,
    bpm: 76,
    timeSig: [4, 4],
    grid: 8,
    sticking: 'llR L  ·  rrL R',
    about: 'A drag and then an accented tap on the other hand. The rudiment '
      + 'alternates by itself and reads as a rolling pickup.',
    focus: 'The accent is the tap, not the drag. Keep the drag under it.',
    bars: [
      { S: 'dO|dO|dO|dO', LR: 'RL|LR|RL|LR' },
      { S: 'dO|dO|dO|dO', LR: 'LR|RL|LR|RL' },
    ],
  },
  {
    id: 'double-drag-tap',
    name: 'Double Drag Tap',
    family: 'Drag',
    pas: 34,
    level: 3,
    bpm: 120,
    pulse: 80,
    timeSig: [6, 8],
    grid: 6,
    sticking: 'llR llR L  ·  rrL rrL R',
    about: 'Two drags and then an accented tap. Both drags fall on the same '
      + 'hand, so the wrist has to stay loose.',
    focus: 'Space the two drags evenly. The second one always wants to crowd '
      + 'the tap.',
    bars: [
      { S: 'ddO|ddO', LR: 'RRL|LLR' },
      { S: 'ddO|ddO', LR: 'LLR|RRL' },
    ],
  },
  {
    id: 'lesson-25',
    name: 'Lesson 25',
    family: 'Drag',
    pas: 36,
    level: 2,
    bpm: 120,
    pulse: 80,
    timeSig: [6, 8],
    grid: 6,
    sticking: 'llR L R  ·  rrL R L',
    about: 'A drag and two taps, with the accent on the last one. The name comes '
      + 'from the 25th lesson of an 1869 drum book.',
    focus: 'Drive to the accent. The drag opens the group and the last note '
      + 'closes it.',
    bars: [
      { S: 'doO|doO', LR: 'RLR|LRL' },
      { S: 'doO|doO', LR: 'LRL|RLR' },
    ],
  },
  {
    id: 'single-ratamacue',
    name: 'Single Ratamacue',
    family: 'Drag',
    pas: 37,
    level: 3,
    bpm: 72,
    timeSig: [4, 4],
    grid: 16,
    sticking: 'llR L R L  ·  rrL R L R',
    about: 'Four alternating strokes with a drag on the first and the accent on '
      + 'the last. The drag pulls the group forward into the accent.',
    focus: 'Keep the four main strokes even. The drag sits before the beat, not on it.',
    bars: [
      { S: 'dooO|dooO|dooO|dooO', LR: 'RLRL|LRLR|RLRL|LRLR' },
      { S: 'dooO|dooO|dooO|dooO', LR: 'LRLR|RLRL|LRLR|RLRL' },
    ],
  },
];

/** One rudiment by id, or null. */
export function rudimentById(id) {
  return RUDIMENTS.find((entry) => entry.id === id) || null;
}

/** The rudiments of one family, in library order. */
export function rudimentsOfFamily(family) {
  return RUDIMENTS.filter((entry) => entry.family === family);
}

/** The rudiment ids, in library order. */
export function rudimentIds() {
  return RUDIMENTS.map((entry) => entry.id);
}
