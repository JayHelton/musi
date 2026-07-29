/**
 * Interval label → allowed pitch classes (mod 12).
 * Extensions share pitch class with simple intervals.
 */
export const LABEL_PC = {
  R: [0],
  1: [0],
  b2: [1],
  b9: [1],
  2: [2],
  9: [2],
  b3: [3],
  3: [4],
  4: [5],
  11: [5],
  b5: [6],
  '#11': [6],
  5: [7],
  '#5': [8],
  b6: [8],
  6: [9],
  bb7: [9],
  13: [9],
  b7: [10],
  7: [11],
};

export const TUNING_OFFSETS = {
  // Semitone offsets of open strings 6→1 relative to open string 6
  standard: [0, 5, 10, 15, 19, 24], // E A D G B E
  drop: [0, 7, 12, 17, 21, 26], // D A D G B E (drop-6 model)
};

/** Guitar string number 6..1 → array index 0..5 */
export function stringIndex(rootString) {
  return 6 - rootString;
}

export function patternString(frets) {
  return frets
    .map((f) => (f === null || f === undefined ? 'x' : f === 0 ? 'R' : f > 0 ? `R+${f}` : `R${f}`))
    .join(' ');
}

export function minSoundingRelative(frets) {
  const vals = frets.filter((f) => f !== null && f !== undefined);
  return vals.length ? Math.min(...vals) : 0;
}

export function maxSoundingRelative(frets) {
  const vals = frets.filter((f) => f !== null && f !== undefined);
  return vals.length ? Math.max(...vals) : 0;
}

export function fretSpan(frets) {
  const vals = frets.filter((f) => f !== null && f !== undefined);
  if (!vals.length) return 0;
  return Math.max(...vals) - Math.min(...vals);
}

/** Lowest root fret that keeps every sounding note fretted (no open strings). */
export function minRootFret(frets) {
  const minRel = minSoundingRelative(frets);
  return Math.max(1, 1 - minRel);
}

/**
 * Compute pitch-class of each string relative to the root string at relative fret 0.
 * Returns array of { pc, semis } or null for muted.
 */
export function computeIntervals(frets, rootString, tuningType) {
  const open = TUNING_OFFSETS[tuningType];
  if (!open) throw new Error(`Unknown tuningType: ${tuningType}`);
  const ri = stringIndex(rootString);
  const rootOpen = open[ri];
  // Root absolute pitch at rootFret 0 (relative): rootOpen + 0
  return frets.map((f, i) => {
    if (f === null || f === undefined) return null;
    const semis = open[i] + f - rootOpen;
    const pc = ((semis % 12) + 12) % 12;
    return { semis, pc };
  });
}

export function labelMatchesPc(label, pc) {
  const allowed = LABEL_PC[label];
  if (!allowed) return false;
  return allowed.includes(pc);
}

/**
 * Validate one shape. Returns { ok, errors[], warnings[] }.
 */
export function validateShape(shape) {
  const errors = [];
  const warnings = [];

  if (!shape.id) errors.push('missing id');
  if (!['standard', 'drop'].includes(shape.tuningType)) {
    errors.push(`bad tuningType: ${shape.tuningType}`);
  }
  if (![4, 5, 6].includes(shape.rootString)) {
    errors.push(`bad rootString: ${shape.rootString}`);
  }
  if (!Array.isArray(shape.frets) || shape.frets.length !== 6) {
    errors.push('frets must be length 6');
  }
  if (!Array.isArray(shape.intervals) || shape.intervals.length !== 6) {
    errors.push('intervals must be length 6');
  }
  if (errors.length) return { ok: false, errors, warnings };

  // No open-string markers — only null (mute) or fretted relative numbers
  shape.frets.forEach((f, i) => {
    if (f !== null && f !== undefined && typeof f !== 'number') {
      errors.push(`string ${6 - i}: frets must be number or null`);
    }
  });

  const computed = computeIntervals(shape.frets, shape.rootString, shape.tuningType);
  const ri = stringIndex(shape.rootString);

  if (shape.frets[ri] === null || shape.frets[ri] === undefined) {
    errors.push('root string is muted');
  } else if (shape.frets[ri] !== 0) {
    warnings.push(`root string relative fret is ${shape.frets[ri]} (expected 0 for root-position shapes)`);
  }

  if (shape.intervals[ri] !== 'R' && shape.frets[ri] !== null) {
    errors.push(`root string interval label is "${shape.intervals[ri]}", expected R`);
  }

  let hasRootLabel = false;
  for (let i = 0; i < 6; i++) {
    const f = shape.frets[i];
    const lab = shape.intervals[i];
    if (f === null || f === undefined) {
      if (lab !== null && lab !== undefined) {
        errors.push(`string ${6 - i}: muted but has interval "${lab}"`);
      }
      continue;
    }
    if (lab === null || lab === undefined) {
      errors.push(`string ${6 - i}: fretted but missing interval label`);
      continue;
    }
    if (lab === 'R') hasRootLabel = true;
    const { pc, semis } = computed[i];
    if (!labelMatchesPc(lab, pc)) {
      errors.push(
        `string ${6 - i}: label "${lab}" does not match pc ${pc} (semis=${semis} from root)`
      );
    }
  }
  if (!hasRootLabel) errors.push('no R label on any sounding string');

  const span = fretSpan(shape.frets);
  if (span > 5) warnings.push(`fret span ${span} is very wide`);
  else if (span > 4) warnings.push(`fret span ${span} is a stretch`);

  const sounding = shape.frets.filter((f) => f !== null && f !== undefined).length;
  if (sounding < 2) errors.push('fewer than 2 sounding notes');

  // Movable / closed: shape never encodes open strings; min root fret ensures fretted notes
  const minR = minRootFret(shape.frets);
  if (minR > 5) warnings.push(`needs root at fret ≥${minR} to avoid opens (awkwardly high)`);

  if (shape.fingering) {
    if (shape.fingering.length !== 6) errors.push('fingering must be length 6');
    shape.fingering.forEach((fin, i) => {
      const f = shape.frets[i];
      if (f === null || f === undefined) {
        if (fin !== null && fin !== undefined) {
          warnings.push(`string ${6 - i}: muted but has fingering`);
        }
      }
    });
  }

  return { ok: errors.length === 0, errors, warnings, minRootFret: minR, span };
}

export function validateAll(shapes) {
  const results = shapes.map((s) => ({ id: s.id, ...validateShape(s) }));
  const failed = results.filter((r) => !r.ok);
  const warned = results.filter((r) => r.warnings.length);
  return { results, failed, warned, ok: failed.length === 0 };
}
