// The Lumora mark: a small yellow nebula — a soft core with spiral arms of glowing dust that
// slowly turn around the center. Pure SVG markup (no user data), so it can be injected as-is.
// Motion lives in CSS (classes below) so it runs on the compositor and costs the host page nothing.

/** Bright pastel yellow — the Lumora light. */
export const NEBULA_DEFAULT_ACCENT = '#FFD666';

let counter = 0;

/** Deterministic pseudo-random numbers, so every render of the mark looks identical. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '').match(/^([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (!m) return [244, 193, 82];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

/** Mixes a color with white (amount 0..1) — gives the pastel tones of the nebula. */
export function tint(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export interface NebulaOptions {
  accent?: string;
  /** Fewer particles for very small renders. */
  detail?: 'low' | 'high';
}

/**
 * Classes for animation:
 *  .lu-nb-halo  soft outer glow      .lu-nb-arms  main spiral (turns slowly)
 *  .lu-nb-dust  outer dust & stars (turns slower)   .lu-nb-core  bright center (breathes)
 */
export function nebulaSvg({ accent = NEBULA_DEFAULT_ACCENT, detail = 'high' }: NebulaOptions = {}): string {
  const id = `lu-nb-${++counter}`;
  const rand = seeded(7);
  const palette = [tint(accent, 0.55), tint(accent, 0.35), tint(accent, 0.15), accent, tint('#F7A98B', 0.35)];
  const arms = 3;
  const perArm = detail === 'high' ? 16 : 10;

  // Dust clouds along logarithmic spirals.
  let clouds = '';
  for (let arm = 0; arm < arms; arm++) {
    const offset = (arm / arms) * Math.PI * 2;
    for (let i = 0; i < perArm; i++) {
      const t = i / (perArm - 1);
      const theta = offset + t * Math.PI * 1.35;
      const r = 6 + 34 * Math.pow(t, 0.9);
      const jitter = (rand() - 0.5) * 3.2;
      const x = 50 + (r + jitter) * Math.cos(theta);
      const y = 50 + (r + jitter) * Math.sin(theta);
      const size = 7.5 - 5.2 * t + rand() * 1.4;
      const opacity = (0.85 - 0.6 * t).toFixed(2);
      const color = palette[Math.min(palette.length - 1, Math.floor(t * 3.2 + rand() * 1.4))];
      clouds += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${size.toFixed(2)}" fill="${color}" opacity="${opacity}"/>`;
    }
  }

  // Thin luminous filaments that give the spiral its structure.
  let filaments = '';
  for (let arm = 0; arm < arms; arm++) {
    const offset = (arm / arms) * Math.PI * 2 + 0.12;
    const points: string[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const theta = offset + t * Math.PI * 1.25;
      const r = 5 + 31 * Math.pow(t, 0.9);
      points.push(`${(50 + r * Math.cos(theta)).toFixed(2)},${(50 + r * Math.sin(theta)).toFixed(2)}`);
    }
    filaments += `<polyline points="${points.join(' ')}" fill="none" stroke="${tint(accent, 0.6)}" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>`;
  }

  // Specks of starlight that make it read as a galaxy rather than a blob.
  let stars = '';
  const starCount = detail === 'high' ? 22 : 12;
  for (let i = 0; i < starCount; i++) {
    const theta = rand() * Math.PI * 2;
    const r = 10 + rand() * 34;
    const size = 0.45 + rand() * 0.75;
    stars += `<circle cx="${(50 + r * Math.cos(theta)).toFixed(2)}" cy="${(50 + r * Math.sin(theta)).toFixed(2)}" r="${size.toFixed(2)}" fill="#FFFDF5" opacity="${(0.45 + rand() * 0.5).toFixed(2)}"/>`;
  }

  return `<svg class="lu-nebula" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="${id}-halo">
      <stop offset="0%" stop-color="${tint(accent, 0.3)}" stop-opacity=".75"/>
      <stop offset="45%" stop-color="${accent}" stop-opacity=".28"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${id}-core">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="35%" stop-color="${tint(accent, 0.82)}"/>
      <stop offset="75%" stop-color="${tint(accent, 0.45)}" stop-opacity=".85"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <filter id="${id}-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4"/></filter>
    <filter id="${id}-softer" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.1"/></filter>
  </defs>
  <circle class="lu-nb-halo" cx="50" cy="50" r="49" fill="url(#${id}-halo)"/>
  <g class="lu-nb-arms">
    <g filter="url(#${id}-soft)">${clouds}</g>
    <g filter="url(#${id}-softer)">${filaments}</g>
  </g>
  <g class="lu-nb-dust">${stars}</g>
  <circle class="lu-nb-core" cx="50" cy="50" r="15" fill="url(#${id}-core)"/>
</svg>`;
}

/** Keyframes and classes that bring the mark to life. Shared by the widget and the dashboard. */
export const NEBULA_CSS = /* css */ `
.lu-nebula { width: 100%; height: 100%; display: block; overflow: visible; }
.lu-nebula .lu-nb-arms, .lu-nebula .lu-nb-dust, .lu-nebula .lu-nb-core, .lu-nebula .lu-nb-halo { transform-box: view-box; transform-origin: 50% 50%; }
.lu-nebula .lu-nb-arms { animation: lu-nb-spin 28s linear infinite; }
.lu-nebula .lu-nb-dust { animation: lu-nb-spin 46s linear infinite; }
.lu-nebula .lu-nb-core { animation: lu-nb-breathe 5.5s ease-in-out infinite; }
.lu-nebula .lu-nb-halo { animation: lu-nb-glow 5.5s ease-in-out infinite; }
@keyframes lu-nb-spin { to { transform: rotate(360deg); } }
@keyframes lu-nb-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }
@keyframes lu-nb-glow { 0%, 100% { opacity: .8; transform: scale(1); } 50% { opacity: 1; transform: scale(1.06); } }
@media (prefers-reduced-motion: reduce) {
  .lu-nebula .lu-nb-arms, .lu-nebula .lu-nb-dust, .lu-nebula .lu-nb-core, .lu-nebula .lu-nb-halo { animation: none; }
}
`;
