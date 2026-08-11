/**
 * Study objective workspace — Learn, Explore, Review.
 */

import { OBJECTIVES } from '../routes.js';
import { navigate, setParams } from '../router.js';
import { adoptSection, releaseAllExcept } from './legacyHost.js';
import { mountFeature, stopFeaturesExcept } from '../featureAdapters.js';
import { createWorkspaceShell } from './workspaceShell.js';
import { dueStudyReviews } from '../progress/progressLog.js';
import { getStudyProgress, knownConcepts } from '../studyProgress.js';

export const STUDY_SECTIONS = {
  learn: { sectionId: 'sec-studylab', featureId: 'studylab' },
  explore: {
    scales: { sectionId: 'sec-scaleref', featureId: 'scaleref' },
    chords: { sectionId: 'sec-chords', featureId: 'chords' },
    triads: { sectionId: 'sec-triads', featureId: 'triads' },
    circle: { sectionId: 'sec-circle', featureId: 'circle' },
    fretboard: { sectionId: 'sec-intervalorbit', featureId: 'intervalorbit' },
  },
};

const VIEW_LABELS = [
  { id: 'learn', label: 'Learn' },
  { id: 'explore', label: 'Explore' },
  { id: 'review', label: 'Review' },
];

const EXPLORE_CARDS = [
  { id: 'scales', label: 'Scales and Modes' },
  { id: 'chords', label: 'Harmony' },
  { id: 'triads', label: 'Triads' },
  { id: 'circle', label: 'Circle of Fifths' },
  { id: 'fretboard', label: 'Fretboard Map' },
];

let shellApi = null;
let viewRegion = null;
let activeFeatureIds = [];

function defaultView() {
  return OBJECTIVES.find((o) => o.id === 'study')?.defaultView || 'learn';
}

function effectiveView(route) {
  return route.view || defaultView();
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderExploreGrid(host) {
  host.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'concept-grid';
  EXPLORE_CARDS.forEach((card) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'concept-card';
    btn.innerHTML = `<span class="concept-card-title">${escapeHtml(card.label)}</span>`;
    btn.onclick = () => setParams({ view: card.id });
    grid.appendChild(btn);
  });
  host.appendChild(grid);
}

function renderReview(host) {
  const due = dueStudyReviews();
  const progress = getStudyProgress();
  const concepts = [...knownConcepts(progress, 1)].slice(0, 5);
  host.innerHTML = `
    <div class="workspace-cards">
      <article class="objective-card">
        <div class="objective-card-kicker">Due reviews</div>
        <h3 class="objective-card-title">${due.length ? `${due.length} concepts due` : 'All caught up'}</h3>
        <p class="objective-card-body">${due.length ? 'Review missed or stale concepts.' : 'No study reviews due right now.'}</p>
      </article>
      <article class="objective-card">
        <div class="objective-card-kicker">Recent concepts</div>
        <p class="objective-card-body">${concepts.length ? concepts.join(', ') : 'Complete a Study Lab path to build history.'}</p>
      </article>
    </div>
  `;
}

function resolveExplore(route) {
  const view = route.params?.view;
  if (!view) return null;
  return STUDY_SECTIONS.explore[view] || null;
}

async function paintView(route) {
  const view = effectiveView(route);
  shellApi?.updateTabs(view);
  releaseAllExcept([]);
  activeFeatureIds = [];
  viewRegion.innerHTML = '';

  if (view === 'review') {
    renderReview(viewRegion);
    stopFeaturesExcept([]);
    return;
  }

  if (view === 'learn') {
    const mapping = STUDY_SECTIONS.learn;
    const featureHost = document.createElement('div');
    featureHost.className = 'workspace-feature-host';
    viewRegion.appendChild(featureHost);
    adoptSection(mapping.sectionId, featureHost);
    activeFeatureIds = [mapping.featureId];
    await mountFeature(mapping.featureId);
    stopFeaturesExcept(activeFeatureIds);
    return;
  }

  if (view === 'explore') {
    const mapping = resolveExplore(route);
    if (!mapping) {
      renderExploreGrid(viewRegion);
      stopFeaturesExcept([]);
      return;
    }
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
    label: 'Study',
    views: VIEW_LABELS,
    currentView: view,
    onTabSelect: (id) => navigate({ objective: 'study', view: id, params: {} }),
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
