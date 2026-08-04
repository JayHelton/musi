// Configurable concept-weight profiles per genre.
// These are priorities for recommendation scoring — not rigid curricula
// and not claims that a genre "uses only" these materials.

/** Priority levels stored on the user profile. */
export const GENRE_PRIORITIES = [
  { id: 'primary', label: 'Primary', weight: 1.0 },
  { id: 'secondary', label: 'Secondary', weight: 0.7 },
  { id: 'occasional', label: 'Occasional interest', weight: 0.35 },
  { id: 'inactive', label: 'Currently inactive', weight: 0 },
];

export const PRIORITY_WEIGHT = Object.fromEntries(
  GENRE_PRIORITIES.map(p => [p.id, p.weight])
);

/**
 * Concept tags used across genre profiles and study catalog.
 * Keep tags stable — they are the join key for scoring.
 */
export const CONCEPTS = {
  // Foundation
  major_scale: 'Major-scale construction',
  natural_minor: 'Natural minor',
  interval_locations: 'Interval locations',
  major_minor_triads: 'Major and minor triads',
  triad_inversions: 'Chord inversions',
  diatonic_harmony: 'Diatonic harmony',
  fretboard_transfer: 'Fretboard transfer',
  // Scales / modes
  harmonic_minor: 'Harmonic minor',
  melodic_minor: 'Melodic minor',
  dorian: 'Dorian',
  phrygian: 'Phrygian',
  phrygian_dominant: 'Phrygian dominant',
  locrian: 'Locrian',
  mixolydian: 'Mixolydian',
  major_pentatonic: 'Major pentatonic',
  minor_pentatonic: 'Minor pentatonic',
  blues_vocabulary: 'Blues vocabulary',
  diminished_collections: 'Diminished collections',
  chromatic_approaches: 'Chromatic approaches',
  modal_comparison: 'Modal comparison',
  // Intervals
  flat2: '♭2',
  flat3: '♭3',
  tritone: 'Tritone',
  flat6: '♭6',
  flat7: '♭7',
  octave_displacement: 'Octave displacement',
  wide_intervals: 'Wide interval displacement',
  // Harmony
  diminished_triads: 'Diminished triads',
  augmented_triads: 'Augmented triads',
  dim7: 'Fully diminished seventh',
  min_maj7: 'Minor-major seventh',
  dominant7: 'Dominant seventh',
  maj7: 'Major seventh',
  seventh_chords: 'Seventh chords',
  chord_extensions: 'Chord extensions',
  suspensions: 'Suspended relationships',
  pedal_tones: 'Pedal tones',
  polychords: 'Polychord / upper structures',
  guide_tones: 'Guide tones',
  voice_leading: 'Voice leading',
  altered_dominant: 'Altered dominant',
  root_blind_quality: 'Root-blind quality recognition',
  relative_major_minor: 'Relative major/minor',
  // Contexts
  chord_tone_targeting: 'Chord-tone targeting',
  rhythmic_riff: 'Rhythmic riff construction',
  melodic_lead: 'Melodic lead writing',
  sequential_patterns: 'Sequential interval patterns',
  symmetry_rules: 'Interval symmetry',
  low_register_mapping: 'Low-register fretboard mapping',
  dissonant_dyads: 'Dissonant dyad recognition',
};

/** Learning goals the user may save. */
export const LEARNING_GOALS = [
  { id: 'rhythm_guitar', label: 'Rhythm guitar', concepts: ['rhythmic_riff', 'pedal_tones', 'diatonic_harmony', 'power_chords'] },
  { id: 'lead_guitar', label: 'Lead guitar', concepts: ['melodic_lead', 'chord_tone_targeting', 'sequential_patterns', 'fretboard_transfer'] },
  { id: 'improvisation', label: 'Improvisation', concepts: ['chord_tone_targeting', 'modal_comparison', 'blues_vocabulary', 'guide_tones'] },
  { id: 'songwriting', label: 'Songwriting', concepts: ['diatonic_harmony', 'voice_leading', 'relative_major_minor', 'chord_extensions'] },
  { id: 'chord_progressions', label: 'Chord progressions', concepts: ['diatonic_harmony', 'voice_leading', 'triad_inversions', 'seventh_chords'] },
  { id: 'fretboard_fluency', label: 'Fretboard fluency', concepts: ['fretboard_transfer', 'interval_locations', 'low_register_mapping', 'major_scale'] },
  { id: 'ear_training', label: 'Ear training', concepts: ['interval_locations', 'root_blind_quality', 'major_minor_triads'] },
  { id: 'technique_application', label: 'Technique application', concepts: ['sequential_patterns', 'rhythmic_riff', 'melodic_lead'] },
];

/**
 * Genre catalog. `weights` maps concept id → 0..1 priority.
 * Foundation concepts stay present at a floor even when genre weight is low —
 * the scorer also injects a general-theory floor separately.
 */
export const GENRE_PROFILES = {
  deathcore: {
    id: 'deathcore',
    label: 'Deathcore',
    group: 'Metal',
    blurb: 'Dark harmony, dissonant intervals, and low-register riff construction.',
    influences: ['Dark harmony', 'Dissonant intervals', 'Rhythmic riff construction'],
    weights: {
      natural_minor: 0.95,
      harmonic_minor: 0.95,
      phrygian: 0.9,
      phrygian_dominant: 0.85,
      locrian: 0.8,
      diminished_collections: 0.9,
      chromatic_approaches: 0.85,
      flat2: 0.95,
      flat3: 0.9,
      tritone: 0.95,
      flat6: 0.85,
      flat7: 0.8,
      octave_displacement: 0.75,
      major_minor_triads: 0.7,
      diminished_triads: 0.95,
      dim7: 0.95,
      min_maj7: 0.75,
      augmented_triads: 0.7,
      pedal_tones: 0.9,
      dissonant_dyads: 0.9,
      low_register_mapping: 0.95,
      wide_intervals: 0.85,
      rhythmic_riff: 0.9,
      interval_locations: 0.8,
      fretboard_transfer: 0.75,
      major_scale: 0.45,
      diatonic_harmony: 0.55,
    },
  },
  modern_metal: {
    id: 'modern_metal',
    label: 'Modern Metal',
    group: 'Metal',
    blurb: 'Minor-modal vocabulary with dissonant approaches around a tonal center.',
    influences: ['Dark harmony', 'Dissonant intervals', 'Rhythmic riff construction'],
    weights: {
      natural_minor: 0.9,
      harmonic_minor: 0.9,
      phrygian: 0.85,
      phrygian_dominant: 0.8,
      locrian: 0.75,
      diminished_collections: 0.85,
      chromatic_approaches: 0.8,
      flat2: 0.9,
      tritone: 0.9,
      diminished_triads: 0.9,
      dim7: 0.85,
      pedal_tones: 0.85,
      low_register_mapping: 0.9,
      dissonant_dyads: 0.85,
      rhythmic_riff: 0.85,
      major_scale: 0.5,
      major_minor_triads: 0.7,
      interval_locations: 0.8,
    },
  },
  metalcore: {
    id: 'metalcore',
    label: 'Metalcore',
    group: 'Metal',
    blurb: 'Minor-key harmony with melodic contrast and triad connection across the neck.',
    influences: ['Dark harmony', 'Melodic lead writing', 'Rhythmic riff construction'],
    weights: {
      natural_minor: 0.9,
      harmonic_minor: 0.85,
      phrygian: 0.8,
      dorian: 0.75,
      major_scale: 0.65,
      major_minor_triads: 0.85,
      triad_inversions: 0.8,
      suspensions: 0.7,
      pedal_tones: 0.85,
      chord_tone_targeting: 0.85,
      melodic_lead: 0.85,
      diatonic_harmony: 0.75,
      interval_locations: 0.75,
      fretboard_transfer: 0.8,
      diminished_triads: 0.65,
    },
  },
  progressive_metal: {
    id: 'progressive_metal',
    label: 'Progressive Metal',
    group: 'Metal',
    blurb: 'Modal comparison, extensions, symmetry, and fretboard-wide transfer.',
    influences: ['Dark harmony', 'Melodic lead writing', 'Modal exploration'],
    weights: {
      modal_comparison: 0.95,
      fretboard_transfer: 0.95,
      chord_extensions: 0.9,
      triad_inversions: 0.9,
      diminished_collections: 0.9,
      dim7: 0.85,
      harmonic_minor: 0.85,
      dorian: 0.8,
      phrygian: 0.8,
      natural_minor: 0.8,
      seventh_chords: 0.9,
      polychords: 0.75,
      symmetry_rules: 0.9,
      interval_locations: 0.9,
      major_scale: 0.7,
      major_minor_triads: 0.8,
      diatonic_harmony: 0.8,
      root_blind_quality: 0.85,
      melodic_lead: 0.75,
    },
  },
  melodic_death_metal: {
    id: 'melodic_death_metal',
    label: 'Melodic Death Metal',
    group: 'Metal',
    blurb: 'Minor/harmonic-minor melody with triad connection and relative major color.',
    influences: ['Melodic lead writing', 'Dark harmony', 'Chord-tone targeting'],
    weights: {
      natural_minor: 0.95,
      harmonic_minor: 0.95,
      dorian: 0.8,
      phrygian: 0.75,
      major_scale: 0.7,
      relative_major_minor: 0.85,
      major_minor_triads: 0.9,
      diminished_triads: 0.8,
      diatonic_harmony: 0.85,
      chord_tone_targeting: 0.9,
      melodic_lead: 0.95,
      sequential_patterns: 0.8,
      fretboard_transfer: 0.8,
      interval_locations: 0.75,
    },
  },
  rock: {
    id: 'rock',
    label: 'Rock',
    group: 'Popular',
    blurb: 'Major/minor and pentatonic vocabulary with I–IV–V and dominant color.',
    influences: ['Chord progressions', 'Pentatonic lead', 'Dominant harmony'],
    weights: {
      major_scale: 0.9,
      natural_minor: 0.85,
      major_pentatonic: 0.9,
      minor_pentatonic: 0.9,
      mixolydian: 0.8,
      dorian: 0.7,
      diatonic_harmony: 0.9,
      dominant7: 0.8,
      suspensions: 0.7,
      triad_inversions: 0.75,
      major_minor_triads: 0.85,
      chord_tone_targeting: 0.7,
      melodic_lead: 0.75,
    },
  },
  blues: {
    id: 'blues',
    label: 'Blues',
    group: 'Popular',
    blurb: 'Pentatonic contrast, dominant sevenths, and tension tones that cross diatonic borders.',
    influences: ['Blues vocabulary', 'Dominant harmony', 'Chord-tone targeting'],
    weights: {
      minor_pentatonic: 0.95,
      major_pentatonic: 0.9,
      blues_vocabulary: 0.95,
      dominant7: 0.95,
      flat3: 0.9,
      tritone: 0.7,
      mixolydian: 0.8,
      chord_tone_targeting: 0.9,
      major_scale: 0.7,
      major_minor_triads: 0.75,
      guide_tones: 0.7,
      melodic_lead: 0.85,
    },
  },
  jazz: {
    id: 'jazz',
    label: 'Jazz',
    group: 'Popular',
    blurb: 'Seventh chords, extensions, guide tones, and function-related modes.',
    influences: ['Seventh chords', 'Voice leading', 'Altered dominant'],
    weights: {
      seventh_chords: 0.95,
      chord_extensions: 0.95,
      voice_leading: 0.9,
      guide_tones: 0.95,
      modal_comparison: 0.85,
      altered_dominant: 0.85,
      root_blind_quality: 0.9,
      maj7: 0.85,
      dominant7: 0.9,
      dorian: 0.8,
      mixolydian: 0.8,
      melodic_minor: 0.8,
      major_scale: 0.75,
      triad_inversions: 0.75,
      diatonic_harmony: 0.8,
    },
  },
  pop: {
    id: 'pop',
    label: 'Pop',
    group: 'Popular',
    blurb: 'Major/minor diatonic harmony, common functions, and smooth voice leading.',
    influences: ['Chord progressions', 'Voice leading', 'Relative major/minor'],
    weights: {
      major_scale: 0.95,
      natural_minor: 0.9,
      major_minor_triads: 0.95,
      diatonic_harmony: 0.95,
      triad_inversions: 0.85,
      voice_leading: 0.85,
      relative_major_minor: 0.9,
      suspensions: 0.65,
      major_pentatonic: 0.7,
      chord_progressions: 0.9,
    },
  },
  neoclassical: {
    id: 'neoclassical',
    label: 'Neoclassical',
    group: 'Metal',
    blurb: 'Harmonic minor, Phrygian dominant, and symmetrical diminished/augmented structures.',
    influences: ['Harmonic minor', 'Symmetry', 'Sequential patterns'],
    weights: {
      harmonic_minor: 0.95,
      phrygian_dominant: 0.95,
      dim7: 0.95,
      diminished_collections: 0.9,
      augmented_triads: 0.9,
      symmetry_rules: 0.95,
      sequential_patterns: 0.9,
      triad_inversions: 0.85,
      major_minor_triads: 0.75,
      diminished_triads: 0.85,
      melodic_lead: 0.8,
      major_scale: 0.6,
      interval_locations: 0.8,
    },
  },
};

export const GENRE_LIST = Object.values(GENRE_PROFILES);

/** Shared high-value concepts across a set of active genre ids. */
export function sharedConcepts(genreIds, minWeight = 0.7) {
  const active = genreIds.map(id => GENRE_PROFILES[id]).filter(Boolean);
  if (!active.length) return [];
  const scores = {};
  active.forEach(g => {
    Object.entries(g.weights).forEach(([concept, w]) => {
      if (w >= minWeight) scores[concept] = (scores[concept] || 0) + 1;
    });
  });
  return Object.entries(scores)
    .filter(([, count]) => count >= Math.max(2, Math.ceil(active.length * 0.5)))
    .map(([concept, count]) => ({ concept, count }))
    .sort((a, b) => b.count - a.count);
}

/** Aggregate concept relevance for a weighted genre selection. */
export function aggregateGenreWeights(genreEntries) {
  const out = {};
  genreEntries.forEach(({ id, priority }) => {
    const profile = GENRE_PROFILES[id];
    const pw = PRIORITY_WEIGHT[priority] ?? 0;
    if (!profile || pw <= 0) return;
    Object.entries(profile.weights).forEach(([concept, w]) => {
      out[concept] = Math.max(out[concept] || 0, w * pw);
    });
  });
  return out;
}

export function conceptLabel(id) {
  return CONCEPTS[id] || id.replace(/_/g, ' ');
}
