// Audio session coordination so Musi coexists with audio from other apps.
//
// By default a web page that plays audio (or opens the mic) tells the OS it
// wants the audio focus, which pauses/ducks whatever else is playing — so
// starting Musi would silence the music or backing track a user already has
// going in another app. The experimental Audio Session API lets us declare a
// *mixable* session instead, so Musi's tones, metronome, playback and even mic
// recording layer on top of other apps' sound rather than interrupting it.
//
// This is feature-detected and degrades to a no-op on browsers that don't
// implement it (most non-WebKit engines today), so it is always safe to call.

const audioSession =
  (typeof navigator !== 'undefined' && navigator.audioSession) || null;
const SUPPORTED = !!audioSession;

// "ambient" = mixes with other apps' audio (used whenever we only output sound).
// "play-and-record" = required while the microphone is live; we keep it mixable
// in spirit by returning to "ambient" the moment capture stops.
const PLAYBACK_TYPE = 'ambient';
const RECORD_TYPE = 'play-and-record';

// Reference count of features currently holding the mic (recorder, pitch
// trainer). While any are active we stay in the recording session; once the
// last one releases we drop back to the mixable playback session.
let micHolders = 0;

function applyType(type) {
  if (!SUPPORTED) return false;
  try {
    if (audioSession.type !== type) audioSession.type = type;
    return true;
  } catch (e) {
    // Assigning an unsupported value throws on some engines; ignore.
    return false;
  }
}

export function isAudioSessionSupported() {
  return SUPPORTED;
}

export function getAudioSessionType() {
  return SUPPORTED ? audioSession.type : null;
}

// Declare the default, mixable session. Safe to call repeatedly; it never
// downgrades an active recording session.
export function initAudioSession() {
  if (micHolders === 0) applyType(PLAYBACK_TYPE);
}

// Microphone-using features wrap their capture lifecycle with these. Reference
// counted so the recorder and pitch trainer don't clobber each other.
export function beginMicSession() {
  micHolders += 1;
  applyType(RECORD_TYPE);
}

export function endMicSession() {
  micHolders = Math.max(0, micHolders - 1);
  if (micHolders === 0) applyType(PLAYBACK_TYPE);
}
