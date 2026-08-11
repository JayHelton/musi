/**
 * Home screen renderer: objective cards, continue card, study recommendation,
 * and lightweight secondary summaries. Used by workspaces/home.js.
 */

import { getSetting } from './persistence.js';
import { getTool } from './tools.js';
import { getContext } from './musicalContext.js';
import { shortScaleName } from './scales.js';
import {
  buildRecommendations,
  completeRecommendedStudy,
} from './studyRecommendations.js';
import { hasActiveGenres, getMusicProfile } from './musicProfile.js';
import { listRoutines } from './routineModel.js';
import { getStudyProgress } from './studyProgress.js';
import { dueStudyReviews } from './progress/progressLog.js';
import { listAttempts } from './progress/progressLog.js';

let showSectionFn = null;
let navigateFn = null;

function readSongs() {
  try {
    const raw = window.localStorage.getItem('musi.songs');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function lastTool() {
  const id = getSetting('nav.lastTool', null);
  return id && getTool(id) ? id : null;
}

function continueSetupLine(toolId) {
  const c = getContext();
  const bits = [];
  if (['scaleref', 'chords', 'triads', 'fretboard', 'intervalorbit', 'chordlab', 'scales', 'tuner'].includes(toolId)) {
    bits.push(`${c.root} ${shortScaleName(c.scale)}`);
  }
  if (['metronome', 'timing', 'practice', 'intervalorbit'].includes(toolId)) {
    bits.push(`${c.tempo} BPM`);
  }
  const tuning = getSetting('picker.lastTuning', getSetting('chordref.tuning', getSetting('io.tuning', null)));
  if (tuning && ['scaleref', 'chords', 'triads', 'fretboard', 'intervalorbit', 'chordlab'].includes(toolId)) {
    bits.push(tuning);
  }
  const sub = getSetting(`subview.${toolId}`, null);
  if (sub) bits.push(String(sub).replace(/^\w/, (ch) => ch.toUpperCase()));
  return bits.filter(Boolean).join(' · ') || (getTool(toolId)?.description || '');
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

function trainNextAction() {
  const active = findActiveRoutineSession();
  if (active) return `Resume ${active.routine.name}`;
  const next = findNextRoutine();
  if (next) return `Next: ${next.routine.name}`;
  return 'Start free practice';
}

function studyNextAction() {
  const progress = getStudyProgress();
  if (progress.lastPrimaryId) return 'Resume Study Lab path';
  const rec = buildRecommendations({ limit: 1 }).primary;
  if (rec) return rec.title;
  return 'Explore study paths';
}

function createNextAction() {
  const songs = readSongs();
  if (!songs.length) return 'Start a new project';
  const latest = songs[0];
  return latest.title || latest.name || 'Recent project';
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function go(target) {
  if (navigateFn) navigateFn(target);
  else if (showSectionFn) showSectionFn(target);
}

function renderContinue(host) {
  const id = lastTool();
  if (!id) {
    host.innerHTML = '';
    host.style.display = 'none';
    return;
  }
  host.style.display = '';
  const tool = getTool(id);
  host.innerHTML = `
    <button type="button" class="home-continue-card" data-id="${id}">
      <span class="home-continue-kicker">Continue</span>
      <span class="home-continue-title">${escapeHtml(tool.title)}</span>
      <span class="home-continue-setup">${escapeHtml(continueSetupLine(id))}</span>
    </button>
  `;
  host.querySelector('button').onclick = () => go(id);
}

function renderObjectiveCards(host) {
  const active = findActiveRoutineSession();
  const trainAction = trainNextAction();
  const studyAction = studyNextAction();
  const createAction = createNextAction();

  host.innerHTML = `
    <div class="home-objective-grid">
      <article class="home-objective-card">
        <div class="home-objective-kicker">Train</div>
        <h3 class="home-objective-title">Practice and drills</h3>
        <p class="home-objective-action">${escapeHtml(trainAction)}</p>
        <button type="button" class="btn primary" data-obj="train">${active ? 'Resume' : 'Open Train'}</button>
      </article>
      <article class="home-objective-card">
        <div class="home-objective-kicker">Study</div>
        <h3 class="home-objective-title">Learn and explore</h3>
        <p class="home-objective-action">${escapeHtml(studyAction)}</p>
        <button type="button" class="btn primary" data-obj="study">Open Study</button>
      </article>
      <article class="home-objective-card">
        <div class="home-objective-kicker">Create</div>
        <h3 class="home-objective-title">Projects and capture</h3>
        <p class="home-objective-action">${escapeHtml(createAction)}</p>
        <button type="button" class="btn primary" data-obj="create">Open Create</button>
      </article>
    </div>
  `;

  host.querySelector('[data-obj="train"]')?.addEventListener('click', () => {
    go(active ? '#train/plans' : '#train/today');
  });
  host.querySelector('[data-obj="study"]')?.addEventListener('click', () => {
    const progress = getStudyProgress();
    go(progress.lastPrimaryId ? '#study/learn' : '#study/learn');
  });
  host.querySelector('[data-obj="create"]')?.addEventListener('click', () => {
    go('#create/projects');
  });
}

function renderSecondary(host) {
  const due = dueStudyReviews();
  const recent = listAttempts({ limit: 3 });
  const songs = readSongs().slice(0, 3);
  host.innerHTML = `
    <div class="home-secondary-grid">
      <div class="home-secondary-block">
        <div class="home-section-label">Due reviews</div>
        <p>${due.length ? `${due.length} study concepts due` : 'No reviews due'}</p>
      </div>
      <div class="home-secondary-block">
        <div class="home-section-label">Recent progress</div>
        <p>${recent.length ? `${recent.length} recent attempts` : 'No attempts logged yet'}</p>
      </div>
      <div class="home-secondary-block">
        <div class="home-section-label">Recent projects</div>
        <p>${songs.length ? songs.map((s) => escapeHtml(s.title || s.name || 'Untitled')).join(', ') : 'No projects yet'}</p>
        <button type="button" class="btn sm" data-capture>Quick Capture</button>
      </div>
    </div>
  `;
  host.querySelector('[data-capture]')?.addEventListener('click', () => go('#create/capture'));
}

function renderStudyRec(host) {
  if (!host) return;
  const profile = getMusicProfile();
  const bundle = buildRecommendations({ limit: 1 });
  const rec = bundle.primary;

  if (!hasActiveGenres(profile)) {
    host.innerHTML = `
      <div class="home-rec-empty">
        <div class="home-rec-kicker">Recommended Study</div>
        <div class="home-rec-empty-title">Set your genre profile</div>
        <p class="home-rec-empty-body">
          Save genres and learning goals so study recommendations can emphasize relevant scales,
          harmony, and fretboard contexts — without replacing foundation theory.
        </p>
        <div class="home-rec-actions">
          <button type="button" class="btn primary" data-action="prefs">Settings</button>
          ${rec ? `<button type="button" class="btn" data-action="start">Try foundation study</button>` : ''}
        </div>
      </div>
    `;
    host.querySelector('[data-action="prefs"]')?.addEventListener('click', () => go('#settings'));
    host.querySelector('[data-action="start"]')?.addEventListener('click', () => go('#study/learn'));
    return;
  }

  if (!rec) {
    host.innerHTML = `
      <div class="home-rec-empty">
        <div class="home-rec-kicker">Recommended Study</div>
        <div class="home-rec-empty-title">No study matches current filters</div>
        <p class="home-rec-empty-body">Clear a paused topic in Settings, or switch study balance.</p>
        <div class="home-rec-actions">
          <button type="button" class="btn primary" data-action="prefs">Settings</button>
        </div>
      </div>
    `;
    host.querySelector('[data-action="prefs"]')?.addEventListener('click', () => go('#settings'));
    return;
  }

  const focus = (rec.focus || []).slice(0, 5)
    .map((step) => `<li>${escapeHtml(step)}</li>`)
    .join('');
  const reasons = (rec.reasons || [])
    .map((r) => `<li>${escapeHtml(r)}</li>`)
    .join('');
  const app = rec.application
    ? `<div class="home-rec-app"><strong>Application</strong>${escapeHtml(rec.application)}</div>`
    : '';

  host.innerHTML = `
    <article class="home-rec-card" aria-label="Recommended study">
      <div class="home-rec-kicker">Recommended Study</div>
      <div class="home-rec-head">
        <div class="home-rec-title">${escapeHtml(rec.title)}</div>
        <div class="home-rec-cat">${escapeHtml(rec.categoryLabel)}</div>
      </div>
      <details class="home-rec-details">
        <summary class="home-rec-summary">Session details</summary>
        <div class="home-rec-body">
          <p class="home-rec-narrative">${escapeHtml(rec.narrative)}</p>
          <div class="home-rec-meta">Profile · ${escapeHtml(bundle.genreSummary)}</div>
          <div class="home-rec-focus-label">Today's focus</div>
          <ol class="home-rec-focus">${focus}</ol>
          <div class="home-rec-why-label">Why this was selected</div>
          <ul class="home-rec-reasons">${reasons}</ul>
          ${app}
        </div>
      </details>
      <div class="home-rec-actions">
        <button type="button" class="btn primary" data-action="start">Start study</button>
        <button type="button" class="btn" data-action="done" data-id="${escapeHtml(rec.id)}">Mark reviewed</button>
        <button type="button" class="btn" data-action="prefs">Adjust profile</button>
      </div>
    </article>
  `;

  host.querySelector('[data-action="start"]')?.addEventListener('click', () => go('#study/learn'));
  host.querySelector('[data-action="done"]')?.addEventListener('click', (e) => {
    completeRecommendedStudy(e.currentTarget.dataset.id);
    render();
  });
  host.querySelector('[data-action="prefs"]')?.addEventListener('click', () => go('#settings'));
}

function wireHero() {
  const primary = document.getElementById('gbc-cta-primary');
  const browse = document.getElementById('gbc-cta-browse');
  const clock = document.getElementById('gbc-clock');

  if (clock && !clock.dataset.wired) {
    clock.dataset.wired = '1';
    const tick = () => {
      const d = new Date();
      clock.textContent = d.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    };
    tick();
    setInterval(tick, 30000);
  }

  if (primary) {
    const active = findActiveRoutineSession();
    const continueId = lastTool();
    const rec = buildRecommendations({ limit: 1 }).primary;
    primary.onclick = () => {
      if (active) {
        go('#train/plans');
        return;
      }
      if (continueId) {
        go(continueId);
        return;
      }
      if (rec) {
        go('#study/learn');
        return;
      }
      go('#train/today');
    };
    const label = document.getElementById('gbc-cta-primary-label');
    if (label) {
      if (active) label.textContent = 'Resume routine';
      else if (continueId) label.textContent = 'Continue';
      else if (rec) label.textContent = 'Start study';
      else label.textContent = 'Start practice';
    }
  }

  if (browse) {
    browse.onclick = () => go('#train/library');
    const browseLabel = browse.querySelector('span:last-child') || browse;
    if (browseLabel.textContent === 'Browse tools') browseLabel.textContent = 'Open library';
  }
}

function render() {
  const continueHost = document.getElementById('home-continue');
  const recHost = document.getElementById('home-study-rec');
  const objectivesHost = document.getElementById('home-objectives');
  const secondaryHost = document.getElementById('home-secondary');

  if (continueHost) renderContinue(continueHost);
  if (objectivesHost) renderObjectiveCards(objectivesHost);
  if (secondaryHost) renderSecondary(secondaryHost);
  if (recHost) renderStudyRec(recHost);
}

/**
 * @param {{ showSection?: Function, showHub?: Function, navigate?: Function }} config
 */
export function initHome(config = {}) {
  showSectionFn = config.showSection || null;
  navigateFn = config.navigate || null;
  render();
  wireHero();
  if (!window.__musiProfileListener) {
    window.__musiProfileListener = true;
    window.addEventListener('musi:profile-changed', () => refreshHome());
  }
}

export function refreshHome() {
  render();
  wireHero();
}
