// Practice Lab ports.
//
// The feature takes every service it needs through an injected port. No file
// under `js/practiceLab/` reaches out to a global service, except the files in
// `adapters/`. A future micro app supplies its own adapters and mounts the
// same container.
//
// This file holds the JSDoc typedef of each port and the method list the
// container checks at mount time.

/**
 * @typedef {Object} PracticeStore
 * @property {() => Promise<Object|null>} getCatalog
 * @property {(record: Object) => Promise<Object|null>} saveCatalog
 * @property {(session: Object) => Promise<Object|null>} createSession
 * @property {(id: string, patch: Object) => Promise<Object|null>} endSession
 * @property {(id: string) => Promise<Object|null>} getSession
 * @property {(options?: Object) => Promise<Object[]>} listSessions
 * @property {(entry: Object) => Promise<Object|null>} appendEntry
 * @property {(sessionId: string) => Promise<Object[]>} listEntries
 * @property {(id: string, patch: Object) => Promise<Object|null>} updateEntry
 * @property {(clip: Object) => Promise<Object|null>} saveClip
 * @property {(id: string) => Promise<Object|null>} getClip
 * @property {(sessionId: string) => Promise<Object[]>} listClips
 * @property {(id: string) => Promise<boolean>} deleteClip
 * @property {(id: string) => Promise<boolean>} deleteSession
 * @property {() => boolean} isAvailable
 */

/**
 * The click voice. `now()` and `schedule()` both run on the audio clock, in
 * seconds.
 * @typedef {Object} ClickPort
 * @property {() => Promise<void>|void} prime
 * @property {() => number} now
 * @property {(atSec: number, level: string) => void} schedule
 * @property {() => void} stop
 */

/**
 * The one-audio-owner slot. `claim` returns a handle or null.
 * @typedef {Object} AudioSessionPort
 * @property {(options: { label: string, onStop: () => void }) => Object|null} claim
 * @property {() => void} release
 */

/**
 * The camera and the recorder.
 * @typedef {Object} VideoPort
 * @property {() => Promise<{ stream: MediaStream }>} openMirror
 * @property {(options?: Object) => Promise<void>} startRecording
 * @property {() => Promise<{ blob: Blob, mime: string, durationMs: number, size: number }|null>} stopRecording
 * @property {() => void} close
 * @property {() => { camera: boolean, recorder: boolean }} capabilities
 */

/**
 * The wall clock and the timers. The tests supply a fake.
 * @typedef {Object} ClockPort
 * @property {() => number} nowMs
 * @property {(fn: Function, ms: number) => *} setInterval
 * @property {(handle: *) => void} clearInterval
 */

/**
 * @typedef {Object} IdPort
 * @property {(prefix: string) => string} newId
 */

/**
 * @typedef {Object} NotifyPort
 * @property {(message: string, kind?: string) => void} toast
 */

/**
 * @typedef {Object} PracticeLabPorts
 * @property {PracticeStore} store
 * @property {ClickPort} click
 * @property {AudioSessionPort} audioSession
 * @property {VideoPort} video
 * @property {ClockPort} clock
 * @property {IdPort} ids
 * @property {NotifyPort} notify
 */

/** The method each port must supply. The container checks this list. */
export const PORT_CONTRACT = {
  store: [
    'getCatalog', 'saveCatalog',
    'createSession', 'endSession', 'getSession', 'listSessions', 'deleteSession',
    'appendEntry', 'listEntries', 'updateEntry',
    'saveClip', 'getClip', 'listClips', 'deleteClip',
    'isAvailable',
  ],
  click: ['prime', 'now', 'schedule', 'stop'],
  audioSession: ['claim', 'release'],
  video: ['openMirror', 'startRecording', 'stopRecording', 'close', 'capabilities'],
  clock: ['nowMs', 'setInterval', 'clearInterval'],
  ids: ['newId'],
  notify: ['toast'],
};

/** The port names, in a stable order. */
export const PORT_NAMES = Object.keys(PORT_CONTRACT);

/**
 * Check one port bag against the contract.
 * @param {Object} ports
 * @returns {string[]} the problems, empty when the bag is complete
 */
export function portProblems(ports) {
  const problems = [];
  const bag = ports || {};
  for (const name of PORT_NAMES) {
    const port = bag[name];
    if (!port || typeof port !== 'object') {
      problems.push(`port "${name}" is missing`);
      continue;
    }
    for (const method of PORT_CONTRACT[name]) {
      if (typeof port[method] !== 'function') {
        problems.push(`port "${name}" has no method "${method}"`);
      }
    }
  }
  return problems;
}
