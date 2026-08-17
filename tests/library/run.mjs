/**
 * Zero-dependency Node tests for the shared Drive-style library browser model.
 * Run: node tests/library/run.mjs
 */

import assert from 'node:assert/strict';
import {
  entryKey,
  parseEntryKey,
  normalizeViewMode,
  normalizeSort,
  toggleSort,
  sortEntries,
  filterEntries,
  buildCrumbs,
  collapseCrumbs,
  rangeKeys,
  stepKey,
  formatSize,
  formatModified,
  formatCount,
} from '../../js/library/driveModel.js';

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

function folder(id, name, extra = {}) {
  return { kind: 'folder', id, name, typeLabel: 'Folder', size: null, modifiedAt: '', ...extra };
}

function item(id, name, extra = {}) {
  return { kind: 'item', id, name, typeLabel: 'PDF', size: 100, modifiedAt: '2026-01-01T00:00:00.000Z', ...extra };
}

const TREE = [
  { id: 'guitar', name: 'Guitar', parentId: '' },
  { id: 'scales', name: 'Scales', parentId: 'guitar' },
  { id: 'modes', name: 'Modes', parentId: 'scales' },
  { id: 'dorian', name: 'Dorian', parentId: 'modes' },
];

// --- keys -------------------------------------------------------------------

test('entryKey and parseEntryKey round-trip an id that holds a colon', () => {
  const key = entryKey({ kind: 'item', id: 'ex:1:2' });
  assert.equal(key, 'item:ex:1:2');
  assert.deepEqual(parseEntryKey(key), { kind: 'item', id: 'ex:1:2' });
});

test('parseEntryKey returns empty parts for junk input', () => {
  assert.deepEqual(parseEntryKey('nope'), { kind: '', id: '' });
  assert.deepEqual(parseEntryKey(null), { kind: '', id: '' });
});

// --- view and sort state ----------------------------------------------------

test('normalizeViewMode falls back to list', () => {
  assert.equal(normalizeViewMode('grid'), 'grid');
  assert.equal(normalizeViewMode('list'), 'list');
  assert.equal(normalizeViewMode('columns'), 'list');
  assert.equal(normalizeViewMode(undefined), 'list');
});

test('normalizeSort repairs a bad key or direction', () => {
  assert.deepEqual(normalizeSort({ key: 'size', dir: 'desc' }), { key: 'size', dir: 'desc' });
  assert.deepEqual(normalizeSort({ key: 'colour', dir: 'sideways' }), { key: 'name', dir: 'asc' });
  assert.deepEqual(normalizeSort(null), { key: 'name', dir: 'asc' });
});

test('toggleSort flips the active column and starts a new column in its natural direction', () => {
  assert.deepEqual(toggleSort({ key: 'name', dir: 'asc' }, 'name'), { key: 'name', dir: 'desc' });
  assert.deepEqual(toggleSort({ key: 'name', dir: 'desc' }, 'name'), { key: 'name', dir: 'asc' });
  assert.deepEqual(toggleSort({ key: 'name', dir: 'asc' }, 'size'), { key: 'size', dir: 'desc' });
  assert.deepEqual(toggleSort({ key: 'name', dir: 'asc' }, 'type'), { key: 'type', dir: 'asc' });
  assert.deepEqual(toggleSort({ key: 'name', dir: 'asc' }, 'bogus'), { key: 'name', dir: 'asc' });
});

// --- sorting ----------------------------------------------------------------

test('folders stay above items in every sort order', () => {
  const rows = [item('a', 'Alpha'), folder('z', 'Zulu'), item('b', 'Bravo'), folder('m', 'Mike')];
  const asc = sortEntries(rows, { key: 'name', dir: 'asc' });
  assert.deepEqual(asc.map(r => r.id), ['m', 'z', 'a', 'b']);

  const desc = sortEntries(rows, { key: 'name', dir: 'desc' });
  assert.deepEqual(desc.map(r => r.id), ['z', 'm', 'b', 'a']);
});

test('name sort orders numbers the way a person reads them', () => {
  const rows = [item('a', 'Take 10'), item('b', 'Take 2'), item('c', 'Take 1')];
  const sorted = sortEntries(rows, { key: 'name', dir: 'asc' });
  assert.deepEqual(sorted.map(r => r.name), ['Take 1', 'Take 2', 'Take 10']);
});

test('size sort puts an unknown size last when descending', () => {
  const rows = [
    item('a', 'Small', { size: 10 }),
    item('b', 'Link', { size: null }),
    item('c', 'Big', { size: 900 }),
  ];
  const desc = sortEntries(rows, { key: 'size', dir: 'desc' });
  assert.deepEqual(desc.map(r => r.id), ['c', 'a', 'b']);
});

test('a tie on a non-name column breaks on the name', () => {
  const rows = [
    item('a', 'Zulu', { typeLabel: 'PDF' }),
    item('b', 'Alpha', { typeLabel: 'PDF' }),
  ];
  const sorted = sortEntries(rows, { key: 'type', dir: 'desc' });
  assert.deepEqual(sorted.map(r => r.name), ['Alpha', 'Zulu']);
});

test('sortEntries does not change the array it is given', () => {
  const rows = [item('a', 'Zulu'), item('b', 'Alpha')];
  sortEntries(rows, { key: 'name', dir: 'asc' });
  assert.deepEqual(rows.map(r => r.id), ['a', 'b']);
});

// --- filtering --------------------------------------------------------------

test('filterEntries matches part of a name and ignores case', () => {
  const rows = [item('a', 'Dorian Run'), folder('b', 'Scales'), item('c', 'Major scale warmup')];
  assert.deepEqual(filterEntries(rows, 'scale').map(r => r.id), ['b', 'c']);
  assert.deepEqual(filterEntries(rows, '  ').map(r => r.id), ['a', 'b', 'c']);
});

test('filterEntries also matches the note line', () => {
  const rows = [
    item('a', 'Monday', { note: 'Blues in A' }),
    item('b', 'Tuesday', { note: 'Sweep picking' }),
    item('c', 'Wednesday'),
  ];
  assert.deepEqual(filterEntries(rows, 'blues').map(r => r.id), ['a']);
  assert.deepEqual(filterEntries(rows, 'day').map(r => r.id), ['a', 'b', 'c']);
});

// --- breadcrumbs ------------------------------------------------------------

test('buildCrumbs starts at the root and ends at the open folder', () => {
  const crumbs = buildCrumbs(TREE, 'modes', 'My Exercises');
  assert.deepEqual(crumbs.map(c => c.label), ['My Exercises', 'Guitar', 'Scales', 'Modes']);
  assert.equal(crumbs[0].isRoot, true);
  assert.equal(crumbs[3].isCurrent, true);
  assert.equal(crumbs[0].isCurrent, false);
});

test('buildCrumbs at the root has one crumb and it is current', () => {
  const crumbs = buildCrumbs(TREE, '', 'My Workbooks');
  assert.equal(crumbs.length, 1);
  assert.equal(crumbs[0].isCurrent, true);
});

test('collapseCrumbs hides the middle of a long trail', () => {
  const crumbs = buildCrumbs(TREE, 'dorian', 'My Exercises');
  assert.equal(crumbs.length, 5);
  const trail = collapseCrumbs(crumbs, 4, 2);
  assert.deepEqual(trail.map(c => c.label), ['My Exercises', '…', 'Modes', 'Dorian']);
  assert.deepEqual(trail[1].hidden.map(c => c.label), ['Guitar', 'Scales']);
});

test('collapseCrumbs leaves a short trail alone', () => {
  const crumbs = buildCrumbs(TREE, 'scales', 'My Exercises');
  assert.deepEqual(collapseCrumbs(crumbs, 4, 2).map(c => c.label), crumbs.map(c => c.label));
});

// --- selection helpers ------------------------------------------------------

const KEYS = ['folder:a', 'folder:b', 'item:1', 'item:2', 'item:3'];

test('rangeKeys covers the span in both directions', () => {
  assert.deepEqual(rangeKeys(KEYS, 'folder:b', 'item:2'), ['folder:b', 'item:1', 'item:2']);
  assert.deepEqual(rangeKeys(KEYS, 'item:2', 'folder:b'), ['folder:b', 'item:1', 'item:2']);
});

test('rangeKeys without a usable anchor selects the target alone', () => {
  assert.deepEqual(rangeKeys(KEYS, 'gone', 'item:1'), ['item:1']);
  assert.deepEqual(rangeKeys(KEYS, 'folder:a', 'gone'), []);
});

test('stepKey stops at both ends instead of wrapping', () => {
  assert.equal(stepKey(KEYS, 'folder:a', -1), 'folder:a');
  assert.equal(stepKey(KEYS, 'item:3', 1), 'item:3');
  assert.equal(stepKey(KEYS, 'item:1', 1), 'item:2');
  assert.equal(stepKey(KEYS, 'unknown', 1), 'folder:a');
  assert.equal(stepKey([], 'item:1', 1), '');
});

// --- formatting -------------------------------------------------------------

test('formatSize scales the unit and shows an em dash for nothing', () => {
  assert.equal(formatSize(0), '—');
  assert.equal(formatSize(null), '—');
  assert.equal(formatSize(512), '512 B');
  assert.equal(formatSize(2048), '2.0 KB');
  assert.equal(formatSize(5 * 1024 * 1024), '5.0 MB');
  assert.equal(formatSize(40 * 1024 * 1024), '40 MB');
});

test('formatModified switches format by how old the date is', () => {
  const now = new Date('2026-08-17T15:00:00.000Z');
  assert.equal(formatModified('', now), '—');
  assert.equal(formatModified('not-a-date', now), '—');
  assert.ok(formatModified('2026-08-17T09:00:00.000Z', now).length > 0);
  assert.equal(
    formatModified('2020-03-04T09:00:00.000Z', now),
    new Date('2020-03-04T09:00:00.000Z').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
  );
});

test('formatCount pluralizes and stays empty at zero', () => {
  assert.equal(formatCount(0), '');
  assert.equal(formatCount(1), '1 item');
  assert.equal(formatCount(4), '4 items');
  assert.equal(formatCount(2, 'exercise'), '2 exercises');
});

console.log(`\n${passed} tests passed`);
console.log('library tests: ok');
