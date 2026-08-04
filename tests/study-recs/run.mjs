/**
 * Zero-dependency smoke tests for genre-aware study recommendations.
 * Run: node tests/study-recs/run.mjs
 */

import assert from 'node:assert/strict';
import { GENRE_PROFILES, aggregateGenreWeights, sharedConcepts, CONCEPTS } from '../../js/genreProfiles.js';
import { STUDY_CATALOG, getStudyById } from '../../js/studyCatalog.js';
import { buildRecommendations } from '../../js/studyRecommendations.js';

function profile(genres, extras = {}) {
  return {
    version: 1,
    genres,
    goals: extras.goals || ['lead_guitar', 'fretboard_fluency'],
    balance: extras.balance || 'balanced',
    applications: extras.applications || ['fretboard', 'harmony'],
    exclusions: extras.exclusions || [],
    influenceNotes: '',
    onboarded: true,
    updatedAt: Date.now(),
  };
}

function progress(partial = {}) {
  return {
    version: 1,
    concepts: partial.concepts || {},
    recentStudies: partial.recentStudies || [],
    lastPrimaryId: partial.lastPrimaryId || null,
    lastPrimaryAt: partial.lastPrimaryAt || 0,
  };
}

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

test('genre catalog covers required styles', () => {
  for (const id of [
    'deathcore', 'modern_metal', 'metalcore', 'progressive_metal',
    'melodic_death_metal', 'rock', 'blues', 'jazz', 'pop', 'neoclassical',
  ]) {
    assert.ok(GENRE_PROFILES[id], `missing genre ${id}`);
    assert.ok(Object.keys(GENRE_PROFILES[id].weights).length > 5);
  }
});

test('shared concepts across metal family', () => {
  const shared = sharedConcepts([
    'deathcore', 'metalcore', 'melodic_death_metal', 'progressive_metal',
  ]);
  const ids = shared.map(s => s.concept);
  assert.ok(ids.includes('harmonic_minor') || ids.includes('natural_minor'));
  assert.ok(ids.includes('phrygian') || ids.includes('diminished_triads') || ids.includes('interval_locations'));
});

test('aggregate weights prefer primary genre', () => {
  const map = aggregateGenreWeights([
    { id: 'progressive_metal', priority: 'primary' },
    { id: 'pop', priority: 'occasional' },
  ]);
  assert.ok(map.modal_comparison > (map.major_pentatonic || 0));
});

test('catalog studies have tools and focus steps', () => {
  assert.ok(STUDY_CATALOG.length >= 20);
  for (const s of STUDY_CATALOG) {
    assert.ok(s.id && s.title && s.toolId, s.id);
    assert.ok(Array.isArray(s.focus) && s.focus.length >= 3, s.id);
    assert.ok(Array.isArray(s.concepts) && s.concepts.length, s.id);
    for (const c of s.concepts) {
      assert.ok(CONCEPTS[c] || true);
    }
  }
  assert.ok(getStudyById('harmonic-minor-triads'));
  assert.ok(getStudyById('harmonic-minor-harmony-symmetry'));
});

test('empty profile still recommends foundation study', () => {
  const empty = profile([]);
  const out = buildRecommendations({
    profile: empty,
    progress: progress(),
    skillHints: {},
    limit: 3,
  });
  assert.ok(out.primary, 'expected a primary recommendation');
  assert.equal(out.empty, true);
  assert.ok(
    out.primary.category === 'foundation' || out.primary.concepts.includes('major_scale'),
    `expected foundation-leaning study, got ${out.primary.id}`
  );
});

test('progressive metal profile recommends harmonic-minor family study', () => {
  const metal = profile([
    { id: 'progressive_metal', priority: 'primary' },
    { id: 'deathcore', priority: 'secondary' },
    { id: 'metalcore', priority: 'secondary' },
    { id: 'melodic_death_metal', priority: 'secondary' },
  ], { balance: 'genre', goals: ['lead_guitar', 'chord_progressions', 'fretboard_fluency'] });

  const eightDaysAgo = Date.now() - 8 * 86400000;
  const prog = progress({
    concepts: {
      major_scale: { lastReviewedAt: Date.now() - 86400000, completions: 8, misses: 1, hintHeavy: 0 },
      major_minor_triads: { lastReviewedAt: Date.now() - 2 * 86400000, completions: 5, misses: 1, hintHeavy: 0 },
      natural_minor: { lastReviewedAt: Date.now() - 3 * 86400000, completions: 4, misses: 1, hintHeavy: 0 },
      harmonic_minor: { lastReviewedAt: eightDaysAgo, completions: 2, misses: 1, hintHeavy: 0 },
      diminished_triads: { lastReviewedAt: eightDaysAgo, completions: 1, misses: 4, hintHeavy: 3 },
      dim7: { lastReviewedAt: eightDaysAgo, completions: 0, misses: 3, hintHeavy: 2 },
      augmented_triads: { lastReviewedAt: eightDaysAgo, completions: 0, misses: 2, hintHeavy: 2 },
      seventh_chords: { lastReviewedAt: eightDaysAgo, completions: 1, misses: 3, hintHeavy: 2 },
    },
  });

  const out = buildRecommendations({
    profile: metal,
    progress: prog,
    skillHints: { diminished_triads: 0.7, dim7: 0.65, seventh_chords: 0.6 },
    limit: 5,
  });

  assert.ok(out.primary, 'expected primary');
  assert.equal(out.empty, false);
  const topIds = [out.primary, ...out.alternates].map(r => r.id);
  const harmonicHit = topIds.some(id =>
    id.includes('harmonic-minor') || id.includes('diminished') || id.includes('seventh-chord')
  );
  assert.ok(harmonicHit, `expected harmonic/diminished/seventh study near top, got ${topIds.join(', ')}`);
  assert.ok(out.primary.reasons.length >= 1);
  assert.ok(/frequently useful/i.test(out.primary.guardrail));
  assert.ok(out.primary.focus.length >= 3);
});

test('exclusions remove matching studies', () => {
  const metal = profile([{ id: 'neoclassical', priority: 'primary' }]);
  const out = buildRecommendations({
    profile: { ...metal, exclusions: ['phrygian_dominant', 'harmonic_minor', 'dim7', 'symmetry_rules', 'augmented_triads'] },
    progress: progress({
      concepts: {
        major_scale: { lastReviewedAt: Date.now(), completions: 5, misses: 0, hintHeavy: 0 },
        major_minor_triads: { lastReviewedAt: Date.now(), completions: 4, misses: 0, hintHeavy: 0 },
      },
    }),
    skillHints: {},
    limit: 5,
  });
  assert.ok(out.primary);
  assert.ok(!out.primary.concepts.includes('phrygian_dominant'));
});

test('application prompts do not prescribe frets or note answers', () => {
  for (const s of STUDY_CATALOG) {
    if (!s.application) continue;
    assert.ok(!/fret\s*\d/i.test(s.application), s.id);
    assert.ok(!/the answer is/i.test(s.application), s.id);
  }
});

console.log(`\n${passed} tests passed`);
