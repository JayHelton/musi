// Keeps the persistent progress headers (streak / progress bar / accuracy) in
// sync with each quiz's existing score elements. It observes the score text the
// trainers already update, so no trainer logic needs to change.

function readCount(header) {
  if (header.dataset.score) {
    const el = document.querySelector(header.dataset.score);
    const m = (el && el.textContent || '').match(/(\d+)\s*\/\s*(\d+)/);
    if (m) return { right: Number(m[1]), total: Number(m[2]) };
    return { right: 0, total: 0 };
  }
  const right = Number((document.querySelector(header.dataset.right) || {}).textContent || 0);
  const total = Number((document.querySelector(header.dataset.total) || {}).textContent || 0);
  return { right, total };
}

function wire(header) {
  const fill = header.querySelector('.ph-bar-fill');
  const acc = header.querySelector('.ph-acc-val');
  const streakWrap = header.querySelector('.ph-streak');
  const streakEl = document.querySelector(header.dataset.streak);

  function recompute() {
    const { right, total } = readCount(header);
    const ratio = total > 0 ? right / total : 0;
    const pct = Math.round(ratio * 100);
    if (fill) fill.style.width = (ratio * 100) + '%';
    if (acc) acc.textContent = pct + '%';
    if (streakWrap && streakEl) {
      const streak = Number(streakEl.textContent || 0);
      streakWrap.classList.toggle('hot', streak >= 3);
    }
  }

  const watched = [];
  if (header.dataset.score) watched.push(document.querySelector(header.dataset.score));
  else { watched.push(document.querySelector(header.dataset.right)); watched.push(document.querySelector(header.dataset.total)); }
  if (streakEl) watched.push(streakEl);

  watched.filter(Boolean).forEach(el => {
    new MutationObserver(recompute).observe(el, { childList: true, characterData: true, subtree: true });
  });
  recompute();
}

export function initProgressHeaders() {
  document.querySelectorAll('.progress-header').forEach(wire);
}
