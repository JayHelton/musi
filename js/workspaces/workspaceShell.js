/**
 * Shared workspace chrome: objective header, view tab bar, and view region.
 */

/**
 * @param {Element} container
 * @param {{ label: string, views: Array<{id: string, label: string}>, currentView: string, onTabSelect: (id: string) => void, headerActions?: (host: Element) => void }} opts
 * @returns {{ shell: Element, viewRegion: Element, updateTabs: (viewId: string) => void }}
 */
export function createWorkspaceShell(container, { label, views, currentView, onTabSelect, headerActions }) {
  container.innerHTML = '';
  const shell = document.createElement('div');
  shell.className = 'workspace-shell';

  const header = document.createElement('header');
  header.className = 'workspace-header';

  const title = document.createElement('h2');
  title.className = 'workspace-title';
  title.textContent = label;
  header.appendChild(title);

  const headerRow = document.createElement('div');
  headerRow.className = 'workspace-header-row';

  const tablist = document.createElement('div');
  tablist.className = 'workspace-tabs';
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', `${label} views`);

  const tabs = [];
  views.forEach((v) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'workspace-tab' + (v.id === currentView ? ' active' : '');
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', v.id === currentView ? 'true' : 'false');
    tab.dataset.view = v.id;
    tab.textContent = v.label;
    tab.onclick = () => onTabSelect(v.id);
    tablist.appendChild(tab);
    tabs.push(tab);
  });

  tablist.addEventListener('keydown', (e) => {
    const idx = tabs.findIndex((t) => t.classList.contains('active'));
    if (idx < 0) return;
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    tabs[next].focus();
    onTabSelect(tabs[next].dataset.view);
  });

  headerRow.appendChild(tablist);
  if (headerActions) {
    const actions = document.createElement('div');
    actions.className = 'workspace-header-actions';
    headerActions(actions);
    headerRow.appendChild(actions);
  }
  header.appendChild(headerRow);
  shell.appendChild(header);

  const viewRegion = document.createElement('div');
  viewRegion.className = 'workspace-view';
  shell.appendChild(viewRegion);

  container.appendChild(shell);

  function updateTabs(viewId) {
    tabs.forEach((tab) => {
      const active = tab.dataset.view === viewId;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  return { shell, viewRegion, updateTabs };
}

/**
 * @param {Element} host
 * @param {Array<{id: string, label: string, beta?: boolean}>} chips
 * @param {string} activeId
 * @param {(id: string) => void} onSelect
 */
export function renderChipRow(host, chips, activeId, onSelect) {
  const row = document.createElement('div');
  row.className = 'workspace-chips';
  row.setAttribute('role', 'tablist');
  chips.forEach((chip) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'workspace-chip' + (chip.id === activeId ? ' active' : '');
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', chip.id === activeId ? 'true' : 'false');
    btn.textContent = chip.label + (chip.beta ? ' (Beta)' : '');
    btn.onclick = () => onSelect(chip.id);
    row.appendChild(btn);
  });
  host.appendChild(row);
  return row;
}
