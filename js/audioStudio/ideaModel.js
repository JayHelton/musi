// The idea of the Audio Studio: the notes you sang, in the order you sang them.
//
// A take goes through the offline transcription in `js/trackToSheet/` and
// comes out as timed notes. This file turns those notes into an idea the
// singer can read, check, and change: every note names its pitch and how many
// cents the voice sat above or below it, the idea names its key, and an
// out-of-key note can snap to the nearest note of that key.
//
// Every function here is pure, so a Node test reads it and a screen reads it.
// A function that changes the idea returns a new idea and leaves the old one.

import { NOTE_NAMES_SHARP } from '../theory.js';
import { detectKey, keyLabel } from '../analysis/keyDetect.js';

/** The semitone steps of the two key modes the detector knows. */
const MODE_STEPS = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

/**
 * The sources an idea can come from. Each one narrows the pitch detector to
 * the band of the instrument, so a low hum does not read an octave up and a
 * guitar harmonic does not read as a note.
 */
export const IDEA_SOURCES = [
  { id: 'voice', label: 'Voice', range: 'voice', hint: 'Sung or hummed, 70 Hz to 1.2 kHz.' },
  { id: 'guitar', label: 'Guitar', range: 'guitar', hint: 'A single guitar line, 70 Hz to 1.4 kHz.' },
  { id: 'bass', label: 'Bass', range: 'bass', hint: 'A bass line, 35 Hz to 500 Hz.' },
];

export const DEFAULT_IDEA_SOURCE = 'voice';

/** The analysis options one source asks for. */
export function analysisOptionsForSource(sourceId) {
  const source = IDEA_SOURCES.find((s) => s.id === sourceId) || IDEA_SOURCES[0];
  return { range: source.range, minFreq: null, maxFreq: null };
}

function clampCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-50, Math.min(50, Math.round(n)));
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** The name and the octave of a MIDI note: 60 → C4. */
export function noteFields(midi) {
  const rounded = Math.round(midi);
  const name = NOTE_NAMES_SHARP[((rounded % 12) + 12) % 12];
  const oct = Math.floor(rounded / 12) - 1;
  return { midi: rounded, name, oct, label: `${name}${oct}` };
}

/** One idea note, read off one transcription note. */
function ideaNoteFrom(note, index) {
  const midi = Math.round(num(note.midi, 60));
  return {
    id: `n${index + 1}`,
    ...noteFields(midi),
    /** How far the voice sat from the note, in cents. Negative is flat. */
    cents: clampCents(note.cents),
    /** The note the voice sang, before any snap or edit. */
    sungMidi: midi,
    startSec: num(note.startSec),
    durationSec: Math.max(0.01, num(note.durationSec, 0.01)),
    startBeat: note.startBeat != null ? num(note.startBeat) : null,
    durationBeats: note.durationBeats != null ? num(note.durationBeats) : null,
    confidence: num(note.confidence ?? note.clarity, 0.5),
    inKey: true,
    snapped: false,
    edited: false,
  };
}

/**
 * The pitch-class weights of an idea, weighted by how long each note held.
 * A long note tells more about the key than a passing one.
 * @param {Object[]} notes idea notes
 * @returns {Float32Array} 12 bins, C first
 */
export function pitchClassWeights(notes) {
  const weights = new Float32Array(12);
  for (const note of notes || []) {
    const pc = ((Math.round(num(note.midi)) % 12) + 12) % 12;
    weights[pc] += Math.max(0.05, num(note.durationSec, 0.05)) * (0.5 + 0.5 * num(note.confidence, 0.5));
  }
  return weights;
}

/** The pitch classes of one key, C = 0. */
export function keyPitchClasses(tonic, mode) {
  const steps = MODE_STEPS[mode] || MODE_STEPS.major;
  return steps.map((step) => (tonic + step) % 12);
}

/**
 * Name the key of an idea.
 *
 * Two notes name no key. The confidence blends how well the best key fits
 * with how far it stands above the runner-up.
 *
 * @param {Object[]} notes idea notes
 * @returns {{ tonic: number, mode: string, label: string, confidence: number, pcs: number[] }|null}
 */
export function detectIdeaKey(notes) {
  const list = (notes || []).filter((n) => Number.isFinite(num(n.midi, NaN)));
  const distinct = new Set(list.map((n) => ((Math.round(n.midi) % 12) + 12) % 12));
  if (distinct.size < 3) return null;
  const ranked = detectKey(pitchClassWeights(list));
  if (!ranked.length) return null;
  const best = ranked[0];
  const second = ranked[1];
  const gap = second ? Math.max(0, best.r - second.r) : best.r;
  const confidence = Math.max(0, Math.min(1, best.r * 0.6 + gap * 4));
  return {
    tonic: best.tonic,
    mode: best.mode,
    label: keyLabel(best),
    confidence,
    pcs: keyPitchClasses(best.tonic, best.mode),
  };
}

/** Mark every note as in the key or outside it. No key marks every note in. */
export function markInKey(notes, key) {
  const pcs = key ? new Set(key.pcs) : null;
  return (notes || []).map((note) => ({
    ...note,
    inKey: !pcs || pcs.has(((note.midi % 12) + 12) % 12),
  }));
}

/**
 * Move every out-of-key note to the nearest note of the key.
 *
 * A hummed line drifts, and a note that lands a quarter tone off can round
 * to the wrong semitone. The snap reads the pitch the voice sang, cents
 * included, and picks the key note nearest to it. A note that is already in
 * the key never moves.
 *
 * @param {Object[]} notes idea notes
 * @param {Object|null} key the output of `detectIdeaKey`
 * @returns {Object[]} new notes
 */
export function snapNotesToKey(notes, key) {
  if (!key) return (notes || []).map((n) => ({ ...n }));
  const pcs = new Set(key.pcs);
  return (notes || []).map((note) => {
    if (pcs.has(((note.midi % 12) + 12) % 12)) {
      return { ...note, inKey: true, snapped: note.snapped === true };
    }
    const sung = note.midi + (note.cents || 0) / 100;
    let best = null;
    for (const candidate of [note.midi - 1, note.midi + 1]) {
      if (!pcs.has(((candidate % 12) + 12) % 12)) continue;
      const dist = Math.abs(sung - candidate);
      if (!best || dist < best.dist) best = { midi: candidate, dist };
    }
    if (!best) return { ...note, inKey: false, snapped: note.snapped === true };
    return {
      ...note,
      ...noteFields(best.midi),
      cents: clampCents((sung - best.midi) * 100),
      inKey: true,
      snapped: true,
    };
  });
}

/**
 * Build an idea from one transcription.
 *
 * @param {Object} transcription the output of `transcribeBuffer`
 * @param {{ snapToKey?: boolean, source?: string }} [options]
 * @returns {Object} the idea
 */
export function buildIdea(transcription, { snapToKey = false, source = DEFAULT_IDEA_SOURCE } = {}) {
  const raw = Array.isArray(transcription?.notes) ? transcription.notes : [];
  let notes = raw
    .slice()
    .sort((a, b) => num(a.startSec) - num(b.startSec))
    .map(ideaNoteFrom);
  const key = detectIdeaKey(notes);
  notes = snapToKey ? snapNotesToKey(notes, key) : markInKey(notes, key);
  return {
    notes,
    key,
    source,
    snapToKey: !!snapToKey,
    bpm: Math.round(num(transcription?.bpm, 120)) || 120,
    beatsPerBar: num(transcription?.beatsPerBar, 4) === 3 ? 3 : 4,
    offsetSec: num(transcription?.offsetSec),
    durationSec: num(transcription?.durationSec) || (notes.length
      ? Math.max(...notes.map((n) => n.startSec + n.durationSec))
      : 0),
  };
}

/** Name the key again after an edit. The snap flag holds; the notes do not move. */
export function rekeyIdea(idea) {
  const key = detectIdeaKey(idea.notes);
  return { ...idea, key, notes: markInKey(idea.notes, key) };
}

/** Move one note by whole semitones. The singer decides, so the cents reset. */
export function nudgeNote(idea, id, semitones) {
  const step = Math.round(num(semitones));
  if (!step) return idea;
  let changed = false;
  const notes = idea.notes.map((note) => {
    if (note.id !== id) return note;
    const midi = Math.max(24, Math.min(96, note.midi + step));
    if (midi === note.midi) return note;
    changed = true;
    return { ...note, ...noteFields(midi), cents: 0, edited: true, snapped: false };
  });
  if (!changed) return idea;
  return rekeyIdea({ ...idea, notes });
}

/** Drop one note. The others keep their time. */
export function removeNote(idea, id) {
  const notes = idea.notes.filter((note) => note.id !== id);
  if (notes.length === idea.notes.length) return idea;
  return rekeyIdea({ ...idea, notes });
}

/** Move the whole idea by whole semitones. */
export function transposeIdea(idea, semitones) {
  const step = Math.round(num(semitones));
  if (!step) return idea;
  const notes = idea.notes.map((note) => ({
    ...note,
    ...noteFields(Math.max(24, Math.min(96, note.midi + step))),
  }));
  return rekeyIdea({ ...idea, notes });
}

/** The lowest and the highest note of an idea. */
export function ideaRange(notes) {
  const list = (notes || []).filter((n) => Number.isFinite(num(n.midi, NaN)));
  if (!list.length) return null;
  const low = Math.min(...list.map((n) => n.midi));
  const high = Math.max(...list.map((n) => n.midi));
  return { low, high, lowLabel: noteFields(low).label, highLabel: noteFields(high).label };
}

/** How many bars the idea fills at its tempo and meter. */
export function ideaBarCount(idea) {
  const notes = idea?.notes || [];
  if (!notes.length) return 0;
  const beatSec = 60 / Math.max(30, idea.bpm || 120);
  const end = notes.reduce((last, note) => {
    const start = note.startBeat != null ? note.startBeat : (note.startSec - (idea.offsetSec || 0)) / beatSec;
    const length = note.durationBeats != null ? note.durationBeats : note.durationSec / beatSec;
    return Math.max(last, start + length);
  }, 0);
  return end > 0 ? Math.ceil(end / (idea.beatsPerBar || 4)) : 0;
}

/** The one-line summary above the notes. */
export function ideaSummary(idea) {
  const notes = idea?.notes || [];
  if (!notes.length) return 'No clear notes yet.';
  const parts = [`${notes.length} note${notes.length === 1 ? '' : 's'}`];
  if (idea.durationSec > 0) parts.push(`${idea.durationSec.toFixed(1)} s`);
  const range = ideaRange(notes);
  if (range) parts.push(range.low === range.high ? range.lowLabel : `${range.lowLabel}–${range.highLabel}`);
  if (idea.key) parts.push(idea.key.confidence >= 0.35 ? idea.key.label : `${idea.key.label}?`);
  if (idea.bpm) parts.push(`≈${idea.bpm} BPM`);
  return parts.join(' · ');
}

/** The names in order, on one line: `A3 G3 E3 G3`. */
export function ideaNamesLine(idea) {
  return (idea?.notes || []).map((n) => n.label).join(' ');
}

/** `+12`, `-8`, or `0`, as a singer reads it. */
export function centsText(cents) {
  const n = clampCents(cents);
  return n > 0 ? `+${n}` : String(n);
}

/**
 * The idea as plain text, for the clipboard: the names on one line, then one
 * line per note with its time, its length, and its cents.
 */
export function ideaToText(idea) {
  const notes = idea?.notes || [];
  if (!notes.length) return '';
  const head = [ideaSummary(idea), ideaNamesLine(idea), ''];
  const rows = notes.map((n) => (
    `${n.label.padEnd(4)}  ${n.startSec.toFixed(2)}s  ${n.durationSec.toFixed(2)}s  ${centsText(n.cents).padStart(3)}c`
    + (n.snapped ? '  snapped' : '')
    + (n.edited ? '  edited' : '')
  ));
  return [...head, ...rows].join('\n');
}

/**
 * The notes as playback events, at the time the voice sang them. The synth
 * plays these so the singer hears the idea before trusting it.
 * @returns {Array<{ id: string, midi: number, atSec: number, durationSec: number }>}
 */
export function ideaPlaybackEvents(idea) {
  const notes = idea?.notes || [];
  if (!notes.length) return [];
  const first = Math.min(...notes.map((n) => n.startSec));
  return notes.map((n) => ({
    id: n.id,
    midi: n.midi,
    atSec: Math.max(0, n.startSec - first),
    durationSec: Math.max(0.05, n.durationSec),
  }));
}

/** The note that sounds at one moment of the take, or null between notes. */
export function noteAtTime(idea, sec) {
  const t = num(sec, -1);
  if (t < 0) return null;
  const notes = idea?.notes || [];
  for (const note of notes) {
    if (t >= note.startSec && t < note.startSec + note.durationSec) return note;
  }
  return null;
}

/**
 * The idea in the shape of a transcription, for the Pitch Runner and the tab
 * builder. The runner reads `midi` and the beat fields; the tab builder reads
 * the seconds as well.
 */
export function ideaToTranscription(idea) {
  const notes = (idea?.notes || []).map((n) => ({
    midi: n.midi,
    name: n.name,
    oct: n.oct,
    label: n.label,
    cents: n.cents,
    startSec: n.startSec,
    durationSec: n.durationSec,
    ...(n.startBeat != null ? { startBeat: n.startBeat } : {}),
    ...(n.durationBeats != null ? { durationBeats: n.durationBeats } : {}),
    clarity: n.confidence,
    confidence: n.confidence,
  }));
  return {
    notes,
    bpm: idea?.bpm || 120,
    beatsPerBar: idea?.beatsPerBar || 4,
    offsetSec: idea?.offsetSec || 0,
    durationSec: idea?.durationSec || 0,
  };
}
