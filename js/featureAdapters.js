/**
 * Lazy mount/stop of legacy feature modules via dynamic import().
 * Preserves init/stop semantics formerly in main.js TOOL_INITS/TOOL_STOPPERS.
 */

const ADAPTERS = {
  circle: {
    load: () => import('./circleOfFifths.js'),
    init: (m) => m.drawCoF(),
    stop: () => {},
  },
  keyboard: {
    load: () => import('./keyboard.js'),
    init: (m) => m.buildKeyboard(),
    stop: async (m) => {
      const { S } = await import('./scaleQuiz.js');
      if (Object.keys(S.kb.drones).length) m.stopAll();
    },
  },
  scaleref: {
    load: () => import('./scaleReference.js'),
    init: (m) => m.initScaleRef(),
    stop: (m) => m.stopScaleRef(),
  },
  triads: {
    load: () => import('./triadReference.js'),
    init: (m) => m.initTriadRef(),
    stop: (m) => m.stopTriadRef(),
  },
  chords: {
    load: async () => {
      const [movable, ref, builder] = await Promise.all([
        import('./movableChordCards.js'),
        import('./chordReference.js'),
        import('./chordBuilder.js'),
      ]);
      return { movable, ref, builder };
    },
    init: (m) => {
      m.movable.initMovableChordCards();
      m.ref.initChordRef();
      m.builder.initChordBuilder();
    },
    stop: (m) => {
      const { chordBuilder, stopChord } = m.builder;
      const { chOscillators, stopChordRef } = m.ref;
      if (chordBuilder.oscillators.length) stopChord();
      if (chOscillators.length) stopChordRef();
    },
  },
  fretboard: {
    load: () => import('./fretboardTrainer.js'),
    init: (m) => m.initFretboard(),
    stop: () => {},
  },
  intervalorbit: {
    load: () => import('./intervalOrbit.js'),
    init: (m) => m.initIntervalOrbit(),
    stop: (m) => m.stopIntervalOrbit(),
  },
  chordlab: {
    load: () => import('./chordWorkout.js'),
    init: (m) => m.initChordWorkout(),
    stop: (m) => m.stopChordWorkout(),
  },
  tuner: {
    load: async () => {
      const [tunerM, pitchM, runnerM] = await Promise.all([
        import('./vocalTrainer.js'),
        import('./pitchTrainer.js'),
        import('./pitchRunner.js'),
      ]);
      return { tunerM, pitchM, runnerM };
    },
    init: (m) => {
      m.tunerM.initTuner();
      m.pitchM.initPitchTrainer();
      m.runnerM.initPitchRunner();
    },
    stop: (m) => {
      const { tuner, stopTuner, stopContextScale } = m.tunerM;
      const { pt, stopPitchTrainer } = m.pitchM;
      const { runner, stopPitchRunner } = m.runnerM;
      if (tuner.running) stopTuner();
      if (tuner.scalePlaying) stopContextScale();
      if (pt.running) stopPitchTrainer();
      if (runner.running) stopPitchRunner();
    },
  },
  ear: {
    load: () => import('./earTrainer.js'),
    init: (m) => m.initEarTrainer(),
    stop: (m) => {
      const { ear, stopEarTone } = m;
      ear._seqTimers.forEach(clearTimeout);
      ear._seqTimers = [];
      if (ear._osc) stopEarTone();
    },
  },
  timing: {
    load: () => import('./timingDrill.js'),
    init: (m) => m.initTimingDrill(),
    stop: (m) => {
      const { timingDrill, stopTimingDrill } = m;
      if (timingDrill.playing) stopTimingDrill();
    },
  },
  sightreading: {
    load: () => import('./sightReadingTrainer.js'),
    init: (m) => m.initSightReading(),
    stop: (m) => m.stopSightReading(),
  },
  recorder: {
    load: () => import('./recorder.js'),
    init: (m) => m.initRecorder(),
    stop: (m) => {
      const { recorder, stopRecorder } = m;
      if (recorder.playing) stopRecorder();
    },
  },
  songwriter: {
    load: () => import('./songwriter.js'),
    init: (m) => m.initSongwriter(),
    stop: (m) => m.stopSongwriter(),
  },
  exercises: {
    load: () => import('./exercises.js'),
    init: (m) => m.initExercises(),
    stop: (m) => m.stopExercises(),
  },
  workbooks: {
    load: () => import('./workbooks.js'),
    init: (m) => m.initWorkbooks(),
    stop: (m) => m.stopWorkbooks(),
  },
  routines: {
    load: () => import('./routines.js'),
    init: (m) => m.initRoutines(),
    stop: (m) => m.stopRoutines(),
  },
  notes: {
    load: () => import('./notes.js'),
    init: (m) => m.initNotes(),
    stop: (m) => m.stopNotes(),
  },
  practice: {
    load: () => import('./practiceTimer.js'),
    init: (m) => m.initPracticeTimer(),
    stop: (m) => m.stopPracticeTimer(),
  },
  drums: {
    load: () => import('./drums/drumsUI.js'),
    init: (m) => m.initDrums(),
    stop: (m) => m.stopDrums(),
  },
  tracktosheet: {
    load: () => import('./trackToSheet.js'),
    init: (m) => m.initTrackToSheet(),
    stop: (m) => m.stopTrackToSheet(),
  },
  gpplayer: {
    load: () => import('./gpPlayer.js'),
    init: (m) => m.initGpPlayer(),
    stop: (m) => m.stopGpPlayer(),
  },
  studylab: {
    load: () => import('./studyLab.js'),
    init: (m) => m.initStudyLab(),
    stop: (m) => m.stopStudyLab(),
  },
  metronome: {
    load: () => import('./metronome.js'),
    init: (m) => m.initMetronome(),
    stop: (m) => {
      const { metro, stopMetronome } = m;
      if (metro.playing) stopMetronome();
    },
  },
  scales: {
    load: () => import('./scaleQuiz.js'),
    init: () => {},
    stop: () => {},
  },
  intervals: {
    load: () => import('./intervalQuiz.js'),
    init: () => {},
    stop: () => {},
  },
  musicprefs: {
    load: () => import('./musicPreferences.js'),
    init: (m) => {
      const showSection = typeof window !== 'undefined' ? window.showSection : null;
      m.initMusicPreferences({ showSection });
    },
    stop: () => {},
  },
};

const loaded = new Map();
const mounted = new Set();
const mountPromises = new Map();

export const FEATURE_ADAPTER_IDS = Object.keys(ADAPTERS);

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function mountFeature(id) {
  const adapter = ADAPTERS[id];
  if (!adapter) return;
  if (mounted.has(id)) return;
  if (mountPromises.has(id)) return mountPromises.get(id);

  const promise = (async () => {
    let mod = loaded.get(id);
    if (!mod) {
      mod = await adapter.load();
      loaded.set(id, mod);
    }
    if (!mounted.has(id)) {
      await adapter.init(mod);
      mounted.add(id);
    }
  })();

  mountPromises.set(id, promise);
  try {
    await promise;
  } finally {
    mountPromises.delete(id);
  }
}

/**
 * @param {string} id
 */
export function stopFeature(id) {
  if (!loaded.has(id)) return;
  const adapter = ADAPTERS[id];
  if (!adapter) return;
  adapter.stop(loaded.get(id));
  mounted.delete(id);
}

/**
 * @param {string[]} keepIds
 */
export function stopFeaturesExcept(keepIds) {
  const keep = new Set(keepIds);
  for (const id of [...mounted]) {
    if (!keep.has(id)) stopFeature(id);
  }
}

/**
 * @param {string} id
 * @returns {boolean}
 */
export function isFeatureLoaded(id) {
  return loaded.has(id);
}

/**
 * @param {string} id
 * @returns {boolean}
 */
export function isFeatureMounted(id) {
  return mounted.has(id);
}
