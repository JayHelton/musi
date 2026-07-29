#!/usr/bin/env node
/**
 * Build printable HTML, JSON data export, and PDF.
 *
 * Usage:
 *   node scripts/generate.mjs
 *   node scripts/generate.mjs --deck=minimal
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { SHAPES } from '../data/shapes.js';
import { filterShapes, renderCardHTML } from '../src/render.js';
import { validateAll, patternString, minRootFret } from '../src/validate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dist = join(root, 'dist');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = 'true'] = a.replace(/^--/, '').split('=');
    return [k, v];
  })
);

const deck = args.deck || 'all'; // all | minimal

mkdirSync(dist, { recursive: true });

const { failed, ok } = validateAll(SHAPES);
if (!ok) {
  console.error('Validation failed — refusing to generate.');
  failed.forEach((f) => console.error(f.id, f.errors));
  process.exit(1);
}

const shapes = filterShapes(SHAPES, { deck: deck === 'minimal' ? 'minimal' : 'all' });

// --- JSON export (full library, maintainable) ---
const jsonShapes = SHAPES.map((s) => ({
  ...s,
  pattern: patternString(s.frets),
  minRootFret: minRootFret(s.frets),
}));
writeFileSync(join(dist, 'shapes.json'), JSON.stringify({ version: 1, shapes: jsonShapes }, null, 2));
writeFileSync(join(root, 'data', 'shapes.json'), JSON.stringify({ version: 1, shapes: jsonShapes }, null, 2));

// --- Printable HTML ---
const cards = shapes
  .map((s) => renderCardHTML(s, { showIntervals: true, showFingering: false }))
  .join('\n');

const css = readFileSync(resolve(root, 'css/cards.css'), 'utf8');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Musi Movable Chord Cards${deck === 'minimal' ? ' — Minimal Deck' : ''}</title>
  <style>${css}</style>
</head>
<body class="print-doc">
  <h1 class="print-title">Musi — Movable Chord Reference Cards${deck === 'minimal' ? ' (Minimal)' : ''}</h1>
  <p class="print-sub">${shapes.length} closed / root-relative shapes · Standard + Drop · No open strings · US Letter, 2×2 per page</p>
  <main class="card-grid">
${cards}
  </main>
</body>
</html>
`;

const htmlName = deck === 'minimal' ? 'printable-minimal.html' : 'printable.html';
const htmlOut = join(dist, htmlName);
writeFileSync(htmlOut, html);
console.log(`Wrote ${htmlOut} (${shapes.length} cards)`);

// --- PDF via headless Chrome ---
const pdfName = deck === 'minimal' ? 'chord-cards-minimal.pdf' : 'chord-cards.pdf';
const pdfOut = join(dist, pdfName);
const fileUrl = `file://${htmlOut}`;

const chromeCandidates = [
  process.env.CHROME_PATH,
  'google-chrome',
  'chromium',
  'chromium-browser',
].filter(Boolean);

let printed = false;
for (const bin of chromeCandidates) {
  const result = spawnSync(
    bin,
    [
      '--headless=new',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--no-sandbox',
      '--no-pdf-header-footer',
      `--print-to-pdf=${pdfOut}`,
      fileUrl,
    ],
    { encoding: 'utf8', timeout: 90000 }
  );
  if (result.status === 0 && existsSync(pdfOut)) {
    console.log(`Wrote ${pdfOut}`);
    printed = true;
    break;
  }
  if (result.error && result.error.code === 'ENOENT') continue;
  if (result.error && result.error.code === 'ETIMEDOUT') {
    console.warn(`Chrome (${bin}) timed out`);
    continue;
  }
  if (result.status !== 0) {
    console.warn(`Chrome (${bin}) failed:`, result.stderr || result.stdout);
  }
}

if (!printed) {
  console.warn('PDF not generated — open the HTML and use Print → Save as PDF.');
}

console.log('Done.');
