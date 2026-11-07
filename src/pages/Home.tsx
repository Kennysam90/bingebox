import { useQuery } from '@tanstack/react-query';
import { Hero, HeroSkeleton } from '../components/Hero';
import { DiscoveryNav, GenreRail, Spotlight } from '../components/Discovery';
import { Fragment } from 'react';
import { Row } from '../components/Row';
import { ErrorState, RowSkeleton } from '../components/ui/States';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import type { CardTitle, Row as RowT } from '../lib/types';

export default function Home() {
  const { profile } = useAuth();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['home', profile?.id ?? 'guest'],
    queryFn: () => api.get<{ hero: CardTitle[]; rows: RowT[] }>('/home'),
  });

  if (isError) return <div className="pt-24"><ErrorState message="We couldn’t load your home page. Please try again." onRetry={() => refetch()} /></div>;
  const heroIds = new Set(data?.hero.map((t) => t.id));
  const spotlight = (data?.rows.find((r) => r.id === 'top-rated')?.items as CardTitle[] | undefined)?.find((t) => t.type === 'movie' && t.backdrop && !heroIds.has(t.id));

  return (
    <>
      {isLoading || !data ? <HeroSkeleton /> : <Hero items={data.hero} />}
      <div className="relative z-10 -mt-[3vh] space-y-1 sm:space-y-2">
        {data && <DiscoveryNav />}
        {isLoading || !data ? (
          <>
            <RowSkeleton />
            <RowSkeleton poster />
            <RowSkeleton />
          </>
        ) : (
          data.rows.map((row, i) => <Fragment key={row.id}><Row row={row} index={i} />{i === 2 && <GenreRail />}{i === 5 && <Spotlight title={spotlight} />}</Fragment>)
        )}
      </div>
    </>
  );
}
