import assert from 'node:assert/strict';
import { contentHash } from '../../js/cloud/recordMap.js';
import { shadowKey } from '../../js/cloud/shadowStore.js';
import { diffAgainstShadow } from '../../js/cloud/reconcile.js';

export async function runShadowDiffTests(test) {
  await test('shadow diff emits upsert when note payload changes', async () => {
    const payload = { id: 'note-1', title: 'A', body: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
    const hash = await contentHash(payload);
    const shadow = new Map([
      [shadowKey('notes', 'note-1'), { domain: 'notes', recordId: 'note-1', contentHash: hash, updatedAt: null, rev: null }],
    ]);
    const changed = { ...payload, title: 'B' };
    const records = [{
      domain: 'notes',
      recordId: 'note-1',
      payload: changed,
      contentHash: await contentHash(changed),
    }];
    const diff = await diffAgainstShadow(records, shadow);
    assert.equal(diff.upserts.length, 1);
    assert.equal(diff.tombstones.length, 0);
  });

  await test('shadow diff emits nothing when payload unchanged', async () => {
    const payload = { id: 'note-1', title: 'A', body: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
    const hash = await contentHash(payload);
    const shadow = new Map([
      [shadowKey('notes', 'note-1'), { domain: 'notes', recordId: 'note-1', contentHash: hash, updatedAt: null, rev: null }],
    ]);
    const records = [{
      domain: 'notes',
      recordId: 'note-1',
      payload,
      contentHash: hash,
    }];
    const diff = await diffAgainstShadow(records, shadow);
    assert.equal(diff.upserts.length, 0);
  });

  await test('shadow diff emits tombstone when local record disappears', async () => {
    const shadow = new Map([
      [shadowKey('notes', 'note-old'), { domain: 'notes', recordId: 'note-old', contentHash: 'sha256:abc', updatedAt: null, rev: null }],
    ]);
    const diff = await diffAgainstShadow([], shadow);
    assert.equal(diff.upserts.length, 0);
    assert.equal(diff.tombstones.length, 1);
    assert.deepEqual(diff.tombstones[0], { domain: 'notes', recordId: 'note-old' });
  });

  await test('mass-delete guard trips above 25 percent of a domain', async () => {
    const shadow = new Map();
    for (let i = 0; i < 4; i += 1) {
      const id = `note-${i}`;
      shadow.set(shadowKey('notes', id), { domain: 'notes', recordId: id, contentHash: `h${i}`, updatedAt: null, rev: null });
    }
    const diff = await diffAgainstShadow([], shadow);
    assert.ok(diff.massDelete);
    assert.equal(diff.massDelete.domain, 'notes');
    assert.ok(diff.massDelete.ratio > 0.25);
  });

  await test('mass-delete guard stays quiet below 25 percent', async () => {
    const shadow = new Map();
    for (let i = 0; i < 10; i += 1) {
      const id = `note-${i}`;
      shadow.set(shadowKey('notes', id), { domain: 'notes', recordId: id, contentHash: `h${i}`, updatedAt: null, rev: null });
    }
    const records = [];
    for (let i = 0; i < 8; i += 1) {
      const payload = {
        id: `note-${i}`,
        title: 'keep',
        body: '',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      records.push({
        domain: 'notes',
        recordId: `note-${i}`,
        payload,
        contentHash: await contentHash(payload),
      });
    }
    const diff = await diffAgainstShadow(records, shadow);
    assert.equal(diff.massDelete, null);
    assert.equal(diff.tombstones.length, 2);
  });
}
