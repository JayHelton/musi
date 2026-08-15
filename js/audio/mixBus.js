/**
 * Shared mix graph: track buses, compressor, master gain, and safety stage.
 */

const SAFETY_PEAK_LINEAR = 10 ** (-1 / 20);

let mixCtx = null;
let mixInput = null;
let compressorNode = null;
let masterGainNode = null;
let safetyLimiter = null;
let clipNode = null;
let safetyOutput = null;

/** Per-track bus nodes keyed by trackKey. */
const trackBuses = new Map();

let mutedKeys = new Set();
let soloKey = null;

function makePanNode(ctx, panValue) {
  if (typeof ctx.createStereoPanner === 'function') {
    const panner = ctx.createStereoPanner();
    panner.pan.value = panValue;
    return { node: panner, setPan: (p) => { panner.pan.value = p; } };
  }
  const gain = ctx.createGain();
  gain.gain.value = 1;
  return { node: gain, setPan: () => {}, _pan: panValue };
}

function makeEqNode(ctx) {
  if (typeof ctx.createBiquadFilter !== 'function') return null;
  const eq = ctx.createBiquadFilter();
  eq.type = 'peaking';
  if (eq.frequency) eq.frequency.value = 1000;
  if (eq.Q) eq.Q.value = 1;
  if (eq.gain) eq.gain.value = 0;
  return eq;
}

function computeEffectiveGain(bus) {
  const base = bus.gain;
  if (soloKey != null) {
    return bus.trackKey === soloKey ? base : 0;
  }
  if (mutedKeys.has(bus.trackKey)) return 0;
  return base;
}

function applyBusGain(bus) {
  bus.gainNode.gain.value = computeEffectiveGain(bus);
}

function applyAllBusGains() {
  for (const bus of trackBuses.values()) applyBusGain(bus);
}

/** Linear peak limit for the safety clip stage. */
export function getSafetyPeakLinear() {
  return SAFETY_PEAK_LINEAR;
}

/** Max absolute sample value across all channels. */
export function measureProtectedPeak(buffer) {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i += 1) {
      peak = Math.max(peak, Math.abs(data[i]));
    }
  }
  return peak;
}

/** Return the safety limiter and clip nodes when present. */
export function getSafetyStage() {
  return { limiter: safetyLimiter, clip: clipNode, output: safetyOutput };
}

/**
 * Build the global mix graph on one AudioContext.
 * @returns {{ mixInput, compressorNode, masterGainNode, safetyOutput }}
 */
export function attachMixGraph(audioCtx, { masterVolume = 1 } = {}) {
  if (mixCtx === audioCtx && mixInput) {
    if (masterGainNode) masterGainNode.gain.value = masterVolume;
    return { mixInput, compressorNode, masterGainNode, safetyOutput };
  }

  resetMixBuses();
  mixCtx = audioCtx;

  mixInput = audioCtx.createGain();
  mixInput.gain.value = 1;

  compressorNode = audioCtx.createDynamicsCompressor();
  compressorNode.threshold.value = -24;
  compressorNode.knee.value = 12;
  compressorNode.ratio.value = 6;
  compressorNode.attack.value = 0.003;
  compressorNode.release.value = 0.15;

  masterGainNode = audioCtx.createGain();
  masterGainNode.gain.value = masterVolume;

  safetyLimiter = audioCtx.createDynamicsCompressor();
  safetyLimiter.threshold.value = -1;
  safetyLimiter.ratio.value = 20;
  safetyLimiter.knee.value = 0;
  safetyLimiter.attack.value = 0.001;
  safetyLimiter.release.value = 0.05;

  mixInput.connect(compressorNode);
  compressorNode.connect(masterGainNode);
  masterGainNode.connect(safetyLimiter);

  let tail = safetyLimiter;
  clipNode = null;

  if (typeof audioCtx.createWaveShaper === 'function') {
    clipNode = audioCtx.createWaveShaper();
    const n = 256;
    const curve = new Float32Array(n);
    const limit = SAFETY_PEAK_LINEAR;
    for (let i = 0; i < n; i += 1) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.max(-limit, Math.min(limit, x));
    }
    clipNode.curve = curve;
    safetyLimiter.connect(clipNode);
    tail = clipNode;
  }

  safetyOutput = tail;
  tail.connect(audioCtx.destination);

  return { mixInput, compressorNode, masterGainNode, safetyOutput };
}

/** Mix bus input node. Voices and tools connect through track buses first. */
export function getMixInput() {
  return mixInput;
}

/** Master gain node in the graph. */
export function getMasterGainNode() {
  return masterGainNode;
}

/**
 * Create or update a per-track bus.
 * @returns {AudioNode} Input node for voice connections.
 */
export function getTrackBus(trackKey, { volume = 1, pan = 0 } = {}) {
  if (!mixCtx || !mixInput) return null;

  let bus = trackBuses.get(trackKey);
  if (!bus) {
    const inputNode = mixCtx.createGain();
    inputNode.gain.value = 1;

    const gainNode = mixCtx.createGain();
    const panSlot = makePanNode(mixCtx, pan);
    const eqNode = makeEqNode(mixCtx);

    inputNode.connect(gainNode);
    gainNode.connect(panSlot.node);

    let tail = panSlot.node;
    if (eqNode) {
      panSlot.node.connect(eqNode);
      tail = eqNode;
    }
    tail.connect(mixInput);

    bus = {
      trackKey,
      inputNode,
      gainNode,
      panSlot,
      eqNode,
      reverbSendGain: null,
      gain: volume,
      pan: pan,
    };
    trackBuses.set(trackKey, bus);
  } else {
    bus.gain = volume;
    bus.pan = pan;
    bus.panSlot.setPan(pan);
  }

  applyBusGain(bus);
  return bus.inputNode;
}

/** Set track bus linear gain (0..1). This value replaces the imported level. */
export function setTrackBusGain(trackKey, gain) {
  const bus = trackBuses.get(trackKey);
  if (!bus) return;
  bus.gain = Math.max(0, Math.min(1, Number(gain) || 0));
  applyBusGain(bus);
}

/** Set track bus pan (-1..1). */
export function setTrackBusPan(trackKey, pan) {
  const bus = trackBuses.get(trackKey);
  if (!bus) return;
  bus.pan = Math.max(-1, Math.min(1, Number(pan) || 0));
  bus.panSlot.setPan(bus.pan);
}

/**
 * Apply mute and solo to track buses.
 * @param {{ mutedKeys?: string[], soloKey?: string | null, soloedKeys?: string[] }} opts
 */
export function setTrackMuteSolo({ mutedKeys: muted = [], soloKey: solo = null, soloedKeys } = {}) {
  mutedKeys = new Set(muted || []);
  soloKey = soloedKeys?.length ? soloedKeys[0] : solo;
  applyAllBusGains();
}

/** Clear track buses and graph references for tests or a new context. */
export function resetMixBuses() {
  trackBuses.clear();
  mutedKeys = new Set();
  soloKey = null;
  mixCtx = null;
  mixInput = null;
  compressorNode = null;
  masterGainNode = null;
  safetyLimiter = null;
  clipNode = null;
  safetyOutput = null;
}
