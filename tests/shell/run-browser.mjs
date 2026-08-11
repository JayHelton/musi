/**
 * Permanent shell browser regression suite (headless Chrome over CDP).
 *
 * Usage: node tests/shell/run-browser.mjs [baseUrl]
 * Requires a static server on the base URL (default http://localhost:8080)
 * and google-chrome on PATH.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LEGACY_ROUTES } from '../../js/routes.js';

const BASE = process.argv[2] || 'http://localhost:8080';
const PORT = 9340;
const TIMEOUT_MS = 240000;

const VIEWPORTS = [
  { name: '360x800 portrait', width: 360, height: 800, mobile: true },
  { name: '800x500 landscape', width: 800, height: 500, mobile: true },
  { name: '768 tablet', width: 768, height: 1024, mobile: true },
  { name: '1366x768', width: 1366, height: 768, mobile: false },
  { name: '2560x1080', width: 2560, height: 1080, mobile: false },
];

const HOME_FORBIDDEN_MODULES = [
  '/js/workspaces/train.js',
  '/js/workspaces/study.js',
  '/js/workspaces/create.js',
];

const CANONICAL_ROUTE_CHECKS = [
  ['#home', { sectionId: 'sec-home' }],
  ['#train/today', { workspace: true }],
  ['#train/plans', { sectionId: 'sec-routines' }],
  ['#train/library', { sectionId: 'sec-exercises' }],
  ['#train/fundamentals?drill=scales', { sectionId: 'sec-scales' }],
  ['#train/progress', { workspace: true }],
  ['#study/learn', { selector: '.study-learn' }],
  ['#study/explore?view=chords', { sectionId: 'sec-chords' }],
  ['#study/review', { workspace: true }],
  ['#create/projects', { selector: '.create-projects-layout' }],
  ['#create/capture', { sectionId: 'sec-recorder' }],
  ['#create/compose', { sectionId: 'sec-chords' }],
  ['#settings', { sectionId: 'sec-musicprefs' }],
];

const INJECT = `
window.__musiTest = {
  consoleErrors: [],
  getUserMediaCalls: 0,
};
const origError = console.error.bind(console);
console.error = (...args) => {
  window.__musiTest.consoleErrors.push(args.map(String).join(' '));
  origError(...args);
};
window.addEventListener('error', (e) => {
  window.__musiTest.consoleErrors.push(String(e.message || e.error || 'error'));
});
window.addEventListener('unhandledrejection', (e) => {
  window.__musiTest.consoleErrors.push(String(e.reason || 'rejection'));
});
if (navigator.mediaDevices) {
  const orig = navigator.mediaDevices.getUserMedia?.bind(navigator.mediaDevices);
  if (orig) {
    navigator.mediaDevices.getUserMedia = (...args) => {
      window.__musiTest.getUserMediaCalls += 1;
      return Promise.reject(new Error('getUserMedia stubbed in tests'));
    };
  }
}
`;

const profile = mkdtempSync(join(tmpdir(), 'musi-shell-cdp-'));
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
    } catch (e) { /* not ready */ }
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
  const loadWaiters = [];

  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.method === 'Page.loadEventFired') {
      for (const resolve of loadWaiters) resolve();
      loadWaiters.length = 0;
    }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  };

  function send(method, params = {}, sessionId) {
    const id = next++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }

  function waitForLoadEvent(timeoutMs = 30000) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const idx = loadWaiters.indexOf(onLoad);
        if (idx !== -1) loadWaiters.splice(idx, 1);
        resolve(false);
      }, timeoutMs);
      const onLoad = () => {
        clearTimeout(timer);
        resolve(true);
      };
      loadWaiters.push(onLoad);
    });
  }

  return { send, waitForLoadEvent };
}

async function evalPage(send, sessionId, expression, awaitPromise = false) {
  const res = await send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
  }, sessionId);
  if (res.exceptionDetails) {
    const text = res.exceptionDetails.exception?.description
      || res.exceptionDetails.text
      || JSON.stringify(res.exceptionDetails);
    throw new Error(text);
  }
  return res.result?.value;
}

async function tryEvalPage(send, sessionId, expression, awaitPromise = false) {
  try {
    const res = await send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
    }, sessionId);
    if (res.exceptionDetails) return null;
    return res.result?.value;
  } catch (e) {
    return null;
  }
}

const APP_READY_EXPR = `
  (function() {
    const doc = document;
    if (!doc || !doc.documentElement) return false;
    const root = doc.getElementById('workspace-root');
    if (!root) return false;
    const splash = doc.getElementById('boot-splash');
    const html = doc.documentElement;
    const booting = html.classList && html.classList.contains('booting');
    return !booting || !splash || splash.hidden !== false;
  })()
`;

const DOCUMENT_READY_EXPR = `
  (function() {
    const doc = document;
    if (!doc || !doc.documentElement) return false;
    const rs = doc.readyState;
    return rs === 'interactive' || rs === 'complete';
  })()
`;

async function waitForDocument(send, sessionId, rpc, timeoutMs = 30000) {
  const started = Date.now();
  const loadPromise = rpc.waitForLoadEvent(timeoutMs);
  while (Date.now() - started < timeoutMs) {
    const ready = await tryEvalPage(send, sessionId, DOCUMENT_READY_EXPR);
    if (ready) return;
    await Promise.race([sleep(50), loadPromise]);
    const readyAfter = await tryEvalPage(send, sessionId, DOCUMENT_READY_EXPR);
    if (readyAfter) return;
  }
  throw new Error('page document did not load within 30s');
}

async function waitForApp(send, sessionId) {
  const started = Date.now();
  while (Date.now() - started < 30000) {
    const ready = await tryEvalPage(send, sessionId, APP_READY_EXPR);
    if (ready) return;
    await sleep(250);
  }
  throw new Error('app did not become ready within 30s');
}

async function checkStaticServer(baseUrl) {
  const url = baseUrl.replace(/\/$/, '') + '/';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (e) {
    const detail = e && e.message ? e.message : String(e);
    throw new Error(
      `Cannot reach static server at ${baseUrl} (${detail}). `
      + 'Start one from the repo root: python3 -m http.server 8080',
    );
  }
}

async function navigateHash(send, sessionId, hash) {
  await evalPage(send, sessionId, `location.hash = ${JSON.stringify(hash)}; true`);
  await sleep(600);
  await waitForApp(send, sessionId);
}

async function clearTestErrors(send, sessionId) {
  await evalPage(send, sessionId, 'window.__musiTest.consoleErrors = []; true');
}

async function testErrors(send, sessionId) {
  const errors = await evalPage(send, sessionId, 'window.__musiTest.consoleErrors.slice()');
  const filtered = (errors || []).filter((e) => !/getUserMedia stubbed/.test(e));
  if (filtered.length) throw new Error(`console errors: ${filtered.join(' | ')}`);
}

const results = [];

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    process.stdout.write(`ok  ${name}\n`);
  } catch (e) {
    results.push({ name, ok: false, detail: e.message });
    process.stdout.write(`not ok  ${name}\n       ${e.message}\n`);
  }
}

let failures = 0;
try {
  await checkStaticServer(BASE);

  const ws = await connect(await endpoint());
  const rpc = makeRpc(ws);
  const { send } = rpc;
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });

  await send('Page.addScriptToEvaluateOnNewDocument', { source: INJECT }, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Page.enable', {}, sessionId);
  await send('Page.navigate', { url: BASE + '/' }, sessionId);
  await waitForDocument(send, sessionId, rpc);
  await waitForApp(send, sessionId);

  await check('cold Home stylesheet count is reduced', async () => {
    const count = await evalPage(send, sessionId, `
      performance.getEntriesByType('resource').filter(e => /\\.css(\\?|$)/.test(e.name)).length
    `);
    if (count > 22) throw new Error(`expected <=22 CSS requests on Home, got ${count}`);
  });

  await check('Home does not load objective workspace or feature modules', async () => {
    const hits = await evalPage(send, sessionId, `
      performance.getEntriesByType('resource')
        .map(e => e.name)
        .filter(u => ${JSON.stringify(HOME_FORBIDDEN_MODULES)}.some(s => u.includes(s)))
    `);
    if (hits?.length) throw new Error(`eager loads: ${hits.join(', ')}`);
  });

  await check('dock has exactly four destinations and no Tools', async () => {
    const info = await evalPage(send, sessionId, `
      (function() {
        const dests = [...document.querySelectorAll('.dock-dest')].map(b => b.textContent.trim());
        const tools = [...document.querySelectorAll('.dock-dest,.dock-cat-btn,.dock-menu-item')]
          .map(el => el.textContent.trim())
          .filter(t => /tools/i.test(t));
        return { dests, tools };
      })()
    `);
    if (info.dests.length !== 4) throw new Error(`expected 4 dock items, got ${info.dests.join(', ')}`);
    const labels = info.dests.join(' ').toLowerCase();
    for (const want of ['home', 'train', 'study', 'create']) {
      if (!labels.includes(want)) throw new Error(`missing dock label ${want}`);
    }
    if (info.tools.length) throw new Error(`Tools destination found: ${info.tools.join(', ')}`);
  });

  await check('Settings reachable from application menu', async () => {
    await navigateHash(send, sessionId, '#home');
    await clearTestErrors(send, sessionId);
    await evalPage(send, sessionId, `
      document.getElementById('app-menu-btn').click();
      [...document.querySelectorAll('.app-menu-item')].find(b => b.dataset.route === '#settings').click();
      true
    `);
    await sleep(500);
    await waitForApp(send, sessionId);
    const hash = await evalPage(send, sessionId, 'location.hash');
    if (hash !== '#settings') throw new Error(`expected #settings, got ${hash}`);
    const hasPrefs = await evalPage(send, sessionId, `!!document.querySelector('#workspace-root #sec-musicprefs')`);
    if (!hasPrefs) throw new Error('settings section not in workspace');
    await testErrors(send, sessionId);
  });

  await check('features.enabled cleared still leaves destinations and Settings', async () => {
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try { const s = JSON.parse(localStorage.getItem('musi:settings')||'{}'); s['features.enabled']=[]; localStorage.setItem('musi:settings', JSON.stringify(s)); } catch(e) {}`,
    }, sessionId);
    await send('Page.navigate', { url: BASE + '/#home' }, sessionId);
    await waitForDocument(send, sessionId, rpc);
    await waitForApp(send, sessionId);
    const destCount = await evalPage(send, sessionId, 'document.querySelectorAll(".dock-dest").length');
    if (destCount !== 4) throw new Error(`dock count ${destCount}`);
    await evalPage(send, sessionId, `document.getElementById('app-menu-btn').click(); true`);
    const menuOk = await evalPage(send, sessionId, `!!document.querySelector('.app-menu-item[data-route="#settings"]')`);
    if (!menuOk) throw new Error('settings menu item missing');
  });

  await check('microphone not requested without user action during navigation', async () => {
    await evalPage(send, sessionId, 'window.__musiTest.getUserMediaCalls = 0; true');
    await navigateHash(send, sessionId, '#home');
    await navigateHash(send, sessionId, '#train/today');
    await navigateHash(send, sessionId, '#study/learn');
    await navigateHash(send, sessionId, '#create/projects');
    await navigateHash(send, sessionId, '#home');
    const calls = await evalPage(send, sessionId, 'window.__musiTest.getUserMediaCalls');
    if (calls !== 0) throw new Error(`getUserMedia called ${calls} times`);
  });

  for (const [hash, expect] of CANONICAL_ROUTE_CHECKS) {
    await check(`canonical route ${hash}`, async () => {
      await clearTestErrors(send, sessionId);
      await navigateHash(send, sessionId, hash);
      const current = await evalPage(send, sessionId, 'location.hash');
      if (current !== hash) throw new Error(`hash is ${current}, expected ${hash}`);
      const root = await evalPage(send, sessionId, `!!document.getElementById('workspace-root')`);
      if (!root) throw new Error('missing #workspace-root');
      if (expect.sectionId) {
        const has = await evalPage(send, sessionId, `!!document.querySelector('#workspace-root #${expect.sectionId}')`);
        if (!has) throw new Error(`missing #${expect.sectionId} in workspace`);
      }
      if (expect.selector) {
        const has = await evalPage(send, sessionId, `!!document.querySelector('#workspace-root ${expect.selector}')`);
        if (!has) throw new Error(`missing ${expect.selector} in workspace`);
      }
      if (expect.workspace) {
        const len = await evalPage(send, sessionId, 'document.getElementById("workspace-root")?.innerHTML?.length || 0');
        if (!len) throw new Error('workspace empty');
      }
      await testErrors(send, sessionId);
    });
  }

  for (const [legacyKey, canonical] of Object.entries(LEGACY_ROUTES)) {
    if (legacyKey === '') continue;
    await check(`legacy #${legacyKey} → ${canonical}`, async () => {
      await clearTestErrors(send, sessionId);
      const input = legacyKey.startsWith('hub-') || legacyKey === 'home' ? legacyKey : legacyKey;
      await navigateHash(send, sessionId, input.startsWith('#') ? input : `#${input}`);
      const hash = await evalPage(send, sessionId, 'location.hash');
      if (hash !== canonical) throw new Error(`got ${hash}, expected ${canonical}`);
      const root = await evalPage(send, sessionId, 'document.getElementById("workspace-root")?.innerHTML?.length || 0');
      if (!root) throw new Error('workspace empty');
      await testErrors(send, sessionId);
    });
  }

  await check('browser Back walks Home → objective → view without loops', async () => {
    await navigateHash(send, sessionId, '#home');
    await navigateHash(send, sessionId, '#train');
    await navigateHash(send, sessionId, '#train/library');
    const h1 = await evalPage(send, sessionId, 'location.hash');
    await evalPage(send, sessionId, 'history.back(); true');
    await sleep(400);
    const h2 = await evalPage(send, sessionId, 'location.hash');
    await evalPage(send, sessionId, 'history.back(); true');
    await sleep(400);
    const h3 = await evalPage(send, sessionId, 'location.hash');
    if (h1 === h2 || h2 === h3) throw new Error(`back stack stuck: ${h1} -> ${h2} -> ${h3}`);
    if (h3 !== '#home' && h3 !== '#train') throw new Error(`unexpected terminus ${h3}`);
  });

  await check('Back with utility panel open closes panel', async () => {
    await navigateHash(send, sessionId, '#train/today');
    await navigateHash(send, sessionId, '#train?panel=practice');
    const withPanel = await evalPage(send, sessionId, 'location.hash');
    if (!withPanel.includes('panel=practice')) throw new Error(`panel not open: ${withPanel}`);
    await evalPage(send, sessionId, 'history.back(); true');
    await sleep(500);
    const after = await evalPage(send, sessionId, 'location.hash');
    if (after.includes('panel=practice')) throw new Error(`panel still open after back: ${after}`);
    const stillTrain = await evalPage(send, sessionId, 'location.hash.startsWith("#train")');
    if (!stillTrain) throw new Error(`left train workspace: ${after}`);
  });

  await check('single metronome across Train navigation', async () => {
    await navigateHash(send, sessionId, '#train/today');
    await evalPage(send, sessionId, `
      import('/js/practice/practiceSession.js').then(async (m) => {
        m.endSession?.();
        m.startSession({ sourceType: 'free', sourceId: 'test', metronome: { playing: true, bpm: 100 } });
        return true;
      })
    `, true);
    await sleep(300);
    await navigateHash(send, sessionId, '#train/fundamentals?drill=scales');
    await sleep(400);
    await navigateHash(send, sessionId, '#train/plans');
    await sleep(400);
    const playingCount = await evalPage(send, sessionId, `
      import('/js/practice/practiceSession.js').then(async (m) => {
        const session = m.getSession();
        const metroMod = await import('/js/metronome.js');
        const driverPlaying = typeof metroMod.isPlaying === 'function' ? metroMod.isPlaying() : false;
        const sessionPlaying = !!session?.metronome?.playing;
        return (driverPlaying ? 1 : 0) + (sessionPlaying ? 1 : 0);
      })
    `, true);
    if (playingCount !== 1) throw new Error(`expected exactly one metronome owner, score ${playingCount}`);
    await evalPage(send, sessionId, `import('/js/practice/practiceSession.js').then(m => { m.endSession(); return true; })`, true);
  });

  for (const vp of VIEWPORTS) {
    await check(`responsive layout ${vp.name}`, async () => {
      await send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.mobile,
      }, sessionId);
      await navigateHash(send, sessionId, '#train/today');
      const layout = await evalPage(send, sessionId, `
        (function() {
          const dock = document.getElementById('nav');
          const tabs = document.querySelector('#workspace-root .workspace-tabs');
          const dockRect = dock?.getBoundingClientRect();
          const tabsRect = tabs?.getBoundingClientRect();
          const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
          const minPx = 44;
          const targets = [...document.querySelectorAll('.dock-dest, .workspace-tab')];
          const small = targets.filter(el => {
            const cs = getComputedStyle(el);
            const w = Math.max(el.getBoundingClientRect().width, parseFloat(cs.minWidth) || 0);
            const h = Math.max(el.getBoundingClientRect().height, parseFloat(cs.minHeight) || 0);
            return w + 0.5 < minPx || h + 0.5 < minPx;
          }).map(el => el.className);
          const dockOnScreen = dockRect && dockRect.bottom <= window.innerHeight + 1 && dockRect.top >= -1;
          const tabsOnScreen = !tabs || (tabsRect && tabsRect.bottom <= window.innerHeight + 1 && tabsRect.top >= -1);
          return { overflow, small, dockOnScreen, tabsOnScreen };
        })()
      `);
      if (layout.overflow) throw new Error('horizontal overflow');
      if (!layout.dockOnScreen) throw new Error('dock off screen');
      if (!layout.tabsOnScreen) throw new Error('workspace tabs off screen');
      if (layout.small.length) throw new Error(`undersized targets: ${layout.small.join(', ')}`);
    });
  }

  await send('Target.closeTarget', { targetId });
  ws.close();
} catch (e) {
  process.stdout.write(`driver error: ${e.message}\n${e.stack || ''}\n`);
  failures++;
}

finally {
  chrome.kill('SIGKILL');
  try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* best effort */ }
}

failures += results.filter((r) => !r.ok).length;
const passed = results.filter((r) => r.ok).length;
process.stdout.write(`\n# tests ${results.length}\n# pass ${passed}\n# fail ${failures}\n`);
process.exit(failures ? 1 : 0);
