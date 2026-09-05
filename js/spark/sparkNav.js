// Navigation and notices, local to Riff Spark.

import { routeUrl } from '../appRoute.js';
import { showAppToast } from '../appToast.js';

/** Open one tab of the tool. The router repaints the section. */
export function openSparkMode(mode) {
  const url = routeUrl({ id: 'spark', params: { mode } });
  const hash = url.slice(url.indexOf('#'));
  if (window.location.hash === hash) return;
  window.location.hash = hash;
}

/** A short notice. */
export function flash(message) {
  showAppToast(message, { kind: 'info', timeoutMs: 2600 });
}

/** Put text on the clipboard. Returns true on success. */
export async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    /* fall through */
  }
  return false;
}
