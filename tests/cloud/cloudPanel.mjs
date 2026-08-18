/**
 * Layout rules for the signed-in cloud panel.
 */

import assert from 'node:assert/strict';
import { __renderSignedInForTests } from '../../js/cloud/cloudUI.js';

function baseStatus(patch = {}) {
  return {
    state: 'idle',
    signedIn: true,
    email: 'player@test.example',
    deviceId: 'dev-this',
    lastSyncAt: null,
    lastSyncMode: null,
    localCount: 12,
    cloudCount: 9,
    error: null,
    online: true,
    files: {
      uploads: 0,
      downloads: 0,
      busy: false,
      lastError: null,
      phase: null,
      done: 0,
      total: 0,
    },
    ...patch,
  };
}

const DEVICES = [
  { device_id: 'dev-this', name: 'This phone', platform: 'Android', last_seen_at: null },
  { device_id: 'dev-other', name: 'Desk PC', platform: 'Windows', last_seen_at: null },
];

export async function run(test) {
  await test('the panel offers exactly the three sync operations', async () => {
    const html = __renderSignedInForTests(baseStatus(), DEVICES);
    const modes = [...html.matchAll(/data-sync-mode="([a-z]+)"/g)].map((m) => m[1]);
    assert.deepEqual(modes, ['merge', 'cloud', 'device']);
  });

  await test('the panel holds no sync button beyond the three and sign-out', async () => {
    const html = __renderSignedInForTests(baseStatus(), DEVICES);
    const ids = [...html.matchAll(/<button[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(ids.sort(), ['mp-cloud-signout', 'mp-cloud-signout-erase']);
    assert.equal(html.includes('Sync now'), false);
    assert.equal(html.includes('Sync files now'), false);
    assert.equal(html.includes('Try again'), false);
  });

  await test('the device list is collapsed and sits below the sync controls', async () => {
    const html = __renderSignedInForTests(baseStatus(), DEVICES);
    const devicesIdx = html.indexOf('id="mp-cloud-devices"');
    const syncIdx = html.indexOf('cloud-sync-section');
    assert.ok(syncIdx >= 0, 'sync section is present');
    assert.ok(devicesIdx > syncIdx, 'the device list follows the sync controls');

    const details = html.slice(devicesIdx - 200, devicesIdx + 200);
    assert.ok(details.includes('<details'));
    assert.equal(/id="mp-cloud-devices" open/.test(html), false, 'closed by default');
    assert.ok(html.includes('Devices with access (2)'));
  });

  await test('a danger button arms before it runs', async () => {
    const html = __renderSignedInForTests(baseStatus(), DEVICES);
    assert.ok(html.includes('Get the cloud copy'));
    assert.ok(html.includes('Send this device'));
  });

  await test('the buttons stop while a pass runs', async () => {
    const html = __renderSignedInForTests(baseStatus({ state: 'merging' }), DEVICES);
    const buttons = [...html.matchAll(/data-sync-mode="[a-z]+"[^>]*/g)].map((m) => m[0]);
    assert.equal(buttons.length, 3);
    buttons.forEach((btn) => assert.ok(btn.includes('disabled')));
  });

  await test('the head reports both counts and the unsynced changes', async () => {
    const html = __renderSignedInForTests(baseStatus({ pendingChanges: 3 }), DEVICES);
    assert.ok(html.includes('This device: 12 items'));
    assert.ok(html.includes('Cloud: 9 items'));
    assert.ok(html.includes('3 changed since the last sync'));
  });
}
