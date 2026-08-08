import { getSetting, saveSetting } from '../persistence.js';

export const GPP_VIEW_MODES = ['score', 'analyze', 'split'];
export const GPP_VIEW_SETTING = 'gpp.viewMode';

export function loadViewMode() {
  return getSetting(GPP_VIEW_SETTING, 'score', GPP_VIEW_MODES);
}

export function persistViewMode(mode) {
  if (GPP_VIEW_MODES.includes(mode)) saveSetting(GPP_VIEW_SETTING, mode);
}

export function viewModeNeedsAnalysis(mode) {
  return mode === 'analyze' || mode === 'split';
}

/**
 * @param {HTMLElement} root `.gpp-root`
 * @param {'score'|'analyze'|'split'} mode
 */
export function applyViewModeClasses(root, mode) {
  if (!root) return;
  root.dataset.view = mode;
  root.classList.remove('gpp-view-score', 'gpp-view-analyze', 'gpp-view-split');
  root.classList.add(`gpp-view-${mode}`);
}
