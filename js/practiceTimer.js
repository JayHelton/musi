// Practice Timer for Musi. A countdown timer for focused practice with an
// optional tempo plan that drives the metronome: schedule BPM changes at points
// in the session (e.g. a new tempo every 2, 5 or 10 minutes) and the timer
// switches the metronome as it crosses each mark.
//
// Config lives in localStorage via the shared settings store. The countdown
// keeps running across navigation so the alarm still fires while you use other
// tools; tempo automation resumes the metronome when you return here.

import { audioCtx, ensureAudio, getAnalyserDestination } from './audio.js';
import { metro, startMetronome, stopMetronome, setBpm } from './metronome.js';
import { getSetting, saveSetting } from './persistence.js';

const MIN_MINUTES = 1;
const MAX_MINUTES = 180;
const MIN_BPM = 30;
const MAX_BPM = 300;

const pt = {
  totalSec: 15 * 60,
  remainingMs: 15 * 60 * 1000,
  running: false,
  automation: false,
  alarm: true,
  schedule: [],       // [{ at: seconds, bpm }]
  _tick: null,
  _lastTs: 0,
  _lastBpm: null,
  _startedMetro: false,
  _alarmTimers: [],
};

let bound = false;

function q(id) { return document.getElementById(id); }

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// --- persistence -----------------------------------------------------------

function loadConfig() {
  pt.totalSec = clampInt(getSetting('practice.minutes', 15), MIN_MINUTES, MAX_MINUTES, 15) * 60;
  pt.remainingMs = pt.totalSec * 1000;
  pt.automation = !!getSetting('practice.automation', false);
  pt.alarm = getSetting('practice.alarm', true) !== false;
  const saved = getSetting('practice.schedule', null);
  pt.schedule = Array.isArray(saved) ? normalizeSchedule(saved) : [];
}

function normalizeSchedule(raw) {
  const out = [];
  const seen = new Set();
  raw.forEach(seg => {
    if (!seg || typeof seg !== 'object') return;
    const at = clampInt(seg.at, 0, MAX_MINUTES * 60, null);
    const bpm = clampInt(seg.bpm, MIN_BPM, MAX_BPM, null);
    if (at === null || bpm === null || seen.has(at)) return;
    seen.add(at);
    out.push({ at, bpm });
  });
  out.sort((a, b) => a.at - b.at);
  return out;
}

function saveSchedule() {
  saveSetting('practice.schedule', pt.schedule);
}

// --- formatting ------------------------------------------------------------

function fmt(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtMark(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m} min` : `${m}:${String(s).padStart(2, '0')}`;
}

// --- schedule helpers ------------------------------------------------------

function activeBpmForElapsed(elapsedSec) {
  let bpm = null;
  for (const seg of pt.schedule) {
    if (seg.at <= elapsedSec + 0.001) bpm = seg.bpm; else break;
  }
  return bpm;
}

function addSegment(atSec, bpm) {
  const at = clampInt(atSec, 0, MAX_MINUTES * 60, null);
  const b = clampInt(bpm, MIN_BPM, MAX_BPM, null);
  if (at === null || b === null) return;
  pt.schedule = pt.schedule.filter(s => s.at !== at);
  pt.schedule.push({ at, bpm: b });
  pt.schedule.sort((a, c) => a.at - c.at);
  saveSchedule();
  renderSchedule();
}

function removeSegment(at) {
  pt.schedule = pt.schedule.filter(s => s.at !== at);
  saveSchedule();
  renderSchedule();
}

function generatePlan() {
  const intervalMin = clampInt(q('pt-gen-interval')?.value, 1, 120, 5);
  const startBpm = clampInt(q('pt-gen-start')?.value, MIN_BPM, MAX_BPM, 80);
  const step = clampInt(q('pt-gen-step')?.value, -200, 200, 5);
  const intervalSec = intervalMin * 60;
  const schedule = [];
  let i = 0;
  for (let t = 0; t < pt.totalSec; t += intervalSec) {
    const bpm = Math.max(MIN_BPM, Math.min(MAX_BPM, startBpm + i * step));
    schedule.push({ at: t, bpm });
    i += 1;
  }
  if (!schedule.length) schedule.push({ at: 0, bpm: startBpm });
  pt.schedule = schedule;
  saveSchedule();
  renderSchedule();
  // A generated plan is meant to be used, so switch automation on for clarity.
  if (!pt.automation) {
    pt.automation = true;
    saveSetting('practice.automation', true);
    const auto = q('pt-auto');
    if (auto) auto.checked = true;
    updateAutoUI();
  }
}

// --- rendering -------------------------------------------------------------

function renderDisplay() {
  const display = q('pt-display');
  if (display) display.textContent = fmt(pt.remainingMs);
  const fill = q('pt-progress-fill');
  if (fill) {
    const done = pt.totalSec > 0 ? 1 - (pt.remainingMs / 1000) / pt.totalSec : 0;
    fill.style.width = Math.max(0, Math.min(1, done)) * 100 + '%';
  }
}

function setStatus(text) {
  const el = q('pt-status');
  if (el) el.textContent = text;
}

function renderSchedule() {
  const list = q('pt-sched-list');
  if (!list) return;
  list.innerHTML = '';
  if (!pt.schedule.length) {
    const empty = document.createElement('div');
    empty.className = 'pt-sched-empty';
    empty.textContent = 'No tempo marks yet. Generate a plan or add one below.';
    list.appendChild(empty);
    return;
  }
  const elapsedSec = pt.totalSec - Math.ceil(pt.remainingMs / 1000);
  const activeBpm = activeBpmForElapsed(elapsedSec);
  pt.schedule.forEach(seg => {
    const row = document.createElement('div');
    row.className = 'pt-sched-row';
    if (pt.running && pt.automation && seg.bpm === activeBpm && seg.at <= elapsedSec) row.classList.add('current');
    const at = document.createElement('span');
    at.className = 'pt-sched-at';
    at.textContent = fmtMark(seg.at);
    const bpm = document.createElement('span');
    bpm.className = 'pt-sched-bpm';
    bpm.textContent = seg.bpm + ' BPM';
    const del = document.createElement('button');
    del.className = 'pt-sched-del';
    del.type = 'button';
    del.setAttribute('aria-label', 'Remove tempo mark');
    del.textContent = '\u2715';
    del.onclick = () => removeSegment(seg.at);
    row.appendChild(at);
    row.appendChild(bpm);
    row.appendChild(del);
    list.appendChild(row);
  });
}

function updateAutoUI() {
  const card = q('sec-practice')?.querySelector('.pt-sched-card');
  if (card) card.classList.toggle('auto-on', pt.automation);
}

function updateStartButton() {
  const btn = q('pt-start');
  if (!btn) return;
  if (pt.running) {
    btn.innerHTML = '&#10073;&#10073; Pause';
    btn.classList.add('running');
  } else {
    const started = pt.remainingMs < pt.totalSec * 1000 && pt.remainingMs > 0;
    btn.innerHTML = started ? '&#9654; Resume' : '&#9654; Start';
    btn.classList.remove('running');
  }
  const minutes = q('pt-minutes');
  if (minutes) minutes.disabled = pt.running;
}

// --- alarm -----------------------------------------------------------------

function playAlarm() {
  if (!pt.alarm) return;
  ensureAudio();
  if (!audioCtx) return;
  stopAlarm();
  const beat = 0.18;
  for (let i = 0; i < 3; i++) {
    const t = audioCtx.currentTime + i * (beat + 0.12);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.setValueAtTime(1175, t + beat / 2);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.4, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + beat);
    osc.connect(gain);
    gain.connect(getAnalyserDestination());
    osc.start(t);
    osc.stop(t + beat + 0.02);
  }
}

function stopAlarm() {
  pt._alarmTimers.forEach(clearTimeout);
  pt._alarmTimers = [];
}

// --- metronome automation --------------------------------------------------

function startMetroAutomation() {
  if (!pt.automation) return;
  ensureAudio();
  const elapsedSec = pt.totalSec - pt.remainingMs / 1000;
  const bpm = activeBpmForElapsed(elapsedSec);
  if (bpm !== null) { setBpm(bpm); pt._lastBpm = bpm; }
  if (!metro.playing) { startMetronome(); pt._startedMetro = true; }
}

function stopMetroAutomation() {
  if (pt._startedMetro && metro.playing) stopMetronome();
  pt._startedMetro = false;
  pt._lastBpm = null;
}

function applyAutomationTick(elapsedSec) {
  if (!pt.automation || !metro.playing) return;
  const bpm = activeBpmForElapsed(elapsedSec);
  if (bpm !== null && bpm !== pt._lastBpm) {
    setBpm(bpm);
    pt._lastBpm = bpm;
    renderSchedule();
  }
}

// --- countdown -------------------------------------------------------------

function tick() {
  const now = performance.now();
  const dt = now - pt._lastTs;
  pt._lastTs = now;
  pt.remainingMs -= dt;

  if (pt.remainingMs <= 0) {
    pt.remainingMs = 0;
    complete();
    return;
  }
  const elapsedSec = pt.totalSec - pt.remainingMs / 1000;
  applyAutomationTick(elapsedSec);
  renderDisplay();
}

function start() {
  if (pt.running) { pause(); return; }
  ensureAudio();
  if (pt.remainingMs <= 0) pt.remainingMs = pt.totalSec * 1000;
  pt.running = true;
  pt._lastTs = performance.now();
  pt._lastBpm = null;
  startMetroAutomation();
  if (pt._tick) clearInterval(pt._tick);
  pt._tick = setInterval(tick, 200);
  setStatus(pt.automation ? 'Practicing \u2014 metronome running' : 'Practicing');
  updateStartButton();
  renderSchedule();
}

function pause() {
  pt.running = false;
  if (pt._tick) { clearInterval(pt._tick); pt._tick = null; }
  stopMetroAutomation();
  setStatus('Paused');
  updateStartButton();
  renderDisplay();
  renderSchedule();
}

function reset() {
  pt.running = false;
  if (pt._tick) { clearInterval(pt._tick); pt._tick = null; }
  stopMetroAutomation();
  stopAlarm();
  pt.remainingMs = pt.totalSec * 1000;
  setStatus('Ready');
  updateStartButton();
  renderDisplay();
  renderSchedule();
}

function complete() {
  pt.running = false;
  if (pt._tick) { clearInterval(pt._tick); pt._tick = null; }
  stopMetroAutomation();
  pt.remainingMs = 0;
  renderDisplay();
  setStatus('Time\u2019s up!');
  updateStartButton();
  renderSchedule();
  playAlarm();
  const card = q('sec-practice')?.querySelector('.pt-timer-card');
  if (card) {
    card.classList.add('pt-done');
    setTimeout(() => card.classList.remove('pt-done'), 1500);
  }
}

function setMinutes(min) {
  const m = clampInt(min, MIN_MINUTES, MAX_MINUTES, 15);
  pt.totalSec = m * 60;
  saveSetting('practice.minutes', m);
  const input = q('pt-minutes');
  if (input) input.value = m;
  if (!pt.running) {
    pt.remainingMs = pt.totalSec * 1000;
    setStatus('Ready');
  }
  renderDisplay();
  updateStartButton();
  renderSchedule();
}

// --- init / teardown -------------------------------------------------------

export function initPracticeTimer() {
  if (!q('pt-display')) return;

  if (!bound) {
    bound = true;
    loadConfig();

    const minutes = q('pt-minutes');
    if (minutes) {
      minutes.value = pt.totalSec / 60;
      minutes.onchange = () => setMinutes(minutes.value);
    }
    const down = q('pt-min-down');
    if (down) down.onclick = () => setMinutes(pt.totalSec / 60 - 1);
    const up = q('pt-min-up');
    if (up) up.onclick = () => setMinutes(pt.totalSec / 60 + 1);
    document.querySelectorAll('.pt-preset').forEach(btn => {
      btn.onclick = () => setMinutes(btn.dataset.min);
    });

    const startBtn = q('pt-start');
    if (startBtn) startBtn.onclick = start;
    const resetBtn = q('pt-reset');
    if (resetBtn) resetBtn.onclick = reset;

    const alarm = q('pt-alarm');
    if (alarm) {
      alarm.checked = pt.alarm;
      alarm.onchange = () => { pt.alarm = alarm.checked; saveSetting('practice.alarm', pt.alarm); };
    }
    const auto = q('pt-auto');
    if (auto) {
      auto.checked = pt.automation;
      auto.onchange = () => {
        pt.automation = auto.checked;
        saveSetting('practice.automation', pt.automation);
        updateAutoUI();
        if (pt.running) {
          if (pt.automation) startMetroAutomation();
          else stopMetroAutomation();
        }
      };
    }

    const genBuild = q('pt-gen-build');
    if (genBuild) genBuild.onclick = generatePlan;
    const add = q('pt-add');
    if (add) add.onclick = () => {
      const min = Number(q('pt-add-min')?.value);
      const bpm = Number(q('pt-add-bpm')?.value);
      addSegment(Math.round(min * 60), bpm);
    };
  }

  // Resume the metronome when returning to the tool mid-session (navigation
  // stops all tool audio, but the countdown keeps running in the background).
  if (pt.running && pt.automation && !metro.playing) startMetroAutomation();

  updateAutoUI();
  updateStartButton();
  renderDisplay();
  renderSchedule();
  if (!pt.running) setStatus(pt.remainingMs < pt.totalSec * 1000 && pt.remainingMs > 0 ? 'Paused' : 'Ready');
}

export function stopPracticeTimer() {
  // The countdown intentionally keeps running across navigation so the alarm
  // still fires. Only silence a ringing alarm here; the metronome is stopped by
  // the app's normal tool switching.
  stopAlarm();
  pt._startedMetro = false;
}
