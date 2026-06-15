let currentLabel = '';
let stopCallback = null;

export function showNowPlaying(label, onStop) {
  currentLabel = label;
  stopCallback = onStop;
  const bar = document.getElementById('now-playing');
  if (!bar) return;
  bar.querySelector('.np-label').textContent = label;
  bar.classList.add('visible');
}

export function hideNowPlaying() {
  const bar = document.getElementById('now-playing');
  if (bar) bar.classList.remove('visible');
  currentLabel = '';
  stopCallback = null;
}

export function initNowPlaying() {
  const stopBtn = document.getElementById('np-stop');
  if (stopBtn) {
    stopBtn.onclick = () => {
      if (stopCallback) stopCallback();
      hideNowPlaying();
    };
  }
}
