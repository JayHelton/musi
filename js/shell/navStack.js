// In-app screen stack. It remembers where the user came from so a Back press
// walks the product hierarchy: area -> tool, and Library -> Workbooks ->
// workbook -> exercise.

import { getTool } from '../tools.js';
import { DEFAULT_ROUTE_ID } from '../routeMap.js';

const VALID_ORIGINS = new Set([
  'train',
  'study',
  'create',
  'library',
  'utilities',
  'workbook',
  'search',
  'recent',
  'direct',
]);

const stack = [];
const viewStates = new Map();

function isLibraryRouteKey(routeKey) {
  return typeof routeKey === 'string' && routeKey.startsWith('library:');
}

function normalizeLibraryViewState(state) {
  const filters = state?.filters ?? {};
  return {
    query: typeof state?.query === 'string' ? state.query : '',
    filters: {
      instrument: filters.instrument ?? null,
      materialType: filters.materialType ?? null,
      technique: filters.technique ?? null,
      tuning: filters.tuning ?? null,
      difficulty: filters.difficulty ?? null,
      tags: Array.isArray(filters.tags) ? [...filters.tags] : [],
      source: filters.source ?? null,
    },
    sort: typeof state?.sort === 'string' ? state.sort : '',
    selectedId: state?.selectedId ?? null,
    scrollY: typeof state?.scrollY === 'number' ? state.scrollY : 0,
  };
}

export function pushRoute(route, origin) {
  if (!VALID_ORIGINS.has(origin)) {
    throw new Error(`Invalid navigation origin: ${origin}`);
  }
  stack.push({ route, origin });
}

export function popRoute() {
  if (stack.length === 0) return null;
  stack.pop();
  if (stack.length === 0) return null;
  return stack[stack.length - 1];
}

export function currentOrigin() {
  if (stack.length === 0) return 'direct';
  return stack[stack.length - 1].origin;
}

export function saveViewState(routeKey, state) {
  const stored = isLibraryRouteKey(routeKey)
    ? normalizeLibraryViewState(state)
    : state;
  viewStates.set(routeKey, stored);
}

export function readViewState(routeKey) {
  const stored = viewStates.get(routeKey);
  if (stored === undefined) return null;
  if (isLibraryRouteKey(routeKey)) {
    return normalizeLibraryViewState(stored);
  }
  return stored;
}

export function restoreScroll(routeKey) {
  const state = readViewState(routeKey);
  const scrollY = state && typeof state.scrollY === 'number' ? state.scrollY : 0;
  if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
    window.scrollTo(0, scrollY);
  }
  return scrollY;
}

export function focusHeading(sectionEl) {
  if (!sectionEl) return;
  const heading = sectionEl.querySelector?.('h1, h2, [data-page-heading]')
    ?? (sectionEl.matches?.('h1, h2, [data-page-heading]') ? sectionEl : null);
  if (!heading) return;
  heading.setAttribute('tabindex', '-1');
  if (typeof heading.focus === 'function') {
    heading.focus({ preventScroll: true });
  }
}

/**
 * The screen one level up from a tool page.
 * @param {string} origin how the user reached the current screen
 * @param {{ id: string, params?: Record<string, string> }} route the current route
 * @returns {{ id: string, params: Record<string, string> }}
 */
export function parentAddress(origin, route) {
  const routeId = route?.id || '';

  switch (origin) {
    case 'train':
    case 'study':
    case 'create':
    case 'library':
      return { id: origin, params: {} };
    case 'workbook':
      return { id: 'workbooks', params: {} };
    case 'utilities':
    case 'search':
    case 'recent':
    case 'direct':
    default: {
      // Fall back to the area that owns the tool. Utilities have no landing
      // page, so they fall back to the default screen.
      const tool = getTool(routeId);
      if (tool && !tool.utility) return { id: tool.area, params: {} };
      return { id: DEFAULT_ROUTE_ID, params: {} };
    }
  }
}
