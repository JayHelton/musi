// Chord identification + diatonic key-fit + roman-numeral analysis.
//
// `CHORD_TYPES`, `identifyChord` and `findKeys` were originally embedded in
// the removed chord builder. They now live here so the CLI and the tab
// analyzer share one implementation. The original entries are kept first
// and in their original order (identifyChord prefers the earliest match of the
// largest size), so existing behaviour is preserved; later entries only add
// recognition for chords that were previously reported as "unknown".

import { parseNote, NOTE_NAMES_SHARP, ROOTS_RAND } from '../theory.js';
import { SCALES } from '../scales.js';
import { chordTypesForDetection } from '../chords.js';

export const CHORD_TYPES = chordTypesForDetection();

/**
 * Identify the best chord for a set of pitch classes.
 * @param {number[]} pitchClasses pcs 0..11 (duplicates ok).
 * @param {number|null} preferredRootPc when several equally-sized chords match
 *   (e.g. a power-chord dyad), prefer the one rooted here (usually the bass).
 * @returns {{root:string, rootPC:number, type:object|null, intervals:number[], size?:number, unknown?:boolean}|null}
 */
export function identifyChord(pitchClasses, preferredRootPc = null) {
  if (pitchClasses.length < 2) return null;
  const uniq = [...new Set(pitchClasses)].sort((a, b) => a - b);
  let bestMatch = null;

  for (const rootPC of uniq) {
    const intervals = uniq.map((pc) => ((pc - rootPC) % 12 + 12) % 12).sort((a, b) => a - b);
    for (const ct of CHORD_TYPES) {
      if (ct.semis.length !== intervals.length) continue;
      const mapped = ct.semis.map((s) => s % 12);
      if (mapped.every((s, i) => s === intervals[i])) {
        const rootName = NOTE_NAMES_SHARP[rootPC];
        const bigger = !bestMatch || ct.semis.length > bestMatch.size;
        // Tie-break same-size matches toward the preferred (bass) root.
        const tiePreferred = bestMatch && ct.semis.length === bestMatch.size &&
          preferredRootPc != null && rootPC === preferredRootPc && bestMatch.rootPC !== preferredRootPc;
        if (bigger || tiePreferred) {
          bestMatch = { root: rootName, rootPC, type: ct, size: ct.semis.length, intervals };
        }
      }
    }
  }

  if (!bestMatch) {
    const lowestPC = uniq[0];
    const intervals = uniq.map((pc) => ((pc - lowestPC) % 12 + 12) % 12).sort((a, b) => a - b);
    return {
      root: NOTE_NAMES_SHARP[lowestPC],
      rootPC: lowestPC,
      type: null,
      intervals,
      unknown: true,
    };
  }
  return bestMatch;
}

/**
 * Identify a chord and, when a bass pitch class is supplied and differs from the
 * chord root, express it as a slash chord (e.g. "C/E").
 * @param {number[]} pitchClasses
 * @param {number|null} bassPc lowest sounding pitch class, or null.
 */
export function identifyChordWithBass(pitchClasses, bassPc = null) {
  const res = identifyChord(pitchClasses, bassPc);
  if (!res) return res;
  const symbol = res.unknown ? res.root + '?' : res.root + res.type.sym;
  let label = symbol;
  let slash = null;
  if (bassPc != null && Number.isFinite(bassPc) && bassPc !== res.rootPC) {
    slash = NOTE_NAMES_SHARP[((bassPc % 12) + 12) % 12];
    label = `${symbol}/${slash}`;
  }
  return { ...res, symbol, label, bassPc, slash };
}

/**
 * Standard major/minor keys whose diatonic scale contains every supplied pc.
 * @param {number[]} pitchClasses
 * @returns {{key:string, quality:string}[]}
 */
export function findKeys(pitchClasses) {
  const uniq = [...new Set(pitchClasses)];
  const results = [];
  const scaleTypes = [
    { name: 'Major (Ionian)', label: 'major' },
    { name: 'Natural Minor (Aeolian)', label: 'minor' },
  ];

  for (const root of ROOTS_RAND) {
    const rp = parseNote(root);
    if (!rp) continue;
    for (const st of scaleTypes) {
      const def = SCALES[st.name];
      const keyPCs = def.map(([, so]) => ((rp.semi + so) % 12 + 12) % 12);
      if (uniq.every((pc) => keyPCs.includes(pc))) {
        results.push({ key: root, quality: st.label });
      }
    }
  }
  return results;
}

// Roman numeral for each scale degree of the major and (natural) minor scales,
// including the typical diatonic chord quality.
const MAJOR_DEGREE_SEMIS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_DEGREE_SEMIS = [0, 2, 3, 5, 7, 8, 10];
const MAJOR_NUMERALS = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const MINOR_NUMERALS = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];

function baseNumeral(mode, degreeIdx) {
  return (mode === 'major' ? MAJOR_NUMERALS : MINOR_NUMERALS)[degreeIdx];
}

function qualityIsMajor(type) {
  if (!type) return null;
  return /^(Major|Aug|Dom|Maj|6|Add|Sus|Power|Fourth)/.test(type.name) || type.sym === '' ;
}

/**
 * Roman-numeral analysis of a chord relative to a key. Chords whose root is not
 * a diatonic scale degree are flagged as borrowed/chromatic with a ♭/♯ prefix.
 * @param {number} chordRootPc
 * @param {object|null} type chord type from CHORD_TYPES (or null / unknown)
 * @param {number} keyTonicPc
 * @param {string} keyMode 'major' | 'minor'
 * @returns {{numeral:string, diatonic:boolean}}
 */
export function romanNumeral(chordRootPc, type, keyTonicPc, keyMode) {
  const degreeSemis = keyMode === 'major' ? MAJOR_DEGREE_SEMIS : MINOR_DEGREE_SEMIS;
  const rel = ((chordRootPc - keyTonicPc) % 12 + 12) % 12;
  const idx = degreeSemis.indexOf(rel);

  const minorish = type ? /^(Minor|Min|Dim|Half|m)/.test(type.name) : false;
  const dimish = type ? /Dim|Half/.test(type.name) : false;
  const augish = type ? /Aug/.test(type.name) : false;

  if (idx >= 0) {
    let num = baseNumeral(keyMode, idx);
    // Re-case to reflect the actual chord quality when it differs from the
    // default diatonic quality (e.g. a major V in a minor key).
    if (type) {
      const letters = num.replace(/[°+]/g, '');
      const romanBody = letters.replace(/b|#/g, '');
      let recased = minorish ? romanBody.toLowerCase() : romanBody.toUpperCase();
      if (dimish) recased += '°';
      else if (augish) recased += '+';
      num = recased;
    }
    return { numeral: num, diatonic: true };
  }

  // Non-diatonic root: label by chromatic distance from the tonic.
  const flatNames = ['I', '♭II', 'II', '♭III', 'III', 'IV', '♭V', 'V', '♭VI', 'VI', '♭VII', 'VII'];
  let body = flatNames[rel];
  if (minorish) body = body.toLowerCase();
  if (dimish) body += '°';
  else if (augish) body += '+';
  return { numeral: body, diatonic: false };
}
