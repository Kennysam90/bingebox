import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ExternalLink, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LandscapeArt } from '../../components/cards/TitleArt';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States';
import { useDebounced, useDocumentTitle } from '../../hooks/misc';
import { useToast } from '../../hooks/useToast';
import { api, ApiError, qs } from '../../lib/api';
import { cn, relativeTime } from '../../lib/format';
import type { Genre, Paged } from '../../lib/types';
import { AdminHeader, FilterSelect } from './ui';

interface Row {
  id: number;
  slug: string;
  type: 'movie' | 'series';
  title: string;
  year: number | null;
  status: 'published' | 'draft';
  featured: number;
  poster: string | null;
  backdrop: string | null;
  updatedAt: number;
  rightsKind: string;
  genres: string | null;
  sourceCount: number;
  episodeCount: number;
}

export default function AdminTitles() {
  useDocumentTitle('Titles · Admin');
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const dq = useDebounced(q, 250);
  const type = params.get('type') ?? '';
  const status = params.get('status') ?? '';
  const genre = params.get('genre') ?? '';
  const page = Number(params.get('page') ?? 1);
  const qc = useQueryClient();
  const toast = useToast();

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const genres = useQuery({ queryKey: ['genres'], queryFn: () => api.get<{ genres: Genre[] }>('/genres') });
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'titles', { dq, type, status, genre, page }],
    queryFn: () => api.get<Paged<Row>>(`/admin/titles${qs({ q: dq, type, status, genre, page, pageSize: 20 })}`),
    placeholderData: keepPreviousData,
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { status?: string; featured?: boolean } }) => api.patch(`/admin/titles/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'titles'] }),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Update failed.'),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/admin/titles/${id}`),
    onSuccess: () => {
      toast.success('Title deleted');
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Delete failed.'),
  });

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <AdminHeader
        title="Titles"
        subtitle={data ? `${data.total.toLocaleString()} titles in the catalog` : 'Movies and series in the catalog'}
        actions={
          <Link to="/admin/titles/new" className="btn btn-primary btn-sm">
            <Plus size={16} /> Import title
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-white/10 bg-ink-850 px-3 focus-within:border-white/30 sm:max-w-sm">
          <Search size={16} className="text-ink-400" />
          <input value={q} onChange={(e) => (setQ(e.target.value), set('page', ''))} placeholder="Search by title, slug or year" className="h-full flex-1 text-sm focus:outline-none" aria-label="Search titles" />
        </div>
        <FilterSelect value={type} onChange={(v) => set('type', v)} options={[['', 'All types'], ['movie', 'Movies'], ['series', 'Series']]} />
        <FilterSelect value={status} onChange={(v) => set('status', v)} options={[['', 'Any status'], ['published', 'Published'], ['draft', 'Draft']]} />
        <FilterSelect value={genre} onChange={(v) => set('genre', v)} options={[['', 'All categories'], ...(genres.data?.genres ?? []).map((g) => [g.slug, g.name] as [string, string])]} />
        {isFetching && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />}
      </div>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-900/60">
          <div className="thin-scrollbar overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-white/[0.06] text-left text-xs uppercase tracking-wider text-ink-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Categories</th>
                  <th className="px-4 py-3 font-medium">Media</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={6} className="px-4 py-3">
                          <Skeleton className="h-12" />
                        </td>
                      </tr>
                    ))
                  : data?.items.map((r) => (
                      <tr key={r.id} className="transition hover:bg-white/[0.02]">
                        <td className="px-4 py-3">
                          <Link to={`/admin/titles/${r.id}`} className="flex items-center gap-3">
                            <div className="w-24 shrink-0 overflow-hidden rounded-md">
                              <LandscapeArt title={r} width={250} showTitle={false} />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-semibold hover:underline">{r.title}</p>
                              <p className="text-xs text-ink-400">
                                {r.type === 'series' ? 'Series' : 'Movie'} · {r.year ?? '—'} · {r.rightsKind === 'public-domain' ? 'Public domain' : r.rightsKind === 'cc' ? 'Creative Commons' : 'Licensed'}
                              </p>
                            </div>
                          </Link>
                        </td>
                        <td className="max-w-[220px] px-4 py-3">
                          <p className="truncate text-ink-200">{r.genres ?? '—'}</p>
                        </td>
                        <td className="px-4 py-3 text-ink-200">
                          {r.rightsKind === 'provider' ? 'Connected provider' : r.type === 'series' ? `${r.episodeCount} episodes` : `${r.sourceCount} source${r.sourceCount === 1 ? '' : 's'}`}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => patch.mutate({ id: r.id, body: { status: r.status === 'published' ? 'draft' : 'published' } })}
                            className={cn(
                              'rounded-full px-2.5 py-1 text-xs font-semibold transition',
                              r.status === 'published' ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25' : 'bg-white/10 text-ink-200 hover:bg-white/15'
                            )}
                            title={r.status === 'published' ? 'Click to unpublish' : 'Click to publish'}
                          >
                            {r.status === 'published' ? '● Published' : '○ Draft'}
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-400">{relativeTime(r.updatedAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <IconBtn label={r.featured ? 'Remove from featured' : 'Feature on home'} onClick={() => patch.mutate({ id: r.id, body: { featured: !r.featured } })}>
                              <Star size={15} className={r.featured ? 'fill-gold text-gold' : ''} />
                            </IconBtn>
                            <Link to={`/title/${r.slug}`} target="_blank" className="grid h-8 w-8 place-items-center rounded-lg text-ink-300 hover:bg-white/10 hover:text-white" title="View on site">
                              <ExternalLink size={15} />
                            </Link>
                            <Link to={`/admin/titles/${r.id}`} className="grid h-8 w-8 place-items-center rounded-lg text-ink-300 hover:bg-white/10 hover:text-white" title="Edit">
                              <Pencil size={15} />
                            </Link>
                            <IconBtn label="Delete" danger onClick={() => confirm(`Delete “${r.title}”? This removes it, its media links and all viewing progress.`) && remove.mutate(r.id)}>
                              <Trash2 size={15} />
                            </IconBtn>
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          {data && data.items.length === 0 && <EmptyState title="No titles found" message="Try a different search or filter." />}
          {data && data.total > data.pageSize && (
            <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3 text-sm text-ink-300">
              <span>
                Page {page} of {pages}
              </span>
              <div className="flex gap-1">
                <button disabled={page <= 1} onClick={() => set('page', String(page - 1))} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10 disabled:opacity-30" aria-label="Previous page">
                  <ChevronLeft size={16} />
                </button>
                <button disabled={page >= pages} onClick={() => set('page', String(page + 1))} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10 disabled:opacity-30" aria-label="Next page">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IconBtn({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className={cn('grid h-8 w-8 place-items-center rounded-lg text-ink-300 transition hover:bg-white/10', danger ? 'hover:text-brand-300' : 'hover:text-white')}>
      {children}
    </button>
  );
}
