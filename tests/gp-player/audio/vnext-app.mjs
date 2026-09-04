/**
 * Open a Guitar Pro file through the real app shell and screenshot the
 * Score Player screen. This checks the full-bleed shell rules that only the
 * real page carries: the app rail, the bottom dock, and the locked scroll.
 *
 * Usage: node tests/gp-player/audio/vnext-app.mjs [outDir] [baseUrl]
 */

import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch (e) {
  playwright = require('/opt/node22/lib/node_modules/playwright');
}

const [outDir = '/tmp/gp-vnext-app', baseArg] = process.argv.slice(2);
const BASE = baseArg || `http://localhost:${process.env.GP_PLAYER_PORT || 8080}`;
mkdirSync(outDir, { recursive: true });

const browser = await playwright.chromium.launch({ headless: true, args: ['--no-sandbox'] });
let failed = 0;

for (const vp of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844, mobile: true }]) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    isMobile: !!vp.mobile,
    hasTouch: !!vp.mobile,
  });
  const page = await context.newPage();
  // The sandbox has no route to the web fonts. Fail those requests at once,
  // or the boot splash waits on them.
  await page.route(/^https?:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, (route) => route.abort());
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err?.message || err)));
  page.on('console', (msg) => {
    // Resource misses (the fonts the sandbox cannot reach, an optional cloud
    // config) are not player errors.
    if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) errors.push(msg.text());
  });
  try {
    await page.goto(`${BASE}/index.html#scoreplayer`, { waitUntil: 'load' });
    await page.waitForSelector('#gpp-file', { state: 'attached', timeout: 30000 });
    await page.waitForFunction(() => !document.body.classList.contains('boot-locked'), null, { timeout: 30000 })
      .catch(async () => {
        // The splash did not leave on its own. Take it down so the check can
        // still exercise the screen.
        await page.evaluate(() => {
          document.querySelector('.boot-splash')?.remove();
          document.documentElement.classList.remove('booting');
          document.body.classList.remove('boot-locked');
        });
        console.log('note: boot splash removed by the harness');
      });
    await page.waitForTimeout(500);
    await page.waitForSelector('#sec-scoreplayer.active', { state: 'attached', timeout: 30000 });
    await page.waitForTimeout(400);
    const fixture = resolve('tests/gp-player/fixtures/techniques.gp5');
    await page.setInputFiles('#gpp-file', fixture);
    const loaded = () => page.waitForSelector('#sec-scoreplayer.gpp-score-loaded .gpp-transport', { timeout: 15000 });
    try {
      await loaded();
    } catch (e) {
      // The screen binds its file input on activation. A pick that lands
      // before that binding goes nowhere, so pick once more.
      await page.setInputFiles('#gpp-file', fixture);
      await loaded();
    }
    await page.waitForTimeout(600);
    const info = await page.evaluate(() => {
      const chrome = document.querySelector('.gpp-chrome');
      const r = chrome.getBoundingClientRect();
      const measures = document.querySelectorAll('.gpp-parch-measure').length;
      const hScroll = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
      return { width: Math.round(r.width), height: Math.round(r.height), measures, hScroll, viewport: window.innerWidth };
    });
    await page.screenshot({ path: join(outDir, `app-${vp.name}.png`) });
    // A wide screen keeps the 88px app rail beside the score.
    const wide = info.width >= info.viewport - 100;
    const ok = info.measures > 0 && wide && !info.hScroll && errors.length === 0;
    if (!ok) failed += 1;
    console.log(`${ok ? 'ok  ' : 'FAIL'} app ${vp.name}: chrome ${info.width}x${info.height} of ${info.viewport}, ${info.measures} measures, hScroll=${info.hScroll}${errors.length ? ` — ${errors.join(' | ')}` : ''}`);
  } catch (e) {
    failed += 1;
    console.log(`FAIL app ${vp.name} — ${e.message}`);
    await page.screenshot({ path: join(outDir, `app-${vp.name}-fail.png`) }).catch(() => {});
  }
  await context.close();
}

await browser.close();
console.log(failed ? `vnext app: ${failed} failure(s)` : 'vnext app: ok');
process.exit(failed ? 1 : 0);
