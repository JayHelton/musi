/**
 * Same-origin sample pack manifest parser and in-memory registry.
 */

const packs = new Map();

const REQUIRED_ROOT = ['id', 'version', 'license', 'attribution', 'sampleRate', 'instrument'];

function normalizeVelocity(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return n;
  if (n > 1) return n / 127;
  return n;
}

function isForeignFileUrl(file) {
  if (typeof file !== 'string' || !file) return true;
  if (file.includes('..')) return true;
  if (file.startsWith('/') || /^[a-zA-Z]:/.test(file)) return true;

  if (/^https?:\/\//i.test(file)) {
    if (typeof globalThis !== 'undefined' && globalThis.window?.location) {
      try {
        const url = new URL(file, globalThis.window.location.href);
        return url.origin !== globalThis.window.location.origin;
      } catch {
        return true;
      }
    }
    return true;
  }
  return false;
}

function isDrumPack(json) {
  return json.drumNoteMap != null && typeof json.drumNoteMap === 'object';
}

function validateMidiProgram(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return true;
  if (Array.isArray(value) && value.length > 0 && value.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return true;
  }
  return false;
}

function normalizeSample(sample) {
  const out = { ...sample };
  if (sample.velocityMin != null) out.velocityMin = normalizeVelocity(sample.velocityMin);
  if (sample.velocityMax != null) out.velocityMax = normalizeVelocity(sample.velocityMax);
  return out;
}

/**
 * Parse and validate a pack manifest object.
 * @param {object} json
 * @returns {{ ok: true, manifest: object } | { ok: false, error: string }}
 */
export function parsePackManifest(json) {
  if (!json || typeof json !== 'object') {
    return { ok: false, error: 'Manifest must be an object.' };
  }

  for (const key of REQUIRED_ROOT) {
    if (json[key] == null || json[key] === '') {
      return { ok: false, error: `Missing required field: ${key}.` };
    }
  }

  const drums = isDrumPack(json);
  if (drums) {
    if (!json.drumNoteMap || typeof json.drumNoteMap !== 'object') {
      return { ok: false, error: 'Drum pack requires drumNoteMap.' };
    }
  } else if (!validateMidiProgram(json.midiProgram)) {
    return { ok: false, error: 'Pitched pack requires midiProgram as a number or number array.' };
  }

  const samples = Array.isArray(json.samples) ? json.samples : null;
  if (!samples) {
    return { ok: false, error: 'samples must be an array.' };
  }

  for (const sample of samples) {
    if (!sample || typeof sample !== 'object') {
      return { ok: false, error: 'Each sample entry must be an object.' };
    }
    if (sample.file != null && isForeignFileUrl(sample.file)) {
      return { ok: false, error: 'Sample file path must be same-origin and stay inside the pack directory.' };
    }
  }

  const manifest = {
    ...json,
    samples: samples.map((s) => normalizeSample(s)),
  };

  return { ok: true, manifest };
}

/** Store a parsed manifest in the registry. */
export function registerPack(manifest) {
  const parsed = parsePackManifest(manifest);
  if (!parsed.ok) return parsed;
  packs.set(parsed.manifest.id, parsed.manifest);
  return parsed;
}

/** Return one registered pack or null. */
export function getPack(packId) {
  return packs.get(packId) ?? null;
}

/** Return all registered pack ids. */
export function listPacks() {
  return [...packs.keys()];
}

function packCoversProgram(pack, program) {
  if (isDrumPack(pack)) return false;
  const mp = pack.midiProgram;
  if (typeof mp === 'number') return mp === program;
  if (Array.isArray(mp)) return mp.includes(program);
  return false;
}

/** Return pack ids that cover the given MIDI programs. */
export function packsForPrograms(programs) {
  if (!Array.isArray(programs) || programs.length === 0) return [];
  const ids = [];
  for (const pack of packs.values()) {
    if (programs.some((p) => packCoversProgram(pack, p))) {
      ids.push(pack.id);
    }
  }
  return ids;
}

/** Return pack ids whose drumNoteMap includes any of the note numbers. */
export function packsForDrumMap(noteNumbers) {
  if (!Array.isArray(noteNumbers) || noteNumbers.length === 0) return [];
  const ids = [];
  for (const pack of packs.values()) {
    if (!isDrumPack(pack)) continue;
    const map = pack.drumNoteMap;
    const hit = noteNumbers.some((n) => map[String(n)] != null || map[n] != null);
    if (hit) ids.push(pack.id);
  }
  return ids;
}

/** Clear the registry for Node tests. */
export function __resetPackRegistryForTests() {
  packs.clear();
}
