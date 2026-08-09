// Node tests for Exercises bulk-upload engine.
// Run: node tests/exercises/bulk-import.mjs

import assert from 'node:assert/strict';
import {
  BULK_MAX_FILE_BYTES,
  classifyUploadFile,
  baseNameOf,
  analyzeBulkFiles,
  planEntrySegments,
  describeEntryPlan,
  importBulkEntries,
} from '../../js/exercisesBulk.js';
import { autoSplitByMarkers } from '../../js/gpPlayer/exerciseSegments.js';
import { buildMeasureDigests } from '../../js/gpPlayer/measureDigest.js';

function fakeFile({ name, type = '', size = 0, bytes = null, text = null }) {
  return {
    name,
    type,
    size: size || (bytes ? bytes.byteLength : 0),
    async arrayBuffer() {
      if (bytes) return bytes;
      return new ArrayBuffer(0);
    },
    async text() {
      return text ?? '';
    },
  };
}

function makeGpModel({ measures, events = [] }) {
  return {
    tuning: 'Standard',
    strings: [
      { note: 'E', oct: 2, label: 'E', openMidi: 40 },
      { note: 'A', oct: 2, label: 'A', openMidi: 45 },
    ],
    events,
    measures,
    tempo: 120,
    totalBeats: measures.length ? measures[measures.length - 1].endBeat : 0,
    slots: measures.length ? measures[measures.length - 1].endSlot : 0,
    techniqueCounts: {},
    warnings: [],
  };
}

function makeGpResult(model) {
  return {
    format: 'gp5',
    tracks: [{ name: 'Guitar', model }],
    drumTracks: [],
    parts: [],
    defaultIndex: 0,
    model,
    ascii: '',
    meta: {},
  };
}

function makeMarkedScore() {
  const measures = [];
  const events = [];
  for (let i = 0; i < 12; i++) {
    const startBeat = i * 4;
    const endBeat = startBeat + 4;
    const marker = i === 2 ? 'Verse' : i === 5 ? 'Chorus' : i === 8 ? 'Bridge' : null;
    measures.push({
      startSlot: i * 4,
      endSlot: (i + 1) * 4,
      startBeat,
      endBeat,
      marker,
      timeSig: [4, 4],
    });
    events.push({
      slot: startBeat,
      start: startBeat,
      duration: 1,
      stringIndex: 0,
      fret: i % 5,
      midi: 40 + (i % 5),
      pc: 4,
      techniques: [],
      dead: false,
    });
  }
  const model = makeGpModel({ measures, events });
  return makeGpResult(model);
}

function makeUnmarkedScore(barCount = 12) {
  const measures = [];
  const events = [];
  for (let i = 0; i < barCount; i++) {
    const startBeat = i * 4;
    const endBeat = startBeat + 4;
    measures.push({
      startSlot: i * 4,
      endSlot: (i + 1) * 4,
      startBeat,
      endBeat,
      marker: null,
      timeSig: [4, 4],
    });
    events.push({
      slot: startBeat,
      start: startBeat,
      duration: 1,
      stringIndex: 0,
      fret: 0,
      midi: 40,
      pc: 4,
      techniques: [],
      dead: false,
    });
  }
  return makeGpResult(makeGpModel({ measures, events }));
}

// ---- classifyUploadFile ----
assert.deepEqual(classifyUploadFile({ type: 'application/pdf', fileName: 'x.pdf' }), {
  kind: 'pdf', mimeType: 'application/pdf', supported: true, isGuitarPro: false,
});
assert.deepEqual(classifyUploadFile({ type: '', fileName: 'notes.docx' }), {
  kind: 'doc',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  supported: true,
  isGuitarPro: false,
});
assert.deepEqual(classifyUploadFile({ type: 'image/png', fileName: 'pic.png' }), {
  kind: 'image', mimeType: 'image/png', supported: true, isGuitarPro: false,
});
assert.deepEqual(classifyUploadFile({ type: 'audio/mpeg', fileName: 'song.mp3' }), {
  kind: 'audio', mimeType: 'audio/mpeg', supported: true, isGuitarPro: false,
});
assert.deepEqual(classifyUploadFile({ type: 'video/mp4', fileName: 'clip.mp4' }), {
  kind: 'video', mimeType: 'video/mp4', supported: true, isGuitarPro: false,
});
assert.deepEqual(classifyUploadFile({ type: '', fileName: 'Song.gp' }), {
  kind: 'gp', mimeType: 'application/x-guitar-pro', supported: true, isGuitarPro: true,
});
assert.deepEqual(classifyUploadFile({ type: '', fileName: 'Song.gp5' }), {
  kind: 'gp', mimeType: 'application/x-guitar-pro', supported: true, isGuitarPro: true,
});
assert.deepEqual(classifyUploadFile({ type: 'application/x-musi-tab-model', fileName: 'Song.musi-tab.json' }), {
  kind: 'tab-model', mimeType: 'application/x-musi-tab-model', supported: true, isGuitarPro: true,
});
assert.deepEqual(classifyUploadFile({ type: '', fileName: 'bad.exe' }), {
  kind: 'unsupported', mimeType: '', supported: false, isGuitarPro: false,
});
console.log('classifyUploadFile: ok');

// ---- baseNameOf ----
assert.equal(baseNameOf('Song.gp5'), 'Song');
assert.equal(baseNameOf('Song.musi-tab.json'), 'Song');
assert.equal(baseNameOf('noext'), 'noext');
console.log('baseNameOf: ok');

// ---- analyzeBulkFiles ----
const markedGp = makeMarkedScore();
const markedDigests = buildMeasureDigests({
  guitarModel: markedGp.tracks[0].model,
  percModel: null,
});
const expectedMarkerSegments = autoSplitByMarkers(markedDigests);

const parseStub = async () => markedGp;
const pdfFile = fakeFile({ name: 'sheet.pdf', type: 'application/pdf', size: 100 });
const gpFile = fakeFile({ name: 'Song.gp5', type: '', size: 50 });
const mixed = await analyzeBulkFiles([pdfFile, gpFile], { parse: parseStub });

assert.equal(mixed.length, 2);
assert.equal(mixed[0].kind, 'pdf');
assert.equal(mixed[0].splitMode, 'none');
assert.equal(mixed[0].segments.length, 0);
assert.equal(mixed[1].sectionCount, 3);
assert.equal(mixed[1].splitMode, 'section');
assert.equal(mixed[1].segments.length, expectedMarkerSegments.length);
assert.deepEqual(mixed[1].segments.map((s) => s.startIdx), expectedMarkerSegments.map((s) => s.startIdx));
console.log('analyzeBulkFiles mixed batch: ok');

const unmarkedGp = makeUnmarkedScore(12);
const unmarkedFile = fakeFile({ name: 'Plain.gp5', size: 10 });
const wholeBatch = await analyzeBulkFiles([unmarkedFile], {
  parse: async () => unmarkedGp,
  fallbackMode: 'whole',
});
assert.equal(wholeBatch[0].splitMode, 'none');
assert.equal(wholeBatch[0].segments.length, 0);

const everyNBatch = await analyzeBulkFiles([unmarkedFile], {
  parse: async () => unmarkedGp,
  fallbackMode: 'everyN',
  everyN: 4,
});
assert.equal(everyNBatch[0].splitMode, 'everyN');
assert.equal(everyNBatch[0].segments.length, 3);
assert.equal(everyNBatch[0].segments[0].endIdx, 3);
console.log('analyzeBulkFiles split modes: ok');

const huge = fakeFile({ name: 'big.mp4', type: 'video/mp4', size: BULK_MAX_FILE_BYTES + 1 });
const oversized = await analyzeBulkFiles([huge]);
assert.equal(oversized[0].include, false);
assert.equal(oversized[0].skipReason, 'too-large');
console.log('analyzeBulkFiles oversized: ok');

const failParse = async () => { throw new Error('re-export as .gp5'); };
const gp3File = fakeFile({ name: 'old.gp3', size: 10 });
const parseFailBatch = await analyzeBulkFiles([gp3File, pdfFile], { parse: failParse });
assert.equal(parseFailBatch.length, 2);
assert.equal(parseFailBatch[0].parseError, 're-export as .gp5');
assert.equal(parseFailBatch[0].include, true);
assert.equal(parseFailBatch[0].splitMode, 'none');
assert.equal(parseFailBatch[1].kind, 'pdf');
console.log('analyzeBulkFiles parse failure: ok');

// ---- planEntrySegments ----
const replanEntry = { ...mixed[1] };
planEntrySegments(replanEntry, { splitBySection: false, fallbackMode: 'everyN', everyN: 4 });
assert.equal(replanEntry.splitMode, 'everyN');
assert.equal(replanEntry.segments.length, 3);

planEntrySegments(replanEntry, { splitBySection: true, fallbackMode: 'whole' });
assert.equal(replanEntry.splitMode, 'section');
assert.equal(replanEntry.segments.length, expectedMarkerSegments.length);

const singleBar = makeGpResult(makeGpModel({
  measures: [{
    startSlot: 0, endSlot: 4, startBeat: 0, endBeat: 4, marker: 'Only', timeSig: [4, 4],
  }],
  events: [{
    slot: 0, start: 0, duration: 1, stringIndex: 0, fret: 0, midi: 40, pc: 4, techniques: [], dead: false,
  }],
}));
const singleEntry = {
  isGuitarPro: true,
  gp: singleBar,
  digests: buildMeasureDigests({ guitarModel: singleBar.tracks[0].model }),
  measureCount: 1,
  sectionCount: 1,
  segments: [],
  splitMode: 'none',
};
planEntrySegments(singleEntry, { splitBySection: true });
assert.equal(singleEntry.segments.length, 0);
assert.equal(singleEntry.splitMode, 'none');
console.log('planEntrySegments: ok');

// ---- describeEntryPlan ----
assert.equal(describeEntryPlan({ supported: false }), 'Skipped — unsupported file type');
assert.equal(describeEntryPlan({ supported: false, skipReason: 'too-large' }), 'Skipped — file too large');
assert.equal(describeEntryPlan(mixed[1]), `${mixed[1].segments.length} sections`);
assert.equal(describeEntryPlan(everyNBatch[0]), '3 chunks of 4 bars');
assert.equal(describeEntryPlan(mixed[0]), 'Whole file');
assert.equal(describeEntryPlan(wholeBatch[0]), 'Whole file — no section markers');
assert.equal(describeEntryPlan(parseFailBatch[0]), 'Whole file — could not read sections');
console.log('describeEntryPlan: ok');

// ---- importBulkEntries ----
const segmentGp = makeMarkedScore();
const segmentDigests = buildMeasureDigests({ guitarModel: segmentGp.tracks[0].model });
const segmentPlan = autoSplitByMarkers(segmentDigests);
const importEntry = {
  id: 'bulk-0',
  include: true,
  file: fakeFile({ name: 'Marked.gp5', type: '', size: 20 }),
  fileName: 'Marked.gp5',
  baseName: 'Marked',
  size: 20,
  kind: 'gp',
  mimeType: 'application/x-guitar-pro',
  supported: true,
  isGuitarPro: true,
  gp: segmentGp,
  digests: segmentDigests,
  measureCount: segmentDigests.length,
  sectionCount: 3,
  segments: segmentPlan,
  splitMode: 'section',
};

const saveCalls = [];
const gpAdds = [];
let saveId = 0;
const importResult = await importBulkEntries([importEntry], {
  addGpExercise: (opts) => { gpAdds.push(opts); return { id: `ex-${gpAdds.length}` }; },
  addMediaExercise: () => null,
  saveFile: async (opts) => {
    saveCalls.push(opts);
    saveId += 1;
    return { id: `att-${saveId}` };
  },
  attachmentsSupported: () => true,
  ensurePersistentStorage: async () => {},
});

assert.equal(importResult.ok, true);
assert.equal(importResult.added, segmentPlan.length);
assert.equal(importResult.segments, segmentPlan.length);
assert.equal(importResult.files, 0);
assert.equal(saveCalls.length, segmentPlan.length);
assert.ok(saveCalls.every((c) => c.type === 'application/x-musi-tab-model'));
assert.ok(saveCalls.every((c) => c.source === 'exercise'));
assert.ok(gpAdds.every((c) => c.loopEnabled === true));

const addOrder = gpAdds.slice(0, segmentPlan.length).map((c) => c.name);
const expectedOrder = [...segmentPlan].reverse().map((s) => {
  const raw = s.name.trim();
  return raw.startsWith('Marked') ? raw : `Marked \u2014 ${raw}`;
});
assert.deepEqual(addOrder, expectedOrder);
console.log('importBulkEntries happy path: ok');

const folderCreates = [];
const folderEntry = { ...importEntry, id: 'bulk-f', baseName: 'FolderSong', fileName: 'FolderSong.gp5' };
await importBulkEntries([folderEntry], {
  folderPerFile: true,
  createFolder: (name) => {
    folderCreates.push(name);
    return { id: `cat-${name}`, name };
  },
  addGpExercise: (opts) => {
    gpAdds.push({ ...opts, _folder: true });
    return { id: 'ex-f' };
  },
  addMediaExercise: () => null,
  saveFile: async () => ({ id: 'att-f' }),
  attachmentsSupported: () => true,
  ensurePersistentStorage: async () => {},
});
assert.deepEqual(folderCreates, ['FolderSong']);
const folderAdds = gpAdds.filter((c) => c._folder);
assert.ok(folderAdds.every((c) => c.categoryId === 'cat-FolderSong'));
console.log('importBulkEntries folderPerFile: ok');

const keepCalls = [];
await importBulkEntries([importEntry], {
  keepWholeScore: true,
  addGpExercise: () => ({ id: 'ex-k' }),
  addMediaExercise: () => null,
  saveFile: async (opts) => { keepCalls.push(opts); return { id: `att-k-${keepCalls.length}` }; },
  attachmentsSupported: () => true,
  ensurePersistentStorage: async () => {},
});
assert.equal(keepCalls.length, segmentPlan.length + 1);
const wholeSave = keepCalls.find((c) => c.fileName === 'Marked.gp5');
assert.ok(wholeSave);
assert.equal(wholeSave.type, 'application/x-guitar-pro');
console.log('importBulkEntries keepWholeScore: ok');

const blocked = await importBulkEntries([importEntry], {
  addGpExercise: () => ({ id: 'x' }),
  addMediaExercise: () => null,
  attachmentsSupported: () => false,
});
assert.equal(blocked.ok, false);
assert.equal(blocked.added, 0);
assert.equal(saveCalls.length, segmentPlan.length);
console.log('importBulkEntries storage blocked: ok');

const goodPdf = {
  id: 'bulk-pdf',
  include: true,
  file: fakeFile({ name: 'ok.pdf', type: 'application/pdf', size: 10 }),
  fileName: 'ok.pdf',
  baseName: 'ok',
  size: 10,
  kind: 'pdf',
  mimeType: 'application/pdf',
  supported: true,
  isGuitarPro: false,
  segments: [],
  splitMode: 'none',
};
const badEntry = {
  ...importEntry,
  id: 'bulk-bad',
  gp: null,
  digests: [],
  segments: [{ startIdx: 0, endIdx: 0, name: 'Bad' }],
};
const errorResult = await importBulkEntries([badEntry, goodPdf], {
  addGpExercise: () => ({ id: 'ex' }),
  addMediaExercise: () => ({ id: 'ex-media' }),
  saveFile: async () => ({ id: 'att-err' }),
  attachmentsSupported: () => true,
  ensurePersistentStorage: async () => {},
});
assert.equal(errorResult.errors.length, 1);
assert.equal(errorResult.added, 1);
assert.equal(errorResult.files, 1);
console.log('importBulkEntries partial errors: ok');

console.log('\nall bulk-import tests passed');
