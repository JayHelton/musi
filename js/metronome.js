import { audioCtx, ensureAudio, getAnalyserDestination } from './audio.js';
import { showNowPlaying, hideNowPlaying } from './nowPlaying.js';

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
};

function slotDuration(slot) {
  let d = NV_BEATS[slot.value] || 1;
  if (slot.dotted) d *= 1.5;
  if (slot.triplet) d *= 2 / 3;
  return d;
}

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
}

function clearMeasure() {
  metro.measure = [];
  renderMeasure();
  updateBeatsFilled();
}

function renderMeasure() {
  const bar = document.getElementById('m-bar');
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
    };
    bar.appendChild(div);
  });
}

function updateBeatsFilled() {
  const cap = measureCapacity();
  const filled = filledBeats();
  document.getElementById('m-beats-filled').textContent =
    'Beats filled: ' + +filled.toFixed(2) + ' / ' + +cap.toFixed(2);
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
  document.getElementById('m-ts-num').value = metro.tsNum;
  document.getElementById('m-ts-den').value = metro.tsDen;
  updateAccentButtons();
  renderMeasure();
  updateBeatsFilled();
}

function updateAccentButtons() {
  const container = document.getElementById('m-accents');
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
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(getAnalyserDestination());
  osc.frequency.value = accented ? 880 : 440;
  gain.gain.setValueAtTime(accented ? 0.6 : 0.3, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
  osc.start(time);
  osc.stop(time + 0.03);
  const delay = Math.max(0, (time - audioCtx.currentTime) * 1000);
  setTimeout(() => triggerBeatPulse(accented), delay);
}

function getAccentForSlot(slotIndex) {
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
  container.innerHTML = '';
  metro.measure.forEach(() => {
    const dot = document.createElement('div');
    dot.className = 'bi-dot';
    container.appendChild(dot);
  });
}

function startMetronome() {
  if (metro.measure.length === 0) return;
  ensureAudio();
  metro.playing = true;
  metro._currentSlot = 0;
  document.getElementById('m-play').textContent = '\u25A0 Stop';
  document.getElementById('m-play').classList.add('playing');
  showNowPlaying(`Metronome \u2014 ${metro.bpm} BPM`, stopMetronome);
  renderBeatIndicator();
  metro._countInLeft = metro.countIn ? metro.tsNum : 0;
  metro._nextNoteTime = audioCtx.currentTime + 0.05;
  metroScheduler();
}

function stopMetronome() {
  metro.playing = false;
  if (metro._timer) { clearTimeout(metro._timer); metro._timer = null; }
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
    metro.bpm = Math.max(30, Math.min(300, Math.round(60000 / avg)));
    document.getElementById('m-bpm').value = metro.bpm;
    document.getElementById('m-bpm-slider').value = metro.bpm;
  }
}

function initMetronome() {
  const bpmInput = document.getElementById('m-bpm');
  const bpmSlider = document.getElementById('m-bpm-slider');
  bpmInput.oninput = () => {
    metro.bpm = Math.max(30, Math.min(300, parseInt(bpmInput.value) || 120));
    bpmSlider.value = metro.bpm;
  };
  bpmSlider.oninput = () => {
    metro.bpm = parseInt(bpmSlider.value);
    bpmInput.value = metro.bpm;
  };
  document.getElementById('m-ts-num').onchange = (e) => {
    metro.tsNum = parseInt(e.target.value);
    updateAccentButtons();
    updateBeatsFilled();
  };
  document.getElementById('m-ts-den').onchange = (e) => {
    metro.tsDen = parseInt(e.target.value);
    updateBeatsFilled();
  };
  document.querySelectorAll('.nv-btn').forEach(btn => {
    btn.onclick = () => addNoteToMeasure(btn.dataset.nv);
  });
  document.getElementById('m-dot').onclick = () => {
    metro.dotted = !metro.dotted;
    document.getElementById('m-dot').classList.toggle('active', metro.dotted);
  };
  document.getElementById('m-trip').onclick = () => {
    metro.triplet = !metro.triplet;
    document.getElementById('m-trip').classList.toggle('active', metro.triplet);
  };
  document.getElementById('m-rest').onclick = () => {
    metro.restMode = !metro.restMode;
    document.getElementById('m-rest').classList.toggle('active', metro.restMode);
  };
  document.getElementById('m-tap').onclick = tapTempo;
  document.getElementById('m-play').onclick = () => {
    if (metro.playing) stopMetronome(); else startMetronome();
  };
  document.getElementById('m-loop').onclick = () => {
    metro.looping = !metro.looping;
    document.getElementById('m-loop').textContent = 'Loop: ' + (metro.looping ? 'On' : 'Off');
    document.getElementById('m-loop').classList.toggle('active', metro.looping);
  };
  document.getElementById('m-countin').onclick = () => {
    metro.countIn = !metro.countIn;
    document.getElementById('m-countin').textContent = 'Count-in: ' + (metro.countIn ? 'On' : 'Off');
    document.getElementById('m-countin').classList.toggle('active', metro.countIn);
  };
  updateAccentButtons();
  renderMeasure();
  updateBeatsFilled();
}

window.loadPreset = loadPreset;
window.clearMeasure = clearMeasure;

export { initMetronome, stopMetronome, metro };
