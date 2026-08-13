/**
 * Browser harness helper for gp-player audio measurement pages.
 *
 * Contract:
 * - Serve each page over HTTP from the repository root.
 * - Write all output into the #out element.
 * - End with one line: "RESULT: PASS" or "RESULT: FAIL".
 * - A driver reads #out text and checks the RESULT line.
 * - A driver may also read window.__harnessResult.
 *
 * Exports:
 * - writeln(line) — append one line to #out.
 * - printTable(rows, columns) — print a fixed-width table into #out.
 * - reportResult(pass) — write the RESULT line and set window.__harnessResult.
 * - runMain(fn) — run an async main function and report FAIL on error.
 */

function outEl() {
  let el = document.getElementById('out');
  if (!el) {
    el = document.createElement('div');
    el.id = 'out';
    document.body.appendChild(el);
  }
  return el;
}

/** Append one line to #out. */
export function writeln(line = '') {
  const el = outEl();
  const cur = el.textContent || '';
  el.textContent = cur ? `${cur}\n${line}` : String(line);
}

/**
 * Print a fixed-width text table into #out.
 * @param {object[]} rows
 * @param {{ key: string, label?: string, width?: number }[]} columns
 */
export function printTable(rows, columns) {
  if (!Array.isArray(rows) || rows.length === 0 || !Array.isArray(columns) || columns.length === 0) {
    writeln('(empty table)');
    return;
  }

  const cols = columns.map((col) => {
    const label = String(col.label ?? col.key);
    const widths = rows.map((row) => String(row[col.key] ?? '').length);
    const width = col.width ?? Math.max(label.length, ...widths);
    return { key: col.key, label, width };
  });

  const header = cols.map((col) => col.label.padEnd(col.width)).join('  ');
  const rule = cols.map((col) => '-'.repeat(col.width)).join('  ');
  writeln(header);
  writeln(rule);
  for (const row of rows) {
    const line = cols.map((col) => String(row[col.key] ?? '').padEnd(col.width)).join('  ');
    writeln(line);
  }
}

/**
 * Print the final RESULT line and set window.__harnessResult.
 * @param {boolean} pass
 */
export function reportResult(pass) {
  const value = pass ? 'PASS' : 'FAIL';
  window.__harnessResult = value;
  writeln(`RESULT: ${value}`);
}

/**
 * Run an async main function.
 * On error, print the message and report FAIL.
 * @param {() => Promise<void>} fn
 */
export async function runMain(fn) {
  try {
    await fn();
  } catch (err) {
    writeln(String(err?.message || err));
    reportResult(false);
  }
}
