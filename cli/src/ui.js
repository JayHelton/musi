import readline from 'node:readline';

const useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;

function wrap(code) {
  return (s) => (useColor ? `\u001b[${code}m${s}\u001b[0m` : String(s));
}

export const c = {
  reset: '\u001b[0m',
  bold: wrap('1'),
  dim: wrap('2'),
  red: wrap('31'),
  green: wrap('32'),
  yellow: wrap('33'),
  blue: wrap('34'),
  magenta: wrap('35'),
  cyan: wrap('36'),
  gray: wrap('90'),
  accent: wrap('38;5;39'),
  ok: wrap('38;5;42'),
  err: wrap('38;5;203'),
};

let rl = null;
let manualClose = false;
const lineQueue = [];
let lineWaiter = null;

function getRl() {
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('SIGINT', () => {
      console.log('\n' + c.gray('Bye! Keep practicing.'));
      process.exit(0);
    });
    // Buffer every line so none are dropped between prompts (important when
    // stdin is piped and several lines arrive in a single chunk).
    rl.on('line', (line) => {
      if (lineWaiter) {
        const w = lineWaiter;
        lineWaiter = null;
        w(line);
      } else {
        lineQueue.push(line);
      }
    });
    rl.on('close', () => {
      if (!manualClose) process.exit(0);
    });
  }
  return rl;
}

export function closeRl() {
  if (rl) {
    manualClose = true;
    rl.close();
    rl = null;
  }
}

export function ask(question) {
  getRl();
  if (question) process.stdout.write(question);
  return new Promise((resolve) => {
    if (lineQueue.length) {
      resolve(lineQueue.shift());
    } else {
      lineWaiter = resolve;
    }
  });
}

export function print(s = '') {
  console.log(s);
}

export function clear() {
  if (process.stdout.isTTY) process.stdout.write('\u001b[2J\u001b[0;0H');
}

export function banner(title, subtitle) {
  const line = '─'.repeat(Math.max(title.length, (subtitle || '').length) + 4);
  print();
  print(c.accent(line));
  print(c.accent('  ' + c.bold(title)));
  if (subtitle) print(c.gray('  ' + subtitle));
  print(c.accent(line));
}

export function scoreLine({ right, total, streak }) {
  const pct = total ? Math.round((right / total) * 100) : 0;
  return c.gray(
    `Score ${c.bold(`${right}/${total}`)} (${pct}%)  ·  Streak ${c.bold(streak)}`
  );
}

export function correctMsg(extra) {
  return c.ok('✓ Correct!') + (extra ? '  ' + c.gray(extra) : '');
}

export function wrongMsg(extra) {
  return c.err('✗ Incorrect.') + (extra ? '  ' + c.gray(extra) : '');
}

/**
 * Present a numbered list of choices and return the chosen value.
 * Accepts a number, or a default (empty input) when provided.
 */
export async function choose(title, options, { defaultIndex = 0 } = {}) {
  print();
  if (title) print(c.bold(title));
  options.forEach((opt, i) => {
    const label = typeof opt === 'string' ? opt : opt.label;
    const mark = i === defaultIndex ? c.accent(' (default)') : '';
    print(`  ${c.cyan(String(i + 1).padStart(2))}. ${label}${mark}`);
  });
  while (true) {
    const raw = (await ask(c.gray('Choose a number (Enter for default): '))).trim();
    if (raw === '') {
      const opt = options[defaultIndex];
      return typeof opt === 'string' ? opt : opt.value;
    }
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 1 && n <= options.length) {
      const opt = options[n - 1];
      return typeof opt === 'string' ? opt : opt.value;
    }
    print(c.err('  Please enter a valid number.'));
  }
}

export const QUIT = Symbol('quit');

/**
 * Ask a quiz answer. Returns QUIT if the user wants to leave, or the raw input.
 * Recognizes shared control commands.
 */
export async function askAnswer(prompt, { onHint, onReplay, onReveal } = {}) {
  while (true) {
    const raw = (await ask(prompt)).trim();
    const cmd = raw.toLowerCase();
    if (cmd === 'q' || cmd === 'quit' || cmd === 'exit') return QUIT;
    if (cmd === 'h' && onHint) {
      onHint();
      continue;
    }
    if (cmd === 'r' && onReplay) {
      await onReplay();
      continue;
    }
    if ((cmd === 's' || cmd === '?') && onReveal) {
      onReveal();
      continue;
    }
    return raw;
  }
}
