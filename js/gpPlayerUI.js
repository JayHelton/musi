// Shared Guitar Pro practice-player UI (parchment + transport dock).
// Mounted inside the standalone GP Player screen and the Exercises viewer.

import { parseGuitarPro, isGuitarProName } from './tab/guitarPro.js';
import { parseGuitarProWithProgress } from './tab/gpParseClient.js';
import { modelHasRhythm, quartersToSeconds } from './tab/tabModel.js';
import { buildPlayOrder } from './tab/playOrder.js';
import { buildTimeline } from './tab/scoreTimeline.js';
import { createGpMixPlayer } from './gpMixPlayer.js';
import { analyzeModel } from './tab/tabAnalyzer.js';
import { renderAnalysisReport } from './tab/tabAnalysisView.js';
import { audioCtx, ensureAudio } from './audio.js';
import { loadPacksForScore, cancelLoad, getPlaybackSourceState } from './audio/sampleLoader.js';
import { registerCorePacks } from './audio/packCatalog.js';
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
import { mountPracticeRail } from './gpPlayer/practiceRail.js';
import { mountTrackTabs } from './gpPlayer/trackTabs.js';
import { createPanelManager } from './gpPlayer/panelManager.js';
import { mountShortcutHelp } from './gpPlayer/shortcutHelp.js';
import { clampBpm, clampTempoPct } from './gpPlayer/tempoRange.js';
import { mountTrackMixer } from './gpPlayer/trackMixer.js';
import { mountSettingsDrawer } from './gpPlayer/settingsDrawer.js';
import { mountPlayerMenu } from './gpPlayer/playerMenu.js';
import { mountMetronomePanel } from './gpPlayer/metronomePanel.js';
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
  countInBeatCount,
  createTempoRampController,
  createCountInDisplay,
  countInOverlayLabel,
  loopRestOverlayLabel,
  clickLevelAt,
} from './gpPlayer/metronomeState.js';
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
  transportExtra = null,
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
  onCloseScore = null,
  initialTranspose = null,
  initialTuning = null,
  initialRetuneMode = null,
  disabled = false,
  scoreKey = '',
  exerciseImport = null,
  enableHostKeyboard = true,
  onReadProgress = null,
  initialTrackVolumes = null,
  showStandardNotation: initialShowStandardNotation = false,
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
    scoreKey,
    initialTrackVolumes,
  });
  const state = stateController.state;
  syncMetroMirrors();

  const packScoreId = scoreKey || fileName || title || 'score';

  const resolvedBpm = resolveInitialBpm(initialBpm, state.scoreBpm);
  if (resolvedBpm.apply) {
    state.bpm = resolvedBpm.bpm;
    state.bpmUserOverride = resolvedBpm.bpmUserOverride;
  }

  let countInTimer = null;
  let countInDisplay = null;
  let countInOverlayTimer = null;
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
  const sourceStatus = el('div', {
    class: 'gpp-source-status gpp-status',
    role: 'status',
    text: 'Synth fallback',
  });
  titles.append(scoreTitle, scoreTrack, sourceStatus);
  // A screen reader reads this region when the text changes. FR-066 needs it
  // for the bar announcement, and FR-052 needs it for a blocked audio message.
  const liveRegion = el('div', {
    class: 'gpp-live-region',
    role: 'status',
    'aria-live': 'polite',
  });
  // A visible message for a problem that stops playback.
  const alertBar = el('div', { class: 'gpp-alert-bar', role: 'alert', hidden: true });
  scoreHeader.append(titles, liveRegion, alertBar);
  if (typeof onCloseScore === 'function') {
    scoreHeader.append(el('button', {
      class: 'btn sm gpp-close-score',
      type: 'button',
      text: 'Close score',
      'aria-label': 'Close score',
      title: 'Close score',
      onClick: () => onCloseScore(),
    }));
  }

  let lastAnnouncedText = '';

  function updateSourceLabel() {
    if (!isAlive()) return;
    sourceStatus.textContent = getPlaybackSourceState(packScoreId);
  }

  function beginPackLoad() {
    const programs = (gpResult.tracks || [])
      .map((t) => t.model?.trackInfo?.program)
      .filter((p) => p != null);
    const drumNotes = [];
    for (const t of gpResult.drumTracks || []) {
      for (const e of t.model?.events || []) {
        if (e?.midi != null) drumNotes.push(e.midi);
      }
    }
    (async () => {
      try {
        const Ctx = typeof window !== 'undefined'
          && (window.AudioContext || window.webkitAudioContext);
        if (!Ctx || typeof Ctx !== 'function') {
          updateSourceLabel();
          return;
        }
        ensureAudio();
        if (!audioCtx) {
          updateSourceLabel();
          return;
        }
        await registerCorePacks();
        await loadPacksForScore({
          scoreId: packScoreId,
          programs,
          drumNotes,
          audioCtx,
          onProgress: () => updateSourceLabel(),
        });
      } catch (e) {
        // Pack load must not block the score view.
      } finally {
        updateSourceLabel();
      }
    })();
  }
  beginPackLoad();

  /** Put one short sentence into the live region for a screen reader. */
  function announce(text) {
    const next = String(text || '');
    if (!next || next === lastAnnouncedText) return;
    lastAnnouncedText = next;
    liveRegion.textContent = next;
  }

  /** Show or clear the visible alert bar. */
  function showAlert(text) {
    if (!text) {
      alertBar.hidden = true;
      alertBar.textContent = '';
      return;
    }
    alertBar.textContent = text;
    alertBar.hidden = false;
    announce(text);
  }

  const exerciseImportCapable = exerciseImport && typeof exerciseImport.importSegments === 'function';

  const scoreBody = el('div', { class: 'gpp-score-body' });
  const trackTabsHost = el('div', { class: 'gpp-track-tabs-host' });
  const measureNavHost = el('div', { class: 'gpp-measure-nav-host' });
  const parchmentHost = el('div', { class: 'gpp-parchment-host' });
  scoreBody.append(trackTabsHost, measureNavHost, parchmentHost);

  const scorePane = el('div', { class: 'gpp-score-pane' });
  const drawerRoot = el('div', { class: 'gpp-drawer-root' });
  const menuDrawerRoot = el('div', { class: 'gpp-drawer-root gpp-menu-drawer-root' });
  const tracksDrawerRoot = el('div', { class: 'gpp-drawer-root gpp-tracks-drawer-root' });
  const annoDrawerRoot = el('div', { class: 'gpp-drawer-root gpp-anno-drawer-root' });
  const metroDrawerRoot = el('div', { class: 'gpp-drawer-root gpp-metro-drawer-root' });
  const helpDrawerRoot = el('div', { class: 'gpp-drawer-root gpp-help-drawer-root' });
  const tracksMixerHost = el('div', { class: 'gpp-tracks-drawer-mount' });
  scorePane.append(scoreBody, drawerRoot, menuDrawerRoot, tracksDrawerRoot, annoDrawerRoot, metroDrawerRoot, helpDrawerRoot);

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
  const practiceRailHost = el('div', { class: 'gpp-practice-rail-host' });
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
  let practiceRail = null;
  let trackTabs = null;
  let panelManager = null;
  let shortcutHelp = null;
  let trackMixer = null;
  let settingsDrawer = null;
  let metronomePanel = null;
  let playerMenu = null;
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
  let showStandardNotation = !!initialShowStandardNotation;
  let parchmentZoomLimit = Infinity;
  let reducedMotion = false;
  let reducedMotionMq = null;
  let reducedMotionHandler = null;
  let lastAnnouncedBar = -1;
  panelManager = createPanelManager();
  countInDisplay = createCountInDisplay();

  function trackAnalysisKey() {
    return `${state.viewKind}:${state.viewIndex}`;
  }

  function syncHeaderVisibility() {
    const hasTitle = !hideTitle && !!(scoreTitle.textContent?.trim());
    const hasTrack = !!(scoreTrack.textContent?.trim());
    scoreHeader.hidden = !hasTitle && !hasTrack;
  }

  function closeOtherOverlays(except = null) {
    const map = {
      menu: 'menu',
      settings: 'settings',
      tracks: 'tracks',
      notes: 'notes',
      metro: 'metro',
      help: 'help',
      import: 'import',
    };
    for (const [key, id] of Object.entries(map)) {
      if (except === key) continue;
      panelManager?.close(id);
    }
    transport?.sync();
    practiceRail?.sync();
    trackTabs?.sync();
  }

  function syncReducedMotion() {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    host.classList.toggle('gpp-reduced-motion', reducedMotion);
  }

  function syncViewPicker() {
    playerMenu?.sync();
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

  // The score shows the selected track only. An earlier version fell back to
  // the first drum track while the learner had a guitar track selected, so a
  // score with two drum tracks always drew drum track 1. FR-031 forbids that.
  function parchmentModels() {
    const guitar = state.viewKind === 'guitar' ? state.viewModel : null;
    const perc = state.viewKind === 'drum' ? state.viewModel : null;
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
      metronomeEnabled: !!state.metro.enabled,
      referenceModel: state.viewModel || state.gp.drumTracks?.[0]?.model || null,
      trackVolumes: {
        guitar: [...state.trackVolumes.guitars],
        drum: [...state.trackVolumes.drums],
      },
      trackPans: {
        guitar: [...state.trackPans.guitars],
        drum: [...state.trackPans.drums],
      },
      scoreId: packScoreId,
    };
  }

  function applyTrackVolumesToPlayer() {
    state.trackVolumes.guitars.forEach((gain, i) => player.setTrackVolume('guitar', i, gain));
    state.trackVolumes.drums.forEach((gain, i) => player.setTrackVolume('drum', i, gain));
  }

  function applyTrackPansToPlayer() {
    state.trackPans.guitars.forEach((pan, i) => player.setTrackPan('guitar', i, pan));
    state.trackPans.drums.forEach((pan, i) => player.setTrackPan('drum', i, pan));
  }

  function hasBeatLoop() {
    const model = state.viewModel;
    if (!state.loopEnabled || !model || !modelHasRhythm(model)) return false;
    const start = state.loopStartBeat;
    const end = state.loopEndBeat;
    return Number.isFinite(start) && Number.isFinite(end) && end > start;
  }

  let rampRestoreBpm = null;

  const tempoRamp = createTempoRampController({
    getRampConfig: () => state.tempoRamp,
    onStep: (bpm) => {
      if (!isAlive()) return;
      state.bpm = clampBpm(bpm);
      player.setBpm(state.bpm);
      settingsDrawer?.sync();
      metronomePanel?.sync();
      transport?.sync();
    practiceRail?.sync();
    trackTabs?.sync();
    },
    onFinish: () => {
      if (!isAlive()) return;
      player.pause();
      transport?.sync();
    practiceRail?.sync();
    trackTabs?.sync();
    },
  });

  function syncMetroMirrors() {
    state.metronomeEnabled = !!state.metro.enabled;
    state.countInEnabled = !!state.metro.countInEnabled;
  }

  function syncMetroToPlayer() {
    syncMetroMirrors();
    player.setMetronomeConfig(state.metro);
    player.setMetronomeEnabled(!!state.metro.enabled);
  }

  function rampStatusLabel() {
    const s = tempoRamp.getStatus();
    if (!s.enabled) return '';
    if (s.active) {
      return `Ramp ${Math.round(s.currentBpm)}→${Math.round(s.targetBpm)} · ${s.nextIn || ''}`.trim();
    }
    if (s.finished) return `Ramp done ${Math.round(s.currentBpm || s.targetBpm)}`;
    return `Ramp →${Math.round(s.targetBpm)}`;
  }

  function resetRampAfterStop() {
    const startBpm = tempoRamp.stopSession();
    if (startBpm != null && rampRestoreBpm != null && !state.bpmUserOverride) {
      state.bpm = rampRestoreBpm;
      player.setBpm(state.bpm);
    }
    rampRestoreBpm = null;
  }
  let prevPlaybackTick = null;
  let playbackEndFired = false;
  let lastUserStopAt = 0;
  const PLAYBACK_END_EPSILON = 0.4;
  const USER_STOP_SUPPRESS_MS = 300;

  let playbackTimeline = null;
  let playheadFrameId = null;
  let lastTickResting = false;
  let lastRestRemaining = 0;
  let playheadVisibilityHandler = null;
  let playheadAudioStateHandler = null;

  function buildPlaybackTimeline() {
    const base = mixLoadBase();
    const ref = base.referenceModel;
    if (!ref?.measures?.length || !modelHasRhythm(ref)) {
      playbackTimeline = null;
      return;
    }
    const playOrder = buildPlayOrder(ref.measures);
    const tempoMap = ref.tempoMap || [];
    const tempo = Number(base.bpm) || Number(ref.tempo) || 120;
    const timeline = buildTimeline({
      playOrder,
      tempoMap,
      baseBpm: tempo,
      rate: 1,
      tracks: {
        guitarModels: base.guitarModels.filter(Boolean),
        drumModels: base.drumModels.filter(Boolean),
      },
    });
    if (!timeline.events?.length && !(playOrder.passes || []).length) {
      playbackTimeline = null;
      return;
    }
    playbackTimeline = timeline;
  }

  // withRate() builds a new timeline object. The playhead asks for the
  // timeline on every animation frame, so cache the result and rebuild it
  // only when the base timeline or the practice rate changes.
  let ratedTimeline = null;
  let ratedTimelineSource = null;
  let ratedTimelineRate = null;

  function activePlaybackTimeline() {
    if (!playbackTimeline) return null;
    const rate = state.scoreBpm > 0 ? state.bpm / state.scoreBpm : 1;
    if (ratedTimelineSource !== playbackTimeline || ratedTimelineRate !== rate) {
      ratedTimeline = playbackTimeline.withRate(rate);
      ratedTimelineSource = playbackTimeline;
      ratedTimelineRate = rate;
    }
    return ratedTimeline;
  }

  // The score view draws on every animation frame, and the audio tick only
  // arrives about every 25 ms. The view therefore reads the audio clock
  // itself. It must read the clock that the scheduler uses, or the line moves
  // ahead of the sound: the player starts the sound a short time after the
  // tap, so a clock that starts at the tap leads the sound by that time.
  function songSecFromAudioClock() {
    if (!player.playing) return player.currentSec ?? 0;
    const anchor = player.getClockAnchor?.();
    if (!anchor || !audioCtx) return player.currentSec ?? 0;
    if (anchor.holdSec != null) return anchor.holdSec;
    const raw = anchor.originSongSec + (audioCtx.currentTime - anchor.originAudioTime);
    return Math.max(anchor.originSongSec, raw);
  }

  function positionFromAudioClock() {
    const timeline = activePlaybackTimeline();
    if (!timeline) return null;
    return timeline.positionAtSeconds(songSecFromAudioClock());
  }

  // listAnnotations() copies and sorts the list on each call. The playhead
  // asks for it on every frame, so cache the result and clear the cache when
  // the annotation set changes.
  let annotationCache = null;

  function currentAnnotations() {
    if (!scoreKey) return [];
    if (!annotationCache) annotationCache = listAnnotations(scoreKey);
    return annotationCache;
  }

  function invalidateAnnotationCache() {
    annotationCache = null;
  }

  function syncPlayheadFrame(pos, { resting = lastTickResting } = {}) {
    if (!isAlive() || !pos) return;
    const secDisplay = quartersToSeconds(pos.beatInScore, state.bpm);
    parchment?.update({
      currentSec: secDisplay,
      // The score view needs the written beat, not a second count. A score
      // with a tempo map has no single tempo, so seconds cannot name a beat.
      beatInScore: pos.beatInScore,
      bpm: state.bpm,
      playing: player.playing && !resting,
      measureIndex: pos.barIndex,
      selection: parchmentSelection(),
      noteDraft: noteDraftSelection
        ? { startBeat: noteDraftSelection.startBeat, endBeat: noteDraftSelection.endBeat }
        : null,
      loopSelectMode: false,
      noteSelectMode: noteSelectActive,
      zoom: state.parchmentZoom,
      autoFollow: state.autoFollow && !reducedMotion,
      annotations: currentAnnotations(),
      highlightedAnnotationId: highlightedAnnoId,
    });
    measureNav?.update({
      measureIndex: pos.barIndex,
      navBar: state.navBar,
      loopEnabled: state.loopEnabled,
      loopStart: state.loopStart,
      loopEnd: state.loopEnd,
    });
  }

  function applyPlayheadFrame() {
    const pos = positionFromAudioClock();
    if (pos) syncPlayheadFrame(pos);
  }

  // The tab can sleep and the audio context can stop. Draw one frame from the
  // player clock when the page wakes, so the line does not stay where it was.
  function reanchorPlayheadFromAudio() {
    if (!isAlive() || !player.playing) return;
    applyPlayheadFrame();
  }

  function stopPlayheadFrameLoop() {
    if (playheadFrameId != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(playheadFrameId);
      playheadFrameId = null;
    }
  }

  function startPlayheadFrameLoop() {
    if (!activePlaybackTimeline() || playheadFrameId != null) return;
    if (typeof requestAnimationFrame !== 'function') return;
    const tick = () => {
      if (!isAlive() || !player.playing) {
        playheadFrameId = null;
        return;
      }
      applyPlayheadFrame();
      playheadFrameId = requestAnimationFrame(tick);
    };
    playheadFrameId = requestAnimationFrame(tick);
  }

  function bindPlayheadClockListeners() {
    if (typeof document !== 'undefined' && !playheadVisibilityHandler) {
      playheadVisibilityHandler = () => {
        if (!isAlive() || !player.playing) return;
        if (document.visibilityState === 'visible') reanchorPlayheadFromAudio();
      };
      document.addEventListener('visibilitychange', playheadVisibilityHandler);
    }
    if (audioCtx && typeof audioCtx.addEventListener === 'function' && !playheadAudioStateHandler) {
      playheadAudioStateHandler = () => {
        if (!isAlive() || !player.playing) return;
        if (audioCtx.state === 'running') reanchorPlayheadFromAudio();
      };
      audioCtx.addEventListener('statechange', playheadAudioStateHandler);
    }
  }

  function unbindPlayheadClockListeners() {
    if (playheadVisibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', playheadVisibilityHandler);
      playheadVisibilityHandler = null;
    }
    if (playheadAudioStateHandler && audioCtx && typeof audioCtx.removeEventListener === 'function') {
      audioCtx.removeEventListener('statechange', playheadAudioStateHandler);
      playheadAudioStateHandler = null;
    }
  }

  const player = createGpMixPlayer({
    // The browser can refuse to start audio. Name the cause and one next step.
    onAudioBlocked: ({ cause, nextStep } = {}) => {
      if (!isAlive()) return;
      const parts = [cause, nextStep].filter(Boolean);
      showAlert(parts.length
        ? parts.join(' ')
        : 'The browser blocked the sound. Tap the play button again to start it.');
    },
    onTick: (info) => {
      if (!isAlive()) return;
      if (info.playing) showAlert('');
      lastTickResting = !!info.resting;
      if (info.playing && activePlaybackTimeline()) {
        if (!playheadFrameId) startPlayheadFrameLoop();
      } else if (!info.playing) {
        stopPlayheadFrameLoop();
      }
      tempoRamp.onPlaybackTick({
        playing: info.playing,
        resting: info.resting,
        currentSec: info.currentSec,
        measureIndex: info.measureIndex,
        loopRestart: info.loopRestart,
        bpm: info.bpm,
      });
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
    syncMetroToPlayer();
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
    applyTrackVolumesToPlayer();
    applyTrackPansToPlayer();
    applyLoopToPlayer();
    buildPlaybackTimeline();
    const newSec = quartersToSeconds(beat, state.bpm);
    if (was) player.play({ fromSec: newSec });
    // A fresh mount has no position to keep, and seeking to zero would override
    // the loop start load() just picked.
    else if (at > 0) player.seek(newSec);

    refreshScoreSurface();
    syncMetroToPlayer();
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
    invalidateAnnotationCache();
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
    closeOtherOverlays('notes');
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

  function practiceOverlayLabel(resting = false, restRemaining = 0) {
    if (countInDisplay?.remaining > 0) {
      return countInOverlayLabel(countInDisplay.remaining, countInDisplay.remaining);
    }
    if (resting && restRemaining > 0) {
      return loopRestOverlayLabel(restRemaining);
    }
    return '';
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
    syncHeaderVisibility();
    if (playing && Number.isFinite(measureIndex) && measureIndex !== lastAnnouncedBar) {
      lastAnnouncedBar = measureIndex;
      announce(`Bar ${measureIndex + 1}`);
    }
    if (!playing) lastAnnouncedBar = -1;
    lastTickResting = !!resting;
    lastRestRemaining = Number(restRemaining) || 0;
    // The frame loop owns the score view while playback runs. Without this
    // guard the view repaints on the audio tick and on the animation frame,
    // about 100 times each second, and that work delays the audio scheduler.
    if (playheadFrameId == null) {
      // The audio tick reports seconds. Ask the score timeline for the written
      // beat that belongs to those seconds, so the line stops at the note it
      // plays. The timeline is absent for a score without a rhythm, and the
      // view then falls back to a plain seconds to beats step.
      const tickPos = activePlaybackTimeline()?.positionAtSeconds(currentSec) ?? null;
      parchment?.update({
        currentSec,
        beatInScore: tickPos?.beatInScore,
        bpm: state.bpm,
        playing: playing && !resting,
        measureIndex: tickPos ? tickPos.barIndex : measureIndex,
        selection: parchmentSelection(),
        noteDraft: noteDraftSelection
          ? { startBeat: noteDraftSelection.startBeat, endBeat: noteDraftSelection.endBeat }
          : null,
        loopSelectMode: false,
        noteSelectMode: noteSelectActive,
        zoom: state.parchmentZoom,
        autoFollow: state.autoFollow && !reducedMotion,
        annotations: currentAnnotations(),
        highlightedAnnotationId: highlightedAnnoId,
      });
      measureNav?.update({
        measureIndex,
        navBar: state.navBar,
        loopEnabled: state.loopEnabled,
        loopStart: state.loopStart,
        loopEnd: state.loopEnd,
      });
    }
    transport?.sync();
    practiceRail?.sync();
    trackTabs?.sync();
    // Per-tick playback UI must not rebuild the metronome panel — use syncStatus only.
    metronomePanel?.syncStatus?.();
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
      syncMetroToPlayer();
    } else if (patch.zoom || patch.autoFollow || patch.notation) {
      if (patch.notation != null) {
        showStandardNotation = !!patch.notation;
        parchment?.setShowStandardNotation?.(showStandardNotation);
      }
      parchment?.update({
        selection: parchmentSelection(),
        zoom: state.parchmentZoom,
        autoFollow: state.autoFollow && !reducedMotion,
      });
    }
    settingsDrawer?.sync();
    trackMixer?.sync();
    metronomePanel?.sync();
    transport?.sync();
    practiceRail?.sync();
    trackTabs?.sync();
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
      buildPlaybackTimeline();
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
    loopSelectMode: false,
    selection: state.loopEnabled
      ? { startBeat: state.loopStartBeat, endBeat: state.loopEndBeat }
      : null,
    onMeasureClick: (mi) => seekToBar(mi, { autoplay: player.playing }),
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
    onZoomLimit: (limit) => {
      if (limit === parchmentZoomLimit) return;
      parchmentZoomLimit = limit;
      settingsDrawer?.sync?.();
    },
  });
  if (typeof parchment?.getZoomLimit === 'function') {
    const seeded = parchment.getZoomLimit();
    if (typeof seeded === 'number' && Number.isFinite(seeded)) {
      parchmentZoomLimit = seeded;
    }
  }

  loopController = createLoopSelectionController({
    getState: () => state,
    applyRange: (startBeat, endBeat) => {
      if (stateController.setLoopRange(startBeat, endBeat)) {
        state.loopEnabled = true;
      }
    },
    clearRange: () => stateController.clearLoop(),
    parchment,
    onLoopChanged,
  });

  const measures = state.viewModel?.measures || [];
  measureNav = mountMeasureNav(measureNavHost, {
    measureCount: measures.length,
    markers: measures.map((m) => m.marker || null),
    onSeek: (i) => seekToBar(i, { autoplay: player.playing }),
    onLoopRange: (startIdx, endIdx) => {
      loopController?.applyMeasureRange(startIdx, endIdx);
      state.loopEnabled = true;
      onLoopChanged();
    },
  });

  trackTabs = mountTrackTabs(trackTabsHost, {
    stateController,
    onSelectTrack: (kind, index) => setViewTrack(kind, index),
  });

  practiceRail = mountPracticeRail(practiceRailHost, {
    onSpeedStep: (delta) => {
      const pct = state.scoreBpm
        ? Math.round((state.bpm / state.scoreBpm) * 100)
        : 100;
      const next = clampTempoPct(pct + delta);
      tempoRamp.stopSession();
      state.bpmUserOverride = true;
      state.bpm = clampBpm(Math.round(state.scoreBpm * (next / 100)));
      onSettingsChange({ reload: true });
    },
    onSpeedInput: (value) => {
      tempoRamp.stopSession();
      state.bpmUserOverride = true;
      const pct = clampTempoPct(Number(value) || 100);
      state.bpm = clampBpm(Math.round(state.scoreBpm * (pct / 100)));
      onSettingsChange({ reload: true });
    },
    onBpmStep: (delta) => stepBpm(delta),
    onBpmInput: (value) => {
      tempoRamp.stopSession();
      state.bpmUserOverride = true;
      state.bpm = clampBpm(Number(value) || state.scoreBpm);
      onSettingsChange({ reload: true });
    },
    onBpmReset: () => {
      tempoRamp.stopSession();
      stateController.resetBpm();
      onSettingsChange({ reload: true });
    },
    onLoopToggle: () => setLoopEnabled(!state.loopEnabled),
    onClearLoop: () => {
      stateController.clearLoop();
      onLoopChanged();
    },
    onMetroToggle: () => {
      state.metro.enabled = !state.metro.enabled;
      syncMetroMirrors();
      stateController.persistMetroPrefs?.();
      onSettingsChange({ metronome: true });
    },
    onCountInToggle: () => {
      state.metro.countInEnabled = !state.metro.countInEnabled;
      syncMetroMirrors();
      stateController.persistMetroPrefs?.();
      onSettingsChange({ metronome: true });
    },
    getBpm: () => state.bpm,
    getScoreBpm: () => state.scoreBpm,
    canResetBpm: () => {
      const scoreRounded = Math.round(state.scoreBpm);
      return !(!state.bpmUserOverride && Math.round(state.bpm) === scoreRounded);
    },
    getLoopEnabled: () => state.loopEnabled,
    getLoopRangeLabel: () => {
      if (!state.loopEnabled) return '';
      return `Loop ${state.loopStart + 1}–${state.loopEnd + 1}`;
    },
    getMetroEnabled: () => !!state.metro.enabled,
    getCountInEnabled: () => !!state.metro.countInEnabled,
    getOverlayLabel: () => practiceOverlayLabel(lastTickResting, lastRestRemaining),
  });

  transport = mountTransportDock(transportHost, {
    extraNode: transportExtra,
    practiceRailNode: practiceRailHost,
    syncPracticeRail: () => practiceRail?.sync(),
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
    getTimeLabel: () => `${fmtTime(player.currentSec)} / ${fmtTime(player.durationSec)}`,
    canPrev: () => canPrevMeasure(navMeasureIndex(), stateController.getScope()),
    canNext: () => canNextMeasure(navMeasureIndex(), stateController.getScope()),
    getRampStatusLabel: () => rampStatusLabel(),
    onOpenMenu: () => {
      if (panelManager.isOpen('menu')) panelManager.close('menu');
      else {
        closeOtherOverlays('menu');
        panelManager.open('menu');
      }
      transport?.sync();
    },
    isMenuOpen: () => panelManager.isOpen('menu'),
  });

  tracksDrawer = mountTracksDrawerShell(tracksDrawerRoot, {
    title: 'Tracks',
    bodyEl: tracksMixerHost,
  });

  try {
    trackMixer = mountTrackMixer(tracksMixerHost, {
      stateController,
      onChange: (patch) => {
        withPreservedPosition(() => {
          const { enabledGuitars, enabledDrums } = stateController.getEffectiveEnabled();
          enabledGuitars.forEach((on, i) => player.setTrackEnabled('guitar', i, on));
          enabledDrums.forEach((on, i) => player.setTrackEnabled('drum', i, on));
        });
        if (patch?.volume) {
          player.setTrackVolume(patch.kind, patch.index, patch.gain);
        } else {
          applyTrackVolumesToPlayer();
        }
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
      getShowNotation: () => showStandardNotation,
      getZoomLimit: () => parchmentZoomLimit,
    });
  } catch (e) {
    console.error(e);
  }

  try {
    metronomePanel = mountMetronomePanel(metroDrawerRoot, {
      stateController,
      uidPrefix: `${uidPrefix}-metro`,
      getMeasureIndex: () => navMeasureIndex(),
      getRampStatus: () => tempoRamp.getStatus(),
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

  try {
    playerMenu = mountPlayerMenu(menuDrawerRoot, {
      getViewMode: () => viewMode,
      onViewModeChange: (mode) => {
        setViewMode(mode);
        closeOtherOverlays();
      },
      onOpenFile: typeof onOpenFile === 'function' ? () => onOpenFile() : null,
      onCloseScore: typeof onCloseScore === 'function' ? () => onCloseScore() : null,
      onOpenNotes: () => {
        closeOtherOverlays('notes');
        panelManager.open('notes');
      },
      onOpenSplit: exerciseImportCapable ? () => {
        closeOtherOverlays('import');
        if (!importPanel?.isOpen?.()) loopSnapshot = snapshotLoopState();
        panelManager.open('import');
      } : null,
      onOpenTracks: () => {
        closeOtherOverlays('tracks');
        panelManager.open('tracks');
      },
      onOpenMetronome: () => {
        closeOtherOverlays('metro');
        panelManager.open('metro');
      },
      onOpenSettings: () => {
        closeOtherOverlays('settings');
        panelManager.open('settings');
      },
      onOpenHelp: () => {
        closeOtherOverlays('help');
        panelManager.open('help');
      },
      headerExtra,
    });
  } catch (e) {
    console.error(e);
  }

  try {
    shortcutHelp = mountShortcutHelp(helpDrawerRoot);
    panelManager.register('help', shortcutHelp);
    panelManager.register('settings', settingsDrawer);
    panelManager.register('menu', playerMenu);
    panelManager.register('tracks', tracksDrawer);
    panelManager.register('notes', annoDrawer);
    panelManager.register('metro', metronomePanel);
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
      panelManager.register('import', importPanel);
    } catch (e) {
      console.error(e);
    }
  }

  refreshAnnotations();

  rerunAnalysisBtn.addEventListener('click', () => {
    if (!viewModeNeedsAnalysis(viewMode)) setViewMode('analyze');
    else maybeRunAnalysis({ force: true });
  });

  function clearCountIn() {
    if (countInTimer != null) {
      clearTimeout(countInTimer);
      countInTimer = null;
    }
    if (countInOverlayTimer != null) {
      clearInterval(countInOverlayTimer);
      countInOverlayTimer = null;
    }
    countInDisplay?.clear();
    practiceRail?.sync();
  }

  function startPlayFromNav() {
    const measures = state.viewModel?.measures || [];
    const scope = stateController.getScope();
    const navIdx = state.navBar == null ? scope.start : state.navBar;
    state.navBar = navIdx;
    const beats = beatsFromMeasureRange(measures, navIdx, navIdx);
    const startSec = quartersToSeconds(beats.startBeat, state.bpm);
    ensureAudio();
    bindPlayheadClockListeners();
    syncMetroToPlayer();
    player.play({ fromSec: startSec });
  }

  function countInBeats() {
    return countInBeatCount(state.metro, state.viewModel, navMeasureIndex());
  }

  function runCountIn(onDone) {
    const quarterSec = 60 / state.bpm;
    const beats = countInBeats();
    const prevMetro = state.metro.enabled;
    player.setMetronomeEnabled(true);
    const now = audioCtx.currentTime;
    for (let i = 0; i < beats; i++) {
      const level = clickLevelAt(i, state.metro.subdiv, state.metro, []);
      scheduleMetronomeClick(
        now + 0.06 + i * quarterSec,
        level,
        state.metro.volume,
      );
    }
    countInDisplay.start(beats);
    practiceRail?.sync();
    if (countInOverlayTimer != null) clearInterval(countInOverlayTimer);
    countInOverlayTimer = setInterval(() => {
      if (!isAlive()) return;
      countInDisplay.tick();
      practiceRail?.sync();
    }, quarterSec * 1000);
    countInTimer = setTimeout(() => {
      countInTimer = null;
      if (countInOverlayTimer != null) {
        clearInterval(countInOverlayTimer);
        countInOverlayTimer = null;
      }
      countInDisplay.clear();
      practiceRail?.sync();
      if (!isAlive()) return;
      if (!prevMetro) player.setMetronomeEnabled(false);
      onDone?.();
    }, quarterSec * beats * 1000 + 40);
  }

  function beginPlaybackSession() {
    rampRestoreBpm = state.bpm;
    if (state.tempoRamp.enabled) tempoRamp.startSession(state.bpm);
  }

  function startPlayback() {
    if (!player.playing) togglePlayPause();
  }

  function stepBpm(delta) {
    if (!isAlive()) return;
    tempoRamp.stopSession();
    state.bpmUserOverride = true;
    state.bpm = clampBpm(state.bpm + delta);
    onSettingsChange({ reload: true });
  }

  function togglePlayPause() {
    if (!isAlive()) return;
    if (player.playing) {
      lastUserStopAt = Date.now();
      clearCountIn();
      tempoRamp.pauseSession();
      stopPlayheadFrameLoop();
      player.pause();
      transport?.sync();
    practiceRail?.sync();
    trackTabs?.sync();
      return;
    }
    if (player.paused) {
      ensureAudio();
      bindPlayheadClockListeners();
      tempoRamp.resumeSession();
      player.play();
      transport?.sync();
    practiceRail?.sync();
    trackTabs?.sync();
      return;
    }
    if (state.metro.countInEnabled) {
      ensureAudio();
      bindPlayheadClockListeners();
      runCountIn(() => {
        if (!isAlive()) return;
        beginPlaybackSession();
        startPlayFromNav();
      });
      return;
    }
    ensureAudio();
    bindPlayheadClockListeners();
    beginPlaybackSession();
    startPlayFromNav();
  }

  function stopPlayback() {
    if (!isAlive()) return;
    lastUserStopAt = Date.now();
    clearCountIn();
    stopPlayheadFrameLoop();
    resetRampAfterStop();
    const measures = state.viewModel?.measures || [];
    const navIdx = navMeasureIndex();
    const beats = beatsFromMeasureRange(measures, navIdx, navIdx);
    const startSec = quartersToSeconds(beats.startBeat, state.bpm);
    player.stop();
    player.seek(startSec);
    transport?.sync();
    practiceRail?.sync();
    trackTabs?.sync();
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

      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        closeOtherOverlays('help');
        panelManager.open('help');
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        stopPlayback();
      } else if (e.code === 'Home') {
        e.preventDefault();
        restartPlayback();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const scope = stateController.getScope();
        const cur = navMeasureIndex();
        if (canPrevMeasure(cur, scope)) seekToBar(cur - 1, { autoplay: player.playing });
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        const scope = stateController.getScope();
        const cur = navMeasureIndex();
        if (canNextMeasure(cur, scope)) seekToBar(cur + 1, { autoplay: player.playing });
      } else if (e.key === '[' && e.shiftKey) {
        e.preventDefault();
        stepBpm(-5);
      } else if (e.key === ']' && e.shiftKey) {
        e.preventDefault();
        stepBpm(5);
      } else if (e.key === '[') {
        e.preventDefault();
        const pct = state.scoreBpm ? Math.round((state.bpm / state.scoreBpm) * 100) : 100;
        tempoRamp.stopSession();
        state.bpmUserOverride = true;
        state.bpm = clampBpm(Math.round(state.scoreBpm * (clampTempoPct(pct - 5) / 100)));
        onSettingsChange({ reload: true });
      } else if (e.key === ']') {
        e.preventDefault();
        const pct = state.scoreBpm ? Math.round((state.bpm / state.scoreBpm) * 100) : 100;
        tempoRamp.stopSession();
        state.bpmUserOverride = true;
        state.bpm = clampBpm(Math.round(state.scoreBpm * (clampTempoPct(pct + 5) / 100)));
        onSettingsChange({ reload: true });
      } else if (e.key === 'l' || e.key === 'L') {
        if (e.shiftKey) {
          e.preventDefault();
          stateController.clearLoop();
          onLoopChanged();
        } else {
          e.preventDefault();
          setLoopEnabled(!state.loopEnabled);
        }
      } else if (e.key === 'm' || e.key === 'M') {
        if (e.shiftKey) {
          e.preventDefault();
          closeOtherOverlays('menu');
          panelManager.open('menu');
        } else {
          e.preventDefault();
          state.metro.enabled = !state.metro.enabled;
          syncMetroMirrors();
          stateController.persistMetroPrefs?.();
          onSettingsChange({ metronome: true });
        }
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        state.metro.countInEnabled = !state.metro.countInEnabled;
        syncMetroMirrors();
        stateController.persistMetroPrefs?.();
        onSettingsChange({ metronome: true });
      } else if (e.key >= '1' && e.key <= '9') {
        const idx = Number(e.key) - 1;
        const gp = state.gp;
        const total = (gp.tracks?.length || 0) + (gp.drumTracks?.length || 0);
        if (idx < total) {
          e.preventDefault();
          if (idx < (gp.tracks?.length || 0)) setViewTrack('guitar', idx);
          else setViewTrack('drum', idx - (gp.tracks?.length || 0));
        }
      }
    };
    host.addEventListener('keydown', keyHandler);
  }

  syncReducedMotion();
  if (typeof window !== 'undefined' && window.matchMedia) {
    reducedMotionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionHandler = () => syncReducedMotion();
    reducedMotionMq.addEventListener?.('change', reducedMotionHandler);
  }
  parchment?.setShowStandardNotation?.(showStandardNotation);

  // Initial load
  host.classList.remove('is-loading');
  reloadModel();
  scoreTrack.textContent = currentTrackLabel();
  syncHeaderVisibility();
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
      cancelLoad(packScoreId);
      stopPlayheadFrameLoop();
      unbindPlayheadClockListeners();
      playbackTimeline = null;
      if (autoPlayTimer != null) {
        clearTimeout(autoPlayTimer);
        autoPlayTimer = null;
      }
      clearCountIn();
      stateController.destroy();
      player.destroy();
      parchment?.destroy();
      parchmentZoomLimit = Infinity;
      measureNav?.destroy();
      transport?.destroy();
      practiceRail?.destroy();
      trackTabs?.destroy();
      trackMixer?.destroy();
      panelManager?.destroy();
      shortcutHelp?.destroy();
      settingsDrawer?.destroy();
      metronomePanel?.destroy();
      playerMenu?.destroy();
      annoDrawer?.destroy();
      importPanel?.destroy();
      if (exerciseImportRoot?.parentElement) {
        exerciseImportRoot.parentElement.removeChild(exerciseImportRoot);
      }
      tracksDrawer?.destroy();
      layoutMetrics?.destroy();
      layoutMetrics = null;
      if (keyHandler) host.removeEventListener('keydown', keyHandler);
      if (reducedMotionMq && reducedMotionHandler) {
        reducedMotionMq.removeEventListener?.('change', reducedMotionHandler);
      }
      host.classList.remove('gpp-reduced-motion');
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
  const { onReadProgress, signal, ...mountOptions } = options;
  const gp = await parseGuitarProWithProgress(bytes, {
    onProgress: onReadProgress,
    signal,
  });
  return mountGpPlayer(host, { ...mountOptions, gpResult: gp });
}
