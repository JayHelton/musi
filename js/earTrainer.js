import { audioCtx, ensureAudio, midiFreq, getAnalyserDestination } from './audio.js';
import { parseNote, NOTE_NAMES_SHARP, ROOTS } from './theory.js';
import { SCALES } from './scales.js';

const ear = {
  key: 'C', mode: 'easy',
  targetNote: null, targetSemi: null, answered: false,
  right: 0, total: 0, streak: 0,
  _osc: null, _gain: null,
};

function playEarQuestion() {
  ear.answered = false;
  const feedback = document.getElementById('ear-feedback');
  feedback.className = 'fb-feedback';
  document.getElementById('ear-answers').querySelectorAll('.letter-btn').forEach(b => {
    b.classList.remove('correct','wrong');
  });

  const rootP = parseNote(ear.key);
  if (!rootP) return;

  const majorDef = SCALES['Major (Ionian)'];
  const scaleIntervals = majorDef.map(d => d[1]);
  const scalePCs = scaleIntervals.map(s => (rootP.semi + s) % 12);

  if (ear.mode === 'easy') {
    playEarTone(rootP.semi, 4);
    setTimeout(() => {
      const pick = scalePCs[Math.floor(Math.random() * scalePCs.length)];
      ear.targetSemi = pick;
      ear.targetNote = NOTE_NAMES_SHARP[pick];
      playEarTone(pick, 4);
      document.getElementById('ear-question').innerHTML =
        `Key: <span class="highlight">${ear.key}</span> — Root played first, then the mystery note. What is it?`;
    }, 1200);
  } else {
    const pick = scalePCs[Math.floor(Math.random() * scalePCs.length)];
    ear.targetSemi = pick;
    ear.targetNote = NOTE_NAMES_SHARP[pick];
    playEarTone(pick, 4);
    document.getElementById('ear-question').innerHTML =
      `Key: <span class="highlight">${ear.key}</span> — What note was played?`;
  }
}

function replayEarNote() {
  if (ear.targetSemi === null) return;
  if (ear.mode === 'easy') {
    const rootP = parseNote(ear.key);
    if (rootP) playEarTone(rootP.semi, 4);
    setTimeout(() => playEarTone(ear.targetSemi, 4), 1200);
  } else {
    playEarTone(ear.targetSemi, 4);
  }
}

function triggerRipple() {
  const wrap = document.getElementById('ear-ripple-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const ring = document.createElement('div');
    ring.className = 'ear-ripple';
    ring.style.animationDelay = (i * 0.15) + 's';
    wrap.appendChild(ring);
  }
  setTimeout(() => { wrap.innerHTML = ''; }, 1500);
}

function playEarTone(semi, oct) {
  stopEarTone();
  ensureAudio();
  triggerRipple();
  const midi = 12 * (oct + 1) + semi;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = midiFreq(midi);
  gain.gain.value = 0.3;
  osc.connect(gain);
  gain.connect(getAnalyserDestination());
  osc.start();
  ear._osc = osc;
  ear._gain = gain;
  setTimeout(() => stopEarTone(), 1000);
}

function stopEarTone() {
  if (ear._osc) {
    try {
      ear._gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
      setTimeout(() => { try { ear._osc.stop(); } catch(e) {} }, 60);
    } catch(e) {}
    ear._osc = null; ear._gain = null;
  }
}

function checkEarAnswer(semi, btn) {
  if (ear.answered || ear.targetSemi === null) return;
  ear.answered = true;
  ear.total++;

  const correct = semi === ear.targetSemi;
  const feedback = document.getElementById('ear-feedback');

  btn.classList.add(correct ? 'correct' : 'wrong');

  if (!correct) {
    document.getElementById('ear-answers').querySelectorAll('.letter-btn').forEach(b => {
      if (parseInt(b.dataset.semi) === ear.targetSemi) b.classList.add('correct');
    });
  }

  if (correct) {
    ear.right++;
    ear.streak++;
    feedback.className = 'fb-feedback show correct';
    feedback.textContent = 'Correct!';
  } else {
    ear.streak = 0;
    feedback.className = 'fb-feedback show wrong';
    feedback.textContent = `Incorrect. The note was ${ear.targetNote}.`;
  }

  document.getElementById('ear-right').textContent = ear.right;
  document.getElementById('ear-total').textContent = ear.total;
  document.getElementById('ear-streak').textContent = ear.streak;
}

function initEarTrainer() {
  const keyScroll = document.getElementById('sl-ear-key');
  const modeScroll = document.getElementById('sl-ear-mode');
  const answersC = document.getElementById('ear-answers');

  if (keyScroll.children.length) return;

  ROOTS.forEach(r => {
    const div = document.createElement('div');
    div.className = 'sl-item' + (r === ear.key ? ' active' : '');
    div.dataset.val = r; div.textContent = r;
    div.onclick = () => {
      keyScroll.querySelectorAll('.sl-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      ear.key = r;
      buildEarAnswerButtons();
    };
    keyScroll.appendChild(div);
  });

  ['easy','hard'].forEach(m => {
    const div = document.createElement('div');
    div.className = 'sl-item' + (m === ear.mode ? ' active' : '');
    div.dataset.val = m;
    div.textContent = m === 'easy' ? 'Easy (root first)' : 'Hard (no root)';
    div.onclick = () => {
      modeScroll.querySelectorAll('.sl-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      ear.mode = m;
    };
    modeScroll.appendChild(div);
  });

  buildEarAnswerButtons();
}

function buildEarAnswerButtons() {
  const answersC = document.getElementById('ear-answers');
  answersC.innerHTML = '';
  const rootP = parseNote(ear.key);
  if (!rootP) return;

  const majorDef = SCALES['Major (Ionian)'];
  const scaleIntervals = majorDef.map(d => d[1]);

  scaleIntervals.forEach(s => {
    const pc = (rootP.semi + s) % 12;
    const name = NOTE_NAMES_SHARP[pc];
    const btn = document.createElement('button');
    btn.className = 'letter-btn';
    btn.textContent = name;
    btn.dataset.semi = pc;
    btn.onclick = () => checkEarAnswer(pc, btn);
    answersC.appendChild(btn);
  });
}

window.playEarQuestion = playEarQuestion;
window.replayEarNote = replayEarNote;

export { initEarTrainer, stopEarTone, ear };
