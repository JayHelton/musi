// The clean-vocal cheat sheet.
//
// The harsh sheet answers "what vibrates, and how do I not hurt myself".
// This sheet answers a different question: "which muscle balance am I in, and
// how do I get into the next one". Clean singing is one continuum, from the
// thyroarytenoid muscle at the bottom to the cricothyroid muscle at the top,
// with resonance shaping every point of it.
//
// Two rules decide the copy here:
//
// 1. Every card carries a `cues` list, not one instruction. A singer finds a
//    coordination through whichever image lands, so the sheet offers several.
// 2. Sensation is feedback, not mechanism. `VOICE_MYTHS` holds the popular
//    claims that voice science does not support, because a singer who chases
//    a sensation instead of a muscle balance stays stuck.
//
// Every export is a plain value. No DOM, so a Node test reads it directly.
// `js/practiceLab/ui/cleanCheatSheetView.js` is the only file that draws it.
//
// This is a practice reminder, not medical advice.

/** The tabs the clean cheat sheet drawer offers, in the order it shows them. */
export const CLEAN_CHEAT_TABS = [
  { id: 'warmup', label: 'Warm-Up' },
  { id: 'registers', label: 'Registers' },
  { id: 'power', label: 'Twang & Belt' },
  { id: 'resonance', label: 'Resonance' },
  { id: 'edges', label: 'Fry & Lows' },
  { id: 'myths', label: 'Myth Check' },
  { id: 'redflags', label: 'Red Flags' },
];

/**
 * The order of one clean session. Semi-occluded vocal tract (SOVT) work comes
 * first because it lowers the pressure the folds need to start, and it lowers
 * the force with which they collide. It is the best-supported exercise on this
 * sheet.
 */
export const CLEAN_WARM_UP = [
  {
    step: 'Hydrate',
    detail: 'Room-temperature water. Give it 20 minutes to reach the tissue, so drink before you start.',
  },
  {
    step: 'Body and breath',
    detail: 'Roll the shoulders and release the jaw. Then hiss on an S for 20 counts and keep the volume even.',
  },
  {
    step: 'SOVT — straw, lip trill, or NG',
    detail: '2–3 minutes. A narrow straw gives the most back-pressure. This is the one exercise every topic on this sheet reuses.',
  },
  {
    step: 'Sirens through the break',
    detail: 'Glide low to high and back on the trill or NG. Do not change gear at the bridge. Let the pitch pass through it.',
  },
  {
    step: 'Open to a vowel',
    detail: 'Repeat the same siren on an OO or an EE. Keep the easy feeling the trill gave you.',
  },
  {
    step: 'Then register work, then belt',
    detail: 'Chest, mix, and head first. Belt last, and never cold. Belt is the shortest part of the session.',
  },
];

/**
 * The three clean registers, keyed to `CLEAN_REGISTERS` of
 * `js/vocalExerciseModel.js` so the sheet and the register picker cannot drift
 * apart. Mix is not a register of its own. It is the balance between the two
 * muscles, and the card says so.
 */
export const CLEAN_REGISTER_CARDS = {
  chest: {
    label: 'Chest',
    tone: 'chest',
    whatItIs: 'The thyroarytenoid muscle shortens and thickens the folds. The whole fold vibrates and closes fully each cycle. Voice science calls this M1, or thick folds.',
    cues: [
      'Put a hand on your sternum and call "Hello!" across a room. You should feel the buzz under your palm.',
      'Say a line of the lyric out loud at your speaking pitch. Then sing the same line and do not change gear.',
      'Start on a low creaky fry, then slide up into a clear note. The fry loads the full fold mass for you.',
      'Sing "gug-gug-gug" up a five-note scale. The hard G raises the pressure behind the folds and firms the closure.',
      'Sing "ma-ma-ma" big and bold. Keep the vowel of "cat" or "feet" — bright vowels hold this balance without extra push.',
    ],
    feelsLike: 'Buzz in the sternum and the front of the neck. The tone feels thick and speech-like. The throat feels free.',
    watchFor: 'Pulled chest. If the larynx climbs, the volume rises, and the tone goes shouty, you carried chest too high. Drop the pitch and start again.',
  },
  mix: {
    label: 'Mix',
    tone: 'mix',
    whatItIs: 'Not a third register. Both muscles work at once, and the ratio between them sets the colour. You can sing the same pitch heavier or lighter by changing that ratio.',
    cues: [
      'Say "nay" like a bratty child, or like a cackling witch. Run it up a five-note scale. It adds closure and brightness without more muscle.',
      'Sing "gee" in a dopey cartoon voice over the break. The G adds closure and the cartoon tone keeps the larynx down.',
      'Sing "mum-mum-mum" over a wide interval. Feel the buzz in the lips and nose.',
      'Start in head voice, then walk down by step. Find the lowest note that keeps the light quality. That edge is your mix today.',
      'Now the other way. Speak at your natural pitch, then take the same weight up one note at a time.',
      'Sing the phrase that breaks on a straw or a lip trill first. Then sing it on the vowel and keep the same feeling.',
    ],
    feelsLike: 'Easier than you expect. The buzz moves back behind the soft palate and up behind the eyes. If it feels like an achievement of strength, it is pulled chest.',
    watchFor: 'The two failures are opposite. Too heavy and the larynx rises. Too light and the tone is ten parts air. Never add air pressure to get more mix.',
  },
  head: {
    label: 'Head',
    tone: 'head',
    whatItIs: 'The cricothyroid muscle tilts the thyroid cartilage and stretches the folds thin. Only the cover vibrates. This is M2, or thin folds.',
    cues: [
      'Siren on a lip trill or on NG from low to high and back. The small airflow lets the voice slide across the bridge without slamming a door.',
      'Hoot like an owl on a "hoo", with the jaw already open.',
      'Say "gee" in a dopey cartoon voice. This is the best fix for a breathy head voice, because it adds closure and steadies the larynx together.',
      'Whimper like a puppy, or shout "woo-hoo!" in delight. Both land on this balance with no effort.',
      'Hum a steady pitch through a narrow straw. Then take the straw away and keep the feeling.',
    ],
    feelsLike: 'Light and floaty. Less weight behind the note. The buzz moves into the cheekbones and the bridge of the nose. Some singers feel nothing, and that is normal.',
    watchFor: 'Breathiness means a gap in the closure, not weak muscles. Lower the air pressure first, then add closure with "gee" or a straw. Never squeeze to fix it.',
  },
};

/**
 * Head voice and falsetto use the same mechanism. The difference is how
 * completely the folds close, and a singer can control that separately from
 * the mechanism. This is why a weak falsetto trains into a strong head voice.
 */
export const HEAD_VS_FALSETTO = {
  label: 'Head Voice or Falsetto?',
  tone: 'bright',
  whatItIs: 'Both are the same thin-fold mechanism. Head voice closes the folds completely. Falsetto leaves a gap, so air escapes all through the cycle.',
  soundsLike: 'Falsetto is breathy, flutey, and thin, with weak upper harmonics. Head voice is fuller and carries more of the harmonic series.',
  cues: [
    'Sing a falsetto note, then add the "gee" cartoon sound on the same pitch. The tone that firms up is head voice.',
    'Check the breath. If you run out of air fast, the folds leave a gap.',
    'Try to crescendo. Falsetto breaks or stays quiet. Head voice grows.',
  ],
  feelsLike: 'The same lightness. Head voice adds a sense of the folds meeting, without any squeeze.',
  watchFor: 'Do not treat falsetto as a dead end. The mechanism is already right. Only the closure is missing.',
};

/**
 * Belting. The source is a chest-like fold set-up carried above the first
 * bridge. The filter does the rest: the mouth opens so the first resonance
 * tracks the second harmonic, and twang adds the ring. Belting is an acoustic
 * result, not a loud shout.
 */
export const BELTING = {
  label: 'Belting',
  tone: 'risk',
  whatItIs: 'A chest-dominant fold set-up above the first bridge, with a long closed phase. The mouth opens wide so the first resonance rises with the pitch, and twang adds the ring.',
  soundsLike: 'Bright, speech-like, and high-intensity, with a clear ring. It is loud to the audience because of resonance, not because of force.',
  cues: [
    'Call it, do not sing it. Shout "Hey, you over there!" across a street, then put that exact sound on the pitch.',
    'Cackle like a witch, quack like a duck, or say "nya nya nya" like a bratty child. This installs the twang that does the work.',
    'Open the jaw wide and spread the lips. Think of a megaphone shape, wide at the mouth.',
    'Modify the vowel open, not closed. Move toward the vowel of "cat" or "day". This is the opposite of classical practice.',
    'Practise on the phrase "hey man". It holds both of the vowels that belt well.',
    'Hold the inhale posture. Keep the ribs wide and the sternum up, and resist the collapse. Do not blow.',
  ],
  feelsLike: 'Bright and forward, buzzing behind the nose and cheeks. Big effort in the body, small effort at the folds. If the buzz drops back into the throat, you left a safe belt.',
  watchFor: 'Belting is not shouting, and it is not chest voice dragged upward. Warm up first, and keep it short. Ten to twenty minutes of belt in a session is plenty.',
};

/**
 * Vocal fry as a clean tool, not a scream. It is the one place where the folds
 * close firmly with almost no air, so it is the fastest cure for a breathy
 * onset. Research over sixty years has found no evidence that it harms the
 * voice.
 */
export const CLEAN_FRY = {
  label: 'Vocal Fry (Clean)',
  tone: 'deep',
  whatItIs: 'The lowest register, below chest. The arytenoids hold the folds together while they stay slack, and air escapes in slow bursts. The cycles are irregular and come in unequal pairs.',
  soundsLike: 'A low, loose rattle or pop. It can drop below 50 Hz, well under your sung range.',
  cues: [
    'Make the sound of a door creaking slowly open.',
    'Say "umm" at the lowest pitch you can, until it turns gravelly.',
    'Hold an "uh" and stop sustaining the pitch. Let the air trickle out while the folds still rattle.',
    'Put an H in front of it. That keeps the fry loose instead of pressed.',
    'Slide from fry up into a clear note, then back down into fry. This carries the firm closure up into chest.',
    'Start a word in fry and let it bloom into tone. This is the fastest fix for a breathy onset.',
  ],
  feelsLike: 'A loose rattle low in the throat, with almost no breath moving. No effort at all. If it feels tight, you are pressing it.',
  watchFor: 'Fry needs less air than any other register. Blowing through it kills it. Keep fry drills to about two minutes, then balance them with light high glides.',
};

/**
 * Twang. The aryepiglottic sphincter narrows the short tube just above the
 * folds, the way a brass mouthpiece narrows before the bell. That match moves
 * more sound out for the same work, and it lowers the pressure the folds need
 * to start. Twang is not nasality. The soft palate stays shut for it.
 */
export const TWANG = {
  label: 'Twang',
  tone: 'bright',
  whatItIs: 'The tube just above the folds narrows front to back. This moves more of the sound out and boosts the 2–4 kHz band, where a band leaves a gap and where hearing is sharpest.',
  soundsLike: 'Bright, small, and piercing on its own. In a mix it reads as ring and clarity, and it cuts through without extra volume.',
  cues: [
    'Cackle like the Wicked Witch. Then freeze the sound at its brightest and hold it. Freezing it is the actual exercise.',
    'Sing "nay" or "nyah nyah" up a scale like a child teasing someone. Make it annoying.',
    'Quack like a duck three times, then quack into a pitch and hold it.',
    'Cry like a hungry baby, or whine "I do not wanna". Use this one if the witch cue makes you tense.',
    'Meow like a demanding cat, or call like a seagull.',
    'Go to 100 percent twang on purpose, then dial it back to about half while you keep the ping. Retreating from too much beats sneaking up on it.',
  ],
  feelsLike: 'A small, pin-point sound, with a buzz behind the upper teeth. It gets louder while it gets easier. You use less air. It must not feel like a squeeze.',
  watchFor: 'Twang narrows front to back, not side to side. If it feels like the side walls press in, or the sound gets quieter as you try harder, stop. That is the throat gripping, not twang.',
};

/**
 * The test that separates twang from nasality. Both are called "nasal" in
 * everyday teaching, and they are different controls.
 */
export const NOSE_PINCH_TEST = {
  label: 'Twang or Nasal? The Nose-Pinch Test',
  tone: 'warm',
  whatItIs: 'Twang happens below the soft palate, at the larynx. Nasality happens above it, through an open nasal port. In real twang the soft palate is shut and nothing goes through the nose.',
  cues: [
    'Sustain a bright vowel. Do not use a word with M, N, or NG in it.',
    'Pinch your nose shut, then let go, while you hold the sound.',
    'No change in the sound means you are twanging. The nasal port is already closed.',
    'A change, or the sound cutting off, means you are nasalising instead.',
  ],
  feelsLike: 'The twang buzz sits low, just above the voice box. Nasality buzzes higher, in the nose itself.',
  watchFor: 'On M, N, and NG the sound should change when you pinch. Only use this test on a plain sustained vowel.',
};

/**
 * What each articulator actually controls. This is the table that replaces
 * "place the sound forward" with something a singer can act on.
 */
export const RESONANCE_CONTROLS = [
  {
    control: 'Jaw opening',
    changes: 'The first formant',
    result: 'A wider mouth raises it. This is the main control for opening a pinched high note',
  },
  {
    control: 'Tongue, front or back',
    changes: 'The second formant',
    result: 'A forward tongue raises it and brightens the tone. A retracted tongue muddies it',
  },
  {
    control: 'Aryepiglottic narrowing (twang)',
    changes: 'The third, fourth, and fifth formants',
    result: 'They cluster into one bright peak. This is ring, and it is what carries',
  },
  {
    control: 'Larynx height',
    changes: 'The length of the whole tube',
    result: 'A lower larynx moves every formant down and darkens the tone. A higher one brightens it',
  },
  {
    control: 'Lip rounding',
    changes: 'The first and second formants together',
    result: 'Rounded lips lower both and darken the tone. Spread lips raise both',
  },
  {
    control: 'Soft palate',
    changes: 'Whether the nose is coupled',
    result: 'Raised seals the nose. Lowered adds nasality, which damps the sound rather than adding to it',
  },
];

/**
 * Resonance work. The vocal folds make the sound and the tract filters it. The
 * tract adds no new frequency. It only lifts the harmonics that sit near one
 * of its resonances.
 */
export const RESONANCE_WORK = {
  label: 'Finding Resonance',
  tone: 'warm',
  whatItIs: 'The folds make a buzz full of harmonics. The tract above them lifts the harmonics that land near a resonance and damps the rest. Shape the tube and you change the tone.',
  cues: [
    'Sustain NG as in "sing", feel the buzz, then open straight into an AH and keep the buzz. If the AH turns nasal, the transfer failed.',
    'Siren on NG through your whole range, softly. This is the best single warm-up for joining the registers.',
    'Hum an M until the lips buzz, then alternate M and AH without losing it.',
    'Hold one pitch on EE and open the jaw slowly toward AH. That sweep is the first formant rising.',
    'Hold one pitch and move only the tongue from OO to EE. That is the second formant rising.',
    'Rest two fingers on your voice box. Say "mmm-hmm?" in surprise and feel it rise. Yawn and feel it fall. Sing one phrase three ways, low, neutral, and slightly high.',
    'Sing an ascending scale on EE. When it pinches, let the jaw drop and the vowel drift toward UH. The note should release.',
  ],
  feelsLike: 'A buzz behind the upper teeth. The tone locks in at certain pitch and vowel pairs. Less air moves, and loudness arrives without push.',
  watchFor: 'Do not manufacture space. Forcing the larynx down adds tongue-root tension and gives a woofy tone with mushy consonants. Open throat is a release, not a push.',
};

/**
 * Semi-occluded vocal tract work. The best-supported exercise family on this
 * sheet, and the one to reach for when anything feels effortful.
 */
export const SOVT_NOTES = {
  label: 'SOVT — Straw, Trill, Hum',
  tone: 'chest',
  whatItIs: 'You partly close the end of the tract, so a cushion of pressure sits above the folds. That lowers the pressure needed to start a note, and the folds meet more gently.',
  cues: [
    'Straw: pick the width where you can phonate in comfort and still feel pressure at the lips. Too narrow makes you strain.',
    'Straw in water: hold the tip 2–5 cm under the surface. The bubbles add a changing resistance.',
    'Lip trill: the resistance rises and falls as the lips flap. That pulsing is a gentle massage the straw does not give.',
    'Run the same four every session: glides low to high, short revving accents, a verse of a song, then a spoken line with big inflection.',
    'Dose: about 5 minutes, and several short sessions beat one long one.',
  ],
  feelsLike: 'Pressure at the lips and a mild buzz. The first notes after it feel easier and more connected.',
  watchFor: 'It must feel easy. Puffed cheeks, tight lips, or effort means the straw is wrong. Treat SOVT as a warm-up and reset. The long-term carry-over is not well studied.',
};

/**
 * Low notes. The folds go short, thick, and slack, and the pressure must drop.
 * The surprise is that a low voice carries on its bright upper partials, not on
 * its fundamental, so twang matters more at the bottom than anywhere else.
 */
export const LOW_NOTES = {
  label: 'Low Notes and Bass',
  tone: 'deep',
  whatItIs: 'The thyroarytenoid muscle shortens and thickens the folds. They vibrate slack and slow, so they need less pressure, not more. Too much air blows them apart.',
  soundsLike: 'Quiet at the source. The ear is far less sensitive down there, so a low note carries on its 2–4 kHz ring, not on its fundamental.',
  cues: [
    'Start on a relaxed creaky fry and let it bloom into the note without changing anything. Then work down by semitone, starting each note from fry.',
    'Slide down from a comfortable note on a yawn, and get quieter as you descend. Most singers push louder going down, which kills the note.',
    'Start low notes on a soft "gee", "mum", or "noo". The M closes the folds for you.',
    'Find the note on OO or EE first, then move to OH or AH and keep the same feeling. Open vowels let the folds spread.',
    'Add twang to your bottom notes. A low note that vanishes in a band needs more ring, not more volume. Record it plain and twanged, and compare.',
    'Speak a sentence in your sleepiest just-woken voice, then sing from exactly that set-up.',
  ],
  feelsLike: 'A loose low rattle, with almost no air moving. It feels like dropping in, not reaching down. It sounds much louder inside your head than outside, so record yourself.',
  watchFor: 'Never push the larynx down. That loosens the closure, leaks air, and gives a dopey hollow tone. If a note only works quietly and fails loudly, your pressure is too high.',
};

/**
 * The popular claims that voice science does not support. A singer who chases
 * a sensation instead of a muscle balance stays stuck, so the sheet names the
 * wrong ideas directly.
 */
export const VOICE_MYTHS = [
  {
    myth: 'Chest voice resonates in your chest',
    truth: 'The chest has no opening for sound to leave, so it is not a resonator. The buzz you feel is bone carrying vibration, and it does not add to the sound.',
  },
  {
    myth: 'Head voice resonates in your head',
    truth: 'The sound is made at the folds. The buzz in the face is a downstream effect. Many singers feel it, some feel nothing, and neither means the note is right.',
  },
  {
    myth: 'Mix is a third register',
    truth: 'Mix is a balance between the two muscles inside the overlap of the other two registers. It is a training target, not a place.',
  },
  {
    myth: 'Head voice and falsetto are different registers',
    truth: 'Both are the same thin-fold mechanism. The difference is how completely the folds close, and closure trains separately from mechanism.',
  },
  {
    myth: 'Women do not have falsetto',
    truth: 'Muscle studies since the 1950s show they do. The mechanism is the same, and the name changed because the contrast is less obvious to the ear.',
  },
  {
    myth: 'Belting is a high larynx',
    truth: 'A slightly raised larynx has a real acoustic reason: it lets the first resonance rise with the pitch. Higher is not better, and the degree is still debated.',
  },
  {
    myth: 'Belting is just singing loudly',
    truth: 'Belt is a fold set-up plus a resonance strategy. The loudness is the result. Chest voice dragged above the bridge is the version that hurts people.',
  },
  {
    myth: 'Vocal fry damages your voice',
    truth: 'Sixty years of research found no evidence of harm. Fry works at very low pressure, so it collides more gently than loud speech. Therapists prescribe it.',
  },
  {
    myth: 'Support means pushing more air',
    truth: 'Holding the ribs wide keeps air in the lungs and lowers the pressure at the folds. Support is resisting collapse, not blowing harder.',
  },
  {
    myth: 'Twang is nasal resonance',
    truth: 'The soft palate is shut during twang. The ring comes from the narrow tube above the folds. The nose damps sound and adds almost nothing.',
  },
  {
    myth: 'Sing into the mask, behind the eyes',
    truth: 'A useful cue with a wrong explanation. The buzz is bone carrying vibration to your nerves. It does not reach the listener. Keep the cue and drop the physics.',
  },
  {
    myth: 'Drop the larynx to sing lower',
    truth: 'Larynx height sets tone colour, not pitch. Forcing it down loosens the closure and leaks air. Pitch comes from fold length and mass.',
  },
  {
    myth: 'Use more support to power low notes',
    truth: 'Backwards. Low notes need less pressure. Too much pressure is the main reason a low range goes missing.',
  },
  {
    myth: 'You can extend your low range forever',
    truth: 'Anatomy sets the floor. Practice makes the bottom few notes you already have usable and audible. It does not add an octave.',
  },
];

/** Stop-now signs for clean singing. */
export const CLEAN_RED_FLAGS = [
  'Pain while you sing — stop now. Clean singing should never hurt.',
  'Hoarseness that is still there the next morning — you did too much. Healthy folds recover from a day of work overnight.',
  'The top of your range shrinks over a few sessions — reduce the load and go back to SOVT work.',
  'You need more push each session to get the same note — that is rising effort, not rising skill. Reset.',
  'A wall in the middle of your range while the top and bottom still work — that points to a pressed set-up, not weak muscles.',
  'Hoarseness lasting more than 2 weeks — see an ENT or laryngologist. Do not self-treat.',
];

/** The sources this sheet's copy is drawn from. */
export const CLEAN_CHEAT_SOURCES = [
  { label: 'VoiceScience — chest voice, M1 and the thyroarytenoid muscle', url: 'https://www.voicescience.org/lexicon/chest-voice/' },
  { label: 'VoiceScience — head voice and the cricothyroid muscle', url: 'https://www.voicescience.org/lexicon/head-voice/' },
  { label: 'VoiceScience — falsetto, and how it differs from head voice', url: 'https://www.voicescience.org/lexicon/falsetto/' },
  { label: 'VoiceScience — mixed voice is a balance, not a register', url: 'https://www.voicescience.org/lexicon/mixed-voice/' },
  { label: 'VoiceScience — how to build a mix', url: 'https://www.voicescience.org/articles/mix-voice/' },
  { label: 'VoiceScience — belting, closed quotient and formant tuning', url: 'https://www.voicescience.org/lexicon/belting/' },
  { label: 'VoiceScience — how to belt safely', url: 'https://www.voicescience.org/articles/how-to-belt/' },
  { label: 'VoiceScience — vocal fry, and the evidence on its safety', url: 'https://www.voicescience.org/lexicon/vocal-fry/' },
  { label: 'Titze — belting and a high larynx position, Journal of Singing', url: 'https://www.nats.org/_Library/Science_Informed_Voice_Pedagogy_Resource/Article_Titze_Belting_and_a_High_Larynx_JOS-063-5-2007-557_1_.pdf' },
  { label: 'Titze — the major benefits of semi-occluded vocal tract exercises', url: 'https://vocology.utah.edu/_resources/documents/major_benefits_of_sovtes_titze.pdf' },
  { label: 'Journal of Voice — cricothyroid and thyroarytenoid dominance in registers', url: 'https://www.sciencedirect.com/science/article/abs/pii/S0892199714000198' },
  { label: 'PMC — the mechanism and threshold conditions of falsetto onset', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3049783/' },
  { label: 'SingWise — belting technique and effort balance', url: 'https://www.singwise.com/articles/belting-technique' },
  { label: 'SingWise — breath management and support', url: 'https://www.singwise.com/articles/breath-management-support-of-the-singing-voice' },
  { label: 'Johns Hopkins Medicine — is vocal fry ruining my voice?', url: 'https://www.hopkinsmedicine.org/health/conditions-and-diseases/is-vocal-fry-ruining-my-voice' },
  { label: 'Titze — the acoustic characteristics of vocal twang', url: 'https://vocology.utah.edu/_resources/documents/the_acoustic_characteristics_of_vocal_twang_titze.pdf' },
  { label: 'Yanagisawa and Estill — aryepiglottic constriction and ringing voice', url: 'https://www.sciencedirect.com/science/article/abs/pii/S0892199789800578' },
  { label: 'Journal of Voice — epilaryngeal narrowing and vocal fold contact pressure', url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7869442/' },
  { label: 'Journal of Voice — a CT study of belting against hyperfunctional dysphonia', url: 'https://www.sciencedirect.com/science/article/abs/pii/S0892199717304320' },
  { label: 'Sundberg — an articulatory view of the singer\u2019s formant', url: 'https://www.csc.kth.se/utbildning/kth/kurser/DT2212/Singing%20Sundberg.pdf' },
  { label: 'NCVS — how the vocal tract filters sound', url: 'https://ncvs.org/tutorials/how-the-vocal-tract-filters-sound/' },
  { label: 'Simple Voice Science — three differences between twang and nasality', url: 'https://www.simplevoicescience.com/post/3-differences-between-twang-and-nasality' },
  { label: 'Complete Vocal Institute — twanging the epiglottic funnel', url: 'https://completevocalinstitute.com/twanging-the-epiglottic-funnel/' },
  { label: 'SingWise — singing with an open throat and vocal tract shaping', url: 'https://www.singwise.com/articles/singing-with-an-open-throat-vocal-tract-shaping' },
  { label: 'Ramsey Voice Studio — how to sing low notes', url: 'https://ramseyvoice.com/how-to-sing-low-notes/' },
];
