/**
 * Import instrument formats other programs write, and make a Musi sample pack
 * manifest from them.
 *
 * Two formats come in here:
 *
 *   - **SFZ** — a text file with `<region>` blocks. Each region names one audio
 *     file, one key range, and one velocity range.
 *   - **.multisample** — a ZIP with a `multisample.xml` file. Each `<sample>`
 *     element names one audio file, one key range, and one velocity range.
 *
 * Both formats end as the same manifest that `js/audio/samplePackRegistry.js`
 * reads, so the score player and the pitch tools play them with no other
 * change.
 *
 * The module is DOM-free and reads no files. The caller passes the text and
 * gets a manifest back. `js/audio/userSounds.js` opens the archive and stores
 * the audio bytes.
 */

import { midiToDrumInstrument } from '../tab/gpPercussion.js';

/** The player reads one sample for each note, so a pack over this is thinned. */
export const MAX_MANIFEST_SAMPLES = 128;

/** A pack the user imports claims no MIDI program. The user picks it by name. */
const NO_PROGRAM = [];

const NOTE_SEMITONES = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/**
 * MIDI number for a key value. SFZ and .multisample both write a number, and
 * SFZ also allows a note name such as `c4`, `f#3`, or `bb-1`. Middle C is C4.
 * @param {string|number} value
 * @returns {number|null}
 */
export function keyToMidi(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : null;
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (/^-?\d+$/.test(text)) return Number(text);

  const match = /^([a-gA-G])([#bs]*)(-?\d+)$/.exec(text);
  if (!match) return null;
  const base = NOTE_SEMITONES[match[1].toLowerCase()];
  let offset = 0;
  for (const ch of match[2]) {
    if (ch === '#' || ch === 's') offset += 1;
    if (ch === 'b') offset -= 1;
  }
  const octave = Number(match[3]);
  const midi = (octave + 1) * 12 + base + offset;
  return Number.isFinite(midi) ? midi : null;
}

function clampMidi(value) {
  if (!Number.isFinite(value)) return null;
  const n = Math.round(value);
  if (n < 0 || n > 127) return null;
  return n;
}

function normalizeRelativePath(raw) {
  const text = String(raw ?? '').trim().replace(/\\/g, '/');
  if (!text) return '';
  const parts = [];
  for (const part of text.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      // A pack file never leaves its own folder.
      return '';
    }
    parts.push(part);
  }
  if (!parts.length) return '';
  if (/^[a-zA-Z]:$/.test(parts[0])) return '';
  return parts.join('/');
}

function dbToGain(db) {
  const n = Number(db);
  if (!Number.isFinite(n)) return 1;
  const gain = 10 ** (n / 20);
  if (!Number.isFinite(gain)) return 1;
  return Math.max(0.05, Math.min(4, gain));
}

function velocityFraction(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n <= 0) return 0;
  if (n >= 127) return 1;
  return n / 127;
}

/* ── SFZ ────────────────────────────────────────────────────── */

const SFZ_HEADERS = new Set([
  'control', 'global', 'master', 'group', 'region', 'curve', 'effect', 'midi',
]);

function stripSfzComments(text) {
  let out = String(text ?? '');
  out = out.replace(/\/\*[\s\S]*?\*\//g, ' ');
  out = out.replace(/\/\/[^\n\r]*/g, ' ');
  return out;
}

function applySfzDefines(text) {
  const defines = new Map();
  const body = text.replace(/#define\s+(\$[A-Za-z0-9_]+)\s+(\S+)/g, (_m, name, value) => {
    defines.set(name, value);
    return ' ';
  });
  if (!defines.size) return body;
  let out = body;
  for (const [name, value] of defines) {
    out = out.split(name).join(value);
  }
  return out;
}

/**
 * Put the text of every `#include` in place of the include line.
 * @param {string} text
 * @param {Map<string, string>} includes lower-case path → file text
 * @param {number} depth
 */
function applySfzIncludes(text, includes, depth = 0) {
  if (!includes || !includes.size || depth > 4) return text;
  return text.replace(/#include\s+"([^"]+)"/g, (_m, rawPath) => {
    const path = normalizeRelativePath(rawPath).toLowerCase();
    const found = includes.get(path)
      || includes.get(path.split('/').pop() || '');
    if (!found) return ' ';
    return applySfzIncludes(stripSfzComments(found), includes, depth + 1);
  });
}

/**
 * Read one SFZ file into its regions. Each region carries the opcodes of the
 * `<global>`, `<master>`, and `<group>` blocks above it.
 * @param {string} rawText
 * @param {{ includes?: Map<string, string> }} [options]
 * @returns {{ control: Record<string, string>, regions: Array<Record<string, string>> }}
 */
export function parseSfz(rawText, { includes } = {}) {
  const text = applySfzDefines(applySfzIncludes(stripSfzComments(rawText), includes));

  const control = {};
  const scopes = { global: {}, master: {}, group: {} };
  const regions = [];
  let current = null;
  let section = '';

  const token = /<([a-zA-Z_]+)>|([a-zA-Z0-9_]+)=/g;
  const matches = [];
  let m;
  while ((m = token.exec(text)) !== null) {
    matches.push({ header: m[1] || null, opcode: m[2] || null, start: m.index, end: token.lastIndex });
  }

  for (let i = 0; i < matches.length; i += 1) {
    const entry = matches[i];
    if (entry.header) {
      const name = entry.header.toLowerCase();
      if (!SFZ_HEADERS.has(name)) {
        section = 'other';
        current = null;
        continue;
      }
      section = name;
      if (name === 'global') {
        scopes.global = {};
        scopes.master = {};
        scopes.group = {};
        current = scopes.global;
      } else if (name === 'master') {
        scopes.master = {};
        scopes.group = {};
        current = scopes.master;
      } else if (name === 'group') {
        scopes.group = {};
        current = scopes.group;
      } else if (name === 'region') {
        const region = { ...scopes.global, ...scopes.master, ...scopes.group };
        regions.push(region);
        current = region;
      } else if (name === 'control') {
        current = control;
      } else {
        current = null;
      }
      continue;
    }

    if (!current) continue;
    const next = matches[i + 1];
    const value = text.slice(entry.end, next ? next.start : text.length).trim();
    const opcode = entry.opcode.toLowerCase();
    // `sample=` holds a path, and a path may hold spaces. Every other opcode
    // holds one word, so cut the value at the first space.
    current[opcode] = opcode === 'sample' ? value : value.split(/\s+/)[0] || '';
  }

  return { control, regions: regions.filter((r) => r.sample) };
}

function sfzRegionToSample(region, defaultPath) {
  const file = normalizeRelativePath(`${defaultPath}${region.sample}`);
  if (!file) return null;

  const keyCenter = region.pitch_keycenter != null ? region.pitch_keycenter : region.key;
  let rootMidi = clampMidi(keyToMidi(keyCenter));
  const lokey = clampMidi(keyToMidi(region.lokey != null ? region.lokey : region.key));
  const hikey = clampMidi(keyToMidi(region.hikey != null ? region.hikey : region.key));
  if (rootMidi == null) rootMidi = lokey;
  if (rootMidi == null) rootMidi = 60;

  return {
    file,
    rootMidi,
    lowMidi: lokey != null ? lokey : rootMidi,
    highMidi: hikey != null ? hikey : rootMidi,
    velocityMin: velocityFraction(region.lovel, 0),
    velocityMax: velocityFraction(region.hivel, 1),
    seq: Number(region.seq_position) || 1,
    gainTrim: dbToGain(region.volume),
  };
}

/* ── .multisample ───────────────────────────────────────────── */

function readXmlAttributes(tag) {
  const attrs = {};
  const re = /([A-Za-z_][A-Za-z0-9_:-]*)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(tag)) !== null) {
    attrs[m[1].toLowerCase()] = m[2];
  }
  return attrs;
}

/**
 * Read a `multisample.xml` file into flat sample entries.
 * The reader uses text search, so it runs in Node with no DOM.
 * @param {string} xml
 * @returns {{ name: string, samples: Array<object> }}
 */
export function parseMultisample(xml) {
  const text = String(xml ?? '');
  const rootTag = /<multisample\b[^>]*>/i.exec(text);
  const name = rootTag ? readXmlAttributes(rootTag[0]).name || '' : '';

  const samples = [];
  const blockRe = /<sample\b([^>]*?)(\/>|>([\s\S]*?)<\/sample>)/gi;
  let m;
  while ((m = blockRe.exec(text)) !== null) {
    const head = readXmlAttributes(m[1]);
    const body = m[3] || '';
    const file = normalizeRelativePath(head.file || head.filename || head.uri || '');
    if (!file) continue;

    const keyTag = /<key\b[^>]*\/?>/i.exec(body);
    const velTag = /<velocity\b[^>]*\/?>/i.exec(body);
    const key = keyTag ? readXmlAttributes(keyTag[0]) : {};
    const vel = velTag ? readXmlAttributes(velTag[0]) : {};

    let rootMidi = clampMidi(keyToMidi(key.root != null ? key.root : key.center));
    const lowMidi = clampMidi(keyToMidi(key.low));
    const highMidi = clampMidi(keyToMidi(key.high));
    if (rootMidi == null) rootMidi = lowMidi != null ? lowMidi : 60;

    samples.push({
      file,
      rootMidi,
      lowMidi: lowMidi != null ? lowMidi : rootMidi,
      highMidi: highMidi != null ? highMidi : rootMidi,
      velocityMin: velocityFraction(vel.low, 0),
      velocityMax: velocityFraction(vel.high, 1),
      seq: 1,
      gainTrim: dbToGain(head.gain),
    });
  }

  return { name, samples };
}

/* ── Shared shaping ─────────────────────────────────────────── */

/**
 * True when the entries look like a drum kit: one key holds one sound, and the
 * keys do not run in a scale of playable ranges.
 * @param {Array<object>} entries
 * @returns {'percussion'|'pitched'}
 */
export function detectPackKind(entries) {
  const list = Array.isArray(entries) ? entries : [];
  if (list.length < 3) return 'pitched';

  const roots = new Set();
  let singleKey = 0;
  for (const entry of list) {
    roots.add(entry.rootMidi);
    const span = Math.abs((entry.highMidi ?? entry.rootMidi) - (entry.lowMidi ?? entry.rootMidi));
    if (span === 0) singleKey += 1;
  }
  if (singleKey / list.length < 0.9) return 'pitched';

  // A pitched pack with one key for each sample still covers a wide range in
  // steps of one or two semitones. A kit puts unrelated sounds side by side and
  // stays inside the General MIDI percussion range.
  const sorted = [...roots].sort((a, b) => a - b);
  const inGmRange = sorted.filter((n) => n >= 27 && n <= 87).length;
  if (inGmRange / sorted.length < 0.8) return 'pitched';
  return sorted.length <= 32 ? 'percussion' : 'pitched';
}

/** A name that reads well in the sound list. */
function cleanName(raw, fallback) {
  const text = String(raw ?? '').trim().replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return text || fallback;
}

function slug(raw) {
  const text = String(raw ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return text.slice(0, 32) || 'pack';
}

/** A pack id no core pack uses. */
export function makeImportedPackId(name) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `user-${slug(name)}-${rand}`;
}

/**
 * Drop the entries the player would never reach, then cut the list to the file
 * limit.
 *
 * The player picks one sample for each note, so a round robin past the first
 * one never sounds. When the pack is still too big, the velocity layers
 * collapse to one layer for each key. When it is still too big, the keys thin
 * out evenly across the range.
 * @param {Array<object>} entries
 * @param {number} limit
 * @returns {Array<object>}
 */
export function thinSampleEntries(entries, limit = MAX_MANIFEST_SAMPLES) {
  const list = (Array.isArray(entries) ? entries : []).filter((e) => e && e.file);
  if (!list.length) return [];

  // One round robin only.
  const bySlot = new Map();
  for (const entry of list) {
    const key = `${entry.rootMidi}|${entry.velocityMin}|${entry.velocityMax}`;
    const held = bySlot.get(key);
    if (!held || entry.seq < held.seq) bySlot.set(key, entry);
  }
  let kept = [...bySlot.values()].sort((a, b) => (
    a.rootMidi - b.rootMidi || a.velocityMin - b.velocityMin
  ));
  if (kept.length <= limit) return kept;

  // One velocity layer for each key: the layer that covers the loudest notes.
  const byRoot = new Map();
  for (const entry of kept) {
    const held = byRoot.get(entry.rootMidi);
    if (!held || entry.velocityMax > held.velocityMax) byRoot.set(entry.rootMidi, entry);
  }
  kept = [...byRoot.values()]
    .map((entry) => ({ ...entry, velocityMin: 0, velocityMax: 1 }))
    .sort((a, b) => a.rootMidi - b.rootMidi);
  if (kept.length <= limit) return kept;

  // Still too many keys: keep an even spread over the range.
  const step = kept.length / limit;
  const spread = [];
  for (let i = 0; i < limit; i += 1) {
    spread.push(kept[Math.min(kept.length - 1, Math.floor(i * step))]);
  }
  return spread;
}

function drumNoteMapFor(entries) {
  const map = {};
  for (const entry of entries) {
    const instrument = midiToDrumInstrument(entry.rootMidi, { velocity: 0.8 });
    if (instrument) map[String(entry.rootMidi)] = instrument;
  }
  return map;
}

function manifestSamples(entries, kind) {
  const usedArticulations = new Set();
  return entries.map((entry) => {
    let articulation = 'sustain';
    if (kind === 'percussion') {
      const instrument = midiToDrumInstrument(entry.rootMidi, { velocity: 0.8 });
      // Two keys may share one lane. The second key keeps its own name so the
      // player still finds it by note number.
      articulation = instrument && !usedArticulations.has(instrument)
        ? instrument
        : `key${entry.rootMidi}`;
      usedArticulations.add(articulation);
    }
    return {
      file: entry.file,
      rootMidi: entry.rootMidi,
      velocityMin: entry.velocityMin,
      velocityMax: entry.velocityMax,
      roundRobin: 0,
      articulation,
      loopStart: null,
      loopEnd: null,
      gainTrim: entry.gainTrim ?? 1,
    };
  });
}

/**
 * Make a Musi pack manifest from flat sample entries.
 * @param {Array<object>} entries
 * @param {{ name: string, kind?: 'pitched'|'percussion', source?: string, id?: string }} options
 * @returns {{ ok: true, manifest: object, kind: string, files: string[] } | { ok: false, error: string }}
 */
export function buildManifest(entries, { name, kind, source, id } = {}) {
  const list = Array.isArray(entries) ? entries.filter((e) => e && e.file) : [];
  if (!list.length) {
    return { ok: false, error: 'The file names no samples.' };
  }

  const packKind = kind === 'percussion' || kind === 'pitched'
    ? kind
    : detectPackKind(list);
  const kept = thinSampleEntries(list);
  const packName = cleanName(name, packKind === 'percussion' ? 'Drum kit' : 'Instrument');

  const manifest = {
    id: id || makeImportedPackId(packName),
    version: '1',
    license: 'Not stated',
    attribution: source ? `Imported from ${source}` : 'Imported on this device',
    sampleRate: 44100,
    instrument: packName,
    // The format states no MIDI program, so the pack plays only when the user
    // names it in Settings.
    pickOnly: true,
    samples: manifestSamples(kept, packKind),
  };

  if (packKind === 'percussion') {
    manifest.midiProgram = null;
    manifest.drumNoteMap = drumNoteMapFor(kept);
  } else {
    manifest.midiProgram = NO_PROGRAM;
  }

  const files = [...new Set(kept.map((e) => e.file))];
  return { ok: true, manifest, kind: packKind, files };
}

/**
 * Build a manifest from one SFZ file.
 * @param {{ text: string, name?: string, kind?: string, includes?: Map<string,string>, source?: string }} options
 */
export function buildManifestFromSfz({ text, name, kind, includes, source }) {
  const { control, regions } = parseSfz(text, { includes });
  if (!regions.length) {
    return { ok: false, error: 'The SFZ file has no region that names a sample.' };
  }
  let defaultPath = normalizeRelativePath(control.default_path || '');
  if (defaultPath) defaultPath += '/';

  const entries = regions.map((r) => sfzRegionToSample(r, defaultPath)).filter(Boolean);
  if (!entries.length) {
    return { ok: false, error: 'Every sample path in the SFZ file is outside the pack.' };
  }
  return buildManifest(entries, { name, kind, source });
}

/**
 * Build a manifest from one `multisample.xml` file.
 * @param {{ xml: string, name?: string, kind?: string, source?: string }} options
 */
export function buildManifestFromMultisample({ xml, name, kind, source }) {
  const parsed = parseMultisample(xml);
  if (!parsed.samples.length) {
    return { ok: false, error: 'The multisample file names no samples.' };
  }
  return buildManifest(parsed.samples, { name: name || parsed.name, kind, source });
}
