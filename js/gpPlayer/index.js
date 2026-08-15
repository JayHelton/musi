// Public exports for the GP parchment player modules.

export { el, uid, fmtTime } from './dom.js';
export {
  beatsFromMeasureRange,
  measureIndicesForBeats,
  clampMeasureIndex,
  snapBeat,
  normalizeBeatRange,
  scopeBounds,
  canPrevMeasure,
  canNextMeasure,
  restartTarget,
} from './rangeUtils.js';
export { createPlayerState } from './playerState.js';
export { mountParchmentView } from './parchmentView.js';
export { createLoopSelectionController } from './loopSelection.js';
export { mountMeasureNav } from './measureNav.js';
export { mountTransportDock } from './transportDock.js';
export { mountPracticeRail } from './practiceRail.js';
export { mountTrackTabs } from './trackTabs.js';
export { createPanelManager } from './panelManager.js';
export { mountShortcutHelp, GPP_SHORTCUTS } from './shortcutHelp.js';
export { mountTrackMixer } from './trackMixer.js';
export { mountSettingsDrawer } from './settingsDrawer.js';
export { mountPlayerMenu } from './playerMenu.js';
export { mountAnnotationsDrawer } from './annotationsDrawer.js';
export { buildMeasureDigests, formatBarRange, describeMeasure } from './measureDigest.js';
export {
  defaultSegmentName,
  addSegment,
  removeSegment,
  updateSegmentRange,
  renameSegment,
  sortSegments,
  assignmentMap,
  coverageStats,
  autoSplitByMarkers,
  autoSplitEveryN,
  autoSplitFromAnnotations,
  segmentBeats,
  estimateSeconds,
} from './exerciseSegments.js';
export { mountMetronomePanel } from './metronomePanel.js';
export {
  defaultMetronomeConfig,
  defaultTempoRampConfig,
  createTempoRampController,
  clickLevelAt,
  clickPositionsInRange,
  countInOverlayLabel,
  loopRestOverlayLabel,
  createCountInDisplay,
  deriveBeatsPerMeasure,
  normalizeMetronomeConfig,
  normalizeTempoRampConfig,
} from './metronomeState.js';
export { mountExerciseImportPanel } from './exerciseImportPanel.js';
export { pinnedScrollTop, installGppLayoutMetrics, releaseGpPlayerShell } from './layoutMetrics.js';
