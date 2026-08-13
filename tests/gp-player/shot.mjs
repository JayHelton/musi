/**
 * Takes a screenshot of one gp-player harness page in headless Chrome.
 *
 * Usage: node tests/gp-player/shot.mjs <page> <outFile> [baseUrl]
 * Example: node tests/gp-player/shot.mjs score-visual.html /tmp/after.png
 *
 * The page must set window.__harnessResult when it is ready to capture.
 * Requires a static server on the base URL and google-chrome on PATH.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [page, outFile, baseArg] = process.argv.slice(2);
if (!page || !outFile) {
  console.error('usage: node tests/gp-player/shot.mjs <page> <outFile> [baseUrl]');
  process.exit(1);
}

const BASE = baseArg || `http://localhost:${process.env.GP_PLAYER_PORT || 8080}`;
const CDP_PORT = Number(process.env.GP_SHOT_CDP_PORT || 9345);
const READY_TIMEOUT_MS = 30000;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

const profile = mkdtempSync(join(tmpdir(), 'musi-gp-shot-'));
const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--hide-scrollbars', '--force-device-scale-factor=2',
  '--window-size=1000,1400',
  `--user-data-dir=${profile}`, `--remote-debugging-port=${CDP_PORT}`, 'about:blank',
], { stdio: 'ignore' });

async function endpoint() {
  for (let i = 0; i < 60; i += 1) {
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
    ws.onerror = () => reject(new Error('CDP socket failed'));
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
    const id = next += 1;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  };
}

let code = 0;
try {
  const ws = await connect(await endpoint());
  const send = makeRpc(ws);
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId);
  await send('Page.enable', {}, sessionId);
  await send('Page.navigate', { url: `${BASE}/tests/gp-player/audio/${page}` }, sessionId);

  const started = Date.now();
  let ready = false;
  while (Date.now() - started < READY_TIMEOUT_MS) {
    await sleep(500);
    const res = await send('Runtime.evaluate', {
      expression: 'window.__harnessResult || ""',
      returnByValue: true,
    }, sessionId);
    if (res?.result?.value) { ready = true; break; }
  }
  if (!ready) throw new Error(`page ${page} never reported that it was ready`);

  await sleep(400);
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
  }, sessionId);
  writeFileSync(outFile, Buffer.from(shot.data, 'base64'));
  console.log(`wrote ${outFile}`);
  await send('Target.closeTarget', { targetId });
  ws.close();
} catch (e) {
  console.error('shot failed: ' + e.message);
  code = 1;
} finally {
  chrome.kill('SIGKILL');
  try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* best effort */ }
}

process.exit(code);
