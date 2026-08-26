/**
 * The voice the pitch training tools sound.
 *
 * The tuner, the pitch trainer, the pitch runner, and the ear trainer all play
 * one target note for the ear. The user picks that voice in Settings, apart
 * from the score player voice, because a training tone has a different job: it
 * must hold one steady pitch that a singer can match.
 *
 * The voice is one of:
 *
 *   - `tone` — the built-in blend of a sine and a triangle. Each tool keeps its
 *     own oscillator code for this one, so nothing downloads.
 *   - `wave-<type>` — the same oscillator code with one basic wave.
 *   - `packs` — the core piano pack.
 *   - `user:<soundId>` — a pitched pack the user installed or imported.
 *
 * A tool asks `playPitchNote` first. It returns null when no sample is ready,
 * and then the tool plays its own oscillator. That keeps every tool audible
 * while a pack loads, and on a browser that cannot decode the pack.
 */

import {
  PITCH_CORE_PACK_ID,
  getPitchVoice,
  pitchVoiceUsesPacks,
  voiceUserSoundId,
  voiceWave,
} from './soundPrefs.js';
import { getPack } from './samplePackRegistry.js';
import { loadPackBuffers, packBufferKey } from './sampleLoader.js';
import { registerCorePacks } from './packCatalog.js';
import { registerUserPacks, userPackManifestId } from './userSounds.js';
import { pickPitchedSample, playSampleNote } from './sampleVoice.js';

/** State for the voice that is loaded now. */
let loaded = { voiceId: '', packId: '', buffers: null };
let pending = null;

/** The pack id the current pitch voice names, or '' for an oscillator voice. */
export function pitchPackId(voiceId = getPitchVoice()) {
  if (!pitchVoiceUsesPacks(voiceId)) return '';
  const soundId = voiceUserSoundId(voiceId);
  if (soundId) return userPackManifestId(soundId);
  return PITCH_CORE_PACK_ID;
}

/** The oscillator wave the user picked, or null for the built-in blend. */
export function pitchVoiceWave(voiceId = getPitchVoice()) {
  return voiceWave(voiceId);
}

/** True once the samples of the chosen voice are ready to play. */
export function pitchSamplesReady() {
  const voiceId = getPitchVoice();
  return !!loaded.buffers && loaded.voiceId === voiceId;
}

/**
 * Load the samples of the chosen pitch voice.
 *
 * Call it when a pitch tool starts. It returns at once for an oscillator
 * voice, and it never throws. A second call for the same voice reuses the
 * first load.
 * @param {BaseAudioContext} audioCtx
 * @returns {Promise<boolean>} true when samples are ready
 */
export async function preparePitchVoice(audioCtx) {
  const voiceId = getPitchVoice();
  if (!pitchVoiceUsesPacks(voiceId)) {
    loaded = { voiceId, packId: '', buffers: null };
    return false;
  }
  if (loaded.voiceId === voiceId && loaded.buffers) return true;
  if (pending && pending.voiceId === voiceId) return pending.promise;

  const promise = (async () => {
    try {
      await registerCorePacks();
      registerUserPacks();
      const packId = pitchPackId(voiceId);
      if (!packId || !getPack(packId)) {
        loaded = { voiceId, packId: '', buffers: null };
        return false;
      }
      const result = await loadPackBuffers({ packId, audioCtx });
      if (!result.ok) {
        loaded = { voiceId, packId: '', buffers: null };
        return false;
      }
      loaded = { voiceId, packId, buffers: result.buffers };
      return true;
    } catch (e) {
      loaded = { voiceId, packId: '', buffers: null };
      return false;
    } finally {
      pending = null;
    }
  })();

  pending = { voiceId, promise };
  return promise;
}

/** Forget the loaded samples, e.g. after the user picks another voice. */
export function resetPitchVoice() {
  loaded = { voiceId: '', packId: '', buffers: null };
  pending = null;
}

/**
 * Play one training note from the loaded samples.
 * @param {{
 *   audioCtx: BaseAudioContext, midi: number, when?: number, durSec?: number,
 *   velocity?: number, destination: AudioNode,
 * }} options
 * @returns {object|null} a voice handle with `release`, or null when no sample
 *   is ready and the caller must play its own oscillator
 */
export function playPitchNote({
  audioCtx,
  midi,
  when,
  durSec = 1,
  velocity = 0.8,
  destination,
}) {
  if (!audioCtx || !destination) return null;
  if (!pitchSamplesReady()) return null;

  const manifest = getPack(loaded.packId);
  if (!manifest) return null;
  const sample = pickPitchedSample(manifest, midi, velocity);
  if (!sample) return null;
  const buffer = loaded.buffers[packBufferKey(manifest.id, sample.file)];
  if (!buffer) return null;

  try {
    return playSampleNote({
      audioCtx,
      buffer,
      rootMidi: sample.rootMidi,
      midi,
      when: when != null ? when : audioCtx.currentTime,
      durSec,
      velocity,
      chordSize: 1,
      destination,
      gainTrim: sample.gainTrim ?? 1,
    });
  } catch (e) {
    return null;
  }
}
