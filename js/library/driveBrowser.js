// A Google-Drive-style file browser, shared by the Exercises library and the
// Workbooks library. The two libraries stay separate: each one builds its own
// browser with its own data and its own actions. Only the navigation model and
// the interaction model are common.
//
// What the browser owns:
//   - the folder tree in the sidebar, with a "+ New" menu above it
//   - the breadcrumb trail, the search box, the sort control, the view toggle
//   - one level of content at a time: subfolders first, then items
//   - selection (click, ctrl-click, shift-click, hold to select on a touch
//     screen) and the selection action bar
//   - the row menu, the right-click menu, and drag-and-drop moves
//   - keyboard navigation
//
// The host supplies the data and the actions through the config object. The
// browser never reads or writes the library stores.

import { getSetting, saveSetting } from '../persistence.js';
import {
  folderById,
  folderChildren,
  folderDescendantIds,
  normalizeParentId,
  flattenFolderTree,
  canMoveFolder,
  MAX_FOLDER_DEPTH,
} from '../folderTree.js';
import {
  entryKey,
  parseEntryKey,
  normalizeViewMode,
  normalizeSort,
  toggleSort,
  sortEntries,
  filterEntries,
  buildCrumbs,
  collapseCrumbs,
  rangeKeys,
  stepKey,
  formatSize,
  formatModified,
  formatCount,
} from './driveModel.js';

// A press that stays down for this long on a touch screen starts multi-select.
const LONG_PRESS_MS = 450;
// A press that moves more than this is a scroll, not a hold.
const LONG_PRESS_SLOP_PX = 10;

const SORT_LABELS = {
  name: 'Name',
  type: 'Type',
  size: 'Size',
  modified: 'Modified',
};

const ICONS = {
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
  kebab: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>',
  sort: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 5v14m0 0-3-3m3 3 3-3"/><path d="M17 19V5m0 0-3 3m3-3 3 3"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5m0 0-7 7m7-7 7 7"/></svg>',
};

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false) return;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'onClick' && typeof value === 'function') node.addEventListener('click', value);
    else node.setAttribute(key, value === true ? '' : value);
  });
  (Array.isArray(children) ? children : [children]).forEach((child) => {
    if (child == null) return;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  });
  return node;
}

/** The Node test shim builds elements without a style object. */
function setStyle(node, name, value) {
  if (!node || !node.style) return;
  if (name.startsWith('--')) {
    if (typeof node.style.setProperty === 'function') node.style.setProperty(name, value);
    return;
  }
  node.style[name] = value;
}

function safeFocus(node) {
  if (node && typeof node.focus === 'function') {
    try {
      node.focus();
    } catch (e) {
      /* headless shim */
    }
  }
}

function isTouchPrimary() {
  try {
    return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  } catch (e) {
    return false;
  }
}

/** A pointer event with no pointerType comes from an older browser shim. */
function isTouchPointer(event) {
  const type = event && typeof event.pointerType === 'string' ? event.pointerType : '';
  if (type) return type !== 'mouse';
  return isTouchPrimary();
}

function closestIn(target, selector) {
  return target && typeof target.closest === 'function' ? target.closest(selector) : null;
}

// --- shared floating menu ---------------------------------------------------

let openMenuEl = null;
let menuDismissWired = false;

export function closeDriveMenu() {
  if (!openMenuEl) return;
  openMenuEl.remove();
  openMenuEl = null;
}

function wireMenuDismiss() {
  if (menuDismissWired) return;
  menuDismissWired = true;
  document.addEventListener('pointerdown', (e) => {
    if (!openMenuEl) return;
    if (openMenuEl.contains && openMenuEl.contains(e.target)) return;
    closeDriveMenu();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (openMenuEl && e.key === 'Escape') closeDriveMenu();
  });
}

/**
 * Opens a floating menu. Each entry is either { separator: true } or
 * { label, onClick, danger, disabled, checked, hint, depth }.
 * Position it with { x, y } for a right-click or { anchor } for a button.
 */
function openDriveMenu(entries, at = {}) {
  closeDriveMenu();
  wireMenuDismiss();

  const rows = (Array.isArray(entries) ? entries : []).filter(Boolean);
  if (!rows.length) return;

  const menu = el('div', { class: 'drv-menu', role: 'menu' });
  rows.forEach((entry) => {
    if (entry.separator) {
      menu.appendChild(el('div', { class: 'drv-menu-sep', role: 'separator' }));
      return;
    }
    if (entry.heading) {
      menu.appendChild(el('div', { class: 'drv-menu-heading', text: entry.label }));
      return;
    }
    const button = el('button', {
      class: 'drv-menu-item'
        + (entry.danger ? ' is-danger' : '')
        + (entry.checked ? ' is-checked' : ''),
      type: 'button',
      role: 'menuitem',
      disabled: entry.disabled ? '' : undefined,
    });
    if (entry.depth) setStyle(button, '--menu-depth', String(entry.depth));
    button.appendChild(el('span', { class: 'drv-menu-label', text: entry.label }));
    if (entry.hint) button.appendChild(el('span', { class: 'drv-menu-hint', text: entry.hint }));
    button.addEventListener('click', () => {
      closeDriveMenu();
      if (typeof entry.onClick === 'function') entry.onClick();
    });
    menu.appendChild(button);
  });

  document.body.appendChild(menu);
  openMenuEl = menu;

  let left = typeof at.x === 'number' ? at.x : 0;
  let top = typeof at.y === 'number' ? at.y : 0;
  if (at.anchor && typeof at.anchor.getBoundingClientRect === 'function') {
    const rect = at.anchor.getBoundingClientRect();
    left = rect.left;
    top = rect.bottom + 4;
  }

  const width = menu.offsetWidth || 224;
  const height = menu.offsetHeight || 260;
  const maxLeft = Math.max(8, (window.innerWidth || 1024) - width - 8);
  const maxTop = Math.max(8, (window.innerHeight || 768) - height - 8);
  setStyle(menu, 'left', `${Math.max(8, Math.min(left, maxLeft))}px`);
  setStyle(menu, 'top', `${Math.max(8, Math.min(top, maxTop))}px`);

  safeFocus(menu.querySelector('.drv-menu-item'));
}

// --- browser ----------------------------------------------------------------

/**
 * @param {object} config see the notes at the top of this file.
 * @returns {object} the browser API.
 */
export function createDriveBrowser(config) {
  const {
    ns,
    rootLabel,
    itemNoun = { one: 'item', many: 'items' },
    // The third column is bytes for a file library and a count for a list
    // library. Both sort on the numeric `size` an entry reports.
    sizeLabel = 'Size',
    els = {},
    listFolders,
    listItems,
    itemFolderId,
    describeItem,
    openItem,
    isItemOpen,
    itemMenuExtras,
    renameItem,
    deleteItems,
    moveItems,
    createFolder,
    renameFolder,
    moveFolder,
    requestDeleteFolder,
    newMenuExtras,
    onExternalFiles,
    emptyRootTitle,
    emptyHint,
    prompt: promptFn,
    toast,
    onNavigate,
  } = config;

  const settingKey = (name) => `library.${ns}.${name}`;
  const lastPointer = { x: 0, y: 0 };

  let folderId = String(getSetting(settingKey('folder'), '') || '');
  let sort = normalizeSort(getSetting(settingKey('sort'), null));
  let viewMode = normalizeViewMode(getSetting(settingKey('view'), 'list'));
  let query = '';
  const expanded = new Set(readExpanded());
  let selection = new Set();
  // True after a hold on a touch screen. A tap then adds or removes a row.
  let selectMode = false;
  let anchorKey = '';
  let focusKey = '';
  let dragKeys = [];
  let searchInputEl = null;
  let destroyed = false;

  function readExpanded() {
    const raw = getSetting(settingKey('expanded'), '');
    return typeof raw === 'string' && raw ? raw.split(',').filter(Boolean) : [];
  }

  function saveExpanded() {
    saveSetting(settingKey('expanded'), [...expanded].join(','));
  }

  function trackPointer(event) {
    if (event && typeof event.clientX === 'number') {
      lastPointer.x = event.clientX;
      lastPointer.y = event.clientY;
    }
  }

  function pointerAt() {
    return { x: lastPointer.x, y: lastPointer.y };
  }

  // --- data -----------------------------------------------------------------

  function folders() {
    const list = listFolders();
    return Array.isArray(list) ? list : [];
  }

  function items() {
    const list = listItems();
    return Array.isArray(list) ? list : [];
  }

  /**
   * One pass over the store. The host rebuilds its arrays on every call, so
   * reading them once per render keeps a large library responsive.
   */
  function snapshot() {
    const tree = folders();
    const ids = new Set(tree.map((folder) => folder.id));
    const byFolder = new Map();

    for (const item of items()) {
      const raw = normalizeParentId(itemFolderId(item));
      // An item whose folder is gone falls back to the root, the same as Drive.
      const key = raw && ids.has(raw) ? raw : '';
      const bucket = byFolder.get(key);
      if (bucket) bucket.push(item);
      else byFolder.set(key, [item]);
    }

    return {
      tree,
      itemsIn: (id) => byFolder.get(id) || [],
      childCount: (id) => folderChildren(tree, id).length + (byFolder.get(id) || []).length,
    };
  }

  function currentEntries(shot) {
    const view = shot || snapshot();
    const tree = view.tree;

    const folderEntries = folderChildren(tree, folderId).map((folder) => ({
      kind: 'folder',
      id: folder.id,
      name: folder.name,
      typeLabel: 'Folder',
      size: null,
      modifiedAt: '',
      count: view.childCount(folder.id),
    }));

    const itemEntries = view.itemsIn(folderId)
      .map((item) => {
        const view = describeItem(item) || {};
        return {
          kind: 'item',
          id: view.id,
          name: view.name || '',
          // One optional line of user text under the name. Workbook notes use it.
          note: view.note || '',
          typeLabel: view.typeLabel || '',
          size: typeof view.size === 'number' ? view.size : null,
          sizeText: view.sizeText || '',
          modifiedAt: view.modifiedAt || '',
          iconHtml: view.iconHtml || '',
          count: 0,
          isOpen: !!(isItemOpen && isItemOpen(item)),
          source: item,
        };
      });

    return sortEntries(filterEntries([...folderEntries, ...itemEntries], query), sort);
  }

  function visibleKeys() {
    return currentEntries().map(entryKey);
  }

  /** Item ids in the order the browser shows them. Folder rows stay out. */
  function visibleItemIds() {
    return currentEntries().filter((entry) => entry.kind === 'item').map((entry) => entry.id);
  }

  // --- selection ------------------------------------------------------------

  function selectedEntries() {
    const byKey = new Map(currentEntries().map((entry) => [entryKey(entry), entry]));
    return [...selection].map((key) => byKey.get(key)).filter(Boolean);
  }

  function clearSelection() {
    selection.clear();
    selectMode = false;
    anchorKey = '';
  }

  /** Adds the row to the selection, or removes it if it is already there. */
  function toggleSelection(key) {
    if (selection.has(key)) {
      selection.delete(key);
      if (anchorKey === key) anchorKey = '';
    } else {
      selection.add(key);
      anchorKey = key;
    }
    // The last row out also ends multi-select, so a tap opens rows again.
    if (!selection.size) selectMode = false;
  }

  function applyClickSelection(key, event) {
    const keys = visibleKeys();
    if (event && event.shiftKey && anchorKey) {
      selection = new Set(rangeKeys(keys, anchorKey, key));
      return;
    }
    if (event && (event.ctrlKey || event.metaKey)) {
      if (selection.has(key)) selection.delete(key);
      else selection.add(key);
      anchorKey = key;
      return;
    }
    selection = new Set([key]);
    anchorKey = key;
  }

  // --- navigation -----------------------------------------------------------

  function navigateTo(nextId) {
    const target = nextId && folderById(folders(), nextId) ? nextId : '';
    folderId = target;
    saveSetting(settingKey('folder'), target);
    clearSelection();
    focusKey = '';
    query = '';
    if (target) {
      for (const crumb of buildCrumbs(folders(), target, rootLabel)) {
        if (crumb.id && crumb.id !== target) expanded.add(crumb.id);
      }
      saveExpanded();
    }
    if (typeof onNavigate === 'function') onNavigate(target);
    render();
  }

  function goUp() {
    if (!folderId) return;
    const folder = folderById(folders(), folderId);
    navigateTo(folder ? normalizeParentId(folder.parentId) : '');
  }

  // --- actions --------------------------------------------------------------

  function say(message, isError) {
    if (typeof toast === 'function') toast(message, isError);
  }

  function askName(title, initial, confirmLabel) {
    if (typeof promptFn !== 'function') return Promise.resolve(null);
    return Promise.resolve(promptFn({
      title,
      value: initial || '',
      confirmLabel: confirmLabel || 'Save',
    }));
  }

  async function onNewFolder(parentId) {
    const name = await askName('New folder', '', 'Create');
    if (!name) return;
    const result = createFolder(name, parentId) || {};
    if (!result.ok) {
      if (result.reason === 'depth') say(`Folders can nest at most ${MAX_FOLDER_DEPTH} levels deep.`, true);
      else if (result.reason === 'empty') say('Enter a folder name.', true);
      else say('This folder could not be created.', true);
      return;
    }
    if (parentId) expanded.add(parentId);
    saveExpanded();
    render();
  }

  async function onRenameFolder(id, currentName) {
    const name = await askName('Rename folder', currentName, 'Save');
    if (!name || name === currentName) return;
    if (renameFolder(id, name)) render();
  }

  async function onRenameItem(id, currentName) {
    const name = await askName(`Rename ${itemNoun.one}`, currentName, 'Save');
    if (!name || name === currentName) return;
    if (renameItem(id, name)) render();
  }

  function moveTargetRows(movingFolderIds) {
    const tree = folders();
    const allowed = (targetId) => movingFolderIds.every((id) => canMoveFolder(tree, id, targetId).ok);

    const rows = [];
    if (allowed('')) rows.push({ id: '', label: rootLabel, depth: 0 });
    for (const row of flattenFolderTree(tree)) {
      if (!allowed(row.id)) continue;
      rows.push({ id: row.id, label: row.name, depth: row.depth });
    }
    return rows;
  }

  function openMoveMenu(keys, at) {
    const byKey = new Map(currentEntries().map((entry) => [entryKey(entry), entry]));
    const entries = keys.map((key) => byKey.get(key)).filter(Boolean);
    const movingFolders = entries.filter((e) => e.kind === 'folder').map((e) => e.id);
    const movingItems = entries.filter((e) => e.kind === 'item').map((e) => e.id);
    if (!movingFolders.length && !movingItems.length) return;

    const rows = moveTargetRows(movingFolders).map((row) => ({
      label: row.label,
      depth: row.depth,
      disabled: row.id === folderId,
      onClick: () => runMove(movingFolders, movingItems, row.id),
    }));

    openDriveMenu([
      { heading: true, label: 'Move to' },
      ...(rows.length ? rows : [{ label: 'No other folder available', disabled: true }]),
    ], at);
  }

  function moveBlockedMessage(reason) {
    const messages = {
      self: 'A folder cannot move into itself.',
      descendant: 'A folder cannot move into its own subfolder.',
      depth: `This move would pass the limit of ${MAX_FOLDER_DEPTH} levels.`,
      'parent-missing': 'That folder no longer exists.',
      missing: 'This folder no longer exists.',
    };
    return messages[reason] || 'This move is not allowed.';
  }

  function runMove(folderIds, itemIds, targetId) {
    let moved = 0;
    for (const id of folderIds) {
      const result = moveFolder(id, targetId) || {};
      if (result.ok) moved += 1;
      else say(moveBlockedMessage(result.reason), true);
    }
    if (itemIds.length) {
      moveItems(itemIds, targetId);
      moved += itemIds.length;
    }
    if (!moved) return 0;
    clearSelection();
    render();
    return moved;
  }

  async function onDeleteSelection() {
    const entries = selectedEntries();
    const itemIds = entries.filter((e) => e.kind === 'item').map((e) => e.id);
    const folderIds = entries.filter((e) => e.kind === 'folder').map((e) => e.id);

    if (folderIds.length === 1 && !itemIds.length && typeof requestDeleteFolder === 'function') {
      const folder = folderById(folders(), folderIds[0]);
      if (folder) requestDeleteFolder(folder.id, folder.name);
      return;
    }
    if (!itemIds.length) {
      say('Delete folders one at a time.', true);
      return;
    }
    const removed = await deleteItems(itemIds);
    clearSelection();
    render();
    if (removed) say(`Deleted ${removed} ${removed === 1 ? itemNoun.one : itemNoun.many}.`);
  }

  // --- menus ----------------------------------------------------------------

  function folderMenuEntries(id, name) {
    return [
      { label: 'Open', onClick: () => navigateTo(id) },
      { separator: true },
      { label: 'New folder inside', onClick: () => onNewFolder(id) },
      { label: 'Rename', onClick: () => onRenameFolder(id, name) },
      { label: 'Move to…', onClick: () => openMoveMenu([`folder:${id}`], pointerAt()) },
      { separator: true },
      {
        label: 'Delete',
        danger: true,
        onClick: () => {
          if (typeof requestDeleteFolder === 'function') requestDeleteFolder(id, name);
        },
      },
    ];
  }

  function itemMenuEntries(entry) {
    const extras = typeof itemMenuExtras === 'function' ? (itemMenuExtras(entry.source) || []) : [];
    return [
      { label: entry.isOpen ? 'Close' : 'Open', onClick: () => openItem(entry.source) },
      { separator: true },
      { label: 'Rename', onClick: () => onRenameItem(entry.id, entry.name) },
      { label: 'Move to…', onClick: () => openMoveMenu([entryKey(entry)], pointerAt()) },
      ...(extras.length ? [{ separator: true }, ...extras] : []),
      { separator: true },
      {
        label: 'Delete',
        danger: true,
        onClick: async () => {
          const removed = await deleteItems([entry.id]);
          clearSelection();
          render();
          if (removed) say(`Deleted “${entry.name}”.`);
        },
      },
    ];
  }

  function entryMenuEntries(entry) {
    // A multi-row selection gets the bulk menu instead of the single-row menu.
    if (selection.size > 1 && selection.has(entryKey(entry))) {
      return [
        { heading: true, label: `${selection.size} selected` },
        { label: 'Move to…', onClick: () => openMoveMenu([...selection], pointerAt()) },
        { label: 'Delete', danger: true, onClick: () => onDeleteSelection() },
      ];
    }
    return entry.kind === 'folder'
      ? folderMenuEntries(entry.id, entry.name)
      : itemMenuEntries(entry);
  }

  // --- drag and drop --------------------------------------------------------

  function draggedFolderIds() {
    return dragKeys.map(parseEntryKey).filter((k) => k.kind === 'folder').map((k) => k.id);
  }

  /** Every draggable row lives in the open folder, so that folder is a no-op target. */
  function canDropInto(targetFolderId) {
    if (!dragKeys.length) return false;
    if (targetFolderId === folderId) return false;
    const tree = folders();
    for (const id of draggedFolderIds()) {
      if (id === targetFolderId) return false;
      if (targetFolderId && folderDescendantIds(tree, id).has(targetFolderId)) return false;
      if (!canMoveFolder(tree, id, targetFolderId).ok) return false;
    }
    return true;
  }

  function clearDropHighlights() {
    document.querySelectorAll('.drv-droptarget').forEach((node) => node.classList.remove('drv-droptarget'));
  }

  function wireDragSource(node, key) {
    node.setAttribute('draggable', 'true');
    node.addEventListener('dragstart', (e) => {
      if (!selection.has(key)) {
        selection = new Set([key]);
        anchorKey = key;
        paintSelection();
        renderSelectionBar();
      }
      dragKeys = [...selection];
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        try {
          e.dataTransfer.setData('text/plain', dragKeys.join(' '));
        } catch (err) {
          /* not every browser allows custom types here */
        }
      }
      node.classList.add('is-dragging');
    });
    node.addEventListener('dragend', () => {
      dragKeys = [];
      node.classList.remove('is-dragging');
      clearDropHighlights();
    });
  }

  function wireDropTarget(node, target, { external = false } = {}) {
    const targetId = () => (typeof target === 'function' ? target() : target);

    node.addEventListener('dragover', (e) => {
      const types = e.dataTransfer && e.dataTransfer.types ? [...e.dataTransfer.types] : [];
      const hasFiles = external && types.includes('Files') && typeof onExternalFiles === 'function';
      if (!hasFiles && !canDropInto(targetId())) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = hasFiles ? 'copy' : 'move';
      node.classList.add('drv-droptarget');
    });
    node.addEventListener('dragleave', () => node.classList.remove('drv-droptarget'));
    node.addEventListener('drop', (e) => {
      node.classList.remove('drv-droptarget');
      const files = e.dataTransfer && e.dataTransfer.files ? [...e.dataTransfer.files] : [];
      if (external && files.length && typeof onExternalFiles === 'function') {
        e.preventDefault();
        onExternalFiles(files, targetId());
        return;
      }
      if (!canDropInto(targetId())) return;
      e.preventDefault();
      const keys = dragKeys.map(parseEntryKey);
      dragKeys = [];
      runMove(
        keys.filter((k) => k.kind === 'folder').map((k) => k.id),
        keys.filter((k) => k.kind === 'item').map((k) => k.id),
        targetId(),
      );
    });
  }

  // --- sidebar tree ---------------------------------------------------------

  function treeRowVisible(row) {
    let parentId = normalizeParentId(row.parentId);
    while (parentId) {
      if (!expanded.has(parentId)) return false;
      const parent = folderById(folders(), parentId);
      parentId = parent ? normalizeParentId(parent.parentId) : '';
    }
    return true;
  }

  function buildTreeRow({ id, name, depth, hasChildren, count }) {
    const isActive = folderId === id;
    const row = el('div', {
      class: 'drv-tree-row' + (isActive ? ' is-active' : ''),
      role: 'treeitem',
      tabindex: '0',
      'aria-selected': isActive ? 'true' : 'false',
      title: name,
    });
    setStyle(row, '--depth', String(depth));

    if (hasChildren) {
      const isOpen = expanded.has(id) || !id;
      row.appendChild(el('button', {
        class: 'drv-twisty' + (isOpen ? ' is-open' : ''),
        type: 'button',
        html: ICONS.chevron,
        'aria-label': isOpen ? `Collapse ${name}` : `Expand ${name}`,
        'aria-expanded': isOpen ? 'true' : 'false',
        disabled: id ? undefined : '',
        onClick: (e) => {
          e.stopPropagation();
          if (!id) return;
          if (expanded.has(id)) expanded.delete(id);
          else expanded.add(id);
          saveExpanded();
          renderTree();
        },
      }));
    } else {
      row.appendChild(el('span', { class: 'drv-twisty-gap', 'aria-hidden': 'true' }));
    }

    row.appendChild(el('span', { class: 'drv-tree-icon', 'aria-hidden': 'true', html: ICONS.folder }));
    row.appendChild(el('span', { class: 'drv-tree-name', text: name }));
    if (count) row.appendChild(el('span', { class: 'drv-tree-count', text: String(count) }));

    row.addEventListener('click', (e) => {
      if (closestIn(e.target, '.drv-twisty')) return;
      navigateTo(id);
    });
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigateTo(id);
      }
    });
    if (id) {
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        trackPointer(e);
        openDriveMenu(folderMenuEntries(id, name), { x: e.clientX, y: e.clientY });
      });
    }
    wireDropTarget(row, id);
    return row;
  }

  function renderTree() {
    const host = els.nav;
    if (!host) return;
    host.innerHTML = '';
    const view = snapshot();

    const newBtn = el('button', {
      class: 'drv-new',
      type: 'button',
      'aria-haspopup': 'menu',
    }, [
      el('span', { class: 'drv-new-icon', 'aria-hidden': 'true', html: ICONS.plus }),
      el('span', { text: 'New' }),
    ]);
    newBtn.addEventListener('click', () => {
      const extras = typeof newMenuExtras === 'function' ? (newMenuExtras(folderId) || []) : [];
      openDriveMenu([
        { label: 'New folder', onClick: () => onNewFolder(folderId) },
        ...(extras.length ? [{ separator: true }, ...extras] : []),
      ], { anchor: newBtn });
    });
    host.appendChild(newBtn);

    const tree = el('div', { class: 'drv-tree', role: 'tree', 'aria-label': rootLabel });
    tree.appendChild(buildTreeRow({
      id: '',
      name: rootLabel,
      depth: 0,
      hasChildren: false,
      count: 0,
    }));

    for (const row of flattenFolderTree(view.tree)) {
      if (!treeRowVisible(row)) continue;
      tree.appendChild(buildTreeRow({
        id: row.id,
        name: row.name,
        depth: row.depth,
        hasChildren: folderChildren(view.tree, row.id).length > 0,
        count: view.childCount(row.id),
      }));
    }
    host.appendChild(tree);
  }

  // --- breadcrumb and toolbar ----------------------------------------------

  function renderCrumbs() {
    const host = els.crumbs;
    if (!host) return;
    host.innerHTML = '';

    if (folderId) {
      host.appendChild(el('button', {
        class: 'drv-up',
        type: 'button',
        title: 'Go up one level',
        'aria-label': 'Go up one level',
        html: ICONS.up,
        onClick: () => goUp(),
      }));
    }

    const trail = collapseCrumbs(buildCrumbs(folders(), folderId, rootLabel));
    trail.forEach((crumb, index) => {
      if (index > 0) {
        host.appendChild(el('span', { class: 'drv-crumb-sep', 'aria-hidden': 'true', html: ICONS.chevron }));
      }

      if (crumb.isOverflow) {
        const more = el('button', {
          class: 'drv-crumb is-overflow',
          type: 'button',
          text: '…',
          'aria-label': 'Show the folders in between',
        });
        more.addEventListener('click', () => {
          openDriveMenu(crumb.hidden.map((hidden) => ({
            label: hidden.label,
            onClick: () => navigateTo(hidden.id),
          })), { anchor: more });
        });
        host.appendChild(more);
        return;
      }

      const button = el('button', {
        class: 'drv-crumb' + (crumb.isCurrent ? ' is-current' : ''),
        type: 'button',
        'aria-current': crumb.isCurrent ? 'page' : undefined,
      });
      button.appendChild(el('span', { class: 'drv-crumb-label', text: crumb.label }));
      if (crumb.isCurrent) {
        button.appendChild(el('span', { class: 'drv-crumb-caret', 'aria-hidden': 'true', html: ICONS.chevron }));
        button.addEventListener('click', () => {
          const entries = crumb.id
            ? folderMenuEntries(crumb.id, crumb.label)
            : [{ label: 'New folder', onClick: () => onNewFolder('') }];
          openDriveMenu(entries, { anchor: button });
        });
      } else {
        button.addEventListener('click', () => navigateTo(crumb.id));
      }
      wireDropTarget(button, crumb.id);
      host.appendChild(button);
    });
  }

  function renderTools() {
    const host = els.tools;
    if (!host) return;
    host.innerHTML = '';

    const search = el('div', { class: 'drv-search' });
    search.appendChild(el('span', { class: 'drv-search-icon', 'aria-hidden': 'true', html: ICONS.search }));
    const input = el('input', {
      type: 'text',
      class: 'drv-search-input',
      placeholder: 'Search',
      'aria-label': `Search ${rootLabel}`,
      autocomplete: 'off',
    });
    input.value = query;
    input.addEventListener('input', () => {
      query = input.value;
      renderBody();
      renderSelectionBar();
    });
    search.appendChild(input);
    searchInputEl = input;
    host.appendChild(search);

    const sortBtn = el('button', {
      class: 'drv-tool-btn',
      type: 'button',
      title: `Sort by ${sort.key === 'size' ? sizeLabel : SORT_LABELS[sort.key]}`,
      'aria-label': `Sort by ${sort.key === 'size' ? sizeLabel : SORT_LABELS[sort.key]}`,
      html: ICONS.sort,
    });
    sortBtn.addEventListener('click', () => {
      openDriveMenu(Object.keys(SORT_LABELS).map((key) => ({
        label: key === 'size' ? sizeLabel : SORT_LABELS[key],
        checked: sort.key === key,
        hint: sort.key === key ? (sort.dir === 'asc' ? '↑' : '↓') : '',
        onClick: () => applySort(key),
      })), { anchor: sortBtn });
    });
    host.appendChild(sortBtn);

    const wantsGrid = viewMode === 'list';
    const viewBtn = el('button', {
      class: 'drv-tool-btn',
      type: 'button',
      title: wantsGrid ? 'Switch to grid view' : 'Switch to list view',
      'aria-label': wantsGrid ? 'Switch to grid view' : 'Switch to list view',
      html: wantsGrid ? ICONS.grid : ICONS.list,
    });
    viewBtn.addEventListener('click', () => {
      viewMode = wantsGrid ? 'grid' : 'list';
      saveSetting(settingKey('view'), viewMode);
      render();
    });
    host.appendChild(viewBtn);
  }

  function applySort(key) {
    sort = toggleSort(sort, key);
    saveSetting(settingKey('sort'), { key: sort.key, dir: sort.dir });
    render();
  }

  // --- selection bar --------------------------------------------------------

  function renderSelectionBar() {
    const host = els.selectionBar;
    if (!host) return;
    host.innerHTML = '';

    const topbar = host.parentElement;
    if (!selection.size) {
      host.hidden = true;
      if (topbar && topbar.classList) topbar.classList.remove('is-selecting');
      return;
    }
    host.hidden = false;
    if (topbar && topbar.classList) topbar.classList.add('is-selecting');

    host.appendChild(el('button', {
      class: 'drv-sel-close',
      type: 'button',
      title: 'Clear selection',
      'aria-label': 'Clear selection',
      text: '✕',
      onClick: () => {
        clearSelection();
        render();
      },
    }));
    host.appendChild(el('span', { class: 'drv-sel-count', text: `${selection.size} selected` }));

    const actions = el('div', { class: 'drv-sel-actions' });
    const moveBtn = el('button', { class: 'btn sm', type: 'button', text: 'Move to…' });
    moveBtn.addEventListener('click', () => openMoveMenu([...selection], { anchor: moveBtn }));
    actions.appendChild(moveBtn);
    actions.appendChild(el('button', {
      class: 'btn sm',
      type: 'button',
      text: 'Select all',
      onClick: () => {
        selection = new Set(visibleKeys());
        paintSelection();
        renderSelectionBar();
      },
    }));
    actions.appendChild(el('button', {
      class: 'btn sm drv-sel-del',
      type: 'button',
      text: 'Delete',
      onClick: () => onDeleteSelection(),
    }));
    host.appendChild(actions);
  }

  // --- rows -----------------------------------------------------------------

  function activateEntry(entry) {
    if (entry.kind === 'folder') navigateTo(entry.id);
    else openItem(entry.source);
  }

  function wireRowInteraction(node, entry) {
    const key = entryKey(entry);
    const openOnSingleTap = isTouchPrimary();
    let pressTimer = null;
    let pressStart = null;
    // Set when a hold selects the row. The tap and the menu that follow the
    // hold must not open the row as well.
    let heldToSelect = false;
    // A click event carries no pointer type, so the press before it tells the
    // row whether a finger or a mouse made it.
    let touchPress = openOnSingleTap;

    function endPress() {
      if (pressTimer) clearTimeout(pressTimer);
      pressTimer = null;
      pressStart = null;
    }

    function onHold() {
      pressTimer = null;
      heldToSelect = true;
      selectMode = true;
      toggleSelection(key);
      paintSelection();
      renderSelectionBar();
      try {
        if (navigator && typeof navigator.vibrate === 'function') navigator.vibrate(12);
      } catch (err) {
        /* haptics are optional */
      }
    }

    node.addEventListener('pointerdown', (e) => {
      endPress();
      heldToSelect = false;
      touchPress = isTouchPointer(e);
      if (closestIn(e.target, '.drv-kebab')) return;
      if (!touchPress) return;
      pressStart = { x: e.clientX || 0, y: e.clientY || 0 };
      pressTimer = setTimeout(onHold, LONG_PRESS_MS);
    });

    node.addEventListener('pointermove', (e) => {
      if (!pressTimer || !pressStart) return;
      const dx = Math.abs((e.clientX || 0) - pressStart.x);
      const dy = Math.abs((e.clientY || 0) - pressStart.y);
      if (dx > LONG_PRESS_SLOP_PX || dy > LONG_PRESS_SLOP_PX) endPress();
    });

    ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => {
      node.addEventListener(type, endPress);
    });

    node.addEventListener('click', (e) => {
      if (closestIn(e.target, '.drv-kebab')) return;
      endPress();
      trackPointer(e);
      focusKey = key;
      // The tap that ends a hold belongs to the hold, not to the row.
      if (heldToSelect) {
        heldToSelect = false;
        return;
      }
      const plain = !e.ctrlKey && !e.metaKey && !e.shiftKey;
      // A hold started multi-select, so a tap now adds the row or takes it
      // out again. The row opens again after the last row leaves.
      if (plain && selectMode && touchPress) {
        toggleSelection(key);
        paintSelection();
        renderSelectionBar();
        return;
      }
      // A finger has no modifier keys, so a plain tap opens the row. It must
      // not select as well, or the selection bar appears with no way to build
      // on it and no obvious way to dismiss it.
      if (openOnSingleTap && plain) {
        activateEntry(entry);
        return;
      }
      applyClickSelection(key, e);
      paintSelection();
      renderSelectionBar();
    });

    node.addEventListener('dblclick', (e) => {
      if (closestIn(e.target, '.drv-kebab')) return;
      activateEntry(entry);
    });

    node.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      endPress();
      // A touch screen fires this after the hold. The hold selects instead.
      if (heldToSelect) return;
      trackPointer(e);
      if (!selection.has(key)) {
        selection = new Set([key]);
        anchorKey = key;
        paintSelection();
        renderSelectionBar();
      }
      openDriveMenu(entryMenuEntries(entry), { x: e.clientX, y: e.clientY });
    });

    wireDragSource(node, key);
    if (entry.kind === 'folder') wireDropTarget(node, entry.id, { external: true });
  }

  function buildKebab(entry) {
    const button = el('button', {
      class: 'drv-kebab',
      type: 'button',
      title: 'More actions',
      'aria-label': `More actions for ${entry.name}`,
      'aria-haspopup': 'menu',
      html: ICONS.kebab,
    });
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      trackPointer(e);
      openDriveMenu(entryMenuEntries(entry), { anchor: button });
    });
    return button;
  }

  function rowClassFor(entry, base) {
    const key = entryKey(entry);
    return base
      + (entry.kind === 'folder' ? ' is-folder' : ' is-item')
      + (selection.has(key) ? ' is-selected' : '')
      + (entry.isOpen ? ' is-open' : '');
  }

  function buildListRow(entry, isFirst) {
    const key = entryKey(entry);
    const row = el('div', {
      class: rowClassFor(entry, 'drv-row'),
      'data-key': key,
      role: 'row',
      tabindex: focusKey === key || (!focusKey && isFirst) ? '0' : '-1',
      'aria-selected': selection.has(key) ? 'true' : 'false',
    });
    row.dataset.key = key;

    const name = el('div', { class: 'drv-cell drv-cell-name', role: 'gridcell' });
    name.appendChild(el('span', {
      class: 'drv-row-icon',
      'aria-hidden': 'true',
      html: entry.kind === 'folder' ? ICONS.folder : (entry.iconHtml || ICONS.folder),
    }));
    if (entry.note) {
      // The note goes under the name, so the name keeps its full width.
      const text = el('div', { class: 'drv-row-text' });
      text.appendChild(el('span', { class: 'drv-row-name', text: entry.name, title: entry.name }));
      text.appendChild(el('span', { class: 'drv-row-note', text: entry.note, title: entry.note }));
      name.appendChild(text);
    } else {
      name.appendChild(el('span', { class: 'drv-row-name', text: entry.name, title: entry.name }));
    }
    if (entry.isOpen) name.appendChild(el('span', { class: 'drv-row-badge', text: 'Open' }));
    row.appendChild(name);

    row.appendChild(el('div', {
      class: 'drv-cell drv-cell-type', role: 'gridcell', text: entry.typeLabel || '—',
    }));
    row.appendChild(el('div', {
      class: 'drv-cell drv-cell-size',
      role: 'gridcell',
      text: entry.kind === 'folder'
        ? (formatCount(entry.count) || '—')
        : (entry.sizeText || formatSize(entry.size)),
    }));
    row.appendChild(el('div', {
      class: 'drv-cell drv-cell-mod', role: 'gridcell', text: formatModified(entry.modifiedAt),
    }));
    row.appendChild(buildKebab(entry));

    wireRowInteraction(row, entry);
    return row;
  }

  function buildTile(entry, isFirst) {
    const key = entryKey(entry);
    const tile = el('div', {
      class: rowClassFor(entry, 'drv-tile'),
      'data-key': key,
      role: 'row',
      tabindex: focusKey === key || (!focusKey && isFirst) ? '0' : '-1',
      'aria-selected': selection.has(key) ? 'true' : 'false',
    });
    tile.dataset.key = key;

    const head = el('div', { class: 'drv-tile-head' });
    head.appendChild(el('span', {
      class: 'drv-tile-icon',
      'aria-hidden': 'true',
      html: entry.kind === 'folder' ? ICONS.folder : (entry.iconHtml || ICONS.folder),
    }));
    // The name and the count stack, so the name gets the full width of the
    // tile instead of competing with the count for one row.
    const text = el('div', { class: 'drv-tile-text' });
    text.appendChild(el('span', { class: 'drv-tile-name', text: entry.name, title: entry.name }));
    if (entry.kind === 'folder') {
      text.appendChild(el('span', {
        class: 'drv-tile-sub',
        text: formatCount(entry.count) || 'Empty',
      }));
    } else if (entry.note) {
      text.appendChild(el('span', {
        class: 'drv-tile-sub',
        text: entry.note,
        title: entry.note,
      }));
    }
    head.appendChild(text);
    head.appendChild(buildKebab(entry));
    tile.appendChild(head);

    if (entry.kind !== 'folder') {
      tile.appendChild(el('div', {
        class: 'drv-tile-thumb',
        'aria-hidden': 'true',
        html: entry.iconHtml || ICONS.folder,
      }));
      const metaParts = [
        entry.typeLabel,
        entry.sizeText || formatSize(entry.size),
        formatModified(entry.modifiedAt),
      ];
      tile.appendChild(el('div', {
        class: 'drv-tile-meta',
        text: metaParts.filter((part) => part && part !== '—').join(' · '),
      }));
    }

    wireRowInteraction(tile, entry);
    return tile;
  }

  /** Repaints the selection classes without rebuilding the rows. */
  function paintSelection() {
    const host = els.content;
    if (!host) return;
    [...host.querySelectorAll('.drv-row'), ...host.querySelectorAll('.drv-tile')].forEach((node) => {
      const on = selection.has(node.dataset.key);
      node.classList.toggle('is-selected', on);
      node.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  // --- body -----------------------------------------------------------------

  function buildColumnHeader() {
    const head = el('div', { class: 'drv-cols', role: 'row' });
    const column = (key, label, extraClass) => {
      const active = sort.key === key;
      const button = el('button', {
        class: `drv-col ${extraClass}` + (active ? ' is-sorted' : ''),
        type: 'button',
        'aria-sort': active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none',
      });
      button.appendChild(el('span', { text: label }));
      button.appendChild(el('span', {
        class: 'drv-col-arrow',
        'aria-hidden': 'true',
        text: active ? (sort.dir === 'asc' ? '▲' : '▼') : '',
      }));
      button.addEventListener('click', () => applySort(key));
      return button;
    };
    head.appendChild(column('name', 'Name', 'drv-col-name'));
    head.appendChild(column('type', 'Type', 'drv-col-type'));
    head.appendChild(column('size', sizeLabel, 'drv-col-size'));
    head.appendChild(column('modified', 'Modified', 'drv-col-mod'));
    head.appendChild(el('span', { class: 'drv-col-gap', 'aria-hidden': 'true' }));
    return head;
  }

  function buildEmptyState() {
    const wrap = el('div', { class: 'drv-empty' });
    wrap.appendChild(el('div', { class: 'drv-empty-icon', 'aria-hidden': 'true', html: ICONS.folder }));

    if (query) {
      wrap.appendChild(el('div', { class: 'drv-empty-title', text: `No matches for “${query}”` }));
      wrap.appendChild(el('div', { class: 'drv-empty-hint', text: 'Clear the search box to see this folder again.' }));
      return wrap;
    }

    wrap.appendChild(el('div', {
      class: 'drv-empty-title',
      text: folderId ? 'This folder is empty' : (emptyRootTitle || `No ${itemNoun.many} yet`),
    }));
    wrap.appendChild(el('div', {
      class: 'drv-empty-hint',
      text: emptyHint || `Use + New to add ${itemNoun.many} here.`,
    }));
    return wrap;
  }

  function renderBody(shot) {
    const host = els.content;
    if (!host) return;
    host.innerHTML = '';
    host.className = `drv-content is-${viewMode}`;

    const entries = currentEntries(shot);
    if (!entries.length) {
      host.appendChild(buildEmptyState());
      return;
    }

    const folderEntries = entries.filter((entry) => entry.kind === 'folder');
    const itemEntries = entries.filter((entry) => entry.kind === 'item');
    const showGroupLabels = folderEntries.length > 0 && itemEntries.length > 0;

    if (viewMode === 'list') host.appendChild(buildColumnHeader());

    let first = true;
    const addGroup = (label, rows) => {
      if (!rows.length) return;
      if (showGroupLabels) host.appendChild(el('div', { class: 'drv-group', text: label }));
      const wrap = el('div', {
        class: viewMode === 'list' ? 'drv-rows' : 'drv-tiles',
        role: 'rowgroup',
      });
      rows.forEach((entry) => {
        const node = viewMode === 'list' ? buildListRow(entry, first) : buildTile(entry, first);
        first = false;
        wrap.appendChild(node);
      });
      host.appendChild(wrap);
    };

    addGroup('Folders', folderEntries);
    addGroup(itemNoun.many.charAt(0).toUpperCase() + itemNoun.many.slice(1), itemEntries);
  }

  // --- keyboard -------------------------------------------------------------

  function focusRow(key) {
    const host = els.content;
    if (!host) return;
    const nodes = [...host.querySelectorAll('.drv-row'), ...host.querySelectorAll('.drv-tile')];
    const target = nodes.find((node) => node.dataset.key === key);
    if (!target) return;
    nodes.forEach((node) => node.setAttribute('tabindex', node === target ? '0' : '-1'));
    safeFocus(target);
  }

  function onBodyKeydown(e) {
    if (closestIn(e.target, '.drv-search')) return;
    const keys = visibleKeys();
    if (!keys.length) return;
    const byKey = new Map(currentEntries().map((entry) => [entryKey(entry), entry]));
    const current = focusKey || keys[0];

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = focusKey ? stepKey(keys, current, e.key === 'ArrowDown' ? 1 : -1) : current;
      focusKey = next;
      if (e.shiftKey && anchorKey) {
        selection = new Set(rangeKeys(keys, anchorKey, next));
      } else {
        selection = new Set([next]);
        anchorKey = next;
      }
      paintSelection();
      renderSelectionBar();
      focusRow(next);
      return;
    }

    if (e.key === 'Enter') {
      const entry = byKey.get(current);
      if (!entry) return;
      e.preventDefault();
      activateEntry(entry);
      return;
    }

    if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowLeft')) {
      if (!folderId) return;
      e.preventDefault();
      goUp();
      return;
    }

    if (e.key === 'Escape') {
      if (!selection.size) return;
      e.preventDefault();
      clearSelection();
      render();
      return;
    }

    if (e.key === 'Delete') {
      if (!selection.size) return;
      e.preventDefault();
      onDeleteSelection();
      return;
    }

    if (e.key === 'F2') {
      const entry = byKey.get(current);
      if (!entry) return;
      e.preventDefault();
      if (entry.kind === 'folder') onRenameFolder(entry.id, entry.name);
      else onRenameItem(entry.id, entry.name);
      return;
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      selection = new Set(keys);
      paintSelection();
      renderSelectionBar();
    }
  }

  // --- lifecycle ------------------------------------------------------------

  function render() {
    if (destroyed) return;
    // The open folder may have been deleted since the last visit.
    if (folderId && !folderById(folders(), folderId)) {
      folderId = '';
      saveSetting(settingKey('folder'), '');
      clearSelection();
    }
    const live = new Set(visibleKeys());
    [...selection].forEach((key) => {
      if (!live.has(key)) selection.delete(key);
    });
    if (!selection.size) selectMode = false;

    renderTree();
    renderCrumbs();
    renderTools();
    renderSelectionBar();
    renderBody(snapshot());
  }

  function wire() {
    const host = els.content;
    if (!host) return;
    host.addEventListener('keydown', onBodyKeydown);
    host.addEventListener('pointerdown', trackPointer);
    // A click on the background of the pane clears the selection, as in Drive.
    host.addEventListener('click', (e) => {
      if (e.target !== host) return;
      if (!selection.size) return;
      clearSelection();
      render();
    });
    host.addEventListener('contextmenu', (e) => {
      if (e.target !== host) return;
      e.preventDefault();
      trackPointer(e);
      const extras = typeof newMenuExtras === 'function' ? (newMenuExtras(folderId) || []) : [];
      openDriveMenu([
        { label: 'New folder', onClick: () => onNewFolder(folderId) },
        ...(extras.length ? [{ separator: true }, ...extras] : []),
      ], { x: e.clientX, y: e.clientY });
    });
    // The pane always drops into whichever folder is open at that moment.
    wireDropTarget(host, () => folderId, { external: true });
  }

  wire();

  return {
    render,
    navigateTo,
    getFolderId: () => folderId,
    listItemIds: visibleItemIds,
    getSelection: () => [...selection],
    clearSelection: () => {
      clearSelection();
      render();
    },
    focusSearch: () => safeFocus(searchInputEl),
    destroy: () => {
      destroyed = true;
      closeDriveMenu();
    },
  };
}
