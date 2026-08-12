// Private Realtime channel for sync hints. Correctness does not depend on it.

import { getClient } from './client.js';

const COALESCE_MS = 300;
const MAX_BACKOFF_MS = 30_000;

let channel = null;
let channelUserId = null;
let localDeviceId = null;
let onRemoteChangeFn = null;
let coalesceTimer = null;
let pendingRev = 0;
let linkState = 'off';
let reconnectTimer = null;
let reconnectAttempt = 0;
let accessToken = null;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function setLinkState(next) {
  linkState = next;
}

export function realtimeState() {
  return linkState;
}

function clearCoalesce() {
  if (coalesceTimer) {
    clearTimeout(coalesceTimer);
    coalesceTimer = null;
  }
}

function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function readBroadcastPayload(msg) {
  const payload = msg?.payload || {};
  const record = payload.record || payload.new || payload;
  return {
    device_id: record?.device_id || payload.device_id || '',
    rev: Number(record?.rev ?? payload.rev ?? 0),
  };
}

function scheduleCoalescedPull(rev) {
  if (!onRemoteChangeFn) return;
  if (rev > pendingRev) pendingRev = rev;
  clearCoalesce();
  coalesceTimer = setTimeout(() => {
    coalesceTimer = null;
    const hint = pendingRev;
    pendingRev = 0;
    try {
      onRemoteChangeFn({ rev: hint });
    } catch (_) {
      /* ignore */
    }
  }, COALESCE_MS);
}

function scheduleReconnect() {
  if (!channelUserId || !localDeviceId || !onRemoteChangeFn) return;
  clearReconnect();
  reconnectAttempt += 1;
  const delay = Math.min(MAX_BACKOFF_MS, 500 * (2 ** reconnectAttempt)) + Math.floor(Math.random() * 250);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    subscribeSyncChannel({
      userId: channelUserId,
      deviceId: localDeviceId,
      onRemoteChange: onRemoteChangeFn,
    }).catch(() => {
      setLinkState('error');
      scheduleReconnect();
    });
  }, delay);
}

async function attachChannel(userId, deviceId, onRemoteChange) {
  const client = await getClient();
  if (!client) {
    setLinkState('off');
    return null;
  }

  setLinkState('connecting');
  channelUserId = userId;
  localDeviceId = deviceId;
  onRemoteChangeFn = onRemoteChange;

  if (accessToken) {
    try {
      await client.realtime.setAuth(accessToken);
    } catch (_) {
      /* ignore */
    }
  }

  const nextChannel = client.channel(`sync:${userId}`, {
    config: { private: true },
  });

  nextChannel.on('broadcast', { event: 'sync' }, (msg) => {
    const { device_id: remoteDevice, rev } = readBroadcastPayload(msg);
    if (!rev) return;
    if (remoteDevice && remoteDevice === localDeviceId) return;
    scheduleCoalescedPull(rev);
  });

  nextChannel.on('broadcast', { event: 'INSERT' }, (msg) => {
    const { device_id: remoteDevice, rev } = readBroadcastPayload(msg);
    if (!rev) return;
    if (remoteDevice && remoteDevice === localDeviceId) return;
    scheduleCoalescedPull(rev);
  });

  nextChannel.on('broadcast', { event: 'UPDATE' }, (msg) => {
    const { device_id: remoteDevice, rev } = readBroadcastPayload(msg);
    if (!rev) return;
    if (remoteDevice && remoteDevice === localDeviceId) return;
    scheduleCoalescedPull(rev);
  });

  const status = await new Promise((resolve) => {
    nextChannel.subscribe((state) => {
      if (state === 'SUBSCRIBED') resolve('SUBSCRIBED');
      if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
        resolve(state);
      }
    });
  });

  if (status === 'SUBSCRIBED') {
    reconnectAttempt = 0;
    setLinkState('live');
    return nextChannel;
  }

  setLinkState('error');
  try {
    await client.removeChannel(nextChannel);
  } catch (_) {
    /* ignore */
  }
  scheduleReconnect();
  return null;
}

export async function subscribeSyncChannel({ userId, deviceId, onRemoteChange }) {
  await unsubscribeSyncChannel();
  channel = await attachChannel(userId, deviceId, onRemoteChange);
  return channel;
}

export async function unsubscribeSyncChannel() {
  clearCoalesce();
  clearReconnect();
  pendingRev = 0;
  reconnectAttempt = 0;

  const client = await getClient();
  if (channel && client?.removeChannel) {
    try {
      await client.removeChannel(channel);
    } catch (_) {
      /* ignore */
    }
  }
  channel = null;
  channelUserId = null;
  localDeviceId = null;
  onRemoteChangeFn = null;
  setLinkState('off');
}

export async function refreshRealtimeAuth(token) {
  accessToken = token || null;
  const client = await getClient();
  if (!client?.realtime?.setAuth) return;
  try {
    await client.realtime.setAuth(accessToken);
  } catch (_) {
    /* ignore */
  }
}
