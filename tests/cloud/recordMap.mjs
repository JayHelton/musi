import assert from 'node:assert/strict';
import { buildSnapshot } from '../../js/sync/syncProfile.js';
import {
  toRecords,
  fromRecords,
  isDeviceLocalSettingKey,
  SYNC_DOMAINS,
} from '../../js/cloud/recordMap.js';

function filterSyncRemainder(obj) {
  const out = {};
  Object.entries(obj || {}).forEach(([key, value]) => {
    if (isDeviceLocalSettingKey(key)) return;
    out[key] = value;
  });
  return out;
}

export async function runRecordMapTests(test) {
  await test('SYNC_DOMAINS has twelve fixed domains', () => {
    assert.equal(SYNC_DOMAINS.length, 12);
    assert.ok(SYNC_DOMAINS.includes('settings'));
    assert.ok(SYNC_DOMAINS.includes('attachmentsMeta'));
  });

  await test('toRecords then fromRecords round-trips buildSnapshot data bag', async () => {
    globalThis.localStorage.setItem('musi:settings', JSON.stringify({
      'global.volume': 0.7,
      'nav.lastTool': 'scale',
      'subview.chords': 'triads',
      'cloud.blobSyncEnabled': true,
      'sync.scopes': ['settings'],
      'features.enabled': ['scale'],
      'profile.music': { version: 1, genres: [], goals: [], balance: 'balanced', applications: [], exclusions: [], updatedAt: 1000 },
      stats: { today: { day: '2026-08-09', trainedMs: 100, attempts: 2, correct: 1, perSkill: {} }, bestStreak: 2, currentStreak: 1, lastActivityTs: 50 },
      'study.progress': { version: 1, concepts: {}, recentStudies: [], lastPrimaryId: null, lastPrimaryAt: 0 },
      'io.sessionHistory': [{ at: 10, minutes: 1 }],
      'io.mastery': { 'find|Standard|1|3': { attempts: 1, correct: 1 } },
      'io.masteryV2': { 'locate|click|standard|1|3': { attempts: 2, correct: 1 } },
    }));
    globalThis.localStorage.setItem('musi.gpAutoFollow', 'true');
    globalThis.localStorage.setItem('musi.gpParchmentZoom', '1.2');
    globalThis.localStorage.setItem('musi.notes', JSON.stringify([
      { id: 'note-1', title: 'T', body: 'B', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' },
    ]));
    globalThis.localStorage.setItem('musi.exercises', JSON.stringify({
      categories: [{ id: 'cat-1', name: 'Tabs' }],
      items: [{ id: 'ex-1', name: 'Ex', attachmentId: 'att-1', addedAt: '2026-01-01T00:00:00.000Z' }],
    }));

    const snapshot = buildSnapshot();
    const records = toRecords(snapshot, { drumPatterns: [], attachmentsMeta: [] });
    const rebuilt = fromRecords(records);

    for (const key of Object.keys(rebuilt.data)) {
      assert.ok(snapshot.data[key], `missing snapshot key ${key}`);
      if (key === 'musi:settings') {
        const rebuiltRemainder = JSON.parse(rebuilt.data[key]);
        const snapshotRemainder = JSON.parse(snapshot.data[key]);
        assert.deepEqual(rebuiltRemainder, filterSyncRemainder(snapshotRemainder));
        continue;
      }
      assert.deepEqual(JSON.parse(rebuilt.data[key]), JSON.parse(snapshot.data[key]));
    }
    const contentKeys = Object.keys(snapshot.data).filter((key) => {
      if (key === 'musi:settings') {
        const remainder = JSON.parse(snapshot.data[key]);
        return Object.keys(remainder).length > 0;
      }
      if (key === 'musi.gpAnnotations') {
        const gp = JSON.parse(snapshot.data[key]);
        return Object.keys(gp.byScore || {}).length > 0;
      }
      return true;
    });
    for (const key of contentKeys) {
      assert.ok(rebuilt.data[key], `round-trip missing key ${key}`);
    }
  });

  await test('device-local keys never appear in toRecords', () => {
    globalThis.localStorage.setItem('musi:settings', JSON.stringify({
      'nav.lastTool': 'ear',
      'nav.lastCategory': 'practice',
      'subview.tuner': 'on',
      'cloud.cursor': 5,
      'sync.advancedOpened': true,
      'io.minRms': 0.01,
      'global.volume': 0.5,
    }));
    const snapshot = buildSnapshot();
    const records = toRecords(snapshot);
    const settingsIds = records.filter((r) => r.domain === 'settings').map((r) => r.recordId);
    assert.ok(!settingsIds.some((id) => id.includes('nav.')));
    assert.ok(!settingsIds.some((id) => id.includes('subview.')));
    assert.ok(!settingsIds.some((id) => id.includes('cloud.')));
    assert.ok(!settingsIds.some((id) => id.includes('io.minRms')));
    assert.ok(settingsIds.includes('settings:global.volume'));
  });

  await test('isDeviceLocalSettingKey matches doc exclusions', () => {
    assert.equal(isDeviceLocalSettingKey('nav.lastTool'), true);
    assert.equal(isDeviceLocalSettingKey('subview.chords'), true);
    assert.equal(isDeviceLocalSettingKey('cloud.blobSyncEnabled'), true);
    assert.equal(isDeviceLocalSettingKey('global.volume'), false);
  });

  await test('toRecords fromRecords keeps parentId on nested folder domains', async () => {
    globalThis.localStorage.setItem('musi.exercises', JSON.stringify({
      categories: [
        { id: 'cat-parent', name: 'Guitar', parentId: '' },
        { id: 'cat-child', name: 'Scales', parentId: 'cat-parent' },
      ],
      items: [],
    }));
    globalThis.localStorage.setItem('musi.workbooks', JSON.stringify({
      folders: [
        { id: 'wbf-parent', name: 'Studies', parentId: '' },
        { id: 'wbf-child', name: 'Technique', parentId: 'wbf-parent' },
      ],
      workbooks: [],
    }));

    const snapshot = buildSnapshot({ scopes: ['content'] });
    const records = toRecords(snapshot);
    const rebuilt = fromRecords(records);
    const exercises = JSON.parse(rebuilt.data['musi.exercises']);
    const workbooks = JSON.parse(rebuilt.data['musi.workbooks']);

    assert.equal(exercises.categories.find((c) => c.id === 'cat-child').parentId, 'cat-parent');
    assert.equal(workbooks.folders.find((f) => f.id === 'wbf-child').parentId, 'wbf-parent');
  });
}
