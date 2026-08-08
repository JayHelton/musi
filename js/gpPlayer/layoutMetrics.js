const GUTTER_PX = 4;

/**
 * Measure chrome offset from the viewport top and publish CSS vars so the player
 * fits above the app dock. Recomputes on resize / orientation change.
 */
export function installGppLayoutMetrics({ host, chrome, section = null }) {
  const target = section || host;
  let raf = 0;
  let scrollLocked = false;

  function measure() {
    if (!chrome?.isConnected) return;
    const top = Math.max(0, Math.round(chrome.getBoundingClientRect().top));
    target.style.setProperty('--gpp-top-offset', `${top}px`);
    target.style.setProperty('--gpp-bottom-gutter', `${GUTTER_PX}px`);
    host.classList.add('gpp-has-layout-metrics');
  }

  function schedule() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(measure);
    });
  }

  function lockScroll() {
    if (scrollLocked) return;
    scrollLocked = true;
    document.documentElement.classList.add('gpp-player-locked');
  }

  function unlockScroll() {
    if (!scrollLocked) return;
    scrollLocked = false;
    document.documentElement.classList.remove('gpp-player-locked');
  }

  schedule();
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  window.visualViewport?.addEventListener('resize', schedule);

  if (section) lockScroll();

  return {
    refresh: schedule,
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      target.style.removeProperty('--gpp-top-offset');
      target.style.removeProperty('--gpp-bottom-gutter');
      host.classList.remove('gpp-has-layout-metrics');
      if (section) unlockScroll();
    },
  };
}
