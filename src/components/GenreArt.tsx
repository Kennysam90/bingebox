import { cn } from '../lib/format';
import type { Genre } from '../lib/types';
import { Artwork } from './ui/Artwork';
import { HORROR_ARTWORK } from '../lib/genres';

export function GenreArt({ genre, className, large = false }: { genre?: Genre; className?: string; large?: boolean }) {
  if (genre?.slug === 'horror') return (
    <div aria-hidden="true" className={cn('pointer-events-none absolute overflow-hidden', className)}>
      <Artwork src={HORROR_ARTWORK} alt="" width={640} position="50% 24%" className="absolute inset-0" imgClassName="transition-transform duration-700 group-hover:scale-105" />
      <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/20 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-transparent to-transparent" />
    </div>
  );
  const posters = (genre?.posters ?? []).filter((p): p is string => !!p).slice(0, 3);
  return (
    <div aria-hidden="true" className={cn('pointer-events-none absolute overflow-hidden', className)}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_90%,rgba(255,45,70,0.13),transparent_65%)]" />
      {posters.map((src, i) => <div key={src} className={cn('absolute aspect-[2/3] overflow-hidden rounded-lg shadow-[0_15px_50px_rgba(0,0,0,0.65)] ring-1 ring-white/15 transition-transform duration-700 ease-cinematic group-hover:-translate-y-2', large ? 'w-[34%]' : 'w-[35%]')} style={{ right: `${8 + i * 23}%`, top: `${20 - i * 7}%`, transform: `rotate(${12 - i * 12}deg)`, zIndex: 3 - i }}><Artwork src={src} alt="" width={large ? 300 : 200} className="aspect-[2/3]" /></div>)}
      {!posters.length && genre?.image && <Artwork src={genre.image} alt="" width={640} className="absolute inset-0 opacity-40" />}
      <div className="absolute inset-0 z-10 bg-gradient-to-r from-ink-950 via-transparent to-transparent" />
      <div className="absolute inset-0 z-10 bg-gradient-to-t from-ink-950 via-transparent to-transparent" />
    </div>
  );
}
