/**
 * Practice bar unit tests (imported by tests/train/run.mjs).
 */

import assert from 'node:assert/strict';

export async function runPracticeBarTests(ctx) {
  const {
    test,
    installDomShim,
    installLocalStorageShim,
    makeRecordingDriver,
    progressMod,
  } = ctx;

  installDomShim();
  installLocalStorageShim();
  globalThis.window = globalThis;

  progressMod.invalidateProgressLogCache();

  const practiceSession = await import('../../js/practice/practiceSession.js');
  const {
    startSession,
    endSession,
    getSession,
    toggleMetronome,
    setMetronome,
    setNotes,
    nextItem,
    previousItem,
    restartItem,
    recordAttempt,
    setLoop,
    __setMetronomeDriverForTests,
    __setTimeSourceForTests,
    __tickSessionClockForTests,
  } = practiceSession;

  const { mountPracticeBar, isPracticeBarMounted } = await import('../../js/ui/practiceBar.js');

  let now = 10000;
  const driver = makeRecordingDriver();
  __setMetronomeDriverForTests(driver);
  __setTimeSourceForTests(() => now);

  function resetSession() {
    endSession();
    driver.calls.length = 0;
    now = 10000;
  }

  test('practice bar is not mounted without an active session', () => {
    resetSession();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const api = mountPracticeBar(host);
    assert.equal(isPracticeBarMounted(), true);
    assert.ok(host.hidden || host.querySelector('.practice-bar')?.hidden);
    api.destroy();
    host.remove();
    assert.equal(isPracticeBarMounted(), false);
  });

  test('practice bar mounts with an active session and unmounts on end', () => {
    resetSession();
    startSession({
      sourceType: 'free',
      sourceId: '',
      items: [{ id: 'i1', label: 'A', targetType: 'exercise', targetId: 'ex-1' }],
    });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const api = mountPracticeBar(host);
    assert.equal(isPracticeBarMounted(), true);
    assert.ok(!host.hidden);
    assert.ok(host.querySelector('.practice-bar-bpm-value'));
    endSession();
    api.update();
    endSession();
    api.destroy();
    host.remove();
    assert.equal(isPracticeBarMounted(), false);
  });

  test('bar play control toggles metronome via session', () => {
    resetSession();
    startSession({ sourceType: 'free', sourceId: '', items: [] });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const api = mountPracticeBar(host);
    const playBtn = host.querySelector('.practice-bar-play');
    playBtn.click();
    assert.equal(getSession().metronome.playing, true);
    assert.ok(driver.calls.some((c) => c.name === 'start'));
    playBtn.click();
    assert.equal(getSession().metronome.playing, false);
    api.destroy();
    host.remove();
    resetSession();
  });

  test('bar BPM steppers call setMetronome', () => {
    resetSession();
    startSession({ sourceType: 'free', sourceId: '', items: [], metronome: { bpm: 100 } });
    const host = document.createElement('div');
    document.body.appendChild(host);
    mountPracticeBar(host);
    const up = host.querySelector('[aria-label="Increase BPM"]');
    assert.ok(up, 'bpm up button');
    up.click();
    assert.equal(getSession().metronome.bpm, 101);
    const down = host.querySelector('[aria-label="Decrease BPM"]');
    assert.ok(down, 'bpm down button');
    down.click();
    assert.equal(getSession().metronome.bpm, 100);
    mountPracticeBar(host).destroy();
    host.remove();
    resetSession();
  });

  test('bar subdivision selector updates session', () => {
    resetSession();
    startSession({ sourceType: 'free', sourceId: '', items: [] });
    const host = document.createElement('div');
    document.body.appendChild(host);
    mountPracticeBar(host);
    const sel = host.querySelector('.practice-bar-subdiv');
    sel.value = 'eighth';
    sel.change();
    assert.equal(getSession().metronome.subdivision, 'eighth');
    mountPracticeBar(host).destroy();
    host.remove();
    resetSession();
  });

  test('bar nav buttons call session item functions', () => {
    resetSession();
    startSession({
      sourceType: 'free',
      sourceId: '',
      items: [
        { id: 'i1', label: 'A', targetType: 'drill', targetId: 'scales' },
        { id: 'i2', label: 'B', targetType: 'drill', targetId: 'intervals' },
      ],
    });
    const host = document.createElement('div');
    document.body.appendChild(host);
    mountPracticeBar(host);
    host.querySelector('[aria-label="Next item"]').click();
    assert.equal(getSession().activeItemId, 'i2');
    host.querySelector('[aria-label="Previous item"]').click();
    assert.equal(getSession().activeItemId, 'i1');
    host.querySelector('[aria-label="Restart item"]').click();
    assert.equal(getSession().activeItemId, 'i1');
    mountPracticeBar(host).destroy();
    host.remove();
    resetSession();
  });

  test('record take is disabled for non-exercise items', () => {
    resetSession();
    startSession({
      sourceType: 'free',
      sourceId: '',
      items: [{ id: 'i1', label: 'Scale drill', targetType: 'drill', targetId: 'scales' }],
    });
    const host = document.createElement('div');
    document.body.appendChild(host);
    mountPracticeBar(host);
    const recordBtn = host.querySelector('.practice-bar-record');
    assert.equal(recordBtn.disabled, true);
    assert.match(recordBtn.title, /exercise/i);
    mountPracticeBar(host).destroy();
    host.remove();
    resetSession();
  });

  test('session notes sync from session state', () => {
    resetSession();
    startSession({ sourceType: 'free', sourceId: '', items: [] });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const api = mountPracticeBar(host);
    setNotes('Focused on timing');
    api.update();
    const area = host.querySelector('.practice-bar-notes-input');
    assert.equal(area.value, 'Focused on timing');
    api.destroy();
    host.remove();
    resetSession();
  });

  test('attempt logging fills target bpm duration from session', () => {
    resetSession();
    progressMod.invalidateProgressLogCache();
    startSession({
      sourceType: 'free',
      sourceId: '',
      items: [{ id: 'i1', label: 'Etude', targetType: 'exercise', targetId: 'ex-log' }],
      metronome: { bpm: 96 },
    });
    now += 5000;
    __tickSessionClockForTests();
    const att = recordAttempt({ status: 'yellow' });
    assert.equal(att.targetType, 'exercise');
    assert.equal(att.targetId, 'ex-log');
    assert.equal(att.bpm, 96);
    assert.ok(att.durationMs >= 0);
    resetSession();
  });

  test('destroy removes listeners and DOM', () => {
    resetSession();
    startSession({ sourceType: 'free', sourceId: '', items: [] });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const api = mountPracticeBar(host);
    api.destroy();
    assert.equal(host.innerHTML, '');
    assert.equal(isPracticeBarMounted(), false);
    host.remove();
    resetSession();
  });
}
