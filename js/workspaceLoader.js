/**
 * Load and mount one objective workspace at a time into #workspace-root.
 */

const workspaceLoaders = {
  home: () => import('./workspaces/home.js'),
  train: () => import('./workspaces/train.js'),
  study: () => import('./workspaces/study.js'),
  create: () => import('./workspaces/create.js'),
  settings: () => import('./workspaces/settings.js'),
};

/** @type {Map<string, Promise<object>>} */
const moduleCache = new Map();

let currentId = null;
/** @type {object|null} */
let currentWs = null;
let mountGen = 0;

function loadWorkspaceModule(objective) {
  const loader = workspaceLoaders[objective];
  if (!loader) return Promise.resolve(null);
  if (!moduleCache.has(objective)) {
    moduleCache.set(objective, loader());
  }
  return moduleCache.get(objective);
}

/**
 * @param {object} route
 */
export async function showRoute(route) {
  const objective = route.objective;
  const gen = ++mountGen;
  const container = document.getElementById('workspace-root');
  if (!container) return;

  if (currentId && currentId !== objective && currentWs) {
    currentWs.unmount();
    currentWs = null;
    currentId = null;
  }

  const mod = await loadWorkspaceModule(objective);
  if (!mod || gen !== mountGen) return;

  if (currentId !== objective) {
    await mod.mount(container, route);
    currentWs = mod;
    currentId = objective;
  } else {
    await mod.update(route);
  }
}

/**
 * @returns {string|null}
 */
export function currentWorkspaceId() {
  return currentId;
}
