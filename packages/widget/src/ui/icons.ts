// Inline SVG markup. Strings are static (no user data), so innerHTML is safe here.

let sunCounter = 0;

/** The Lumora sun: glow, rotating rays, a face that blinks and worries on errors. */
export function sunSvg(accent: string): string {
  const id = `lu-sun-${++sunCounter}`;
  const rays = Array.from({ length: 12 }, (_, i) => {
    const long = i % 2 === 0;
    return `<rect x="47.5" y="${long ? 2 : 7}" width="5" height="${long ? 16 : 11}" rx="2.5" transform="rotate(${i * 30} 50 50)" />`;
  }).join('');
  return `
<svg viewBox="0 0 100 100" aria-hidden="true">
  <defs>
    <radialGradient id="${id}-core" cx="38%" cy="32%" r="75%">
      <stop offset="0%" stop-color="#FFF3B0"/>
      <stop offset="45%" stop-color="#FFD54A"/>
      <stop offset="100%" stop-color="${accent}"/>
    </radialGradient>
    <radialGradient id="${id}-glow">
      <stop offset="0%" stop-color="${accent}" stop-opacity=".55"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${id}-ray" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFD54A"/>
      <stop offset="100%" stop-color="${accent}"/>
    </linearGradient>
  </defs>
  <circle class="lu-sun-glow" cx="50" cy="50" r="50" fill="url(#${id}-glow)"/>
  <g class="lu-sun-rays"><g class="lu-sun-rays-inner" fill="url(#${id}-ray)">${rays}</g></g>
  <g class="lu-sun-core">
    <circle cx="50" cy="50" r="27" fill="url(#${id}-core)"/>
    <circle cx="50" cy="50" r="27" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.5"/>
    <ellipse cx="38" cy="56" rx="4.5" ry="2.6" fill="#FF8A65" opacity=".45"/>
    <ellipse cx="62" cy="56" rx="4.5" ry="2.6" fill="#FF8A65" opacity=".45"/>
    <ellipse class="lu-sun-eye" cx="42" cy="47" rx="2.6" ry="3.4" fill="#5B3A00"/>
    <ellipse class="lu-sun-eye" cx="58" cy="47" rx="2.6" ry="3.4" fill="#5B3A00"/>
    <path class="lu-sun-mouth-happy" d="M42.5 56.5 Q50 63 57.5 56.5" fill="none" stroke="#5B3A00" stroke-width="2.6" stroke-linecap="round"/>
    <ellipse class="lu-sun-mouth-worried" cx="50" cy="59" rx="3.2" ry="3.6" fill="#5B3A00"/>
  </g>
</svg>`;
}

const svg = (body: string, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  camera: svg('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3.5"/>'),
  video: svg('<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3"/>'),
  pencil: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>', 18),
  back: svg('<path d="m15 18-6-6 6-6"/>', 18),
  chevron: svg('<path d="m6 9 6 6 6-6"/>', 16),
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
