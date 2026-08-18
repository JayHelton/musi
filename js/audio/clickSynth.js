// Shared metronome click voice.
//
// Every metronome surface (the standalone tool, score-synced playback, the
// companions, and the drills) calls into this module, so the click sounds the
// same everywhere. The voice models a wood block: a short noise transient for
// the stick, a resonant body for the "tok", and one inharmonic partial for the
// bright edge. The attack starts at full level, because a ramp softens the
// transient and makes the click hard to hear against a mix.

/** Body frequency of the click voice, per accent level. */
export const CLICK_TONE = {
  accent: 2100,
  beat: 1500,
  sub: 1150,
};

/** Peak gain of the standalone metronome tool and the practice drills. */
export const STANDALONE_CLICK_GAIN = {
  accent: 0.5,
  beat: 0.32,
};

let noiseBuffer = null;
let noiseBufferCtx = null;

function getNoiseBuffer(ctx) {
  if (noiseBuffer && noiseBufferCtx === ctx) return noiseBuffer;
  if (typeof ctx.createBuffer !== 'function') return null;
  const length = Math.max(1, Math.floor(ctx.sampleRate * 0.02));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  noiseBufferCtx = ctx;
  return buffer;
}

function scheduleTransient(ctx, dest, when, tone, peak) {
  // A test stub can leave the buffer nodes out. The click still works without
  // the transient, so skip it instead of a failure.
  if (typeof ctx.createBufferSource !== 'function') return;
  const buffer = getNoiseBuffer(ctx);
  if (!buffer) return;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = Math.min(tone * 1.9, 12000);
  band.Q.value = 1.1;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak * 0.85, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.008);
  noise.connect(band);
  band.connect(gain);
  gain.connect(dest);
  noise.start(when);
  noise.stop(when + 0.03);
}

/**
 * Schedule one wood block click at an absolute AudioContext time.
 * @param {AudioContext} ctx
 * @param {AudioNode} dest
 * @param {number} when
 * @param {{ tone?: number, peak?: number, decay?: number }} [options]
 */
export function scheduleClickSound(ctx, dest, when, options = {}) {
  if (!ctx || !dest) return;
  const peak = Math.max(0, Number(options.peak) || 0);
  if (peak <= 0) return;
  const tone = Number(options.tone) || CLICK_TONE.beat;
  const decay = Math.max(0.01, Number(options.decay) || 0.038);

  // Body: a square wave through a bandpass. The short pitch drop gives the
  // hollow wood character.
  const body = ctx.createOscillator();
  body.type = 'square';
  body.frequency.setValueAtTime(tone, when);
  body.frequency.exponentialRampToValueAtTime(tone * 0.86, when + decay);
  const bodyFilter = ctx.createBiquadFilter();
  bodyFilter.type = 'bandpass';
  bodyFilter.frequency.value = tone;
  // A wide resonance keeps the wood character but still passes the level that
  // makes the click cut through. A narrow one sounds soft.
  bodyFilter.Q.value = 6;
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(peak, when);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, when + decay);
  body.connect(bodyFilter);
  bodyFilter.connect(bodyGain);
  bodyGain.connect(dest);
  body.start(when);
  body.stop(when + decay + 0.02);

  // Partial: an inharmonic overtone that decays first. It puts the stick on the
  // front of the sound.
  const ring = ctx.createOscillator();
  ring.type = 'sine';
  ring.frequency.setValueAtTime(Math.min(tone * 2.76, 14000), when);
  const ringGain = ctx.createGain();
  ringGain.gain.setValueAtTime(peak * 0.4, when);
  ringGain.gain.exponentialRampToValueAtTime(0.0001, when + decay * 0.5);
  ring.connect(ringGain);
  ringGain.connect(dest);
  ring.start(when);
  ring.stop(when + decay + 0.02);

  scheduleTransient(ctx, dest, when, tone, peak);
}
