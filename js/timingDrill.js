import { audioCtx, ensureAudio, getAnalyserDestination } from './audio.js';
import { getContext, setContext, subscribeContext } from './musicalContext.js';
import { showNowPlaying, hideNowPlaying } from './nowPlaying.js';
import { getSetting, saveSetting } from './persistence.js';
import { recordAttempt } from './stats.js';

const PERFECT_MS = 20;
const GOOD_MS = 60;
const MAX_OFFSET_MS = 140;
const SCHEDULE_AHEAD_SEC = 0.12;
const BEAT_LOOKBACK_SEC = 1.5;
const BEAT_OPTIONS = [2, 3, 4, 5, 6, 7, 8];

const timingDrill = {
  bpm: 120,
  beatsPerMeasure: 4,
  playing: false,
  beatIndex: 0,
  measureIndex: 1,
  attempts: 0,
  perfect: 0,
  good: 0,
  fast: 0,
  slow: 0,
  streak: 0,
  bestStreak: 0,
  _timer: null,
  _nextBeatTime: 0,
  _beatHistory: [],
  _uiTimers: [],
  _settingsLoaded: false,
};

let contextSubscribed = false;
let keyHandlerInstalled = false;

function clamp(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function restoreSettings() {
  if (timingDrill._settingsLoaded) return;
  timingDrill._settingsLoaded = true;
  timingDrill.bpm = clamp(getSetting('timing.bpm', getContext().tempo), 30, 300, 120);
  timingDrill.beatsPerMeasure = clamp(getSetting('timing.beatsPerMeasure', 4), 2, 8, 4);
  if (!BEAT_OPTIONS.includes(timingDrill.beatsPerMeasure)) timingDrill.beatsPerMeasure = 4;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function updateBpmUi() {
  const input = document.getElementById('td-bpm');
  const slider = document.getElementById('td-bpm-slider');
  if (input) input.value = timingDrill.bpm;
  if (slider) slider.value = timingDrill.bpm;
  setText('td-bpm-readout', `${timingDrill.bpm} BPM`);
}

function setBpm(value, fromContext = false) {
  timingDrill.bpm = clamp(value, 30, 300, timingDrill.bpm);
  saveSetting('timing.bpm', timingDrill.bpm);
  updateBpmUi();
  if (!fromContext) setContext({ tempo: timingDrill.bpm }, 'timing');
  if (timingDrill.playing) showNowPlaying(`Timing drill - ${timingDrill.bpm} BPM`, stopTimingDrill);
}

function setBeatsPerMeasure(value) {
  timingDrill.beatsPerMeasure = clamp(value, 2, 8, 4);
  saveSetting('timing.beatsPerMeasure', timingDrill.beatsPerMeasure);
  renderBeatDots();
  updateMeasureLabel();
}

function clearUiTimers() {
  timingDrill._uiTimers.forEach(clearTimeout);
  timingDrill._uiTimers = [];
}

function rememberTimer(id) {
  timingDrill._uiTimers.push(id);
  return id;
}

function scheduleClick(time, accented) {
  const osc = audioCtx.createOscillator();
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(accented ? 1300 : 850, time);
  osc.frequency.exponentialRampToValueAtTime(accented ? 620 : 420, time + 0.04);

  filter.type = 'bandpass';
  filter.frequency.value = accented ? 1100 : 760;
  filter.Q.value = 2.2;

  gain.gain.setValueAtTime(accented ? 0.34 : 0.2, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.065);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(getAnalyserDestination());
  osc.start(time);
  osc.stop(time + 0.08);
}

function renderBeatDots() {
  const wrap = document.getElementById('td-beat-dots');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (let i = 0; i < timingDrill.beatsPerMeasure; i += 1) {
    const dot = document.createElement('div');
    dot.className = 'td-beat-dot';
    dot.dataset.beat = String(i);
    dot.innerHTML = `<span>${i + 1}</span>`;
    wrap.appendChild(dot);
  }
}

function updateMeasureLabel() {
  setText('td-measure-label', `Measure ${timingDrill.measureIndex} - ${timingDrill.beatsPerMeasure}/4`);
}

function highlightBeat(beatIndex, measureIndex) {
  updateMeasureLabel();
  document.querySelectorAll('.td-beat-dot').forEach(dot => {
    const active = Number(dot.dataset.beat) === beatIndex;
    dot.classList.toggle('active', active);
    dot.classList.toggle('downbeat', active && beatIndex === 0);
  });
  setText('td-current-beat', `${measureIndex}.${beatIndex + 1}`);
}

function flashBeatResult(beatIndex, category) {
  const dot = document.querySelector(`.td-beat-dot[data-beat="${beatIndex}"]`);
  if (!dot) return;
  dot.classList.remove('perfect', 'good', 'fast', 'slow');
  void dot.offsetWidth;
  dot.classList.add(category);
  rememberTimer(setTimeout(() => dot.classList.remove(category), 360));
}

function scheduleBeatUi(time, beatIndex, measureIndex) {
  const delay = Math.max(0, (time - audioCtx.currentTime) * 1000);
  rememberTimer(setTimeout(() => {
    if (timingDrill.playing) highlightBeat(beatIndex, measureIndex);
  }, delay));
}

function pruneBeatHistory() {
  if (!audioCtx) return;
  const cutoff = audioCtx.currentTime - BEAT_LOOKBACK_SEC;
  timingDrill._beatHistory = timingDrill._beatHistory.filter(beat => beat.time >= cutoff);
}

function scheduler() {
  if (!timingDrill.playing) return;
  while (timingDrill._nextBeatTime < audioCtx.currentTime + SCHEDULE_AHEAD_SEC) {
    const beatIndex = timingDrill.beatIndex;
    const measureIndex = timingDrill.measureIndex;
    const accented = beatIndex === 0;

    scheduleClick(timingDrill._nextBeatTime, accented);
    scheduleBeatUi(timingDrill._nextBeatTime, beatIndex, measureIndex);
    timingDrill._beatHistory.push({
      time: timingDrill._nextBeatTime,
      beatIndex,
      measureIndex,
    });
    pruneBeatHistory();

    timingDrill._nextBeatTime += 60 / timingDrill.bpm;
    timingDrill.beatIndex += 1;
    if (timingDrill.beatIndex >= timingDrill.beatsPerMeasure) {
      timingDrill.beatIndex = 0;
      timingDrill.measureIndex += 1;
    }
  }
  timingDrill._timer = setTimeout(scheduler, 25);
}

function categoryForOffset(offsetMs) {
  const abs = Math.abs(offsetMs);
  if (abs <= PERFECT_MS) return 'perfect';
  if (abs <= GOOD_MS) return 'good';
  return offsetMs < 0 ? 'fast' : 'slow';
}

function categoryLabel(category) {
  return {
    perfect: 'Perfect',
    good: 'Good',
    fast: 'Too fast',
    slow: 'Too slow',
  }[category] || '--';
}

function categoryDetail(category, offsetMs) {
  const amount = `${Math.abs(Math.round(offsetMs))} ms`;
  if (category === 'perfect') return `${amount} from the click`;
  if (category === 'good') return `${amount} from the click`;
  return offsetMs < 0 ? `${amount} early` : `${amount} late`;
}

function nearestBeat(time) {
  pruneBeatHistory();
  let best = null;
  timingDrill._beatHistory.forEach(beat => {
    const distance = Math.abs(time - beat.time);
    if (!best || distance < best.distance) best = { beat, distance };
  });
  return best?.beat || null;
}

function renderScore() {
  setText('td-perfect', timingDrill.perfect);
  setText('td-good', timingDrill.good);
  setText('td-fast', timingDrill.fast);
  setText('td-slow', timingDrill.slow);
  setText('td-attempts', timingDrill.attempts);
  setText('td-streak', timingDrill.streak);

  const onTime = timingDrill.perfect + timingDrill.good;
  const pct = timingDrill.attempts ? Math.round((onTime / timingDrill.attempts) * 100) : 0;
  setText('td-on-time', `${pct}%`);
}

function renderResult(category, offsetMs, beat) {
  const result = document.getElementById('td-result');
  const detail = document.getElementById('td-result-detail');
  const marker = document.getElementById('td-offset-marker');
  const pad = document.getElementById('td-tap-pad');

  if (result) {
    result.className = `td-result ${category}`;
    result.textContent = categoryLabel(category);
  }
  if (detail) detail.textContent = `${categoryDetail(category, offsetMs)} on beat ${beat.measureIndex}.${beat.beatIndex + 1}`;
  if (marker) {
    const clamped = Math.max(-MAX_OFFSET_MS, Math.min(MAX_OFFSET_MS, offsetMs));
    const pct = ((clamped + MAX_OFFSET_MS) / (MAX_OFFSET_MS * 2)) * 100;
    marker.style.left = `${pct}%`;
  }
  if (pad) {
    pad.classList.remove('perfect', 'good', 'fast', 'slow');
    void pad.offsetWidth;
    pad.classList.add(category);
    rememberTimer(setTimeout(() => pad.classList.remove(category), 260));
  }
  flashBeatResult(beat.beatIndex, category);
}

function handleTap(event) {
  if (event) event.preventDefault();
  if (!timingDrill.playing || !audioCtx) {
    setText('td-status', 'Start the click track, then tap the pad on each beat.');
    return;
  }

  const beat = nearestBeat(audioCtx.currentTime);
  if (!beat) {
    setText('td-status', 'Wait for the first click, then tap with the beat.');
    return;
  }

  const offsetMs = (audioCtx.currentTime - beat.time) * 1000;
  const category = categoryForOffset(offsetMs);
  const onTime = category === 'perfect' || category === 'good';

  timingDrill.attempts += 1;
  timingDrill[category] += 1;
  if (onTime) {
    timingDrill.streak += 1;
    timingDrill.bestStreak = Math.max(timingDrill.bestStreak, timingDrill.streak);
  } else {
    timingDrill.streak = 0;
  }

  recordAttempt('timing', onTime);
  renderScore();
  renderResult(category, offsetMs, beat);
  setText('td-status', onTime ? 'Stay relaxed and keep the thumb motion even.' : 'Listen for the next click and settle back into the pocket.');
}

function resetScore() {
  timingDrill.attempts = 0;
  timingDrill.perfect = 0;
  timingDrill.good = 0;
  timingDrill.fast = 0;
  timingDrill.slow = 0;
  timingDrill.streak = 0;
  renderScore();
  const result = document.getElementById('td-result');
  const detail = document.getElementById('td-result-detail');
  const marker = document.getElementById('td-offset-marker');
  if (result) {
    result.className = 'td-result';
    result.textContent = 'Ready';
  }
  if (detail) detail.textContent = 'Start the click track and tap with your thumb.';
  if (marker) marker.style.left = '50%';
  setText('td-status', 'Score reset.');
}

function updateTransportUi() {
  const btn = document.getElementById('td-start');
  if (btn) {
    btn.textContent = timingDrill.playing ? 'Stop click' : 'Start click';
    btn.classList.toggle('playing', timingDrill.playing);
  }
  setText('td-status', timingDrill.playing ? 'Click track running. Tap every beat.' : 'Click track stopped.');
}

function startTimingDrill() {
  ensureAudio();
  clearUiTimers();
  timingDrill.playing = true;
  timingDrill.beatIndex = 0;
  timingDrill.measureIndex = 1;
  timingDrill._beatHistory = [];
  timingDrill._nextBeatTime = audioCtx.currentTime + 0.08;
  updateTransportUi();
  updateMeasureLabel();
  showNowPlaying(`Timing drill - ${timingDrill.bpm} BPM`, stopTimingDrill);
  scheduler();
}

function stopTimingDrill() {
  timingDrill.playing = false;
  if (timingDrill._timer) {
    clearTimeout(timingDrill._timer);
    timingDrill._timer = null;
  }
  clearUiTimers();
  timingDrill._beatHistory = [];
  document.querySelectorAll('.td-beat-dot').forEach(dot => {
    dot.classList.remove('active', 'downbeat', 'perfect', 'good', 'fast', 'slow');
  });
  updateTransportUi();
  hideNowPlaying();
}

function installKeyHandler() {
  if (keyHandlerInstalled) return;
  keyHandlerInstalled = true;
  document.addEventListener('keydown', event => {
    if (event.repeat || event.code !== 'Space') return;
    if (!document.getElementById('sec-timing')?.classList.contains('active')) return;
    if (typeof event.target?.closest === 'function' && event.target.closest('input,select,textarea,button')) return;
    handleTap(event);
  });
}

function initBeatSelect() {
  const select = document.getElementById('td-beats');
  if (!select) return;
  select.innerHTML = '';
  BEAT_OPTIONS.forEach(beats => {
    const opt = document.createElement('option');
    opt.value = String(beats);
    opt.textContent = `${beats}/4`;
    select.appendChild(opt);
  });
  select.value = String(timingDrill.beatsPerMeasure);
  select.onchange = () => setBeatsPerMeasure(select.value);
}

function initTimingDrill() {
  restoreSettings();
  const contextTempo = getContext().tempo;
  if (Number.isFinite(contextTempo)) timingDrill.bpm = clamp(contextTempo, 30, 300, timingDrill.bpm);
  const bpmInput = document.getElementById('td-bpm');
  const bpmSlider = document.getElementById('td-bpm-slider');
  const startBtn = document.getElementById('td-start');
  const resetBtn = document.getElementById('td-reset');
  const tapPad = document.getElementById('td-tap-pad');

  if (!bpmInput || !bpmSlider || !startBtn || !tapPad) return;

  updateBpmUi();
  initBeatSelect();
  renderBeatDots();
  renderScore();
  updateMeasureLabel();
  updateTransportUi();

  if (!contextSubscribed) {
    contextSubscribed = true;
    subscribeContext(c => {
      if (c.tempo !== timingDrill.bpm) setBpm(c.tempo, true);
    });
  }

  bpmInput.oninput = () => setBpm(bpmInput.value);
  bpmSlider.oninput = () => setBpm(bpmSlider.value);
  startBtn.onclick = () => {
    if (timingDrill.playing) stopTimingDrill();
    else startTimingDrill();
  };
  if (resetBtn) resetBtn.onclick = resetScore;
  tapPad.onpointerdown = handleTap;
  installKeyHandler();
}

window.resetTimingScore = resetScore;

export { initTimingDrill, stopTimingDrill, timingDrill };
