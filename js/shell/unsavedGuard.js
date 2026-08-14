const CHOICE_LABELS = {
  save: 'Save',
  discard: 'Discard',
  keep: 'Keep editing',
};

const registry = new Map();

function labelToResult(label) {
  if (label === CHOICE_LABELS.save) return 'save';
  if (label === CHOICE_LABELS.discard) return 'discard';
  return 'keep';
}

function buildPromptTitle() {
  const descriptions = [];
  for (const handlers of registry.values()) {
    if (typeof handlers.describe === 'function') {
      const text = handlers.describe();
      if (text) descriptions.push(text);
    }
  }
  if (descriptions.length === 0) return 'You have unsaved changes';
  return descriptions.join('\n');
}

async function runHandlers(method) {
  const tasks = [];
  for (const handlers of registry.values()) {
    const fn = handlers[method];
    if (typeof fn === 'function') {
      tasks.push(Promise.resolve(fn()));
    }
  }
  await Promise.all(tasks);
}

export function registerUnsaved(scopeId, handlers) {
  registry.set(scopeId, handlers);
}

export function clearUnsaved(scopeId) {
  registry.delete(scopeId);
}

export function hasUnsaved() {
  return registry.size > 0;
}

export async function confirmLeave(promptFn) {
  if (!hasUnsaved()) return 'keep';

  if (typeof promptFn !== 'function') {
    return 'keep';
  }

  const choice = await promptFn({
    title: buildPromptTitle(),
    choices: [CHOICE_LABELS.save, CHOICE_LABELS.discard, CHOICE_LABELS.keep],
  });

  const result = labelToResult(choice);
  if (result === 'save') {
    await runHandlers('save');
    registry.clear();
    return 'save';
  }
  if (result === 'discard') {
    await runHandlers('discard');
    registry.clear();
    return 'discard';
  }
  return 'keep';
}
