const SETTINGS_KEY = 'musi:settings';

let settingsCache = null;

function canUseStorage() {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch (e) {
    return false;
  }
}

function readSettings() {
  if (settingsCache) return settingsCache;
  settingsCache = {};
  if (!canUseStorage()) return settingsCache;

  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      settingsCache = parsed;
    }
  } catch (e) {
    settingsCache = {};
  }
  return settingsCache;
}

function writeSettings(settings) {
  settingsCache = settings;
  if (!canUseStorage()) return;

  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    // Ignore storage quota/privacy failures so settings changes still work in-memory.
  }
}

export function getSetting(id, fallback, allowedValues) {
  const settings = readSettings();
  const value = settings[id];
  if (value === undefined) return fallback;
  if (allowedValues && !allowedValues.includes(value)) return fallback;
  return value;
}

export function saveSetting(id, value) {
  writeSettings({ ...readSettings(), [id]: value });
}

export function saveSettings(values) {
  writeSettings({ ...readSettings(), ...values });
}
