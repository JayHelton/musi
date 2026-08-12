// Pure routine card models for the Home dashboard. The caller injects stats and
// active-session lookups so this module stays free of storage and DOM.

function cardDescription(description) {
  if (description == null || description === '') return null;
  return description;
}

function cardProgress(completedCount, totalCount) {
  if (!totalCount) return 0;
  return completedCount / totalCount;
}

function buildRoutineCard(routine, getStats, getActiveSession) {
  const stats = getStats(routine);
  const totalCount = stats.sessionCount ?? 0;
  const completedCount = stats.completedSessionCount ?? 0;
  const active = getActiveSession(routine);
  const currentSessionName = active?.session?.name ?? null;

  return {
    id: routine.id,
    name: routine.name,
    description: cardDescription(routine.description),
    currentSessionName,
    completedCount,
    totalCount,
    progress: cardProgress(completedCount, totalCount),
    updatedAt: routine.updatedAt,
  };
}

/** Sort cards by updatedAt descending, then name ascending. */
export function sortRoutineCards(cards) {
  const sorted = cards.slice();
  sorted.sort((a, b) => {
    const byDate = (b.updatedAt || '').localeCompare(a.updatedAt || '');
    if (byDate !== 0) return byDate;
    return (a.name || '').localeCompare(b.name || '');
  });
  return sorted;
}

/** Build sorted routine card models from routine records. */
export function buildRoutineCardModels(routines, { getStats, getActiveSession } = {}) {
  if (!Array.isArray(routines) || !routines.length) return [];
  const cards = routines.map(rt => buildRoutineCard(rt, getStats, getActiveSession));
  return sortRoutineCards(cards);
}
