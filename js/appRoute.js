const ROUTINE_KEY_ORDER = ['routine', 'session', 'workbook', 'exercise', 'companion'];

/**
 * @param {string} hash
 * @returns {{ id: string, params: Record<string, string> }}
 */
export function parseAppRoute(hash) {
  if (hash == null || hash === '') {
    return { id: '', params: {} };
  }

  let fragment = String(hash);
  if (fragment.startsWith('#')) {
    fragment = fragment.slice(1);
  }
  if (fragment === '') {
    return { id: '', params: {} };
  }

  const qIdx = fragment.indexOf('?');
  let id;
  let query;
  if (qIdx === -1) {
    id = fragment;
    query = '';
  } else {
    id = fragment.slice(0, qIdx);
    query = fragment.slice(qIdx + 1);
  }

  const params = {};
  if (query) {
    for (const pair of query.split('&')) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx === -1) continue;
      const key = decodeURIComponent(pair.slice(0, eqIdx));
      const value = decodeURIComponent(pair.slice(eqIdx + 1));
      if (!key || !value) continue;
      params[key] = value;
    }
  }

  return { id, params };
}

/**
 * @param {{ id: string, params?: Record<string, string> }} route
 * @returns {string}
 */
export function buildAppRoute({ id, params = {} }) {
  const fixed = new Set(ROUTINE_KEY_ORDER);
  const keys = [];

  for (const key of ROUTINE_KEY_ORDER) {
    if (params[key]) keys.push(key);
  }
  for (const key of Object.keys(params).sort()) {
    if (!fixed.has(key) && params[key]) keys.push(key);
  }

  if (!keys.length) return id;
  const query = keys.map(key => `${key}=${encodeURIComponent(params[key])}`).join('&');
  return `${id}?${query}`;
}

/**
 * @param {{ id: string, params?: Record<string, string> }} route
 * @param {{ pathname: string, search: string }} [location]
 * @returns {string}
 */
export function routeUrl({ id, params }, location) {
  const loc = location ?? (
    typeof globalThis !== 'undefined' && globalThis.location
      ? globalThis.location
      : { pathname: '/', search: '' }
  );
  const base = loc.pathname + loc.search;
  if (!id || id === 'home' || id === 'tools') return base;
  return `${base}#${buildAppRoute({ id, params })}`;
}

/**
 * @param {{ id: string, params?: Record<string, string> }} a
 * @param {{ id: string, params?: Record<string, string> }} b
 * @returns {boolean}
 */
export function sameRoute(a, b) {
  if (a.id !== b.id) return false;
  const aParams = a.params || {};
  const bParams = b.params || {};
  const aKeys = Object.keys(aParams);
  const bKeys = Object.keys(bParams);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (aParams[key] !== bParams[key]) return false;
  }
  return true;
}
