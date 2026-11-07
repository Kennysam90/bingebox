import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Download, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Artwork } from '../../components/ui/Artwork';
import { FormError } from '../../components/ui/Form';
import { EmptyState, ErrorState, Spinner } from '../../components/ui/States';
import { useDebounced, useDocumentTitle } from '../../hooks/misc';
import { api, ApiError, qs } from '../../lib/api';
import type { CardTitle } from '../../lib/types';
import { AdminHeader } from './ui';

export default function AdminImportTitle() {
  useDocumentTitle('Import title');
  const [keyword, setKeyword] = useState('');
  const [detailPath, setDetailPath] = useState('');
  const debounced = useDebounced(keyword.trim(), 350);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const results = useQuery({ queryKey: ['admin', 'import-search', debounced], queryFn: () => api.get<{ items: CardTitle[] }>(`/search${qs({ q: debounced })}`), enabled: debounced.length >= 2 });
  const importTitle = useMutation({
    mutationFn: (body: { titleId: number } | { detailPath: string }) => api.post<{ title: { id: number } }>('/admin/titles/import', body),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ['admin'] }); qc.invalidateQueries({ queryKey: ['home'] }); navigate(`/admin/titles/${data.title.id}`); },
  });
  return (
    <div className="max-w-4xl">
      <Link to="/admin/titles" className="mb-6 inline-flex items-center gap-2 text-sm text-ink-300 hover:text-white"><ArrowLeft size={15} /> Back to titles</Link>
      <AdminHeader title="Import a title" subtitle="Find a real movie or series in AnimeDoc, then review its artwork and metadata before making changes." />
      <FormError message={importTitle.error instanceof ApiError ? importTitle.error.message : importTitle.isError ? 'We couldn’t import that title. Please try again.' : undefined} />
      <section className="card-surface p-5 sm:p-6">
        <h2 className="mb-4 font-display text-lg font-bold">Search the connected catalog</h2>
        <label className="flex h-12 items-center gap-3 rounded-xl border border-white/15 bg-ink-900 px-4 focus-within:border-brand-500/60"><Search size={18} className="text-ink-300" /><span className="sr-only">Search movies or TV series</span><input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Search a movie or TV series" className="min-w-0 flex-1 text-sm outline-none" /></label>
        {results.isFetching && <div className="flex justify-center py-8"><Spinner /></div>}
        {results.isError && <ErrorState message="The catalog search is unavailable." onRetry={() => results.refetch()} />}
        {!results.isFetching && results.data?.items.length === 0 && <EmptyState title="No matching titles" message="Try another title, or import using an AnimeDoc detail path below." />}
        {!!results.data?.items.length && <ul className="mt-5 divide-y divide-white/[0.06]">{results.data.items.map((title) => <li key={title.id} className="flex items-center gap-4 py-4"><Artwork src={title.poster} alt="" width={100} className="aspect-[2/3] w-12 shrink-0 rounded-md" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{title.title}</p><p className="mt-1 text-xs text-ink-300">{title.year} · {title.type === 'series' ? 'TV Series' : 'Movie'}</p></div><button disabled={importTitle.isPending} onClick={() => importTitle.mutate({ titleId: title.id })} className="btn btn-glass btn-sm">Review <ArrowRight size={14} /></button></li>)}</ul>}
      </section>
      <form onSubmit={(e) => { e.preventDefault(); importTitle.mutate({ detailPath: detailPath.trim() }); }} className="card-surface mt-6 p-5 sm:p-6">
        <h2 className="font-display text-base font-bold">Have the AnimeDoc detail path?</h2><p className="mb-4 mt-2 text-sm text-ink-300">Import the title directly using the detailPath from its catalog record.</p>
        <label className="sr-only" htmlFor="detail-path">AnimeDoc detail path</label><div className="flex flex-col gap-3 sm:flex-row"><input id="detail-path" value={detailPath} onChange={(e) => setDetailPath(e.target.value)} className="input min-w-0 flex-1" placeholder="Movie or series detail path" required maxLength={240} pattern="[a-zA-Z0-9-]+" /><button disabled={importTitle.isPending || !detailPath.trim()} className="btn btn-primary btn-md h-12"><Download size={16} /> Import title</button></div>
      </form>
    </div>
  );
}
