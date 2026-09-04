// The harsh-vocal cheat sheet.
//
// A singer warming up on Low, Mid, or High false cord — or on true-cord highs
// — wants a placement and activation reminder they can check mid-session
// without losing their spot. This module holds that reminder as data: no
// scoring, no exercise identity, nothing the Practice Library owns. It is a
// technique reference, the same role `js/reference/` plays for music theory.
//
// The sheet covers four vibrating structures, not one. `MECHANISM_MAP` names
// each structure and says which tab drills it. `FALSE_CORD_REGISTERS` and
// `SUPRAGLOTTIC_SOURCES` hold the sounds above the true vocal folds.
// `TRUE_CORD_HIGHS` and `HYBRID_SCREAM` hold the sounds that use the true
// folds. `GUTTURAL_LOWS` holds the low end.
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
  { id: 'falsecord', label: 'Above the Cords' },
  { id: 'truecord', label: 'True Cord Highs' },
  { id: 'tongue', label: 'Tongue & Lows' },
  { id: 'fixit', label: 'Fix It' },
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
 * The map of harsh sounds to the structure that makes each one. A singer who
 * cannot name what vibrates cannot tell two sounds apart by feel, and that
 * confusion is the main reason a scream drifts into a throat squeeze. Each row
 * names the tab that holds the full drill.
 */
export const MECHANISM_MAP = [
  {
    sound: 'False cord distortion',
    vibrates: 'The false cords (the ventricular folds), above the true vocal folds',
    sits: 'This tab — Low, Mid, and High',
  },
  {
    sound: 'Fry scream',
    vibrates: 'The true vocal folds, in a chaotic pattern with no clear pitch',
    sits: 'The True Cord Highs tab',
  },
  {
    sound: 'Rattle',
    vibrates: 'The two arytenoid cartilages, against each other',
    sits: 'This tab, below',
  },
  {
    sound: 'Growl (aryepiglottic)',
    vibrates: 'The tops of the arytenoids, against the epiglottis',
    sits: 'This tab, below',
  },
  {
    sound: 'Hybrid',
    vibrates: 'The false cords and the true folds together',
    sits: 'The True Cord Highs tab',
  },
  {
    sound: 'Subharmonic',
    vibrates: 'The false cords close on every second cycle of the true folds',
    sits: 'The Tongue & Lows tab',
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
    cues: [
      'Sigh like you are annoyed and let it turn raspy. Aim for a "haaoooww" or an "urrrghhhhh". It must not hurt.',
      'Cough as if you are bringing up mucus, then stretch the middle of that cough into a held tone. This is the most reliable route in.',
      'Sigh with a wide grin and push the sound upward. Use this when a flat sigh goes nowhere.',
      'Bark short bursts and small pitch slides instead of long holds. You are waking the folds up, not training stamina.',
      'Use the least volume you can. Build the mechanism quiet, and let the volume arrive later.',
    ],
    placement: 'The buzz sits ABOVE the larynx. The larynx stays relaxed and neutral — you are not pressing it down.',
    mouth: 'Yawn-shape: soft palate raised. Tongue low and back. Lean toward an OH or UH vowel.',
    breath: 'A steady diaphragm push, abs flexed — sustained air, not a sudden burst.',
    feelsLike: 'A phone buzzing on vibrate in your throat, not a squeeze.',
  },
  mid: {
    label: 'Mid',
    activation: 'Start with the Low sigh-growl, then let a short bark or shout ride on top of it — an annoyed shout, not a scream.',
    cues: [
      'Start on the Low sigh-growl, then let a short annoyed shout ride on top of it.',
      'Talk on the growl instead of performing it. Hold a conversation in it at low volume. This is the best drill for endurance and for clear words.',
      'Purse the lips as if you blow a kiss, then open to a rounded square. Use this when the growl only works on an open AH.',
      'Siren a clean NG through your range first, then repeat the same glide with the growl on top. The pitch path is already learned.',
    ],
    placement: 'The buzz drifts slightly forward and up from Low, but still clearly above the larynx.',
    mouth: 'Jaw a bit more open than Low. Tongue mid-height and slightly forward. Lean toward EH or AH.',
    breath: 'Same diaphragm engagement as Low, with a touch more airflow for the extra edge.',
    feelsLike: 'Low’s buzz with more bite on top. If the larynx starts climbing, back off.',
  },
  high: {
    label: 'High',
    activation: 'Take the Mid bark and aim it up and forward, narrowing the shape as the pitch rises — a snarl, not a squeeze.',
    cues: [
      'Take the Mid bark up and forward, and narrow the shape as the pitch rises.',
      'To go higher, open the mouth more. To go lower, make it smaller and let the sound sit lower in the throat.',
      'Very little air is needed up here. If you get it right, the note lasts as long as your breath does.',
      'Drive the pitch from the belly, not the neck. Big heavy sighs, then add pitch to them.',
    ],
    placement: 'Forward "mask" resonance. This is where people cheat into a throat-squeezed low growl instead — if the sensation drops to or below the larynx, you’ve lost placement.',
    mouth: 'Narrower mouth shape. Tongue arched higher and more forward. Lean toward EE or IH.',
    breath: 'More compressed, focused airflow — still from the diaphragm, never from squeezing the throat.',
    feelsLike: 'A brighter, narrower buzz, forward in the face. If it hurts, drop the pitch — don’t force it higher.',
  },
};

/**
 * The other two distortion sources that sit above the true vocal folds. The
 * arytenoids make Rattle when they vibrate against each other. They make
 * Growl when they vibrate against the epiglottis, and the aryepiglottic folds
 * flap with them. Both sounds are quieter than false cord, and Growl is the
 * one technique on this sheet that volume makes unsafe.
 */
export const SUPRAGLOTTIC_SOURCES = [
  {
    id: 'rattle',
    label: 'Rattle — Arytenoid',
    tone: 'bright',
    whatVibrates: 'The two arytenoid cartilages vibrate against each other. The true folds keep the pitch underneath.',
    soundsLike: 'Brighter and higher than Growl. A hard, dry edge on top of a clear note.',
    findIt: 'Hold a clean supported tone. Add air pressure in small steps. Stop as soon as a dry edge appears on the note.',
    cues: [
      'Sing "yay" on a clean note, then turn the same note raspy without changing the pitch. Clean to raspy, back to clean.',
      'Swell the volume slowly on a held note and catch the moment a fuzz appears on top. That moment is the rattle starting.',
      'Test it: add the effect, then take it away. If the sung note survives underneath, it is rattle. If the note is swallowed, you moved to the false cords.',
      'Do not dry your throat out. This effect partly uses the saliva over the cartilages, so a dry throat removes what rattles.',
    ],
    feelsLike: 'A tight, dry crackle high in the larynx, narrower than the false-cord buzz.',
    watchFor: 'Rattle and false cord feel alike at first. Learn one at a time, and name what you feel before you add volume.',
  },
  {
    id: 'growl',
    label: 'Growl — Aryepiglottic',
    tone: 'risk',
    whatVibrates: 'The tops of the arytenoids vibrate against the epiglottis. The aryepiglottic folds go slack and flap in the airstream.',
    soundsLike: 'Darker and lower than Rattle. It carries no pitch of its own, so singers layer it over a clean pitched note.',
    findIt: 'Use the "knödel" cue — phonate as if you hold a dumpling in your mouth. The back of the tongue pushes the epiglottis back over the larynx.',
    cues: [
      'Phonate as if you hold a dumpling in your mouth — the "knödel" sound. The back of the tongue pushes the epiglottis back.',
      'Cackle like a witch, then sustain the end of the cackle and walk down a five-note scale keeping the same narrow quality.',
      'Quack like a duck, meow like a cat, or cry like a baby. All three narrow the same ring of tissue.',
      'To layer it on a pitch: hold a clean note, let the larynx rise a little, then add the cackle narrowing. Keep the clean note audible the whole time.',
      'If it makes you gag, you pulled the tongue root too far back. Use the least retraction that still buzzes.',
    ],
    feelsLike: 'A loose flutter high in the throat, above the false-cord buzz. You cannot tilt the epiglottis on purpose. The tongue and the air move it for you.',
    watchFor: 'Keep this one gentle and quiet. Do not go for volume. This is the riskiest sound on the sheet.',
  },
];

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
  cues: [
    'Breathe out a slow, gentle "uhhhh". If it bubbles, cracks, or rattles, that is your base fry. It must feel effortless.',
    'Whisper first and notice where the throat compresses. Tighten that spot a little, then raise the volume until a distortion appears.',
    'Alternate fry on the way out and fry on the way in, both quiet. This finds the placement without any volume.',
    'Once the fry is steady, open the mouth and throat toward a yawn and let the air through. Cycle AH, EH, and OH.',
    'For high fry, hold a soft falsetto "eeee" on a high pitch, then swell the volume into it. Work the pitch up over weeks, not in one session.',
  ],
  ridingIt: 'Once the fry is easy and pain-free, add air pressure gradually and let the distortion build on top of it. You are adding air, not throat squeeze.',
  placement: 'Keep a forward "mask" anchor even here. Collapsing back into the throat is the fastest way to hurt yourself.',
  breath: 'Full diaphragm support is non-negotiable — a controlled sustained exhale, never a shove.',
  hardStop: 'Any sharp pain, burning, or a voice that feels "sharp" or off afterward — stop for the day. This register does not get muscled through.',
};

/**
 * The hybrid scream stacks the two main mechanisms. The false cords and the
 * true folds distort at the same time, so the sound keeps the body of a
 * false-cord scream and gains the edge of a fry. It is a gate, not a danger:
 * the risk comes from reaching for it before either layer is easy on its own.
 */
export const HYBRID_SCREAM = {
  label: 'Hybrid — False Cord plus Fry',
  tone: 'warm',
  whatItIs: 'Both mechanisms run together. The false cords and the true folds distort at the same time, and the two layers stack.',
  prerequisite: 'Learn false cord and fry separately first. Do not try the hybrid until each one is easy and pain-free on its own.',
  soundsLike: 'Fuller and louder than fry alone. It keeps the body of a false-cord scream and adds the sharp edge of a fry.',
  activation: 'Start on an easy false-cord scream. Hold the buzz steady. Then add the fry on top in small steps, and keep the air the same.',
  cues: [
    'Build it in this order: get the false-cord buzz, then compress the larynx, then add the creak last.',
    'Toggle drill: hold the growl, add the creak on top without taking a new breath, take the creak away, then add it back. Holding one layer while the other moves is the skill.',
    'Thin, sharp, and shrieky means you lost the false cord. Musical and pitched means you lost the fry.',
    'Wheezing or whistling means you pressed. Stop and rebuild from the quiet sigh.',
  ],
  feelsLike: 'Two buzzes in two places at once — the false-cord buzz above the larynx, and the finer fry inside it.',
  watchFor: 'If one layer drops out, stop and rebuild it alone. Do not push more air to hold both layers together.',
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
    position: 'Curled up and back against the palate, tip down behind the bottom teeth ("tunnel throat")',
    vowel: '—',
    effect: 'Hollow and cavernous. The mouth closes to an O and removes the high frequencies',
    pairsWith: 'Gutturals — see the Lows cards below',
  },
  {
    position: 'Tip behind the bottom teeth, back of the tongue raised to the roof of the mouth ("knödel")',
    vowel: '—',
    effect: 'Pushes the epiglottis back over the larynx, so the aryepiglottic folds can flutter',
    pairsWith: 'Growl — see the Above the Cords tab. Keep it gentle and quiet',
  },
  {
    position: 'Body pressed flat against the roof of the mouth, narrow air channel',
    vowel: 'EE',
    effect: 'A thin, whistling squeal above the low tone',
    pairsWith: 'Pig squeals',
  },
  {
    position: 'Tongue ROOT tension (not shape)',
    vowel: '—',
    effect: 'Adds rasp, but pulls the larynx via the hyoid bone if overdone',
    pairsWith: 'Every register — keep the root soft even while the tongue body is shaped',
  },
];

/** The general rules the table above boils down to. */
export const TONGUE_RULES = [
  'Front vowels (EE, EH) read brighter and project a higher pitch more easily.',
  'Back vowels (OO, OH, UH) read darker and warmer, with a heavier low end.',
  'The jaw sets the first formant and the tongue sets the second. A wider mouth raises the first. A forward tongue raises the second.',
  'Shape the front/body of the tongue for the brightness you want. Keep the tongue root and jaw relaxed — that’s the safety valve.',
];

/**
 * Low screams and gutturals. The mechanism is the same false-cord vibration
 * the registers above use, so these cards answer a different question: what
 * shape gets the tone that low. High-speed imaging shows the true folds open
 * and vibrate during a guttural, but they do not collide.
 */
export const GUTTURAL_LOWS = [
  {
    id: 'guttural',
    label: 'The Guttural Baseline',
    tone: 'deep',
    whatItIs: 'A wet, hollow, very low tone. The false cords make the distortion. High-speed imaging shows that the true folds do not collide.',
    shape: 'Let the larynx sit low and relaxed. Close the mouth toward a small O. Keep the soft palate up.',
    activation: 'Start from a quiet low false-cord growl. Then close the mouth shape until the tone goes hollow.',
    cues: [
      'Hold the air back. You are not projecting. Let the air out more slowly than feels natural.',
      'Take a low, quiet breath and let the belly manage the release. The neck does nothing.',
      'Move between low, mid, and high on four dials: the vowel, the mouth shape, the resonance, and the airflow. Slide one growl across all four.',
      'Open the throat and close the mouth. They are two separate dials. Close both and you strangle it. Open both and you lose the low end.',
    ],
    feelsLike: 'A slow, wet buzz low in the throat. The throat feels open, not pressed.',
    watchFor: 'Use control, not volume. A tight throat is the most common beginner error.',
  },
  {
    id: 'tunnelthroat',
    label: 'Tunnel Throat',
    tone: 'deep',
    whatItIs: 'The hollow, cavernous low growl of slam and brutal death metal. The mouth shape removes the high frequencies from the tone.',
    shape: 'Curl the tongue up and back against the palate. Press the tongue tip down behind the bottom teeth. Hold the mouth almost closed in an O.',
    activation: 'Start from the guttural baseline. Then close the mouth into the O shape and let the tone go hollow.',
    cues: [
      'Aim for the sound of a drain unblocking, or an animal in a cave.',
      'Curl the tongue up against the palate first, then drop the larynx, then close the mouth. In that order.',
      'A low guttural is quiet at the source. Volume comes from the microphone and the room, not from your throat.',
    ],
    feelsLike: 'A wet, muted buzz with no edge. The shape does the work, not the effort.',
    watchFor: 'Use control, not volume. Give a safe, consistent guttural 6–12 months of steady practice.',
  },
  {
    id: 'subharmonic',
    label: 'Subharmonic — Kargyraa',
    tone: 'warm',
    whatItIs: 'The false cords close on every second cycle of the true folds. They vibrate at half the speed, so the pitch reads one octave lower.',
    shape: 'Open the throat wide and keep the larynx low. Hold a comfortable clean pitch underneath. Lean toward an OH or OR vowel.',
    activation: 'Sing an easy low clean note. Add a small amount of false-cord weight until a second tone drops in an octave below.',
    feelsLike: 'Two pitches at once, with a slow flutter under the clean note. It is loose, not forced.',
    watchFor: 'Tuvan kargyraa, Tibetan chant, and Xhosa singing all train this sound for years. Treat it as a technique, not a trick.',
  },
  {
    id: 'wet',
    label: 'Wet Lows and Gurgles',
    tone: 'warm',
    whatItIs: 'A gurgling low tone. Mucus and saliva in the throat act as one more vibrating layer on top of the false cords.',
    shape: 'Use the guttural baseline shape. Let saliva collect at the back of the tongue. Do not swallow it away before the phrase.',
    activation: 'Start from the guttural baseline. Add a small amount of air until the wet layer starts to gurgle.',
    cues: [
      'Keep the mouth more closed rather than more open. The wet quality is a shape result, not an effort result.',
      'Hydrate through the day and do not clear your throat before a take. You need the saliva that makes the gurgle.',
    ],
    feelsLike: 'A loose, bubbling rattle on top of the low buzz.',
    watchFor: 'Never clear your throat hard to reset this. A hard throat clear slams the vocal folds together.',
  },
  {
    id: 'pigsqueal',
    label: 'Pig Squeals',
    tone: 'bright',
    whatItIs: 'A thin, wet squeal above the low tone. Slam and brutal death metal use it as an accent, not as a main voice.',
    shape: 'Press the body of the tongue flat against the roof of the mouth. Leave a narrow air channel. Shape the sound toward "bree".',
    activation: 'Start from a quiet false-cord low. Raise the tongue until the air channel narrows and the tone whistles.',
    feelsLike: 'A thin, wet whistle high in the mouth, above the buzz in the throat.',
    watchFor: 'Keep it short. A squeal is an accent. Do not hold it, and do not push more air to make it louder.',
  },
];

/** The rules every low card above points back to. */
export const GUTTURAL_RULES = [
  'Lows need control, not volume. A push for loudness is the most common beginner error.',
  'Keep the throat relaxed and the larynx low. Do not press the larynx down with force.',
  'A guttural is a supraglottic sound. The false cords make the distortion, so the shape matters more than the effort.',
  'Give a safe, consistent guttural 6–12 months of steady practice. It does not arrive in a week.',
];

/**
 * What to do when a session goes wrong, and how to build without injury. Every
 * card above teaches one sound. This section covers the things that apply to
 * all of them, and it is the part most singers skip.
 */
export const TROUBLESHOOTING = [
  {
    id: 'dose',
    label: 'How Long, How Often',
    tone: 'chest',
    problem: 'You practise in long sessions and your voice is tired for days.',
    fix: [
      'Practise 10–15 minutes at a time, two or three times a day. Never go past 20 minutes in one block.',
      'Frequency beats length. You are not building muscle. You are teaching your brain a movement pattern, and that needs repetition, not endurance.',
      'Start at 5–15 minutes a day if you are new to this.',
      'Take rest days, and sleep. The folds recover overnight.',
    ],
  },
  {
    id: 'stopnow',
    label: 'Stop Signals Mid-Session',
    tone: 'risk',
    problem: 'You are part way through a session and something changes.',
    fix: [
      'Stop on any of these: the voice suddenly goes hoarse, thin, or dull; you feel tired after only a few takes; your throat feels very dry; it feels hot and you want water; you sense you will go hoarse if you carry on.',
      'Stop if it hurts. Stop if you lose the flutter you can feel in the roof of your mouth.',
      'Never push through a strong signal. Recovery may take a day or more.',
    ],
  },
  {
    id: 'reset',
    label: 'Resetting a Squeezed Throat',
    tone: 'warm',
    problem: 'You drifted into a throat squeeze and cannot get back out.',
    fix: [
      'Yawn-sigh: start a quiet yawn, then let the breath out on a falling "ahh" of relief. This lowers the larynx and widens the throat.',
      'Silent laugh: laugh as hard as you can with no sound. Remember that posture.',
      'Silent sigh: breathe in, open the mouth wide, and let the air out with no sound at all.',
      'Inside yawn: keep the lips lightly together and yawn behind them. Feel the back of the tongue drop.',
      'Then straw or lip trill for a minute, and only then go back to distortion.',
    ],
  },
  {
    id: 'breath',
    label: 'Breath Drills for Distortion',
    tone: 'chest',
    problem: 'You run out of air, or the growl is breathy and weak.',
    fix: [
      'Hiss on a loud, steady SH for 4 counts and keep the volume dead even. Then 6, then 8, then 10, then 12.',
      'Now run the same count ladder on your growl. The volume must stay as even as the hiss was.',
      'Keep the ribs wide through the whole phrase, as if you still breathe in while you breathe out.',
      'Work the breathy vowels longest, until the airflow is the same on every vowel.',
      'Do not train breath control and a new technique in the same drill. Find the sound first.',
    ],
  },
  {
    id: 'dizzy',
    label: 'Headaches and Dizziness',
    tone: 'risk',
    problem: 'You get lightheaded or a headache when you scream.',
    fix: [
      'This is air management, not stamina. You either push too much air too fast with tension behind it, or you squeeze the sound out with too little.',
      'No scream needs explosive airflow. The most controlled and powerful sounds use less air than you expect.',
      'Go back to the quietest version of the sound and rebuild the airflow from there.',
    ],
  },
  {
    id: 'recovery',
    label: 'Recovery',
    tone: 'warm',
    problem: 'The session is over and you are hoarse.',
    fix: [
      'Rest the voice. Do not whisper — whispering strains the folds more than quiet speech.',
      'Steam, or a warm shower. Room-temperature water through the day.',
      'Most hoarseness after screaming clears in a few days to a week.',
      'Hoarseness past 2 weeks, or hoarseness that gets worse, needs an ENT or laryngologist.',
    ],
  },
];

/** Stop-now signs. None of these are things to push through. */
export const RED_FLAGS = [
  'Sharp or burning pain — stop now, don’t finish the set.',
  'Hoarseness that doesn’t clear within 10–15 minutes of rest — stop for the session.',
  'The buzz drifts to or below the larynx during false cord work — you’ve drifted into a throat squeeze. Reset before continuing.',
  'Voice feels tired or breathy afterward — lighter session next time, more rest between reps.',
  'Aryepiglottic work that needs volume or force — stop. This sound stays safe only when it is quiet and easy.',
  'A repeated need to cough or clear your throat during a session — stop. The larynx works too hard.',
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
  { label: 'Journal of Voice — EGG and acoustics of Distortion, Growl, Grunt, Rattle', url: 'https://www.jvoice.org/article/S0892-1997(21)00391-X/abstract' },
  { label: 'Journal of Voice — 14-year vocal health of rough-effect singers', url: 'https://www.jvoice.org/article/S0892-1997(22)00134-5/abstract' },
  { label: 'ASHA — a taxonomy for supraglottic structure vibrations', url: 'https://pubs.asha.org/doi/10.1044/2024_PERSP-24-00140' },
  { label: 'VoiceScience — the aryepiglottic fold', url: 'https://www.voicescience.org/lexicon/aryepiglottic-fold/' },
  { label: 'Laryngopedia — supraglottic phonation', url: 'https://laryngopedia.com/supraglottic-phonation/' },
  { label: 'Oberton — kargyraa and the subharmonic mechanism', url: 'https://www.oberton.org/en/overtone-singing/undertone-singing/kargyraa-throat-singing-undertones/' },
  { label: 'Extreme Vocal Institute — headaches while screaming are an air problem', url: 'https://www.extremevocalinstitute.com/post/headaches-while-screaming-it-s-an-air-management-issue' },
  { label: 'Sing and Scream — how to know if you are hurting your voice', url: 'https://singandscream.com/news/how-to-know-if-you-are-hurting-your-voice/' },
  { label: 'Sing and Scream — how to fry scream', url: 'https://singandscream.com/how-to-fry-scream/' },
  { label: 'Jacob Burton Studios — screaming anatomy 101', url: 'https://jacobburtonstudios.com/singing-technique/screaming-anatomy-101/' },
  { label: 'CVT Research — the description and sound of rattle', url: 'https://cvtresearch.com/description-and-sound-of-rattle/' },
  { label: 'CVT Research — the description and sound of growl', url: 'https://cvtresearch.com/description-and-sound-of-growl/' },
  { label: 'Sweetwater and Jaime Vendera — how to metal scream without hurting your voice', url: 'https://www.sweetwater.com/insync/how-to-metal-scream-without-hurting-your-voice/' },
  { label: 'Chris Liepe — release into distortion, do not push into it', url: 'https://chrisliepe.com/easy-daily-warmup-for-distortion-screaming-aggressive-vocals/' },
  { label: 'NHS Fife — deconstriction exercises', url: 'https://www.nhsfife.org/services/all-services/patient-advice/deconstriction-exercises/' },
];
