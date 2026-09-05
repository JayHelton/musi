// The idea synth: plays the notes of an idea back at the time they were sung.
//
// A singer trusts a transcription once they hear it. This is a plain tone
// with a short envelope, so the pitch and the timing read clearly and nothing
// else colours them.

import { audioCtx, ensureAudio, getMixDestination, midiFreq } from '../audio.js';

const ATTACK_SEC = 0.012;
const RELEASE_SEC = 0.08;
const LEVEL = 0.22;

/**
 * @param {{ onTick?: (sec: number) => void, onEnd?: () => void }} [handlers]
 * @returns {{ play: Function, stop: Function, isPlaying: Function }}
 */
export function createIdeaSynth({ onTick, onEnd } = {}) {
  let master = null;
  let voices = [];
  let rafId = null;
  let startAt = 0;
  let endAt = 0;
  let playing = false;

  function tick() {
    if (!playing) return;
    const now = audioCtx.currentTime;
    if (now >= endAt) {
      stop();
      return;
    }
    onTick?.(Math.max(0, now - startAt));
    rafId = requestAnimationFrame(tick);
  }

  /**
   * Play a list of events. Each one names its MIDI note, when it starts in
   * seconds from the first note, and how long it holds.
   * @param {Array<{ midi: number, atSec: number, durationSec: number }>} events
   */
  function play(events) {
    stop();
    ensureAudio();
    if (!events?.length) return false;

    master = audioCtx.createGain();
    master.gain.value = 1;
    master.connect(getMixDestination());

    startAt = audioCtx.currentTime + 0.06;
    endAt = startAt;
    for (const event of events) {
      const at = startAt + Math.max(0, event.atSec);
      const hold = Math.max(0.05, event.durationSec);
      const off = at + hold;
      endAt = Math.max(endAt, off + RELEASE_SEC);

      const osc = audioCtx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = midiFreq(event.midi);
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(LEVEL, at + ATTACK_SEC);
      gain.gain.setValueAtTime(LEVEL, Math.max(at + ATTACK_SEC, off - 0.01));
      gain.gain.exponentialRampToValueAtTime(0.0001, off + RELEASE_SEC);
      osc.connect(gain);
      gain.connect(master);
      osc.start(at);
      osc.stop(off + RELEASE_SEC + 0.02);
      voices.push(osc);
    }

    playing = true;
    rafId = requestAnimationFrame(tick);
    return true;
  }

  function stop() {
    const wasPlaying = playing;
    playing = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    for (const osc of voices) {
      try { osc.stop(); } catch (e) { /* already stopped */ }
      try { osc.disconnect(); } catch (e) { /* noop */ }
    }
    voices = [];
    if (master) {
      try { master.disconnect(); } catch (e) { /* noop */ }
      master = null;
    }
    if (wasPlaying) onEnd?.();
  }

  return {
    play,
    stop,
    isPlaying: () => playing,
  };
}
