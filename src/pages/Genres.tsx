import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowRight, ArrowUpRight, Film, Search, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { GenreArt } from '../components/GenreArt';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { useDocumentTitle } from '../hooks/misc';
import { api, qs } from '../lib/api';
import { cn } from '../lib/format';
import { GENRES } from '../lib/genres';
import type { Genre } from '../lib/types';

export default function Genres() {
  useDocumentTitle('Genres');
  const [params, setParams] = useSearchParams();
  const type = ['movie', 'series'].includes(params.get('type') ?? '') ? params.get('type')! : '';
  const [search, setSearch] = useState('');
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['genres'], queryFn: () => api.get<{ genres: Genre[] }>('/genres'), staleTime: 10 * 60_000 });
  const matching = GENRES.filter((g) => `${g.name} ${g.line}`.toLowerCase().includes(search.toLowerCase().trim()));
  const featured = data?.genres.find((g) => g.slug === 'animation' && g.posters?.length) ?? data?.genres.find((g) => g.posters?.length);

  return (
    <div className="pb-10 pt-[var(--nav-h)]">
      <header className="page-x relative isolate overflow-hidden border-b border-white/[0.07] py-10 sm:py-14 lg:py-16">
        <div className="absolute -left-32 -top-32 -z-10 h-96 w-96 rounded-full bg-brand-700/[0.07] blur-3xl" />
        <div className="relative z-20 max-w-2xl lg:max-w-[58%]">
          <p className="eyebrow mb-4 flex items-center gap-2"><span className="h-px w-6 bg-brand-500" /> Explore BingeBox</p>
          <h1 className="font-display text-[clamp(2.6rem,5.2vw,5rem)] font-extrabold leading-[1.04] tracking-[-0.045em]">Find your next<br /><span className="text-ink-200">obsession.</span></h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-ink-300 sm:text-base">Big adventures. Unexpected laughs. A world beyond your own. Start with a genre and see where the story takes you.</p>
          <a href="#genre-collection" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-white transition hover:text-brand-300">Explore the collection <ArrowRight size={16} /></a>
        </div>
        <GenreArt genre={featured} large className="inset-y-0 right-0 hidden w-[50%] sm:block sm:opacity-35 lg:opacity-90" />
      </header>
      <section id="genre-collection" className="page-x scroll-mt-24 pt-8 sm:pt-10" aria-labelledby="genre-heading">
        <div className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div><p className="eyebrow mb-2">Follow your mood</p><h2 id="genre-heading" className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Browse by genre</h2></div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex w-fit rounded-full border border-white/10 bg-ink-850 p-1" role="group" aria-label="Content type">
              {[['', 'All titles'], ['movie', 'Movies'], ['series', 'TV Series']].map(([value, label]) => <button key={value} aria-pressed={type === value} onClick={() => setParams(value ? { type: value } : {}, { replace: true, preventScrollReset: true })} className={cn('rounded-full px-4 py-2 text-xs font-semibold transition', type === value ? 'bg-white text-ink-950' : 'text-ink-300 hover:text-white')}>{label}</button>)}
            </div>
            <label className="flex h-11 items-center gap-2 rounded-full border border-white/10 bg-ink-850 px-4 focus-within:border-white/30">
              <Search size={16} className="text-ink-300" /><span className="sr-only">Find a genre</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a genre" className="min-w-0 flex-1 text-sm outline-none sm:w-36" />
              {search && <button onClick={() => setSearch('')} aria-label="Clear genre search"><X size={14} /></button>}
            </label>
          </div>
        </div>
        {isError ? <ErrorState message="We couldn’t load the genre collection." onRetry={() => refetch()} /> : isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-60 rounded-2xl" />)}</div>
        ) : (
          <>
            {!matching.length && <EmptyState title="No genres found" message="Try Animation, Action, Comedy or another genre." />}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {matching.map((g, i) => {
                const genre = data?.genres.find((item) => item.slug === g.slug);
                return <motion.div key={g.slug} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.2), duration: 0.4 }}>
                  <Link to={`/genre/${g.slug}${qs({ type })}`} className="group relative isolate flex h-[240px] flex-col justify-between overflow-hidden rounded-2xl border border-white/[0.09] bg-ink-900 p-6 transition duration-300 hover:-translate-y-1 hover:border-brand-500/40 hover:shadow-[0_15px_50px_-20px_rgba(255,45,70,0.2)] focus-visible:border-brand-500 sm:h-[260px]" aria-label={`Explore ${g.name}`}>
                    <GenreArt genre={genre} className="-bottom-10 -right-10 top-0 w-[88%] opacity-65 transition-opacity duration-500 group-hover:opacity-90" />
                    <div className="absolute inset-0 z-10 bg-[linear-gradient(90deg,rgba(10,10,12,0.85),rgba(10,10,12,0.1)_85%)]" />
                    <div className="relative z-20 flex items-start justify-between gap-3"><span className="max-w-[55%] text-[9px] font-semibold uppercase leading-relaxed tracking-[0.18em] text-ink-300">{g.tag}</span><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/15 bg-black/30 text-ink-200 transition group-hover:border-brand-500 group-hover:bg-brand-500 group-hover:text-white"><ArrowUpRight size={16} /></span></div>
                    <div className="relative z-20"><h3 className="max-w-[80%] font-display text-[28px] font-extrabold leading-tight tracking-tight">{g.name}</h3><p className="mt-2 text-xs text-ink-200">{g.line}</p><span className="mt-5 inline-flex items-center gap-2 text-[11px] font-semibold text-white"><Film size={13} className="text-brand-400" /> {type === 'movie' ? 'Explore movies' : type === 'series' ? 'Explore TV series' : 'Explore movies & series'} <ArrowRight size={13} className="transition group-hover:translate-x-1" /></span></div>
                  </Link>
                </motion.div>;
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
