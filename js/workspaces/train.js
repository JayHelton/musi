/**
 * Train objective workspace — Today, Plans, Library, Fundamentals, Progress.
 */

import { OBJECTIVES } from '../routes.js';
import { navigate, setParams } from '../router.js';
import { adoptSection, releaseAllExcept } from './legacyHost.js';
import { mountFeature, stopFeaturesExcept } from '../featureAdapters.js';
import { createWorkspaceShell, renderChipRow } from './workspaceShell.js';
import { listRoutines } from '../routineModel.js';
import { getStatsSnapshot } from '../stats.js';
import { listAttempts, dueColdTests } from '../progress/progressLog.js';

export const TRAIN_SECTIONS = {
  plans: { sectionId: 'sec-routines', featureId: 'routines' },
  library: {
    exercise: { sectionId: 'sec-exercises', featureId: 'exercises' },
    workbook: { sectionId: 'sec-workbooks', featureId: 'workbooks' },
    drums: { sectionId: 'sec-drums', featureId: 'drums' },
    gp: { sectionId: 'sec-gpplayer', featureId: 'gpplayer' },
  },
  fundamentals: {
    scales: { sectionId: 'sec-scales', featureId: 'scales' },
    intervals: { sectionId: 'sec-intervals', featureId: 'intervals' },
    sightreading: { sectionId: 'sec-sightreading', featureId: 'sightreading' },
    fretboard: { sectionId: 'sec-fretboard', featureId: 'fretboard' },
    'chord-workout': { sectionId: 'sec-chordlab', featureId: 'chordlab' },
    pitch: { sectionId: 'sec-tuner', featureId: 'tuner' },
    ear: { sectionId: 'sec-ear', featureId: 'ear' },
    timing: { sectionId: 'sec-timing', featureId: 'timing' },
  },
};

const VIEW_LABELS = [
  { id: 'today', label: 'Today' },
  { id: 'plans', label: 'Plans' },
  { id: 'library', label: 'Library' },
  { id: 'fundamentals', label: 'Fundamentals' },
  { id: 'progress', label: 'Progress' },
];

const LIBRARY_CHIPS = [
  { id: 'exercise', label: 'Exercises' },
  { id: 'workbook', label: 'Workbooks' },
  { id: 'gp', label: 'Scores' },
  { id: 'drums', label: 'Drums' },
];

const FUNDAMENTAL_GROUPS = [
  {
    label: 'Theory Recall',
    drills: [
      { id: 'scales', label: 'Scale Spelling', route: { drill: 'scales' } },
      { id: 'intervals', label: 'Intervals', route: { drill: 'intervals' } },
    ],
  },
  {
    label: 'Sight Reading',
    drills: [{ id: 'sightreading', label: 'Sight Reading', route: { drill: 'sightreading' } }],
  },
  {
    label: 'Fretboard Drill',
    drills: [{ id: 'fretboard', label: 'Fretboard', route: { drill: 'fretboard' } }],
  },
  {
    label: 'Harmony Practice',
    drills: [{ id: 'chord-workout', label: 'Chord Workout', route: { drill: 'chord-workout' } }],
  },
  {
    label: 'Ear and Pitch',
    drills: [
      { id: 'pitch', label: 'Pitch', route: { drill: 'pitch' } },
      { id: 'ear', label: 'Ear Trainer', route: { drill: 'ear' } },
    ],
  },
  {
    label: 'Rhythm',
    drills: [{ id: 'timing', label: 'Timing', route: { drill: 'timing' } }],
  },
];

let shellApi = null;
let viewRegion = null;
let activeFeatureIds = [];

function defaultView() {
  return OBJECTIVES.find((o) => o.id === 'train')?.defaultView || 'today';
}

function effectiveView(route) {
  return route.view || defaultView();
}

function findActiveRoutineSession() {
  for (const rt of listRoutines()) {
    if (!rt.activeSessionId) continue;
    const session = rt.sessions?.find((s) => s.id === rt.activeSessionId);
    if (session && !session.completed) return { routine: rt, session };
  }
  return null;
}

function findNextRoutine() {
  for (const rt of listRoutines()) {
    const session = rt.sessions?.find((s) => !s.completed);
    if (session) return { routine: rt, session };
  }
  return null;
}

function renderToday(host) {
  const active = findActiveRoutineSession();
  const next = active ? null : findNextRoutine();
  host.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'workspace-cards';

  if (active) {
    card.innerHTML = `
      <article class="objective-card">
        <div class="objective-card-kicker">Active routine</div>
        <h3 class="objective-card-title">${escapeHtml(active.routine.name)}</h3>
        <p class="objective-card-body">Session: ${escapeHtml(active.session.name || 'In progress')}</p>
        <button type="button" class="btn primary" data-action="resume">Resume session</button>
      </article>
    `;
    card.querySelector('[data-action="resume"]')?.addEventListener('click', () => {
      navigate('#train/plans');
    });
  } else if (next) {
    card.innerHTML = `
      <article class="objective-card">
        <div class="objective-card-kicker">Next up</div>
        <h3 class="objective-card-title">${escapeHtml(next.routine.name)}</h3>
        <p class="objective-card-body">${escapeHtml(next.session.name || 'Next session')}</p>
        <button type="button" class="btn primary" data-action="plans">Open plans</button>
      </article>
    `;
    card.querySelector('[data-action="plans"]')?.addEventListener('click', () => {
      navigate('#train/plans');
    });
  } else {
    card.innerHTML = `
      <article class="objective-card">
        <div class="objective-card-kicker">Free practice</div>
        <h3 class="objective-card-title">Start free practice</h3>
        <p class="objective-card-body">Pick a drill or open your library.</p>
        <button type="button" class="btn primary" data-action="free">Start free practice</button>
      </article>
    `;
    card.querySelector('[data-action="free"]')?.addEventListener('click', () => {
      navigate('#train/fundamentals');
    });
  }

  const links = document.createElement('div');
  links.className = 'workspace-quick-links';
  links.innerHTML = `
    <button type="button" class="btn" data-link="plans">Plans</button>
    <button type="button" class="btn" data-link="library">Library</button>
  `;
  links.querySelector('[data-link="plans"]')?.addEventListener('click', () => navigate('#train/plans'));
  links.querySelector('[data-link="library"]')?.addEventListener('click', () => navigate('#train/library'));

  host.appendChild(card);
  host.appendChild(links);
}

function renderProgress(host) {
  const stats = getStatsSnapshot();
  const recent = listAttempts({ limit: 5 });
  const due = dueColdTests();
  host.innerHTML = `
    <div class="workspace-cards">
      <article class="objective-card">
        <div class="objective-card-kicker">Today</div>
        <h3 class="objective-card-title">${stats.minutesToday} min trained</h3>
        <p class="objective-card-body">Accuracy ${stats.accuracy ?? '--'}% · Streak ${stats.currentStreak}</p>
      </article>
      <article class="objective-card">
        <div class="objective-card-kicker">Recent attempts</div>
        <p class="objective-card-body">${recent.length ? `${recent.length} logged` : 'No attempts yet today'}</p>
      </article>
      <article class="objective-card">
        <div class="objective-card-kicker">Due cold tests</div>
        <p class="objective-card-body">${due.length ? `${due.length} due` : 'None due'}</p>
      </article>
    </div>
  `;
}

function renderFundamentalsGrid(host) {
  host.innerHTML = '';
  FUNDAMENTAL_GROUPS.forEach((group) => {
    const section = document.createElement('section');
    section.className = 'drill-group';
    section.innerHTML = `<h3 class="drill-group-title">${escapeHtml(group.label)}</h3>`;
    const grid = document.createElement('div');
    grid.className = 'drill-grid';
    group.drills.forEach((drill) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'drill-card';
      btn.innerHTML = `<span class="drill-card-title">${escapeHtml(drill.label)}</span>`;
      btn.onclick = () => setParams({ drill: drill.route.drill });
      grid.appendChild(btn);
    });
    section.appendChild(grid);
    host.appendChild(section);
  });
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resolveLibrary(route) {
  if (route.params?.player === 'gp') return TRAIN_SECTIONS.library.gp;
  const type = route.params?.type || 'exercise';
  if (type === 'workbook') return TRAIN_SECTIONS.library.workbook;
  if (type === 'drums') return TRAIN_SECTIONS.library.drums;
  return TRAIN_SECTIONS.library.exercise;
}

function resolveFundamentals(route) {
  const drill = route.params?.drill;
  if (!drill) return null;
  return TRAIN_SECTIONS.fundamentals[drill] || null;
}

async function paintView(route) {
  const view = effectiveView(route);
  shellApi?.updateTabs(view);
  releaseAllExcept([]);
  activeFeatureIds = [];
  viewRegion.innerHTML = '';

  if (view === 'today') {
    renderToday(viewRegion);
    stopFeaturesExcept([]);
    return;
  }

  if (view === 'progress') {
    renderProgress(viewRegion);
    stopFeaturesExcept([]);
    return;
  }

  if (view === 'library') {
    const libType = route.params?.player === 'gp' ? 'gp' : (route.params?.type || 'exercise');
    renderChipRow(viewRegion, LIBRARY_CHIPS, libType, (id) => {
      if (id === 'gp') setParams({ player: 'gp', type: null });
      else setParams({ type: id, player: null });
    });
    const mapping = resolveLibrary(route);
    if (mapping) {
      const featureHost = document.createElement('div');
      featureHost.className = 'workspace-feature-host';
      viewRegion.appendChild(featureHost);
      adoptSection(mapping.sectionId, featureHost);
      activeFeatureIds = [mapping.featureId];
      await mountFeature(mapping.featureId);
      stopFeaturesExcept(activeFeatureIds);
    }
    return;
  }

  if (view === 'fundamentals') {
    const mapping = resolveFundamentals(route);
    if (!mapping) {
      renderFundamentalsGrid(viewRegion);
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
    return;
  }

  if (view === 'plans') {
    const mapping = TRAIN_SECTIONS.plans;
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
    label: 'Train',
    views: VIEW_LABELS,
    currentView: view,
    onTabSelect: (id) => navigate({ objective: 'train', view: id, params: {} }),
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
