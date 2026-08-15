export function shouldKeepLibraryPlayer(sectionId, params = {}) {
  if (sectionId === 'workbooks') return Boolean(params.workbook);
  if (sectionId === 'exercises') return Boolean(params.exercise);
  return false;
}

export function libraryRouteParams({ mode, workbook, exercise, companion } = {}) {
  const params = {};
  if (mode) params.mode = mode;
  if (workbook) params.workbook = workbook;
  if (exercise) params.exercise = exercise;
  if (companion) params.companion = companion;
  return params;
}
