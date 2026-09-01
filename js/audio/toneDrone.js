/**
 * A held tone.
 *
 * The Pitch Runner harmony drill holds one root note for the whole run, so the
 * singer always hears the note the harmony sits against. A sample cannot hold
 * for minutes, so the drone is an oscillator voice. It uses the same shape the
 * Keyboard drone uses: three oscillators, two of them detuned a little, a
 * lowpass filter, and a gain with a short attack and a short release.
 *
 * The drone is not a cue. The Pitch Runner never puts a scoring lockout on it,
 * because a lockout for a tone that never stops would mute every note.
 */

import { midiFreq } from '../audio.js';

const ATTACK_SEC = 0.08;
const RELEASE_SEC = 0.15;
const GLIDE_SEC = 0.06;

/**
 * Start a held tone.
 *
 * @param {{ audioCtx: BaseAudioContext, midi: number, destination: AudioNode,
 *           level?: number, wave?: OscillatorType }} options
 * @returns {{ setMidi: (midi:number)=>void, setLevel: (level:number)=>void,
 *             stop: ()=>void }|null} null when the caller gives no context or
 *   no destination
 */
export function startToneDrone({ audioCtx, midi, destination, level = 0.18, wave = 'sine' }) {
  if (!audioCtx || !destination) return null;
  const freq = midiFreq(midi);
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();

  filter.type = 'lowpass';
  filter.frequency.value = Math.min(Math.max(freq * 5, 900), 6000);
  filter.Q.value = 0.7;

  const oscs = [
    { type: wave, ratio: 1 },
    { type: wave, ratio: 1.002 },
    { type: 'sine', ratio: 0.999 },
  ].map((spec) => {
    const osc = audioCtx.createOscillator();
    osc.type = spec.type;
    osc.frequency.value = freq * spec.ratio;
    osc.connect(filter);
    return { osc, ratio: spec.ratio };
  });

  const now = audioCtx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(Math.max(0.0001, level), now + ATTACK_SEC);

  filter.connect(gain);
  gain.connect(destination);
  oscs.forEach(({ osc }) => osc.start(now));

  let stopped = false;

  return {
    /** Move the drone to another note. The tone glides, so nothing clicks. */
    setMidi(nextMidi) {
      if (stopped) return;
      const nextFreq = midiFreq(nextMidi);
      const t = audioCtx.currentTime;
      filter.frequency.setTargetAtTime(
        Math.min(Math.max(nextFreq * 5, 900), 6000), t, GLIDE_SEC,
      );
      oscs.forEach(({ osc, ratio }) => {
        osc.frequency.setTargetAtTime(nextFreq * ratio, t, GLIDE_SEC);
      });
    },
    /** Change how loud the drone holds. */
    setLevel(nextLevel) {
      if (stopped) return;
      const t = audioCtx.currentTime;
      gain.gain.setTargetAtTime(Math.max(0.0001, Number(nextLevel) || 0.0001), t, GLIDE_SEC);
    },
    /** Fade the drone out and free its nodes. */
    stop() {
      if (stopped) return;
      stopped = true;
      const t = audioCtx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + RELEASE_SEC);
      oscs.forEach(({ osc }) => {
        try { osc.stop(t + RELEASE_SEC + 0.05); } catch (e) { /* already stopped */ }
      });
    },
  };
}
