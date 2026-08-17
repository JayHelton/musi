function note(id, title, body, extra = {}) {
  return {
    id,
    title,
    body,
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...extra,
  };
}

function exercise(id, fields = {}) {
  return {
    id,
    name: fields.name || 'Exercise',
    categoryId: fields.categoryId || '',
    attachmentId: fields.attachmentId || '',
    url: fields.url || '',
    fileName: fields.fileName || '',
    type: fields.type || '',
    size: fields.size || 0,
    addedAt: fields.addedAt || '2026-08-01T10:00:00.000Z',
    ...fields,
  };
}

function drumPattern(id, fields = {}) {
  return {
    id,
    title: fields.title || 'Pattern',
    category: fields.category || 'beat',
    style: fields.style || 'rock',
    tags: fields.tags || ['rock'],
    difficulty: fields.difficulty || 2,
    bpmRange: fields.bpmRange || [80, 120],
    meter: '4/4',
    subdivision: 'eighth',
    bars: 1,
    stepsPerBar: 16,
    steps: fields.steps || [{ instrument: 'kick', step: 0, velocity: 100 }],
    tab: fields.tab || 'K o | | |\n',
    builtin: fields.builtin === true,
    createdAt: fields.createdAt || '2026-08-01T10:00:00.000Z',
    updatedAt: fields.updatedAt || '2026-08-01T10:00:00.000Z',
    ...fields,
  };
}

export function buildNormalSettings() {
  return {
    'drums.favorites': ['builtin-rock-groove-01'],
  };
}

export function buildNormalNotes() {
  const notes = [];
  for (let i = 0; i < 50; i += 1) {
    notes.push(note(`note-normal-${i}`, `Note ${i}`, `Body ${i}`));
  }
  return notes;
}

export function buildDuplicateTitleNotes() {
  return [
    note('note-dup-a', 'Same title', 'First body'),
    note('note-dup-b', 'Same title', 'Second body'),
  ];
}

export function buildPartialLegacyNote() {
  return {
    id: 'note-partial',
    title: 'Partial',
    body: 'Missing updatedAt',
    createdAt: '2026-08-01T09:00:00.000Z',
  };
}

export function buildLinkedNote() {
  return note('note-linked', 'Linked', 'Already linked', {
    linkedType: 'exercise',
    linkedId: 'ex-normal-001',
  });
}

export function buildBrokenLinkNote() {
  return note('note-broken', 'Broken link', 'Missing entity', {
    linkedType: 'workbook',
    linkedId: 'wb-missing-001',
  });
}

export function buildNormalExerciseStore() {
  return {
    categories: [{ id: 'cat-normal-tabs', name: 'Tabs', parentId: '' }],
    items: [
      exercise('ex-normal-pdf', {
        name: 'Scale PDF',
        attachmentId: 'att-pdf-001',
        fileName: 'scale.pdf',
        type: 'application/pdf',
        size: 1200,
      }),
      exercise('ex-normal-gp', {
        name: 'GP etude',
        attachmentId: 'att-gp-001',
        fileName: 'etude.gp5',
        type: 'application/x-guitar-pro',
        size: 5000,
      }),
      exercise('ex-normal-url', {
        name: 'Lesson link',
        url: 'https://example.com/lesson',
        fileName: 'lesson.gp',
        type: 'application/guitar-pro',
      }),
      exercise('ex-normal-instrument', {
        name: 'Bass drill',
        attachmentId: 'att-bass-001',
        fileName: 'bass.mp3',
        type: 'audio/mpeg',
        size: 800,
        instrument: 'bass',
      }),
      exercise('ex-broken-att', {
        name: 'Broken attachment',
        attachmentId: 'att-missing-001',
        fileName: 'missing.gp5',
        type: 'application/x-guitar-pro',
      }),
    ],
  };
}

export function buildDuplicateFileNameExercises() {
  return {
    categories: [],
    items: [
      exercise('ex-dup-a', { name: 'A', attachmentId: 'att-dup-a', fileName: 'same.pdf', type: 'application/pdf' }),
      exercise('ex-dup-b', { name: 'B', attachmentId: 'att-dup-b', fileName: 'same.pdf', type: 'application/pdf' }),
    ],
  };
}

export function buildPartialLegacyExercise() {
  return {
    categories: [],
    items: [
      exercise('ex-partial', {
        name: 'No metadata fields',
        attachmentId: 'att-partial',
        fileName: 'partial.pdf',
        type: 'application/pdf',
      }),
    ],
  };
}

export function buildMigratedDrumExercise(patternId) {
  return exercise(`ex-migrated-${patternId}`, {
    name: 'Already migrated',
    attachmentId: 'att-migrated-001',
    fileName: `${patternId}.musi-drum-pattern.json`,
    type: 'application/json',
    instrument: 'drums',
    materialType: 'beat',
    source: 'drums-migration',
    sourceRef: `drum-pattern:${patternId}`,
  });
}

export function buildNormalWorkbookStore() {
  return {
    folders: [{ id: 'wbf-normal-001', name: 'Technique' }],
    workbooks: [{
      id: 'wb-normal-001',
      name: 'Picking workbook',
      folderId: 'wbf-normal-001',
      entries: [{ id: 'wbe-001', exerciseId: 'ex-normal-pdf' }],
      companions: [],
      loopEnabled: true,
      activeEntryId: 'wbe-001',
      createdAt: '2026-08-01T11:00:00.000Z',
      updatedAt: '2026-08-12T11:00:00.000Z',
    }],
  };
}

export function buildNormalRoutines() {
  return [{
    id: 'rt-normal-001',
    name: 'Guitar practice',
    description: 'Routine seed',
    sessions: [{
      id: 'rs-normal-001',
      name: 'Main',
      notes: '',
      workbookIds: ['wb-normal-001'],
      durationMin: 20,
      metronome: { bpm: 100, beats: 4, subdiv: 'quarter', accentFirst: true },
      completed: false,
    }],
    activeSessionId: 'rs-normal-001',
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-12T12:00:00.000Z',
  }];
}

export function buildNormalDrumPatterns() {
  return [
    drumPattern('usr-normal-beat-001', {
      title: 'Rock Beat 1',
      category: 'beat',
      tags: ['rock', 'groove'],
    }),
    drumPattern('usr-normal-fill-001', {
      title: 'Tom Fill 1',
      category: 'fill',
      tags: ['fill', 'toms'],
    }),
    drumPattern('builtin-rock-groove-01', {
      title: 'Built-in Rock Groove',
      category: 'beat',
      builtin: true,
      tags: ['builtin', 'rock'],
    }),
    drumPattern('usr-partial-tags', {
      title: 'No tags pattern',
      category: 'beat',
      tags: undefined,
    }),
    drumPattern('usr-broken-steps', {
      title: 'Empty steps',
      category: 'beat',
      steps: [],
      tab: '',
    }),
  ];
}

export function buildNormalAttachments() {
  const map = new Map();
  map.set('att-pdf-001', {
    id: 'att-pdf-001',
    blob: new Blob(['pdf'], { type: 'application/pdf' }),
    name: 'Scale PDF',
    fileName: 'scale.pdf',
    type: 'application/pdf',
    size: 4,
    createdAt: '2026-08-01T10:00:00.000Z',
    source: 'exercise',
  });
  map.set('att-gp-001', {
    id: 'att-gp-001',
    blob: new Blob(['gp'], { type: 'application/x-guitar-pro' }),
    name: 'GP etude',
    fileName: 'etude.gp5',
    type: 'application/x-guitar-pro',
    size: 2,
    createdAt: '2026-08-01T10:00:00.000Z',
    source: 'exercise',
  });
  map.set('att-bass-001', {
    id: 'att-bass-001',
    blob: new Blob(['audio'], { type: 'audio/mpeg' }),
    name: 'Bass drill',
    fileName: 'bass.mp3',
    type: 'audio/mpeg',
    size: 5,
    createdAt: '2026-08-01T10:00:00.000Z',
    source: 'exercise',
  });
  return map;
}

export function buildNormalData() {
  return {
    settings: buildNormalSettings(),
    notes: buildNormalNotes(),
    songs: [],
    exerciseStore: buildNormalExerciseStore(),
    workbookStore: buildNormalWorkbookStore(),
    routines: buildNormalRoutines(),
    attachments: buildNormalAttachments(),
    drumPatterns: buildNormalDrumPatterns(),
  };
}
