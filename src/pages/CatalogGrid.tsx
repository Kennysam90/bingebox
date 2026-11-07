import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ArrowDown, SlidersHorizontal, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { PosterCard, TitleCard } from '../components/cards/Cards';
import { EmptyState, ErrorState, Skeleton, Spinner } from '../components/ui/States';
import { useInView } from '../hooks/misc';
import { useAuth } from '../hooks/useAuth';
import { api, qs } from '../lib/api';
import { cn } from '../lib/format';
import type { CardTitle, Genre, Paged } from '../lib/types';
import { GENRES } from '../lib/genres';

const SORTS = [{ value: 'popular', label: 'Most popular' }, { value: 'newest', label: 'Newest releases' }, { value: 'rating', label: 'Highest rated' }];
interface Fixed { type?: 'movie' | 'series'; genre?: string; collection?: 'nollywood' }

export function CatalogGrid({ fixed = {}, layout = 'landscape' }: { fixed?: Fixed; layout?: 'landscape' | 'poster' }) {
  const [params, setParams] = useSearchParams();
  const { profile } = useAuth();
  const requestedType = params.get('type');
  const type = fixed.type ?? (requestedType === 'movie' || requestedType === 'series' ? requestedType : undefined);
  const genre = fixed.genre ?? params.get('genre') ?? undefined;
  const year = params.get('year') ?? undefined;
  const language = fixed.collection === 'nollywood' && params.get('language') === 'yoruba' ? 'yoruba' : undefined;
  const requestedSort = params.get('sort');
  const sort = requestedSort === 'added' ? 'newest' : SORTS.some((s) => s.value === requestedSort) ? requestedSort! : 'popular';
  const set = (key: string, value?: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    next.delete('decade');
    setParams(next, { replace: true, preventScrollReset: true });
  };
  const genres = useQuery({ queryKey: ['genres'], queryFn: () => api.get<{ genres: Genre[]; years: number[] }>('/genres'), staleTime: 10 * 60_000 });
  const query = useInfiniteQuery({
    queryKey: ['titles', { type, genre, year, sort, collection: fixed.collection, language }, profile?.id ?? 'guest'],
    queryFn: ({ pageParam }) => api.get<Paged<CardTitle>>(`/titles${qs({ type, genre, year, sort, collection: fixed.collection, language, page: pageParam, pageSize: 30 })}`),
    initialPageParam: 1,
    getNextPageParam: (last) => last.hasMore ? last.nextPage ?? last.page + 1 : undefined,
  });
  const items = [...new Map((query.data?.pages.flatMap((p) => p.items) ?? []).map((t) => [t.id, t])).values()];
  const sentinel = useInView<HTMLDivElement>(() => { if (!query.isFetching) query.fetchNextPage(); }, items.length > 0 && !!query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError);
  const years = [...new Set([...(genres.data?.years ?? []), ...Array.from({ length: 70 }, (_, i) => new Date().getFullYear() - i)])].sort((a, b) => b - a);
  const hasFilters = year || (!fixed.genre && genre) || (!fixed.type && type) || sort !== 'popular';

  return (
    <div>
      <div className="page-x sticky top-[var(--nav-h)] z-30 mb-7 border-y border-white/[0.07] bg-ink-950/95 py-3 backdrop-blur-xl">
        <div className="no-scrollbar flex items-center gap-2 overflow-x-auto">
          <SlidersHorizontal size={15} className="mr-1 shrink-0 text-ink-300" />
          {!fixed.type && <Select value={type ?? ''} onChange={(v) => set('type', v)} options={[{ value: '', label: 'Movies & series' }, { value: 'movie', label: 'Movies' }, { value: 'series', label: 'TV Series' }]} label="Content type" />}
          {!fixed.genre && <Select value={genre ?? ''} onChange={(v) => set('genre', v)} options={[{ value: '', label: 'All genres' }, ...GENRES.map((g) => ({ value: g.slug, label: g.name }))]} label="Genre" />}
          <Select value={year ?? ''} onChange={(v) => set('year', v)} options={[{ value: '', label: 'All years' }, ...years.map((y) => ({ value: String(y), label: String(y) }))]} label="Release year" />
          <Select value={sort} onChange={(v) => set('sort', v === 'popular' ? undefined : v)} options={SORTS} label="Sort titles" />
          {hasFilters && <button onClick={() => setParams({}, { replace: true, preventScrollReset: true })} className="flex shrink-0 items-center gap-1 px-2 text-xs text-ink-300 transition hover:text-white"><X size={13} /> Reset</button>}
          {!!items.length && <span className="ml-auto shrink-0 pl-3 text-xs text-ink-300" aria-live="polite">{items.length.toLocaleString()} titles loaded</span>}
        </div>
      </div>
      <div className="page-x">
        {query.isError && !query.data ? <ErrorState message="We couldn’t load this selection. Please try again." onRetry={() => query.refetch()} /> : query.isLoading ? (
          <Grid layout={layout}>{Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className={layout === 'poster' ? 'aspect-[2/3]' : 'aspect-video'} />)}</Grid>
        ) : items.length === 0 ? (
          <EmptyState title={query.hasNextPage ? 'Looking through this selection' : 'Nothing matches those filters'} message={query.hasNextPage ? 'More titles are available. Keep loading to find matches for your filters.' : 'Try another genre, content type or release year.'} />
        ) : (
          <Grid layout={layout}>{items.map((t) => layout === 'poster' ? <div key={t.id}><PosterCard title={t} className="w-full" /><div className="mt-2.5 px-0.5"><p className="truncate text-[13px] font-semibold text-ink-100">{t.title}</p><p className="mt-1 flex items-center gap-2 text-[11px] text-ink-300"><span>{t.year}</span><span className="h-0.5 w-0.5 rounded-full bg-ink-400" /><span>{t.type === 'movie' ? 'Movie' : 'TV Series'}</span>{t.externalRating && <><span className="ml-auto text-[9px] font-bold text-gold">IMDb</span><span className="text-ink-200">{t.externalRating.score.toFixed(1)}</span></>}</p></div></div> : <TitleCard key={t.id} title={t} className="w-full" />)}</Grid>
        )}
        <div ref={sentinel} className="flex min-h-32 flex-col items-center justify-center gap-3 py-10">
          {query.isFetchingNextPage ? <><Spinner /><span className="text-xs text-ink-300">Finding more to watch…</span></> : query.hasNextPage ? <>
            {query.isFetchNextPageError && <p className="text-center text-sm text-ink-300">We couldn’t load the next titles. Your current selection is still here.</p>}
            <button onClick={() => query.fetchNextPage()} className="btn btn-glass btn-md"><ArrowDown size={15} /> {query.isFetchNextPageError ? 'Try loading again' : 'Load more titles'}</button>
          </> : items.length > 0 && <p className="text-xs text-ink-400">You’ve explored every available title in this selection.</p>}
        </div>
      </div>
    </div>
  );
}

function Grid({ layout, children }: { layout: 'landscape' | 'poster'; children: React.ReactNode }) {
  return <div className={cn('grid gap-x-3 gap-y-6', layout === 'poster' ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7' : 'grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6')}>{children}</div>;
}
function Select({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string }) {
  return <label className="relative shrink-0"><span className="sr-only">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className={cn('h-9 cursor-pointer appearance-none rounded-lg border bg-ink-900 pl-3 pr-9 text-xs font-medium transition-colors focus:outline-none sm:text-[13px]', value ? 'border-white/25 text-white' : 'border-white/10 text-ink-200 hover:border-white/25')}>{options.map((o) => <option key={o.value} value={o.value} className="bg-ink-900">{o.label}</option>)}</select><svg className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-ink-300" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3 4.5 6 7.5l3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></label>;
}
