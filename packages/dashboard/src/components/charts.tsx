import { useMemo, useRef, useState } from 'react';

export interface Series {
  key: string;
  label: string;
  /** CSS custom property holding the validated series color. */
  color: string;
}

/**
 * Daily trend with one shared y-axis: 2px lines, soft area under the first series,
 * hover crosshair + tooltip, legend and end-of-line labels so identity isn't color alone.
 */
export function TrendChart<T extends { day: string } & Record<string, number | string>>({
  data,
  series,
  height = 240,
}: {
  data: T[];
  series: Series[];
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const width = 760;
  const pad = { top: 12, right: 64, bottom: 26, left: 34 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;

  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const x = (i: number) => pad.left + (data.length <= 1 ? w / 2 : (i / (data.length - 1)) * w);
  const y = (v: number) => pad.top + h - (v / top) * h;

  const paths = useMemo(
    () =>
      series.map((s) => {
        const pts = data.map((d, i) => [x(i), y(Number(d[s.key]) || 0)] as const);
        const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
        const area = `${line}L${x(data.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`;
        return { s, line, area, last: pts[pts.length - 1] };
      }),
    [data, series, top],
  );

  const labelEvery = Math.ceil(data.length / 7);

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * width;
    const i = Math.round(((px - pad.left) / w) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };

  const hovered = hover !== null ? data[hover] : null;
  const tipLeft = hover !== null ? `${(x(hover) / width) * 100}%` : '0';

  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${series.map((s) => s.label).join(' and ')} per day`}>
        <g className="grid">
          {ticks.map((t) => (
            <line key={t} x1={pad.left} x2={pad.left + w} y1={y(t)} y2={y(t)} />
          ))}
        </g>
        <g className="axis">
          {ticks.map((t) => (
            <text key={t} x={pad.left - 8} y={y(t) + 4} textAnchor="end">
              {t}
            </text>
          ))}
          {data.map((d, i) =>
            i % labelEvery === 0 || i === data.length - 1 ? (
              <text key={d.day} x={x(i)} y={height - 6} textAnchor="middle">
                {shortDate(d.day)}
              </text>
            ) : null,
          )}
        </g>
        {paths[0] && <path d={paths[0].area} fill={`var(${paths[0].s.color})`} opacity={0.1} />}
        {paths.map(({ s, line }) => (
          <path key={s.key} d={line} fill="none" stroke={`var(${s.color})`} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {/* Direct labels at the end of each line (nudged apart when they collide). */}
        {endLabels(paths.map((p) => ({ label: p.s.label, color: p.s.color, y: p.last[1], value: Number(data[data.length - 1]?.[p.s.key]) || 0 }))).map((l) => (
          <text key={l.label} x={pad.left + w + 8} y={l.y + 4} fontSize={11.5} fill="var(--text-2)">
            {l.label}
          </text>
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + h} stroke="var(--muted)" strokeDasharray="3 3" opacity={0.6} />
            {series.map((s) => (
              <circle key={s.key} cx={x(hover)} cy={y(Number(data[hover][s.key]) || 0)} r={4.5} fill={`var(${s.color})`} stroke="var(--surface)" strokeWidth={2} />
            ))}
          </g>
        )}
        <rect x={pad.left} y={pad.top} width={w} height={h} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {hovered && (
        <div className="chart-tooltip" style={{ left: tipLeft, top: 8, transform: hover! > data.length / 2 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)' }}>
          <div className="t">{longDate(hovered.day)}</div>
          {series.map((s) => (
            <div key={s.key} className="spread" style={{ gap: 16 }}>
              <span className="row" style={{ gap: 6 }}>
                <span className="swatch" style={{ width: 10, height: 3, borderRadius: 2, background: `var(${s.color})`, display: 'inline-block' }} />
                {s.label}
              </span>
              <strong className="tnum">{hovered[s.key]}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Legend({ series }: { series: Series[] }) {
  return (
    <div className="legend">
      {series.map((s) => (
        <span key={s.key} className="key">
          <span className="swatch" style={{ background: `var(${s.color})` }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/** Single-series ranking as horizontal bars with the value always printed. */
export function BarList({ items, onSelect, empty = 'No data yet' }: { items: { label: string; value: number }[]; onSelect?: (label: string) => void; empty?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="muted small">{empty}</p>;
  return (
    <div className="barlist">
      {items.map((item) => (
        <div
          key={item.label}
          className="barlist-row"
          title={`${item.label}: ${item.value}`}
          style={onSelect ? { cursor: 'pointer' } : undefined}
          onClick={onSelect ? () => onSelect(item.label) : undefined}
        >
          <span className="name">{item.label}</span>
          <span className="val">{item.value}</span>
          <span className="track">
            <span className="fill" style={{ display: 'block', width: `${(item.value / max) * 100}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

function niceStep(max: number): number {
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
}

function endLabels<T extends { y: number }>(labels: T[]): T[] {
  const sorted = [...labels].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i++) if (sorted[i].y - sorted[i - 1].y < 14) sorted[i] = { ...sorted[i], y: sorted[i - 1].y + 14 };
  return sorted;
}

function shortDate(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function longDate(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric' });
}
