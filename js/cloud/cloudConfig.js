/**
 * Optional Supabase cloud sync.
 *
 * These values point at the Musi project. The publishable key is made for the
 * browser: it grants no admin power, and Row Level Security keeps every row
 * private to its owner. Never put the service-role key here.
 *
 * A fork replaces both values, or overrides them with a `cloud-config.json`
 * file beside `index.html`. Empty values turn the whole feature off.
 */

const DEFAULTS = Object.freeze({
  SUPABASE_URL: 'https://gtokzekwpsdmvfdjsuag.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_7bf_TsbCkMTZ3_WguOQaiA_gI03_O1-',
  enabled: true,
});

export const CLOUD_CONFIG_DEFAULTS = DEFAULTS;

let resolved = { ...DEFAULTS };
let loadPromise = null;
let loaded = false;

function freezeConfig(raw) {
  const enabled = raw.enabled !== false
    && !!raw.SUPABASE_URL
    && !!raw.SUPABASE_PUBLISHABLE_KEY;
  return Object.freeze({
    SUPABASE_URL: raw.SUPABASE_URL || '',
    SUPABASE_PUBLISHABLE_KEY: raw.SUPABASE_PUBLISHABLE_KEY || '',
    enabled,
  });
}

/** Fetch optional ./cloud-config.json once; missing file is normal. */
export async function loadCloudConfig() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    let next = { ...DEFAULTS };
    if (typeof fetch === 'function') {
      try {
        const res = await fetch('./cloud-config.json', { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          next = {
            ...DEFAULTS,
            ...json,
            enabled: json.enabled !== false
              && !!json.SUPABASE_URL
              && !!json.SUPABASE_PUBLISHABLE_KEY,
          };
        }
      } catch (_) {
        /* absent or unreadable override is normal */
      }
    }
    resolved = freezeConfig(next);
    loaded = true;
    return resolved;
  })();
  return loadPromise;
}

export function getCloudConfig() {
  return resolved;
}

export function isCloudEnabled() {
  return resolved.enabled === true
    && !!resolved.SUPABASE_URL
    && !!resolved.SUPABASE_PUBLISHABLE_KEY;
}

export function cloudConfigLoaded() {
  return loaded;
}

/** For node tests only — merges partial values into the resolved config. */
export function __setCloudConfigForTests(partial) {
  resolved = freezeConfig({ ...resolved, ...partial });
}
