import { parseNote, NOTE_NAMES_SHARP, SCALES, getScaleNotes, ROOTS } from '../shared.js';
import { c, print, banner, choose, ask } from '../ui.js';
import { audioAvailable, playSequence } from '../audio.js';

// Labels for the degree-skip between played notes, mirroring the web Pitch
// tool: a skip of 1 walks the scale step by step; 2 walks in thirds (triads),
// and so on.
const STEP_LABELS = { 1: 'scale steps (2nds)', 2: 'thirds (triads)', 3: 'fourths', 4: 'fifths' };

const OCTAVE_MIN = 2;
const OCTAVE_MAX = 6;
const TEMPO_MIN = 30;
const TEMPO_MAX = 300;
const COUNT_MAX = 16;
const STEP_MAX = 4;

function ordinal(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return n + 'th';
  switch (n % 10) {
    case 1: return n + 'st';
    case 2: return n + 'nd';
    case 3: return n + 'rd';
    default: return n + 'th';
  }
}

function clampInt(raw, min, max, fallback) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function resolveScale(type) {
  if (!type) return 'Major (Ionian)';
  if (SCALES[type]) return type;
  // Allow case-insensitive matches so "dorian" resolves to "Dorian".
  const found = Object.keys(SCALES).find((n) => n.toLowerCase() === type.toLowerCase());
  return found || 'Major (Ionian)';
}

// Build semitone offsets (relative to the root) for the configured segment,
// wrapping across octaves as scale degrees run past one octave. This is a
// direct port of buildScaleSegment from js/vocalTrainer.js so the CLI plays
// exactly what the web Pitch tool plays.
function buildScaleSegment(def, startIdx, count, step) {
  const base = def.map((d) => d[1]);
  const n = base.length;
  const seq = [];
  for (let i = 0; i < count; i++) {
    const degree = startIdx + i * step;
    const oct = Math.floor(degree / n);
    const within = ((degree % n) + n) % n;
    seq.push({ semi: base[within] + 12 * oct, within });
  }
  return seq;
}

function midiToName(midi) {
  const oct = Math.floor(midi / 12) - 1;
  return NOTE_NAMES_SHARP[((midi % 12) + 12) % 12] + oct;
}

function describe(state, n) {
  const startDeg = Math.min(state.start, n);
  const stepLabel = STEP_LABELS[state.step] || `${ordinal(state.step + 1)}s`;
  return `${state.count} notes from the ${ordinal(startDeg)} degree in ${stepLabel} · octave ${state.octave} · ${state.tempo} BPM`;
}

async function playScale(state, haveAudio) {
  const r = parseNote(state.root);
  const def = SCALES[state.scale];
  if (!r || !def) {
    print(c.err('Could not play that scale.'));
    return;
  }
  const n = def.length;
  const startIdx = Math.min(Math.max(0, state.start - 1), n - 1);
  const segment = buildScaleSegment(def, startIdx, state.count, state.step);
  const rootMidi = 12 * (state.octave + 1) + r.semi;

  const spelled = getScaleNotes(state.root, state.scale) || [];
  const playedNames = segment.map(({ semi, within }) => {
    const midi = rootMidi + semi;
    const letter = spelled[within] || NOTE_NAMES_SHARP[((midi % 12) + 12) % 12];
    return letter + (Math.floor(midi / 12) - 1);
  });

  print();
  banner(`${state.root} ${state.scale}`, describe({ ...state, start: startIdx + 1 }, n));
  print();
  print(c.bold('Scale:   ') + c.gray(spelled.join('  ')));
  print(c.bold('Playing: ') + c.accent(playedNames.join('  ')));
  print();

  if (!haveAudio) {
    print(c.yellow('(no audio player — showing notes only)'));
    return;
  }

  const beatDur = 60 / state.tempo;
  const noteDur = Math.max(0.12, beatDur * 0.92);
  const tones = segment.map(({ semi }) => ({ midi: rootMidi + semi, dur: noteDur }));
  print(c.gray('Playing...'));
  await playSequence(tones);
}

async function promptInt(label, min, max, current) {
  while (true) {
    const raw = (await ask(c.cyan(`${label} `) + c.gray(`(${min}-${max}, current ${current}): `))).trim();
    if (raw === '') return current;
    const n = Math.round(Number(raw));
    if (Number.isFinite(n) && n >= min && n <= max) return n;
    print(c.err(`  Enter a number between ${min} and ${max}.`));
  }
}

export async function runPitch(opts = {}) {
  banner('Pitch — Play Scales', 'Hear a scale (or segment) played back at tempo.');

  const haveAudio = audioAvailable();
  if (!haveAudio) {
    print();
    print(c.yellow('No command-line audio player found — scales will be shown but not heard.'));
    print(c.gray('Install one of: afplay (macOS, built-in), paplay/aplay (Linux),'));
    print(c.gray('ffplay (ffmpeg), or sox (provides "play"). Then run Pitch again.'));
  }

  const state = {
    root: opts.root && parseNote(opts.root) ? opts.root : 'C',
    scale: resolveScale(opts.type),
    octave: clampInt(opts.octave, OCTAVE_MIN, OCTAVE_MAX, 4),
    tempo: clampInt(opts.tempo, TEMPO_MIN, TEMPO_MAX, 100),
    start: clampInt(opts.start, 1, COUNT_MAX, 1),
    count: clampInt(opts.count, 1, COUNT_MAX, 8),
    step: clampInt(opts.step, 1, STEP_MAX, 1),
  };

  // Non-interactive one-shot: enough was specified on the command line.
  if (opts.root && opts.type) {
    await playScale(state, haveAudio);
    return;
  }

  while (true) {
    const root = await choose('Root note:', [
      { label: 'Back to main menu', value: '__back__' },
      ...ROOTS.map((r) => ({ label: r, value: r })),
    ]);
    if (root === '__back__') return;
    state.root = root;
    state.scale = await choose('Scale:', Object.keys(SCALES).map((name) => ({ label: name, value: name })));

    await playScale(state, haveAudio);

    let pickNewScale = false;
    while (!pickNewScale) {
      print();
      print(
        c.gray('[Enter] replay · ') +
          c.cyan('o') + c.gray(' octave · ') +
          c.cyan('t') + c.gray(' tempo · ') +
          c.cyan('c') + c.gray(' count · ') +
          c.cyan('i') + c.gray(' interval · ') +
          c.cyan('g') + c.gray(' start degree · ') +
          c.cyan('n') + c.gray(' new scale · ') +
          c.cyan('q') + c.gray(' quit')
      );
      const cmd = (await ask(c.cyan('› '))).trim().toLowerCase();
      if (cmd === 'q' || cmd === 'quit' || cmd === 'exit') return;
      if (cmd === 'n') { pickNewScale = true; break; }
      if (cmd === 'o') state.octave = await promptInt('Octave', OCTAVE_MIN, OCTAVE_MAX, state.octave);
      else if (cmd === 't') state.tempo = await promptInt('Tempo (BPM)', TEMPO_MIN, TEMPO_MAX, state.tempo);
      else if (cmd === 'c') state.count = await promptInt('Note count', 1, COUNT_MAX, state.count);
      else if (cmd === 'i') state.step = await promptInt('Interval skip (1=2nds, 2=thirds, 3=fourths, 4=fifths)', 1, STEP_MAX, state.step);
      else if (cmd === 'g') state.start = await promptInt('Start degree', 1, COUNT_MAX, state.start);
      await playScale(state, haveAudio);
    }
  }
}
