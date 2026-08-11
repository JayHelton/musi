/**
 * Zero-dependency Node tests for shared music context.
 * Run: node tests/music-context/run.mjs
 */

import assert from 'node:assert/strict';

function installLocalStorageShim() {
  const store = new Map();
  globalThis.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    _store: store,
  };
  return store;
}

const store = installLocalStorageShim();
globalThis.window = globalThis;

const {
  MUSIC_CONTEXT_DEFAULTS,
  getMusicContext,
  getMusicContextDefaults,
  setMusicContext,
  pushOverride,
  popOverride,
  resetOverrides,
  subscribeMusicContext,
} = await import('../../js/core/musicContext.js');

const {
  getContext,
  setContext,
  subscribeContext,
} = await import('../../js/musicalContext.js');

const { getSetting, invalidateSettingsCache } = await import('../../js/persistence.js');

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

function resetState() {
  store.clear();
  invalidateSettingsCache();
  resetOverrides();
  setContext({
    root: 'C',
    scale: 'Major (Ionian)',
    tempo: 120,
    rootMode: 'fixed',
    scaleMode: 'fixed',
  }, 'test-reset');
  setMusicContext({
    instrument: 'guitar',
    tuningId: MUSIC_CONTEXT_DEFAULTS.tuningId,
    modeId: null,
    keySignaturePreference: 'sharps',
    meter: { numerator: 4, denominator: 4 },
  }, 'test-reset');
}

test('module imports without document or window DOM APIs', () => {
  assert.equal(typeof document, 'undefined');
});

test('defaults shape and values', () => {
  resetState();
  const defaults = getMusicContextDefaults();
  assert.deepEqual(defaults, {
    instrument: 'guitar',
    tuningId: MUSIC_CONTEXT_DEFAULTS.tuningId,
    root: 'C',
    scaleId: 'Major (Ionian)',
    modeId: null,
    keySignaturePreference: 'sharps',
    tempoBpm: 120,
    meter: { numerator: 4, denominator: 4 },
  });
  assert.equal(MUSIC_CONTEXT_DEFAULTS.tuningId, '6-e-std');
  assert.equal(MUSIC_CONTEXT_DEFAULTS.instrument, 'guitar');
});

test('persistence round-trip for new fields', () => {
  resetState();
  setMusicContext({
    instrument: 'bass',
    tuningId: 'bass-4',
    modeId: 'Dorian',
    keySignaturePreference: 'flats',
    meter: { numerator: 6, denominator: 8 },
  });

  invalidateSettingsCache();
  assert.equal(getSetting('context.instrument', null), 'bass');
  assert.equal(getSetting('context.tuningId', null), 'bass-4');
  assert.equal(getSetting('context.mode', null), 'Dorian');
  assert.equal(getSetting('context.accidentals', null), 'flats');
  assert.deepEqual(getSetting('context.meter', null), { numerator: 6, denominator: 8 });
});

test('write-through sync from music context to musical context', () => {
  resetState();
  setMusicContext({ root: 'D', scaleId: 'Dorian', tempoBpm: 96 });
  const ctx = getContext();
  assert.equal(ctx.root, 'D');
  assert.equal(ctx.scale, 'Dorian');
  assert.equal(ctx.tempo, 96);
});

test('read-through sync from musical context to music context', () => {
  resetState();
  setContext({ root: 'F', scale: 'Blues', tempo: 140 }, 'external-feature');
  const state = getMusicContext();
  assert.equal(state.root, 'F');
  assert.equal(state.scaleId, 'Blues');
  assert.equal(state.tempoBpm, 140);
});

test('bidirectional sync does not loop notifications', () => {
  resetState();
  let musicNotifications = 0;
  let musicalNotifications = 0;
  const unsubMusic = subscribeMusicContext(() => { musicNotifications += 1; });
  const unsubMusical = subscribeContext(() => { musicalNotifications += 1; });

  setMusicContext({ tempoBpm: 110 }, 'test-loop');
  assert.equal(musicNotifications, 1);
  assert.equal(musicalNotifications, 1);

  musicNotifications = 0;
  musicalNotifications = 0;
  setContext({ tempo: 125 }, 'other-tool');
  assert.equal(musicNotifications, 1);
  assert.equal(musicalNotifications, 1);

  musicNotifications = 0;
  musicalNotifications = 0;
  setMusicContext({ tempoBpm: 125 }, 'test-loop');
  assert.equal(musicNotifications, 0);
  assert.equal(musicalNotifications, 0);

  unsubMusic();
  unsubMusical();
});

test('validation rejects invalid values and still applies valid fields', () => {
  resetState();
  setMusicContext({
    root: 'NotAKey',
    scaleId: 'NotAScale',
    tempoBpm: 12,
    instrument: 'ukulele',
    keySignaturePreference: 'naturals',
    meter: { numerator: 99, denominator: 3 },
    tuningId: 'missing-tuning',
    modeId: '',
  });

  const state = getMusicContext();
  assert.equal(state.root, 'C');
  assert.equal(state.scaleId, 'Major (Ionian)');
  assert.equal(state.tempoBpm, 30);
  assert.equal(state.instrument, 'guitar');
  assert.equal(state.keySignaturePreference, 'sharps');
  assert.deepEqual(state.meter, { numerator: 32, denominator: 4 });
  assert.equal(state.tuningId, MUSIC_CONTEXT_DEFAULTS.tuningId);
  assert.equal(state.modeId, null);
});

test('validation clamps tempo and meter numerator', () => {
  resetState();
  setMusicContext({ tempoBpm: 999 });
  assert.equal(getMusicContext().tempoBpm, 300);

  setMusicContext({ tempoBpm: 10 });
  assert.equal(getMusicContext().tempoBpm, 30);

  setMusicContext({ meter: { numerator: 0, denominator: 4 } });
  assert.deepEqual(getMusicContext().meter, { numerator: 1, denominator: 4 });

  setMusicContext({ meter: { numerator: 40, denominator: 4 } });
  assert.deepEqual(getMusicContext().meter, { numerator: 32, denominator: 4 });
});

test('validation accepts allowed instrument null and meter denominators', () => {
  resetState();
  setMusicContext({ instrument: null });
  assert.equal(getMusicContext().instrument, null);

  for (const denominator of [1, 2, 4, 8, 16, 32]) {
    setMusicContext({ meter: { numerator: 5, denominator } });
    assert.equal(getMusicContext().meter.denominator, denominator);
  }
});

test('override stack push, replace-in-place, pop, and reset', () => {
  resetState();
  setMusicContext({ tempoBpm: 100, tuningId: '6-e-std' });

  pushOverride('routine-a', { tempoBpm: 80 });
  assert.equal(getMusicContext().tempoBpm, 80);
  assert.equal(getMusicContextDefaults().tempoBpm, 100);

  pushOverride('routine-b', { tuningId: '6-drop-d' });
  assert.equal(getMusicContext().tuningId, '6-drop-d');
  assert.equal(getMusicContext().tempoBpm, 80);

  pushOverride('routine-a', { tempoBpm: 70, root: 'G' });
  assert.equal(getMusicContext().tempoBpm, 70);
  assert.equal(getMusicContext().root, 'G');
  assert.equal(getMusicContextDefaults().root, 'C');

  popOverride('routine-b');
  assert.equal(getMusicContext().tuningId, '6-e-std');
  assert.equal(getMusicContext().tempoBpm, 70);

  resetOverrides();
  const state = getMusicContext();
  assert.equal(state.tempoBpm, 100);
  assert.equal(state.tuningId, '6-e-std');
  assert.equal(state.root, 'C');
});

test('overrides do not mutate persisted defaults', () => {
  resetState();
  setMusicContext({ instrument: 'piano', tempoBpm: 88 });
  pushOverride('session', { instrument: 'drums', tempoBpm: 150 });
  popOverride('session');

  const defaults = getMusicContextDefaults();
  assert.equal(defaults.instrument, 'piano');
  assert.equal(defaults.tempoBpm, 88);
  assert.equal(getSetting('context.instrument', null), 'piano');
});

test('subscriber changed array and no-op set', () => {
  resetState();
  let calls = 0;
  let lastChanged = [];
  const unsub = subscribeMusicContext((_state, meta) => {
    calls += 1;
    lastChanged = meta.changed;
  });

  setMusicContext({ root: 'A' });
  assert.equal(calls, 1);
  assert.deepEqual(lastChanged, ['root']);

  setMusicContext({ root: 'A' });
  assert.equal(calls, 1);

  setMusicContext({ meter: { numerator: 3, denominator: 4 } });
  assert.equal(calls, 2);
  assert.deepEqual(lastChanged, ['meter']);

  unsub();
});

test('unsubscribe stops notifications', () => {
  resetState();
  let calls = 0;
  const unsub = subscribeMusicContext(() => { calls += 1; });
  unsub();
  setMusicContext({ root: 'B' });
  assert.equal(calls, 0);
});

test('throwing subscriber does not block other subscribers', () => {
  resetState();
  let goodCalls = 0;
  subscribeMusicContext(() => { throw new Error('boom'); });
  subscribeMusicContext(() => { goodCalls += 1; });
  setMusicContext({ root: 'E' });
  assert.equal(goodCalls, 1);
});

test('subscriptions are safe to add and remove during notification', () => {
  resetState();
  let lateCalls = 0;
  let removedCalls = 0;
  const late = () => { lateCalls += 1; };
  const removed = () => { removedCalls += 1; };
  const unsubRemoved = subscribeMusicContext(removed);
  subscribeMusicContext(() => {
    subscribeMusicContext(late);
    unsubRemoved();
  });

  setMusicContext({ instrument: 'voice' });
  assert.equal(lateCalls, 0);
  assert.equal(removedCalls, 1);

  setMusicContext({ instrument: 'bass' });
  assert.equal(lateCalls, 1);
  assert.equal(removedCalls, 1);
});

console.log(`\n${passed} tests passed`);
