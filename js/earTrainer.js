import { audioCtx, ensureAudio, midiFreq, getAnalyserDestination } from './audio.js';
import { parseNote, NOTE_NAMES_SHARP, pick, INTERVAL_LABELS } from './theory.js';
import { SCALES, getScaleNotes } from './scales.js';
import { getSetting, saveSetting } from './persistence.js';
import { getContext, subscribeContext, advanceContext } from './musicalContext.js';
import { recordAttempt } from './stats.js';

const EAR_FADE_START_MS = 1100;
const CONTEXTS = [
  { val: 'root', label: 'Root first' },
  { val: 'single', label: 'Single tone' },
  { val: 'melodic', label: 'Melodic interval' },
];
const POOLS = [
  { val: 'diatonic', label: 'Diatonic' },
  { val: 'chromatic', label: 'Chromatic' },
];
const ANSWERS = [
  { val: 'note', label: 'Note' },
  { val: 'degree', label: 'Degree' },
  { val: 'interval', label: 'Interval' },
];
const OCTAVES = [
  { val: '3', label: '3' },
  { val: '4', label: '4' },
  { val: '5', label: '5' },
  { val: 'random', label: 'Random' },
];

const ear = {
  key: 'C',
  activeKey: 'C',
  scale: 'Major (Ionian)',
  context: 'root',
  pool: 'diatonic',
  answerAs: 'note',
  octave: 'random',
  targetNote: null,
  targetSemi: null,
  targetDegree: null,
  targetInterval: null,
  answered: false,
  right: 0, total: 0, streak: 0,
  _osc: null, _osc2: null, _gain: null, _stopTimer: null,
  _fadeTimer: null,
};

function earClearTimers() {
  if (ear._fadeTimer) { clearTimeout(ear._fadeTimer); ear._fadeTimer = null; }
}

function shortScaleName(name) {
  return name.replace('Major (Ionian)', 'Major').replace('Natural Minor (Aeolian)', 'Minor');
}

function octaveForTone() {
  if (ear.octave !== 'random') return Number(ear.octave);
  return 3 + Math.floor(Math.random() * 3);
}

function labelForPc(pc) {
  const rootP = parseNote(ear.activeKey);
  const notes = getScaleNotes(ear.activeKey, ear.scale) || [];
  const def = SCALES[ear.scale] || SCALES['Major (Ionian)'];
  if (rootP) {
    const match = def.find(([, semi]) => (rootP.semi + semi) % 12 === pc);
    if (match) {
      const idx = def.indexOf(match);
      if (notes[idx]) return notes[idx];
    }
  }
  const flatKeys = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'];
  const flatNames = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  return flatKeys.includes(ear.activeKey) ? flatNames[pc] : NOTE_NAMES_SHARP[pc];
}

function scalePool(rootP) {
  const def = SCALES[ear.scale] || SCALES['Major (Ionian)'];
  const notes = getScaleNotes(ear.activeKey, ear.scale) || [];
  return def.map(([letterOffset, semi], i) => ({
    semi: (rootP.semi + semi) % 12,
    degree: i + 1,
    interval: semi,
    note: notes[i] || labelForPc((rootP.semi + semi) % 12),
    letterOffset,
  }));
}

function targetPool(rootP) {
  if (ear.pool === 'chromatic' && ear.answerAs !== 'degree') {
    return Array.from({ length: 12 }, (_, semi) => ({
      semi,
      degree: null,
      interval: (semi - rootP.semi + 12) % 12,
      note: labelForPc(semi),
    }));
  }
  return scalePool(rootP);
}

function setQuestionStatus(contextLabel) {
  document.getElementById('ear-question').innerHTML =
    `<span class="highlight">${ear.activeKey}</span> · ${shortScaleName(ear.scale)} · ${contextLabel}`;
}

function clearAnswerState() {
  const answers = document.getElementById('ear-answers');
  answers.querySelectorAll('.letter-btn,.int-btn').forEach(b => {
    b.classList.remove('correct', 'wrong', 'selected');
  });
}

function playEarQuestion() {
  earClearTimers();
  if (ear.targetSemi !== null || ear.total > 0) advanceContext();
  const ctx = getContext();
  ear.key = ctx.root;
  ear.scale = ctx.scale;
  ear.answered = false;
  ear.targetNote = null;
  ear.targetSemi = null;
  ear.targetDegree = null;
  ear.targetInterval = null;
  const feedback = document.getElementById('ear-feedback');
  feedback.className = 'fb-feedback';
  feedback.textContent = '';
  clearAnswerState();

  ear.activeKey = ear.key;
  const tonic = parseNote(ear.activeKey);
  if (!tonic) return;
  const pool = targetPool(tonic);
  const toneDur = 1.25;
  const oct = octaveForTone();

  if (ear.context === 'melodic') {
    const first = pick(pool);
    let second = pick(pool);
    let guard = 0;
    while (second.semi === first.semi && guard++ < 20) second = pick(pool);
    ear.targetSemi = second.semi;
    ear.targetNote = second.note;
    ear.targetDegree = second.degree;
    ear.targetInterval = (second.semi - first.semi + 12) % 12;
    playEarTone(first.semi, oct, toneDur);
    setTimeout(() => playEarTone(second.semi, oct, toneDur), 900);
    setQuestionStatus('melodic interval');
    return;
  }

  const target = pick(pool);
  ear.targetSemi = target.semi;
  ear.targetNote = target.note;
  ear.targetDegree = target.degree;
  ear.targetInterval = target.interval;

  if (ear.context === 'root') {
    playEarTone(tonic.semi, oct, toneDur);
    setTimeout(() => playEarTone(target.semi, oct, toneDur), 900);
    setQuestionStatus('root first');
  } else {
    playEarTone(target.semi, oct, toneDur);
    setQuestionStatus('single tone');
  }
}

function replayEarNote() {
  if (ear.targetSemi === null) return;
  const toneDur = 1.25;
  const oct = octaveForTone();
  const rootP = parseNote(ear.activeKey);
  if (!rootP) return;

  if (ear.context === 'root') {
    playEarTone(rootP.semi, 4, toneDur);
    setTimeout(() => playEarTone(ear.targetSemi, oct, toneDur), 900);
  } else {
    playEarTone(ear.targetSemi, oct, toneDur);
  }
}

function triggerPulse() {
  const wrap = document.getElementById('ear-ripple-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="ear-pulse"></div>';
  setTimeout(() => { wrap.innerHTML = ''; }, 650);
}

function playEarTone(semi, oct, duration) {
  if (ear._stopTimer) clearTimeout(ear._stopTimer);
  stopEarTone();
  ensureAudio();
  triggerPulse();
  const dur = duration || 1.2;
  const midi = 12 * (oct + 1) + semi;
  const freq = midiFreq(midi);
  const osc = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();
  const t = audioCtx.currentTime;

  osc.type = 'sine';
  osc2.type = 'triangle';
  osc.frequency.value = freq;
  osc2.frequency.value = freq;

  filter.type = 'lowpass';
  filter.frequency.value = Math.min(freq * 4, 5000);
  filter.Q.value = 0.5;

  const sustain = dur * 0.6;
  const release = dur * 0.35;
  gain.gain.setValueAtTime(0.001, t);
  gain.gain.linearRampToValueAtTime(0.18, t + 0.04);
  gain.gain.setValueAtTime(0.15, t + sustain);
  gain.gain.exponentialRampToValueAtTime(0.001, t + sustain + release);

  osc.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  gain.connect(getAnalyserDestination());
  osc.start(t);
  osc2.start(t);
  ear._osc = osc;
  ear._osc2 = osc2;
  ear._gain = gain;
  ear._stopTimer = setTimeout(() => stopEarTone(), (sustain + release + 0.1) * 1000);
}

function stopEarTone() {
  earClearTimers();
  if (ear._stopTimer) { clearTimeout(ear._stopTimer); ear._stopTimer = null; }
  if (ear._osc) {
    try {
      const t = audioCtx.currentTime;
      ear._gain.gain.setValueAtTime(ear._gain.gain.value, t);
      ear._gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      const o1 = ear._osc, o2 = ear._osc2;
      setTimeout(() => { try { o1.stop(); o2.stop(); } catch(e) {} }, 150);
    } catch(e) {}
    ear._osc = null; ear._osc2 = null; ear._gain = null;
  }
}

function expectedAnswer() {
  if (ear.answerAs === 'degree') return String(ear.targetDegree);
  if (ear.answerAs === 'interval') return INTERVAL_LABELS[ear.targetInterval] || `${ear.targetInterval} st`;
  return ear.targetNote;
}

function answerCorrect(answer) {
  if (ear.answerAs === 'degree') return Number(answer) === ear.targetDegree;
  if (ear.answerAs === 'interval') return Number(answer) === ear.targetInterval;
  return Number(answer) === ear.targetSemi;
}

function checkEarAnswer(answer, btn) {
  if (ear.answered || ear.targetSemi === null) return;
  ear.answered = true;
  ear.total++;

  const correct = answerCorrect(answer);
  recordAttempt('ear', correct);
  const feedback = document.getElementById('ear-feedback');

  btn.classList.add(correct ? 'correct' : 'wrong');

  if (!correct) {
    document.getElementById('ear-answers').querySelectorAll('.letter-btn,.int-btn').forEach(b => {
      if (answerCorrect(b.dataset.answer)) b.classList.add('correct');
    });
  }

  if (correct) {
    ear.right++;
    ear.streak++;
    feedback.className = 'fb-feedback show correct';
    feedback.textContent = '✓';
  } else {
    ear.streak = 0;
    feedback.className = 'fb-feedback show wrong';
    feedback.textContent = `Expected: ${expectedAnswer()}`;
  }

  document.getElementById('ear-right').textContent = ear.right;
  document.getElementById('ear-total').textContent = ear.total;
  document.getElementById('ear-streak').textContent = ear.streak;
  ear._fadeTimer = setTimeout(() => feedback.classList.add('fade-out'), EAR_FADE_START_MS);
}

let earContextSubscribed = false;

function initEarTrainer() {
  const contextScroll = document.getElementById('sl-ear-context');

  // Key and scale are inherited from the shared musical context (like the
  // drills) rather than per-tool selectors.
  const ctx = getContext();
  ear.key = ctx.root;
  ear.scale = ctx.scale;
  ear.context = getSetting('ear.context', ear.context, CONTEXTS.map(o => o.val));
  ear.pool = getSetting('ear.pool', ear.pool, POOLS.map(o => o.val));
  ear.answerAs = getSetting('ear.answerAs', ear.answerAs, ANSWERS.map(o => o.val));
  ear.octave = getSetting('ear.octave', ear.octave, OCTAVES.map(o => o.val));

  if (!earContextSubscribed) {
    earContextSubscribed = true;
    subscribeContext((c, source) => {
      if (source === 'advance') {
        ear.key = c.root;
        ear.scale = c.scale;
        return;
      }
      if (c.root === ear.key && c.scale === ear.scale) return;
      ear.key = c.root;
      ear.scale = c.scale;
      buildEarAnswerButtons();
    });
  }

  if (!contextScroll.children.length) {
    buildChoiceList('sl-ear-context', CONTEXTS, ear.context, val => {
      ear.context = val;
      saveSetting('ear.context', val);
      buildEarAnswerButtons();
    });
    buildChoiceList('sl-ear-pool', POOLS, ear.pool, val => {
      ear.pool = val;
      saveSetting('ear.pool', val);
      buildEarAnswerButtons();
    });
    buildChoiceList('sl-ear-answer', ANSWERS, ear.answerAs, val => {
      ear.answerAs = val;
      saveSetting('ear.answerAs', val);
      buildEarAnswerButtons();
    });
    buildChoiceList('sl-ear-octave', OCTAVES, ear.octave, val => {
      ear.octave = val;
      saveSetting('ear.octave', val);
    });
  }

  buildEarAnswerButtons();
}

function buildChoiceList(containerId, items, active, onPick) {
  const container = document.getElementById(containerId);
  items.forEach(({ type, val, label }) => {
    if (type === 'label') {
      const group = document.createElement('div');
      group.className = 'sl-group-label';
      group.textContent = label;
      container.appendChild(group);
      return;
    }
    const div = document.createElement('div');
    div.className = 'sl-item' + (val === active ? ' active' : '');
    div.dataset.val = val;
    div.textContent = label;
    div.onclick = () => {
      container.querySelectorAll('.sl-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      onPick(val);
    };
    container.appendChild(div);
  });
}

function buildEarAnswerButtons() {
  const answersC = document.getElementById('ear-answers');
  const label = document.getElementById('ear-answer-label');
  answersC.innerHTML = '';
  answersC.className = ear.answerAs === 'interval' ? 'int-picker' : 'note-btn-row';
  label.textContent = ear.answerAs === 'degree' ? 'Degree' : ear.answerAs === 'interval' ? 'Interval' : 'Pitch';

  ear.activeKey = ear.key;
  const rootP = parseNote(ear.activeKey);
  if (!rootP) return;

  if (ear.answerAs === 'degree') {
    scalePool(rootP).forEach(item => {
      const btn = document.createElement('button');
      btn.className = 'letter-btn';
      btn.textContent = String(item.degree);
      btn.dataset.answer = item.degree;
      btn.onclick = () => checkEarAnswer(item.degree, btn);
      answersC.appendChild(btn);
    });
    return;
  }

  if (ear.answerAs === 'interval') {
    const intervals = ear.pool === 'chromatic'
      ? Array.from({ length: 12 }, (_, semi) => semi)
      : Array.from(new Set(scalePool(rootP).map(item => item.interval)));
    intervals.forEach(semi => {
      const btn = document.createElement('button');
      btn.className = 'int-btn';
      btn.textContent = INTERVAL_LABELS[semi] || `${semi} st`;
      btn.dataset.answer = semi;
      btn.onclick = () => checkEarAnswer(semi, btn);
      answersC.appendChild(btn);
    });
    return;
  }

  targetPool(rootP).forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'letter-btn' + (item.note.length > 1 ? ' accidental' : '');
    btn.textContent = item.note;
    btn.dataset.answer = item.semi;
    btn.onclick = () => checkEarAnswer(item.semi, btn);
    answersC.appendChild(btn);
  });
}

function resetEarScore() {
  ear.right = 0; ear.total = 0; ear.streak = 0;
  document.getElementById('ear-right').textContent = 0;
  document.getElementById('ear-total').textContent = 0;
  document.getElementById('ear-streak').textContent = 0;
}

window.playEarQuestion = playEarQuestion;
window.replayEarNote = replayEarNote;
window.resetEarScore = resetEarScore;

export { initEarTrainer, stopEarTone, ear };
