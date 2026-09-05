// Shared Guitar Pro practice-player UI.
//
// The player composes four parts: a header (way back, title, track selector,
// view), the score canvas, the transport, and an overlay host for popovers,
// drawers, and sheets. Mounted inside the standalone GP Player screen, the
// Exercises viewer, and the Workbook player.

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
import {
  DRUM_CORE_PACK_ID,
  SCORE_VOICES,
  drumVoiceUsesPacks,
  getDrumVoice,
  getScoreVoice,
  scoreVoiceUsesPacks,
  voiceUserSoundId,
} from './audio/soundPrefs.js';
import { getUserSound, registerUserPacks, userPackManifestId } from './audio/userSounds.js';
import { scheduleMetronomeClick } from './tab/metroClick.js';
import { getSetting, saveSetting } from './persistence.js';

import { el, uid, fmtTime } from './gpPlayer/dom.js';
import { icon } from './gpPlayer/icons.js';
import { createPlayerState, resolveInitialBpm } from './gpPlayer/playerState.js';
import {
  beatsFromMeasureRange,
  canPrevMeasure,
  canNextMeasure,
  restartTarget,
  measureIndicesForBeats,
  measureIndexAtBeat,
} from './gpPlayer/rangeUtils.js';
import { mountParchmentView } from './gpPlayer/parchmentView.js';
import { createLoopSelectionController } from './gpPlayer/loopSelection.js';
import { mountTransportDock } from './gpPlayer/transportDock.js';
import { mountTrackSelector } from './gpPlayer/trackSelector.js';
import { mountSelectionToolbar } from './gpPlayer/selectionToolbar.js';
import { mountFollowButton } from './gpPlayer/followButton.js';
import { mountPracticePopover } from './gpPlayer/practicePopover.js';
import { createPopover } from './gpPlayer/popover.js';
import { createPanelManager } from './gpPlayer/panelManager.js';
import { mountShortcutHelp } from './gpPlayer/shortcutHelp.js';
import { clampBpm } from './gpPlayer/tempoRange.js';
import { clampSpeedPct, speedPctFor } from './gpPlayer/speedPopover.js';
import { sectionsFromMarkers } from './gpPlayer/goToPopover.js';
import { mountTrackMixer } from './gpPlayer/trackMixer.js';
import { mountSettingsDrawer } from './gpPlayer/settingsDrawer.js';
import { mountPlayerMenu } from './gpPlayer/playerMenu.js';
import { mountMetronomePanel } from './gpPlayer/metronomePanel.js';
import { mountAnnotationsDrawer } from './gpPlayer/annotationsDrawer.js';
import { mountBackingPanel } from './gpPlayer/backingPanel.js';
import { buildMeasureDigests } from './gpPlayer/measureDigest.js';
import { mountExerciseImportPanel } from './gpPlayer/exerciseImportPanel.js';
import {
  GPP_VIEW_MODES,
  loadViewMode,
  persistViewMode,
  viewModeNeedsAnalysis,
  applyViewModeClasses,
} from './gpPlayer/viewModes.js';
import {
  installGppLayoutMetrics,
  releaseGpPlayerShell,
  GPP_IMMERSIVE_SELECTOR,
} from './gpPlayer/layoutMetrics.js';
import {
  countInBeatCount,
  createTempoRampController,
  createCountInDisplay,
  countInOverlayLabel,
  loopRestOverlayLabel,
  clickLevelAt,
} from './gpPlayer/metronomeState.js';
import { loadSession, createSessionWriter } from './gpPlayer/playerSessionStore.js';
import {
  listAnnotations,
  addAnnotation,
  updateAnnotation,
  removeAnnotation,
} from './gpAnnotations.js';

let mountGeneration = 0;

const NOTATION_SETTING = 'gpp.notationView';
const NOTATION_VIEWS = ['tab', 'both'];
const FOCUS_CLASS = 'gpp-focus-mode';

function loadNotationView() {
  return getSetting(NOTATION_SETTING, 'tab', NOTATION_VIEWS);
}

function persistNotationView(view) {
  if (NOTATION_VIEWS.includes(view)) saveSetting(NOTATION_SETTING, view);
}

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
 *   seekToBar:(barIndex:number, opts?:{ autoplay?: boolean })=>void,
 *   seekToBeat:(beat:number, opts?:{ autoplay?: boolean })=>void,
 *   isPendingPlayback:()=>boolean,
 *   stepBpm:(delta:number)=>void,
 * }}
 */
export function mountGpPlayer(host, options = {}) {
  const {
    gpResult,
    title = 'Guitar Pro',
    fileName = '',
    subtitle = '',
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
    onPlaybackTick = null,
    skipCountIn = false,
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
    initialTrackVolumes = null,
    showStandardNotation: initialShowStandardNotation = null,
    onBack = null,
    backLabel = 'Back',
    onSaveRange = null,
    restoreSession = true,
  } = options;
  if (!host) throw new Error('mountGpPlayer: host required');

  ++mountGeneration;
  let alive = true;
  const isAlive = () => alive && !state.destroyed;

  // ---- per-score session restore ----
  // The caller wins for every field it names. The saved session fills in the
  // rest, so a score reopens where practice stopped.
  const session = restoreSession && scoreKey ? loadSession(scoreKey) : null;
  const has = (key) => Object.prototype.hasOwnProperty.call(options, key) && options[key] !== undefined;
  const sessionTrack = session && !has('preferredTrackIndex') ? session : null;
  const sessionLoop = session?.loop && !has('initialLoopEnabled') && !has('initialLoopStart') ? session.loop : null;
  const sessionSpeed = session?.speedRatio != null && !has('initialBpm') ? session.speedRatio : null;
  const sessionMixer = session?.mixer && !has('initialTrackVolumes') ? session.mixer : null;

  const stateController = createPlayerState(gpResult, {
    preferredTrackIndex: sessionTrack && sessionTrack.trackKind === 'guitar'
      ? sessionTrack.trackIndex
      : preferredTrackIndex,
    initialLoopEnabled: sessionLoop ? sessionLoop.enabled : initialLoopEnabled,
    initialLoopStart,
    initialLoopEnd,
    initialLoopStartBeat: sessionLoop ? sessionLoop.startBeat : initialLoopStartBeat,
    initialLoopEndBeat: sessionLoop ? sessionLoop.endBeat : initialLoopEndBeat,
    loopRestSec,
    exerciseScope,
    initialTranspose,
    initialTuning,
    initialRetuneMode,
    scoreKey,
    initialTrackVolumes: sessionMixer?.volumeGuitars
      ? { guitars: sessionMixer.volumeGuitars, drums: sessionMixer.volumeDrums || [] }
      : initialTrackVolumes,
  });
  const state = stateController.state;
  syncMetroMirrors();

  if (sessionTrack && sessionTrack.trackKind === 'drum'
    && (gpResult.drumTracks || []).length > sessionTrack.trackIndex) {
    stateController.setViewTrack('drum', sessionTrack.trackIndex);
    stateController.applyTransforms();
  }
  if (sessionLoop && sessionLoop.enabled && state.loopEnabled) {
    state.loopMode = 'range';
    state.loopSelectMode = true;
  }
  if (sessionMixer?.mutedGuitars) {
    sessionMixer.mutedGuitars.forEach((muted, i) => {
      if (i < state.enabledGuitars.length) stateController.setTrackEnabled('guitar', i, !muted);
    });
  }
  if (sessionMixer?.mutedDrums) {
    sessionMixer.mutedDrums.forEach((muted, i) => {
      if (i < state.enabledDrums.length) stateController.setTrackEnabled('drum', i, !muted);
    });
  }
  if (session?.zoom != null) state.parchmentZoom = session.zoom;

  const packScoreId = scoreKey || fileName || title || 'score';

  const resolvedBpm = resolveInitialBpm(initialBpm, state.scoreBpm);
  if (resolvedBpm.apply) {
    state.bpm = resolvedBpm.bpm;
    state.bpmUserOverride = resolvedBpm.bpmUserOverride;
  } else if (sessionSpeed != null && sessionSpeed !== 1) {
    stateController.setSpeedRatio(sessionSpeed);
  }

  let countInTimer = null;
  let countInDisplay = null;
  let countInOverlayTimer = null;
  let autoPlayTimer = null;
  let keyHandler = null;

  host.innerHTML = '';
  host.classList.add('gpp-root');
  // The screen that owns this mount decides whether a loaded score may take
  // the whole view. Both the GP Player screen and the Exercises viewer mark
  // themselves, so a score reads the same on either one.
  const immersiveSection = host.closest(GPP_IMMERSIVE_SELECTOR);
  if (immersiveSection) immersiveSection.classList.add('gpp-score-loaded');
  if (disabled) host.classList.add('is-loading');
  host.tabIndex = -1;

  // ---- header ----
  const header = el('div', { class: 'gpp-header gpp-score-header' });
  let backBtn = null;
  if (typeof onBack === 'function') {
    backBtn = el('button', {
      class: 'gpp-icon-btn has-label gpp-back-btn',
      type: 'button',
      'aria-label': `Back to ${String(backLabel).toLowerCase()}`,
      title: `Back to ${String(backLabel).toLowerCase()}`,
      onClick: () => onBack(),
    }, [
      el('span', { class: 'gpp-btn-icon', html: icon('back'), 'aria-hidden': 'true' }),
      el('span', { class: 'gpp-btn-label', text: String(backLabel) }),
    ]);
    header.appendChild(backBtn);
  }
  const titles = el('div', { class: 'gpp-header-titles gpp-score-header-titles' });
  const scoreTitle = el('div', { class: 'gpp-score-title', text: hideTitle ? '' : title, title: fileName || title });
  const scoreSubtitle = el('div', { class: 'gpp-score-subtitle', text: subtitle || '' });
  if (!subtitle) scoreSubtitle.hidden = true;
  // The playback source. It shows while playback prepares, then goes away.
  const sourceStatus = el('div', {
    class: 'gpp-source-status',
    role: 'status',
    text: '',
    hidden: true,
  });
  titles.append(scoreTitle, scoreSubtitle);
  header.appendChild(titles);

  const trackSelectorHost = el('div', { class: 'gpp-track-selector-host' });
  const headerActions = el('div', { class: 'gpp-header-actions' });
  const viewBtn = el('button', {
    class: 'gpp-icon-btn has-label gpp-view-btn',
    type: 'button',
    'aria-label': 'Notation view and zoom',
    title: 'View',
    'aria-expanded': 'false',
  }, [
    el('span', { class: 'gpp-btn-icon', html: icon('zoomIn'), 'aria-hidden': 'true' }),
    el('span', { class: 'gpp-btn-label', text: 'View' }),
  ]);
  headerActions.append(sourceStatus, viewBtn);
  let closeScoreBtn = null;
  if (typeof onCloseScore === 'function') {
    closeScoreBtn = el('button', {
      class: 'gpp-icon-btn gpp-close-score',
      type: 'button',
      html: icon('close'),
      'aria-label': 'Close score',
      title: 'Close score',
      onClick: () => onCloseScore(),
    });
    headerActions.append(closeScoreBtn);
  }
  header.append(trackSelectorHost, headerActions);

  // A screen reader reads this region when the text changes. It carries the
  // bar at a seek and a blocked audio message. It does not carry every beat.
  const liveRegion = el('div', {
    class: 'gpp-live-region',
    role: 'status',
    'aria-live': 'polite',
  });
  const alertBar = el('div', { class: 'gpp-alert-bar', role: 'alert', hidden: true });
  header.append(liveRegion, alertBar);

  let lastAnnouncedText = '';

  function updateSourceLabel() {
    if (!isAlive()) return;
    const voice = getScoreVoice();
    let text = '';
    if (!scoreVoiceUsesPacks(voice)) {
      text = '';
    } else {
      const soundId = voiceUserSoundId(voice);
      const sourceState = getPlaybackSourceState(packScoreId);
      if (soundId && getUserSound(soundId)) {
        text = sourceState === 'Studio ready' ? '' : sourceState;
      } else {
        text = sourceState === 'Studio ready' ? '' : sourceState;
      }
    }
    if (/loading|preparing|fetch/i.test(text)) text = 'Preparing playback…';
    sourceStatus.textContent = text;
    sourceStatus.hidden = !text;
  }

  function beginPackLoad() {
    const programs = (gpResult.tracks || []).map((t) => {
      const p = t.model?.trackInfo?.program;
      return p != null ? p : 27;
    });
    const drumNotes = [];
    for (const t of gpResult.drumTracks || []) {
      for (const e of t.model?.events || []) {
        if (e?.midi != null) drumNotes.push(e.midi);
      }
    }
    (async () => {
      try {
        const wantPitched = scoreVoiceUsesPacks();
        const wantDrums = drumVoiceUsesPacks();
        if (!wantPitched && !wantDrums) {
          updateSourceLabel();
          return;
        }
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
        registerUserPacks();
        if (!isAlive()) return;
        const extraPackIds = [];
        if (wantPitched) {
          const chosen = userPackManifestId(voiceUserSoundId(getScoreVoice()) || '');
          if (chosen) extraPackIds.push(chosen);
        }
        if (wantDrums) {
          const chosenKit = userPackManifestId(voiceUserSoundId(getDrumVoice()) || '');
          extraPackIds.push(chosenKit || DRUM_CORE_PACK_ID);
        }
        await loadPacksForScore({
          scoreId: packScoreId,
          programs: wantPitched ? programs : [],
          drumNotes: wantDrums ? drumNotes : [],
          audioCtx,
          extraPackIds,
          onProgress: () => updateSourceLabel(),
        });
        if (!isAlive()) return;
      } catch (e) {
        // Pack load must not block the score view.
      } finally {
        updateSourceLabel();
      }
    })();
  }
  beginPackLoad();

  function announce(text) {
    const next = String(text || '');
    if (!next || next === lastAnnouncedText) return;
    lastAnnouncedText = next;
    liveRegion.textContent = next;
  }

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

  // ---- layout ----
  const scoreBody = el('div', { class: 'gpp-score-body' });
  const parchmentHost = el('div', { class: 'gpp-parchment-host gpp-canvas-host' });
  scoreBody.append(parchmentHost);

  const scorePane = el('div', { class: 'gpp-score-pane' });
  const drawerRoot = el('div', { class: 'gpp-drawer-root' });
  const menuDrawerRoot = el('div', { class: 'gpp-drawer-root gpp-menu-drawer-root' });
  const tracksDrawerRoot = el('div', { class: 'gpp-drawer-root gpp-tracks-drawer-root' });
  const annoDrawerRoot = el('div', { class: 'gpp-drawer-root gpp-anno-drawer-root' });
  const metroDrawerRoot = el('div', { class: 'gpp-drawer-root gpp-metro-drawer-root' });
  const helpDrawerRoot = el('div', { class: 'gpp-drawer-root gpp-help-drawer-root' });
  const backingDrawerRoot = el('div', { class: 'gpp-drawer-root gpp-backing-drawer-root' });
  const tracksMixerHost = el('div', { class: 'gpp-tracks-drawer-mount' });
  const backingHost = el('div', { class: 'gpp-tracks-drawer-mount gpp-backing-mount' });
  // Popovers anchor inside this host, so their positions count from the
  // score pane, and they paint over the transport.
  const popoverHost = el('div', { class: 'gpp-popover-host' });
  scorePane.append(scoreBody);

  const analysisResultsEl = el('div', {
    class: 'gpp-analysis-results ta-results',
    html: '<div class="quiz-card"><p class="ta-muted">Open Analysis from the menu to see key, chord, scale, and technique breakdown.</p></div>',
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
  const selectionHost = el('div', { class: 'gpp-selection-host' });
  const followHost = el('div', { class: 'gpp-follow-host' });
  scorePane.append(
    selectionHost,
    followHost,
    transportHost,
    popoverHost,
    drawerRoot,
    menuDrawerRoot,
    tracksDrawerRoot,
    annoDrawerRoot,
    metroDrawerRoot,
    helpDrawerRoot,
    backingDrawerRoot,
  );
  stagePane.append(stageContent);

  const chrome = el('div', { class: 'gpp-chrome' });
  chrome.append(header, stagePane);

  const exerciseImportRoot = exerciseImportCapable ? el('div', { class: 'gpi-mount' }) : null;
  host.append(chrome);
  if (exerciseImportRoot) document.body.appendChild(exerciseImportRoot);

  const uidPrefix = uid('gpp');

  // ---- sub-mounts (wired after player helpers) ----
  let parchment = null;
  let transport = null;
  let trackSelector = null;
  let selectionToolbar = null;
  let followButton = null;
  let practicePop = null;
  let displayPop = null;
  let panelManager = null;
  let shortcutHelp = null;
  let trackMixer = null;
  let settingsDrawer = null;
  let metronomePanel = null;
  let playerMenu = null;
  let tracksDrawer = null;
  let annoDrawer = null;
  let backingDrawer = null;
  let backingPanel = null;
  let importPanel = null;
  let loopSnapshot = null;
  let externalLoopSnapshot = null;
  let lastRangeLoop = null;
  let loopController = null;
  let layoutMetrics = null;
  let viewMode = loadViewMode();
  let analysisTrackKey = '';
  let noteDraftSelection = null;
  let highlightedAnnoId = null;
  let noteSelectActive = false;
  let notationView = initialShowStandardNotation == null
    ? (session?.viewMode === 'both' ? 'both' : loadNotationView())
    : (initialShowStandardNotation ? 'both' : 'tab');
  let parchmentZoomLimit = Infinity;
  let reducedMotion = false;
  let reducedMotionMq = null;
  let reducedMotionHandler = null;
  let lastAnnouncedBar = -1;
  let lastKnownBar = 0;
  let lastKnownBeat = 0;
  let focusMode = false;
  let visibilityFlushHandler = null;
  const sessionWriter = createSessionWriter(scoreKey);
  panelManager = createPanelManager();
  countInDisplay = createCountInDisplay();

  function showStandardNotation() {
    return notationView === 'both';
  }

  function trackAnalysisKey() {
    return `${state.viewKind}:${state.viewIndex}`;
  }

  function closeOtherOverlays(except = null) {
    const ids = ['menu', 'settings', 'tracks', 'notes', 'metro', 'help', 'import', 'backing', 'trackpick', 'display', 'practice'];
    for (const id of ids) {
      if (except === id) continue;
      panelManager?.close(id);
    }
    if (except !== 'transport') transport?.closePopovers?.();
    transport?.sync();
    trackSelector?.sync();
  }

  function syncReducedMotion() {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    host.classList.toggle('gpp-reduced-motion', reducedMotion);
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
      playerMenu?.sync();
      return;
    }
    viewMode = mode;
    persistViewMode(mode);
    applyViewModeClasses(host, mode);
    playerMenu?.sync();
    placeTransport();
    if (shouldAnalyze && viewModeNeedsAnalysis(mode)) maybeRunAnalysis({ force: true });
    requestAnimationFrame(() => {
      refreshScoreSurface();
      layoutMetrics?.refresh();
      transport?.publishPad?.();
    });
  }

  applyViewModeClasses(host, viewMode);
  placeTransport();

  function currentTrackLabel() {
    if (state.viewKind === 'drum') {
      const t = state.gp.drumTracks?.[state.viewIndex];
      return t ? t.name : 'Drums';
    }
    const t = state.gp.tracks?.[state.viewIndex];
    return t ? t.name : 'Track';
  }

  function emitPracticeSettings() {
    if (!isAlive()) return;
    if (typeof onPracticeSettingsChange !== 'function') return;
    onPracticeSettingsChange(stateController.toPersistable());
  }

  // ---- session persistence ----
  function sessionRecord() {
    return {
      trackKind: state.viewKind,
      trackIndex: state.viewIndex,
      beat: lastKnownBeat,
      viewMode: notationView,
      zoom: state.parchmentZoom,
      speedRatio: stateController.getSpeedRatio(),
      loop: state.loopEnabled && state.loopStartBeat != null && state.loopEndBeat != null
        ? { enabled: true, startBeat: state.loopStartBeat, endBeat: state.loopEndBeat }
        : (lastRangeLoop ? { enabled: false, ...lastRangeLoop } : null),
      mixer: {
        // A solo is temporary: the saved mute states are the ones under it.
        mutedGuitars: (state.solo ? state.solo.savedGuitars : state.enabledGuitars).map((on) => !on),
        mutedDrums: (state.solo ? state.solo.savedDrums : state.enabledDrums).map((on) => !on),
        volumeGuitars: [...state.trackVolumes.guitars],
        volumeDrums: [...state.trackVolumes.drums],
      },
      backingActive: backingPanel?.isActive?.() ?? null,
    };
  }

  function persistSession({ now = false } = {}) {
    if (!scoreKey || !isAlive()) return;
    sessionWriter.write(sessionRecord());
    if (now) sessionWriter.flush();
  }

  function buildGuitarModels() {
    return state.gp.tracks.map((t, i) => {
      if (i === state.trackIndex && state.viewModel?.strings) return state.viewModel;
      return t.model;
    });
  }

  // The score shows the selected track only.
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
    },
    onFinish: () => {
      if (!isAlive()) return;
      player.pause();
      transport?.sync();
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
  let suppressPlaybackEnd = false;
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
  // itself, the same clock the scheduler uses.
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

  let annotationCache = null;

  function currentAnnotations() {
    if (!scoreKey) return [];
    if (!annotationCache) annotationCache = listAnnotations(scoreKey);
    return annotationCache;
  }

  function invalidateAnnotationCache() {
    annotationCache = null;
  }

  function followActive() {
    return stateController.isFollowing() && !reducedMotion;
  }

  function rangeDraftForCanvas() {
    if (!stateController.hasSelection()) return null;
    return { startBeat: state.selection.startBeat, endBeat: state.selection.endBeat };
  }

  function canvasFrame(extra = {}) {
    return {
      selection: parchmentSelection(),
      rangeDraft: rangeDraftForCanvas(),
      noteDraft: noteDraftSelection
        ? { startBeat: noteDraftSelection.startBeat, endBeat: noteDraftSelection.endBeat }
        : null,
      loopSelectMode: !!state.loopSelectMode,
      noteSelectMode: noteSelectActive,
      zoom: state.parchmentZoom,
      autoFollow: followActive(),
      annotations: currentAnnotations(),
      highlightedAnnotationId: highlightedAnnoId,
      ...extra,
    };
  }

  function syncPlayheadFrame(pos, { resting = lastTickResting } = {}) {
    if (!isAlive() || !pos) return;
    const secDisplay = quartersToSeconds(pos.beatInScore, state.bpm);
    lastKnownBeat = pos.beatInScore;
    if (Number.isFinite(pos.barIndex)) lastKnownBar = pos.barIndex;
    parchment?.update(canvasFrame({
      currentSec: secDisplay,
      beatInScore: pos.beatInScore,
      bpm: state.bpm,
      playing: player.playing && !resting,
      measureIndex: pos.barIndex,
    }));
  }

  function applyPlayheadFrame() {
    const pos = positionFromAudioClock();
    if (pos) syncPlayheadFrame(pos);
  }

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

  let framesSinceTransportSync = 0;

  function startPlayheadFrameLoop() {
    if (!activePlaybackTimeline() || playheadFrameId != null) return;
    if (typeof requestAnimationFrame !== 'function') return;
    const tick = () => {
      if (!isAlive() || !player.playing) {
        playheadFrameId = null;
        return;
      }
      applyPlayheadFrame();
      // The bar readout on the transport follows the score at a low rate.
      framesSinceTransportSync += 1;
      if (framesSinceTransportSync >= 15) {
        framesSinceTransportSync = 0;
        transport?.sync();
        persistSession();
      }
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
      if (typeof onPlaybackTick === 'function') {
        try {
          onPlaybackTick(info);
        } catch (_) { /* embedder */ }
      }
    },
  });

  function preservedBeatFromPlayer() {
    const pos = player.getPosition?.();
    if (pos && Number.isFinite(pos.beatInScore)) return pos.beatInScore;
    const engineBpm = player.bpm ?? state.bpm;
    return (player.currentSec / 60) * engineBpm;
  }

  function secFromPreservedBeat(beat) {
    const timeline = activePlaybackTimeline();
    if (timeline?.secondsAtQuarter) return timeline.secondsAtQuarter(beat);
    return quartersToSeconds(beat, state.bpm);
  }

  function withPreservedPosition(fn) {
    const was = player.playing;
    const beat = preservedBeatFromPlayer();
    fn();
    const newSec = secFromPreservedBeat(beat);
    if (was) player.play({ fromSec: newSec });
    // A fresh mount has no position to keep, and seeking to zero would override
    // the loop start the player just picked for itself.
    else if (beat > 0) player.seek(newSec);
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
    } else if (state.loopEnabled) {
      player.setLoop({
        startBarIndex: state.loopStart,
        endBarIndex: state.loopEnd,
        restSec: state.loopRestSec,
      });
    } else {
      player.setLoop(null);
    }
    syncMetroToPlayer();
  }

  function applyBpmChange() {
    if (!isAlive()) return;
    player.setBpm(state.bpm);
    applyLoopToPlayer();
    syncPlaybackUi({
      playing: player.playing,
      currentSec: player.currentSec,
      durationSec: player.durationSec,
      measureIndex: player.measureIndex,
    });
    settingsDrawer?.sync();
    trackMixer?.sync();
    metronomePanel?.sync();
    transport?.sync();
    emitPracticeSettings();
    persistSession();
  }

  function reloadModel() {
    if (!isAlive()) return;
    suppressPlaybackEnd = true;
    try {
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
      const beat = preservedBeatFromPlayer();
      player.load(loadOpts);
      applyTrackVolumesToPlayer();
      applyTrackPansToPlayer();
      applyLoopToPlayer();
      buildPlaybackTimeline();
      const newSec = secFromPreservedBeat(beat);
      if (was) player.play({ fromSec: newSec });
      else if (beat > 0) player.seek(newSec);

      refreshScoreSurface();
      syncMetroToPlayer();
      emitPracticeSettings();
    } catch (err) {
      showAlert(err?.message || 'Could not load the score view.');
      console.error(err);
    } finally {
      suppressPlaybackEnd = false;
    }
  }

  function refreshScoreSurface() {
    if (!isAlive()) return;
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

  function selectionWithMeasures() {
    if (!stateController.hasSelection()) return null;
    const measures = state.viewModel?.measures || [];
    const { startIdx, endIdx } = measureIndicesForBeats(
      measures,
      state.selection.startBeat,
      state.selection.endBeat,
    );
    return {
      startBeat: state.selection.startBeat,
      endBeat: state.selection.endBeat,
      measureStart: startIdx,
      measureEnd: endIdx,
    };
  }

  function getCurrentSelection() {
    if (noteDraftSelection) return { ...noteDraftSelection };
    const marked = selectionWithMeasures();
    if (marked) return marked;
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
    if (playing && Number.isFinite(measureIndex) && measureIndex !== lastAnnouncedBar) {
      lastAnnouncedBar = measureIndex;
    }
    if (!playing) lastAnnouncedBar = -1;
    lastTickResting = !!resting;
    lastRestRemaining = Number(restRemaining) || 0;
    // The frame loop owns the score view while playback runs.
    if (playheadFrameId == null) {
      const tickPos = activePlaybackTimeline()?.positionAtSeconds(currentSec) ?? null;
      if (tickPos) {
        lastKnownBeat = tickPos.beatInScore;
        lastKnownBar = tickPos.barIndex;
      } else if (Number.isFinite(measureIndex)) {
        lastKnownBar = measureIndex;
      }
      parchment?.update(canvasFrame({
        currentSec,
        beatInScore: tickPos?.beatInScore,
        bpm: state.bpm,
        playing: playing && !resting,
        measureIndex: tickPos ? tickPos.barIndex : measureIndex,
      }));
    }
    transport?.sync();
    syncFollowButton();
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
    if (suppressPlaybackEnd) {
      prevPlaybackTick = { playing: cur.playing, currentSec: cur.currentSec, durationSec: cur.durationSec };
      return;
    }
    const prevDur = prevPlaybackTick.durationSec || cur.durationSec;
    const curDur = cur.durationSec || prevDur;
    const prevNearEnd = prevDur > 0 && prevPlaybackTick.currentSec >= prevDur - PLAYBACK_END_EPSILON;
    const curNearEnd = curDur > 0 && cur.currentSec >= curDur - PLAYBACK_END_EPSILON;
    const naturalEnd = prevPlaybackTick.playing
      && !cur.playing
      && !cur.resting
      && !state.loopEnabled
      && prevNearEnd
      && curNearEnd
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

  function currentBarIndex() {
    if (player.playing) return lastKnownBar;
    return navMeasureIndex();
  }

  function isPendingPlayback() {
    return countInTimer != null
      || autoPlayTimer != null
      || (countInDisplay != null && countInDisplay.remaining > 0);
  }

  // ---- follow ----
  function syncFollowButton() {
    const show = !!state.follow.enabled && !!state.follow.suspended;
    followButton?.setVisible(show);
  }

  function resumeFollow({ scroll = true } = {}) {
    stateController.resumeFollow();
    parchment?.resumeAutoFollow?.();
    if (scroll) parchment?.scrollToBeat?.(lastKnownBeat, { center: true });
    syncFollowButton();
  }

  function onCanvasFollowChange(suspended) {
    if (!isAlive()) return;
    if (suspended) {
      // A scroll while paused is plain reading: the sheet stays where the
      // user put it, and follow is not suspended. Only a scroll during
      // playback suspends follow, and the pill offers the way back.
      if (!player.playing) {
        parchment?.resumeAutoFollow?.();
        return;
      }
      stateController.suspendFollow('user-scroll');
    } else {
      stateController.resumeFollow();
    }
    syncFollowButton();
  }

  // ---- seeking ----
  function afterSeek(beat, measureIndex) {
    lastKnownBeat = beat;
    lastKnownBar = measureIndex;
    announce(`Bar ${measureIndex + 1}`);
    // A seek is a request to read there, so follow comes back.
    stateController.resumeFollow();
    parchment?.resumeAutoFollow?.();
    parchment?.scrollToBeat?.(beat);
    syncFollowButton();
    persistSession();
  }

  function seekToBar(barIndex, { autoplay = false } = {}) {
    if (!isAlive()) return;
    try {
      const measures = state.viewModel?.measures || [];
      if (!measures.length) return;
      const scope = stateController.getScope();
      const i = Math.max(scope.start, Math.min(scope.end, barIndex));
      state.navBar = i;
      const beats = beatsFromMeasureRange(measures, i, i);
      const startSec = quartersToSeconds(beats.startBeat, state.bpm);
      if (autoplay || player.playing) {
        clearCountIn();
        ensureAudio();
        bindPlayheadClockListeners();
        player.play({ fromSec: startSec });
      } else player.seek(startSec);
      syncPlaybackUi({
        playing: player.playing,
        currentSec: startSec,
        durationSec: player.durationSec,
        measureIndex: i,
      });
      afterSeek(beats.startBeat, i);
    } catch (err) {
      showAlert(err?.message || 'Playback failed.');
      console.error(err);
    }
  }

  function seekToBeat(beat, { autoplay = false } = {}) {
    if (!isAlive()) return;
    try {
      const measures = state.viewModel?.measures || [];
      const quarterBeat = Number(beat);
      if (!Number.isFinite(quarterBeat)) return;
      const timeline = activePlaybackTimeline();
      const fromSec = timeline?.secondsAtQuarter
        ? timeline.secondsAtQuarter(quarterBeat)
        : quartersToSeconds(quarterBeat, state.bpm);
      let measureIndex = 0;
      if (measures.length) {
        const scope = stateController.getScope();
        const idx = measureIndexAtBeat(measures, quarterBeat);
        measureIndex = Math.max(scope.start, Math.min(scope.end, idx));
        state.navBar = measureIndex;
      }
      if (autoplay || player.playing) {
        clearCountIn();
        ensureAudio();
        bindPlayheadClockListeners();
        player.play({ fromSec });
      } else player.seek(fromSec);
      syncPlaybackUi({
        playing: player.playing,
        currentSec: fromSec,
        durationSec: player.durationSec,
        measureIndex,
      });
      afterSeek(quarterBeat, measureIndex);
    } catch (err) {
      showAlert(err?.message || 'Playback failed.');
      console.error(err);
    }
  }

  /** The beat columns of the viewed track, sorted and unique. */
  function beatColumns() {
    const starts = new Set();
    for (const ev of state.viewModel?.events || []) {
      const b = Number(ev.start);
      if (Number.isFinite(b)) starts.add(Math.round(b * 1000) / 1000);
    }
    for (const m of state.viewModel?.measures || []) {
      if (Number.isFinite(m.startBeat)) starts.add(Math.round(m.startBeat * 1000) / 1000);
    }
    return [...starts].sort((a, b) => a - b);
  }

  function stepBeat(dir) {
    const cols = beatColumns();
    if (!cols.length) return;
    const cur = Math.round(lastKnownBeat * 1000) / 1000;
    let target = null;
    if (dir > 0) target = cols.find((b) => b > cur + 1e-6);
    else {
      for (const b of cols) if (b < cur - 1e-6) target = b;
    }
    if (target == null) return;
    seekToBeat(target, { autoplay: player.playing });
  }

  function onSettingsChange(patch = {}) {
    if (!isAlive()) return;
    if (patch.reload) reloadModel();
    else if (patch.loopRest) {
      player.setLoopRestSec(state.loopRestSec);
      applyLoopToPlayer();
    } else if (patch.metronome) {
      syncMetroToPlayer();
    } else if (patch.zoom || patch.autoFollow || patch.notation != null) {
      if (patch.notation != null) setNotationView(patch.notation ? 'both' : 'tab', { fromSettings: true });
      if (patch.autoFollow) syncFollowButton();
      parchment?.update(canvasFrame());
      if (patch.zoom) restoreReadingPosition();
    }
    settingsDrawer?.sync();
    trackMixer?.sync();
    metronomePanel?.sync();
    transport?.sync();
    displayPop?.sync?.();
    emitPracticeSettings();
    persistSession();
  }

  function restoreReadingPosition() {
    requestAnimationFrame(() => {
      if (!isAlive()) return;
      parchment?.scrollToBeat?.(lastKnownBeat);
    });
  }

  function setZoom(z) {
    stateController.setParchmentZoom(z);
    parchment?.update(canvasFrame());
    restoreReadingPosition();
    settingsDrawer?.sync();
    displayPop?.sync?.();
    persistSession();
  }

  function setNotationView(view, { fromSettings = false } = {}) {
    const next = view === 'both' ? 'both' : 'tab';
    if (next === notationView && !fromSettings) return;
    notationView = next;
    if (initialShowStandardNotation == null) persistNotationView(next);
    parchment?.setShowStandardNotation?.(next === 'both');
    restoreReadingPosition();
    displayPop?.sync?.();
    if (!fromSettings) settingsDrawer?.sync();
    persistSession();
  }

  function runAnalysis(resultsEl) {
    if (!resultsEl) return;
    if (state.viewKind !== 'guitar' || !state.viewModel?.strings) {
      resultsEl.innerHTML = '<div class="quiz-card"><p class="ta-muted">Switch to a guitar or bass track to analyze. Drum parts can’t be analyzed as tab.</p></div>';
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
    // A track switch keeps the beat, the loop, the speed, the play state, and
    // the follow state. It never restarts the song.
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
    settingsDrawer?.sync();
    trackMixer?.sync();
    trackSelector?.sync();
    displayPop?.sync?.();
    loopController?.syncFromState();
    maybeRunAnalysis();
    emitPracticeSettings();
    syncPlaybackUi({
      playing: player.playing,
      currentSec: player.currentSec,
      durationSec: player.durationSec,
      measureIndex: player.measureIndex,
    });
    restoreReadingPosition();
    persistSession();
  }

  // ---- loop ----
  function onLoopChanged() {
    if (!isAlive()) return;
    if (state.loopStartBeat != null && state.loopEndBeat != null) {
      stateController.setLoopRange(state.loopStartBeat, state.loopEndBeat);
      state.loopEnabled = true;
      if (state.loopMode !== 'song') {
        state.loopMode = 'range';
        state.loopSelectMode = true;
        rememberRangeLoop();
      }
    }
    reloadModel();
    settingsDrawer?.sync();
    parchment?.setLoopSelectMode?.(!!state.loopSelectMode);
    transport?.sync();
    persistSession();
  }

  function snapshotLoopState() {
    return {
      loopEnabled: state.loopEnabled,
      loopMode: state.loopMode,
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
    state.loopMode = snap.loopMode === 'song' ? 'song' : 'range';
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

  // ---- selection ----
  function syncSelectionUi() {
    const marked = selectionWithMeasures();
    selectionToolbar?.sync(marked);
    parchment?.setRangeDraft?.(marked ? { startBeat: marked.startBeat, endBeat: marked.endBeat } : null);
    transport?.sync();
  }

  function setSelection(startBeat, endBeat) {
    if (!stateController.setSelection(startBeat, endBeat)) return;
    syncSelectionUi();
  }

  function clearSelection() {
    if (!stateController.clearSelection()) return;
    practicePop?.close?.();
    syncSelectionUi();
  }

  /** Turn the marked range into the loop. */
  function loopSelection() {
    const marked = selectionWithMeasures();
    if (!marked) return false;
    stateController.clearSelection();
    externalLoopSnapshot = null;
    stateController.setLoopRange(marked.startBeat, marked.endBeat);
    state.loopEnabled = true;
    state.loopMode = 'range';
    state.loopSelectMode = true;
    rememberRangeLoop();
    reloadModel();
    if (!isAlive()) return true;
    settingsDrawer?.sync();
    loopController?.syncFromState();
    syncLoopSelectMode();
    syncSelectionUi();
    announce(`Loop bars ${marked.measureStart + 1} to ${marked.measureEnd + 1}`);
    return true;
  }

  function loopRangeLabel() {
    if (!state.loopEnabled || state.loopMode === 'song') {
      if (stateController.hasSelection()) {
        const marked = selectionWithMeasures();
        if (marked) return `${marked.measureStart + 1}–${marked.measureEnd + 1}`;
      }
      return '';
    }
    return `${state.loopStart + 1}–${state.loopEnd + 1}`;
  }

  // ---- mount UI modules ----
  const { guitar, perc } = parchmentModels();
  try {
    parchment = mountParchmentView(parchmentHost, {
      guitarModel: guitar,
      percModel: perc,
      zoom: state.parchmentZoom,
      autoFollow: state.autoFollow,
      loopSelectMode: !!state.loopSelectMode,
      selection: state.loopEnabled
        ? { startBeat: state.loopStartBeat, endBeat: state.loopEndBeat }
        : null,
      onBeatClick: (beat) => seekToBeat(beat, { autoplay: false }),
      onBeatDoubleClick: (beat) => seekToBeat(beat, { autoplay: true }),
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
        if (!sel) {
          clearSelection();
          return;
        }
        setSelection(sel.startBeat, sel.endBeat);
      },
      onLoopChange: (range) => {
        if (!range) return;
        loopController?.handleSelectionChange(range);
      },
      onFollowChange: (suspended) => onCanvasFollowChange(suspended),
      onZoomLimit: (limit) => {
        if (limit === parchmentZoomLimit) return;
        parchmentZoomLimit = limit;
        settingsDrawer?.sync?.();
        displayPop?.sync?.();
      },
    });
    if (typeof parchment?.getZoomLimit === 'function') {
      const seeded = parchment.getZoomLimit();
      if (typeof seeded === 'number' && Number.isFinite(seeded)) {
        parchmentZoomLimit = seeded;
      }
    }
  } catch (err) {
    parchment = null;
    showAlert('Could not draw this score.');
    console.error(err);
  }

  loopController = createLoopSelectionController({
    getState: () => state,
    applyRange: (startBeat, endBeat) => {
      if (stateController.setLoopRange(startBeat, endBeat)) {
        state.loopEnabled = true;
        state.loopMode = 'range';
        state.loopSelectMode = true;
      }
    },
    clearRange: () => stateController.clearLoop(),
    parchment,
    onLoopChanged,
  });

  trackSelector = mountTrackSelector(trackSelectorHost, popoverHost, {
    stateController,
    onSelectTrack: (kind, index) => setViewTrack(kind, index),
  });

  // ---- display popover (view + zoom) ----
  displayPop = (() => {
    const pop = createPopover(popoverHost, {
      id: 'display',
      title: 'View',
      getAnchor: () => viewBtn,
      align: 'end',
      placement: 'below',
      width: 300,
    });
    if (!pop.body) return { ...pop, sync() {} };
    const viewGroup = el('div', { class: 'gpp-segmented', role: 'radiogroup', 'aria-label': 'Notation' });
    const viewBtns = {};
    for (const [key, label] of [['tab', 'Tab'], ['both', 'Tab + Standard']]) {
      const b = el('button', {
        class: 'gpp-segment',
        type: 'button',
        role: 'radio',
        'aria-checked': 'false',
        text: label,
        onClick: () => setNotationView(key),
      });
      viewBtns[key] = b;
      viewGroup.appendChild(b);
    }
    const notationRow = el('div', { class: 'gpp-popover-section' }, [
      el('div', { class: 'gpp-popover-subtitle', text: 'Notation' }),
      viewGroup,
    ]);
    const zoomOut = el('button', { class: 'gpp-icon-btn', type: 'button', html: icon('zoomOut'), 'aria-label': 'Zoom out', title: 'Zoom out' });
    const zoom100 = el('button', { class: 'gpp-chip', type: 'button', text: '100%', 'aria-label': 'Zoom 100 percent' });
    const zoomIn = el('button', { class: 'gpp-icon-btn', type: 'button', html: icon('zoomIn'), 'aria-label': 'Zoom in', title: 'Zoom in' });
    const zoomFit = el('button', { class: 'gpp-chip', type: 'button', text: 'Fit width', 'aria-label': 'Fit the widest bar to the width' });
    const zoomOutText = el('span', { class: 'gpp-zoom-readout' });
    const zoomRow = el('div', { class: 'gpp-popover-section' }, [
      el('div', { class: 'gpp-popover-subtitle', text: 'Zoom' }),
      el('div', { class: 'gpp-zoom-row' }, [zoomOut, zoomOutText, zoomIn, zoom100, zoomFit]),
    ]);
    const stepZoom = (delta) => setZoom(Math.round((state.parchmentZoom + delta) * 100) / 100);
    zoomOut.addEventListener('click', () => stepZoom(-0.1));
    zoomIn.addEventListener('click', () => stepZoom(0.1));
    zoom100.addEventListener('click', () => setZoom(1));
    zoomFit.addEventListener('click', () => {
      const limit = Number.isFinite(parchmentZoomLimit) ? parchmentZoomLimit : 1;
      setZoom(Math.max(0.75, Math.min(2.5, Math.floor(limit * 100) / 100)));
    });
    pop.body.append(notationRow, zoomRow);
    function sync() {
      const drums = state.viewKind === 'drum';
      notationRow.hidden = drums;
      for (const [key, b] of Object.entries(viewBtns)) {
        const on = key === notationView;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      }
      const pct = Math.round(state.parchmentZoom * 100);
      zoomOutText.textContent = `${pct}%`;
      zoomOut.disabled = state.parchmentZoom <= 0.75;
      const limit = Number.isFinite(parchmentZoomLimit) ? parchmentZoomLimit : 2.5;
      zoomIn.disabled = state.parchmentZoom >= Math.min(2.5, limit);
      viewBtn.setAttribute('aria-expanded', pop.isOpen() ? 'true' : 'false');
    }
    return { ...pop, sync, open: (o) => { sync(); pop.open(o); }, toggle: (o) => { sync(); pop.toggle(o); } };
  })();
  viewBtn.addEventListener('click', () => {
    if (displayPop.isOpen()) {
      displayPop.close();
    } else {
      closeOtherOverlays('display');
      displayPop.open(viewBtn);
    }
  });

  selectionToolbar = mountSelectionToolbar(selectionHost, {
    onLoop: () => loopSelection(),
    onPractice: () => {
      closeOtherOverlays('practice');
      practicePop?.open?.(selectionToolbar.element.querySelector('.gpp-selection-practice'));
    },
    onNote: scoreKey ? () => {
      const marked = selectionWithMeasures();
      if (!marked) return;
      noteDraftSelection = marked;
      highlightedAnnoId = null;
      closeOtherOverlays('notes');
      annoDrawer?.open();
      annoDrawer?.showEditor({ ...marked });
      syncNoteSelectMode();
    } : null,
    onClear: () => clearSelection(),
  });

  practicePop = mountPracticePopover(popoverHost, {
    getAnchor: () => selectionToolbar?.element?.querySelector?.('.gpp-selection-practice') || transport?.elements?.loopBtn || null,
    getRange: () => selectionWithMeasures() || getCurrentSelection(),
    getScoreBpm: () => state.scoreBpm,
    getSpeedPct: () => speedPctFor(state.bpm, state.scoreBpm),
    onStart: (plan) => startPracticeBlock(plan),
    onSaveExercise: typeof onSaveRange === 'function' ? () => {
      loopSelection();
      onSaveRange(getCurrentSelection());
    } : null,
  });

  function startPracticeBlock(plan) {
    if (!isAlive()) return;
    if (stateController.hasSelection()) loopSelection();
    if (!state.loopEnabled) return;
    tempoRamp.stopSession();
    setSpeedPct(plan.startPct);
    if (plan.ramp) {
      const score = Number(state.scoreBpm) || 120;
      state.tempoRamp = {
        ...state.tempoRamp,
        enabled: true,
        startBpm: state.bpm,
        targetBpm: clampBpm(Math.round(score * plan.ramp.targetPct / 100)),
        stepBpm: Math.max(1, Math.round(score * plan.ramp.stepPct / 100)),
        intervalMode: 'loops',
        intervalValue: plan.ramp.everyLoops,
        holdAtTarget: true,
      };
    } else if (state.tempoRamp.enabled) {
      state.tempoRamp = { ...state.tempoRamp, enabled: false };
    }
    stateController.persistMetroPrefs?.();
    metronomePanel?.sync();
    seekToBar(state.loopStart, { autoplay: true });
  }

  followButton = mountFollowButton(followHost, {
    onFollow: () => resumeFollow(),
  });

  function setSpeedPct(pct) {
    tempoRamp.stopSession();
    state.bpmUserOverride = true;
    const clamped = clampSpeedPct(pct);
    state.bpm = clampBpm(Math.round(state.scoreBpm * (clamped / 100)));
    state.bpmUserOverride = Math.round(state.bpm) !== Math.round(state.scoreBpm);
    applyBpmChange();
  }

  transport = mountTransportDock(transportHost, {
    extraNode: transportExtra,
    overlayHost: popoverHost,
    onPlayPause: () => togglePlayPause(),
    onRestart: () => restartPlayback(),
    onPrevBar: () => {
      const scope = stateController.getScope();
      const cur = currentBarIndex();
      if (canPrevMeasure(cur, scope)) seekToBar(cur - 1, { autoplay: player.playing });
    },
    onNextBar: () => {
      const scope = stateController.getScope();
      const cur = currentBarIndex();
      if (canNextMeasure(cur, scope)) seekToBar(cur + 1, { autoplay: player.playing });
    },
    canPrev: () => canPrevMeasure(currentBarIndex(), stateController.getScope()),
    canNext: () => canNextMeasure(currentBarIndex(), stateController.getScope()),
    getCurrentBar: () => currentBarIndex(),
    getMeasureCount: () => (state.viewModel?.measures || []).length,
    getSections: () => sectionsFromMarkers((state.viewModel?.measures || []).map((m) => m.marker || null)),
    onGoToBar: (i) => seekToBar(i, { autoplay: player.playing }),
    onBpmInput: (value) => {
      tempoRamp.stopSession();
      state.bpmUserOverride = true;
      state.bpm = clampBpm(Number(value) || state.scoreBpm);
      state.bpmUserOverride = Math.round(state.bpm) !== Math.round(state.scoreBpm);
      applyBpmChange();
    },
    onSpeedPct: (pct) => setSpeedPct(pct),
    onTempoReset: () => {
      tempoRamp.stopSession();
      stateController.resetBpm();
      applyBpmChange();
    },
    onOpenTempoRamp: () => {
      closeOtherOverlays('metro');
      panelManager.open('metro');
    },
    getBpm: () => state.bpm,
    getScoreBpm: () => state.scoreBpm,
    getPlaying: () => player.playing,
    getPending: () => isPendingPlayback(),
    getTimeLabel: () => `${fmtTime(player.currentSec)} / ${fmtTime(player.durationSec)}`,
    getRampStatusLabel: () => rampStatusLabel(),
    getOverlayLabel: () => practiceOverlayLabel(lastTickResting, lastRestRemaining),
    getLoopMode: () => currentLoopMode(),
    getLoopRangeLabel: () => loopRangeLabel(),
    hasLoopRange: () => stateController.hasSelection()
      || !!lastRangeLoop
      || (state.loopEnabled && state.loopMode !== 'song'),
    onLoopToggle: () => toggleLoop(),
    onLoopRange: () => setLoopMode('range'),
    onLoopSong: () => setLoopMode('song'),
    onLoopOff: () => setLoopMode('off'),
    getMetroEnabled: () => !!state.metro.enabled,
    onMetroToggle: () => toggleMetronome(),
    onOpenMetronome: () => {
      closeOtherOverlays('metro');
      panelManager.open('metro');
    },
    getCountInEnabled: () => !!state.metro.countInEnabled,
    getBackingAvailable: () => !!backingPanel?.hasSource(),
    getBackingActive: () => !!backingPanel?.isActive(),
    onBackingToggle: () => backingPanel?.toggleActive(),
    onOpenMixer: () => toggleMixer(),
    isMixerOpen: () => panelManager.isOpen('tracks'),
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

  function toggleMixer() {
    if (panelManager.isOpen('tracks')) {
      panelManager.close('tracks');
    } else {
      closeOtherOverlays('tracks');
      panelManager.open('tracks');
    }
    scorePane.classList.toggle('has-mixer-open', panelManager.isOpen('tracks'));
    transport?.sync();
  }

  function toggleMetronome() {
    state.metro.enabled = !state.metro.enabled;
    syncMetroMirrors();
    stateController.persistMetroPrefs?.();
    onSettingsChange({ metronome: true });
    announce(state.metro.enabled ? 'Metronome on' : 'Metronome off');
  }

  function toggleCountIn() {
    state.metro.countInEnabled = !state.metro.countInEnabled;
    syncMetroMirrors();
    stateController.persistMetroPrefs?.();
    onSettingsChange({ metronome: true });
    announce(state.metro.countInEnabled ? 'Count-in on' : 'Count-in off');
  }

  tracksDrawer = mountTracksDrawerShell(tracksDrawerRoot, {
    title: 'Mixer',
    bodyEl: tracksMixerHost,
    onClose: () => {
      scorePane.classList.remove('has-mixer-open');
      transport?.sync();
    },
  });

  backingDrawer = mountTracksDrawerShell(backingDrawerRoot, {
    title: 'Original recording',
    bodyEl: backingHost,
  });

  try {
    backingPanel = mountBackingPanel(backingHost, {
      getScoreKey: () => scoreKey,
      getClock: () => {
        const anchor = player.getClockAnchor?.();
        return {
          songSec: songSecFromAudioClock(),
          rate: player.rate ?? 1,
          playing: !!player.playing,
          holding: !!anchor && anchor.holdSec != null,
        };
      },
      onActiveChange: (mute) => {
        player.setNotesMuted?.(mute);
      },
      onChange: () => {
        transport?.sync();
        persistSession();
      },
    });
    transport?.sync();
  } catch (e) {
    console.error(e);
  }

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
        persistSession();
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
      getShowNotation: () => showStandardNotation(),
      getZoomLimit: () => parchmentZoomLimit,
      onSpeedPct: (value) => setSpeedPct(value),
      onTempoReset: () => {
        tempoRamp.stopSession();
        stateController.resetBpm();
        applyBpmChange();
      },
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
      onOpenBacking: () => {
        closeOtherOverlays('backing');
        panelManager.open('backing');
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
      onToggleFocus: () => toggleFocusMode(),
      isFocusMode: () => focusMode,
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
    panelManager.register('backing', backingDrawer);
    panelManager.register('trackpick', trackSelector);
    panelManager.register('display', displayPop);
    panelManager.register('practice', practicePop);
  } catch (e) {
    console.error(e);
  }

  if (exerciseImportCapable && exerciseImportRoot) {
    try {
      importPanel = mountExerciseImportPanel(exerciseImportRoot, {
        getDigests: () => {
          const models = parchmentModels();
          return buildMeasureDigests({ guitarModel: models.guitar, percModel: models.perc });
        },
        getScoreTitle: () => title,
        getTrackLabel: () => currentTrackLabel(),
        getBpm: () => state.bpm,
        getAnnotations: () => (scoreKey ? listAnnotations(scoreKey) : []),
        getFolders: () => exerciseImport.getFolders?.() ?? [],
        getDefaultFolder: () => exerciseImport.getDefaultFolder?.() ?? '',
        onCreateFolder: typeof exerciseImport.createFolder === 'function'
          ? (name) => exerciseImport.createFolder(name)
          : null,
        onPreview: (startIdx, endIdx) => {
          stateController.setLoopMeasures(startIdx, endIdx);
          state.loopEnabled = true;
          state.loopMode = 'range';
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

  // ---- focus mode ----
  function toggleFocusMode(force) {
    const next = typeof force === 'boolean' ? force : !focusMode;
    if (next === focusMode) return;
    focusMode = next;
    host.classList.toggle('gpp-focus', focusMode);
    if (typeof document !== 'undefined') {
      document.documentElement?.classList?.toggle(FOCUS_CLASS, focusMode);
    }
    playerMenu?.sync();
    requestAnimationFrame(() => {
      layoutMetrics?.refresh();
      transport?.publishPad?.();
    });
  }

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
    transport?.sync();
  }

  function startPlayFromNav() {
    const measures = state.viewModel?.measures || [];
    const scope = stateController.getScope();
    const navIdx = state.navBar == null ? scope.start : state.navBar;
    state.navBar = navIdx;
    const beats = beatsFromMeasureRange(measures, navIdx, navIdx);
    // A play after a beat seek starts at that beat, not at the bar line.
    const startBeat = (lastKnownBeat >= beats.startBeat && lastKnownBeat < beats.endBeat)
      ? lastKnownBeat
      : beats.startBeat;
    const startSec = quartersToSeconds(startBeat, state.bpm);
    ensureAudio();
    bindPlayheadClockListeners();
    syncMetroToPlayer();
    try {
      player.play({ fromSec: startSec });
    } catch (err) {
      showAlert(err?.message || 'Playback failed.');
      console.error(err);
    }
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
    transport?.sync();
    if (countInOverlayTimer != null) clearInterval(countInOverlayTimer);
    countInOverlayTimer = setInterval(() => {
      if (!isAlive()) return;
      countInDisplay.tick();
      transport?.sync();
    }, quarterSec * 1000);
    countInTimer = setTimeout(() => {
      countInTimer = null;
      if (countInOverlayTimer != null) {
        clearInterval(countInOverlayTimer);
        countInOverlayTimer = null;
      }
      countInDisplay.clear();
      transport?.sync();
      if (!isAlive()) return;
      if (!prevMetro) player.setMetronomeEnabled(false);
      onDone?.();
    }, quarterSec * beats * 1000 + 40);
  }

  function beginPlaybackSession() {
    rampRestoreBpm = state.bpm;
    if (state.tempoRamp.enabled) tempoRamp.startSession(state.bpm);
  }

  function startPlaybackNow() {
    ensureAudio();
    bindPlayheadClockListeners();
    beginPlaybackSession();
    try {
      startPlayFromNav();
    } catch (err) {
      showAlert(err?.message || 'Playback failed.');
      console.error(err);
    }
  }

  function startPlayback() {
    if (!player.playing) togglePlayPause();
  }

  function stepBpm(delta) {
    if (!isAlive()) return;
    tempoRamp.stopSession();
    state.bpmUserOverride = true;
    state.bpm = clampBpm(state.bpm + delta);
    applyBpmChange();
  }

  function togglePlayPause() {
    if (!isAlive()) return;
    if (player.playing) {
      lastUserStopAt = Date.now();
      clearCountIn();
      tempoRamp.pauseSession();
      stopPlayheadFrameLoop();
      try {
        player.pause();
      } catch (err) {
        showAlert(err?.message || 'Playback failed.');
        console.error(err);
      }
      transport?.sync();
      persistSession({ now: true });
      return;
    }
    // A play resumes follow: the user asked to hear from here.
    stateController.resumeFollow();
    parchment?.resumeAutoFollow?.();
    syncFollowButton();
    if (player.paused) {
      ensureAudio();
      bindPlayheadClockListeners();
      tempoRamp.resumeSession();
      try {
        player.play();
      } catch (err) {
        showAlert(err?.message || 'Playback failed.');
        console.error(err);
      }
      transport?.sync();
      return;
    }
    if (state.metro.countInEnabled && !skipCountIn) {
      ensureAudio();
      bindPlayheadClockListeners();
      runCountIn(() => {
        if (!isAlive()) return;
        beginPlaybackSession();
        startPlayFromNav();
      });
      return;
    }
    startPlaybackNow();
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
    lastKnownBeat = beats.startBeat;
    transport?.sync();
    persistSession({ now: true });
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

  function isEditableTarget(t) {
    if (!t) return false;
    const tag = t.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return true;
    if (t.isContentEditable) return true;
    const role = t.getAttribute?.('role');
    return role === 'textbox' || role === 'combobox' || role === 'listbox' || role === 'slider';
  }

  function anyPanelOpen() {
    const ids = ['menu', 'settings', 'tracks', 'notes', 'metro', 'help', 'import', 'backing', 'trackpick', 'display', 'practice'];
    return ids.some((id) => panelManager.isOpen(id)) || !!transport?.isPopoverOpen?.();
  }

  if (enableHostKeyboard) {
    keyHandler = (e) => {
      if (!isAlive()) return;
      if (isEditableTarget(e.target)) return;
      const section = host.closest('.section.active');
      if (!section && !host.contains(document.activeElement)) return;
      if (e.ctrlKey || e.metaKey) return;

      const key = e.key;
      if (key === '?' || (key === '/' && e.shiftKey)) {
        e.preventDefault();
        closeOtherOverlays('help');
        panelManager.open('help');
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.code === 'Escape') {
        if (anyPanelOpen()) {
          e.preventDefault();
          closeOtherOverlays();
        } else if (stateController.hasSelection()) {
          e.preventDefault();
          clearSelection();
        } else if (player.playing) {
          e.preventDefault();
          stopPlayback();
        }
      } else if (e.code === 'Home' || e.code === 'Backspace') {
        e.preventDefault();
        restartPlayback();
      } else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.preventDefault();
        const dir = e.code === 'ArrowLeft' ? -1 : 1;
        if (e.shiftKey) {
          const scope = stateController.getScope();
          const cur = currentBarIndex();
          if (dir < 0 && canPrevMeasure(cur, scope)) seekToBar(cur - 1, { autoplay: player.playing });
          if (dir > 0 && canNextMeasure(cur, scope)) seekToBar(cur + 1, { autoplay: player.playing });
        } else {
          stepBeat(dir);
        }
      } else if (key === 't' || key === 'T') {
        e.preventDefault();
        if (trackSelector?.isOpen()) trackSelector.close();
        else {
          closeOtherOverlays('trackpick');
          trackSelector?.open();
        }
      } else if (key === 's' || key === 'S') {
        e.preventDefault();
        closeOtherOverlays('transport');
        transport?.openSpeed?.();
      } else if (key === 'l' || key === 'L') {
        e.preventDefault();
        if (e.shiftKey) setLoopMode('off');
        else toggleLoop();
      } else if (key === 'm' || key === 'M' || (e.altKey && (e.code === 'KeyM'))) {
        e.preventDefault();
        if (e.altKey) toggleSoloViewed();
        else toggleMuteViewed();
      } else if (key === 'c' || key === 'C') {
        e.preventDefault();
        toggleCountIn();
      } else if (key === 'n' || key === 'N') {
        e.preventDefault();
        toggleMetronome();
      } else if (key === 'x' || key === 'X') {
        e.preventDefault();
        toggleMixer();
      } else if (key === 'f' || key === 'F') {
        e.preventDefault();
        if (state.follow.suspended) resumeFollow();
        else toggleFocusMode();
      } else if (key >= '1' && key <= '9') {
        const idx = Number(key) - 1;
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

  function toggleMuteViewed() {
    const kind = state.viewKind;
    const index = state.viewIndex;
    const enabled = kind === 'guitar' ? state.enabledGuitars[index] : state.enabledDrums[index];
    stateController.setTrackEnabled(kind, index, !enabled);
    applyMixToPlayer();
    announce(!enabled ? 'Track unmuted' : 'Track muted');
  }

  function toggleSoloViewed() {
    stateController.toggleSolo(state.viewKind, state.viewIndex);
    applyMixToPlayer();
    announce(state.solo ? 'Solo on' : 'Solo off');
  }

  function applyMixToPlayer() {
    withPreservedPosition(() => {
      const { enabledGuitars, enabledDrums } = stateController.getEffectiveEnabled();
      enabledGuitars.forEach((on, i) => player.setTrackEnabled('guitar', i, on));
      enabledDrums.forEach((on, i) => player.setTrackEnabled('drum', i, on));
    });
    trackMixer?.sync();
    emitPracticeSettings();
    persistSession();
  }

  syncReducedMotion();
  if (typeof window !== 'undefined' && window.matchMedia) {
    reducedMotionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionHandler = () => syncReducedMotion();
    reducedMotionMq.addEventListener?.('change', reducedMotionHandler);
  }
  parchment?.setShowStandardNotation?.(showStandardNotation());

  // Initial load
  try {
    host.classList.remove('is-loading');
    reloadModel();
    trackSelector?.sync();
    loopController.syncFromState();
    syncLoopSelectMode();
    if (viewModeNeedsAnalysis(viewMode)) maybeRunAnalysis({ force: true });
    if (immersiveSection) {
      layoutMetrics = installGppLayoutMetrics({ host, chrome, section: immersiveSection });
    }
    layoutMetrics?.refresh();
    transport?.publishPad?.();
    // A returning score opens where practice stopped: paused, centred, silent.
    if (session && session.beat > 0 && !autoPlay) {
      const measures = state.viewModel?.measures || [];
      const total = state.viewModel?.totalBeats ?? measures[measures.length - 1]?.endBeat ?? 0;
      if (session.beat < total) {
        seekToBeat(session.beat, { autoplay: false });
        requestAnimationFrame(() => {
          if (!isAlive()) return;
          parchment?.scrollToBeat?.(session.beat, { center: true });
        });
      }
    }
    displayPop?.sync?.();
  } catch (err) {
    showAlert(err?.message || 'Could not load the score view.');
    console.error(err);
  }

  if (typeof document !== 'undefined' && scoreKey) {
    visibilityFlushHandler = () => {
      if (document.visibilityState === 'hidden') persistSession({ now: true });
    };
    document.addEventListener('visibilitychange', visibilityFlushHandler);
  }

  if (autoPlay) {
    autoPlayTimer = setTimeout(() => {
      autoPlayTimer = null;
      if (!isAlive()) return;
      startPlayback();
    }, 0);
  }

  function reapplyExternalLoop(snap) {
    state.loopEnabled = true;
    state.loopMode = snap.loopMode === 'song' ? 'song' : 'range';
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
      state.loopMode = 'range';
    }
    state.loopSelectMode = state.loopEnabled && state.loopMode === 'range';
    reloadModel();
    if (!isAlive()) return;
    settingsDrawer?.sync();
    loopController?.syncFromState();
    syncLoopSelectMode();
    persistSession();
  }

  function rememberRangeLoop() {
    if (state.loopMode === 'song') return;
    if (state.loopStartBeat == null || state.loopEndBeat == null) return;
    lastRangeLoop = { startBeat: state.loopStartBeat, endBeat: state.loopEndBeat };
  }

  function currentLoopMode() {
    if (!state.loopEnabled) return 'off';
    return state.loopMode === 'song' ? 'song' : 'range';
  }

  /** The span a new range loop starts with: the play position and three bars. */
  function defaultRangeBeats() {
    const measures = state.viewModel?.measures || [];
    if (!measures.length) return null;
    const scope = stateController.getScope();
    const first = Math.max(0, Math.min(measures.length - 1, scope.start ?? 0));
    const last = Math.max(first, Math.min(measures.length - 1, scope.end ?? measures.length - 1));
    const start = Math.max(first, Math.min(last, currentBarIndex() ?? first));
    const end = Math.min(last, start + 3);
    const startBeat = measures[start]?.startBeat;
    const endBeat = measures[end]?.endBeat;
    if (!Number.isFinite(startBeat) || !Number.isFinite(endBeat) || endBeat <= startBeat) return null;
    return { startBeat, endBeat };
  }

  function songBeats() {
    const measures = state.viewModel?.measures || [];
    if (!measures.length) return null;
    const startBeat = measures[0]?.startBeat ?? 0;
    const endBeat = state.viewModel?.totalBeats ?? measures[measures.length - 1]?.endBeat;
    if (!Number.isFinite(endBeat) || endBeat <= startBeat) return null;
    return { startBeat, endBeat };
  }

  /**
   * Put the loop in one mode. 'range' loops the marked range, or the last
   * range, or the bars at the play position. 'song' repeats the whole score.
   * 'off' clears the loop and keeps the range as a mark on the score.
   */
  function setLoopMode(mode) {
    if (!isAlive()) return;
    if (mode === 'off') {
      const wasRange = state.loopEnabled && state.loopMode !== 'song'
        && state.loopStartBeat != null && state.loopEndBeat != null;
      const keep = wasRange ? { startBeat: state.loopStartBeat, endBeat: state.loopEndBeat } : null;
      externalLoopSnapshot = snapshotLoopState();
      stateController.clearLoop();
      if (keep) stateController.setSelection(keep.startBeat, keep.endBeat);
    } else if (mode === 'song') {
      const span = songBeats();
      if (!span) return;
      stateController.setLoopRange(span.startBeat, span.endBeat);
      state.loopEnabled = true;
      state.loopMode = 'song';
      state.loopSelectMode = false;
    } else {
      if (stateController.hasSelection()) {
        loopSelection();
        return;
      }
      let span = null;
      if (state.loopEnabled && state.loopMode !== 'song'
        && state.loopStartBeat != null && state.loopEndBeat != null) {
        span = { startBeat: state.loopStartBeat, endBeat: state.loopEndBeat };
      }
      if (!span) span = lastRangeLoop || defaultRangeBeats();
      if (!span) return;
      externalLoopSnapshot = null;
      stateController.setLoopRange(span.startBeat, span.endBeat);
      state.loopEnabled = true;
      state.loopMode = 'range';
      state.loopSelectMode = true;
      rememberRangeLoop();
    }
    reloadModel();
    if (!isAlive()) return;
    settingsDrawer?.sync();
    loopController?.syncFromState();
    syncLoopSelectMode();
    syncSelectionUi();
    persistSession();
  }

  /** The transport loop button: the marked range loop on or off. */
  function toggleLoop() {
    if (currentLoopMode() !== 'off') setLoopMode('off');
    else setLoopMode('range');
  }

  function syncLoopSelectMode() {
    parchment?.setLoopSelectMode?.(!!state.loopSelectMode);
    transport?.sync();
  }

  function setBackLabel(label) {
    if (!backBtn) return;
    const text = String(label || 'Back');
    const labelEl = backBtn.querySelector('.gpp-btn-label');
    if (labelEl) labelEl.textContent = text;
    backBtn.setAttribute('aria-label', `Back to ${text.toLowerCase()}`);
    backBtn.title = `Back to ${text.toLowerCase()}`;
  }

  return {
    player,
    get backing() { return backingPanel; },
    setBackLabel,
    isLoopEnabled: () => !!state.loopEnabled,
    setLoopEnabled,
    play: startPlayback,
    stop: stopPlayback,
    togglePlayPause,
    seekToBar,
    seekToBeat,
    isPendingPlayback,
    stepBpm,
    setSpeedRatio: (ratio) => setSpeedPct(Math.round(Number(ratio) * 100)),
    setLoop: (startBeat, endBeat) => {
      if (!stateController.setSelection(startBeat, endBeat)) return false;
      return loopSelection();
    },
    clearSelection,
    setViewedTrack: setViewTrack,
    setFollow: (on) => {
      stateController.setAutoFollow(!!on);
      if (on) resumeFollow();
      syncFollowButton();
      settingsDrawer?.sync();
    },
    setFocusMode: (on) => toggleFocusMode(!!on),
    getState: () => ({
      ...state,
      viewModel: state.viewModel,
      enabledGuitars: [...state.enabledGuitars],
      enabledDrums: [...state.enabledDrums],
      metronomeEnabled: state.metronomeEnabled,
      follow: { ...state.follow },
      selection: { ...state.selection },
      speedRatio: stateController.getSpeedRatio(),
      notationView,
      focusMode,
    }),
    destroy() {
      if (!alive) return;
      try { persistSession({ now: true }); } catch (e) { /* ignore */ }
      alive = false;
      try {
        try { cancelLoad(packScoreId); } catch (e) { console.error(e); }
        try { stopPlayheadFrameLoop(); } catch (e) { console.error(e); }
        try { unbindPlayheadClockListeners(); } catch (e) { console.error(e); }
        playbackTimeline = null;
        if (autoPlayTimer != null) {
          clearTimeout(autoPlayTimer);
          autoPlayTimer = null;
        }
        try { clearCountIn(); } catch (e) { console.error(e); }
        try { sessionWriter.destroy(); } catch (e) { console.error(e); }
        try { stateController.destroy(); } catch (e) { console.error(e); }
        try { player.destroy(); } catch (e) { console.error(e); }
        try { parchment?.destroy(); } catch (e) { console.error(e); }
        parchmentZoomLimit = Infinity;
        try { transport?.destroy(); } catch (e) { console.error(e); }
        try { trackSelector?.destroy(); } catch (e) { console.error(e); }
        try { selectionToolbar?.destroy(); } catch (e) { console.error(e); }
        try { followButton?.destroy(); } catch (e) { console.error(e); }
        try { practicePop?.destroy(); } catch (e) { console.error(e); }
        try { displayPop?.destroy(); } catch (e) { console.error(e); }
        try { trackMixer?.destroy(); } catch (e) { console.error(e); }
        try { panelManager?.destroy(); } catch (e) { console.error(e); }
        try { shortcutHelp?.destroy(); } catch (e) { console.error(e); }
        try { settingsDrawer?.destroy(); } catch (e) { console.error(e); }
        try { metronomePanel?.destroy(); } catch (e) { console.error(e); }
        try { playerMenu?.destroy(); } catch (e) { console.error(e); }
        try { annoDrawer?.destroy(); } catch (e) { console.error(e); }
        try { importPanel?.destroy(); } catch (e) { console.error(e); }
        try {
          if (exerciseImportRoot?.parentElement) {
            exerciseImportRoot.parentElement.removeChild(exerciseImportRoot);
          }
        } catch (e) { console.error(e); }
        try { tracksDrawer?.destroy(); } catch (e) { console.error(e); }
        try { backingPanel?.destroy(); } catch (e) { console.error(e); }
        try { backingDrawer?.destroy(); } catch (e) { console.error(e); }
        try { layoutMetrics?.destroy(); } catch (e) { console.error(e); }
        layoutMetrics = null;
        try {
          if (keyHandler) host.removeEventListener('keydown', keyHandler);
        } catch (e) { console.error(e); }
        try {
          if (visibilityFlushHandler && typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', visibilityFlushHandler);
          }
        } catch (e) { console.error(e); }
        try {
          if (reducedMotionMq && reducedMotionHandler) {
            reducedMotionMq.removeEventListener?.('change', reducedMotionHandler);
          }
        } catch (e) { console.error(e); }
        try { if (focusMode) toggleFocusMode(false); } catch (e) { console.error(e); }
      } finally {
        releaseGpPlayerShell({ host, section: immersiveSection });
        host.classList.remove('gpp-reduced-motion', 'gpp-focus');
        host.innerHTML = '';
        host.classList.remove('gpp-root', 'is-loading');
      }
    },
  };
}

/** Drawer shell for the mixer and the backing panel (desktop drawer / mobile sheet). */
function mountTracksDrawerShell(host, { title = 'Tracks', bodyEl, onClose = null } = {}) {
  const backdrop = el('div', { class: 'gpp-drawer-backdrop', 'aria-hidden': 'true' });
  const drawer = el('div', { class: 'gpp-drawer', role: 'dialog', 'aria-label': title });
  const sheet = el('div', { class: 'gpp-sheet', role: 'dialog', 'aria-label': title });
  sheet.appendChild(el('div', { class: 'gpp-sheet-handle' }));

  let openState = false;
  let sheetMode = false;

  function close() {
    if (!openState) return;
    openState = false;
    paintOpen();
    onClose?.();
  }

  function makeHead() {
    return el('div', { class: 'gpp-drawer-head' }, [
      el('span', { class: 'gpp-drawer-title', text: title }),
      el('button', {
        class: 'gpp-icon-btn gpp-drawer-close',
        type: 'button',
        html: icon('close'),
        'aria-label': `Close ${title.toLowerCase()}`,
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

  // A compact screen uses a bottom sheet (must match gpplayer.css).
  const SHEET_MQ = '(max-width: 599px)';

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
  const onMq = () => { if (openState) paintOpen(); };
  mq.addEventListener?.('change', onMq);

  return {
    open, close, toggle,
    destroy() {
      mq.removeEventListener?.('change', onMq);
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
