/**
 * Settings workspace. Adopts sec-musicprefs and mounts preferences UI on demand.
 */

import { adoptSection, releaseAllExcept } from './legacyHost.js';
import { mountFeature, stopFeaturesExcept } from '../featureAdapters.js';

const SECTION_ID = 'sec-musicprefs';
const FEATURE_ID = 'musicprefs';

export const SETTINGS_SECTIONS = {
  default: SECTION_ID,
};

/**
 * @param {Element} container
 * @param {object} route
 */
export async function mount(container, route) {
  void route;
  container.innerHTML = '';
  const viewRegion = document.createElement('div');
  viewRegion.className = 'workspace-view';
  container.appendChild(viewRegion);
  adoptSection(SECTION_ID, viewRegion);
  await mountFeature(FEATURE_ID);
}

/**
 * @param {object} route
 */
export async function update(route) {
  void route;
}

export function unmount() {
  releaseAllExcept([]);
  stopFeaturesExcept([]);
}
