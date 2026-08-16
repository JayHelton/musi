// Metronome companion. Plays the BPM progression saved with the workbook, so
// the player presses Start instead of rebuilding a tempo plan each session.

import { audioCtx, ensureAudio, getAnalyserDestination } from '../audio.js';
import { claimAudio, releaseAudio } from '../audio/audioOwner.js';
import { showNowPlaying, hideNowPlaying } from '../nowPlaying.js';
import { createCompanionPanel } from './panel.js';
import {
  describeMetronomePlan,
  formatMetroDuration,
  metroClicksPerBeat,
  metroSubdivInfo,
  metronomePlanSteps,
  metronomePlanTotalSeconds,
  metronomeStepAt,
  normalizeMetroBeats,
  normalizeMetroBpm,
  normalizeMetroSubdiv,
} from './metronomePlan.js';

const SCHEDULE_AHEAD_SEC = 0.1;
const SCHEDULE_TICK_MS = 25;
const STATUS_TICK_MS = 250;

function clickBuffer(time, accented) {
  const osc = audioCtx.createOscillator();
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(accented ? 1200 : 800, time);
  osc.frequency.exponentialRampToValueAtTime(accented ? 600 : 400, time + 0.04);

  filter.type = 'bandpass';
  filter.frequency.value = accented ? 1000 : 700;
  filter.Q.value = 2;

  gain.gain.setValueAtTime(accented ? 0.35 : 0.2, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(getAnalyserDestination());
  osc.start(time);
  osc.stop(time + 0.08);
}

export function mountMetronome(host, companion, options = {}) {
  const shell = createCompanionPanel(host, companion, options);

  let steps = metronomePlanSteps(companion);
  let beatsPerBar = normalizeMetroBeats(companion.beatsPerBar);

  const plan = document.createElement('p');
  plan.className = 'ec-sub ec-metro-plan';

  const readout = document.createElement('div');
  readout.className = 'ec-metro-readout';

  const bpmEl = document.createElement('div');
  bpmEl.className = 'ec-metro-bpm';
  const bpmValue = document.createElement('span');
  bpmValue.className = 'ec-metro-bpm-value';
  const bpmUnit = document.createElement('span');
  bpmUnit.className = 'ec-metro-bpm-unit';
  bpmUnit.textContent = 'BPM';
  bpmEl.append(bpmValue, bpmUnit);

  const subdivEl = document.createElement('div');
  subdivEl.className = 'ec-metro-subdiv';

  readout.append(bpmEl, subdivEl);

  const beats = document.createElement('div');
  beats.className = 'ec-metro-beats';

  const progress = document.createElement('div');
  progress.className = 'ec-metro-progress';
  const progressBar = document.createElement('div');
  progressBar.className = 'ec-metro-progress-bar';
  progress.appendChild(progressBar);

  const status = document.createElement('p');
  status.className = 'ec-metro-status';

  const stepList = document.createElement('ol');
  stepList.className = 'ec-metro-steps';

  const controls = document.createElement('div');
  controls.className = 'ec-metro-controls';
  const startBtn = document.createElement('button');
  startBtn.type = 'button';
  startBtn.className = 'ec-btn ec-btn-start';
  startBtn.textContent = 'Start';
  const stopBtn = document.createElement('button');
  stopBtn.type = 'button';
  stopBtn.className = 'ec-btn ec-btn-stop';
  stopBtn.textContent = 'Stop';
  stopBtn.disabled = true;
  controls.append(startBtn, stopBtn);

  shell.body.append(plan, readout, beats, progress, status, controls, stepList);

  let running = false;
  let ownerHandle = null;
  let scheduleTimer = 0;
  let statusTimer = 0;
  let nextClickTime = 0;
  let planStartTime = 0;
  let countInLeft = 0;
  let activeStepIndex = -1;
  let activeBpm = normalizeMetroBpm(companion.startBpm);
  let activeSubdiv = normalizeMetroSubdiv(companion.subdiv);
  // The scheduler runs ahead of the sound, so the readout tracks its own copy
  // of the step and only catches up when that step is audible.
  let shownStepIndex = -1;
  let shownBpm = activeBpm;
  let shownSubdiv = activeSubdiv;
  let beatIndex = 0;
  let clickIndex = 0;
  let beatTimers = [];
  // Bumped on every start and stop so timers queued by an earlier run cannot
  // paint the readout of the current one.
  let sessionId = 0;

  function planLoops() {
    return !!companion.planLoop;
  }

  function renderBeats() {
    beats.innerHTML = '';
    for (let i = 0; i < beatsPerBar; i += 1) {
      const dot = document.createElement('span');
      dot.className = 'ec-metro-beat' + (i === 0 ? ' accent' : '');
      beats.appendChild(dot);
    }
  }

  function highlightBeat(index) {
    const dots = beats.querySelectorAll('.ec-metro-beat');
    dots.forEach((dot, i) => dot.classList.toggle('on', i === index));
  }

  function clearBeatTimers() {
    beatTimers.forEach(clearTimeout);
    beatTimers = [];
  }

  function renderStepList() {
    stepList.innerHTML = '';
    if (!steps.length) {
      stepList.hidden = true;
      return;
    }
    stepList.hidden = false;
    steps.forEach((s, i) => {
      const row = document.createElement('li');
      row.className = 'ec-metro-step' + (i === shownStepIndex ? ' current' : '');
      const dur = document.createElement('span');
      dur.className = 'ec-metro-step-dur';
      dur.textContent = formatMetroDuration(s.seconds);
      const meta = document.createElement('span');
      meta.className = 'ec-metro-step-meta';
      meta.textContent = `${s.bpm} BPM · ${metroSubdivInfo(s.subdiv).label}`;
      row.append(dur, meta);
      stepList.appendChild(row);
    });
  }

  function renderReadout() {
    bpmValue.textContent = String(shownBpm);
    subdivEl.textContent = metroSubdivInfo(shownSubdiv).label;
  }

  function renderIdleStatus() {
    if (!steps.length) {
      status.textContent = 'Steady tempo · no plan steps.';
      progressBar.style.width = '0%';
      return;
    }
    const total = formatMetroDuration(metronomePlanTotalSeconds(steps));
    const loopNote = planLoops() ? ' · loops' : '';
    status.textContent = `${steps.length} step${steps.length === 1 ? '' : 's'} · ${total} total${loopNote}`;
    progressBar.style.width = '0%';
  }

  function renderRunningStatus() {
    if (!steps.length) {
      status.textContent = `Running · ${shownBpm} BPM`;
      progressBar.style.width = '100%';
      return;
    }
    const elapsed = audioCtx.currentTime - planStartTime;
    const at = metronomeStepAt(steps, elapsed, { loop: planLoops() });
    if (!at) return;
    const done = at.step.seconds - at.remaining;
    const pct = at.step.seconds > 0 ? Math.max(0, Math.min(1, done / at.step.seconds)) : 0;
    progressBar.style.width = `${pct * 100}%`;
    status.textContent = `Step ${at.index + 1}/${steps.length} · ${at.step.bpm} BPM · ${metroSubdivInfo(at.step.subdiv).label} · ${formatMetroDuration(at.remaining)} left`;
  }

  function nowPlayingLabel(bpm = shownBpm, subdiv = shownSubdiv) {
    return `Metronome — ${bpm} BPM · ${metroSubdivInfo(subdiv).label}`;
  }

  function showStep(index, bpm, subdiv) {
    shownStepIndex = index;
    shownBpm = bpm;
    shownSubdiv = subdiv;
    renderReadout();
    renderStepList();
    showNowPlaying(nowPlayingLabel(bpm, subdiv), stopSession);
  }

  // Applies the plan step that owns `scheduleTime`. Returns false when a
  // non-looping plan has run out and the click track should wind down.
  function applyStepFor(scheduleTime) {
    if (!steps.length) return true;
    const at = metronomeStepAt(steps, scheduleTime - planStartTime, { loop: planLoops() });
    if (!at) return false;
    if (at.index !== activeStepIndex) {
      activeStepIndex = at.index;
      activeBpm = at.step.bpm;
      activeSubdiv = at.step.subdiv;
      // Each step opens a fresh bar so the accent stays on beat one.
      beatIndex = 0;
      clickIndex = 0;
      const index = at.index;
      const bpm = at.step.bpm;
      const subdiv = at.step.subdiv;
      const token = sessionId;
      const delay = Math.max(0, (scheduleTime - audioCtx.currentTime) * 1000);
      beatTimers.push(setTimeout(() => {
        if (running && token === sessionId) showStep(index, bpm, subdiv);
      }, delay));
    }
    return true;
  }

  function scheduleBeatLight(time, index) {
    const token = sessionId;
    const delay = Math.max(0, (time - audioCtx.currentTime) * 1000);
    beatTimers.push(setTimeout(() => {
      if (running && token === sessionId) highlightBeat(index);
    }, delay));
    // Keep the pending list short. Dropped ids belong to timers that already
    // fired, and the session token stops any straggler from painting.
    if (beatTimers.length > 64) beatTimers = beatTimers.slice(-64);
  }

  function scheduler() {
    if (!running) return;
    while (nextClickTime < audioCtx.currentTime + SCHEDULE_AHEAD_SEC) {
      if (countInLeft > 0) {
        const countBeat = beatsPerBar - countInLeft;
        clickBuffer(nextClickTime, countInLeft === beatsPerBar);
        scheduleBeatLight(nextClickTime, countBeat);
        nextClickTime += 60 / activeBpm;
        countInLeft -= 1;
        continue;
      }
      if (!planStartTime) planStartTime = nextClickTime;
      if (!applyStepFor(nextClickTime)) {
        const stopDelay = Math.max(0, (nextClickTime - audioCtx.currentTime) * 1000);
        setTimeout(() => { if (running) stopSession({ finished: true }); }, stopDelay);
        return;
      }
      const perBeat = metroClicksPerBeat(activeSubdiv);
      const accented = clickIndex === 0 && beatIndex % beatsPerBar === 0;
      clickBuffer(nextClickTime, accented);
      if (clickIndex === 0) scheduleBeatLight(nextClickTime, beatIndex % beatsPerBar);
      nextClickTime += (60 / activeBpm) / perBeat;
      clickIndex += 1;
      if (clickIndex >= perBeat) {
        clickIndex = 0;
        beatIndex += 1;
      }
    }
    scheduleTimer = setTimeout(scheduler, SCHEDULE_TICK_MS);
  }

  function startSession() {
    if (running) return;
    steps = metronomePlanSteps(companion);
    beatsPerBar = normalizeMetroBeats(companion.beatsPerBar);
    renderBeats();
    ensureAudio();
    const handle = claimAudio({
      id: `metronome-companion-${companion.id}`,
      label: 'Metronome',
      kind: 'metronome',
      onStop: () => stopSession({ fromOwner: true }),
    });
    if (!handle) return;
    ownerHandle = handle;

    sessionId += 1;
    const first = steps.length ? steps[0] : null;
    activeStepIndex = -1;
    activeBpm = first ? first.bpm : normalizeMetroBpm(companion.startBpm);
    activeSubdiv = first ? first.subdiv : normalizeMetroSubdiv(companion.subdiv);
    shownStepIndex = -1;
    shownBpm = activeBpm;
    shownSubdiv = activeSubdiv;
    beatIndex = 0;
    clickIndex = 0;
    planStartTime = 0;
    countInLeft = companion.countIn ? beatsPerBar : 0;
    nextClickTime = audioCtx.currentTime + 0.05;

    running = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    shell.panel.classList.add('ec-metro-running');
    renderReadout();
    renderStepList();
    showNowPlaying(nowPlayingLabel(), stopSession);
    if (statusTimer) clearInterval(statusTimer);
    statusTimer = setInterval(() => {
      if (running) renderRunningStatus();
    }, STATUS_TICK_MS);
    status.textContent = countInLeft > 0 ? 'Count-in…' : 'Starting…';
    scheduler();
  }

  function stopSession({ fromOwner = false, finished = false } = {}) {
    const wasRunning = running;
    running = false;
    sessionId += 1;
    if (scheduleTimer) { clearTimeout(scheduleTimer); scheduleTimer = 0; }
    if (statusTimer) { clearInterval(statusTimer); statusTimer = 0; }
    clearBeatTimers();
    highlightBeat(-1);
    activeStepIndex = -1;
    planStartTime = 0;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    shell.panel.classList.remove('ec-metro-running');
    if (wasRunning) hideNowPlaying();
    if (!fromOwner && ownerHandle) {
      releaseAudio(ownerHandle);
      ownerHandle = null;
    }
    if (fromOwner) ownerHandle = null;
    activeBpm = steps.length ? steps[0].bpm : normalizeMetroBpm(companion.startBpm);
    activeSubdiv = steps.length ? steps[0].subdiv : normalizeMetroSubdiv(companion.subdiv);
    shownStepIndex = -1;
    shownBpm = activeBpm;
    shownSubdiv = activeSubdiv;
    renderReadout();
    renderStepList();
    if (finished) {
      status.textContent = 'Plan complete.';
      progressBar.style.width = '100%';
    } else if (wasRunning) {
      renderIdleStatus();
    }
  }

  function syncFromCompanion() {
    steps = metronomePlanSteps(companion);
    beatsPerBar = normalizeMetroBeats(companion.beatsPerBar);
    activeBpm = steps.length ? steps[0].bpm : normalizeMetroBpm(companion.startBpm);
    activeSubdiv = steps.length ? steps[0].subdiv : normalizeMetroSubdiv(companion.subdiv);
    shownStepIndex = -1;
    shownBpm = activeBpm;
    shownSubdiv = activeSubdiv;
    plan.textContent = describeMetronomePlan(companion);
    renderBeats();
    renderReadout();
    renderStepList();
    renderIdleStatus();
  }

  function onStopClick() {
    stopSession();
  }

  startBtn.addEventListener('click', startSession);
  stopBtn.addEventListener('click', onStopClick);

  syncFromCompanion();

  return {
    refresh() {
      if (running) return;
      syncFromCompanion();
    },
    // The click track is meant to run while the player works on the exercise,
    // so hiding the tools pane leaves it playing. Every other stop is real.
    stop(reason) {
      if (reason === 'pane-hidden' && running) return;
      stopSession();
    },
    destroy() {
      stopSession();
      startBtn.removeEventListener('click', startSession);
      stopBtn.removeEventListener('click', onStopClick);
      shell.destroy();
    },
  };
}
