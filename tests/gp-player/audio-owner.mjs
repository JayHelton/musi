// Node tests for the single long-running audio owner registry.
// Run: node tests/gp-player/audio-owner.mjs

import assert from 'node:assert/strict';
import {
  claimAudio,
  releaseAudio,
  getAudioOwner,
  getActiveOwner,
  __resetAudioOwnerForTests,
} from '../../js/audio/audioOwner.js';

function noop() {}

function activeId() {
  return getActiveOwner()?.id ?? null;
}

function caseSecondClaim() {
  __resetAudioOwnerForTests();
  let firstStopped = false;
  let firstPaused = false;
  claimAudio({
    id: 'a',
    label: 'Owner A',
    kind: 'tone',
    onStop: () => { firstStopped = true; },
  });
  claimAudio({
    id: 'b',
    label: 'Owner B',
    kind: 'tone',
    onStop: noop,
  });
  assert.ok(firstStopped || firstPaused, 'second claim must stop or pause the first owner');
  assert.equal(activeId(), 'b', 'second owner must be active');
  assert.equal(getAudioOwner()?.id, 'b', 'getAudioOwner must match active owner');
}

function caseSameIdReclaim() {
  __resetAudioOwnerForTests();
  let stopCount = 0;
  const first = claimAudio({
    id: 'same',
    label: 'Same',
    kind: 'tone',
    onStop: () => { stopCount += 1; },
  });
  assert.ok(first, 'first claim must return a handle');
  const second = claimAudio({
    id: 'same',
    label: 'Same refreshed',
    kind: 'tone',
    onStop: () => { stopCount += 1; },
  });
  assert.ok(second, 'same-id re-claim must return a handle');
  assert.equal(stopCount, 0, 'same-id re-claim must not call onStop on itself');
  assert.equal(activeId(), 'same');
}

function casePreviewUnder3s() {
  __resetAudioOwnerForTests();
  let metroStopped = false;
  claimAudio({
    id: 'metronome',
    label: 'Metronome',
    kind: 'metronome',
    onStop: () => { metroStopped = true; },
  });
  // Short previews do not call claimAudio. No claim here simulates a preview.
  assert.equal(activeId(), 'metronome', 'metronome must stay active when no claim happens');
  assert.equal(metroStopped, false, 'metronome onStop must not run without a new claim');
}

function caseScoreThenKeyboard() {
  __resetAudioOwnerForTests();
  let scorePaused = false;
  let scoreStopped = false;
  claimAudio({
    id: 'score',
    label: 'Score',
    kind: 'score',
    canPause: true,
    onPause: () => { scorePaused = true; },
    onStop: () => { scoreStopped = true; },
  });
  claimAudio({
    id: 'keyboard',
    label: 'Keyboard',
    kind: 'tone',
    onStop: noop,
  });
  assert.ok(scorePaused, 'score onPause must run when keyboard claims');
  assert.equal(scoreStopped, false, 'score onStop must not run when pause is used');
  assert.equal(activeId(), 'keyboard', 'keyboard must be active after claim');
}

function caseGetAudioOwnerMatchesActive() {
  __resetAudioOwnerForTests();
  assert.equal(getAudioOwner(), null);
  assert.equal(getActiveOwner(), null);
  claimAudio({
    id: 'x',
    label: 'X',
    kind: 'tone',
    onStop: noop,
  });
  const owner = getAudioOwner();
  const active = getActiveOwner();
  assert.ok(owner);
  assert.ok(active);
  assert.equal(owner.id, active.id);
  assert.equal(owner.label, active.label);
  assert.equal(owner.kind, active.kind);
}

function caseHundredPairedStarts() {
  __resetAudioOwnerForTests();
  for (let i = 0; i < 100; i += 1) {
    claimAudio({
      id: 'a',
      label: 'A',
      kind: 'tone',
      onStop: noop,
    });
    claimAudio({
      id: 'b',
      label: 'B',
      kind: 'tone',
      onStop: noop,
    });
    assert.equal(activeId(), 'b', `pair ${i}: exactly one owner must remain`);
    assert.ok(getAudioOwner(), `pair ${i}: getAudioOwner must not be null`);
  }
}

function caseReleaseClearsSlot() {
  __resetAudioOwnerForTests();
  const handle = claimAudio({
    id: 'release-me',
    label: 'Release',
    kind: 'tone',
    onStop: noop,
  });
  releaseAudio(handle);
  assert.equal(activeId(), null);
}

caseSecondClaim();
caseSameIdReclaim();
casePreviewUnder3s();
caseScoreThenKeyboard();
caseGetAudioOwnerMatchesActive();
caseHundredPairedStarts();
caseReleaseClearsSlot();

console.log('audio-owner: ok');
