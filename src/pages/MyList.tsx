import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Bookmark, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ContinueCard, TitleCard } from '../components/cards/Cards';
import { Row } from '../components/Row';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { useDocumentTitle } from '../hooks/misc';
import { useAuth } from '../hooks/useAuth';
import { useMyList } from '../hooks/useMyList';
import { api } from '../lib/api';
import type { CardTitle, ContinueItem } from '../lib/types';

export default function MyList() {
  useDocumentTitle('My List');
  const { profile } = useAuth();
  const list = useMyList();
  const listQuery = useQuery({ queryKey: ['my-list'], queryFn: () => api.get<{ items: CardTitle[] }>('/me/list') });
  const cw = useQuery({ queryKey: ['continue', profile?.id], queryFn: () => api.get<{ items: ContinueItem[] }>('/me/continue') });
  const recs = useQuery({ queryKey: ['recs', profile?.id], queryFn: () => api.get<{ items: CardTitle[]; because: string | null }>('/me/recommendations') });
  const items = list.items;

  return (
    <div className="pb-10 pt-[calc(var(--nav-h)+2.5rem)]">
      <div className="page-x">
        <p className="eyebrow">{profile?.name}’s collection</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">My List</h1>
        <p className="mt-2 text-ink-300">{items.length ? `${items.length} saved title${items.length === 1 ? '' : 's'}` : 'Save titles to watch later.'}</p>
      </div>

      {cw.data?.items.length ? (
        <section className="page-x mt-10">
          <h2 className="mb-4 font-display text-xl font-bold">Continue Watching</h2>
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            {cw.data.items.map((i) => (
              <ContinueCard key={i.id} item={i} className="w-[68vw] sm:w-[300px]" />
            ))}
          </div>
        </section>
      ) : null}

      <section className="page-x mt-10">
        {listQuery.isError ? <ErrorState message="We couldn’t load your saved titles." onRetry={() => listQuery.refetch()} /> : listQuery.isLoading ? (
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-video" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Bookmark size={28} />}
            title="Your list is empty"
            message="Tap the + on any title to save it here. It’ll sync across all your devices."
            action={
              <Link to="/" className="btn btn-primary btn-md">
                Find something to watch
              </Link>
            }
          />
        ) : (
          <motion.div layout className="grid grid-cols-1 gap-x-3 gap-y-5 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            <AnimatePresence initial={false}>
              {items.map((t) => (
                <motion.div key={t.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.25 }}>
                  <TitleCard title={t} className="w-full" />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </section>

      {recs.data?.items.length ? (
        <div className="mt-14">
          <Row
            row={{
              id: 'recs',
              title: 'Recommended For You',
              subtitle: recs.data.because ? `Because you watched ${recs.data.because}` : 'Popular picks to get you started',
              items: recs.data.items,
            }}
          />
          <p className="page-x mt-2 flex items-center gap-1.5 text-xs text-ink-400">
            <Sparkles size={13} /> Recommendations learn from what you watch, save and rate.
          </p>
        </div>
      ) : null}
    </div>
  );
}
