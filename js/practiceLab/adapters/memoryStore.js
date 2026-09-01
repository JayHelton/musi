// The in-memory adapter of the PracticeStore port.
//
// The Node tests use it. A browser with IndexedDB blocked also uses it, so the
// session still runs and the tool shows a notice that it cannot save the log.

/**
 * @param {{ seed?: Object }} [options]
 * @returns {Object} a PracticeStore
 */
export function createMemoryStore({ seed = {} } = {}) {
  let catalog = seed.catalog ? { ...seed.catalog } : null;
  const sessions = new Map();
  const entries = new Map();
  const clips = new Map();

  const clone = (value) => (value && typeof value === 'object' ? { ...value } : value);

  return {
    isAvailable() { return true; },

    async getCatalog() { return clone(catalog); },
    async saveCatalog(record) {
      catalog = clone(record);
      return clone(catalog);
    },

    async createSession(session) {
      sessions.set(session.id, { ...session });
      return clone(sessions.get(session.id));
    },
    async endSession(id, patch) {
      const found = sessions.get(id);
      if (!found) return null;
      const next = { ...found, ...patch };
      sessions.set(id, next);
      return clone(next);
    },
    async getSession(id) { return clone(sessions.get(id)); },
    async listSessions({ status = '' } = {}) {
      const all = [...sessions.values()]
        .filter(s => !status || s.status === status)
        .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
      return all.map(clone);
    },
    async deleteSession(id) {
      sessions.delete(id);
      for (const [key, entry] of [...entries]) {
        if (entry.sessionId === id) entries.delete(key);
      }
      for (const [key, clip] of [...clips]) {
        if (clip.sessionId === id) clips.delete(key);
      }
      return true;
    },

    async appendEntry(entry) {
      entries.set(entry.id, { ...entry });
      return clone(entries.get(entry.id));
    },
    async listEntries(sessionId) {
      return [...entries.values()]
        .filter(e => e.sessionId === sessionId)
        .sort((a, b) => String(a.at).localeCompare(String(b.at)))
        .map(clone);
    },
    async listAllEntries({ kind = '' } = {}) {
      return [...entries.values()]
        .filter(e => !kind || e.kind === kind)
        .sort((a, b) => String(a.at).localeCompare(String(b.at)))
        .map(clone);
    },
    async updateEntry(id, patch) {
      const found = entries.get(id);
      if (!found) return null;
      const next = { ...found, data: { ...found.data, ...patch } };
      entries.set(id, next);
      return clone(next);
    },

    async saveClip(clip) {
      clips.set(clip.id, { ...clip });
      return clone(clips.get(clip.id));
    },
    async getClip(id) { return clone(clips.get(id)); },
    async listClips(sessionId) {
      return [...clips.values()]
        .filter(c => c.sessionId === sessionId)
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
        .map(clone);
    },
    async deleteClip(id) { return clips.delete(id); },
  };
}
