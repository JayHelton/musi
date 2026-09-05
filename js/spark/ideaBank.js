// The idea bank of Riff Spark.
//
// Ideation and editing are separate jobs. The bank is where an idea goes the
// moment the player likes it, with no judgment. Each entry keeps the cadence,
// the pedal riff when there is one, the tempo, the tonic, and a line of
// text. Later the player combines entries, or sends one to Notes.
//
// Storage is localStorage, read and written defensively, so a blocked store
// leaves the tool usable with an empty bank.

import { normalizeCadence, describeCadence, cadenceStats } from './cadenceModel.js';
import { normalizePedal, describePedal, attackLine } from './pedalModel.js';

const STORAGE_KEY = 'musi.spark.ideas';
const LIMIT = 200;
const NOTE_LIMIT = 500;

function storage() {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch (e) {
    return null;
  }
}

function readRaw() {
  const store = storage();
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function writeRaw(list) {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    return false;
  }
}

function uid() {
  return `idea-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * An idea read back from storage or from a keep call.
 * @param {*} raw
 * @returns {Object|null}
 */
export function normalizeIdea(raw) {
  if (!raw || typeof raw !== 'object' || !raw.cadence) return null;
  const cadence = normalizeCadence(raw.cadence);
  const pedal = normalizePedal(raw.pedal);
  const tempo = Math.round(Number(raw.tempo));
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    kind: pedal ? 'pedal' : 'cadence',
    title: typeof raw.title === 'string' ? raw.title.slice(0, 80) : '',
    tempo: Number.isFinite(tempo) ? tempo : 120,
    tonic: typeof raw.tonic === 'string' ? raw.tonic : 'A',
    tuning: typeof raw.tuning === 'string' ? raw.tuning : '',
    cadence,
    pedal,
    note: typeof raw.note === 'string' ? raw.note.slice(0, NOTE_LIMIT) : '',
  };
}

/** Every kept idea, newest first. */
export function listIdeas() {
  return readRaw().map(normalizeIdea).filter(Boolean)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

/**
 * Keep an idea.
 * @param {Object} idea see normalizeIdea
 * @returns {Object|null} the stored entry
 */
export function keepIdea(idea) {
  const entry = normalizeIdea(idea);
  if (!entry) return null;
  const list = [entry, ...readRaw().filter(item => item && item.id !== entry.id)].slice(0, LIMIT);
  writeRaw(list);
  return entry;
}

/** Drop one idea. */
export function removeIdea(id) {
  const list = readRaw().filter(item => item && item.id !== id);
  return writeRaw(list);
}

/** Change the note of one idea. */
export function setIdeaNote(id, note) {
  const list = readRaw().map(item => (item && item.id === id
    ? { ...item, note: String(note || '').slice(0, NOTE_LIMIT) }
    : item));
  return writeRaw(list);
}

/** Drop every idea. */
export function clearIdeas() {
  return writeRaw([]);
}

/** A default title for an idea. */
export function ideaTitle(idea) {
  if (idea.title) return idea.title;
  const stats = cadenceStats(idea.cadence);
  const shape = idea.cadence.shape;
  const head = idea.kind === 'pedal' ? `${idea.tonic} pedal` : 'Cadence';
  return `${head} · ${idea.cadence.meter} · ${shape} · ${stats.attacks} attacks`;
}

/**
 * The idea as plain text, for Notes or the clipboard.
 * @param {Object} idea
 * @returns {string}
 */
export function ideaText(idea) {
  const lines = [];
  lines.push(ideaTitle(idea));
  lines.push(`Tempo ${idea.tempo} BPM · ${idea.cadence.meter} · ${idea.cadence.bars} bar${idea.cadence.bars > 1 ? 's' : ''} · seed ${idea.cadence.seed}`);
  lines.push(`Rhythm: ${describeCadence(idea.cadence)}`);
  if (idea.pedal) {
    lines.push(`Notes:  ${describePedal(idea.cadence, idea.pedal, idea.tonic)}`);
    lines.push(`Degrees: ${describePedal(idea.cadence, idea.pedal, idea.tonic, { degrees: true })}`);
    lines.push(`Attacks: ${attackLine(idea.pedal, idea.tonic)}`);
  }
  lines.push('Legend: X chug, o pitched note, # stab, - rest.');
  if (idea.note) lines.push('', idea.note);
  return lines.join('\n');
}
