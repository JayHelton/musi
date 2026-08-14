/**
 * Zero-dependency Node tests for the audio dock helpers and wiring.
 * Run: node tests/audio-dock/run.mjs
 */

import assert from 'node:assert/strict';
import { dockStateFromOwner, formatElapsed, initAudioDock } from '../../js/audioDock.js';
import { claimAudio } from '../../js/audioOwner.js';

let passed = 0;

async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

await test('dockStateFromOwner(null) is not visible', () => {
  const state = dockStateFromOwner(null);
  assert.equal(state.visible, false);
  assert.equal(state.label, '');
  assert.equal(state.state, '');
  assert.equal(state.showElapsed, false);
});

await test('metronome owner shows Playing without elapsed', () => {
  const state = dockStateFromOwner({
    id: 'metro',
    label: 'Metronome',
    kind: 'metronome',
  });
  assert.equal(state.visible, true);
  assert.equal(state.label, 'Metronome');
  assert.equal(state.state, 'Playing');
  assert.equal(state.showElapsed, false);
});

await test('score owner shows Playing with elapsed', () => {
  const state = dockStateFromOwner({
    id: 'score-1',
    label: 'My Score',
    kind: 'score',
  });
  assert.equal(state.visible, true);
  assert.equal(state.label, 'My Score');
  assert.equal(state.state, 'Playing');
  assert.equal(state.showElapsed, true);
});

await test('recording owner shows Recording', () => {
  const state = dockStateFromOwner({
    id: 'rec-1',
    label: 'Voice memo',
    kind: 'recording',
  });
  assert.equal(state.visible, true);
  assert.equal(state.state, 'Recording');
  assert.equal(state.showElapsed, true);
});

await test('formatElapsed(65) is 1:05', () => {
  assert.equal(formatElapsed(65), '1:05');
});

await test('Stop control calls stopActive', async () => {
  function makeEl(tag) {
    const el = {
      tagName: tag.toUpperCase(),
      children: [],
      className: '',
      id: '',
      hidden: false,
      textContent: '',
      type: '',
      onclick: null,
      appendChild(child) {
        this.children.push(child);
        child.parent = this;
      },
      querySelector(sel) {
        const walk = (node) => {
          if (node.matches?.(sel)) return node;
          for (const child of node.children || []) {
            const hit = walk(child);
            if (hit) return hit;
          }
          return null;
        };
        return walk(this);
      },
      matches(sel) {
        if (sel.startsWith('.')) {
          const want = sel.slice(1);
          return (this.className || '').split(/\s+/).includes(want);
        }
        return false;
      },
    };
    return el;
  }

  const body = makeEl('body');
  globalThis.document = {
    body,
    createElement(tag) {
      const el = makeEl(tag);
      if (tag === 'button') el.type = 'button';
      return el;
    },
    getElementById(id) {
      if (id === 'audio-dock') return null;
      return null;
    },
  };

  let stopped = false;
  const handle = await claimAudio({
    id: 'dock-stop-test',
    label: 'Dock stop',
    kind: 'tone',
    onStop: () => { stopped = true; },
  });
  assert.ok(handle);

  const host = makeEl('div');
  initAudioDock(host);

  const stopBtn = host.querySelector('.audio-dock-stop');
  assert.ok(stopBtn);
  stopBtn.onclick();
  assert.equal(stopped, true);
});

console.log(`audio-dock tests: ${passed} passed`);
