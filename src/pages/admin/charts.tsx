import { useMemo, useRef, useState } from 'react';

/**
 * Lightweight SVG charts for the admin dashboard. Colors are validated for the
 * dark chart surface (#141418): plays = brand red, views = blue. Text always
 * uses ink tokens, never the series color.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const SERIES = { plays: '#ff2d46', views: '#3987e5', single: '#ff2d46' };

interface Point {
  day: string;
  [k: string]: number | string;
}

export function LineChart({ data, series, height = 240 }: { data: Point[]; series: { key: string; label: string; color: string }[]; height?: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = height;
  const pad = { l: 36, r: 64, t: 12, b: 26 };
  const max = Math.max(4, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
  const niceMax = niceCeil(max);
  const x = (i: number) => pad.l + (i / Math.max(1, data.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / niceMax) * (H - pad.t - pad.b);
  const ticks = [0, niceMax / 2, niceMax];
  const paths = useMemo(
    () => series.map((s) => data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(Number(d[s.key]) || 0).toFixed(1)}`).join(' ')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, series, niceMax]
  );

  const onMove = (e: React.PointerEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (data.length - 1));
    setHover(Math.min(data.length - 1, Math.max(0, i)));
  };

  const last = data.length - 1;
  return (
    <div ref={wrap} className="relative" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Daily ${series.map((s) => s.label).join(' and ')} over the last ${data.length} days`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.06)" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="fill-ink-400 text-[11px]">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {[0, Math.floor(last / 2), last].map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'} className="fill-ink-400 text-[11px]">
            {shortDay(String(data[i]?.day ?? ''))}
          </text>
        ))}
        {series.map((s, si) => (
          <path key={s.key} d={paths[si]} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {/* Direct end labels (text in ink, marker carries the color), nudged apart so they never collide */}
        {endLabels(series.map((s) => ({ key: s.key, label: s.label, color: s.color, y: y(Number(data[last]?.[s.key]) || 0) }))).map((l) => (
          <g key={l.key}>
            <circle cx={x(last)} cy={l.y} r={4} fill={l.color} stroke="#141418" strokeWidth={2} />
            <text x={x(last) + 9} y={l.labelY + 4} className="fill-ink-200 text-[11px] font-medium">
              {l.label}
            </text>
          </g>
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="rgba(255,255,255,0.25)" strokeDasharray="3 3" />
            {series.map((s) => (
              <circle key={s.key} cx={x(hover)} cy={y(Number(data[hover][s.key]) || 0)} r={4.5} fill={s.color} stroke="#141418" strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-[140px] rounded-xl border border-white/10 bg-ink-900/95 px-3 py-2 text-xs shadow-pop backdrop-blur"
          style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover > data.length / 2 ? 'calc(-100% - 12px)' : '12px'})` }}
        >
          <p className="mb-1 font-semibold text-white">{longDay(String(data[hover].day))}</p>
          {series.map((s) => (
            <p key={s.key} className="flex items-center justify-between gap-4 text-ink-200">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="font-semibold tabular-nums text-white">{Number(data[hover][s.key]) || 0}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function Legend({ series }: { series: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-ink-200">
      {series.map((s) => (
        <span key={s.label} className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/** Horizontal bars, sorted by value, single series. */
export function BarList({ data, color = SERIES.single, max: maxRows = 10 }: { data: { label: string; value: number }[]; color?: string; max?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const rows = [...data].sort((a, b) => b.value - a.value).slice(0, maxRows);
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5" role="list">
      {rows.map((r, i) => (
        <li key={r.label} className="group grid grid-cols-[110px_1fr_44px] items-center gap-3 text-sm" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
          <span className="truncate text-ink-200">{r.label}</span>
          <span className="relative h-2.5 rounded-r-[4px] bg-white/[0.04]">
            <span className="absolute inset-y-0 left-0 rounded-r-[4px] transition-opacity" style={{ width: `${(r.value / max) * 100}%`, background: color, opacity: hover === null || hover === i ? 1 : 0.45 }} />
          </span>
          <span className="text-right tabular-nums text-ink-100">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

function niceCeil(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
const shortDay = (iso: string) => (iso ? new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '');
const longDay = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric', timeZone: 'UTC' });

function endLabels<T extends { y: number }>(items: T[], gap = 14) {
  const sorted = [...items].sort((a, b) => a.y - b.y).map((i) => ({ ...i, labelY: i.y }));
  for (let i = 1; i < sorted.length; i++) if (sorted[i].labelY - sorted[i - 1].labelY < gap) sorted[i].labelY = sorted[i - 1].labelY + gap;
  return sorted;
}
