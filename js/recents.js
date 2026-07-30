// Shared recent / favorite list helpers persisted through musi:settings.
import { getSetting, saveSetting } from './persistence.js';

const DEFAULT_CAP = 6;

export function getList(key, allowed) {
  const raw = getSetting(key, []);
  if (!Array.isArray(raw)) return [];
  const list = raw.filter(v => typeof v === 'string' && v);
  if (!allowed) return list;
  const allow = new Set(allowed);
  return list.filter(v => allow.has(v));
}

export function pushRecent(key, value, { cap = DEFAULT_CAP, allowed } = {}) {
  if (!value || typeof value !== 'string') return getList(key, allowed);
  let list = getList(key, allowed).filter(v => v !== value);
  list.unshift(value);
  if (list.length > cap) list = list.slice(0, cap);
  saveSetting(key, list);
  return list;
}

export function toggleFavorite(key, value, { allowed } = {}) {
  if (!value || typeof value !== 'string') return getList(key, allowed);
  const list = getList(key, allowed);
  const i = list.indexOf(value);
  if (i >= 0) list.splice(i, 1);
  else list.push(value);
  saveSetting(key, list);
  return list;
}

export function isFavorite(key, value, { allowed } = {}) {
  return getList(key, allowed).includes(value);
}

export function setList(key, values) {
  const list = Array.isArray(values) ? values.filter(v => typeof v === 'string' && v) : [];
  saveSetting(key, list);
  return list;
}
