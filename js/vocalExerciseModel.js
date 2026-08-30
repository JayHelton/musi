// The vocal metadata of a Practice Library exercise.
//
// Vocal practice adds no exercise store of its own. A vocal exercise is a
// normal library exercise. It carries its vocal metadata in the fields the
// library already has:
//
//   kind        'runner' for a clean pitch exercise, 'cue' for a harsh one
//   instrument  'voice'
//   tags        'vocal:clean' or 'vocal:harsh'
//               'register:mix', 'register:low', …
//               'focus:g4-reliability', 'focus:activation', …
//
// So the Practice Library stays the source of truth, the exercise picker of
// Practice Lab filters on the tags, and a rename of a folder or an exercise
// changes nothing about the metadata.
//
// This module holds no DOM code, so the Node test runners can import it.

export const VOCAL_INSTRUMENT = 'voice';
export const VOCAL_PRACTICE_TYPE = 'vocal';

export const VOCAL_STYLES = ['clean', 'harsh'];

export const CLEAN_REGISTERS = ['chest', 'mix', 'head'];
export const HARSH_REGISTERS = ['low', 'mid', 'high'];

const REGISTERS_BY_STYLE = { clean: CLEAN_REGISTERS, harsh: HARSH_REGISTERS };

export const REGISTER_LABELS = {
  chest: 'Chest',
  mix: 'Mix',
  head: 'Head',
  low: 'Low',
  mid: 'Mid',
  high: 'High',
};

export const STYLE_LABELS = { clean: 'Clean', harsh: 'Harsh' };

/** The exercise kind each style plays. Clean uses Pitch Runner, harsh uses Cue Runner. */
export const RUNNER_BY_STYLE = { clean: 'runner', harsh: 'cue' };

const TAG_STYLE = 'vocal:';
const TAG_REGISTER = 'register:';
const TAG_FOCUS = 'focus:';

/**
 * The focus areas each register trains. The picker shows these, and an
 * exercise carries any number of them.
 */
export const FOCUS_LABELS = {
  // clean · chest
  'clean-onset': 'Clean onset',
  'pitch-stability': 'Pitch stability',
  'sustained-tone': 'Sustained tone',
  'dynamic-control': 'Dynamic control',
  'vowel-consistency': 'Vowel consistency',
  'chest-to-mix': 'Chest → mix',
  // clean · mix
  'd4-e4-ease': 'D4–E4 ease',
  'f4-stability': 'F4 stability',
  'fs4-stability': 'F#4 stability',
  'g4-reliability': 'G4 reliability',
  'g4-vowel-consistency': 'G4 vowel consistency',
  'mix-to-head': 'Mix → head',
  twang: 'Twang / bright resonance',
  'controlled-intensity': 'Controlled intensity',
  // clean · head
  'sustained-stability': 'Sustained stability',
  'pitch-accuracy': 'Pitch accuracy',
  agility: 'Agility',
  'head-to-mix': 'Head → mix',
  // harsh · shared
  activation: 'Immediate activation',
  consistency: 'Consistency',
  'start-stop': 'Start / stop',
  sustain: 'Sustain',
  depth: 'Depth and resonance',
  diction: 'Diction',
  character: 'Character control',
  dynamics: 'Dynamics',
  endurance: 'Endurance',
  brightness: 'Controlled brightness',
  grit: 'Deliberate grit',
  transition: 'Register switching',
};

export const FOCUS_BY_MODE = {
  'clean:chest': [
    'clean-onset', 'pitch-stability', 'sustained-tone', 'dynamic-control',
    'vowel-consistency', 'chest-to-mix',
  ],
  'clean:mix': [
    'd4-e4-ease', 'f4-stability', 'fs4-stability', 'g4-reliability',
    'g4-vowel-consistency', 'chest-to-mix', 'mix-to-head', 'twang',
    'controlled-intensity', 'vowel-consistency',
  ],
  'clean:head': [
    'clean-onset', 'sustained-stability', 'pitch-accuracy', 'dynamic-control',
    'agility', 'head-to-mix',
  ],
  'harsh:low': [
    'activation', 'consistency', 'depth', 'sustain', 'start-stop', 'diction',
    'character', 'transition',
  ],
  'harsh:mid': [
    'activation', 'consistency', 'start-stop', 'sustain', 'dynamics', 'diction',
    'character', 'transition',
  ],
  'harsh:high': [
    'activation', 'consistency', 'start-stop', 'sustain', 'endurance',
    'brightness', 'grit', 'diction', 'transition',
  ],
};

/** The self-reported result of one repetition. */
export const ACTIVATION_OUTCOMES = ['immediate', 'searched', 'missed'];
export const QUALITY_OUTCOMES = ['clean', 'unstable', 'stopped'];

export const OUTCOME_LABELS = {
  immediate: 'Immediate',
  searched: 'Searched',
  missed: 'Missed',
  clean: 'Clean',
  unstable: 'Unstable',
  stopped: 'Stopped',
};

/** How hard the singer worked. Musi records it and never celebrates it. */
export const EFFORT_LEVELS = ['easy', 'working', 'strained'];
export const EFFORT_LABELS = { easy: 'Easy', working: 'Working', strained: 'Strained' };

export const CLEAN_ISSUE_TAGS = [
  'pitch', 'break', 'push', 'breath', 'onset', 'vowel', 'resonance', 'transition',
];
export const HARSH_ISSUE_TAGS = [
  'placement', 'air', 'diction', 'grit', 'transition', 'fatigue', 'onset', 'release',
];

export const ISSUE_LABELS = {
  pitch: 'Pitch',
  break: 'Break',
  push: 'Push',
  breath: 'Breath',
  onset: 'Onset',
  vowel: 'Vowel',
  resonance: 'Resonance',
  transition: 'Transition',
  placement: 'Placement',
  air: 'Air',
  diction: 'Diction',
  grit: 'Grit',
  fatigue: 'Fatigue',
  release: 'Release',
};

function slug(value) {
  return String(value || '').trim().toLowerCase();
}

function tagList(item) {
  return Array.isArray(item?.tags) ? item.tags.map(slug).filter(Boolean) : [];
}

/** The registers a style offers. */
export function registersOfStyle(style) {
  return REGISTERS_BY_STYLE[slug(style)] || [];
}

/** The focus areas one mode offers, for example `clean` and `mix`. */
export function focusOfMode(style, register) {
  return FOCUS_BY_MODE[`${slug(style)}:${slug(register)}`] || [];
}

export function focusLabel(id) {
  return FOCUS_LABELS[slug(id)] || slug(id).replace(/-/g, ' ');
}

export function registerLabel(id) {
  return REGISTER_LABELS[slug(id)] || slug(id);
}

/** The style of one exercise: 'clean', 'harsh', or '' when it is not vocal. */
export function vocalStyleOf(item) {
  for (const tag of tagList(item)) {
    if (!tag.startsWith(TAG_STYLE)) continue;
    const style = tag.slice(TAG_STYLE.length);
    if (VOCAL_STYLES.includes(style)) return style;
  }
  return '';
}

/** The registers of one exercise. A transition exercise holds more than one. */
export function registersOf(item) {
  const style = vocalStyleOf(item);
  const allowed = registersOfStyle(style);
  const out = [];
  for (const tag of tagList(item)) {
    if (!tag.startsWith(TAG_REGISTER)) continue;
    const register = tag.slice(TAG_REGISTER.length);
    if (allowed.includes(register) && !out.includes(register)) out.push(register);
  }
  return out;
}

/** The focus tags of one exercise. */
export function focusOf(item) {
  const out = [];
  for (const tag of tagList(item)) {
    if (!tag.startsWith(TAG_FOCUS)) continue;
    const focus = tag.slice(TAG_FOCUS.length);
    if (focus && !out.includes(focus)) out.push(focus);
  }
  return out;
}

/**
 * The vocal metadata of one exercise.
 * @returns {{practiceType:string, vocalStyle:string, registers:string[], focus:string[]}|null}
 */
export function readVocalMeta(item) {
  const vocalStyle = vocalStyleOf(item);
  if (!vocalStyle) return null;
  return {
    practiceType: VOCAL_PRACTICE_TYPE,
    vocalStyle,
    registers: registersOf(item),
    focus: focusOf(item),
  };
}

/**
 * Build the tag list of a vocal exercise.
 * @param {{ style: string, registers?: string[], focus?: string[], extra?: string[] }} meta
 * @returns {string[]}
 */
export function vocalTags(meta) {
  const { style, registers = [], focus = [], extra = [] } = meta || {};
  const cleanStyle = slug(style);
  if (!VOCAL_STYLES.includes(cleanStyle)) return [];
  const allowed = registersOfStyle(cleanStyle);
  const tags = [`${TAG_STYLE}${cleanStyle}`];
  for (const register of registers) {
    const value = slug(register);
    if (allowed.includes(value)) tags.push(`${TAG_REGISTER}${value}`);
  }
  for (const entry of focus) {
    const value = slug(entry);
    if (value) tags.push(`${TAG_FOCUS}${value}`);
  }
  for (const entry of extra) {
    const value = String(entry || '').trim();
    if (value) tags.push(value);
  }
  return [...new Set(tags)];
}

/** True when the exercise carries vocal metadata at all. */
export function isVocalExercise(item) {
  return !!vocalStyleOf(item);
}

/**
 * True when Practice Lab can run this exercise in this mode.
 *
 * A clean mode needs a pitch-runner exercise, a harsh mode needs a cue
 * exercise, and the register must be one the exercise names.
 *
 * @param {Object} item a library exercise
 * @param {{ style: string, register?: string }} mode
 */
export function matchesVocalMode(item, { style, register = '' } = {}) {
  const wantStyle = slug(style);
  if (!VOCAL_STYLES.includes(wantStyle)) return false;
  if (vocalStyleOf(item) !== wantStyle) return false;
  if (item?.kind !== RUNNER_BY_STYLE[wantStyle]) return false;
  if (!register) return true;
  return registersOf(item).includes(slug(register));
}

/**
 * The compatible exercises of one mode, by name.
 * @param {Object[]} items
 * @param {{ style: string, register?: string, search?: string }} mode
 */
export function filterVocalExercises(items, { style, register = '', search = '' } = {}) {
  const needle = slug(search);
  return (Array.isArray(items) ? items : [])
    .filter(item => matchesVocalMode(item, { style, register }))
    .filter((item) => {
      if (!needle) return true;
      const haystack = [item.name, ...focusOf(item).map(focusLabel)].join(' ').toLowerCase();
      return haystack.includes(needle);
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/** The short focus line the exercise picker shows under a name. */
export function describeVocalExercise(item) {
  const meta = readVocalMeta(item);
  if (!meta) return '';
  const parts = [];
  if (meta.registers.length) parts.push(meta.registers.map(registerLabel).join(' · '));
  if (meta.focus.length) parts.push(meta.focus.slice(0, 3).map(focusLabel).join(', '));
  return parts.join(' — ');
}

/**
 * The result vocabulary one exercise reports with.
 *
 * An activation or switching exercise asks whether the sound arrived at once.
 * Every other exercise asks how the repetition held together.
 */
export function outcomeSetOf(item) {
  const focus = focusOf(item);
  const activation = focus.includes('activation') || focus.includes('transition');
  return activation ? ACTIVATION_OUTCOMES : QUALITY_OUTCOMES;
}

/** The issue tags one style offers. */
export function issueTagsOfStyle(style) {
  return slug(style) === 'harsh' ? HARSH_ISSUE_TAGS : CLEAN_ISSUE_TAGS;
}

export function outcomeLabel(id) {
  return OUTCOME_LABELS[slug(id)] || slug(id);
}

export function issueLabel(id) {
  return ISSUE_LABELS[slug(id)] || slug(id);
}

export function effortLabel(id) {
  return EFFORT_LABELS[slug(id)] || slug(id);
}

/**
 * Replace the vocal tags of an exercise and keep every other tag.
 *
 * An exercise that stops being vocal loses its vocal tags and keeps the rest.
 *
 * @param {string[]} tags the tags the exercise carries now
 * @param {{ style?: string, registers?: string[], focus?: string[] }} meta
 * @returns {string[]}
 */
export function withVocalTags(tags, meta = {}) {
  const kept = (Array.isArray(tags) ? tags : []).filter((tag) => {
    const value = slug(tag);
    return !value.startsWith(TAG_STYLE)
      && !value.startsWith(TAG_REGISTER)
      && !value.startsWith(TAG_FOCUS);
  });
  return [...kept, ...vocalTags(meta)];
}
