import assert from 'node:assert/strict';
import { installDomShim } from '../gp-player/domShim.mjs';
import {
  defaultCompanion,
  mountCompanion,
} from '../../js/exerciseCompanions/index.js';
import {
  buildOrbitContext,
  evaluateLocateTap,
  generateLocateQuestion,
  isLocateAnswer,
  LOCATE_MISS_THRESHOLD,
} from '../../js/exerciseCompanions/intervalOrbit.js';

installDomShim();

let gUMCalls = 0;
if (!globalThis.navigator) globalThis.navigator = {};
if (!globalThis.navigator.mediaDevices) {
  globalThis.navigator.mediaDevices = {};
}
const origGUM = globalThis.navigator.mediaDevices.getUserMedia;
globalThis.navigator.mediaDevices.getUserMedia = async () => {
  gUMCalls += 1;
  throw new Error('Mic denied (test)');
};

const companion = defaultCompanion('interval-orbit');
companion.root = 'G';
companion.mode = 'map';
companion.collapsed = false;

const host = document.createElement('div');
document.body.appendChild(host);

const before = gUMCalls;
const handle = mountCompanion(host, companion);
assert.equal(gUMCalls, before, 'orbit mount must not call getUserMedia');

const panel = host.querySelector('.ec-panel');
assert.ok(panel, 'orbit panel');
assert.ok(host.querySelector('.ec-orbit-board'), 'orbit board');
assert.ok(host.querySelector('.ec-orbit-chips'), 'orbit chips in map mode');
assert.ok(host.querySelector('.ec-lock')?.textContent?.includes('G'), 'locked root in heading');

const chips = [...host.querySelectorAll('.ec-orbit-chip')];
assert.ok(chips.length > 1, 'interval chips rendered');
const fifthChip = chips.find((c) => c.textContent === '5');
assert.ok(fifthChip, 'level 2 includes fifth chip');
fifthChip.click();
const pressedChip = [...host.querySelectorAll('.ec-orbit-chip')]
  .find((c) => c.getAttribute('aria-pressed') === 'true');
assert.equal(pressedChip?.textContent, '5');
assert.equal(host.querySelector('.ec-orbit-meta')?.hidden, false, 'chip shows interval meta panel');

// Map mode cell click should not throw (audio path)
const mapCell = host.querySelector('.ec-orbit-fb-cell.ec-orbit-in-map:not(.ec-orbit-root)');
if (mapCell) {
  assert.doesNotThrow(() => mapCell.click());
}

handle.destroy();

// Locate mode flow with deterministic question
const locateHost = document.createElement('div');
document.body.appendChild(locateHost);
const locateCompanion = defaultCompanion('interval-orbit');
locateCompanion.mode = 'locate';
locateCompanion.level = 1;
locateCompanion.mapRange = 3;

const ctx = buildOrbitContext(locateCompanion);
assert.ok(ctx);
const question = generateLocateQuestion(ctx, {
  anchor: ctx.anchor,
  forceInterval: 7,
  locateMode: 'any',
});
assert.ok(question);
assert.ok(question.answers.length > 0);
const target = question.answers[0];
assert.ok(isLocateAnswer(question, target.string, target.fret));

let state = { attempts: 0, correctCount: 0, totalAttempts: 0, revealed: false };
const wrong = evaluateLocateTap(question, target.string + 1 > 5 ? 0 : target.string + 1, target.fret, state);
assert.equal(wrong.correct, false);
assert.equal(wrong.attempts, 1);

state = { ...state, attempts: wrong.attempts, totalAttempts: wrong.totalAttempts };
const right = evaluateLocateTap(question, target.string, target.fret, state);
assert.equal(right.correct, true);
assert.equal(right.correctCount, 1);

const revealState = { attempts: LOCATE_MISS_THRESHOLD - 1, revealed: false, correctCount: 0, totalAttempts: 0 };
const forcedReveal = evaluateLocateTap(question, 0, 0, revealState);
assert.equal(forcedReveal.revealed, true);
assert.equal(forcedReveal.resolved, true);

const locateHandle = mountCompanion(locateHost, locateCompanion, {
  locateOverrides: { anchor: ctx.anchor, forceInterval: 7, locateMode: 'any' },
});
assert.ok(locateHost.querySelector('.ec-orbit-prompt')?.textContent?.length > 0, 'locate prompt');
assert.ok(locateHost.querySelector('.ec-orbit-reveal-btn'), 'reveal button');

const locateBoard = locateHost.querySelector('.ec-orbit-board');
const wrongCell = locateBoard.querySelector('[data-string="0"][data-fret="0"]')
  || locateBoard.querySelector('.ec-orbit-fb-cell:not(.ec-orbit-root)');
if (wrongCell && !isLocateAnswer(question, Number(wrongCell.dataset.string), Number(wrongCell.dataset.fret))) {
  wrongCell.click();
}
const revealBtn = locateHost.querySelector('.ec-orbit-reveal-btn');
revealBtn.click();
assert.ok(locateHost.querySelector('.ec-orbit-reveal'), 'revealed cells after reveal');
const nextBtn = locateHost.querySelector('.ec-orbit-next-btn');
assert.ok(nextBtn && !nextBtn.hidden, 'next button after reveal');
nextBtn.click();

let collapseCalled = false;
const host2 = document.createElement('div');
document.body.appendChild(host2);
const c1 = defaultCompanion('interval-orbit');
c1.id = 'orbit-a';
c1.label = 'Orbit A';
const c2 = defaultCompanion('interval-orbit');
c2.id = 'orbit-b';
c2.label = 'Orbit B';
const h1 = mountCompanion(host2, c1, {
  onCollapsedChange: () => { collapseCalled = true; },
});
const h2 = mountCompanion(host2, c2);
const panels = host2.querySelectorAll('.ec-panel');
assert.equal(panels.length, 2);
assert.equal(panels[0].dataset.companionId, 'orbit-a');
assert.equal(panels[1].dataset.companionId, 'orbit-b');

const toggle = host2.querySelector('.ec-toggle');
toggle.click();
assert.equal(collapseCalled, true);

assert.doesNotThrow(() => {
  h1.destroy();
  h2.destroy();
  locateHandle.destroy();
});

if (origGUM) {
  globalThis.navigator.mediaDevices.getUserMedia = origGUM;
}

console.log('companions interval-orbit: ok');
