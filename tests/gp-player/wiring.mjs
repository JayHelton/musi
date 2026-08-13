// Wiring checks for GP player exercise-import panel integration.
// Run: node tests/gp-player/wiring.mjs

import assert from 'node:assert/strict';
import { installDomShim } from './domShim.mjs';
import { makePercussionModel } from '../../js/tab/gpPercussion.js';
import { pinnedScrollTop } from '../../js/gpPlayer/layoutMetrics.js';
import { mountGpPlayer } from '../../js/gpPlayerUI.js';

installDomShim();

// ---- pinnedScrollTop ----
assert.equal(
  pinnedScrollTop({ scrollTop: 100, viewportTop: 0, targetTop: 250, pad: 16 }),
  334,
  'a row below the viewport top scrolls down until it sits under the pad',
);
assert.equal(
  pinnedScrollTop({ scrollTop: 200, viewportTop: 0, targetTop: -30, pad: 16 }),
  154,
  'a row above the viewport top scrolls back up to it',
);
assert.equal(
  pinnedScrollTop({ scrollTop: 40, viewportTop: 0, targetTop: 100, maxScrollTop: NaN }),
  140,
  'an unmeasured viewport imposes no scroll limit',
);
assert.equal(
  pinnedScrollTop({ scrollTop: 10, viewportTop: 0, targetTop: -20, pad: 0 }),
  0,
  'result never goes negative',
);
assert.equal(
  pinnedScrollTop({ scrollTop: 900, viewportTop: 0, targetTop: 2000, pad: 0, maxScrollTop: 950 }),
  950,
  'result clamps to maxScrollTop',
);
assert.equal(
  pinnedScrollTop({ scrollTop: 100, viewportTop: 0, targetTop: 16, pad: 16, epsilon: 1 }),
  null,
  'returns null when already pinned within epsilon',
);

const perc = makePercussionModel({
  name: 'Kit',
  tempo: 120,
  events: [
    { slot: 0, start: 0, duration: 0.25, instrument: 'kick', velocity: 0.9, midi: 36 },
    { slot: 2, start: 2, duration: 0.25, instrument: 'snare', velocity: 0.9, midi: 38 },
    { slot: 4, start: 4, duration: 0.25, instrument: 'kick', velocity: 0.9, midi: 36 },
    { slot: 6, start: 6, duration: 0.25, instrument: 'snare', velocity: 0.9, midi: 38 },
    { slot: 8, start: 8, duration: 0.25, instrument: 'crash', velocity: 0.9, midi: 49 },
    { slot: 10, start: 10, duration: 0.25, instrument: 'kick', velocity: 0.9, midi: 36 },
    { slot: 12, start: 12, duration: 0.25, instrument: 'snare', velocity: 0.9, midi: 38 },
    { slot: 14, start: 14, duration: 0.25, instrument: 'kick', velocity: 0.9, midi: 36 },
  ],
  measures: [
    { startSlot: 0, endSlot: 4, startBeat: 0, endBeat: 4, marker: 'Intro' },
    { startSlot: 4, endSlot: 8, startBeat: 4, endBeat: 8, marker: 'Verse' },
    { startSlot: 8, endSlot: 12, startBeat: 8, endBeat: 12, marker: 'Chorus' },
    { startSlot: 12, endSlot: 16, startBeat: 12, endBeat: 16, marker: 'Outro' },
  ],
});

const fakeGp = {
  tempo: 120,
  tracks: [{
    index: 0, name: 'Guitar', tuning: 'Standard', noteCount: 4,
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
        { slot: 4, start: 4, duration: 1, stringIndex: 0, fret: 5, midi: 45, pc: 9, techniques: [], dead: false },
        { slot: 5, start: 5, duration: 1, stringIndex: 0, fret: 7, midi: 47, pc: 11, techniques: [], dead: false },
        { slot: 8, start: 8, duration: 1, stringIndex: 0, fret: 3, midi: 43, pc: 7, techniques: [], dead: false },
        { slot: 9, start: 9, duration: 1, stringIndex: 0, fret: 5, midi: 45, pc: 9, techniques: [], dead: false },
        { slot: 12, start: 12, duration: 1, stringIndex: 0, fret: 0, midi: 40, pc: 4, techniques: [], dead: false },
        { slot: 13, start: 13, duration: 1, stringIndex: 0, fret: 2, midi: 42, pc: 6, techniques: [], dead: false },
      ],
      measures: [
        { startSlot: 0, endSlot: 2, startBeat: 0, endBeat: 4, marker: 'Intro' },
        { startSlot: 4, endSlot: 6, startBeat: 4, endBeat: 8, marker: 'Verse' },
        { startSlot: 8, endSlot: 10, startBeat: 8, endBeat: 12, marker: 'Chorus' },
        { startSlot: 12, endSlot: 14, startBeat: 12, endBeat: 16, marker: 'Outro' },
      ],
      tempo: 120,
      totalBeats: 16,
    },
  }],
  drumTracks: [{ index: 0, name: 'Drums', model: perc, hitCount: perc.events.length, tempo: 120 }],
};

// ---- regression: inline viewer without exerciseImport ----
const plainHost = document.createElement('div');
const plainMount = mountGpPlayer(plainHost, { gpResult: fakeGp, title: 'Inline viewer' });
const plainSplitBtn = [...plainHost.querySelectorAll('button')].find(
  (b) => b.getAttribute?.('aria-label') === 'Split score into exercises',
);
assert.ok(!plainSplitBtn, 'inline viewer must not show Split button');
assert.ok(!plainHost.querySelector('.gpi-root'), 'inline viewer must not mount import panel host');
plainMount.destroy();
assert.equal(plainHost.innerHTML, '', 'destroy should clear host');
assert.equal(plainHost.children.length, 0, 'destroy should leave host empty');

// ---- transport dock tempo controls (practice rail) ----
const tempoHost = document.createElement('div');
const tempoMount = mountGpPlayer(tempoHost, { gpResult: fakeGp, title: 'Tempo dock' });
const practiceRailEl = tempoHost.querySelector('.gpp-practice-rail');
assert.ok(practiceRailEl, 'practice rail should render tempo group');
const dockBpmInput = tempoHost.querySelector('.gpp-practice-bpm-input');
const bpmUpBtn = tempoHost.querySelector('[aria-label="Increase tempo by 5 BPM"]');
const bpmDownBtn = tempoHost.querySelector('[aria-label="Decrease tempo by 5 BPM"]');
const bpmResetBtn = tempoHost.querySelector('[aria-label="Reset tempo to score BPM"]');
assert.ok(dockBpmInput, 'practice rail should render BPM input');
assert.ok(bpmUpBtn && bpmDownBtn && bpmResetBtn, 'practice rail should render tempo step and reset buttons');
assert.equal(dockBpmInput.getAttribute('min'), '40');
assert.equal(dockBpmInput.getAttribute('max'), '320');
assert.equal(tempoMount.getState().bpm, 120);
assert.equal(tempoMount.getState().bpmUserOverride, false);
assert.equal(bpmResetBtn.disabled, true, 'reset disabled at score tempo');

bpmUpBtn.click();
assert.equal(tempoMount.getState().bpm, 125);
assert.equal(tempoMount.getState().bpmUserOverride, true);
assert.equal(bpmResetBtn.disabled, false, 'reset enabled after tempo override');

bpmDownBtn.click();
assert.equal(tempoMount.getState().bpm, 120);
assert.equal(tempoMount.getState().bpmUserOverride, true);

dockBpmInput.value = '90';
dockBpmInput.change();
assert.equal(tempoMount.getState().bpm, 90);
assert.equal(tempoMount.getState().bpmUserOverride, true);

bpmResetBtn.click();
assert.equal(tempoMount.getState().bpm, 120);
assert.equal(tempoMount.getState().bpmUserOverride, false);
assert.equal(bpmResetBtn.disabled, true, 'reset disabled after returning to score tempo');

tempoMount.destroy();

// ---- transport dock extra slot ----
function hasAncestorWithClass(node, cls) {
  let cur = node?.parentElement;
  while (cur) {
    if (cur.classList?.contains(cls)) return true;
    cur = cur.parentElement;
  }
  return false;
}

let extraClicked = false;
const extraNextBtn = document.createElement('button');
extraNextBtn.setAttribute('aria-label', 'Next exercise');
extraNextBtn.addEventListener('click', () => { extraClicked = true; });
const extraNode = document.createElement('div');
extraNode.appendChild(extraNextBtn);

const extraHost = document.createElement('div');
const extraMount = mountGpPlayer(extraHost, {
  gpResult: fakeGp,
  title: 'Transport extra',
  transportExtra: extraNode,
});

const extraDock = extraHost.querySelector('.gpp-transport-dock');
const extraGroup = extraHost.querySelector('.gpp-transport-extra');
const primaryRow = extraHost.querySelector('.gpp-transport-row-primary');
assert.ok(extraDock, 'dock should render when transportExtra is provided');
assert.ok(extraGroup, 'extra group should render');
assert.ok(extraDock.classList.contains('has-extra'), 'dock should carry has-extra');
assert.equal(primaryRow?.firstChild, extraGroup, 'extra group is first child of primary row');
assert.ok(hasAncestorWithClass(extraNextBtn, 'gpp-transport-extra'), 'button sits under extra group');
assert.ok(hasAncestorWithClass(extraNextBtn, 'gpp-transport-dock'), 'button sits under transport dock');

extraClicked = false;
extraNextBtn.click();
assert.equal(extraClicked, true, 'injected button click handler still runs');

const noExtraHost = document.createElement('div');
const noExtraMount = mountGpPlayer(noExtraHost, { gpResult: fakeGp, title: 'No transport extra' });
const noExtraDock = noExtraHost.querySelector('.gpp-transport-dock');
assert.ok(noExtraDock, 'dock should render without transportExtra');
assert.ok(!noExtraDock.classList.contains('has-extra'), 'dock without extra omits has-extra');
assert.ok(!noExtraHost.querySelector('.gpp-transport-extra'), 'no extra group without transportExtra');

extraMount.destroy();
noExtraMount.destroy();
assert.equal(extraHost.innerHTML, '', 'destroy clears extra host');
assert.equal(extraHost.children.length, 0, 'destroy leaves extra host empty');
assert.equal(noExtraHost.innerHTML, '', 'destroy clears no-extra host');
assert.equal(noExtraHost.children.length, 0, 'destroy leaves no-extra host empty');

// ---- standalone wiring with exerciseImport ----
const host = document.createElement('div');
const mounted = mountGpPlayer(host, {
  gpResult: fakeGp,
  title: 'Wiring GP',
  exerciseImport: {
    getFolders: () => [],
    createFolder: () => null,
    importSegments: async () => ({ ok: true, count: 2 }),
  },
});

const splitBtn = [...host.querySelectorAll('button')].find(
  (b) => b.getAttribute?.('aria-label') === 'Split score into exercises',
);
assert.ok(splitBtn, 'Split header button should exist when exerciseImport is provided');

const chrome = host.querySelector('.gpp-chrome');
const importRoot = [...document.body.children].find(
  (c) => (c.className || '').includes('gpi-mount') && c.parentElement === document.body,
);
assert.ok(chrome, 'chrome should mount');
assert.ok(importRoot, 'import panel host should mount on document.body');
assert.equal(importRoot.parentElement, document.body, 'gpi-mount should be direct child of document.body');
assert.notEqual(importRoot.parentElement, chrome, 'gpi-mount should not be inside chrome');

splitBtn.click();
const barChips = importRoot.querySelectorAll('.gpi-bar');
if (barChips.length >= 1) {
  assert.ok(barChips.length >= 4, 'panel should render a bar chip per measure');
} else {
  assert.ok(importRoot.children.length > 0, 'panel host should receive children when opened');
}

mounted.destroy();
assert.equal(host.innerHTML, '', 'destroy should clear host after import wiring');
assert.equal(host.children.length, 0, 'destroy should leave host empty');
assert.ok(
  ![...document.body.children].some((c) => (c.className || '').includes('gpi-mount')),
  'destroy should remove import panel host from document.body',
);

// ---- mount handle: external loop control ----
// Loop-enabled mount paints selection overlays that call Element.remove (missing in shim).
const _createElement = document.createElement.bind(document);
document.createElement = (tag) => {
  const el = _createElement(tag);
  if (!el.remove) {
    el.remove = function remove() {
      if (this.parentElement) this.parentElement.removeChild(this);
    };
  }
  return el;
};

const loopHost = document.createElement('div');
const loopMount = mountGpPlayer(loopHost, {
  gpResult: fakeGp,
  title: 'Loop control',
  initialLoopEnabled: true,
  initialLoopStart: 1,
  initialLoopEnd: 2,
});
assert.equal(typeof loopMount.player, 'object', 'handle exposes player');
assert.equal(typeof loopMount.getState, 'function', 'handle exposes getState');
assert.equal(typeof loopMount.destroy, 'function', 'handle exposes destroy');
assert.equal(typeof loopMount.isLoopEnabled, 'function', 'handle exposes isLoopEnabled');
assert.equal(typeof loopMount.setLoopEnabled, 'function', 'handle exposes setLoopEnabled');
assert.equal(typeof loopMount.play, 'function', 'handle exposes play');
assert.equal(typeof loopMount.stop, 'function', 'handle exposes stop');

assert.equal(loopMount.isLoopEnabled(), true, 'initial loop enabled');
const beforeLoop = loopMount.getState();
assert.equal(beforeLoop.loopStart, 1, 'initial loopStart preserved');
assert.equal(beforeLoop.loopEnd, 2, 'initial loopEnd preserved');

loopMount.setLoopEnabled(false);
assert.equal(loopMount.isLoopEnabled(), false, 'setLoopEnabled(false) disables loop');
loopMount.setLoopEnabled(true);
assert.equal(loopMount.isLoopEnabled(), true, 'setLoopEnabled(true) re-enables loop');
const afterLoop = loopMount.getState();
assert.equal(afterLoop.loopStart, beforeLoop.loopStart, 'loopStart restored after toggle');
assert.equal(afterLoop.loopEnd, beforeLoop.loopEnd, 'loopEnd restored after toggle');

loopMount.destroy();

// ---- User Story 3: main-screen practice controls (no panel open) ----
const us3Host = document.createElement('div');
const us3Mount = mountGpPlayer(us3Host, { gpResult: fakeGp, title: 'US3 controls' });

const trackTabs = us3Host.querySelector('.gpp-track-tabs');
assert.ok(trackTabs, 'track tab strip should render on the main screen');
const tabButtons = trackTabs.querySelectorAll('.gpp-track-tab');
assert.ok(tabButtons.length >= 2, 'track strip should list at least two tracks');

const practiceRail = us3Host.querySelector('.gpp-practice-rail');
assert.ok(practiceRail, 'practice rail should render on the main screen');
assert.ok(practiceRail.querySelector('[aria-label="Playback speed"]'), 'practice rail should include speed control');
assert.ok(practiceRail.querySelector('[aria-label="Loop"]'), 'practice rail should include loop toggle');
assert.ok(practiceRail.querySelector('[aria-label="Metronome"]'), 'practice rail should include metronome toggle');
assert.ok(practiceRail.querySelector('[aria-label="Count-in"]'), 'practice rail should include count-in toggle');

const us3Dock = us3Host.querySelector('.gpp-transport-dock');
assert.ok(us3Dock, 'transport dock should render');
const rowPrimary = us3Host.querySelector('.gpp-transport-row-primary');
const rowPractice = us3Host.querySelector('.gpp-transport-row-practice');
assert.ok(rowPrimary, 'transport dock row one should render');
assert.ok(rowPractice, 'transport dock row two should render');
assert.ok(rowPractice.contains(practiceRail), 'practice rail should sit in row two');
assert.ok(!rowPrimary.contains(practiceRail), 'practice rail should not sit in row one');

const openDrawer = us3Host.querySelector('.gpp-drawer.is-open, .gpp-sheet.is-open');
assert.ok(!openDrawer, 'no panel should be open on mount');

us3Mount.destroy();

console.log('gp player wiring: ok');
