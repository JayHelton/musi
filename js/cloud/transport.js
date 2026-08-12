// REST push/pull for sync_records. No local state except retry timing.

import { getClient } from './client.js';

export const PUSH_CHUNK = 50;
export const PULL_PAGE = 100;

/** Tests swap the Supabase client through this hook. */
let clientOverride = null;

export function __setClientForTests(client) {
  clientOverride = client;
}

async function supabase() {
  if (clientOverride) return clientOverride;
  return getClient();
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function backoffMs(attempt) {
  const base = Math.min(30_000, 500 * (2 ** attempt));
  return base;
}

function jitter() {
  return Math.floor(Math.random() * 250);
}

function rowKey(domain, recordId) {
  return `${domain}:${recordId}`;
}

function isQuotaError(error) {
  const msg = String(error?.message || error?.code || '').toLowerCase();
  return msg.includes('sync_payload_too_large')
    || msg.includes('sync_row_cap_exceeded')
    || msg.includes('sync_storage_cap_exceeded');
}

function isAuthError(error) {
  const status = error?.status ?? error?.code;
  if (status === 401 || status === 403) return true;
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('jwt') || msg.includes('session') || msg.includes('not authenticated');
}

function isNetworkError(error) {
  if (!error) return false;
  if (isQuotaError(error) || isAuthError(error)) return false;
  const status = error?.status ?? error?.code;
  if (typeof status === 'number' && status >= 400 && status < 500) return false;
  const msg = String(error?.message || error?.name || '').toLowerCase();
  return msg.includes('network')
    || msg.includes('fetch')
    || msg.includes('failed to fetch')
    || msg.includes('timeout')
    || msg.includes('offline')
    || msg.includes('econnreset')
    || msg.includes('enotfound')
    || status === 0
    || error?.name === 'TypeError';
}

function chunkList(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
}

function buildPushRows(upserts, tombstones, deviceId) {
  const rows = [];
  (upserts || []).forEach((row) => {
    rows.push({
      domain: row.domain,
      record_id: row.recordId || row.record_id,
      payload: row.payload,
      deleted: false,
      device_id: deviceId,
      content_hash: row.contentHash || row.content_hash || '',
    });
  });
  (tombstones || []).forEach((row) => {
    rows.push({
      domain: row.domain,
      record_id: row.recordId || row.record_id,
      payload: {},
      deleted: true,
      device_id: deviceId,
      content_hash: '',
    });
  });
  return rows;
}

/**
 * Upsert rows in chunks. Never send user_id — RLS sets it from auth.uid().
 * @returns {{ acked: Map<string, number>, pushed: number, errors: Array<{ key: string, code: string, message: string }> }}
 */
export async function pushRows({ upserts, tombstones, deviceId }) {
  const client = await supabase();
  const acked = new Map();
  const errors = [];
  let pushed = 0;

  if (!client || !deviceId) {
    return { acked, pushed, errors };
  }

  const rows = buildPushRows(upserts, tombstones, deviceId);
  if (!rows.length) {
    return { acked, pushed, errors };
  }

  for (const chunk of chunkList(rows, PUSH_CHUNK)) {
    let attempt = 0;
    let done = false;

    while (!done && attempt < 5) {
      try {
        const { data, error } = await client
          .from('sync_records')
          .upsert(chunk, { onConflict: 'user_id,domain,record_id' })
          .select('domain, record_id, rev');

        if (error) throw error;

        const revByKey = new Map();
        (data || []).forEach((row) => {
          revByKey.set(rowKey(row.domain, row.record_id), row.rev);
        });

        chunk.forEach((row) => {
          const key = rowKey(row.domain, row.record_id);
          const rev = revByKey.get(key);
          if (rev == null) return;
          acked.set(key, rev);
          pushed += 1;
        });
        done = true;
      } catch (error) {
        if (isQuotaError(error) || isAuthError(error)) {
          chunk.forEach((row) => {
            errors.push({
              key: rowKey(row.domain, row.record_id),
              code: String(error?.message || error?.code || 'push_failed'),
              message: describeTransportError(error).message,
            });
          });
          done = true;
          continue;
        }

        attempt += 1;
        if (attempt >= 5 || !isNetworkError(error)) {
          chunk.forEach((row) => {
            errors.push({
              key: rowKey(row.domain, row.record_id),
              code: String(error?.message || error?.code || 'push_failed'),
              message: describeTransportError(error).message,
            });
          });
          done = true;
          continue;
        }
        await sleep(backoffMs(attempt) + jitter());
      }
    }
  }

  return { acked, pushed, errors };
}

/**
 * Pull one page of rows with rev greater than sinceRev.
 * @returns {{ rows: Array<object>, error: object|null }}
 */
export async function pullPage({ sinceRev, limit = PULL_PAGE }) {
  const client = await supabase();
  if (!client) {
    return { rows: [], error: { message: 'Cloud sync is not enabled.' } };
  }

  const cursor = Number(sinceRev) || 0;
  try {
    const { data, error } = await client
      .from('sync_records')
      .select('domain, record_id, payload, deleted, updated_at, rev, device_id, content_hash')
      .gt('rev', cursor)
      .order('rev', { ascending: true })
      .limit(limit);

    if (error) return { rows: [], error };
    return { rows: data || [], error: null };
  } catch (error) {
    return { rows: [], error };
  }
}

/**
 * Read tombstone retention bounds. Errors degrade to fullResyncRequired false.
 */
export async function fetchBounds(cursor = 0) {
  const client = await supabase();
  if (!client) {
    return { purgedThroughRev: 0, maxRev: 0, fullResyncRequired: false, error: null };
  }

  try {
    const { data, error } = await client.rpc('sync_bounds', { p_cursor: cursor });
    if (error) {
      return { purgedThroughRev: 0, maxRev: 0, fullResyncRequired: false, error };
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return { purgedThroughRev: 0, maxRev: 0, fullResyncRequired: false, error: null };
    }
    return {
      purgedThroughRev: Number(row.purged_through_rev) || 0,
      maxRev: Number(row.max_rev) || 0,
      fullResyncRequired: row.full_resync_required === true,
      error: null,
    };
  } catch (error) {
    return { purgedThroughRev: 0, maxRev: 0, fullResyncRequired: false, error };
  }
}

/** Head-only count of sync_records rows for the signed-in user. */
export async function countRemoteRows() {
  const client = await supabase();
  if (!client) {
    return { count: 0, error: { message: 'Cloud sync is not enabled.' } };
  }

  try {
    const { count, error } = await client
      .from('sync_records')
      .select('domain', { count: 'exact', head: true });
    if (error) return { count: 0, error };
    return { count: count || 0, error: null };
  } catch (error) {
    return { count: 0, error };
  }
}

/** Map server errors to user-facing copy. */
export function describeTransportError(error) {
  const msg = String(error?.message || error || '');
  const lower = msg.toLowerCase();

  if (lower.includes('sync_payload_too_large')) {
    return { code: 'sync_payload_too_large', message: 'Some items are too large to sync.' };
  }
  if (lower.includes('sync_row_cap_exceeded')) {
    return { code: 'sync_row_cap_exceeded', message: 'The cloud copy is full.' };
  }
  if (lower.includes('sync_storage_cap_exceeded')) {
    return { code: 'sync_storage_cap_exceeded', message: 'Cloud storage is full.' };
  }

  const status = error?.status ?? error?.code;
  if (status === 401 || status === 403 || lower.includes('jwt') || lower.includes('not authenticated')) {
    return { code: 'auth', message: 'The session expired. Sign in again.' };
  }

  if (
    (typeof navigator !== 'undefined' && navigator.onLine === false)
    || lower.includes('offline')
    || lower.includes('failed to fetch')
    || lower.includes('network')
  ) {
    return { code: 'offline', message: 'You are offline. Musi saved the change on this device.' };
  }

  return { code: 'unknown', message: 'Could not sync. Musi will try again.' };
}
