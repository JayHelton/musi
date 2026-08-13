// Loop selection controller — wires parchment and measure nav to state.

/**
 * @param {{
 *   getState: ()=>object,
 *   applyRange?: (startBeat:number, endBeat:number)=>void,
 *   clearRange?: ()=>void,
 *   parchment: object,
 *   onLoopChanged?: ()=>void,
 * }} opts
 */
export function createLoopSelectionController({
  getState,
  applyRange,
  clearRange,
  parchment,
  onLoopChanged,
} = {}) {
  function syncFromState() {
    const st = getState?.();
    if (!st || !parchment) return;
    const rangeActive = !!st.loopEnabled
      && st.loopStartBeat != null
      && st.loopEndBeat != null;
    if (rangeActive) {
      parchment.setSelection({ startBeat: st.loopStartBeat, endBeat: st.loopEndBeat });
    } else {
      parchment.setSelection(null);
    }
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
    applySelection(sel);
  }

  function applyMeasureRange(startIdx, endIdx) {
    const st = getState?.();
    const measures = st?.viewModel?.measures || [];
    if (!measures.length) return;
    const lo = Math.max(0, Math.min(startIdx, endIdx));
    const hi = Math.min(measures.length - 1, Math.max(startIdx, endIdx));
    const startBeat = measures[lo]?.startBeat ?? 0;
    const endBeat = measures[hi]?.endBeat ?? startBeat + 1;
    if (endBeat > startBeat) applySelection({ startBeat, endBeat });
  }

  return {
    clear,
    applySelection,
    applyMeasureRange,
    syncFromState,
    handleSelectionChange,
  };
}
