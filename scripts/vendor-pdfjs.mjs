#!/usr/bin/env node
/**
 * Vendors pdf.js into `js/vendor/pdfjs/`.
 *
 * Musi ships as static files with no build step, and the app must work offline.
 * The PDF reader therefore cannot come from a CDN at runtime. This script
 * copies the files that js/pdfDocView.js needs out of the npm package and
 * writes them into the repository. Run it by hand when you want a new version.
 * It needs network access and npm.
 *
 * The script takes the "legacy" build. That build runs on the older browser
 * engines of phones and tablets, which the modern build does not.
 *
 * The cmaps of the package stay out. They only serve Chinese, Japanese, and
 * Korean text, and they add more than one megabyte.
 *
 * Usage:
 *   node scripts/vendor-pdfjs.mjs                 # use the pinned version
 *   node scripts/vendor-pdfjs.mjs --version 4.10.38
 *   node scripts/vendor-pdfjs.mjs --keep-temp     # keep the build directory
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PDFJS_VERSION = '4.10.38';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(REPO_ROOT, 'js', 'vendor', 'pdfjs');
const OUT_FONTS = path.join(OUT_DIR, 'standard_fonts');
const OUT_SIDECAR = path.join(OUT_DIR, 'pdfjs.version.json');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || i + 1 >= process.argv.length) return fallback;
  return process.argv[i + 1];
}

const version = arg('version', PDFJS_VERSION);
const keepTemp = process.argv.includes('--keep-temp');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'musi-pdfjs-'));

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function copyInto(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

try {
  console.log(`pdf.js ${version}: install into ${temp}`);
  fs.writeFileSync(path.join(temp, 'package.json'), JSON.stringify({
    name: 'musi-pdfjs-vendor', private: true, version: '1.0.0',
  }, null, 2));
  execFileSync('npm', ['install', '--no-audit', '--no-fund', `pdfjs-dist@${version}`], {
    cwd: temp, stdio: 'inherit',
  });

  const pkg = path.join(temp, 'node_modules', 'pdfjs-dist');
  const build = path.join(pkg, 'legacy', 'build');

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  copyInto(path.join(build, 'pdf.min.mjs'), path.join(OUT_DIR, 'pdf.mjs'));
  copyInto(path.join(build, 'pdf.worker.min.mjs'), path.join(OUT_DIR, 'pdf.worker.mjs'));
  copyInto(path.join(pkg, 'LICENSE'), path.join(OUT_DIR, 'LICENSE'));

  fs.mkdirSync(OUT_FONTS, { recursive: true });
  for (const name of fs.readdirSync(path.join(pkg, 'standard_fonts'))) {
    copyInto(path.join(pkg, 'standard_fonts', name), path.join(OUT_FONTS, name));
  }

  const real = JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8')).version;
  fs.writeFileSync(OUT_SIDECAR, `${JSON.stringify({
    name: 'pdfjs-dist',
    version: real,
    build: 'legacy/build (minified)',
    files: ['pdf.mjs', 'pdf.worker.mjs', 'standard_fonts/'],
    excluded: ['cmaps (CJK text only)', 'pdf.sandbox (forms only)'],
    source: 'https://www.npmjs.com/package/pdfjs-dist',
    license: 'Apache-2.0',
    sha256: {
      'pdf.mjs': sha256(path.join(OUT_DIR, 'pdf.mjs')),
      'pdf.worker.mjs': sha256(path.join(OUT_DIR, 'pdf.worker.mjs')),
    },
    vendoredBy: 'scripts/vendor-pdfjs.mjs',
  }, null, 2)}\n`);

  console.log(`pdf.js ${real}: written to js/vendor/pdfjs/`);
} finally {
  if (!keepTemp) fs.rmSync(temp, { recursive: true, force: true });
  else console.log(`kept ${temp}`);
}
