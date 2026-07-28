import {
  guitarTuningNames,
  resolveTuning,
  openMidisFromTuning,
  intervalLabel,
  collectOrbitPositions,
  positionsMatchingInterval,
  nearestPosition,
  randomRootPosition,
  enabledIntervalsForStage,
  CHORD_FORMULAS,
  formulaLabel,
  pick,
} from '../../../js/intervalOrbitModel.js';
import { c, print, banner, scoreLine, correctMsg, wrongMsg, ask, askAnswer, choose, QUIT } from '../ui.js';

function renderAscii(strings, openMidis, root, highlights) {
  const frets = 12;
  const lines = [];
  lines.push(c.gray('    ' + Array.from({ length: frets + 1 }, (_, f) => String(f).padStart(3)).join('')));
  for (let s = strings.length - 1; s >= 0; s--) {
    let row = `${String(s + 1).padStart(2)} ${strings[s].note.padEnd(2)}│`;
    for (let f = 0; f <= frets; f++) {
      const key = `${s}:${f}`;
      let mark = '─';
      if (root && root.string === s && root.fret === f) mark = c.accent('R');
      else if (highlights && highlights.has(key)) mark = c.ok('●');
      row += `─${mark}─│`;
    }
    lines.push(row);
  }
  return lines.join('\n');
}

export async function runIntervalOrbit(opts = {}) {
  banner('Interval Orbit', 'Map intervals from a root — find, identify, and build formulas.');

  let tuningName = opts.tuning || null;
  let drill = opts.mode || null;
  let stage = opts.stage ? Number(opts.stage) : null;

  if (!tuningName) {
    tuningName = await choose(
      'Tuning:',
      guitarTuningNames().map((t) => ({ label: t, value: t }))
    );
    if (tuningName === QUIT) return;
  }
  if (!drill) {
    drill = await choose('Drill:', [
      { label: 'Find the interval', value: 'find' },
      { label: 'Identify the interval', value: 'identify' },
      { label: 'Formula builder', value: 'formula' },
    ]);
    if (drill === QUIT) return;
  }
  if (!stage) {
    stage = Number(await choose('Curriculum stage:', [
      { label: '1 Structural (R 4 5)', value: '1' },
      { label: '2 + thirds', value: '2' },
      { label: '3 + sevenths', value: '3' },
      { label: '7 Full chromatic', value: '7' },
    ]));
    if (!stage) return;
  }

  const strings = resolveTuning(tuningName);
  const openMidis = openMidisFromTuning(strings);
  print(c.gray(`Tuning: ${tuningName} · ${strings.map((s) => s.note + s.oct).join(' ')}`));
  print();

  let right = 0;
  let total = 0;

  while (true) {
    const root = randomRootPosition(openMidis, 1, 9);
    const ints = enabledIntervalsForStage(stage).filter((i) => i !== 0);
    const { positions } = collectOrbitPositions({
      rootString: root.string,
      rootFret: root.fret,
      openMidis,
      orbitSize: 1,
      fretStart: 0,
      fretEnd: 12,
      enabledIntervals: enabledIntervalsForStage(stage),
    });

    if (drill === 'formula') {
      const name = pick(Object.keys(CHORD_FORMULAS));
      const formula = CHORD_FORMULAS[name];
      print(c.bold(`Build ${name}: ${formulaLabel(formula)}`));
      print(c.gray(`Root at string ${root.string + 1} (low=1), fret ${root.fret}`));
      print(renderAscii(strings, openMidis, root, null));
      print(c.gray('Enter positions as "string fret" for each non-root interval, comma-separated.'));
      print(c.gray('Example: 5 3, 4 5'));
      const raw = await askAnswer('Positions> ');
      if (raw === QUIT) break;
      const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
      const found = new Set();
      let ok = true;
      for (const part of parts) {
        const m = part.match(/^(\d+)\D+(\d+)$/);
        if (!m) { ok = false; break; }
        const sIdx = Number(m[1]) - 1;
        const fret = Number(m[2]);
        if (sIdx < 0 || sIdx >= openMidis.length || fret < 0 || fret > 12) { ok = false; break; }
        const midi = openMidis[sIdx] + fret;
        const ic = ((midi - root.midi) % 12 + 12) % 12;
        if (formula.includes(ic) && ic !== 0) found.add(ic);
        else ok = false;
      }
      const need = new Set(formula.filter((i) => i !== 0));
      ok = ok && [...need].every((i) => found.has(i));
      total += 1;
      if (ok) { right += 1; print(correctMsg('Voicing complete.')); }
      else print(wrongMsg(`Needed ${formulaLabel(formula)}`));
    } else if (drill === 'identify') {
      const targetInt = pick(ints);
      const matches = positionsMatchingInterval(positions, targetInt);
      if (!matches.length) continue;
      const target = pick(matches);
      print(c.bold('What interval is the marked fret?'));
      print(c.gray(`Root at string ${root.string + 1}, fret ${root.fret}`));
      const hl = new Set([`${target.string}:${target.fret}`]);
      print(renderAscii(strings, openMidis, root, hl));
      const choices = ints.map((i) => ({ label: intervalLabel(i), value: String(i) }));
      const ans = await choose('Interval:', choices);
      if (ans === QUIT) break;
      total += 1;
      if (Number(ans) === targetInt) {
        right += 1;
        print(correctMsg(intervalLabel(targetInt)));
      } else {
        print(wrongMsg(`It was ${intervalLabel(targetInt)}`));
      }
    } else {
      const targetInt = pick(ints);
      const matches = positionsMatchingInterval(positions, targetInt);
      if (!matches.length) continue;
      const nearest = nearestPosition(positions, targetInt, root);
      print(c.bold(`Find ${intervalLabel(targetInt)}`));
      print(c.gray(`Root at string ${root.string + 1} (lowest = 1), fret ${root.fret}`));
      print(renderAscii(strings, openMidis, root, null));
      print(c.gray('Answer as "string fret" (string 1 = lowest / thickest).'));
      const raw = await askAnswer('Position> ');
      if (raw === QUIT) break;
      const m = String(raw).trim().match(/^(\d+)\D+(\d+)$/);
      total += 1;
      if (!m) {
        print(wrongMsg('Format: "2 5"'));
      } else {
        const sIdx = Number(m[1]) - 1;
        const fret = Number(m[2]);
        const hit = matches.some((p) => p.string === sIdx && p.fret === fret);
        if (hit) {
          right += 1;
          print(correctMsg(`${intervalLabel(targetInt)} at string ${sIdx + 1} fret ${fret}`));
        } else {
          const hint = nearest
            ? `Nearest was string ${nearest.string + 1} fret ${nearest.fret}`
            : 'No match in orbit';
          print(wrongMsg(hint));
        }
      }
    }

    print(scoreLine({ right, total, streak: 0 }));
    print();
    const again = await ask(c.gray('Enter for next, or q to quit: '));
    if (String(again).trim().toLowerCase() === 'q') break;
  }

  print();
  print(c.bold(`Session: ${right}/${total}`));
}
