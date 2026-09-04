// One SVG icon set for the GP player.
//
// Every production control draws from this set, so the icons look the same
// on every OS and font. No control uses a text glyph such as ▶ or ✕.

const ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';

function svg(paths, extra = '') {
  return `<svg ${ATTRS}${extra ? ` ${extra}` : ''}>${paths}</svg>`;
}

export const ICONS = {
  play: svg('<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/>'),
  pause: svg('<rect x="6" y="4.5" width="4.5" height="15" rx="1" fill="currentColor" stroke="none"/><rect x="13.5" y="4.5" width="4.5" height="15" rx="1" fill="currentColor" stroke="none"/>'),
  restart: svg('<path d="M6 5v14"/><path d="M19 5.5v13l-10-6.5z" fill="currentColor" stroke="none"/>'),
  prevBar: svg('<path d="M8 5v14"/><path d="M18 6.5v11l-8-5.5z" fill="currentColor" stroke="none"/>'),
  nextBar: svg('<path d="M16 5v14"/><path d="M6 6.5v11l8-5.5z" fill="currentColor" stroke="none"/>'),
  loop: svg('<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>'),
  metronome: svg('<path d="M9.5 3h5l3.5 17H6L9.5 3Z"/><path d="m12 20-.001-8"/><path d="m11.999 12 6.5-6.5"/>'),
  mixer: svg('<path d="M4 20v-7"/><path d="M4 9V4"/><path d="M12 20v-9"/><path d="M12 7V4"/><path d="M20 20v-5"/><path d="M20 11V4"/><circle cx="4" cy="11" r="2"/><circle cx="12" cy="9" r="2"/><circle cx="20" cy="13" r="2"/>'),
  tracks: svg('<path d="M4 6h16M4 12h16M4 18h10"/>'),
  chevronDown: svg('<path d="m6 9 6 6 6-6"/>'),
  chevronUp: svg('<path d="m18 15-6-6-6 6"/>'),
  chevronLeft: svg('<path d="m15 18-6-6 6-6"/>'),
  chevronRight: svg('<path d="m9 18 6-6-6-6"/>'),
  back: svg('<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>'),
  close: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  more: svg('<circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  follow: svg('<path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>'),
  speed: svg('<path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="M12 12 16.5 7.5"/><path d="M3.5 15A9 9 0 0 1 12 3a9 9 0 0 1 8.5 12"/>'),
  mute: svg('<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>'),
  volume: svg('<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5.5a9 9 0 0 1 0 13"/>'),
  solo: svg('<circle cx="12" cy="12" r="9"/><path d="M14.5 9.5a2.5 2.5 0 0 0-5 0c0 2.5 5 2.5 5 5a2.5 2.5 0 0 1-5 0"/>'),
  guitar: svg('<path d="m20 4-6.5 6.5"/><path d="M13 9 9.5 12.5a3.5 3.5 0 1 0 4 4L17 13"/><circle cx="8" cy="16" r="1.5"/>'),
  drums: svg('<ellipse cx="12" cy="9" rx="8" ry="3.5"/><path d="M4 9v6c0 2 3.6 3.5 8 3.5s8-1.5 8-3.5V9"/><path d="m5 4 4 3.5"/><path d="m19 4-4 3.5"/>'),
  bass: svg('<path d="m21 3-7 7"/><path d="M12.5 10.5 9 14a3.5 3.5 0 1 0 4 4l3.5-3.5"/>'),
  zoomIn: svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/>'),
  zoomOut: svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/>'),
  fitWidth: svg('<path d="M3 12h18"/><path d="m7 8-4 4 4 4"/><path d="m17 8 4 4-4 4"/>'),
  note: svg('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  help: svg('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>'),
  target: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>'),
  focus: svg('<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>'),
  countIn: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/><path d="M9 2h6"/>'),
  folder: svg('<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>'),
  split: svg('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.5 8.5 20 20"/><path d="M8.5 15.5 20 4"/>'),
  backing: svg('<path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>'),
  analysis: svg('<path d="M3 3v18h18"/><path d="m7 15 4-5 4 3 5-7"/>'),
  keyboard: svg('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/>'),
  section: svg('<path d="M4 4h10l6 4-6 4H4z"/><path d="M4 4v17"/>'),
  time: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
};

/** Return the markup for one icon name. Unknown names return an empty string. */
export function icon(name) {
  return ICONS[name] || '';
}
