// Realistic legacy localStorage fixtures. Keys match production writes exactly.
// Run: node tests/characterization/fixtures.mjs

import { ROUTINES_STORAGE_KEY } from '../../js/routineModel.js';
import { WORKBOOKS_STORAGE_KEY } from '../../js/workbookModel.js';

const FIXED_ISO = '2026-06-15T12:00:00.000Z';
const FIXED_ISO_2 = '2026-06-14T10:30:00.000Z';
const FIXED_ISO_3 = '2026-06-13T08:15:00.000Z';

/** Today's YYYY-MM-DD for stats.today.day. loadStats does not reset the fixture. */
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const MUSI_SETTINGS = {
  'context.root': 'G',
  'context.scale': 'Natural Minor (Aeolian)',
  'context.tempo': 96,
  'context.rootMode': 'linear',
  'context.scaleMode': 'fixed',
  'features.enabled': ['scales', 'intervals', 'exercises', 'workbooks', 'routines', 'songwriter', 'notes', 'metronome'],
  stats: {
    today: {
      day: todayKey(),
      trainedMs: 18 * 60 * 1000,
      attempts: 24,
      correct: 19,
      perSkill: {
        scale: { attempts: 12, correct: 10 },
        interval: { attempts: 8, correct: 6 },
        ear: { attempts: 4, correct: 3 },
      },
    },
    bestStreak: 7,
    currentStreak: 3,
    lastActivityTs: 1718452800000,
  },
  'study.progress': {
    version: 1,
    concepts: {
      major_scale: { lastReviewedAt: 1718400000000, completions: 4, misses: 1, hintHeavy: 0 },
      interval_locations: { lastReviewedAt: 1718350000000, completions: 2, misses: 2, hintHeavy: 1 },
    },
    recentStudies: [
      { id: 'study-scales-intro', at: 1718450000000 },
      { id: 'study-intervals-core', at: 1718400000000 },
    ],
    lastPrimaryId: 'study-scales-intro',
    lastPrimaryAt: 1718450000000,
  },
  'profile.music': {
    version: 1,
    genres: [{ id: 'rock', priority: 'primary' }, { id: 'jazz', priority: 'secondary' }],
    goals: ['improvisation', 'songwriting'],
    balance: 'balanced',
    applications: ['fretboard', 'harmony', 'ear'],
    exclusions: ['modal_comparison'],
    influenceNotes: 'Blues bends and jazz voicings.',
    onboarded: true,
    updatedAt: 1718452800000,
  },
  'home.favorites': ['exercises', 'workbooks', 'metronome'],
  'nav.lastTool': 'exercises',
  'nav.lastCategory': 'tools',
  'practice.minutes': 25,
  'practice.automation': true,
  'practice.alarm': true,
  'practice.schedule': [
    { day: 1, hour: 7, minute: 30 },
    { day: 3, hour: 19, minute: 0 },
    { day: 6, hour: 10, minute: 0 },
  ],
  'metro.bpm': 88,
  'metro.subdiv': 'eighth',
  'metro.phases': [
    { bpm: 80, bars: 4 },
    { bpm: 100, bars: 4 },
    { bpm: 120, bars: 8 },
  ],
  'metro.phasesEnabled': true,
  'global.volume': 0.85,
  'kb.wave': 'triangle',
  'kb.vol': 0.6,
  'subview.chords': 'progressions',
  'picker.lastTuning': 'Drop D',
  'io.masteryV2': {
    version: 2,
    entries: {
      'locate|click|standard|1|5|rs2|ds1|df3|same|cross|standard|mid|n/a|none': {
        attempts: 14,
        correct: 11,
        avgMs: 2400,
        lastAt: 1718452800000,
      },
    },
  },
};

export const MUSI_EXERCISES = {
  categories: [
    { id: 'cat-tabs', name: 'Tabs' },
    { id: 'cat-etudes', name: 'Etudes' },
  ],
  items: [
    {
      id: 'ex-gp-stairway',
      name: 'Stairway excerpt',
      categoryId: 'cat-tabs',
      attachmentId: 'att-gp-stairway',
      url: '',
      fileName: 'stairway.gp5',
      type: 'application/guitar-pro',
      size: 48210,
      addedAt: FIXED_ISO,
      preferredTrackIndex: 1,
      measureStart: 8,
      measureEnd: 24,
      startBeat: null,
      endBeat: null,
      loopEnabled: true,
      loopRestSec: 2,
      bpm: 72,
      transpose: -2,
      tuning: 'Standard',
      retuneMode: 'pitches',
      takes: [],
    },
    {
      id: 'ex-lesson-link',
      name: 'JustinGuitar lesson',
      categoryId: 'cat-etudes',
      attachmentId: '',
      url: 'https://www.justinguitar.com/modules/major-scale',
      fileName: '',
      type: 'text/uri-list',
      size: 0,
      addedAt: FIXED_ISO_2,
      preferredTrackIndex: 0,
      measureStart: null,
      measureEnd: null,
      startBeat: null,
      endBeat: null,
      loopEnabled: false,
      loopRestSec: 0,
      bpm: null,
      transpose: 0,
      tuning: null,
      retuneMode: 'fingerings',
      takes: [],
    },
    {
      id: 'ex-audio-drill',
      name: 'Picking drill',
      categoryId: 'cat-etudes',
      attachmentId: 'att-audio-drill',
      url: '',
      fileName: 'picking.mp3',
      type: 'audio/mpeg',
      size: 2048000,
      addedAt: FIXED_ISO_3,
      preferredTrackIndex: 0,
      measureStart: null,
      measureEnd: null,
      startBeat: null,
      endBeat: null,
      loopEnabled: false,
      loopRestSec: 0,
      bpm: null,
      transpose: 0,
      tuning: null,
      retuneMode: 'fingerings',
      takes: [
        {
          id: 'take-a',
          attachmentId: 'att-take-a',
          name: 'Clean take',
          type: 'audio/webm',
          durationMs: 5200,
          createdAt: FIXED_ISO_2,
        },
        {
          id: 'take-b',
          attachmentId: 'att-take-b',
          name: 'Sloppy take',
          type: 'audio/webm',
          durationMs: 5100,
          createdAt: FIXED_ISO_3,
        },
      ],
    },
  ],
  seededAt: FIXED_ISO,
};

export const MUSI_WORKBOOKS = {
  folders: [{ id: 'wbf-technique', name: 'Technique' }],
  workbooks: [
    {
      id: 'wb-companion-flow',
      name: 'Companion flow',
      folderId: 'wbf-technique',
      entries: [
        { id: 'wbe-1', exerciseId: 'ex-gp-stairway' },
        { id: 'wbe-2', exerciseId: 'ex-audio-drill' },
      ],
      companions: [
        {
          id: 'cmp-scale-c',
          type: 'scale-ref',
          root: 'C',
          scale: 'Major (Ionian)',
          tuning: 'Standard',
          fretStart: 0,
          fretEnd: 12,
          collapsed: false,
          label: 'C major ref',
        },
      ],
      loopEnabled: true,
      activeEntryId: 'wbe-2',
      createdAt: FIXED_ISO,
      updatedAt: FIXED_ISO,
    },
    {
      id: 'wb-reading',
      name: 'Reading list',
      folderId: 'wbf-technique',
      entries: [{ id: 'wbe-3', exerciseId: 'ex-lesson-link' }],
      companions: [],
      loopEnabled: false,
      activeEntryId: null,
      createdAt: FIXED_ISO_2,
      updatedAt: FIXED_ISO_2,
    },
  ],
};

export const MUSI_ROUTINES = {
  routines: [
    {
      id: 'rt-morning',
      name: 'Morning practice',
      description: 'Warm-up, main work, cooldown.',
      sessions: [
        {
          id: 'rs-warmup',
          name: 'Warm-up',
          notes: 'Slow chromatic runs.',
          workbookIds: ['wb-reading'],
          durationMin: 10,
          metronome: { bpm: 70, beats: 4, subdiv: 'eighth', accentFirst: true },
          completed: true,
        },
        {
          id: 'rs-main',
          name: 'Main block',
          notes: 'Focus on GP excerpt.',
          workbookIds: ['wb-companion-flow', 'wb-reading'],
          durationMin: 30,
          metronome: { bpm: 96, beats: 3, subdiv: 'triplet', accentFirst: false },
          completed: false,
        },
        {
          id: 'rs-cooldown',
          name: 'Cooldown',
          notes: 'Stretch and review.',
          workbookIds: [],
          durationMin: 5,
          metronome: { bpm: 60, beats: 4, subdiv: 'quarter', accentFirst: true },
          completed: false,
        },
      ],
      activeSessionId: 'rs-main',
      createdAt: FIXED_ISO,
      updatedAt: FIXED_ISO,
    },
  ],
};

export const MUSI_NOTES = [
  {
    id: 'note-ideas',
    title: 'Chord voicing ideas',
    body: 'Try drop-2 maj7 on strings 2-5.\nVoice-lead the 3rd down a half step.',
    createdAt: FIXED_ISO,
    updatedAt: FIXED_ISO,
  },
  {
    id: 'note-gig',
    title: 'Gig checklist',
    body: 'Extra strings, tuner, setlist printout.',
    createdAt: FIXED_ISO_2,
    updatedAt: FIXED_ISO_2,
  },
  {
    id: 'note-blank',
    title: '',
    body: 'Remember to review modes this week.',
    createdAt: FIXED_ISO_3,
    updatedAt: FIXED_ISO_3,
  },
];

/** Raw stored shape for the legacy single-recording song (audioId and audioName). */
export const MUSI_SONGS_RAW = [
  {
    id: 'song-modern',
    title: 'Neon Skyline',
    lyrics: 'Verse one under neon lights\nChorus lifts at bar nine',
    recordings: [
      { id: 'rec-v1', name: 'Verse melody', addedAt: FIXED_ISO },
      { id: 'rec-ch', name: 'Chorus hook', addedAt: FIXED_ISO_2 },
    ],
    createdAt: FIXED_ISO,
    updatedAt: FIXED_ISO,
  },
  {
    id: 'song-legacy',
    title: 'Old demo',
    lyrics: 'Legacy recording shape test.',
    audioId: 'rec-legacy-audio',
    audioName: 'Kitchen demo take',
    createdAt: FIXED_ISO_2,
    updatedAt: FIXED_ISO_3,
  },
];

/** Expected reader output for songs after normalizeSong. Legacy audioId migrated. */
export const MUSI_SONGS_EXPECTED = [
  {
    id: 'song-modern',
    title: 'Neon Skyline',
    lyrics: 'Verse one under neon lights\nChorus lifts at bar nine',
    recordings: [
      { id: 'rec-v1', name: 'Verse melody', addedAt: FIXED_ISO },
      { id: 'rec-ch', name: 'Chorus hook', addedAt: FIXED_ISO_2 },
    ],
    createdAt: FIXED_ISO,
    updatedAt: FIXED_ISO,
  },
  {
    id: 'song-legacy',
    title: 'Old demo',
    lyrics: 'Legacy recording shape test.',
    recordings: [
      { id: 'rec-legacy-audio', name: 'Kitchen demo take', addedAt: FIXED_ISO_2 },
    ],
    createdAt: FIXED_ISO_2,
    updatedAt: FIXED_ISO_3,
  },
];

export const MUSI_GP_ANNOTATIONS = {
  version: 1,
  byScore: {
    'att:att-gp-stairway': {
      annotations: [
        {
          id: 'gpa-intro',
          startBeat: 0,
          endBeat: 4,
          measureStart: 8,
          measureEnd: 9,
          title: 'Rubato intro',
          text: 'Let the first two bars breathe before locking tempo.',
          createdAt: FIXED_ISO,
          updatedAt: FIXED_ISO,
        },
      ],
    },
  },
};

export const LEGACY_SNAPSHOT = Object.freeze({
  'musi:settings': JSON.stringify(MUSI_SETTINGS),
  'musi.exercises': JSON.stringify(MUSI_EXERCISES),
  [WORKBOOKS_STORAGE_KEY]: JSON.stringify(MUSI_WORKBOOKS),
  [ROUTINES_STORAGE_KEY]: JSON.stringify(MUSI_ROUTINES),
  'musi.notes': JSON.stringify(MUSI_NOTES),
  'musi.songs': JSON.stringify(MUSI_SONGS_RAW),
  'musi.gpAnnotations': JSON.stringify(MUSI_GP_ANNOTATIONS),
});
