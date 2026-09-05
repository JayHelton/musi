// A seeded random source for Riff Spark.
//
// Every idea the tool draws comes from a seed. The same seed gives the same
// idea again, so the Bank can keep a seed instead of a whole pattern, and a
// test can check a draw against a fixed result.
//
// This module is pure. It touches no screen, no clock, and no audio.

/**
 * Turn a seed string into a 32-bit integer.
 * @param {string} text
 * @returns {number}
 */
export function hashSeed(text) {
  let h = 2166136261;
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * A function that returns 0 to 1, driven by one seed.
 * @param {string|number} seed
 * @returns {() => number}
 */
export function createRng(seed) {
  let a = typeof seed === 'number' ? (seed >>> 0) : hashSeed(seed);
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A short seed the user can read and type back. */
export function randomSeed(rng = Math.random) {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[Math.floor(rng() * alphabet.length)];
  }
  return out;
}

/** One item of a list, chosen at random. */
export function pickOne(list, rng) {
  if (!Array.isArray(list) || !list.length) return undefined;
  return list[Math.floor(rng() * list.length)];
}

/** A copy of a list in random order. */
export function shuffle(list, rng) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = out[i];
    out[i] = out[j];
    out[j] = swap;
  }
  return out;
}
