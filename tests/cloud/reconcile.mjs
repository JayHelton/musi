import assert from 'node:assert/strict';
import { savePattern, listPatterns } from '../../js/drums/drumPatternDb.js';
import { applyRemoteRecords, deleteLocalRecords } from '../../js/cloud/reconcile.js';

export async function runReconcileTests(test) {
  await test('applyRemoteRecords merges a remote note into localStorage', async () => {
    globalThis.localStorage.setItem('musi.notes', JSON.stringify([
      { id: 'note-1', title: 'Local', body: 'x', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    ]));
    const remoteNote = {
      id: 'note-2',
      title: 'Remote',
      body: 'y',
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-03T00:00:00.000Z',
    };
    const result = await applyRemoteRecords([
      {
        domain: 'notes',
        record_id: 'note-2',
        payload: remoteNote,
        deleted: false,
        updated_at: '2026-01-03T00:00:00.000Z',
        rev: 1,
        device_id: 'dev-other',
        content_hash: 'sha256:abc',
      },
    ]);
    assert.ok(result.applied.length > 0);
    const notes = JSON.parse(globalThis.localStorage.getItem('musi.notes'));
    assert.equal(notes.length, 2);
    assert.ok(notes.some((n) => n.id === 'note-2' && n.title === 'Remote'));
  });

  await test('applyRemoteRecords tombstone removes a local note', async () => {
    globalThis.localStorage.setItem('musi.notes', JSON.stringify([
      { id: 'note-del', title: 'Del', body: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    ]));
    await applyRemoteRecords([
      {
        domain: 'notes',
        record_id: 'note-del',
        payload: {},
        deleted: true,
        updated_at: '2026-01-04T00:00:00.000Z',
        rev: 2,
        device_id: 'dev-other',
        content_hash: '',
      },
    ]);
    const notes = JSON.parse(globalThis.localStorage.getItem('musi.notes'));
    assert.equal(notes.length, 0);
  });

  await test('deleteLocalRecords removes note drum pattern and settings key', async () => {
    globalThis.localStorage.setItem('musi.notes', JSON.stringify([
      { id: 'note-x', title: 'X', body: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    ]));
    globalThis.localStorage.setItem('musi:settings', JSON.stringify({ 'global.volume': 0.8, stats: { bestStreak: 1 } }));
    await savePattern({ id: 'usr-test1', name: 'Beat', steps: [], builtin: false });

    const del = await deleteLocalRecords([
      { domain: 'notes', recordId: 'note-x' },
      { domain: 'drumPatterns', recordId: 'usr-test1' },
      { domain: 'settings', recordId: 'settings:global.volume' },
    ]);
    assert.equal(del.deleted.length, 3);

    const notes = JSON.parse(globalThis.localStorage.getItem('musi.notes'));
    assert.equal(notes.length, 0);
    const settings = JSON.parse(globalThis.localStorage.getItem('musi:settings'));
    assert.equal(settings['global.volume'], undefined);
    const patterns = await listPatterns();
    assert.equal(patterns.filter((p) => p.id === 'usr-test1').length, 0);
  });
}
