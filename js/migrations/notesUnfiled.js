const ALLOWED_LINKED_TYPES = new Set(['', 'song', 'exercise', 'workbook', 'routine']);

export default {
  id: 'notes-unfiled.v1',
  version: 1,
  describe() {
    return 'Apply note link defaults for Unfiled Notes.';
  },
  async detect(ctx) {
    const notes = ctx.notes.readAll();
    const stale = notes.filter((note) => {
      const linkedType = typeof note.linkedType === 'string' ? note.linkedType : '';
      const linkedId = note.linkedId;
      return !ALLOWED_LINKED_TYPES.has(linkedType) || typeof linkedId !== 'string';
    });
    if (!stale.length) {
      return { needed: false, count: 0, reason: 'All notes already expose link fields.' };
    }
    return {
      needed: true,
      count: stale.length,
      reason: `${stale.length} note(s) need link field defaults.`,
    };
  },
  async apply(ctx) {
    const count = ctx.notes.readAll().length;
    return { created: 0, updated: 0, skipped: count };
  },
  async verify(ctx) {
    const problems = [];
    ctx.notes.readAll().forEach((note, index) => {
      const linkedType = typeof note.linkedType === 'string' ? note.linkedType : '';
      if (!ALLOWED_LINKED_TYPES.has(linkedType)) {
        problems.push(`note[${index}] linkedType invalid: ${linkedType}`);
      }
      if (typeof note.linkedId !== 'string') {
        problems.push(`note[${index}] linkedId is not a string`);
      }
    });
    return { ok: problems.length === 0, problems };
  },
};
