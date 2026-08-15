// Centralized tool / category metadata shared by Home, mobile hubs,
// desktop dock, command palette, and hold-to-record relevance.

import { getSetting, saveSetting } from './persistence.js';

export const FEATURES_ENABLED_KEY = 'features.enabled';
const LOCKED_FEATURE_IDS = ['musicprefs'];

export const PURPOSES = [
  { id: 'train', label: 'Train' },
  { id: 'study', label: 'Study' },
  { id: 'create', label: 'Create' },
];

export const CATEGORIES = [
  {
    id: 'train',
    label: 'Train',
    short: 'Train',
    description: 'Drills and practice trainers',
    icon: 'train',
  },
  {
    id: 'reference',
    label: 'Reference',
    short: 'Reference',
    description: 'Look up scales, chords, and keys',
    icon: 'reference',
  },
  {
    id: 'create',
    label: 'Create',
    short: 'Create',
    description: 'Record, write lyrics, and jot notes',
    icon: 'create',
  },
  {
    id: 'tools',
    label: 'Tools',
    short: 'Tools',
    description: 'Metronome, guitar player, drums, and practice utilities',
    icon: 'tools',
  },
];

export const TOOLS = [
  // SIMPLIFY: Scale Spelling hidden. Keep this object to restore later.
  /*
  {
    id: 'scales',
    label: 'Scale Spelling',
    short: 'Scales',
    category: 'train',
    description: 'Spell scales by root and type.',
    title: 'Scale Spelling',
    drill: true,
    holdRecord: false,
  },
  */
  {
    id: 'intervals',
    label: 'Intervals',
    short: 'Intervals',
    category: 'train',
    description: 'Name intervals above any root.',
    title: 'Intervals',
    drill: true,
    holdRecord: false,
  },
  {
    id: 'sightreading',
    label: 'Sight Reading',
    short: 'Sight Read',
    category: 'train',
    description: 'Read pitches on the staff.',
    title: 'Sight Reading',
    drill: true,
    holdRecord: false,
  },
  // SIMPLIFY: Fretboard trainer hidden. Keep this object to restore later.
  /*
  {
    id: 'fretboard',
    label: 'Fretboard',
    short: 'Fretboard',
    category: 'train',
    description: 'Drill notes and intervals on guitar.',
    title: 'Fretboard Trainer',
    drill: true,
    holdRecord: true,
  },
  */
  // SIMPLIFY: Fretboard & Interval Map hidden. Keep this object to restore later.
  /*
  {
    id: 'intervalorbit',
    label: 'Fretboard & Interval Map',
    short: 'Interval Map',
    category: 'train',
    description: 'Learn the reusable fretboard shapes for every interval around an anchor root, then test yourself by locating, naming, or playing them.',
    title: 'Fretboard & Interval Map',
    purpose: 'study',
    modes: [
      { id: 'learn', label: 'Learn' },
      { id: 'map', label: 'Map' },
      { id: 'chordtones', label: 'Chord tones' },
      { id: 'explain', label: 'Explain' },
    ],
    defaultMode: 'map',
    drill: true,
    holdRecord: true,
  },
  */
  {
    id: 'chordlab',
    label: 'Chord Workout',
    short: 'Chord Lab',
    category: 'train',
    description: 'Practice chord shapes with guided prompts.',
    title: 'Chord Workout',
    drill: true,
    holdRecord: true,
  },
  {
    id: 'tuner',
    label: 'Pitch & Ear Lab',
    short: 'Pitch',
    category: 'train',
    description: 'Tuner, reference tones, pitch trainer, and Pitch Runner.',
    title: 'Pitch & Ear Lab',
    purpose: 'train',
    modes: [
      { id: 'tuner', label: 'Tuner' },
      { id: 'tone', label: 'Reference tone' },
      { id: 'match', label: 'Pitch match' },
      { id: 'runner', label: 'Pitch runner' },
      { id: 'ear', label: 'Ear' },
    ],
    defaultMode: 'tuner',
    drill: true,
    holdRecord: true,
  },
  {
    id: 'ear',
    label: 'Ear',
    short: 'Ear',
    category: 'train',
    description: 'Identify pitches by ear.',
    title: 'Ear Trainer',
    drill: true,
    holdRecord: false,
  },
  // SIMPLIFY: Timing hidden. Keep this object to restore later.
  /*
  {
    id: 'timing',
    label: 'Timing',
    short: 'Timing',
    category: 'train',
    description: 'Tap against a click track and tighten your pocket.',
    title: 'Timing Drill',
    drill: true,
    holdRecord: false,
  },
  */
  {
    id: 'scaleref',
    label: 'Scale Lab',
    short: 'Scales',
    category: 'reference',
    description: 'Find scales, modes, and diatonic chords on the neck.',
    title: 'Scale Lab',
    purpose: 'study',
    modes: [
      { id: 'overview', label: 'Overview' },
      { id: 'neck', label: 'Neck' },
      { id: 'harmony', label: 'Harmony' },
      { id: 'modes', label: 'Modes' },
      // SIMPLIFY: Guide mode hidden. Keep this line to restore later.
      // { id: 'guide', label: 'Guide' },
    ],
    defaultMode: 'overview',
    holdRecord: false,
  },
  {
    id: 'chords',
    label: 'Chord Lab',
    short: 'Chords',
    category: 'reference',
    description: 'Map voicings, movable cards, builder, and CAGED.',
    title: 'Chord Lab',
    purpose: 'study',
    modes: [
      { id: 'reference', label: 'Reference' },
      { id: 'map', label: 'Map' },
      { id: 'voicings', label: 'Voicings' },
      { id: 'triads', label: 'Triads' },
      { id: 'build', label: 'Build' },
    ],
    defaultMode: 'reference',
    holdRecord: false,
  },
  {
    id: 'triads',
    label: 'Triads Reference',
    short: 'Triads',
    category: 'reference',
    description: 'Map closed triad voicings and sweep-picking shapes for any root.',
    title: 'Triads Reference',
    holdRecord: false,
  },
  {
    id: 'circle',
    label: 'Circle of Fifths',
    short: 'Circle',
    category: 'reference',
    description: 'Explore keys and relationships.',
    title: 'Circle of Fifths',
    holdRecord: false,
  },
  {
    id: 'recorder',
    label: 'Audio Studio',
    short: 'Record',
    category: 'create',
    description: 'Capture takes, inspect pitch, and map a sung riff to guitar tab.',
    title: 'Audio Studio',
    purpose: 'create',
    modes: [
      { id: 'capture', label: 'Capture' },
      { id: 'analyze', label: 'Analyze' },
      { id: 'transcribe', label: 'Transcribe' },
    ],
    defaultMode: 'capture',
    holdRecord: true,
  },
  {
    id: 'songwriter',
    label: 'Song Studio',
    short: 'Lyrics',
    category: 'create',
    description: 'Write lyrics and attach recordings.',
    title: 'Song Studio',
    purpose: 'create',
    modes: [],
    defaultMode: '',
    holdRecord: true,
  },
  {
    id: 'notes',
    label: 'Notes',
    short: 'Notes',
    category: 'create',
    description: 'Jot down practice notes and ideas.',
    title: 'Notes',
    holdRecord: false,
  },
  {
    id: 'tracktosheet',
    label: 'Audio Studio Transcribe',
    short: 'To Sheet',
    category: 'create',
    description: 'Upload an isolated track and turn pitches into basic sheet music.',
    title: 'Audio Studio Transcribe',
    purpose: 'create',
    modes: [
      { id: 'transcribe', label: 'Transcribe' },
    ],
    defaultMode: 'transcribe',
    holdRecord: false,
  },
  {
    id: 'keyboard',
    label: 'Keyboard',
    short: 'Keys',
    category: 'tools',
    description: 'Play notes and hold drones.',
    title: 'Keyboard',
    holdRecord: false,
  },
  {
    id: 'metronome',
    label: 'Metronome',
    short: 'Tempo',
    category: 'tools',
    description: 'Tempo, meter, tap tempo, and practice phases with subdivisions.',
    title: 'Metronome',
    purpose: 'train',
    modes: [
      { id: 'metronome', label: 'Metronome' },
      { id: 'plan', label: 'Practice Plan' },
    ],
    defaultMode: 'metronome',
    holdRecord: false,
  },
  {
    id: 'practice',
    label: 'Practice Plan',
    short: 'Timer',
    category: 'tools',
    description: 'Countdown timer with a metronome tempo plan.',
    title: 'Practice Plan',
    purpose: 'train',
    modes: [
      { id: 'plan', label: 'Practice Plan' },
    ],
    defaultMode: 'plan',
    holdRecord: false,
  },
  // SIMPLIFY: Drums hidden. Keep this object to restore later.
  /*
  {
    id: 'drums',
    label: 'Drums',
    short: 'Drums',
    category: 'tools',
    description: 'Beats, fills, Guitar Pro import, drum machine and fill generator.',
    title: 'Drums',
    holdRecord: false,
  },
  */
  {
    id: 'exercises',
    label: 'Exercises',
    short: 'Exercises',
    category: 'tools',
    description: 'Upload tabs, Guitar Pro files, audio, videos and lesson links.',
    title: 'Exercises',
    purpose: 'train',
    modes: [],
    defaultMode: '',
    holdRecord: false,
  },
  {
    id: 'workbooks',
    label: 'Workbooks',
    short: 'Workbooks',
    category: 'tools',
    description: 'Ordered exercise workbooks with looping and auto-advance.',
    title: 'Exercise Workbooks',
    purpose: 'train',
    modes: [],
    defaultMode: '',
    holdRecord: false,
  },
  // SIMPLIFY: Routines hidden. Keep this object to restore later.
  /*
  {
    id: 'routines',
    label: 'Routines',
    short: 'Routines',
    category: 'tools',
    description: 'Practice routines built from sessions, each with workbooks, a metronome and notes.',
    title: 'Practice Routines',
    holdRecord: false,
  },
  */
  {
    id: 'gpplayer',
    label: 'Score Player',
    short: 'GP Player',
    category: 'tools',
    description: 'Play Guitar Pro tracks, analyze key/chords/scales inline, select measure ranges, and save them as Exercises.',
    title: 'Score Player',
    purpose: 'train',
    modes: [],
    defaultMode: '',
    holdRecord: false,
  },
  // SIMPLIFY: Study Lab hidden. Keep this object to restore later.
  /*
  {
    id: 'studylab',
    label: 'Study Lab',
    short: 'Study Lab',
    category: 'train',
    description: 'Mic-guided walkthrough: scale mapping, intervals, chord tones, and riffs over a drone.',
    title: 'Study Lab',
    drill: true,
    holdRecord: true,
  },
  */
  {
    id: 'musicprefs',
    label: 'Settings & Preferences',
    short: 'Settings',
    category: 'tools',
    description: 'Musical context, volume, device sync, import and export, library cleanup, and feature visibility.',
    title: 'Settings & Preferences',
    holdRecord: false,
  },
];

export const CATEGORY_ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
  train: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  reference: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
  create: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/></svg>',
  tools: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 4v10m4-10v10m4-10v10m4-10v10"/></svg>',
};

export const TOOL_ICONS = {
  scales: CATEGORY_ICONS.train,
  intervals: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h16M4 20V8m16 12V4M8 20v-6m4 6V6m4 6v8"/></svg>',
  sightreading: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 10h18M3 14h18M3 18h18"/><circle cx="8" cy="15" r="2.4" fill="currentColor" stroke="none"/><path d="M10.4 15V7"/></svg>',
  scaleref: CATEGORY_ICONS.reference,
  chords: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8M12 8v8"/></svg>',
  triads: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4 4 19h16L12 4z"/><circle cx="12" cy="9" r="1.4" fill="currentColor" stroke="none"/><circle cx="8" cy="16" r="1.4" fill="currentColor" stroke="none"/><circle cx="16" cy="16" r="1.4" fill="currentColor" stroke="none"/></svg>',
  circle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>',
  keyboard: CATEGORY_ICONS.tools,
  metronome: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L6 22h12L12 2z"/><path d="M12 8v6"/><circle cx="12" cy="16" r="1.5"/></svg>',
  fretboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="1"/><path d="M4 6h16M4 10h16M4 14h16M4 18h16M9 2v20M15 2v20"/></svg>',
  intervalorbit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4"/></svg>',
  tuner: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><path d="M12 19v4m-4 0h8"/></svg>',
  ear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18v-6a9 9 0 0118 0v6"/><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3v5zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3v5z"/></svg>',
  timing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/><path d="M4 20 2 22m18-2 2 2"/><path d="M8 2 6 4m10-2 2 2"/></svg>',
  chordlab: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/><circle cx="17" cy="16" r="2" fill="currentColor" stroke="none"/></svg>',
  recorder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0014 0"/><path d="M12 17v4M8 21h8"/></svg>',
  songwriter: CATEGORY_ICONS.create,
  exercises: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/></svg>',
  workbooks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>',
  routines: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h2v2H4zM4 11h2v2H4zM4 17h2v2H4z"/><path d="M10 6h10M10 12h10M10 18h7"/><path d="M8 6l1.5 1.5L8 9M8 12l1.5 1.5L8 15"/></svg>',
  gpplayer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 9v6l5-3-5-3z"/><path d="M15 9h2M15 12h3M15 15h1"/></svg>',
  notes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h16v13l-5 5H4z"/><path d="M20 16h-5v5"/><path d="M8 8h8M8 12h6"/></svg>',
  practice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14" r="8"/><path d="M12 14V9.5"/><path d="M9 2h6"/><path d="M18.5 6.5 20 5"/></svg>',
  drums: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="8" rx="9" ry="3.5"/><path d="M3 8v5c0 1.9 4 3.5 9 3.5s9-1.6 9-3.5V8"/><path d="M7 16.5 4 22M17 16.5 20 22M12 17v5"/></svg>',

  tracktosheet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 10h16M4 14h16M4 18h16"/><circle cx="9" cy="15" r="2.2" fill="currentColor" stroke="none"/><path d="M11.2 15V8l5-1v7"/><circle cx="16.2" cy="14" r="2.2" fill="currentColor" stroke="none"/></svg>',
  studylab: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15v-4"/><path d="M12 15V8"/><path d="M16 15v-6"/><circle cx="18" cy="6" r="2"/></svg>',
  musicprefs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.4.7 1.1 1.1 1.9 1.1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
};

export function toolSearchText(tool) {
  const parts = [tool.label, tool.short, tool.title];
  if (Array.isArray(tool.modes)) {
    for (const mode of tool.modes) {
      if (mode && typeof mode.label === 'string') parts.push(mode.label);
    }
  }
  return parts.filter(Boolean).join(' ').toLowerCase();
}

export function toolsForPurpose(purposeId) {
  return TOOLS.filter(t => t.purpose === purposeId);
}

export function getTool(id) {
  return TOOLS.find(t => t.id === id) || null;
}

export function getCategory(id) {
  return CATEGORIES.find(c => c.id === id) || null;
}

export function toolsInCategory(categoryId) {
  return TOOLS.filter(t => t.category === categoryId);
}

export function isHoldRecordRelevant(toolId) {
  const tool = getTool(toolId);
  return !!(tool && tool.holdRecord);
}

function allToolIds() {
  return TOOLS.map(t => t.id);
}

/** Raw enabled IDs from storage; undefined when unset (default-on). */
export function getEnabledFeatureIdsRaw() {
  const v = getSetting(FEATURES_ENABLED_KEY, undefined);
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) return undefined;
  return v.filter(id => TOOLS.some(t => t.id === id));
}

export function isFeatureEnabled(id) {
  if (LOCKED_FEATURE_IDS.includes(id)) return true;
  const stored = getEnabledFeatureIdsRaw();
  if (stored === undefined) return true;
  return stored.includes(id);
}

export function getEnabledTools() {
  return TOOLS.filter(t => isFeatureEnabled(t.id));
}

export function saveEnabledFeatures(ids) {
  const set = new Set(ids.filter(id => TOOLS.some(t => t.id === id)));
  LOCKED_FEATURE_IDS.forEach(id => set.add(id));
  saveSetting(FEATURES_ENABLED_KEY, [...set]);
}

export function setFeatureEnabled(id, on) {
  if (LOCKED_FEATURE_IDS.includes(id)) return;
  const stored = getEnabledFeatureIdsRaw();
  const base = stored === undefined ? allToolIds() : [...stored];
  const set = new Set(base);
  if (on) set.add(id);
  else set.delete(id);
  saveEnabledFeatures([...set]);
}

/** Tabs shape used by dock, command palette, and split view — enabled tools only. */
export function asTabs() {
  return getEnabledTools().map(t => ({
    id: t.id,
    label: t.short,
    group: categoryLabel(t.category),
    category: t.category,
  }));
}

/** Read current enabled tabs (prefer over a module-load `asTabs()` snapshot). */
export function getTabs() {
  return asTabs();
}

function categoryLabel(id) {
  const c = getCategory(id);
  return c ? c.label : id;
}

/** Map old Drill/Reference/Tools group names onto new category ids. */
export function legacyGroupToCategory(group) {
  if (group === 'Drill') return 'train';
  if (group === 'Reference') return 'reference';
  if (group === 'Create') return 'create';
  if (group === 'Tools') return 'tools';
  return group;
}
