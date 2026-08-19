/** True when the route asks the library page to reopen a player. */
export function shouldKeepLibraryPlayer(sectionId, params = {}) {
  if (sectionId === 'workbooks') return Boolean(params.workbook);
  if (sectionId === 'exercises') return Boolean(params.exercise);
  return false;
}

/** Build the route params for a library player screen. */
export function libraryRouteParams({ workbook, exercise, companion } = {}) {
  const params = {};
  if (workbook) params.workbook = workbook;
  if (exercise) params.exercise = exercise;
  if (companion) params.companion = companion;
  return params;
}
