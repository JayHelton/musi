function uid(prefix) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

function favoriteSet(ctx) {
  const favorites = ctx.settings.read('drums.favorites', []);
  return new Set(Array.isArray(favorites) ? favorites.filter((id) => typeof id === 'string' && id) : []);
}

function isEligiblePattern(pattern, favSet) {
  if (!pattern || !pattern.id) return false;
  if (pattern.builtin === true && !favSet.has(pattern.id)) return false;
  return true;
}

function sourceRefFor(patternId) {
  return `drum-pattern:${patternId}`;
}

function bpmFromRange(bpmRange) {
  if (!Array.isArray(bpmRange) || bpmRange.length < 2) return null;
  const lo = Number(bpmRange[0]);
  const hi = Number(bpmRange[1]);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  return Math.round((lo + hi) / 2);
}

function patternTags(pattern) {
  const tags = Array.isArray(pattern.tags)
    ? pattern.tags.filter((tag) => typeof tag === 'string' && tag.trim()).map((tag) => tag.trim())
    : [];
  if (!tags.includes('drums')) tags.push('drums');
  return tags;
}

export default {
  id: 'drums-to-exercises.v1',
  version: 1,
  describe() {
    return 'Convert drum patterns into generic exercises.';
  },
  async detect(ctx) {
    const patterns = await ctx.drumPatterns.listAll();
    const favSet = favoriteSet(ctx);
    const { items } = ctx.exercises.readStore();
    const refs = new Set(items.map((item) => item.sourceRef).filter(Boolean));
    const pending = patterns.filter((pattern) => {
      if (!isEligiblePattern(pattern, favSet)) return false;
      return !refs.has(sourceRefFor(pattern.id));
    });
    if (!pending.length) {
      return { needed: false, count: 0, reason: 'All eligible drum patterns already have exercises.' };
    }
    return {
      needed: true,
      count: pending.length,
      reason: `${pending.length} pattern(s) need exercise conversion.`,
    };
  },
  async apply(ctx) {
    const patterns = await ctx.drumPatterns.listAll();
    const favSet = favoriteSet(ctx);
    const store = ctx.exercises.readStore();
    const items = [...store.items];
    const refs = new Set(items.map((item) => item.sourceRef).filter(Boolean));

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const pattern of patterns) {
      if (!isEligiblePattern(pattern, favSet)) {
        skipped += 1;
        continue;
      }
      const sourceRef = sourceRefFor(pattern.id);
      if (refs.has(sourceRef)) {
        skipped += 1;
        continue;
      }

      let attachmentId = typeof pattern.attachmentId === 'string' ? pattern.attachmentId : '';
      if (attachmentId && await ctx.attachments.hasFile(attachmentId)) {
        // Keep a source attachment when the pattern already carries one.
      } else {
        attachmentId = '';
        const doc = { format: 'musi-drum-pattern', version: 1, pattern };
        const body = JSON.stringify(doc);
        const blob = new Blob([body], { type: 'application/json' });
        attachmentId = uid('att');
        const meta = await ctx.attachments.putFileWithId({
          id: attachmentId,
          blob,
          name: pattern.title || 'Drum pattern',
          fileName: `${pattern.id}.musi-drum-pattern.json`,
          type: 'application/json',
          size: body.length,
          createdAt: ctx.clock.now(),
          source: 'drums-migration',
        });
        if (!meta) {
          throw new Error(`attachment write failed for pattern ${pattern.id}`);
        }
      }

      const rawItem = {
        id: uid('ex'),
        name: pattern.title || 'Drum pattern',
        categoryId: '',
        attachmentId,
        url: '',
        fileName: `${pattern.id}.musi-drum-pattern.json`,
        type: 'application/json',
        size: 0,
        addedAt: ctx.clock.now(),
        instrument: 'drums',
        materialType: typeof pattern.category === 'string' ? pattern.category : 'beat',
        tags: patternTags(pattern),
        source: 'drums-migration',
        sourceRef,
        favorite: pattern.builtin === true && favSet.has(pattern.id),
        bpm: bpmFromRange(pattern.bpmRange),
      };
      const item = ctx.exercises.normalizeItem(rawItem);
      if (!item) {
        throw new Error(`exercise normalize failed for pattern ${pattern.id}`);
      }
      items.push(item);
      refs.add(sourceRef);
      created += 1;
    }

    ctx.exercises.writeStore({ ...store, items });
    return { created, updated, skipped };
  },
  async verify(ctx) {
    const patterns = await ctx.drumPatterns.listAll();
    const favSet = favoriteSet(ctx);
    const { items } = ctx.exercises.readStore();
    const problems = [];

    patterns.forEach((pattern) => {
      if (!isEligiblePattern(pattern, favSet)) return;
      const sourceRef = sourceRefFor(pattern.id);
      const matches = items.filter((item) => item.sourceRef === sourceRef);
      if (!matches.length) {
        problems.push(`missing exercise for ${sourceRef}`);
        return;
      }
      if (matches.length > 1) {
        problems.push(`duplicate exercises for ${sourceRef}`);
        return;
      }
      const exercise = matches[0];
      if (!exercise.attachmentId) {
        problems.push(`exercise ${exercise.id} has no attachmentId`);
      }
      if (exercise.instrument !== 'drums') {
        problems.push(`exercise ${exercise.id} instrument is not drums`);
      }
    });

    return { ok: problems.length === 0, problems };
  },
};
