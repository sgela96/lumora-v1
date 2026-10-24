// Inline SVG markup. Strings are static (no user data), so innerHTML is safe here.

/** Four-point star used in the thank-you sparkle. */
export const sparkSvg = '<svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M10 0c.6 5.2 4.8 9.4 10 10-5.2.6-9.4 4.8-10 10-.6-5.2-4.8-9.4-10-10C5.2 9.4 9.4 5.2 10 0Z"/></svg>';

const svg = (body: string, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  camera: svg('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3.5"/>'),
  video: svg('<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3"/>'),
  pencil: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>', 18),
  back: svg('<path d="m15 18-6-6 6-6"/>', 18),
  chevron: svg('<path d="m6 9 6 6 6-6"/>', 16),
  chevronRight: svg('<path d="m9 6 6 6-6 6"/>', 16),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>', 16),
  check: svg('<path d="M20 6 9 17l-5-5"/>', 16),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>', 14),
  trash: svg('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>', 14),
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>', 14),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 18),
  square: svg('<rect x="4" y="4" width="16" height="16" rx="2"/>', 16),
  eyeOff: svg('<path d="M9.9 4.2A10 10 0 0 1 12 4c7 0 10 8 10 8a17 17 0 0 1-2.2 3.4M6.6 6.6A17 17 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.4-1.6M2 2l20 20"/>', 16),
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>', 16),
  mic: svg('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4"/>', 14),
};
