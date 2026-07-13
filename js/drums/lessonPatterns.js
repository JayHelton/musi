// Teacher-provided PDF drum lessons, extracted from /uploads tab PDFs.
//
// This file is generated from explicit PDF count rows plus notation glyph
// positions so the app can ship the lessons statically with no runtime PDF
// dependency. Ambiguous visual-only staff systems are intentionally excluded.
// Each lesson includes a `lesson` tag plus TBR notes pointing back to the
// source PDF/page for review.

import { renderTab } from './tabRenderer.js';
import { stepsPerBeat } from './types.js';

function slug(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const RAW_LESSONS = [
  {
    "title": "14 Groovy Bass Drum Beats - 'Bright Lights' - Gary Clark Jr.",
    "sourcePdf": "14-Groovy-Bass-Drum-Beats_c2b3.pdf",
    "sourcePage": 1,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      64,
      104
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 14 Groovy Bass Drum Beats, page 1. TBR parsed notes: count row 1 & 2 & a 3 & 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "14 Groovy Bass Drum Beats - 'Chicken Grease' - D'Angelo",
    "sourcePdf": "14-Groovy-Bass-Drum-Beats_c2b3.pdf",
    "sourcePage": 1,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      64,
      104
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 13,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 13,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 14 Groovy Bass Drum Beats, page 1. TBR parsed notes: count row 1 & 2 & a 3 & 4 e; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "14 Groovy Bass Drum Beats - 'Virtual Insanity' - Jamiroquai",
    "sourcePdf": "14-Groovy-Bass-Drum-Beats_c2b3.pdf",
    "sourcePage": 1,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      64,
      104
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 16,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 17,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 18,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 20,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 22,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 23,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 24,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 26,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 28,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 30,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 14 Groovy Bass Drum Beats, page 1. TBR parsed notes: count row 4 e & 1 e & 2 & a 3 e & 4 & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "14 Groovy Bass Drum Beats - 'Are You In?' - Incubus",
    "sourcePdf": "14-Groovy-Bass-Drum-Beats_c2b3.pdf",
    "sourcePage": 1,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      64,
      104
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 16,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 18,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 20,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 22,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 24,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 26,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 28,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 30,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 14 Groovy Bass Drum Beats, page 1. TBR parsed notes: count row 1 & 2 & a 3 & 4 & a 1 & 2 & 3 e & 4 e & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "14 Groovy Bass Drum Beats - 'Don't Feel Right' - The Roots",
    "sourcePdf": "14-Groovy-Bass-Drum-Beats_c2b3.pdf",
    "sourcePage": 1,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      64,
      104
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 14,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 14 Groovy Bass Drum Beats, page 1. TBR parsed notes: count row 1 & 2 & a 3 e & 4 e &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "14 Groovy Bass Drum Beats - 'What I Got' - Sublime",
    "sourcePdf": "14-Groovy-Bass-Drum-Beats_c2b3.pdf",
    "sourcePage": 1,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      64,
      104
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 14 Groovy Bass Drum Beats, page 1. TBR parsed notes: count row 4 e & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "14 Groovy Bass Drum Beats - 'Electric Relaxation' - A Tribe Called Quest",
    "sourcePdf": "14-Groovy-Bass-Drum-Beats_c2b3.pdf",
    "sourcePage": 1,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      64,
      104
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 14 Groovy Bass Drum Beats, page 1. TBR parsed notes: count row 1 & a 2 e & 3 e & 4 & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "14 Groovy Bass Drum Beats - 'Soul Man' - Sam & Dave",
    "sourcePdf": "14-Groovy-Bass-Drum-Beats_c2b3.pdf",
    "sourcePage": 1,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      64,
      104
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 16,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 18,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 20,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 22,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 23,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 24,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 26,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 28,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 30,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 14 Groovy Bass Drum Beats, page 1. TBR parsed notes: count row 4 & a 1 & 2 & a 3 & 4 & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "14 Groovy Bass Drum Beats - 'Scar Tissue' - Red Hot Chili Peppers",
    "sourcePdf": "14-Groovy-Bass-Drum-Beats_c2b3.pdf",
    "sourcePage": 2,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      69,
      109
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 1,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatOpen",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 14 Groovy Bass Drum Beats, page 2. TBR parsed notes: count row 1 e & a 2 e & a 3 e & 4 e &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "14 Groovy Bass Drum Beats - 'All Mixed Up' - 311",
    "sourcePdf": "14-Groovy-Bass-Drum-Beats_c2b3.pdf",
    "sourcePage": 2,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      69,
      109
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatOpen",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 16,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 17,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatOpen",
        "step": 18,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 18,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 20,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 22,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 23,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 24,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 26,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 28,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 30,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 14 Groovy Bass Drum Beats, page 2. TBR parsed notes: count row 4 e & a 1 e & 2 & a 3 e & a 4 & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "14 Groovy Bass Drum Beats - 'Funky President' - James Brown",
    "sourcePdf": "14-Groovy-Bass-Drum-Beats_c2b3.pdf",
    "sourcePage": 2,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      69,
      109
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 1,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatOpen",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 14 Groovy Bass Drum Beats, page 2. TBR parsed notes: count row 1 e & a 2 & a 3 e & 4 & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "14 Groovy Bass Drum Beats - 'I Got A Woman' - John Mayer Trio",
    "sourcePdf": "14-Groovy-Bass-Drum-Beats_c2b3.pdf",
    "sourcePage": 2,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      69,
      109
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 1,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 11,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 14 Groovy Bass Drum Beats, page 2. TBR parsed notes: count row 1 e & a 2 e & a 3 e & a 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "14 Groovy Bass Drum Beats - 'It's Love' - Jill Scott",
    "sourcePdf": "14-Groovy-Bass-Drum-Beats_c2b3.pdf",
    "sourcePage": 2,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      69,
      109
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "kick",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 16,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 18,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 20,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 21,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 22,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 22,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 24,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 25,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 26,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 28,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 30,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 31,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 14 Groovy Bass Drum Beats, page 2. TBR parsed notes: count row a 4 & a 1 & 2 e & 3 e & 4 & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "14 Groovy Bass Drum Beats - 'Superstition' - Stevie Wonder",
    "sourcePdf": "14-Groovy-Bass-Drum-Beats_c2b3.pdf",
    "sourcePage": 2,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      69,
      109
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatOpen",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 7,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 9,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 15,
        "velocity": 0.72,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 14 Groovy Bass Drum Beats, page 2. TBR parsed notes: count row 1 & 2 & a 3 e & 4 & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "15 Must-Know Accent Fills - Downbeat Accents",
    "sourcePdf": "15-Must-Know-Accent-Fills_de41.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      70,
      110
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 15 Must-Know Accent Fills, page 1. TBR parsed notes: count row 1 & 2 & 3 & 4 & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "15 Must-Know Accent Fills - Basic Accents",
    "sourcePdf": "15-Must-Know-Accent-Fills_de41.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      70,
      110
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 17,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 18,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 19,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 21,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 22,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 23,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 15 Must-Know Accent Fills, page 1. TBR parsed notes: count row 1 & 2 & 3 & 4 & a 1 e & a 2 e & a 3 e & a 4 e & ...; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "15 Must-Know Accent Fills - Whipping Accents",
    "sourcePdf": "15-Must-Know-Accent-Fills_de41.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      70,
      110
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 17,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 18,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 19,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 21,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 22,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 23,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 15 Must-Know Accent Fills, page 1. TBR parsed notes: count row 1 & 2 & 3 & 4 & a 1 e & a 2 e & a 3 e & a 4 e & ...; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "15 Must-Know Accent Fills - Classic Accents",
    "sourcePdf": "15-Must-Know-Accent-Fills_de41.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      70,
      110
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 17,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 18,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 19,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 21,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 22,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 23,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 15 Must-Know Accent Fills, page 1. TBR parsed notes: count row 1 & 2 & 3 & 4 & a 1 e & a 2 e & a 3 e & a 4 e & ...; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "15 Must-Know Accent Fills - Syncopated Accents",
    "sourcePdf": "15-Must-Know-Accent-Fills_de41.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      70,
      110
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 17,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 18,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 19,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 21,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 22,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 23,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 15 Must-Know Accent Fills, page 1. TBR parsed notes: count row 1 & 2 & 3 & 4 & a 1 e & a 2 e & a 3 e & a 4 e & ...; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "15 Must-Know Accent Fills - Advanced Accents",
    "sourcePdf": "15-Must-Know-Accent-Fills_de41.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      70,
      110
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 17,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 18,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 19,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 21,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 22,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 23,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 15 Must-Know Accent Fills, page 1. TBR parsed notes: count row 1 & 2 & 3 & 4 & a 1 e & a 2 e & a 3 e & a 4 e & ...; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "15 Must-Know Accent Fills - Accents Down The Drums",
    "sourcePdf": "15-Must-Know-Accent-Fills_de41.pdf",
    "sourcePage": 2,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 17,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 18,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 19,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 21,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 22,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 23,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 15 Must-Know Accent Fills, page 2. TBR parsed notes: count row 1 & 2 & 3 & 4 & a 1 e & a 2 e & a 3 e & a 4 e & ...; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "15 Must-Know Accent Fills - Accents With Kick",
    "sourcePdf": "15-Must-Know-Accent-Fills_de41.pdf",
    "sourcePage": 2,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 17,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 18,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 19,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 21,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 22,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 23,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 15 Must-Know Accent Fills, page 2. TBR parsed notes: count row 1 & 2 & 3 & 4 & a 1 e & a 2 e & a 3 e & a 4 e & ...; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "15 Must-Know Accent Fills - The 'Chad Smith",
    "sourcePdf": "15-Must-Know-Accent-Fills_de41.pdf",
    "sourcePage": 2,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 15 Must-Know Accent Fills, page 2. TBR parsed notes: count row 1 & 2 & 3 & 4 & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "15 Must-Know Accent Fills - The 'Bawitdaba",
    "sourcePdf": "15-Must-Know-Accent-Fills_de41.pdf",
    "sourcePage": 2,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 17,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 18,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 19,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 21,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 22,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 23,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 15 Must-Know Accent Fills, page 2. TBR parsed notes: count row 1 & 2 & 3 & 4 & a 1 e & a 2 e & a 3 e & a 4 e & ...; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "15 Must-Know Accent Fills - Triplet Accents",
    "sourcePdf": "15-Must-Know-Accent-Fills_de41.pdf",
    "sourcePage": 2,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 2,
    "stepsPerBar": 8,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 1,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 3,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 5,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 7,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 11,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 15 Must-Know Accent Fills, page 2. TBR parsed notes: count row 1 & 2 & 3 & 4 & 1 & 2 & 3 & 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "15 Must-Know Accent Fills - Syncopated Triplet Accents",
    "sourcePdf": "15-Must-Know-Accent-Fills_de41.pdf",
    "sourcePage": 2,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 2,
    "stepsPerBar": 8,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 1,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 3,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 5,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 7,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 11,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 11,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 15 Must-Know Accent Fills, page 2. TBR parsed notes: count row 1 & 2 & 3 & 4 & 1 & 2 & 3 & 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "15 Must-Know Accent Fills - Triplet Accents With Kick",
    "sourcePdf": "15-Must-Know-Accent-Fills_de41.pdf",
    "sourcePage": 2,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 15 Must-Know Accent Fills, page 2. TBR parsed notes: count row 1 & 2 & 3 & 4 & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "15 Must-Know Accent Fills - 32nd-Note Accents",
    "sourcePdf": "15-Must-Know-Accent-Fills_de41.pdf",
    "sourcePage": 3,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 15 Must-Know Accent Fills, page 3. TBR parsed notes: count row 1 & 2 & 3 & 4 e & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "15 Must-Know Accent Fills - The 'Mitch Mitchell",
    "sourcePdf": "15-Must-Know-Accent-Fills_de41.pdf",
    "sourcePage": 3,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 15 Must-Know Accent Fills, page 3. TBR parsed notes: count row 1 & 2 & 3 & 4 & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "16 Famous Bass Drum Beats - 'Give It Away' - RHCP",
    "sourcePdf": "16-Famous-Bass-Drum-Beats_41a9.pdf",
    "sourcePage": 1,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      51,
      91
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatOpen",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatOpen",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatOpen",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatOpen",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatOpen",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatOpen",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatOpen",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatOpen",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 14,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 16 Famous Bass Drum Beats, page 1. TBR parsed notes: count row 1 & a 2 & 3 e & 4 e &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "16 Famous Bass Drum Beats - Walk This Way' Aerosmith",
    "sourcePdf": "16-Famous-Bass-Drum-Beats_41a9.pdf",
    "sourcePage": 1,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      51,
      91
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatOpen",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 16 Famous Bass Drum Beats, page 1. TBR parsed notes: count row 1 & 2 & a 3 & 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "16 Famous Bass Drum Beats - 'I Hate Everything About You' - Three Days Grace",
    "sourcePdf": "16-Famous-Bass-Drum-Beats_41a9.pdf",
    "sourcePage": 1,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      51,
      91
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 1,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 11,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 16,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 17,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 18,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 19,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 20,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 21,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 22,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 23,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 24,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 26,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 28,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 30,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 16 Famous Bass Drum Beats, page 1. TBR parsed notes: count row 1 e & a 2 e & a 3 e & a 4 e & a 1 e & a 2 e & a ...; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "16 Famous Bass Drum Beats - Railroad",
    "sourcePdf": "16-Famous-Bass-Drum-Beats_41a9.pdf",
    "sourcePage": 2,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      148,
      188
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 4,
    "stepsPerBar": 8,
    "recommendedLoopBars": 4,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 1,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 11,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 16,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 17,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 18,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 18,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 19,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 20,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 21,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 22,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 22,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 23,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 24,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 26,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 28,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 30,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 16 Famous Bass Drum Beats, page 2. TBR parsed notes: count row 1 & 2 & 3 & 4 & 1 & 2 & 3 & 4 & 1 & 2 & 3 & 4 & ...; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "16 Famous Bass Drum Beats - 'Footstompin' Music' - Grand Funk",
    "sourcePdf": "16-Famous-Bass-Drum-Beats_41a9.pdf",
    "sourcePage": 2,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      148,
      188
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 4,
    "stepsPerBar": 8,
    "recommendedLoopBars": 4,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 1,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 11,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 16,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 17,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 18,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 18,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 19,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 20,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 21,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 22,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 22,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 23,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 24,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 26,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 28,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 30,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 16 Famous Bass Drum Beats, page 2. TBR parsed notes: count row 1 & 2 & 3 & 4 & 1 & 2 & 3 & 4 & 1 & 2 & 3 & 4 & ...; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "16 Famous Bass Drum Beats - 'Tush' - ZZ Top",
    "sourcePdf": "16-Famous-Bass-Drum-Beats_41a9.pdf",
    "sourcePage": 2,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      148,
      188
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 2,
    "stepsPerBar": 8,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 1,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 1,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 1,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 5,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 9,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 9,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 16 Famous Bass Drum Beats, page 2. TBR parsed notes: count row 1 & 3 & 1 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "16 Famous Bass Drum Beats - Bramhall II",
    "sourcePdf": "16-Famous-Bass-Drum-Beats_41a9.pdf",
    "sourcePage": 2,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      148,
      188
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 1,
    "stepsPerBar": 8,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 1,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 1,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 1,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 5,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 5,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 16 Famous Bass Drum Beats, page 2. TBR parsed notes: count row 1 & 3 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "16 Famous Bass Drum Beats - 'Green Light Girl' - Doyle",
    "sourcePdf": "16-Famous-Bass-Drum-Beats_41a9.pdf",
    "sourcePage": 2,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      148,
      188
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 1,
    "stepsPerBar": 8,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 1,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 1,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 1,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 5,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 5,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 16 Famous Bass Drum Beats, page 2. TBR parsed notes: count row 1 & 3 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "16 Famous Bass Drum Beats - 'Sugar, We're Goin Down' - Fall Out Boy",
    "sourcePdf": "16-Famous-Bass-Drum-Beats_41a9.pdf",
    "sourcePage": 2,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      148,
      188
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "snare",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 16,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 17,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 18,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 19,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 20,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 21,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 22,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 23,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 24,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 26,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 28,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 30,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 16 Famous Bass Drum Beats, page 2. TBR parsed notes: count row a 1 e & a 2 e & a 3 e & a 4 e & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "16 Famous Bass Drum Beats - 'Smells Like Teen Spirit' - Nirvana",
    "sourcePdf": "16-Famous-Bass-Drum-Beats_41a9.pdf",
    "sourcePage": 3,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      98,
      138
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatOpen",
        "step": 3,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 16,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 19,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatOpen",
        "step": 20,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 23,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatOpen",
        "step": 24,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatOpen",
        "step": 28,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 30,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 16 Famous Bass Drum Beats, page 3. TBR parsed notes: count row a 1 a 2 a 3 e & a 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "16 Famous Bass Drum Beats - 'Helena' - My Chemical Romance",
    "sourcePdf": "16-Famous-Bass-Drum-Beats_41a9.pdf",
    "sourcePage": 3,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      98,
      138
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 16,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 18,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 18,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 20,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 21,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 22,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 22,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 24,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 26,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 28,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 30,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 16 Famous Bass Drum Beats, page 3. TBR parsed notes: count row 1 & 2 e & 3 e & 4 e & 1 & 2 e & 3 e & a 4 e &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "16 Must-Know Roll Fills - Drag Fill 1",
    "sourcePdf": "16-Must-Know-Roll-Fills_2f20.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      70,
      110
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 16,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 18,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 20,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 22,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 24,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 26,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 16 Must-Know Roll Fills, page 1. TBR parsed notes: count row 1 & 2 & 3 & 4 & 1 & 2 & 3 & a 4 e & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "16 Must-Know Roll Fills - Drag Fill 2",
    "sourcePdf": "16-Must-Know-Roll-Fills_2f20.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      70,
      110
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 16,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 18,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 20,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 22,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 23,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 16 Must-Know Roll Fills, page 1. TBR parsed notes: count row 1 & 2 & 3 & 4 & 1 & 2 & a 3 e & a 4 e & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "16 Must-Know Roll Fills - Drag Fill 3",
    "sourcePdf": "16-Must-Know-Roll-Fills_2f20.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      70,
      110
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 17,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 18,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 19,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 21,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 22,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 23,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 16 Must-Know Roll Fills, page 1. TBR parsed notes: count row 1 & 2 & 3 & 4 & a 1 e & a 2 e & a 3 e & a 4 e & ...; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "16 Must-Know Roll Fills - Drag Fill 4",
    "sourcePdf": "16-Must-Know-Roll-Fills_2f20.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      70,
      110
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 17,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 18,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 19,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 21,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 22,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 23,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 16 Must-Know Roll Fills, page 1. TBR parsed notes: count row 1 & 2 & 3 & 4 & a 1 e & a 2 e & a 3 e & a 4 e & ...; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "16 Must-Know Roll Fills - 5-Stroke Fill 1",
    "sourcePdf": "16-Must-Know-Roll-Fills_2f20.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      70,
      110
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 16,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 18,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 20,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 22,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 24,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 16 Must-Know Roll Fills, page 1. TBR parsed notes: count row 1 & 2 & 3 & 4 & 1 & 2 & 3 & a 4 e & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "16 Must-Know Roll Fills - 5-Stroke Fill 2",
    "sourcePdf": "16-Must-Know-Roll-Fills_2f20.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      70,
      110
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 16,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 18,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 20,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 22,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 23,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 16 Must-Know Roll Fills, page 1. TBR parsed notes: count row 1 & 2 & 3 & 4 & 1 & 2 & a 3 e & a 4 e & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "16 Must-Know Roll Fills - 5-Stroke Fill 3",
    "sourcePdf": "16-Must-Know-Roll-Fills_2f20.pdf",
    "sourcePage": 2,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 17,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 18,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 19,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 21,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 22,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 23,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 16 Must-Know Roll Fills, page 2. TBR parsed notes: count row 1 & 2 & 3 & 4 & a 1 e & a 2 e & a 3 e & a 4 e & ...; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "16 Must-Know Roll Fills - 5-Stroke Fill 4",
    "sourcePdf": "16-Must-Know-Roll-Fills_2f20.pdf",
    "sourcePage": 2,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 17,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 18,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 19,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 21,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 22,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 23,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 16 Must-Know Roll Fills, page 2. TBR parsed notes: count row 1 & 2 & 3 & 4 & a 1 e & a 2 e & a 3 e & a 4 e & ...; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "16 Must-Know Roll Fills - 7-Stroke Fill 1",
    "sourcePdf": "16-Must-Know-Roll-Fills_2f20.pdf",
    "sourcePage": 2,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 16,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 18,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 20,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 22,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 24,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 26,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 16 Must-Know Roll Fills, page 2. TBR parsed notes: count row 1 & 2 & 3 & 4 & 1 & 2 & 3 & 4 e & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "16 Must-Know Roll Fills - 7-Stroke Fill 2",
    "sourcePdf": "16-Must-Know-Roll-Fills_2f20.pdf",
    "sourcePage": 2,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 17,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 18,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 19,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 21,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 22,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 23,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 16 Must-Know Roll Fills, page 2. TBR parsed notes: count row 1 & 2 & 3 & 4 & a 1 e & a 2 e & a 3 e & a 4 e & ...; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "16 Must-Know Roll Fills - Syncopated Fill 1",
    "sourcePdf": "16-Must-Know-Roll-Fills_2f20.pdf",
    "sourcePage": 2,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 17,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 18,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 19,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 21,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 22,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 23,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 16 Must-Know Roll Fills, page 2. TBR parsed notes: count row 1 & 2 & 3 & 4 & a 1 e & a 2 e & a 3 e & a 4 e & ...; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "16 Must-Know Roll Fills - Syncopated Fill 2",
    "sourcePdf": "16-Must-Know-Roll-Fills_2f20.pdf",
    "sourcePage": 2,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 17,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 18,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 19,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 21,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 22,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 23,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 16 Must-Know Roll Fills, page 2. TBR parsed notes: count row 1 & 2 & 3 & 4 & a 1 e & a 2 e & a 3 e & a 4 e & ...; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "16 Must-Know Roll Fills - 6-Stroke Fill 1",
    "sourcePdf": "16-Must-Know-Roll-Fills_2f20.pdf",
    "sourcePage": 2,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 1,
    "stepsPerBar": 8,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 1,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 3,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 5,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 7,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 7,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 16 Must-Know Roll Fills, page 2. TBR parsed notes: count row 1 & 2 & 3 & 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "16 Must-Know Roll Fills - 6-Stroke Fill 2",
    "sourcePdf": "16-Must-Know-Roll-Fills_2f20.pdf",
    "sourcePage": 3,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 18,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 21,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 22,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 16 Must-Know Roll Fills, page 3. TBR parsed notes: count row 1 & 2 & 3 & 4 & 1 & 2 e & 3 & a 4 e & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "16 Must-Know Roll Fills - 6-Stroke Fill 3",
    "sourcePdf": "16-Must-Know-Roll-Fills_2f20.pdf",
    "sourcePage": 3,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 2,
    "stepsPerBar": 8,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 1,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 3,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 5,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 7,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 11,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 11,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 16 Must-Know Roll Fills, page 3. TBR parsed notes: count row 1 & 2 & 3 & 4 & 1 & 2 & 3 & 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "16 Must-Know Roll Fills - Inverted Doubles Fill",
    "sourcePdf": "16-Must-Know-Roll-Fills_2f20.pdf",
    "sourcePage": 3,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 1,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 11,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 11,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 16 Must-Know Roll Fills, page 3. TBR parsed notes: count row 1 e & a 2 e & a 3 e & a 4 e & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "18 Must-Know Kick Fills - 16th-Notes",
    "sourcePdf": "18-Must-Know-Kick-Fills_9069.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      70,
      110
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 18 Must-Know Kick Fills, page 1. TBR parsed notes: count row 1 & 2 & 3 & 4 & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "18 Must-Know Kick Fills - Syncopated 16th-Notes",
    "sourcePdf": "18-Must-Know-Kick-Fills_9069.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      70,
      110
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 18 Must-Know Kick Fills, page 1. TBR parsed notes: count row 1 & 2 & 3 & 4 & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "18 Must-Know Kick Fills - Accented 16th-Notes",
    "sourcePdf": "18-Must-Know-Kick-Fills_9069.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      70,
      110
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 18 Must-Know Kick Fills, page 1. TBR parsed notes: count row 1 & 2 & 3 & 4 & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "18 Must-Know Kick Fills - Crashes",
    "sourcePdf": "18-Must-Know-Kick-Fills_9069.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      70,
      110
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 16,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 17,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 18,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 19,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 21,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 22,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 22,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 23,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 28,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 18 Must-Know Kick Fills, page 1. TBR parsed notes: count row 1 & 2 & 3 & 4 & a 1 e & a 2 e & a 3 e & a 4 e & ...; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "18 Must-Know Kick Fills - Double-Kicks",
    "sourcePdf": "18-Must-Know-Kick-Fills_9069.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      70,
      110
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 18 Must-Know Kick Fills, page 1. TBR parsed notes: count row 1 & 2 & 3 & 4 & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "18 Must-Know Kick Fills - Flams",
    "sourcePdf": "18-Must-Know-Kick-Fills_9069.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      70,
      110
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 18 Must-Know Kick Fills, page 1. TBR parsed notes: count row 1 & 2 & 3 & 4 & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "18 Must-Know Kick Fills - Ruffs",
    "sourcePdf": "18-Must-Know-Kick-Fills_9069.pdf",
    "sourcePage": 2,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 1,
    "stepsPerBar": 8,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 1,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 3,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 5,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 5,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 18 Must-Know Kick Fills, page 2. TBR parsed notes: count row 1 & 2 & 3 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "18 Must-Know Kick Fills - Barks",
    "sourcePdf": "18-Must-Know-Kick-Fills_9069.pdf",
    "sourcePage": 2,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatOpen",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 1,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatOpen",
        "step": 3,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatOpen",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatOpen",
        "step": 9,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 11,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatOpen",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 18 Must-Know Kick Fills, page 2. TBR parsed notes: count row 1 e & a 2 e & a 3 e & a 4 e & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "18 Must-Know Kick Fills - Quick Double Kicks",
    "sourcePdf": "18-Must-Know-Kick-Fills_9069.pdf",
    "sourcePage": 2,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 1,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 11,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatOpen",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 18 Must-Know Kick Fills, page 2. TBR parsed notes: count row 1 e & a 2 e & a 3 e & a 4 e & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "18 Must-Know Kick Fills - Busy Triplets",
    "sourcePdf": "18-Must-Know-Kick-Fills_9069.pdf",
    "sourcePage": 2,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 18 Must-Know Kick Fills, page 2. TBR parsed notes: count row 1 & 2 & a 3 & 4 & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "18 Must-Know Kick Fills - Triplet Chops",
    "sourcePdf": "18-Must-Know-Kick-Fills_9069.pdf",
    "sourcePage": 3,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 2,
    "stepsPerBar": 8,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 1,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 3,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 5,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 7,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 11,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 11,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 18 Must-Know Kick Fills, page 3. TBR parsed notes: count row 1 & 2 & 3 & 4 & 1 & 2 & 3 & 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "18 Must-Know Kick Fills - Triplet Double-Kicks",
    "sourcePdf": "18-Must-Know-Kick-Fills_9069.pdf",
    "sourcePage": 3,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 18 Must-Know Kick Fills, page 3. TBR parsed notes: count row 1 & 2 & 3 & 4 & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "18 Must-Know Kick Fills - 32nd-Notes",
    "sourcePdf": "18-Must-Know-Kick-Fills_9069.pdf",
    "sourcePage": 3,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 18 Must-Know Kick Fills, page 3. TBR parsed notes: count row 1 & 2 & 3 & 4 & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "18 Must-Know Kick Fills - 32nd-Note Roll",
    "sourcePdf": "18-Must-Know-Kick-Fills_9069.pdf",
    "sourcePage": 3,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 18 Must-Know Kick Fills, page 3. TBR parsed notes: count row 1 & 2 & 3 & 4 & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "18 Must-Know Kick Fills - 32nd-Note Chop",
    "sourcePdf": "18-Must-Know-Kick-Fills_9069.pdf",
    "sourcePage": 4,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 18 Must-Know Kick Fills, page 4. TBR parsed notes: count row 1 & 2 & 3 & 4 & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "20 Fills Beginners Should Practice - Pop Fill",
    "sourcePdf": "20-Fills-Beginners-Should-Practice_75ac.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      70,
      110
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 16,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 18,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 20,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 22,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 24,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 26,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 28,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 20 Fills Beginners Should Practice, page 1. TBR parsed notes: count row 1 & 2 & 3 & 4 & 1 & 2 & 3 & 4 & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "20 Fills Beginners Should Practice - $ Fill",
    "sourcePdf": "20-Fills-Beginners-Should-Practice_75ac.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      70,
      110
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 16,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 18,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 20,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 22,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 24,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 26,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 20 Fills Beginners Should Practice, page 1. TBR parsed notes: count row 1 & 2 & 3 & 4 & 1 & 2 & 3 & 4 e & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "20 Fills Beginners Should Practice - Debby-Boone",
    "sourcePdf": "20-Fills-Beginners-Should-Practice_75ac.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      70,
      110
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 16,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 18,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 20,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 22,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 24,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 26,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 30,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 20 Fills Beginners Should Practice, page 1. TBR parsed notes: count row 1 & 2 & 3 & 4 & 1 & 2 & 3 & 4 e &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "20 Fills Beginners Should Practice - Bucket-Of-Fish",
    "sourcePdf": "20-Fills-Beginners-Should-Practice_75ac.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      70,
      110
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 1,
    "stepsPerBar": 8,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 1,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 3,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 5,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 7,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 20 Fills Beginners Should Practice, page 1. TBR parsed notes: count row 1 & 2 & 3 & 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "20 Fills Beginners Should Practice - 8th-Note Fill",
    "sourcePdf": "20-Fills-Beginners-Should-Practice_75ac.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      70,
      110
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 2,
    "stepsPerBar": 8,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 1,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 3,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 5,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 7,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 9,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 11,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 20 Fills Beginners Should Practice, page 1. TBR parsed notes: count row 1 & 2 & 3 & 4 & 1 & 2 & 3 & 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "20 Fills Beginners Should Practice - Crash Fill",
    "sourcePdf": "20-Fills-Beginners-Should-Practice_75ac.pdf",
    "sourcePage": 2,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 2,
    "stepsPerBar": 8,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 1,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 3,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 5,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 7,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 9,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 11,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 20 Fills Beginners Should Practice, page 2. TBR parsed notes: count row 1 & 2 & 3 & 4 & 1 & 2 & 3 & 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "20 Fills Beginners Should Practice - Flam Fill",
    "sourcePdf": "20-Fills-Beginners-Should-Practice_75ac.pdf",
    "sourcePage": 2,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 2,
    "stepsPerBar": 8,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 1,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 3,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 5,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 7,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 9,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 11,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 20 Fills Beginners Should Practice, page 2. TBR parsed notes: count row 1 & 2 & 3 & 4 & 1 & 2 & 3 & 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "20 Fills Beginners Should Practice - Down The Drums",
    "sourcePdf": "20-Fills-Beginners-Should-Practice_75ac.pdf",
    "sourcePage": 2,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 16,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 18,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 20,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 22,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 20 Fills Beginners Should Practice, page 2. TBR parsed notes: count row 1 & 2 & 3 & 4 & 1 & 2 & 3 e & a 4 e & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "20 Fills Beginners Should Practice - Pat-Boone Debby-Boone",
    "sourcePdf": "20-Fills-Beginners-Should-Practice_75ac.pdf",
    "sourcePage": 2,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 16,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 18,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 20,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 22,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 20 Fills Beginners Should Practice, page 2. TBR parsed notes: count row 1 & 2 & 3 & 4 & 1 & 2 & 3 & 4 e &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "20 Fills Beginners Should Practice - Motown Fill",
    "sourcePdf": "20-Fills-Beginners-Should-Practice_75ac.pdf",
    "sourcePage": 2,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 16,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 18,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 20,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 22,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 20 Fills Beginners Should Practice, page 2. TBR parsed notes: count row 1 & 2 & 3 & 4 & 1 & 2 & 3 e & a 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "20 Fills Beginners Should Practice - Ringo Fill",
    "sourcePdf": "20-Fills-Beginners-Should-Practice_75ac.pdf",
    "sourcePage": 2,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 16,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 18,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 20,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 22,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 20 Fills Beginners Should Practice, page 2. TBR parsed notes: count row 1 & 2 & 3 & 4 & 1 & 2 & 3 e a 4 e &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "20 Fills Beginners Should Practice - 8th-Note Build",
    "sourcePdf": "20-Fills-Beginners-Should-Practice_75ac.pdf",
    "sourcePage": 3,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 1,
    "stepsPerBar": 8,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 1,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 3,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 5,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 7,
        "velocity": 0.72,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 20 Fills Beginners Should Practice, page 3. TBR parsed notes: count row 1 & 2 & 3 & 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "20 Fills Beginners Should Practice - 16th-Note Build",
    "sourcePdf": "20-Fills-Beginners-Should-Practice_75ac.pdf",
    "sourcePage": 3,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 1,
    "stepsPerBar": 8,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 1,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 3,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 5,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 7,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 7,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 20 Fills Beginners Should Practice, page 3. TBR parsed notes: count row 1 & 2 & 3 & 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "20 Fills Beginners Should Practice - Build & Crash",
    "sourcePdf": "20-Fills-Beginners-Should-Practice_75ac.pdf",
    "sourcePage": 3,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 18,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 22,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 28,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 20 Fills Beginners Should Practice, page 3. TBR parsed notes: count row 1 & 2 & 3 & 4 & 1 & 2 & 3 & 4 & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "20 Fills Beginners Should Practice - Flam & Crash",
    "sourcePdf": "20-Fills-Beginners-Should-Practice_75ac.pdf",
    "sourcePage": 3,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 18,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 22,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 22,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 28,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 20 Fills Beginners Should Practice, page 3. TBR parsed notes: count row 1 & 2 & 3 & 4 & 1 & 2 & 3 & 4 & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "20 Fills Beginners Should Practice - Big 16th's",
    "sourcePdf": "20-Fills-Beginners-Should-Practice_75ac.pdf",
    "sourcePage": 3,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 1,
    "stepsPerBar": 8,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 1,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 3,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 5,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 7,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 7,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 20 Fills Beginners Should Practice, page 3. TBR parsed notes: count row 1 & 2 & 3 & 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "20 Fills Beginners Should Practice - Broken 16th's",
    "sourcePdf": "20-Fills-Beginners-Should-Practice_75ac.pdf",
    "sourcePage": 3,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 1,
    "stepsPerBar": 8,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 1,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 3,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 5,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 7,
        "velocity": 0.72,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 20 Fills Beginners Should Practice, page 3. TBR parsed notes: count row 1 & 2 & 3 & 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "20 Fills Beginners Should Practice - Syncopated 16th's",
    "sourcePdf": "20-Fills-Beginners-Should-Practice_75ac.pdf",
    "sourcePage": 4,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 1,
    "stepsPerBar": 8,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 1,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 3,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 5,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 7,
        "velocity": 0.72,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 20 Fills Beginners Should Practice, page 4. TBR parsed notes: count row 1 & 2 & 3 & 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "20 Fills Beginners Should Practice - Accented 16th's",
    "sourcePdf": "20-Fills-Beginners-Should-Practice_75ac.pdf",
    "sourcePage": 4,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 17,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 18,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 19,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 21,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 22,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 23,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 20 Fills Beginners Should Practice, page 4. TBR parsed notes: count row 1 & 2 & 3 & 4 & 1 e & a 2 e & a 3 e & a 4 e & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "20 Fills Beginners Should Practice - Linear 16th's",
    "sourcePdf": "20-Fills-Beginners-Should-Practice_75ac.pdf",
    "sourcePage": 4,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 1,
    "stepsPerBar": 8,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 1,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 3,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 5,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 7,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 7,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 20 Fills Beginners Should Practice, page 4. TBR parsed notes: count row 1 & 2 & 3 & 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "25 Beats Beginners Should Practice - Quarter-Note Beat",
    "sourcePdf": "25-Beats-Beginners-Should-Practice_ca57.pdf",
    "sourcePage": 1,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      80,
      120
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 2,
    "stepsPerBar": 8,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 14,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 25 Beats Beginners Should Practice, page 1. TBR parsed notes: count row 4 1 2 3 4; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "25 Beats Beginners Should Practice - $ Beat",
    "sourcePdf": "25-Beats-Beginners-Should-Practice_ca57.pdf",
    "sourcePage": 1,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      80,
      120
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 1,
    "stepsPerBar": 8,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 1,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 3,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 5,
        "velocity": 0.72,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 25 Beats Beginners Should Practice, page 1. TBR parsed notes: count row 1 & 2 & 3 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "25 Beats Beginners Should Practice - Rock Beat",
    "sourcePdf": "25-Beats-Beginners-Should-Practice_ca57.pdf",
    "sourcePage": 1,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      80,
      120
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 2,
    "stepsPerBar": 8,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 5,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 7,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 9,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 11,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 13,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 15,
        "velocity": 0.72,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 25 Beats Beginners Should Practice, page 1. TBR parsed notes: count row 3 & 4 & 1 & 2 & 3 & 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "25 Beats Beginners Should Practice - Pop Beat",
    "sourcePdf": "25-Beats-Beginners-Should-Practice_ca57.pdf",
    "sourcePage": 1,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      80,
      120
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 1,
    "stepsPerBar": 8,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 1,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 3,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 5,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 5,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 25 Beats Beginners Should Practice, page 1. TBR parsed notes: count row 1 & 2 & 3 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "25 Beats Beginners Should Practice - Twist Beat",
    "sourcePdf": "25-Beats-Beginners-Should-Practice_ca57.pdf",
    "sourcePage": 1,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      80,
      120
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 2,
    "stepsPerBar": 8,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 5,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 7,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 9,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 11,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 11,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 13,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 15,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 25 Beats Beginners Should Practice, page 1. TBR parsed notes: count row 3 & 4 & 1 & 2 & 3 & 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "25 Beats Beginners Should Practice - 4 On Floor Beat",
    "sourcePdf": "25-Beats-Beginners-Should-Practice_ca57.pdf",
    "sourcePage": 1,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      80,
      120
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 1,
    "stepsPerBar": 8,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 1,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 3,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 5,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 25 Beats Beginners Should Practice, page 1. TBR parsed notes: count row 1 & 2 & 3 & 4; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "25 Beats Beginners Should Practice - Motown Beat",
    "sourcePdf": "25-Beats-Beginners-Should-Practice_ca57.pdf",
    "sourcePage": 1,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      80,
      120
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 2,
    "stepsPerBar": 8,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 1,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 7,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 9,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 11,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 13,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 15,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 25 Beats Beginners Should Practice, page 1. TBR parsed notes: count row & 4 & 1 & 2 & 3 & 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "25 Beats Beginners Should Practice - Disco Beat",
    "sourcePdf": "25-Beats-Beginners-Should-Practice_ca57.pdf",
    "sourcePage": 1,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      80,
      120
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 1,
    "stepsPerBar": 8,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatOpen",
        "step": 1,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatOpen",
        "step": 3,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatOpen",
        "step": 5,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 25 Beats Beginners Should Practice, page 1. TBR parsed notes: count row 1 & 2 & 3 & 4; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "25 Beats Beginners Should Practice - Drum Break Beat",
    "sourcePdf": "25-Beats-Beginners-Should-Practice_ca57.pdf",
    "sourcePage": 1,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      80,
      120
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatOpen",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 14,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 25 Beats Beginners Should Practice, page 1. TBR parsed notes: count row 1 & 2 & a 3 & 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "25 Beats Beginners Should Practice - Bark Beat",
    "sourcePdf": "25-Beats-Beginners-Should-Practice_ca57.pdf",
    "sourcePage": 2,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 1,
    "stepsPerBar": 8,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 1,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatOpen",
        "step": 3,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 5,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 25 Beats Beginners Should Practice, page 2. TBR parsed notes: count row 1 & 2 & 3 & 4; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "25 Beats Beginners Should Practice - Syncopated Beat",
    "sourcePdf": "25-Beats-Beginners-Should-Practice_ca57.pdf",
    "sourcePage": 2,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 25 Beats Beginners Should Practice, page 2. TBR parsed notes: count row & 4 & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "25 Beats Beginners Should Practice - Ghost-Note Beat",
    "sourcePdf": "25-Beats-Beginners-Should-Practice_ca57.pdf",
    "sourcePage": 2,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 25 Beats Beginners Should Practice, page 2. TBR parsed notes: count row 1 & 2 & a 3 e & 4; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "25 Beats Beginners Should Practice - Hi-Hat Beat",
    "sourcePdf": "25-Beats-Beginners-Should-Practice_ca57.pdf",
    "sourcePage": 2,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 16,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 18,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 20,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 22,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 23,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 24,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 25,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 26,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 28,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 30,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 31,
        "velocity": 0.72,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 25 Beats Beginners Should Practice, page 2. TBR parsed notes: count row e & 4 & a 1 & 2 & a 3 e & 4 & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "25 Beats Beginners Should Practice - Tom Beat",
    "sourcePdf": "25-Beats-Beginners-Should-Practice_ca57.pdf",
    "sourcePage": 2,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomFloor",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomFloor",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomFloor",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 25 Beats Beginners Should Practice, page 2. TBR parsed notes: count row 1 & 2 & a 3 e & 4; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "25 Beats Beginners Should Practice - 16th-Note Beat",
    "sourcePdf": "25-Beats-Beginners-Should-Practice_ca57.pdf",
    "sourcePage": 2,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 1,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 3,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 5,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 7,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 9,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatOpen",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatOpen",
        "step": 11,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 13,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 15,
        "velocity": 0.72,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 25 Beats Beginners Should Practice, page 2. TBR parsed notes: count row 1 e & a 2 e & a 3 e & a 4 e & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "25 Beats Beginners Should Practice - Train Beat",
    "sourcePdf": "25-Beats-Beginners-Should-Practice_ca57.pdf",
    "sourcePage": 2,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "snare",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 1,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 11,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 25 Beats Beginners Should Practice, page 2. TBR parsed notes: count row 1 e & a 2 e & a 3 e & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "25 Beats Beginners Should Practice - Double-Time Beat",
    "sourcePdf": "25-Beats-Beginners-Should-Practice_ca57.pdf",
    "sourcePage": 2,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "snare",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 11,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 16,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 18,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 18,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 20,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 21,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 22,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 22,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 24,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 26,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 28,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 30,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 25 Beats Beginners Should Practice, page 2. TBR parsed notes: count row 3 e & a 4 e & a 1 & 2 e & 3 & 4 e &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "25 Beats Beginners Should Practice - Songo Beat",
    "sourcePdf": "25-Beats-Beginners-Should-Practice_ca57.pdf",
    "sourcePage": 2,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 8,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 10,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 11,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 11,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 25 Beats Beginners Should Practice, page 2. TBR parsed notes: count row 1 & a 2 & a 3 & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "25 Beats Beginners Should Practice - Soca Beat",
    "sourcePdf": "25-Beats-Beginners-Should-Practice_ca57.pdf",
    "sourcePage": 2,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 25 Beats Beginners Should Practice, page 2. TBR parsed notes: count row & a 4 & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "25 Beats Beginners Should Practice - 12/8 Beat",
    "sourcePdf": "25-Beats-Beginners-Should-Practice_ca57.pdf",
    "sourcePage": 2,
    "category": "beat",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 1,
    "stepsPerBar": 8,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: 25 Beats Beginners Should Practice, page 2. TBR parsed notes: count row 1 2 3 4; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "Accent Intro - Start with soft 16th-notes...",
    "sourcePdf": "Accent-Intro_4459.pdf",
    "sourcePage": 1,
    "category": "exercise",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "tomHigh",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 11,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: Accent Intro, page 1. TBR parsed notes: count row & a 3 e & a 4 e & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "Accent Intro - Start by accenting the downbeats...",
    "sourcePdf": "Accent-Intro_4459.pdf",
    "sourcePage": 1,
    "category": "exercise",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "tomHigh",
        "step": 1,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 11,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: Accent Intro, page 1. TBR parsed notes: count row e & a 3 e & a 4 e & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "Accent Intro - Then the downbeats and 'e's' of every beat.",
    "sourcePdf": "Accent-Intro_4459.pdf",
    "sourcePage": 1,
    "category": "exercise",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "tomHigh",
        "step": 1,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 11,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: Accent Intro, page 1. TBR parsed notes: count row e & a 3 e & a 4 e & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "Accent Intro - Then the downbeats and 'a's' of every beat.",
    "sourcePdf": "Accent-Intro_4459.pdf",
    "sourcePage": 1,
    "category": "exercise",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "tomHigh",
        "step": 1,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 11,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: Accent Intro, page 1. TBR parsed notes: count row e & a 3 e & a 4 e & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "Accent Intro - Then you can move onto trickier patterns...",
    "sourcePdf": "Accent-Intro_4459.pdf",
    "sourcePage": 1,
    "category": "exercise",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "tomHigh",
        "step": 1,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 11,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: Accent Intro, page 1. TBR parsed notes: count row e & a 3 e & a 4 e & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "Accent Intro - But there is a catch...",
    "sourcePdf": "Accent-Intro_4459.pdf",
    "sourcePage": 2,
    "category": "exercise",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 1,
    "stepsPerBar": 8,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "snare",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 1,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 1,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 7,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: Accent Intro, page 2. TBR parsed notes: count row 1 & 2 & 3 & 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "How To Play 1000's Of Fills - The 'Grid",
    "sourcePdf": "How-To-Play-1000-s-Of-Fills_36fc.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 1,
    "stepsPerBar": 8,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "snare",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 1,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 7,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: How To Play 1000's Of Fills, page 1. TBR parsed notes: count row 1 & 2 & 3 & 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "How To Play 1000's Of Fills - this.",
    "sourcePdf": "How-To-Play-1000-s-Of-Fills_36fc.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 1,
    "stepsPerBar": 8,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 1,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 3,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 5,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 7,
        "velocity": 0.72,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: How To Play 1000's Of Fills, page 1. TBR parsed notes: count row 1 & 2 & 3 & 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "How To Play 1000's Of Fills - this. (2)",
    "sourcePdf": "How-To-Play-1000-s-Of-Fills_36fc.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 1,
    "stepsPerBar": 8,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 1,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 2,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 3,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 4,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 5,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 6,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 7,
        "velocity": 0.72,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: How To Play 1000's Of Fills, page 1. TBR parsed notes: count row 1 & 2 & 3 & 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "How To Play 1000's Of Fills - this. (3)",
    "sourcePdf": "How-To-Play-1000-s-Of-Fills_36fc.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 1,
    "stepsPerBar": 8,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 0,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 6,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: How To Play 1000's Of Fills, page 1. TBR parsed notes: count row 1 & 2 & 3 & 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "How To Play 1000's Of Fills - e +",
    "sourcePdf": "How-To-Play-1000-s-Of-Fills_36fc.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 1,
    "stepsPerBar": 8,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "snare",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 1,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 4,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: How To Play 1000's Of Fills, page 1. TBR parsed notes: count row 1 & 2 & 3; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "How To Play 1000's Of Fills - + a 3",
    "sourcePdf": "How-To-Play-1000-s-Of-Fills_36fc.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 1,
    "stepsPerBar": 8,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 7,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: How To Play 1000's Of Fills, page 1. TBR parsed notes: count row 2 & 3 & 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "Kick Check Patterns - e +",
    "sourcePdf": "Kick-Check-Patterns_03f5.pdf",
    "sourcePage": 1,
    "category": "exercise",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      70,
      110
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "kick",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomFloor",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 15,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 17,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 17,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 18,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 18,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 19,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 19,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomFloor",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 21,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 21,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 22,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 22,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 23,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 23,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 25,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomFloor",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 31,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: Kick Check Patterns, page 1. TBR parsed notes: count row 4 e & a 1 e & a 2 e & a 3 e & a 4 e & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "Kick Intro - this...",
    "sourcePdf": "Kick-Intro_d919.pdf",
    "sourcePage": 1,
    "category": "exercise",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "snare",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 14,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: Kick Intro, page 1. TBR parsed notes: count row 2 3 & 4 e &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "Kick Intro - Like with this crash fill...",
    "sourcePdf": "Kick-Intro_d919.pdf",
    "sourcePage": 2,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "tomFloor",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomFloor",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 11,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 14,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: Kick Intro, page 2. TBR parsed notes: count row 1 e & a 2 e & a 3 e & a 4 e &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "Kick Intro - This flam fill...",
    "sourcePdf": "Kick-Intro_d919.pdf",
    "sourcePage": 2,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "tomHigh",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: Kick Intro, page 2. TBR parsed notes: count row 4 e & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "Kick Intro - And this 32nd-note fill...",
    "sourcePdf": "Kick-Intro_d919.pdf",
    "sourcePage": 2,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 16,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 16,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: Kick Intro, page 2. TBR parsed notes: count row & a 1 2 3; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "Roll Intro - Start with soft 16th-notes...",
    "sourcePdf": "Roll-Intro_078c.pdf",
    "sourcePage": 1,
    "category": "exercise",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "tomHigh",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 11,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: Roll Intro, page 1. TBR parsed notes: count row & a 3 e & a 4 e & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "Roll Intro - Then accent different notes within that grid to create a fill...",
    "sourcePdf": "Roll-Intro_078c.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "tomHigh",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 11,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: Roll Intro, page 1. TBR parsed notes: count row 2 e & a 3 e & a 4 e & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "Roll Intro - Then you diddle the ghost-notes to add double-stroke rolls.",
    "sourcePdf": "Roll-Intro_078c.pdf",
    "sourcePage": 1,
    "category": "exercise",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 1,
    "stepsPerBar": 16,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "tomHigh",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 8,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 9,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 10,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 11,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 13,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 14,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 15,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: Roll Intro, page 1. TBR parsed notes: count row 2 e & a 3 e & a 4 e & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "Roll Intro - This gives your fills a new level of nuance and flare...",
    "sourcePdf": "Roll-Intro_078c.pdf",
    "sourcePage": 1,
    "category": "fill",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "16th",
    "bars": 2,
    "stepsPerBar": 16,
    "recommendedLoopBars": 2,
    "steps": [
      {
        "instrument": "hihatClosed",
        "step": 12,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 12,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 14,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 16,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 16,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 18,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 20,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 20,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 22,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 24,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 24,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "hihatClosed",
        "step": 26,
        "velocity": 0.72,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 26,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 27,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 28,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 29,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 30,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 31,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: Roll Intro, page 1. TBR parsed notes: count row 4 & 1 & 2 & 3 & a 4 e & a; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  },
  {
    "title": "Roll Intro - But there is a catch...",
    "sourcePdf": "Roll-Intro_078c.pdf",
    "sourcePage": 2,
    "category": "exercise",
    "style": "lesson",
    "tags": [
      "lesson"
    ],
    "difficulty": 2,
    "bpmRange": [
      60,
      140
    ],
    "meter": "4/4",
    "subdivision": "8th",
    "bars": 1,
    "stepsPerBar": 8,
    "recommendedLoopBars": 1,
    "steps": [
      {
        "instrument": "snare",
        "step": 0,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 1,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 1,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 2,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 3,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 4,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 5,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 6,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "kick",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "snare",
        "step": 7,
        "velocity": 1,
        "probability": 1
      },
      {
        "instrument": "tomHigh",
        "step": 7,
        "velocity": 1,
        "probability": 1
      }
    ],
    "notes": "Lesson import from teacher PDF: Roll Intro, page 2. TBR parsed notes: count row 1 & 2 & 3 & 4 &; notation was converted from explicit PDF count rows and notehead positions; teacher review against the original PDF is still recommended."
  }
];

export const LESSON_PATTERNS = RAW_LESSONS.map((raw, idx) => {
  const pattern = {
    ...raw,
    id: `lesson-${slug(raw.title)}-${idx + 1}`,
    tags: ['lesson', ...(raw.tags || []).filter((tag) => tag !== 'lesson')],
    beatsPerBar: raw.stepsPerBar / stepsPerBeat(raw.subdivision),
    builtin: true,
  };
  pattern.tab = raw.tab || renderTab(pattern);
  return pattern;
});
