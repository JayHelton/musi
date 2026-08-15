// Parchment rebuild guards for dense scores (Node + domShim).
// Run: node tests/gp-player/parchment-rebuild.mjs

import assert from 'node:assert/strict';
import { installDomShim } from './domShim.mjs';

installDomShim();

const resizeObservers = [];
globalThis.ResizeObserver = class {
  constructor(cb) {
    this.cb = cb;
  }

  observe() {
    resizeObservers.push(this.cb);
  }

  disconnect() {
    const i = resizeObservers.indexOf(this.cb);
    if (i >= 0) resizeObservers.splice(i, 1);
  }
};

let rafQueue = [];
globalThis.requestAnimationFrame = (fn) => {
  const id = rafQueue.length + 1;
  rafQueue.push({ id, fn });
  return id;
};
globalThis.cancelAnimationFrame = (id) => {
  rafQueue = rafQueue.filter((entry) => entry.id !== id);
};

function flushAnimationFrames() {
  const pending = rafQueue.splice(0);
  for (const entry of pending) entry.fn();
}

const { mountParchmentView } = await import('../../js/gpPlayer/parchmentView.js');

function standardStrings() {
  return [
    { note: 'E', oct: 4, label: 'E', openMidi: 64 },
    { note: 'B', oct: 3, label: 'B', openMidi: 59 },
    { note: 'G', oct: 3, label: 'G', openMidi: 55 },
    { note: 'D', oct: 3, label: 'D', openMidi: 50 },
    { note: 'A', oct: 2, label: 'A', openMidi: 45 },
    { note: 'E', oct: 2, label: 'E', openMidi: 40 },
  ];
}

function denseEightBarTripletModel() {
  const beats = [];
  const events = [];
  const measures = [];
  const notesPerBar = 24;
  const noteDuration = 4 / notesPerBar;

  for (let bar = 0; bar < 8; bar += 1) {
    measures.push({
      startBeat: bar * 4,
      endBeat: (bar + 1) * 4,
      timeSig: [4, 4],
    });
    for (let n = 0; n < notesPerBar; n += 1) {
      const start = bar * 4 + n * noteDuration;
      const stringIndex = n % 6;
      const idx = events.length;
      events.push({
        start,
        stringIndex,
        fret: (n % 12) + 1,
        dead: false,
        duration: noteDuration,
      });
      beats.push({
        measureIndex: bar,
        voiceIndex: 0,
        start,
        duration: noteDuration,
        noteValue: 16,
        dots: 0,
        tuplet: { num: 3, den: 2 },
        rest: false,
        noteIndices: [idx],
      });
    }
  }

  return {
    tuning: 'Standard',
    strings: standardStrings(),
    events,
    beats,
    measures,
  };
}

const host = document.createElement('div');
host.clientWidth = 360;
const model = denseEightBarTripletModel();
const view = mountParchmentView(host, { guitarModel: model, zoom: 1 });

assert.ok(host.querySelector('.gpp-parch-measure'), 'initial mount renders measures');
assert.equal(
  host.querySelectorAll('.gpp-parch-measure').length,
  8,
  'eight measures render for the dense model',
);
assert.ok(!host.querySelector('.gpp-parch-error'), 'mount must not show a draw error');

const sheet = host.querySelector('.gpp-parch-sheet');
const measureCountBefore = host.querySelectorAll('.gpp-parch-measure').length;
view.setZoom(1.2);
assert.equal(
  host.querySelectorAll('.gpp-parch-measure').length,
  measureCountBefore,
  'zoom rebuild keeps measure count',
);
assert.ok(!host.querySelector('.gpp-parch-error'), 'zoom rebuild must not show a draw error');

host.clientWidth = 420;
for (const cb of [...resizeObservers]) cb();
flushAnimationFrames();
assert.ok(host.querySelectorAll('.gpp-parch-measure').length >= 8, 'resize rebuild keeps measures');
assert.ok(!host.querySelector('.gpp-parch-error'), 'resize rebuild must not show a draw error');
assert.ok(sheet.children.length > 0, 'sheet keeps children after resize rebuild');

view.destroy();

console.log('gp-player parchment-rebuild: ok');
