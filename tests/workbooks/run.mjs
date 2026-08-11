/**
 * Zero-dependency Node tests for Exercise Workbook storage model.
 * Run: node tests/workbooks/run.mjs
 */

import assert from 'node:assert/strict';
import {
  WORKBOOKS_STORAGE_KEY,
  normalizeWorkbook,
  normalizeWorkbookFolder,
  listWorkbookFolders,
  createWorkbookFolder,
  renameWorkbookFolder,
  deleteWorkbookFolder,
  deleteWorkbookFolderWithContents,
  getWorkbookFolderOptions,
  listWorkbooks,
  getWorkbook,
  createWorkbook,
  renameWorkbook,
  deleteWorkbook,
  setWorkbookFolder,
  setWorkbookLoop,
  addExercisesToWorkbook,
  removeWorkbookEntry,
  moveWorkbookEntry,
  reorderWorkbookEntries,
  setActiveWorkbookEntry,
  nextWorkbookEntry,
  prevWorkbookEntry,
  getActiveWorkbookEntry,
  pruneMissingExercises,
  addCompanionToWorkbook,
  updateWorkbookCompanion,
  removeWorkbookCompanion,
  moveWorkbookCompanion,
  reorderWorkbookCompanions,
  setWorkbookCompanionCollapsed,
} from '../../js/workbookModel.js';
import { MAX_COMPANIONS } from '../../js/exerciseCompanions/types.js';
import {
  WB_KEY_ACTIONS,
  isWorkbookShortcutTargetBlocked,
  nodeInBlockedShortcutZone,
  resolveWorkbookShortcutAction,
} from '../../js/workbookKeyboard.js';

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

test('storage key and normalizers', () => {
  assert.equal(WORKBOOKS_STORAGE_KEY, 'musi.workbooks');
  const folder = normalizeWorkbookFolder({ id: 'wbf-1', name: 'Warm-ups' });
  assert.equal(folder.id, 'wbf-1');
  assert.equal(folder.name, 'Warm-ups');
  const wb = normalizeWorkbook({
    id: 'wb-1',
    name: 'Daily',
    folderId: '',
    entries: [{ id: 'wbe-1', exerciseId: 'ex-a' }],
    loopEnabled: undefined,
    activeEntryId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(wb.loopEnabled, true);
  assert.equal(wb.entries.length, 1);
});

test('create folders with case-insensitive dedupe', () => {
  const a = createWorkbookFolder('Technique');
  const b = createWorkbookFolder('technique');
  assert.ok(a);
  assert.ok(b);
  assert.equal(a.id, b.id);
  assert.equal(listWorkbookFolders().filter(f => f.name.toLowerCase() === 'technique').length, 1);
});

test('rename and delete folder keeps workbooks uncategorized', () => {
  const folder = createWorkbookFolder('Delete Me');
  const wb = createWorkbook({ name: 'Orphan WB', folderId: folder.id });
  assert.equal(getWorkbook(wb.id).folderId, folder.id);
  assert.ok(renameWorkbookFolder(folder.id, 'Renamed Folder'));
  assert.equal(listWorkbookFolders().find(f => f.id === folder.id).name, 'Renamed Folder');
  assert.ok(deleteWorkbookFolder(folder.id));
  assert.equal(getWorkbook(wb.id).folderId, '');
  assert.ok(!listWorkbookFolders().some(f => f.id === folder.id));
});

test('getWorkbookFolderOptions counts and synthetic entries', () => {
  const f1 = createWorkbookFolder('Folder A');
  createWorkbook({ name: 'WB in A', folderId: f1.id });
  createWorkbook({ name: 'WB loose' });
  const opts = getWorkbookFolderOptions();
  assert.equal(opts[0].id, 'all');
  assert.equal(opts[0].label, 'All Workbooks');
  assert.ok(opts[0].count >= 2);
  const folderOpt = opts.find(o => o.id === f1.id);
  assert.ok(folderOpt);
  assert.equal(folderOpt.count, 1);
  const uncat = opts.find(o => o.id === 'uncategorized');
  assert.ok(uncat);
  assert.equal(uncat.label, 'No folder');
  assert.ok(uncat.count >= 1);
});

test('create workbook defaults', () => {
  const wb = createWorkbook({ name: 'Fresh Workbook' });
  assert.ok(wb.id.startsWith('wb-'));
  assert.equal(wb.name, 'Fresh Workbook');
  assert.equal(wb.loopEnabled, true);
  assert.deepEqual(wb.entries, []);
  assert.equal(wb.activeEntryId, null);
  assert.ok(wb.createdAt);
  assert.ok(wb.updatedAt);
});

test('addExercisesToWorkbook preserves order, allows duplicates, ignores junk', () => {
  const wb = createWorkbook({ name: 'Entry Order' });
  const added = addExercisesToWorkbook(wb.id, ['ex-1', '', 'ex-2', 'ex-1', null, 42]);
  assert.equal(added.length, 3);
  assert.deepEqual(added.map(e => e.exerciseId), ['ex-1', 'ex-2', 'ex-1']);
  const ids = added.map(e => e.id);
  assert.equal(new Set(ids).size, 3);
  const stored = getWorkbook(wb.id);
  assert.deepEqual(stored.entries.map(e => e.exerciseId), ['ex-1', 'ex-2', 'ex-1']);
});

test('moveWorkbookEntry up and down with bounds', () => {
  const wb = createWorkbook({ name: 'Move Test', exerciseIds: ['a', 'b', 'c'] });
  const [e0, e1, e2] = getWorkbook(wb.id).entries;
  assert.ok(moveWorkbookEntry(wb.id, e1.id, -1));
  assert.deepEqual(getWorkbook(wb.id).entries.map(e => e.id), [e1.id, e0.id, e2.id]);
  assert.ok(moveWorkbookEntry(wb.id, e1.id, 1));
  assert.deepEqual(getWorkbook(wb.id).entries.map(e => e.id), [e0.id, e1.id, e2.id]);
  assert.equal(moveWorkbookEntry(wb.id, e0.id, -1), false);
  assert.equal(moveWorkbookEntry(wb.id, e2.id, 1), false);
});

test('reorderWorkbookEntries full and partial ordering', () => {
  const wb = createWorkbook({ name: 'Reorder', exerciseIds: ['a', 'b', 'c', 'd'] });
  const entries = getWorkbook(wb.id).entries;
  const ids = entries.map(e => e.id);
  assert.ok(reorderWorkbookEntries(wb.id, [ids[2], ids[0], ids[3], ids[1]]));
  assert.deepEqual(getWorkbook(wb.id).entries.map(e => e.id), [ids[2], ids[0], ids[3], ids[1]]);

  const wb2 = createWorkbook({ name: 'Partial Reorder', exerciseIds: ['w', 'x', 'y', 'z'] });
  const e2 = getWorkbook(wb2.id).entries;
  const i2 = e2.map(e => e.id);
  assert.ok(reorderWorkbookEntries(wb2.id, [i2[3], i2[1]]));
  assert.deepEqual(getWorkbook(wb2.id).entries.map(e => e.id), [i2[3], i2[1], i2[0], i2[2]]);
});

test('removeWorkbookEntry active-entry fallback', () => {
  const wb = createWorkbook({ name: 'Remove Active', exerciseIds: ['a', 'b', 'c'] });
  const entries = getWorkbook(wb.id).entries;
  setActiveWorkbookEntry(wb.id, entries[1].id);
  removeWorkbookEntry(wb.id, entries[1].id);
  assert.equal(getWorkbook(wb.id).activeEntryId, entries[2].id);

  const wb2 = createWorkbook({ name: 'Remove Last', exerciseIds: ['a', 'b'] });
  const e2 = getWorkbook(wb2.id).entries;
  setActiveWorkbookEntry(wb2.id, e2[1].id);
  removeWorkbookEntry(wb2.id, e2[1].id);
  assert.equal(getWorkbook(wb2.id).activeEntryId, e2[0].id);

  const wb3 = createWorkbook({ name: 'Remove Only', exerciseIds: ['solo'] });
  const e3 = getWorkbook(wb3.id).entries[0];
  setActiveWorkbookEntry(wb3.id, e3.id);
  removeWorkbookEntry(wb3.id, e3.id);
  assert.equal(getWorkbook(wb3.id).activeEntryId, null);
  assert.equal(getWorkbook(wb3.id).entries.length, 0);
});

test('next and prev workbook entry wrapping and active updates', () => {
  const wb = createWorkbook({ name: 'Nav', exerciseIds: ['a', 'b', 'c'] });
  const entries = getWorkbook(wb.id).entries;

  assert.equal(getActiveWorkbookEntry(wb.id).entry.exerciseId, 'a');
  const second = nextWorkbookEntry(wb.id);
  assert.equal(second.exerciseId, 'b');
  assert.equal(getWorkbook(wb.id).activeEntryId, entries[1].id);
  const third = nextWorkbookEntry(wb.id);
  assert.equal(third.exerciseId, 'c');
  const wrapped = nextWorkbookEntry(wb.id);
  assert.equal(wrapped.exerciseId, 'a');

  setActiveWorkbookEntry(wb.id, entries[0].id);
  assert.equal(nextWorkbookEntry(wb.id, { wrap: false }).exerciseId, 'b');
  setActiveWorkbookEntry(wb.id, entries[2].id);
  assert.equal(nextWorkbookEntry(wb.id, { wrap: false }), null);

  setActiveWorkbookEntry(wb.id, entries[0].id);
  const prevFromFirst = prevWorkbookEntry(wb.id);
  assert.equal(prevFromFirst.exerciseId, 'c');
  setActiveWorkbookEntry(wb.id, entries[1].id);
  assert.equal(prevWorkbookEntry(wb.id, { wrap: false }).exerciseId, 'a');
  setActiveWorkbookEntry(wb.id, entries[0].id);
  assert.equal(prevWorkbookEntry(wb.id, { wrap: false }), null);
});

test('getActiveWorkbookEntry falls back to first entry when none active', () => {
  const wb = createWorkbook({ name: 'No Active', exerciseIds: ['x', 'y'] });
  const active = getActiveWorkbookEntry(wb.id);
  assert.equal(active.index, 0);
  assert.equal(active.entry.exerciseId, 'x');
});

test('normalizeWorkbook clears stale activeEntryId on load', () => {
  const wb = normalizeWorkbook({
    id: 'wb-stale',
    name: 'Stale',
    folderId: '',
    entries: [{ id: 'wbe-real', exerciseId: 'x' }],
    loopEnabled: true,
    activeEntryId: 'wbe-gone',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(wb.activeEntryId, null);
});

test('setWorkbookLoop round-trip', () => {
  const wb = createWorkbook({ name: 'Loop' });
  assert.equal(getWorkbook(wb.id).loopEnabled, true);
  assert.ok(setWorkbookLoop(wb.id, false));
  assert.equal(getWorkbook(wb.id).loopEnabled, false);
  assert.ok(setWorkbookLoop(wb.id, true));
  assert.equal(getWorkbook(wb.id).loopEnabled, true);
});

test('pruneMissingExercises drops absent exercises only', () => {
  const wb = createWorkbook({ name: 'Prune', exerciseIds: ['keep', 'drop', 'keep2'] });
  const removed = pruneMissingExercises(wb.id, ['keep', 'keep2', 'other']);
  assert.equal(removed, 1);
  assert.deepEqual(getWorkbook(wb.id).entries.map(e => e.exerciseId), ['keep', 'keep2']);
});

test('deleteWorkbookFolderWithContents removes folder and its workbooks only', () => {
  const keepFolder = createWorkbookFolder('Keep Folder');
  const dropFolder = createWorkbookFolder('Drop Folder');
  const otherFolder = createWorkbookFolder('Other Folder');
  const wbDrop1 = createWorkbook({ name: 'Drop 1', folderId: dropFolder.id });
  const wbDrop2 = createWorkbook({ name: 'Drop 2', folderId: dropFolder.id });
  const wbOther = createWorkbook({ name: 'Other', folderId: otherFolder.id });
  const wbLoose = createWorkbook({ name: 'Loose' });
  const wbKeep = createWorkbook({ name: 'Keep', folderId: keepFolder.id });

  const result = deleteWorkbookFolderWithContents(dropFolder.id);
  assert.deepEqual(result, { ok: true, deleted: 2 });
  assert.ok(!listWorkbookFolders().some(f => f.id === dropFolder.id));
  assert.equal(getWorkbook(wbDrop1.id), null);
  assert.equal(getWorkbook(wbDrop2.id), null);
  assert.ok(getWorkbook(wbOther.id));
  assert.ok(getWorkbook(wbLoose.id));
  assert.ok(getWorkbook(wbKeep.id));
  assert.equal(listWorkbooks({ folderId: otherFolder.id }).length, 1);
  assert.equal(listWorkbooks({ folderId: 'uncategorized' }).some(w => w.id === wbLoose.id), true);
});

test('deleteWorkbookFolderWithContents on empty folder reports zero deleted', () => {
  const empty = createWorkbookFolder('Empty Folder');
  const result = deleteWorkbookFolderWithContents(empty.id);
  assert.deepEqual(result, { ok: true, deleted: 0 });
  assert.ok(!listWorkbookFolders().some(f => f.id === empty.id));
});

test('deleteWorkbookFolderWithContents returns not ok for missing folder', () => {
  assert.deepEqual(deleteWorkbookFolderWithContents('wbf-missing'), { ok: false, deleted: 0 });
});

test('listWorkbooks folder filtering and updatedAt sort order', () => {
  const folder = createWorkbookFolder('Sort Folder');
  const older = createWorkbook({ name: 'Older WB', folderId: folder.id });
  const newer = createWorkbook({ name: 'Newer WB', folderId: folder.id });
  const loose = createWorkbook({ name: 'Loose WB' });
  renameWorkbook(older.id, 'Older WB touched');
  assert.ok(listWorkbooks().find(w => w.id === older.id));
  const all = listWorkbooks();
  const allIds = all.map(w => w.id);
  const olderIdx = allIds.indexOf(older.id);
  const newerIdx = allIds.indexOf(newer.id);
  assert.ok(olderIdx >= 0 && newerIdx >= 0);
  assert.ok(olderIdx < newerIdx, 'renamed workbook should sort before untouched (newer updatedAt first)');

  const inFolder = listWorkbooks({ folderId: folder.id });
  assert.ok(inFolder.every(w => w.folderId === folder.id));
  assert.ok(inFolder.some(w => w.id === older.id));
  assert.ok(inFolder.some(w => w.id === newer.id));

  const uncat = listWorkbooks({ folderId: 'uncategorized' });
  assert.ok(uncat.some(w => w.id === loose.id));
  assert.ok(uncat.every(w => !w.folderId));

  const allFilter = listWorkbooks({ folderId: 'all' });
  assert.ok(allFilter.length >= all.length);
});

function makeEl(tag, { className = '', parent = null, role = null } = {}) {
  const el = {
    tagName: String(tag).toUpperCase(),
    isContentEditable: false,
    parentElement: parent,
    getAttribute(name) { return name === 'role' ? role : null; },
    classList: {
      _set: new Set(className.split(/\s+/).filter(Boolean)),
      contains(c) { return this._set.has(c); },
    },
  };
  if (parent) parent.children = parent.children || [];
  if (parent?.children) parent.children.push(el);
  return el;
}

test('resolveWorkbookShortcutAction maps keys when workbook detail is active', () => {
  const ctx = { openWorkbookId: 'wb-1', sectionActive: true, dialogOpen: false };
  const body = { tagName: 'BODY' };
  assert.equal(resolveWorkbookShortcutAction({ code: 'ArrowLeft', target: body }, ctx), WB_KEY_ACTIONS.PREV);
  assert.equal(resolveWorkbookShortcutAction({ code: 'ArrowRight', target: body }, ctx), WB_KEY_ACTIONS.NEXT);
  assert.equal(resolveWorkbookShortcutAction({ code: 'Space', repeat: false, target: body }, ctx), WB_KEY_ACTIONS.TOGGLE_PLAY);
  assert.equal(resolveWorkbookShortcutAction({ code: 'KeyA', target: body }, ctx), WB_KEY_ACTIONS.BPM_UP);
  assert.equal(resolveWorkbookShortcutAction({ code: 'KeyD', target: body }, ctx), WB_KEY_ACTIONS.BPM_DOWN);
});

test('resolveWorkbookShortcutAction ignores inactive, dialog, modifiers, and repeat Space', () => {
  const body = { tagName: 'BODY' };
  const active = { openWorkbookId: 'wb-1', sectionActive: true, dialogOpen: false };
  assert.equal(resolveWorkbookShortcutAction({ code: 'ArrowLeft', target: body }, { sectionActive: true }), null);
  assert.equal(resolveWorkbookShortcutAction({ code: 'ArrowLeft', target: body }, { ...active, sectionActive: false }), null);
  assert.equal(resolveWorkbookShortcutAction({ code: 'ArrowLeft', target: body }, { ...active, dialogOpen: true }), null);
  assert.equal(resolveWorkbookShortcutAction({ code: 'Space', repeat: true, target: body }, active), null);
  assert.equal(resolveWorkbookShortcutAction({ code: 'ArrowLeft', ctrlKey: true, target: body }, active), null);
  assert.equal(resolveWorkbookShortcutAction({ code: 'KeyA', metaKey: true, target: body }, active), null);
});

test('isWorkbookShortcutTargetBlocked skips form controls and modal zones', () => {
  assert.ok(isWorkbookShortcutTargetBlocked({ tagName: 'INPUT' }));
  assert.ok(isWorkbookShortcutTargetBlocked({ tagName: 'SELECT' }));
  assert.ok(isWorkbookShortcutTargetBlocked({ tagName: 'TEXTAREA' }));
  assert.ok(isWorkbookShortcutTargetBlocked({ tagName: 'BUTTON' }));
  assert.ok(isWorkbookShortcutTargetBlocked({ tagName: 'DIV', isContentEditable: true }));

  const modal = makeEl('div', { className: 'modal-dialog' });
  const inner = makeEl('span', { parent: modal });
  assert.ok(isWorkbookShortcutTargetBlocked(inner));

  const drawer = makeEl('div', { className: 'wb-playlist-drawer is-open' });
  const row = makeEl('div', { parent: drawer });
  assert.ok(isWorkbookShortcutTargetBlocked(row));
  assert.ok(!isWorkbookShortcutTargetBlocked({ tagName: 'DIV' }));
});

test('nodeInBlockedShortcutZone detects role=button ancestors', () => {
  const host = makeEl('div', { role: 'button' });
  const child = makeEl('span', { parent: host });
  assert.ok(nodeInBlockedShortcutZone(child));
});

test('old workbook without companions normalizes to empty array', () => {
  const wb = normalizeWorkbook({
    id: 'wb-old',
    name: 'Legacy',
    folderId: '',
    entries: [],
    loopEnabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  assert.deepEqual(wb.companions, []);
});

test('workbook companions round-trip, invalid dropped, and cap enforced', () => {
  const wb = createWorkbook({
    name: 'Companions',
    companions: [
      { type: 'scale-ref', root: 'C' },
      { type: 'nope', root: 'C' },
      { type: 'pitch-train', root: 'D' },
      { type: 'interval-orbit', root: 'G', mode: 'map', mapRange: 2, level: 3 },
      ...Array.from({ length: MAX_COMPANIONS }, (_, i) => ({
        type: 'scale-ref',
        root: 'E',
        id: `extra-${i}`,
      })),
    ],
  });
  const stored = getWorkbook(wb.id);
  assert.ok(stored.companions.length <= MAX_COMPANIONS);
  assert.ok(stored.companions.some((c) => c.type === 'pitch-train'));
  assert.ok(stored.companions.some((c) => c.type === 'interval-orbit' && c.mapRange === 2));
  assert.ok(!stored.companions.some((c) => c.type === 'nope'));
  const reloaded = normalizeWorkbook(JSON.parse(JSON.stringify(stored)));
  assert.equal(reloaded.companions.length, stored.companions.length);
});

test('getWorkbook returns deep copy of companions', () => {
  const wb = createWorkbook({ name: 'Copy safety' });
  addCompanionToWorkbook(wb.id, 'scale-ref');
  const copy = getWorkbook(wb.id);
  copy.companions.push({ id: 'fake', type: 'scale-ref', root: 'F' });
  assert.equal(getWorkbook(wb.id).companions.length, 1);
});

test('addCompanionToWorkbook by type and object respects limit', () => {
  const wb = createWorkbook({ name: 'Add limit' });
  const first = addCompanionToWorkbook(wb.id, 'scale-ref');
  assert.ok(first);
  assert.equal(first.companions.length, 1);
  const second = addCompanionToWorkbook(wb.id, { type: 'triad-ref', root: 'A' });
  assert.ok(second);
  for (let i = 0; i < MAX_COMPANIONS; i++) {
    addCompanionToWorkbook(wb.id, 'sweep-ref');
  }
  assert.equal(addCompanionToWorkbook(wb.id, 'pitch-train'), null);
});

test('addCompanionToWorkbook regenerates duplicate companion ids', () => {
  const wb = createWorkbook({ name: 'Duplicate ids' });
  const first = addCompanionToWorkbook(wb.id, {
    id: 'shared-id',
    type: 'scale-ref',
    root: 'C',
  });
  const second = addCompanionToWorkbook(wb.id, {
    id: 'shared-id',
    type: 'triad-ref',
    root: 'A',
  });
  assert.ok(first && second);
  const ids = getWorkbook(wb.id).companions.map((companion) => companion.id);
  assert.equal(new Set(ids).size, 2);
  assert.ok(ids.includes('shared-id'));
});

test('update remove move reorder and collapse companions', () => {
  const wb = createWorkbook({ name: 'Mutations' });
  addCompanionToWorkbook(wb.id, 'scale-ref');
  addCompanionToWorkbook(wb.id, 'triad-ref');
  addCompanionToWorkbook(wb.id, 'sweep-ref');
  const ids = getWorkbook(wb.id).companions.map((c) => c.id);

  const updated = updateWorkbookCompanion(wb.id, ids[0], { root: 'G', label: 'G major' });
  assert.ok(updated);
  assert.equal(getWorkbook(wb.id).companions[0].root, 'G');
  assert.equal(getWorkbook(wb.id).companions[0].label, 'G major');

  assert.ok(removeWorkbookCompanion(wb.id, ids[2]));
  assert.equal(getWorkbook(wb.id).companions.length, 2);

  assert.ok(moveWorkbookCompanion(wb.id, ids[1], -1));
  assert.equal(getWorkbook(wb.id).companions[0].id, ids[1]);

  assert.ok(reorderWorkbookCompanions(wb.id, [ids[0], ids[1]]));
  assert.deepEqual(getWorkbook(wb.id).companions.map((c) => c.id), [ids[0], ids[1]]);

  const beforeUpdated = getWorkbook(wb.id).updatedAt;
  assert.ok(setWorkbookCompanionCollapsed(wb.id, ids[0], true));
  const collapsed = getWorkbook(wb.id);
  assert.equal(collapsed.companions.find((c) => c.id === ids[0]).collapsed, true);
  assert.equal(collapsed.updatedAt, beforeUpdated);
});

test('isWorkbookShortcutTargetBlocked includes companion drawer zones', () => {
  const drawer = makeEl('div', { className: 'wb-cmp-drawer is-open' });
  const row = makeEl('div', { parent: drawer });
  assert.ok(isWorkbookShortcutTargetBlocked(row));
  const sheet = makeEl('div', { className: 'wb-cmp-sheet is-open' });
  const inner = makeEl('span', { parent: sheet });
  assert.ok(isWorkbookShortcutTargetBlocked(inner));
});

console.log(`\n${passed} tests passed`);

await import('./companion-panel.mjs');

