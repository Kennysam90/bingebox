import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { PosterCard } from '../components/cards/Cards';
import { Artwork } from '../components/ui/Artwork';
import { ErrorState, FullPageLoader } from '../components/ui/States';
import { useDocumentTitle } from '../hooks/misc';
import { api } from '../lib/api';
import type { CardTitle } from '../lib/types';

export default function PersonPage() {
  const { id } = useParams();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['person', id],
    queryFn: () => api.get<{ person: { id: number; name: string; photo: string | null; wikidataId: string | null }; titles: CardTitle[] }>(`/people/${id}`),
  });
  useDocumentTitle(data?.person.name);
  if (isLoading) return <FullPageLoader />;
  if (isError || !data) return <div className="pt-28"><ErrorState onRetry={() => refetch()} /></div>;
  const { person, titles } = data;
  const sorted = [...titles].sort((a, b) => (a.year ?? 0) - (b.year ?? 0));

  return (
    <div className="page-x pb-10 pt-[calc(var(--nav-h)+3rem)]">
      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-end">
        <div className="h-36 w-36 overflow-hidden rounded-full bg-ink-800 ring-2 ring-white/10 sm:h-44 sm:w-44">
          {person.photo ? (
            <Artwork src={person.photo} alt={person.name} width={330} className="h-full w-full" imgClassName="object-[center_20%]" />
          ) : (
            <div className="grid h-full w-full place-items-center font-display text-4xl font-bold text-ink-300">{person.name[0]}</div>
          )}
        </div>
        <div>
          <p className="eyebrow">Cast & crew</p>
          <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{person.name}</h1>
          <p className="mt-2 text-ink-300">
            {titles.length} title{titles.length === 1 ? '' : 's'} on BingeBox{sorted[0]?.year ? ` · ${sorted[0].year}–${sorted[sorted.length - 1].year}` : ''}
          </p>
          {person.wikidataId && (
            <a href={`https://www.wikidata.org/wiki/${person.wikidataId}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-ink-300 hover:text-white">
              More on Wikidata <ExternalLink size={11} />
            </a>
          )}
        </div>
      </div>
      <h2 className="mb-5 mt-12 font-display text-xl font-bold">Filmography</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {sorted.map((t) => (
          <div key={t.id}>
            <PosterCard title={t} className="w-full" />
            <p className="mt-2 truncate text-sm font-medium">{t.title}</p>
            <p className="text-xs text-ink-300">{t.year}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
