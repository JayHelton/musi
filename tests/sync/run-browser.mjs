/**
 * Drives the browser harnesses in headless Chrome over CDP and reports the
 * RESULT line each page prints.
 *
 * Virtual time (--virtual-time-budget) deadlocks on IndexedDB work, so this
 * uses real time and polls the page instead.
 *
 * Usage: node tests/sync/run-browser.mjs [baseUrl]
 * Requires a static server on the base URL (default http://localhost:8080)
 * and google-chrome on PATH.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://localhost:8080';
const PAGES = ['/tests/sync/roundtrip.html', '/tests/sync/bundle-roundtrip.html'];
const PORT = 9333;
const TIMEOUT_MS = 180000;

const profile = mkdtempSync(join(tmpdir(), 'musi-cdp-'));
const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function endpoint() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
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

async function runPage(send, url) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const consoleErrors = [];
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
  return { text, elapsed: Date.now() - started, consoleErrors };
}

let failures = 0;
try {
  const ws = await connect(await endpoint());
  const send = makeRpc(ws);
  for (const page of PAGES) {
    const url = BASE + page;
    process.stdout.write(`\n=== ${page} ===\n`);
    const { text, elapsed } = await runPage(send, url);
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

process.exit(failures ? 1 : 0);
