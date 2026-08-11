/**
 * Study objective workspace. Learn, Explore, and Review.
 */

import { OBJECTIVES } from '../routes.js';
import { navigate, setParams } from '../router.js';
import { adoptSection, releaseAllExcept } from './legacyHost.js';
import { mountFeature, stopFeaturesExcept } from '../featureAdapters.js';
import { createWorkspaceShell, renderChipRow } from './workspaceShell.js';
import { dueStudyReviews, logAttempt, recordStudyMiss } from '../progress/progressLog.js';
import { getStudyProgress, knownConcepts } from '../studyProgress.js';
import { STUDY_CATALOG, getStudyById, studiesForConcept } from '../studyCatalog.js';
import { buildRecommendations } from '../studyRecommendations.js';
import { getMusicContext, setMusicContext, subscribeMusicContext } from '../core/musicContext.js';
import { mountInspector } from '../core/musicInspector.js';
import { getSetting } from '../persistence.js';
import { ROOTS } from '../theory.js';
import { SCALES } from '../scales.js';
import { TUNING_CATALOG } from '../tunings.js';
import { conceptLabel, CONCEPTS } from '../genreProfiles.js';
import {
  getMusicProfile,
  setStudyBalance,
  toggleExclusion,
  toggleApplication,
  STUDY_BALANCES,
  APPLICATION_PREFS,
} from '../musicProfile.js';

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

export const HARMONY_EXPLORE_VIEWS = ['chords', 'triads', 'circle'];

const HARMONY_CHIPS = [
  { id: 'chords', label: 'Chords' },
  { id: 'triads', label: 'Triads' },
  { id: 'circle', label: 'Circle' },
];

const VIEW_LABELS = [
  { id: 'learn', label: 'Learn' },
  { id: 'explore', label: 'Explore' },
  { id: 'review', label: 'Review' },
];

const EXPLORE_CARDS = [
  { id: 'scales', label: 'Scales and Modes' },
  { id: 'harmony', label: 'Harmony', targetView: 'chords' },
  { id: 'fretboard', label: 'Fretboard Map' },
];

const PATH_PICKER_ORDER = [
  'major-scale-construction',
  ...STUDY_CATALOG.map((s) => s.id).filter((id) => id !== 'major-scale-construction'),
];

let shellApi = null;
let viewRegion = null;
let activeFeatureIds = [];
let contextUnsub = null;
let inspectorApi = null;
let currentRoute = null;
let remountExplore = null;
let reviewState = null;

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

export function resolveHarmonyExploreView(view) {
  if (HARMONY_EXPLORE_VIEWS.includes(view)) return view;
  return 'chords';
}

export function harmonySectionForView(view) {
  const resolved = resolveHarmonyExploreView(view);
  return STUDY_SECTIONS.explore[resolved];
}

/**
 * Pure learn-path model for tests and the Learn header.
 * @param {{ progress?: object, recommendations?: object }} [fixtures]
 */
export function buildLearnModel(fixtures = {}) {
  const progress = fixtures.progress || getStudyProgress();
  const recs = fixtures.recommendations || buildRecommendations({ limit: 2 });
  const activeId = progress.lastPrimaryId;
  const activeStudy = activeId ? getStudyById(activeId) : null;
  const paths = PATH_PICKER_ORDER
    .map((id) => getStudyById(id))
    .filter(Boolean)
    .map((study) => ({ id: study.id, title: study.title, summary: study.summary }));

  const recommendedNext = recs.primary
    && recs.primary.id !== activeId
    ? recs.primary
    : recs.alternates?.[0] || recs.primary || null;

  if (!activeStudy) {
    return {
      mode: 'picker',
      paths,
      recommendedNext,
      position: 0,
      total: paths.length,
    };
  }

  const position = Math.max(1, PATH_PICKER_ORDER.indexOf(activeStudy.id) + 1);
  return {
    mode: 'active',
    activePath: {
      id: activeStudy.id,
      title: activeStudy.title,
      summary: activeStudy.summary,
    },
    position,
    total: paths.length,
    recommendedNext,
    paths,
  };
}

/**
 * @param {number} [now]
 * @param {{ due?: object[], progress?: object }} [fixtures]
 */
export function buildReviewQueue(now = Date.now(), fixtures = {}) {
  const due = fixtures.due || dueStudyReviews(now);
  const progress = fixtures.progress || getStudyProgress();
  const items = [];
  const seen = new Set();

  due.forEach((entry) => {
    items.push({
      conceptId: entry.conceptId,
      reason: 'due',
      priority: 0,
      dueSince: entry.dueSince,
      label: conceptLabel(entry.conceptId),
      prompt: buildConceptPrompt(entry.conceptId),
    });
    seen.add(entry.conceptId);
  });

  Object.entries(progress.concepts || {}).forEach(([conceptId, row]) => {
    if (seen.has(conceptId)) return;
    const misses = row.misses || 0;
    const hintHeavy = row.hintHeavy || 0;
    if (misses > 0 || hintHeavy >= 2) {
      items.push({
        conceptId,
        reason: misses > 0 ? 'misses' : 'hints',
        priority: misses > 0 ? 1 : 2,
        label: conceptLabel(conceptId),
        prompt: buildConceptPrompt(conceptId),
      });
      seen.add(conceptId);
    }
  });

  items.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.label.localeCompare(b.label);
  });

  const known = knownConcepts(progress, 1);
  const retention = {
    known: known.size,
    tracked: Object.keys(progress.concepts || {}).length,
    due: due.length,
  };

  return {
    items,
    empty: items.length === 0,
    retention,
    now,
  };
}

/**
 * Pure review-settings model for tests and the Review panel.
 * @param {{ profile?: object }} [fixtures]
 */
export function buildReviewSettingsModel(fixtures = {}) {
  const profile = fixtures.profile ?? getMusicProfile();
  const ids = new Set(STUDY_CATALOG.flatMap((s) => s.concepts));
  profile.exclusions.forEach((id) => ids.add(id));
  const pauseChoices = [...ids]
    .filter((id) => CONCEPTS[id])
    .sort((a, b) => conceptLabel(a).localeCompare(conceptLabel(b)))
    .slice(0, 36)
    .map((id) => ({
      id,
      label: conceptLabel(id),
      paused: profile.exclusions.includes(id),
    }));

  return {
    balance: profile.balance,
    exclusions: [...profile.exclusions],
    applications: [...profile.applications],
    pauseChoices,
  };
}

function renderReviewSettings(host) {
  const model = buildReviewSettingsModel();
  const panel = document.createElement('section');
  panel.className = 'study-review-settings';
  panel.setAttribute('aria-labelledby', 'study-review-settings-title');
  panel.innerHTML = `
    <h3 class="study-review-settings-title" id="study-review-settings-title">Review settings</h3>
    <p class="study-review-settings-help">Tune review emphasis, paused topics, and how theory connects to practice.</p>
  `;

  const balanceBlock = document.createElement('div');
  balanceBlock.className = 'study-review-settings-block';
  balanceBlock.innerHTML = '<div class="study-review-settings-label">Review emphasis</div>';
  const balanceRow = document.createElement('div');
  balanceRow.className = 'study-review-balance';
  balanceRow.setAttribute('role', 'group');
  balanceRow.setAttribute('aria-label', 'Review emphasis');
  STUDY_BALANCES.forEach((b) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `study-review-balance-btn${model.balance === b.id ? ' on' : ''}`;
    btn.textContent = b.label;
    btn.title = b.description;
    btn.onclick = () => {
      setStudyBalance(b.id);
      renderReviewSettings(host);
      notifyStudyProfileChanged();
    };
    balanceRow.appendChild(btn);
  });
  balanceBlock.appendChild(balanceRow);
  panel.appendChild(balanceBlock);

  const appsBlock = document.createElement('div');
  appsBlock.className = 'study-review-settings-block';
  appsBlock.innerHTML = '<div class="study-review-settings-label">Application focus</div>';
  const appsRow = document.createElement('div');
  appsRow.className = 'study-review-chips';
  appsRow.setAttribute('role', 'group');
  appsRow.setAttribute('aria-label', 'Application focus');
  APPLICATION_PREFS.forEach((app) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `study-review-chip${model.applications.includes(app.id) ? ' on' : ''}`;
    btn.textContent = app.label;
    btn.onclick = () => {
      toggleApplication(app.id);
      renderReviewSettings(host);
      notifyStudyProfileChanged();
    };
    appsRow.appendChild(btn);
  });
  appsBlock.appendChild(appsRow);
  panel.appendChild(appsBlock);

  const pauseBlock = document.createElement('div');
  pauseBlock.className = 'study-review-settings-block';
  pauseBlock.innerHTML = '<div class="study-review-settings-label">Paused topics</div>';
  const pauseRow = document.createElement('div');
  pauseRow.className = 'study-review-chips study-review-chips--pause';
  pauseRow.setAttribute('role', 'group');
  pauseRow.setAttribute('aria-label', 'Paused topics');
  model.pauseChoices.forEach((choice) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `study-review-chip study-review-chip--pause${choice.paused ? ' on' : ''}`;
    btn.textContent = choice.label;
    btn.title = choice.paused ? 'Click to resume' : 'Click to pause';
    btn.onclick = () => {
      toggleExclusion(choice.id);
      renderReviewSettings(host);
      notifyStudyProfileChanged();
    };
    pauseRow.appendChild(btn);
  });
  pauseBlock.appendChild(pauseRow);
  panel.appendChild(pauseBlock);

  host.replaceChildren(panel);
}

function notifyStudyProfileChanged() {
  try {
    window.dispatchEvent(new CustomEvent('musi:profile-changed'));
  } catch (_) { /* ignore */ }
}

function buildConceptPrompt(conceptId) {
  const studies = studiesForConcept(conceptId);
  const study = studies[0];
  if (study?.focus?.length) {
    return study.focus[0];
  }
  return `Explain ${conceptLabel(conceptId).toLowerCase()} in your own words.`;
}

function tuningIdToLegacyName(tuningId) {
  const preset = TUNING_CATALOG.find((p) => p.id === tuningId);
  return preset?.legacyKeys?.[0] || preset?.name || 'Standard';
}

function renderExploreGrid(host) {
  host.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'concept-grid study-explore-grid';
  EXPLORE_CARDS.forEach((card) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'concept-card';
    btn.innerHTML = `<span class="concept-card-title">${escapeHtml(card.label)}</span>`;
    btn.onclick = () => setParams({ view: card.targetView || card.id });
    grid.appendChild(btn);
  });
  host.appendChild(grid);
}

function renderSetupStrip(host, route, onChange) {
  const ctx = getMusicContext();
  const strip = document.createElement('div');
  strip.className = 'study-setup-strip';
  strip.setAttribute('role', 'region');
  strip.setAttribute('aria-label', 'Explore setup');
  strip.innerHTML = `
    <label class="study-setup-field">
      <span class="study-setup-label">Root</span>
      <select id="study-setup-root" class="study-setup-select"></select>
    </label>
    <label class="study-setup-field">
      <span class="study-setup-label">Scale</span>
      <select id="study-setup-scale" class="study-setup-select"></select>
    </label>
    <label class="study-setup-field">
      <span class="study-setup-label">Tuning</span>
      <select id="study-setup-tuning" class="study-setup-select"></select>
    </label>
    <label class="study-setup-field">
      <span class="study-setup-label">Spelling</span>
      <select id="study-setup-acc" class="study-setup-select">
        <option value="sharps">Sharps</option>
        <option value="flats">Flats</option>
      </select>
    </label>
  `;
  host.appendChild(strip);

  const rootSel = strip.querySelector('#study-setup-root');
  const scaleSel = strip.querySelector('#study-setup-scale');
  const tuningSel = strip.querySelector('#study-setup-tuning');
  const accSel = strip.querySelector('#study-setup-acc');

  ROOTS.forEach((r) => {
    const opt = document.createElement('option');
    opt.value = r;
    opt.textContent = r;
    if (r === ctx.root) opt.selected = true;
    rootSel.appendChild(opt);
  });

  Object.keys(SCALES).forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (name === ctx.scaleId) opt.selected = true;
    scaleSel.appendChild(opt);
  });

  TUNING_CATALOG.forEach((preset) => {
    const opt = document.createElement('option');
    opt.value = preset.id;
    opt.textContent = preset.name;
    if (preset.id === ctx.tuningId) opt.selected = true;
    tuningSel.appendChild(opt);
  });

  accSel.value = ctx.keySignaturePreference;

  const apply = () => {
    const patch = {
      root: rootSel.value,
      scaleId: scaleSel.value,
      tuningId: tuningSel.value,
      keySignaturePreference: accSel.value,
    };
    setMusicContext(patch, 'study-explore');
    onChange?.(patch, route);
    updateExploreInspector(route);
  };

  rootSel.onchange = apply;
  scaleSel.onchange = apply;
  tuningSel.onchange = apply;
  accSel.onchange = apply;

  return strip;
}

function exploreSelectionForRoute(route) {
  const ctx = getMusicContext();
  const view = route.params?.view;
  if (view === 'chords') {
    const quality = getSetting('chordref.chord', 'Major');
    const root = getSetting('chordref.root', ctx.root, ROOTS);
    return { kind: 'chord', root, quality };
  }
  if (view === 'triads') {
    const root = getSetting('triadref.root', ctx.root, ROOTS);
    return { kind: 'chord', root, quality: 'Major Triad' };
  }
  if (view === 'circle' || view === 'scales' || view === 'fretboard' || !view) {
    return { kind: 'scale', root: ctx.root, scaleId: ctx.scaleId };
  }
  return { kind: 'scale', root: ctx.root, scaleId: ctx.scaleId };
}

function updateExploreInspector(route) {
  if (!inspectorApi) return;
  inspectorApi.update(exploreSelectionForRoute(route));
}

function renderLearnPathHeader(host) {
  const model = buildLearnModel();
  const header = document.createElement('div');
  header.className = 'study-learn-header';

  if (model.mode === 'picker') {
    header.innerHTML = `
      <div class="study-learn-kicker">Choose a path</div>
      <h3 class="study-learn-title">Start with foundation material</h3>
      <p class="study-learn-body">Major-Scale Construction is the recommended first path. Pick any study to open Study Lab.</p>
    `;
    const list = document.createElement('div');
    list.className = 'study-path-picker';
    model.paths.forEach((path, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'study-path-card' + (path.id === 'major-scale-construction' ? ' featured' : '');
      btn.innerHTML = `
        <span class="study-path-index">${idx + 1}</span>
        <span class="study-path-title">${escapeHtml(path.title)}</span>
        <span class="study-path-summary">${escapeHtml(path.summary)}</span>
      `;
      btn.onclick = async () => {
        const { startStudyLab } = await import('../studyLab.js');
        startStudyLab(path.id);
        renderLearnPathHeader(host);
      };
      list.appendChild(btn);
    });
    host.appendChild(header);
    host.appendChild(list);
    if (model.recommendedNext) {
      const rec = document.createElement('p');
      rec.className = 'study-learn-rec';
      rec.textContent = `Recommended next: ${model.recommendedNext.title}`;
      host.appendChild(rec);
    }
    return;
  }

  header.innerHTML = `
    <div class="study-learn-kicker">Path ${model.position} of ${model.total}</div>
    <h3 class="study-learn-title">${escapeHtml(model.activePath.title)}</h3>
    <p class="study-learn-body">${escapeHtml(model.activePath.summary)}</p>
    ${model.recommendedNext ? `<p class="study-learn-rec">Next up: ${escapeHtml(model.recommendedNext.title)}</p>` : ''}
  `;
  host.appendChild(header);
}

function renderReview(host) {
  const queue = buildReviewQueue();
  reviewState = {
    queue,
    index: 0,
    active: false,
  };

  host.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'study-review';

  const summary = document.createElement('div');
  summary.className = 'study-review-summary';
  summary.innerHTML = `
    <article class="objective-card">
      <div class="objective-card-kicker">Retention</div>
      <h3 class="objective-card-title">${queue.retention.known} known · ${queue.retention.due} due</h3>
      <p class="objective-card-body">${queue.retention.tracked} concepts tracked in your study history.</p>
    </article>
  `;
  wrap.appendChild(summary);

  const settingsHost = document.createElement('div');
  settingsHost.className = 'study-review-settings-host';
  settingsHost.id = 'study-review-settings-host';
  wrap.appendChild(settingsHost);
  renderReviewSettings(settingsHost);

  const panel = document.createElement('div');
  panel.className = 'study-review-panel';
  panel.id = 'study-review-panel';
  wrap.appendChild(panel);

  if (queue.empty) {
    panel.innerHTML = `
      <div class="study-review-empty">
        <h3>All caught up</h3>
        <p>No study reviews due right now. Complete a Study Lab path or explore harmony to build history.</p>
      </div>
    `;
  } else {
    const startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.className = 'btn primary study-review-start';
    startBtn.textContent = `Start review (${queue.items.length})`;
    startBtn.onclick = () => {
      reviewState.active = true;
      reviewState.index = 0;
      paintReviewStep(panel);
    };
    panel.appendChild(startBtn);
  }

  const inspectorHost = document.createElement('div');
  inspectorHost.className = 'study-inspector-host';
  wrap.appendChild(inspectorHost);

  const localInspector = mountInspector(inspectorHost, {
    onNavigate: (hash) => navigate(hash),
    getContext: () => getMusicContext(),
  });

  host.appendChild(wrap);

  if (!queue.empty && queue.items[0]) {
    localInspector.update({ kind: 'concept', conceptId: queue.items[0].conceptId });
  }

  inspectorApi = localInspector;
}

function paintReviewStep(panel) {
  const { queue, index, active } = reviewState;
  if (!active || !queue.items.length) return;

  const item = queue.items[index];
  if (!item) {
    panel.innerHTML = `
      <div class="study-review-empty">
        <h3>Review complete</h3>
        <p>Nice work — ${queue.items.length} concept${queue.items.length === 1 ? '' : 's'} checked.</p>
      </div>
    `;
    reviewState.active = false;
    return;
  }

  panel.innerHTML = `
    <div class="study-review-step">
      <div class="study-review-progress">${index + 1} / ${queue.items.length}</div>
      <h3 class="study-review-concept">${escapeHtml(item.label)}</h3>
      <p class="study-review-prompt">${escapeHtml(item.prompt)}</p>
      <div class="study-review-outcomes" role="group" aria-label="How well did you recall this?">
        <button type="button" class="btn study-outcome study-outcome--green" data-status="green">Solid</button>
        <button type="button" class="btn study-outcome study-outcome--yellow" data-status="yellow">Shaky</button>
        <button type="button" class="btn study-outcome study-outcome--red" data-status="red">Missed</button>
      </div>
    </div>
  `;

  panel.querySelectorAll('.study-outcome').forEach((btn) => {
    btn.onclick = () => {
      const status = btn.dataset.status;
      if (status === 'red') {
        recordStudyMiss(item.conceptId, {
          kind: 'miss',
          prompt: item.prompt,
          answer: item.label,
          responseMs: 0,
        });
      } else {
        logAttempt({
          targetType: 'study-concept',
          targetId: item.conceptId,
          status,
          notes: item.prompt,
        });
      }
      reviewState.index += 1;
      reviewState.queue = buildReviewQueue();
      paintReviewStep(panel);
    };
  });
}

function resolveExplore(route) {
  const view = route.params?.view;
  if (!view) return null;
  if (view === 'harmony') return STUDY_SECTIONS.explore.chords;
  return STUDY_SECTIONS.explore[view] || null;
}


async function paintExplore(route) {
  const mapping = resolveExplore(route);
  const layout = document.createElement('div');
  layout.className = 'study-explore-layout';

  const top = document.createElement('div');
  top.className = 'study-explore-top';
  layout.appendChild(top);

  let needsRemount = false;
  renderSetupStrip(top, route, async (patch) => {
    if ('tuningId' in patch) needsRemount = true;
    if (needsRemount && remountExplore) await remountExplore();
  });

  if (mapping && HARMONY_EXPLORE_VIEWS.includes(route.params?.view)) {
    const chipHost = document.createElement('div');
    chipHost.className = 'study-harmony-chips';
    renderChipRow(chipHost, HARMONY_CHIPS, route.params.view, (id) => setParams({ view: id }));
    top.appendChild(chipHost);
  }

  const body = document.createElement('div');
  body.className = 'study-explore-body';
  layout.appendChild(body);

  const featureHost = document.createElement('div');
  featureHost.className = 'workspace-feature-host';
  body.appendChild(featureHost);

  const inspectorHost = document.createElement('div');
  inspectorHost.className = 'study-inspector-host study-inspector-host--explore';
  layout.appendChild(inspectorHost);

  viewRegion.appendChild(layout);

  if (!mapping) {
    renderExploreGrid(body);
    stopFeaturesExcept([]);
    inspectorApi = mountInspector(inspectorHost, {
      onNavigate: (hash) => navigate(hash),
      getContext: () => getMusicContext(),
    });
    inspectorApi.update(exploreSelectionForRoute(route));
    remountExplore = null;
    return;
  }

  adoptSection(mapping.sectionId, featureHost);
  activeFeatureIds = [mapping.featureId];
  await mountFeature(mapping.featureId);
  stopFeaturesExcept(activeFeatureIds);

  if (inspectorApi) inspectorApi.destroy();
  inspectorApi = mountInspector(inspectorHost, {
    onNavigate: (hash) => navigate(hash),
    getContext: () => getMusicContext(),
  });
  updateExploreInspector(route);

  remountExplore = async () => {
    const r = currentRoute;
    if (!r) return;
    stopFeaturesExcept([]);
    releaseAllExcept([]);
    viewRegion.innerHTML = '';
    await paintView(r);
  };
}

async function paintView(route) {
  currentRoute = route;
  const view = effectiveView(route);
  shellApi?.updateTabs(view);
  releaseAllExcept([]);
  activeFeatureIds = [];
  viewRegion.innerHTML = '';

  if (contextUnsub) {
    contextUnsub();
    contextUnsub = null;
  }

  if (inspectorApi) {
    inspectorApi.destroy();
    inspectorApi = null;
  }

  if (view === 'review') {
    renderReview(viewRegion);
    stopFeaturesExcept([]);
    return;
  }

  if (view === 'learn') {
    const learnWrap = document.createElement('div');
    learnWrap.className = 'study-learn';
    const pathHeader = document.createElement('div');
    pathHeader.className = 'study-learn-path';
    learnWrap.appendChild(pathHeader);
    renderLearnPathHeader(pathHeader);

    const model = buildLearnModel();
    if (model.mode === 'picker') {
      viewRegion.appendChild(learnWrap);
      stopFeaturesExcept([]);
      return;
    }

    const mapping = STUDY_SECTIONS.learn;
    const featureHost = document.createElement('div');
    featureHost.className = 'workspace-feature-host';
    learnWrap.appendChild(featureHost);
    viewRegion.appendChild(learnWrap);

    adoptSection(mapping.sectionId, featureHost);
    activeFeatureIds = [mapping.featureId];
    await mountFeature(mapping.featureId);
    stopFeaturesExcept(activeFeatureIds);

    const inspectorHost = document.createElement('div');
    inspectorHost.className = 'study-inspector-host';
    learnWrap.appendChild(inspectorHost);
    const study = getStudyById(model.activePath.id);
    const conceptId = study?.concepts?.[0];
    inspectorApi = mountInspector(inspectorHost, {
      onNavigate: (hash) => navigate(hash),
      getContext: () => getMusicContext(),
    });
    if (conceptId) inspectorApi.update({ kind: 'concept', conceptId });
    return;
  }

  if (view === 'explore') {
    contextUnsub = subscribeMusicContext(() => {
      updateExploreInspector(route);
    });
    await paintExplore(route);
    return;
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
  if (contextUnsub) {
    contextUnsub();
    contextUnsub = null;
  }
  if (inspectorApi) {
    inspectorApi.destroy();
    inspectorApi = null;
  }
  releaseAllExcept([]);
  stopFeaturesExcept([]);
  shellApi = null;
  viewRegion = null;
  activeFeatureIds = [];
  currentRoute = null;
  remountExplore = null;
  reviewState = null;
}
