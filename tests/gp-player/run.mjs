/**
 * Zero-dependency Node runner for gp-player tests.
 * Run: node tests/gp-player/run.mjs
 */

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASELINE = [
  'smoke.mjs',
  'wiring.mjs',
  'metronome.mjs',
  'metro-click.mjs',
  'loop-playback.mjs',
  'exercise-slice.mjs',
  'exercise-import.mjs',
  'exercise-import-ui.mjs',
  'drum-parsing.mjs',
  'drum-notation.mjs',
];

const SKIP = new Set(['domShim.mjs', 'run.mjs', 'run-browser.mjs', 'shot.mjs']);

function collectTests() {
  const topLevel = readdirSync(__dirname).filter((name) => name.endsWith('.mjs'));
  const runnable = topLevel.filter((name) => !SKIP.has(name));
  const baselineSet = new Set(BASELINE);
  const ordered = BASELINE.filter((name) => runnable.includes(name));
  const rest = runnable.filter((name) => !baselineSet.has(name)).sort();
  return [...ordered, ...rest];
}

const failed = [];

for (const file of collectTests()) {
  const path = join(__dirname, file);
  const result = spawnSync(process.execPath, [path], { stdio: 'inherit' });
  if (result.status !== 0) {
    failed.push(file);
  }
}

if (failed.length > 0) {
  console.error('gp-player suite failed:');
  for (const file of failed) {
    console.error(`  ${file}`);
  }
  process.exit(1);
}

console.log('gp-player suite: ok');
process.exit(0);
