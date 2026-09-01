// The drone and the single pitch of Composition Lab.
//
// The Hear exercises need two sounds and no more: a tonic that holds while the
// player sings, and one pitch that answers after the attempt. Both build their
// own voices on the shared audio context, the same way the chord voice does, so
// neither claims the click slot and neither stops the metronome.
//
// The drone never plays the answer on its own. The screen calls `playPitch`
// only after the player presses Check.

import { audioCtx, ensureAudio, midiFreq, getAnalyserDestination } from '../../audio.js';

/** The octave the drone sounds in. Low enough to sing over. */
export const DRONE_OCTAVE = 3;
/** The octave a single answer pitch sounds in. */
export const PITCH_OCTAVE = 4;

let drone = null;
let pitchVoices = [];
let pitchTimer = null;

/**
 * The MIDI note of a pitch class in one octave.
 * @param {number} pitchClass 0 to 11
 * @param {number} octave
 * @returns {number}
 */
export function midiOf(pitchClass, octave) {
  return 12 * (octave + 1) + (((pitchClass % 12) + 12) % 12);
}

/** True when the drone is sounding. */
export function isDroneOn() {
  return !!drone;
}

/** Stop the drone. */
export function stopDrone() {
  if (!drone) return;
  const { oscillators, gain } = drone;
  drone = null;
  try {
    const now = audioCtx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    oscillators.forEach((osc) => { try { osc.stop(now + 0.22); } catch (error) { /* ended */ } });
  } catch (error) {
    oscillators.forEach((osc) => { try { osc.stop(); } catch (inner) { /* ended */ } });
  }
}

/**
 * Hold a drone on one pitch class.
 * A second call on the same pitch class stops it, so one control toggles.
 * @param {number} pitchClass 0 to 11
 * @param {{octave?: number}} [options]
 * @returns {boolean} true when the drone now sounds
 */
export function startDrone(pitchClass, { octave = DRONE_OCTAVE } = {}) {
  ensureAudio();
  if (!audioCtx) return false;
  const midi = midiOf(pitchClass, octave);
  if (drone && drone.midi === midi) {
    stopDrone();
    return false;
  }
  stopDrone();

  const freq = midiFreq(midi);
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = Math.min(freq * 6, 3200);
  filter.Q.value = 0.4;

  const now = audioCtx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.11, now + 0.25);

  // Two voices a fifth apart give the drone a body without naming a quality.
  const oscillators = [
    { type: 'sine', ratio: 1, level: 1 },
    { type: 'triangle', ratio: 1, level: 0.45 },
    { type: 'sine', ratio: 1.5, level: 0.3 },
  ].map((spec) => {
    const osc = audioCtx.createOscillator();
    const voiceGain = audioCtx.createGain();
    osc.type = spec.type;
    osc.frequency.value = freq * spec.ratio;
    voiceGain.gain.value = spec.level;
    osc.connect(voiceGain);
    voiceGain.connect(filter);
    osc.start(now);
    return osc;
  });

  filter.connect(gain);
  gain.connect(getAnalyserDestination());

  drone = { midi, oscillators, gain };
  return true;
}

/** Stop every single pitch this module started. */
export function stopPitch() {
  if (pitchTimer) { clearTimeout(pitchTimer); pitchTimer = null; }
  pitchVoices.forEach((voice) => { try { voice.stop(); } catch (error) { /* ended */ } });
  pitchVoices = [];
}

/**
 * Play one pitch above the drone.
 * @param {number} pitchClass 0 to 11
 * @param {{octave?: number, durationSec?: number}} [options]
 */
export function playPitch(pitchClass, { octave = PITCH_OCTAVE, durationSec = 1.6 } = {}) {
  ensureAudio();
  if (!audioCtx) return;
  stopPitch();

  const midi = midiOf(pitchClass, octave);
  const freq = midiFreq(midi);
  const start = audioCtx.currentTime + 0.04;

  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = Math.min(freq * 4, 5000);

  const sustain = durationSec * 0.65;
  const release = durationSec * 0.35;
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.linearRampToValueAtTime(0.2, start + 0.03);
  gain.gain.setValueAtTime(0.16, start + sustain);
  gain.gain.exponentialRampToValueAtTime(0.001, start + sustain + release);

  const stopAt = start + sustain + release + 0.05;
  ['sine', 'triangle'].forEach((type, i) => {
    const osc = audioCtx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const voiceGain = audioCtx.createGain();
    voiceGain.gain.value = i === 0 ? 1 : 0.35;
    osc.connect(voiceGain);
    voiceGain.connect(filter);
    osc.start(start);
    osc.stop(stopAt);
    pitchVoices.push(osc);
  });

  filter.connect(gain);
  gain.connect(getAnalyserDestination());

  pitchTimer = setTimeout(stopPitch, (durationSec + 0.4) * 1000);
}

/** Stop the drone and any single pitch. The screen calls this on the way out. */
export function stopAllTones() {
  stopDrone();
  stopPitch();
}
