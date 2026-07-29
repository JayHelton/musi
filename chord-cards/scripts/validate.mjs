#!/usr/bin/env node
/**
 * Validate all chord shapes. Exit 1 on errors.
 * Usage: node scripts/validate.mjs
 */
import { SHAPES } from '../data/shapes.js';
import { validateAll, computeIntervals, patternString } from '../src/validate.js';

const { results, failed, warned, ok } = validateAll(SHAPES);

console.log(`Validated ${results.length} shapes.`);
console.log(`Errors: ${failed.length} | Warnings: ${warned.length}`);

for (const r of failed) {
  console.log(`\nFAIL ${r.id}`);
  r.errors.forEach((e) => console.log(`  E: ${e}`));
  r.warnings.forEach((w) => console.log(`  W: ${w}`));
  const shape = SHAPES.find((s) => s.id === r.id);
  if (shape) {
    console.log(`  pattern: ${patternString(shape.frets)}`);
    console.log(`  labels:  ${shape.intervals.map((x) => x ?? 'x').join(' ')}`);
    const comp = computeIntervals(shape.frets, shape.rootString, shape.tuningType);
    console.log(
      `  pcs:     ${comp.map((c) => (c ? c.pc : 'x')).join(' ')}`
    );
  }
}

if (!failed.length) {
  for (const r of warned) {
    if (!r.warnings.length) continue;
    console.log(`\nWARN ${r.id}`);
    r.warnings.forEach((w) => console.log(`  W: ${w}`));
  }
}

process.exit(ok ? 0 : 1);
