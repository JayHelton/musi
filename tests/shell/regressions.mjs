/**
 * Pure-Node shell regressions. No browser is required.
 * Imported by tests/shell/run.mjs.
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { LEGACY_ROUTES } from '../../js/routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../..');

const REMOVED_TOOLS_EXPORTS = [
  'getCategory',
  'asTabs',
  'getTabs',
  'legacyGroupToCategory',
];

const FORBIDDEN_MARKUP = [
  'sec-hub-',
  'split-trigger',
  'home-all-panel',
  'dock-cat-btn',
];

function readText(path) {
  return readFileSync(join(root, path), 'utf8');
}

function listFiles(dir, ext, out = []) {
  const abs = join(root, dir);
  if (!existsSync(abs)) return out;
  for (const name of readdirSync(abs)) {
    const full = join(abs, name);
    const st = statSync(full);
    if (st.isDirectory()) listFiles(relative(root, full), ext, out);
    else if (!ext || full.endsWith(ext)) out.push(relative(root, full));
  }
  return out;
}

function extractPrecacheUrls(swSource) {
  const block = swSource.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/);
  assert.ok(block, 'PRECACHE_URLS block missing');
  const urls = [];
  const re = /"([^"]+)"/g;
  let m;
  while ((m = re.exec(block[1]))) urls.push(m[1]);
  return urls;
}

function extractStylesheetHrefs(html) {
  const hrefs = [];
  const re = /<link[^>]+rel=["']stylesheet["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (href) hrefs.push(href);
  }
  return hrefs;
}

function walkImports(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  const abs = join(root, file);
  if (!existsSync(abs)) return seen;
  const src = readFileSync(abs, 'utf8');
  const re = /from\s+['"](\.\/[^'"]+|\.\.\/[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    let target = m[1];
    if (!target.endsWith('.js')) target += '.js';
    const resolved = relative(root, join(dirname(abs), target));
    walkImports(resolved, seen);
  }
  return seen;
}

export function runShellRegressions() {
  const indexHtml = readText('index.html');
  const swSource = readText('service-worker.js');

  for (const needle of FORBIDDEN_MARKUP) {
    assert.ok(!indexHtml.includes(needle), `index.html must not contain ${needle}`);
  }

  for (const sym of REMOVED_TOOLS_EXPORTS) {
    const importRe = new RegExp(`import\\s*\\{[^}]*\\b${sym}\\b[^}]*\\}\\s*from\\s*['"]\\.\\/tools\\.js['"]`);
    const files = listFiles('js', '.js');
    for (const file of files) {
      const src = readText(file);
      assert.ok(!importRe.test(src), `${file} must not import removed ${sym} from tools.js`);
    }
  }

  const sheetHrefs = extractStylesheetHrefs(indexHtml);
  for (const href of sheetHrefs) {
    if (/^https?:\/\//i.test(href)) continue;
    const path = href.replace(/^\//, '');
    assert.ok(existsSync(join(root, path)), `missing stylesheet ${path} referenced by index.html`);
  }

  const precache = extractPrecacheUrls(swSource);
  for (const url of precache) {
    if (url.endsWith('/')) {
      const dirPath = join(root, url.replace(/^\.\//, ''));
      assert.ok(existsSync(dirPath), `precache directory missing: ${url}`);
      continue;
    }
    const path = url.replace(/^\.\//, '');
    assert.ok(existsSync(join(root, path)), `precache file missing: ${url}`);
  }

  for (const href of sheetHrefs) {
    if (/^https?:\/\//i.test(href)) continue;
    const normalized = href.replace(/^\//, '');
    assert.ok(
      precache.includes(normalized) || precache.includes(`./${normalized}`),
      `${normalized} must be in PRECACHE_URLS`,
    );
  }

  const lazySheets = [
    'css/songwriter.css', 'css/exercises.css', 'css/companions.css', 'css/workbooks.css',
    'css/routines.css', 'css/drums.css', 'css/chordworkout.css', 'css/notes.css',
    'css/practice.css', 'css/tabanalyzer.css', 'css/tracktosheet.css', 'css/gpplayer.css',
    'css/gpimport.css', 'css/intervalorbit.css', 'css/ux-chords-orbit.css', 'css/triads.css',
    'css/study-lab.css', 'css/sync.css', 'css/generators.css',
  ];
  for (const sheet of lazySheets) {
    assert.ok(precache.includes(sheet), `lazy tier ${sheet} must stay precached`);
  }

  assert.match(swSource, /v174-tsc-refactor/);

  const legacyKeys = Object.keys(LEGACY_ROUTES);
  assert.ok(legacyKeys.length > 0);

  const mainGraph = walkImports('js/main.js');
  assert.ok(mainGraph.has('js/ui/icons.js'));
  assert.ok(mainGraph.has('js/ui/featureStyles.js'));
  assert.ok(mainGraph.has('js/migrations/index.js'));
  assert.ok(!mainGraph.has('js/workspaces/train.js'));
  assert.ok(!mainGraph.has('js/workspaces/study.js'));
  assert.ok(!mainGraph.has('js/workspaces/create.js'));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runShellRegressions();
  console.log('ok  shell regressions');
}
