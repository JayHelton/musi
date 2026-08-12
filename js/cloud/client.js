import { getCloudConfig, isCloudEnabled } from './cloudConfig.js';

let clientInstance = null;
let clientPromise = null;

async function buildClient() {
  if (!isCloudEnabled()) return null;
  const cfg = getCloudConfig();
  const { createClient } = await import('../vendor/supabase-js.esm.js');
  clientInstance = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: false,
      storageKey: 'musi.auth',
      persistSession: true,
      autoRefreshToken: true,
    },
    global: { headers: { 'x-musi-client': 'musi-pwa' } },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return clientInstance;
}

/** Build the Supabase client once when cloud sync is enabled. */
export async function getClient() {
  if (!isCloudEnabled()) return null;
  if (clientInstance) return clientInstance;
  if (!clientPromise) clientPromise = buildClient();
  return clientPromise;
}

export function peekClient() {
  return clientInstance;
}

/** For node tests only — replaces the cached Supabase client; pass null to clear. */
export function __setClientForTests(client) {
  clientInstance = client;
  clientPromise = client ? Promise.resolve(client) : null;
}

/** Drop the client instance (sign-out and tests). */
export function resetClient() {
  const prev = clientInstance;
  clientInstance = null;
  clientPromise = null;
  if (prev?.auth) {
    prev.auth.signOut().catch(() => { /* ignore */ });
  }
}

export function supabaseOrigin() {
  const cfg = getCloudConfig();
  if (!cfg.SUPABASE_URL) return '';
  try {
    return new URL(cfg.SUPABASE_URL).origin;
  } catch (_) {
    return '';
  }
}

export function isSupabaseUrl(value) {
  const origin = supabaseOrigin();
  if (!origin || !value) return false;
  try {
    return new URL(String(value)).origin === origin;
  } catch (_) {
    return false;
  }
}
