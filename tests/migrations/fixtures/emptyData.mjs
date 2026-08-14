export function buildEmptySettings() {
  return {};
}

export function buildEmptyNotes() {
  return [];
}

export function buildEmptySongs() {
  return [];
}

export function buildEmptyExerciseStore() {
  return { categories: [], items: [] };
}

export function buildEmptyWorkbookStore() {
  return { folders: [], workbooks: [] };
}

export function buildEmptyRoutines() {
  return [];
}

export function buildEmptyAttachments() {
  return new Map();
}

export function buildEmptyDrumPatterns() {
  return [];
}

export function buildEmptyData() {
  return {
    settings: buildEmptySettings(),
    notes: buildEmptyNotes(),
    songs: buildEmptySongs(),
    exerciseStore: buildEmptyExerciseStore(),
    workbookStore: buildEmptyWorkbookStore(),
    routines: buildEmptyRoutines(),
    attachments: buildEmptyAttachments(),
    drumPatterns: buildEmptyDrumPatterns(),
  };
}
