import assert from 'node:assert/strict';

export function assertNoDuplicateIds(items, idField = 'id') {
  const seen = new Set();
  items.forEach((item) => {
    const id = item?.[idField];
    assert.ok(id, `missing ${idField}`);
    assert.ok(!seen.has(id), `duplicate ${idField}: ${id}`);
    seen.add(id);
  });
}

export function assertSourceRecordsIntact(before, after, idField = 'id') {
  const beforeMap = new Map(before.map((row) => [row[idField], row]));
  after.forEach((row) => {
    const prev = beforeMap.get(row[idField]);
    if (!prev) return;
    assert.deepEqual(row, prev, `source record ${row[idField]} changed`);
  });
}

export function assertAppliedList(settingsRead, expectedIds) {
  const applied = settingsRead('migrations.applied', []);
  assert.ok(Array.isArray(applied), 'migrations.applied must be an array');
  expectedIds.forEach((id) => {
    assert.ok(applied.includes(id), `expected applied id ${id}`);
  });
}

export function assertNotApplied(settingsRead, id) {
  const applied = settingsRead('migrations.applied', []);
  assert.ok(!applied.includes(id), `id ${id} should not be in migrations.applied`);
}

export function countExercisesForSourceRef(items, patternId) {
  const ref = `drum-pattern:${patternId}`;
  return items.filter((item) => item.sourceRef === ref).length;
}
