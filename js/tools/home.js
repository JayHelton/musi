import { getSetting, saveSetting } from '../persistence.js';
import { TOOLS, TOOL_ICONS, getTool, isFeatureEnabled } from '../tools.js';
import { buildHomeSections, normalizeRecents, pushRecent } from './homeModel.js';
import { listRoutines, getRoutineStats } from '../routineModel.js';
import { onDataChanged } from '../dataEvents.js';

let showSectionFn = null;
let openRouteFn = null;
let searchQuery = '';
let hostEl = null;

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function catalogTools() {
  return TOOLS.filter((t) => {
    if (!isFeatureEnabled(t.id)) return false;
    if (t.category === 'reference' || t.category === 'create') return false;
    if (t.id === 'exercises' || t.id === 'workbooks' || t.id === 'musicprefs') return false;
    return true;
  });
}

function storedFavorites() {
  const catalogIds = new Set(catalogTools().map(t => t.id));
  const v = getSetting('home.favorites', []);
  return Array.isArray(v) ? v.filter(id => catalogIds.has(id)) : [];
}

function storedRecents() {
  const catalogIds = new Set(catalogTools().map(t => t.id));
  const v = getSetting('tool.recents', []);
  return normalizeRecents(Array.isArray(v) ? v.filter(entry => entry && catalogIds.has(entry.id)) : []);
}

function activeRoutines() {
  return listRoutines()
    .filter(r => getRoutineStats(r).pendingSessionCount > 0)
    .map(r => ({ id: r.id, name: r.name }));
}

function modeLabel(tool, modeId) {
  if (!tool || !modeId || !Array.isArray(tool.modes)) return '';
  const mode = tool.modes.find(m => m && m.id === modeId);
  return mode ? mode.label : '';
}

function toolCardHtml(item, { favorite = false, showMode = false } = {}) {
  const tool = getTool(item.id);
  const icon = TOOL_ICONS[item.id] || '';
  const mode = showMode && item.mode ? modeLabel(tool, item.mode) : '';
  const modeHtml = mode
    ? `<span class="tool-card-mode">${escapeHtml(mode)}</span>`
    : '';
  return `
    <div class="tool-card" data-tool-id="${escapeHtml(item.id)}" role="button" tabindex="0">
      <button type="button" class="tool-card-fav${favorite ? ' on' : ''}" data-fav-id="${escapeHtml(item.id)}" aria-label="Favorite" aria-pressed="${favorite ? 'true' : 'false'}">${favorite ? '★' : '☆'}</button>
      ${icon ? `<span class="tool-card-icon" aria-hidden="true">${icon}</span>` : ''}
      <span class="tool-card-title">${escapeHtml(item.label)}</span>
      ${modeHtml}
    </div>
  `;
}

function continueCardHtml(item) {
  return `
    <button type="button" class="continue-card" data-routine-id="${escapeHtml(item.id)}">
      <span class="tool-card-title">${escapeHtml(item.label)}</span>
    </button>
  `;
}

function renderSearchSection(section) {
  const results = (section.items || []).map(item => toolCardHtml(item, { showMode: true })).join('');
  return `
    <div class="tools-section" data-section="search">
      <h3 class="tools-section-label">${escapeHtml(section.label)}</h3>
      <input type="search" class="tools-search" placeholder="Search tools…" aria-label="Search tools" value="${escapeHtml(searchQuery)}">
      <div class="tools-search-results">${results}</div>
    </div>
  `;
}

function renderToolSection(section, { favorites = new Set(), showMode = false } = {}) {
  const cards = (section.items || []).map(item => {
    // SIMPLIFY: Continue a routine cards hidden.
    // if (item.source === 'routine') return continueCardHtml(item);
    const fav = favorites.has(item.id);
    return toolCardHtml(item, { favorite: fav, showMode });
  }).join('');
  return `
    <div class="tools-section" data-section="${escapeHtml(section.id)}">
      ${section.label ? `<h3 class="tools-section-label">${escapeHtml(section.label)}</h3>` : ''}
      ${cards}
    </div>
  `;
}

function render() {
  if (!hostEl) return;

  const favorites = storedFavorites();
  const favSet = new Set(favorites);
  const sections = buildHomeSections({
    tools: catalogTools(),
    favorites,
    recents: storedRecents(),
    // SIMPLIFY: Continue a routine section hidden.
    // activeRoutines: activeRoutines(),
    query: searchQuery,
  });

  const parts = [
    '<p class="tools-home-kicker">Practice</p>',
    '<h2 class="tools-home-title">Practice tools</h2>',
  ];

  for (const section of sections) {
    if (section.id === 'search') {
      parts.push(renderSearchSection(section));
      continue;
    }
    parts.push(renderToolSection(section, {
      favorites: favSet,
      showMode: section.id === 'recents' || section.id === 'search',
    }));
  }

  hostEl.innerHTML = parts.join('');
}

function toggleFavorite(id) {
  const list = storedFavorites();
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
  else list.push(id);
  saveSetting('home.favorites', list);
  render();
}

function openTool(id, origin = 'tools') {
  const tool = getTool(id);
  if (!tool) return;
  const recents = getSetting('tool.recents', []);
  const entry = {
    id,
    mode: tool.defaultMode || '',
    context: {},
    at: new Date().toISOString(),
  };
  saveSetting('tool.recents', pushRecent(Array.isArray(recents) ? recents : [], entry));
  if (openRouteFn) {
    openRouteFn(id, {}, { origin });
    return;
  }
  if (showSectionFn) showSectionFn(id);
}

function wireHost() {
  if (!hostEl || hostEl.dataset.wired) return;
  hostEl.dataset.wired = '1';

  hostEl.addEventListener('click', (e) => {
    const favBtn = e.target.closest('[data-fav-id]');
    if (favBtn) {
      e.stopPropagation();
      e.preventDefault();
      toggleFavorite(favBtn.dataset.favId);
      return;
    }

    // SIMPLIFY: Routines open handler hidden.
    /*
    const routineBtn = e.target.closest('[data-routine-id]');
    if (routineBtn) {
      const id = routineBtn.dataset.routineId;
      if (!id) return;
      if (openRouteFn) {
        openRouteFn('routines', { routine: id });
        return;
      }
      if (showSectionFn) showSectionFn('routines');
      return;
    }
    */

    const toolBtn = e.target.closest('[data-tool-id]');
    if (toolBtn) {
      let origin = 'tools';
      if (searchQuery.trim()) origin = 'search';
      else if (toolBtn.closest('[data-section="recents"]')) origin = 'recent';
      openTool(toolBtn.dataset.toolId, origin);
    }
  });

  hostEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const toolBtn = e.target.closest('[data-tool-id]');
    if (!toolBtn || e.target.closest('[data-fav-id]')) return;
    e.preventDefault();
    let origin = 'tools';
    if (searchQuery.trim()) origin = 'search';
    else if (toolBtn.closest('[data-section="recents"]')) origin = 'recent';
    openTool(toolBtn.dataset.toolId, origin);
  });

  hostEl.addEventListener('input', (e) => {
    if (!e.target.classList.contains('tools-search')) return;
    searchQuery = e.target.value;
    render();
    const input = hostEl.querySelector('.tools-search');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });
}

export function recordToolVisit(id, { mode } = {}) {
  const tool = getTool(id);
  if (!tool) return;
  const recents = getSetting('tool.recents', []);
  const entry = {
    id,
    mode: typeof mode === 'string' ? mode : (tool.defaultMode || ''),
    context: {},
    at: new Date().toISOString(),
  };
  saveSetting('tool.recents', pushRecent(Array.isArray(recents) ? recents : [], entry));
}

export function initToolsHome({ showSection, openRoute } = {}) {
  showSectionFn = showSection;
  openRouteFn = openRoute;
  hostEl = document.getElementById('tools-home');
  wireHost();
  render();

  if (!window.__musiToolsHomeProfileListener) {
    window.__musiToolsHomeProfileListener = true;
    window.addEventListener('musi:profile-changed', () => refreshToolsHome());
  }
  if (!window.__musiToolsHomeFeaturesListener) {
    window.__musiToolsHomeFeaturesListener = true;
    window.addEventListener('musi:features-changed', () => refreshToolsHome());
  }
  if (!window.__musiToolsHomeRoutinesListener) {
    window.__musiToolsHomeRoutinesListener = true;
    onDataChanged((detail) => {
      if (detail.domain === 'routines') refreshToolsHome();
    });
  }
}

export function refreshToolsHome() {
  render();
}
