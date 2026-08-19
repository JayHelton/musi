// Lightweight training-stats store for Musi. Every drill answer lands here:
// minutes trained today, accuracy, the current streak, the best streak, and a
// per-skill tally.
//
// Everything is local-only and stored under the shared settings store, so it
// survives a reload and it travels with device and cloud sync. Active "minutes
// trained today" is the sum of the gaps between consecutive answers; a gap
// longer than IDLE_MS means the player stepped away, so it does not count.

import { getSetting, saveSetting } from './persistence.js';

const STATS_KEY = 'stats';
const IDLE_MS = 120000; // gaps longer than 2 min don't count as active practice

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function freshToday() {
  return { day: todayKey(), trainedMs: 0, attempts: 0, correct: 0, perSkill: {} };
}

function loadStats() {
  const raw = getSetting(STATS_KEY, null);
  const stats = (raw && typeof raw === 'object') ? raw : {};
  if (!stats.today || stats.today.day !== todayKey()) {
    stats.today = freshToday();
  }
  if (!stats.today.perSkill) stats.today.perSkill = {};
  if (typeof stats.bestStreak !== 'number') stats.bestStreak = 0;
  if (typeof stats.currentStreak !== 'number') stats.currentStreak = 0;
  if (typeof stats.lastActivityTs !== 'number') stats.lastActivityTs = 0;
  return stats;
}

function saveStats(stats) {
  saveSetting(STATS_KEY, stats);
}

// Record one answered question for a skill. `correct` drives accuracy + streaks.
export function recordAttempt(skillId, correct) {
  const stats = loadStats();
  const now = Date.now();

  if (stats.lastActivityTs && now - stats.lastActivityTs < IDLE_MS) {
    stats.today.trainedMs += now - stats.lastActivityTs;
  }
  stats.lastActivityTs = now;

  stats.today.attempts += 1;
  const skill = stats.today.perSkill[skillId] || { attempts: 0, correct: 0 };
  skill.attempts += 1;
  if (correct) {
    stats.today.correct += 1;
    skill.correct += 1;
    stats.currentStreak += 1;
    if (stats.currentStreak > stats.bestStreak) stats.bestStreak = stats.currentStreak;
  } else {
    stats.currentStreak = 0;
  }
  stats.today.perSkill[skillId] = skill;

  saveStats(stats);
}
