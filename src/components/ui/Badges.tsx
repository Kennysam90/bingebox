import { Star } from 'lucide-react';
import { cn } from '../../lib/format';

const MATURITY_LABEL: Record<string, string> = {
  ALL: 'Suitable for all ages',
  '7+': 'Ages 7 and up',
  '13+': 'Ages 13 and up',
  '16+': 'Ages 16 and up',
  '18+': 'Adults only',
  NR: 'Not rated',
};

export function MaturityBadge({ value, className }: { value: string; className?: string }) {
  return (
    <span
      title={MATURITY_LABEL[value] ?? value}
      className={cn('inline-flex h-[1.35rem] items-center rounded-[5px] border border-white/30 px-1.5 text-[11px] font-semibold leading-none tracking-wide text-ink-100', className)}
    >
      {value}
    </span>
  );
}

/** Community rating from BingeBox members, clearly labelled as the platform's own score. */
export function RatingBadge({ rating, externalRating, className, showCount }: { rating: { score: number; count: number } | null; externalRating?: { score: number; count: number; source: 'IMDb' } | null; className?: string; showCount?: boolean }) {
  const value = rating ?? externalRating;
  if (!value) return null;
  const source = rating ? 'BingeBox' : 'IMDb';
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm font-semibold text-white', className)} title={rating ? `BingeBox member rating · ${value.count} ratings` : 'IMDb rating supplied by AnimeDoc'}>
      <span className={cn('rounded px-1 py-0.5 text-[9px] font-extrabold leading-none', rating ? 'bg-white/10 text-ink-200' : 'bg-gold text-black')}>{source}</span>
      <Star size={14} className="fill-gold text-gold" />
      {value.score.toFixed(1)}
      <span className="text-xs font-normal text-ink-300">/10{showCount && value.count > 0 ? ` · ${value.count.toLocaleString()}` : ''}</span>
    </span>
  );
}

export function ImdbLink({ id, className }: { id: string | null; className?: string }) {
  if (!id) return null;
  return (
    <a
      href={`https://www.imdb.com/title/${id}/`}
      target="_blank"
      rel="noreferrer noopener"
      className={cn('inline-flex h-[1.35rem] items-center rounded-[5px] bg-gold px-1.5 text-[11px] font-black leading-none text-black transition hover:brightness-110', className)}
      title="View ratings and reviews on IMDb"
    >
      IMDb ↗
    </a>
  );
}

export function NewBadge({ className }: { className?: string }) {
  return <span className={cn('rounded-[5px] bg-brand-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white', className)}>New</span>;
}

export function Dot() {
  return <span className="text-ink-400" aria-hidden="true">•</span>;
}
