import assert from 'node:assert/strict';
import { contentHash, stableStringify } from '../../js/cloud/recordMap.js';

export async function runContentHashTests(test) {
  await test('contentHash is stable across key order permutations', async () => {
    const a = { z: 1, a: 2, m: { y: 1, x: 2 } };
    const b = { m: { x: 2, y: 1 }, a: 2, z: 1 };
    assert.equal(stableStringify(a), stableStringify(b));
    const ha = await contentHash(a);
    const hb = await contentHash(b);
    assert.equal(ha, hb);
  });

  await test('contentHash differs when a value changes', async () => {
    const h1 = await contentHash({ id: 'note-1', title: 'A' });
    const h2 = await contentHash({ id: 'note-1', title: 'B' });
    assert.notEqual(h1, h2);
  });
}
