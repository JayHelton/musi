/**
 * Deterministic Train practice seed for browser regression tests.
 * Installed via Page.addScriptToEvaluateOnNewDocument before navigation.
 */

export const SEED_IDS = {
  workbook1: 'wb-seed-1',
  workbook1Name: 'Technique block',
  workbook2: 'wb-seed-2',
  exercise1: 'ex-seed-1',
  exercise1Name: 'Warm-up chromatic',
  exercise2: 'ex-seed-2',
  exercise2Name: 'Minor pentatonic runs',
  exercise3: 'ex-seed-3',
  routine1: 'rt-seed-1',
  session1: 'rs-seed-1',
};

export const SEED_SOURCE = `
(function () {
  function model(offset) {
    return {
      tuning: 'Standard',
      strings: [
        { note: 'E', oct: 2, label: 'E', openMidi: 40 },
        { note: 'A', oct: 2, label: 'A', openMidi: 45 },
        { note: 'D', oct: 3, label: 'D', openMidi: 50 },
        { note: 'G', oct: 3, label: 'G', openMidi: 55 },
        { note: 'B', oct: 3, label: 'B', openMidi: 59 },
        { note: 'e', oct: 4, label: 'e', openMidi: 64 },
      ],
      events: Array.from({ length: 16 }, function (_, i) {
        return {
          slot: i, start: i, duration: 1,
          stringIndex: i % 6, fret: (i + offset) % 7,
          midi: 40 + ((i + offset) % 12), pc: (i + offset) % 12,
          techniques: [], dead: false,
        };
      }),
      measures: [
        { startSlot: 0, endSlot: 4, startBeat: 0, endBeat: 4, marker: 'A', timeSig: [4, 4] },
        { startSlot: 4, endSlot: 8, startBeat: 4, endBeat: 8, marker: null, timeSig: [4, 4] },
        { startSlot: 8, endSlot: 12, startBeat: 8, endBeat: 12, marker: 'B', timeSig: [4, 4] },
        { startSlot: 12, endSlot: 16, startBeat: 12, endBeat: 16, marker: null, timeSig: [4, 4] },
      ],
      tempo: 120,
      totalBeats: 16,
    };
  }

  function payload(name, offset) {
    return JSON.stringify({
      format: 'musi-tab-model',
      version: 2,
      tempo: 120,
      tracks: [{ index: 0, name: name, tuning: 'Standard', model: model(offset) }],
      drumTracks: [],
      warnings: [],
    });
  }

  var names = ['Warm-up chromatic', 'Minor pentatonic runs', 'Alternate picking etude'];
  var exercises = names.map(function (name, i) {
    return {
      id: 'ex-seed-' + (i + 1),
      name: name,
      categoryId: '',
      attachmentId: 'att-seed-' + (i + 1),
      fileName: name + '.musi-tab.json',
      type: 'application/x-musi-tab-model',
      size: 2048,
      addedAt: new Date().toISOString(),
      bpm: 80 + i * 10,
      measureStart: 1,
      measureEnd: 4,
      loopEnabled: true,
    };
  });

  localStorage.setItem('musi.exercises', JSON.stringify({
    categories: [{ id: 'cat-seed', name: 'Tabs' }],
    items: exercises,
  }));

  localStorage.setItem('musi.workbooks', JSON.stringify({
    folders: [],
    workbooks: [{
      id: 'wb-seed-1',
      name: 'Technique block',
      folderId: '',
      entries: exercises.map(function (ex, i) {
        return { id: 'wbe-seed-' + (i + 1), exerciseId: ex.id };
      }),
      companions: [],
      loopEnabled: true,
      activeEntryId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, {
      id: 'wb-seed-2',
      name: 'Repertoire block',
      folderId: '',
      entries: [{ id: 'wbe-seed-9', exerciseId: 'ex-seed-3' }],
      companions: [],
      loopEnabled: true,
      activeEntryId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }],
  }));

  localStorage.setItem('musi.routines', JSON.stringify({
    routines: [{
      id: 'rt-seed-1',
      name: 'Daily practice',
      description: 'Seeded routine',
      sessions: [
        {
          id: 'rs-seed-1',
          name: 'Morning technique',
          notes: '',
          workbookIds: ['wb-seed-1', 'wb-seed-2'],
          durationMin: 20,
          metronome: { bpm: 92, beats: 4, subdiv: 'quarter', accentFirst: true },
          completed: false,
        },
        {
          id: 'rs-seed-2',
          name: 'Evening repertoire',
          notes: '',
          workbookIds: ['wb-seed-2'],
          durationMin: 15,
          metronome: { bpm: 100, beats: 4, subdiv: 'quarter', accentFirst: true },
          completed: false,
        },
      ],
      activeSessionId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }],
  }));

  window.__seedAttachments = function () {
    return new Promise(function (resolve) {
      var req = indexedDB.open('musi-attachments', 1);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
      };
      req.onsuccess = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('files')) { resolve('no files store: ' + [...db.objectStoreNames]); return; }
        var tx = db.transaction('files', 'readwrite');
        var store = tx.objectStore('files');
        names.forEach(function (name, i) {
          store.put({
            id: 'att-seed-' + (i + 1),
            blob: new Blob([payload(name, i * 2)], { type: 'application/x-musi-tab-model' }),
            name: name,
            fileName: name + '.musi-tab.json',
            type: 'application/x-musi-tab-model',
            size: 2048,
            createdAt: new Date().toISOString(),
            source: 'upload',
          });
        });
        tx.oncomplete = function () { resolve('ok'); };
        tx.onerror = function () { resolve('tx error'); };
      };
      req.onerror = function () { resolve('open error'); };
    });
  };
})();
`;
