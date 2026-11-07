import type { CardTitle } from './types';

export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

export function runtime(min?: number | null) {
  if (!min) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${m ? `${m}m` : ''}`.trim() : `${m}m`;
}

export function years(t: { year: number | null; endYear?: number | null; type?: string }) {
  if (!t.year) return '';
  if (t.type === 'series' && t.endYear && t.endYear !== t.year) return `${t.year}–${t.endYear}`;
  return String(t.year);
}

/** "Movie · 1h 59m" / "Series · 39 episodes" */
export function lengthLabel(t: Pick<CardTitle, 'type' | 'runtimeMin' | 'seasons' | 'episodes'>) {
  if (t.type === 'series') {
    if (t.seasons > 1) return `${t.seasons} Seasons`;
    return t.episodes ? `${t.episodes} Episodes` : 'Series';
  }
  return runtime(t.runtimeMin);
}

export function timecode(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function minutesLeft(position: number, duration: number) {
  const left = Math.max(0, Math.round((duration - position) / 60));
  if (left >= 60) return `${Math.floor(left / 60)}h ${left % 60}m left`;
  return left ? `${left}m left` : 'Almost done';
}

export function relativeTime(ts: number) {
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d > 300 ? 'numeric' : undefined });
}

export function formatDate(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso.length === 4 ? `${iso}-01-01` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

export const compact = (n: number) => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/** Stable pseudo-random hue from a string, for generated artwork. */
export function hueFor(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Only allow same-site relative paths as post-login destinations (prevents open redirects). */
export const safeNext = (next: string | null) => (next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
