import { midiFreq } from './audio.js';

export const L = ['C','D','E','F','G','A','B'];
export const LS = [0,2,4,5,7,9,11];

export function parseNote(s) {
  s = s.trim();
  if (!s) return null;
  const m = s.match(/^([A-Ga-g])(#{1,2}|b{1,2}|x)?$/);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  let acc = (m[2]||'').toLowerCase();
  if (acc === 'x') acc = '##';
  const li = L.indexOf(letter);
  const base = LS[li];
  const mod = acc === '##' ? 2 : acc === '#' ? 1 : acc === 'bb' ? -2 : acc === 'b' ? -1 : 0;
  return { letter, li, acc, semi: ((base+mod)%12+12)%12 };
}

export function spellNote(rootLI, rootSemi, lOff, sOff) {
  const tli = (rootLI + lOff) % 7;
  const tNat = LS[tli];
  const tSemi = ((rootSemi + sOff) % 12 + 12) % 12;
  let d = tSemi - tNat;
  while (d > 6) d -= 12;
  while (d < -6) d += 12;
  const accMap = {'-2':'bb','-1':'b','0':'','1':'#','2':'##'};
  const acc = accMap[d];
  if (acc === undefined) return null;
  return L[tli] + acc;
}

export function normNote(s) {
  s = s.trim();
  if (!s) return '';
  let letter = s[0].toUpperCase();
  let acc = s.slice(1).toLowerCase().replace(/♯/g,'#').replace(/♭/g,'b').replace('x','##');
  return letter + acc;
}

export const NOTE_NAMES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

export function noteFromFreq(freq) {
  const midi = 12 * (Math.log2(freq / 440)) + 69;
  const rounded = Math.round(midi);
  const cents = Math.round(1200 * Math.log2(freq / midiFreq(rounded)));
  const name = NOTE_NAMES_SHARP[((rounded % 12) + 12) % 12];
  const oct = Math.floor(rounded / 12) - 1;
  return { midi: rounded, name, oct, cents, freq };
}

export const ROOTS = ['C','C#','Db','D','Eb','E','F','F#','Gb','G','Ab','A','Bb','B'];
export const ROOTS_RAND = ['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'];

export function pick(arr) { return arr[Math.floor(Math.random()*arr.length)]; }

export const TUNINGS = {
  'Standard':     [{note:'E',oct:2},{note:'A',oct:2},{note:'D',oct:3},{note:'G',oct:3},{note:'B',oct:3},{note:'E',oct:4}],
  'Drop D':       [{note:'D',oct:2},{note:'A',oct:2},{note:'D',oct:3},{note:'G',oct:3},{note:'B',oct:3},{note:'E',oct:4}],
  'Half Step Down':[{note:'Eb',oct:2},{note:'Ab',oct:2},{note:'Db',oct:3},{note:'Gb',oct:3},{note:'Bb',oct:3},{note:'Eb',oct:4}],
  'Drop C':       [{note:'C',oct:2},{note:'G',oct:2},{note:'C',oct:3},{note:'F',oct:3},{note:'A',oct:3},{note:'D',oct:4}],
  'Open G':       [{note:'D',oct:2},{note:'G',oct:2},{note:'D',oct:3},{note:'G',oct:3},{note:'B',oct:3},{note:'D',oct:4}],
  'Open D':       [{note:'D',oct:2},{note:'A',oct:2},{note:'D',oct:3},{note:'F#',oct:3},{note:'A',oct:3},{note:'D',oct:4}],
  'DADGAD':       [{note:'D',oct:2},{note:'A',oct:2},{note:'D',oct:3},{note:'G',oct:3},{note:'A',oct:3},{note:'D',oct:4}],
  '7-String Standard': [{note:'B',oct:1},{note:'E',oct:2},{note:'A',oct:2},{note:'D',oct:3},{note:'G',oct:3},{note:'B',oct:3},{note:'E',oct:4}],
  '8-String Standard': [{note:'F#',oct:1},{note:'B',oct:1},{note:'E',oct:2},{note:'A',oct:2},{note:'D',oct:3},{note:'G',oct:3},{note:'B',oct:3},{note:'E',oct:4}],
  'Bass 4':       [{note:'E',oct:1},{note:'A',oct:1},{note:'D',oct:2},{note:'G',oct:2}],
  'Bass 5':       [{note:'B',oct:0},{note:'E',oct:1},{note:'A',oct:1},{note:'D',oct:2},{note:'G',oct:2}],
};

export const INTERVAL_LABELS = {
  0:'P1', 1:'m2', 2:'M2', 3:'m3', 4:'M3', 5:'P4',
  6:'TT', 7:'P5', 8:'m6', 9:'M6', 10:'m7', 11:'M7'
};
