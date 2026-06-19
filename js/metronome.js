import { audioCtx, ensureAudio, getAnalyserDestination } from './audio.js';
import { showNowPlaying, hideNowPlaying } from './nowPlaying.js';
import { getSetting, saveSetting, saveSettings } from './persistence.js';
import { getContext, setContext, subscribeContext } from './musicalContext.js';

const NV_BEATS = {whole:4, half:2, quarter:1, eighth:0.5, sixteenth:0.25};

const metro = {
  bpm: 120,
  tsNum: 4,
  tsDen: 4,
  measure: [],
  playing: false,
  looping: true,
  countIn: false,
  accents: [true, false, false, false],
  dotted: false,
  triplet: false,
  restMode: false,
  _timer: null,
  _nextNoteTime: 0,
  _currentSlot: 0,
  _countInLeft: 0,
  _tapTimes: [],
  _sessionElapsedMs: 0,
  _sessionStart: 0,
  _sessionTimer: null,
};

let metroSettingsLoaded = false;

function numberSetting(id, fallback, min, max) {
  const value = Number(getSetting(id, fallback));
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function validMeasureSlot(slot) {
  return slot && (slot.simple || NV_BEATS[slot.value] !== undefined);
}

function normalizedMeasureSlot(slot) {
  return {
    value: slot.value,
    dotted: !!slot.dotted,
    triplet: !!slot.triplet,
    rest: !!slot.rest,
    simple: !!slot.simple,
  };
}

function saveMetroMeasure() {
  saveSetting('metro.measure', metro.measure.map(normalizedMeasureSlot));
}

function restoreMetronomeSettings() {
  if (metroSettingsLoaded) return;
  metroSettingsLoaded = true;

  metro.bpm = numberSetting('metro.bpm', metro.bpm, 30, 300);
  metro.tsNum = numberSetting('metro.tsNum', metro.tsNum, 1, 12);
  metro.tsDen = numberSetting('metro.tsDen', metro.tsDen, 2, 16);
  metro.looping = !!getSetting('metro.looping', metro.looping);
  metro.countIn = !!getSetting('metro.countIn', metro.countIn);
  metro.dotted = !!getSetting('metro.dotted', metro.dotted);
  metro.triplet = !!getSetting('metro.triplet', metro.triplet);
  metro.restMode = !!getSetting('metro.restMode', metro.restMode);

  const savedMeasure = getSetting('metro.measure', null);
  if (Array.isArray(savedMeasure)) {
    metro.measure = savedMeasure.filter(validMeasureSlot).map(normalizedMeasureSlot);
  }

  const savedAccents = getSetting('metro.accents', null);
  if (Array.isArray(savedAccents)) {
    metro.accents = savedAccents.map(Boolean);
  }
}

function slotDuration(slot) {
  if (slot.simple) return 4 / metro.tsDen;
  let d = NV_BEATS[slot.value] || 1;
  if (slot.dotted) d *= 1.5;
  if (slot.triplet) d *= 2 / 3;
  return d;
}

function setSimpleMeasure(save = false) {
  metro.measure = Array.from({ length: metro.tsNum }, () => ({
    value: 'quarter',
    dotted: false,
    triplet: false,
    rest: false,
    simple: true,
  }));
  metro.accents = Array.from({ length: metro.tsNum }, (_, i) => i === 0);
  renderBeatIndicator();
  if (save) {
    saveSettings({
      'metro.tsNum': metro.tsNum,
      'metro.tsDen': metro.tsDen,
      'metro.measure': metro.measure.map(normalizedMeasureSlot),
      'metro.accents': metro.accents,
    });
  }
}

function setBpm(value, fromContext) {
  metro.bpm = Math.max(30, Math.min(300, parseInt(value) || 120));
  const bpmInput = document.getElementById('m-bpm');
  const bpmSlider = document.getElementById('m-bpm-slider');
  if (bpmInput) bpmInput.value = metro.bpm;
  if (bpmSlider) bpmSlider.value = metro.bpm;
  saveSetting('metro.bpm', metro.bpm);
  if (!fromContext) setContext({ tempo: metro.bpm }, 'metro');
}

let metroContextSubscribed = false;

function measureCapacity() {
  return metro.tsNum * (4 / metro.tsDen);
}

function filledBeats() {
  return metro.measure.reduce((sum, s) => sum + slotDuration(s), 0);
}

function addNoteToMeasure(value) {
  let dur = NV_BEATS[value] || 1;
  if (metro.dotted) dur *= 1.5;
  if (metro.triplet) dur *= 2 / 3;
  if (filledBeats() + dur > measureCapacity() + 0.0001) return;
  metro.measure.push({
    value,
    dotted: metro.dotted,
    triplet: metro.triplet,
    rest: metro.restMode
  });
  renderMeasure();
  updateBeatsFilled();
  saveMetroMeasure();
}

function clearMeasure() {
  metro.measure = [];
  renderMeasure();
  updateBeatsFilled();
  saveMetroMeasure();
}

function renderMeasure() {
  const bar = document.getElementById('m-bar');
  if (!bar) return;
  const cap = measureCapacity();
  if (metro.measure.length === 0) {
    bar.innerHTML = '<div class="m-slot-empty">Empty \u2014 add notes below</div>';
    return;
  }
  bar.innerHTML = '';
  const shortNames = {whole:'W', half:'H', quarter:'Q', eighth:'8th', sixteenth:'16th'};
  metro.measure.forEach((slot, i) => {
    const dur = slotDuration(slot);
    const pct = (dur / cap) * 100;
    const div = document.createElement('div');
    div.className = 'm-slot' + (slot.rest ? ' rest' : '');
    div.style.width = pct + '%';
    let label = shortNames[slot.value] || slot.value;
    if (slot.dotted) label += '.';
    if (slot.triplet) label += '\u00B3';
    if (slot.rest) label += ' R';
    div.textContent = label;
    div.title = dur.toFixed(2) + ' beats \u2014 click to remove';
    div.onclick = () => {
      metro.measure.splice(i, 1);
      renderMeasure();
      updateBeatsFilled();
      saveMetroMeasure();
    };
    bar.appendChild(div);
  });
}

function updateBeatsFilled() {
  const beatsFilled = document.getElementById('m-beats-filled');
  if (!beatsFilled) return;
  const cap = measureCapacity();
  const filled = filledBeats();
  beatsFilled.textContent = 'Beats filled: ' + +filled.toFixed(2) + ' / ' + +cap.toFixed(2);
}

function loadPreset(name) {
  metro.measure = [];
  const n = (v) => ({value:v, dotted:false, triplet:false, rest:false});
  switch (name) {
    case 'straight-quarters':
      metro.tsNum = 4; metro.tsDen = 4;
      for (let i = 0; i < 4; i++) metro.measure.push(n('quarter'));
      break;
    case 'straight-eighths':
      metro.tsNum = 4; metro.tsDen = 4;
      for (let i = 0; i < 8; i++) metro.measure.push(n('eighth'));
      break;
    case 'gallop':
      metro.tsNum = 4; metro.tsDen = 4;
      for (let i = 0; i < 4; i++) {
        metro.measure.push(n('eighth'));
        metro.measure.push(n('sixteenth'));
        metro.measure.push(n('sixteenth'));
      }
      break;
    case 'shuffle':
      metro.tsNum = 4; metro.tsDen = 4;
      for (let i = 0; i < 4; i++) {
        metro.measure.push({value:'quarter', dotted:false, triplet:true, rest:false});
        metro.measure.push({value:'eighth', dotted:false, triplet:true, rest:false});
      }
      break;
    case 'blast-beat':
      metro.tsNum = 4; metro.tsDen = 4;
      for (let i = 0; i < 16; i++) metro.measure.push(n('sixteenth'));
      break;
  }
  syncTsSegments();
  updateAccentButtons();
  renderMeasure();
  updateBeatsFilled();
  saveSettings({
    'metro.tsNum': metro.tsNum,
    'metro.tsDen': metro.tsDen,
    'metro.measure': metro.measure.map(normalizedMeasureSlot),
    'metro.accents': metro.accents,
  });
}

function updateAccentButtons() {
  const container = document.getElementById('m-accents');
  if (!container) return;
  while (metro.accents.length < metro.tsNum) metro.accents.push(false);
  metro.accents.length = metro.tsNum;
  if (!metro.accents.some(Boolean)) metro.accents[0] = true;
  container.innerHTML = '';
  for (let i = 0; i < metro.tsNum; i++) {
    const btn = document.createElement('button');
    btn.className = 'acc-btn' + (metro.accents[i] ? ' active' : '');
    btn.textContent = i + 1;
    btn.onclick = () => {
      metro.accents[i] = !metro.accents[i];
      btn.classList.toggle('active', metro.accents[i]);
      saveSetting('metro.accents', metro.accents);
    };
    container.appendChild(btn);
  }
}

function triggerBeatPulse(accented) {
  const ring = document.getElementById('beat-pulse-ring');
  if (!ring) return;
  ring.classList.remove('pulse', 'accent');
  void ring.offsetWidth;
  ring.classList.add('pulse');
  if (accented) ring.classList.add('accent');
}

function scheduleClick(time, accented) {
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
  const delay = Math.max(0, (time - audioCtx.currentTime) * 1000);
  setTimeout(() => triggerBeatPulse(accented), delay);
}

function getAccentForSlot(slotIndex) {
  if (metro.measure[slotIndex]?.simple) {
    return slotIndex === 0;
  }
  let pos = 0;
  for (let i = 0; i < slotIndex && i < metro.measure.length; i++)
    pos += slotDuration(metro.measure[i]);
  const beatSize = 4 / metro.tsDen;
  const beatIndex = Math.round(pos / beatSize);
  return beatIndex < metro.accents.length && metro.accents[beatIndex];
}

function highlightSlot(index) {
  document.querySelectorAll('.m-slot').forEach((el, i) =>
    el.classList.toggle('playing', i === index));
  document.querySelectorAll('.bi-dot').forEach((el, i) =>
    el.classList.toggle('active', i === index));
}

function renderBeatIndicator() {
  const container = document.getElementById('m-beat-ind');
  if (!container) return;
  container.innerHTML = '';
  metro.measure.forEach(() => {
    const dot = document.createElement('div');
    dot.className = 'bi-dot';
    container.appendChild(dot);
  });
}

function formatSessionTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

function currentSessionMs() {
  let ms = metro._sessionElapsedMs;
  if (metro.playing && metro._sessionStart) ms += Date.now() - metro._sessionStart;
  return ms;
}

function renderSessionTimer() {
  const el = document.getElementById('m-timer');
  if (el) el.textContent = formatSessionTime(currentSessionMs());
}

function startSessionTimer() {
  metro._sessionStart = Date.now();
  document.getElementById('m-timer-wrap')?.classList.add('running');
  renderSessionTimer();
  if (metro._sessionTimer) clearInterval(metro._sessionTimer);
  metro._sessionTimer = setInterval(renderSessionTimer, 250);
}

function pauseSessionTimer() {
  if (metro._sessionStart) {
    metro._sessionElapsedMs += Date.now() - metro._sessionStart;
    metro._sessionStart = 0;
  }
  if (metro._sessionTimer) { clearInterval(metro._sessionTimer); metro._sessionTimer = null; }
  document.getElementById('m-timer-wrap')?.classList.remove('running');
  renderSessionTimer();
}

function resetSessionTimer() {
  metro._sessionElapsedMs = 0;
  metro._sessionStart = metro.playing ? Date.now() : 0;
  renderSessionTimer();
}

function startMetronome() {
  if (metro.measure.length === 0) setSimpleMeasure();
  ensureAudio();
  metro.playing = true;
  metro._currentSlot = 0;
  document.getElementById('m-play').textContent = '\u25A0 Stop';
  document.getElementById('m-play').classList.add('playing');
  showNowPlaying(`Metronome \u2014 ${metro.bpm} BPM`, stopMetronome);
  renderBeatIndicator();
  metro._countInLeft = metro.countIn ? metro.tsNum : 0;
  metro._nextNoteTime = audioCtx.currentTime + 0.05;
  startSessionTimer();
  metroScheduler();
}

function stopMetronome() {
  metro.playing = false;
  if (metro._timer) { clearTimeout(metro._timer); metro._timer = null; }
  pauseSessionTimer();
  document.getElementById('m-play').textContent = '\u25B6 Play';
  document.getElementById('m-play').classList.remove('playing');
  highlightSlot(-1);
  hideNowPlaying();
}

function metroScheduler() {
  if (!metro.playing) return;
  const scheduleAhead = 0.1;
  while (metro._nextNoteTime < audioCtx.currentTime + scheduleAhead) {
    if (metro._countInLeft > 0) {
      scheduleClick(metro._nextNoteTime, metro._countInLeft === metro.tsNum);
      metro._nextNoteTime += 60 / metro.bpm;
      metro._countInLeft--;
      continue;
    }
    const slot = metro.measure[metro._currentSlot];
    if (!slot) {
      metro._currentSlot = 0;
      continue;
    }
    if (!slot.rest) {
      scheduleClick(metro._nextNoteTime, getAccentForSlot(metro._currentSlot));
    }
    const idx = metro._currentSlot;
    const delay = Math.max(0, (metro._nextNoteTime - audioCtx.currentTime) * 1000);
    setTimeout(() => { if (metro.playing) highlightSlot(idx); }, delay);
    metro._nextNoteTime += slotDuration(slot) * (60 / metro.bpm);
    metro._currentSlot++;
    if (metro._currentSlot >= metro.measure.length) {
      if (metro.looping) {
        metro._currentSlot = 0;
      } else {
        const stopDelay = Math.max(0, (metro._nextNoteTime - audioCtx.currentTime) * 1000);
        setTimeout(() => stopMetronome(), stopDelay);
        return;
      }
    }
  }
  metro._timer = setTimeout(metroScheduler, 25);
}

function tapTempo() {
  const now = performance.now();
  if (metro._tapTimes.length && now - metro._tapTimes[metro._tapTimes.length - 1] > 2000)
    metro._tapTimes = [];
  metro._tapTimes.push(now);
  if (metro._tapTimes.length > 5) metro._tapTimes.shift();
  if (metro._tapTimes.length >= 2) {
    const intervals = [];
    for (let i = 1; i < metro._tapTimes.length; i++)
      intervals.push(metro._tapTimes[i] - metro._tapTimes[i - 1]);
    const recent = intervals.slice(-4);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    setBpm(Math.round(60000 / avg));
  }
}

const BEATS_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const DEN_OPTIONS = [{ v: 2, l: 'Half' }, { v: 4, l: 'Quarter' }, { v: 8, l: 'Eighth' }, { v: 16, l: '16th' }];

function buildSeg(container, options, activeVal, onPick) {
  if (!container) return;
  container.innerHTML = '';
  options.forEach(opt => {
    const val = typeof opt === 'object' ? opt.v : opt;
    const label = typeof opt === 'object' ? opt.l : String(opt);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'seg-btn' + (val === activeVal ? ' active' : '');
    btn.dataset.val = val;
    btn.textContent = label;
    btn.onclick = () => onPick(val);
    container.appendChild(btn);
  });
}

function syncTsSegments() {
  const numSeg = document.getElementById('m-ts-num-seg');
  const denSeg = document.getElementById('m-ts-den-seg');
  if (numSeg) numSeg.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.val) === metro.tsNum));
  if (denSeg) denSeg.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.val) === metro.tsDen));
}

function initMetronome() {
  restoreMetronomeSettings();
  const bpmInput = document.getElementById('m-bpm');
  const bpmSlider = document.getElementById('m-bpm-slider');
  if (!bpmInput || !bpmSlider) return;

  // Tempo lives in the shared musical context so it follows the player across
  // compatible tools.
  setBpm(getContext().tempo, true);
  if (!metroContextSubscribed) {
    metroContextSubscribed = true;
    subscribeContext(c => {
      if (c.tempo !== metro.bpm) setBpm(c.tempo, true);
    });
  }
  if (!metro.measure.length || metro.measure.some(slot => !slot.simple)) setSimpleMeasure();

  buildSeg(document.getElementById('m-ts-num-seg'), BEATS_OPTIONS, metro.tsNum, val => {
    metro.tsNum = val;
    syncTsSegments();
    setSimpleMeasure(true);
    updateBeatsFilled();
  });
  buildSeg(document.getElementById('m-ts-den-seg'), DEN_OPTIONS, metro.tsDen, val => {
    metro.tsDen = val;
    syncTsSegments();
    setSimpleMeasure(true);
    updateBeatsFilled();
  });

  const dotBtn = document.getElementById('m-dot');
  if (dotBtn) dotBtn.classList.toggle('active', metro.dotted);
  const tripBtn = document.getElementById('m-trip');
  if (tripBtn) tripBtn.classList.toggle('active', metro.triplet);
  const restBtn = document.getElementById('m-rest');
  if (restBtn) restBtn.classList.toggle('active', metro.restMode);
  const loopBtn = document.getElementById('m-loop');
  if (loopBtn) {
    loopBtn.textContent = 'Loop: ' + (metro.looping ? 'On' : 'Off');
    loopBtn.classList.toggle('active', metro.looping);
  }
  const countInBtn = document.getElementById('m-countin');
  if (countInBtn) {
    countInBtn.textContent = 'Count-in: ' + (metro.countIn ? 'On' : 'Off');
    countInBtn.classList.toggle('active', metro.countIn);
  }

  bpmInput.oninput = () => {
    setBpm(bpmInput.value);
  };
  bpmSlider.oninput = () => {
    setBpm(bpmSlider.value);
  };
  const bpmDown = document.getElementById('m-bpm-down');
  if (bpmDown) bpmDown.onclick = () => setBpm(metro.bpm - 1);
  const bpmUp = document.getElementById('m-bpm-up');
  if (bpmUp) bpmUp.onclick = () => setBpm(metro.bpm + 1);
  document.querySelectorAll('.metro-bpm-preset').forEach(btn => {
    btn.onclick = () => setBpm(btn.dataset.bpm);
  });
  document.querySelectorAll('.nv-btn').forEach(btn => {
    btn.onclick = () => addNoteToMeasure(btn.dataset.nv);
  });
  if (dotBtn) dotBtn.onclick = () => {
    metro.dotted = !metro.dotted;
    dotBtn.classList.toggle('active', metro.dotted);
    saveSetting('metro.dotted', metro.dotted);
  };
  if (tripBtn) tripBtn.onclick = () => {
    metro.triplet = !metro.triplet;
    tripBtn.classList.toggle('active', metro.triplet);
    saveSetting('metro.triplet', metro.triplet);
  };
  if (restBtn) restBtn.onclick = () => {
    metro.restMode = !metro.restMode;
    restBtn.classList.toggle('active', metro.restMode);
    saveSetting('metro.restMode', metro.restMode);
  };
  const tapBtn = document.getElementById('m-tap');
  if (tapBtn) tapBtn.onclick = tapTempo;
  const playBtn = document.getElementById('m-play');
  if (playBtn) {
    playBtn.onclick = () => {
      if (metro.playing) stopMetronome(); else startMetronome();
    };
  }
  if (loopBtn) loopBtn.onclick = () => {
    metro.looping = !metro.looping;
    loopBtn.textContent = 'Loop: ' + (metro.looping ? 'On' : 'Off');
    loopBtn.classList.toggle('active', metro.looping);
    saveSetting('metro.looping', metro.looping);
  };
  if (countInBtn) countInBtn.onclick = () => {
    metro.countIn = !metro.countIn;
    countInBtn.textContent = 'Count-in: ' + (metro.countIn ? 'On' : 'Off');
    countInBtn.classList.toggle('active', metro.countIn);
    saveSetting('metro.countIn', metro.countIn);
  };
  const timerReset = document.getElementById('m-timer-reset');
  if (timerReset) timerReset.onclick = resetSessionTimer;
  renderSessionTimer();
  updateAccentButtons();
  renderMeasure();
  updateBeatsFilled();
  renderBeatIndicator();
}

window.loadPreset = loadPreset;
window.clearMeasure = clearMeasure;

export { initMetronome, stopMetronome, metro };
