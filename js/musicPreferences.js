// Music Preferences — genre priorities, learning goals, study balance,
// application preference, and temporary topic exclusions.

import { GENRE_LIST, GENRE_PRIORITIES, LEARNING_GOALS, CONCEPTS, conceptLabel } from './genreProfiles.js';
import {
  getMusicProfile,
  setGenrePriority,
  removeGenre,
  toggleGoal,
  toggleApplication,
  toggleExclusion,
  setStudyBalance,
  STUDY_BALANCES,
  APPLICATION_PREFS,
  genreSummary,
  hasActiveGenres,
} from './musicProfile.js';
import { buildRecommendations } from './studyRecommendations.js';
import { STUDY_CATALOG } from './studyCatalog.js';

let showSectionFn = null;
let host = null;

function groupGenres() {
  const groups = new Map();
  GENRE_LIST.forEach(g => {
    const key = g.group || 'Other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(g);
  });
  return groups;
}

function genrePriority(profile, genreId) {
  return profile.genres.find(g => g.id === genreId)?.priority || null;
}

function render() {
  if (!host) return;
  const profile = getMusicProfile();
  const rec = buildRecommendations({ limit: 1 });

  host.innerHTML = `
    <div class="section-head">
      <div class="section-kicker">Profile</div>
      <h2>Music Preferences</h2>
      <p>Genre settings shape study context and priority — not shortcuts. Interval and chord-construction method stays universal.</p>
    </div>

    <div class="mp-banner">
      <div class="mp-banner-kicker">Active profile</div>
      <div class="mp-banner-title">${escapeHtml(genreSummary(profile))}</div>
      <div class="mp-banner-sub">${hasActiveGenres(profile)
        ? 'Recommendations combine foundation, genre relevance, weakness, and review urgency.'
        : 'Add genres below to personalize recommendations. Foundation studies remain available either way.'}</div>
    </div>

    <section class="mp-block">
      <h3 class="mp-block-title">Genre priorities</h3>
      <p class="mp-block-help">Primary and secondary genres raise related concepts. General theory stays required.</p>
      <div class="mp-genre-groups" id="mp-genre-groups"></div>
    </section>

    <section class="mp-block">
      <h3 class="mp-block-title">Learning goals</h3>
      <p class="mp-block-help">Goals nudge application framing and concept weight.</p>
      <div class="mp-chip-grid" id="mp-goals"></div>
    </section>

    <section class="mp-block">
      <h3 class="mp-block-title">Study balance</h3>
      <p class="mp-block-help">Choose how aggressively genre color competes with foundation and review.</p>
      <div class="mp-balance" id="mp-balance"></div>
    </section>

    <section class="mp-block">
      <h3 class="mp-block-title">Application preference</h3>
      <p class="mp-block-help">Frames practice prompts after theory work — you still supply the musical answer.</p>
      <div class="mp-chip-grid" id="mp-apps"></div>
    </section>

    <section class="mp-block">
      <h3 class="mp-block-title">Pause topics</h3>
      <p class="mp-block-help">Temporarily exclude a concept without deleting it from your profile.</p>
      <div class="mp-chip-grid mp-exclusions" id="mp-exclusions"></div>
    </section>

    <section class="mp-block">
      <h3 class="mp-block-title">Preview</h3>
      <div class="mp-preview" id="mp-preview"></div>
    </section>
  `;

  paintGenres(profile);
  paintGoals(profile);
  paintBalance(profile);
  paintApps(profile);
  paintExclusions(profile);
  paintPreview(rec);
}

function paintGenres(profile) {
  const root = host.querySelector('#mp-genre-groups');
  if (!root) return;
  root.innerHTML = '';
  groupGenres().forEach((genres, groupName) => {
    const block = document.createElement('div');
    block.className = 'mp-genre-group';
    block.innerHTML = `<div class="mp-genre-group-label">${escapeHtml(groupName)}</div>`;
    const list = document.createElement('div');
    list.className = 'mp-genre-list';
    genres.forEach(g => {
      const pri = genrePriority(profile, g.id);
      const row = document.createElement('div');
      row.className = 'mp-genre-row' + (pri && pri !== 'inactive' ? ' active' : '');
      row.innerHTML = `
        <div class="mp-genre-meta">
          <div class="mp-genre-name">${escapeHtml(g.label)}</div>
          <div class="mp-genre-blurb">${escapeHtml(g.blurb)}</div>
        </div>
        <label class="mp-select-wrap">
          <span class="sr-only">Priority for ${escapeHtml(g.label)}</span>
          <select data-genre="${g.id}" class="mp-priority-select">
            <option value="">Not selected</option>
            ${GENRE_PRIORITIES.map(p =>
              `<option value="${p.id}"${pri === p.id ? ' selected' : ''}>${escapeHtml(p.label)}</option>`
            ).join('')}
          </select>
        </label>
      `;
      list.appendChild(row);
    });
    block.appendChild(list);
    root.appendChild(block);
  });

  root.querySelectorAll('.mp-priority-select').forEach(sel => {
    sel.onchange = () => {
      const id = sel.dataset.genre;
      const val = sel.value;
      if (!val) removeGenre(id);
      else setGenrePriority(id, val);
      render();
      notifyHome();
    };
  });
}

function paintGoals(profile) {
  const root = host.querySelector('#mp-goals');
  if (!root) return;
  root.innerHTML = '';
  LEARNING_GOALS.forEach(goal => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mp-chip' + (profile.goals.includes(goal.id) ? ' on' : '');
    btn.textContent = goal.label;
    btn.onclick = () => {
      toggleGoal(goal.id);
      render();
      notifyHome();
    };
    root.appendChild(btn);
  });
}

function paintBalance(profile) {
  const root = host.querySelector('#mp-balance');
  if (!root) return;
  root.innerHTML = '';
  STUDY_BALANCES.forEach(b => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mp-balance-card' + (profile.balance === b.id ? ' on' : '');
    btn.innerHTML = `
      <span class="mp-balance-label">${escapeHtml(b.label)}</span>
      <span class="mp-balance-desc">${escapeHtml(b.description)}</span>
    `;
    btn.onclick = () => {
      setStudyBalance(b.id);
      render();
      notifyHome();
    };
    root.appendChild(btn);
  });
}

function paintApps(profile) {
  const root = host.querySelector('#mp-apps');
  if (!root) return;
  root.innerHTML = '';
  APPLICATION_PREFS.forEach(app => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mp-chip' + (profile.applications.includes(app.id) ? ' on' : '');
    btn.textContent = app.label;
    btn.onclick = () => {
      toggleApplication(app.id);
      render();
      notifyHome();
    };
    root.appendChild(btn);
  });
}

function paintExclusions(profile) {
  const root = host.querySelector('#mp-exclusions');
  if (!root) return;
  // Offer concepts that appear in the catalog, plus any already excluded.
  const ids = new Set(STUDY_CATALOG.flatMap(s => s.concepts));
  profile.exclusions.forEach(id => ids.add(id));
  const list = [...ids]
    .filter(id => CONCEPTS[id])
    .sort((a, b) => conceptLabel(a).localeCompare(conceptLabel(b)))
    .slice(0, 36);

  root.innerHTML = '';
  list.forEach(id => {
    const on = profile.exclusions.includes(id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mp-chip mp-chip-mute' + (on ? ' on' : '');
    btn.textContent = conceptLabel(id);
    btn.title = on ? 'Click to resume' : 'Click to pause';
    btn.onclick = () => {
      toggleExclusion(id);
      render();
      notifyHome();
    };
    root.appendChild(btn);
  });
}

function paintPreview(recBundle) {
  const root = host.querySelector('#mp-preview');
  if (!root) return;
  const rec = recBundle.primary;
  if (!rec) {
    root.innerHTML = `<p class="mp-preview-empty">No study available with the current exclusions.</p>`;
    return;
  }
  root.innerHTML = `
    <div class="mp-preview-kicker">${escapeHtml(rec.categoryLabel)}</div>
    <div class="mp-preview-title">${escapeHtml(rec.title)}</div>
    <p class="mp-preview-body">${escapeHtml(rec.narrative)}</p>
    <ul class="mp-preview-reasons">
      ${rec.reasons.map(r => `<li>${escapeHtml(r)}</li>`).join('')}
    </ul>
    <p class="mp-preview-guard">${escapeHtml(rec.guardrail)}</p>
  `;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function notifyHome() {
  try {
    window.dispatchEvent(new CustomEvent('musi:profile-changed'));
  } catch (_) { /* ignore */ }
}

export function initMusicPreferences({ showSection } = {}) {
  showSectionFn = showSection;
  host = document.getElementById('music-prefs-root');
  if (!host) return;
  render();
}

export function refreshMusicPreferences() {
  if (host) render();
}
