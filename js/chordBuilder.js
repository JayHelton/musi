import { audioCtx, ensureAudio, midiFreq, getAnalyserDestination } from './audio.js';
import { parseNote, NOTE_NAMES_SHARP, ROOTS_RAND, INTERVAL_LABELS } from './theory.js';
import { SCALES } from './scales.js';
import { MODS, MOD_LABELS, LETTERS_UI } from './scaleQuiz.js';

const CHORD_TYPES = [
  {semis:[0,4,7],      name:'Major',   sym:''},
  {semis:[0,3,7],      name:'Minor',   sym:'m'},
  {semis:[0,3,6],      name:'Dim',     sym:'dim'},
  {semis:[0,4,8],      name:'Aug',     sym:'aug'},
  {semis:[0,5,7],      name:'Sus4',    sym:'sus4'},
  {semis:[0,2,7],      name:'Sus2',    sym:'sus2'},
  {semis:[0,7],        name:'Power',   sym:'5'},
  {semis:[0,4,7,11],   name:'Maj7',    sym:'maj7'},
  {semis:[0,3,7,10],   name:'Min7',    sym:'m7'},
  {semis:[0,4,7,10],   name:'Dom7',    sym:'7'},
  {semis:[0,3,6,9],    name:'Dim7',    sym:'dim7'},
  {semis:[0,3,6,10],   name:'Half-dim7',sym:'m7b5'},
  {semis:[0,4,8,11],   name:'AugMaj7', sym:'augMaj7'},
  {semis:[0,3,7,11],   name:'MinMaj7', sym:'mMaj7'},
  {semis:[0,4,7,10,14],name:'Dom9',    sym:'9'},
  {semis:[0,4,7,11,14],name:'Maj9',    sym:'maj9'},
  {semis:[0,3,7,10,14],name:'Min9',    sym:'min9'},
  {semis:[0,2,4,7],    name:'Add2',    sym:'add2'},
  {semis:[0,4,5,7],    name:'Add4',    sym:'add4'},
  {semis:[0,4,7,9],    name:'6',       sym:'6'},
  {semis:[0,3,7,9],    name:'Min6',    sym:'m6'},
];

const chordBuilder = {
  notes: [],
  mod: 2,
  octave: 4,
  oscillators: [],
};

function identifyChord(pitchClasses) {
  if (pitchClasses.length < 2) return null;
  const uniq = [...new Set(pitchClasses)].sort((a,b) => a - b);
  let bestMatch = null;

  for (const rootPC of uniq) {
    const intervals = uniq.map(pc => ((pc - rootPC) % 12 + 12) % 12).sort((a,b) => a - b);
    for (const ct of CHORD_TYPES) {
      if (ct.semis.length !== intervals.length) continue;
      const mapped = ct.semis.map(s => s % 12);
      if (mapped.every((s, i) => s === intervals[i])) {
        const rootName = NOTE_NAMES_SHARP[rootPC];
        if (!bestMatch || ct.semis.length > bestMatch.size) {
          bestMatch = { root: rootName, rootPC, type: ct, size: ct.semis.length, intervals };
        }
      }
    }
  }

  if (!bestMatch) {
    const lowestPC = uniq[0];
    const intervals = uniq.map(pc => ((pc - lowestPC) % 12 + 12) % 12).sort((a,b) => a - b);
    return {
      root: NOTE_NAMES_SHARP[lowestPC],
      rootPC: lowestPC,
      type: null,
      intervals,
      unknown: true,
    };
  }
  return bestMatch;
}

function findKeys(pitchClasses) {
  const uniq = [...new Set(pitchClasses)];
  const results = [];
  const scaleTypes = [
    {name:'Major (Ionian)', label:'major'},
    {name:'Natural Minor (Aeolian)', label:'minor'},
  ];

  for (const root of ROOTS_RAND) {
    const rp = parseNote(root);
    if (!rp) continue;
    for (const st of scaleTypes) {
      const def = SCALES[st.name];
      const keyPCs = def.map(([lo, so]) => ((rp.semi + so) % 12 + 12) % 12);
      if (uniq.every(pc => keyPCs.includes(pc))) {
        results.push({ key: root, quality: st.label });
      }
    }
  }
  return results;
}

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
    chip.textContent = n.name + n.octave;
    chip.title = 'Click to remove';
    chip.onclick = () => {
      chordBuilder.notes.splice(i, 1);
      renderChordChips();
      renderChordAnalysis();
    };
    container.appendChild(chip);
  });
}

function addChordNote(letter) {
  const mod = MODS[chordBuilder.mod];
  const noteName = letter + mod;
  const p = parseNote(noteName);
  if (!p) return;
  const midi = 12 * (chordBuilder.octave + 1) + p.semi;
  chordBuilder.notes.push({ name: noteName, octave: chordBuilder.octave, semi: p.semi, midi });
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
  chordBuilder.notes.forEach(n => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = midiFreq(n.midi);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.25 / chordBuilder.notes.length, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2);
    osc.connect(gain);
    gain.connect(getAnalyserDestination());
    osc.start(now);
    osc.stop(now + 2);
    chordBuilder.oscillators.push({ osc, gain });
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
  const modC = document.getElementById('cb-mods');
  const letC = document.getElementById('cb-letters');
  const octC = document.getElementById('cb-octaves');
  modC.innerHTML = ''; letC.innerHTML = ''; octC.innerHTML = '';

  MODS.forEach((m, i) => {
    const btn = document.createElement('button');
    btn.className = 'mod-btn' + (i === chordBuilder.mod ? ' active' : '');
    btn.textContent = MOD_LABELS[i];
    btn.onclick = () => {
      modC.querySelectorAll('.mod-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      chordBuilder.mod = i;
    };
    modC.appendChild(btn);
  });

  LETTERS_UI.forEach(letter => {
    const btn = document.createElement('button');
    btn.className = 'letter-btn';
    btn.textContent = letter;
    btn.onclick = () => addChordNote(letter);
    letC.appendChild(btn);
  });

  for (let o = 2; o <= 6; o++) {
    const btn = document.createElement('button');
    btn.className = 'oct-btn' + (o === chordBuilder.octave ? ' active' : '');
    btn.textContent = o;
    btn.onclick = () => {
      octC.querySelectorAll('.oct-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      chordBuilder.octave = o;
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
