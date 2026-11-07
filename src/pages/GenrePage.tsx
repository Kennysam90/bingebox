import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Clapperboard } from 'lucide-react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { GenreArt } from '../components/GenreArt';
import { useDocumentTitle } from '../hooks/misc';
import { api, qs } from '../lib/api';
import { cn } from '../lib/format';
import { GENRES, genreInfo } from '../lib/genres';
import type { Genre } from '../lib/types';
import { CatalogGrid } from './CatalogGrid';

export default function GenrePage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const { data } = useQuery({ queryKey: ['genres'], queryFn: () => api.get<{ genres: Genre[] }>('/genres'), staleTime: 10 * 60_000 });
  const genre = data?.genres.find((g) => g.slug === slug);
  const info = genreInfo(slug);
  const title = info?.name ?? genre?.name ?? slug.replace(/-/g, ' ');
  useDocumentTitle(title);
  if (slug === 'yoruba' || slug === 'nollywood') return <Navigate to={`/nollywood${qs({ type: params.get('type'), language: slug === 'yoruba' ? 'yoruba' : undefined })}`} replace />;
  return (
    <div>
      <header className="page-x relative isolate overflow-hidden pb-8 pt-[calc(var(--nav-h)+2rem)] sm:pb-10 sm:pt-[calc(var(--nav-h)+3rem)]">
        <GenreArt genre={genre} large className="inset-y-0 right-0 w-[60%] opacity-25 sm:w-[48%] sm:opacity-65" />
        <div className="relative z-20 max-w-2xl">
          <Link to={`/genres${qs({ type: params.get('type') })}`} className="mb-8 inline-flex items-center gap-2 text-xs font-medium text-ink-300 transition hover:text-white"><ArrowLeft size={14} /> All genres</Link>
          <p className="eyebrow mb-3 flex items-center gap-2"><Clapperboard size={14} /> {info?.tag ?? 'Discover more stories'}</p>
          <h1 className="font-display text-[clamp(2.6rem,6vw,5.5rem)] font-extrabold leading-[1.08] tracking-[-0.045em]">{title}</h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-200 sm:text-base">{info?.detail ?? `Explore ${title.toLowerCase()} movies and TV series. Find something worth watching.`}</p>
        </div>
      </header>
      <nav className="no-scrollbar page-x mb-6 flex gap-2 overflow-x-auto" aria-label="Choose a genre">
        {GENRES.map((g) => <Link key={g.slug} to={`/genre/${g.slug}${qs({ type: params.get('type') })}`} aria-current={g.slug === slug ? 'page' : undefined} className={cn('shrink-0 rounded-full border px-4 py-2 text-xs font-medium transition', g.slug === slug ? 'border-brand-500 bg-brand-500 text-white' : 'border-white/10 bg-ink-900 text-ink-200 hover:border-white/30 hover:text-white')}>{g.name}</Link>)}
      </nav>
      <CatalogGrid fixed={{ genre: slug }} layout="poster" />
    </div>
  );
}
