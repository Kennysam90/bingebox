import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Info, Pause, Play, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMyList } from '../hooks/useMyList';
import { cn, lengthLabel, years } from '../lib/format';
import { sized, srcSet } from '../lib/img';
import type { CardTitle } from '../lib/types';
import { MaturityBadge, RatingBadge } from './ui/Badges';
import { Skeleton } from './ui/States';

const ROTATE_MS = 9000;

export function Hero({ items, eyebrow }: { items: CardTitle[]; eyebrow?: string }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [manualPause, setManualPause] = useState(false);
  const reducedMotion = useReducedMotion();
  const navigate = useNavigate();
  const list = useMyList();
  const activeIndex = index % Math.max(1, items.length);
  const current = items[activeIndex];

  useEffect(() => {
    if (paused || manualPause || reducedMotion || items.length < 2) return;
    const t = window.setTimeout(() => setIndex((i) => (i + 1) % items.length), ROTATE_MS);
    return () => window.clearTimeout(t);
  }, [index, paused, manualPause, reducedMotion, items.length]);

  // Warm the cache for the next slide so the crossfade never shows a blank frame.
  useEffect(() => {
    const next = items[(index + 1) % items.length];
    if (next?.backdrop) {
      const img = new Image();
      img.src = sized(next.backdrop, 1280) ?? next.backdrop;
    }
  }, [index, items]);

  if (!current) return <section className="page-x flex min-h-[50vh] flex-col items-start justify-center pt-[var(--nav-h)]"><p className="eyebrow mb-3">AnimeDoc catalog</p><h1 className="font-display text-3xl font-bold">No featured titles available</h1><p className="mt-3 text-sm text-ink-300">Explore the catalog to find something to watch.</p><Link to="/movies" className="btn btn-primary btn-md mt-5">Browse movies</Link></section>;
  const inList = list.has(current.id);

  return (
    <section
      className="relative h-[78vh] min-h-[520px] w-full overflow-hidden sm:h-[86vh] sm:min-h-[600px] lg:max-h-[940px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false); }}
      aria-roledescription="carousel"
      aria-label="Featured titles"
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={current.id}
          className="grain absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <img
            src={sized(current.backdrop ?? current.poster, 1280)}
            srcSet={srcSet(current.backdrop ?? current.poster, [960, 1280, 1920])}
            sizes="100vw"
            alt=""
            referrerPolicy="no-referrer"
            // @ts-expect-error fetchpriority is valid HTML but not yet in React's types
            fetchpriority={index === 0 ? 'high' : undefined}
            className="absolute inset-0 h-full w-full animate-kenburns object-cover object-[center_25%]"
          />
          <div className="absolute inset-0 bg-hero-left" />
          <div className="absolute inset-0 bg-hero-bottom" />
          <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-ink-950/80 to-transparent" />
        </motion.div>
      </AnimatePresence>

      <div className="page-x relative z-10 flex h-full flex-col justify-end pb-[18vh] sm:pb-[20vh] lg:pb-[22vh]">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-[min(680px,92vw)]"
          >
            <p className="eyebrow mb-3 flex items-center gap-2">
              <span className="h-px w-6 bg-brand-500" />
              {eyebrow ?? (current.type === 'series' ? 'Featured Series' : 'Featured Film')}
            </p>
            <h1 className="text-balance font-display text-[clamp(2.4rem,7vw,5.4rem)] font-extrabold leading-[0.95] tracking-[-0.035em] text-white text-shadow">
              {current.title}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-medium text-ink-100 sm:text-[15px]">
              <RatingBadge rating={current.rating} externalRating={current.externalRating} />
              <span>{years(current)}</span>
              <MaturityBadge value={current.maturity} />
              <span>{lengthLabel(current)}</span>
              {current.genres.slice(0, 3).map((g) => (
                <span key={g} className="hidden items-center gap-3 sm:flex">
                  <span className="h-1 w-1 rounded-full bg-ink-400" />
                  {g}
                </span>
              ))}
            </div>
            <p className="mt-4 line-clamp-3 max-w-xl text-[15px] leading-relaxed text-ink-100/90 text-shadow sm:text-base">{current.tagline ? `${current.tagline} ${current.synopsis}` : current.synopsis}</p>
            <p className="mt-3 text-xs font-medium text-ink-200 sm:hidden">{current.genres.slice(0, 3).join(' · ')}</p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button onClick={() => navigate(`/watch/${current.slug}`)} className="btn btn-primary h-12 px-5 text-sm sm:h-[52px] sm:px-8 sm:text-base">
                <Play size={20} className="fill-current" /> Watch Now
              </button>
              <Link to={`/title/${current.slug}`} className="btn btn-glass h-12 px-5 text-sm sm:h-[52px] sm:px-8 sm:text-base">
                <Info size={20} /> More Info
              </Link>
              <button onClick={() => list.toggle(current)} className="btn-icon h-11 w-11 sm:h-[52px] sm:w-[52px]" aria-label={inList ? 'Remove from My List' : 'Add to My List'} title={inList ? 'In My List' : 'Add to My List'}>
                {inList ? <Check size={22} /> : <Plus size={22} />}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {items.length > 1 && (
        <div className="page-x absolute inset-x-0 bottom-[7vh] z-10 flex items-end justify-between gap-2.5 sm:bottom-[8vh]">
          <div className="flex items-center gap-3 pb-1">
            <span className="font-display text-sm font-semibold tabular-nums">{String(activeIndex + 1).padStart(2, '0')} <span className="mx-1 text-ink-400">/</span> <span className="text-ink-300">{String(items.length).padStart(2, '0')}</span></span>
            <button onClick={() => setManualPause((p) => !p)} className="grid h-8 w-8 place-items-center rounded-full border border-white/20 bg-black/20 text-white transition hover:bg-white/15" aria-label={manualPause ? 'Play featured carousel' : 'Pause featured carousel'} aria-pressed={manualPause}>
              {manualPause ? <Play size={12} /> : <Pause size={12} />}
            </button>
          </div>
          {/* Mobile: progress dots */}
          <div className="flex gap-1.5 md:hidden">
            {items.map((t, i) => (
              <button key={t.id} onClick={() => setIndex(i)} className={cn('h-1.5 rounded-full transition-all', i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/35')} aria-label={`Show ${t.title}`} />
            ))}
          </div>
          {/* Desktop: thumbnail selector with a progress bar on the active slide */}
          <div className="hidden gap-2.5 md:flex">
            {items.map((t, i) => (
              <button
                key={t.id}
                onClick={() => setIndex(i)}
                className={cn(
                  'group relative h-[58px] w-[104px] overflow-hidden rounded-lg ring-1 transition-all duration-300 lg:h-[68px] lg:w-[120px]',
                  i === index ? 'ring-white/80' : 'opacity-55 ring-white/10 hover:opacity-90'
                )}
                aria-label={`Show ${t.title}`}
                aria-current={i === index}
              >
                <img src={sized(t.backdrop, 250)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" loading="lazy" />
                {i === index && (
                  <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25">
                    <span
                      key={`${index}-${paused}`}
                      className="block h-full origin-left bg-brand-500"
                      style={{ animation: `progress ${ROTATE_MS}ms linear both`, animationPlayState: paused || manualPause || reducedMotion ? 'paused' : 'running' }}
                    />
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export function HeroSkeleton() {
  return (
    <div className="relative h-[78vh] min-h-[520px] w-full overflow-hidden bg-ink-900 sm:h-[86vh]">
      <div className="page-x absolute inset-x-0 bottom-[20vh] space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-16 w-[min(520px,80vw)]" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-16 w-[min(560px,85vw)]" />
        <div className="flex gap-3 pt-3">
          <Skeleton className="h-12 w-40 rounded-full" />
          <Skeleton className="h-12 w-36 rounded-full" />
        </div>
      </div>
    </div>
  );
}
