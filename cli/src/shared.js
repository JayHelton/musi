// Re-exports the app's pure music-theory logic so the CLI and web UI share a
// single source of truth. These modules are DOM-free at import time.
export {
  parseNote,
  spellNote,
  normNote,
  NOTE_NAMES_SHARP,
  ROOTS,
  ROOTS_RAND,
  pick,
  TUNINGS,
  INTERVAL_LABELS,
  L,
  LS,
} from '../../js/theory.js';

export { SCALES, getScaleNotes, scaleStepPattern } from '../../js/scales.js';

export {
  INT_EASY,
  INT_MED_ADD,
  INT_HARD_ADD,
  getIntervalPool,
  computeInterval,
} from '../../js/intervals.js';

// Tab analysis engine (pure, DOM-free) shared with the web Tab Analyzer.
export { parseTab } from '../../js/tab/tabParser.js';
export { analyzeModel, analyzeTab } from '../../js/tab/tabAnalyzer.js';
