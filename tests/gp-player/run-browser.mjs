/**
 * Drives gp-player audio harness pages in headless Chrome over CDP.
 *
 * Usage: node tests/gp-player/run-browser.mjs [page ...]
 * Example: node tests/gp-player/run-browser.mjs follow-scroll.html
 * Requires a static server on the base URL (default http://localhost:8080)
 * and google-chrome on PATH.
 *
 * Start the server in another terminal:
 *   python3 -m http.server 8080
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Register harness pages here (file names under tests/gp-player/audio/). */
const PAGES = [
  'onset-timing.html',
  'total-duration.html',
  'loop-boundary.html',
  'long-drift.html',
  'render-cost.html',
  'peak-headroom.html',
  'instrument-spectral.html',
  'realtime-dropouts.html',
  'realtime-ui-jank.html',
  'follow-scroll.html',
];

const argvPages = process.argv.slice(2);
const pagesToRun = argvPages.length > 0 ? argvPages : PAGES;

const PORT = Number(process.env.GP_PLAYER_PORT || process.env.PORT || 8080);
const BASE = `http://localhost:${PORT}`;
const CDP_PORT = 9334;
const TIMEOUT_MS = 60000;

if (pagesToRun.length === 0) {
  console.log('gp-player browser: no pages registered');
  process.exit(0);
}

async function checkServer() {
  try {
    const res = await fetch(BASE, { method: 'GET' });
    return res.ok || res.status < 500;
  } catch (e) {
    return false;
  }
}

if (!(await checkServer())) {
  console.error('gp-player browser: static server is not reachable at ' + BASE);
  console.error('Start the server in another terminal from the repository root:');
  console.error('  python3 -m http.server 8080');
  process.exit(1);
}

const profile = mkdtempSync(join(tmpdir(), 'musi-gp-cdp-'));
const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  // A page that plays in real time needs an audio context that starts with
  // no tap. Without this flag the context stays suspended and the page waits.
  '--autoplay-policy=no-user-gesture-required',
  `--user-data-dir=${profile}`, `--remote-debugging-port=${CDP_PORT}`, 'about:blank',
], { stdio: 'ignore' });

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function endpoint() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      const json = await res.json();
      if (json.webSocketDebuggerUrl) return json.webSocketDebuggerUrl;
    } catch (e) { /* not listening yet */ }
    await sleep(500);
  }
  throw new Error('Chrome did not expose a debugging endpoint');
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = (e) => reject(new Error('CDP socket failed: ' + (e.message || 'error')));
  });
}

function makeRpc(ws) {
  let next = 1;
  const pending = new Map();
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  };
  return function send(method, params = {}, sessionId) {
    const id = next++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  };
}

async function runPage(send, page) {
  const url = `${BASE}/tests/gp-player/audio/${page}`;
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId);
  await send('Page.enable', {}, sessionId);
  await send('Page.navigate', { url }, sessionId);

  const started = Date.now();
  let text = '';
  while (Date.now() - started < TIMEOUT_MS) {
    await sleep(1000);
    try {
      const res = await send('Runtime.evaluate', {
        expression: "(document.getElementById('out')||{}).textContent || ''",
        returnByValue: true,
      }, sessionId);
      text = res?.result?.value || '';
      if (/RESULT:/.test(text)) break;
    } catch (e) { /* page still loading */ }
  }
  await send('Target.closeTarget', { targetId });
  return { text, elapsed: Date.now() - started };
}

let failures = 0;
try {
  const ws = await connect(await endpoint());
  const send = makeRpc(ws);
  for (const page of pagesToRun) {
    process.stdout.write(`\n=== ${page} ===\n`);
    const { text, elapsed } = await runPage(send, page);
    process.stdout.write(text.trim() + '\n');
    const pass = /RESULT: PASS/.test(text);
    process.stdout.write(`(${Math.round(elapsed / 1000)}s) ${pass ? 'PASS' : 'FAIL'}\n`);
    if (!pass) failures++;
  }
  ws.close();
} catch (e) {
  process.stdout.write('driver error: ' + e.message + '\n');
  failures++;
} finally {
  chrome.kill('SIGKILL');
  try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* best effort */ }
}

if (failures) {
  process.exit(1);
}

console.log('gp-player browser: ok');
process.exit(0);
