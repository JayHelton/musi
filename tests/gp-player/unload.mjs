// Close score / unload checks for the standalone GP player.
// Run: node tests/gp-player/unload.mjs

import assert from 'node:assert/strict';
import { installDomShim } from './domShim.mjs';

installDomShim();

import { mountGpPlayer } from '../../js/gpPlayerUI.js';

const fakeGp = {
  tempo: 120,
  tracks: [{
    index: 0, name: 'Guitar', tuning: 'Standard', noteCount: 2,
    model: {
      tuning: 'Standard',
      strings: [
        { note: 'E', oct: 2, label: 'E', openMidi: 40 },
        { note: 'A', oct: 2, label: 'A', openMidi: 45 },
        { note: 'D', oct: 3, label: 'D', openMidi: 50 },
        { note: 'G', oct: 3, label: 'G', openMidi: 55 },
        { note: 'B', oct: 3, label: 'B', openMidi: 59 },
        { note: 'E', oct: 4, label: 'E', openMidi: 64 },
      ],
      events: [
        { slot: 0, start: 0, duration: 1, stringIndex: 0, fret: 0, midi: 40, pc: 4, techniques: [], dead: false },
        { slot: 1, start: 1, duration: 1, stringIndex: 0, fret: 3, midi: 43, pc: 7, techniques: [], dead: false },
      ],
      measures: [
        { startSlot: 0, endSlot: 2, startBeat: 0, endBeat: 4, marker: 'Intro' },
      ],
      tempo: 120,
      totalBeats: 4,
    },
  }],
  drumTracks: [],
};

// ---- A: mountGpPlayer WITH onCloseScore ----
let closeCalls = 0;
const closeHost = document.createElement('div');
const closeMount = mountGpPlayer(closeHost, {
  gpResult: fakeGp,
  title: 'Close wiring',
  onCloseScore: () => { closeCalls += 1; },
});

const headerCloseBtn = [...closeHost.querySelectorAll('button')].find(
  (b) => b.getAttribute?.('aria-label') === 'Close score',
);
assert.ok(headerCloseBtn, 'header Close score button should exist');
assert.equal(headerCloseBtn.getAttribute('title'), 'Close score', 'header button names itself');

const menuCloseBtn = [...closeHost.querySelectorAll('button')].find(
  (b) => b.classList?.contains('gpp-menu-row')
    && b.getAttribute?.('aria-label') === 'Close score',
);
assert.ok(menuCloseBtn, 'menu Close score row should exist');

closeCalls = 0;
headerCloseBtn.click();
assert.equal(closeCalls, 1, 'header Close score calls onCloseScore once');

closeMount.destroy();

// ---- B: mountGpPlayer WITHOUT onCloseScore ----
const plainHost = document.createElement('div');
const plainMount = mountGpPlayer(plainHost, { gpResult: fakeGp, title: 'No close' });
const strayClose = [...plainHost.querySelectorAll('button')].find(
  (b) => b.getAttribute?.('aria-label') === 'Close score',
);
assert.ok(!strayClose, 'no Close score control without onCloseScore');
plainMount.destroy();

// ---- C–F: standalone unload via gpPlayer.js ----
const section = document.createElement('section');
section.id = 'sec-scoreplayer';
section.setAttribute('data-gpp-immersive', '');

const drop = document.createElement('div');
drop.id = 'gpp-drop';
const stage = document.createElement('div');
stage.id = 'gpp-stage';
const status = document.createElement('div');
status.id = 'gpp-status';
const library = document.createElement('div');
library.id = 'gpp-library-list';
const fileInput = document.createElement('input');
fileInput.id = 'gpp-file';

section.append(drop, stage, status, library, fileInput);
document.body.appendChild(section);

if (!window.addEventListener) {
  window.addEventListener = (type, fn) => document.addEventListener(type, fn);
  window.removeEventListener = (type, fn) => document.removeEventListener(type, fn);
}
if (!document.documentElement) {
  const html = document.createElement('html');
  document.documentElement = html;
}

const { loadGpPlayerResult, unloadCurrentScore, initGpPlayer } = await import('../../js/gpPlayer.js');

loadGpPlayerResult(fakeGp, { title: 'First score' });

assert.equal(stage.hidden, false, 'stage visible after load');
assert.ok(stage.children.length > 0, 'stage has player mount');
assert.ok(section.classList.contains('gpp-score-loaded'), 'section marked score-loaded');

unloadCurrentScore();

assert.equal(stage.hidden, true, 'stage hidden after unload');
assert.equal(drop.hidden, false, 'drop visible after unload');
assert.equal(status.textContent, 'Score closed.', 'status shows Score closed.');
assert.ok(!section.classList.contains('gpp-score-loaded'), 'section no longer score-loaded');
assert.equal(stage.innerHTML, '', 'stage cleared after destroy');
assert.ok(!stage.querySelector('.gpp-root'), 'no gpp-root after unload');

// ---- D: initGpPlayer after unload must not remount ----
initGpPlayer();
assert.equal(stage.hidden, true, 'stage stays hidden after initGpPlayer');
assert.equal(stage.children.length, 0, 'stage stays empty after initGpPlayer');

// ---- E: reload after unload ----
loadGpPlayerResult(fakeGp, { title: 'Second score' });
assert.equal(stage.hidden, false, 'stage visible again after reload');
assert.ok(stage.children.length > 0, 'stage remounts on new load');

unloadCurrentScore();

// ---- F: destroy path clears stage ----
loadGpPlayerResult(fakeGp, { title: 'Destroy check' });
assert.ok(stage.querySelector('.gpp-root'), 'gpp-root present before unload');
unloadCurrentScore();
assert.equal(stage.innerHTML, '', 'unload invokes destroy and clears stage');
assert.ok(!stage.querySelector('.gpp-root'), 'gpp-root gone after unload');

console.log('gp-player unload: ok');
