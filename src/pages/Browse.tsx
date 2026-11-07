import { useQuery } from '@tanstack/react-query';
import { Hero, HeroSkeleton } from '../components/Hero';
import { Row } from '../components/Row';
import { ErrorState, RowSkeleton } from '../components/ui/States';
import { useDocumentTitle } from '../hooks/misc';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import type { CardTitle, Row as RowT } from '../lib/types';
import { CatalogGrid } from './CatalogGrid';
import { DiscoveryNav } from '../components/Discovery';

/** /movies and /series: a spotlight, genre rows, then the full filterable catalog. */
export default function Browse({ type }: { type: 'movie' | 'series' }) {
  const { profile } = useAuth();
  useDocumentTitle(type === 'movie' ? 'Movies' : 'TV Series');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['browse', type, profile?.id ?? 'guest'],
    queryFn: () => api.get<{ hero: CardTitle[]; rows: RowT[] }>(`/browse/${type}`),
  });

  if (isError) return <div className="pt-24"><ErrorState onRetry={() => refetch()} /></div>;

  return (
    <>
      {isLoading || !data ? <HeroSkeleton /> : <Hero items={data.hero} eyebrow={type === 'movie' ? 'Movies on BingeBox' : 'Series on BingeBox'} />}
      <div className="relative z-10 -mt-[3vh] space-y-1 sm:space-y-2">
        {data && <DiscoveryNav />}
        {isLoading || !data ? (
          <>
            <RowSkeleton />
            <RowSkeleton />
          </>
        ) : (
          data.rows.map((row, i) => <Row key={row.id} row={row} index={i} />)
        )}
      </div>
      <section className="mt-10">
        <div className="page-x mb-5">
          <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{type === 'movie' ? 'All Movies' : 'All Series'}</h2>
          <p className="mt-1 text-sm text-ink-300">Explore the full selection by genre, release year or rating. Keep scrolling to discover more.</p>
        </div>
        <CatalogGrid fixed={{ type }} />
      </section>
    </>
  );
}
