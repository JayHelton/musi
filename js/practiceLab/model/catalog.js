// The instrument and technique catalog of Practice Lab.
//
// One record holds both catalogs. The seed lists live here. A removed seed
// entry goes into `hidden`, so a later release can change the seed list
// without bringing the removed entry back. A removed custom entry leaves the
// array.
//
// Every function here is pure. The store adapter reads and writes the record.

/** The record id. One record holds the whole catalog. */
export const CATALOG_ID = 'catalog';

/** The seed instruments, in display order. */
export const SEED_INSTRUMENTS = [
  'Guitar',
  'Bass',
  'Piano',
  'Drums',
  'Voice',
];

/** The seed techniques of each seed instrument. */
export const SEED_TECHNIQUES = {
  guitar: [
    'Alternate Picking', 'Sweep Picking', 'Legato', 'Tapping', 'Hybrid Picking',
    'Economy Picking', 'Bending', 'Vibrato', 'Palm Muting', 'String Skipping',
  ],
  bass: [
    'Fingerstyle', 'Slap', 'Pop', 'Pick Playing', 'Muting', 'Position Shifts',
  ],
  piano: [
    'Scales', 'Arpeggios', 'Hand Independence', 'Voicings', 'Sight Reading',
  ],
  drums: [
    'Single Strokes', 'Double Strokes', 'Paradiddles', 'Foot Control', 'Independence',
  ],
  voice: [
    'Breath Control', 'Pitch Accuracy', 'Range', 'Vowel Shape',
  ],
};

/**
 * Trim a label and collapse the inner spaces.
 * @param {string} label
 * @returns {string}
 */
export function normaliseLabel(label) {
  return String(label == null ? '' : label).replace(/\s+/g, ' ').trim();
}

/**
 * The id of a label: lowercase, with hyphens for the spaces.
 * @param {string} label
 * @returns {string}
 */
export function labelToId(label) {
  return normaliseLabel(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function seedEntry(label) {
  return { id: labelToId(label), label: normaliseLabel(label), custom: false };
}

/** A fresh catalog record built from the seed lists. */
export function seedCatalog() {
  const techniques = {};
  for (const key of Object.keys(SEED_TECHNIQUES)) {
    techniques[key] = SEED_TECHNIQUES[key].map(seedEntry);
  }
  return {
    id: CATALOG_ID,
    instruments: SEED_INSTRUMENTS.map(seedEntry),
    techniques,
    hidden: { instruments: [], techniques: {} },
    updatedAt: '',
  };
}

function entryList(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of value) {
    if (!raw) continue;
    const label = normaliseLabel(raw.label);
    if (!label) continue;
    const id = raw.id ? String(raw.id) : labelToId(label);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label, custom: raw.custom === true });
  }
  return out;
}

function idList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter(Boolean);
}

/**
 * Merge a stored record with the seed lists.
 *
 * The seed entries come first, in seed order, minus the hidden ones. The
 * custom entries follow, in the order the player added them.
 *
 * @param {Object|null} stored
 * @returns {Object} a complete catalog record
 */
export function mergeCatalog(stored) {
  const seed = seedCatalog();
  const record = stored && typeof stored === 'object' ? stored : {};
  const hidden = record.hidden && typeof record.hidden === 'object' ? record.hidden : {};
  const hiddenInstruments = new Set(idList(hidden.instruments));
  const hiddenTechniques = {};
  const hiddenTechRecord = hidden.techniques && typeof hidden.techniques === 'object'
    ? hidden.techniques
    : {};
  for (const key of Object.keys(hiddenTechRecord)) {
    hiddenTechniques[key] = new Set(idList(hiddenTechRecord[key]));
  }

  const storedInstruments = entryList(record.instruments);
  const customInstruments = storedInstruments.filter(e => e.custom);
  const instruments = [
    ...seed.instruments.filter(e => !hiddenInstruments.has(e.id)),
    ...customInstruments,
  ];

  const storedTechniques = record.techniques && typeof record.techniques === 'object'
    ? record.techniques
    : {};
  const techniques = {};
  const keys = new Set([...Object.keys(seed.techniques), ...Object.keys(storedTechniques)]);
  for (const key of keys) {
    const seedList = seed.techniques[key] || [];
    const hide = hiddenTechniques[key] || new Set();
    const custom = entryList(storedTechniques[key]).filter(e => e.custom);
    techniques[key] = [
      ...seedList.filter(e => !hide.has(e.id)),
      ...custom,
    ];
  }

  return {
    id: CATALOG_ID,
    instruments,
    techniques,
    hidden: {
      instruments: [...hiddenInstruments],
      techniques: Object.fromEntries(
        Object.entries(hiddenTechniques).map(([k, v]) => [k, [...v]]),
      ),
    },
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
  };
}

/** The instruments of a catalog. */
export function instrumentsOf(catalog) {
  return Array.isArray(catalog?.instruments) ? catalog.instruments : [];
}

/**
 * The techniques of one instrument. An instrument with no list yields an empty
 * array, and the free-text field still accepts a technique.
 */
export function techniquesOf(catalog, instrumentId) {
  const map = catalog?.techniques;
  if (!map || !instrumentId) return [];
  const list = map[instrumentId];
  return Array.isArray(list) ? list : [];
}

function cloneCatalog(catalog) {
  const techniques = {};
  for (const [key, list] of Object.entries(catalog.techniques || {})) {
    techniques[key] = list.map(e => ({ ...e }));
  }
  const hidden = catalog.hidden || { instruments: [], techniques: {} };
  const hiddenTechniques = {};
  for (const [key, list] of Object.entries(hidden.techniques || {})) {
    hiddenTechniques[key] = [...list];
  }
  return {
    id: CATALOG_ID,
    instruments: (catalog.instruments || []).map(e => ({ ...e })),
    techniques,
    hidden: { instruments: [...(hidden.instruments || [])], techniques: hiddenTechniques },
    updatedAt: catalog.updatedAt || '',
  };
}

/**
 * Add a custom instrument. A duplicate label selects the entry that exists.
 * @returns {{ catalog: Object, entry: Object|null, added: boolean }}
 */
export function addInstrument(catalog, label) {
  const clean = normaliseLabel(label);
  if (!clean) return { catalog, entry: null, added: false };
  const id = labelToId(clean);
  if (!id) return { catalog, entry: null, added: false };

  const next = cloneCatalog(catalog);
  next.hidden.instruments = next.hidden.instruments.filter(hid => hid !== id);
  const found = next.instruments.find(e => e.id === id);
  if (found) {
    const merged = mergeCatalog(next);
    return { catalog: merged, entry: merged.instruments.find(e => e.id === id), added: false };
  }
  const entry = { id, label: clean, custom: true };
  next.instruments.push(entry);
  if (!next.techniques[id]) next.techniques[id] = [];
  return { catalog: mergeCatalog(next), entry, added: true };
}

/** Remove an instrument. A seed entry goes into `hidden`. */
export function removeInstrument(catalog, instrumentId) {
  const id = String(instrumentId || '');
  if (!id) return catalog;
  const next = cloneCatalog(catalog);
  const found = next.instruments.find(e => e.id === id);
  if (!found) return catalog;
  next.instruments = next.instruments.filter(e => e.id !== id);
  if (!found.custom && !next.hidden.instruments.includes(id)) {
    next.hidden.instruments.push(id);
  }
  return mergeCatalog(next);
}

/**
 * Add a custom technique to one instrument.
 * @returns {{ catalog: Object, entry: Object|null, added: boolean }}
 */
export function addTechnique(catalog, instrumentId, label) {
  const owner = String(instrumentId || '');
  const clean = normaliseLabel(label);
  if (!owner || !clean) return { catalog, entry: null, added: false };
  const id = labelToId(clean);
  if (!id) return { catalog, entry: null, added: false };

  const next = cloneCatalog(catalog);
  if (next.hidden.techniques[owner]) {
    next.hidden.techniques[owner] = next.hidden.techniques[owner].filter(hid => hid !== id);
  }
  if (!Array.isArray(next.techniques[owner])) next.techniques[owner] = [];
  const found = next.techniques[owner].find(e => e.id === id);
  if (found) {
    const merged = mergeCatalog(next);
    const entry = techniquesOf(merged, owner).find(e => e.id === id);
    return { catalog: merged, entry, added: false };
  }
  const entry = { id, label: clean, custom: true };
  next.techniques[owner].push(entry);
  return { catalog: mergeCatalog(next), entry, added: true };
}

/** Remove a technique of one instrument. A seed entry goes into `hidden`. */
export function removeTechnique(catalog, instrumentId, techniqueId) {
  const owner = String(instrumentId || '');
  const id = String(techniqueId || '');
  if (!owner || !id) return catalog;
  const next = cloneCatalog(catalog);
  const list = Array.isArray(next.techniques[owner]) ? next.techniques[owner] : [];
  const found = list.find(e => e.id === id);
  if (!found) return catalog;
  next.techniques[owner] = list.filter(e => e.id !== id);
  if (!found.custom) {
    if (!Array.isArray(next.hidden.techniques[owner])) next.hidden.techniques[owner] = [];
    if (!next.hidden.techniques[owner].includes(id)) next.hidden.techniques[owner].push(id);
  }
  return mergeCatalog(next);
}
