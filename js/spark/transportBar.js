// The transport of Riff Spark: play, stop, tempo, and the pulse switch.
//
// The tempo is the shared tempo of the app. A change here reaches the
// metronome and every other tool that reads it.

import { getContext, setContext, subscribeContext, TEMPO_MIN, TEMPO_MAX } from '../musicalContext.js';
import { el, btn, toggle } from './dom.js';

const SOURCE = 'spark';

/**
 * @param {{onPlay: Function, onStop: Function, onTempo: Function, onPulse: Function, pulseOn: boolean}} handlers
 * @returns {{root: HTMLElement, setPlaying: Function, tempo: Function, stop: Function}}
 */
export function createTransport({ onPlay, onStop, onTempo, onPulse, pulseOn = true }) {
  let playing = false;

  const playButton = btn({
    label: '▶ Play',
    className: 'primary sk-play',
    onPress: () => { if (playing) onStop?.(); else onPlay?.(); },
  });

  const tempoInput = el('input', {
    type: 'number', class: 'sk-tempo-input', min: String(TEMPO_MIN), max: String(TEMPO_MAX), step: '1',
    value: String(getContext().tempo),
    on: { change: () => commit(Number(tempoInput.value)) },
  });
  tempoInput.setAttribute('aria-label', 'Tempo in BPM');

  function commit(next) {
    const tempo = Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, Math.round(Number(next))));
    if (!Number.isFinite(tempo)) { tempoInput.value = String(getContext().tempo); return; }
    tempoInput.value = String(tempo);
    setContext({ tempo }, SOURCE);
    onTempo?.(tempo);
  }

  const minus = el('button', { type: 'button', class: 'sk-step-btn', text: '−', on: { click: () => commit(Number(tempoInput.value) - 5) } });
  minus.setAttribute('aria-label', 'Tempo down by five');
  const plus = el('button', { type: 'button', class: 'sk-step-btn', text: '+', on: { click: () => commit(Number(tempoInput.value) + 5) } });
  plus.setAttribute('aria-label', 'Tempo up by five');

  const pulse = toggle({ label: 'Pulse click', checked: pulseOn, onChange: (on) => onPulse?.(on) });

  const unsubscribe = subscribeContext((ctx, source) => {
    if (source === SOURCE) return;
    tempoInput.value = String(ctx.tempo);
    onTempo?.(ctx.tempo);
  });

  const root = el('div', { class: 'sk-transport' }, [
    playButton,
    el('div', { class: 'sk-tempo' }, [
      el('span', { class: 'sk-field-label', text: 'BPM' }),
      el('div', { class: 'sk-step-row' }, [minus, tempoInput, plus]),
    ]),
    pulse.root,
  ]);

  return {
    root,
    setPlaying(next) {
      playing = !!next;
      playButton.textContent = playing ? '■ Stop' : '▶ Play';
      playButton.classList.toggle('playing', playing);
      playButton.setAttribute('aria-pressed', playing ? 'true' : 'false');
    },
    tempo: () => Number(tempoInput.value) || getContext().tempo,
    stop() { unsubscribe(); },
  };
}
