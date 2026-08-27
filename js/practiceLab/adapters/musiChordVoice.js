// Chord playback for the Theory tab.
//
// The tab strums a chord so the player hears the colour before the hand finds
// the shape. It builds its own voices with the shared audio context, the same
// way the Scale Reference plays a scale, so it never claims the click slot and
// never stops the metronome.
//
// This is an adapter, because it is the only part of the Theory tab that
// reaches the shared audio service.

import { audioCtx, ensureAudio, midiFreq, getAnalyserDestination } from '../../audio.js';

/** The octave a chord plays in when the tab has no voicing to follow. */
const BASE_OCTAVE = 3;
/** How long one strum takes from the low string to the high one. */
const STRUM_MS = 26;

let voices = [];
let timer = null;

function scheduleTone(midi, at, duration, volume) {
  const freq = midiFreq(midi);
  const osc = audioCtx.createOscillator();
  const partial = audioCtx.createOscillator();
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();

  osc.type = 'sine';
  partial.type = 'triangle';
  osc.frequency.value = freq;
  partial.frequency.value = freq;

  filter.type = 'lowpass';
  filter.frequency.value = Math.min(freq * 3.5, 4500);
  filter.Q.value = 0.5;

  const sustain = duration * 0.6;
  const release = duration * 0.4;
  gain.gain.setValueAtTime(0.001, at);
  gain.gain.linearRampToValueAtTime(volume, at + 0.02);
  gain.gain.setValueAtTime(volume * 0.75, at + sustain);
  gain.gain.exponentialRampToValueAtTime(0.001, at + sustain + release);

  osc.connect(filter);
  partial.connect(filter);
  filter.connect(gain);
  gain.connect(getAnalyserDestination());

  const stopAt = at + sustain + release + 0.05;
  osc.start(at); osc.stop(stopAt);
  partial.start(at); partial.stop(stopAt);
  voices.push(osc, partial);
}

/** Stop every voice this module started. */
export function stopChord() {
  if (timer) { clearTimeout(timer); timer = null; }
  voices.forEach((voice) => {
    try { voice.stop(); } catch (error) { /* the voice already ended */ }
  });
  voices = [];
}

/**
 * Strum a set of MIDI notes.
 * @param {number[]} midis low note first
 * @param {{durationSec?:number}} [options]
 */
export function playMidis(midis, { durationSec = 1.9 } = {}) {
  if (!midis || !midis.length) return;
  ensureAudio();
  if (!audioCtx) return;
  stopChord();
  const start = audioCtx.currentTime + 0.05;
  const volume = Math.max(0.06, 0.22 / Math.sqrt(midis.length));
  midis.forEach((midi, i) => {
    scheduleTone(midi, start + (i * STRUM_MS) / 1000, durationSec, volume);
  });
  timer = setTimeout(stopChord, (durationSec + 0.5) * 1000);
}

/**
 * Strum one chord. A voicing plays the notes the hand really presses. Without
 * one, the chord plays as a plain stack from the root.
 * @param {Object} chord a chord from the theory model
 * @param {Object|null} [voicing] a voicing from `findVoicings`
 */
export function playChord(chord, voicing = null) {
  if (voicing) {
    const midis = voicing.midis.filter(m => m != null).sort((a, b) => a - b);
    playMidis(midis);
    return;
  }
  if (!chord || !chord.tones.length) return;
  const rootMidi = 12 * (BASE_OCTAVE + 1) + chord.rootPc;
  let previous = rootMidi - 1;
  const midis = chord.tones.map((tone) => {
    let midi = 12 * (BASE_OCTAVE + 1) + tone.pc;
    while (midi <= previous) midi += 12;
    previous = midi;
    return midi;
  });
  playMidis(midis);
}
