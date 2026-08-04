// Saved music profile: genres, learning goals, study balance, application
// preferences, and temporary topic exclusions. Persisted in musi:settings.

import { getSetting, saveSetting } from './persistence.js';
import {
  GENRE_PROFILES,
  GENRE_PRIORITIES,
  LEARNING_GOALS,
  PRIORITY_WEIGHT,
  aggregateGenreWeights,
  sharedConcepts,
} from './genreProfiles.js';

const PROFILE_KEY = 'profile.music';

export const STUDY_BALANCES = [
  { id: 'foundation', label: 'Foundation-heavy', description: 'Bias toward universal theory before genre color.' },
  { id: 'balanced', label: 'Balanced', description: 'Mix foundation, genre vocabulary, and weaknesses.' },
  { id: 'genre', label: 'Genre-focused', description: 'Emphasize concepts frequently useful in your genres.' },
  { id: 'weakness', label: 'Weakness-focused', description: 'Prioritize repeated misses and slow recognition.' },
  { id: 'review', label: 'Review-focused', description: 'Favor retention reviews before decay.' },
];

export const APPLICATION_PREFS = [
  { id: 'fretboard', label: 'Fretboard mapping' },
  { id: 'harmony', label: 'Harmony' },
  { id: 'improvisation', label: 'Improvisation' },
  { id: 'songwriting', label: 'Songwriting' },
  { id: 'ear', label: 'Ear training' },
  { id: 'technique', label: 'Technique integration' },
];

const DEFAULT_PROFILE = () => ({
  version: 1,
  genres: [], // { id, priority }
  goals: [], // learning goal ids
  balance: 'balanced',
  applications: ['fretboard', 'harmony'],
  exclusions: [], // concept ids temporarily paused
  influenceNotes: '',
  onboarded: false,
  updatedAt: 0,
});

function normalizeGenreEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const id = String(entry.id || '');
  if (!GENRE_PROFILES[id]) return null;
  const priority = GENRE_PRIORITIES.some(p => p.id === entry.priority)
    ? entry.priority
    : 'secondary';
  return { id, priority };
}

function normalizeProfile(raw) {
  const base = DEFAULT_PROFILE();
  if (!raw || typeof raw !== 'object') return base;

  const genres = Array.isArray(raw.genres)
    ? raw.genres.map(normalizeGenreEntry).filter(Boolean)
    : [];
  // Deduplicate by id, keep first
  const seen = new Set();
  const uniqueGenres = [];
  genres.forEach(g => {
    if (seen.has(g.id)) return;
    seen.add(g.id);
    uniqueGenres.push(g);
  });

  const goalIds = new Set(LEARNING_GOALS.map(g => g.id));
  const goals = Array.isArray(raw.goals)
    ? raw.goals.filter(id => goalIds.has(id))
    : [];

  const balance = STUDY_BALANCES.some(b => b.id === raw.balance)
    ? raw.balance
    : 'balanced';

  const appIds = new Set(APPLICATION_PREFS.map(a => a.id));
  const applications = Array.isArray(raw.applications)
    ? raw.applications.filter(id => appIds.has(id))
    : ['fretboard', 'harmony'];

  const exclusions = Array.isArray(raw.exclusions)
    ? raw.exclusions.filter(id => typeof id === 'string')
    : [];

  return {
    version: 1,
    genres: uniqueGenres,
    goals,
    balance,
    applications: applications.length ? applications : ['fretboard', 'harmony'],
    exclusions,
    influenceNotes: typeof raw.influenceNotes === 'string' ? raw.influenceNotes.slice(0, 280) : '',
    onboarded: Boolean(raw.onboarded) || uniqueGenres.length > 0,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
  };
}

export function getMusicProfile() {
  return normalizeProfile(getSetting(PROFILE_KEY, null));
}

export function saveMusicProfile(partial) {
  const next = normalizeProfile({ ...getMusicProfile(), ...partial, updatedAt: Date.now() });
  saveSetting(PROFILE_KEY, next);
  return next;
}

export function hasActiveGenres(profile = getMusicProfile()) {
  return profile.genres.some(g => (PRIORITY_WEIGHT[g.priority] ?? 0) > 0);
}

export function activeGenreEntries(profile = getMusicProfile()) {
  return profile.genres.filter(g => (PRIORITY_WEIGHT[g.priority] ?? 0) > 0);
}

export function genreRelevanceMap(profile = getMusicProfile()) {
  return aggregateGenreWeights(activeGenreEntries(profile));
}

export function profileSharedConcepts(profile = getMusicProfile()) {
  return sharedConcepts(activeGenreEntries(profile).map(g => g.id));
}

export function goalConceptBoosts(profile = getMusicProfile()) {
  const boosts = {};
  profile.goals.forEach(goalId => {
    const goal = LEARNING_GOALS.find(g => g.id === goalId);
    if (!goal) return;
    goal.concepts.forEach(c => {
      boosts[c] = Math.max(boosts[c] || 0, 0.85);
    });
  });
  return boosts;
}

export function isConceptExcluded(conceptId, profile = getMusicProfile()) {
  return profile.exclusions.includes(conceptId);
}

export function setGenrePriority(genreId, priority) {
  const profile = getMusicProfile();
  if (!GENRE_PROFILES[genreId]) return profile;
  const list = profile.genres.slice();
  const idx = list.findIndex(g => g.id === genreId);
  if (priority === 'inactive' && idx >= 0) {
    // Keep as inactive rather than deleting, so the user can re-enable
    list[idx] = { id: genreId, priority: 'inactive' };
  } else if (idx >= 0) {
    list[idx] = { id: genreId, priority };
  } else {
    list.push({ id: genreId, priority });
  }
  return saveMusicProfile({ genres: list, onboarded: true });
}

export function removeGenre(genreId) {
  const profile = getMusicProfile();
  return saveMusicProfile({
    genres: profile.genres.filter(g => g.id !== genreId),
  });
}

export function toggleGoal(goalId) {
  const profile = getMusicProfile();
  if (!LEARNING_GOALS.some(g => g.id === goalId)) return profile;
  const goals = profile.goals.includes(goalId)
    ? profile.goals.filter(id => id !== goalId)
    : [...profile.goals, goalId];
  return saveMusicProfile({ goals, onboarded: true });
}

export function toggleExclusion(conceptId) {
  const profile = getMusicProfile();
  const exclusions = profile.exclusions.includes(conceptId)
    ? profile.exclusions.filter(id => id !== conceptId)
    : [...profile.exclusions, conceptId];
  return saveMusicProfile({ exclusions });
}

export function toggleApplication(appId) {
  const profile = getMusicProfile();
  if (!APPLICATION_PREFS.some(a => a.id === appId)) return profile;
  let applications = profile.applications.includes(appId)
    ? profile.applications.filter(id => id !== appId)
    : [...profile.applications, appId];
  if (!applications.length) applications = ['fretboard'];
  return saveMusicProfile({ applications });
}

export function setStudyBalance(balanceId) {
  if (!STUDY_BALANCES.some(b => b.id === balanceId)) return getMusicProfile();
  return saveMusicProfile({ balance: balanceId, onboarded: true });
}

/** Human-readable summary of saved genres for UI copy. */
export function genreSummary(profile = getMusicProfile()) {
  const active = activeGenreEntries(profile)
    .slice()
    .sort((a, b) => (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0));
  if (!active.length) return 'General theory';
  return active
    .map(g => GENRE_PROFILES[g.id]?.label || g.id)
    .join(', ');
}

export function primaryGenreLabels(profile = getMusicProfile(), limit = 2) {
  return activeGenreEntries(profile)
    .slice()
    .sort((a, b) => (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0))
    .slice(0, limit)
    .map(g => GENRE_PROFILES[g.id]?.label || g.id);
}
