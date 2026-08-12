import {
  parseRoutineRoute,
  buildRoutineParams,
  routeLayer,
  parentRoute,
  resolveRoutineRoute,
  ROUTINE_ROUTE_ID,
} from './routineRoute.js';
import { buildAppRoute } from './appRoute.js';
import {
  openWorkbookForRoute,
  closeWorkbookLayer,
  setWorkbookBackTarget,
  onWorkbookEntryChange,
} from './workbooks.js';

const NOT_FOUND_MESSAGE = 'Item not found';
const SESSION_BACK_LABEL = '← Session';

const LAYER_ORDER = ['routine', 'session', 'workbook', 'companion', 'exercise'];

function emptyRoute() {
  return {
    routine: null,
    session: null,
    workbook: null,
    exercise: null,
    companion: null,
  };
}

function routeKey(route) {
  const params = buildRoutineParams(route);
  return buildAppRoute({ id: ROUTINE_ROUTE_ID, params });
}

function getLayerChain(route) {
  const chain = [];
  if (!route.routine) return chain;
  chain.push('routine');
  if (!route.session) return chain;
  chain.push('session');
  if (route.exercise) {
    chain.push('workbook');
    chain.push('exercise');
    return chain;
  }
  if (route.companion) {
    chain.push('companion');
    return chain;
  }
  if (route.workbook) {
    chain.push('workbook');
    return chain;
  }
  return chain;
}

function sectionElement(sectionId) {
  if (typeof document === 'undefined') return null;
  return document.getElementById(`sec-${sectionId}`) || document.getElementById(sectionId);
}

function detailTitleEl() {
  if (typeof document === 'undefined') return null;
  return document.getElementById('wb-detail-title');
}

function workbookStatusEl() {
  if (typeof document === 'undefined') return null;
  return document.getElementById('wb-status');
}

function validateOpenPatch(current, patch) {
  const merged = { ...current };
  for (const key of Object.keys(patch)) {
    if (patch[key]) merged[key] = patch[key];
  }
  const normalized = parseRoutineRoute(buildRoutineParams(merged));
  for (const key of Object.keys(patch)) {
    if (patch[key] && !normalized[key]) return false;
  }
  return true;
}

/**
 * @param {{ shell: object, onBack: () => void, onEntryReplace?: unknown }} config
 */
export function createWorkbookLayerDescriptors({ shell, onBack, onEntryReplace }) {
  function activateWorkbooks() {
    shell.activateSection('workbooks', { keep: ['routines'] });
  }

  function setSessionBackTarget() {
    setWorkbookBackTarget({
      label: SESSION_BACK_LABEL,
      onBack,
    });
  }

  function mountWorkbook(ctx) {
    activateWorkbooks();
    setSessionBackTarget();
    openWorkbookForRoute({
      workbookId: ctx.route.workbook,
      exerciseId: null,
      companionId: null,
    });
  }

  function mountExercise(ctx) {
    activateWorkbooks();
    setSessionBackTarget();
    openWorkbookForRoute({
      workbookId: ctx.route.workbook,
      exerciseId: ctx.route.exercise,
      companionId: null,
    });
  }

  function mountCompanion(ctx) {
    activateWorkbooks();
    setSessionBackTarget();
    const workbookId = ctx.workbook?.id || ctx.route.workbook;
    openWorkbookForRoute({
      workbookId,
      exerciseId: null,
      companionId: ctx.route.companion,
    });
  }

  function unmountWorkbookLayer() {
    setWorkbookBackTarget(null);
    closeWorkbookLayer();
  }

  const workbookDescriptor = {
    host: () => 'workbooks',
    mount: mountWorkbook,
    unmount: unmountWorkbookLayer,
    heading: () => detailTitleEl(),
    status: () => workbookStatusEl(),
  };

  return {
    workbook: workbookDescriptor,
    exercise: {
      host: () => 'workbooks',
      mount: mountExercise,
      unmount: () => {},
      heading: () => detailTitleEl(),
      status: () => workbookStatusEl(),
    },
    companion: {
      host: () => 'workbooks',
      mount: mountCompanion,
      unmount: unmountWorkbookLayer,
      heading: () => detailTitleEl(),
      status: () => workbookStatusEl(),
    },
  };
}

/**
 * @param {object} config
 */
export function createRoutineNavigator({
  root,
  getRoutine,
  getSession,
  getWorkbook,
  getExercise,
  getCompanion,
  shell,
  layers,
  homeStatus,
  onRouteChange,
}) {
  const state = {
    route: emptyRoute(),
    mountedLayers: [],
    scrollPositions: new Map(),
  };

  let entryChangeUnsub = null;

  function makeResolveData() {
    return {
      getRoutine,
      getSession,
      getWorkbook,
      findCompanion: getCompanion,
    };
  }

  function buildCtx(route) {
    const routine = route.routine ? getRoutine(route.routine) : null;
    const session =
      routine && route.session ? getSession(routine, route.session) : null;
    let workbook = route.workbook ? getWorkbook(route.workbook) : null;
    const exercise =
      workbook && route.exercise
        ? getExercise(route.workbook, route.exercise)
        : null;
    let companion = null;

    if (session && route.companion) {
      const found = getCompanion(session, route.companion);
      if (found) {
        companion = found.companion;
        if (!workbook) workbook = found.workbook;
      }
    }

    return { route, routine, session, workbook, exercise, companion };
  }

  function getHostElement(layerName) {
    const layer = layers[layerName];
    if (!layer) return null;
    return sectionElement(layer.host());
  }

  function saveScrollForRoute(route) {
    const layerName = routeLayer(route);
    if (layerName === 'list') return;
    const hostEl = getHostElement(layerName);
    const windowY = typeof window !== 'undefined' ? window.scrollY : 0;
    state.scrollPositions.set(routeKey(route), {
      windowY,
      hostScrollTop: hostEl ? hostEl.scrollTop : 0,
    });
  }

  function restoreScroll(route) {
    const key = routeKey(route);
    const positions = state.scrollPositions.get(key);
    if (!positions) return;

    const layerName = routeLayer(route);
    const apply = () => {
      if (typeof window !== 'undefined') {
        window.scrollTo(0, positions.windowY);
      }
      const hostEl = getHostElement(layerName);
      if (hostEl) hostEl.scrollTop = positions.hostScrollTop;
    };

    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => requestAnimationFrame(apply));
    } else {
      apply();
    }
  }

  function clearScrollPositions() {
    state.scrollPositions.clear();
  }

  function focusHeading(layerName) {
    const layer = layers[layerName];
    if (!layer) return;
    const heading = layer.heading();
    if (!heading) return;
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }

  function clearStatusEl(el) {
    if (el) el.textContent = '';
  }

  function clearAllStatus() {
    for (const name of LAYER_ORDER) {
      const layer = layers[name];
      if (layer) clearStatusEl(layer.status());
    }
    if (homeStatus) clearStatusEl(homeStatus());
  }

  function showRepairMessage(route, reason) {
    if (reason === 'routine-missing') {
      if (homeStatus) {
        const el = homeStatus();
        if (el) el.textContent = NOT_FOUND_MESSAGE;
      }
      return;
    }
    const layerName = routeLayer(route);
    if (layerName === 'list') return;
    const layer = layers[layerName];
    const statusEl = layer?.status?.();
    if (statusEl) statusEl.textContent = NOT_FOUND_MESSAGE;
  }

  function mountLayer(layerName, ctx) {
    const layer = layers[layerName];
    if (!layer) return;
    layer.mount(ctx);
  }

  function unmountLayer(layerName, route) {
    const layer = layers[layerName];
    if (!layer) return;
    layer.unmount(buildCtx(route));
  }

  function unmountAllLayers(route) {
    for (let i = state.mountedLayers.length - 1; i >= 0; i -= 1) {
      unmountLayer(state.mountedLayers[i], route);
    }
    state.mountedLayers = [];
  }

  function reconcileStack(targetRoute, targetChain, meta) {
    const currentChain = [...state.mountedLayers];
    const oldRoute = state.route;

    let commonLen = 0;
    while (
      commonLen < currentChain.length
      && commonLen < targetChain.length
      && currentChain[commonLen] === targetChain[commonLen]
    ) {
      commonLen += 1;
    }

    const wentUp = currentChain.length > targetChain.length;

    for (let i = currentChain.length - 1; i >= commonLen; i -= 1) {
      unmountLayer(currentChain[i], oldRoute);
    }
    state.mountedLayers = currentChain.slice(0, commonLen);

    const ctx = buildCtx(targetRoute);
    for (let i = commonLen; i < targetChain.length; i += 1) {
      const layerName = targetChain[i];
      mountLayer(layerName, ctx);
      state.mountedLayers.push(layerName);
    }

    state.route = targetRoute;

    if (targetChain.length === 0) {
      clearScrollPositions();
      return;
    }

    const topLayer = targetChain[targetChain.length - 1];

    if (meta.source === 'boot' || wentUp) {
      if (wentUp) {
        const parent = parentRoute(targetRoute);
        if (parent && routeLayer(parent) !== 'list') {
          restoreScroll(parent);
        }
      }
      focusHeading(topLayer);
    } else if (targetChain.length > currentChain.length) {
      focusHeading(topLayer);
    }
  }

  function applyEntryRouteChange(newRoute) {
    const ctx = buildCtx(newRoute);
    const targetChain = getLayerChain(newRoute);

    if (targetChain.includes('exercise') && !state.mountedLayers.includes('exercise')) {
      if (!state.mountedLayers.includes('workbook')) {
        mountLayer('workbook', ctx);
        state.mountedLayers.push('workbook');
      }
      mountLayer('exercise', ctx);
      state.mountedLayers.push('exercise');
      focusHeading('exercise');
    } else if (state.mountedLayers.includes('exercise')) {
      layers.exercise.mount(ctx);
    }

    state.route = newRoute;
    onRouteChange?.(newRoute, { source: 'internal', entryChange: true });
  }

  function wireEntryChange() {
    const unsub = onWorkbookEntryChange(({ workbookId, exerciseId }) => {
      const route = state.route;
      if (!route.routine || !route.workbook || route.workbook !== workbookId) return;
      const layer = routeLayer(route);
      if (layer !== 'workbook' && layer !== 'exercise') return;

      const newRoute = {
        ...route,
        exercise: exerciseId,
        companion: null,
      };
      shell.replaceRoute(newRoute);
      applyEntryRouteChange(newRoute);
    });
    if (typeof unsub === 'function') {
      entryChangeUnsub = unsub;
    }
  }

  wireEntryChange();

  const navigator = {
    applyRoute(params, { source } = {}) {
      const parsed = parseRoutineRoute(params);
      const resolved = resolveRoutineRoute(parsed, makeResolveData());
      const { route, dropped, reason } = resolved;

      if (dropped.length > 0) {
        if (reason === 'routine-missing') {
          shell.goHome();
        } else {
          shell.replaceRoute(route);
        }
        showRepairMessage(route, reason);
      } else {
        clearAllStatus();
      }

      if (reason === 'routine-missing') {
        unmountAllLayers(state.route);
        state.route = emptyRoute();
        clearScrollPositions();
        onRouteChange?.(state.route, { source, repair: reason });
        return;
      }

      const targetChain = getLayerChain(route);
      reconcileStack(route, targetChain, { source });
      onRouteChange?.(route, { source, repair: reason });
    },

    open(patch) {
      if (!validateOpenPatch(state.route, patch)) return;

      const merged = { ...state.route };
      for (const key of Object.keys(patch)) {
        if (patch[key]) merged[key] = patch[key];
      }

      const parsed = parseRoutineRoute(buildRoutineParams(merged));
      const resolved = resolveRoutineRoute(parsed, makeResolveData());
      if (resolved.dropped.length > 0) return;

      const newRoute = resolved.route;
      const newChain = getLayerChain(newRoute);
      if (newChain.length === 0) return;

      const newLayer = newChain[newChain.length - 1];
      if (state.mountedLayers.includes(newLayer)) return;

      saveScrollForRoute(state.route);
      shell.pushRoute(newRoute);

      const ctx = buildCtx(newRoute);
      mountLayer(newLayer, ctx);
      state.mountedLayers.push(newLayer);
      state.route = newRoute;

      focusHeading(newLayer);
      onRouteChange?.(newRoute, { source: 'open' });
    },

    back() {
      const parent = parentRoute(state.route);
      if (parent === null) {
        shell.goHome();
        return;
      }
      shell.backToRoute(parent);
    },

    currentRoute() {
      return { ...state.route };
    },

    currentLayer() {
      return routeLayer(state.route);
    },

    destroy() {
      unmountAllLayers(state.route);
      state.route = emptyRoute();
      clearScrollPositions();
      if (entryChangeUnsub) {
        entryChangeUnsub();
        entryChangeUnsub = null;
      }
    },
  };

  return navigator;
}
