import fs from 'node:fs';
import { c, print, banner, ask, choose } from '../ui.js';
import {
  parseTab, analyzeModel, TUNINGS, NOTE_NAMES_SHARP, parseGuitarPro, isGuitarProName,
} from '../shared.js';

const SAMPLE = `e|-------------------------------|
B|-------------------------------|
G|-----------------7b9--7--------|
D|-------5h7--7----------9--7-----|
A|-3-5-7-----------------------7~-|
E|-------------------------------|

e|-------------------|
B|-------------------|
G|-------------------|
D|--5-5--7-7--5-5-----|
A|--5-5--7-7--5-5-----|
E|--3-3--5-5--3-3-----|`;

function midiToName(midi) {
  const n = NOTE_NAMES_SHARP[((midi % 12) + 12) % 12];
  return n + (Math.floor(midi / 12) - 1);
}

function resolveTuningName(name) {
  if (!name) return 'Standard';
  const keys = Object.keys(TUNINGS);
  const exact = keys.find((k) => k.toLowerCase() === String(name).toLowerCase());
  return exact || 'Standard';
}

function printReport(report) {
  print();
  print(c.bold('Tab breakdown'));
  print(c.gray(`Tuning ${report.tuning} (${report.strings.slice().reverse().join(' ')})  ·  ` +
    `${report.noteCount} notes  ·  ` +
    (report.range ? `range ${midiToName(report.range.lowMidi)}–${midiToName(report.range.highMidi)}` : 'no pitched notes')));

  // Tonal center
  const k = report.key;
  print();
  print(c.accent('Tonal center: ') + c.bold(k.descriptor) + c.gray(`  (confidence ${Math.round(k.confidence * 100)}%)`));
  if (k.isChromatic) {
    print(c.yellow(`  Highly chromatic — ${Math.round(k.chromaticism * 100)}% outside a single key, ${k.activePcs}/12 pitch classes used.`));
  }
  if (k.candidates.length) {
    print(c.gray('  Candidates: ' + k.candidates.map((cd) => `${cd.label} (${cd.r.toFixed(2)})`).join(', ')));
  }

  // Scales
  if (report.scales.length) {
    print();
    print(c.accent('Scales / modes:'));
    report.scales.slice(0, 4).forEach((s, i) => {
      const mark = i === 0 ? c.ok('●') : c.gray('○');
      print(`  ${mark} ${c.bold(s.rootName + ' ' + s.scaleName)} ${c.gray(`(${s.matched}/${s.used})`)}  ${c.gray(s.notes.join(' '))}` +
        (s.outNotes.length ? c.red('  +' + s.outNotes.join(',')) : ''));
    });
  }

  // Progression
  print();
  if (report.progression.length) {
    print(c.accent(`Chords / progression `) + c.gray(`(relative to ${report.key.tonic} ${report.key.mode})`));
    const line = report.progression.map((p) => {
      const tag = p.diatonic ? c.gray(`(${p.numeral})`) : c.red(`(${p.numeral})`);
      return c.bold(p.label) + tag;
    }).join(c.gray(' → '));
    print('  ' + line);
    if (report.loop) {
      print(c.gray(`  Loop: ${report.loop.chords.join(' – ')} ×${report.loop.repeats}`));
    }
  } else {
    print(c.gray('Chords: mostly single-note lines (no stacked chords detected).'));
  }

  // Arpeggios
  if (report.arpeggios.length) {
    print();
    print(c.accent('Arpeggios: ') + report.arpeggios.map((a) => {
      const tags = [a.sweep && 'sweep', a.tapped && 'tapped'].filter(Boolean);
      return a.chord + (tags.length ? c.gray(` [${tags.join(', ')}]`) : '');
    }).join(', '));
  }

  // Techniques
  if (report.techniques.ordered.length) {
    print();
    print(c.accent('Techniques: ') + report.techniques.ordered.map((t) => `${t.label} ×${t.count}`).join(', '));
    report.techniques.insights.forEach((i) => print(c.gray('  • ' + i)));
  }

  // Sections
  if (report.sections.length) {
    print();
    print(c.accent('Sections:'));
    report.sections.forEach((s) => {
      const kind = s.kind === 'solo' ? c.bold('Solo/lead') : c.bold('Riff/rhythm');
      const scales = s.scales.slice(0, 2).map((x) => `${x.rootName} ${x.scaleName}`).join(', ') || '—';
      const range = s.range ? `${midiToName(s.range.lowMidi)}–${midiToName(s.range.highMidi)}` : '—';
      print(`  ${kind} ${c.gray(`(${s.noteCount} notes, ${range})`)}`);
      print(c.gray(`     scales: ${scales}`));
      const arps = s.arpeggios.map((a) => a.chord).join(', ');
      if (arps) print(c.gray(`     arpeggios: ${arps}`));
      const techs = s.techniques.ordered.slice(0, 5).map((x) => `${x.label}×${x.count}`).join(', ');
      if (techs) print(c.gray(`     techniques: ${techs}`));
    });
  }

  if (report.warnings.length) {
    print();
    print(c.yellow('Parser notes:'));
    report.warnings.forEach((w) => print(c.gray('  - ' + w)));
  }
}

export async function runTabAnalyzer(opts = {}) {
  banner('Tab Analyzer', 'Break down a guitar/bass tab: key, chords, scales, arpeggios, techniques');

  let text = null;
  let filePath = opts.file;

  if (!filePath && process.stdin.isTTY) {
    const answer = (await ask(c.gray('Path to a tab .txt or Guitar Pro .gp file (Enter for a built-in sample): '))).trim();
    if (answer) filePath = answer;
  }

  // Guitar Pro (.gp) files give exact data — parse straight into a model.
  if (filePath && isGuitarProName(filePath)) {
    let buf;
    try {
      buf = fs.readFileSync(filePath);
    } catch (err) {
      print(c.err(`Could not read file: ${filePath}`));
      return;
    }
    try {
      const { model, meta } = await parseGuitarPro(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const trk = meta.trackName ? ` — ${meta.trackName}` : '';
      const extra = meta.tracks > 1 ? ` (first fretted track of ${meta.tracks})` : '';
      print(c.gray(`Loaded Guitar Pro file${trk}${extra}.`));
      printReport(analyzeModel(model));
    } catch (err) {
      print(c.err(err && err.message ? err.message : 'Could not read that Guitar Pro file.'));
    }
    return;
  }

  if (filePath) {
    try {
      text = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      print(c.err(`Could not read file: ${filePath}`));
      return;
    }
  } else {
    text = SAMPLE;
    print(c.gray('Using the built-in sample tab.'));
  }

  let tuning = resolveTuningName(opts.tuning);
  if (!opts.tuning && process.stdin.isTTY) {
    tuning = await choose('Tuning', Object.keys(TUNINGS).map((t) => ({ label: t, value: t })), {
      defaultIndex: Object.keys(TUNINGS).indexOf('Standard'),
    });
  }

  const model = parseTab(text, tuning);
  const report = analyzeModel(model);
  printReport(report);
}
