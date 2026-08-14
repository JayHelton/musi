export function buildLargeNotes(count = 300) {
  const notes = [];
  for (let i = 0; i < count; i += 1) {
    notes.push({
      id: `note-large-${i}`,
      title: `Large note ${i}`,
      body: `Body ${i}`,
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-08-01T10:00:00.000Z',
    });
  }
  return notes;
}

export function buildLargeExerciseStore(count = 300) {
  const items = [];
  for (let i = 0; i < count; i += 1) {
    items.push({
      id: `ex-large-${i}`,
      name: `Large exercise ${i}`,
      categoryId: '',
      attachmentId: '',
      url: `https://example.com/exercises/item-${i}`,
      fileName: `item-${i}.gp`,
      type: 'application/guitar-pro',
      size: 0,
      addedAt: '2026-08-01T10:00:00.000Z',
    });
  }
  return { categories: [], items };
}

export function buildLargeData() {
  return {
    settings: {},
    notes: buildLargeNotes(),
    songs: [],
    exerciseStore: buildLargeExerciseStore(),
    workbookStore: { folders: [], workbooks: [] },
    routines: [],
    attachments: new Map(),
    drumPatterns: [],
  };
}
