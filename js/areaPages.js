// Area landing pages: Train, Study, Create, and Library.
//
// Every area page has the same shape: a heading, a short description, and a
// list of the tools in that area. Library uses the same renderer, so its
// landing page stays a plain list of Exercises and Workbooks, not a dashboard.

import { getSetting, saveSetting } from './persistence.js';
import { AREAS, TOOL_ICONS, getArea, getTool, toolsInArea } from './tools.js';

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function favorites() {
  const stored = getSetting('home.favorites', []);
  return Array.isArray(stored) ? stored.filter(id => !!getTool(id)) : [];
}

function toggleFavorite(id) {
  const list = favorites();
  const index = list.indexOf(id);
  if (index >= 0) list.splice(index, 1);
  else list.push(id);
  saveSetting('home.favorites', list);
}

function toolRow(tool, { openTool, onFavorite }) {
  const isFavorite = favorites().includes(tool.id);
  const row = document.createElement('div');
  row.className = 'area-tool-row';
  row.dataset.toolId = tool.id;
  row.setAttribute('role', 'button');
  row.tabIndex = 0;
  row.innerHTML = `
    <span class="area-tool-icon" aria-hidden="true">${TOOL_ICONS[tool.id] || ''}</span>
    <span class="area-tool-meta">
      <span class="area-tool-title">${escapeHtml(tool.label)}</span>
      <span class="area-tool-desc">${escapeHtml(tool.description)}</span>
    </span>
    <button type="button" class="area-tool-fav${isFavorite ? ' on' : ''}" aria-label="Favorite" aria-pressed="${isFavorite ? 'true' : 'false'}">${isFavorite ? '★' : '☆'}</button>
  `;
  row.querySelector('.area-tool-fav').onclick = (e) => {
    e.stopPropagation();
    toggleFavorite(tool.id);
    if (onFavorite) onFavorite();
  };
  const open = (e) => {
    if (e.target.closest('.area-tool-fav')) return;
    openTool(tool.id);
  };
  row.addEventListener('click', open);
  row.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    open(e);
  });
  return row;
}

/**
 * Paint one area landing page.
 * @param {string} areaId one of the ids in AREAS
 * @param {HTMLElement} container the `sec-<areaId>` element
 * @param {{ openTool: (id: string) => void }} handlers
 */
export function renderAreaPage(areaId, container, { openTool } = {}) {
  if (!container) return;
  const area = getArea(areaId);
  if (!area) return;
  const tools = toolsInArea(areaId);

  container.innerHTML = `
    <div class="section-head area-head">
      <h2 data-page-heading>${escapeHtml(area.label)}</h2>
      <p>${escapeHtml(area.description)}</p>
    </div>
    <div class="area-tool-list"></div>
  `;

  const list = container.querySelector('.area-tool-list');
  const repaint = () => renderAreaPage(areaId, container, { openTool });
  const pinned = favorites().filter(id => tools.some(t => t.id === id));

  if (pinned.length) {
    const label = document.createElement('div');
    label.className = 'area-list-label';
    label.textContent = 'Pinned';
    list.appendChild(label);
    pinned.forEach(id => {
      const tool = getTool(id);
      if (tool) list.appendChild(toolRow(tool, { openTool, onFavorite: repaint }));
    });
    const all = document.createElement('div');
    all.className = 'area-list-label';
    all.textContent = 'All';
    list.appendChild(all);
  }

  tools.forEach(tool => list.appendChild(toolRow(tool, { openTool, onFavorite: repaint })));
}

export function isAreaPage(id) {
  return AREAS.some(area => area.id === id);
}
