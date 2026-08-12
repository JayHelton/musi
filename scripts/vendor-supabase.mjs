#!/usr/bin/env node
/**
 * Vendors the Supabase JavaScript client into `js/vendor/supabase-js.esm.js`.
 *
 * Musi ships as static files with no build step, and the app must work offline.
 * The client therefore cannot come from a CDN at runtime. This script makes one
 * self-contained ES module and writes it into the repository. Run it by hand
 * when you want a new client version. It needs network access and npm.
 *
 * Usage:
 *   node scripts/vendor-supabase.mjs                 # use the pinned versions
 *   node scripts/vendor-supabase.mjs --version 2.99.0
 *   node scripts/vendor-supabase.mjs --keep-temp     # keep the build directory
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPABASE_JS_VERSION = '2.112.3';
const ESBUILD_VERSION = '0.28.2';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_BUNDLE = path.join(REPO_ROOT, 'js', 'vendor', 'supabase-js.esm.js');
const OUT_SIDECAR = path.join(REPO_ROOT, 'js', 'vendor', 'supabase-js.version.json');

// Musi uses only these entry points. A short list keeps the bundle small.
const ENTRY_SOURCE = `export {
  createClient,
  SupabaseClient,
  FunctionsHttpError,
  FunctionsRelayError,
  FunctionsFetchError,
} from '@supabase/supabase-js';
`;

function parseArgs(argv) {
  const args = { version: SUPABASE_JS_VERSION, keepTemp: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--keep-temp') args.keepTemp = true;
    else if (arg === '--version') args.version = argv[++i];
    else if (arg.startsWith('--version=')) args.version = arg.slice('--version='.length);
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!args.version) throw new Error('--version needs a value.');
  return args;
}

function run(command, commandArgs, cwd) {
  execFileSync(command, commandArgs, { cwd, stdio: 'inherit' });
}

function header(version, esbuildVersion) {
  return `/**
 * Supabase JavaScript client ${version} — vendored bundle. Do not edit by hand.
 *
 * Source:    npm @supabase/supabase-js@${version}
 * Bundler:   esbuild ${esbuildVersion} (--bundle --format=esm --platform=browser --target=es2020 --minify)
 * Generator: scripts/vendor-supabase.mjs
 *
 * Only js/cloud/client.js may import this file.
 */
`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'musi-vendor-supabase-'));
  console.log(`Build directory: ${tempDir}`);

  try {
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      `${JSON.stringify({ name: 'musi-vendor-supabase', private: true, type: 'module' }, null, 2)}\n`,
    );
    fs.writeFileSync(path.join(tempDir, 'entry.mjs'), ENTRY_SOURCE);

    console.log(`Install @supabase/supabase-js@${args.version} and esbuild@${ESBUILD_VERSION}.`);
    run('npm', [
      'install', '--no-audit', '--no-fund', '--silent',
      `@supabase/supabase-js@${args.version}`,
      `esbuild@${ESBUILD_VERSION}`,
    ], tempDir);

    const installedVersion = JSON.parse(fs.readFileSync(
      path.join(tempDir, 'node_modules', '@supabase', 'supabase-js', 'package.json'),
      'utf8',
    )).version;

    console.log('Bundle the client for the browser.');
    run(path.join(tempDir, 'node_modules', '.bin', 'esbuild'), [
      'entry.mjs',
      '--bundle',
      '--format=esm',
      '--platform=browser',
      '--target=es2020',
      '--legal-comments=none',
      '--minify',
      '--outfile=bundle.js',
    ], tempDir);

    const bundle = fs.readFileSync(path.join(tempDir, 'bundle.js'), 'utf8');

    // A leftover bare import would break the offline guarantee, so stop here.
    const bareImport = /(^|[;}\n])\s*import[\s{*"']/.exec(bundle);
    if (bareImport) {
      throw new Error('The bundle still has a top-level import. It is not self-contained.');
    }

    const contents = `${header(installedVersion, ESBUILD_VERSION)}${bundle}`;
    fs.mkdirSync(path.dirname(OUT_BUNDLE), { recursive: true });
    fs.writeFileSync(OUT_BUNDLE, contents);

    const sidecar = {
      package: '@supabase/supabase-js',
      version: installedVersion,
      esbuild: ESBUILD_VERSION,
      bytes: Buffer.byteLength(contents),
      sha256: createHash('sha256').update(contents).digest('hex'),
      generatedBy: 'scripts/vendor-supabase.mjs',
    };
    fs.writeFileSync(OUT_SIDECAR, `${JSON.stringify(sidecar, null, 2)}\n`);

    console.log(`Wrote ${path.relative(REPO_ROOT, OUT_BUNDLE)} (${sidecar.bytes} bytes).`);
    console.log(`Wrote ${path.relative(REPO_ROOT, OUT_SIDECAR)}.`);
    console.log('Next step: bump CACHE_VERSION in service-worker.js.');
  } finally {
    if (args.keepTemp) console.log(`Kept ${tempDir}.`);
    else fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main();
