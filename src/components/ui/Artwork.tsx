import { useState } from 'react';
import { cn, hueFor } from '../../lib/format';
import { sized, srcSet } from '../../lib/img';

interface Props {
  src?: string | null;
  alt: string;
  /** Rendered width in CSS px at the largest breakpoint (picks the right thumbnail). */
  width: number;
  sizes?: string;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
  /** Title shown on the generated fallback when there's no image. */
  fallbackTitle?: string;
  position?: string;
}

/**
 * Lazy, responsive image that fades in once decoded, with a branded
 * typographic fallback when the artwork is missing or fails to load.
 */
export function Artwork({ src, alt, width, sizes, className, imgClassName, priority, fallbackTitle, position }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const show = src && !failed;

  return (
    <div className={cn('overflow-hidden bg-ink-800', !/\b(absolute|fixed)\b/.test(className ?? '') && 'relative', className)}>
      {show ? (
        <img
          src={sized(src, width)}
          srcSet={srcSet(src)}
          sizes={sizes ?? `${width}px`}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          // @ts-expect-error fetchpriority is valid HTML but not yet in React's types
          fetchpriority={priority ? 'high' : undefined}
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          style={position ? { objectPosition: position } : undefined}
          className={cn('h-full w-full object-cover transition-opacity duration-500 ease-out', loaded ? 'opacity-100' : 'opacity-0', imgClassName)}
        />
      ) : (
        <GeneratedArt title={fallbackTitle ?? alt} />
      )}
      {show && !loaded && <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-ink-800 to-ink-750" />}
    </div>
  );
}

/** A tasteful generated poster: duotone gradient, film-strip texture and the title. */
export function GeneratedArt({ title, className }: { title: string; className?: string }) {
  const hue = hueFor(title);
  return (
    <div
      className={cn('absolute inset-0 flex items-end p-[8%]', className)}
      style={{
        background: `radial-gradient(120% 90% at 85% 10%, hsl(${hue} 70% 32% / 0.85), transparent 60%), radial-gradient(90% 80% at 0% 100%, hsl(${(hue + 320) % 360} 80% 28% / 0.9), transparent 65%), #0f0f12`,
      }}
    >
      <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #fff 0 2px, transparent 2px 14px)' }} />
      <span className="relative line-clamp-3 font-display text-[clamp(0.85rem,2.2cqw,1.6rem)] font-bold leading-tight text-white/95 text-shadow">{title}</span>
    </div>
  );
}
