import { useQuery } from '@tanstack/react-query';
import { Search as SearchIcon, X } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { TitleCard } from '../components/cards/Cards';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { useDebounced, useDocumentTitle } from '../hooks/misc';
import { api, qs } from '../lib/api';
import type { CardTitle, Genre } from '../lib/types';

interface SearchResult {
  query: string;
  items: CardTitle[];
  total: number;
  filters: { genre: { slug: string; name: string } | null; year: number | null; decade: number | null; text: string };
}

const SUGGESTIONS = ['Top Gun', 'Dune', 'comedy 2024', 'sci-fi', 'thriller', '2025', 'animation', 'classics 1920s'];

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get('q') ?? '';
  const type = params.get('type') ?? '';
  const debounced = useDebounced(q.trim(), 220);
  useDocumentTitle(q ? `Search: ${q}` : 'Search');

  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ['search', debounced, type],
    queryFn: () => api.get<SearchResult>(`/search${qs({ q: debounced, type })}`),
    enabled: debounced.length > 0,
    placeholderData: (prev) => prev,
  });
  const genres = useQuery({ queryKey: ['genres'], queryFn: () => api.get<{ genres: Genre[] }>('/genres'), staleTime: 10 * 60_000 });

  const f = data?.filters;
  const chips = [f?.genre?.name, f?.decade ? `${f.decade}s` : null, f?.year ? String(f.year) : null, f?.text ? `“${f.text}”` : null].filter(Boolean) as string[];

  return (
    <div className="page-x min-h-[70vh] pb-10 pt-[calc(var(--nav-h)+2rem)]">
      {/* Mobile search field (the navbar field is compact on phones) */}
      <div className="mb-6 flex h-12 items-center gap-3 rounded-2xl border border-white/10 bg-ink-850 px-4 focus-within:border-white/30 md:hidden">
        <SearchIcon size={18} className="text-ink-300" />
        <input
          value={q}
          onChange={(e) => { const next = new URLSearchParams(params); next.set('q', e.target.value); setParams(next, { replace: true }); }}
          placeholder="Search titles, people, genres, years"
          className="h-full flex-1 text-[15px] focus:outline-none"
          aria-label="Search"
        />
        {q && (
          <button onClick={() => navigate('/search', { replace: true })} aria-label="Clear">
            <X size={16} className="text-ink-300" />
          </button>
        )}
      </div>
      <div className="mb-7 flex gap-2" role="group" aria-label="Search type">
        {[['', 'All titles'], ['movie', 'Movies'], ['series', 'TV Series']].map(([value, label]) => <button key={value} aria-pressed={type === value} onClick={() => { const next = new URLSearchParams(params); if (value) next.set('type', value); else next.delete('type'); setParams(next, { replace: true }); }} className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${type === value ? 'border-white bg-white text-ink-950' : 'border-white/10 text-ink-200 hover:border-white/30'}`}>{label}</button>)}
      </div>

      {!q.trim() ? (
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Search BingeBox</h1>
          <p className="mt-2 text-ink-300">Find films and series by title, cast and crew, genre or year — or mix them, like “comedy 1920s”.</p>
          <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-widest text-ink-300">Try</h2>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => navigate(`/search?q=${encodeURIComponent(s)}`)} className="chip px-4 py-2 text-sm transition hover:border-white/30 hover:text-white">
                {s}
              </button>
            ))}
          </div>
          <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-widest text-ink-300">Genres</h2>
          <div className="flex flex-wrap gap-2">
            {(genres.data?.genres ?? []).filter((g) => g.count).map((g) => (
              <Link key={g.slug} to={`/genre/${g.slug}`} className="chip px-4 py-2 text-sm transition hover:border-brand-500/60 hover:text-white">
                {g.name}
              </Link>
            ))}
          </div>
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <div>
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <h1 className="mr-2 text-lg text-ink-200">
              {data ? (
                <>
                  <span className="font-semibold text-white">{data.total}</span> result{data.total === 1 ? '' : 's'} for
                </>
              ) : (
                'Searching'
              )}
            </h1>
            {chips.map((c) => (
              <span key={c} className="chip border-brand-500/40 bg-brand-500/10 text-brand-100">
                {c}
              </span>
            ))}
            {isFetching && <span className="ml-1 h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />}
          </div>
          {!data ? (
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="aspect-video" />
              ))}
            </div>
          ) : data.items.length === 0 ? (
            <EmptyState
              icon={<SearchIcon size={26} />}
              title={`No matches for “${q}”`}
              message="Check the spelling, try a person’s name, a genre like “western”, or a year like 1925."
            />
          ) : (
            <div className="grid grid-cols-1 gap-x-3 gap-y-5 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {data.items.map((t) => (
                <TitleCard key={t.id} title={t} className="w-full" />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
