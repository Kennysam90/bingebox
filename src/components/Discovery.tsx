import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Compass, Film, Flame, Play, Sparkles, Tv } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { api } from '../lib/api';
import { cn, runtime, years } from '../lib/format';
import { sized } from '../lib/img';
import type { CardTitle, Genre } from '../lib/types';
import { GENRES, HORROR_ARTWORK } from '../lib/genres';
import { RatingBadge } from './ui/Badges';

export function DiscoveryNav() {
  return (
    <div className="page-x relative z-10 mb-5">
      <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
        <nav className="no-scrollbar flex gap-2 overflow-x-auto" aria-label="Discover BingeBox">
          {[
            { to: '/', label: 'For you', icon: Sparkles },
            { to: '/movies', label: 'Movies', icon: Film },
            { to: '/series', label: 'TV Series', icon: Tv },
            { to: '/nollywood', label: 'Nollywood', icon: Film },
            { to: '/genres', label: 'Explore genres', icon: Compass },
          ].map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end className={({ isActive }) => cn('flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-xs font-semibold transition sm:px-5 sm:text-sm', isActive ? 'border-white/20 bg-white text-ink-950' : 'border-white/10 bg-ink-900/60 text-ink-200 hover:border-white/30 hover:text-white')}>
              <Icon size={15} /> {label}
            </NavLink>
          ))}
        </nav>
        <span className="hidden shrink-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-300 xl:flex"><span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> Make tonight a BingeBox night</span>
      </div>
    </div>
  );
}

const PICKS = GENRES.map((g) => g.slug);
export function GenreRail() {
  const { data } = useQuery({ queryKey: ['genres'], queryFn: () => api.get<{ genres: Genre[] }>('/genres'), staleTime: 10 * 60_000 });
  const genres = PICKS.map((slug): Genre | undefined => { const item = data?.genres.find((g) => g.slug === slug); return item ? { ...item, name: GENRES.find((g) => g.slug === slug)!.name } : undefined; }).filter((g): g is Genre => !!g);
  if (!genres.length) return null;
  return (
    <section className="my-8 border-y border-white/[0.06] bg-white/[0.015] py-8 sm:my-10 sm:py-10" aria-labelledby="discover-genres">
      <div className="page-x mb-5 flex items-end justify-between gap-4">
        <div><p className="eyebrow mb-2">Follow your mood</p><h2 id="discover-genres" className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Find your kind of escape.</h2></div>
        <Link to="/genres" className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-ink-200 transition hover:text-white sm:text-sm">All genres <ArrowRight size={16} /></Link>
      </div>
      <div className="no-scrollbar page-x flex snap-x gap-3 overflow-x-auto pb-1 lg:gap-4">
        {genres.map((g, i) => (
          <Link key={g.slug} to={`/genre/${g.slug}`} className="group relative flex aspect-[1.5] w-[44vw] shrink-0 snap-start flex-col justify-end overflow-hidden rounded-xl border border-white/10 bg-ink-800 p-4 sm:w-[29vw] lg:w-[200px]">
            {(g.image || g.slug === 'horror') && <img src={g.slug === 'horror' ? HORROR_ARTWORK : sized(g.image, 500)} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover opacity-50 transition duration-700 group-hover:scale-110 group-hover:opacity-70" style={g.slug === 'horror' ? { objectPosition: '50% 24%' } : undefined} />}
            <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/20 to-transparent" />
            <span className="absolute left-4 top-3 text-[10px] font-semibold tracking-widest text-white/60">0{i + 1}</span>
            <div className="relative flex items-end justify-between gap-2"><span className="font-display text-base font-bold leading-tight xl:text-lg">{g.name}</span><ArrowRight size={17} className="shrink-0 text-white/60 transition group-hover:translate-x-1 group-hover:text-white" /></div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function Spotlight({ title }: { title?: CardTitle }) {
  if (!title?.backdrop) return null;
  return (
    <section className="page-x my-9 sm:my-12" aria-label="Tonight’s spotlight">
      <div className="group relative isolate overflow-hidden rounded-2xl border border-white/10 bg-ink-850 sm:rounded-3xl">
        <img src={sized(title.backdrop, 1280)} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 -z-20 h-full w-full object-cover object-[center_25%] transition duration-1000 group-hover:scale-105" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(10,10,12,0.98),rgba(10,10,12,0.88)_38%,rgba(10,10,12,0.15))]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink-950/70 to-transparent" />
        <div className="max-w-xl px-6 py-9 sm:px-10 sm:py-14 lg:px-12 lg:py-16">
          <p className="eyebrow mb-4 flex items-center gap-2"><Flame size={14} /> Tonight’s spotlight</p>
          <h2 className="text-balance font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{title.title}</h2>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-ink-200"><RatingBadge rating={title.rating} externalRating={title.externalRating} /><span>{years(title)}</span><span>{runtime(title.runtimeMin)}</span></div>
          <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-ink-200">{title.synopsis || title.genres.join(' · ')}</p>
          <div className="mt-6 flex flex-wrap gap-3"><Link to={`/watch/${title.slug}`} className="btn btn-primary btn-md"><Play size={16} className="fill-current" /> Watch Now</Link><Link to={`/title/${title.slug}`} className="btn btn-glass btn-md">Discover the film <ArrowRight size={15} /></Link></div>
        </div>
      </div>
    </section>
  );
}
