import { getSetting, saveSetting } from './persistence.js';
import { TOOLS, CATEGORIES, CATEGORY_ICONS, TOOL_ICONS, getTool, toolsInCategory } from './tools.js';
import { getStatsSnapshot } from './stats.js';
import { getContext } from './musicalContext.js';
import { shortScaleName } from './scales.js';
import {
  buildRecommendations,
  completeRecommendedStudy,
} from './studyRecommendations.js';
import { hasActiveGenres, getMusicProfile } from './musicProfile.js';
import { startStudyLab } from './studyLab.js';

let showSectionFn = null;
let showHubFn = null;

function favorites() {
  const v = getSetting('home.favorites', []);
  return Array.isArray(v) ? v.filter(id => TOOLS.some(t => t.id === id)) : [];
}
function setFavorites(list) { saveSetting('home.favorites', list); }

function toggleFavorite(id) {
  const list = favorites();
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1); else list.push(id);
  setFavorites(list);
  render();
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
  if (tuning && ['scaleref', 'chords', 'triads', 'fretboard', 'intervalorbit', 'chordlab', 'tabanalyzer'].includes(toolId)) {
    bits.push(tuning);
  }
  const sub = getSetting(`subview.${toolId}`, null);
  if (sub) bits.push(String(sub).replace(/^\w/, ch => ch.toUpperCase()));
  return bits.filter(Boolean).join(' · ') || (getTool(toolId)?.description || '');
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
      <span class="home-continue-title">${tool.title}</span>
      <span class="home-continue-setup">${continueSetupLine(id)}</span>
    </button>
  `;
  host.querySelector('button').onclick = () => showSectionFn(id);
}

function renderQuickStart(host) {
  const fav = favorites().slice(0, 4);
  const pinned = fav.length ? fav : ['intervalorbit', 'scaleref', 'metronome', 'tuner'].filter(id => getTool(id));
  host.innerHTML = '';
  const label = document.createElement('div');
  label.className = 'home-section-label';
  label.textContent = 'Quick Start';
  host.appendChild(label);
  const grid = document.createElement('div');
  grid.className = 'home-quick';
  pinned.forEach(id => {
    const tool = getTool(id);
    if (!tool) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'home-quick-card';
    btn.innerHTML = `
      <span class="hq-icon">${TOOL_ICONS[id] || ''}</span>
      <span class="hq-title">${tool.label}</span>
      <span class="home-quick-fav" data-fav="${id}" aria-label="Favorite">${favorites().includes(id) ? '★' : '☆'}</span>
    `;
    btn.onclick = (e) => {
      if (e.target.closest('[data-fav]')) {
        e.stopPropagation();
        toggleFavorite(id);
        return;
      }
      showSectionFn(id);
    };
    grid.appendChild(btn);
  });
  host.appendChild(grid);
}

function renderToday(host) {
  const s = getStatsSnapshot();
  const acc = s.accuracy === null ? '—' : `${s.accuracy}% accuracy`;
  host.innerHTML = `
    <div class="home-today-main">${s.minutesToday} min practiced · ${acc} · ${s.currentStreak} streak</div>
    <div class="home-today-weak">${s.weakest ? `Weakest: ${s.weakest.label}` : 'Keep training to surface a weakest skill'}</div>
  `;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
          <button type="button" class="btn primary" data-action="prefs">Music Preferences</button>
          ${rec ? `<button type="button" class="btn" data-action="start" data-id="${escapeHtml(rec.id)}">Try foundation study</button>` : ''}
        </div>
      </div>
    `;
    host.querySelector('[data-action="prefs"]')?.addEventListener('click', () => showSectionFn('musicprefs'));
    host.querySelector('[data-action="start"]')?.addEventListener('click', (e) => {
      startStudy(e.currentTarget.dataset.id);
    });
    return;
  }

  if (!rec) {
    host.innerHTML = `
      <div class="home-rec-empty">
        <div class="home-rec-kicker">Recommended Study</div>
        <div class="home-rec-empty-title">No study matches current filters</div>
        <p class="home-rec-empty-body">Clear a paused topic in Music Preferences, or switch study balance.</p>
        <div class="home-rec-actions">
          <button type="button" class="btn primary" data-action="prefs">Music Preferences</button>
        </div>
      </div>
    `;
    host.querySelector('[data-action="prefs"]')?.addEventListener('click', () => showSectionFn('musicprefs'));
    return;
  }

  const focus = (rec.focus || []).slice(0, 5)
    .map(step => `<li>${escapeHtml(step)}</li>`)
    .join('');
  const reasons = (rec.reasons || [])
    .map(r => `<li>${escapeHtml(r)}</li>`)
    .join('');
  const app = rec.application
    ? `<div class="home-rec-app"><strong>Application</strong>${escapeHtml(rec.application)}</div>`
    : '';

  host.innerHTML = `
    <article class="home-rec-card" aria-label="Recommended study">
      <div class="home-rec-kicker">Recommended Study</div>
      <div class="home-rec-title">${escapeHtml(rec.title)}</div>
      <div class="home-rec-cat">${escapeHtml(rec.categoryLabel)}</div>
      <p class="home-rec-narrative">${escapeHtml(rec.narrative)}</p>
      <div class="home-rec-meta">Profile · ${escapeHtml(bundle.genreSummary)}</div>
      <div class="home-rec-focus-label">Today’s focus</div>
      <ol class="home-rec-focus">${focus}</ol>
      <div class="home-rec-why-label">Why this was selected</div>
      <ul class="home-rec-reasons">${reasons}</ul>
      ${app}
      <div class="home-rec-actions">
        <button type="button" class="btn primary" data-action="start" data-id="${escapeHtml(rec.id)}">Start study</button>
        <button type="button" class="btn" data-action="done" data-id="${escapeHtml(rec.id)}">Mark reviewed</button>
        <button type="button" class="btn" data-action="prefs">Adjust profile</button>
      </div>
    </article>
  `;

  host.querySelector('[data-action="start"]')?.addEventListener('click', (e) => {
    startStudy(e.currentTarget.dataset.id);
  });
  host.querySelector('[data-action="done"]')?.addEventListener('click', (e) => {
    completeRecommendedStudy(e.currentTarget.dataset.id);
    render();
  });
  host.querySelector('[data-action="prefs"]')?.addEventListener('click', () => showSectionFn('musicprefs'));
}

function startStudy(studyId) {
  if (!studyId) return;
  startStudyLab(studyId);
  showSectionFn('studylab');
}

function renderCategories(host) {
  host.innerHTML = '';
  const label = document.createElement('div');
  label.className = 'home-section-label';
  label.textContent = 'Categories';
  host.appendChild(label);
  const grid = document.createElement('div');
  grid.className = 'home-cats';
  CATEGORIES.forEach(cat => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'home-cat-link';
    btn.innerHTML = `<span class="dock-icon">${CATEGORY_ICONS[cat.id] || ''}</span><span>${cat.label}</span>`;
    btn.onclick = () => {
      if (typeof showHubFn === 'function') showHubFn(cat.id);
      else showSectionFn('hub-' + cat.id);
    };
    grid.appendChild(btn);
  });
  host.appendChild(grid);
}

function renderAllTools(panel) {
  if (!panel) return;
  const search = panel.querySelector('.home-all-search') || (() => {
    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'home-all-search';
    input.placeholder = 'Search tools…';
    input.setAttribute('aria-label', 'Search tools');
    panel.insertBefore(input, panel.querySelector('.home-all-rows'));
    return input;
  })();

  let rows = panel.querySelector('.home-all-rows');
  if (!rows) {
    rows = document.createElement('div');
    rows.className = 'home-all-rows';
    panel.appendChild(rows);
  }

  const paint = () => {
    const q = (search.value || '').toLowerCase().trim();
    rows.innerHTML = '';
    TOOLS.filter(t => {
      if (!q) return true;
      return (t.label + ' ' + t.description + ' ' + t.category).toLowerCase().includes(q);
    }).forEach(t => {
      const row = document.createElement('div');
      row.className = 'home-tool-row';
      row.innerHTML = `
        <span class="ht-icon">${TOOL_ICONS[t.id] || ''}</span>
        <button type="button" class="ht-title">${t.label}</button>
        <button type="button" class="ht-fav${favorites().includes(t.id) ? ' on' : ''}" aria-label="Favorite">${favorites().includes(t.id) ? '★' : '☆'}</button>
      `;
      row.querySelector('.ht-title').onclick = () => showSectionFn(t.id);
      row.querySelector('.ht-fav').onclick = (e) => {
        e.stopPropagation();
        toggleFavorite(t.id);
      };
      // Make whole row tappable except star
      row.addEventListener('click', (e) => {
        if (e.target.closest('.ht-fav')) return;
        showSectionFn(t.id);
      });
      rows.appendChild(row);
    });
  };
  search.oninput = paint;
  paint();
}

function render() {
  const continueHost = document.getElementById('home-continue');
  const recHost = document.getElementById('home-study-rec');
  const quickHost = document.getElementById('home-quickstart');
  const todayHost = document.getElementById('home-today');
  const catsHost = document.getElementById('home-categories');
  const allPanel = document.getElementById('home-all-panel');

  if (continueHost) renderContinue(continueHost);
  if (recHost) renderStudyRec(recHost);
  if (quickHost) renderQuickStart(quickHost);
  if (todayHost) renderToday(todayHost);
  if (catsHost) renderCategories(catsHost);
  if (allPanel) {
    allPanel.open = false;
    renderAllTools(allPanel);
  }
}

export function renderHub(categoryId, container, { showSection, onFavorite } = {}) {
  if (!container) return;
  const cat = CATEGORIES.find(c => c.id === categoryId);
  if (!cat) return;
  const tools = toolsInCategory(categoryId);
  const fav = favorites().filter(id => tools.some(t => t.id === id));
  const recentId = lastTool();
  const recentTool = recentId && tools.some(t => t.id === recentId) ? getTool(recentId) : null;

  container.innerHTML = `
    <div class="section-head">
      <div class="section-kicker">Category</div>
      <h2>${cat.label}</h2>
      <p>${cat.description}</p>
    </div>
    <input type="search" class="hub-search" placeholder="Filter ${cat.label.toLowerCase()}…" aria-label="Filter ${cat.label}">
    <div class="hub-body"></div>
  `;
  const body = container.querySelector('.hub-body');
  const search = container.querySelector('.hub-search');

  const paint = () => {
    const q = (search.value || '').toLowerCase().trim();
    body.innerHTML = '';
    if (recentTool && !q) {
      const lab = document.createElement('div');
      lab.className = 'hub-recent-label';
      lab.textContent = 'Recently used';
      body.appendChild(lab);
      body.appendChild(toolRow(recentTool, { showSection, onFavorite }));
    }
    if (fav.length && !q) {
      const lab = document.createElement('div');
      lab.className = 'hub-pinned-label';
      lab.textContent = 'Pinned';
      body.appendChild(lab);
      const list = document.createElement('div');
      list.className = 'hub-tool-list';
      fav.forEach(id => {
        const t = getTool(id);
        if (t) list.appendChild(toolRow(t, { showSection, onFavorite }));
      });
      body.appendChild(list);
    }
    const lab = document.createElement('div');
    lab.className = 'hub-pinned-label';
    lab.textContent = q ? 'Results' : 'All';
    body.appendChild(lab);
    const list = document.createElement('div');
    list.className = 'hub-tool-list';
    tools.filter(t => {
      if (!q) return true;
      return (t.label + ' ' + t.description).toLowerCase().includes(q);
    }).forEach(t => list.appendChild(toolRow(t, { showSection, onFavorite })));
    body.appendChild(list);
  };
  search.oninput = paint;
  paint();
}

function toolRow(tool, { showSection, onFavorite }) {
  const fav = favorites().includes(tool.id);
  const row = document.createElement('div');
  row.className = 'hub-tool-row';
  row.innerHTML = `
    <span class="hub-icon">${TOOL_ICONS[tool.id] || ''}</span>
    <span class="hub-tool-meta">
      <span class="hub-tool-title">${tool.label}</span>
      <span class="hub-tool-desc">${tool.description}</span>
    </span>
    <button type="button" class="hub-tool-fav${fav ? ' on' : ''}" aria-label="Favorite">${fav ? '★' : '☆'}</button>
  `;
  row.querySelector('.hub-tool-fav').onclick = (e) => {
    e.stopPropagation();
    toggleFavorite(tool.id);
    if (onFavorite) onFavorite();
  };
  row.addEventListener('click', (e) => {
    if (e.target.closest('.hub-tool-fav')) return;
    showSection(tool.id);
  });
  return row;
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
    const continueId = lastTool();
    const rec = buildRecommendations({ limit: 1 }).primary;
    primary.onclick = () => {
      if (!continueId && rec) {
        startStudy(rec.id);
        return;
      }
      showSectionFn(continueId || 'studylab');
    };
    const label = document.getElementById('gbc-cta-primary-label');
    if (label) {
      label.textContent = continueId ? 'Continue' : (rec ? 'Start study' : 'Start practice');
    }
  }

  if (browse) {
    browse.onclick = () => {
      const panel = document.getElementById('home-all-panel');
      if (!panel) return;
      panel.open = true;
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const search = panel.querySelector('.home-all-search');
      if (search) search.focus();
    };
  }
}

export function initHome(config) {
  showSectionFn = config.showSection;
  showHubFn = config.showHub;
  render();
  wireHero();
  if (!window.__musiProfileListener) {
    window.__musiProfileListener = true;
    window.addEventListener('musi:profile-changed', () => {
      refreshHome();
    });
  }
}

export function refreshHome() {
  render();
  wireHero();
}
