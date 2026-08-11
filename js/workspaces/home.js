/**
 * Home objective workspace. Adopts sec-home and renders objective cards.
 */

import { adoptSection, releaseAllExcept } from './legacyHost.js';
import { initHome, refreshHome } from '../home.js';
import { renderStats } from '../stats.js';
import { navigate } from '../router.js';

const SECTION_ID = 'sec-home';
let viewRegion = null;
let homeInited = false;

function effectiveView(route) {
  return route.view || null;
}

function wireHome() {
  if (homeInited) return;
  initHome({
    showSection: (id) => {
      if (typeof window !== 'undefined' && window.showSection) window.showSection(id);
    },
    showHub: (cat) => {
      if (typeof window !== 'undefined' && window.showHub) window.showHub(cat);
    },
    navigate: (target) => navigate(target),
  });
  homeInited = true;
}

/**
 * @param {Element} container
 * @param {object} route
 */
export async function mount(container, route) {
  wireHome();
  container.innerHTML = '';
  viewRegion = document.createElement('div');
  viewRegion.className = 'workspace-view workspace-view-home';
  container.appendChild(viewRegion);
  adoptSection(SECTION_ID, viewRegion);
  renderStats();
  refreshHome();
}

/**
 * @param {object} route
 */
export async function update(route) {
  void effectiveView(route);
  renderStats();
  refreshHome();
}

export function unmount() {
  releaseAllExcept([]);
  viewRegion = null;
}
