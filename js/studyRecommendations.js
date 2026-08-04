// Genre-aware study recommendation engine.
//
// score = genreRelevance + skillWeakness + reviewUrgency
//       + goalRelevance + varietyAdjustment - recentRepetition
//
// Guardrails:
// - Foundation material is never removed (general-theory floor).
// - Prerequisites must be known (or weakly assumed for brand-new users).
// - Copy says "frequently useful" — never "the scale used by this genre".
// - Excluded concepts are skipped.
// - Variety rotates study categories across recent sessions.

import { STUDY_CATALOG, STUDY_CATEGORIES, getStudyById } from './studyCatalog.js';
import {
  getMusicProfile,
  genreRelevanceMap,
  goalConceptBoosts,
  isConceptExcluded,
  hasActiveGenres,
  primaryGenreLabels,
  genreSummary,
  activeGenreEntries,
} from './musicProfile.js';
import {
  getStudyProgress,
  daysSinceReview,
  daysSinceStudy,
  conceptWeakness,
  skillWeaknessHints,
  knownConcepts,
  recordStudyStarted,
  recordStudyCompleted,
} from './studyProgress.js';
import { GENRE_PROFILES, conceptLabel, PRIORITY_WEIGHT } from './genreProfiles.js';
import { setContext } from './musicalContext.js';

const BALANCE_WEIGHTS = {
  foundation: { genre: 0.45, weakness: 0.7, review: 0.7, foundation: 1.35, goal: 0.8, variety: 0.5 },
  balanced: { genre: 1, weakness: 1, review: 1, foundation: 1, goal: 1, variety: 0.7 },
  genre: { genre: 1.35, weakness: 0.75, review: 0.8, foundation: 0.75, goal: 1, variety: 0.7 },
  weakness: { genre: 0.7, weakness: 1.4, review: 0.9, foundation: 0.85, goal: 0.9, variety: 0.5 },
  review: { genre: 0.7, weakness: 0.85, review: 1.45, foundation: 0.9, goal: 0.8, variety: 0.4 },
};

const FOUNDATION_FLOOR = {
  major_scale: 0.55,
  interval_locations: 0.5,
  major_minor_triads: 0.5,
  triad_inversions: 0.4,
  diatonic_harmony: 0.45,
  fretboard_transfer: 0.4,
  natural_minor: 0.4,
};

const APP_PREF_BOOST = {
  fretboard: ['fretboard', 'technique'],
  harmony: ['harmony', 'songwriting'],
  improvisation: ['improvisation'],
  songwriting: ['songwriting', 'harmony'],
  ear: ['ear'],
  technique: ['technique', 'fretboard'],
};

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function mean(nums) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function maxOf(nums) {
  return nums.length ? Math.max(...nums) : 0;
}

function prerequisitesMet(study, known, isNewUser) {
  const prereqs = study.prerequisites || [];
  if (!prereqs.length) return true;
  // Brand-new users may still receive foundation studies; block advanced
  // genre vocabulary until basic concepts show up as known OR the study
  // itself is foundational enough.
  if (isNewUser && study.foundationWeight >= 0.85) return true;
  if (isNewUser && study.category === 'foundation') return true;
  // Soft gate: allow if most prereqs known, or if foundationWeight high.
  const met = prereqs.filter(p => known.has(p)).length;
  if (met === prereqs.length) return true;
  if (study.foundationWeight >= 0.9 && met >= prereqs.length - 1) return true;
  // Progressive unlock for genre studies once major_scale is known.
  if (known.has('major_scale') && known.has('major_minor_triads')) return true;
  if (known.has('major_scale') && study.foundationWeight >= 0.5) return true;
  return met >= Math.ceil(prereqs.length * 0.5);
}

function studyExcluded(study, profile) {
  return (study.concepts || []).some(c => isConceptExcluded(c, profile));
}

function applicationBoost(study, profile) {
  const prefs = profile.applications || [];
  if (!prefs.length || !study.applications?.length) return 0;
  let hit = 0;
  prefs.forEach(p => {
    const tags = APP_PREF_BOOST[p] || [p];
    if (study.applications.some(a => tags.includes(a))) hit += 1;
  });
  return clamp01(hit / Math.max(prefs.length, 1)) * 0.35;
}

function categoryVarietyBonus(study, progress) {
  const recent = progress.recentStudies.slice(0, 4).map(r => getStudyById(r.id)?.category).filter(Boolean);
  if (!recent.length) return 0.15;
  if (recent.includes(study.category)) return -0.2;
  return 0.25;
}

function scoreStudy(study, ctx) {
  const { profile, genreMap, goalMap, progress, known, skillHints, weights, isNewUser } = ctx;

  if (studyExcluded(study, profile)) return null;
  if (!prerequisitesMet(study, known, isNewUser)) return null;

  const concepts = study.concepts || [];
  const genreRelevance = maxOf(concepts.map(c => genreMap[c] || FOUNDATION_FLOOR[c] || 0));
  const foundationBoost = (study.foundationWeight || 0) * (isNewUser || !hasActiveGenres(profile) ? 1 : 0.55);

  const weakness = maxOf(concepts.map(c => Math.max(
    conceptWeakness(c, progress),
    skillHints[c] || 0,
  )));

  const reviewDays = maxOf(concepts.map(c => {
    const d = daysSinceReview(c, progress);
    return Number.isFinite(d) ? d : 10;
  }));
  // Urgency rises after ~3 days, peaks near 8+
  const reviewUrgency = clamp01((reviewDays - 2) / 6);

  const goalRelevance = maxOf(concepts.map(c => goalMap[c] || 0));
  const varietyAdjustment = categoryVarietyBonus(study, progress);
  const recentDays = daysSinceStudy(study.id, progress);
  const recentRepetition = Number.isFinite(recentDays) && recentDays < 2
    ? (2 - recentDays) * 0.55
    : recentDays < 5
      ? 0.2
      : 0;

  const appBoost = applicationBoost(study, profile);

  // Category nudges
  let categoryBias = 0;
  if (study.category === 'foundation') categoryBias += 0.1 * weights.foundation;
  if (study.category === 'genre-vocabulary') categoryBias += 0.12 * weights.genre;
  if (study.category === 'weakness') categoryBias += 0.15 * weights.weakness;
  if (study.category === 'retention') categoryBias += 0.12 * weights.review;
  if (study.category === 'contrast' && genreRelevance > 0.5) categoryBias += 0.08;
  if (study.category === 'transfer' && reviewDays > 3) categoryBias += 0.1;

  const score =
    (genreRelevance + foundationBoost * 0.5) * weights.genre * 1.1 +
    weakness * weights.weakness * 1.2 +
    reviewUrgency * weights.review +
    goalRelevance * weights.goal +
    varietyAdjustment * weights.variety +
    appBoost +
    categoryBias +
    study.foundationWeight * 0.15 * weights.foundation -
    recentRepetition;

  return {
    study,
    score,
    parts: {
      genreRelevance,
      weakness,
      reviewUrgency,
      reviewDays,
      goalRelevance,
      varietyAdjustment,
      recentRepetition,
      foundationBoost,
      appBoost,
    },
  };
}

function whySelected(scored, profile) {
  const { study, parts } = scored;
  const reasons = [];
  const genres = primaryGenreLabels(profile, 3);

  if (parts.genreRelevance >= 0.55 && genres.length) {
    reasons.push(`Frequently useful in ${genres.join(' and ')}`);
  } else if (study.category === 'foundation') {
    reasons.push('Builds general musicianship that genre vocabulary still depends on');
  }

  if (parts.weakness >= 0.45) {
    const weakConcept = (study.concepts || []).find(c =>
      conceptWeakness(c) >= 0.4
    );
    reasons.push(weakConcept
      ? `Reinforces your current ${conceptLabel(weakConcept).toLowerCase()} weakness`
      : 'Reinforces a skill that has been slower or less accurate recently');
  }

  if (parts.reviewDays >= 5 && Number.isFinite(parts.reviewDays)) {
    const days = Math.round(parts.reviewDays);
    const topic = conceptLabel(study.concepts[0] || '').toLowerCase() || 'this material';
    reasons.push(`${topic.charAt(0).toUpperCase()}${topic.slice(1)} has not been reviewed for ${days} day${days === 1 ? '' : 's'}`);
  }

  if (study.category === 'contrast') {
    reasons.push('Contrast practice helps keep related structures from blurring together');
  }
  if (study.category === 'transfer') {
    reasons.push('Transfers known material into a new fretboard context');
  }
  if (parts.goalRelevance >= 0.5) {
    reasons.push('Aligns with your saved learning goals');
  }

  // Always keep at least one transparent reason.
  if (!reasons.length) {
    reasons.push(STUDY_CATEGORIES[study.category]?.blurb || 'Supports balanced theory practice');
  }

  return reasons.slice(0, 4);
}

function narrativeBlurb(study, profile, parts) {
  const genres = primaryGenreLabels(profile, 2);
  const genreBit = genres.length
    ? `Your saved genres (${genres.join(', ')}) frequently use related harmonic and intervallic material.`
    : 'This study strengthens foundation skills that every style still depends on.';

  if (study.id === 'harmonic-minor-triads' || study.id === 'harmonic-minor-harmony-symmetry') {
    return `${genreBit} Harmonic minor contains minor, major, diminished, and augmented triads, making it useful for chord-quality recognition without treating the scale as a genre shortcut.`;
  }
  if (parts.weakness >= 0.45) {
    return `${genreBit} Recent sessions suggest this is a good moment to shore up recognition before adding more vocabulary.`;
  }
  if (study.category === 'foundation') {
    return `${study.summary} Foundation work stays available even when your profile is genre-focused — modal and minor harmony still need it.`;
  }
  return `${genreBit} ${study.summary}`;
}

/**
 * Build the primary recommendation (and runners-up) for the current profile.
 * @param {{ limit?: number, profile?: object, progress?: object, skillHints?: object }} [opts]
 * @returns {{ primary: object|null, alternates: object[], profile, empty: boolean }}
 */
export function buildRecommendations({
  limit = 3,
  profile: profileOverride = null,
  progress: progressOverride = null,
  skillHints: skillHintsOverride = null,
} = {}) {
  const profile = profileOverride || getMusicProfile();
  const progress = progressOverride || getStudyProgress();
  const genreMap = { ...FOUNDATION_FLOOR, ...genreRelevanceMap(profile) };
  const goalMap = goalConceptBoosts(profile);
  const known = knownConcepts(progress);
  const skillHints = skillHintsOverride || skillWeaknessHints();
  const weights = BALANCE_WEIGHTS[profile.balance] || BALANCE_WEIGHTS.balanced;
  const isNewUser = progress.recentStudies.length === 0 && Object.keys(progress.concepts).length < 3;

  const ctx = { profile, genreMap, goalMap, progress, known, skillHints, weights, isNewUser };

  const scored = STUDY_CATALOG
    .map(study => scoreStudy(study, ctx))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  // Mild category rotation: if top two share category with last primary, prefer next different.
  if (scored.length > 1 && progress.lastPrimaryId) {
    const lastCat = getStudyById(progress.lastPrimaryId)?.category;
    if (lastCat && scored[0].study.category === lastCat) {
      const swapIdx = scored.findIndex((s, i) => i > 0 && s.study.category !== lastCat);
      if (swapIdx > 0 && scored[swapIdx].score >= scored[0].score * 0.88) {
        const [pick] = scored.splice(swapIdx, 1);
        scored.unshift(pick);
      }
    }
  }

  const toView = (s) => {
    if (!s) return null;
    const reasons = whySelected(s, profile);
    return {
      id: s.study.id,
      title: s.study.title,
      category: s.study.category,
      categoryLabel: STUDY_CATEGORIES[s.study.category]?.label || s.study.category,
      summary: s.study.summary,
      narrative: narrativeBlurb(s.study, profile, s.parts),
      focus: s.study.focus || [],
      application: s.study.application || null,
      reasons,
      toolId: s.study.toolId,
      altTools: s.study.altTools || [],
      scale: s.study.scale || null,
      concepts: s.study.concepts || [],
      score: Math.round(s.score * 100) / 100,
      parts: s.parts,
      guardrail: 'This concept is frequently useful in your selected genres — it is not presented as exclusive vocabulary.',
    };
  };

  const primary = toView(scored[0] || null);
  const alternates = scored.slice(1, limit).map(toView);

  return {
    primary,
    alternates,
    profile,
    empty: !hasActiveGenres(profile),
    genreSummary: genreSummary(profile),
    sharedConcepts: activeGenreEntries(profile).length >= 2
      ? Object.entries(genreMap)
        .filter(([c, w]) => w >= 0.7 && !FOUNDATION_FLOOR[c])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([c]) => conceptLabel(c))
      : [],
  };
}

export function getPrimaryRecommendation() {
  return buildRecommendations({ limit: 1 }).primary;
}

/** Apply context + mark study started; returns Study Lab navigation target. */
export function beginRecommendedStudy(studyId) {
  const study = getStudyById(studyId);
  if (!study) return null;
  if (study.scale) {
    try { setContext({ scale: study.scale }, 'study-rec'); } catch (_) { /* ignore */ }
  }
  recordStudyStarted(study);
  return {
    toolId: 'studylab',
    legacyToolId: study.toolId,
    study,
  };
}

export function completeRecommendedStudy(studyId) {
  const study = getStudyById(studyId);
  if (!study) return null;
  recordStudyCompleted(study);
  return study;
}

export function recommendationExplanation(rec) {
  if (!rec) return '';
  return [
    rec.narrative,
    '',
    'Why this was selected:',
    ...rec.reasons.map(r => `• ${r}`),
  ].join('\n');
}

/** Test helper: score catalog against an injected profile/progress snapshot. */
export function debugScoreAll(profileOverride, progressOverride) {
  // Used by smoke tests via dynamic patching of getters when needed.
  return buildRecommendations({ limit: STUDY_CATALOG.length });
}

export { STUDY_CATEGORIES, GENRE_PROFILES, PRIORITY_WEIGHT };
