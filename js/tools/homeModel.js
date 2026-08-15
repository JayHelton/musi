// Pure Tools home section model. The caller supplies catalog data and stored lists.

import { PURPOSES, toolSearchText } from '../tools.js';

export const SECTION_IDS = ['purposes', 'favorites', 'recents', 'continue', 'search', 'browse'];

const RECENTS_DEFAULT_LIMIT = 5;

const SECTION_LABELS = {
  purposes: '',
  favorites: 'Favorites',
  recents: 'Recents',
  continue: 'Continue a routine',
  search: 'Search',
  browse: 'Browse all tools',
};

function toolById(tools, id) {
  return tools.find(t => t.id === id) || null;
}

function toolsForPurpose(tools, purpose) {
  return tools.filter(t => t.purpose === purpose);
}

function catalogItem(tool) {
  return {
    id: tool.id,
    label: tool.label,
    mode: tool.defaultMode,
    source: 'catalog',
  };
}

function isValidRecentEntry(entry) {
  return entry
    && typeof entry.id === 'string'
    && entry.id.length > 0
    && typeof entry.at === 'string'
    && entry.at.length > 0;
}

/** Drop malformed rows, keep one row per tool id, sort newest first, cap length. */
export function normalizeRecents(list, limit = RECENTS_DEFAULT_LIMIT) {
  if (!Array.isArray(list)) return [];
  const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : RECENTS_DEFAULT_LIMIT;
  const byId = new Map();

  for (const entry of list) {
    if (!isValidRecentEntry(entry)) continue;
    const prior = byId.get(entry.id);
    if (!prior || String(entry.at).localeCompare(String(prior.at)) > 0) {
      byId.set(entry.id, {
        id: entry.id,
        mode: typeof entry.mode === 'string' ? entry.mode : '',
        context: entry.context && typeof entry.context === 'object' ? entry.context : {},
        at: entry.at,
      });
    }
  }

  const sorted = [...byId.values()];
  sorted.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return sorted.slice(0, cap);
}

/** Prepend a visit, replace the prior row for the same tool, cap length, leave input untouched. */
export function pushRecent(list, entry, limit = RECENTS_DEFAULT_LIMIT) {
  const base = Array.isArray(list) ? list.slice() : [];
  if (!isValidRecentEntry(entry)) return normalizeRecents(base, limit);

  const normalized = {
    id: entry.id,
    mode: typeof entry.mode === 'string' ? entry.mode : '',
    context: entry.context && typeof entry.context === 'object' ? entry.context : {},
    at: entry.at,
  };

  const without = base.filter(item => item && item.id !== normalized.id);
  return normalizeRecents([normalized, ...without], limit);
}

/** Match tool names and mode labels only. An empty query returns no rows. */
export function searchTools(tools, query) {
  const q = typeof query === 'string' ? query.trim().toLowerCase() : '';
  if (!q) return [];

  const matches = [];
  for (const tool of tools) {
    if (!tool || !tool.purpose) continue;

    const haystack = toolSearchText(tool);
    if (!haystack.includes(q)) continue;

    let matchedMode = '';
    if (Array.isArray(tool.modes)) {
      for (const mode of tool.modes) {
        if (mode && typeof mode.label === 'string' && mode.label.toLowerCase().includes(q)) {
          matchedMode = mode.id;
          break;
        }
      }
    }

    const mode = matchedMode || tool.defaultMode || '';
    matches.push({
      id: tool.id,
      label: tool.label,
      mode,
      matchedMode,
    });
  }
  return matches;
}

/** Build ordered Tools home sections for the active purpose and stored lists. */
export function buildHomeSections(input) {
  const {
    purpose,
    tools = [],
    favorites = [],
    recents = [],
    activeRoutines = [],
    query = '',
  } = input || {};

  const sections = [];

  sections.push({
    id: 'purposes',
    label: SECTION_LABELS.purposes,
    activePurpose: purpose,
    items: PURPOSES.map(p => ({ id: p.id, label: p.label })),
  });

  const favoriteItems = [];
  for (const favId of favorites) {
    const tool = toolById(tools, favId);
    if (!tool || !tool.purpose) continue;
    favoriteItems.push(catalogItem(tool));
  }
  if (favoriteItems.length) {
    sections.push({
      id: 'favorites',
      label: SECTION_LABELS.favorites,
      items: favoriteItems,
    });
  }

  const recentItems = [];
  for (const entry of recents) {
    const tool = toolById(tools, entry?.id);
    if (!tool || !tool.purpose) continue;
    recentItems.push({
      id: entry.id,
      label: tool.label,
      mode: typeof entry.mode === 'string' ? entry.mode : '',
      context: entry.context && typeof entry.context === 'object' ? entry.context : {},
      at: entry.at,
      source: 'recent',
    });
  }
  if (recentItems.length) {
    sections.push({
      id: 'recents',
      label: SECTION_LABELS.recents,
      items: recentItems,
    });
  }

  // SIMPLIFY: Continue a routine section hidden.
  /*
  const continueItems = activeRoutines
    .filter(routine => routine && typeof routine.id === 'string' && typeof routine.name === 'string')
    .map(routine => ({
      id: routine.id,
      label: routine.name,
      source: 'routine',
    }));
  if (continueItems.length) {
    sections.push({
      id: 'continue',
      label: SECTION_LABELS.continue,
      items: continueItems,
    });
  }
  */

  sections.push({
    id: 'search',
    label: SECTION_LABELS.search,
    items: searchTools(tools, query),
  });

  const browseItems = toolsForPurpose(tools, purpose).map(catalogItem);
  sections.push({
    id: 'browse',
    label: SECTION_LABELS.browse,
    items: browseItems,
  });

  return sections;
}
