/**
 * Drive the vNext player with real pointer input in Chromium.
 *
 * Usage: node tests/gp-player/audio/vnext-interact.mjs [outDir] [baseUrl]
 *
 * Checks, on the 200 bar fixture:
 *  - a click on a beat seeks there and the sheet moves it into the reading zone
 *  - a mouse drag across the score marks a range and shows the toolbar
 *  - Loop on the toolbar turns the range into a loop
 *  - a wheel scroll during playback suspends follow and shows the pill
 *  - the pill resumes follow
 *  - a track switch keeps the beat and the loop
 *  - Escape clears the range, Space toggles play
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch (e) {
  playwright = require('/opt/node22/lib/node_modules/playwright');
}

const [outDir = '/tmp/gp-vnext-interact', baseArg] = process.argv.slice(2);
const BASE = baseArg || `http://localhost:${process.env.GP_PLAYER_PORT || 8080}`;
mkdirSync(outDir, { recursive: true });

const browser = await playwright.chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (err) => errors.push(String(err?.message || err)));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

await page.goto(`${BASE}/tests/gp-player/audio/vnext-visual.html?file=large-200bar.gp5&state=loaded`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__harnessResult, null, { timeout: 30000 });

const state = () => page.evaluate(() => window.__mount.getState());

// 1. Click on a beat in bar 3 seeks there.
const bar3 = page.locator('.gpp-parch-measure[data-index="2"]').first();
const box = await bar3.boundingBox();
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.6);
await page.waitForTimeout(150);
let st = await state();
check('click on bar 3 seeks to bar 3', st.navBar === 2, `navBar=${st.navBar}`);

// 2. A seek far away moves the sheet so the bar sits in the reading zone.
await page.evaluate(() => window.__mount.seekToBar(120));
await page.waitForTimeout(250);
const zone = await page.evaluate(() => {
  const vp = document.querySelector('.gpp-parch-viewport');
  const el = document.querySelector('.gpp-parch-measure[data-index="120"]');
  const v = vp.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { top: (r.top - v.top) / v.height, scrollTop: vp.scrollTop };
});
check('seek to bar 121 brings it into the reading zone', zone.top > 0.05 && zone.top < 0.6, `top=${zone.top.toFixed(2)} scrollTop=${zone.scrollTop}`);

// 3. Drag with the mouse across bars 121–123 marks a range and shows the toolbar.
const b121 = await page.locator('.gpp-parch-measure[data-index="120"]').first().boundingBox();
const b123 = await page.locator('.gpp-parch-measure[data-index="122"]').first().boundingBox();
if (b121 && b123 && Math.abs(b121.y - b123.y) < 4) {
  await page.mouse.move(b121.x + 10, b121.y + b121.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(b121.x + 40, b121.y + b121.height * 0.6, { steps: 4 });
  await page.mouse.move(b123.x + b123.width - 10, b123.y + b123.height * 0.6, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  st = await state();
  const toolbarVisible = await page.evaluate(() => !document.querySelector('.gpp-selection-toolbar').hidden);
  check('mouse drag marks a range', st.selection.kind === 'range' && st.selection.endBeat > st.selection.startBeat, `${st.selection.startBeat}–${st.selection.endBeat}`);
  check('the range toolbar shows', toolbarVisible);
  check('a range band draws on the sheet', await page.locator('.gpp-parch-range-band').count() > 0);
  await page.screenshot({ path: join(outDir, 'range.png') });

  // 4. Loop from the toolbar turns the range into the loop.
  await page.locator('.gpp-selection-loop').click();
  await page.waitForTimeout(150);
  st = await state();
  check('toolbar Loop makes the loop', st.loopEnabled && st.loopStartBeat != null, `bars ${st.loopStart + 1}–${st.loopEnd + 1}`);
  check('a loop band draws on the sheet', await page.locator('.gpp-parch-loop-band').count() > 0);
  check('the range mark clears after Loop', !st.selection.kind);
  await page.screenshot({ path: join(outDir, 'loop.png') });
} else {
  check('bars 121–123 share a row for the drag check', false, 'rows differ; skipped drag');
}

// 5. Playback follows; a wheel scroll suspends follow and shows the pill.
await page.locator('[aria-label="Play"]').click();
await page.waitForTimeout(600);
st = await state();
const playing = await page.evaluate(() => window.__mount.player.playing);
check('Play starts playback', playing);
const pillBefore = await page.evaluate(() => document.querySelector('.gpp-follow-btn').hidden);
check('the follow pill hides while follow is active', pillBefore === true);
const vpBox = await page.locator('.gpp-parch-viewport').boundingBox();
await page.mouse.move(vpBox.x + vpBox.width / 2, vpBox.y + vpBox.height / 2);
await page.mouse.wheel(0, 600);
await page.waitForTimeout(300);
st = await state();
check('a user scroll during playback suspends follow', st.follow.suspended === true, JSON.stringify(st.follow));
const pillAfter = await page.evaluate(() => document.querySelector('.gpp-follow-btn').hidden);
check('the follow pill shows', pillAfter === false);
await page.screenshot({ path: join(outDir, 'suspended.png') });
// No timer resumes it.
await page.waitForTimeout(3000);
st = await state();
check('follow stays suspended after three seconds', st.follow.suspended === true);
await page.locator('.gpp-follow-btn').click();
await page.waitForTimeout(200);
st = await state();
check('the pill resumes follow', st.follow.suspended === false);

// 6. A track switch keeps the beat, the loop, and the play state.
const before = await page.evaluate(() => ({ beat: window.__mount.player.getPosition().beatInScore, loop: [window.__mount.getState().loopStartBeat, window.__mount.getState().loopEndBeat] }));
await page.evaluate(() => window.__mount.setViewedTrack('guitar', 0));
await page.waitForTimeout(200);
const after = await page.evaluate(() => ({ beat: window.__mount.player.getPosition().beatInScore, loop: [window.__mount.getState().loopStartBeat, window.__mount.getState().loopEndBeat], playing: window.__mount.player.playing }));
check('a track switch keeps the loop', after.loop[0] === before.loop[0] && after.loop[1] === before.loop[1]);
check('a track switch keeps playback', after.playing === true);
check('a track switch keeps the beat inside the loop', after.beat >= before.loop[0] - 1 && after.beat <= before.loop[1] + 1, `${before.beat.toFixed(1)} → ${after.beat.toFixed(1)}`);

// 7. Space pauses. Escape clears a range.
await page.locator('#host').focus();
await page.keyboard.press('Space');
await page.waitForTimeout(150);
check('Space pauses', (await page.evaluate(() => window.__mount.player.playing)) === false);
await page.evaluate(() => window.__mount.getState());
await page.evaluate(() => { const m = window.__mount; m.setLoop(20, 28); });
await page.locator('.gpp-tbtn--loop').click(); // loop off keeps the range marked
await page.waitForTimeout(100);
st = await state();
check('loop off keeps the range marked', !st.loopEnabled && st.selection.kind === 'range');
await page.keyboard.press('Escape');
await page.waitForTimeout(100);
st = await state();
check('Escape clears the range', !st.selection.kind);

// 8. Keyboard: S opens speed, T opens tracks, N toggles metronome.
await page.keyboard.press('s');
await page.waitForTimeout(100);
check('S opens the speed panel', await page.locator('.gpp-popover-root--speed.is-open').count() === 1);
await page.keyboard.press('Escape');
await page.keyboard.press('t');
await page.waitForTimeout(100);
check('T opens the track list', await page.locator('.gpp-popover-root--tracks.is-open').count() === 1);
await page.keyboard.press('Escape');
await page.keyboard.press('n');
await page.waitForTimeout(100);
st = await state();
check('N turns the metronome on', st.metro.enabled === true);

// 9. Tap targets: every transport control is at least 44px.
const small = await page.evaluate(() => [...document.querySelectorAll('.gpp-transport button, .gpp-header button')]
  .filter((b) => !b.hidden && b.offsetParent)
  .map((b) => ({ label: b.getAttribute('aria-label'), r: b.getBoundingClientRect() }))
  .filter((x) => x.r.width < 44 || x.r.height < 44)
  .map((x) => `${x.label} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`));
check('every header and transport control is at least 44px', small.length === 0, small.join(', '));

// 10. No horizontal page scroll.
const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
check('no horizontal page scroll', !hScroll);

check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `vnext interact: ${failed} failure(s)` : 'vnext interact: ok');
process.exit(failed ? 1 : 0);
