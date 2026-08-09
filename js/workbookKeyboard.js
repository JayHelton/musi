// Workbook detail keyboard shortcuts — pure decision logic (DOM-agnostic).

export const WB_KEY_ACTIONS = {
  PREV: 'prev',
  NEXT: 'next',
  TOGGLE_PLAY: 'togglePlay',
  BPM_UP: 'bpmUp',
  BPM_DOWN: 'bpmDown',
};

/** Walk ancestors for modal, drawer, and faux-button zones. */
export function nodeInBlockedShortcutZone(node) {
  if (!node || typeof node !== 'object') return false;
  for (let el = node; el; el = el.parentElement || el.parent) {
    const tag = el.tagName;
    if (tag === 'BUTTON') return true;
    if (el.getAttribute?.('role') === 'button') return true;
    if (el.isContentEditable) return true;
    const cl = el.classList;
    if (cl?.contains('modal-overlay') || cl?.contains('modal-dialog')) return true;
    if (cl?.contains('wb-playlist-drawer') && cl.contains('is-open')) return true;
    if (cl?.contains('gpp-drawer') && cl.contains('is-open')) return true;
    if (cl?.contains('gpp-sheet') && cl.contains('is-open')) return true;
  }
  return false;
}

export function isWorkbookShortcutTargetBlocked(target) {
  if (!target) return true;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return true;
  if (target.isContentEditable) return true;
  return nodeInBlockedShortcutZone(target);
}

/**
 * @param {KeyboardEvent|{ code?: string, key?: string, repeat?: boolean, defaultPrevented?: boolean, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean, shiftKey?: boolean, target?: unknown }} event
 * @param {{ openWorkbookId?: string|null, sectionActive?: boolean, dialogOpen?: boolean }} ctx
 * @returns {string|null} WB_KEY_ACTIONS value
 */
export function resolveWorkbookShortcutAction(event, {
  openWorkbookId = null,
  sectionActive = false,
  dialogOpen = false,
} = {}) {
  if (!openWorkbookId || !sectionActive || dialogOpen) return null;
  if (!event || event.defaultPrevented) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;

  if (isWorkbookShortcutTargetBlocked(event.target)) return null;

  const code = event.code || '';
  if (code === 'ArrowLeft') return WB_KEY_ACTIONS.PREV;
  if (code === 'ArrowRight') return WB_KEY_ACTIONS.NEXT;
  if (code === 'Space') {
    if (event.repeat) return null;
    return WB_KEY_ACTIONS.TOGGLE_PLAY;
  }
  if (code === 'KeyA') return WB_KEY_ACTIONS.BPM_UP;
  if (code === 'KeyD') return WB_KEY_ACTIONS.BPM_DOWN;
  return null;
}
