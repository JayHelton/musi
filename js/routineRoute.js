export const ROUTINE_ROUTE_ID = 'routines';
export const ROUTINE_PARAM_KEYS = ['routine', 'session', 'workbook', 'exercise', 'companion'];

const LAYER_DEPTH = {
  list: 0,
  routine: 1,
  session: 2,
  workbook: 3,
  companion: 3,
  exercise: 4,
};

function emptyRoute() {
  return {
    routine: null,
    session: null,
    workbook: null,
    exercise: null,
    companion: null,
  };
}

function readParam(params, key) {
  const value = params && params[key];
  return typeof value === 'string' && value ? value : null;
}

/**
 * @param {Record<string, string>} params
 * @returns {{ routine: string | null, session: string | null, workbook: string | null, exercise: string | null, companion: string | null }}
 */
export function parseRoutineRoute(params) {
  let routine = readParam(params, 'routine');
  let session = readParam(params, 'session');
  let workbook = readParam(params, 'workbook');
  let exercise = readParam(params, 'exercise');
  let companion = readParam(params, 'companion');

  if (!routine) {
    return emptyRoute();
  }
  if (!session) {
    return { routine, session: null, workbook: null, exercise: null, companion: null };
  }
  if (!workbook) {
    exercise = null;
  }
  if (exercise && companion) {
    companion = null;
  }

  return { routine, session, workbook, exercise, companion };
}

/**
 * @param {{ routine: string | null, session: string | null, workbook: string | null, exercise: string | null, companion: string | null }} route
 * @returns {Record<string, string>}
 */
export function buildRoutineParams(route) {
  const params = {};
  for (const key of ROUTINE_PARAM_KEYS) {
    if (route[key]) params[key] = route[key];
  }
  return params;
}

/**
 * @param {{ routine: string | null, session: string | null, workbook: string | null, exercise: string | null, companion: string | null }} route
 * @returns {'list' | 'routine' | 'session' | 'workbook' | 'companion' | 'exercise'}
 */
export function routeLayer(route) {
  if (!route.routine) return 'list';
  if (!route.session) return 'routine';
  if (route.exercise) return 'exercise';
  if (route.companion) return 'companion';
  if (route.workbook) return 'workbook';
  return 'session';
}

/**
 * @param {{ routine: string | null, session: string | null, workbook: string | null, exercise: string | null, companion: string | null }} route
 * @returns {{ routine: string | null, session: string | null, workbook: string | null, exercise: string | null, companion: string | null } | null}
 */
export function parentRoute(route) {
  switch (routeLayer(route)) {
    case 'list':
      return null;
    case 'routine':
      return emptyRoute();
    case 'session':
      return { routine: route.routine, session: null, workbook: null, exercise: null, companion: null };
    case 'workbook':
      return { routine: route.routine, session: route.session, workbook: null, exercise: null, companion: null };
    case 'companion':
      return { routine: route.routine, session: route.session, workbook: null, exercise: null, companion: null };
    case 'exercise':
      return {
        routine: route.routine,
        session: route.session,
        workbook: route.workbook,
        exercise: null,
        companion: null,
      };
    default:
      return null;
  }
}

/**
 * @param {{ routine: string | null, session: string | null, workbook: string | null, exercise: string | null, companion: string | null }} route
 * @returns {number}
 */
export function routeDepth(route) {
  return LAYER_DEPTH[routeLayer(route)];
}

/**
 * @param {{ routine: string | null, session: string | null, workbook: string | null, exercise: string | null, companion: string | null }} route
 * @param {{
 *   getRoutine: (routineId: string) => object | null,
 *   getSession: (routine: object, sessionId: string) => object | null,
 *   getWorkbook: (workbookId: string) => object | null,
 *   findCompanion: (session: object, companionId: string) => { workbook: object, companion: object } | null,
 * }} data
 * @returns {{ route: object, dropped: string[], reason: string | null }}
 */
export function resolveRoutineRoute(route, data) {
  const { getRoutine, getSession, getWorkbook, findCompanion } = data;

  if (!route.routine) {
    return { route: emptyRoute(), dropped: [], reason: null };
  }

  const routine = getRoutine(route.routine);
  if (!routine) {
    const dropped = ROUTINE_PARAM_KEYS.filter(key => route[key]);
    return { route: emptyRoute(), dropped, reason: 'routine-missing' };
  }

  if (!route.session) {
    return { route: { ...route }, dropped: [], reason: null };
  }

  const session = getSession(routine, route.session);
  if (!session) {
    const dropped = ['session', 'workbook', 'exercise', 'companion'].filter(key => route[key]);
    return {
      route: {
        routine: route.routine,
        session: null,
        workbook: null,
        exercise: null,
        companion: null,
      },
      dropped,
      reason: 'session-missing',
    };
  }

  if (route.workbook) {
    const workbook = getWorkbook(route.workbook);
    if (!workbook) {
      const dropped = ['workbook', 'exercise'].filter(key => route[key]);
      return {
        route: {
          routine: route.routine,
          session: route.session,
          workbook: null,
          exercise: null,
          companion: route.companion,
        },
        dropped,
        reason: 'workbook-missing',
      };
    }

    if (route.exercise) {
      const entries = Array.isArray(workbook.entries) ? workbook.entries : [];
      const found = entries.some(entry => entry && entry.exerciseId === route.exercise);
      if (!found) {
        return {
          route: {
            routine: route.routine,
            session: route.session,
            workbook: route.workbook,
            exercise: null,
            companion: route.companion,
          },
          dropped: ['exercise'],
          reason: 'exercise-missing',
        };
      }
    }
  }

  if (route.companion) {
    const found = findCompanion(session, route.companion);
    if (!found) {
      const dropped = ['companion', 'workbook'].filter(key => route[key]);
      return {
        route: {
          routine: route.routine,
          session: route.session,
          workbook: null,
          exercise: null,
          companion: null,
        },
        dropped,
        reason: 'companion-missing',
      };
    }
  }

  return { route: { ...route }, dropped: [], reason: null };
}
