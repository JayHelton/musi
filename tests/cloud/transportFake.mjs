/**
 * In-memory Supabase double for transport.js and cloudSync node tests.
 * Tests call installFakeTransport() or installSharedFakeCloud().
 */

import * as transport from '../../js/cloud/transport.js';
import { __setClientForTests as setMainClient } from '../../js/cloud/client.js';
import { __setCloudConfigForTests } from '../../js/cloud/cloudConfig.js';

let fakeStore = null;
let sharedStore = null;

function rowKey(domain, recordId) {
  return `${domain}:${recordId}`;
}

function createFakeStore() {
  return {
    records: new Map(),
    devices: new Map(),
    syncBlobs: new Map(),
    storageObjects: new Map(),
    revCounter: 0,
    blobRevCounter: 0,
    purgedThroughRev: 0,
    maxRev: 0,
    fullResyncRequired: false,
  };
}

function upsertSyncBlobs(rows, store) {
  const list = Array.isArray(rows) ? rows : [rows];
  const acked = [];
  list.forEach((row) => {
    store.blobRevCounter += 1;
    const rev = store.blobRevCounter;
    const attachmentId = row.attachment_id;
    const existing = store.syncBlobs.get(attachmentId) || {};
    const next = {
      ...existing,
      attachment_id: attachmentId,
      crc32: row.crc32,
      size_bytes: row.size_bytes,
      mime_type: row.mime_type ?? existing.mime_type ?? null,
      storage_path: row.storage_path,
      deleted: row.deleted === true,
      updated_at: new Date().toISOString(),
      rev,
    };
    store.syncBlobs.set(attachmentId, next);
    acked.push(next);
  });
  return acked;
}

function querySyncBlobs(store, filters) {
  let rows = [...store.syncBlobs.values()];
  filters.forEach((filter) => {
    if (filter.op === 'eq') {
      rows = rows.filter((row) => row[filter.col] === filter.val);
    }
    if (filter.op === 'is') {
      rows = rows.filter((row) => row[filter.col] === filter.val);
    }
  });
  return rows;
}

function updateSyncBlobs(store, filters, patch) {
  const targets = querySyncBlobs(store, filters);
  targets.forEach((row) => {
    store.blobRevCounter += 1;
    const next = {
      ...row,
      ...patch,
      attachment_id: row.attachment_id,
      rev: store.blobRevCounter,
      updated_at: new Date().toISOString(),
    };
    store.syncBlobs.set(row.attachment_id, next);
  });
  return targets;
}

function upsertRows(rows, store) {
  const acked = [];
  (rows || []).forEach((row) => {
    store.revCounter += 1;
    const rev = store.revCounter;
    const key = rowKey(row.domain, row.record_id);
    const next = {
      domain: row.domain,
      record_id: row.record_id,
      payload: row.payload,
      deleted: row.deleted === true,
      device_id: row.device_id,
      content_hash: row.content_hash || '',
      updated_at: new Date().toISOString(),
      rev,
    };
    store.records.set(key, next);
    store.maxRev = rev;
    acked.push({ domain: row.domain, record_id: row.record_id, rev });
  });
  return acked;
}

function upsertDevices(rows, store) {
  const list = Array.isArray(rows) ? rows : [rows];
  list.forEach((row) => {
    const deviceId = row.device_id;
    if (!deviceId) return;
    const existing = store.devices.get(deviceId) || {};
    store.devices.set(deviceId, {
      ...existing,
      ...row,
      device_id: deviceId,
    });
  });
  return list;
}

function queryRows(store, filters, orderCol, orderAsc, limitN) {
  let rows = [...store.records.values()];
  filters.forEach((filter) => {
    if (filter.op === 'gt') {
      rows = rows.filter((row) => Number(row[filter.col]) > Number(filter.val));
    }
    if (filter.op === 'eq') {
      rows = rows.filter((row) => row[filter.col] === filter.val);
    }
  });
  if (orderCol) {
    rows.sort((a, b) => {
      const av = a[orderCol];
      const bv = b[orderCol];
      if (av === bv) return 0;
      return orderAsc ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1);
    });
  }
  if (limitN != null) {
    rows = rows.slice(0, limitN);
  }
  return rows;
}

function queryDevices(store, filters, orderCol, orderAsc) {
  let rows = [...store.devices.values()];
  filters.forEach((filter) => {
    if (filter.op === 'eq') {
      rows = rows.filter((row) => row[filter.col] === filter.val);
    }
  });
  if (orderCol) {
    rows.sort((a, b) => {
      const av = a[orderCol];
      const bv = b[orderCol];
      if (av === bv) return 0;
      return orderAsc ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1);
    });
  }
  return rows;
}

function makeTableBuilder(table, store) {
  const state = {
    filters: [],
    orderCol: null,
    orderAsc: true,
    limitN: null,
    countHead: false,
    upsertRows: null,
    updatePatch: null,
    deleteMode: false,
    selectCols: '*',
  };

  const builder = {
    select(cols, opts) {
      state.selectCols = cols;
      state.countHead = opts?.head === true;
      return builder;
    },
    gt(col, val) {
      state.filters.push({ op: 'gt', col, val });
      return builder;
    },
    eq(col, val) {
      state.filters.push({ op: 'eq', col, val });
      return builder;
    },
    is(col, val) {
      state.filters.push({ op: 'is', col, val });
      return builder;
    },
    order(col, opts = {}) {
      state.orderCol = col;
      state.orderAsc = opts.ascending !== false;
      return builder;
    },
    limit(n) {
      state.limitN = n;
      return builder;
    },
    update(patch) {
      state.updatePatch = patch;
      return builder;
    },
    delete() {
      state.deleteMode = true;
      return builder;
    },
    upsert(rows, opts) {
      state.upsertRows = rows;
      state.upsertOpts = opts;
      return {
        select(cols) {
          state.selectCols = cols;
          return execute();
        },
        then(onFulfilled, onRejected) {
          return execute().then(onFulfilled, onRejected);
        },
      };
    },
    then(onFulfilled, onRejected) {
      return execute().then(onFulfilled, onRejected);
    },
  };

  function execute() {
    if (table === 'sync_blobs') {
      if (state.upsertRows) {
        const data = upsertSyncBlobs(state.upsertRows, store);
        return Promise.resolve({ data, error: null });
      }
      if (state.updatePatch) {
        const data = updateSyncBlobs(store, state.filters, state.updatePatch);
        return Promise.resolve({ data, error: null });
      }
      const data = querySyncBlobs(store, state.filters);
      return Promise.resolve({ data, error: null });
    }

    if (table === 'sync_devices') {
      if (state.upsertRows) {
        const data = upsertDevices(state.upsertRows, store);
        return Promise.resolve({ data, error: null });
      }
      if (state.updatePatch) {
        const targets = queryDevices(store, state.filters, null, true);
        targets.forEach((row) => {
          store.devices.set(row.device_id, { ...row, ...state.updatePatch });
        });
        return Promise.resolve({ data: targets, error: null });
      }
      if (state.deleteMode) {
        const targets = queryDevices(store, state.filters, null, true);
        targets.forEach((row) => store.devices.delete(row.device_id));
        return Promise.resolve({ data: targets, error: null });
      }
      const data = queryDevices(store, state.filters, state.orderCol, state.orderAsc);
      return Promise.resolve({ data, error: null });
    }

    if (state.upsertRows) {
      const data = upsertRows(state.upsertRows, store);
      return Promise.resolve({ data, error: null });
    }

    if (state.countHead) {
      return Promise.resolve({ count: store.records.size, error: null, data: null });
    }

    const data = queryRows(store, state.filters, state.orderCol, state.orderAsc, state.limitN);
    return Promise.resolve({ data, error: null });
  }

  return builder;
}

function createAuthApi(sessionRef) {
  const listeners = new Set();
  const oauthCalls = [];
  const auth = {
    getSession: async () => ({ data: { session: sessionRef.current }, error: null }),
    getUser: async () => {
      const user = sessionRef.current?.user ?? null;
      return { data: { user }, error: null };
    },
    onAuthStateChange(cb) {
      listeners.add(cb);
      return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
    },
    signInWithOtp: async () => ({ data: {}, error: null }),
    signInWithOAuth: async (params) => {
      oauthCalls.push(params);
      return {
        data: { url: 'https://accounts.google.com/o/oauth2/auth?fake=1' },
        error: null,
      };
    },
    verifyOtp: async ({ email }) => {
      sessionRef.current = {
        access_token: 'fake-token',
        user: { id: sessionRef.current?.user?.id || 'user-test', email },
      };
      listeners.forEach((fn) => fn('SIGNED_IN', sessionRef.current));
      return { data: { session: sessionRef.current }, error: null };
    },
    signOut: async () => {
      sessionRef.current = null;
      listeners.forEach((fn) => fn('SIGNED_OUT', null));
      return { error: null };
    },
    exchangeCodeForSession: async () => ({ data: { session: sessionRef.current }, error: null }),
    _emit(event, session) {
      listeners.forEach((fn) => fn(event, session));
    },
    _oauthCalls: oauthCalls,
  };
  return auth;
}

function makeChannel() {
  const handlers = [];
  return {
    on(_type, _filter, cb) {
      if (typeof cb === 'function') handlers.push(cb);
      return this;
    },
    subscribe(cb) {
      if (typeof cb === 'function') cb('SUBSCRIBED');
      return Promise.resolve('SUBSCRIBED');
    },
    unsubscribe() {},
    _handlers: handlers,
  };
}

function makeStorageApi(store) {
  return {
    from(bucket) {
      return {
        upload(path, blob, opts = {}) {
          const key = `${bucket}:${path}`;
          store.storageObjects.set(key, {
            blob,
            contentType: opts.contentType || blob?.type || '',
          });
          return Promise.resolve({ data: { path }, error: null });
        },
        download(path) {
          const key = `${bucket}:${path}`;
          const entry = store.storageObjects.get(key);
          if (!entry) {
            return Promise.resolve({ data: null, error: { message: 'Object not found' } });
          }
          return Promise.resolve({ data: entry.blob, error: null });
        },
        remove(paths) {
          (paths || []).forEach((path) => {
            store.storageObjects.delete(`${bucket}:${path}`);
          });
          return Promise.resolve({ data: paths, error: null });
        },
        list(prefix = '') {
          const names = [];
          store.storageObjects.forEach((_entry, key) => {
            const marker = `${bucket}:`;
            if (!key.startsWith(marker)) return;
            const path = key.slice(marker.length);
            if (prefix && !path.startsWith(prefix)) return;
            names.push({ name: path });
          });
          return Promise.resolve({ data: names, error: null });
        },
      };
    },
  };
}

export function createFakeSupabase(store = fakeStore) {
  const activeStore = store || createFakeStore();
  const sessionRef = { current: null };
  const auth = createAuthApi(sessionRef);
  const channels = new Set();

  const client = {
    auth,
    storage: makeStorageApi(activeStore),
    from(table) {
      return makeTableBuilder(table, activeStore);
    },
    channel() {
      const ch = makeChannel();
      channels.add(ch);
      return ch;
    },
    rpc(name, args = {}) {
      if (name !== 'sync_bounds') {
        return Promise.resolve({ data: null, error: { message: `Unknown rpc ${name}` } });
      }
      const cursor = Number(args.p_cursor) || 0;
      const full = activeStore.fullResyncRequired
        || (activeStore.purgedThroughRev > 0 && cursor > 0 && cursor <= activeStore.purgedThroughRev);
      return Promise.resolve({
        data: [{
          purged_through_rev: activeStore.purgedThroughRev,
          max_rev: activeStore.maxRev,
          full_resync_required: full,
        }],
        error: null,
      });
    },
    realtime: {
      setAuth: async () => {},
    },
    removeChannel: async (ch) => {
      channels.delete(ch);
    },
    _store: activeStore,
    _setSession(session) {
      sessionRef.current = session;
    },
    _getSession() {
      return sessionRef.current;
    },
  };

  return client;
}

export function setFakeSession(client, session) {
  client._setSession(session);
}

export function getSharedStore() {
  if (!sharedStore) sharedStore = createFakeStore();
  return sharedStore;
}

export function resetSharedCloud() {
  sharedStore = createFakeStore();
  return sharedStore;
}

function wireFakeClient(client) {
  __setCloudConfigForTests({
    SUPABASE_URL: 'https://fake.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'fake-test-key',
    enabled: true,
  });
  setMainClient(client);
  transport.__setClientForTests(client);
}

export function installFakeTransport({ store } = {}) {
  fakeStore = store || createFakeStore();
  const client = createFakeSupabase(fakeStore);
  wireFakeClient(client);
  return { client, store: fakeStore };
}

export function installSharedFakeCloud({ fresh = true } = {}) {
  const store = fresh ? resetSharedCloud() : getSharedStore();
  const client = createFakeSupabase(store);
  wireFakeClient(client);
  fakeStore = store;
  return { client, store };
}

export function restoreTransport() {
  transport.__setClientForTests(null);
  setMainClient(null);
  fakeStore = null;
}

export async function run(test) {
  await test('pushRows upserts and returns rev acks', async () => {
    const { store } = installFakeTransport();
    try {
      const note = { id: 'note-1', title: 'A', body: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
      const result = await transport.pushRows({
        deviceId: 'dev-a',
        upserts: [{
          domain: 'notes',
          recordId: 'note-1',
          payload: note,
          contentHash: 'hash-1',
        }],
        tombstones: [],
      });
      if (result.pushed !== 1) throw new Error(`expected pushed 1 got ${result.pushed}`);
      if (!result.acked.has('notes:note-1')) throw new Error('missing ack');
      if (store.records.size !== 1) throw new Error('store size mismatch');
    } finally {
      restoreTransport();
    }
  });

  await test('pullPage returns rows after cursor ordered by rev', async () => {
    const { store } = installFakeTransport();
    try {
      upsertRows([{
        domain: 'notes',
        record_id: 'note-1',
        payload: { id: 'note-1' },
        deleted: false,
        device_id: 'dev-a',
        content_hash: 'h1',
      }, {
        domain: 'notes',
        record_id: 'note-2',
        payload: { id: 'note-2' },
        deleted: false,
        device_id: 'dev-a',
        content_hash: 'h2',
      }], store);

      const page1 = await transport.pullPage({ sinceRev: 0, limit: 1 });
      if (page1.rows.length !== 1) throw new Error('expected one row');
      if (page1.rows[0].record_id !== 'note-1') throw new Error('wrong first row');

      const page2 = await transport.pullPage({ sinceRev: page1.rows[0].rev, limit: 10 });
      if (page2.rows.length !== 1) throw new Error('expected second page row');
      if (page2.rows[0].record_id !== 'note-2') throw new Error('wrong second row');
    } finally {
      restoreTransport();
    }
  });

  await test('fetchBounds reports full resync when cursor is stale', async () => {
    const { store } = installFakeTransport();
    try {
      store.purgedThroughRev = 5;
      store.maxRev = 10;
      const bounds = await transport.fetchBounds(3);
      if (!bounds.fullResyncRequired) throw new Error('expected full resync');
    } finally {
      restoreTransport();
    }
  });

  await test('countRemoteRows returns head count', async () => {
    const { store } = installFakeTransport();
    try {
      upsertRows([{
        domain: 'notes',
        record_id: 'note-1',
        payload: {},
        deleted: false,
        device_id: 'dev-a',
        content_hash: '',
      }], store);
      const { count } = await transport.countRemoteRows();
      if (count !== 1) throw new Error(`expected count 1 got ${count}`);
    } finally {
      restoreTransport();
    }
  });

  await test('describeTransportError maps quota and auth errors', async () => {
    const quota = transport.describeTransportError({ message: 'sync_row_cap_exceeded' });
    if (!quota.message.includes('full')) throw new Error('quota message mismatch');
    const auth = transport.describeTransportError({ status: 401 });
    if (!auth.message.includes('session')) throw new Error('auth message mismatch');
  });

  await test('sync_devices upsert update and delete work', async () => {
    const { client, store } = installFakeTransport();
    try {
      await client.from('sync_devices').upsert({
        device_id: 'dev-1',
        name: 'Test',
        platform: 'Linux',
        last_seen_at: '2026-01-01T00:00:00.000Z',
      });
      if (store.devices.size !== 1) throw new Error('device not stored');

      await client.from('sync_devices').update({ last_pulled_rev: 5 }).eq('device_id', 'dev-1');
      if (store.devices.get('dev-1').last_pulled_rev !== 5) throw new Error('update failed');

      await client.from('sync_devices').delete().eq('device_id', 'dev-1');
      if (store.devices.size !== 0) throw new Error('delete failed');
    } finally {
      restoreTransport();
    }
  });

  await test('auth session can be set for tests', async () => {
    const { client } = installFakeTransport();
    try {
      setFakeSession(client, {
        access_token: 'tok',
        user: { id: 'u1', email: 'a@b.c' },
      });
      const { data } = await client.auth.getSession();
      if (!data.session?.user?.id) throw new Error('session missing');
    } finally {
      restoreTransport();
    }
  });
}
