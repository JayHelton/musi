import { audioCtx, ensureAudio, midiFreq, getAnalyserDestination } from './audio.js';
import { parseNote, INTERVAL_LABELS } from './theory.js';
import { CHROMATIC_BUTTONS } from './scaleQuiz.js';
import { getSetting, saveSetting } from './persistence.js';
import { identifyChord, findKeys } from './analysis/chordDetect.js';

const chordBuilder = {
  notes: [],
  octave: 4,
  oscillators: [],
};

function renderChordAnalysis() {
  const el = document.getElementById('cb-analysis');
  const pcs = chordBuilder.notes.map(n => n.semi);

  if (pcs.length < 2) {
    el.innerHTML = '<p style="color:var(--muted)">Add at least 2 notes to identify a chord</p>';
    return;
  }

  const result = identifyChord(pcs);
  const keys = findKeys(pcs);

  let html = '';
  if (result && !result.unknown) {
    html += `<div class="chord-name">${result.root}${result.type.sym} <span style="font-size:.9rem;font-weight:400;color:var(--muted)">(${result.type.name})</span></div>`;
    html += `<div class="chord-intervals">Intervals from ${result.root}: ${result.intervals.map(i => INTERVAL_LABELS[i] || i+'st').join(' - ')}</div>`;
  } else {
    html += `<div class="chord-name" style="color:var(--muted)">Unknown chord</div>`;
    if (result) {
      html += `<div class="chord-intervals">Intervals from ${result.root}: ${result.intervals.map(i => INTERVAL_LABELS[i] || i+'st').join(' - ')}</div>`;
    }
  }

  if (keys.length) {
    html += `<div class="chord-keys"><strong>Valid in keys:</strong>`;
    keys.forEach(k => {
      html += `<span class="key-tag ${k.quality}">${k.key} ${k.quality}</span>`;
    });
    html += `</div>`;
  } else {
    html += `<div class="chord-keys" style="color:var(--muted)">Not diatonic to any standard major or minor key</div>`;
  }

  el.innerHTML = html;
}

function renderChordChips() {
  const container = document.getElementById('cb-chips');
  container.innerHTML = '';
  chordBuilder.notes.forEach((n, i) => {
    const chip = document.createElement('span');
    chip.className = 'chord-chip';
    chip.textContent = n.label + n.octave;
    chip.title = 'Click to remove';
    chip.onclick = () => {
      chordBuilder.notes.splice(i, 1);
      renderChordChips();
      renderChordAnalysis();
    };
    container.appendChild(chip);
  });
}

function addChordNote(noteName, displayLabel) {
  const p = parseNote(noteName);
  if (!p) return;
  const midi = 12 * (chordBuilder.octave + 1) + p.semi;
  chordBuilder.notes.push({ name: noteName, label: displayLabel || noteName, octave: chordBuilder.octave, semi: p.semi, midi });
  renderChordChips();
  renderChordAnalysis();
}

function clearChord() {
  stopChord();
  chordBuilder.notes = [];
  renderChordChips();
  renderChordAnalysis();
}

function playChord() {
  stopChord();
  if (!chordBuilder.notes.length) return;
  ensureAudio();
  const now = audioCtx.currentTime;
  const noteCount = chordBuilder.notes.length;
  chordBuilder.notes.forEach(n => {
    const osc = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();
    const freq = midiFreq(n.midi);
    const vol = 0.15 / noteCount;

    osc.type = 'sine';
    osc2.type = 'triangle';
    osc.frequency.value = freq;
    osc2.frequency.value = freq;

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(freq * 5, 5000), now);
    filter.frequency.exponentialRampToValueAtTime(Math.min(freq * 2, 2500), now + 1);
    filter.Q.value = 0.5;

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.04);
    gain.gain.setValueAtTime(vol * 0.8, now + 1.5);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(getAnalyserDestination());
    osc.start(now); osc.stop(now + 2.5);
    osc2.start(now); osc2.stop(now + 2.5);
    chordBuilder.oscillators.push({ osc, gain }, { osc: osc2, gain });
  });
}

function stopChord() {
  chordBuilder.oscillators.forEach(o => {
    try {
      o.gain.gain.cancelScheduledValues(audioCtx.currentTime);
      o.gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
      setTimeout(() => { try { o.osc.stop(); } catch(e) {} }, 60);
    } catch(e) {}
  });
  chordBuilder.oscillators = [];
}

function initChordBuilder() {
  const noteC = document.getElementById('cb-notes');
  const octC = document.getElementById('cb-octaves');
  chordBuilder.octave = Number(getSetting('chord.octave', chordBuilder.octave, [2,3,4,5,6]));
  noteC.innerHTML = ''; octC.innerHTML = '';

  // Use the same one-tap chromatic note selection as the drills so any note
  // (including accidentals) can be added directly.
  CHROMATIC_BUTTONS.forEach(({ label, value }) => {
    const btn = document.createElement('button');
    btn.className = 'letter-btn' + (value.length > 1 ? ' accidental' : '');
    btn.textContent = label;
    btn.onclick = () => addChordNote(value, label);
    noteC.appendChild(btn);
  });

  for (let o = 2; o <= 6; o++) {
    const btn = document.createElement('button');
    btn.className = 'oct-btn' + (o === chordBuilder.octave ? ' active' : '');
    btn.textContent = o;
    btn.onclick = () => {
      octC.querySelectorAll('.oct-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      chordBuilder.octave = o;
      saveSetting('chord.octave', chordBuilder.octave);
    };
    octC.appendChild(btn);
  }

  renderChordChips();
  renderChordAnalysis();
}

window.playChord = playChord;
window.stopChord = stopChord;
window.clearChord = clearChord;

export { initChordBuilder, stopChord, chordBuilder };
