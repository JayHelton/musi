// Pure helpers for the Google-Drive-style library browser. Both the Exercises
// library and the Workbooks library use these. No DOM access and no storage
// access, so the Node tests can call every function directly.
//
// An "entry" is one row in the browser. It has this shape:
//   { kind: 'folder' | 'item', id, name, typeLabel, size, modifiedAt, count }
// Folders always sort before items, the same as Google Drive.

import { folderPath } from '../folderTree.js';

export const VIEW_MODES = ['list', 'grid'];
export const SORT_KEYS = ['name', 'type', 'size', 'modified'];
export const SORT_DIRS = ['asc', 'desc'];

/** Descending is the useful first click for these columns. */
const DESC_FIRST_KEYS = new Set(['size', 'modified']);

export function entryKey(entry) {
  if (!entry) return '';
  return `${entry.kind}:${entry.id}`;
}

export function parseEntryKey(key) {
  const raw = typeof key === 'string' ? key : '';
  const idx = raw.indexOf(':');
  if (idx < 0) return { kind: '', id: '' };
  return { kind: raw.slice(0, idx), id: raw.slice(idx + 1) };
}

export function normalizeViewMode(raw) {
  return VIEW_MODES.includes(raw) ? raw : 'list';
}

export function normalizeSort(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const key = SORT_KEYS.includes(source.key) ? source.key : 'name';
  const dir = SORT_DIRS.includes(source.dir) ? source.dir : 'asc';
  return { key, dir };
}

/** Click a column that is already active to flip it; a new column starts in its natural direction. */
export function toggleSort(current, key) {
  const now = normalizeSort(current);
  if (!SORT_KEYS.includes(key)) return now;
  if (now.key === key) {
    return { key, dir: now.dir === 'asc' ? 'desc' : 'asc' };
  }
  return { key, dir: DESC_FIRST_KEYS.has(key) ? 'desc' : 'asc' };
}

function compareText(a, b) {
  const left = typeof a === 'string' ? a : '';
  const right = typeof b === 'string' ? b : '';
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

function compareNumber(a, b) {
  const left = typeof a === 'number' && Number.isFinite(a) ? a : -1;
  const right = typeof b === 'number' && Number.isFinite(b) ? b : -1;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function compareByKey(a, b, key) {
  if (key === 'type') return compareText(a.typeLabel, b.typeLabel);
  if (key === 'size') return compareNumber(a.size, b.size);
  if (key === 'modified') return compareText(a.modifiedAt, b.modifiedAt);
  return compareText(a.name, b.name);
}

/**
 * Sorts entries for display. Folders stay above items in every sort order.
 * The name column breaks every tie, so the order is stable and predictable.
 */
export function sortEntries(entries, sort) {
  const list = Array.isArray(entries) ? entries.slice() : [];
  const { key, dir } = normalizeSort(sort);
  const sign = dir === 'desc' ? -1 : 1;

  list.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    const primary = compareByKey(a, b, key);
    if (primary !== 0) return primary * sign;
    if (key === 'name') return 0;
    return compareText(a.name, b.name);
  });

  return list;
}

/**
 * Case-insensitive filter on the name and on the note line, if the entry has
 * one. An empty query keeps every entry.
 */
export function filterEntries(entries, query) {
  const list = Array.isArray(entries) ? entries : [];
  const needle = typeof query === 'string' ? query.trim().toLowerCase() : '';
  if (!needle) return list.slice();
  return list.filter((entry) => {
    const name = String(entry?.name || '').toLowerCase();
    if (name.includes(needle)) return true;
    return String(entry?.note || '').toLowerCase().includes(needle);
  });
}

/**
 * Breadcrumb trail for the current folder. The first crumb is always the root.
 * Each crumb is { id, label, isRoot, isCurrent }.
 */
export function buildCrumbs(folders, folderId, rootLabel) {
  const crumbs = [{
    id: '',
    label: rootLabel || 'Home',
    isRoot: true,
    isCurrent: !folderId,
  }];

  if (!folderId) return crumbs;

  for (const folder of folderPath(folders, folderId)) {
    crumbs.push({
      id: folder.id,
      label: folder.name,
      isRoot: false,
      isCurrent: folder.id === folderId,
    });
  }

  crumbs[crumbs.length - 1].isCurrent = true;
  return crumbs;
}

/**
 * Collapses a long trail the way Google Drive does: the root, an overflow
 * marker, and the last `tailSize` crumbs. Short trails come back unchanged.
 */
export function collapseCrumbs(crumbs, maxVisible = 4, tailSize = 2) {
  const list = Array.isArray(crumbs) ? crumbs : [];
  if (list.length <= maxVisible) return list.slice();

  const head = list[0];
  const tail = list.slice(list.length - tailSize);
  const hidden = list.slice(1, list.length - tailSize);
  return [head, { id: '', label: '…', isOverflow: true, hidden }, ...tail];
}

/** Keys between the anchor row and the target row, inclusive, for shift-click. */
export function rangeKeys(keys, anchorKey, targetKey) {
  const list = Array.isArray(keys) ? keys : [];
  const from = list.indexOf(anchorKey);
  const to = list.indexOf(targetKey);
  if (to < 0) return [];
  if (from < 0) return [targetKey];
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  return list.slice(start, end + 1);
}

/** Next row for the arrow keys. Stops at both ends instead of wrapping. */
export function stepKey(keys, currentKey, delta) {
  const list = Array.isArray(keys) ? keys : [];
  if (!list.length) return '';
  const index = list.indexOf(currentKey);
  if (index < 0) return delta >= 0 ? list[0] : list[list.length - 1];
  const next = index + (delta >= 0 ? 1 : -1);
  if (next < 0) return list[0];
  if (next >= list.length) return list[list.length - 1];
  return list[next];
}

/** Human-readable byte size. Returns an em dash when the size is unknown. */
export function formatSize(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value < 10 && unit > 0 ? 1 : 0;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Drive-style date column: a time today, a weekday this week, else a date. */
export function formatModified(iso, now = new Date()) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  const diff = now.getTime() - date.getTime();
  if (diff >= 0 && diff < DAY_MS && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  if (diff >= 0 && diff < 7 * DAY_MS) {
    return date.toLocaleDateString(undefined, { weekday: 'short' });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** "3 items" / "1 item". Returns an empty string for an empty folder. */
export function formatCount(count, noun = 'item') {
  const value = typeof count === 'number' && count > 0 ? count : 0;
  if (!value) return '';
  return `${value} ${noun}${value === 1 ? '' : 's'}`;
}
