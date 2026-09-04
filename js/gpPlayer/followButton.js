// "Follow playhead" pill.
//
// When the user scrolls away during playback, follow stops and this pill
// appears. Follow comes back when the user taps it, presses the follow
// shortcut, seeks, or restarts. A timer never brings it back.

import { el } from './dom.js';
import { icon } from './icons.js';

/**
 * @param {HTMLElement} host
 * @param {{ onFollow: () => void }} api
 */
export function mountFollowButton(host, api = {}) {
  const noop = { setVisible() {}, isVisible: () => false, destroy() {} };
  if (!host) return noop;

  const btn = el('button', {
    class: 'gpp-follow-btn',
    type: 'button',
    'aria-label': 'Follow the playhead',
    title: 'Follow playhead (F)',
    hidden: true,
    onClick: () => api.onFollow?.(),
  }, [
    el('span', { class: 'gpp-tbtn-icon', html: icon('follow'), 'aria-hidden': 'true' }),
    el('span', { class: 'gpp-tbtn-text', text: 'Follow playhead' }),
  ]);
  host.appendChild(btn);

  let visible = false;

  return {
    setVisible(on) {
      const want = !!on;
      if (want === visible) return;
      visible = want;
      btn.hidden = !want;
    },
    isVisible: () => visible,
    element: btn,
    destroy() {
      btn.remove?.();
      if (btn.parentElement) btn.parentElement.removeChild(btn);
    },
  };
}
