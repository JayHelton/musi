/**
 * Hash routing, legacy normalization, history stack, and route subscriptions.
 */

import {
  resolveHash,
  formatRoute,
  withParams,
  parseRoute,
  LEGACY_ROUTES,
} from './routes.js';

let current = null;
let listeners = [];
let onRouteCallback = null;
let applyingHistory = false;
let panelDepth = 0;
let navPushCount = 0;

function notify() {
  for (const fn of listeners) {
    try { fn(current); } catch (e) { /* ignore */ }
  }
  if (onRouteCallback) onRouteCallback(current);
}

function readHash() {
  const h = location.hash;
  if (!h || h === '#') return '#home';
  return h;
}

function applyRoute(route, { replace = false, fromHistory = false, showUnknownToast = false } = {}) {
  const prev = current;
  current = route;
  if (showUnknownToast && route.unknown && typeof window !== 'undefined' && window.showAppToast) {
    window.showAppToast('Unknown route — showing Home');
  }
  if (!fromHistory && prev && prev.hash !== route.hash) {
    notify();
  } else if (!prev || prev.hash !== route.hash) {
    notify();
  }
}

function syncUrl(hash, { replace = false } = {}) {
  const state = { musiRoute: hash };
  if (replace) {
    history.replaceState(state, '', hash);
  } else {
    history.pushState(state, '', hash);
    navPushCount += 1;
  }
}

function handleResolved(hash, { replace = false, fromHistory = false } = {}) {
  const { route, canonicalHash, redirected } = resolveHash(hash);
  const finalHash = redirected ? canonicalHash : (hash.startsWith('#') ? hash : `#${hash}`);

  applyingHistory = true;
  try {
    if (redirected || replace) {
      history.replaceState({ musiRoute: finalHash }, '', finalHash);
    }
    applyRoute(route, {
      replace: redirected || replace,
      fromHistory,
      showUnknownToast: route.unknown && !fromHistory,
    });
  } finally {
    applyingHistory = false;
  }
}

function onHashChange() {
  if (applyingHistory) return;
  const hash = readHash();
  const { route, canonicalHash, redirected } = resolveHash(hash);
  applyingHistory = true;
  try {
    if (redirected) {
      history.replaceState({ musiRoute: canonicalHash }, '', canonicalHash);
    } else if (route.hash !== hash) {
      history.replaceState({ musiRoute: route.hash }, '', route.hash);
    }
    if (!redirected && route.hash !== (current?.hash || '')) {
      navPushCount += 1;
    }
    applyRoute(route, { fromHistory: false, showUnknownToast: route.unknown });
  } finally {
    applyingHistory = false;
  }
}

function onPopState() {
  applyingHistory = true;
  navPushCount = Math.max(0, navPushCount - 1);
  try {
    const hash = readHash();
    const { route, canonicalHash, redirected } = resolveHash(hash);
    if (redirected) {
      history.replaceState({ musiRoute: canonicalHash }, '', canonicalHash);
    }
    if (route.params?.panel) {
      panelDepth = Math.max(0, panelDepth - 1);
    }
    applyRoute(route, { fromHistory: true });
  } finally {
    applyingHistory = false;
  }
}

/**
 * @param {{ onRoute: (route: object) => void }} config
 */
export function initRouter({ onRoute }) {
  onRouteCallback = onRoute;
  window.addEventListener('hashchange', onHashChange);
  window.addEventListener('popstate', onPopState);

  const hash = readHash();
  const { route, canonicalHash, redirected } = resolveHash(hash);
  if (redirected || !hash || hash === '#') {
    history.replaceState({ musiRoute: canonicalHash }, '', canonicalHash);
  } else {
    history.replaceState({ musiRoute: route.hash }, '', route.hash);
  }
  current = route;
  notify();
}

/**
 * @param {string|object} target
 * @param {{ replace?: boolean }} [opts]
 */
export function navigate(target, { replace = false } = {}) {
  const hash = typeof target === 'string'
    ? (target.startsWith('#') ? target : `#${target}`)
    : formatRoute(target);
  const { route, canonicalHash, redirected } = resolveHash(hash);
  const finalHash = redirected ? canonicalHash : hash;

  applyingHistory = true;
  try {
    if (replace || redirected) {
      history.replaceState({ musiRoute: finalHash }, '', finalHash);
    } else {
      syncUrl(finalHash, { replace: false });
    }
    applyRoute(route, { replace: replace || redirected, showUnknownToast: route.unknown });
  } finally {
    applyingHistory = false;
  }
}

/**
 * @param {Record<string, string|null|undefined>} patch
 * @param {{ replace?: boolean }} [opts]
 */
export function setParams(patch, { replace = true } = {}) {
  if (!current) return;
  const next = withParams(current, patch);
  navigate(next, { replace });
}

/**
 * @returns {object|null}
 */
export function currentRoute() {
  return current;
}

/**
 * @param {(route: object) => void} fn
 * @returns {() => void}
 */
export function onRouteChange(fn) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((f) => f !== fn);
  };
}

/**
 * @param {string} name
 */
export function openPanel(name) {
  if (!current) return;
  const next = withParams(current, { panel: name });
  navigate(next, { replace: false });
  panelDepth += 1;
}

/**
 * Close the open utility panel.
 */
export function closePanel() {
  if (!current?.params?.panel) return;
  if (panelDepth > 0) {
    panelDepth -= 1;
    history.back();
    return;
  }
  setParams({ panel: null }, { replace: true });
}

/**
 * @param {string} legacyId
 */
export function navigateLegacy(legacyId) {
  const bare = String(legacyId || '').replace(/^#/, '').split('?')[0];
  if (bare in LEGACY_ROUTES) {
    navigate(LEGACY_ROUTES[bare]);
    return;
  }
  const fragment = String(legacyId || '').startsWith('#') ? legacyId : `#${legacyId}`;
  const parsed = parseRoute(fragment);
  if (!parsed.unknown) {
    navigate(parsed.hash);
    return;
  }
  navigate(fragment);
}

/** @returns {number} */
export function getNavPushCount() {
  return navPushCount;
}

/** Remove one in-app history entry. */
export function popNavHistory() {
  if (navPushCount > 0) history.back();
}
