// Loop selection controller — wires loopSelectMode ↔ parchment ↔ state.

/**
 * @param {{ getState: ()=>object, setState: (patch:object)=>void, parchment: object, onLoopChanged?: ()=>void }} opts
 */
export function createLoopSelectionController({ getState, setState, parchment, onLoopChanged } = {}) {
  let enabled = false;

  function syncFromState() {
    const st = getState?.();
    if (!st || !parchment) return;
    if (st.loopStartBeat != null && st.loopEndBeat != null) {
      parchment.setSelection({ startBeat: st.loopStartBeat, endBeat: st.loopEndBeat });
    } else {
      parchment.setSelection(null);
    }
    parchment.setLoopSelectMode?.(!!st.loopSelectMode);
  }

  function enable() {
    enabled = true;
    setState?.({ loopSelectMode: true });
    parchment?.setLoopSelectMode?.(true);
    syncFromState();
  }

  function disable() {
    enabled = false;
    setState?.({ loopSelectMode: false });
    parchment?.setLoopSelectMode?.(false);
  }

  function clear() {
    setState?.({
      loopEnabled: false,
      loopStartBeat: null,
      loopEndBeat: null,
    });
    parchment?.setSelection?.(null);
    if (typeof onLoopChanged === 'function') onLoopChanged();
  }

  function applySelection(sel) {
    if (!sel || !Number.isFinite(sel.startBeat) || !Number.isFinite(sel.endBeat)) return;
    setState?.({
      loopStartBeat: sel.startBeat,
      loopEndBeat: sel.endBeat,
      loopEnabled: true,
    });
    parchment?.setSelection?.({ startBeat: sel.startBeat, endBeat: sel.endBeat });
    if (typeof onLoopChanged === 'function') onLoopChanged();
  }

  function handleSelectionChange(sel) {
    if (!enabled) return;
    applySelection(sel);
  }

  return {
    enable,
    disable,
    clear,
    applySelection,
    syncFromState,
    handleSelectionChange,
    isEnabled: () => enabled,
  };
}
