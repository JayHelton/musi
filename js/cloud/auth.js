import { getClient, peekClient } from './client.js';

const AUTH_LISTENERS = new Set();

let supabaseListenerAttached = false;

/**
 * Attaches one shared Supabase auth listener, but only when a client already
 * exists or a session is stored. A signed-out visitor therefore never fetches
 * the vendored bundle at boot.
 */
async function attachSupabaseListener() {
  if (supabaseListenerAttached) return;
  const client = peekClient() || (hasStoredSession() ? await getClient() : null);
  if (!client || supabaseListenerAttached) return;
  supabaseListenerAttached = true;
  client.auth.onAuthStateChange((event, session) => {
    AUTH_LISTENERS.forEach((listener) => {
      try { listener(event, session); } catch (_) { /* ignore */ }
    });
  });
}

function browserOnline() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  return true;
}

function isStandalonePwa() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)')?.matches) return true;
  if (typeof navigator !== 'undefined' && navigator.standalone) return true;
  return false;
}

function detectPlatform() {
  if (typeof navigator === 'undefined') return 'Unknown';
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macOS';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/CrOS/i.test(ua)) return 'ChromeOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Unknown';
}

function detectBrowserLabel() {
  if (typeof navigator === 'undefined') return 'Browser';
  const ua = navigator.userAgent || '';
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return 'Chrome';
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return 'Safari';
  return 'Browser';
}

function appVersionLabel() {
  if (typeof navigator === 'undefined') return '';
  const app = navigator.appVersion || '';
  const match = app.match(/\d+\.\d+/);
  return match ? match[0] : 'web';
}

/** Short human label for this install — never a raw user-agent string. */
export function describeDevice() {
  const platform = detectPlatform();
  const browser = detectBrowserLabel();
  const label = isStandalonePwa()
    ? `Installed app on ${platform}`
    : `${browser} on ${platform}`;
  return {
    label,
    platform,
    appVersion: appVersionLabel(),
  };
}

export const AUTH_STORAGE_KEY = 'musi.auth';

/**
 * Reports a stored sign-in without a network call and without the client.
 * Boot and the Settings panel use it so a signed-out visitor never downloads
 * the vendored Supabase bundle.
 */
export function hasStoredSession() {
  try {
    if (typeof localStorage === 'undefined') return false;
    return !!localStorage.getItem(AUTH_STORAGE_KEY);
  } catch (_) {
    return false;
  }
}

export async function getSession() {
  try {
    // Build no client only to learn that nobody signed in on this device.
    if (!peekClient() && !hasStoredSession()) return null;
    const client = await getClient();
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) return null;
    return data?.session ?? null;
  } catch (_) {
    return null;
  }
}

export async function getUser() {
  try {
    const client = await getClient();
    if (!client) return null;
    const { data, error } = await client.auth.getUser();
    if (error) return null;
    return data?.user ?? null;
  } catch (_) {
    return null;
  }
}

export async function getAccessToken() {
  const session = await getSession();
  return session?.access_token ?? null;
}

export async function sendOtp(email) {
  try {
    const client = await getClient();
    if (!client) return { ok: false, error: { message: 'Cloud sync is not enabled.' } };
    // Supabase sends a link when the email template has no {{ .Token }} tag.
    // The return address keeps that link on this page, where the PKCE exchange
    // in exchangeCodeFromUrl finishes the sign-in.
    const options = { shouldCreateUser: true };
    if (typeof location !== 'undefined' && location.origin) {
      options.emailRedirectTo = `${location.origin}${location.pathname}${location.hash || ''}`;
    }
    const { error } = await client.auth.signInWithOtp({ email, options });
    if (error) return { ok: false, error };
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err };
  }
}

export async function verifyOtp(email, token) {
  try {
    const client = await getClient();
    if (!client) return { ok: false, error: { message: 'Cloud sync is not enabled.' }, session: null };
    const { data, error } = await client.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });
    if (error) return { ok: false, error, session: null };
    await attachSupabaseListener();
    return { ok: true, error: null, session: data?.session ?? null };
  } catch (err) {
    return { ok: false, error: err, session: null };
  }
}

export async function signOut() {
  try {
    const client = await getClient();
    if (!client) return { ok: true, error: null };
    const { error } = await client.auth.signOut();
    if (error) return { ok: false, error };
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err };
  }
}

export function onAuthChange(fn) {
  AUTH_LISTENERS.add(fn);
  attachSupabaseListener();
  return () => {
    AUTH_LISTENERS.delete(fn);
  };
}

/** PKCE redirect: exchange ?code= and keep the #sec-* hash route. */
export async function exchangeCodeFromUrl() {
  if (typeof window === 'undefined' || typeof location === 'undefined') {
    return { ok: true, error: null };
  }
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  if (!code) return { ok: true, error: null };

  try {
    const client = await getClient();
    if (!client) return { ok: false, error: { message: 'Cloud sync is not enabled.' } };
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) return { ok: false, error };

    url.searchParams.delete('code');
    const flowKeys = ['flow_state_id', 'flowStateId'];
    flowKeys.forEach((key) => url.searchParams.delete(key));
    const search = url.searchParams.toString();
    const searchPart = search ? `?${search}` : '';
    const hash = location.hash || '';
    history.replaceState(null, '', url.pathname + searchPart + hash);
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err };
  }
}

export async function registerDevice(deviceId) {
  try {
    const client = await getClient();
    if (!client) return { ok: false, error: { message: 'Cloud sync is not enabled.' } };
    const info = describeDevice();
    const now = new Date().toISOString();
    const { error } = await client
      .from('sync_devices')
      .upsert({
        device_id: deviceId,
        name: info.label,
        platform: info.platform,
        app_version: info.appVersion,
        last_seen_at: now,
      }, { onConflict: 'user_id,device_id' });
    if (error) return { ok: false, error };
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err };
  }
}

export async function touchDevice(deviceId, patch = {}) {
  try {
    const client = await getClient();
    if (!client) return { ok: false, error: { message: 'Cloud sync is not enabled.' } };
    const row = { device_id: deviceId, last_seen_at: new Date().toISOString() };
    if (patch.last_pulled_rev != null) row.last_pulled_rev = patch.last_pulled_rev;
    const { error } = await client
      .from('sync_devices')
      .update(row)
      .eq('device_id', deviceId);
    if (error) return { ok: false, error };
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err };
  }
}

export async function listDevices() {
  try {
    const client = await getClient();
    if (!client) return { devices: [], error: { message: 'Cloud sync is not enabled.' } };
    const { data, error } = await client
      .from('sync_devices')
      .select('device_id, name, platform, app_version, last_seen_at, last_pulled_rev, created_at')
      .order('last_seen_at', { ascending: false });
    if (error) return { devices: [], error };
    return { devices: data || [], error: null };
  } catch (err) {
    return { devices: [], error: err };
  }
}

export async function revokeDevice(deviceId) {
  try {
    const client = await getClient();
    if (!client) return { ok: false, error: { message: 'Cloud sync is not enabled.' } };
    const { error } = await client
      .from('sync_devices')
      .delete()
      .eq('device_id', deviceId);
    if (error) return { ok: false, error };
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err };
  }
}

export function describeAuthError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  const status = error?.status ?? error?.code;

  if (!browserOnline()) {
    return { message: 'You are offline. Connect to sign in.', retryAfterMs: null };
  }

  if (status === 429 || msg.includes('rate') || msg.includes('too many')) {
    return { message: 'Too many attempts. Wait a minute and try again.', retryAfterMs: 60_000 };
  }

  // The project owner limits who may open an account. The database gate and the
  // Dashboard switch both land here.
  const errorCode = String(error?.code || error?.error_code || '').toLowerCase();
  if (
    msg.includes('signup_not_allowed')
    || msg.includes('signups not allowed')
    || msg.includes('database error saving new user')
    || errorCode === 'signup_disabled'
    || errorCode === 'email_provider_disabled'
  ) {
    return {
      message: 'This Musi project does not accept new accounts. Ask the owner for access.',
      retryAfterMs: null,
    };
  }

  if (
    msg.includes('expired')
    || msg.includes('invalid')
    || msg.includes('otp')
    || msg.includes('token')
    || msg.includes('code')
  ) {
    return { message: 'That code expired. Send a new one.', retryAfterMs: null };
  }

  if (msg.includes('clock') || msg.includes('skew') || msg.includes('future') || msg.includes('issued')) {
    return { message: 'The device clock looks wrong. Check the date and time settings.', retryAfterMs: null };
  }

  if (
    msg.includes('storage')
    || msg.includes('localstorage')
    || msg.includes('quota')
    || msg.includes('blocked')
    || msg.includes('security')
  ) {
    return { message: 'The browser blocked the saved login. Allow storage for this site.', retryAfterMs: null };
  }

  return { message: error?.message || 'Sign in failed. Try again.', retryAfterMs: null };
}
