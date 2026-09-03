// Data model for a pitch-runner exercise — a saved, repeatable run of the
// vocal runner game that lives in the Exercises library.
//
// A run is a list of notes. Each note has a pitch (MIDI number) and a hold
// length in beats. A note that came from a Guitar Pro file also keeps the text
// the score writes over it and the beat it sat on, so the runner can print the
// vowel or the exercise the writer asked for. A run also carries the tempo and
// the play options. Two sources make the note list:
//
//   - manual: the user types the pitches and the hold lengths.
//   - gp:     a Guitar Pro file gives the pitches and the hold lengths.
//
// This module holds no DOM code, so the Node test runners can import it.

export const RUNNER_MIN_BPM = 30;
export const RUNNER_MAX_BPM = 300;
export const RUNNER_DEFAULT_BPM = 90;

export const RUNNER_MIN_MIDI = 24;   // C1
export const RUNNER_MAX_MIDI = 96;   // C7

export const RUNNER_MIN_BEATS = 0.25;
export const RUNNER_MAX_BEATS = 16;
export const RUNNER_DEFAULT_BEATS = 2;

export const RUNNER_MAX_NOTES = 128;
export const RUNNER_MAX_REPEATS = 20;

/** The longest note text the runner keeps, in characters. */
export const RUNNER_TEXT_LIMIT = 60;

export const RUNNER_SOURCES = ['manual', 'gp'];

const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const LETTER_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const DEFAULT_OCTAVE = 4;

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Round a hold length to the nearest quarter beat and keep it in range. */
export function clampRunnerBeats(value) {
  const n = clampNumber(value, RUNNER_MIN_BEATS, RUNNER_MAX_BEATS, RUNNER_DEFAULT_BEATS);
  const quarters = Math.round(n * 4) / 4;
  return Math.min(RUNNER_MAX_BEATS, Math.max(RUNNER_MIN_BEATS, quarters));
}

/**
 * Read the fixed hold length of a run. 0 means "as written": every note keeps
 * the hold length it carries. Any other value holds every note that long.
 */
export function clampRunnerNoteBeats(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return clampRunnerBeats(n);
}

/** The hold length one note plays for, in beats. */
export function runnerNoteBeats(config, note) {
  const fixed = clampRunnerNoteBeats(config && config.noteBeats);
  if (fixed > 0) return fixed;
  return clampRunnerBeats(note && note.beats);
}

/**
 * Read one line of note text.
 *
 * The text comes from a Guitar Pro file or from a saved section note, so it
 * can hold line breaks and it can be very long. The runner prints it on one
 * bar, so this keeps one short line.
 *
 * @param {*} value
 * @returns {string}
 */
export function clampRunnerText(value) {
  if (typeof value !== 'string') return '';
  const line = value.replace(/\s+/g, ' ').trim();
  return line.slice(0, RUNNER_TEXT_LIMIT);
}

export function clampRunnerBpm(value) {
  const n = clampNumber(value, RUNNER_MIN_BPM, RUNNER_MAX_BPM, RUNNER_DEFAULT_BPM);
  return Math.round(n);
}

export function clampRunnerMidi(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < RUNNER_MIN_MIDI || rounded > RUNNER_MAX_MIDI) return null;
  return rounded;
}

/** MIDI number to a display name with an octave, for example "C4". */
export function midiToNoteName(midi) {
  const m = Math.round(Number(midi));
  if (!Number.isFinite(m)) return '';
  const pc = ((m % 12) + 12) % 12;
  return `${NOTE_NAMES_SHARP[pc]}${Math.floor(m / 12) - 1}`;
}

/**
 * Note name to a MIDI number. The octave is optional and defaults to 4.
 * Accepts sharps (#), flats (b), and double accidentals.
 * @returns {number|null}
 */
export function noteNameToMidi(name) {
  if (typeof name !== 'string') return null;
  const match = name.trim().match(/^([A-Ga-g])(#{1,2}|b{1,2}|x)?(-?\d{1,2})?$/);
  if (!match) return null;
  const letter = match[1].toUpperCase();
  let acc = (match[2] || '').toLowerCase();
  if (acc === 'x') acc = '##';
  const mod = acc === '##' ? 2 : acc === '#' ? 1 : acc === 'bb' ? -2 : acc === 'b' ? -1 : 0;
  const octave = match[3] == null ? DEFAULT_OCTAVE : Number(match[3]);
  if (!Number.isFinite(octave)) return null;
  const midi = (octave + 1) * 12 + LETTER_SEMITONES[letter] + mod;
  if (!Number.isFinite(midi)) return null;
  return midi;
}

/**
 * Read a typed note list.
 *
 * One entry per comma, per line, or per space run. An entry is a note name and
 * an optional hold length in beats:
 *
 *   C4 2, D4 2, E4 4
 *   C4:2
 *   G4            (uses the default hold length)
 *
 * @param {string} text
 * @param {{ defaultBeats?: number }} [options]
 * @returns {{ ok: boolean, notes: {midi:number, beats:number}[], errors: string[] }}
 */
export function parseRunnerNotes(text, { defaultBeats = RUNNER_DEFAULT_BEATS } = {}) {
  const fallbackBeats = clampRunnerBeats(defaultBeats);
  const raw = typeof text === 'string' ? text : '';
  const tokens = raw
    .split(/[,;\n\r]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const notes = [];
  const errors = [];

  for (const token of tokens) {
    if (notes.length >= RUNNER_MAX_NOTES) {
      errors.push(`A run holds at most ${RUNNER_MAX_NOTES} notes.`);
      break;
    }
    const parts = token.split(/[\s:x*]+/i).filter(Boolean);
    const midi = noteNameToMidi(parts[0] || '');
    if (midi == null) {
      errors.push(`"${token}" is not a note name. Use a name such as C4 or F#3.`);
      continue;
    }
    const clamped = clampRunnerMidi(midi);
    if (clamped == null) {
      errors.push(`"${parts[0]}" is outside the singable range (C1 to C7).`);
      continue;
    }
    let beats = fallbackBeats;
    if (parts.length > 1) {
      const value = Number(parts[1]);
      if (!Number.isFinite(value) || value <= 0) {
        errors.push(`"${token}" has no valid hold length. Use a number of beats, such as C4 2.`);
        continue;
      }
      beats = clampRunnerBeats(value);
    }
    notes.push({ midi: clamped, beats });
  }

  return { ok: notes.length > 0 && errors.length === 0, notes, errors };
}

/** Write a note list back to the typed form, so the user can edit it again. */
export function formatRunnerNotes(notes) {
  return (Array.isArray(notes) ? notes : [])
    .map((note) => `${midiToNoteName(note.midi)} ${trimNumber(note.beats)}`)
    .join(', ');
}

function trimNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return String(Math.round(n * 100) / 100);
}

function normalizeNotes(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    if (out.length >= RUNNER_MAX_NOTES) break;
    const midi = clampRunnerMidi(entry && entry.midi);
    if (midi == null) continue;
    const note = { midi, beats: clampRunnerBeats(entry.beats) };
    const text = clampRunnerText(entry.text);
    if (text) note.text = text;
    const scoreBeat = Number(entry.scoreBeat);
    if (Number.isFinite(scoreBeat)) note.scoreBeat = scoreBeat;
    out.push(note);
  }
  return out;
}

/** The number of notes of a run that carry text. */
export function runnerTextCount(config) {
  const notes = Array.isArray(config?.notes) ? config.notes : [];
  return notes.filter((note) => clampRunnerText(note?.text)).length;
}

/** The lowest and the highest pitch of a run, for the lane ladder. */
export function runnerNoteRange(notes) {
  const list = Array.isArray(notes) ? notes : [];
  let low = Infinity;
  let high = -Infinity;
  for (const note of list) {
    const midi = Number(note && note.midi);
    if (!Number.isFinite(midi)) continue;
    low = Math.min(low, midi);
    high = Math.max(high, midi);
  }
  if (!Number.isFinite(low)) return { low: 60, high: 72 };
  return { low, high };
}

/**
 * The whole-octave shifts a saved run can take.
 *
 * A run keeps its written pitches. The player moves the whole run into the
 * octave the voice reaches, and every shift keeps each note inside the MIDI
 * range the model allows.
 *
 * @param {{midi:number}[]} notes
 * @returns {number[]} the shifts in octaves, low to high
 */
export function runnerOctaveShifts(notes) {
  const list = Array.isArray(notes) ? notes : [];
  if (!list.length) return [0];
  const range = runnerNoteRange(list);
  const shifts = [];
  for (let octaves = -3; octaves <= 3; octaves++) {
    const low = range.low + octaves * 12;
    const high = range.high + octaves * 12;
    if (low >= RUNNER_MIN_MIDI && high <= RUNNER_MAX_MIDI) shifts.push(octaves);
  }
  return shifts.length ? shifts : [0];
}

/** The length of one pass of the run, in beats. */
export function runnerRunBeats(config) {
  const notes = Array.isArray(config?.notes) ? config.notes : [];
  const rest = clampNumber(config?.restBeats, 0, 8, 0);
  return notes.reduce((total, note) => total + runnerNoteBeats(config, note) + rest, 0);
}

export function defaultRunnerConfig() {
  return {
    source: 'manual',
    bpm: RUNNER_DEFAULT_BPM,
    notes: [],
    noteBeats: 0,
    restBeats: 0,
    repeats: 2,
    countInBeats: 4,
    metronome: true,
    guide: true,
    preview: false,
    attachmentId: '',
    fileName: '',
    fileSize: 0,
    trackIndex: 0,
    octaveShift: 0,
  };
}

/**
 * Read a stored runner config back into a safe shape.
 * @returns {object|null} null when the record holds no playable notes.
 */
export function normalizeRunnerConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const notes = normalizeNotes(raw.notes);
  if (!notes.length) return null;
  const source = RUNNER_SOURCES.includes(raw.source) ? raw.source : 'manual';
  return {
    source,
    bpm: clampRunnerBpm(raw.bpm),
    notes,
    noteBeats: clampRunnerNoteBeats(raw.noteBeats),
    restBeats: Math.round(clampNumber(raw.restBeats, 0, 8, 0) * 4) / 4,
    repeats: Math.round(clampNumber(raw.repeats, 0, RUNNER_MAX_REPEATS, 2)),
    countInBeats: Math.round(clampNumber(raw.countInBeats, 0, 8, 4)),
    metronome: raw.metronome !== false,
    guide: raw.guide !== false,
    // Preview mode plays every pass twice, so a saved run keeps it off until
    // the user asks for it.
    preview: raw.preview === true,
    attachmentId: typeof raw.attachmentId === 'string' ? raw.attachmentId : '',
    fileName: typeof raw.fileName === 'string' ? raw.fileName : '',
    // The byte length of the source file. It names the same score as the GP
    // player does when the player read the file without the library.
    fileSize: Math.max(0, Math.round(clampNumber(raw.fileSize, 0, Number.MAX_SAFE_INTEGER, 0))),
    trackIndex: Math.max(0, Math.round(clampNumber(raw.trackIndex, 0, 64, 0))),
    octaveShift: Math.round(clampNumber(raw.octaveShift, -3, 3, 0)),
  };
}

/** One line that tells the user what a run holds. */
export function describeRunnerConfig(config) {
  const cfg = normalizeRunnerConfig(config);
  if (!cfg) return 'No notes yet';
  const range = runnerNoteRange(cfg.notes);
  const passes = cfg.repeats === 0 ? 'endless' : `${cfg.repeats}×`;
  const count = `${cfg.notes.length} note${cfg.notes.length === 1 ? '' : 's'}`;
  const span = `${midiToNoteName(range.low)}–${midiToNoteName(range.high)}`;
  const line = `${count} · ${span} · ${cfg.bpm} BPM · ${passes}`;
  const parts = [line];
  if (cfg.preview) parts.push('preview');
  if (runnerTextCount(cfg)) parts.push('with text');
  return parts.join(' · ');
}

// --- Guitar Pro import -----------------------------------------------------

/** The free text one beat of a parsed track carries. */
function beatTextOf(model, beatIndex) {
  const beats = Array.isArray(model?.beats) ? model.beats : [];
  const index = Number(beatIndex);
  if (!Number.isInteger(index) || index < 0 || index >= beats.length) return '';
  return clampRunnerText(beats[index]?.text);
}

/**
 * The section marker of each note group, by the place of the group.
 *
 * A marker names the section: "Lip trills" or "Verse". The first note of the
 * section carries it, so a run that holds no beat text still tells the singer
 * which exercise the section asks for.
 *
 * @param {object} model a TabModel
 * @param {{key:number}[]} groups the note groups, in time order
 * @returns {Map<number,string>} the group place, and the marker it carries
 */
function markersByGroup(model, groups) {
  const out = new Map();
  const measures = Array.isArray(model?.measures) ? model.measures : [];
  for (const measure of measures) {
    const marker = clampRunnerText(measure?.marker);
    if (!marker) continue;
    const start = Number(measure?.startBeat);
    const end = Number(measure?.endBeat);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const at = groups.findIndex((group) => group.key >= start - 1e-6 && group.key < end - 1e-6);
    if (at >= 0 && !out.has(at)) out.set(at, marker);
  }
  return out;
}

/**
 * Turn one parsed Guitar Pro track model into a runner note list.
 *
 * A vocal run is one voice, so this keeps the highest pitch of each chord and
 * drops dead notes and grace notes. A tied note extends the note before it.
 *
 * Each note keeps the text the score writes over its beat, and the beat it
 * started on. A vocal warm-up score writes the vowel or the exercise there, so
 * the runner prints that text on the bar the singer sings.
 *
 * @param {object} model a TabModel from js/tab/tabModel.js
 * @param {{ octaveShift?: number, maxNotes?: number }} [options]
 * @returns {{ ok: boolean, notes: {midi:number, beats:number, text?:string, scoreBeat?:number}[], bpm: number, skipped: number, error: string|null }}
 */
export function runnerNotesFromTabModel(model, { octaveShift = 0, maxNotes = RUNNER_MAX_NOTES } = {}) {
  const events = Array.isArray(model?.events) ? model.events : [];
  const shift = Math.round(clampNumber(octaveShift, -3, 3, 0)) * 12;
  const limit = Math.max(1, Math.min(RUNNER_MAX_NOTES, Math.round(maxNotes)));

  const playable = events
    // Number(null) is 0, so a missing pitch must be rejected before the cast.
    .filter((ev) => ev && !ev.dead && !ev.grace && ev.midi != null && Number.isFinite(Number(ev.midi)))
    .map((ev, index) => ({
      midi: Number(ev.midi),
      start: Number.isFinite(Number(ev.start)) ? Number(ev.start) : null,
      duration: Number.isFinite(Number(ev.duration)) ? Number(ev.duration) : null,
      tie: !!ev.tie,
      slot: Number(ev.slot) || 0,
      beatIndex: ev.beatIndex,
      index,
    }));

  if (!playable.length) {
    return { ok: false, notes: [], bpm: RUNNER_DEFAULT_BPM, skipped: 0, error: 'This track holds no pitched notes.' };
  }

  // Fall back to the slot order when the file carries no beat positions.
  const hasStarts = playable.some((ev) => ev.start != null);
  playable.sort((a, b) => {
    const sa = hasStarts ? (a.start ?? a.slot) : a.slot;
    const sb = hasStarts ? (b.start ?? b.slot) : b.slot;
    if (sa !== sb) return sa - sb;
    return b.midi - a.midi;
  });

  // One note per start position: the highest pitch of the chord.
  const groups = [];
  let current = null;
  for (const ev of playable) {
    const key = hasStarts ? (ev.start ?? ev.slot) : ev.slot;
    if (!current || Math.abs(current.key - key) > 1e-6) {
      current = { key, top: ev };
      groups.push(current);
    } else if (ev.midi > current.top.midi) {
      current.top = ev;
    }
  }

  // A marker needs the beat positions of the file. A file that carries none
  // gets no markers, because the slot order says nothing about the bars.
  const markers = hasStarts ? markersByGroup(model, groups) : new Map();

  const notes = [];
  let skipped = 0;
  groups.forEach((group, at) => {
    const ev = group.top;
    // A tie carries the pitch of the note before it, so it lengthens that note.
    if (ev.tie && notes.length) {
      const extra = clampRunnerBeats(ev.duration ?? RUNNER_DEFAULT_BEATS);
      const last = notes[notes.length - 1];
      last.beats = clampRunnerBeats(last.beats + extra);
      return;
    }
    if (notes.length >= limit) { skipped += 1; return; }
    const midi = clampRunnerMidi(ev.midi + shift);
    if (midi == null) { skipped += 1; return; }
    const note = { midi, beats: clampRunnerBeats(ev.duration ?? RUNNER_DEFAULT_BEATS) };
    // The beat text wins over the marker: it speaks about this note, and the
    // marker speaks about the whole section.
    const text = beatTextOf(model, ev.beatIndex) || markers.get(at) || '';
    if (text) note.text = text;
    if (hasStarts && ev.start != null) note.scoreBeat = ev.start;
    notes.push(note);
  });

  if (!notes.length) {
    return {
      ok: false,
      notes: [],
      bpm: RUNNER_DEFAULT_BPM,
      skipped,
      error: 'No note of this track fits the singable range. Shift the octave and try again.',
    };
  }

  return {
    ok: true,
    notes,
    bpm: clampRunnerBpm(model?.tempo || RUNNER_DEFAULT_BPM),
    skipped,
    error: null,
  };
}

/** The pitched tracks of a parsed Guitar Pro file, for the track picker. */
export function runnerTrackOptions(gpResult) {
  const tracks = Array.isArray(gpResult?.tracks) ? gpResult.tracks : [];
  return tracks.map((track, index) => ({
    index,
    name: (track && (track.name || track.shortName)) || `Track ${index + 1}`,
    noteCount: (track?.model?.events || []).filter((ev) => ev && !ev.dead && ev.midi != null).length,
  })).filter((option) => option.noteCount > 0);
}

// --- Saved section notes ---------------------------------------------------

/**
 * Fill the empty note text of a run from the section notes of the score.
 *
 * A section note covers a beat range of the source score. Musi keeps those
 * notes next to the Guitar Pro file, so a singer who wrote "hum, then ee" on
 * bars 5 to 8 reads it again in the runner. A note of the run that starts
 * inside the range, and that carries no text of its own, takes the title of
 * the section note. The narrowest range wins, so a note about one bar beats a
 * note about the whole score.
 *
 * @param {object} config a normalized runner config
 * @param {Array<{title?:string, text?:string, startBeat?:number, endBeat?:number}>} annotations
 * @returns {object} the same config, or a copy whose notes carry the text
 */
export function fillRunnerTextFromAnnotations(config, annotations) {
  const notes = Array.isArray(config?.notes) ? config.notes : [];
  const list = Array.isArray(annotations) ? annotations : [];
  if (!notes.length || !list.length) return config;

  const ranges = [];
  for (const anno of list) {
    const startBeat = Number(anno?.startBeat);
    const endBeat = Number(anno?.endBeat);
    if (!Number.isFinite(startBeat) || !Number.isFinite(endBeat) || endBeat <= startBeat) continue;
    const text = clampRunnerText(anno?.title) || clampRunnerText(anno?.text);
    if (!text) continue;
    ranges.push({ startBeat, endBeat, text });
  }
  if (!ranges.length) return config;
  ranges.sort((a, b) => (a.endBeat - a.startBeat) - (b.endBeat - b.startBeat));

  let changed = false;
  const filled = notes.map((note) => {
    if (clampRunnerText(note?.text)) return note;
    const beat = Number(note?.scoreBeat);
    if (!Number.isFinite(beat)) return note;
    const hit = ranges.find((range) => beat >= range.startBeat - 1e-6 && beat < range.endBeat - 1e-6);
    if (!hit) return note;
    changed = true;
    return { ...note, text: hit.text };
  });
  return changed ? { ...config, notes: filled } : config;
}

/**
 * The octave shift that moves a note list closest to a comfortable vocal
 * range. Guitar parts sit well below a singer, so an import needs this.
 */
export function suggestOctaveShift(notes, { targetLow = 55, targetHigh = 72 } = {}) {
  const range = runnerNoteRange(notes);
  if (!Number.isFinite(range.low)) return 0;
  const targetCenter = (targetLow + targetHigh) / 2;
  const center = (range.low + range.high) / 2;
  const shift = Math.round((targetCenter - center) / 12);
  return Math.max(-3, Math.min(3, shift));
}
