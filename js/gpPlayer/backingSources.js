// Media sources for the backing track.
//
// Every source exposes the same small interface, so the clock follower in
// backingSync.js does not care where the sound comes from:
//
//   { kind, ready, error, duration, driftThresholds,
//     isPlaying(), play(), pause(), seek(sec), getTime(),
//     setRate(r), supportsRate(r), setVolume(v), destroy() }
//
// Two sources exist. A local audio file plays through an <audio> element and
// joins the app mix bus. A YouTube video plays in the official IFrame player,
// which keeps its own audio path.

import { audioCtx, ensureAudio, getMixDestination } from '../audio.js';
import { getTrackBus, setTrackBusGain } from '../audio/mixBus.js';
import { ELEMENT_THRESHOLDS, IFRAME_THRESHOLDS } from './backingSync.js';

export const BACKING_BUS_KEY = 'backing';

const ELEMENT_MIN_RATE = 0.25;
const ELEMENT_MAX_RATE = 4;
const YT_RATE_TOLERANCE = 0.02;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Ask the element to hold pitch when the rate changes.
 * @returns {boolean} true when the browser offers the feature.
 */
export function applyPreservesPitch(el) {
  let supported = false;
  ['preservesPitch', 'mozPreservesPitch', 'webkitPreservesPitch'].forEach((prop) => {
    if (prop in el) {
      try {
        el[prop] = true;
        supported = true;
      } catch (e) { /* ignore */ }
    }
  });
  return supported;
}

// --- local audio file ------------------------------------------------------

/**
 * Play a saved audio Blob through the app mix bus.
 * @param {{ blob: Blob, volume?: number }} opts
 */
export function createFileSource({ blob, volume = 0.9 } = {}) {
  ensureAudio();
  const el = new Audio();
  el.preload = 'auto';
  el.loop = false;
  const objectUrl = URL.createObjectURL(blob);
  el.src = objectUrl;

  const pitchHeld = applyPreservesPitch(el);

  const state = {
    ready: false,
    error: '',
    wantPlaying: false,
    destroyed: false,
    node: null,
    busInput: null,
  };

  function connectGraph() {
    if (state.node || !audioCtx) return;
    try {
      state.node = audioCtx.createMediaElementSource(el);
    } catch (e) {
      state.error = 'This browser cannot route the backing track through the mixer.';
      return;
    }
    state.busInput = getTrackBus(BACKING_BUS_KEY, { volume: clamp(volume, 0, 1), pan: 0 });
    // Without the mix graph the track still has to reach the speakers.
    state.node.connect(state.busInput || getMixDestination());
  }

  function markReady() {
    if (state.destroyed) return;
    state.ready = true;
  }

  el.addEventListener('loadedmetadata', markReady);
  el.addEventListener('canplay', markReady);
  el.addEventListener('error', () => {
    if (state.destroyed) return;
    state.error = 'The browser could not read this audio file.';
  });

  connectGraph();
  el.load();

  return {
    kind: 'file',
    element: el,
    pitchHeld,
    driftThresholds: ELEMENT_THRESHOLDS,
    get ready() { return state.ready && !state.error; },
    get error() { return state.error; },
    get duration() {
      const d = Number(el.duration);
      return Number.isFinite(d) ? d : 0;
    },
    isPlaying() {
      return state.wantPlaying && !el.paused && !el.ended;
    },
    play() {
      state.wantPlaying = true;
      const p = el.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          // A blocked start is not fatal. The follower tries again next frame.
          state.wantPlaying = false;
        });
      }
    },
    pause() {
      state.wantPlaying = false;
      try { el.pause(); } catch (e) { /* ignore */ }
    },
    seek(sec) {
      const d = Number(el.duration);
      const max = Number.isFinite(d) && d > 0 ? d : Number.MAX_SAFE_INTEGER;
      try { el.currentTime = clamp(Number(sec) || 0, 0, max); } catch (e) { /* ignore */ }
    },
    getTime() {
      return el.currentTime;
    },
    setRate(rate) {
      try {
        el.playbackRate = clamp(Number(rate) || 1, ELEMENT_MIN_RATE, ELEMENT_MAX_RATE);
      } catch (e) { /* ignore */ }
    },
    supportsRate(rate) {
      const r = Number(rate) || 1;
      return r >= ELEMENT_MIN_RATE && r <= ELEMENT_MAX_RATE;
    },
    setVolume(value) {
      const v = clamp(Number(value), 0, 1);
      if (state.busInput) setTrackBusGain(BACKING_BUS_KEY, v);
      else el.volume = v;
    },
    destroy() {
      state.destroyed = true;
      state.wantPlaying = false;
      try { el.pause(); } catch (e) { /* ignore */ }
      try { state.node?.disconnect(); } catch (e) { /* ignore */ }
      el.removeAttribute('src');
      try { el.load(); } catch (e) { /* ignore */ }
      URL.revokeObjectURL(objectUrl);
    },
  };
}

// --- YouTube ---------------------------------------------------------------

const YT_API_SRC = 'https://www.youtube.com/iframe_api';
let ytApiPromise = null;

/**
 * Load the official IFrame Player API one time.
 *
 * The app never reads the audio stream itself. It only drives the player that
 * YouTube supplies, which is what the IFrame API terms permit.
 */
export function loadYouTubeApi() {
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      reject(new Error('No browser environment.'));
      return;
    }
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    const prior = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prior === 'function') prior();
      resolve(window.YT);
    };
    let script = document.querySelector(`script[src="${YT_API_SRC}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = YT_API_SRC;
      script.async = true;
      script.addEventListener('error', () => {
        ytApiPromise = null;
        reject(new Error('Could not reach YouTube. Check the network.'));
      });
      document.head.appendChild(script);
    }
  });
  return ytApiPromise;
}

/** The nearest rate the player offers, or null when nothing is close enough. */
export function nearestAvailableRate(rate, available) {
  const list = Array.isArray(available) ? available.filter((n) => Number.isFinite(n)) : [];
  if (!list.length) return null;
  const r = Number(rate) || 1;
  let best = list[0];
  list.forEach((candidate) => {
    if (Math.abs(candidate - r) < Math.abs(best - r)) best = candidate;
  });
  return Math.abs(best - r) <= YT_RATE_TOLERANCE ? best : null;
}

/**
 * Drive a YouTube video through the IFrame Player API.
 * @param {{ videoId: string, host: HTMLElement, volume?: number }} opts
 */
export function createYouTubeSource({ videoId, host, volume = 0.9 } = {}) {
  const state = {
    player: null,
    ready: false,
    error: '',
    wantPlaying: false,
    destroyed: false,
    rates: [1],
    volume: clamp(Number(volume), 0, 1),
  };

  const mount = document.createElement('div');
  mount.className = 'gpp-backing-yt-frame';
  host.innerHTML = '';
  host.appendChild(mount);

  loadYouTubeApi()
    .then((YT) => {
      if (state.destroyed) return;
      state.player = new YT.Player(mount, {
        videoId,
        playerVars: {
          controls: 1,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            if (state.destroyed) return;
            state.ready = true;
            try {
              state.rates = state.player.getAvailablePlaybackRates() || [1];
            } catch (e) {
              state.rates = [1];
            }
            try { state.player.setVolume(Math.round(state.volume * 100)); } catch (e) { /* ignore */ }
          },
          onError: () => {
            if (state.destroyed) return;
            state.error = 'YouTube refused to play this video here.';
          },
        },
      });
    })
    .catch((err) => {
      if (state.destroyed) return;
      state.error = err?.message || 'Could not load the YouTube player.';
    });

  function playerState() {
    try { return state.player?.getPlayerState?.(); } catch (e) { return -1; }
  }

  return {
    kind: 'youtube',
    driftThresholds: IFRAME_THRESHOLDS,
    pitchHeld: true,
    get ready() { return state.ready && !state.error; },
    get error() { return state.error; },
    get duration() {
      try { return Number(state.player?.getDuration?.()) || 0; } catch (e) { return 0; }
    },
    isPlaying() {
      // 1 is PLAYING and 3 is BUFFERING. A buffering player still intends to
      // play, so a restart command here would fight the player.
      const s = playerState();
      return state.wantPlaying && (s === 1 || s === 3);
    },
    play() {
      state.wantPlaying = true;
      try { state.player?.playVideo?.(); } catch (e) { /* ignore */ }
    },
    pause() {
      state.wantPlaying = false;
      try { state.player?.pauseVideo?.(); } catch (e) { /* ignore */ }
    },
    seek(sec) {
      try { state.player?.seekTo?.(Math.max(0, Number(sec) || 0), true); } catch (e) { /* ignore */ }
    },
    getTime() {
      try { return Number(state.player?.getCurrentTime?.()); } catch (e) { return NaN; }
    },
    setRate(rate) {
      const snapped = nearestAvailableRate(rate, state.rates);
      if (snapped == null) return;
      try { state.player?.setPlaybackRate?.(snapped); } catch (e) { /* ignore */ }
    },
    supportsRate(rate) {
      if (!state.ready) return true;
      return nearestAvailableRate(rate, state.rates) != null;
    },
    availableRates() {
      return [...state.rates];
    },
    setVolume(value) {
      state.volume = clamp(Number(value), 0, 1);
      try { state.player?.setVolume?.(Math.round(state.volume * 100)); } catch (e) { /* ignore */ }
    },
    destroy() {
      state.destroyed = true;
      state.wantPlaying = false;
      try { state.player?.destroy?.(); } catch (e) { /* ignore */ }
      state.player = null;
      host.innerHTML = '';
    },
  };
}
