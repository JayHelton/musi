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
import { createPlayerState, resolveInitialBpm } from './gpPlayer/playerState.js';
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
import { clampBpm } from './gpPlayer/tempoRange.js';
import { mountTrackMixer } from './gpPlayer/trackMixer.js';
import { mountSettingsDrawer } from './gpPlayer/settingsDrawer.js';
import { mountAnnotationsDrawer } from './gpPlayer/annotationsDrawer.js';
import { buildMeasureDigests } from './gpPlayer/measureDigest.js';
import { mountExerciseImportPanel } from './gpPlayer/exerciseImportPanel.js';
import {
  GPP_VIEW_MODES,
  loadViewMode,
  persistViewMode,
  viewModeNeedsAnalysis,
  applyViewModeClasses,
} from './gpPlayer/viewModes.js';
import { installGppLayoutMetrics } from './gpPlayer/layoutMetrics.js';
import {
  listAnnotations,
  addAnnotation,
  updateAnnotation,
  removeAnnotation,
} from './gpAnnotations.js';

let mountGeneration = 0;

/**
 * Mount a practice player into `host`.
 * @returns {{
 *   destroy:()=>void,
 *   player:object,
 *   getState:()=>object,
 *   isLoopEnabled:()=>boolean,
 *   setLoopEnabled:(on:boolean)=>void,
 *   play:()=>void,
 *   stop:()=>void,
 *   togglePlayPause:()=>void,
 *   stepBpm:(delta:number)=>void,
 * }}
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
  onPlaybackEnd = null,
  autoPlay = false,
  exerciseScope = false,
  initialBpm = null,
  onOpenFile = null,
  initialTranspose = null,
  initialTuning = null,
  initialRetuneMode = null,
  disabled = false,
  scoreKey = '',
  exerciseImport = null,
  enableHostKeyboard = true,
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

  const resolvedBpm = resolveInitialBpm(initialBpm, state.scoreBpm);
  if (resolvedBpm.apply) {
    state.bpm = resolvedBpm.bpm;
    state.bpmUserOverride = resolvedBpm.bpmUserOverride;
  }

  let countInTimer = null;
  let autoPlayTimer = null;
  let keyHandler = null;

  host.innerHTML = '';
  host.classList.add('gpp-root');
  const standaloneSection = host.closest('#sec-gpplayer');
  if (standaloneSection) standaloneSection.classList.add('gpp-score-loaded');
  if (disabled) host.classList.add('is-loading');
  host.tabIndex = -1;

  // ---- layout ----
  const scoreHeader = el('div', { class: 'gpp-score-header' });
  const titles = el('div', { class: 'gpp-score-header-titles' });
  const scoreTitle = el('div', { class: 'gpp-score-title', text: hideTitle ? '' : title, title: fileName || title });
  const scoreTrack = el('div', { class: 'gpp-score-track', text: '' });
  titles.append(scoreTitle, scoreTrack);

  const viewPicker = el('div', {
    class: 'gpp-view-picker',
    role: 'radiogroup',
    'aria-label': 'Player view',
  });
  const viewBtns = {};
  GPP_VIEW_MODES.forEach((mode) => {
    const label = mode === 'score' ? 'Score' : mode === 'analyze' ? 'Analyze' : 'Both';
    const btn = el('button', {
      class: 'gpp-view-btn',
      type: 'button',
      role: 'radio',
      'aria-checked': 'false',
      'aria-label': `${label} view`,
      text: label,
      'data-view': mode,
    });
    viewBtns[mode] = btn;
    viewPicker.appendChild(btn);
  });

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
  const exerciseImportCapable = exerciseImport && typeof exerciseImport.importSegments === 'function';
  const splitBtn = exerciseImportCapable ? el('button', {
    class: 'gpp-icon-btn has-label',
    type: 'button',
    'aria-label': 'Split score into exercises',
    title: 'Split score into exercises',
    html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.5 8.5L20 20"/><path d="M8.5 15.5L20 4"/></svg><span class="gpp-btn-label">Split</span>',
  }) : null;
  const settingsBtn = el('button', {
    class: 'gpp-icon-btn has-label',
    type: 'button',
    'aria-label': 'Practice settings',
    title: 'Practice settings',
    html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg><span class="gpp-btn-label">Settings</span>',
  });
  if (splitBtn) scoreActions.append(notesBtn, splitBtn, mixerBtn, settingsBtn);
  else scoreActions.append(notesBtn, mixerBtn, settingsBtn);
  if (headerExtra) scoreActions.appendChild(headerExtra);
  scoreHeader.append(titles, viewPicker, scoreActions);

  const scoreBody = el('div', { class: 'gpp-score-body' });
  const measureNavHost = el('div', { class: 'gpp-measure-nav-host' });
  const parchmentHost = el('div', { class: 'gpp-parchment-host' });
  scoreBody.append(measureNavHost, parchmentHost);

  const scorePane = el('div', { class: 'gpp-score-pane' });
  const drawerRoot = el('div', { class: 'gpp-drawer-root' });
  const tracksDrawerRoot = el('div', { class: 'gpp-drawer-root gpp-tracks-drawer-root' });
  const annoDrawerRoot = el('div', { class: 'gpp-drawer-root gpp-anno-drawer-root' });
  const tracksMixerHost = el('div', { class: 'gpp-tracks-drawer-mount' });
  scorePane.append(scoreBody, drawerRoot, tracksDrawerRoot, annoDrawerRoot);

  const analysisResultsEl = el('div', {
    class: 'gpp-analysis-results ta-results',
    html: '<div class="quiz-card"><p class="ta-muted">Switch to Analyze or Both to see key, chord, scale, and technique breakdown.</p></div>',
  });
  const rerunAnalysisBtn = el('button', {
    class: 'btn sm gpp-analysis-rerun',
    type: 'button',
    text: 'Re-run analysis',
    'aria-label': 'Re-run analysis for the current track',
    title: 'Re-run analysis for the current track',
  });
  const analysisToolbar = el('div', { class: 'gpp-analysis-toolbar' }, [rerunAnalysisBtn]);
  const analysisPane = el('div', { class: 'gpp-analysis-pane' }, [analysisToolbar, analysisResultsEl]);

  const stageContent = el('div', { class: 'gpp-stage-content' }, [scorePane, analysisPane]);

  const stagePane = el('div', { class: 'gpp-stage-pane' });
  const transportHost = el('div', { class: 'gpp-transport-anchor' });
  scorePane.appendChild(transportHost);
  stagePane.append(stageContent);

  const chrome = el('div', { class: 'gpp-chrome' });
  chrome.append(scoreHeader, stagePane);

  const exerciseImportRoot = exerciseImportCapable ? el('div', { class: 'gpi-mount' }) : null;
  host.append(chrome);
  if (exerciseImportRoot) document.body.appendChild(exerciseImportRoot);

  const uidPrefix = uid('gpp');

  // ---- sub-mounts (wired after player helpers) ----
  let parchment = null;
  let measureNav = null;
  let transport = null;
  let trackMixer = null;
  let settingsDrawer = null;
  let tracksDrawer = null;
  let annoDrawer = null;
  let importPanel = null;
  let loopSnapshot = null;
  let externalLoopSnapshot = null;
  let loopController = null;
  let layoutMetrics = null;
  let viewMode = loadViewMode();
  let analysisTrackKey = '';
  let noteDraftSelection = null;
  let highlightedAnnoId = null;
  let noteSelectActive = false;

  function trackAnalysisKey() {
    return `${state.viewKind}:${state.viewIndex}`;
  }

  function syncViewPicker() {
    GPP_VIEW_MODES.forEach((mode) => {
      const btn = viewBtns[mode];
      if (!btn) return;
      const on = viewMode === mode;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
      btn.tabIndex = on ? 0 : -1;
    });
  }

  function maybeRunAnalysis({ force = false } = {}) {
    if (!viewModeNeedsAnalysis(viewMode)) return;
    const key = trackAnalysisKey();
    if (!force && key === analysisTrackKey) return;
    analysisTrackKey = key;
    runAnalysis(analysisResultsEl);
  }

  function placeTransport() {
    const target = viewMode === 'analyze' ? analysisPane : scorePane;
    if (transportHost.parentElement !== target) target.appendChild(transportHost);
    transport?.publishPad?.();
  }

  function setViewMode(mode, { runAnalysis: shouldAnalyze = true } = {}) {
    if (!GPP_VIEW_MODES.includes(mode)) mode = 'score';
    if (viewMode === mode && !shouldAnalyze) {
      syncViewPicker();
      return;
    }
    viewMode = mode;
    persistViewMode(mode);
    applyViewModeClasses(host, mode);
    syncViewPicker();
    placeTransport();
    if (shouldAnalyze && viewModeNeedsAnalysis(mode)) maybeRunAnalysis({ force: true });
    requestAnimationFrame(() => {
      refreshScoreSurface();
      layoutMetrics?.refresh();
      transport?.publishPad?.();
    });
  }

  applyViewModeClasses(host, viewMode);
  syncViewPicker();
  placeTransport();

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

  function hasBeatLoop() {
    const model = state.viewModel;
    if (!state.loopEnabled || !model || !modelHasRhythm(model)) return false;
    const start = state.loopStartBeat;
    const end = state.loopEndBeat;
    return Number.isFinite(start) && Number.isFinite(end) && end > start;
  }

  let prevPlaybackTick = null;
  let playbackEndFired = false;
  let lastUserStopAt = 0;
  const PLAYBACK_END_EPSILON = 0.4;
  const USER_STOP_SUPPRESS_MS = 300;

  const player = createGpMixPlayer({
    onTick: (info) => {
      if (!isAlive()) return;
      detectNaturalPlaybackEnd(info);
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
    // A fresh mount has no position to keep, and seeking to zero would override
    // the loop start the player just picked for itself.
    else if (at > 0) player.seek(newSec);
  }

  function applyLoopToPlayer() {
    const model = state.viewModel;
    if (!model) return;
    const beatLoop = hasBeatLoop();
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

    const beatLoop = hasBeatLoop();
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
    // A fresh mount has no position to keep, and seeking to zero would override
    // the loop start load() just picked.
    else if (at > 0) player.seek(newSec);

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
    annoDrawer?.sync();
    syncPlaybackUi({
      playing: player.playing,
      currentSec: player.currentSec,
      durationSec: player.durationSec,
      measureIndex: player.measureIndex,
    });
  }

  function measureSelectionFromIndices(measureStart, measureEnd) {
    const measures = state.viewModel?.measures || [];
    const beats = beatsFromMeasureRange(measures, measureStart, measureEnd);
    return {
      startBeat: beats.startBeat,
      endBeat: beats.endBeat,
      measureStart,
      measureEnd,
    };
  }

  function openNoteEditorForMeasure(mi) {
    if (!scoreKey) return;
    const sel = measureSelectionFromIndices(mi, mi);
    noteDraftSelection = sel;
    highlightedAnnoId = null;
    annoDrawer?.open();
    annoDrawer?.showEditor({ ...sel });
    syncNoteSelectMode();
  }

  function openNoteEditorForAnno(anno) {
    if (!anno) return;
    highlightedAnnoId = anno.id;
    const startMi = anno.measureStart ?? 0;
    parchment?.scrollToMeasure(startMi);
    annoDrawer?.showEditor(anno);
    syncPlaybackUi({
      playing: player.playing,
      currentSec: player.currentSec,
      durationSec: player.durationSec,
      measureIndex: player.measureIndex,
    });
  }

  function syncNoteSelectMode() {
    const active = !!(annoDrawer?.isOpen?.() && scoreKey);
    if (active === noteSelectActive) {
      parchment?.update({ noteSelectMode: active });
      return;
    }
    noteSelectActive = active;
    parchment?.setNoteSelectMode?.(active);
  }

  function getCurrentSelection() {
    if (noteDraftSelection) return { ...noteDraftSelection };
    const measures = state.viewModel?.measures || [];
    if (state.loopEnabled) {
      if (state.loopStartBeat == null || state.loopEndBeat == null) return null;
      const { startIdx, endIdx } = measureIndicesForBeats(
        measures,
        state.loopStartBeat,
        state.loopEndBeat,
      );
      return {
        startBeat: state.loopStartBeat,
        endBeat: state.loopEndBeat,
        measureStart: startIdx,
        measureEnd: endIdx,
      };
    }
    if (state.exerciseScope && measures.length) {
      const last = measures.length - 1;
      const measureStart = Math.max(0, Math.min(last, state.loopStart));
      const measureEnd = Math.max(measureStart, Math.min(last, state.loopEnd));
      const beats = beatsFromMeasureRange(measures, measureStart, measureEnd);
      return {
        startBeat: beats.startBeat,
        endBeat: beats.endBeat,
        measureStart,
        measureEnd,
      };
    }
    return null;
  }

  function parchmentSelection() {
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
      noteDraft: noteDraftSelection
        ? { startBeat: noteDraftSelection.startBeat, endBeat: noteDraftSelection.endBeat }
        : null,
      loopSelectMode: state.loopSelectMode,
      noteSelectMode: noteSelectActive,
      zoom: state.parchmentZoom,
      autoFollow: state.autoFollow,
      annotations: scoreKey ? listAnnotations(scoreKey) : [],
      highlightedAnnotationId: highlightedAnnoId,
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

  function detectNaturalPlaybackEnd(info) {
    const cur = {
      playing: info.playing,
      currentSec: info.currentSec ?? 0,
      durationSec: info.durationSec ?? player.durationSec ?? 0,
      resting: info.resting,
    };
    if (!prevPlaybackTick) {
      prevPlaybackTick = { ...cur };
      if (cur.playing) playbackEndFired = false;
      return;
    }
    if (cur.playing && !prevPlaybackTick.playing) playbackEndFired = false;
    const prevDur = prevPlaybackTick.durationSec || cur.durationSec;
    const nearEnd = prevDur > 0 && prevPlaybackTick.currentSec >= prevDur - PLAYBACK_END_EPSILON;
    // Ignore stop edges shortly after user pause/stop — same tick signature as natural end.
    const naturalEnd = prevPlaybackTick.playing
      && !cur.playing
      && !cur.resting
      && !state.loopEnabled
      && nearEnd
      && !playbackEndFired
      && Date.now() - lastUserStopAt > USER_STOP_SUPPRESS_MS;
    if (naturalEnd && typeof onPlaybackEnd === 'function') {
      playbackEndFired = true;
      try {
        onPlaybackEnd();
      } catch (_) { /* embedder */ }
    }
    prevPlaybackTick = { playing: cur.playing, currentSec: cur.currentSec, durationSec: cur.durationSec };
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
        if (state.loopSelectMode) loopController?.enable();
        else loopController?.disable();
      }
      loopController?.syncFromState();
      parchment?.update({
        loopSelectMode: state.loopSelectMode,
        selection: parchmentSelection(),
        zoom: state.parchmentZoom,
        autoFollow: state.autoFollow,
      });
    }
    settingsDrawer?.sync();
    trackMixer?.sync();
    transport?.sync();
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
      const beatLoop = hasBeatLoop();
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
    maybeRunAnalysis();
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

  function snapshotLoopState() {
    return {
      loopEnabled: state.loopEnabled,
      loopStart: state.loopStart,
      loopEnd: state.loopEnd,
      loopStartBeat: state.loopStartBeat,
      loopEndBeat: state.loopEndBeat,
    };
  }

  function restoreLoopState(snap) {
    if (!snap) return;
    if (!snap.loopEnabled) {
      stateController.clearLoop();
      return;
    }
    state.loopEnabled = true;
    if (snap.loopStartBeat != null && snap.loopEndBeat != null) {
      state.loopStartBeat = snap.loopStartBeat;
      state.loopEndBeat = snap.loopEndBeat;
      stateController.setLoopRange(snap.loopStartBeat, snap.loopEndBeat);
    } else {
      stateController.setLoopMeasures(snap.loopStart, snap.loopEnd);
    }
  }

  function restoreAfterImportPanel() {
    stopPlayback();
    restoreLoopState(loopSnapshot);
    loopSnapshot = null;
    reloadModel();
    loopController?.syncFromState();
    settingsDrawer?.sync();
    syncPlaybackUi({
      playing: player.playing,
      currentSec: player.currentSec,
      durationSec: player.durationSec,
      measureIndex: player.measureIndex,
    });
  }

  // ---- mount UI modules ----
  const { guitar, perc } = parchmentModels();
  parchment = mountParchmentView(parchmentHost, {
    guitarModel: guitar,
    percModel: perc,
    zoom: state.parchmentZoom,
    autoFollow: state.autoFollow,
    loopSelectMode: state.loopSelectMode,
    selection: state.loopEnabled
      ? { startBeat: state.loopStartBeat, endBeat: state.loopEndBeat }
      : null,
    onMeasureClick: (mi) => seekToBar(mi, { autoplay: player.playing }),
    onMeasureLongPress: (mi) => {
      if (!scoreKey) {
        annoDrawer?.open();
        return;
      }
      openNoteEditorForMeasure(mi);
    },
    onAnnotationClick: (anno) => openNoteEditorForAnno(anno),
    onNoteSelectionChange: (sel) => {
      if (!scoreKey || !sel) return;
      const measures = state.viewModel?.measures || [];
      const { startIdx, endIdx } = measureIndicesForBeats(measures, sel.startBeat, sel.endBeat);
      noteDraftSelection = {
        startBeat: sel.startBeat,
        endBeat: sel.endBeat,
        measureStart: startIdx,
        measureEnd: endIdx,
      };
      annoDrawer?.showEditor({ ...noteDraftSelection });
    },
    onSelectionChange: (sel) => {
      loopController?.handleSelectionChange(sel);
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
    onBpmStep: (delta) => stepBpm(delta),
    onBpmInput: (value) => {
      state.bpmUserOverride = true;
      state.bpm = clampBpm(Number(value) || state.scoreBpm);
      onSettingsChange({ reload: true });
    },
    onBpmReset: () => {
      stateController.resetBpm();
      onSettingsChange({ reload: true });
    },
    getBpm: () => state.bpm,
    getScoreBpm: () => state.scoreBpm,
    canResetBpm: () => {
      const scoreRounded = Math.round(state.scoreBpm);
      const atScore = !state.bpmUserOverride && Math.round(state.bpm) === scoreRounded;
      return !atScore;
    },
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
      getCurrentSelection,
      onNavigate: (anno, opts) => {
        if (opts?.noteSelectMode != null) {
          noteSelectActive = !!opts.noteSelectMode;
          syncNoteSelectMode();
          if (!opts.noteSelectMode) noteDraftSelection = null;
          return;
        }
        if (anno) openNoteEditorForAnno(anno);
      },
      onSave: (payload) => {
        if (!scoreKey) return null;
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
        noteDraftSelection = null;
        if (saved) highlightedAnnoId = saved.id;
        refreshAnnotations();
        return saved;
      },
      onDelete: (id) => {
        if (!scoreKey || !id) return;
        removeAnnotation(scoreKey, id);
        if (highlightedAnnoId === id) highlightedAnnoId = null;
        noteDraftSelection = null;
        refreshAnnotations();
      },
    });
  } catch (e) {
    console.error(e);
  }

  if (exerciseImportCapable && exerciseImportRoot) {
    try {
      importPanel = mountExerciseImportPanel(exerciseImportRoot, {
        getDigests: () => {
          const { guitar, perc } = parchmentModels();
          return buildMeasureDigests({ guitarModel: guitar, percModel: perc });
        },
        getScoreTitle: () => title,
        getTrackLabel: () => currentTrackLabel(),
        getBpm: () => state.bpm,
        getAnnotations: () => (scoreKey ? listAnnotations(scoreKey) : []),
        getFolders: () => exerciseImport.getFolders?.() ?? [],
        onCreateFolder: typeof exerciseImport.createFolder === 'function'
          ? (name) => exerciseImport.createFolder(name)
          : null,
        onPreview: (startIdx, endIdx) => {
          stateController.setLoopMeasures(startIdx, endIdx);
          state.loopEnabled = true;
          onLoopChanged();
          seekToBar(startIdx, { autoplay: true });
        },
        onStopPreview: () => stopPlayback(),
        onImport: (segments, opts) => exerciseImport.importSegments(segments, opts),
        onClose: () => restoreAfterImportPanel(),
      });
    } catch (e) {
      console.error(e);
    }
  }

  refreshAnnotations();

  rerunAnalysisBtn.addEventListener('click', () => {
    if (!viewModeNeedsAnalysis(viewMode)) setViewMode('analyze');
    else maybeRunAnalysis({ force: true });
  });

  GPP_VIEW_MODES.forEach((mode) => {
    viewBtns[mode]?.addEventListener('click', () => {
      setViewMode(mode);
      if (settingsDrawer?.isOpen?.()) settingsDrawer.close();
      if (annoDrawer?.isOpen?.()) annoDrawer.close();
      if (tracksDrawer?.isOpen?.()) tracksDrawer.close();
    });
  });

  notesBtn.addEventListener('click', () => {
    if (settingsDrawer?.isOpen?.()) settingsDrawer.close();
    if (tracksDrawer?.isOpen?.()) tracksDrawer.close();
    annoDrawer?.toggle();
  });

  splitBtn?.addEventListener('click', () => {
    if (settingsDrawer?.isOpen?.()) settingsDrawer.close();
    if (tracksDrawer?.isOpen?.()) tracksDrawer.close();
    if (annoDrawer?.isOpen?.()) annoDrawer.close();
    if (!importPanel?.isOpen?.()) loopSnapshot = snapshotLoopState();
    importPanel?.open();
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

  function startPlayback() {
    if (!player.playing) togglePlayPause();
  }

  function stepBpm(delta) {
    if (!isAlive()) return;
    state.bpmUserOverride = true;
    state.bpm = clampBpm(state.bpm + delta);
    onSettingsChange({ reload: true });
  }

  function togglePlayPause() {
    if (!isAlive()) return;
    if (player.playing) {
      lastUserStopAt = Date.now();
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
    lastUserStopAt = Date.now();
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

  if (enableHostKeyboard) {
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
  }

  // Initial load
  host.classList.remove('is-loading');
  reloadModel();
  scoreTrack.textContent = currentTrackLabel();
  loopController.syncFromState();
  if (viewModeNeedsAnalysis(viewMode)) maybeRunAnalysis({ force: true });
  if (standaloneSection) {
    layoutMetrics = installGppLayoutMetrics({ host, chrome, section: standaloneSection });
  }
  layoutMetrics?.refresh();
  transport?.publishPad?.();

  if (autoPlay) {
    autoPlayTimer = setTimeout(() => {
      autoPlayTimer = null;
      if (!isAlive()) return;
      startPlayback();
    }, 0);
  }

  function reapplyExternalLoop(snap) {
    state.loopEnabled = true;
    const beats = snap.loopStartBeat != null
      && snap.loopEndBeat != null
      && snap.loopEndBeat > snap.loopStartBeat
      && stateController.setLoopRange(snap.loopStartBeat, snap.loopEndBeat);
    if (!beats) stateController.setLoopMeasures(snap.loopStart, snap.loopEnd);
  }

  function setLoopEnabled(on) {
    if (!isAlive()) return;
    const want = !!on;
    if (state.loopEnabled === want) return;
    if (!want) {
      externalLoopSnapshot = snapshotLoopState();
      stateController.clearLoop();
    } else if (externalLoopSnapshot) {
      reapplyExternalLoop(externalLoopSnapshot);
      externalLoopSnapshot = null;
    } else {
      state.loopEnabled = true;
    }
    reloadModel();
    if (!isAlive()) return;
    settingsDrawer?.sync();
    loopController?.syncFromState();
  }

  return {
    player,
    isLoopEnabled: () => !!state.loopEnabled,
    setLoopEnabled,
    play: startPlayback,
    stop: stopPlayback,
    togglePlayPause,
    stepBpm,
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
      if (autoPlayTimer != null) {
        clearTimeout(autoPlayTimer);
        autoPlayTimer = null;
      }
      clearCountIn();
      stateController.destroy();
      player.stop();
      parchment?.destroy();
      measureNav?.destroy();
      transport?.destroy();
      trackMixer?.destroy();
      settingsDrawer?.destroy();
      annoDrawer?.destroy();
      importPanel?.destroy();
      if (exerciseImportRoot?.parentElement) {
        exerciseImportRoot.parentElement.removeChild(exerciseImportRoot);
      }
      tracksDrawer?.destroy();
      layoutMetrics?.destroy();
      layoutMetrics = null;
      if (keyHandler) host.removeEventListener('keydown', keyHandler);
      if (standaloneSection) standaloneSection.classList.remove('gpp-score-loaded');
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

  // Portrait phone sheet; landscape uses side drawer (must match gpplayer.css)
  const SHEET_MQ = '(max-width: 768px) and (min-height: 501px)';

  function detectSheetMode() {
    sheetMode = window.matchMedia(SHEET_MQ).matches;
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
  const mq = window.matchMedia(SHEET_MQ);
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
