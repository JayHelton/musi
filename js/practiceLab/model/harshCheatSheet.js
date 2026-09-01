// The harsh-vocal cheat sheet.
//
// A singer warming up on Low, Mid, or High false cord — or on true-cord highs
// — wants a placement and activation reminder they can check mid-session
// without losing their spot. This module holds that reminder as data: no
// scoring, no exercise identity, nothing the Practice Library owns. It is a
// technique reference, the same role `js/reference/` plays for music theory.
//
// Every export here is a plain value. No DOM, so a Node test reads it
// directly, and `js/practiceLab/ui/harshCheatSheetView.js` is the only file
// that draws it.
//
// This is a practice reminder, not medical advice. `RED_FLAGS` says when to
// stop, and the sources below back every claim on the sheet.

/** The tabs the cheat sheet drawer offers, in the order the drawer shows them. */
export const HARSH_CHEAT_TABS = [
  { id: 'warmup', label: 'Warm-Up' },
  { id: 'falsecord', label: 'False Cord' },
  { id: 'truecord', label: 'True Cord Highs' },
  { id: 'tongue', label: 'Tongue & Tone' },
  { id: 'redflags', label: 'Red Flags' },
];

/**
 * The order of one warm-up session, before any distortion is asked of the
 * voice. Semi-occluded vocal tract (SOVT) work — lip trills, humming, straw
 * phonation — measurably lowers laryngeal muscle tension before the harder
 * work starts, so it is not optional.
 */
export const WARM_UP_LADDER = [
  {
    step: 'Hydrate',
    detail: 'Room-temp water, not ice-cold. Skip caffeine and dairy right before a session.',
  },
  {
    step: 'Diaphragm activation',
    detail: 'A hissing exhale, 4 counts in and 8 counts out. The hand on your belly should move — not your shoulders.',
  },
  {
    step: 'SOVT — lip trills, hum, or straw',
    detail: '1–2 minutes on a comfortable clean pitch. This is what actually lowers throat tension before distortion.',
  },
  {
    step: 'Gentle sirens',
    detail: 'Clean voice, no distortion yet — glide low to high and back to wake up the range.',
  },
  {
    step: 'Then, and only then: false cord',
    detail: 'Low first, then Mid, then High. Never start a session cold on distortion.',
  },
];

/**
 * False cord activation by register. Every card answers the same four
 * questions: how do you find it, where should it sit, what do the mouth and
 * tongue do, and what should it feel like if you're doing it safely.
 */
export const FALSE_CORD_REGISTERS = {
  low: {
    label: 'Low',
    activation: 'Sigh like you’re annoyed, and let the sigh turn raspy — almost like clearing your throat of mucus. It should not hurt.',
    placement: 'The buzz sits ABOVE the larynx. The larynx stays relaxed and neutral — you are not pressing it down.',
    mouth: 'Yawn-shape: soft palate raised. Tongue low and back. Lean toward an OH or UH vowel.',
    breath: 'A steady diaphragm push, abs flexed — sustained air, not a sudden burst.',
    feelsLike: 'A phone buzzing on vibrate in your throat, not a squeeze.',
  },
  mid: {
    label: 'Mid',
    activation: 'Start with the Low sigh-growl, then let a short bark or shout ride on top of it — an annoyed shout, not a scream.',
    placement: 'The buzz drifts slightly forward and up from Low, but still clearly above the larynx.',
    mouth: 'Jaw a bit more open than Low. Tongue mid-height and slightly forward. Lean toward EH or AH.',
    breath: 'Same diaphragm engagement as Low, with a touch more airflow for the extra edge.',
    feelsLike: 'Low’s buzz with more bite on top. If the larynx starts climbing, back off.',
  },
  high: {
    label: 'High',
    activation: 'Take the Mid bark and aim it up and forward, narrowing the shape as the pitch rises — a snarl, not a squeeze.',
    placement: 'Forward "mask" resonance. This is where people cheat into a throat-squeezed low growl instead — if the sensation drops to or below the larynx, you’ve lost placement.',
    mouth: 'Narrower mouth shape. Tongue arched higher and more forward. Lean toward EE or IH.',
    breath: 'More compressed, focused airflow — still from the diaphragm, never from squeezing the throat.',
    feelsLike: 'A brighter, narrower buzz, forward in the face. If it hurts, drop the pitch — don’t force it higher.',
  },
};

/**
 * True-cord / fry screaming — the mechanism behind the most piercing highs.
 * This is not a high false-cord shriek: it is the true vocal folds
 * vibrating in a chaotic "fry" pattern, and it is the technique most linked
 * to injury when it's forced instead of found.
 */
export const TRUE_CORD_HIGHS = {
  label: 'True Cord Highs (Fry)',
  whatItIs: 'Not a false-cord shriek. The true vocal folds vibrate in a chaotic "fry" pattern — no clear pitch, closer to white noise riding on distortion.',
  warmIntoLast: 'Full SOVT and all three false-cord registers first, every time. This is never the first sound of a session.',
  activation: 'Find a comfortable, low, creaky vocal fry on a relaxed pitch — a lazy "uh-oh" or a creaky door. Do not start from a scream and push down into fry.',
  ridingIt: 'Once the fry is easy and pain-free, add air pressure gradually and let the distortion build on top of it. You are adding air, not throat squeeze.',
  placement: 'Keep a forward "mask" anchor even here. Collapsing back into the throat is the fastest way to hurt yourself.',
  breath: 'Full diaphragm support is non-negotiable — a controlled sustained exhale, never a shove.',
  hardStop: 'Any sharp pain, burning, or a voice that feels "sharp" or off afterward — stop for the day. This register does not get muscled through.',
};

/**
 * Tongue position and vowel choice change tone. This table pairs a tongue
 * shape with the tonal result and the register it suits — separate from
 * tongue ROOT tension, which is a distinct risk factor covered in the last
 * row.
 */
export const TONGUE_TONE_TABLE = [
  {
    position: 'Low & flat, back; soft palate raised (yawn shape)',
    vowel: 'OH / UH',
    effect: 'Darker, heavier, more guttural',
    pairsWith: 'Low false cord',
  },
  {
    position: 'Mid-height, slightly forward',
    vowel: 'EH / AH',
    effect: 'Balanced grit, more bite',
    pairsWith: 'Mid false cord',
  },
  {
    position: 'Arched high & forward',
    vowel: 'EE / IH',
    effect: 'Brighter, narrower, cuts through',
    pairsWith: 'High false cord, shrieks',
  },
  {
    position: 'Tip behind the lower teeth, body raised ("tunnel throat")',
    vowel: '—',
    effect: 'Hollow, cavernous scream texture',
    pairsWith: 'Deathcore-style highs',
  },
  {
    position: 'Tongue ROOT tension (not shape)',
    vowel: '—',
    effect: 'Adds rasp, but pulls the larynx via the hyoid bone if overdone',
    pairsWith: 'Every register — keep the root soft even while the tongue body is shaped',
  },
];

/** The two general rules the table above boils down to. */
export const TONGUE_RULES = [
  'Front vowels (EE, EH) read brighter and project a higher pitch more easily.',
  'Back vowels (OO, OH, UH) read darker and warmer, with a heavier low end.',
  'Shape the front/body of the tongue for the brightness you want. Keep the tongue root and jaw relaxed — that’s the safety valve.',
];

/** Stop-now signs. None of these are things to push through. */
export const RED_FLAGS = [
  'Sharp or burning pain — stop now, don’t finish the set.',
  'Hoarseness that doesn’t clear within 10–15 minutes of rest — stop for the session.',
  'The buzz drifts to or below the larynx during false cord work — you’ve drifted into a throat squeeze. Reset before continuing.',
  'Voice feels tired or breathy afterward — lighter session next time, more rest between reps.',
  'Hoarseness lasting more than 2 weeks — see an ENT or laryngologist. Don’t self-treat.',
];

/** The sources this sheet's copy is drawn from. */
export const CHEAT_SHEET_SOURCES = [
  { label: 'Extreme Vocal Institute — safe screaming, false cord vs. fry', url: 'https://www.extremevocalinstitute.com/post/learn-screaming-safely' },
  { label: 'Isaac Askew — false cord placement, sensation, breath', url: 'https://isaacaskew.com/2025/08/31/false-cord-screaming-technique-placement-sensations-and-breath-tips/' },
  { label: 'deathdoom.com — the false chord growl/scream guide', url: 'https://deathdoom.com/blog/vocals/the-ultimate-guide-to-false-chord-growls-screams/' },
  { label: 'MasterClass — how to scream', url: 'https://www.masterclass.com/articles/how-to-scream' },
  { label: 'PubMed — semi-occluded vocal tract exercises as a warm-up', url: 'https://pubmed.ncbi.nlm.nih.gov/34256979/' },
  { label: 'VoiceExcel — tongue position and singing', url: 'https://voiceexcel.com/tongue-position-singing/' },
  { label: 'MyoAir — the tongue’s role in singing', url: 'https://myoair.com/articles/watch-your-tongue-the-secret-to-better-singing' },
  { label: 'Connected Speech Pathology — vocal cord damage from screaming', url: 'https://connectedspeechpathology.com/blog/recognizing-preventing-damage-to-vocal-cords-from-screaming' },
];
