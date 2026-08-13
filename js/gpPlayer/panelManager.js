// One open panel at a time. Close detaches listeners and observers.

/**
 * @returns {{
 *   register: (id:string, panel:object)=>void,
 *   open: (id:string)=>void,
 *   close: (id:string)=>void,
 *   closeAll: ()=>void,
 *   isOpen: (id:string)=>boolean,
 *   destroy: ()=>void,
 * }}
 */
export function createPanelManager() {
  /** @type {Map<string, { panel: object, detach?: ()=>void }>} */
  const entries = new Map();

  function register(id, panel, { detach } = {}) {
    entries.set(id, { panel, detach });
  }

  function detachPanel(id) {
    const entry = entries.get(id);
    if (!entry) return;
    entry.detach?.();
    if (typeof entry.panel.detach === 'function') entry.panel.detach();
  }

  function close(id) {
    const entry = entries.get(id);
    if (!entry) return;
    if (entry.panel.isOpen?.()) {
      entry.panel.close?.();
      detachPanel(id);
    }
  }

  function closeAll() {
    for (const id of entries.keys()) close(id);
  }

  function open(id) {
    for (const pid of entries.keys()) {
      if (pid !== id) close(pid);
    }
    entries.get(id)?.panel.open?.();
  }

  function isOpen(id) {
    return !!entries.get(id)?.panel.isOpen?.();
  }

  function destroy() {
    closeAll();
    for (const entry of entries.values()) entry.panel.destroy?.();
    entries.clear();
  }

  return { register, open, close, closeAll, isOpen, destroy };
}
