// Shared Guitar Pro practice-player UI (parchment + transport dock).
// Mounted inside the standalone GP Player screen and the Exercises viewer.

import { parseGuitarPro, isGuitarProName } from './tab/guitarPro.js';
import { modelHasRhythm, quartersToSeconds } from './tab/tabModel.js';
import { createGpMixPlayer } from './gpMixPlayer.js';
import { analyzeModel } from './tab/tabAnalyzer.js';
import { renderAnalysisReport } from './tab/tabAnalysisView.js';
import { audioCtx, ensureAudio } from './audio.js';
import { scheduleMetronomeClick } from './tab/metroClick.js';

import { el, uid, fmtTime } from './gpPlayer/dom.js';
import { createPlayerState } from './gpPlayer/playerState.js';
import {
  beatsFromMeasureRange,
  canPrevMeasure,
  canNextMeasure,
  restartTarget,
  measureIndicesForBeats,
} from './gpPlayer/rangeUtils.js';
import { mountParchmentView } from './gpPlayer/parchmentView.js';
import { createLoopSelectionController } from './gpPlayer/loopSelection.js';
import { mountMeasureNav } from './gpPlayer/measureNav.js';
import { mountTransportDock } from './gpPlayer/transportDock.js';
import { mountTrackMixer } from './gpPlayer/trackMixer.js';
import { mountSettingsDrawer } from './gpPlayer/settingsDrawer.js';
import { mountAnnotationsDrawer } from './gpPlayer/annotationsDrawer.js';
import {
  listAnnotations,
  addAnnotation,
  updateAnnotation,
  removeAnnotation,
} from './gpAnnotations.js';

let mountGeneration = 0;

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
  exerciseScope = false,
  initialBpm = null,
  onOpenFile = null,
  initialTranspose = null,
  initialTuning = null,
  initialRetuneMode = null,
  disabled = false,
  scoreKey = '',
} = {}) {
  if (!host) throw new Error('mountGpPlayer: host required');

  ++mountGeneration;
  let alive = true;
  const isAlive = () => alive && !state.destroyed;

  const stateController = createPlayerState(gpResult, {
    preferredTrackIndex,
    initialLoopEnabled,
    initialLoopStart,
    initialLoopEnd,
    initialLoopStartBeat,
    initialLoopEndBeat,
    loopRestSec,
    exerciseScope,
    initialTranspose,
    initialTuning,
    initialRetuneMode,
  });
  const state = stateController.state;

  if (Number.isFinite(Number(initialBpm))) {
    state.bpm = Math.max(40, Math.min(280, Number(initialBpm)));
    state.bpmUserOverride = true;
  }

  let countInTimer = null;
  let keyHandler = null;

  host.innerHTML = '';
  host.classList.add('gpp-root');
  if (disabled) host.classList.add('is-loading');
  host.tabIndex = -1;

  // ---- layout ----
  const scoreHeader = el('div', { class: 'gpp-score-header' });
  const titles = el('div', { class: 'gpp-score-header-titles' });
  const scoreTitle = el('div', { class: 'gpp-score-title', text: hideTitle ? '' : title, title: fileName || title });
  const scoreTrack = el('div', { class: 'gpp-score-track', text: '' });
  titles.append(scoreTitle, scoreTrack);

  const scoreActions = el('div', { class: 'gpp-score-actions' });
  if (typeof onOpenFile === 'function') {
    const openBtn = el('button', {
      class: 'gpp-icon-btn has-label',
      type: 'button',
      'aria-label': 'Open Guitar Pro file',
      title: 'Open Guitar Pro file',
      html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M12 10v6"/><path d="M9 13h6"/></svg><span class="gpp-btn-label">Open</span>',
      onClick: () => onOpenFile(),
    });
    scoreActions.appendChild(openBtn);
  }
  const analyzeBtn = el('button', {
    class: 'gpp-icon-btn has-label',
    type: 'button',
    'aria-label': 'Analyze score',
    title: 'Analyze score',
    html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg><span class="gpp-btn-label">Analyze</span>',
  });
  const mixerBtn = el('button', {
    class: 'gpp-icon-btn has-label',
    type: 'button',
    'aria-label': 'Track mixer',
    title: 'Track mixer',
    html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h14"/></svg><span class="gpp-btn-label">Tracks</span>',
  });
  const notesBtn = el('button', {
    class: 'gpp-icon-btn has-label',
    type: 'button',
    'aria-label': 'Section notes',
    title: 'Section notes',
    html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 6h10M8 12h10M8 18h6"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></svg><span class="gpp-btn-label">Notes</span>',
  });
  const settingsBtn = el('button', {
    class: 'gpp-icon-btn has-label',
    type: 'button',
    'aria-label': 'Practice settings',
    title: 'Practice settings',
    html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg><span class="gpp-btn-label">Settings</span>',
  });
  scoreActions.append(analyzeBtn, notesBtn, mixerBtn, settingsBtn);
  if (headerExtra) scoreActions.appendChild(headerExtra);
  scoreHeader.append(titles, scoreActions);

  const scoreBody = el('div', { class: 'gpp-score-body' });
  const measureNavHost = el('div', { class: 'gpp-measure-nav-host' });
  const parchmentHost = el('div', { class: 'gpp-parchment-host' });
  scoreBody.append(measureNavHost, parchmentHost);

  const stagePane = el('div', { class: 'gpp-stage-pane' });
  const transportHost = el('div');
  const drawerRoot = el('div', { class: 'gpp-drawer-root' });
  const tracksDrawerRoot = el('div', { class: 'gpp-drawer-root gpp-tracks-drawer-root' });
  const annoDrawerRoot = el('div', { class: 'gpp-drawer-root gpp-anno-drawer-root' });
  const tracksMixerHost = el('div', { class: 'gpp-tracks-drawer-mount' });

  stagePane.append(scoreBody, transportHost, drawerRoot, tracksDrawerRoot, annoDrawerRoot);

  const chrome = el('div', { class: 'gpp-chrome' });
  chrome.append(scoreHeader, stagePane);

  const analysisDetails = el('details', { class: 'gpp-analysis' });
  const analysisResultsEl = el('div', {
    class: 'gpp-analysis-results ta-results',
    html: '<div class="quiz-card"><p class="ta-muted">Click Analyze for key, chord, scale, and technique breakdown.</p></div>',
  });
  analysisDetails.append(
    el('summary', { class: 'gpp-analysis-summary', text: 'Analysis' }),
    analysisResultsEl,
  );

  host.append(chrome, analysisDetails);

  const uidPrefix = uid('gpp');

  // ---- sub-mounts (wired after player helpers) ----
  let parchment = null;
  let measureNav = null;
  let transport = null;
  let trackMixer = null;
  let settingsDrawer = null;
  let tracksDrawer = null;
  let annoDrawer = null;
  let loopController = null;
  let annotateMode = false;
  let draftSel = null;
  let selectedAnnoId = null;

  function currentTrackLabel() {
    if (state.viewKind === 'drum') {
      const t = state.gp.drumTracks?.[state.viewIndex];
      return t ? `🥁 ${t.name}` : 'Drums';
    }
    const t = state.gp.tracks?.[state.viewIndex];
    return t ? `🎸 ${t.name}` : 'Track';
  }

  function emitPracticeSettings() {
    if (!isAlive()) return;
    if (typeof onPracticeSettingsChange !== 'function') return;
    onPracticeSettingsChange(stateController.toPersistable());
  }

  function buildGuitarModels() {
    return state.gp.tracks.map((t, i) => {
      if (i === state.trackIndex && state.viewModel?.strings) return state.viewModel;
      return t.model;
    });
  }

  function parchmentModels() {
    const guitar = state.viewKind === 'guitar' ? state.viewModel : null;
    const perc = state.viewKind === 'drum'
      ? state.viewModel
      : (state.gp.drumTracks?.[0]?.model || null);
    return { guitar, perc };
  }

  function mixLoadBase() {
    const { enabledGuitars, enabledDrums } = stateController.getEffectiveEnabled();
    return {
      guitarModels: buildGuitarModels(),
      drumModels: (state.gp.drumTracks || []).map((d) => d.model),
      bpm: state.bpm,
      loopRestSec: state.loopRestSec,
      enabledGuitars,
      enabledDrums,
      metronomeEnabled: !!state.metronomeEnabled,
      referenceModel: state.viewModel || state.gp.drumTracks?.[0]?.model || null,
    };
  }

  const player = createGpMixPlayer({
    onTick: (info) => {
      if (!isAlive()) return;
      syncPlaybackUi(info);
    },
  });

  function withPreservedPosition(fn) {
    const was = player.playing;
    const at = player.currentSec;
    const beat = (at / 60) * state.bpm;
    fn();
    const newSec = quartersToSeconds(beat, state.bpm);
    if (was) player.play({ fromSec: newSec });
    else player.seek(newSec);
  }

  function applyLoopToPlayer() {
    const model = state.viewModel;
    if (!model) return;
    const beatLoop = state.loopEnabled
      && modelHasRhythm(model)
      && state.loopStartBeat != null
      && state.loopEndBeat != null;
    if (beatLoop) {
      const startSec = quartersToSeconds(state.loopStartBeat, state.bpm);
      const endSec = quartersToSeconds(state.loopEndBeat, state.bpm);
      if (endSec > startSec) {
        player.setLoop({ startSec, endSec, restSec: state.loopRestSec });
      }
    } else if (!state.loopEnabled) {
      player.setLoop(null);
    }
    if (state.metronomeEnabled) player.setMetronomeEnabled(true);
  }

  function reloadModel() {
    if (!isAlive()) return;
    stateController.applyTransforms();
    if (!state.bpmUserOverride) state.bpm = state.scoreBpm;
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
    const beat = (at / 60) * state.bpm;
    player.load(loadOpts);
    applyLoopToPlayer();
    const newSec = quartersToSeconds(beat, state.bpm);
    if (was) player.play({ fromSec: newSec });
    else player.seek(newSec);

    refreshScoreSurface();
    emitPracticeSettings();
  }

  function refreshScoreSurface() {
    if (!isAlive()) return;
    const model = state.viewModel;
    const { guitar, perc } = parchmentModels();
    parchment?.setModel(guitar, perc);
    parchment?.setZoom(state.parchmentZoom);
  }

  function refreshAnnotations() {
    const list = scoreKey ? listAnnotations(scoreKey) : [];
    parchment?.setAnnotations(list);
    annoDrawer?.sync();
  }

  function exitAnnotateMode({ keepDrawerAnnotateBtn = false } = {}) {
    if (!annotateMode && !draftSel) {
      if (!keepDrawerAnnotateBtn) annoDrawer?.setAnnotateMode(false);
      notesBtn.classList.remove('is-on');
      return;
    }
    annotateMode = false;
    draftSel = null;
    notesBtn.classList.remove('is-on');
    if (!keepDrawerAnnotateBtn) annoDrawer?.setAnnotateMode(false);
    parchment?.setSelectionKind('loop');
    if (state.loopSelectMode) {
      loopController?.enable();
      parchment?.setLoopSelectMode(true);
    } else {
      parchment?.setSelectMode(false);
      loopController?.syncFromState();
    }
  }

  function enterAnnotateMode() {
    if (!scoreKey) return;
    if (state.loopSelectMode) {
      state.loopSelectMode = false;
      loopController?.disable();
      settingsDrawer?.sync();
    }
    annotateMode = true;
    draftSel = null;
    selectedAnnoId = null;
    parchment?.setSelectedAnnotation(null);
    parchment?.setSelectionKind('annotate');
    parchment?.setSelectMode(true);
    parchment?.setSelection(null);
    notesBtn.classList.add('is-on');
    annoDrawer?.setAnnotateMode(true);
  }

  function parchmentSelection() {
    if (annotateMode && draftSel) {
      return { startBeat: draftSel.startBeat, endBeat: draftSel.endBeat };
    }
    if (state.loopEnabled && state.loopStartBeat != null && state.loopEndBeat != null) {
      return { startBeat: state.loopStartBeat, endBeat: state.loopEndBeat };
    }
    return null;
  }

  function syncPlaybackUi({
    playing = false,
    currentSec = 0,
    durationSec: dur = 0,
    measureIndex = 0,
    resting = false,
    restRemaining = 0,
  } = {}) {
    scoreTrack.textContent = currentTrackLabel();
    parchment?.update({
      currentSec,
      bpm: state.bpm,
      playing: playing && !resting,
      measureIndex,
      selection: parchmentSelection(),
      loopSelectMode: annotateMode || state.loopSelectMode,
      selectionKind: annotateMode ? 'annotate' : 'loop',
      zoom: state.parchmentZoom,
      autoFollow: state.autoFollow,
    });
    measureNav?.update({
      measureIndex,
      navBar: state.navBar,
      loopEnabled: state.loopEnabled,
      loopStart: state.loopStart,
      loopEnd: state.loopEnd,
    });
    transport?.sync();
  }

  function navMeasureIndex() {
    const scope = stateController.getScope();
    return state.navBar == null ? scope.start : state.navBar;
  }

  function seekToBar(barIndex, { autoplay = false } = {}) {
    const measures = state.viewModel?.measures || [];
    if (!measures.length) return;
    const scope = stateController.getScope();
    const i = Math.max(scope.start, Math.min(scope.end, barIndex));
    state.navBar = i;
    const beats = beatsFromMeasureRange(measures, i, i);
    const startSec = quartersToSeconds(beats.startBeat, state.bpm);
    if (autoplay || player.playing) player.play({ fromSec: startSec });
    else player.seek(startSec);
    syncPlaybackUi({
      playing: player.playing,
      currentSec: startSec,
      durationSec: player.durationSec,
      measureIndex: i,
    });
  }

  function onSettingsChange(patch = {}) {
    if (!isAlive()) return;
    if (patch.reload) reloadModel();
    else if (patch.loopRest) {
      player.setLoopRestSec(state.loopRestSec);
      applyLoopToPlayer();
    } else if (patch.metronome) {
      player.setMetronomeEnabled(state.metronomeEnabled);
    } else if (patch.zoom || patch.autoFollow || patch.loopSelectMode) {
      if (patch.loopSelectMode) {
        if (state.loopSelectMode) exitAnnotateMode();
        if (state.loopSelectMode) loopController?.enable();
        else loopController?.disable();
      }
      loopController?.syncFromState();
      parchment?.update({
        loopSelectMode: annotateMode || state.loopSelectMode,
        selectionKind: annotateMode ? 'annotate' : 'loop',
        selection: parchmentSelection(),
        zoom: state.parchmentZoom,
        autoFollow: state.autoFollow,
      });
    }
    settingsDrawer?.sync();
    trackMixer?.sync();
    emitPracticeSettings();
  }

  function runAnalysis(resultsEl) {
    if (!resultsEl) return;
    if (state.viewKind !== 'guitar' || !state.viewModel?.strings) {
      resultsEl.innerHTML = '<div class="quiz-card"><p class="ta-muted">Switch to a guitar or bass track to analyze. Drum parts can\u2019t be analyzed as tab.</p></div>';
      if (typeof onAnalyze === 'function') onAnalyze({ gp: state.gp, trackIndex: state.trackIndex, model: null, report: null });
      return;
    }
    const model = state.viewModel;
    const pitched = (model.events || []).filter((e) => e.midi != null);
    if (!pitched.length) {
      resultsEl.innerHTML = '<div class="quiz-card"><p class="ta-muted">No pitched notes to analyze on this track.</p></div>';
      if (typeof onAnalyze === 'function') onAnalyze({ gp: state.gp, trackIndex: state.trackIndex, model, report: null });
      return;
    }
    const report = analyzeModel(model);
    renderAnalysisReport(resultsEl, { model, report }, { showPlayback: false });
    if (typeof onAnalyze === 'function') onAnalyze({ gp: state.gp, trackIndex: state.trackIndex, model, report });
  }

  function setViewTrack(kind, index) {
    if (!isAlive()) return;
    withPreservedPosition(() => {
      stateController.setViewTrack(kind, index);
      stateController.applyTransforms();
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
      player.load(loadOpts);
      applyLoopToPlayer();
    });
    refreshScoreSurface();
    const measures = state.viewModel?.measures || [];
    measureNav?.setMeasureCount(
      measures.length,
      measures.map((m) => m.marker || null),
    );
    settingsDrawer?.sync();
    trackMixer?.sync();
    loopController?.syncFromState();
    emitPracticeSettings();
  }

  function onLoopChanged() {
    if (!isAlive()) return;
    if (state.loopStartBeat != null && state.loopEndBeat != null) {
      stateController.setLoopRange(state.loopStartBeat, state.loopEndBeat);
      state.loopEnabled = true;
    }
    reloadModel();
    settingsDrawer?.sync();
  }

  // ---- mount UI modules ----
  const { guitar, perc } = parchmentModels();
  parchment = mountParchmentView(parchmentHost, {
    guitarModel: guitar,
    percModel: perc,
    zoom: state.parchmentZoom,
    autoFollow: state.autoFollow,
    loopSelectMode: state.loopSelectMode,
    selectionKind: 'loop',
    selection: state.loopEnabled
      ? { startBeat: state.loopStartBeat, endBeat: state.loopEndBeat }
      : null,
    annotations: scoreKey ? listAnnotations(scoreKey) : [],
    onMeasureClick: (mi) => seekToBar(mi, { autoplay: player.playing }),
    onSelectionChange: (sel) => {
      if (annotateMode) {
        if (!sel) return;
        const measures = state.viewModel?.measures || [];
        const { startIdx, endIdx } = measureIndicesForBeats(measures, sel.startBeat, sel.endBeat);
        draftSel = {
          startBeat: sel.startBeat,
          endBeat: sel.endBeat,
          measureStart: startIdx,
          measureEnd: endIdx,
        };
        parchment?.setSelection({ startBeat: sel.startBeat, endBeat: sel.endBeat });
        annoDrawer?.showEditor(draftSel);
        return;
      }
      loopController?.handleSelectionChange(sel);
    },
    onAnnotationClick: (anno) => {
      if (!anno?.id) return;
      selectedAnnoId = anno.id;
      parchment?.setSelectedAnnotation(anno.id);
      parchment?.setSelection({ startBeat: anno.startBeat, endBeat: anno.endBeat });
      if (!annoDrawer?.isOpen?.()) annoDrawer?.open();
      annoDrawer?.showEditor(anno);
    },
  });

  loopController = createLoopSelectionController({
    getState: () => state,
    applyRange: (startBeat, endBeat) => {
      if (stateController.setLoopRange(startBeat, endBeat)) {
        state.loopEnabled = true;
      }
    },
    clearRange: () => stateController.clearLoop(),
    setSelectMode: (on) => { state.loopSelectMode = !!on; },
    parchment,
    onLoopChanged,
  });

  const measures = state.viewModel?.measures || [];
  measureNav = mountMeasureNav(measureNavHost, {
    measureCount: measures.length,
    markers: measures.map((m) => m.marker || null),
    onSeek: (i) => seekToBar(i, { autoplay: player.playing }),
  });

  transport = mountTransportDock(transportHost, {
    onPrev: () => {
      const scope = stateController.getScope();
      const cur = navMeasureIndex();
      if (canPrevMeasure(cur, scope)) seekToBar(cur - 1, { autoplay: player.playing });
    },
    onNext: () => {
      const scope = stateController.getScope();
      const cur = navMeasureIndex();
      if (canNextMeasure(cur, scope)) seekToBar(cur + 1, { autoplay: player.playing });
    },
    onPlayPause: () => togglePlayPause(),
    onStop: () => stopPlayback(),
    onRestart: () => restartPlayback(),
    getPlaying: () => player.playing,
    getMeasureLabel: () => {
      const total = state.viewModel?.measures?.length || 0;
      const cur = player.measureIndex;
      const m = Math.min(total, (cur || 0) + 1);
      return total ? `Measure ${m} of ${total}` : '';
    },
    getTimeLabel: () => {
      const restTxt = player.playing && player.currentSec ? '' : '';
      void restTxt;
      return `${fmtTime(player.currentSec)} / ${fmtTime(player.durationSec)}`;
    },
    getLoopStatus: () => {
      if (!state.loopEnabled) return '';
      return `Loop ${state.loopStart + 1}–${state.loopEnd + 1}`;
    },
    canPrev: () => canPrevMeasure(navMeasureIndex(), stateController.getScope()),
    canNext: () => canNextMeasure(navMeasureIndex(), stateController.getScope()),
  });

  tracksDrawer = mountTracksDrawerShell(tracksDrawerRoot, {
    title: 'Tracks',
    bodyEl: tracksMixerHost,
  });

  try {
    trackMixer = mountTrackMixer(tracksMixerHost, {
      stateController,
      onChange: () => {
        withPreservedPosition(() => {
          const { enabledGuitars, enabledDrums } = stateController.getEffectiveEnabled();
          enabledGuitars.forEach((on, i) => player.setTrackEnabled('guitar', i, on));
          enabledDrums.forEach((on, i) => player.setTrackEnabled('drum', i, on));
        });
        emitPracticeSettings();
      },
      onViewTrack: (kind, index) => setViewTrack(kind, index),
    });
  } catch (e) {
    console.error(e);
  }

  try {
    settingsDrawer = mountSettingsDrawer(drawerRoot, {
      stateController,
      uidPrefix,
      onChange: onSettingsChange,
    });
  } catch (e) {
    console.error(e);
  }

  try {
    annoDrawer = mountAnnotationsDrawer(annoDrawerRoot, {
      getScoreKey: () => scoreKey,
      getAnnotations: () => (scoreKey ? listAnnotations(scoreKey) : []),
      onStartAnnotate: () => enterAnnotateMode(),
      onCancelAnnotate: () => {
        exitAnnotateMode();
        selectedAnnoId = null;
        parchment?.setSelectedAnnotation(null);
        syncPlaybackUi({
          playing: player.playing,
          currentSec: player.currentSec,
          durationSec: player.durationSec,
          measureIndex: player.measureIndex,
        });
      },
      onSave: (payload) => {
        if (!scoreKey) return;
        const measures = state.viewModel?.measures || [];
        let measureStart = payload.measureStart;
        let measureEnd = payload.measureEnd;
        if (measureStart == null || measureEnd == null) {
          const idx = measureIndicesForBeats(measures, payload.startBeat, payload.endBeat);
          measureStart = idx.startIdx;
          measureEnd = idx.endIdx;
        }
        const fields = {
          startBeat: payload.startBeat,
          endBeat: payload.endBeat,
          measureStart,
          measureEnd,
          title: payload.title,
          text: payload.text,
        };
        let saved;
        if (payload.id) {
          saved = updateAnnotation(scoreKey, payload.id, fields);
        } else {
          saved = addAnnotation(scoreKey, fields);
        }
        if (saved) selectedAnnoId = saved.id;
        exitAnnotateMode({ keepDrawerAnnotateBtn: true });
        annoDrawer?.setAnnotateMode(false);
        refreshAnnotations();
        parchment?.setSelectedAnnotation(selectedAnnoId);
        syncPlaybackUi({
          playing: player.playing,
          currentSec: player.currentSec,
          durationSec: player.durationSec,
          measureIndex: player.measureIndex,
        });
      },
      onDelete: (id) => {
        if (!scoreKey || !id) return;
        removeAnnotation(scoreKey, id);
        if (selectedAnnoId === id) selectedAnnoId = null;
        exitAnnotateMode({ keepDrawerAnnotateBtn: true });
        annoDrawer?.setAnnotateMode(false);
        parchment?.setSelectedAnnotation(null);
        refreshAnnotations();
        syncPlaybackUi({
          playing: player.playing,
          currentSec: player.currentSec,
          durationSec: player.durationSec,
          measureIndex: player.measureIndex,
        });
      },
      onSelect: (anno) => {
        selectedAnnoId = anno?.id ?? null;
        parchment?.setSelectedAnnotation(selectedAnnoId);
        if (anno) {
          parchment?.setSelection({ startBeat: anno.startBeat, endBeat: anno.endBeat });
        } else if (!annotateMode) {
          loopController?.syncFromState();
        }
      },
      uidPrefix: `${uidPrefix}-anno`,
    });
  } catch (e) {
    console.error(e);
  }

  refreshAnnotations();

  analyzeBtn.addEventListener('click', () => {
    analysisDetails.open = true;
    runAnalysis(analysisResultsEl);
    if (settingsDrawer?.isOpen?.()) settingsDrawer.close();
    if (annoDrawer?.isOpen?.()) annoDrawer.close();
  });

  notesBtn.addEventListener('click', () => {
    if (settingsDrawer?.isOpen?.()) settingsDrawer.close();
    if (tracksDrawer?.isOpen?.()) tracksDrawer.close();
    annoDrawer?.toggle();
  });

  mixerBtn.addEventListener('click', () => {
    if (settingsDrawer?.isOpen?.()) settingsDrawer.close();
    if (annoDrawer?.isOpen?.()) annoDrawer.close();
    tracksDrawer.toggle();
  });
  settingsBtn.addEventListener('click', () => {
    if (tracksDrawer?.isOpen?.()) tracksDrawer.close();
    if (annoDrawer?.isOpen?.()) annoDrawer.close();
    settingsDrawer?.toggle();
  });

  function clearCountIn() {
    if (countInTimer != null) {
      clearTimeout(countInTimer);
      countInTimer = null;
    }
  }

  function startPlayFromNav() {
    const measures = state.viewModel?.measures || [];
    const scope = stateController.getScope();
    const navIdx = state.navBar == null ? scope.start : state.navBar;
    state.navBar = navIdx;
    const beats = beatsFromMeasureRange(measures, navIdx, navIdx);
    const startSec = quartersToSeconds(beats.startBeat, state.bpm);
    ensureAudio();
    player.setMetronomeEnabled(!!state.metronomeEnabled);
    player.play({ fromSec: startSec });
  }

  function countInBeats() {
    const measures = state.viewModel?.measures || [];
    const navIdx = navMeasureIndex();
    const m = measures[navIdx];
    if (m?.timeSig) {
      return m.timeSig[0] * (4 / (m.timeSig[1] || 4));
    }
    if (m && Number.isFinite(m.startBeat) && Number.isFinite(m.endBeat)) {
      const span = m.endBeat - m.startBeat;
      if (span > 0) return span;
    }
    return 4;
  }

  function togglePlayPause() {
    if (!isAlive()) return;
    if (player.playing) {
      clearCountIn();
      player.pause();
      transport?.sync();
      return;
    }
    if (player.paused) {
      ensureAudio();
      player.play();
      transport?.sync();
      return;
    }
    if (state.countInEnabled) {
      ensureAudio();
      const quarterSec = 60 / state.bpm;
      const beats = countInBeats();
      const prevMetro = state.metronomeEnabled;
      player.setMetronomeEnabled(true);
      const now = audioCtx.currentTime;
      for (let i = 0; i < beats; i++) {
        scheduleMetronomeClick(now + 0.06 + i * quarterSec, i === 0);
      }
      countInTimer = setTimeout(() => {
        countInTimer = null;
        if (!isAlive()) return;
        if (!prevMetro) player.setMetronomeEnabled(false);
        startPlayFromNav();
      }, quarterSec * beats * 1000 + 40);
      return;
    }
    startPlayFromNav();
  }

  function stopPlayback() {
    if (!isAlive()) return;
    clearCountIn();
    const measures = state.viewModel?.measures || [];
    const navIdx = navMeasureIndex();
    const beats = beatsFromMeasureRange(measures, navIdx, navIdx);
    const startSec = quartersToSeconds(beats.startBeat, state.bpm);
    player.stop();
    player.seek(startSec);
    transport?.sync();
  }

  function restartPlayback() {
    if (!isAlive()) return;
    clearCountIn();
    const measures = state.viewModel?.measures || [];
    const target = restartTarget({
      loopEnabled: state.loopEnabled,
      loopStart: state.loopStart,
      exerciseScope: state.exerciseScope,
      measureCount: measures.length || 1,
    });
    state.navBar = target;
    seekToBar(target, { autoplay: player.playing });
  }

  keyHandler = (e) => {
    if (!isAlive()) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const section = host.closest('.section.active');
    if (!section && !host.contains(document.activeElement)) return;
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlayPause();
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      transport && transport.sync();
      const scope = stateController.getScope();
      const cur = navMeasureIndex();
      if (canPrevMeasure(cur, scope)) seekToBar(cur - 1, { autoplay: player.playing });
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      const scope = stateController.getScope();
      const cur = navMeasureIndex();
      if (canNextMeasure(cur, scope)) seekToBar(cur + 1, { autoplay: player.playing });
    }
  };
  host.addEventListener('keydown', keyHandler);

  // Initial load
  host.classList.remove('is-loading');
  reloadModel();
  scoreTrack.textContent = currentTrackLabel();
  loopController.syncFromState();

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
      if (!alive) return;
      alive = false;
      clearCountIn();
      stateController.destroy();
      player.stop();
      parchment?.destroy();
      measureNav?.destroy();
      transport?.destroy();
      trackMixer?.destroy();
      settingsDrawer?.destroy();
      annoDrawer?.destroy();
      tracksDrawer?.destroy();
      if (keyHandler) host.removeEventListener('keydown', keyHandler);
      host.innerHTML = '';
      host.classList.remove('gpp-root', 'is-loading');
    },
  };
}

/** Lightweight drawer shell for the track mixer (desktop drawer / mobile sheet). */
function mountTracksDrawerShell(host, { title = 'Tracks', bodyEl } = {}) {
  const backdrop = el('div', { class: 'gpp-drawer-backdrop', 'aria-hidden': 'true' });
  const drawer = el('div', { class: 'gpp-drawer', role: 'dialog', 'aria-label': title });
  const sheet = el('div', { class: 'gpp-sheet', role: 'dialog', 'aria-label': title });
  sheet.appendChild(el('div', { class: 'gpp-sheet-handle' }));

  let openState = false;
  let sheetMode = false;

  function close() {
    openState = false;
    paintOpen();
  }

  function makeHead() {
    return el('div', { class: 'gpp-drawer-head' }, [
      el('span', { class: 'gpp-drawer-title', text: title }),
      el('button', {
        class: 'gpp-icon-btn gpp-drawer-close',
        type: 'button',
        text: '✕',
        'aria-label': 'Close',
        onClick: () => close(),
      }),
    ]);
  }

  const drawerBody = el('div', { class: 'gpp-drawer-body gpp-tracks-drawer-body' });
  const sheetBody = el('div', { class: 'gpp-drawer-body gpp-tracks-drawer-body' });
  if (bodyEl) drawerBody.appendChild(bodyEl);

  drawer.append(makeHead(), drawerBody);
  sheet.append(makeHead(), sheetBody);
  host.append(backdrop, drawer, sheet);

  function detectSheetMode() {
    sheetMode = window.matchMedia('(max-width: 768px)').matches;
  }

  function placeBody() {
    if (!bodyEl) return;
    const target = sheetMode ? sheetBody : drawerBody;
    if (bodyEl.parentElement !== target) target.appendChild(bodyEl);
  }

  function paintOpen() {
    detectSheetMode();
    placeBody();
    backdrop.classList.toggle('is-open', openState);
    drawer.classList.toggle('is-open', openState && !sheetMode);
    sheet.classList.toggle('is-open', openState && sheetMode);
    backdrop.setAttribute('aria-hidden', openState ? 'false' : 'true');
  }

  function open() { openState = true; paintOpen(); }
  function toggle() { if (openState) close(); else open(); }

  backdrop.addEventListener('click', () => close());
  const mq = window.matchMedia('(max-width: 768px)');
  mq.addEventListener?.('change', () => { if (openState) paintOpen(); });

  return {
    open, close, toggle,
    destroy() {
      mq.removeEventListener?.('change', () => {});
      host.innerHTML = '';
    },
    isOpen: () => openState,
  };
}

export { isGuitarProName, parseGuitarPro };

/** Parse bytes and mount player — convenience for callers. */
export async function openGpPlayerFromBytes(host, bytes, options = {}) {
  const gp = await parseGuitarPro(bytes);
  return mountGpPlayer(host, { ...options, gpResult: gp });
}
