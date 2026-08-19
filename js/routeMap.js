// Route resolution. A route id is either a product area or a tool id. There
// is no legacy table: an unknown id falls back to the Train area.

import { AREAS, TOOLS, getTool, isPrimaryArea } from './tools.js';

/** Area landing pages. Utilities have no landing page; they open from a menu. */
export const AREA_ROUTE_IDS = AREAS.map(a => a.id);

/** Every tool page. The route id and the tool id are the same string. */
export const TOOL_ROUTE_IDS = TOOLS.map(t => t.id);

export const ROUTE_IDS = [...AREA_ROUTE_IDS, ...TOOL_ROUTE_IDS];

/** The screen the app opens when no route is given. */
export const DEFAULT_ROUTE_ID = 'train';

/**
 * @param {string} id
 * @returns {boolean}
 */
export function isKnownRoute(id) {
  return ROUTE_IDS.includes(id);
}

/**
 * The default mode of a tool that has modes.
 * @param {string} routeId
 * @returns {string}
 */
export function defaultModeFor(routeId) {
  const tool = getTool(routeId);
  if (!tool || !Array.isArray(tool.modes) || !tool.modes.length) return '';
  return tool.defaultMode || tool.modes[0].id;
}

/**
 * Fill in the default mode, and drop a mode the tool does not have.
 * @param {string} routeId
 * @param {Record<string, string>} params
 * @returns {Record<string, string>}
 */
function normalizeMode(routeId, params) {
  const tool = getTool(routeId);
  const next = { ...params };
  const modes = Array.isArray(tool?.modes) ? tool.modes : [];
  if (!modes.length) {
    delete next.mode;
    return next;
  }
  if (!next.mode || !modes.some(m => m.id === next.mode)) {
    next.mode = defaultModeFor(routeId);
  }
  return next;
}

/**
 * @param {{ id: string, params?: Record<string, string> }} route
 * @returns {{ id: string, params: Record<string, string> }}
 */
export function resolveRoute(route) {
  const inputParams = route?.params || {};
  const id = route?.id || '';

  if (id === '' || !isKnownRoute(id)) {
    return { id: DEFAULT_ROUTE_ID, params: {} };
  }

  if (isPrimaryArea(id)) {
    return { id, params: { ...inputParams } };
  }

  return { id, params: normalizeMode(id, inputParams) };
}
