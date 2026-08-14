/**
 * Zero-dependency Node tests for the Tools home section model.
 * Run: node tests/shell/run.mjs
 */

import assert from 'node:assert/strict';
import {
  buildHomeSections,
  normalizeRecents,
  pushRecent,
  searchTools,
} from '../../js/tools/homeModel.js';
import { TOOLS, toolsForPurpose } from '../../js/tools.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

const FAKE_TOOLS = [
  {
    id: 'alpha',
    label: 'Alpha Tool',
    short: 'Alpha',
    title: 'Alpha Tool',
    purpose: 'train',
    description: 'Only this description mentions xyzzyplugh.',
    modes: [
      { id: 'mode-a', label: 'Mode Alpha' },
    ],
    defaultMode: 'mode-a',
  },
  {
    id: 'beta',
    label: 'Beta Reader',
    short: 'Beta',
    title: 'Beta Reader',
    purpose: 'study',
    modes: [
      { id: 'overview', label: 'Overview' },
    ],
    defaultMode: 'overview',
  },
  {
    id: 'gamma',
    label: 'Gamma Studio',
    short: 'Gamma',
    title: 'Gamma Studio',
    purpose: 'create',
    modes: [],
    defaultMode: '',
  },
  {
    id: 'legacy',
    label: 'Legacy Quiz',
    short: 'Quiz',
    title: 'Legacy Quiz',
    description: 'Old quiz with no purpose.',
  },
];

function sectionIds(sections) {
  return sections.map(s => s.id);
}

function collectLabels(sections) {
  const labels = [];
  for (const section of sections) {
    if (section.label) labels.push(section.label);
    for (const item of section.items || []) {
      if (item.label) labels.push(item.label);
    }
  }
  return labels;
}

console.log('Section order and visibility');
test('section order with favorites, recents, and active routines', () => {
  const sections = buildHomeSections({
    purpose: 'train',
    tools: FAKE_TOOLS,
    favorites: ['alpha', 'legacy'],
    recents: [{ id: 'alpha', mode: 'mode-a', at: '2026-08-14T10:00:00.000Z' }],
    activeRoutines: [{ id: 'r1', name: 'Morning routine' }],
    query: '',
  });

  assert.deepEqual(sectionIds(sections), [
    'purposes',
    'favorites',
    'recents',
    'continue',
    'search',
    'browse',
  ]);
  assert.equal(sections[0].activePurpose, 'train');
  assert.equal(sections[1].items.length, 1);
  assert.equal(sections[1].items[0].id, 'alpha');
  assert.equal(sections[2].items[0].source, 'recent');
  assert.equal(sections[3].label, 'Continue a routine');
  assert.equal(sections[3].items[0].label, 'Morning routine');
});

test('empty favorites, recents, and routines omit those sections', () => {
  const sections = buildHomeSections({
    purpose: 'study',
    tools: FAKE_TOOLS,
    favorites: [],
    recents: [],
    activeRoutines: [],
    query: '',
  });

  assert.deepEqual(sectionIds(sections), ['purposes', 'search', 'browse']);
});

console.log('Recents');
test('normalizeRecents caps at five, one entry per tool, newest first', () => {
  const list = [];
  for (let i = 0; i < 7; i += 1) {
    list.push({
      id: `tool-${i}`,
      mode: '',
      at: `2026-08-14T0${i}:00:00.000Z`,
    });
  }

  const normalized = normalizeRecents(list, 5);
  assert.equal(normalized.length, 5);
  assert.equal(normalized[0].id, 'tool-6');
  assert.equal(normalized[4].id, 'tool-2');
});

test('normalizeRecents keeps one row per tool id with the newest timestamp', () => {
  const normalized = normalizeRecents([
    { id: 'alpha', mode: 'mode-a', at: '2026-08-14T08:00:00.000Z' },
    { id: 'beta', mode: '', at: '2026-08-14T09:00:00.000Z' },
    { id: 'alpha', mode: 'mode-a', at: '2026-08-14T10:00:00.000Z' },
  ]);

  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].id, 'alpha');
  assert.equal(normalized[0].at, '2026-08-14T10:00:00.000Z');
});

test('pushRecent replaces the prior row for the same tool and does not mutate input', () => {
  const input = [
    { id: 'alpha', mode: 'mode-a', at: '2026-08-14T08:00:00.000Z' },
    { id: 'beta', mode: '', at: '2026-08-14T09:00:00.000Z' },
  ];
  const snapshot = JSON.stringify(input);

  const next = pushRecent(input, {
    id: 'alpha',
    mode: 'mode-a',
    at: '2026-08-14T11:00:00.000Z',
  });

  assert.equal(JSON.stringify(input), snapshot);
  assert.equal(next.length, 2);
  assert.equal(next[0].id, 'alpha');
  assert.equal(next[0].at, '2026-08-14T11:00:00.000Z');
  assert.equal(next[1].id, 'beta');
});

console.log('Search');
test('search matches a tool name', () => {
  const matches = searchTools(FAKE_TOOLS, 'beta');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, 'beta');
});

test('search matches a mode label', () => {
  const matches = searchTools(FAKE_TOOLS, 'mode alpha');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, 'alpha');
  assert.equal(matches[0].matchedMode, 'mode-a');
});

test('search does not match description-only text', () => {
  const matches = searchTools(FAKE_TOOLS, 'xyzzyplugh');
  assert.equal(matches.length, 0);
});

test('empty search query returns no rows', () => {
  assert.deepEqual(searchTools(FAKE_TOOLS, ''), []);
  assert.deepEqual(searchTools(FAKE_TOOLS, '   '), []);
});

console.log('Browse and favorites');
test('browse lists only tools for the active purpose', () => {
  const sections = buildHomeSections({
    purpose: 'study',
    tools: FAKE_TOOLS,
    query: '',
  });
  const browse = sections.find(s => s.id === 'browse');
  assert.deepEqual(browse.items.map(item => item.id), ['beta']);
});

test('favorites skip tools without purpose', () => {
  const sections = buildHomeSections({
    purpose: 'train',
    tools: FAKE_TOOLS,
    favorites: ['legacy', 'alpha'],
    query: '',
  });
  const favorites = sections.find(s => s.id === 'favorites');
  assert.deepEqual(favorites.items.map(item => item.id), ['alpha']);
});

console.log('Copy guardrails');
test('no section or item label equals "No routines yet"', () => {
  const sections = buildHomeSections({
    purpose: 'train',
    tools: FAKE_TOOLS,
    favorites: ['alpha'],
    recents: [{ id: 'alpha', mode: '', at: '2026-08-14T10:00:00.000Z' }],
    activeRoutines: [{ id: 'r1', name: 'Morning routine' }],
    query: 'alpha',
  });

  const labels = collectLabels(sections);
  assert.equal(labels.includes('No routines yet'), false);
});

console.log('Live catalog');
test('Train, Study, and Create each list the expected tools', () => {
  const trainIds = toolsForPurpose('train').map(t => t.id);
  const studyIds = toolsForPurpose('study').map(t => t.id);
  const createIds = toolsForPurpose('create').map(t => t.id);

  for (const id of ['tuner', 'metronome', 'practice', 'exercises', 'workbooks', 'gpplayer']) {
    assert.equal(trainIds.includes(id), true, `train missing ${id}`);
  }
  for (const id of ['scaleref', 'intervalorbit', 'chords']) {
    assert.equal(studyIds.includes(id), true, `study missing ${id}`);
  }
  for (const id of ['songwriter', 'recorder', 'tracktosheet']) {
    assert.equal(createIds.includes(id), true, `create missing ${id}`);
  }

  for (const id of ['scales', 'drums', 'musicprefs']) {
    const tool = TOOLS.find(t => t.id === id);
    assert.ok(tool, `${id} missing from TOOLS`);
    assert.equal(tool.purpose, undefined, `${id} should have no purpose`);
  }
});

console.log('');
if (failed) {
  console.error(`${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`${passed} passed, 0 failed`);
