/**
 * Create objective workspace — Projects, Capture, Compose.
 */

import { OBJECTIVES } from '../routes.js';
import { navigate, setParams } from '../router.js';
import { adoptSection, releaseAllExcept } from './legacyHost.js';
import { mountFeature, stopFeaturesExcept } from '../featureAdapters.js';
import { createWorkspaceShell, renderChipRow } from './workspaceShell.js';

export const CREATE_SECTIONS = {
  projects: { sectionId: 'sec-songwriter', featureId: 'songwriter' },
  notes: { sectionId: 'sec-notes', featureId: 'notes' },
  capture: { sectionId: 'sec-recorder', featureId: 'recorder' },
  compose: {
    default: { sectionId: 'sec-chords', featureId: 'chords' },
    keyboard: { sectionId: 'sec-keyboard', featureId: 'keyboard' },
    beats: { sectionId: 'sec-drums', featureId: 'drums' },
    'import-melody': { sectionId: 'sec-tracktosheet', featureId: 'tracktosheet' },
  },
};

const VIEW_LABELS = [
  { id: 'projects', label: 'Projects' },
  { id: 'capture', label: 'Capture' },
  { id: 'compose', label: 'Compose' },
];

const COMPOSE_CHIPS = [
  { id: 'chords', label: 'Chord Builder' },
  { id: 'keyboard', label: 'Keyboard' },
  { id: 'beats', label: 'Beats' },
  { id: 'import-melody', label: 'Import Melody', beta: true },
];

let shellApi = null;
let viewRegion = null;
let activeFeatureIds = [];

function defaultView() {
  return OBJECTIVES.find((o) => o.id === 'create')?.defaultView || 'projects';
}

function effectiveView(route) {
  return route.view || defaultView();
}

function resolveProjects(route) {
  if (route.params?.view === 'notes') return CREATE_SECTIONS.notes;
  return CREATE_SECTIONS.projects;
}

function resolveCompose(route) {
  if (route.params?.panel === 'keyboard') return CREATE_SECTIONS.compose.keyboard;
  const view = route.params?.view;
  if (view === 'import-melody') return CREATE_SECTIONS.compose['import-melody'];
  if (view === 'beats') return CREATE_SECTIONS.compose.beats;
  return CREATE_SECTIONS.compose.default;
}

function activeComposeChip(route) {
  if (route.params?.panel === 'keyboard') return 'keyboard';
  const view = route.params?.view;
  if (view === 'import-melody') return 'import-melody';
  if (view === 'beats') return 'beats';
  return 'chords';
}

async function paintView(route) {
  const view = effectiveView(route);
  shellApi?.updateTabs(view);
  releaseAllExcept([]);
  activeFeatureIds = [];
  viewRegion.innerHTML = '';

  if (view === 'capture') {
    const mapping = CREATE_SECTIONS.capture;
    const featureHost = document.createElement('div');
    featureHost.className = 'workspace-feature-host';
    viewRegion.appendChild(featureHost);
    adoptSection(mapping.sectionId, featureHost);
    activeFeatureIds = [mapping.featureId];
    await mountFeature(mapping.featureId);
    stopFeaturesExcept(activeFeatureIds);
    return;
  }

  if (view === 'projects') {
    const mapping = resolveProjects(route);
    const featureHost = document.createElement('div');
    featureHost.className = 'workspace-feature-host';
    viewRegion.appendChild(featureHost);
    adoptSection(mapping.sectionId, featureHost);
    activeFeatureIds = [mapping.featureId];
    await mountFeature(mapping.featureId);
    stopFeaturesExcept(activeFeatureIds);
    return;
  }

  if (view === 'compose') {
    const chipId = activeComposeChip(route);
    renderChipRow(viewRegion, COMPOSE_CHIPS, chipId, (id) => {
      if (id === 'keyboard') setParams({ panel: 'keyboard', view: null });
      else if (id === 'import-melody') setParams({ view: 'import-melody', panel: null });
      else if (id === 'beats') setParams({ view: 'beats', panel: null });
      else setParams({ view: null, panel: null });
    });
    const mapping = resolveCompose(route);
    const featureHost = document.createElement('div');
    featureHost.className = 'workspace-feature-host';
    viewRegion.appendChild(featureHost);
    adoptSection(mapping.sectionId, featureHost);
    activeFeatureIds = [mapping.featureId];
    await mountFeature(mapping.featureId);
    stopFeaturesExcept(activeFeatureIds);
  }
}

/**
 * @param {Element} container
 * @param {object} route
 */
export async function mount(container, route) {
  const view = effectiveView(route);
  shellApi = createWorkspaceShell(container, {
    label: 'Create',
    views: VIEW_LABELS,
    currentView: view,
    onTabSelect: (id) => navigate({ objective: 'create', view: id, params: {} }),
  });
  viewRegion = shellApi.viewRegion;
  await paintView(route);
}

/**
 * @param {object} route
 */
export async function update(route) {
  await paintView(route);
}

export function unmount() {
  releaseAllExcept([]);
  stopFeaturesExcept([]);
  shellApi = null;
  viewRegion = null;
  activeFeatureIds = [];
}
