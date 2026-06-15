import { audioCtx, ensureAudio, midiFreq, getAnalyserDestination } from './audio.js';
import { parseNote, spellNote, NOTE_NAMES_SHARP, ROOTS } from './theory.js';
import { showNowPlaying, hideNowPlaying } from './nowPlaying.js';
import { SCALES, getScaleNotes } from './scales.js';
import { getSetting, saveSetting, saveSettings } from './persistence.js';

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
  key: 'C', scale: 'major', bpm: 100, defaultBpc: 4, defaultOct: 4, ts: 4,
  progression: [], chordNotes: [], playing: false,
  _timer: null, _nextTime: 0, _chordIdx: 0,
  _activeOscs: [],
};

function numberSetting(id, fallback, allowedValues) {
  const value = Number(getSetting(id, fallback));
  if (!Number.isFinite(value)) return fallback;
  return allowedValues && !allowedValues.includes(value) ? fallback : value;
}

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
    const baseOct = backing.defaultOct;
    if (typeof deg === 'string' && deg === 'b7') {
      const r = parseNote(backing.key);
      if (r) {
        const flatSeven = spellNote(r.li, r.semi, 6, 10);
        chord = { root: flatSeven, third: null, fifth: null, quality: '', name: flatSeven };
        const p = parseNote(flatSeven);
        const third = ((p.semi + 4) % 12 + 12) % 12;
        const fifth = ((p.semi + 7) % 12 + 12) % 12;
        const pcs = [flatSeven, NOTE_NAMES_SHARP[third], NOTE_NAMES_SHARP[fifth]];
        const voicing = voiceLeadChord(pcs, prevVoicing, baseOct);
        prevVoicing = voicing;
        backing.chordNotes.push({ chord, voicing, beats: backing.defaultBpc, oct: baseOct, pcs });
        return;
      }
    }
    chord = getDiatonicTriad(backing.key, backing.scale, deg);
    if (!chord) return;
    const pcs = [chord.root, chord.third, chord.fifth];
    const voicing = voiceLeadChord(pcs, prevVoicing, baseOct);
    prevVoicing = voicing;
    backing.chordNotes.push({ chord, voicing, beats: backing.defaultBpc, oct: baseOct, pcs });
  });

  renderBackingProg();
}

function revoiceChord(cn, idx) {
  const prev = idx > 0 ? backing.chordNotes[idx - 1].voicing : null;
  cn.voicing = voiceLeadChord(cn.pcs, prev, cn.oct);
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

    const badges = document.createElement('span');
    badges.className = 'backing-badges';

    const octBadge = document.createElement('span');
    octBadge.className = 'bpc-badge oct-badge';
    octBadge.textContent = 'Oct ' + cn.oct;
    octBadge.onclick = (e) => {
      e.stopPropagation();
      const options = [2,3,4,5,6];
      const cur = options.indexOf(cn.oct);
      cn.oct = options[(cur + 1) % options.length];
      saveSetting('backing.chordOctaves', backing.chordNotes.map(chord => chord.oct));
      revoiceChord(cn, i);
      octBadge.textContent = 'Oct ' + cn.oct;
    };
    badges.appendChild(octBadge);

    const beatBadge = document.createElement('span');
    beatBadge.className = 'bpc-badge';
    beatBadge.textContent = cn.beats + ' beats';
    beatBadge.onclick = (e) => {
      e.stopPropagation();
      const options = [1,2,3,4,6,8];
      const cur = options.indexOf(cn.beats);
      cn.beats = options[(cur + 1) % options.length];
      saveSetting('backing.chordBeats', backing.chordNotes.map(chord => chord.beats));
      beatBadge.textContent = cn.beats + ' beats';
    };
    badges.appendChild(beatBadge);

    div.appendChild(badges);
    container.appendChild(div);
  });
}

function playBackingChord(time, voicing, beats) {
  const chordDur = (60 / backing.bpm) * beats;
  const vol = 0.12 / Math.max(voicing.length, 1);
  voicing.forEach(midi => {
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();

    const freq = midiFreq(midi);
    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.value = freq;
    osc2.frequency.value = freq;

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(freq * 3, 4000), time);
    filter.frequency.exponentialRampToValueAtTime(Math.min(freq * 1.5, 2000), time + chordDur * 0.5);
    filter.Q.value = 0.5;

    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.05);
    gain.gain.setValueAtTime(vol, time + chordDur * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.001, time + chordDur);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(getAnalyserDestination());
    osc1.start(time); osc1.stop(time + chordDur + 0.05);
    osc2.start(time); osc2.stop(time + chordDur + 0.05);
    backing._activeOscs.push({ osc: osc1, gain }, { osc: osc2, gain });
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
  showNowPlaying(`Backing Track \u2014 ${backing.key} ${backing.scale}`, stopBacking);
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
  hideNowPlaying();
}

function toggleBacking() {
  if (backing.playing) stopBacking(); else {
    backing.bpm = parseInt(document.getElementById('backing-bpm').value) || 100;
    backing.ts = parseInt(document.getElementById('backing-ts').value) || 4;
    saveSettings({ 'backing.bpm': backing.bpm, 'backing.ts': backing.ts });
    startBacking();
  }
}

function initBacking() {
  const keyScroll = document.getElementById('sl-backing-key');
  const scaleScroll = document.getElementById('sl-backing-scale');
  const savedProgression = getSetting('backing.progression', null);
  const savedChordBeats = getSetting('backing.chordBeats', null);
  const savedChordOctaves = getSetting('backing.chordOctaves', null);
  backing.key = getSetting('backing.key', backing.key, ROOTS);
  backing.scale = getSetting('backing.scale', backing.scale, ['major','minor']);
  backing.bpm = numberSetting('backing.bpm', backing.bpm);
  backing.ts = numberSetting('backing.ts', backing.ts, [2,3,4,5,6,7]);
  backing.defaultBpc = numberSetting('backing.defaultBpc', backing.defaultBpc, [2,4,8]);
  document.getElementById('backing-bpm').value = backing.bpm;
  document.getElementById('backing-ts').value = backing.ts;
  document.getElementById('backing-bpc').value = backing.defaultBpc;

  if (keyScroll.children.length) return;

  ROOTS.forEach(r => {
    const div = document.createElement('div');
    div.className = 'sl-item' + (r === backing.key ? ' active' : '');
    div.dataset.val = r; div.textContent = r;
    div.onclick = () => {
      keyScroll.querySelectorAll('.sl-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      backing.key = r;
      saveSetting('backing.key', backing.key);
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
      saveSetting('backing.scale', backing.scale);
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
      saveSettings({ 'backing.scale': backing.scale, 'backing.progression': backing.progression });
      buildBackingProgression();
    };
    presetC.appendChild(btn);
  });

  document.getElementById('backing-bpc').onchange = (e) => {
    backing.defaultBpc = parseInt(e.target.value) || 4;
    saveSetting('backing.defaultBpc', backing.defaultBpc);
  };
  document.getElementById('backing-bpm').oninput = (e) => {
    backing.bpm = parseInt(e.target.value) || 100;
    saveSetting('backing.bpm', backing.bpm);
  };
  document.getElementById('backing-ts').onchange = (e) => {
    backing.ts = parseInt(e.target.value) || 4;
    saveSetting('backing.ts', backing.ts);
  };

  const defaultPreset = PROG_PRESETS['Pop (I-V-vi-IV)'];
  backing.progression = Array.isArray(savedProgression) && savedProgression.length
    ? [...savedProgression]
    : [...defaultPreset.degrees];
  buildBackingProgression();
  if (Array.isArray(savedChordBeats)) {
    backing.chordNotes.forEach((chord, i) => {
      if (Number.isFinite(Number(savedChordBeats[i]))) chord.beats = Number(savedChordBeats[i]);
    });
  }
  if (Array.isArray(savedChordOctaves)) {
    backing.chordNotes.forEach((chord, i) => {
      if (Number.isFinite(Number(savedChordOctaves[i]))) {
        chord.oct = Number(savedChordOctaves[i]);
        revoiceChord(chord, i);
      }
    });
  }
  renderBackingProg();
}

window.toggleBacking = toggleBacking;
window.stopBacking = stopBacking;

export { initBacking, stopBacking, backing };
