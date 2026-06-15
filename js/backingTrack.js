import { audioCtx, ensureAudio, midiFreq } from './audio.js';
import { parseNote, spellNote, NOTE_NAMES_SHARP, ROOTS } from './theory.js';
import { SCALES, getScaleNotes } from './scales.js';

const MAJOR_TRIAD_Q = ['','m','m','','','m','dim'];
const MINOR_TRIAD_Q = ['m','dim','','m','m','',''];
const PROG_PRESETS = {
  'Pop (I-V-vi-IV)':       {degrees:[0,4,5,3], quality:'major'},
  'Jazz ii-V-I':            {degrees:[1,4,0,0], quality:'major'},
  'Blues (8-bar)':          {degrees:[0,0,3,0,4,3,0,4], quality:'major'},
  'Rock (I-bVII-IV)':      {degrees:[0,'b7',3,0], quality:'major'},
  'Sad (i-iv-v-i)':        {degrees:[0,3,4,0], quality:'minor'},
  'Canon (I-V-vi-iii-IV-I-IV-V)': {degrees:[0,4,5,2,3,0,3,4], quality:'major'},
};

const backing = {
  key: 'C', scale: 'major', bpm: 100, defaultBpc: 4, ts: 4,
  progression: [], chordNotes: [], playing: false,
  _timer: null, _nextTime: 0, _chordIdx: 0,
  _activeOscs: [],
};

function getDiatonicTriad(rootStr, scaleName, degree) {
  const scaleKey = scaleName === 'major' ? 'Major (Ionian)' : 'Natural Minor (Aeolian)';
  const notes = getScaleNotes(rootStr, scaleKey);
  if (!notes) return null;
  const quals = scaleName === 'major' ? MAJOR_TRIAD_Q : MINOR_TRIAD_Q;
  const root = notes[degree];
  const third = notes[(degree + 2) % 7];
  const fifth = notes[(degree + 4) % 7];
  return { root, third, fifth, quality: quals[degree], name: root + quals[degree] };
}

function voiceLeadChord(chordPCs, prevVoicing, baseOct) {
  if (!prevVoicing) {
    return chordPCs.map(pc => {
      const p = parseNote(pc);
      return p ? 12 * (baseOct + 1) + p.semi : 60;
    });
  }
  const candidates = [];
  for (let inv = 0; inv < chordPCs.length; inv++) {
    const voicing = [];
    for (let i = 0; i < chordPCs.length; i++) {
      const pc = chordPCs[(i + inv) % chordPCs.length];
      const p = parseNote(pc);
      if (!p) continue;
      let midi = 12 * (baseOct + 1) + p.semi;
      while (midi < prevVoicing[0] - 6) midi += 12;
      while (midi > prevVoicing[0] + 18) midi -= 12;
      voicing.push(midi);
    }
    voicing.sort((a, b) => a - b);
    candidates.push(voicing);
  }
  let best = candidates[0], bestDist = Infinity;
  candidates.forEach(v => {
    let dist = 0;
    for (let i = 0; i < Math.min(v.length, prevVoicing.length); i++)
      dist += Math.abs(v[i] - prevVoicing[i]);
    if (dist < bestDist) { bestDist = dist; best = v; }
  });
  return best;
}

function buildBackingProgression() {
  const prog = backing.progression;
  const scaleKey = backing.scale === 'major' ? 'Major (Ionian)' : 'Natural Minor (Aeolian)';
  const notes = getScaleNotes(backing.key, scaleKey);
  if (!notes) return;

  backing.chordNotes = [];
  let prevVoicing = null;

  prog.forEach(deg => {
    let chord;
    if (typeof deg === 'string' && deg === 'b7') {
      const r = parseNote(backing.key);
      if (r) {
        const flatSeven = spellNote(r.li, r.semi, 6, 10);
        chord = { root: flatSeven, third: null, fifth: null, quality: '', name: flatSeven };
        const p = parseNote(flatSeven);
        const third = ((p.semi + 4) % 12 + 12) % 12;
        const fifth = ((p.semi + 7) % 12 + 12) % 12;
        const pcs = [flatSeven, NOTE_NAMES_SHARP[third], NOTE_NAMES_SHARP[fifth]];
        const voicing = voiceLeadChord(pcs, prevVoicing, 4);
        prevVoicing = voicing;
        backing.chordNotes.push({ chord, voicing, beats: backing.defaultBpc });
        return;
      }
    }
    chord = getDiatonicTriad(backing.key, backing.scale, deg);
    if (!chord) return;
    const pcs = [chord.root, chord.third, chord.fifth];
    const voicing = voiceLeadChord(pcs, prevVoicing, 4);
    prevVoicing = voicing;
    backing.chordNotes.push({ chord, voicing, beats: backing.defaultBpc });
  });

  renderBackingProg();
}

function renderBackingProg() {
  const container = document.getElementById('backing-prog');
  container.innerHTML = '';
  backing.chordNotes.forEach((cn, i) => {
    const div = document.createElement('div');
    div.className = 'backing-chord' + (backing.playing && i === backing._chordIdx ? ' playing' : '');
    const nameSpan = document.createElement('span');
    nameSpan.textContent = cn.chord.name;
    div.appendChild(nameSpan);
    const badge = document.createElement('span');
    badge.className = 'bpc-badge';
    badge.textContent = cn.beats + ' beats';
    badge.onclick = (e) => {
      e.stopPropagation();
      const options = [1,2,3,4,6,8];
      const cur = options.indexOf(cn.beats);
      cn.beats = options[(cur + 1) % options.length];
      badge.textContent = cn.beats + ' beats';
    };
    div.appendChild(badge);
    container.appendChild(div);
  });
}

function playBackingChord(time, voicing, beats) {
  const chordDur = (60 / backing.bpm) * beats;
  const vol = 0.2;
  voicing.forEach(midi => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = midiFreq(midi);
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.03);
    gain.gain.setValueAtTime(vol, time + chordDur * 0.85);
    gain.gain.exponentialRampToValueAtTime(0.001, time + chordDur);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(time); osc.stop(time + chordDur + 0.05);
    backing._activeOscs.push({ osc, gain });
  });
}

function backingScheduler() {
  if (!backing.playing) return;
  const scheduleAhead = 0.15;
  while (backing._nextTime < audioCtx.currentTime + scheduleAhead) {
    const cn = backing.chordNotes[backing._chordIdx];
    if (!cn) break;
    const chordDur = (60 / backing.bpm) * cn.beats;
    playBackingChord(backing._nextTime, cn.voicing, cn.beats);
    const visualIdx = backing._chordIdx;
    const delay = Math.max(0, (backing._nextTime - audioCtx.currentTime) * 1000);
    setTimeout(() => {
      if (!backing.playing) return;
      document.querySelectorAll('.backing-chord').forEach((el, i) =>
        el.classList.toggle('playing', i === visualIdx));
    }, delay);
    backing._nextTime += chordDur;
    backing._chordIdx++;
    if (backing._chordIdx >= backing.chordNotes.length) backing._chordIdx = 0;
  }
  backing._timer = setTimeout(backingScheduler, 30);
}

function startBacking() {
  if (!backing.chordNotes.length) return;
  ensureAudio();
  backing.playing = true;
  backing._chordIdx = 0;
  backing._nextTime = audioCtx.currentTime + 0.05;
  backing._activeOscs = [];
  document.getElementById('backing-play').textContent = 'Stop';
  backingScheduler();
}

function stopBacking() {
  backing.playing = false;
  if (backing._timer) { clearTimeout(backing._timer); backing._timer = null; }
  backing._activeOscs.forEach(o => {
    try { o.gain.gain.cancelScheduledValues(audioCtx.currentTime);
      o.gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.03);
      setTimeout(() => { try { o.osc.stop(); } catch(e) {} }, 40);
    } catch(e) {}
  });
  backing._activeOscs = [];
  document.getElementById('backing-play').textContent = 'Play';
  document.querySelectorAll('.backing-chord').forEach(el => el.classList.remove('playing'));
}

function toggleBacking() {
  if (backing.playing) stopBacking(); else {
    backing.bpm = parseInt(document.getElementById('backing-bpm').value) || 100;
    backing.ts = parseInt(document.getElementById('backing-ts').value) || 4;
    startBacking();
  }
}

function initBacking() {
  const keyScroll = document.getElementById('sl-backing-key');
  const scaleScroll = document.getElementById('sl-backing-scale');
  if (keyScroll.children.length) return;

  ROOTS.forEach(r => {
    const div = document.createElement('div');
    div.className = 'sl-item' + (r === backing.key ? ' active' : '');
    div.dataset.val = r; div.textContent = r;
    div.onclick = () => {
      keyScroll.querySelectorAll('.sl-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      backing.key = r;
      buildBackingProgression();
    };
    keyScroll.appendChild(div);
  });

  ['major','minor'].forEach(s => {
    const div = document.createElement('div');
    div.className = 'sl-item' + (s === backing.scale ? ' active' : '');
    div.dataset.val = s; div.textContent = s.charAt(0).toUpperCase() + s.slice(1);
    div.onclick = () => {
      scaleScroll.querySelectorAll('.sl-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      backing.scale = s;
      buildBackingProgression();
    };
    scaleScroll.appendChild(div);
  });

  const presetC = document.getElementById('backing-presets');
  Object.keys(PROG_PRESETS).forEach(name => {
    const btn = document.createElement('button');
    btn.className = 'btn sm';
    btn.textContent = name;
    btn.onclick = () => {
      const p = PROG_PRESETS[name];
      backing.progression = [...p.degrees];
      const scaleScr = document.getElementById('sl-backing-scale');
      scaleScr.querySelectorAll('.sl-item').forEach(el => {
        el.classList.toggle('active', el.dataset.val === p.quality);
      });
      backing.scale = p.quality;
      buildBackingProgression();
    };
    presetC.appendChild(btn);
  });

  document.getElementById('backing-bpc').onchange = (e) => {
    backing.defaultBpc = parseInt(e.target.value) || 4;
  };

  const defaultPreset = PROG_PRESETS['Pop (I-V-vi-IV)'];
  backing.progression = [...defaultPreset.degrees];
  backing.scale = defaultPreset.quality;
  buildBackingProgression();
}

window.toggleBacking = toggleBacking;
window.stopBacking = stopBacking;

export { initBacking, stopBacking, backing };
