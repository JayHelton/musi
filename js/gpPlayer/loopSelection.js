// Loop selection controller — wires loopSelectMode ↔ parchment ↔ state.

/**
 * @param {{
 *   getState: ()=>object,
 *   applyRange?: (startBeat:number, endBeat:number)=>void,
 *   clearRange?: ()=>void,
 *   setSelectMode?: (on:boolean)=>void,
 *   parchment: object,
 *   onLoopChanged?: ()=>void,
 * }} opts
 */
export function createLoopSelectionController({
  getState,
  applyRange,
  clearRange,
  setSelectMode,
  parchment,
  onLoopChanged,
} = {}) {
  let enabled = false;

  function syncFromState() {
    const st = getState?.();
    if (!st || !parchment) return;
    enabled = !!st.loopSelectMode;
    if (st.loopStartBeat != null && st.loopEndBeat != null) {
      parchment.setSelection({ startBeat: st.loopStartBeat, endBeat: st.loopEndBeat });
    } else {
      parchment.setSelection(null);
    }
    parchment.setLoopSelectMode?.(enabled);
  }

  function enable() {
    enabled = true;
    setSelectMode?.(true);
    parchment?.setLoopSelectMode?.(true);
    syncFromState();
  }

  function disable() {
    enabled = false;
    setSelectMode?.(false);
    parchment?.setLoopSelectMode?.(false);
  }

  function clear() {
    clearRange?.();
    parchment?.setSelection?.(null);
    if (typeof onLoopChanged === 'function') onLoopChanged();
  }

  function applySelection(sel) {
    if (!sel || !Number.isFinite(sel.startBeat) || !Number.isFinite(sel.endBeat)) return;
    applyRange?.(sel.startBeat, sel.endBeat);
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
