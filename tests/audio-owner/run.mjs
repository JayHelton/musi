/**
 * Zero-dependency Node tests for the audio owner registry.
 * Run: node tests/audio-owner/run.mjs
 */

import assert from 'node:assert/strict';
import {
  claimAudio,
  releaseAudio,
  getActiveOwner,
  subscribe,
  stopActive,
} from '../../js/audioOwner.js';

let passed = 0;

async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

await test('second metronome claim stops the first', async () => {
  let firstStopped = false;
  const first = await claimAudio({
    id: 'metronome-a',
    label: 'Metronome A',
    kind: 'metronome',
    onStop: () => { firstStopped = true; },
  });
  assert.ok(first);

  let secondStopped = false;
  const second = await claimAudio({
    id: 'metronome-b',
    label: 'Metronome B',
    kind: 'metronome',
    onStop: () => { secondStopped = true; },
  });

  assert.ok(second);
  assert.equal(firstStopped, true);
  assert.equal(secondStopped, false);
  assert.equal(getActiveOwner().id, 'metronome-b');
  releaseAudio(second);
});

await test('score with canPause true is paused not stopped', async () => {
  let paused = false;
  let stopped = false;
  const score = await claimAudio({
    id: 'score-1',
    label: 'Score',
    kind: 'score',
    canPause: true,
    onPause: () => { paused = true; },
    onStop: () => { stopped = true; },
  });
  assert.ok(score);

  const next = await claimAudio({
    id: 'metronome-c',
    label: 'Metronome C',
    kind: 'metronome',
    onStop: () => {},
  });
  assert.ok(next);
  assert.equal(paused, true);
  assert.equal(stopped, false);
  releaseAudio(next);
});

await test('unsaved recording cancel returns null and keeps recording owner', async () => {
  let recordingStopped = false;
  const recording = await claimAudio({
    id: 'rec-1',
    label: 'Recording',
    kind: 'recording',
    unsaved: true,
    onStop: () => { recordingStopped = true; },
    handlers: {
      save: () => {},
      discard: () => {},
    },
  });
  assert.ok(recording);

  const blocked = await claimAudio(
    {
      id: 'tone-1',
      label: 'Tone',
      kind: 'tone',
      onStop: () => {},
    },
    async () => 'Cancel',
  );

  assert.equal(blocked, null);
  assert.equal(recordingStopped, false);
  assert.equal(getActiveOwner().id, 'rec-1');
  stopActive('test');
});

await test('unsaved recording discard proceeds and new owner becomes active', async () => {
  let discarded = false;
  let recordingStopped = false;
  const recording = await claimAudio({
    id: 'rec-2',
    label: 'Recording',
    kind: 'recording',
    unsaved: true,
    onStop: () => { recordingStopped = true; },
    handlers: {
      save: () => {},
      discard: () => { discarded = true; },
    },
  });
  assert.ok(recording);

  const next = await claimAudio(
    {
      id: 'metronome-d',
      label: 'Metronome D',
      kind: 'metronome',
      onStop: () => {},
    },
    async () => 'Discard',
  );

  assert.ok(next);
  assert.equal(discarded, true);
  assert.equal(recordingStopped, true);
  assert.equal(getActiveOwner().id, 'metronome-d');
  releaseAudio(next);
});

await test('missing promptFn treats cancel and keeps recording owner', async () => {
  const recording = await claimAudio({
    id: 'rec-3',
    label: 'Recording',
    kind: 'recording',
    unsaved: true,
    onStop: () => {},
    handlers: {
      save: () => {},
      discard: () => {},
    },
  });
  assert.ok(recording);

  const blocked = await claimAudio({
    id: 'tone-2',
    label: 'Tone',
    kind: 'tone',
    onStop: () => {},
  });

  assert.equal(blocked, null);
  assert.equal(getActiveOwner().id, 'rec-3');
  stopActive('test');
});

await test('subscribe notifies after claim release and stop', async () => {
  const events = [];
  const unsub = subscribe((owner) => events.push(owner ? owner.id : null));

  const handle = await claimAudio({
    id: 'sub-1',
    label: 'Sub',
    kind: 'tone',
    onStop: () => {},
  });
  releaseAudio(handle);
  stopActive('noop');

  const tone = await claimAudio({
    id: 'sub-2',
    label: 'Sub 2',
    kind: 'tone',
    onStop: () => {},
  });
  stopActive('test');
  unsub();

  assert.deepEqual(events, ['sub-1', null, 'sub-2', null]);
});

console.log(`audio-owner tests: ${passed} passed`);
