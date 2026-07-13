// Built-in drum pattern library. Each entry stores its readable tab verbatim
// (so it displays exactly as written) and the normalized PatternStep[] is
// derived from that tab by the parser at load time — keeping data DRY and
// exercising the parser on every pattern.

import { parseTab } from './tabParser.js';
import { stepsPerBeat } from './types.js';
import { LESSON_PATTERNS } from './lessonPatterns.js';

function slug(title) {
  return 'builtin-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const LOOP_BARS = { beat: 2, fill: 1, exercise: 4 };

function makePattern(raw) {
  const tab = raw.tab.replace(/^\n/, '').replace(/\s+$/, '');
  const { steps, stepsPerBar } = parseTab(tab);
  const per = stepsPerBeat(raw.subdivision);
  const beats = stepsPerBar / per;
  return {
    id: slug(raw.title),
    title: raw.title,
    category: raw.category,
    style: raw.style,
    difficulty: raw.difficulty,
    bpmRange: raw.bpm,
    meter: raw.meter,
    subdivision: raw.subdivision,
    bars: 1,
    stepsPerBar,
    beatsPerBar: beats,
    recommendedLoopBars: raw.recommendedLoopBars || LOOP_BARS[raw.category] || 2,
    notes: raw.notes || '',
    steps,
    tab,
    builtin: true,
  };
}

const RAW = [
  // ---- Common Beats ----
  {
    title: 'Basic Rock Beat', category: 'beat', style: 'rock', difficulty: 1,
    bpm: [70, 130], meter: '4/4', subdivision: '8th',
    tab: `
Count | 1 & 2 & 3 & 4 &
H     | x x x x x x x x
S     | - - X - - - X -
K     | X - - - X - - -`,
  },
  {
    title: 'Rock Beat With Anticipated Kick', category: 'beat', style: 'rock', difficulty: 1,
    bpm: [75, 145], meter: '4/4', subdivision: '8th',
    tab: `
Count | 1 & 2 & 3 & 4 &
H     | x x x x x x x x
S     | - - X - - - X -
K     | X - - X X - - -`,
  },
  {
    title: 'Four-On-The-Floor Rock', category: 'beat', style: 'rock', difficulty: 1,
    bpm: [80, 150], meter: '4/4', subdivision: '8th',
    tab: `
Count | 1 & 2 & 3 & 4 &
H     | x x x x x x x x
S     | - - X - - - X -
K     | X - X - X - X -`,
  },
  {
    title: 'Basic 16th Rock Groove', category: 'beat', style: 'rock', difficulty: 2,
    bpm: [70, 120], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
H     | x x x x x x x x x x x x x x x x
S     | - - - - X - - - - - - - X - - -
K     | X - - - - - X - X - - - - - X -`,
  },
  {
    title: '16th Rock With Ghost Notes', category: 'beat', style: 'rock', difficulty: 3,
    bpm: [70, 115], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
H     | x x x x x x x x x x x x x x x x
S     | - g - g X - g - - g - g X - g -
K     | X - - - - - X - X - - - - - X -`,
  },
  {
    title: 'Pop Punk Driving 8ths', category: 'beat', style: 'punk', difficulty: 2,
    bpm: [130, 190], meter: '4/4', subdivision: '8th',
    tab: `
Count | 1 & 2 & 3 & 4 &
C     | X - - - - - - -
H     | x x x x x x x x
S     | - - X - - - X -
K     | X - X - X - X -`,
  },
  {
    title: 'Punk Snare On All Quarters', category: 'beat', style: 'punk', difficulty: 2,
    bpm: [150, 210], meter: '4/4', subdivision: '8th',
    tab: `
Count | 1 & 2 & 3 & 4 &
H     | x x x x x x x x
S     | X - X - X - X -
K     | X - - - X - - -`,
  },
  {
    title: 'Fast Punk D-Beat', category: 'beat', style: 'punk', difficulty: 3,
    bpm: [150, 220], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
H     | x - x - x - x - x - x - x - x -
S     | - - - - X - - - - - - - X - - -
K     | X - - X - - X - X - - X - - X -`,
  },
  {
    title: 'Hardcore Two-Step', category: 'beat', style: 'hardcore', difficulty: 3,
    bpm: [120, 190], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
H     | x - x - x - x - x - x - x - x -
S     | - - - - X - - - - - X - - - X -
K     | X - - X - - X - X - - - X - - -`,
  },
  {
    title: 'Half-Time Groove', category: 'beat', style: 'rock', difficulty: 2,
    bpm: [70, 120], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
H     | x x x x x x x x x x x x x x x x
S     | - - - - - - - - X - - - - - - -
K     | X - - - - - X - X - - - - - X -`,
  },
  {
    title: 'Heavy Half-Time Chug Groove', category: 'beat', style: 'metal', difficulty: 3,
    bpm: [80, 150], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
H     | x - x - x - x - x - x - x - x -
S     | - - - - - - - - X - - - - - - -
K     | X - X - - X X - X - - X - X - -`,
  },
  {
    title: 'Metal Double-Kick 16ths', category: 'beat', style: 'metal', difficulty: 4,
    bpm: [100, 180], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
R     | x - x - x - x - x - x - x - x -
S     | - - - - X - - - - - - - X - - -
K     | X X X X X X X X X X X X X X X X`,
  },
  {
    title: 'Metal Gallop Groove', category: 'beat', style: 'metal', difficulty: 3,
    bpm: [90, 170], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
R     | x - x - x - x - x - x - x - x -
S     | - - - - X - - - - - - - X - - -
K     | X - X X - - X X X - X X - - X X`,
  },
  {
    title: 'Reverse Gallop Groove', category: 'beat', style: 'metal', difficulty: 3,
    bpm: [90, 170], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
R     | x - x - x - x - x - x - x - x -
S     | - - - - X - - - - - - - X - - -
K     | X X - X - X - - X X - X - X - -`,
  },
  {
    title: 'Basic Blast Beat', category: 'beat', style: 'metal', difficulty: 4,
    bpm: [140, 220], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
R     | x - x - x - x - x - x - x - x -
S     | - X - X - X - X - X - X - X - X
K     | X - X - X - X - X - X - X - X -`,
  },
  {
    title: 'Bomb Blast', category: 'beat', style: 'deathcore', difficulty: 4,
    bpm: [130, 220], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
C     | X - X - X - X - X - X - X - X -
S     | X - X - X - X - X - X - X - X -
K     | X - X - X - X - X - X - X - X -`,
  },
  {
    title: 'Skank Beat', category: 'beat', style: 'metal', difficulty: 3,
    bpm: [140, 220], meter: '4/4', subdivision: '8th',
    tab: `
Count | 1 & 2 & 3 & 4 &
R     | x x x x x x x x
S     | - X - X - X - X
K     | X - X - X - X -`,
  },
  {
    title: 'Deathcore Breakdown Pulse', category: 'beat', style: 'deathcore', difficulty: 3,
    bpm: [70, 120], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
C     | X - - - - - - - X - - - - - - -
H     | - - x - - - x - - - x - - - x -
S     | - - - - - - - - X - - - - - - -
K     | X - - X - X - - X - X - - - X -`,
  },
  {
    title: 'Syncopated Deathcore Chug', category: 'beat', style: 'deathcore', difficulty: 4,
    bpm: [85, 160], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
C     | X - - - - - - - - - - - X - - -
H     | - x - x - x - x - x - x - x - x
S     | - - - - X - - - - - - - X - - -
K     | X - X X - - X - - X - X X - - -`,
  },
  {
    title: 'Funky 16th Groove', category: 'beat', style: 'funk', difficulty: 3,
    bpm: [75, 120], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
H     | x x x x x x x O x x x x x x x O
S     | - g - - X - g - - g - - X - g -
K     | X - - X - - X - X - - X - - - -`,
  },
  {
    title: 'Basic Shuffle', category: 'beat', style: 'shuffle', difficulty: 3,
    bpm: [80, 150], meter: '4/4', subdivision: 'triplet',
    tab: `
Count | 1-trip-let 2-trip-let 3-trip-let 4-trip-let
H     | x - x x - x x - x x - x
S     | - - - X - - - - - X - -
K     | X - - - - - X - - - - -`,
  },
  {
    title: '6/8 Rock Ballad', category: 'beat', style: 'rock', difficulty: 2,
    bpm: [55, 95], meter: '6/8', subdivision: 'sixEight',
    tab: `
Count | 1 2 3 4 5 6
H     | x x x x x x
S     | - - - X - -
K     | X - - - - X`,
  },
  {
    title: '12/8 Heavy Groove', category: 'beat', style: 'metal', difficulty: 3,
    bpm: [60, 100], meter: '12/8', subdivision: 'triplet',
    tab: `
Count | 1-trip-let 2-trip-let 3-trip-let 4-trip-let
R     | x - x x - x x - x x - x
S     | - - - X - - - - - X - -
K     | X - - - - X X - - - X -`,
  },
  {
    title: 'Linear Rock Groove', category: 'beat', style: 'linear', difficulty: 4,
    bpm: [70, 120], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
H     | x - - x - x - - x - - x - x - -
S     | - - g - X - - g - - g - X - - g
K     | - X - - - - X - - X - - - - X -`,
  },

  // ---- Common Fills ----
  {
    title: 'Basic Snare 8th Fill', category: 'fill', style: 'rock', difficulty: 1,
    bpm: [70, 140], meter: '4/4', subdivision: '8th',
    tab: `
Count | 1 & 2 & 3 & 4 &
S     | X X X X X X X X
K     | X - - - X - - -`,
  },
  {
    title: 'Snare 16th Fill', category: 'fill', style: 'rock', difficulty: 2,
    bpm: [70, 130], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
S     | X X X X X X X X X X X X X X X X
K     | X - - - - - - - X - - - - - - -`,
  },
  {
    title: 'Classic Tom Descent', category: 'fill', style: 'rock', difficulty: 2,
    bpm: [70, 140], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
S     | X X X X - - - - - - - - - - - -
T1    | - - - - X X X X - - - - - - - -
T2    | - - - - - - - - X X X X - - - -
FT    | - - - - - - - - - - - - X X X X`,
  },
  {
    title: 'Snare-To-Toms 2-Beat Fill', category: 'fill', style: 'rock', difficulty: 2,
    bpm: [80, 150], meter: '4/4', subdivision: '16th',
    tab: `
Count | 3 e & a 4 e & a
S     | X X X X - - - -
T1    | - - - - X X - -
FT    | - - - - - - X X`,
  },
  {
    title: 'Flam Accent Fill', category: 'fill', style: 'rock', difficulty: 3,
    bpm: [70, 130], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
S     | f - X - f - X - f - X - f - X -
K     | X - - - - - - - X - - - - - - -`,
  },
  {
    title: 'Punk Pickup Fill', category: 'fill', style: 'punk', difficulty: 2,
    bpm: [130, 200], meter: '4/4', subdivision: '8th',
    notes: 'Resolve to crash on next bar beat 1.',
    tab: `
Count | 3 & 4 &
S     | X X X X
K     | X - X -
C     | - - - -`,
  },
  {
    title: 'Fast Punk Tom Fill', category: 'fill', style: 'punk', difficulty: 3,
    bpm: [140, 210], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
S     | X X X X - - - - X X X X - - - -
T1    | - - - - X X X X - - - - - - - -
FT    | - - - - - - - - - - - - X X X X`,
  },
  {
    title: 'Metal Snare Burst Fill', category: 'fill', style: 'metal', difficulty: 3,
    bpm: [100, 180], meter: '4/4', subdivision: '16th',
    tab: `
Count | 3 e & a 4 e & a
S     | X X X X X X X X
K     | X - X - X - X -`,
  },
  {
    title: 'Double-Kick Fill', category: 'fill', style: 'metal', difficulty: 4,
    bpm: [100, 180], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
S     | X - - - X - - - X - - - X - - -
K     | X X X X X X X X X X X X X X X X`,
  },
  {
    title: 'Deathcore Stop-Start Fill', category: 'fill', style: 'deathcore', difficulty: 3,
    bpm: [80, 150], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
C     | X - - - - - - - X - - - - - - -
S     | - - - - X - - - - - - - X - - -
K     | X - - X - - - - X - X - - - - -`,
  },
  {
    title: 'Deathcore Tom Burst', category: 'fill', style: 'deathcore', difficulty: 4,
    bpm: [90, 170], meter: '4/4', subdivision: '16th',
    tab: `
Count | 3 e & a 4 e & a
T1    | X X - - - - - -
T2    | - - X X - - - -
FT    | - - - - X X X X
K     | X - X - X - X -`,
  },
  {
    title: 'Triplet Tom Fill', category: 'fill', style: 'rock', difficulty: 3,
    bpm: [70, 130], meter: '4/4', subdivision: 'triplet',
    tab: `
Count | 1-trip-let 2-trip-let 3-trip-let 4-trip-let
S     | X X X - - - - - - - - -
T1    | - - - X X X - - - - - -
T2    | - - - - - - X X X - - -
FT    | - - - - - - - - - X X X`,
  },
  {
    title: 'Shuffle Snare Fill', category: 'fill', style: 'shuffle', difficulty: 3,
    bpm: [80, 150], meter: '4/4', subdivision: 'triplet',
    tab: `
Count | 3-trip-let 4-trip-let
S     | X - X X - X
K     | X - - - - -`,
  },
  {
    title: 'Linear Fill', category: 'fill', style: 'linear', difficulty: 4,
    bpm: [70, 130], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
H     | x - - - - x - - - - x - - - - x
S     | - X - - - - X - - - - X - - - -
K     | - - X - X - - X - X - - X - X -`,
  },
  {
    title: 'Bonham-Style Triplet Fill', category: 'fill', style: 'rock', difficulty: 4,
    bpm: [60, 120], meter: '4/4', subdivision: 'triplet',
    tab: `
Count | 1-trip-let 2-trip-let 3-trip-let 4-trip-let
T1    | X - - X - - X - - X - -
FT    | - X - - X - - X - - X -
K     | - - X - - X - - X - - X`,
  },
  {
    title: 'One-Bar Build Fill', category: 'fill', style: 'rock', difficulty: 2,
    bpm: [70, 140], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
S     | X - X - X X X X X X X X X X X X
K     | X - - - X - - - X - - - X - - -`,
  },

  // ---- Exercises ----
  {
    title: 'Quarter Note Kick Control', category: 'exercise', style: 'warmup', difficulty: 1,
    bpm: [60, 120], meter: '4/4', subdivision: '8th',
    tab: `
Count | 1 & 2 & 3 & 4 &
H     | x x x x x x x x
K     | X - X - X - X -`,
  },
  {
    title: 'Snare Backbeat Accuracy', category: 'exercise', style: 'warmup', difficulty: 1,
    bpm: [60, 130], meter: '4/4', subdivision: '8th',
    tab: `
Count | 1 & 2 & 3 & 4 &
H     | x x x x x x x x
S     | - - X - - - X -`,
  },
  {
    title: 'Kick Syncopation Grid 1', category: 'exercise', style: 'coordination', difficulty: 2,
    bpm: [60, 120], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
H     | x x x x x x x x x x x x x x x x
S     | - - - - X - - - - - - - X - - -
K     | X - - - - X - - X - - X - - - -`,
  },
  {
    title: 'Kick Syncopation Grid 2', category: 'exercise', style: 'coordination', difficulty: 3,
    bpm: [60, 120], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
H     | x x x x x x x x x x x x x x x x
S     | - - - - X - - - - - - - X - - -
K     | X - X - - - X - X - - - - X - -`,
  },
  {
    title: 'Ghost Note Control', category: 'exercise', style: 'coordination', difficulty: 3,
    bpm: [60, 110], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
H     | x x x x x x x x x x x x x x x x
S     | - g - g X g - g - g - g X g - g
K     | X - - - - - X - X - - - - - X -`,
  },
  {
    title: 'Open Hat Placement', category: 'exercise', style: 'coordination', difficulty: 2,
    bpm: [70, 130], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
H     | x x x O x x x O x x x O x x x O
S     | - - - - X - - - - - - - X - - -
K     | X - - - - - X - X - - - - - X -`,
  },
  {
    title: 'Hi-Hat Accent Control', category: 'exercise', style: 'warmup', difficulty: 2,
    bpm: [60, 130], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
H     | X x x x X x x x X x x x X x x x
S     | - - - - X - - - - - - - X - - -
K     | X - - - - - X - X - - - - - X -`,
  },
  {
    title: 'Single Stroke 16ths Around Kit', category: 'exercise', style: 'warmup', difficulty: 2,
    bpm: [60, 140], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
S     | X X X X - - - - - - - - - - - -
T1    | - - - - X X X X - - - - - - - -
T2    | - - - - - - - - X X X X - - - -
FT    | - - - - - - - - - - - - X X X X`,
  },
  {
    title: 'Paradiddle Orchestration', category: 'exercise', style: 'warmup', difficulty: 3,
    bpm: [50, 120], meter: '4/4', subdivision: '16th',
    notes: 'Treat as R L R R / L R L L. Move right hand to snare and left hand to tom, then reverse.',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
S     | X - X X - X - - X - X X - X - -
T1    | - X - - X - X X - X - - X - X X`,
  },
  {
    title: 'Flam Control', category: 'exercise', style: 'warmup', difficulty: 3,
    bpm: [50, 100], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
S     | f - - - f - - - f - - - f - - -
K     | X - - - - - - - X - - - - - - -`,
  },
  {
    title: 'Double-Kick Endurance 8ths', category: 'exercise', style: 'metal', difficulty: 2,
    bpm: [80, 150], meter: '4/4', subdivision: '8th',
    tab: `
Count | 1 & 2 & 3 & 4 &
R     | x x x x x x x x
S     | - - X - - - X -
K     | X X X X X X X X`,
  },
  {
    title: 'Double-Kick Endurance 16ths', category: 'exercise', style: 'metal', difficulty: 4,
    bpm: [80, 170], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
R     | x - x - x - x - x - x - x - x -
S     | - - - - X - - - - - - - X - - -
K     | X X X X X X X X X X X X X X X X`,
  },
  {
    title: 'Gallop Endurance', category: 'exercise', style: 'metal', difficulty: 3,
    bpm: [80, 170], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
R     | x - x - x - x - x - x - x - x -
S     | - - - - X - - - - - - - X - - -
K     | X - X X X - X X X - X X X - X X`,
  },
  {
    title: 'Blast Beat Alternation', category: 'exercise', style: 'metal', difficulty: 4,
    bpm: [120, 220], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
R     | x - x - x - x - x - x - x - x -
S     | - X - X - X - X - X - X - X - X
K     | X - X - X - X - X - X - X - X -`,
  },
  {
    title: 'Skank Beat Endurance', category: 'exercise', style: 'metal', difficulty: 3,
    bpm: [130, 220], meter: '4/4', subdivision: '8th',
    tab: `
Count | 1 & 2 & 3 & 4 &
R     | x x x x x x x x
S     | - X - X - X - X
K     | X - X - X - X -`,
  },
  {
    title: 'Odd Accent 16ths', category: 'exercise', style: 'coordination', difficulty: 4,
    bpm: [60, 130], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
H     | X x x X x x X x x X x x X x x x
S     | - - - - X - - - - - - - X - - -
K     | X - - - - - X - X - - - - - X -`,
  },
  {
    title: '3-Over-4 Accent Exercise', category: 'exercise', style: 'coordination', difficulty: 4,
    bpm: [50, 120], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
H     | X x x X x x X x x X x x X x x x
S     | - - - - X - - - - - - - X - - -
K     | X - - - X - - - X - - - X - - -`,
  },
  {
    title: 'Linear Coordination Exercise', category: 'exercise', style: 'linear', difficulty: 4,
    bpm: [50, 120], meter: '4/4', subdivision: '16th',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
H     | x - - - - x - - x - - - - x - -
S     | - x - - - - x - - x - - - - x -
K     | - - x - x - - x - - x - x - - x`,
  },
  {
    title: 'Triplet Hand-Foot Coordination', category: 'exercise', style: 'coordination', difficulty: 4,
    bpm: [50, 120], meter: '4/4', subdivision: 'triplet',
    tab: `
Count | 1-trip-let 2-trip-let 3-trip-let 4-trip-let
S     | X - - X - - X - - X - -
T1    | - X - - X - - X - - X -
K     | - - X - - X - - X - - X`,
  },
  {
    title: 'Fill Resolution Exercise', category: 'exercise', style: 'coordination', difficulty: 3,
    bpm: [60, 130], meter: '4/4', subdivision: '16th',
    notes: 'On playback, automatically add a crash + kick on the next bar beat 1 when “resolve fill” is enabled.',
    tab: `
Count | 1 e & a 2 e & a 3 e & a 4 e & a
S     | X X X X - - - - - - - - - - - -
T1    | - - - - X X X X - - - - - - - -
FT    | - - - - - - - - X X X X X X X X
C     | - - - - - - - - - - - - - - - -
K     | X - - - - - - - X - - - - - - -`,
  },
];

export const BUILTIN_PATTERNS = [...RAW.map(makePattern), ...LESSON_PATTERNS];

export function getBuiltinById(id) {
  return BUILTIN_PATTERNS.find((p) => p.id === id) || null;
}
