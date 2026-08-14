const METADATA_FIELDS = [
  'instrument',
  'materialType',
  'technique',
  'difficulty',
  'tags',
  'source',
  'contentHash',
  'favorite',
  'sourceRef',
];

export default {
  id: 'exercise-metadata.v1',
  version: 1,
  describe() {
    return 'Apply exercise metadata defaults on read.';
  },
  async detect(ctx) {
    const { items } = ctx.exercises.readStore();
    const stale = items.filter((item) => {
      return METADATA_FIELDS.some((field) => item[field] === undefined);
    });
    if (!stale.length) {
      return { needed: false, count: 0, reason: 'All exercises already expose metadata fields.' };
    }
    return {
      needed: true,
      count: stale.length,
      reason: `${stale.length} exercise(s) need metadata defaults.`,
    };
  },
  async apply(ctx) {
    const count = ctx.exercises.readStore().items.length;
    return { created: 0, updated: 0, skipped: count };
  },
  async verify(ctx) {
    const problems = [];
    const { items } = ctx.exercises.readStore();
    items.forEach((item, index) => {
      const normalized = ctx.exercises.normalizeItem(item);
      if (!normalized) {
        problems.push(`items[${index}] failed normalizeItem`);
        return;
      }
      METADATA_FIELDS.forEach((field) => {
        if (normalized[field] === undefined) {
          problems.push(`items[${index}] missing ${field}`);
        }
      });
      if (!Array.isArray(normalized.tags)) {
        problems.push(`items[${index}] tags is not an array`);
      }
      if (typeof normalized.favorite !== 'boolean') {
        problems.push(`items[${index}] favorite is not a boolean`);
      }
    });
    return { ok: problems.length === 0, problems };
  },
};
