import assert from 'node:assert/strict';
import { installDomShim } from '../gp-player/domShim.mjs';
import {
  defaultCompanion,
  mountCompanion,
} from '../../js/exerciseCompanions/index.js';

installDomShim();

const host = document.createElement('div');
document.body.appendChild(host);

let gUMCalls = 0;
const origGUM = globalThis.navigator?.mediaDevices?.getUserMedia;
if (!globalThis.navigator) globalThis.navigator = {};
if (!globalThis.navigator.mediaDevices) {
  globalThis.navigator.mediaDevices = {};
}
globalThis.navigator.mediaDevices.getUserMedia = async () => {
  gUMCalls += 1;
  throw new Error('Mic denied (test)');
};

const types = ['scale-ref', 'triad-ref', 'sweep-ref', 'pitch-train', 'interval-orbit', 'ear-train', 'metronome'];
const handles = [];

for (const type of types) {
  const sub = document.createElement('div');
  host.appendChild(sub);
  const companion = defaultCompanion(type);
  companion.root = type === 'sweep-ref' ? 'A' : 'G';
  companion.collapsed = false;

  const before = gUMCalls;
  const handle = mountCompanion(sub, companion);
  assert.equal(gUMCalls, before, `${type} mount must not call getUserMedia`);

  const panel = sub.querySelector('.ec-panel');
  assert.ok(panel, `${type} panel`);
  const toggle = sub.querySelector('.ec-toggle');
  assert.ok(toggle, `${type} toggle`);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  const lock = sub.querySelector('.ec-lock');
  assert.ok(lock, `${type} heading`);
  if (type === 'metronome') {
    // The metronome keeps time, so its heading carries the plan, not a key.
    assert.match(lock.textContent, /Metronome/, 'metronome plan in heading');
  } else {
    assert.match(lock.textContent, /G|A/, `${type} locked key in heading`);
  }

  const body = sub.querySelector('.ec-body');
  assert.ok(body, `${type} body`);
  assert.equal(body.hidden, false);

  if (type === 'pitch-train') {
    assert.ok(sub.querySelector('.ec-pitch-meter'), 'pitch meter');
    const start = sub.querySelector('.ec-btn-start');
    assert.ok(start);
    start.click();
    await new Promise((r) => setTimeout(r, 0));
    const status = sub.querySelector('.ec-pitch-status');
    assert.ok(status?.textContent?.includes('Mic') || status?.classList?.contains('ec-err'),
      'pitch start without mic shows error');
  } else if (type === 'interval-orbit') {
    assert.ok(sub.querySelector('.ec-orbit-board'), 'orbit board');
    assert.ok(sub.querySelector('.ec-orbit-prompt') || sub.querySelector('.ec-orbit-chips'), 'orbit controls');
  } else if (type === 'metronome') {
    assert.ok(sub.querySelector('.ec-metro-readout'), 'metronome readout');
    assert.ok(sub.querySelector('.ec-metro-beats'), 'metronome beat dots');
    assert.ok(sub.querySelector('.ec-btn-start'), 'metronome start button');
    assert.equal(sub.querySelector('.ec-btn-stop').disabled, true, 'metronome stop starts disabled');
  } else if (type === 'ear-train') {
    const earControls = sub.querySelector('.ec-ear-controls');
    assert.ok(earControls, 'ear controls');
    assert.ok(sub.querySelector('.ec-ear-answers'), 'ear answers');
    assert.ok(earControls.querySelector('button'), 'ear play button');
  } else {
    const diagram = sub.querySelector('.ec-fretboard-scroll')
      || sub.querySelector('.ec-triad-stack')
      || sub.querySelector('.ec-diagram-host');
    assert.ok(diagram, `${type} diagram host`);
  }

  toggle.click();
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(body.hidden, true);

  handles.push(handle);
}

for (const h of handles) {
  assert.doesNotThrow(() => h.stop());
  assert.doesNotThrow(() => h.destroy());
}

if (origGUM) {
  globalThis.navigator.mediaDevices.getUserMedia = origGUM;
}

console.log('companions mount: ok');
