import { Play, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCanHover } from '../../hooks/misc';
import { cn, minutesLeft } from '../../lib/format';
import type { CardTitle, ContinueItem } from '../../lib/types';
import { NewBadge } from '../ui/Badges';
import { useHoverPreview } from './HoverPreview';
import { LandscapeArt, PortraitArt } from './TitleArt';

/** Card widths per breakpoint, tuned so rows show a partial "peek" of the next card. */
export const CARD_W = {
  landscape: 'w-[68vw] sm:w-[44vw] md:w-[30vw] lg:w-[23vw] xl:w-[18.6vw] 2xl:w-[15.6vw]',
  poster: 'w-[38vw] sm:w-[27vw] md:w-[21vw] lg:w-[16vw] xl:w-[13.2vw] 2xl:w-[11.2vw]',
  top10: 'w-[56vw] sm:w-[38vw] md:w-[29vw] lg:w-[23vw] xl:w-[19vw] 2xl:w-[16vw]',
};

function useHoverHandlers(title: CardTitle) {
  const hover = useHoverPreview();
  const canHover = useCanHover();
  if (!hover || !canHover) return {};
  return {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => hover.open(title, e.currentTarget),
    onMouseLeave: () => hover.cancel(),
  };
}

export function TitleCard({ title, className, priority }: { title: CardTitle; className?: string; priority?: boolean }) {
  const handlers = useHoverHandlers(title);
  return (
    <Link
      to={`/title/${title.slug}`}
      {...handlers}
      className={cn('group relative block shrink-0 snap-start overflow-hidden rounded-xl ring-1 ring-white/[0.06] transition duration-300 ease-cinematic hover:ring-white/20 focus-visible:ring-2 focus-visible:ring-brand-500', className)}
      aria-label={title.title}
    >
      <LandscapeArt title={title} width={420} priority={priority} className="transition-transform duration-500 ease-cinematic group-hover:scale-[1.04]" />
      {title.isNew && <NewBadge className="absolute left-2.5 top-2.5" />}
      {title.type === 'series' && (
        <span className="absolute right-2.5 top-2.5 rounded-[5px] bg-black/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur">Series</span>
      )}
    </Link>
  );
}

export function PosterCard({ title, className, priority }: { title: CardTitle; className?: string; priority?: boolean }) {
  const handlers = useHoverHandlers(title);
  return (
    <Link
      to={`/title/${title.slug}`}
      {...handlers}
      className={cn('group relative block shrink-0 snap-start overflow-hidden rounded-xl ring-1 ring-white/[0.06] transition duration-300 ease-cinematic hover:-translate-y-1 hover:ring-white/20 hover:shadow-card', className)}
      aria-label={title.title}
    >
      <PortraitArt title={title} width={260} priority={priority} className="transition-transform duration-500 ease-cinematic group-hover:scale-[1.05]" />
      {title.isNew && <NewBadge className="absolute left-2 top-2" />}
    </Link>
  );
}

/** Ranked card with an oversized outlined numeral. */
export function Top10Card({ title, rank, className }: { title: CardTitle; rank: number; className?: string }) {
  const handlers = useHoverHandlers(title);
  return (
    <Link to={`/title/${title.slug}`} {...handlers} className={cn('group relative flex shrink-0 snap-start items-end', className)} aria-label={`Number ${rank}: ${title.title}`}>
      <span
        aria-hidden="true"
        className="relative z-0 -mr-[8%] select-none font-display text-[clamp(6rem,15vw,11.5rem)] font-extrabold leading-[0.78] tracking-[-0.08em] text-ink-950 transition-colors duration-300 group-hover:text-brand-500/20"
        style={{ WebkitTextStroke: '3px rgba(255,255,255,0.55)' }}
      >
        {rank}
      </span>
      <div className="relative z-10 w-[58%] overflow-hidden rounded-xl ring-1 ring-white/10 transition duration-300 ease-cinematic group-hover:-translate-y-1 group-hover:ring-white/30">
        <PortraitArt title={title} width={240} />
      </div>
    </Link>
  );
}

export function ContinueCard({ item, onRemove, className }: { item: ContinueItem; onRemove?: (item: ContinueItem) => void; className?: string }) {
  const href = `/watch/${item.slug}${item.episode ? `?episode=${item.episode.id}` : ''}`;
  return (
    <div className={cn('group relative shrink-0 snap-start', className)}>
      <Link to={href} className="block overflow-hidden rounded-xl ring-1 ring-white/[0.06] transition hover:ring-white/25" aria-label={`Resume ${item.title}`}>
        <div className="relative">
          <LandscapeArt title={item} width={420} className="transition-transform duration-500 ease-cinematic group-hover:scale-[1.04]" />
          <div className="absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/35">
            <span className="grid h-12 w-12 scale-90 place-items-center rounded-full border-2 border-white/80 bg-black/40 opacity-0 backdrop-blur transition duration-300 group-hover:scale-100 group-hover:opacity-100">
              <Play size={20} className="ml-0.5 fill-white" />
            </span>
          </div>
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
            <div className="h-full bg-brand-500" style={{ width: `${Math.max(3, item.progress.fraction * 100)}%` }} />
          </div>
        </div>
      </Link>
      <div className="mt-2 flex items-start justify-between gap-2 px-0.5">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-white">
            {item.episode ? (item.upNext ? `Up next · ${item.episode.label}` : item.episode.label) : item.title}
          </p>
          <p className="truncate text-xs text-ink-300">{item.episode ? item.episode.name : minutesLeft(item.progress.position, item.progress.duration)}</p>
        </div>
        {onRemove && (
          <button
            onClick={() => onRemove(item)}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-300 opacity-100 transition hover:bg-white/10 hover:text-white md:opacity-0 md:group-hover:opacity-100"
            aria-label={`Remove ${item.title} from Continue Watching`}
            title="Remove from row"
          >
            <X size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
