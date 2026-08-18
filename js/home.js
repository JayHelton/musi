import { getSetting, saveSetting } from './persistence.js';
import { TOOLS, CATEGORIES, CATEGORY_ICONS, TOOL_ICONS, getTool, toolsInCategory } from './tools.js';
// SIMPLIFY: Routines hidden. Keep this code to restore later.
// import { buildRoutineCardModels } from './routineDashboardModel.js';
// import { listRoutines, getRoutineStats, getActiveRoutineSession } from './routineModel.js';
// import { createRoutineFromPrompt, importRoutineFromFile } from './routines.js';
// import { onDataChanged } from './dataEvents.js';

let showSectionFn = null;
let showHubFn = null;
let openRouteFn = null;

function visibleTool(id) {
  return !!getTool(id);
}

function storedFavorites() {
  const v = getSetting('home.favorites', []);
  return Array.isArray(v) ? v.filter(id => getTool(id)) : [];
}

function favorites() {
  return storedFavorites().filter(id => visibleTool(id));
}

function setFavorites(list) { saveSetting('home.favorites', list); }

function toggleFavorite(id) {
  const list = storedFavorites();
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1); else list.push(id);
  setFavorites(list);
  render();
}

function lastTool() {
  const id = getSetting('nav.lastTool', null);
  return id && visibleTool(id) ? id : null;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// SIMPLIFY: Routines hidden. Keep this code to restore later.
/*
function routineCardHtml(card) {
  const pct = Math.round((card.progress || 0) * 100);
  const desc = card.description
    ? `<div class="hrc-desc">${escapeHtml(card.description)}</div>`
    : '';
  const session = card.currentSessionName
    ? `<div class="hrc-session">${escapeHtml(card.currentSessionName)}</div>`
    : '';
  return `
    <button type="button" class="home-routine-card" data-routine-id="${escapeHtml(card.id)}" aria-label="${escapeHtml(card.name)}">
      <div class="hrc-name">${escapeHtml(card.name)}</div>
      ${desc}
      ${session}
      <div class="hrc-counts">${card.completedCount} / ${card.totalCount} sessions</div>
      <div class="hrc-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
        <div class="hrc-progress-fill" style="width: ${pct}%"></div>
      </div>
    </button>
  `;
}

function wireRoutineActions(host) {
  const onNew = host.querySelector('[data-action="new-routine"]');
  const onImport = host.querySelector('[data-action="import-routine"]');
  if (onNew) {
    onNew.onclick = () => {
      createRoutineFromPrompt({ onDone: () => render() });
    };
  }
  if (onImport) {
    onImport.onclick = () => {
      importRoutineFromFile({ onDone: () => render() });
    };
  }
}

function wireRoutineCards(host) {
  host.querySelectorAll('.home-routine-card').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.routineId;
      if (!id) return;
      if (openRouteFn) {
        openRouteFn('routines', { routine: id });
        return;
      }
      showSectionFn('routines');
    };
  });
}

function renderRoutines(host) {
  if (!host) return;
  const cards = buildRoutineCardModels(listRoutines(), {
    getStats: (routine) => getRoutineStats(routine),
    getActiveSession: (routine) => getActiveRoutineSession(routine.id),
  });

  if (!cards.length) {
    host.innerHTML = `
      <div class="home-routines-empty">
        <div class="hre-title">No routines yet</div>
        <div class="hre-body">Create a routine or import a Musi routine file.</div>
        <button type="button" class="btn primary" data-action="new-routine">New Routine</button>
        <button type="button" class="btn" data-action="import-routine">Import Routine</button>
      </div>
    `;
    wireRoutineActions(host);
    return;
  }

  host.innerHTML = `
    <div class="home-routines-head">
      <h2 class="home-routines-title">Routines</h2>
      <div class="home-routines-actions">
        <button type="button" class="btn primary" data-action="new-routine">New Routine</button>
        <button type="button" class="btn" data-action="import-routine">Import Routine</button>
      </div>
    </div>
    <div class="home-routine-grid">
      ${cards.map(routineCardHtml).join('')}
    </div>
  `;
  wireRoutineActions(host);
  wireRoutineCards(host);
}
*/

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
  const routinesHost = document.getElementById('home-routines');
  const allPanel = document.getElementById('home-all-panel');

  // SIMPLIFY: Routines home cards hidden.
  // if (routinesHost) renderRoutines(routinesHost);
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

export function initHome(config) {
  showSectionFn = config.showSection;
  showHubFn = config.showHub;
  openRouteFn = config.openRoute;
  render();
  if (!window.__musiProfileListener) {
    window.__musiProfileListener = true;
    window.addEventListener('musi:profile-changed', () => {
      refreshHome();
    });
  }
  // SIMPLIFY: Routines hidden. Keep this code to restore later.
  /*
  if (!window.__musiRoutinesListener) {
    window.__musiRoutinesListener = true;
    onDataChanged((detail) => {
      if (detail.domain === 'routines') refreshHome();
    });
  }
  */
}

export function refreshHome() {
  render();
}
