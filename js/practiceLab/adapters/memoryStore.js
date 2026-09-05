// The in-memory adapter of the PracticeStore port.
//
// The Node tests use it. A browser with IndexedDB blocked also uses it, so the
// tools still run and the screen shows a notice that a take will not survive
// a reload.

/**
 * @returns {Object} a PracticeStore
 */
export function createMemoryStore() {
  const entries = new Map();
  const clips = new Map();

  const clone = (value) => (value && typeof value === 'object' ? { ...value } : value);

  return {
    isAvailable() { return true; },

    async appendEntry(entry) {
      entries.set(entry.id, { ...entry });
      return clone(entries.get(entry.id));
    },
    async listEntries({ kind = '', limit = 0 } = {}) {
      const list = [...entries.values()]
        .filter(e => !kind || e.kind === kind)
        .sort((a, b) => String(a.at).localeCompare(String(b.at)))
        .map(clone);
      return limit > 0 ? list.slice(-Math.round(limit)) : list;
    },

    async saveClip(clip) {
      clips.set(clip.id, { ...clip });
      return clone(clips.get(clip.id));
    },
    async getClip(id) { return clone(clips.get(id)); },
    async listClips() {
      return [...clips.values()]
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
        .map(clone);
    },
    async deleteClip(id) { return clips.delete(id); },
  };
}
