import { cn } from '../../lib/format';
import type { CardTitle } from '../../lib/types';
import { Artwork, GeneratedArt } from '../ui/Artwork';
import { sized } from '../../lib/img';

type ArtTitle = Pick<CardTitle, 'title' | 'poster' | 'backdrop'>;

/**
 * 16:9 artwork for any title. Titles that only have a portrait poster get an
 * "ambient" treatment — the poster blurred as a backdrop with the crisp poster
 * inset — so every row looks intentional.
 */
export function LandscapeArt({
  title,
  width = 400,
  className,
  priority,
  showTitle = true,
  titleClassName,
}: {
  title: ArtTitle;
  width?: number;
  className?: string;
  priority?: boolean;
  showTitle?: boolean;
  titleClassName?: string;
}) {
  return (
    <div className={cn('relative aspect-video overflow-hidden bg-ink-800 [container-type:inline-size]', className)}>
      {title.backdrop ? (
        <Artwork src={title.backdrop} alt="" width={width} className="absolute inset-0" priority={priority} fallbackTitle={title.title} />
      ) : title.poster ? (
        <>
          <img
            src={sized(title.poster, 250)}
            alt=""
            aria-hidden="true"
            loading="lazy"
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full scale-125 object-cover opacity-60 blur-2xl saturate-150"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-ink-950/80 via-ink-950/30 to-transparent" />
          <Artwork
            src={title.poster}
            alt=""
            width={Math.round(width * 0.4)}
            className="absolute bottom-[8%] right-[5%] top-[8%] aspect-[2/3] rounded-md shadow-card ring-1 ring-white/10"
            priority={priority}
            fallbackTitle={title.title}
          />
        </>
      ) : (
        <GeneratedArt title={showTitle ? '' : title.title} />
      )}
      {showTitle && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-card-bottom" />
          <h3
            className={cn(
              'pointer-events-none absolute bottom-[7%] left-[6%] line-clamp-2 font-display text-[clamp(0.8rem,7.2cqw,1.6rem)] font-bold leading-[1.1] tracking-tight text-white text-shadow',
              title.backdrop ? 'right-[6%]' : 'right-[45%]',
              titleClassName
            )}
          >
            {title.title}
          </h3>
        </>
      )}
    </div>
  );
}

/** 2:3 artwork; landscape-only titles are cropped to centre with the title set on top. */
export function PortraitArt({ title, width = 240, className, priority }: { title: ArtTitle; width?: number; className?: string; priority?: boolean }) {
  return (
    <div className={cn('relative aspect-[2/3] overflow-hidden bg-ink-800 [container-type:inline-size]', className)}>
      {title.poster ? (
        <Artwork src={title.poster} alt={title.title} width={width} className="absolute inset-0" priority={priority} fallbackTitle={title.title} />
      ) : title.backdrop ? (
        <>
          <Artwork src={title.backdrop} alt="" width={Math.round(width * 1.8)} className="absolute inset-0" priority={priority} fallbackTitle={title.title} />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/40 to-transparent" />
          <h3 className="pointer-events-none absolute inset-x-[8%] bottom-[6%] line-clamp-3 font-display text-[clamp(0.8rem,10cqw,1.5rem)] font-bold leading-[1.1] text-white text-shadow">
            {title.title}
          </h3>
        </>
      ) : (
        <GeneratedArt title={title.title} />
      )}
    </div>
  );
}
