// Shared Guitar Pro practice-player UI.
// Mounted inside the standalone GP Player screen and the Exercises viewer.

import { TUNINGS, NOTE_NAMES_SHARP } from './theory.js';
import { parseGuitarPro, modelToAsciiTab, isGuitarProName } from './tab/guitarPro.js';
import { transformModel, modelHasRhythm, quartersToSeconds } from './tab/tabModel.js';
import { createGpMixPlayer } from './gpMixPlayer.js';
import { TUNING_CATALOG } from './tunings.js';
import { buildFollowColumns, mountFollowView } from './gpFollowView.js';
import { analyzeModel } from './tab/tabAnalyzer.js';
import { renderAnalysisReport } from './tab/tabAnalysisView.js';

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

const GP_FOLLOW_SIZE_KEY = 'musi.gpFollowSize';

function readFollowSize() {
  try {
    const s = localStorage.getItem(GP_FOLLOW_SIZE_KEY);
    if (s === 'sm' || s === 'md' || s === 'lg') return s;
  } catch (e) { /* ignore */ }
  return 'md';
}

function beatsFromMeasureRange(measures, startIdx, endIdx) {
  if (!measures?.length) return { startBeat: 0, endBeat: 4 };
  const a = Math.max(0, Math.min(measures.length - 1, startIdx));
  const b = Math.max(a, Math.min(measures.length - 1, endIdx));
  const startBeat = Number.isFinite(measures[a].startBeat)
    ? measures[a].startBeat
    : measures[a].startSlot ?? 0;
  const endBeat = Number.isFinite(measures[b].endBeat)
    ? measures[b].endBeat
    : startBeat + 4;
  return { startBeat, endBeat };
}

function measureIndicesForBeats(measures, startBeat, endBeat) {
  if (!measures?.length) return { startIdx: 0, endIdx: 0 };
  let startIdx = 0;
  let endIdx = measures.length - 1;
  for (let i = 0; i < measures.length; i++) {
    const ms = Number.isFinite(measures[i].startBeat)
      ? measures[i].startBeat
      : measures[i].startSlot ?? 0;
    if (ms <= startBeat + 1e-6) startIdx = i;
    if (ms < endBeat - 1e-6) endIdx = i;
  }
  return { startIdx, endIdx };
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

function viewKey(kind, index) {
  return `${kind}:${index}`;
}

function parseViewKey(key) {
  const [kind, idx] = String(key || '').split(':');
  if (kind !== 'guitar' && kind !== 'drum') return null;
  const index = Number(idx);
  if (!Number.isFinite(index) || index < 0) return null;
  return { kind, index };
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
  initialLoopEnabled = false,
  initialLoopStart = null,
  initialLoopEnd = null,
  initialLoopStartBeat = null,
  initialLoopEndBeat = null,
  loopRestSec = 0,
  onPracticeSettingsChange = null,
} = {}) {
  if (!host) throw new Error('mountGpPlayer: host required');
  const hasFretted = gpResult?.tracks?.length > 0;
  const hasDrums = gpResult?.drumTracks?.length > 0;
  if (!gpResult || (!hasFretted && !hasDrums)) {
    throw new Error('mountGpPlayer: no playable tracks');
  }

  const measureCount = gpResult.tracks[0]?.model?.measures?.length
    || gpResult.drumTracks?.[0]?.model?.measures?.length
    || 1;
  const clampBar = (n, fallback) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return fallback;
    return Math.max(0, Math.min(measureCount - 1, Math.floor(v)));
  };

  const state = {
    gp: gpResult,
    trackIndex: hasFretted
      ? Math.max(0, Math.min(gpResult.tracks.length - 1, preferredTrackIndex || 0))
      : -1,
    viewKind: hasFretted ? 'guitar' : 'drum',
    viewIndex: hasFretted
      ? Math.max(0, Math.min(gpResult.tracks.length - 1, preferredTrackIndex || 0))
      : 0,
    navBar: null,
    enabledGuitars: gpResult.tracks.map(() => true),
    enabledDrums: (gpResult.drumTracks || []).map(() => true),
    metronomeEnabled: false,
    scoreBpm: Number(gpResult.tempo)
      || Number(gpResult.tracks[0]?.model?.tempo)
      || Number(gpResult.drumTracks?.[0]?.model?.tempo)
      || 120,
    bpm: Number(gpResult.tempo)
      || Number(gpResult.tracks[0]?.model?.tempo)
      || Number(gpResult.drumTracks?.[0]?.model?.tempo)
      || 120,
    transpose: 0,
    tuning: null, // null = keep file tuning
    preservePitchOnRetune: true,
    loopStart: clampBar(initialLoopStart, 0),
    loopEnd: clampBar(initialLoopEnd, Math.max(0, measureCount - 1)),
    loopEnabled: !!initialLoopEnabled,
    loopRestSec: Math.max(0, Number(loopRestSec) || 0),
    baseModel: null,
    viewModel: null,
  };
  if (state.loopEnd < state.loopStart) state.loopEnd = state.loopStart;

  const initMeasures = gpResult.tracks[0]?.model?.measures
    || gpResult.drumTracks?.[0]?.model?.measures
    || [];
  let loopStartBeat = Number.isFinite(Number(initialLoopStartBeat))
    ? Number(initialLoopStartBeat)
    : null;
  let loopEndBeat = Number.isFinite(Number(initialLoopEndBeat))
    ? Number(initialLoopEndBeat)
    : null;
  if (loopStartBeat == null || loopEndBeat == null) {
    const initBeats = beatsFromMeasureRange(initMeasures, state.loopStart, state.loopEnd);
    if (loopStartBeat == null) loopStartBeat = initBeats.startBeat;
    if (loopEndBeat == null) loopEndBeat = initBeats.endBeat;
  }
  state.loopStartBeat = loopStartBeat;
  state.loopEndBeat = loopEndBeat;
  state.followSize = readFollowSize();

  let follow = null;
  let metroCheck = null;
  const sizeBtns = {};
  let transposeBlock = null;
  let tuningBlock = null;

  function emitPracticeSettings() {
    if (typeof syncSettingsSummary === 'function') syncSettingsSummary();
    if (typeof onPracticeSettingsChange !== 'function') return;
    onPracticeSettingsChange({
      preferredTrackIndex: state.trackIndex,
      loopEnabled: state.loopEnabled,
      measureStart: state.loopStart,
      measureEnd: state.loopEnd,
      startBeat: state.loopEnabled ? state.loopStartBeat : null,
      endBeat: state.loopEnabled ? state.loopEndBeat : null,
      loopRestSec: state.loopRestSec,
      bpm: state.bpm,
    });
  }

  const player = createGpMixPlayer({
    onTick: ({ playing, currentSec, measureIndex, resting, restRemaining }) => {
      if (playBtn) playBtn.textContent = playing ? 'Pause' : 'Play';
      if (timeLabel) {
        const restTxt = resting && restRemaining > 0
          ? ` · rest ${restRemaining.toFixed(1)}s`
          : '';
        timeLabel.textContent = `${fmtTime(currentSec)} / ${fmtTime(player.durationSec)}${restTxt}`;
      }
      if (measureLabel) {
        const total = state.viewModel?.measures?.length || 0;
        measureLabel.textContent = total
          ? `Bar ${Math.min(total, (measureIndex || 0) + 1)} / ${total}`
          : '';
      }
      highlightMeasure(measureIndex);
      if (follow) {
        follow.update({
          currentSec,
          bpm: state.bpm,
          playing: playing && !resting,
          durationSec: player.durationSec,
        });
      }
    },
  });

  host.innerHTML = '';
  host.classList.add('gpp-root');

  // ---- header ----
  const headActions = el('div', { class: 'gpp-head-actions' });
  const analyzeBtn = el('button', { class: 'btn sm', type: 'button', text: 'Analyze' });
  headActions.appendChild(analyzeBtn);
  if (headerExtra) headActions.appendChild(headerExtra);
  const hasHeadActions = headActions.childNodes.length > 0;
  if (!hideTitle || hasHeadActions) {
    const head = el('div', { class: 'gpp-head' });
    if (!hideTitle) {
      head.appendChild(el('div', { class: 'gpp-title', text: title, title: fileName || title }));
    }
    if (hasHeadActions) head.appendChild(headActions);
    host.appendChild(head);
  }

  // ---- meta / track mixer ----
  const meta = el('div', { class: 'gpp-meta' });

  const viewRow = el('div', { class: 'gpp-view-row' });
  const viewSelect = el('select', { class: 'gpp-select gpp-view-select', 'aria-label': 'View track' });
  state.gp.tracks.forEach((t, i) => {
    viewSelect.appendChild(el('option', {
      value: viewKey('guitar', i),
      text: `🎸 ${t.name}`,
    }));
  });
  (state.gp.drumTracks || []).forEach((t, i) => {
    viewSelect.appendChild(el('option', {
      value: viewKey('drum', i),
      text: `🥁 ${t.name}`,
    }));
  });
  viewSelect.value = viewKey(state.viewKind, state.viewIndex);
  viewRow.append(
    el('label', { class: 'gpp-view-label', text: 'View track' }),
    viewSelect,
  );
  meta.appendChild(viewRow);

  const mixer = el('div', { class: 'gpp-mixer', 'aria-label': 'Track mixer' });
  mixer.appendChild(el('div', { class: 'gpp-mixer-head', text: 'Audio mix' }));
  const mixerRows = [];

  state.gp.tracks.forEach((t, i) => {
    const enableCb = el('input', {
      type: 'checkbox',
      checked: state.enabledGuitars[i] ? 'checked' : false,
      'aria-label': `Enable ${t.name}`,
    });
    const row = el('label', { class: 'gpp-mixer-row gpp-mixer-guitar' }, [
      enableCb,
      el('span', { class: 'gpp-mixer-name', text: `${t.name} · ${t.tuning} · ${t.noteCount} notes` }),
    ]);
    enableCb.addEventListener('change', () => {
      state.enabledGuitars[i] = enableCb.checked;
      player.setTrackEnabled('guitar', i, enableCb.checked);
      emitPracticeSettings();
    });
    mixer.appendChild(row);
    mixerRows.push({ enableCb, kind: 'guitar', index: i });
  });

  (state.gp.drumTracks || []).forEach((t, i) => {
    const enableCb = el('input', {
      type: 'checkbox',
      checked: state.enabledDrums[i] ? 'checked' : false,
      'aria-label': `Enable ${t.name}`,
    });
    const row = el('label', { class: 'gpp-mixer-row gpp-mixer-drum' }, [
      enableCb,
      el('span', { class: 'gpp-mixer-name', text: `🥁 ${t.name} · ${t.hitCount || 0} hits` }),
    ]);
    enableCb.addEventListener('change', () => {
      state.enabledDrums[i] = enableCb.checked;
      player.setTrackEnabled('drum', i, enableCb.checked);
      emitPracticeSettings();
    });
    mixer.appendChild(row);
    mixerRows.push({ enableCb, kind: 'drum', index: i });
  });

  meta.appendChild(mixer);
  const infoLine = el('div', { class: 'gpp-info' });
  meta.appendChild(infoLine);
  host.appendChild(meta);

  // ---- transport ----
  const transport = el('div', { class: 'gpp-transport' });
  const playBtn = el('button', { class: 'btn primary gpp-play', type: 'button', text: 'Play' });
  const stopBtn = el('button', { class: 'btn', type: 'button', text: 'Stop' });
  const restartBtn = el('button', { class: 'btn gpp-restart', type: 'button', text: 'Restart', title: 'Jump to beginning' });
  metroCheck = el('input', { type: 'checkbox', id: 'gpp-metro', 'aria-label': 'Metronome' });
  const metroLabel = el('label', { class: 'gpp-check gpp-metro', for: 'gpp-metro' }, [
    metroCheck,
    el('span', { text: 'Metronome' }),
  ]);
  const timeLabel = el('span', { class: 'gpp-time', text: '0:00 / 0:00' });
  const measureLabel = el('span', { class: 'gpp-measure', text: '' });
  transport.append(playBtn, stopBtn, restartBtn, metroLabel, timeLabel, measureLabel);
  host.appendChild(transport);

  // ---- measure strip + follow-along visual (primary surface) ----
  const strip = el('div', { class: 'gpp-strip', 'aria-label': 'Measures' });
  host.appendChild(strip);
  const followToolbar = el('div', { class: 'gpp-follow-toolbar' });
  followToolbar.appendChild(el('span', { class: 'gpp-size-label', text: 'Size' }));
  const sizeGroup = el('div', { class: 'gpp-size-group', 'aria-label': 'Score size' });
  ['sm', 'md', 'lg'].forEach((sz) => {
    const btn = el('button', {
      class: 'btn sm gpp-size-btn' + (state.followSize === sz ? ' active' : ''),
      type: 'button',
      text: sz === 'sm' ? 'S' : sz === 'md' ? 'M' : 'L',
      title: sz === 'sm' ? 'Small' : sz === 'md' ? 'Medium' : 'Large',
      onClick: () => setFollowSize(sz),
    });
    sizeBtns[sz] = btn;
    sizeGroup.appendChild(btn);
  });
  followToolbar.appendChild(sizeGroup);
  host.appendChild(followToolbar);
  const followHost = el('div', { class: 'gpp-follow-host sln-follow-host' });
  host.appendChild(followHost);
  const tabPre = el('pre', { class: 'gpp-tab', text: '', hidden: 'hidden' });
  host.appendChild(tabPre);

  // ---- practice settings (collapsed so the score isn't smashed) ----
  const settings = el('details', { class: 'gpp-settings' });
  const summary = el('summary', { class: 'gpp-settings-summary' });
  summary.append(
    el('span', { class: 'gpp-settings-summary-label', text: 'Practice settings' }),
    el('span', { class: 'gpp-settings-summary-bpm', text: `${Math.round(state.bpm)} BPM` }),
  );
  settings.appendChild(summary);

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
  controls.appendChild(el('div', { class: 'gpp-control-block gpp-fret-only' }, [
    el('div', { class: 'gpp-control-label', text: 'Transpose' }),
    el('div', { class: 'gpp-control-row' }, [
      el('button', { class: 'btn sm', type: 'button', text: '−', onClick: () => setTranspose(state.transpose - 1) }),
      transposeInput,
      el('button', { class: 'btn sm', type: 'button', text: '+', onClick: () => setTranspose(state.transpose + 1) }),
      el('span', { class: 'gpp-unit', text: 'semitones' }),
    ]),
  ]));
  transposeBlock = controls.lastElementChild;

  const tuningSelect = el('select', { class: 'gpp-select', 'aria-label': 'Tuning' });
  const preserveCheck = el('input', { type: 'checkbox', checked: 'checked', id: 'gpp-preserve-pitch' });
  controls.appendChild(el('div', { class: 'gpp-control-block gpp-fret-only' }, [
    el('div', { class: 'gpp-control-label', text: 'Tuning' }),
    el('div', { class: 'gpp-control-row' }, [tuningSelect]),
    el('label', { class: 'gpp-check', for: 'gpp-preserve-pitch' }, [
      preserveCheck,
      el('span', { text: 'Keep pitches (rewrite frets)' }),
    ]),
  ]));
  tuningBlock = controls.lastElementChild;

  // Loop + rest between repeats
  const loopToggle = el('input', { type: 'checkbox', id: 'gpp-loop' });
  if (state.loopEnabled) loopToggle.checked = true;
  const loopStartSel = el('select', { class: 'gpp-select gpp-loop-sel', 'aria-label': 'Loop start bar' });
  const loopEndSel = el('select', { class: 'gpp-select gpp-loop-sel', 'aria-label': 'Loop end bar' });
  const restInput = el('input', {
    type: 'number', class: 'gpp-num', min: '0', max: '30', step: '0.5',
    value: String(state.loopRestSec), 'aria-label': 'Rest seconds between loops',
  });
  controls.appendChild(el('div', { class: 'gpp-control-block' }, [
    el('div', { class: 'gpp-control-label', text: 'Loop' }),
    el('div', { class: 'gpp-control-row' }, [
      el('label', { class: 'gpp-check', for: 'gpp-loop' }, [loopToggle, el('span', { text: 'Enable' })]),
      el('span', { class: 'gpp-unit', text: 'Bars' }),
      loopStartSel,
      el('span', { class: 'gpp-unit', text: '–' }),
      loopEndSel,
    ]),
    el('div', { class: 'gpp-control-row' }, [
      el('span', { class: 'gpp-unit', text: 'Rest between loops' }),
      restInput,
      el('span', { class: 'gpp-unit', text: 'sec' }),
    ]),
  ]));

  settings.appendChild(controls);
  host.appendChild(settings);

  const analysisDetails = el('details', { class: 'gpp-analysis' });
  const analysisResults = el('div', {
    class: 'gpp-analysis-results ta-results',
    html: '<div class="quiz-card"><p class="ta-muted">Click Analyze for a key, chord, scale, and technique breakdown.</p></div>',
  });
  analysisDetails.append(
    el('summary', { class: 'gpp-analysis-summary', text: 'Analysis' }),
    analysisResults,
  );
  host.appendChild(analysisDetails);

  function runAnalysis() {
    analysisDetails.open = true;
    const ctx = { gp: state.gp, trackIndex: state.trackIndex, model: state.viewModel };
    if (state.viewKind !== 'guitar' || !state.viewModel?.strings) {
      analysisResults.innerHTML = '<div class="quiz-card"><p class="ta-muted">Switch to a guitar or bass track to analyze. Drum parts can\u2019t be analyzed as tab.</p></div>';
      if (typeof onAnalyze === 'function') onAnalyze({ ...ctx, model: null, report: null });
      return;
    }
    const model = state.viewModel;
    const pitched = (model.events || []).filter((e) => e.midi != null);
    if (!pitched.length) {
      analysisResults.innerHTML = '<div class="quiz-card"><p class="ta-muted">No pitched notes to analyze on this track.</p></div>';
      if (typeof onAnalyze === 'function') onAnalyze({ ...ctx, report: null });
      return;
    }
    const report = analyzeModel(model);
    renderAnalysisReport(analysisResults, { model, report }, { showPlayback: false });
    if (typeof onAnalyze === 'function') onAnalyze({ ...ctx, report });
  }
  analyzeBtn.addEventListener('click', runAnalysis);

  function syncSettingsSummary() {
    const bpmEl = summary.querySelector('.gpp-settings-summary-bpm');
    if (bpmEl) {
      const loopTxt = state.loopEnabled
        ? ` · bars ${state.loopStart + 1}–${state.loopEnd + 1}`
        : '';
      bpmEl.textContent = `${Math.round(state.bpm)} BPM${loopTxt}`;
    }
  }

  // ---- wiring ----
  function currentTrack() {
    if (state.trackIndex < 0) return null;
    return state.gp.tracks[state.trackIndex];
  }

  function buildGuitarModels() {
    return state.gp.tracks.map((t, i) => {
      if (i === state.trackIndex && state.viewModel?.strings) return state.viewModel;
      return t.model;
    });
  }

  function followPercModel() {
    if (state.viewKind !== 'drum') return null;
    return state.gp.drumTracks?.[state.viewIndex]?.model || null;
  }

  function followGuitarModel() {
    if (state.viewKind !== 'guitar') return null;
    return state.viewModel;
  }

  function mixLoadBase() {
    return {
      guitarModels: buildGuitarModels(),
      drumModels: (state.gp.drumTracks || []).map((d) => d.model),
      bpm: state.bpm,
      loopRestSec: state.loopRestSec,
      enabledGuitars: state.enabledGuitars,
      enabledDrums: state.enabledDrums,
      metronomeEnabled: !!(metroCheck?.checked),
      referenceModel: state.viewModel || state.gp.drumTracks?.[0]?.model || null,
    };
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
    const last = Math.max(0, measures.length - 1);
    loopStartSel.innerHTML = '';
    loopEndSel.innerHTML = '';
    measures.forEach((m, i) => {
      const label = m.marker ? `${i + 1} · ${m.marker}` : String(i + 1);
      loopStartSel.appendChild(el('option', { value: String(i), text: label }));
      loopEndSel.appendChild(el('option', { value: String(i), text: label }));
    });
    state.loopStart = Math.max(0, Math.min(last, state.loopStart));
    state.loopEnd = Math.max(state.loopStart, Math.min(last, state.loopEnd));
    loopStartSel.value = String(state.loopStart);
    loopEndSel.value = String(state.loopEnd);
  }

  function paintStripSelection() {
    strip.querySelectorAll('.gpp-bar').forEach((b) => {
      const i = Number(b.dataset.index);
      b.classList.toggle('in-loop', state.loopEnabled && i >= state.loopStart && i <= state.loopEnd);
      b.classList.toggle('nav-target', state.navBar != null && i === state.navBar);
    });
    loopToggle.checked = !!state.loopEnabled;
    loopStartSel.value = String(state.loopStart);
    loopEndSel.value = String(state.loopEnd);
  }

  function seekToBeat(startBeat, { autoplay = false } = {}) {
    if (!state.viewModel) return;
    const startSec = quartersToSeconds(startBeat, state.bpm);
    const was = autoplay || player.playing;
    if (was) {
      player.play({ fromSec: startSec });
    } else {
      player.stop();
      player.seek(startSec);
    }
    highlightMeasure(measureIndicesForBeats(
      state.viewModel.measures || [],
      startBeat,
      startBeat,
    ).startIdx);
  }

  function seekToBar(barIndex, { autoplay = false } = {}) {
    const measures = state.viewModel?.measures || [];
    if (!measures.length) return;
    const i = Math.max(0, Math.min(measures.length - 1, barIndex));
    state.navBar = i;
    const beats = beatsFromMeasureRange(measures, i, i);
    seekToBeat(beats.startBeat, { autoplay });
    paintStripSelection();
  }

  function setFollowSize(sz) {
    if (sz !== 'sm' && sz !== 'md' && sz !== 'lg') return;
    state.followSize = sz;
    try { localStorage.setItem(GP_FOLLOW_SIZE_KEY, sz); } catch (e) { /* ignore */ }
    Object.entries(sizeBtns).forEach(([k, btn]) => btn.classList.toggle('active', k === sz));
    if (follow) follow.setSize(sz);
  }

  function syncFollowSelection() {
    if (!follow) return;
    if (state.loopStartBeat == null || state.loopEndBeat == null) {
      follow.setSelection(null);
      return;
    }
    follow.setSelection({ startBeat: state.loopStartBeat, endBeat: state.loopEndBeat });
  }

  function reloadLoopOnPlayer() {
    const model = state.viewModel;
    if (!model) return;
    const beatLoop = state.loopEnabled
      && modelHasRhythm(model)
      && state.loopStartBeat != null
      && state.loopEndBeat != null;
    const loadOpts = mixLoadBase();
    if (state.loopEnabled && !beatLoop) {
      loadOpts.loopMeasures = [state.loopStart, state.loopEnd];
    }
    if (beatLoop) {
      loadOpts.loopBeats = { startBeat: state.loopStartBeat, endBeat: state.loopEndBeat };
    }
    const was = player.playing;
    const at = player.currentSec;
    player.load(loadOpts);
    if (beatLoop) {
      const startSec = quartersToSeconds(state.loopStartBeat, state.bpm);
      const endSec = quartersToSeconds(state.loopEndBeat, state.bpm);
      if (endSec > startSec) {
        player.setLoop({ startSec, endSec, restSec: state.loopRestSec });
      }
    } else if (!state.loopEnabled) {
      player.setLoop(null);
    }
    if (metroCheck?.checked) player.setMetronomeEnabled(true);
    if (was) player.play({ fromSec: at });
    else if (state.navBar != null) {
      const beats = beatsFromMeasureRange(model.measures || [], state.navBar, state.navBar);
      player.seek(quartersToSeconds(beats.startBeat, state.bpm));
    }
  }

  function applyBeatSelection(startBeat, endBeat, { seek = false, autoplay = false } = {}) {
    if (!state.viewModel) return;
    const measures = state.viewModel.measures || [];
    state.loopStartBeat = startBeat;
    state.loopEndBeat = endBeat;
    const { startIdx, endIdx } = measureIndicesForBeats(measures, startBeat, endBeat);
    state.loopStart = startIdx;
    state.loopEnd = endIdx;
    loopStartSel.value = String(state.loopStart);
    loopEndSel.value = String(state.loopEnd);
    paintStripSelection();
    syncFollowSelection();
    if (state.loopEnabled) reloadLoopOnPlayer();
    emitPracticeSettings();
    if (seek) seekToBeat(startBeat, { autoplay });
  }

  function rebuildStrip() {
    strip.innerHTML = '';
    const measures = state.viewModel?.measures || [];
    measures.forEach((m, i) => {
      const inLoop = state.loopEnabled && i >= state.loopStart && i <= state.loopEnd;
      const isNav = state.navBar != null && i === state.navBar;
      const btn = el('button', {
        class: 'gpp-bar'
          + (m.marker ? ' has-marker' : '')
          + (inLoop ? ' in-loop' : '')
          + (isNav ? ' nav-target' : ''),
        type: 'button',
        text: m.marker ? `${i + 1}\n${m.marker}` : String(i + 1),
        title: m.marker
          ? `${m.marker} · click to jump`
          : `Bar ${i + 1} · click to jump`,
      });
      btn.dataset.index = String(i);
      btn.addEventListener('click', () => {
        seekToBar(i, { autoplay: player.playing });
      });
      strip.appendChild(btn);
    });
  }

  function highlightMeasure(idx) {
    strip.querySelectorAll('.gpp-bar').forEach((b) => {
      const i = Number(b.dataset.index);
      b.classList.toggle('active', i === idx);
      b.classList.toggle('in-loop', state.loopEnabled && i >= state.loopStart && i <= state.loopEnd);
      b.classList.toggle('nav-target', state.navBar != null && i === state.navBar && i !== idx);
    });
  }

  function syncFretControlsVisibility() {
    const show = state.viewKind === 'guitar';
    if (transposeBlock) transposeBlock.hidden = !show;
    if (tuningBlock) tuningBlock.hidden = !show;
  }

  function applyTransforms() {
    if (state.viewKind === 'drum') {
      state.baseModel = null;
      state.viewModel = state.gp.drumTracks?.[state.viewIndex]?.model || null;
      if (state.viewModel) {
        state.scoreBpm = Number(state.viewModel.tempo) || Number(state.gp.tempo) || state.scoreBpm;
      }
      return;
    }
    const track = currentTrack();
    state.baseModel = track?.model || null;
    if (!state.baseModel) {
      state.viewModel = state.gp.drumTracks?.[0]?.model || null;
      return;
    }
    const tuning = state.tuning && state.tuning !== '__file__' ? state.tuning : null;
    state.viewModel = transformModel(state.baseModel, {
      transpose: state.transpose,
      tuning,
      preservePitch: state.preservePitchOnRetune,
    });
  }

  function mountFollow() {
    const model = state.viewModel;
    if (!model) return;
    if (follow) { try { follow.destroy(); } catch (e) { /* ignore */ } follow = null; }
    const layout = buildFollowColumns({
      guitarModel: followGuitarModel(),
      percModel: followPercModel(),
      startBeat: 0,
      endBeat: model.totalBeats || null,
    });
    follow = mountFollowView(followHost, layout, {
      size: state.followSize,
      selection: state.loopStartBeat != null && state.loopEndBeat != null
        ? { startBeat: state.loopStartBeat, endBeat: state.loopEndBeat }
        : null,
      onSelectionChange: (sel) => {
        if (!sel || !Number.isFinite(sel.startBeat) || !Number.isFinite(sel.endBeat)) return;
        applyBeatSelection(sel.startBeat, sel.endBeat, { seek: true, autoplay: player.playing });
      },
    });
    follow.update({
      currentSec: player.currentSec,
      bpm: state.bpm,
      playing: player.playing,
      durationSec: player.durationSec,
    });
  }

  function reloadPlayer({ fromMeasure = null, autoplay = false } = {}) {
    applyTransforms();
    const model = state.viewModel;
    if (!model) return;
    state.loopStart = Number(loopStartSel.value) || 0;
    state.loopEnd = Number(loopEndSel.value) || 0;
    if (state.loopEnd < state.loopStart) {
      state.loopEnd = state.loopStart;
      loopEndSel.value = String(state.loopEnd);
    }
    const loopMeasures = state.loopEnabled
      ? [state.loopStart, state.loopEnd]
      : null;
    const beatLoop = state.loopEnabled
      && modelHasRhythm(model)
      && state.loopStartBeat != null
      && state.loopEndBeat != null;
    const loadOpts = mixLoadBase();
    if (state.loopEnabled && !beatLoop) loadOpts.loopMeasures = loopMeasures;
    if (beatLoop) {
      loadOpts.loopBeats = { startBeat: state.loopStartBeat, endBeat: state.loopEndBeat };
    }
    player.load(loadOpts);
    if (beatLoop) {
      const startSec = quartersToSeconds(state.loopStartBeat, state.bpm);
      const endSec = quartersToSeconds(state.loopEndBeat, state.bpm);
      if (endSec > startSec) {
        player.setLoop({ startSec, endSec, restSec: state.loopRestSec });
      }
    } else if (!state.loopEnabled) {
      player.setLoop(null);
    }
    if (metroCheck?.checked) player.setMetronomeEnabled(true);
    if (state.viewKind === 'guitar' && model.strings) {
      tabPre.textContent = modelToAsciiTab(model, { maxCols: 96 }) || '(no notes)';
      infoLine.textContent = [
        model.tuning,
        model.strings.map(stringPitchLabel).join(' '),
        `${Math.round(state.bpm)} BPM`,
        modelHasRhythm(model) ? 'rhythm' : 'equal slots',
        `${model.events.filter((e) => e.midi != null).length} notes`,
        state.transpose ? `transpose ${state.transpose > 0 ? '+' : ''}${state.transpose}` : null,
        `${state.enabledGuitars.filter(Boolean).length}/${state.gp.tracks.length} guitars`,
        state.gp.drumTracks?.length
          ? `${state.enabledDrums.filter(Boolean).length}/${state.gp.drumTracks.length} drums`
          : null,
      ].filter(Boolean).join(' · ');
    } else {
      tabPre.textContent = '';
      infoLine.textContent = [
        model.name || 'Drums',
        `${Math.round(state.bpm)} BPM`,
        `${state.enabledDrums.filter(Boolean).length}/${state.gp.drumTracks?.length || 0} drums`,
      ].filter(Boolean).join(' · ');
    }
    rebuildStrip();
    mountFollow();
    if (autoplay) {
      let fromSec = 0;
      if (fromMeasure != null && model.measures?.[fromMeasure]) {
        const m = model.measures[fromMeasure];
        const startBeat = Number.isFinite(m.startBeat) ? m.startBeat : m.startSlot;
        fromSec = (startBeat) * (60 / state.bpm);
        if (!modelHasRhythm(model)) {
          const note = player.guitarNotes.find((n) => n.measureIndex === fromMeasure);
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
  function setViewTrack(kind, index) {
    state.viewKind = kind;
    state.viewIndex = index;
    if (kind === 'guitar') {
      state.trackIndex = index;
    }
    viewSelect.value = viewKey(kind, index);
    syncFretControlsVisibility();
    const was = player.playing;
    player.stop();
    applyTransforms();
    rebuildTuningSelect();
    rebuildLoopSelects();
    reloadPlayer({ autoplay: was });
    emitPracticeSettings();
  }

  function restartPlayback() {
    state.navBar = 0;
    const was = player.playing;
    player.stop();
    player.seek(0);
    paintStripSelection();
    highlightMeasure(0);
    if (was) player.play({ fromSec: 0 });
  }

  viewSelect.addEventListener('change', () => {
    const parsed = parseViewKey(viewSelect.value);
    if (!parsed) return;
    setViewTrack(parsed.kind, parsed.index);
  });

  playBtn.addEventListener('click', () => {
    if (player.playing) player.pause();
    else player.play();
  });
  stopBtn.addEventListener('click', () => player.stop());
  restartBtn.addEventListener('click', () => restartPlayback());

  metroCheck.addEventListener('change', () => {
    state.metronomeEnabled = metroCheck.checked;
    player.setMetronomeEnabled(metroCheck.checked);
  });

  bpmInput.addEventListener('change', () => {
    state.bpm = Math.max(40, Math.min(280, Number(bpmInput.value) || state.scoreBpm));
    bpmInput.value = String(state.bpm);
    const pct = state.scoreBpm ? Math.round((state.bpm / state.scoreBpm) * 100) : 100;
    bpmSlider.value = String(Math.max(50, Math.min(150, pct)));
    bpmPct.textContent = `${bpmSlider.value}%`;
    const was = player.playing;
    player.stop();
    reloadPlayer({ autoplay: was });
    syncSettingsSummary();
  });
  bpmSlider.addEventListener('input', () => {
    syncBpmFromScorePercent();
    syncSettingsSummary();
  });
  bpmSlider.addEventListener('change', () => {
    syncBpmFromScorePercent();
    const was = player.playing;
    player.stop();
    reloadPlayer({ autoplay: was });
    syncSettingsSummary();
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
    syncFollowSelection();
    paintStripSelection();
    emitPracticeSettings();
  });
  const onLoopChange = () => {
    state.loopStart = Number(loopStartSel.value) || 0;
    state.loopEnd = Number(loopEndSel.value) || 0;
    if (state.loopEnd < state.loopStart) {
      state.loopEnd = state.loopStart;
      loopEndSel.value = String(state.loopEnd);
    }
    const measures = state.viewModel?.measures || [];
    const beats = beatsFromMeasureRange(measures, state.loopStart, state.loopEnd);
    state.loopStartBeat = beats.startBeat;
    state.loopEndBeat = beats.endBeat;
    if (!state.loopEnabled) {
      rebuildStrip();
      syncFollowSelection();
      emitPracticeSettings();
      return;
    }
    const was = player.playing;
    player.stop();
    reloadPlayer({ autoplay: was });
    syncFollowSelection();
    emitPracticeSettings();
  };
  loopStartSel.addEventListener('change', onLoopChange);
  loopEndSel.addEventListener('change', onLoopChange);
  restInput.addEventListener('change', () => {
    state.loopRestSec = Math.max(0, Math.min(30, Number(restInput.value) || 0));
    restInput.value = String(state.loopRestSec);
    player.setLoopRestSec(state.loopRestSec);
    // If loop is armed, refresh loop object with new rest.
    if (state.loopEnabled) {
      const was = player.playing;
      const at = player.currentSec;
      player.stop();
      reloadPlayer({ autoplay: false });
      if (was) player.play({ fromSec: at });
    }
    emitPracticeSettings();
  });

  // Initial paint
  syncFretControlsVisibility();
  applyTransforms();
  rebuildTuningSelect();
  rebuildLoopSelects();
  reloadPlayer();
  syncSettingsSummary();

  return {
    player,
    getState: () => ({
      ...state,
      viewModel: state.viewModel,
      enabledGuitars: [...state.enabledGuitars],
      enabledDrums: [...state.enabledDrums],
      metronomeEnabled: state.metronomeEnabled,
    }),
    destroy() {
      player.stop();
      if (follow) { try { follow.destroy(); } catch (e) { /* ignore */ } follow = null; }
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
