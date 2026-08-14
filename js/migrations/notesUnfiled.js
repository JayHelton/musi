const ALLOWED_LINKED_TYPES = new Set(['', 'song', 'exercise', 'workbook', 'routine']);

export default {
  id: 'notes-unfiled.v1',
  version: 1,
  describe() {
    return 'Apply note link defaults for Unfiled Notes.';
  },
  async detect(ctx) {
    const notes = ctx.notes.readAll();
    const count = notes.length;
    return {
      needed: true,
      count,
      reason: count === 0
        ? 'Note store is empty; first-run migration must verify defaults.'
        : `${count} note record(s) require link field verification.`,
    };
  },
  async apply(ctx) {
    const count = ctx.notes.readAll().length;
    return { created: 0, updated: 0, skipped: count };
  },
  async verify(ctx) {
    const problems = [];
    ctx.notes.readAll().forEach((raw, index) => {
      const note = ctx.notes.normalizeNote(raw);
      if (!note) {
        problems.push(`note[${index}] failed normalizeNote`);
        return;
      }
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
