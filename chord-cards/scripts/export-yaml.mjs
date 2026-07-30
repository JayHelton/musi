#!/usr/bin/env node
/** Export shapes.json → shapes.yaml (minimal YAML writer, no deps). */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(root, 'data/shapes.json'), 'utf8'));

function dump(value, indent = 0) {
  const pad = '  '.repeat(indent);
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') {
    if (/^[\w.+#/()-]+$/.test(value) && !/^(true|false|null)$/i.test(value)) return value;
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    if (value.every((v) => v === null || typeof v !== 'object')) {
      return `[${value.map((v) => (v === null ? 'null' : dump(v))).join(', ')}]`;
    }
    return value.map((v) => `${pad}- ${dump(v, indent + 1).replace(/^\s+/, '')}`).join('\n');
  }
  const keys = Object.keys(value);
  if (!keys.length) return '{}';
  return keys
    .map((k) => {
      const v = value[k];
      const body = dump(v, indent + 1);
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        return `${pad}${k}:\n${body}`;
      }
      if (Array.isArray(v) && v.some((x) => x && typeof x === 'object')) {
        return `${pad}${k}:\n${body}`;
      }
      return `${pad}${k}: ${body}`;
    })
    .join('\n');
}

const yaml = `# Auto-generated from shapes.json — edit data/shapes.js then re-run generate\nversion: ${data.version}\nshapes:\n${data.shapes.map((s) => dump({ '-': null }) && `  - ${dump(s, 2).trimStart()}`).join('\n')}\n`;

// cleaner array-of-objects dump
const lines = ['# Auto-generated from shapes.json — edit data/shapes.js then re-run generate', `version: ${data.version}`, 'shapes:'];
for (const s of data.shapes) {
  lines.push('  - id: ' + dump(s.id));
  for (const [k, v] of Object.entries(s)) {
    if (k === 'id') continue;
    const body = dump(v, 2);
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      lines.push(`    ${k}:`);
      lines.push(body);
    } else {
      lines.push(`    ${k}: ${body}`);
    }
  }
}
writeFileSync(join(root, 'data/shapes.yaml'), lines.join('\n') + '\n');
writeFileSync(join(root, 'dist/shapes.yaml'), lines.join('\n') + '\n');
console.log('Wrote data/shapes.yaml');
