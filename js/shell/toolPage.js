import { initSubviewTabs, openOverflowMenu } from '../uxPrimitives.js';

const mountedHandles = new WeakMap();

function mapOverflowItems(items) {
  return (items || []).map((item) => ({
    label: item.label,
    danger: !!item.destructive,
    onClick: item.onSelect,
  }));
}

function buildHeader(descriptor) {
  const header = document.createElement('div');
  header.className = 'tool-page-header';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'tool-page-back tool-back';
  backBtn.textContent = '← Back';
  if (typeof descriptor.onBack === 'function') {
    backBtn.onclick = () => descriptor.onBack();
  }

  const title = document.createElement('h1');
  title.dataset.pageHeading = '';
  title.textContent = descriptor.title || '';

  const favBtn = document.createElement('button');
  favBtn.type = 'button';
  favBtn.className = 'tool-page-favorite';
  favBtn.setAttribute('aria-label', 'Favorite');
  let isFavorite = !!descriptor.isFavorite;

  function syncFavorite() {
    favBtn.setAttribute('aria-pressed', isFavorite ? 'true' : 'false');
    favBtn.textContent = isFavorite ? '★' : '☆';
  }
  syncFavorite();
  favBtn.onclick = () => {
    isFavorite = !isFavorite;
    syncFavorite();
    if (typeof descriptor.onFavorite === 'function') descriptor.onFavorite(isFavorite);
  };

  const moreBtn = document.createElement('button');
  moreBtn.type = 'button';
  moreBtn.className = 'tool-page-more';
  moreBtn.setAttribute('aria-label', 'More');
  moreBtn.textContent = '⋯';
  moreBtn.onclick = () => {
    openOverflowMenu(moreBtn, mapOverflowItems(descriptor.moreItems));
  };

  header.append(backBtn, title, favBtn, moreBtn);
  return header;
}

function buildContextChip(field) {
  const item = document.createElement('div');
  item.className = 'tool-page-context-item';

  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'tool-page-context-chip setup-chip';
  chip.dataset.key = field.key;
  chip.setAttribute('aria-label', `${field.label || field.key}: ${field.value}`);

  if (field.label) {
    const label = document.createElement('span');
    label.className = 'tool-page-context-label';
    label.textContent = field.label;
    chip.appendChild(label);
  }

  const value = document.createElement('span');
  value.className = 'setup-chip-value';
  value.textContent = field.value ?? '';
  chip.appendChild(value);

  if (field.hint) {
    const hint = document.createElement('span');
    hint.className = 'setup-chip-hint';
    hint.textContent = field.hint;
    chip.appendChild(hint);
  }

  if (typeof field.onClick === 'function') {
    chip.onclick = () => field.onClick();
  }

  item.appendChild(chip);

  if (field.fallbackReason) {
    const reason = document.createElement('span');
    reason.className = 'tool-page-context-fallback';
    reason.textContent = field.fallbackReason;
    item.appendChild(reason);
  }

  return item;
}

export function mountToolPage(sectionEl, descriptor = {}) {
  if (!sectionEl) {
    throw new Error('mountToolPage requires a section element');
  }

  if (sectionEl.dataset.toolPage === '1') {
    const existing = mountedHandles.get(sectionEl);
    if (existing) return existing;
  }

  const existingChildren = [...sectionEl.children];
  const sectionHead = existingChildren.find((child) => child.classList?.contains('section-head')) || null;
  if (sectionHead) {
    sectionHead.querySelectorAll('.tool-back:not(.tool-page-back)').forEach((btn) => btn.remove());
    sectionHead.hidden = true;
  }

  const page = document.createElement('div');
  page.className = 'tool-page';

  const header = buildHeader(descriptor);

  const descriptionEl = document.createElement('p');
  descriptionEl.className = 'tool-page-description';
  descriptionEl.textContent = descriptor.description || '';
  descriptionEl.hidden = !descriptor.description;

  const contextEl = document.createElement('div');
  contextEl.className = 'tool-page-context';
  contextEl.hidden = true;

  const modesEl = document.createElement('div');
  modesEl.className = 'tool-page-modes';
  modesEl.id = `tool-page-modes-${descriptor.id || 'tool'}`;

  let modesController = null;
  if (descriptor.modes?.length) {
    modesController = initSubviewTabs(modesEl, descriptor.modes, {
      defaultId: descriptor.activeMode || descriptor.defaultMode,
      className: 'tool-page-modes subview-tabs',
      onChange: (id) => {
        if (typeof descriptor.onModeChange === 'function') descriptor.onModeChange(id);
      },
    });
  }

  const workspace = document.createElement('div');
  workspace.className = 'tool-page-workspace';
  existingChildren.forEach((child) => {
    if (child === sectionHead) return;
    if (child.parentElement === sectionEl) sectionEl.removeChild(child);
    workspace.appendChild(child);
  });

  const primaryEl = document.createElement('div');
  primaryEl.className = 'tool-page-primary';

  const advancedEl = document.createElement('details');
  advancedEl.className = 'adv-options tool-page-advanced';
  advancedEl.innerHTML = '<summary><span class="adv-gear">⚙</span> Advanced options</summary>';

  const syncAdvancedVisibility = () => {
    const hasContent = [...advancedEl.children].some((ch) => ch.tagName !== 'SUMMARY');
    if (hasContent) advancedEl.dataset.hasContent = '';
    else delete advancedEl.dataset.hasContent;
  };
  let advancedObserver = null;
  if (typeof MutationObserver === 'function') {
    advancedObserver = new MutationObserver(syncAdvancedVisibility);
    advancedObserver.observe(advancedEl, { childList: true });
  }

  page.append(header, descriptionEl, contextEl, modesEl, workspace, primaryEl, advancedEl);
  sectionEl.appendChild(page);
  sectionEl.dataset.toolPage = '1';

  function setContextRow(fields) {
    contextEl.innerHTML = '';
    const list = Array.isArray(fields) ? fields : [];
    if (!list.length) {
      contextEl.hidden = true;
      return;
    }

    contextEl.hidden = false;
    const row = document.createElement('div');
    row.className = 'tool-page-context-fields';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', 'Context');

    list.forEach((field) => {
      row.appendChild(buildContextChip(field));
    });

    const defaultHandler = list.find((field) => typeof field.onSetDefault === 'function');
    if (defaultHandler) {
      const defaultBtn = document.createElement('button');
      defaultBtn.type = 'button';
      defaultBtn.className = 'tool-page-context-default';
      defaultBtn.textContent = 'Set as default';
      defaultBtn.onclick = () => defaultHandler.onSetDefault();
      row.appendChild(defaultBtn);
    }

    contextEl.appendChild(row);
  }

  function setModes(modes, activeId) {
    modesController = initSubviewTabs(modesEl, modes, {
      defaultId: activeId,
      className: 'tool-page-modes subview-tabs',
      onChange: (id) => {
        if (typeof descriptor.onModeChange === 'function') descriptor.onModeChange(id);
      },
    });
    if (activeId && modesController?.setActive) {
      modesController.setActive(activeId, { silent: true });
    }
  }

  /** Switch modes without telling the caller; used when a route sets the mode. */
  function setActiveMode(id) {
    if (!id || !modesController?.setActive) return;
    modesController.setActive(id, { silent: true });
  }

  function activeMode() {
    return modesController ? modesController.active : '';
  }

  function destroy() {
    advancedObserver?.disconnect();
    while (workspace.firstChild) {
      const child = workspace.firstChild;
      workspace.removeChild(child);
      sectionEl.appendChild(child);
    }
    page.remove();
    delete sectionEl.dataset.toolPage;
    mountedHandles.delete(sectionEl);
  }

  const handle = { workspace, setContextRow, setModes, setActiveMode, activeMode, destroy };
  mountedHandles.set(sectionEl, handle);
  return handle;
}
