// Shared Guitar Pro practice-player UI.
// Mounted inside the standalone GP Player screen and the Exercises viewer.

import { TUNINGS, NOTE_NAMES_SHARP } from './theory.js';
import { parseGuitarPro, modelToAsciiTab, isGuitarProName } from './tab/guitarPro.js';
import { transformModel, modelHasRhythm } from './tab/tabModel.js';
import { createTabPlayer } from './tab/tabPlayer.js';
import { TUNING_CATALOG } from './tunings.js';

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node[k.toLowerCase()] = v;
    else if (v === false || v == null) { /* skip */ }
    else if (k === 'value') node.value = v;
    else node.setAttribute(k, v === true ? '' : v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

function fmtTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function tuningOptionsFor(stringCount) {
  const names = Object.keys(TUNINGS).filter((n) => TUNINGS[n].length === stringCount);
  // Prefer catalog order when available.
  const catalogNames = TUNING_CATALOG
    .filter((p) => p.strings === stringCount)
    .map((p) => p.name);
  const ordered = [];
  for (const n of catalogNames) if (names.includes(n) && !ordered.includes(n)) ordered.push(n);
  for (const n of names) if (!ordered.includes(n)) ordered.push(n);
  return ordered;
}

function stringPitchLabel(str) {
  return `${str.note}${str.oct}`;
}

/**
 * Mount a practice player into `host`.
 * @returns {{ destroy:()=>void, player:object, getState:()=>object }}
 */
export function mountGpPlayer(host, {
  gpResult,
  title = 'Guitar Pro',
  fileName = '',
  preferredTrackIndex = 0,
  onAnalyze = null,
  headerExtra = null,
  hideTitle = false,
} = {}) {
  if (!host) throw new Error('mountGpPlayer: host required');
  if (!gpResult || !gpResult.tracks?.length) throw new Error('mountGpPlayer: no fretted tracks');

  const state = {
    gp: gpResult,
    trackIndex: Math.max(0, Math.min(gpResult.tracks.length - 1, preferredTrackIndex || 0)),
    scoreBpm: Number(gpResult.tempo) || Number(gpResult.tracks[0]?.model?.tempo) || 120,
    bpm: Number(gpResult.tempo) || Number(gpResult.tracks[0]?.model?.tempo) || 120,
    transpose: 0,
    tuning: null, // null = keep file tuning
    preservePitchOnRetune: true,
    loopStart: 0,
    loopEnd: Math.max(0, (gpResult.tracks[0]?.model?.measures?.length || 1) - 1),
    loopEnabled: false,
    baseModel: null,
    viewModel: null,
  };

  const player = createTabPlayer({
    onTick: ({ playing, currentSec, measureIndex }) => {
      if (playBtn) playBtn.textContent = playing ? 'Pause' : 'Play';
      if (timeLabel) {
        timeLabel.textContent = `${fmtTime(currentSec)} / ${fmtTime(player.durationSec)}`;
      }
      if (measureLabel) {
        const total = state.viewModel?.measures?.length || 0;
        measureLabel.textContent = total
          ? `Bar ${Math.min(total, (measureIndex || 0) + 1)} / ${total}`
          : '';
      }
      highlightMeasure(measureIndex);
    },
  });

  host.innerHTML = '';
  host.classList.add('gpp-root');

  // ---- header ----
  const head = el('div', { class: 'gpp-head' });
  if (!hideTitle) {
    head.appendChild(el('div', { class: 'gpp-title', text: title, title: fileName || title }));
  } else {
    head.appendChild(el('div', { class: 'gpp-title gpp-title-spacer', text: 'Practice player' }));
  }
  const headActions = el('div', { class: 'gpp-head-actions' });
  if (typeof onAnalyze === 'function') {
    headActions.appendChild(el('button', {
      class: 'btn sm', type: 'button', text: 'Analyze',
      onClick: () => onAnalyze({ gp: state.gp, trackIndex: state.trackIndex, model: state.viewModel }),
    }));
  }
  if (headerExtra) headActions.appendChild(headerExtra);
  head.appendChild(headActions);
  host.appendChild(head);

  // ---- meta / track ----
  const meta = el('div', { class: 'gpp-meta' });
  const trackSelect = el('select', { class: 'gpp-select', 'aria-label': 'Track' });
  state.gp.tracks.forEach((t, i) => {
    trackSelect.appendChild(el('option', {
      value: String(i),
      text: `${t.name} · ${t.tuning} · ${t.noteCount} notes`,
    }));
  });
  trackSelect.value = String(state.trackIndex);
  meta.appendChild(el('label', { class: 'gpp-field' }, [
    el('span', { text: 'Track' }),
    trackSelect,
  ]));
  const infoLine = el('div', { class: 'gpp-info' });
  meta.appendChild(infoLine);
  host.appendChild(meta);

  // ---- transport ----
  const transport = el('div', { class: 'gpp-transport' });
  const playBtn = el('button', { class: 'btn primary gpp-play', type: 'button', text: 'Play' });
  const stopBtn = el('button', { class: 'btn', type: 'button', text: 'Stop' });
  const timeLabel = el('span', { class: 'gpp-time', text: '0:00 / 0:00' });
  const measureLabel = el('span', { class: 'gpp-measure', text: '' });
  transport.append(playBtn, stopBtn, timeLabel, measureLabel);
  host.appendChild(transport);

  // ---- controls: BPM / transpose / tuning ----
  const controls = el('div', { class: 'gpp-controls' });

  const bpmInput = el('input', {
    type: 'number', class: 'gpp-num', min: '40', max: '280', step: '1',
    value: String(Math.round(state.bpm)), 'aria-label': 'BPM',
  });
  const bpmSlider = el('input', {
    type: 'range', class: 'gpp-slider', min: '50', max: '150', step: '1',
    value: '100', 'aria-label': 'Tempo percent',
  });
  const bpmPct = el('span', { class: 'gpp-pct', text: '100%' });
  controls.appendChild(el('div', { class: 'gpp-control-block' }, [
    el('div', { class: 'gpp-control-label', text: 'Tempo' }),
    el('div', { class: 'gpp-control-row' }, [
      bpmInput,
      el('span', { class: 'gpp-unit', text: 'BPM' }),
      bpmSlider,
      bpmPct,
    ]),
  ]));

  const transposeInput = el('input', {
    type: 'number', class: 'gpp-num', min: '-12', max: '12', step: '1',
    value: '0', 'aria-label': 'Transpose semitones',
  });
  controls.appendChild(el('div', { class: 'gpp-control-block' }, [
    el('div', { class: 'gpp-control-label', text: 'Transpose' }),
    el('div', { class: 'gpp-control-row' }, [
      el('button', { class: 'btn sm', type: 'button', text: '−', onClick: () => setTranspose(state.transpose - 1) }),
      transposeInput,
      el('button', { class: 'btn sm', type: 'button', text: '+', onClick: () => setTranspose(state.transpose + 1) }),
      el('span', { class: 'gpp-unit', text: 'semitones' }),
    ]),
  ]));

  const tuningSelect = el('select', { class: 'gpp-select', 'aria-label': 'Tuning' });
  const preserveCheck = el('input', { type: 'checkbox', checked: 'checked', id: 'gpp-preserve-pitch' });
  controls.appendChild(el('div', { class: 'gpp-control-block' }, [
    el('div', { class: 'gpp-control-label', text: 'Tuning' }),
    el('div', { class: 'gpp-control-row' }, [tuningSelect]),
    el('label', { class: 'gpp-check', for: 'gpp-preserve-pitch' }, [
      preserveCheck,
      el('span', { text: 'Keep pitches (rewrite frets)' }),
    ]),
  ]));

  // Loop
  const loopToggle = el('input', { type: 'checkbox', id: 'gpp-loop' });
  const loopStartSel = el('select', { class: 'gpp-select gpp-loop-sel', 'aria-label': 'Loop start bar' });
  const loopEndSel = el('select', { class: 'gpp-select gpp-loop-sel', 'aria-label': 'Loop end bar' });
  controls.appendChild(el('div', { class: 'gpp-control-block' }, [
    el('div', { class: 'gpp-control-label', text: 'Loop' }),
    el('div', { class: 'gpp-control-row' }, [
      el('label', { class: 'gpp-check', for: 'gpp-loop' }, [loopToggle, el('span', { text: 'Enable' })]),
      el('span', { class: 'gpp-unit', text: 'Bars' }),
      loopStartSel,
      el('span', { class: 'gpp-unit', text: '–' }),
      loopEndSel,
    ]),
  ]));

  host.appendChild(controls);

  // ---- measure strip + tab ----
  const strip = el('div', { class: 'gpp-strip', 'aria-label': 'Measures' });
  host.appendChild(strip);
  const tabPre = el('pre', { class: 'gpp-tab', text: '' });
  host.appendChild(tabPre);

  // ---- wiring ----
  function currentTrack() {
    return state.gp.tracks[state.trackIndex];
  }

  function rebuildTuningSelect() {
    const model = state.baseModel;
    tuningSelect.innerHTML = '';
    if (!model) return;
    const fileOpt = el('option', { value: '__file__', text: `File: ${model.tuning} (${model.strings.map(stringPitchLabel).join(' ')})` });
    tuningSelect.appendChild(fileOpt);
    for (const name of tuningOptionsFor(model.strings.length)) {
      if (name === model.tuning) continue;
      tuningSelect.appendChild(el('option', {
        value: name,
        text: `${name} (${TUNINGS[name].map((s) => s.note).join(' ')})`,
      }));
    }
    tuningSelect.value = state.tuning || '__file__';
  }

  function rebuildLoopSelects() {
    const measures = state.viewModel?.measures || [];
    loopStartSel.innerHTML = '';
    loopEndSel.innerHTML = '';
    measures.forEach((m, i) => {
      const label = m.marker ? `${i + 1} · ${m.marker}` : String(i + 1);
      loopStartSel.appendChild(el('option', { value: String(i), text: label }));
      loopEndSel.appendChild(el('option', { value: String(i), text: label }));
    });
    state.loopEnd = Math.max(0, measures.length - 1);
    loopStartSel.value = String(state.loopStart);
    loopEndSel.value = String(state.loopEnd);
  }

  function rebuildStrip() {
    strip.innerHTML = '';
    const measures = state.viewModel?.measures || [];
    measures.forEach((m, i) => {
      const btn = el('button', {
        class: 'gpp-bar' + (m.marker ? ' has-marker' : ''),
        type: 'button',
        text: m.marker ? `${i + 1}\n${m.marker}` : String(i + 1),
        title: m.marker || `Bar ${i + 1}`,
        onClick: () => {
          // Seek: restart from this measure.
          const wasPlaying = player.playing;
          reloadPlayer({ fromMeasure: i, autoplay: wasPlaying });
        },
      });
      btn.dataset.index = String(i);
      strip.appendChild(btn);
    });
  }

  function highlightMeasure(idx) {
    strip.querySelectorAll('.gpp-bar').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.index) === idx);
    });
  }

  function applyTransforms() {
    const track = currentTrack();
    state.baseModel = track?.model || null;
    if (!state.baseModel) {
      state.viewModel = null;
      return;
    }
    const tuning = state.tuning && state.tuning !== '__file__' ? state.tuning : null;
    state.viewModel = transformModel(state.baseModel, {
      transpose: state.transpose,
      tuning,
      preservePitch: state.preservePitchOnRetune,
    });
  }

  function reloadPlayer({ fromMeasure = null, autoplay = false } = {}) {
    applyTransforms();
    const model = state.viewModel;
    if (!model) return;
    const loopMeasures = state.loopEnabled
      ? [Number(loopStartSel.value) || 0, Number(loopEndSel.value) || 0]
      : null;
    player.load(model, { bpm: state.bpm, loopMeasures });
    // If loopMeasures path didn't set loop (equal-slot), set manually via load's internal — already handled.
    if (state.loopEnabled && loopMeasures) {
      // ensure loop was applied; load() handles it
    } else {
      player.setLoop(null);
    }
    tabPre.textContent = modelToAsciiTab(model, { maxCols: 96 }) || '(no notes)';
    infoLine.textContent = [
      model.tuning,
      model.strings.map(stringPitchLabel).join(' '),
      `${Math.round(state.bpm)} BPM`,
      modelHasRhythm(model) ? 'rhythm' : 'equal slots',
      `${model.events.filter((e) => e.midi != null).length} notes`,
      state.transpose ? `transpose ${state.transpose > 0 ? '+' : ''}${state.transpose}` : null,
    ].filter(Boolean).join(' · ');
    rebuildStrip();
    if (autoplay) {
      let fromSec = 0;
      if (fromMeasure != null && model.measures?.[fromMeasure]) {
        const m = model.measures[fromMeasure];
        const startBeat = Number.isFinite(m.startBeat) ? m.startBeat : m.startSlot;
        fromSec = (startBeat) * (60 / state.bpm);
        if (!modelHasRhythm(model)) {
          const note = player.notes.find((n) => n.measureIndex === fromMeasure);
          if (note) fromSec = note.startSec;
        }
      }
      player.play({ fromSec });
    }
  }

  function setTranspose(n) {
    state.transpose = Math.max(-12, Math.min(12, Number(n) || 0));
    transposeInput.value = String(state.transpose);
    const was = player.playing;
    player.stop();
    reloadPlayer({ autoplay: was });
  }

  function syncBpmFromScorePercent() {
    const pct = Number(bpmSlider.value) || 100;
    state.bpm = Math.max(40, Math.min(280, Math.round(state.scoreBpm * (pct / 100))));
    bpmInput.value = String(state.bpm);
    bpmPct.textContent = `${pct}%`;
  }

  // Events
  trackSelect.addEventListener('change', () => {
    state.trackIndex = Number(trackSelect.value) || 0;
    const model = currentTrack()?.model;
    state.scoreBpm = Number(model?.tempo) || Number(state.gp.tempo) || 120;
    state.bpm = state.scoreBpm;
    state.transpose = 0;
    state.tuning = null;
    state.loopStart = 0;
    bpmInput.value = String(Math.round(state.bpm));
    bpmSlider.value = '100';
    bpmPct.textContent = '100%';
    transposeInput.value = '0';
    player.stop();
    applyTransforms();
    rebuildTuningSelect();
    rebuildLoopSelects();
    reloadPlayer();
  });

  playBtn.addEventListener('click', () => {
    if (player.playing) player.pause();
    else player.play();
  });
  stopBtn.addEventListener('click', () => player.stop());

  bpmInput.addEventListener('change', () => {
    state.bpm = Math.max(40, Math.min(280, Number(bpmInput.value) || state.scoreBpm));
    bpmInput.value = String(state.bpm);
    const pct = state.scoreBpm ? Math.round((state.bpm / state.scoreBpm) * 100) : 100;
    bpmSlider.value = String(Math.max(50, Math.min(150, pct)));
    bpmPct.textContent = `${bpmSlider.value}%`;
    const was = player.playing;
    player.stop();
    reloadPlayer({ autoplay: was });
  });
  bpmSlider.addEventListener('input', () => {
    syncBpmFromScorePercent();
  });
  bpmSlider.addEventListener('change', () => {
    syncBpmFromScorePercent();
    const was = player.playing;
    player.stop();
    reloadPlayer({ autoplay: was });
  });

  transposeInput.addEventListener('change', () => setTranspose(transposeInput.value));

  tuningSelect.addEventListener('change', () => {
    state.tuning = tuningSelect.value === '__file__' ? null : tuningSelect.value;
    const was = player.playing;
    player.stop();
    reloadPlayer({ autoplay: was });
  });
  preserveCheck.addEventListener('change', () => {
    state.preservePitchOnRetune = !!preserveCheck.checked;
    const was = player.playing;
    player.stop();
    reloadPlayer({ autoplay: was });
  });

  loopToggle.addEventListener('change', () => {
    state.loopEnabled = !!loopToggle.checked;
    const was = player.playing;
    player.stop();
    reloadPlayer({ autoplay: was });
  });
  const onLoopChange = () => {
    state.loopStart = Number(loopStartSel.value) || 0;
    state.loopEnd = Number(loopEndSel.value) || 0;
    if (state.loopEnd < state.loopStart) {
      state.loopEnd = state.loopStart;
      loopEndSel.value = String(state.loopEnd);
    }
    if (!state.loopEnabled) return;
    const was = player.playing;
    player.stop();
    reloadPlayer({ autoplay: was });
  };
  loopStartSel.addEventListener('change', onLoopChange);
  loopEndSel.addEventListener('change', onLoopChange);

  // Initial paint
  applyTransforms();
  rebuildTuningSelect();
  rebuildLoopSelects();
  reloadPlayer();

  return {
    player,
    getState: () => ({ ...state, viewModel: state.viewModel }),
    destroy() {
      player.stop();
      host.innerHTML = '';
      host.classList.remove('gpp-root');
    },
  };
}

export { isGuitarProName, parseGuitarPro };

/** Parse bytes and mount player — convenience for callers. */
export async function openGpPlayerFromBytes(host, bytes, options = {}) {
  const gp = await parseGuitarPro(bytes);
  return mountGpPlayer(host, { ...options, gpResult: gp });
}

// Silence unused import warning paths in some bundlers — NOTE_NAMES used indirectly via models.
void NOTE_NAMES_SHARP;
