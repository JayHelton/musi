/**
 * Reveal / self-check state for Interval Map study exercises.
 * Revealing never counts as an independently correct automatic response.
 */

export const REVEAL_LEVELS = {
  none: 'none',
  hint: 'hint',
  subject: 'subject',
  oneAnswer: 'one-answer',
  fullAnswer: 'full-answer',
};

export const SELF_GRADES = {
  knew: 'knew',
  almost: 'almost',
  needPractice: 'need-practice',
};

export function createRevealState(question = {}) {
  return {
    questionId: question.id || null,
    hiddenAnchor: !!question.hideAnchor,
    hiddenSubject: !!question.hideSubject,
    hiddenAnswers: question.hideAnswers !== false,
    revealLevel: REVEAL_LEVELS.none,
    revealedAnchor: false,
    revealedSubject: false,
    revealedHint: false,
    revealedOne: false,
    revealedAll: false,
    hintKind: null,
    oneAnswer: null,
    selfGrade: null,
    graded: false,
  };
}

export function applyReveal(state, action, payload = {}) {
  const next = { ...state };
  switch (action) {
    case 'reveal-anchor':
      next.revealedAnchor = true;
      if (rank(next.revealLevel) < rank(REVEAL_LEVELS.hint)) {
        // anchor reveal alone does not escalate answer reveal level
      }
      break;
    case 'reveal-subject':
      next.revealedSubject = true;
      next.revealLevel = maxLevel(next.revealLevel, REVEAL_LEVELS.subject);
      break;
    case 'reveal-hint':
      next.revealedHint = true;
      next.hintKind = payload.kind || next.hintKind || 'semitones';
      next.revealLevel = maxLevel(next.revealLevel, REVEAL_LEVELS.hint);
      break;
    case 'reveal-one':
      next.revealedOne = true;
      next.oneAnswer = payload.position || next.oneAnswer;
      next.revealLevel = maxLevel(next.revealLevel, REVEAL_LEVELS.oneAnswer);
      break;
    case 'reveal-all':
      next.revealedAll = true;
      next.revealLevel = REVEAL_LEVELS.fullAnswer;
      break;
    case 'hide-again':
      return createRevealState({
        id: state.questionId,
        hideAnchor: state.hiddenAnchor,
        hideSubject: state.hiddenSubject,
        hideAnswers: state.hiddenAnswers,
      });
    case 'self-grade':
      next.selfGrade = payload.grade || null;
      next.graded = !!payload.grade;
      break;
    default:
      break;
  }
  return next;
}

function rank(level) {
  const order = [
    REVEAL_LEVELS.none,
    REVEAL_LEVELS.hint,
    REVEAL_LEVELS.subject,
    REVEAL_LEVELS.oneAnswer,
    REVEAL_LEVELS.fullAnswer,
  ];
  return order.indexOf(level);
}

function maxLevel(a, b) {
  return rank(a) >= rank(b) ? a : b;
}

export function isUnaidedAttempt(state) {
  return state.revealLevel === REVEAL_LEVELS.none && !state.revealedHint;
}

export function revealUsage(state) {
  if (state.revealedAll || state.revealLevel === REVEAL_LEVELS.fullAnswer) return REVEAL_LEVELS.fullAnswer;
  if (state.revealedOne || state.revealLevel === REVEAL_LEVELS.oneAnswer) return REVEAL_LEVELS.oneAnswer;
  if (state.revealedSubject || state.revealLevel === REVEAL_LEVELS.subject) return REVEAL_LEVELS.subject;
  if (state.revealedHint || state.revealLevel === REVEAL_LEVELS.hint) return REVEAL_LEVELS.hint;
  return REVEAL_LEVELS.none;
}

export function buildAttemptMeta(state, {
  correct = null,
  automatic = false,
  inputMethod = 'click',
} = {}) {
  const usage = revealUsage(state);
  const unaided = isUnaidedAttempt(state);
  return {
    revealUsage: usage,
    unaided,
    selfGrade: state.selfGrade,
    automatic,
    inputMethod,
    // Revealed attempts are never treated as independent automatic corrects.
    countsAsIndependentCorrect: automatic && correct === true && unaided,
    countsAsIndependentAttempt: automatic && unaided,
    revealedAttempt: !unaided,
  };
}

export function pickHint(question, kind = null) {
  const kinds = ['note', 'semitones', 'string', 'direction', 'boundary', 'vector'];
  const use = kind && kinds.includes(kind) ? kind : kinds[Math.floor(Math.random() * kinds.length)];
  const ic = question.intervalClass;
  const info = question.intervalInfo;
  const nearest = question.nearest || question.answers?.[0];
  switch (use) {
    case 'note':
      return { kind: use, text: `Target note: ${question.targetNote || '?'}` };
    case 'semitones':
      return { kind: use, text: `${info?.semis ?? ic} semitones from the root` };
    case 'string':
      return { kind: use, text: nearest ? `Try string ${nearest.string + 1}` : 'Stay near the root string' };
    case 'direction':
      return {
        kind: use,
        text: nearest
          ? (nearest.deltaFret > 0 ? 'Look ahead of the root (higher frets)' : nearest.deltaFret < 0 ? 'Look behind the root (lower frets)' : 'Same fret area as the root')
          : 'Compare fret direction from the root',
      };
    case 'boundary':
      return {
        kind: use,
        text: nearest?.crossesBoundary
          ? 'This shape crosses a tuning boundary'
          : 'This shape stays within standard adjacent-string geometry',
      };
    case 'vector':
      return {
        kind: use,
        text: nearest
          ? `One shape: ${nearest.deltaString === 0 ? 'same string' : (nearest.deltaString > 0 ? `${nearest.deltaString} string higher` : `${Math.abs(nearest.deltaString)} string lower`)}, ${nearest.deltaFret >= 0 ? '+' : ''}${nearest.deltaFret} frets`
          : 'Think in string/fret offsets from the root',
      };
    default:
      return { kind: 'semitones', text: `${ic} semitones` };
  }
}
