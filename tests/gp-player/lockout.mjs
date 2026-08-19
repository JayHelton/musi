// Standalone GP player lockout / shell release checks.
// Run: node tests/gp-player/lockout.mjs

import assert from 'node:assert/strict';
import { installDomShim } from './domShim.mjs';

installDomShim();

import { releaseGpPlayerShell } from '../../js/gpPlayer/layoutMetrics.js';
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

if (!document.documentElement) {
  const html = document.createElement('html');
  document.documentElement = html;
}
if (!window.addEventListener) {
  window.addEventListener = (type, fn) => document.addEventListener(type, fn);
  window.removeEventListener = (type, fn) => document.removeEventListener(type, fn);
}

// ---- A: releaseGpPlayerShell clears standalone lock classes ----
const sectionA = document.createElement('section');
sectionA.id = 'sec-scoreplayer';
sectionA.setAttribute('data-gpp-immersive', '');
sectionA.classList.add('gpp-score-loaded');

const hostA = document.createElement('div');
hostA.classList.add('gpp-root', 'is-loading', 'gpp-has-layout-metrics');
sectionA.appendChild(hostA);
document.body.appendChild(sectionA);

document.documentElement.classList.add('gpp-player-locked');

releaseGpPlayerShell({ host: hostA, section: sectionA });

assert.ok(!sectionA.classList.contains('gpp-score-loaded'), 'section loses gpp-score-loaded');
assert.ok(!document.documentElement.classList.contains('gpp-player-locked'), 'html loses gpp-player-locked');
assert.ok(!hostA.classList.contains('gpp-root'), 'host loses gpp-root');
assert.ok(!hostA.classList.contains('is-loading'), 'host loses is-loading');
assert.ok(!hostA.classList.contains('gpp-has-layout-metrics'), 'host loses gpp-has-layout-metrics');

sectionA.remove();

// ---- B: workbook host does not clear the standalone section ----
const sectionB = document.createElement('section');
sectionB.id = 'sec-scoreplayer';
sectionB.setAttribute('data-gpp-immersive', '');
sectionB.classList.add('gpp-score-loaded');
document.body.appendChild(sectionB);
document.documentElement.classList.add('gpp-player-locked');

const otherHost = document.createElement('div');
otherHost.classList.add('gpp-root', 'is-loading', 'gpp-has-layout-metrics');
document.body.appendChild(otherHost);

releaseGpPlayerShell({ host: otherHost });

assert.ok(sectionB.classList.contains('gpp-score-loaded'), 'standalone section keeps gpp-score-loaded');
assert.ok(document.documentElement.classList.contains('gpp-player-locked'), 'html keeps gpp-player-locked');
assert.ok(!otherHost.classList.contains('gpp-root'), 'workbook host still loses gpp-root');

sectionB.remove();
otherHost.remove();
document.documentElement.classList.remove('gpp-player-locked');

// ---- C: destroy() still releases the shell when player.destroy throws ----
const sectionC = document.createElement('section');
sectionC.id = 'sec-scoreplayer';
sectionC.setAttribute('data-gpp-immersive', '');

const hostC = document.createElement('div');
sectionC.appendChild(hostC);
document.body.appendChild(sectionC);

const mountedC = mountGpPlayer(hostC, { gpResult: fakeGp, title: 'Lockout destroy' });
assert.ok(sectionC.classList.contains('gpp-score-loaded'), 'section marked score-loaded after mount');
document.documentElement.classList.add('gpp-player-locked');

mountedC.player.destroy = () => { throw new Error('player destroy failed'); };

assert.doesNotThrow(() => mountedC.destroy(), 'destroy must not throw when player.destroy fails');
assert.ok(!sectionC.classList.contains('gpp-score-loaded'), 'section released after destroy');
assert.ok(!document.documentElement.classList.contains('gpp-player-locked'), 'html unlocked after destroy');
assert.ok(!hostC.classList.contains('gpp-root'), 'host loses gpp-root after destroy');

sectionC.remove();

// ---- D: unloadCurrentScore after a leftover lock (mount is null) ----
const sectionD = document.createElement('section');
sectionD.id = 'sec-scoreplayer';
sectionD.setAttribute('data-gpp-immersive', '');
sectionD.classList.add('gpp-score-loaded');

const drop = document.createElement('div');
drop.id = 'gpp-drop';
drop.hidden = true;
const stage = document.createElement('div');
stage.id = 'gpp-stage';
stage.hidden = false;
const status = document.createElement('div');
status.id = 'gpp-status';
const library = document.createElement('div');
library.id = 'gpp-library-list';
const fileInput = document.createElement('input');
fileInput.id = 'gpp-file';
fileInput.disabled = true;

sectionD.append(drop, stage, status, library, fileInput);
document.body.appendChild(sectionD);
document.documentElement.classList.add('gpp-player-locked');

const { unloadCurrentScore } = await import('../../js/gpPlayer.js');

unloadCurrentScore();

assert.equal(drop.hidden, false, 'drop visible after unload with no mount');
assert.equal(stage.hidden, true, 'stage hidden after unload with no mount');
assert.ok(!sectionD.classList.contains('gpp-score-loaded'), 'section no longer score-loaded');
assert.ok(!document.documentElement.classList.contains('gpp-player-locked'), 'html no longer locked');
assert.equal(fileInput.disabled, false, 'file input not stuck disabled');

sectionD.remove();

// ---- E: reloadModel error does not kill the mount ----
const sectionE = document.createElement('section');
sectionE.id = 'sec-scoreplayer';
sectionE.setAttribute('data-gpp-immersive', '');

const hostE = document.createElement('div');
sectionE.appendChild(hostE);
document.body.appendChild(sectionE);

const mountedE = mountGpPlayer(hostE, { gpResult: fakeGp, title: 'Reload error' });
mountedE.player.load = () => { throw new Error('mix load failed'); };

assert.doesNotThrow(() => mountedE.setLoopEnabled(true), 'setLoopEnabled survives reloadModel error');
assert.ok(
  hostE.querySelector('.gpp-chrome') || hostE.querySelector('.gpp-score-header'),
  'chrome still present after failed reload',
);

assert.doesNotThrow(() => mountedE.destroy(), 'destroy still works after reload error');
assert.ok(!sectionE.classList.contains('gpp-score-loaded'), 'section released after destroy');
assert.ok(!hostE.classList.contains('gpp-root'), 'host loses gpp-root after destroy');

sectionE.remove();

console.log('gp-player lockout: ok');
