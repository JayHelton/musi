/**
 * Zero-dependency Node tests for js/folderTree.js.
 * Run: node tests/folder-tree/run.mjs
 */

import assert from 'node:assert/strict';
import {
  MAX_FOLDER_DEPTH,
  FOLDER_PATH_SEPARATOR,
  normalizeParentId,
  sanitizeFolderTree,
  folderById,
  folderChildren,
  folderDescendantIds,
  folderSubtreeIds,
  folderDepth,
  folderPath,
  folderPathLabel,
  flattenFolderTree,
  folderSubtreeHeight,
  canMoveFolder,
  findSiblingByName,
  validMoveTargets,
  nextParentAfterDelete,
} from '../../js/folderTree.js';

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

test('normalizeParentId coerces non-strings to empty string', () => {
  assert.equal(normalizeParentId('parent-1'), 'parent-1');
  assert.equal(normalizeParentId(''), '');
  assert.equal(normalizeParentId(null), '');
  assert.equal(normalizeParentId(undefined), '');
  assert.equal(normalizeParentId(42), '');
  assert.equal(normalizeParentId({}), '');
});

test('sanitizeFolderTree leaves a valid tree untouched', () => {
  const input = [
    { id: 'a', name: 'A', parentId: '' },
    { id: 'b', name: 'B', parentId: 'a' },
  ];
  const result = sanitizeFolderTree(input);
  assert.equal(result.changed, false);
  assert.deepEqual(result.folders, input);
});

test('sanitizeFolderTree resets an unknown parent', () => {
  const input = [{ id: 'a', name: 'A', parentId: 'missing' }];
  const result = sanitizeFolderTree(input);
  assert.equal(result.changed, true);
  assert.equal(result.folders[0].parentId, '');
});

test('sanitizeFolderTree resets a self-parent', () => {
  const input = [{ id: 'a', name: 'A', parentId: 'a' }];
  const result = sanitizeFolderTree(input);
  assert.equal(result.changed, true);
  assert.equal(result.folders[0].parentId, '');
});

test('sanitizeFolderTree breaks a two-node cycle', () => {
  const input = [
    { id: 'a', name: 'A', parentId: 'b' },
    { id: 'b', name: 'B', parentId: 'a' },
  ];
  const result = sanitizeFolderTree(input);
  assert.equal(result.folders.length, 2);
  assert.equal(result.folders.find((f) => f.id === 'a').parentId, '');
  assert.equal(result.folders.find((f) => f.id === 'b').parentId, '');
  assert.equal(result.changed, true);

  const again = sanitizeFolderTree(result.folders);
  assert.equal(again.changed, false);
});

test('sanitizeFolderTree breaks a three-node cycle', () => {
  const input = [
    { id: 'a', name: 'A', parentId: 'c' },
    { id: 'b', name: 'B', parentId: 'a' },
    { id: 'c', name: 'C', parentId: 'b' },
  ];
  const result = sanitizeFolderTree(input);
  assert.equal(result.folders.length, 3);
  assert.equal(result.folders.find((f) => f.id === 'a').parentId, '');
  assert.equal(result.folders.find((f) => f.id === 'b').parentId, '');
  assert.equal(result.folders.find((f) => f.id === 'c').parentId, '');
  assert.equal(result.changed, true);

  const again = sanitizeFolderTree(result.folders);
  assert.equal(again.changed, false);
});

test('sanitizeFolderTree does not mutate input and preserves extra fields', () => {
  const input = [
    { id: 'a', name: 'A', parentId: 'ghost', color: 'red' },
  ];
  const snapshot = JSON.parse(JSON.stringify(input));
  const result = sanitizeFolderTree(input);
  assert.deepEqual(input, snapshot);
  assert.equal(result.folders[0].color, 'red');
  assert.notEqual(result.folders[0], input[0]);
});

test('folderChildren, folderDescendantIds, and folderSubtreeIds on a 3-level tree', () => {
  const folders = [
    { id: 'a', name: 'A', parentId: '' },
    { id: 'b', name: 'B', parentId: 'a' },
    { id: 'c', name: 'C', parentId: 'b' },
  ];

  const topChildren = folderChildren(folders, '');
  assert.deepEqual(topChildren.map((f) => f.id), ['a']);

  const aChildren = folderChildren(folders, 'a');
  assert.deepEqual(aChildren.map((f) => f.id), ['b']);

  const descendants = folderDescendantIds(folders, 'a');
  assert.deepEqual([...descendants].sort(), ['b', 'c']);

  const subtree = folderSubtreeIds(folders, 'a');
  assert.deepEqual([...subtree].sort(), ['a', 'b', 'c']);
  assert.ok(!folderDescendantIds(folders, 'c').has('c'));
});

test('folderDepth for top level, depth 2, depth 3, unknown id, and empty id', () => {
  const folders = [
    { id: 'a', name: 'A', parentId: '' },
    { id: 'b', name: 'B', parentId: 'a' },
    { id: 'c', name: 'C', parentId: 'b' },
  ];
  assert.equal(folderDepth(folders, 'a'), 1);
  assert.equal(folderDepth(folders, 'b'), 2);
  assert.equal(folderDepth(folders, 'c'), 3);
  assert.equal(folderDepth(folders, 'missing'), 0);
  assert.equal(folderDepth(folders, ''), 0);
});

test('folderPath and folderPathLabel produce A › B › C', () => {
  const folders = [
    { id: 'a', name: 'A', parentId: '' },
    { id: 'b', name: 'B', parentId: 'a' },
    { id: 'c', name: 'C', parentId: 'b' },
  ];
  const path = folderPath(folders, 'c');
  assert.deepEqual(path.map((f) => f.id), ['a', 'b', 'c']);
  assert.equal(folderPathLabel(folders, 'c'), 'A \u203A B \u203A C');
  assert.equal(folderPathLabel(folders, 'c', FOLDER_PATH_SEPARATOR), 'A \u203A B \u203A C');
});

test('flattenFolderTree order and depth with two roots and an orphan parent', () => {
  const folders = [
    { id: 'r1', name: 'Root1', parentId: '' },
    { id: 'r1c', name: 'R1 Child', parentId: 'r1' },
    { id: 'r2', name: 'Root2', parentId: '' },
    { id: 'orphan', name: 'Orphan', parentId: 'gone' },
  ];
  const rows = flattenFolderTree(folders);
  assert.deepEqual(rows.map((r) => r.id), ['r1', 'r1c', 'r2', 'orphan']);
  assert.equal(rows[0].depth, 1);
  assert.equal(rows[1].depth, 2);
  assert.equal(rows[2].depth, 1);
  assert.equal(rows[3].depth, 1);
  assert.equal(rows[1].path, 'Root1 \u203A R1 Child');
});

test('folderSubtreeHeight for a leaf, a parent, and a 3-level chain', () => {
  const folders = [
    { id: 'a', name: 'A', parentId: '' },
    { id: 'b', name: 'B', parentId: 'a' },
    { id: 'c', name: 'C', parentId: 'b' },
  ];
  assert.equal(folderSubtreeHeight(folders, 'c'), 1);
  assert.equal(folderSubtreeHeight(folders, 'b'), 2);
  assert.equal(folderSubtreeHeight(folders, 'a'), 3);
});

test('canMoveFolder allows a valid move and a no-op move to the current parent', () => {
  const folders = [
    { id: 'a', name: 'A', parentId: '' },
    { id: 'b', name: 'B', parentId: 'a' },
    { id: 'c', name: 'C', parentId: '' },
  ];
  assert.deepEqual(canMoveFolder(folders, 'b', 'c'), { ok: true, reason: '' });
  assert.deepEqual(canMoveFolder(folders, 'b', 'a'), { ok: true, reason: '' });
});

test('canMoveFolder blocks self, descendant, missing, and parent-missing', () => {
  const folders = [
    { id: 'a', name: 'A', parentId: '' },
    { id: 'b', name: 'B', parentId: 'a' },
    { id: 'c', name: 'C', parentId: 'b' },
  ];
  assert.deepEqual(canMoveFolder(folders, 'b', 'b'), { ok: false, reason: 'self' });
  assert.deepEqual(canMoveFolder(folders, 'a', 'c'), { ok: false, reason: 'descendant' });
  assert.deepEqual(canMoveFolder(folders, 'missing', 'a'), { ok: false, reason: 'missing' });
  assert.deepEqual(canMoveFolder(folders, 'b', 'ghost'), { ok: false, reason: 'parent-missing' });
});

test('canMoveFolder blocks depth at MAX_FOLDER_DEPTH boundary', () => {
  const folders = [];
  let parentId = '';
  for (let i = 0; i < MAX_FOLDER_DEPTH; i += 1) {
    const id = `d${i + 1}`;
    folders.push({ id, name: `D${i + 1}`, parentId });
    parentId = id;
  }
  folders.push({ id: 'x', name: 'X', parentId: '' });

  const deepest = folders[MAX_FOLDER_DEPTH - 1];
  const root = folders[0];
  assert.deepEqual(canMoveFolder(folders, deepest.id, 'x'), { ok: true, reason: '' });
  assert.deepEqual(canMoveFolder(folders, root.id, 'x'), { ok: false, reason: 'depth' });
});

test('validMoveTargets omits the folder itself and its descendants', () => {
  const folders = [
    { id: 'a', name: 'A', parentId: '' },
    { id: 'b', name: 'B', parentId: 'a' },
    { id: 'c', name: 'C', parentId: 'b' },
    { id: 'd', name: 'D', parentId: '' },
  ];
  const targets = validMoveTargets(folders, 'a');
  const ids = targets.map((row) => row.id);
  assert.ok(!ids.includes('a'));
  assert.ok(!ids.includes('b'));
  assert.ok(!ids.includes('c'));
  assert.ok(ids.includes('d'));
});

test('findSiblingByName is case-insensitive and scoped to one parent', () => {
  const folders = [
    { id: 'p1', name: 'P1', parentId: '' },
    { id: 'p2', name: 'P2', parentId: '' },
    { id: 'c1', name: 'Scales', parentId: 'p1' },
    { id: 'c2', name: ' scales ', parentId: 'p2' },
  ];
  assert.equal(findSiblingByName(folders, 'p1', 'SCALES').id, 'c1');
  assert.equal(findSiblingByName(folders, 'p2', 'Scales').id, 'c2');
  assert.equal(findSiblingByName(folders, 'p1', 'missing'), null);
});

test('nextParentAfterDelete for nested and top-level folders', () => {
  const folders = [
    { id: 'a', name: 'A', parentId: '' },
    { id: 'b', name: 'B', parentId: 'a' },
    { id: 'c', name: 'C', parentId: 'b' },
  ];
  assert.equal(nextParentAfterDelete(folders, 'c'), 'b');
  assert.equal(nextParentAfterDelete(folders, 'a'), '');
  assert.equal(nextParentAfterDelete(folders, 'missing'), '');
});

test('folderById returns a folder record or null', () => {
  const folders = [{ id: 'a', name: 'A', parentId: '' }];
  assert.equal(folderById(folders, 'a').name, 'A');
  assert.equal(folderById(folders, 'missing'), null);
});

test('folderPathLabel returns empty string for unknown id', () => {
  assert.equal(folderPathLabel([], 'missing'), '');
});

console.log(`\n${passed} tests passed`);
console.log('folder-tree tests: ok');
