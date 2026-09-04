/**
 * Screenshot the vNext player at the viewports and states the spec names.
 *
 * Usage: node tests/gp-player/audio/vnext-shots.mjs <outDir> [baseUrl]
 * Requires a static server on the base URL (default http://localhost:8080)
 * and Playwright with its Chromium (PLAYWRIGHT_BROWSERS_PATH).
 *
 * The script writes one PNG per viewport and state, prints any page error,
 * and exits non-zero when a page reports an error.
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

const [outDir = '/tmp/gp-vnext-shots', baseArg] = process.argv.slice(2);
const BASE = baseArg || `http://localhost:${process.env.GP_PLAYER_PORT || 8080}`;

const VIEWPORTS = [
  { name: '360x800', width: 360, height: 800, mobile: true },
  { name: '390x844', width: 390, height: 844, mobile: true },
  { name: '768x1024', width: 768, height: 1024, mobile: true },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1920x1080', width: 1920, height: 1080 },
];

const STATES = [
  { state: 'loaded', file: 'many-tracks.gp5' },
  { state: 'seek', file: 'techniques.gp5' },
  { state: 'loop', file: 'many-tracks.gp5' },
  { state: 'range', file: 'many-tracks.gp5' },
  { state: 'mixer', file: 'many-tracks.gp5' },
  { state: 'speed', file: 'many-tracks.gp5' },
  { state: 'tracks', file: 'many-tracks.gp5' },
  { state: 'metro', file: 'techniques.gp5' },
  { state: 'notation', file: 'techniques.gp5' },
  { state: 'loaded', file: 'drums-only.gp5', tag: 'drums' },
  { state: 'practice', file: 'many-tracks.gp5' },
  { state: 'menu', file: 'many-tracks.gp5' },
];

const onlyStates = (process.env.GP_SHOT_STATES || '').split(',').filter(Boolean);
const onlyViewports = (process.env.GP_SHOT_VIEWPORTS || '').split(',').filter(Boolean);

mkdirSync(outDir, { recursive: true });

const browser = await playwright.chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
});

let failures = 0;
for (const vp of VIEWPORTS) {
  if (onlyViewports.length && !onlyViewports.includes(vp.name)) continue;
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    isMobile: !!vp.mobile,
    hasTouch: !!vp.mobile,
  });
  for (const st of STATES) {
    if (onlyStates.length && !onlyStates.includes(st.state)) continue;
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('pageerror', (err) => consoleErrors.push(String(err?.message || err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    const url = `${BASE}/tests/gp-player/audio/vnext-visual.html?file=${encodeURIComponent(st.file)}&state=${st.state}`;
    const label = `${vp.name}-${st.tag || st.state}`;
    try {
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForFunction(() => !!window.__harnessResult, null, { timeout: 30000 });
      const result = await page.evaluate(() => window.__harnessResult);
      const out = await page.evaluate(() => document.getElementById('out')?.textContent || '');
      const file = join(outDir, `${label}.png`);
      await page.screenshot({ path: file, fullPage: false });
      const bad = result !== 'PASS' || consoleErrors.length;
      if (bad) failures += 1;
      console.log(`${bad ? 'FAIL' : 'ok  '} ${label}${consoleErrors.length ? ` — ${consoleErrors.join(' | ')}` : ''}`);
      if (bad && out) console.log(out.split('\n').map((l) => `      ${l}`).join('\n'));
    } catch (e) {
      failures += 1;
      console.log(`FAIL ${label} — ${e.message}`);
    } finally {
      await page.close();
    }
  }
  await context.close();
}

await browser.close();
console.log(failures ? `vnext shots: ${failures} failure(s)` : 'vnext shots: ok');
process.exit(failures ? 1 : 0);
