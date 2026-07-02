// Lightweight training-stats store for Musi. Records each drill answer and
// surfaces a motivational, quick-scan summary on Home: minutes trained today,
// current accuracy, current streak, best streak, and the weakest skill.
//
// Everything is local-only and stored under the shared settings store so it
// survives reloads. Active "minutes trained today" is approximated by summing
// the gaps between consecutive answers (gaps longer than IDLE_MS are treated as
// the player stepping away and are not counted).

import { getSetting, saveSetting } from './persistence.js';

const STATS_KEY = 'stats';
const IDLE_MS = 120000; // gaps longer than 2 min don't count as active practice
const WEAK_MIN_ATTEMPTS = 4; // need a few reps before a skill can be "weakest"

const SKILL_LABELS = {
  scale: 'Scales',
  interval: 'Intervals',
  sightreading: 'Sight Reading',
  fretboard: 'Fretboard',
  ear: 'Ear',
  timing: 'Timing',
};

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
  renderStats();
}

function weakestSkill(today) {
  let weakest = null;
  Object.entries(today.perSkill || {}).forEach(([id, s]) => {
    if (!s || s.attempts < WEAK_MIN_ATTEMPTS) return;
    const acc = s.correct / s.attempts;
    if (!weakest || acc < weakest.acc) {
      weakest = { id, acc };
    }
  });
  return weakest;
}

export function getStatsSnapshot() {
  const stats = loadStats();
  const t = stats.today;
  const accuracy = t.attempts > 0 ? Math.round((t.correct / t.attempts) * 100) : null;
  const weak = weakestSkill(t);
  return {
    minutesToday: Math.round(t.trainedMs / 60000),
    accuracy,
    currentStreak: stats.currentStreak,
    bestStreak: stats.bestStreak,
    weakest: weak ? { label: SKILL_LABELS[weak.id] || weak.id, accuracy: Math.round(weak.acc * 100) } : null,
  };
}

function tile(value, label, opts = {}) {
  const sub = opts.sub ? `<div class="stat-tile-sub">${opts.sub}</div>` : '';
  const cls = 'stat-tile' + (opts.highlight ? ' highlight' : '') + (opts.wide ? ' wide' : '');
  const icon = opts.icon ? `<span class="stat-tile-icon">${opts.icon}</span>` : '';
  return `<div class="${cls}">
      <div class="stat-tile-value">${icon}${value}</div>
      <div class="stat-tile-label">${label}</div>
      ${sub}
    </div>`;
}

export function renderStats() {
  const grid = document.getElementById('home-stats-grid');
  if (!grid) return;
  const s = getStatsSnapshot();

  const accVal = s.accuracy === null ? '--' : `${s.accuracy}%`;
  const weakVal = s.weakest ? s.weakest.label : '--';
  const weakSub = s.weakest ? `${s.weakest.accuracy}% accuracy` : 'Keep training';

  grid.innerHTML = [
    tile(`${s.minutesToday}<span class="stat-tile-unit">min</span>`, 'Trained today'),
    tile(accVal, 'Accuracy today'),
    tile(`${s.currentStreak}`, 'Current streak', { icon: '\u{1F525}', highlight: s.currentStreak >= 3 }),
    tile(`${s.bestStreak}`, 'Best streak'),
    tile(weakVal, 'Weakest skill', { sub: weakSub, wide: true }),
  ].join('');
}

export function initStats() {
  renderStats();
}
