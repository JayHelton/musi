// Area landing pages: Train, Study, Create, and Library.
//
// Every area page has the same shape: a heading, a short description, and a
// list of the tools in that area. Library uses the same renderer, so its
// landing page stays a plain list of Exercises and Workbooks, not a dashboard.

import { AREAS, TOOL_ICONS, getArea, toolsInArea } from './tools.js';

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toolRow(tool, { openTool }) {
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
  `;
  const open = () => openTool(tool.id);
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
  tools.forEach(tool => list.appendChild(toolRow(tool, { openTool })));
}

export function isAreaPage(id) {
  return AREAS.some(area => area.id === id);
}
