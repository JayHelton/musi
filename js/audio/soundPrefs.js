// Which voice each surface plays.
//
// Four surfaces read this file, and each one keeps its own id in settings:
//
//   - the score player, for the pitched tracks of a score
//   - the score player, for the percussion tracks of a score
//   - the pitch training tools, for the tone they sound
//   - the metronome, for its click
//
// A percussion track needs a kit, and a pitched track needs an instrument, so
// the two never share one setting. The pitch tools sound one long tone for the
// ear, so they hold a third setting of their own.
//
// An id is one of:
//
//   - a built-in id, e.g. `packs`, `synth`, `tone`, `woodblock`
//   - `wave-<type>`, one of the four basic oscillator waves the Keyboard uses
//   - `user:<soundId>`, a pack or a sample the user installed
//
// The module is DOM-free, so the Node tests can read it.

import { getSetting, saveSetting } from '../persistence.js';

export const SCORE_VOICE_KEY = 'sound.scoreVoice';
export const DRUM_VOICE_KEY = 'sound.drumVoice';
export const PITCH_VOICE_KEY = 'sound.pitchVoice';
export const METRO_VOICE_KEY = 'sound.metroVoice';

export const USER_VOICE_PREFIX = 'user:';
export const WAVE_VOICE_PREFIX = 'wave-';

/** The same four waves the Keyboard tool offers. */
export const BASIC_WAVES = [
  { id: 'sine', label: 'Sine' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'sawtooth', label: 'Sawtooth' },
  { id: 'square', label: 'Square' },
];

const WAVE_IDS = BASIC_WAVES.map((w) => w.id);

function waveVoices(suffix) {
  return BASIC_WAVES.map((w) => ({
    id: `${WAVE_VOICE_PREFIX}${w.id}`,
    label: `${w.label} ${suffix}`,
  }));
}

/** Built-in score player voices, in the order the picker shows them. */
export const SCORE_VOICES = [
  {
    id: 'packs',
    label: 'Sample packs',
    help: 'Recorded instruments. Falls back to the modeled strings while a pack loads.',
  },
  {
    id: 'synth',
    label: 'Modeled strings',
    help: 'The built-in plucked string model. It starts at once and needs no download.',
  },
  ...waveVoices('wave'),
];

export const DEFAULT_SCORE_VOICE = 'packs';

/** Built-in percussion voices for the score player. */
export const DRUM_VOICES = [
  {
    id: 'packs',
    label: 'Sample kit',
    help: 'The recorded drum kit. Falls back to the modeled kit while it loads.',
  },
  {
    id: 'synth',
    label: 'Modeled kit',
    help: 'The built-in drum model. It starts at once and needs no download.',
  },
];

export const DEFAULT_DRUM_VOICE = 'packs';

/** Built-in voices for the pitch training tools. */
export const PITCH_VOICES = [
  {
    id: 'tone',
    label: 'Trainer tone',
    help: 'The built-in blend of a sine and a triangle. It holds a steady pitch.',
  },
  {
    id: 'packs',
    label: 'Sample piano',
    help: 'The recorded piano. It downloads once, then it plays every target note.',
  },
  ...waveVoices('tone'),
];

export const DEFAULT_PITCH_VOICE = 'tone';

/** The core pack the pitch tools play when the voice is `packs`. */
export const PITCH_CORE_PACK_ID = 'core-keys';

/** The core pack the score player plays for percussion when no pack is picked. */
export const DRUM_CORE_PACK_ID = 'core-drums';

/** Built-in metronome voices, in the order the picker shows them. */
export const METRO_VOICES = [
  { id: 'woodblock', label: 'Wood block', help: 'The default click.' },
  { id: 'click', label: 'Stick click', help: 'A dry tick with no pitch.' },
  { id: 'beep', label: 'Electronic beep', help: 'A clean digital tone.' },
  { id: 'cowbell', label: 'Cowbell', help: 'Two tones that cut through a loud mix.' },
  { id: 'rim', label: 'Rim shot', help: 'A sharp crack with a short body.' },
  { id: 'hihat', label: 'Hi-hat', help: 'A short burst of noise.' },
  ...waveVoices('tone'),
];

export const DEFAULT_METRO_VOICE = 'woodblock';

const SCORE_BUILT_IN_IDS = SCORE_VOICES.map((v) => v.id);
const DRUM_BUILT_IN_IDS = DRUM_VOICES.map((v) => v.id);
const PITCH_BUILT_IN_IDS = PITCH_VOICES.map((v) => v.id);
const METRO_BUILT_IN_IDS = METRO_VOICES.map((v) => v.id);

function normalizeVoice(raw, builtInIds, fallback) {
  const id = typeof raw === 'string' ? raw.trim() : '';
  if (!id) return fallback;
  if (builtInIds.includes(id)) return id;
  if (id.startsWith(USER_VOICE_PREFIX) && id.length > USER_VOICE_PREFIX.length) return id;
  return fallback;
}

export function normalizeScoreVoice(raw) {
  return normalizeVoice(raw, SCORE_BUILT_IN_IDS, DEFAULT_SCORE_VOICE);
}

export function normalizeDrumVoice(raw) {
  return normalizeVoice(raw, DRUM_BUILT_IN_IDS, DEFAULT_DRUM_VOICE);
}

export function normalizePitchVoice(raw) {
  return normalizeVoice(raw, PITCH_BUILT_IN_IDS, DEFAULT_PITCH_VOICE);
}

export function normalizeMetroVoice(raw) {
  return normalizeVoice(raw, METRO_BUILT_IN_IDS, DEFAULT_METRO_VOICE);
}

export function getScoreVoice() {
  return normalizeScoreVoice(getSetting(SCORE_VOICE_KEY, DEFAULT_SCORE_VOICE));
}

export function setScoreVoice(id) {
  const next = normalizeScoreVoice(id);
  saveSetting(SCORE_VOICE_KEY, next);
  return next;
}

export function getDrumVoice() {
  return normalizeDrumVoice(getSetting(DRUM_VOICE_KEY, DEFAULT_DRUM_VOICE));
}

export function setDrumVoice(id) {
  const next = normalizeDrumVoice(id);
  saveSetting(DRUM_VOICE_KEY, next);
  return next;
}

export function getPitchVoice() {
  return normalizePitchVoice(getSetting(PITCH_VOICE_KEY, DEFAULT_PITCH_VOICE));
}

export function setPitchVoice(id) {
  const next = normalizePitchVoice(id);
  saveSetting(PITCH_VOICE_KEY, next);
  return next;
}

export function getMetroVoice() {
  return normalizeMetroVoice(getSetting(METRO_VOICE_KEY, DEFAULT_METRO_VOICE));
}

export function setMetroVoice(id) {
  const next = normalizeMetroVoice(id);
  saveSetting(METRO_VOICE_KEY, next);
  return next;
}

/**
 * The oscillator wave a voice asks for, or null when it is not a wave voice.
 * @param {string} voiceId
 * @returns {string|null}
 */
export function voiceWave(voiceId) {
  const id = typeof voiceId === 'string' ? voiceId : '';
  if (!id.startsWith(WAVE_VOICE_PREFIX)) return null;
  const wave = id.slice(WAVE_VOICE_PREFIX.length);
  return WAVE_IDS.includes(wave) ? wave : null;
}

/**
 * The installed sound a voice names, or null when it names a built-in one.
 * @param {string} voiceId
 * @returns {string|null}
 */
export function voiceUserSoundId(voiceId) {
  const id = typeof voiceId === 'string' ? voiceId : '';
  if (!id.startsWith(USER_VOICE_PREFIX)) return null;
  const soundId = id.slice(USER_VOICE_PREFIX.length);
  return soundId || null;
}

/** True while the score player should download and play recorded samples. */
export function scoreVoiceUsesPacks(voiceId = getScoreVoice()) {
  return voiceId === 'packs' || !!voiceUserSoundId(voiceId);
}

/** True while the percussion tracks should play recorded samples. */
export function drumVoiceUsesPacks(voiceId = getDrumVoice()) {
  return voiceId === 'packs' || !!voiceUserSoundId(voiceId);
}

/** True while the pitch training tools should play recorded samples. */
export function pitchVoiceUsesPacks(voiceId = getPitchVoice()) {
  return voiceId === 'packs' || !!voiceUserSoundId(voiceId);
}

/** The voice id that names one installed sound. */
export function userVoiceId(soundId) {
  return `${USER_VOICE_PREFIX}${soundId}`;
}
