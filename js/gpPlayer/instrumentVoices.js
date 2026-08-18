// Voices for Guitar Pro playback.
// Each note plays a rendered buffer from the synth pack in
// js/gpPlayer/stringSynth.js, or a sample from an installed sound pack.
// The buffer holds the body of the tone. The playback stage adds the
// velocity tone filter, the envelope, and the pitch moves.
// Drum hits stay in js/drums/drumEngine.js.

import { midiFreq } from '../audio.js';
import { playSampleNote, schedulePlaybackRate } from '../audio/sampleVoice.js';
import {
  createVoiceBufferCache,
  presetForFamily,
  VOICE_PRESETS,
} from './stringSynth.js';

const VOICE_FADE_SEC = 0.008;
const MAX_ACTIVE_VOICES = 48;
const HEADROOM_TARGET = 0.9;
const ATTACK_SEC = 0.004;
const MUTED_ATTACK_SEC = 0.002;
const PALM_MUTE_MAX_SEC = 0.26;
const DEAD_MAX_SEC = 0.12;
const FALLBACK_WAVES = {
  cleanGuitar: 'triangle',
  acousticGuitar: 'triangle',
  distortedGuitar: 'sawtooth',
  bass: 'sine',
  keys: 'square',
};

function clampVelocity(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.78;
  if (n > 1) return Math.max(0.05, Math.min(1, n / 127));
  return Math.max(0.05, Math.min(1, n));
}

function setParam(param, value, time) {
  if (typeof param?.setValueAtTime === 'function') {
    param.setValueAtTime(value, time);
  } else if (param) {
    param.value = value;
  }
}

/**
 * Map a MIDI program number to an instrument family name.
 * @param {number} program
 */
export function familyForProgram(program) {
  const p = Math.max(0, Math.min(127, Math.floor(Number(program) || 0)));
  if (p >= 32 && p <= 39) return 'bass';
  if (p === 24 || p === 25) return 'acousticGuitar';
  if (p >= 26 && p <= 28) return 'cleanGuitar';
  if (p >= 29 && p <= 31) return 'distortedGuitar';
  if (p <= 23) return 'keys';
  return 'cleanGuitar';
}

function normalizeFamily(family) {
  return VOICE_PRESETS[family] ? family : 'cleanGuitar';
}

/**
 * Build a voice factory for one AudioContext.
 * @param {AudioContext} audioCtx
 */
export function createVoiceFactory(audioCtx) {
  const active = [];
  const bufferCache = createVoiceBufferCache(audioCtx);

  function dropVoice(handle) {
    const idx = active.indexOf(handle);
    if (idx >= 0) active.splice(idx, 1);
  }

  function stealOldest() {
    if (!active.length) return;
    const oldest = active.shift();
    try { oldest.stopNow(); } catch (e) { /* ignore */ }
  }

  function trackVoice(handle, node) {
    if (typeof node?.addEventListener === 'function') {
      node.addEventListener('ended', () => dropVoice(handle), { once: true });
    } else if (node) {
      node.onended = () => dropVoice(handle);
    }
    active.push(handle);
    return handle;
  }

  function headroomGain(velocity, familyPeak, chordSize = 1) {
    const size = Math.max(1, Number(chordSize) || 1);
    return familyPeak * clampVelocity(velocity) * (HEADROOM_TARGET / Math.sqrt(size));
  }

  function makeHandle(node, gain, stopAt) {
    const handle = {
      osc: node,
      source: node,
      gain,
      stopAt,
      stopped: false,
      release(atTime) {
        if (handle.stopped) return;
        const t = Math.max(audioCtx.currentTime, atTime);
        try {
          gain.gain.cancelScheduledValues(t);
          gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), t);
          gain.gain.linearRampToValueAtTime(0.0001, t + VOICE_FADE_SEC);
          node.stop(t + VOICE_FADE_SEC + 0.002);
        } catch (e) { /* ignore */ }
        handle.stopped = true;
        dropVoice(handle);
      },
      stopNow() {
        if (handle.stopped) return;
        try {
          gain.gain.cancelScheduledValues(audioCtx.currentTime);
          gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
          node.stop(audioCtx.currentTime + 0.001);
        } catch (e) { /* ignore */ }
        handle.stopped = true;
        dropVoice(handle);
      },
    };
    return handle;
  }

  /* The note holds its level while the rendered buffer decays on its own.
     A short release keeps the note off from clicking. */
  function applyEnvelope(gain, { when, end, peak, muted }) {
    const attack = muted ? MUTED_ATTACK_SEC : ATTACK_SEC;
    const span = Math.max(0.01, end - when);
    const release = muted
      ? Math.min(0.05, span * 0.5)
      : Math.min(0.12, span * 0.4);
    const releaseAt = Math.max(when + attack, end - release);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(peak, when + attack);
    gain.gain.setValueAtTime(peak, releaseAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
  }

  function noteEnd(when, durSec, tech) {
    const span = Math.max(0.04, Number(durSec) || 0);
    if (tech.dead) return when + Math.min(span, DEAD_MAX_SEC);
    if (tech.palmMute) return when + Math.min(span, PALM_MUTE_MAX_SEC);
    return when + span;
  }

  function toneCutoff(preset, velocity, tech) {
    const cut = preset.toneBase + clampVelocity(velocity) * preset.toneVel;
    if (tech.dead) return cut * 0.3;
    if (tech.palmMute) return cut * 0.45;
    return cut;
  }

  function playPackNote(opts, pack) {
    const handle = playSampleNote({
      audioCtx,
      buffer: pack.buffer,
      rootMidi: pack.rootMidi,
      midi: opts.midi,
      when: opts.when,
      durSec: opts.durSec,
      velocity: opts.velocity,
      techniques: opts.techniques,
      bend: opts.bend,
      slideKind: opts.slideKind,
      chordSize: opts.chordSize,
      destination: opts.destination,
      gainTrim: pack.gainTrim ?? 1,
    });
    return trackVoice(handle, handle.source);
  }

  function playSynthNote(opts, preset, buffer, tech) {
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    schedulePlaybackRate(
      source,
      1,
      opts.when,
      opts.durSec,
      opts.bend,
      opts.slideKind,
      tech.vibrato,
    );

    const gain = audioCtx.createGain();
    const filter = typeof audioCtx.createBiquadFilter === 'function'
      ? audioCtx.createBiquadFilter()
      : null;
    if (filter) {
      filter.type = 'lowpass';
      setParam(filter.frequency, toneCutoff(preset, opts.velocity, tech), opts.when);
      if (filter.Q) filter.Q.value = tech.muted ? 0.6 : 0.8;
      source.connect(filter);
      filter.connect(gain);
    } else {
      source.connect(gain);
    }
    gain.connect(opts.destination);

    const end = noteEnd(opts.when, opts.durSec, tech);
    applyEnvelope(gain, {
      when: opts.when,
      end,
      peak: headroomGain(opts.velocity, preset.peak, opts.chordSize),
      muted: tech.muted,
    });

    const stopAt = end + 0.03;
    source.start(opts.when);
    source.stop(stopAt);
    const handle = makeHandle(source, gain, stopAt);
    handle.filter = filter;
    return trackVoice(handle, source);
  }

  /* A context without createBuffer gets a plain tone. Test stubs use it. */
  function playFallbackNote(opts, preset, family, tech) {
    const osc = audioCtx.createOscillator();
    osc.type = FALLBACK_WAVES[family] || 'triangle';
    const gain = audioCtx.createGain();
    const filter = typeof audioCtx.createBiquadFilter === 'function'
      ? audioCtx.createBiquadFilter()
      : null;
    setParam(osc.frequency, midiFreq(opts.midi), opts.when);
    if (filter) {
      filter.type = 'lowpass';
      setParam(filter.frequency, toneCutoff(preset, opts.velocity, tech), opts.when);
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }
    gain.connect(opts.destination);

    const end = noteEnd(opts.when, opts.durSec, tech);
    applyEnvelope(gain, {
      when: opts.when,
      end,
      peak: headroomGain(opts.velocity, preset.peak, opts.chordSize),
      muted: tech.muted,
    });

    const stopAt = end + 0.03;
    osc.start(opts.when);
    osc.stop(stopAt);
    const handle = makeHandle(osc, gain, stopAt);
    handle.filter = filter;
    return trackVoice(handle, osc);
  }

  /**
   * Play one pitched note.
   * The note uses a pack sample first, then the synth buffer.
   */
  function playNote(opts) {
    const { family, midi, pack = null } = opts;
    const techniques = Array.isArray(opts.techniques) ? opts.techniques : [];

    while (active.length >= MAX_ACTIVE_VOICES) stealOldest();
    if (pack?.buffer) return playPackNote(opts, pack);

    const tech = {
      palmMute: techniques.includes('palmMute'),
      dead: techniques.includes('dead'),
      vibrato: techniques.includes('vibrato'),
    };
    tech.muted = tech.palmMute || tech.dead;

    const name = normalizeFamily(family);
    const preset = presetForFamily(name);
    const buffer = bufferCache.get(name, midiFreq(midi), midi);
    if (buffer && typeof audioCtx.createBufferSource === 'function') {
      return playSynthNote(opts, preset, buffer, tech);
    }
    return playFallbackNote(opts, preset, name, tech);
  }

  /**
   * Render notes before playback so the first pass does not stall.
   * @param {{ family: string, midi: number }[]} notes
   * @param {number} [maxNotes]
   * @returns {number} the count of rendered notes
   */
  function prewarm(notes, maxNotes = 8) {
    if (!Array.isArray(notes)) return 0;
    let built = 0;
    for (const note of notes) {
      if (built >= maxNotes) break;
      const name = normalizeFamily(note?.family);
      const midi = Number(note?.midi);
      if (!Number.isFinite(midi)) continue;
      if (bufferCache.get(name, midiFreq(midi), midi)) built += 1;
    }
    return built;
  }

  return {
    familyForProgram,
    playNote,
    prewarm,
    get activeCount() { return active.length; },
    stopAll() {
      while (active.length) {
        const v = active.pop();
        try { v.stopNow(); } catch (e) { /* ignore */ }
      }
    },
  };
}
