/**
 * Boots the app in headless Chrome and reports console errors.
 *
 * Usage: node tests/appcheck/run.mjs [--hash '#scales'] [--eval file.js]
 *                                    [--seed file.js] [--shot out.png]
 *                                    [--width 1280] [--height 900] [--wait 3500]
 *                                    [--reload N]
 * Requires a static server on the base URL (default http://localhost:8080)
 * and google-chrome on PATH.
 *
 * Start the server in another terminal:
 *   python3 -m http.server 8080
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const args = process.argv.slice(2);
function flag(name, fallback = null) {
  const i = args.indexOf('--' + name);
  if (i === -1 || i + 1 >= args.length) return fallback;
  return args[i + 1];
}

const PORT = Number(process.env.PORT || 8080);
const BASE = `http://localhost:${PORT}`;
const CDP_PORT = Number(process.env.APPCHECK_CDP_PORT || 9340);
const HASH = flag('hash', '');
const WAIT_MS = Number(flag('wait', 4000));
const WIDTH = Number(flag('width', 1280));
const HEIGHT = Number(flag('height', 900));
const SEED_FILE = flag('seed');
const EVAL_FILE = flag('eval');
const SHOT = flag('shot');
const RELOAD_COUNT = Number(flag('reload', 0));

/** Console messages that the app already emits and that carry no defect. */
const IGNORE_PATTERNS = [
  /favicon/i,
  /Failed to load resource.*sw\.js/i,
  /The AudioContext was not allowed to start/i,
  /cloud sync is optional/i,
  /chrome-extension/i,
  // The repo ships cloud-config.example.json only. Cloud sync stays optional.
  /cloud-config\.json/i,
];

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function checkServer() {
  try {
    const res = await fetch(BASE, { method: 'GET' });
    return res.ok || res.status < 500;
  } catch (e) { return false; }
}

if (!(await checkServer())) {
  console.error('appcheck: static server is not reachable at ' + BASE);
  console.error('Start the server from the repository root: python3 -m http.server 8080');
  process.exit(1);
}

const profile = mkdtempSync(join(tmpdir(), 'musi-appcheck-'));
const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--autoplay-policy=no-user-gesture-required',
  `--window-size=${WIDTH},${HEIGHT}`,
  `--user-data-dir=${profile}`, `--remote-debugging-port=${CDP_PORT}`, 'about:blank',
], { stdio: 'ignore' });

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

function makeRpc(ws, onEvent) {
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
      return;
    }
    if (msg.method) onEvent(msg);
  };
  return function send(method, params = {}, sessionId) {
    const id = next++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  };
}

const problems = [];
const logs = [];

function record(text, level) {
  if (!text) return;
  if (IGNORE_PATTERNS.some((re) => re.test(text))) return;
  logs.push(`[${level}] ${text}`);
  if (level === 'error' || level === 'exception') problems.push(`[${level}] ${text}`);
}

let exitCode = 0;
try {
  const ws = await connect(await endpoint());
  const send = makeRpc(ws, (msg) => {
    if (msg.method === 'Runtime.consoleAPICalled') {
      const p = msg.params || {};
      const text = (p.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ');
      record(text, p.type === 'error' ? 'error' : p.type === 'warning' ? 'warning' : 'log');
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params?.exceptionDetails || {};
      record(d.exception?.description || d.text || 'unknown exception', 'exception');
    }
    if (msg.method === 'Log.entryAdded') {
      const e = msg.params?.entry || {};
      record(`${e.text || ''} ${e.url || ''}`.trim(), e.level === 'error' ? 'error' : 'warning');
    }
  });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId);
  await send('Log.enable', {}, sessionId);
  await send('Page.enable', {}, sessionId);

  // A seed snippet must run on the app origin, but the app must not boot yet.
  // A boot would record every migration id before the seed data exists.
  if (SEED_FILE) {
    await send('Page.navigate', { url: BASE + '/tests/appcheck/seed.html' }, sessionId);
    await sleep(800);
    const seed = readFileSync(SEED_FILE, 'utf8');
    const res = await send('Runtime.evaluate', {
      expression: `(function(){ ${seed} })()`,
      returnByValue: true, awaitPromise: true,
    }, sessionId);
    if (res?.exceptionDetails) {
      problems.push('[seed] ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text));
    } else if (res?.result?.value !== undefined) {
      console.log('seed result: ' + JSON.stringify(res.result.value));
    }
    logs.length = 0;
    problems.length = 0;
  }

  await send('Page.navigate', { url: BASE + '/' + HASH }, sessionId);
  await sleep(WAIT_MS);

  for (let i = 0; i < RELOAD_COUNT; i += 1) {
    await send('Page.navigate', { url: BASE + '/' + HASH }, sessionId);
    await sleep(WAIT_MS);
  }

  const boot = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      activeSection: (document.querySelector('.section.active') || {}).id || null,
      hash: location.hash,
      title: document.title,
    })`,
    returnByValue: true,
  }, sessionId);
  console.log('boot state: ' + (boot?.result?.value || 'unknown'));

  if (EVAL_FILE) {
    const code = readFileSync(EVAL_FILE, 'utf8');
    const res = await send('Runtime.evaluate', {
      expression: `(function(){ ${code} })()`,
      returnByValue: true, awaitPromise: true,
    }, sessionId);
    if (res?.exceptionDetails) {
      problems.push('[eval] ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text));
    } else {
      console.log('eval result: ' + JSON.stringify(res?.result?.value, null, 2));
    }
  }

  if (SHOT) {
    const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    if (shot?.data) {
      mkdirSync(dirname(SHOT), { recursive: true });
      writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
      console.log('screenshot: ' + SHOT);
    }
  }

  await send('Target.closeTarget', { targetId });

  if (logs.length) {
    console.log('--- console ---');
    logs.forEach((l) => console.log(l));
  }
  if (problems.length) {
    console.log('--- problems ---');
    problems.forEach((p) => console.log(p));
    console.log(`appcheck: FAIL (${problems.length} problem(s))`);
    exitCode = 1;
  } else {
    console.log('appcheck: PASS (no console error and no exception)');
  }
} catch (err) {
  console.error('appcheck: harness error: ' + (err?.message || err));
  exitCode = 1;
} finally {
  try { chrome.kill('SIGKILL'); } catch (e) { /* already gone */ }
  try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}

process.exit(exitCode);
