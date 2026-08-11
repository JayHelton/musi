/**
 * Train objective workspace. Today, Plans, Library, Fundamentals, and Progress.
 */

import { OBJECTIVES } from '../routes.js';
import { navigate, setParams } from '../router.js';
import { adoptSection, releaseAllExcept } from './legacyHost.js';
import { mountFeature, stopFeaturesExcept } from '../featureAdapters.js';
import { createWorkspaceShell, renderChipRow } from './workspaceShell.js';
import { listRoutines, setActiveRoutineSession } from '../routineModel.js';
import { getWorkbook } from '../workbookModel.js';
import { getExercise } from '../exercises.js';
import { getStatsSnapshot } from '../stats.js';
import {
  listAttempts,
  dueColdTests,
  getTargetSummary,
  logAttempt,
} from '../progress/progressLog.js';
import { describeRef } from '../library/libraryService.js';
import {
  startSession,
  endSession,
  resumeSession,
  pauseSession,
  hasActiveSession,
  restoreSession,
  getSession,
  recordAttempt,
  subscribeSession,
} from '../practice/practiceSession.js';
import { mountPracticeBar, isPracticeBarMounted } from '../ui/practiceBar.js';

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

const DRILL_LABELS = Object.fromEntries(
  FUNDAMENTAL_GROUPS.flatMap((g) => g.drills.map((d) => [d.id, d.label])),
);

const STATUS_LABELS = {
  red: 'Needs work',
  yellow: 'Getting there',
  green: 'Solid',
  blue: 'Mastered',
};

let shellApi = null;
let viewRegion = null;
let activeFeatureIds = [];
let lastPaintedView = null;
let lastPaintedSectionId = null;
let practiceBarHost = null;
let practiceBarApi = null;
let sessionUnsub = null;

function defaultView() {
  return OBJECTIVES.find((o) => o.id === 'train')?.defaultView || 'today';
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

function fmtClock(ms) {
  const sec = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtPct(value) {
  if (value == null) return '--';
  return `${Math.round(Number(value) * 100)}%`;
}

/**
 * Expand a routine session workbook list into ordered practice items.
 * @param {object} routine
 * @param {object} session
 * @param {{ getWorkbook?: typeof getWorkbook, getExercise?: typeof getExercise }} [deps]
 */
export function buildSessionItems(routine, session, deps = {}) {
  const wbGet = deps.getWorkbook || getWorkbook;
  const exGet = deps.getExercise || getExercise;
  const items = [];
  const workbookIds = session?.workbookIds || [];
  for (const wbId of workbookIds) {
    const wb = wbGet(wbId);
    if (!wb?.entries?.length) continue;
    for (const entry of wb.entries) {
      const ex = exGet(entry.exerciseId);
      items.push({
        id: `psi-${entry.id}`,
        label: ex?.name || entry.exerciseId,
        targetType: 'exercise',
        targetId: entry.exerciseId,
      });
    }
  }
  return items;
}

function sessionMetronomeFromRoutine(session) {
  const m = session?.metronome || {};
  return {
    bpm: m.bpm ?? 120,
    subdivision: m.subdiv ?? 'quarter',
    beats: m.beats ?? 4,
    accentFirst: m.accentFirst ?? true,
  };
}

function beginRoutineSession(routine, session) {
  const items = buildSessionItems(routine, session);
  startSession({
    sourceType: 'routine-session',
    sourceId: session.id,
    items,
    timerTargetMs: session.durationMin != null ? session.durationMin * 60 * 1000 : null,
    metronome: sessionMetronomeFromRoutine(session),
  });
  setActiveRoutineSession(routine.id, session.id);
  syncPracticeBar();
}

function beginFreePractice() {
  startSession({
    sourceType: 'free',
    sourceId: '',
    items: [],
    timerTargetMs: null,
    metronome: {},
  });
  syncPracticeBar();
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

function resolveTargetLabel(targetType, targetId) {
  if (targetType === 'drill') {
    return DRILL_LABELS[targetId] || `Drill (${targetId})`;
  }
  const refType = targetType === 'workbook-item' ? 'workbook' : targetType;
  if (['exercise', 'workbook', 'routine', 'score'].includes(refType)) {
    return describeRef({ type: refType, id: targetId });
  }
  return `${targetType} (${targetId})`;
}

function openLibraryItem(item) {
  if (!item) return;
  if (item.targetType === 'exercise') {
    navigate({ objective: 'train', view: 'library', params: { type: 'exercise', id: item.targetId } });
    return;
  }
  if (item.targetType === 'score') {
    navigate({ objective: 'train', view: 'library', params: { player: 'gp', id: item.targetId } });
  }
}

function syncPracticeBar() {
  if (!hasActiveSession()) {
    tearDownPracticeBar();
    shellApi?.shell?.classList.remove('train-has-practice-bar');
    return;
  }
  if (!practiceBarHost) {
    practiceBarHost = document.createElement('div');
    practiceBarHost.id = 'practice-bar-host';
    document.body.appendChild(practiceBarHost);
  }
  if (!practiceBarApi) {
    practiceBarApi = mountPracticeBar(practiceBarHost);
  } else {
    practiceBarApi.update();
  }
  shellApi?.shell?.classList.add('train-has-practice-bar');
}

function tearDownPracticeBar() {
  if (practiceBarApi) {
    practiceBarApi.destroy();
    practiceBarApi = null;
  }
  if (practiceBarHost) {
    practiceBarHost.remove();
    practiceBarHost = null;
  }
  shellApi?.shell?.classList.remove('train-has-practice-bar');
}

function renderSessionCockpit(host, session) {
  const item = session.items.find((it) => it.id === session.activeItemId);
  const idx = session.activeItemId
    ? session.items.findIndex((it) => it.id === session.activeItemId)
    : -1;
  const pos = session.items.length && idx >= 0
    ? `Item ${idx + 1} of ${session.items.length}`
    : 'Free practice';
  const sourceLabel = session.sourceType === 'routine-session'
    ? 'Routine session'
    : session.sourceType === 'free'
      ? 'Free practice'
      : session.sourceType;

  const card = document.createElement('article');
  card.className = 'objective-card train-session-card';
  card.innerHTML = `
    <div class="objective-card-kicker">Live session</div>
    <h3 class="objective-card-title">${escapeHtml(sourceLabel)}</h3>
    <p class="objective-card-body train-session-active">
      ${item ? escapeHtml(item.label || item.targetId) : 'No item selected'}
    </p>
    <p class="train-session-meta">${escapeHtml(pos)} · ${fmtClock(session.elapsedMs)}${
      session.timerTargetMs != null ? ` / ${fmtClock(session.timerTargetMs)}` : ''
    }</p>
    <div class="train-session-actions">
      <button type="button" class="btn primary" data-action="resume-pause">
        ${session.status === 'paused' ? 'Resume' : 'Pause'}
      </button>
      <button type="button" class="btn" data-action="end-session">End session</button>
    </div>
  `;

  card.querySelector('[data-action="resume-pause"]')?.addEventListener('click', () => {
    if (session.status === 'paused') resumeSession();
    else pauseSession();
    renderToday(host);
  });
  card.querySelector('[data-action="end-session"]')?.addEventListener('click', () => {
    endSession();
    tearDownPracticeBar();
    renderToday(host);
  });

  if (item) {
    const logSection = document.createElement('div');
    logSection.className = 'train-log-attempt';
    logSection.innerHTML = `
      <h4 class="train-log-title">Log attempt</h4>
      <div class="train-log-fields">
        <label class="train-log-field">BPM
          <input type="number" class="train-log-bpm" min="30" max="300" value="${session.metronome?.bpm ?? 120}">
        </label>
        <label class="train-log-field">Accuracy %
          <input type="number" class="train-log-accuracy" min="0" max="100" placeholder="optional">
        </label>
        <label class="train-log-field train-log-check">
          <input type="checkbox" class="train-log-clean"> Clean take
        </label>
        <label class="train-log-field">Effort
          <select class="train-log-effort">
            <option value="">—</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
          </select>
        </label>
        <label class="train-log-field">Status
          <select class="train-log-status">
            <option value="">—</option>
            <option value="red">Needs work</option>
            <option value="yellow">Getting there</option>
            <option value="green">Solid</option>
            <option value="blue">Mastered</option>
          </select>
        </label>
      </div>
      <button type="button" class="btn primary train-log-submit">Log attempt</button>
    `;
    logSection.querySelector('.train-log-submit')?.addEventListener('click', () => {
      const bpm = Number(logSection.querySelector('.train-log-bpm')?.value);
      const accRaw = logSection.querySelector('.train-log-accuracy')?.value;
      const accuracy = accRaw === '' ? null : Number(accRaw) / 100;
      const cleanTake = !!logSection.querySelector('.train-log-clean')?.checked;
      const effortRaw = logSection.querySelector('.train-log-effort')?.value;
      const effort = effortRaw === '' ? null : Number(effortRaw);
      const status = logSection.querySelector('.train-log-status')?.value || null;
      const partial = {
        targetType: item.targetType,
        targetId: item.targetId,
        bpm: Number.isFinite(bpm) ? bpm : undefined,
        accuracy: accuracy != null && Number.isFinite(accuracy) ? accuracy : null,
        cleanTake: cleanTake || null,
        effort,
        status: status || null,
      };
      if (hasActiveSession()) recordAttempt(partial);
      else logAttempt(partial);
      renderToday(host);
    });
    card.appendChild(logSection);

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'btn train-open-item';
    openBtn.textContent = 'Open in library';
    openBtn.addEventListener('click', () => openLibraryItem(item));
    card.appendChild(openBtn);
  }

  host.appendChild(card);

  const nextItem = idx >= 0 && idx < session.items.length - 1
    ? session.items[idx + 1]
    : null;
  if (nextItem) {
    const nextCard = document.createElement('article');
    nextCard.className = 'objective-card';
    nextCard.innerHTML = `
      <div class="objective-card-kicker">Next up</div>
      <h3 class="objective-card-title">${escapeHtml(nextItem.label || nextItem.targetId)}</h3>
      <button type="button" class="btn" data-action="open-next">Open next item</button>
    `;
    nextCard.querySelector('[data-action="open-next"]')?.addEventListener('click', () => {
      openLibraryItem(nextItem);
    });
    host.appendChild(nextCard);
  }
}

function renderToday(host) {
  host.innerHTML = '';
  const session = getSession();

  if (session) {
    renderSessionCockpit(host, session);
    syncPracticeBar();
  } else {
    const active = findActiveRoutineSession();
    const next = active ? null : findNextRoutine();
    const card = document.createElement('article');
    card.className = 'objective-card';

    if (active) {
      card.innerHTML = `
        <div class="objective-card-kicker">Active routine</div>
        <h3 class="objective-card-title">${escapeHtml(active.routine.name)}</h3>
        <p class="objective-card-body">Session: ${escapeHtml(active.session.name || 'In progress')}</p>
        <button type="button" class="btn primary" data-action="start-session">Start session</button>
      `;
      card.querySelector('[data-action="start-session"]')?.addEventListener('click', () => {
        beginRoutineSession(active.routine, active.session);
        renderToday(host);
      });
    } else if (next) {
      card.innerHTML = `
        <div class="objective-card-kicker">Next up</div>
        <h3 class="objective-card-title">${escapeHtml(next.routine.name)}</h3>
        <p class="objective-card-body">${escapeHtml(next.session.name || 'Next session')}</p>
        <button type="button" class="btn primary" data-action="start-session">Start session</button>
        <button type="button" class="btn" data-action="plans">View plans</button>
      `;
      card.querySelector('[data-action="start-session"]')?.addEventListener('click', () => {
        beginRoutineSession(next.routine, next.session);
        renderToday(host);
      });
      card.querySelector('[data-action="plans"]')?.addEventListener('click', () => {
        navigate('#train/plans');
      });
    } else {
      card.innerHTML = `
        <div class="objective-card-kicker">Free practice</div>
        <h3 class="objective-card-title">Start free practice</h3>
        <p class="objective-card-body">Pick a drill or open your library.</p>
        <button type="button" class="btn primary" data-action="free">Start free practice</button>
      `;
      card.querySelector('[data-action="free"]')?.addEventListener('click', () => {
        beginFreePractice();
        renderToday(host);
      });
    }
    host.appendChild(card);
  }

  const links = document.createElement('div');
  links.className = 'workspace-quick-links';
  links.innerHTML = `
    <button type="button" class="btn" data-link="plans">Plans</button>
    <button type="button" class="btn" data-link="library">Library</button>
  `;
  links.querySelector('[data-link="plans"]')?.addEventListener('click', () => navigate('#train/plans'));
  links.querySelector('[data-link="library"]')?.addEventListener('click', () => navigate('#train/library'));
  host.appendChild(links);
}

/**
 * @param {number} [now]
 */
export function buildProgressModel(now = Date.now()) {
  const stats = getStatsSnapshot();
  const recent = listAttempts({ limit: 8 });
  const due = dueColdTests(now);

  const recentRows = recent.map((att) => {
    const summary = getTargetSummary(att.targetType, att.targetId);
    return {
      id: att.id,
      label: resolveTargetLabel(att.targetType, att.targetId),
      bpm: att.bpm,
      accuracy: att.accuracy,
      status: att.status,
      statusLabel: STATUS_LABELS[att.status] || null,
      startedAt: att.startedAt,
      tempoHistory: summary.tempoHistory.slice(-5),
    };
  });

  const dueRows = due.map((d) => ({
    ...d,
    label: resolveTargetLabel(d.targetType, d.targetId),
    kindLabel: d.kind === '7d' ? '7-day cold test' : '48-hour check',
  }));

  const targetMap = new Map();
  for (const att of listAttempts({})) {
    const key = `${att.targetType}\0${att.targetId}`;
    if (!targetMap.has(key)) {
      const summary = getTargetSummary(att.targetType, att.targetId);
      targetMap.set(key, {
        targetType: att.targetType,
        targetId: att.targetId,
        label: resolveTargetLabel(att.targetType, att.targetId),
        lastAccuracy: summary.lastAccuracy,
        attempts: summary.attempts,
      });
    }
  }
  const weakAreas = [...targetMap.values()]
    .filter((t) => t.lastAccuracy != null && t.attempts >= 2)
    .sort((a, b) => a.lastAccuracy - b.lastAccuracy)
    .slice(0, 5);

  return {
    today: {
      minutes: stats.minutesToday,
      accuracy: stats.accuracy,
      streak: stats.currentStreak,
    },
    recent: recentRows,
    dueColdTests: dueRows,
    weakAreas,
    hasData: recent.length > 0 || due.length > 0 || weakAreas.length > 0,
  };
}

function renderProgress(host) {
  const model = buildProgressModel();
  host.innerHTML = '';

  const statsCard = document.createElement('article');
  statsCard.className = 'objective-card';
  const acc = model.today.accuracy == null ? '--' : `${model.today.accuracy}%`;
  statsCard.innerHTML = `
    <div class="objective-card-kicker">Today</div>
    <h3 class="objective-card-title">${model.today.minutes} min trained</h3>
    <p class="objective-card-body">Accuracy ${acc} · Streak ${model.today.streak}</p>
  `;
  host.appendChild(statsCard);

  const recentSection = document.createElement('section');
  recentSection.className = 'train-progress-section';
  recentSection.innerHTML = '<h3 class="drill-group-title">Recent attempts</h3>';
  if (!model.recent.length) {
    recentSection.innerHTML += '<p class="train-empty">No attempts logged yet — your history will appear here.</p>';
  } else {
    const list = document.createElement('div');
    list.className = 'train-attempt-list';
    for (const row of model.recent) {
      const item = document.createElement('article');
      item.className = 'train-attempt-row';
      const chip = row.status
        ? `<span class="train-status-chip status-${row.status}">${escapeHtml(row.statusLabel || row.status)}</span>`
        : '';
      const tempo = row.tempoHistory.length
        ? `<span class="train-tempo-hist">${row.tempoHistory.map((t) => t.bpm).join(' → ')} BPM</span>`
        : '';
      item.innerHTML = `
        <div class="train-attempt-head">
          <span class="train-attempt-label">${escapeHtml(row.label)}</span>
          ${chip}
        </div>
        <div class="train-attempt-meta">
          ${row.bpm != null ? `${row.bpm} BPM` : ''}
          ${row.accuracy != null ? ` · ${fmtPct(row.accuracy)}` : ''}
        </div>
        ${tempo}
      `;
      list.appendChild(item);
    }
    recentSection.appendChild(list);
  }
  host.appendChild(recentSection);

  const dueSection = document.createElement('section');
  dueSection.className = 'train-progress-section';
  dueSection.innerHTML = '<h3 class="drill-group-title">Due cold tests</h3>';
  if (!model.dueColdTests.length) {
    dueSection.innerHTML += '<p class="train-empty">No cold tests due — keep practicing to build retention checks.</p>';
  } else {
    const list = document.createElement('div');
    list.className = 'train-attempt-list';
    for (const row of model.dueColdTests) {
      const item = document.createElement('article');
      item.className = 'train-attempt-row';
      item.innerHTML = `
        <div class="train-attempt-head">
          <span class="train-attempt-label">${escapeHtml(row.label)}</span>
          <span class="train-status-chip status-${row.lastStatus}">${escapeHtml(row.kindLabel)}</span>
        </div>
      `;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn sm train-due-action';
      btn.textContent = 'Open target';
      btn.addEventListener('click', () => {
        if (row.targetType === 'drill') {
          navigate({ objective: 'train', view: 'fundamentals', params: { drill: row.targetId } });
        } else if (row.targetType === 'exercise') {
          navigate({ objective: 'train', view: 'library', params: { type: 'exercise', id: row.targetId } });
        }
      });
      item.appendChild(btn);
      list.appendChild(item);
    }
    dueSection.appendChild(list);
  }
  host.appendChild(dueSection);

  const weakSection = document.createElement('section');
  weakSection.className = 'train-progress-section';
  weakSection.innerHTML = '<h3 class="drill-group-title">Weak areas</h3>';
  if (!model.weakAreas.length) {
    weakSection.innerHTML += '<p class="train-empty">Not enough data yet — log a few attempts to surface weak spots.</p>';
  } else {
    const list = document.createElement('div');
    list.className = 'train-attempt-list';
    for (const row of model.weakAreas) {
      const item = document.createElement('article');
      item.className = 'train-attempt-row';
      item.innerHTML = `
        <div class="train-attempt-head">
          <span class="train-attempt-label">${escapeHtml(row.label)}</span>
        </div>
        <div class="train-attempt-meta">${fmtPct(row.lastAccuracy)} accuracy · ${row.attempts} attempts</div>
      `;
      list.appendChild(item);
    }
    weakSection.appendChild(list);
  }
  host.appendChild(weakSection);
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
      const summary = getTargetSummary('drill', drill.id);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'drill-card';
      let summaryHtml = '';
      if (summary.attempts > 0) {
        const parts = [];
        if (summary.lastBpm != null) parts.push(`${summary.lastBpm} BPM`);
        if (summary.lastAccuracy != null) parts.push(fmtPct(summary.lastAccuracy));
        if (summary.status) parts.push(STATUS_LABELS[summary.status] || summary.status);
        summaryHtml = `<span class="drill-card-summary">${escapeHtml(parts.join(' · '))}</span>`;
      }
      btn.innerHTML = `
        <span class="drill-card-title">${escapeHtml(drill.label)}</span>
        ${summaryHtml}
      `;
      btn.onclick = () => setParams({ drill: drill.route.drill });
      grid.appendChild(btn);
    });
    section.appendChild(grid);
    host.appendChild(section);
  });
}

function renderPlansHeader(host, route) {
  const active = findActiveRoutineSession() || findNextRoutine();
  const header = document.createElement('div');
  header.className = 'train-plans-header';
  if (active) {
    header.innerHTML = `
      <div class="train-plans-header-text">
        <span class="objective-card-kicker">${active === findActiveRoutineSession() ? 'Active' : 'Next'}</span>
        <strong>${escapeHtml(active.routine.name)}</strong>
        <span class="train-plans-session">${escapeHtml(active.session.name || 'Session')}</span>
      </div>
      <button type="button" class="btn primary train-plans-start">Start session</button>
    `;
    header.querySelector('.train-plans-start')?.addEventListener('click', () => {
      beginRoutineSession(active.routine, active.session);
      navigate('#train/today');
    });
  } else {
    header.innerHTML = `
      <p class="train-empty">No routines yet — create one below or start free practice.</p>
      <button type="button" class="btn primary train-plans-start">Start free practice</button>
    `;
    header.querySelector('.train-plans-start')?.addEventListener('click', () => {
      beginFreePractice();
      navigate('#train/today');
    });
  }
  host.appendChild(header);
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

function updateLibraryChipActive(activeId) {
  if (!viewRegion) return;
  const row = viewRegion.querySelector('.workspace-chips');
  if (!row) return;
  row.querySelectorAll('.workspace-chip').forEach((btn, index) => {
    const chipId = LIBRARY_CHIPS[index]?.id;
    const active = chipId === activeId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

async function applyLibraryItemId(route) {
  const id = route.params?.id;
  if (!id) return;
  if (route.params?.player === 'gp') {
    const { requestGpScore } = await import('../gpPlayer.js');
    requestGpScore(id);
    return;
  }
  if (route.params?.type === 'workbook') {
    const { openWorkbookById } = await import('../workbooks.js');
    openWorkbookById(id);
    return;
  }
  if ((route.params?.type || 'exercise') === 'exercise') {
    const { requestExerciseOpen } = await import('../exercises.js');
    requestExerciseOpen(id);
  }
}

async function paintView(route) {
  const view = effectiveView(route);
  shellApi?.updateTabs(view);

  if (view === 'library') {
    const mapping = resolveLibrary(route);
    const sectionId = mapping?.sectionId || null;
    const libType = route.params?.player === 'gp' ? 'gp' : (route.params?.type || 'exercise');
    const sameLibraryShell = lastPaintedView === 'library'
      && lastPaintedSectionId === sectionId
      && sectionId != null
      && viewRegion?.querySelector('.workspace-feature-host');

    if (sameLibraryShell) {
      updateLibraryChipActive(libType);
      await applyLibraryItemId(route);
      syncPracticeBar();
      return;
    }

    lastPaintedView = 'library';
    lastPaintedSectionId = sectionId;
    releaseAllExcept([]);
    activeFeatureIds = [];
    viewRegion.innerHTML = '';
    renderChipRow(viewRegion, LIBRARY_CHIPS, libType, (id) => {
      if (id === 'gp') setParams({ player: 'gp', type: null });
      else setParams({ type: id, player: null });
    });
    if (mapping) {
      const featureHost = document.createElement('div');
      featureHost.className = 'workspace-feature-host';
      viewRegion.appendChild(featureHost);
      adoptSection(mapping.sectionId, featureHost);
      activeFeatureIds = [mapping.featureId];
      await mountFeature(mapping.featureId);
      stopFeaturesExcept(activeFeatureIds);
      await applyLibraryItemId(route);
    } else {
      stopFeaturesExcept([]);
    }
    syncPracticeBar();
    return;
  }

  lastPaintedView = view;
  lastPaintedSectionId = null;
  releaseAllExcept([]);
  activeFeatureIds = [];
  viewRegion.innerHTML = '';

  if (view === 'today') {
    renderToday(viewRegion);
    stopFeaturesExcept([]);
    syncPracticeBar();
    return;
  }

  if (view === 'progress') {
    renderProgress(viewRegion);
    stopFeaturesExcept([]);
    syncPracticeBar();
    return;
  }

  if (view === 'fundamentals') {
    const mapping = resolveFundamentals(route);
    if (!mapping) {
      renderFundamentalsGrid(viewRegion);
      stopFeaturesExcept([]);
      syncPracticeBar();
      return;
    }
    lastPaintedSectionId = mapping.sectionId;
    const featureHost = document.createElement('div');
    featureHost.className = 'workspace-feature-host';
    viewRegion.appendChild(featureHost);
    adoptSection(mapping.sectionId, featureHost);
    activeFeatureIds = [mapping.featureId];
    await mountFeature(mapping.featureId);
    stopFeaturesExcept(activeFeatureIds);
    syncPracticeBar();
    return;
  }

  if (view === 'plans') {
    renderPlansHeader(viewRegion, route);
    const mapping = TRAIN_SECTIONS.plans;
    lastPaintedSectionId = mapping.sectionId;
    const featureHost = document.createElement('div');
    featureHost.className = 'workspace-feature-host';
    viewRegion.appendChild(featureHost);
    adoptSection(mapping.sectionId, featureHost);
    activeFeatureIds = [mapping.featureId];
    await mountFeature(mapping.featureId);
    stopFeaturesExcept(activeFeatureIds);
    syncPracticeBar();
  }
}

function bindSessionRefresh() {
  if (sessionUnsub) return;
  sessionUnsub = subscribeSession((state, meta) => {
    if (meta?.reason === 'end') tearDownPracticeBar();
    else syncPracticeBar();
    const view = shellApi?.viewRegion;
    if (view && effectiveView({ view: shellApi?.currentView }) === 'today') {
    }
  });
}

/**
 * @param {Element} container
 * @param {object} route
 */
export async function mount(container, route) {
  restoreSession();
  const view = effectiveView(route);
  shellApi = createWorkspaceShell(container, {
    label: 'Train',
    views: VIEW_LABELS,
    currentView: view,
    onTabSelect: (id) => navigate({ objective: 'train', view: id, params: {} }),
  });
  shellApi.currentView = view;
  viewRegion = shellApi.viewRegion;
  bindSessionRefresh();
  await paintView(route);
}

/**
 * @param {object} route
 */
export async function update(route) {
  shellApi.currentView = effectiveView(route);
  await paintView(route);
}

export function unmount() {
  if (sessionUnsub) {
    sessionUnsub();
    sessionUnsub = null;
  }
  tearDownPracticeBar();
  releaseAllExcept([]);
  stopFeaturesExcept([]);
  shellApi = null;
  viewRegion = null;
  activeFeatureIds = [];
  lastPaintedView = null;
  lastPaintedSectionId = null;
}
