// The tool registry. It is the one place that classifies every screen of the
// app. Home pages, navigation, the command palette, the shared tool page,
// and hold-to-record relevance all read this file.
//
// A tool has one primary classification, `area`. The four product areas are
// Train, Study, Create, and Library. Utilities support the other areas, so
// they carry `area: 'utility'` and the secondary flag `utility: true`.
//
// A tool id is also its route id and its DOM section id (`sec-<id>`). There
// is one id space. Do not add alias tables.

export const AREAS = [
  {
    id: 'train',
    label: 'Train',
    description: 'Drills that build your ear, your reading, and your hands.',
    icon: 'train',
  },
  {
    id: 'study',
    label: 'Study',
    description: 'Look up scales, chords, triads, and key relationships.',
    icon: 'study',
  },
  {
    id: 'create',
    label: 'Create',
    description: 'Record takes, write songs, and keep notes.',
    icon: 'create',
  },
  {
    id: 'library',
    label: 'Library',
    description: 'Your own practice material.',
    icon: 'library',
  },
];

/** Utilities are not a product area. They support the four areas. */
export const UTILITY_AREA = {
  id: 'utility',
  label: 'Utilities',
  description: 'Metronome, keyboard, score player, and settings.',
  icon: 'utility',
};

export const TOOLS = [
  {
    id: 'intervals',
    label: 'Intervals',
    short: 'Intervals',
    area: 'train',
    description: 'Name intervals above any root.',
    title: 'Intervals',
    drill: true,
    context: ['root'],
    holdRecord: false,
  },
  {
    id: 'sightreading',
    label: 'Sight Reading',
    short: 'Sight Read',
    area: 'train',
    description: 'Read pitches on the staff.',
    title: 'Sight Reading',
    drill: true,
    context: [],
    holdRecord: false,
  },
  {
    id: 'chordworkout',
    label: 'Chord Workout',
    short: 'Chord Workout',
    area: 'train',
    description: 'Practice chord shapes with guided prompts.',
    title: 'Chord Workout',
    drill: true,
    context: ['root'],
    holdRecord: true,
  },
  {
    id: 'pitchear',
    label: 'Pitch & Ear',
    short: 'Pitch & Ear',
    area: 'train',
    description: 'Tuner, reference tone, pitch match, pitch runner, and ear training.',
    title: 'Pitch & Ear',
    modes: [
      { id: 'tuner', label: 'Tuner' },
      { id: 'tone', label: 'Reference tone' },
      { id: 'match', label: 'Pitch match' },
      { id: 'runner', label: 'Pitch runner' },
      { id: 'ear', label: 'Ear training' },
    ],
    defaultMode: 'tuner',
    drill: true,
    context: ['root', 'scale', 'tempo', 'tuning'],
    holdRecord: true,
  },
  {
    id: 'scaleref',
    label: 'Scale Reference',
    short: 'Scales',
    area: 'study',
    description: 'Find scales, modes, and diatonic chords on the neck.',
    title: 'Scale Reference',
    context: ['root', 'scale', 'tuning'],
    holdRecord: false,
  },
  {
    id: 'chordref',
    label: 'Chord Reference',
    short: 'Chords',
    area: 'study',
    description: 'Map voicings, movable cards, and CAGED.',
    title: 'Chord Reference',
    context: ['root', 'tuning'],
    holdRecord: false,
  },
  {
    id: 'chordfinder',
    label: 'Chord Finder',
    short: 'Chord Finder',
    area: 'study',
    description: 'Tap notes on the neck and name every chord they spell.',
    title: 'Chord Finder',
    context: ['tuning'],
    holdRecord: false,
  },
  {
    id: 'triads',
    label: 'Triads',
    short: 'Triads',
    area: 'study',
    description: 'Map closed triad voicings and sweep-picking shapes for any root.',
    title: 'Triads',
    context: ['root', 'scale', 'tempo', 'tuning'],
    holdRecord: false,
  },
  {
    id: 'circle',
    label: 'Circle of Fifths',
    short: 'Circle',
    area: 'study',
    description: 'Explore keys and their relationships.',
    title: 'Circle of Fifths',
    context: ['root'],
    holdRecord: false,
  },
  {
    id: 'drumtab',
    label: 'Drum Notation',
    short: 'Drums',
    area: 'study',
    description: 'Read drum music: where each piece of the kit sits on the staff.',
    title: 'Drum Notation',
    modes: [
      { id: 'staff', label: 'The staff' },
      { id: 'values', label: 'Note values' },
      { id: 'bars', label: 'Play bars' },
      { id: 'texttab', label: 'Text tab' },
    ],
    defaultMode: 'staff',
    context: [],
    holdRecord: false,
  },
  {
    id: 'audiostudio',
    label: 'Audio Studio',
    short: 'Audio',
    area: 'create',
    description: 'Record or import a take, inspect its pitch, and transcribe it.',
    title: 'Audio Studio',
    modes: [
      { id: 'capture', label: 'Record' },
      { id: 'analyze', label: 'Analyze' },
      { id: 'transcribe', label: 'Import & transcribe' },
    ],
    defaultMode: 'capture',
    context: ['tempo'],
    holdRecord: true,
  },
  {
    id: 'songstudio',
    label: 'Song Studio',
    short: 'Songs',
    area: 'create',
    description: 'Write lyrics and attach recordings.',
    title: 'Song Studio',
    context: [],
    holdRecord: true,
  },
  {
    id: 'notes',
    label: 'Notes',
    short: 'Notes',
    area: 'create',
    description: 'Jot down practice notes and ideas.',
    title: 'Notes',
    context: [],
    holdRecord: false,
  },
  {
    id: 'exercises',
    label: 'Exercises',
    short: 'Exercises',
    area: 'library',
    description: 'Browse and manage practice exercises.',
    title: 'Exercises',
    context: [],
    holdRecord: false,
  },
  {
    id: 'workbooks',
    label: 'Workbooks',
    short: 'Workbooks',
    area: 'library',
    description: 'Organize exercises into focused practice collections.',
    title: 'Workbooks',
    context: [],
    holdRecord: false,
  },
  {
    id: 'metronome',
    label: 'Metronome',
    short: 'Metronome',
    area: 'utility',
    utility: true,
    description: 'Tempo, meter, tap tempo, and a tempo plan with subdivisions.',
    title: 'Metronome',
    modes: [
      { id: 'metronome', label: 'Click' },
      { id: 'plan', label: 'Tempo plan' },
    ],
    defaultMode: 'metronome',
    context: ['tempo'],
    holdRecord: false,
  },
  {
    id: 'keyboard',
    label: 'Keyboard',
    short: 'Keyboard',
    area: 'utility',
    utility: true,
    description: 'Play notes and hold drones.',
    title: 'Keyboard',
    context: ['root'],
    holdRecord: false,
  },
  {
    id: 'scoreplayer',
    label: 'Score Player',
    short: 'Score',
    area: 'utility',
    utility: true,
    description: 'Play Guitar Pro tracks, pick measure ranges, and save them as exercises.',
    title: 'Score Player',
    context: ['tempo'],
    holdRecord: false,
  },
  {
    id: 'settings',
    label: 'Settings',
    short: 'Settings',
    area: 'utility',
    utility: true,
    description: 'Musical context, volume, sync, import and export, and library cleanup.',
    title: 'Settings',
    context: [],
    holdRecord: false,
  },
];

export const AREA_ICONS = {
  train: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  study: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
  create: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/></svg>',
  library: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h4v16H4zM10 4h4v16h-4z"/><path d="m16.5 5.2 3.4 15.1"/></svg>',
  utility: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 3.5a5.5 5.5 0 0 0-5 7.7L3.7 18a2.1 2.1 0 0 0 3 3l6.8-6.8a5.5 5.5 0 0 0 6.6-7.6l-3 3-2.7-2.7 3-3a5.5 5.5 0 0 0-1.9-.4z"/></svg>',
};

export const TOOL_ICONS = {
  intervals: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h16M4 20V8m16 12V4M8 20v-6m4 6V6m4 6v8"/></svg>',
  sightreading: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 10h18M3 14h18M3 18h18"/><circle cx="8" cy="15" r="2.4" fill="currentColor" stroke="none"/><path d="M10.4 15V7"/></svg>',
  chordworkout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/><circle cx="17" cy="16" r="2" fill="currentColor" stroke="none"/></svg>',
  pitchear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><path d="M12 19v4m-4 0h8"/></svg>',
  scaleref: AREA_ICONS.study,
  chordref: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8M12 8v8"/></svg>',
  chordfinder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4v16M9 4v16M14 4v16M19 4v16"/><path d="M4 8h15M4 15h15"/><circle cx="9" cy="8" r="2.1" fill="currentColor" stroke="none"/><circle cx="19" cy="15" r="2.1" fill="currentColor" stroke="none"/></svg>',
  triads: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4 4 19h16L12 4z"/><circle cx="12" cy="9" r="1.4" fill="currentColor" stroke="none"/><circle cx="8" cy="16" r="1.4" fill="currentColor" stroke="none"/><circle cx="16" cy="16" r="1.4" fill="currentColor" stroke="none"/></svg>',
  circle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>',
  drumtab: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7h18M3 12h18M3 17h18"/><path d="M7 5v4M13 10v4M17 15v4"/></svg>',
  audiostudio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0014 0"/><path d="M12 17v4M8 21h8"/></svg>',
  songstudio: AREA_ICONS.create,
  notes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h16v13l-5 5H4z"/><path d="M20 16h-5v5"/><path d="M8 8h8M8 12h6"/></svg>',
  exercises: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/></svg>',
  workbooks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>',
  metronome: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L6 22h12L12 2z"/><path d="M12 8v6"/><circle cx="12" cy="16" r="1.5"/></svg>',
  keyboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 4v10m4-10v10m4-10v10m4-10v10"/></svg>',
  scoreplayer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 9v6l5-3-5-3z"/><path d="M15 9h2M15 12h3M15 15h1"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.4.7 1.1 1.1 1.9 1.1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
};

export function getTool(id) {
  return TOOLS.find(t => t.id === id) || null;
}

export function getArea(id) {
  if (id === UTILITY_AREA.id) return UTILITY_AREA;
  return AREAS.find(a => a.id === id) || null;
}

/** True for the four product areas. Utilities are not one of them. */
export function isPrimaryArea(id) {
  return AREAS.some(a => a.id === id);
}

export function toolsInArea(areaId) {
  return TOOLS.filter(t => t.area === areaId);
}

export function utilityTools() {
  return TOOLS.filter(t => t.utility === true);
}

export function isUtility(id) {
  const tool = getTool(id);
  return !!(tool && tool.utility === true);
}

export function toolSearchText(tool) {
  const parts = [tool.label, tool.short, tool.title];
  if (Array.isArray(tool.modes)) {
    for (const mode of tool.modes) {
      if (mode && typeof mode.label === 'string') parts.push(mode.label);
    }
  }
  return parts.filter(Boolean).join(' ').toLowerCase();
}

/** Fields of the shared musical context. The quick control shows them in this order. */
export const CONTEXT_FIELDS = ['root', 'scale', 'tempo', 'tuning'];

/**
 * Fields of the shared musical context that a tool reads.
 * @returns {string[]} the fields in CONTEXT_FIELDS order; empty when the tool
 * does not use the shared context.
 */
export function toolContextFields(toolId) {
  const tool = getTool(toolId);
  if (!tool || !Array.isArray(tool.context)) return [];
  return CONTEXT_FIELDS.filter(field => tool.context.includes(field));
}

export function isHoldRecordRelevant(toolId) {
  const tool = getTool(toolId);
  return !!(tool && tool.holdRecord);
}

/** Tabs shape used by the split view and the command palette. */
export function asTabs() {
  return TOOLS.map(t => ({
    id: t.id,
    label: t.short,
    group: areaLabel(t.area),
    area: t.area,
  }));
}

export function getTabs() {
  return asTabs();
}

function areaLabel(id) {
  const area = getArea(id);
  return area ? area.label : id;
}

/** The DOM section that hosts a tool. Every tool page follows this rule. */
export function sectionIdForTool(toolId) {
  return `sec-${toolId}`;
}
